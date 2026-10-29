// ══ push.js — 「主动找你」(Web Push) ═════════════════════════════════════
// 「我 → 04 提醒」里的开关 + 安静时段 + 每天最多几条:存在 S.push(随账号云同步,见 app.js saveState),带 uid 和改动时刻 at。
// 每台设备的订阅登记在后端(按 uid);后端定时任务(~/fitness-coach/push.py tick,每 30 分钟)看快照判断
// 搭子刚练完 / 今天该练了还没开练 / 好几天没练 / 明天有动作该加重 → 用快模型写一句话推过来。
// 快照 = buildCoachContext({live:false, partner:false, share:true}) 去掉身体数据和周期 + wpFacts() 几个判断用的事实。
// 推送文字会上锁屏 → 两样都走「给别人看」那套门控(_shareGated / share=true:私密池 + 盆底、私密日、私密模式的记录,owner 也照拦;私密日不报开练 / 练完)。只在开了开关、登录、开通 AI 时上传;打开 app / 打卡 / 改计划后节流(saveState 里调 wpStateDirty)。
// iPhone 只有「添加到主屏幕」的 PWA 才收得到推送(iOS 16.4+),Safari 标签页里收不到 —— 设置里写清楚怎么装。
// 函数名一律 wp 开头(app.js 已经有 pushProfile / schedulePush / _pushTimer 这些云同步的名字)。
// 加载顺序:在 coach.js 之后(用 _coachFetch / _coachUser / coachAccess / buildCoachContext / _shareGated / _coachLogOk)。

const WP_DEF = { on: false, qs: 22, qe: 8, max: 1 };
const WP_KEY = 'fit_wpkey';      // VAPID 公钥缓存(全设备一份;点开关时不用先联网,iOS 要求订阅紧跟着点击)
const WP_OWNER = 'fit_wpowner';  // 这台设备的订阅登记在哪个 uid 名下(换账号登录就退掉旧订阅)
const WP_MARK = 'fit_wpmark';    // nsKey:{date, startedAt:'HH:MM', doneAt: ISO} 今天第一次看到开练 / 练完的时刻
const WP_SYNCED = 'fit_wpsynced'; // nsKey:最后一次成功发给后端的设置改动时刻
const WP_TABS = ['today', 'plan', 'log', 'coach', 'me'];
const WP_IOS_STEPS = ['用 Safari 打开这个页面，点右下角 ••• → 分享（旧版 iOS 是底部中间的分享按钮）', '选「添加到主屏幕」', '从主屏幕的图标打开，回到「我 → 04 提醒」打开开关，再点「允许」'];
const WP_DENIED_STEPS = ['iPhone：设置 → 通知 → 找到这个 app → 允许通知', '电脑 / 安卓：点地址栏左边的网站设置，把通知改成「允许」', '改完回到这里，再开一次开关'];
let _wpDev = null;     // 这台设备:null 还在查 / 'on' 已订阅 / 'off' 没订阅(不支持、要装到主屏幕、被拒由 _wpDevNow 现算)
let _wpSub = null;     // 这台设备的 PushSubscription
let _wpInfo = null;    // GET /api/push:公钥、设置、已登记设备的指纹
let _wpReg = null;     // ServiceWorkerRegistration(开机时取好;点开关时直接用,别在点击和订阅之间再等别的)
let _wpBusy = false, _wpTimer = null, _wpPrefsTimer = null, _wpLastUp = 0, _wpLastSig = '', _wpOpenAt = 0;

// ── 小工具 ──
function wpPrefs() {
  const p = typeof S !== 'undefined' && S.push;
  const uid = typeof currentUid === 'function' ? currentUid() : 'anon';
  return Object.assign({}, WP_DEF, p && p.uid === uid ? p : {});   // 别的账号留在内存里的设置不算(loadState 是 Object.assign,不会清掉旧字段)
}
function wpSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function _wpStandalone() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
function _wpIOS() { const ua = navigator.userAgent || ''; return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); }
function _wpHM(h) { return String(h).padStart(2, '0') + ':00'; }
function _wpNowHM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function _wpTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
function _wpUA() { const ua = navigator.userAgent || ''; return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '其他'; }
function _wpB64(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function _wpLS(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; }
function _wpUser() { return typeof _coachUser === 'function' ? _coachUser() : null; }
function _wpReady() { return !!_wpUser() && typeof coachAccess === 'function' && coachAccess() === 'on'; }
function _wpKey() { return _wpLS(WP_KEY) || (_wpInfo && _wpInfo.key) || null; }
// 推送服务偶尔不回话(实测 headless Chrome 向 FCM 订阅时不时卡住不返回):订阅最多等 30 秒,别让开关一直停在「开启中」
function _wpWithin(p, ms, msg) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); })]).finally(() => clearTimeout(t)); }

// ── 这台设备的状态 ──
// 'ios' iPhone 还没装到主屏幕 / 'unsupported' 浏览器不支持 / 'denied' 通知被拒 / 'on' / 'off' / null 还在查
function _wpDevNow() {
  if (_wpIOS() && !_wpStandalone()) return 'ios';
  if (!wpSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return _wpDev;
}
async function _wpRegistration() {
  if (_wpReg) return _wpReg;
  const r = await Promise.race([navigator.serviceWorker.ready, new Promise(res => setTimeout(() => res(null), 8000))]);
  if (!r) throw new Error('后台服务还没就绪，刷新一下再试');
  return (_wpReg = r);
}
async function _wpRefreshDev(rerender) {
  const was = _wpDev;
  try {
    if (!wpSupported() || (_wpIOS() && !_wpStandalone())) { _wpDev = 'off'; _wpSub = null; }
    else {
      const reg = await _wpRegistration();
      let sub = await reg.pushManager.getSubscription();
      const owner = _wpLS(WP_OWNER), u = _wpUser();
      // 换了账号:这台设备的订阅还登记在上一个人名下 → 退掉(后端下次发会收到 410,自己删)
      if (sub && owner && u && owner !== u.uid) { try { await sub.unsubscribe(); } catch (e) { } sub = null; _wpLS(WP_OWNER, null); }
      _wpSub = sub; _wpDev = sub ? 'on' : 'off';
    }
  } catch (e) { _wpDev = 'off'; _wpSub = null; }
  if (rerender !== false && was !== _wpDev) _wpRerender();
  return _wpDev;
}
async function _wpFetchInfo() {
  if (!_wpReady()) return null;
  try {
    _wpInfo = await _coachFetch('/api/push');
    if (_wpInfo && _wpInfo.key) _wpLS(WP_KEY, _wpInfo.key);
  } catch (e) { return null; }
  return _wpInfo;
}
async function _wpHash(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
// 重画 04 提醒(键盘焦点留在刚点的步进按钮上)
function _wpRerender() {
  if (!document.getElementById('wp-box') || typeof uiRenderMeRemind !== 'function') return;
  const a = document.activeElement, keep = a && a.closest && a.closest('#wp-box') ? [a.dataset.group, a.dataset.step, a.dataset.act, a.dataset.toggle] : null;
  uiRenderMeRemind();
  if (!keep) return;
  const sel = keep[0] ? `[data-group="${keep[0]}"][data-step="${keep[1]}"]` : keep[2] ? `[data-act="${keep[2]}"]` : keep[3] ? `[data-toggle="${keep[3]}"]` : '';
  const b = sel && document.querySelector('#wp-box ' + sel);
  if (b && !b.disabled) try { b.focus({ preventScroll: true }); } catch (e) { }
}

// ── 订阅 / 退订 ──
// 点开关之后第一件事就是 subscribe(没给过权限时它自己弹授权框);iOS 要求授权紧跟着点击,中间不能先去联网
async function _wpSubscribe(prefs) {
  let key = _wpKey();
  if (!key) {   // 公钥还没取到:先在这次点击里把授权要了,再去取公钥(给过权限之后订阅不用再弹框)
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') throw new Error('没有通知权限，收不到推送');
    await _wpFetchInfo(); key = _wpKey();
  }
  if (!key) throw new Error('推送服务暂时连不上，过一会儿再试');
  const reg = _wpReg || await _wpRegistration();
  const app = _wpB64(key);
  let sub;
  const slow = '推送服务没响应，过一会儿再试';
  try { sub = await _wpWithin(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: app }), 30000, slow); }
  catch (e) {
    if (e && e.message === slow) throw e;
    // 已有一份用别的公钥订的(后端换过密钥):退掉重订;权限已经给过,这次不会再弹框
    const old = await reg.pushManager.getSubscription();
    if (!old || (typeof Notification !== 'undefined' && Notification.permission !== 'granted')) throw e;
    await old.unsubscribe();
    sub = await _wpWithin(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: app }), 30000, slow);
  }
  _wpInfo = Object.assign({}, _wpInfo, await _coachFetch('/api/push/sub', { sub: sub.toJSON(), prefs, tz: _wpTz(), ua: _wpUA() }));
  _wpSub = sub; _wpDev = 'on';
  _wpLS(WP_OWNER, _wpUser().uid);
  if (prefs && prefs.at) _wpLS(nsKey(WP_SYNCED), String(prefs.at));
  return sub;
}
function _wpSavePrefs(next) {
  S.push = Object.assign({}, next, { uid: currentUid(), at: Date.now() });
  if (typeof saveState === 'function') saveState();
  return S.push;
}
async function _wpSendPrefs() {
  clearTimeout(_wpPrefsTimer); _wpPrefsTimer = null;
  if (!_wpReady()) return;
  const p = wpPrefs();
  try { await _coachFetch('/api/push/prefs', { prefs: p, tz: _wpTz() }); _wpLS(nsKey(WP_SYNCED), String(p.at || 0)); } catch (e) { }
}
// 开关:data-toggle="wp"(ui.js uiToggleSetting 转过来)
async function wpToggle() {
  if (_wpBusy) return;
  const p = wpPrefs();
  if (p.on) return wpTurnOff();
  if (!_wpUser()) { showToast('先登录，再开这个'); return; }
  if (!_wpReady()) { showToast('AI 教练开通了才能用这个'); return; }
  const dev = _wpDevNow();
  if (dev === 'ios') { showToast('先把 app 添加到主屏幕，从图标打开再开'); _wpRerender(); return; }
  if (dev === 'unsupported') { showToast('这个浏览器收不到推送'); return; }
  if (dev === 'denied') { showToast('通知权限被关了，按下面的步骤打开'); return; }
  _wpBusy = true; _wpRerender();
  try {
    await _wpSubscribe(Object.assign({}, p, { on: true, uid: currentUid(), at: Date.now() }));
    _wpSavePrefs(Object.assign({}, p, { on: true }));
    showToast('开了。该练、该加重、好几天没练的时候会推给你');
    _wpBusy = false;
    wpUpload(true);
  } catch (e) {
    const denied = typeof Notification !== 'undefined' && Notification.permission !== 'granted';
    showToast(denied ? '没有通知权限，收不到推送' : (e && e.message && /[一-龥]/.test(e.message) ? e.message : '没开成，过一会儿再试'));
  } finally { _wpBusy = false; _wpRerender(); }
}
async function wpTurnOff() {
  const p = _wpSavePrefs(Object.assign({}, wpPrefs(), { on: false }));
  clearTimeout(_wpTimer); _wpTimer = null;
  _wpRerender();
  try { await _coachFetch('/api/push/prefs', { prefs: p, tz: _wpTz() }); _wpLS(nsKey(WP_SYNCED), String(p.at)); } catch (e) { }   // 没发出去:下次打开 app 补发
  try { if (_wpSub) await _wpSub.unsubscribe(); } catch (e) { }
  _wpSub = null; _wpDev = 'off'; _wpLS(WP_OWNER, null);
  showToast('关了，教练不会再主动找你');
  _wpRerender();
}
// 「在这台也接收」:账号已经开着(别的设备开的,设置同步过来了),这台还没订阅
async function wpHere() {
  if (_wpBusy || !_wpReady()) return;
  _wpBusy = true; _wpRerender();
  try { await _wpSubscribe(wpPrefs()); showToast('这台也会收到了'); wpUpload(true); }
  catch (e) { showToast(typeof Notification !== 'undefined' && Notification.permission !== 'granted' ? '没有通知权限，收不到推送' : '没开成，过一会儿再试'); }
  finally { _wpBusy = false; _wpRerender(); }
}
async function wpTest() {
  if (_wpBusy || !_wpSub) return;
  _wpBusy = true;
  try { await _coachFetch('/api/push/test', { endpoint: _wpSub.endpoint }); showToast('发了，几秒内会弹出来'); }
  catch (e) { showToast(e.message || '没发出去'); }
  finally { _wpBusy = false; }
}
// 步进:安静时段起止(整点,0–23 循环)、每天最多几条(1–3)
function wpStep(group, dir) {
  const p = wpPrefs();
  if (group === 'wpQs') p.qs = (p.qs + dir + 24) % 24;
  else if (group === 'wpQe') p.qe = (p.qe + dir + 24) % 24;
  else if (group === 'wpMax') p.max = Math.max(1, Math.min(3, p.max + dir));
  else return;
  _wpSavePrefs(p);
  if (typeof flashSaved === 'function') flashSaved();
  _wpRerender();
  clearTimeout(_wpPrefsTimer); _wpPrefsTimer = setTimeout(_wpSendPrefs, 1200);
}
if (typeof UI_ACTS !== 'undefined') { UI_ACTS.wpHere = () => wpHere(); UI_ACTS.wpTest = () => wpTest(); }

// 搭子之间的加油 / 回应推到对方手机(搭子界面发加油 / 回应时调;推不推由后端定:两边互相配对、对方开着推送、不在安静时段、每天最多 5 条)。
// kind = 'cheer' 加油 / 'react' 回应某次打卡(ref = 那次打卡的日期);word = 回应的字。不调模型、不花钱。
// 只回结果不抛错、不弹提示(加油本身照常走共享文档,推送只是顺带)→ { ok, sent, reason }
window.pushNotifyPartner = async function ({ kind, word, date, ref } = {}) {
  try {
    if (!_wpReady()) return { ok: false, sent: false, reason: '没登录或没开通' };
    const partner = typeof partnerUid === 'function' ? partnerUid() : null;
    if (!partner) return { ok: false, sent: false, reason: '还没配对' };
    const r = await _coachFetch('/api/push/partner', { kind, word: String(word || '').slice(0, 16), ref: ref || date || null, partner, tab: kind === 'react' ? 'log' : 'today' });   // 点通知落到对方看得到这条回应的页：对今天加油→今天页搭子卡，回应某次打卡→记录页那条日志
    return { ok: true, sent: !!(r && r.sent), reason: (r && r.reason) || '' };
  } catch (e) { return { ok: false, sent: false, reason: (e && e.message) || '没推出去' }; }
};

// ── 设置里那一块(纸墨 / 运动):ui.js uiRenderMeRemind 末尾拼进来 ──
function _wpCtx() {
  const p = wpPrefs(), dev = _wpDevNow(), u = _wpUser();
  const c = { on: p.on, qs: _wpHM(p.qs), qe: _wpHM(p.qe), max: p.max, dev, line: '', act: null, guide: null,
    foot: '安静时段里不推，同一件事只推一次。搭子也开了这个，才会收到对方刚练完的消息。' };
  if (!u) c.line = '登录并开通 AI 教练后可用';
  else if (!_wpReady()) c.line = 'AI 教练开通后可用（邀请制）';
  else if (dev === 'ios') { c.line = 'iPhone（iOS 16.4 以上）要先装到主屏幕才收得到'; c.guide = WP_IOS_STEPS; }
  else if (dev === 'unsupported') c.line = '这个浏览器收不到推送';
  else if (dev === 'denied') { c.line = '通知权限被关了'; c.guide = WP_DENIED_STEPS; }
  else if (_wpBusy) c.line = '开启中…';
  else if (p.on && dev === 'on') { c.line = '已接收'; c.act = ['wpTest', '发一条试试']; }
  else if (p.on && dev === 'off') { c.line = '还没在这台设备接收'; c.act = ['wpHere', '在这台也接收']; }
  else if (p.on) c.line = '查看中…';
  return c;
}
const WP_LABEL = ['教练主动找你', '该练了、该加重了、好几天没练、搭子刚练完，推到手机上'];
function wpRemindHtml() {
  if (_wpDev === null && wpSupported()) _wpRefreshDev();   // 异步查订阅,查到了再重画
  if (_wpReady() && !_wpInfo && !_wpLS(WP_KEY)) _wpFetchInfo();   // 先把公钥取好,点开关时不用等网络
  const c = _wpCtx();
  return skinTpl('wpRemind', c, c => {
    let h = uiToggle('wp', WP_LABEL[0], WP_LABEL[1], c.on, false, 'wp-enable-switch');
    if (c.on) h += uiStepper('wpQs', '安静从', c.qs, '', -1, 99) + uiStepper('wpQe', '安静到', c.qe, '', -1, 99) + uiStepper('wpMax', '每天最多', c.max, '条', 1, 3);
    if (c.line) h += `<div class="note-line wp-dev" role="status"><span class="sub-label">[ 这台设备 ]</span> ${uiEsc(c.line)}`
      + (c.act ? ` <button type="button" class="link-btn u" data-act="${c.act[0]}">${uiEsc(c.act[1])}</button>` : '') + `</div>`;
    if (c.guide) h += `<div class="hint wp-guide">${c.guide.map((g, i) => `${i + 1}. ${uiEsc(g)}`).join('<br>')}</div>`;
    return `<div class="wp-box" id="wp-box">${h}<span class="foot-note">${uiEsc(c.foot)}</span></div>`;
  });
}
// 运动:开关行 + 三格步进(样稿的 sp-tile)+ 这台设备的状态条(已接收 = 荧光绿底)+ 装到主屏幕 / 打开权限的编号步骤
if (typeof SKIN_TPL !== 'undefined' && SKIN_TPL.sport && typeof SP !== 'undefined') {
  const bell = 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0';
  const tile = (g, lbl, val, decDis, incDis) => `<div class="sp-tile stepper" data-stepper="${g}"><span class="step-val">${SP.esc(val)}</span><span class="step-lbl">${lbl}</span>`
    + `<div class="sp-tile-btns"><button type="button" class="step-btn" data-group="${g}" data-step="-1" aria-label="${lbl} 减少"${decDis ? ' disabled' : ''}>${SP.icon(SP.I.minus, 18, 2.6)}</button>`
    + `<button type="button" class="step-btn" data-group="${g}" data-step="1" aria-label="${lbl} 增加"${incDis ? ' disabled' : ''}>${SP.icon(SP.I.plus, 18, 2.6)}</button></div></div>`;
  SKIN_TPL.sport.wpRemind = c => {
    let h = uiToggle('wp', WP_LABEL[0], WP_LABEL[1], c.on, false, 'wp-enable-switch');
    if (c.on) h += `<div class="sp-tiles sp-wp-tiles">${tile('wpQs', '安静从', c.qs)}${tile('wpQe', '安静到', c.qe)}${tile('wpMax', '每天最多 · 条', c.max, c.max <= 1, c.max >= 3)}</div>`;
    if (c.line) h += `<div class="sp-wp-dev${c.on && c.dev === 'on' ? ' on' : ''}" role="status"><span class="sp-wp-ic">${SP.icon(bell, 16)}</span>`
      + `<span class="sp-wp-t"><b>这台设备</b><span>${SP.esc(c.line)}</span></span>`
      + (c.act ? `<button type="button" class="sp-pill sp-wp-btn" data-act="${c.act[0]}">${SP.esc(c.act[1])}</button>` : '') + `</div>`;
    if (c.guide) h += `<ol class="sp-wp-steps">${c.guide.map((g, i) => `<li><span class="sp-wp-n">${i + 1}</span><span>${SP.esc(g)}</span></li>`).join('')}</ol>`;
    return `<div class="wp-box sp-wp" id="wp-box">${h}<span class="foot-note">${SP.esc(c.foot)}</span></div>`;
  };
}

// ── 快照上传 ──
// 今天第一次看到开练 / 练完是几点(私密日不记);只存本机,随快照报给后端算「平时几点练」和搭子提醒
function _wpMark() {
  const today = todayStr();
  let m = {}; try { m = JSON.parse(_wpLS(nsKey(WP_MARK))) || {}; } catch (e) { }
  if (m.date !== today) m = { date: today };
  const td = S.plan && S.plan.days ? S.plan.days.find(d => d.date === today) : null;
  if (!td || td.isPrivateDay || td.isRest) return m;
  const prog = (S.prog && S.prog[today]) || {};
  const t0 = typeof wkStartAt === 'function' ? wkStartAt(today) : 0;   // 实际开练时刻(第一次勾 / 第一组 / 开始引导训练,core.js 记的)
  const started = !!t0 || Object.values(prog).some(Boolean) || LOG.some(l => l.date === today);
  const done = typeof isDone === 'function' && isDone(td);
  let ch = false;
  if (started && t0) { const t = new Date(t0), hm = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); if (m.startedAt !== hm) { m.startedAt = hm; ch = true; } }
  else if ((started || done) && !m.startedAt) { m.startedAt = _wpNowHM(); ch = true; }
  if (done && !m.doneAt) { m.doneAt = new Date().toISOString(); ch = true; }
  if (ch) _wpLS(nsKey(WP_MARK), JSON.stringify(m));
  return m;
}
// 判断用的事实:会上锁屏 → 走 _shareGated(私密池 + owner 专属动作,owner 也照拦;私密日只报「另有安排」)
function wpFacts() {
  const today = todayStr(), gated = _shareGated();
  const days = (S.plan && S.plan.days) || [];
  const day = d => {
    if (!d) return null;
    if (d.isPrivateDay) return { other: true };
    if (d.isRest) return { rest: true };
    const ex = d.exercises.filter(e => !gated.has(e.name) && !e.isWarmup && !e.isStretch).slice(0, 4).map(e => e.name);
    return ex.length ? { type: _shareType(d.workoutType, _coachDayK(d)), ex } : { other: true };   // 类型名同样过门控
  };
  const td = days.find(d => d.date === today), tm = days.find(d => d.date === addDays(today, 1));
  const f = { today, daysPerWeek: +S.days || 3 };
  const nm = (S.displayName || '').trim(); if (nm) f.name = nm.slice(0, 30);
  if (td) f.plan = day(td);
  if (tm) f.tomorrow = day(tm);
  if (td && !td.isPrivateDay && !td.isRest) {
    const m = _wpMark(), prog = (S.prog && S.prog[today]) || {};
    f.started = !!m.startedAt || Object.values(prog).some(Boolean);
    f.done = typeof isDone === 'function' && isDone(td);
    if (m.startedAt) f.startedAt = m.startedAt;
    if (f.done) {
      if (m.doneAt) f.doneAt = m.doneAt;
      const lg = LOG.find(l => l.date === today && !l.subMetrics);
      f.doneType = lg ? _shareType(lg.workout, _coachLogK(lg)) : _shareType(td.workoutType, _coachDayK(td));
      const min = lg ? ((typeof wkLogMin === 'function' && wkLogMin(lg)) || +lg.duration) : 0;   // 实际用时优先,没有就用计划时长
      if (min > 0) f.doneMin = min;
    }
  }
  const logOk = typeof _coachLogOk === 'function' ? _coachLogOk(true) : (l => !l.subMetrics);   // 和推送快照同一道门(share):私密日、带 subMetrics 的不算
  const last = LOG.filter(l => logOk(l) && l.date <= today && (l.exercises || []).some(e => !gated.has(e.name))).map(l => l.date).sort().pop();
  if (last) f.lastDone = last;
  // 该加重:今天 / 明天计划里要上重量的动作,app 建议的重量比上次(非经期)重;助力器械反过来,助力减了才算
  const hv = [];
  for (const d of [td, tm]) {
    if (!d || d.isRest || d.isPrivateDay) continue;
    d.exercises.forEach(e => {
      if (gated.has(e.name) || hv.some(h => h.ex === e.name) || typeof needsWeightUI !== 'function' || !needsWeightUI(e)) return;
      const lw = getLastWeight(e.name, true), sug = suggestWeight(e.name);
      if (!lw || !(lw.weight > 0) || !(sug > 0)) return;
      const assist = typeof isAssistedMove === 'function' && isAssistedMove(e.name);
      if (assist ? sug < lw.weight : sug > lw.weight) hv.push({ date: d.date, ex: e.name, from: lw.weight, to: sug, ...(assist ? { assist: true } : {}) });
    });
  }
  if (hv.length) f.heavier = hv.slice(0, 6);
  return f;
}
function _wpSigOf(f) { return JSON.stringify([f.today, f.started, f.done, f.plan, f.tomorrow, (f.heavier || []).length]); }
// saveState() 每次都调(app.js):开了才排一次上传 —— 今天的状态变了(开练 / 练完 / 今天的计划)3 秒后传,别的改动 20 秒后传
function wpStateDirty() {
  if (!wpPrefs().on) return;
  let urgent = false;
  try { _wpMark(); urgent = _wpSigOf(wpFacts()) !== _wpLastSig; } catch (e) { }
  clearTimeout(_wpTimer);
  _wpTimer = setTimeout(() => wpUpload(false), urgent ? 3000 : 20000);
}
// 上传快照:没变化时 5 分钟内最多一次;force = 开开关 / 打开 app
async function wpUpload(force) {
  clearTimeout(_wpTimer); _wpTimer = null;
  if (!wpPrefs().on || !_wpReady() || (typeof navigator.onLine === 'boolean' && !navigator.onLine)) return false;
  if (typeof _coachEnsureMe === 'function' && !(await _coachEnsureMe())) return false;
  const facts = wpFacts(), sig = _wpSigOf(facts), since = Date.now() - _wpLastUp;
  if (!force && sig === _wpLastSig && since < 5 * 60e3) { _wpTimer = setTimeout(() => wpUpload(false), 5 * 60e3 - since); return false; }
  _wpLastUp = Date.now(); _wpLastSig = sig;
  try {
    // 快照只要自己的、不会过时的部分:不带 live(今天做到第几组、感受、计时——节流上传一会儿就旧了,推送也不看)、
    // 不带 partner(搭子的数据由搭子自己开了推送才上传;不能借我的上传把没同意的人的数据存到服务器上)、
    // 去掉身体数据和周期(推送用不到,锁屏上也不该出现,少存一样是一样)
    const context = buildCoachContext({ live: false, partner: false, share: true });   // share:推送文字上锁屏,owner 的私密内容也不带
    delete context.body; delete context.cycle;
    await _coachFetch('/api/state', {
      context, facts, prefs: wpPrefs(), tz: _wpTz(),
      partner: (typeof partnerUid === 'function' && partnerUid()) || null,
    });
    return true;
  } catch (e) { _wpLastSig = ''; return false; }   // 下次有改动再传
}

// ── 打开 app / 切回前台 ──
// 订阅换了(浏览器会轮换)或后端删了 → 重新登记;设置没发出去 → 补发;这台设备订阅了但账号已经关了 → 退掉;然后传一次快照
async function _wpOnOpen() {
  if (!_wpReady() || Date.now() - _wpOpenAt < 10 * 60e3) return;
  if (typeof _coachEnsureMe === 'function' && !(await _coachEnsureMe())) return;
  _wpOpenAt = Date.now();
  const p = wpPrefs();
  await _wpRefreshDev();
  if (!p.on) {
    if (_wpSub && _wpLS(WP_OWNER) === _wpUser().uid) {   // 别的设备关掉了 / 恢复了出厂:退掉这台,并告诉后端
      try { await _wpSub.unsubscribe(); } catch (e) { }
      _wpSub = null; _wpDev = 'off'; _wpLS(WP_OWNER, null);
      try { await _coachFetch('/api/push/prefs', { prefs: Object.assign({}, p, { at: p.at || 0 }), tz: _wpTz() }); } catch (e) { }
      _wpRerender();
    }
    return;
  }
  const info = await _wpFetchInfo();
  if (info && _wpSub && Notification.permission === 'granted') {
    const mine = await _wpHash(_wpSub.endpoint);
    if (!(info.devices || []).includes(mine)) try { await _wpSubscribe(p); } catch (e) { }
  }
  if (String(p.at || 0) !== _wpLS(nsKey(WP_SYNCED))) await _wpSendPrefs();
  wpUpload(true);
}
// 点通知打开:地址带 #go=页(冷启动),或者 SW 发来消息(app 已经开着)
function _wpGo(tab) {
  if (!WP_TABS.includes(tab) || typeof showTab !== 'function') return;
  showTab(tab);
}
function _wpGoHash() {
  const m = /[#&]go=(\w+)/.exec(location.hash || '');
  if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
  setTimeout(() => _wpGo(m[1]), 0);
}
(function wpBoot() {
  _wpGoHash();
  window.addEventListener('hashchange', _wpGoHash);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'wp-open') _wpGo(e.data.tab); });
    navigator.serviceWorker.ready.then(r => { _wpReg = r; }).catch(() => { });
  }
  // 等登录和 AI 开通状态定下来(coachProbeAccess 查 /api/me)再做打开时的那几件事;最多等 40 秒
  let n = 0;
  const poll = () => { if (_wpReady() && window._coachMe) _wpOnOpen(); else if (++n < 20) setTimeout(poll, 2000); };
  setTimeout(poll, 1500);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _wpOnOpen();
    else if (_wpTimer) wpUpload(false);   // 切到后台前把排着的那次传掉
  });
})();
