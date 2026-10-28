// ══ AI 教练 ═══════════════════════════════════════════════
// 后端在家里主力机(~/fitness-coach，Funnel /fit)，key 不进前端；用 app 自己的 Firebase 登录鉴权。
// 隐私：发给 AI 的数据快照由 buildCoachContext() 现拼——私密池(_PRIVATE_POOL)的动作、私密日、带 subMetrics 的日志
// 一律不进快照(对 owner 也不进)；非 owner 另有 getExcluded() 兜底。对话只存本机(nsKey 命名空间)，不进云同步。
const COACH_URL = 'https://node.tail95239f.ts.net/fit';
const COACH_STORE = 'fit_coach1';
const COACH_CHAT_MAX = 40;   // 本机保留条数
const COACH_CHAT_SEND = 24;  // 每次发给 AI 的最近条数

function _coachLoad() { try { return JSON.parse(localStorage.getItem(nsKey(COACH_STORE))) || {} } catch { return {} } }
function _coachSave(st) { try { localStorage.setItem(nsKey(COACH_STORE), JSON.stringify(st)) } catch { showToast('本机存储满了，对话没存上') } }
function _coachUser() { try { return firebase.auth().currentUser } catch { return null } }
function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) }
function _coachMd(s) {
  // 极简 markdown：转义后只认 **粗体**、行首 - 列表、空行分段
  return _esc(s).split(/\n{2,}/).map(p => {
    const lines = p.split('\n');
    if (lines.every(l => /^\s*[-•·]\s+/.test(l))) return '<ul>' + lines.map(l => '<li>' + l.replace(/^\s*[-•·]\s+/, '') + '</li>').join('') + '</ul>';
    return '<p>' + lines.join('<br>') + '</p>';
  }).join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// ── 动作库 / 快照 ──
function _coachPriv() { return new Set([..._PRIVATE_POOL]) }
// 当前账号此刻真能排的动作：过 getExcluded() + 器械 + 私密池
function _coachCatalogMap() {
  const excluded = getExcluded(), priv = _coachPriv(), hasPool = S.equip.includes('泳池'), m = new Map();
  for (const [g, exs] of Object.entries(DB)) {
    if (g === 'swimming' && !hasPool) continue;
    exs.forEach(ex => {
      if (excluded.has(ex.n) || priv.has(ex.n)) return;
      if (ex.eq && !ex.eq.some(q => q === '无器材' || S.equip.includes(q))) return;
      m.set(ex.n, { ex, g });
    });
  }
  return m;
}
function _coachCatalog(full) {
  const out = {};
  _coachCatalogMap().forEach(({ ex, g }) => {
    const t = ex.u === '秒' || ex.u === '分钟' ? `|${ex.u}${ex.hold ? ' ' + ex.hold : ''}` : '';
    (out[g] = out[g] || []).push(full ? `${ex.n}|${(ex.muscle || []).join('/')}|难度${ex.diff || 1}${t}` : ex.n);
  });
  return out;
}
function buildCoachContext(opts = {}) {
  const today = todayStr(), priv = _coachPriv();
  const okEx = n => !priv.has(n);
  const sch = currentScheme();
  const ctx = {
    settings: {
      goal: S.goal, level: S.level, daysPerWeek: S.days, minutesPerSession: S.dur, equipment: S.equip, focus: S.focus,
      limits: S.limits || '无', volumeMultiplier: S.volumeMultiplier || 1, restSec: S.restDur,
      scheme: sch ? { sets: sch.sets[S.level], reps: sch.reps[S.level], restSec: sch.rest } : null,
      ...(S.equip.includes('泳池') ? { swimLevel: S.swimLevel } : {}),
      ...(S.cycleEnabled && S.periodMode ? { periodMode: true } : {}),
    },
    userExcluded: (S.userExcluded || []).filter(okEx).map(n => n + (S.userExcludeReasons?.[n] ? `(${S.userExcludeReasons[n]})` : '')),
    recentLogs: LOG.filter(l => l.date >= addDays(today, -(opts.logDays || 42)) && !l.subMetrics)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(l => {
        const ex = (l.exercises || []).filter(e => okEx(e.name))
          .map(e => `${e.name}${e.weight ? ' ' + e.weight + 'kg' : ''} ${e.sets}×${e.reps}${e.unit || ''}${e.done === false ? ' 未做' : ''}`);
        return ex.length ? { date: l.date, workout: l.workout, min: l.duration, rpe: l.rpe, ex, ...(l.note ? { note: l.note } : {}) } : null;
      }).filter(Boolean),
    body: BODY_LOG.slice(-12),
    prs: PR_LIST.filter(p => okEx(p.exercise)).slice(-15),
  };
  if (S.plan && S.plan.days) {
    ctx.upcoming = S.plan.days.filter(d => d.date >= today).slice(0, 14).map(d =>
      d.isPrivateDay ? { date: d.date, type: '(另有安排)' } :
        d.isRest ? { date: d.date, type: '休息' } :
          { date: d.date, type: d.workoutType, ex: d.exercises.filter(e => okEx(e.name)).map(e => `${e.name} ${e.sets}×${e.reps}${e.unit}`) });
    // 计划里要上重量的动作，app 下次会建议多少 kg(AI 复盘调重量时参考)
    const nx = {};
    S.plan.days.filter(d => d.date >= today && !d.isPrivateDay).forEach(d => d.exercises.forEach(e => {
      if (okEx(e.name) && !nx[e.name] && needsWeightUI(e)) { const w = suggestWeight(e.name); if (w) nx[e.name] = w }
    }));
    ctx.nextSuggestedKg = nx;
  }
  if (opts.catalog) ctx.catalog = _coachCatalog(opts.catalog === 'full');
  // 开了周期功能、而且自己设过第几天:当前周期阶段(「计划 → 06」里手动设的,不会自动往后数;setOn = 最后一次设的日子)。
  // 周期功能默认是开的、默认第 1 天:从没设过的人不发,免得 AI 对没设过(或没有周期)的人说「今天经期第一天」
  if (S.cycleEnabled !== false && S.cycleSetAt && typeof cyclePhase === 'function') {
    const day = +S.cycleDay || 1, length = +S.cycleLength || 28;
    ctx.cycle = { phase: cyclePhase(day, length).name, day, length, setOn: S.cycleSetAt };
  }
  return ctx;
}

// ── 网络 ──
async function _coachFetch(path, body, { stream } = {}) {
  const u = _coachUser();
  if (!u) throw new Error('请先登录');
  const tok = await u.getIdToken();
  let r;
  try {
    r = await fetch(COACH_URL + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + tok, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { const e = new Error('AI 教练暂时连不上，过一会儿再试'); e.code = 0; throw e }   // code 0 = 请求没出去
  if (stream && r.ok) return r;
  let j = null;
  try { j = await r.json() } catch { }
  if (!r.ok) {
    const e = new Error((j && j.error) || ('AI 教练暂时连不上(' + r.status + ')'));
    e.status = j && j.status; e.info = j || {}; e.code = r.status;
    throw e;
  }
  return j;
}
// 后端每人同时只跑 1 个请求(第二个回 429):本机把 AI 请求排成一队,一个跑完再发下一个
let _coachChain = Promise.resolve();
function _coachSerial(fn) {
  const p = _coachChain.then(fn, fn);
  _coachChain = p.then(() => { }, () => { });
  return p;
}
// 非对话的 AI 请求(教练的话 / 换动作 / 打卡反馈 / 复盘):排队;万一别的设备占着(429「还没跑完」)隔 3 秒重试,最多两次
function _coachPoint(path, body) {
  return _coachSerial(async () => {
    for (let i = 0; ; i++) {
      try { return await _coachFetch(path, body) }
      catch (e) {
        if (_COACH_LOCKED.has(e.status)) { _coachRememberAccess(e.status); setTimeout(() => _coachRefreshEntries(), 0) }
        if (e.code === 429 && /还没跑完/.test(e.message) && i < 2) { await new Promise(r => setTimeout(r, 3000)); continue }
        throw e;
      }
    }
  });
}

// ── 没开通的账号：邀请制 ──
// 后端对不在白名单的已登录账号回 403 + status；上次查到的状态记在本机，下次先画这张卡再后台核一次，免得先闪出整套工具
const _COACH_LOCKED = new Set(['not_allowed', 'mismatch']);
function _coachRememberAccess(status) {
  const st = _coachLoad();
  if (status === 'allowed') delete st.access;
  else st.access = status;
  _coachSave(st);
}
// 当前账号能不能用 AI:'out' 未登录 / 'none' 邀请制没开通 / 'on' 可用(登录了且没被拒过;第一次用时后台核一次)
function coachAccess() {
  if (!_coachUser()) return 'out';
  const st = _coachLoad();
  if (st.access && _COACH_LOCKED.has(st.access)) return 'none';
  return 'on';
}
function _coachSetMe(me) { window._coachMe = me || null; window._coachMeUid = me ? (_coachUser()?.uid ?? null) : null; }
// 自动发的请求(教练的话、打卡反馈、每周复盘)只在后端已经确认这个账号开通了之后才发:白名单外、未登录、还没核过的一律不发
function _coachReady() {
  if (coachAccess() !== 'on' || !window._coachMe) return false;
  return (_coachUser()?.uid ?? null) === (window._coachMeUid ?? null);
}
async function _coachEnsureMe() {
  if (coachAccess() !== 'on') return false;
  if (_coachReady()) return true;
  try { _coachSetMe(await _coachFetch('/api/me')); _coachRememberAccess('allowed'); return true }
  catch (e) { if (_COACH_LOCKED.has(e.status)) { _coachRememberAccess(e.status); _coachRefreshEntries() } return false }
}
function _coachTyping() { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) }
// 登录后后台查一次 /api/me(不花钱):定下能不能用、取模型列表和花费,再刷新各页的 AI 入口
let _coachProbeUid = null;
async function coachProbeAccess(force) {
  const u = _coachUser();
  if (!u) { _coachSetMe(null); _coachProbeUid = null; _coachRefreshEntries(); return; }
  if (!force && _coachProbeUid === u.uid) return;
  _coachProbeUid = u.uid;
  try {
    const me = await _coachFetch('/api/me');
    _coachSetMe(me);
    _coachRememberAccess('allowed');
  } catch (e) {
    if (_COACH_LOCKED.has(e.status)) _coachRememberAccess(e.status);
    else _coachProbeUid = null;   // 连不上:下次再试
  }
  _coachRefreshEntries();
}
// 复盘(记录)、AI 排(计划 08)、我·05、今天页「问教练」、输入条:跟着权限一起刷新
function _coachRefreshEntries(skipCoach) {
  if (typeof uiRenderP8 === 'function') uiRenderP8();
  if (typeof uiRenderMeAI === 'function') uiRenderMeAI();
  coachRenderReview();
  if (typeof uiUpdateComposer === 'function') uiUpdateComposer();
  if (typeof uiUpdateMasthead === 'function') uiUpdateMasthead();
  if (!skipCoach && typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'coach') renderCoach();
  if (typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'today') _coachNoteMaybeFetch();   // 刚核实开通:今天的「教练的话」现在可以要了
}
function coachModelLabel() {
  if (coachAccess() !== 'on') return 'AI';
  const o = _coachLoad().opts || {};
  if (!o.model) return 'Auto';
  const m = (window._coachMe?.models || []).find(x => x[0] === o.model);
  return m ? m[1] : o.model;
}
function _coachAccessCard(el, info) {
  const mis = info.status === 'mismatch';
  el.innerHTML = skinTpl('coachAccess', { mis }, () => `<div class="psec co-card" id="co-access" style="border-bottom:0"><div class="sec-label">[ AI 教练 ] ${mis ? '用不了' : '邀请制'}</div>`
    + (mis ? `<div class="prose" style="font-size:17px">这个邮箱已经绑定了另一个账号，AI 教练用不了<span class="accent">.</span></div><div class="hint" style="font-size:15px">换回第一次用的登录方式试试。</div>`
      : `<div class="prose" style="font-size:17px">AI 教练每次调用都要花钱，现在只对受邀的朋友开放<span class="accent">.</span></div>`
      + `<div class="hint" style="font-size:15px">有邀请码的话填在下面；没有也没关系，计划、打卡、统计、换动作这些照常能用。</div>`
      + `<input id="co-code" class="line-input code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="邀请码 · ABCDE-FGHJK" aria-label="邀请码" onkeydown="if(event.key==='Enter')coachRedeem()">`
      + `<button class="btn-primary" id="co-code-go" onclick="coachRedeem()">开通</button><span class="foot-note">邀请码用一次就作废，两周内有效。</span>`)
    + `</div>`);
}
async function _coachCheckAccess() {
  try {
    const me = await _coachFetch('/api/me');
    _coachSetMe(me);
    _coachRememberAccess('allowed');
    _coachRefreshEntries();
  } catch (e) {
    if (!_COACH_LOCKED.has(e.status)) return;  // 连不上就先留着上次的卡
    _coachRememberAccess(e.status);
    const el = document.getElementById('coach-content');
    if (el && document.getElementById('co-access') && e.status === 'mismatch') _coachAccessCard(el, e.info);
  }
}
async function coachRedeem() {
  const inp = document.getElementById('co-code'), btn = document.getElementById('co-code-go');
  const code = (inp?.value || '').trim();
  if (!code) { inp?.focus(); return }
  if (btn) { btn.disabled = true; btn.textContent = '核对中…' }
  try {
    const r = await _coachFetch('/api/redeem', { code });
    _coachRememberAccess('allowed');
    showToast(r.name ? `开通了，${r.name}` : '开通了');
    await coachProbeAccess(true);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '开通' }
    showToast(e.message);
  }
}
function _coachOpts(kind) {
  const o = _coachLoad().opts || {};
  return o.model ? { model: o.model, effort: o.effort } : {};
}
function _coachCostLine(r) {
  if (!r || r.cost == null) return '';
  const m = (window._coachMe?.models || []).find(x => x[0] === r.model);
  const e = (window._coachMe?.efforts || []).find(x => x[0] === r.effort);
  return `<div class="co-meta">${_esc(m ? m[1] : r.model || '')}${e ? ' · 思考深度 ' + _esc(e[1]) : ''} · $${Number(r.cost).toFixed(3)}</div>`;
}

// 照片压到长边 1280、JPEG，避免上传原图
function _coachImage(file, max = 1280) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('读不了这张图')) };
    img.src = url;
  });
}

// ── 页面 ──
// 教练页 = 对话为主;拍器械认动作是顶上的入口行;复盘在「记录」,AI 排在「计划 → 08」,模型和思考深度在「我 → 05」
const _CAM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
function _coachEnsureComposer() {
  const c = document.getElementById('composer');
  if (!c || c.dataset.built) return;
  c.innerHTML = `<div id="co-chat-img"></div><div class="composer-row">`
    + `<label class="icon-btn" title="发图片" aria-label="发图片">${_CAM_SVG}<input type="file" accept="image/*" onchange="coachAttach(this)"></label>`
    + `<textarea id="co-chat-text" rows="1" placeholder="问点什么…" aria-label="问教练" onkeydown="if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();coachSend()}"></textarea>`
    + `<button type="button" class="send" id="co-chat-go" onclick="coachSend()">发送</button></div>`;
  c.dataset.built = '1';
}
async function renderCoach() {
  const el = document.getElementById('coach-content');
  if (!el) return;
  _coachEnsureComposer();
  const u = _coachUser();
  if (!u) {
    el.innerHTML = skinTpl('coachOut', null, () => `<div class="psec co-card co-empty" style="border-bottom:0"><div class="sec-label">[ AI 教练 ] 未登录</div><div class="prose" style="font-size:17px">登录后就能用 AI 教练：复盘、排计划、认器械、随时问。</div>
      <button class="btn-outline" onclick="openLoginModal()">去「我」登录</button></div>`);
    if (typeof uiUpdateComposer === 'function') uiUpdateComposer();
    return;
  }
  const st = _coachLoad();
  if (st.access && _COACH_LOCKED.has(st.access)) {
    _coachAccessCard(el, { status: st.access });
    if (typeof uiUpdateComposer === 'function') uiUpdateComposer();
    return _coachCheckAccess();
  }
  el.innerHTML = skinTpl('coachMain', null, () => `
  <div class="co-card co-entry" id="co-vision">
    <label class="row-btn" style="border-bottom:0"><span><span class="rk">拍器械认动作</span><span class="rv">在健身房拍一张器械，告诉你用它能做动作库里的哪些动作，可以直接加到今天</span></span><span class="ra">→</span><input type="file" accept="image/*" capture="environment" onchange="coachVision(this)" aria-label="拍器械认动作"></label>
    <div id="co-vision-body"></div>
  </div>
  <div class="co-card" id="co-chat">
    <div class="sec-head"><span class="sec-label">对话</span><button class="link-btn" onclick="coachNewChat()">新对话</button></div>
    <div id="co-chat-log" class="co-chat-log" aria-live="polite"></div>
    <div class="co-foot">对话只存在这台手机上 · <span id="co-status" class="co-meta">连接中…</span></div>
  </div>`);
  _coachShowChat();
  if (typeof uiUpdateComposer === 'function') uiUpdateComposer();
  try {
    const me = await _coachFetch('/api/me');
    _coachSetMe(me);
    _coachRememberAccess('allowed');
    const s = document.getElementById('co-status');
    if (s) s.textContent = `今天 $${me.today.toFixed(2)} · 本月 $${me.cycle.toFixed(2)}`;
    _coachRefreshEntries(true);   // 确认能用了:复盘、AI 排、我·05、输入条一起亮起来
  } catch (e) {
    if (_COACH_LOCKED.has(e.status)) {
      _coachRememberAccess(e.status);
      _coachAccessCard(el, e.info);
      _coachRefreshEntries(true);
      return;
    }
    const s = document.getElementById('co-status');
    if (s) { s.textContent = e.message; s.classList.add('co-err') }
  }
}
// 我 → 05:模型单选 + 思考深度四段 + 花费
function coachMeSectionHtml() {
  const a = coachAccess();
  if (a !== 'on') {
    return skinTpl('meAIOff', a, () => `<button type="button" class="row-btn" onclick="showTab('coach')"><span class="mono" style="font-size:14px">${a === 'none' ? '邀请制 · 有邀请码去「教练」页填' : '登录后可用'}</span><span class="ra">→</span></button>`);
  }
  const me = window._coachMe;
  if (!me) { coachProbeAccess(); return `<span class="note-line">读取中…</span>`; }
  const o = _coachLoad().opts || {};
  const models = [['', '自动', '按任务定'], ...(me.models || [])];
  const efforts = me.efforts || [];
  const effCur = o.effort || 'medium';
  return skinTpl('meAIOn', { me, o, models, efforts, effCur }, () => `<span class="sub-label">模型</span><div data-group="model" role="radiogroup" aria-label="模型">${models.map(([k, n, note]) => {
      const on = (o.model || '') === k;
      return `<button type="button" class="model-row" role="radio" aria-checked="${on}" data-v="${_esc(k)}"><span>${on ? '(•)' : '( )'}</span><span>${_esc(n)}</span><span class="note">${_esc(note || '')}</span></button>`;
    }).join('')}</div>`
    + `<span class="sub-label" style="margin-top:4px">${o.model ? '思考深度' : '思考深度 · 选「自动」时按任务定'}</span>`
    + `<div style="opacity:${o.model ? 1 : .4}">${uiSeg('co-effort', 'effort', efforts.map(([k, n]) => [k, n]), effCur, { label: '思考深度', disabled: o.model ? {} : Object.fromEntries(efforts.map(([k]) => [k, true])) })}</div>`
    + `<div class="kv"><span class="k">本月</span><span>已用 $${Number(me.cycle || 0).toFixed(2)}</span><span class="k">今天</span><span>$${Number(me.today || 0).toFixed(2)}${me.daily_cap ? ` / 上限 $${Number(me.daily_cap).toFixed(2)}` : ''}</span><span class="k">额度</span><span>每天有上限；每月 17 号重置</span></div>`);
}
function coachSetModel(k) {
  const st = _coachLoad(), o = st.opts || {};
  st.opts = k ? { model: k, effort: o.effort || 'medium' } : {};
  _coachSave(st);
  if (typeof uiUpdateMasthead === 'function') uiUpdateMasthead();
}
function coachSetEffort(k) {
  const st = _coachLoad();
  if (!st.opts || !st.opts.model) return;   // 自动模式下思考深度由任务定
  st.opts.effort = k; _coachSave(st);
}
function coachSaveOpts() { }   // 旧下拉框的回调(控件已搬到「我 → 05」),保留空壳
function _coachBusy(id, on, label) {
  const b = document.getElementById(id);
  if (!b) return;
  if (on) { b.dataset.t = b.textContent; b.textContent = label || '思考中…'; b.disabled = true }
  else { b.textContent = b.dataset.t || b.textContent; b.disabled = false }
}

// ── 复盘(在「记录」页顶部) ──
function coachRenderReview() {
  const el = document.getElementById('log-review');
  if (!el) return;
  const a = coachAccess();
  if (a !== 'on') {
    // 白名单外 / 未登录:收成一行灰字
    el.innerHTML = skinTpl('logReviewLocked', { a }, () => `<button type="button" class="row-btn" style="opacity:.6" onclick="showTab('coach')"><span><span class="rk sub-label">[ 复盘 ] ${a === 'none' ? 'AI 教练是邀请制' : '登录后可用'}</span><span class="rv">每周看最近练得怎么样，给出可以一键采纳的调整</span></span><span class="ra">→</span></button>`);
    return;
  }
  const box = document.getElementById('co-review');
  if (!box || (box.dataset.skin || 'paper') !== uiSkin()) {   // 换过风格(运动的容器带 data-skin="sport"):整块按现在的风格重建
    el.innerHTML = skinTpl('logReviewBox', {}, () => `<div class="review co-card" id="co-review"><div class="sec-label" id="co-review-head">[ 复盘 ] 每周</div><div id="co-review-body"></div><button class="btn-outline" id="co-review-go" onclick="coachReview()">生成复盘</button></div>`);
  }
  const st = _coachLoad();
  _coachShowReview(st.review || null);
  _coachMaybeAutoReview();
}
// 每周一自动生成:周一或之后第一次打开「记录」、本周还没复盘过 → 自动跑一次(每周最多一次,失败也不再自动重试);其他时候手点
function _coachWeekStart(ds) { const d = new Date(ds + 'T12:00:00'); return addDays(ds, -((d.getDay() + 6) % 7)) }
let _coachReviewBusy = false;
function _coachMaybeAutoReview() {
  if (typeof uiCurrentTab === 'undefined' || uiCurrentTab !== 'log' || _coachReviewBusy || !_coachReady()) return;
  const st = _coachLoad(), today = todayStr(), wk = _coachWeekStart(today);
  if (st.review && st.review.at >= wk) return;     // 本周已经有复盘(手点的也算)
  if (st.reviewAuto === wk) return;                // 本周已经自动试过
  // 最近两周一次都没练(或只有私密模式的记录):没东西可复盘,不自动花这笔钱
  if (!LOG.some(l => l.date >= addDays(today, -14) && !l.subMetrics)) return;
  coachReview(true);
}
async function coachReview(auto) {
  if (_coachReviewBusy) return;
  _coachReviewBusy = true;
  { const st = _coachLoad(); st.reviewAuto = _coachWeekStart(todayStr()); _coachSave(st); }   // 本周手点过、自动跑过都算「试过」,不再自动补一次
  _coachBusy('co-review-go', true, auto ? '本周复盘自动生成中…（约半分钟）' : '复盘中…（约半分钟）');
  try {
    const r = await _coachPoint('/api/review', { context: buildCoachContext({ catalog: 'names' }), ..._coachOpts('review') });
    const st = _coachLoad();
    st.review = { ...r.data, adjustments: _coachCleanAdj(r.data.adjustments), at: todayStr(), auto: !!auto, model: r.model, effort: r.effort, cost: r.cost, applied: [] };
    _coachSave(st);
  } catch (e) { showToast((auto ? '本周复盘没自动生成：' : '') + e.message) }
  _coachReviewBusy = false;
  _coachBusy('co-review-go', false);
  coachRenderReview();   // 复盘在「记录」页顶部;从别处触发时也先把容器建好
}
function _coachReviewHead(rv) {
  const wk = typeof _uiIsoWeek === 'function' ? `Week ${_uiIsoWeek(rv.at)} · ` : '';
  if (rv.auto) return `[ 复盘 ] ${wk}${new Date(rv.at + 'T12:00:00').getDay() === 1 ? '周一' : '本周'}自动生成`;
  return `[ 复盘 ] ${wk}${String(rv.at || '').slice(5).replace('-', '/')}`;
}
const _ADJ_LABEL = { weight: '重量', volume: '训练量', duration: '时长', days: '每周天数', exclude: '排除动作', replan: '重排计划' };
function _adjText(a) {
  switch (a.type) {
    case 'weight': return `${a.exercise} 下次 ${a.value} kg`;
    case 'volume': return `训练量 ×${a.value}`;
    case 'duration': return `每次 ${a.value} 分钟`;
    case 'days': return `每周 ${a.value} 天`;
    case 'exclude': return `不再安排「${a.exercise}」`;
    default: return '用 AI 重排接下来的计划';
  }
}
function _coachAdjCount() {
  const n = document.querySelectorAll('#co-adj-list .adj-row[aria-checked="true"]:not([aria-disabled="true"])').length;
  const b = document.getElementById('co-adopt');
  if (b) { b.textContent = `采纳勾选的 ${n} 条`; b.disabled = !n; }
}
function _coachShowReview(rv) {
  const el = document.getElementById('co-review-body');
  if (!el) return;
  const head = document.getElementById('co-review-head'), go = document.getElementById('co-review-go');
  if (!rv) { el.innerHTML = skinTpl('logReviewEmpty', {}, () => `<div class="hint">看最近几周练得怎么样，给出下周可以一键采纳的调整。</div>`); if (head) head.textContent = '[ 复盘 ] 每周'; if (go) go.textContent = '生成复盘'; return; }
  if (head) head.textContent = _coachReviewHead(rv);
  if (go && !go.disabled) go.textContent = '重新生成复盘';
  const li = arr => (arr || []).map(x => `<li>${_esc(x)}</li>`).join('');
  const applied = rv.applied || [];
  const adj = (rv.adjustments || []).map((a, i) => {
    const done = applied.includes(i);
    return `<button type="button" class="adj-row co-adj${done ? ' done' : ''}" role="checkbox" aria-checked="true" data-i="${i}"${done ? ' aria-disabled="true"' : ` onclick="uiToggleBox(this);_coachAdjCount()"`}>${uiBoxSq()}<span><span class="what">${_esc(_ADJ_LABEL[a.type] || a.type)} · ${_esc(_adjText(a))}${done ? ' <span class="olive">已采纳</span>' : ''}</span><span class="why">${_esc(a.reason)}</span></span></button>`;
  }).join('');
  const left = (rv.adjustments || []).length - applied.length;
  el.innerHTML = skinTpl('logReview', { rv, adj, left, applied }, () => `<div class="co-rv"><div class="rv-h">${_esc(rv.headline)}<span class="accent">.</span></div>
    ${_coachMd(rv.summary)}
    ${rv.wins?.length ? `<div class="co-rv-t">做得好</div><ul>${li(rv.wins)}</ul>` : ''}
    ${rv.issues?.length ? `<div class="co-rv-t">要注意</div><ul>${li(rv.issues)}</ul>` : ''}
    ${adj ? `<div class="sub-label" style="margin-top:4px">建议调整 · 勾选后一键采纳</div><div id="co-adj-list">${adj}</div>
      ${left > 0 ? `<button class="btn-primary" id="co-adopt" onclick="coachApplyReview()">采纳勾选的 ${left} 条</button>` : `<div class="note-line olive">✓ 已采纳 ${applied.length} 条</div>`}` : ''}
    ${_coachCostLine(rv)}</div>`);
}
// 不合规的建议(越界数值、动作库外/本账号不可排的动作)直接不显示；采纳时 coachApplyReview 还会再核一遍
function _coachCleanAdj(list) {
  const cat = _coachCatalogMap(), rng = { volume: [0.5, 1.5], duration: [15, 150], days: [1, 7] };
  return (list || []).filter(a => {
    const v = Number(a.value);
    if (a.type === 'weight') return v > 0 && v < 500 && cat.has(a.exercise);
    if (a.type === 'exclude') return cat.has(a.exercise);
    if (rng[a.type]) return v >= rng[a.type][0] && v <= rng[a.type][1];
    return a.type === 'replan';
  });
}
function coachApplyReview() {
  const st = _coachLoad(), rv = st.review;
  if (!rv) return;
  const picks = [...document.querySelectorAll('#co-adj-list .adj-row[aria-checked="true"]:not([aria-disabled="true"])')].map(x => +x.dataset.i);
  if (!picks.length) return showToast('没有勾选');
  const cat = _coachCatalogMap();
  let regen = false, replan = false;
  const done = [];
  picks.forEach(i => {
    const a = rv.adjustments[i], v = Number(a.value);
    if (a.type === 'weight') {
      if (!(v > 0 && v < 500) || !cat.has(a.exercise)) return;
      S.aiWeights = S.aiWeights || {};
      S.aiWeights[a.exercise] = { kg: roundWeight(v, a.exercise), date: todayStr() };
    } else if (a.type === 'volume') {
      if (!(v >= 0.5 && v <= 1.5)) return;
      S.volumeMultiplier = Math.round(v * 100) / 100; regen = true;
    } else if (a.type === 'duration') {
      if (!(v >= 15 && v <= 150)) return;
      S.dur = Math.round(v / 5) * 5; regen = true;
    } else if (a.type === 'days') {
      if (!(v >= 1 && v <= 7)) return;
      S.days = Math.round(v); regen = true;
    } else if (a.type === 'exclude') {
      if (!cat.has(a.exercise)) return;
      if (!S.userExcluded) S.userExcluded = [];
      if (!S.userExcluded.includes(a.exercise)) S.userExcluded.push(a.exercise);
      S.userExcludeReasons = S.userExcludeReasons || {};
      S.userExcludeReasons[a.exercise] = 'AI 复盘建议：' + (a.reason || '').slice(0, 60);
      regen = true;
    } else if (a.type === 'replan') {
      replan = true;
    }
    done.push(i);
  });
  rv.applied = [...new Set([...(rv.applied || []), ...done])];
  _coachSave(st);
  saveState();
  if (typeof applySettingsToUI === 'function') applySettingsToUI();
  // 改了天数/时长/训练量/排除 → 用原有生成器重排未来(保留过去、今天已打卡、锁定的天);留在「记录」页
  if (regen && S.plan) { _genStay = true; genPlan(true); }
  else render();
  _coachShowReview(rv);
  showToast(`已采纳 ${done.length} 条`);
  if (replan) {
    if (typeof _uiGen !== 'undefined') _uiGen.method = 'ai';
    showTab('plan');
    setTimeout(() => { document.getElementById('p8')?.scrollIntoView({ behavior: 'smooth' }); coachPlan(); }, 50);
  }
}

// ── 排计划(在「计划 → 08」选 AI 排) ──
function _coachPlanDates(span) {
  const today = todayStr(), out = [];
  for (let i = 0; i < span; i++) {
    const ds = addDays(today, i);
    const d = S.plan?.days?.find(x => x.date === ds);
    if (d && (d.isPrivateDay || isLocked(d) || isDone(d))) continue;
    if (ds === today && d && Object.values(S.prog[today] || {}).some(Boolean)) continue; // 今天已开练就不动
    out.push(ds);
  }
  return out;
}
async function coachPlan() {
  const dates = _coachPlanDates(+(document.getElementById('co-plan-span')?.value || 7));
  if (!dates.length) return showToast('接下来这几天都已完成或锁定');
  _coachBusy('gen-btn', true, '排计划中…（约一分钟）');
  try {
    const r = await _coachFetch('/api/plan', {
      context: buildCoachContext({ catalog: 'full' }), dates,
      request: document.getElementById('co-plan-req')?.value || '', ..._coachOpts('plan')
    });
    const draft = _coachValidatePlan(r.data, dates);
    draft.model = r.model; draft.effort = r.effort; draft.cost = r.cost;
    const st = _coachLoad(); st.planDraft = draft; _coachSave(st);
    _coachShowPlan(draft);
  } catch (e) { showToast(e.message) }
  _coachBusy('gen-btn', false);
}
// AI 给的计划只当草稿：名字必须在当前账号可排的动作库里，单位/分组/说明都以库为准
function _coachValidatePlan(data, dates) {
  const cat = _coachCatalogMap(), want = new Set(dates), dropped = [], days = [];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || a)));
  (data.days || []).forEach(d => {
    if (!want.has(d.date) || days.some(x => x.date === d.date)) return;
    if (d.isRest || !(d.exercises || []).length) { days.push({ date: d.date, isRest: true, workoutType: '休息', duration: 0, exercises: [] }); return }
    const exs = [], seen = new Set();
    d.exercises.forEach(e => {
      const hit = cat.get(e.name);
      if (!hit || seen.has(e.name)) { if (!hit) dropped.push(e.name); return }
      seen.add(e.name);
      const { ex, g } = hit;
      const unit = ex.u === '秒' || ex.u === '分钟' ? ex.u : '次';
      const reps = unit === '秒' ? (ex.hold || clamp(e.reps, 10, 600)) : unit === '分钟' ? clamp(e.reps, 1, 90) : clamp(e.reps, 1, 50);
      exs.push({
        name: ex.n, sets: clamp(e.sets, 1, 6), reps, unit, note: ex.note || '', group: g, diff: ex.diff, bi: !!ex.bi, muscle: ex.muscle || [],
        ...(g === 'warmup' ? { isWarmup: true } : {}), ...(g === 'stretch' ? { isStretch: true } : {})
      });
    });
    if (!exs.length) { days.push({ date: d.date, isRest: true, workoutType: '休息', duration: 0, exercises: [] }); return }
    const swim = exs.every(e => e.group === 'swimming');
    days.push({ date: d.date, isRest: false, workoutType: String(d.workoutType || 'AI 计划').slice(0, 20), duration: S.dur, exercises: swim ? exs : _clusterByEquip(exs), ...(swim ? { isSwimDay: true } : {}), _ai: true });
  });
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { rationale: data.rationale || '', days, dropped: [...new Set(dropped)], at: todayStr() };
}
function _coachShowPlan(dr) {
  const el = document.getElementById('co-plan-body');
  if (!el) return;
  if (!dr || !dr.days?.length) { el.innerHTML = ''; return }
  el.innerHTML = `<div class="co-rv" style="border-top:1px solid var(--line);padding-top:12px"><div class="sec-label">[ AI 排 ] 预览 · ${_esc(dr.at || '')}</div>${_coachMd(dr.rationale)}
    ${dr.dropped?.length ? `<div class="co-meta co-err">已去掉 ${dr.dropped.length} 个不在你动作库里的：${_esc(dr.dropped.join('、'))}</div>` : ''}
    ${dr.days.map(d => `<div class="co-day"><div class="co-day-h">${_esc(fmtDate(d.date))} · ${_esc(d.workoutType)}</div>
      ${d.isRest ? '' : `<div class="co-day-ex">${d.exercises.map(e => `<button type="button" data-act="detail" data-name="${_esc(e.name)}">${_esc(e.name)} <small>${e.sets}×${e.reps}${_esc(e.unit)}</small></button>`).join('')}</div>`}</div>`).join('')}
    <div class="btn-row"><button class="btn-primary" style="min-height:44px;font-size:14px" onclick="coachApplyPlan()">采纳这份计划</button><button class="btn-line" onclick="coachDropPlan()">不要了</button></div>
    ${_coachCostLine(dr)}</div>`;
}
function coachShowPlanDraft() { const st = _coachLoad(); _coachShowPlan(st.planDraft || null); }
function coachDropPlan() { const st = _coachLoad(); delete st.planDraft; _coachSave(st); _coachShowPlan(null) }
function coachApplyPlan() {
  const st = _coachLoad(), dr = st.planDraft;
  if (!dr) return;
  // 采纳前再核一遍：生成之后可能已经打卡/换了账号设置
  const ok = new Set(_coachPlanDates(30)), cat = _coachCatalogMap();
  const days = dr.days.filter(d => ok.has(d.date)).map(d => ({ ...d, exercises: d.exercises.filter(e => cat.has(e.name)) }));
  if (!days.length) return showToast('这份草稿里的日子都已经过去或完成了');
  if (!S.plan) S.plan = { days: [], tip: '', rest: currentScheme().rest, excludedCount: visibleExcludedCount(getExcluded()) };
  const used = new Set();
  days.forEach(d => {
    if (!d.isRest && !d.isSwimDay && _ownerSession()) {
      try { pickPrivateForSplit({ groups: [...new Set(d.exercises.map(e => e.group))], type: d.workoutType }, getExcluded(), used).forEach(e => d.exercises.push(e)) } catch { }
    }
    // 这一天原来按下标存的打勾/重量/RPE/调整全部清掉，免得错位到新动作上
    delete S.prog[d.date];
    ['weights', 'exRpe', 'adj'].forEach(k => { if (S[k]) Object.keys(S[k]).forEach(x => { if (x.startsWith(d.date + '-')) delete S[k][x] }) });
    const i = S.plan.days.findIndex(x => x.date === d.date);
    if (i >= 0) S.plan.days[i] = d; else S.plan.days.push(d);
  });
  S.plan.days.sort((a, b) => a.date.localeCompare(b.date));
  if (dr.rationale) S.plan.tip = 'AI 教练：' + dr.rationale;
  delete st.planDraft; _coachSave(st);
  saveState(); render();
  showToast(`已采纳 ${days.length} 天`);
  showTab('today');
  if (typeof uiNotice === 'function') uiNotice(`AI 排的 ${days.length} 天已经写进计划`);
}

// ── 拍器械 ──
async function coachVision(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  const el = document.getElementById('co-vision-body');
  let img;
  try { img = await _coachImage(f) } catch (e) { return showToast(e.message) }
  el.innerHTML = `<div style="padding:8px 0;display:flex;flex-direction:column;gap:8px"><img class="co-thumb" src="${img}" alt="刚拍的器械"><div class="co-meta">识别中…</div></div>`;
  try {
    const r = await _coachFetch('/api/vision', { image: img, context: buildCoachContext({ catalog: 'full', logDays: 14 }), ..._coachOpts('vision') });
    const cat = _coachCatalogMap(), d = r.data;
    const list = (d.exercises || []).filter(e => cat.has(e.name));
    const today = S.plan?.days?.find(x => x.date === todayStr());
    const canAdd = today && !today.isRest && !today.isPrivateDay && !isLocked(today);
    window._coachVisionList = list.map(e => e.name);
    el.innerHTML = `<div style="padding:8px 0 12px;display:flex;flex-direction:column;gap:8px"><img class="co-thumb" src="${img}" alt="刚拍的器械"><div class="co-rv"><div class="co-rv-h">${_esc(d.equipment)}</div>${_coachMd(d.note)}
      ${list.map((e, i) => `<div class="co-vx"><button type="button" onclick="showExDetail(window._coachVisionList[${i}])"><span>${_esc(e.name)}</span><small>${_esc(e.why)}</small></button>
        ${canAdd ? `<button class="btn-line" onclick="coachAddToday(${i},this)">加到今天</button>` : ''}</div>`).join('') || '<p class="co-meta">动作库里没有对应的动作。</p>'}
      ${_coachCostLine(r)}</div></div>`;
  } catch (e) { el.innerHTML = `<div class="co-meta co-err" style="padding:8px 0">${_esc(e.message)}</div>` }
}
function coachAddToday(i, btn) {
  const name = window._coachVisionList?.[i], hit = name && _coachCatalogMap().get(name);
  const day = S.plan?.days?.find(x => x.date === todayStr());
  if (!hit || !day) return;
  if (day.exercises.some(e => e.name === name)) return showToast('今天已经有这个动作');
  const { ex, g } = hit, unit = ex.u === '秒' || ex.u === '分钟' ? ex.u : '次';
  const item = { name: ex.n, sets: 3, reps: unit === '秒' ? (ex.hold || 30) : unit === '分钟' ? 10 : 12, unit, note: ex.note || '', group: g, diff: ex.diff, bi: !!ex.bi, muscle: ex.muscle || [] };
  _coachInsertEx(day, item);
  saveState(); render();
  btn.textContent = '已加'; btn.disabled = true;
  showToast(`已加到今天：${name}`);
}

// 往某天加一个动作:加在拉伸前面;插入会让后面的按下标状态错位,整体后移一格。返回新动作的下标
function _coachInsertEx(day, item) {
  const at = day.exercises.findIndex(e => e.isStretch);
  if (at < 0) { day.exercises.push(item); return day.exercises.length - 1 }
  const oldLen = day.exercises.length;
  ['weights', 'exRpe'].forEach(k => { if (S[k]) for (let j = oldLen - 1; j >= at; j--) { const v = S[k][day.date + '-' + j]; if (v !== undefined) S[k][day.date + '-' + (j + 1)] = v; delete S[k][day.date + '-' + j] } });
  if (S.adj) for (let j = oldLen - 1; j >= at; j--) ['s', 'r'].forEach(f => { const v = S.adj[`${day.date}-${j}-${f}`]; if (v !== undefined) S.adj[`${day.date}-${j + 1}-${f}`] = v; delete S.adj[`${day.date}-${j}-${f}`] });
  if (S.prog[day.date]) for (let j = oldLen - 1; j >= at; j--) { const v = S.prog[day.date][j]; if (v !== undefined) S.prog[day.date][j + 1] = v; delete S.prog[day.date][j] }
  day.exercises.splice(at, 0, item);
  return at;
}

// ── AI 给的动作:按库里的定义收拾组/次/kg ──
// 私密池 + 盆底:AI 永远看不到,也不许它动(就算碰巧说出名字也当「不在动作库里」)
function _coachGated() { return new Set([..._PRIVATE_POOL, ...(typeof OWNER_ONLY_MOVES !== 'undefined' ? OWNER_ONLY_MOVES : [])]) }
function _coachUnit(ex) { return ex && (ex.u === '秒' || ex.u === '分钟') ? ex.u : '次' }
const _COACH_REPS = { '次': [1, 50], '秒': [5, 600], '分钟': [1, 90] };
function _coachInt(v) { if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) ? Math.round(x) : null }
// fill=true:缺的给默认值(加动作用);false:缺的留 null(沿用原来的量)
function _coachSpec(hit, o, fill) {
  const { ex, g } = hit, unit = _coachUnit(ex), [lo, hi] = _COACH_REPS[unit];
  let sets = _coachInt(o.sets), reps = _coachInt(o.reps);
  sets = sets == null ? (fill ? 3 : null) : Math.max(1, Math.min(6, sets));
  if (unit === '秒' && ex.hold) reps = ex.hold;   // 库里写明了保持时长的以库为准(规矩③)
  else reps = reps == null ? (fill ? _repsFor(ex) : null) : Math.max(lo, Math.min(hi, reps));
  const kg = Number(o.kg), weighted = needsWeightUI({ name: ex.n, unit, isWarmup: g === 'warmup' });
  return { sets, reps, unit, kg: weighted && kg > 0 && kg <= 300 ? roundWeight(kg, ex.n) : null };
}
function _coachSpecTxt(sets, reps, unit, kg) {
  const a = [];
  if (sets && reps) a.push(`${sets}×${reps}${unit || '次'}`);
  else if (sets) a.push(`${sets} 组`);
  else if (reps) a.push(`每组 ${reps}${unit || '次'}`);
  if (kg) a.push(`${kg} kg`);
  return a.join(' · ');
}

// ══ 今天页「教练的话」 ══
// 每天最多一次真打到后端的 /api/note(便宜模型,不带「我 → 05」选的全局模型),结果按日期存在本机;
// 只有请求根本没发出去(离线 / 后端睡着)才允许下次打开 app 再试,一天最多 3 次。没开通、失败都不显示这块。
let _coachNoteBusy = false;
const _coachNoteTried = new Set();   // 这次打开 app 里已经试过的日子
function coachTodayNoteHtml(date) {
  const today = todayStr();
  if ((date && date !== today) || coachAccess() !== 'on') return '';
  const n = _coachLoad().note;
  if (n && n.date === today && n.text) {
    return skinTpl('coachNote', n, n => `<div class="coach-note" id="co-note"><div class="sec-label">[ 教练 ] Note · ${_coachHM(n.at)}</div><div class="prose">${_esc(n.text)}</div><button type="button" class="link-btn u" style="align-self:flex-start" onclick="showTab('coach')">接着问 →</button></div>`);
  }
  setTimeout(_coachNoteMaybeFetch, 0);
  return '';
}
function _coachNoteMaybeFetch() {
  const today = todayStr();
  if (_coachNoteBusy || _coachNoteTried.has(today) || !_coachReady() || !S.plan) return;
  const st = _coachLoad();
  if (st.note && st.note.date === today) return;
  const t = st.noteTry && st.noteTry.date === today ? st.noteTry : { date: today, n: 0, hit: false };
  if (t.hit || t.n >= 3) return;
  _coachNoteTried.add(today); _coachNoteBusy = true;
  t.n++; st.noteTry = t; _coachSave(st);
  coachFetchNote(today).finally(() => { _coachNoteBusy = false });
}
async function coachFetchNote(today) {
  let r = null, text = '', hit = false;
  try {
    r = await _coachPoint('/api/note', { context: buildCoachContext({ logDays: 14 }) });
    hit = true; text = String(r?.data?.note || '').trim();
  } catch (e) { hit = !!e.code }   // 后端回了话(哪怕是错)就算今天这一次
  const st = _coachLoad();
  if (st.noteTry && st.noteTry.date === today) st.noteTry.hit = hit;
  if (text) st.note = { date: today, text, at: Date.now(), model: r.model, effort: r.effort, cost: r.cost };
  _coachSave(st);
  if (text && todayStr() === today && typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'today' && !_coachTyping()) render();
}

// ══ 换 / 划掉面板的 AI 推荐 ══
// 选了原因才调 /api/swap;结果放在规则备选上面,点一个用现有的替换逻辑换上(组/次/kg 用 AI 给的)。
// 规则备选始终在下面,AI 慢、失败都不挡。结果只缓存在内存里(同一个动作同一个原因不重复花钱)。
const _SWAP_WHY = { '器械被占': 'busy', '做着不舒服': 'uncomfortable', '太难了': 'too_hard', '健身房没有': '健身房没有这台器械' };
const _swapAI = new Map();
function _coachSwapCtx() {
  const c = typeof _swapCtx !== 'undefined' ? _swapCtx : null;
  if (!c || c.byName || !S.plan) return null;
  const day = S.plan.days.find(d => d.date === c.date), ex = day && day.exercises[c.ei];
  if (!ex || day.isSwimDay || ex.group === 'swimming' || ex.swimPhase) return null;   // 泳池项目只按阶段规则换
  return { c, day, ex, key: `${c.date}|${c.ei}|${ex.name}|${_swapReason}` };
}
function coachSwapHtml() {
  if (coachAccess() !== 'on') return '';
  const x = _coachSwapCtx();
  return x ? `<div id="swap-ai" class="swap-ai" aria-live="polite">${_coachSwapInner(x)}</div>` : '';
}
function _coachSwapInner(x) {
  // 运动风格换结构(skin-sport.js 60 区):ctx 是原因和这次的结果
  return skinTpl('swapAI', { reason: _swapReason, r: _swapReason ? _swapAI.get(x.key) : null }, () => {
    const head = `<div class="sheet-eyebrow" style="margin-top:4px">[ AI 推荐 ]</div>`;
    if (!_swapReason) return head + `<p class="note-line">选上面一个原因，教练按原因挑最多 3 个替代。</p>`;
    const r = _swapAI.get(x.key);
    if (!r || r.state === 'loading') return head + `<p class="note-line" role="status">教练在挑…</p>`;
    if (r.state === 'err') return head + `<p class="note-line co-err">AI 推荐没拿到：${_esc(r.error)}</p><button type="button" class="link-btn u" style="align-self:flex-start" onclick="coachSwapRetry()">再试一次</button>`;
    const drop = r.dropped && r.dropped.length ? `<span class="co-meta">已去掉 ${r.dropped.length} 个不在你动作库里的</span>` : '';
    if (!r.options.length) return head + `<p class="note-line">教练这次没挑出你现在能做的替代，用下面按规则的。</p>` + drop;
    return head + `<div>${r.options.map((o, k) => `<button type="button" class="swap-option" onclick="coachSwapPick(${k})"><span><span class="so-n">${_esc(o.name)}</span><span class="so-s">${_esc(_coachSpecTxt(o.sets, o.reps, o.unit, o.kg))}</span></span>${o.why ? `<span class="so-note">${_esc(o.why)}</span>` : ''}</button>`).join('')}</div>` + drop + _coachCostLine(r);
  });
}
function _coachSwapPaint() {
  const el = document.getElementById('swap-ai'), x = _coachSwapCtx();
  if (el && x) el.innerHTML = _coachSwapInner(x);
}
function coachSwapOnReason() {
  const x = _coachSwapCtx();
  if (!x || coachAccess() !== 'on') return;
  if (_swapReason && !_swapAI.has(x.key)) _coachSwapFetch(x);
  _coachSwapPaint();
}
function coachSwapRetry() { const x = _coachSwapCtx(); if (x) { _swapAI.delete(x.key); coachSwapOnReason() } }
async function _coachSwapFetch(x) {
  const reason = _swapReason;
  _swapAI.set(x.key, { state: 'loading' });
  let ent;
  try {
    const r = await _coachPoint('/api/swap', { context: buildCoachContext({ catalog: 'full', logDays: 28 }), exercise: x.ex.name, reason: _SWAP_WHY[reason] || reason, date: x.c.date, ..._coachOpts('swap') });
    ent = { state: 'ok', ..._coachCleanSwap(r.data || {}, x.c.date, x.c.ei), model: r.model, effort: r.effort, cost: r.cost };
  } catch (e) { ent = { state: 'err', error: e.message } }
  _swapAI.set(x.key, ent);
  _coachSwapPaint();
}
// 客户端再核一遍:名字必须在这个账号此刻能排的动作库里(过 getExcluded、器械、私密池),不和当天已有的重复
function _coachCleanSwap(data, date, ei) {
  const cat = _coachCatalogMap(), gated = _coachGated();
  const day = S.plan?.days?.find(d => d.date === date), cur = day && day.exercises[ei];
  const used = new Set((day?.exercises || []).map(e => e.name));
  const out = [], dropped = new Set((data.dropped || []).filter(n => typeof n === 'string' && n && !gated.has(n)));
  (Array.isArray(data.options) ? data.options : []).forEach(o => {
    const name = String(o?.name || '').trim();
    if (!name || (cur && name === cur.name) || out.some(x => x.name === name)) return;
    const hit = cat.get(name);
    if (!hit) { if (!gated.has(name)) dropped.add(name); return }
    if (used.has(name)) return;
    out.push({ name, ..._coachSpec(hit, o, true), why: String(o.why || '').trim().slice(0, 60) });
  });
  return { options: out.slice(0, 3), dropped: [...dropped].slice(0, 6) };
}
function coachSwapPick(k) {
  const x = _coachSwapCtx(), r = x && _swapAI.get(x.key), o = r && r.options && r.options[k];
  if (!o) return;
  const hit = _coachCatalogMap().get(o.name);   // 点的时候再核一次(期间可能改了设置 / 排除了动作)
  if (!hit || x.day.exercises.some((e, i) => i !== x.c.ei && e.name === o.name)) { showToast('这个动作现在排不了，换一个'); return }
  _applySwap(x.c.date, x.c.ei, hit.ex, { sets: o.sets, reps: o.reps, kg: o.kg });
}

// ══ 打卡后即时反馈 ══
// 打卡先落盘、弹窗先关,反馈后台去要;到了显示在「今天」打卡那行下面。私密模式的打卡、私密日不发,私密池动作不进。
function _coachSessionFor(date, o = {}) {
  const lg = LOG.find(l => l.date === date);
  if (!lg || lg.subMetrics) return null;
  const day = S.plan?.days?.find(d => d.date === date);
  if (day && day.isPrivateDay) return null;
  const priv = _coachPriv();
  const exercises = (lg.exercises || []).map((e, i) => {
    const r = typeof getExRpe === 'function' ? getExRpe(date, i) : null;
    return { name: e.name, sets: e.sets, reps: e.reps, unit: e.unit || '次', kg: e.weight || null, done: e.done !== false, ...(r != null ? { rpe: r } : {}) };
  }).filter(e => !priv.has(e.name));
  if (!exercises.length) return null;
  return { date, workout: lg.workout, rpe: o.skipped ? null : lg.rpe, min: lg.duration || null, note: lg.note || '', exercises };
}
async function coachAfterCheckin(date, o = {}) {
  if (coachAccess() !== 'on') return;
  const sess = _coachSessionFor(date, o);
  if (!sess || !await _coachEnsureMe()) return;
  _coachFbSet(date, { state: 'loading', at: Date.now(), skipped: !!o.skipped });
  let fb;
  try {
    const r = await _coachPoint('/api/feedback', { context: buildCoachContext({ catalog: 'names', logDays: 28 }), session: sess, ..._coachOpts('feedback') });
    fb = { state: 'ok', ..._coachCleanFb(r.data || {}), at: Date.now(), model: r.model, effort: r.effort, cost: r.cost };
  } catch (e) { fb = { state: 'err', error: e.message, at: Date.now(), skipped: !!o.skipped } }
  _coachFbSet(date, fb);
}
function coachFeedbackRetry(date) { const fb = (_coachLoad().feedback || {})[date]; coachAfterCheckin(date, { skipped: !!(fb && fb.skipped) }) }
function _coachCleanFb(d) {
  const gated = _coachGated(), clip = (v, n) => String(v ?? '').trim().slice(0, n);
  const la = typeof d.limit_add === 'string' ? clip(d.limit_add, 60) : '';
  return {
    text: clip(d.text, 200), limit_add: la || null,
    next: (Array.isArray(d.next_adjust) ? d.next_adjust : []).filter(a => a && a.exercise && a.change && !gated.has(String(a.exercise).trim()))
      .slice(0, 4).map(a => ({ exercise: clip(a.exercise, 40), change: clip(a.change, 60), why: clip(a.why, 80) })),
  };
}
function _coachFbSet(date, fb) {
  const st = _coachLoad();
  st.feedback = st.feedback || {};
  st.feedback[date] = fb;
  const keys = Object.keys(st.feedback).sort();
  while (keys.length > 10) delete st.feedback[keys.shift()];
  _coachSave(st);
  const el = document.getElementById('co-fb-' + date);
  if (el) { el.outerHTML = coachFeedbackHtml(date); return }
  if (typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'today' && (S.selDate || todayStr()) === date && !_coachTyping()) render();
}
function coachFeedbackHtml(date) {
  if (coachAccess() !== 'on') return '';
  const fb = (_coachLoad().feedback || {})[date];
  if (!fb) return '';
  const open = skinHas('coachFbOpen') ? SKIN_TPL.sport.coachFbOpen(date, fb)   // 运动风格换个卡片头(skin-sport.js)
    : `<div class="co-fb" id="co-fb-${_esc(date)}" aria-live="polite"><span class="sec-label">[ 教练 ]${fb.at && fb.state === 'ok' ? ' ' + _coachHM(fb.at) : ''}</span>`;
  if (fb.state === 'loading') return open + `<span class="note-line" role="status">在看这次的记录…</span></div>`;
  if (fb.state === 'err') return open + `<span class="note-line co-err">这次的反馈没拿到：${_esc(fb.error)}</span><button type="button" class="link-btn u" style="align-self:flex-start" data-date="${_esc(date)}" onclick="coachFeedbackRetry(this.dataset.date)">再试一次</button></div>`;
  const next = fb.next && fb.next.length ? `<span class="sub-label">下次</span><ul class="co-fb-next">${fb.next.map(a => `<li><span class="what">${_esc(a.exercise)} · ${_esc(a.change)}</span>${a.why ? `<span class="why">${_esc(a.why)}</span>` : ''}</li>`).join('')}</ul>` : '';
  const lim = !fb.limit_add ? '' : fb.limitAdded ? `<span class="note-line olive">✓ 已加进身体情况 · 「计划 → 05」可以改</span>`
    : `<button type="button" class="link-btn u co-fb-add" data-date="${_esc(date)}" onclick="coachAddLimit(this.dataset.date)">+ 把「${_esc(fb.limit_add)}」加进身体情况</button>`;
  return open + `<div class="prose">${_esc(fb.text)}</div>${next}${lim}${_coachCostLine(fb)}</div>`;
}
// 把反馈里的不适追加到「身体情况」;改了身体情况 → 计划顶上亮「按新设置重排」(和手动改 05 一样)
function coachAddLimit(date) {
  const st = _coachLoad(), fb = st.feedback && st.feedback[date];
  if (!fb || !fb.limit_add || fb.limitAdded) return;
  const add = fb.limit_add.trim(), cur = (S.limits || '').trim();
  if (!cur.includes(add)) S.limits = cur ? `${cur}；${add}` : add;
  fb.limitAdded = true; _coachSave(st);
  saveState();
  if (typeof flashSaved === 'function') flashSaved();
  if (typeof markPlanStale === 'function') markPlanStale();
  if (typeof uiRenderP5 === 'function') uiRenderP5();
  render();
  showToast('已加进身体情况 · 想让计划避开就点「按新设置重排」');
}

// ── 对话 ──
let _coachPendingImg = null;
function coachNewChat() {
  const st = _coachLoad();
  if (st.chat?.length && !confirm('开始新对话？之前的对话会清掉。')) return;
  st.chat = []; delete st.chatCtx; _coachSave(st); _coachShowChat();
}
function _coachHM(t) { if (!t) return ''; const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function _coachShowChat(streaming) {
  const el = document.getElementById('co-chat-log');
  if (!el) return;
  const chat = _coachLoad().chat || [];
  el.innerHTML = skinTpl('coachChat', { chat, streaming }, () => chat.length ? chat.map(m => m.role === 'assistant'
    ? `<div class="co-msg assistant"><span class="who">[ 教练 ]${m.at ? ' ' + _coachHM(m.at) : ''}</span><div class="co-text">${_coachMd(m.text)}</div>${m.proposal ? _coachPropHtml(m.proposal) : ''}${m.meta ? _coachCostLine(m.meta) : ''}</div>`
    : `<div class="co-msg user"><span class="who">你${m.at ? ' · ' + _coachHM(m.at) : ''}</span>${m.img ? '<span class="co-meta">[ 图片 ]</span>' : ''}<span class="co-text">${_esc(m.text).replace(/\n/g, '<br>')}</span></div>`).join('')
    + (streaming ? `<div class="co-msg assistant"><span class="who">[ 教练 ]</span><div class="co-text" id="co-stream"><span class="co-meta">思考中…</span></div></div>` : '')
    : '<div class="note-line" style="padding:12px 0">比如：「我深蹲总是膝盖往里扣怎么办」「这周只能练两次，怎么安排」「今天很累还要练吗」</div>');
  if (streaming || chat.length) { const last = el.lastElementChild; if (last && typeof last.scrollIntoView === 'function' && typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'coach') last.scrollIntoView({ block: 'end' }); }
}
async function coachAttach(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  try { _coachPendingImg = await _coachImage(f, 1024) } catch (e) { return showToast(e.message) }
  document.getElementById('co-chat-img').innerHTML = `<div class="co-pending"><img src="${_coachPendingImg}" alt="待发送的图片"><button class="link-btn" onclick="_coachPendingImg=null;this.parentNode.remove()">移除</button></div>`;
}
// 今天页「问教练」/ 换动作面板「问教练怎么换」:跳到教练页,输入框里先填好开头
function coachAskAbout(name, kind) {
  showTab('coach');
  setTimeout(() => {
    const ta = document.getElementById('co-chat-text');
    if (!ta) return;
    ta.value = kind === '换' ? `「${name}」今天做不了，换成什么好？` : `关于「${name}」：`;
    try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { }
  }, 60);
}
async function coachSend() {
  const ta = document.getElementById('co-chat-text');
  const text = (ta.value || '').trim();
  if (!text && !_coachPendingImg) return;
  const st = _coachLoad();
  st.chat = st.chat || [];
  // 数据快照在对话开头拍一次，整段对话沿用(后端放进第一条消息，缓存命中省钱)；要用最新数据就点「新对话」
  if (!st.chat.length || !st.chatCtx) st.chatCtx = buildCoachContext({ catalog: 'names', logDays: 28 });
  const img = _coachPendingImg;
  st.chat.push({ role: 'user', text: text || '(看图)', img: !!img, at: Date.now() });
  st.chat = st.chat.slice(-COACH_CHAT_MAX);
  _coachSave(st);
  ta.value = ''; _coachPendingImg = null; document.getElementById('co-chat-img').innerHTML = '';
  _coachShowChat(true);
  _coachBusy('co-chat-go', true, '…');
  // 提议卡采纳 / 不要之后补的那句(「(她采纳了)」等)跟着那条助手消息一起发,AI 才知道上回改没改
  const send = st.chat.slice(-COACH_CHAT_SEND).map(m => ({ role: m.role, text: m.text + (m.role === 'assistant' && m.after ? '\n\n' + m.after : '') }));
  while (send.length && send[0].role !== 'user') send.shift();
  let acc = '', meta = null, err = null, prop = null;
  try {
    await _coachSerial(async () => {
      const r = await _coachFetch('/api/chat', { messages: send, context: st.chatCtx, image: img || undefined, ..._coachOpts('chat') }, { stream: true });
      const rd = r.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (; ;) {
        const { value, done } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, k); buf = buf.slice(k + 2);
          const ev = (block.match(/^event: (.*)$/m) || [])[1], data = (block.match(/^data: (.*)$/m) || [])[1];
          if (!data) continue;
          const j = JSON.parse(data);
          if (ev === 'delta') { acc += j.t; const s = document.getElementById('co-stream'); if (s) { s.innerHTML = _coachMd(acc); } }
          else if (ev === 'proposal') prop = j;
          else if (ev === 'done') { acc = j.text || acc; meta = { model: j.model, effort: j.effort, cost: j.cost } }
          else if (ev === 'error') err = j.error;
        }
      }
    });
  } catch (e) { err = e.message }
  const st2 = _coachLoad();
  st2.chat = st2.chat || [];
  const pr = _coachPropFrom(prop);
  if (acc) st2.chat.push({ role: 'assistant', text: acc, meta, at: Date.now(), ...(pr ? { proposal: pr } : {}) });
  else st2.chat.pop(); // 失败就撤回刚才那条，免得历史里两条用户消息连在一起
  _coachSave(st2);
  if (!acc) ta.value = text;
  _coachShowChat();
  _coachBusy('co-chat-go', false);
  if (err) showToast(err);
}

// ══ 对话里的「提议改计划」卡片 ══
// 后端在 done 之前发 SSE proposal {id, message, changes[≤8], dropped[]};这里画卡片,「采纳」才改,「不要」作废。
// 采纳前客户端再核一遍(动作库 / getExcluded / 私密池 / 数值范围 / 那天的状态),核不过的划掉并写原因;
// 已完成的天、今天已经勾了的动作不动;采纳前存快照,卡片上能撤销(只留最近一次采纳的快照)。
const _COACH_OPS = ['replace', 'adjust', 'remove', 'add', 'setting'];
const _SET_NAME = { days: '每周天数', dur: '每次时长', restDur: '组间休息', equip: '器械', focus: '重点部位', goal: '目标', level: '动作难度', weightLevel: '重量强度', limits: '身体情况' };
function _coachPropFrom(j) {
  if (!j || typeof j !== 'object' || !Array.isArray(j.changes) || !j.changes.length) return null;
  return {
    id: String(j.id || ('p' + Date.now())).slice(0, 80), state: 'open',
    changes: j.changes.slice(0, 8).filter(c => c && typeof c === 'object'),
    dropped: (Array.isArray(j.dropped) ? j.dropped : []).filter(n => typeof n === 'string').slice(0, 8),
  };
}
function _coachSetFmt(key, v) {
  if (v === null || v === undefined) return '—';
  if (key === 'days') return `${v} 天`;
  if (key === 'dur') return `${v} min`;
  if (key === 'restDur') return +v ? `${v}s` : '关';
  if (key === 'weightLevel') return { 初级: '轻', 中级: '中', 高级: '重' }[v] || v;
  if (key === 'goal') return String(v).split('+').join(' + ');
  if (key === 'limits') return v ? `「${v}」` : '（清空）';
  if (Array.isArray(v)) return v.join(' + ');
  return String(v);
}
function _coachSetCur(key) { return key === 'restDur' ? (S.restDur ?? 45) : key === 'weightLevel' ? (S.weightLevel || '初级') : key === 'limits' ? (S.limits || '').trim() : S[key] }
// 设置值 → {v} 或 {why};规范化后和现在一样也算不改
function _coachSetParse(key, raw) {
  const no = why => ({ why });
  let v;
  switch (key) {
    case 'days': v = _coachInt(raw); if (!(v >= 2 && v <= 7) || +raw !== v) return no('每周天数要在 2–7 之间'); break;
    case 'dur': v = _coachInt(raw); if (!(v >= 20 && v <= 90 && v % 5 === 0) || +raw !== v) return no('每次时长要在 20–90 分钟、5 的倍数'); break;
    case 'restDur': v = _coachInt(raw); if (![0, 30, 45, 60, 90].includes(v) || +raw !== v) return no('组间休息只能是 30 / 45 / 60 / 90 秒或关'); break;
    case 'level': case 'weightLevel': v = raw; if (!['初级', '中级', '高级'].includes(v)) return no('档位不对'); break;
    case 'equip': case 'focus': {
      const all = (key === 'equip' ? UI_EQUIP : UI_FOCUS).map(x => x[0]);
      v = Array.isArray(raw) ? [...new Set(raw.map(x => String(x).trim()))] : [];
      if (key === 'focus' && v.length > 1) v = v.filter(x => x !== '均衡全身');   // 「均衡全身」和其他部位互斥
      if (!v.length || !v.every(x => all.includes(x))) return no(key === 'equip' ? '器械选项不对' : '重点部位选项不对');
      break;
    }
    case 'goal': {
      const all = UI_GOALS.map(x => x[0]), solo = ['翘臀美背', '女性曲线'];
      const a = typeof raw === 'string' ? [...new Set(raw.split('+').map(x => x.trim()).filter(Boolean))] : [];
      if (!a.length || !a.every(x => all.includes(x)) || (a.length > 1 && a.some(x => solo.includes(x)))) return no('目标组合不对');
      v = a.sort((x, y) => all.indexOf(x) - all.indexOf(y)).join('+');
      break;
    }
    case 'limits': if (typeof raw !== 'string' || raw.length > 200) return no('身体情况的写法不对'); v = raw.trim(); break;
    default: return no('这项设置不能由 AI 改');
  }
  if (JSON.stringify(v) === JSON.stringify(_coachSetCur(key))) return no('和现在的设置一样');
  return { v };
}
// 改设置:和「计划」页的开关同一套效果;返回这项改了要不要重排计划
function _coachSetApply(key, v) {
  if (key === 'goal') {
    S.goal = v;
    // 同 applyGoalToggle:重点部位跟目标走,附加模块保留;器材一样都没有时补「无器材」
    const addons = (S.focus || []).filter(f => ['柔韧灵活', '上肢紧致', '平衡稳定'].includes(f));
    S.focus = [(hasGoal('臀腿塑形') || hasGoal('翘臀美背') || hasGoal('女性曲线')) ? '下肢' : '均衡全身', ...addons];
    if (!Array.isArray(S.equip) || !S.equip.length) S.equip = ['无器材'];
  } else S[key] = Array.isArray(v) ? [...v] : v;
  return key !== 'restDur' && key !== 'weightLevel';
}
// 这条改动要落在哪些天:指定日期 = 那一天;「以后」= 今天之后所有还没练完的训练日。休息日、私密日、已打卡的天都不动
function _coachPropDays(c) {
  const today = todayStr();
  const ok = d => d && !d.isRest && !d.isPrivateDay && !isDone(d) && d.date >= today;
  if (c.scope === '以后') return (S.plan?.days || []).filter(d => d.date > today && ok(d));
  const d = S.plan?.days?.find(x => x.date === c.scope);
  return ok(d) ? [d] : [];
}
// 这一天里能改的那个动作:今天已经勾了的不动
function _coachIdx(day, name) {
  const p = day.date === todayStr() ? (S.prog[day.date] || {}) : {};
  return day.exercises.findIndex((e, i) => e.name === name && !p[i]);
}
function _coachPlanUnit(name) {
  for (const d of S.plan?.days || []) { const e = d.exercises.find(x => x.name === name); if (e) return e.unit || '次' }
  return null;
}
// 核一条改动:合规返回 '',不合规返回原因(会显示在卡片上)
function _coachPropCheck(c) {
  if (!c || !_COACH_OPS.includes(c.op)) return '看不懂这条改法';
  if (c.op === 'setting') return _coachSetParse(c.key, c.value).why || '';
  if (!S.plan || !S.plan.days || !S.plan.days.length) return '现在还没有计划';
  const today = todayStr(), gated = _coachGated(), cat = _coachCatalogMap();
  const ex = String(c.exercise || '').trim(), to = String(c.to || '').trim();
  const notIn = n => `「${_coachNm(n || '?')}」不在你现在的动作库里`;
  if (!ex || gated.has(ex)) return notIn(ex);
  if (c.op === 'replace') { if (!to || gated.has(to) || !cat.has(to)) return notIn(to); if (to === ex) return '换成的还是同一个动作' }
  if (c.op === 'add' && !cat.has(ex)) return notIn(ex);
  if (c.scope !== '以后') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.scope || '')) return '日期写得不对';
    if (c.scope < today) return '那天已经过去了';
    const d = S.plan.days.find(x => x.date === c.scope);
    if (!d) return '那天不在现在的计划里';
    if (d.isPrivateDay) return '那天另有安排，不改';
    if (d.isRest) return '那天是休息日';
    if (isDone(d)) return '那天已经练完打卡了';
    if (c.op === 'add' && d.isSwimDay) return '那天是游泳日';
  }
  const unit = c.op === 'add' ? _coachUnit(cat.get(ex).ex) : c.op === 'replace' ? _coachUnit(cat.get(to).ex) : (_coachPlanUnit(ex) || _coachUnit(cat.get(ex)?.ex));
  const [lo, hi] = _COACH_REPS[unit] || [1, 600];
  const isInt = v => Number.isInteger(v);
  if (c.sets != null && !(isInt(c.sets) && c.sets >= 1 && c.sets <= 8)) return `组数 ${c.sets} 不合理`;
  if (c.reps != null && !(isInt(c.reps) && c.reps >= lo && c.reps <= hi)) return `${unit === '次' ? '次数' : '时长'} ${c.reps}${unit} 不合理`;
  if (c.kg != null && !(typeof c.kg === 'number' && c.kg > 0 && c.kg <= 300)) return `重量 ${c.kg} kg 不合理`;
  if (c.op === 'adjust' && c.sets == null && c.reps == null && c.kg == null) return '没说改成多少';
  const days = _coachPropDays(c);
  if (c.op === 'add') {
    if (!days.some(d => !d.isSwimDay && !d.exercises.some(e => e.name === ex))) return c.scope === '以后' ? '以后的训练日里都已经有它了' : '那天已经有这个动作';
    return '';
  }
  // 换上的动作那天已经有了:不换(免得一天两个同名动作)
  const can = d => _coachIdx(d, ex) >= 0 && !(c.op === 'replace' && d.exercises.some(e => e.name === to));
  if (days.some(can)) return '';
  if (c.op === 'replace' && days.some(d => _coachIdx(d, ex) >= 0)) return c.scope === '以后' ? `以后有「${ex}」的天里都已经有「${to}」了` : `那天已经有「${to}」了`;
  // 「以后都用 X kg」:计划里暂时没有这个动作也行,记成建议重量,下次排到时用
  if (c.op === 'adjust' && c.scope === '以后' && c.kg != null && c.sets == null && c.reps == null && cat.has(ex) && isWeightedMove(ex)) return '';
  if (c.scope === '以后') return `以后的计划里没有「${ex}」`;
  const d = S.plan.days.find(x => x.date === c.scope);
  if (d && c.scope === today && d.exercises.some(e => e.name === ex)) return `今天的「${ex}」已经做完了`;
  return `那天的计划里没有「${ex}」`;
}
function _coachScopeLabel(scope) {
  if (scope === '以后') return '以后';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scope || '')) return String(scope || '?');
  const n = dayDiff(todayStr(), scope);
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n > 1 && n < 7) return fmtDate(scope).split('·')[0];
  return scope.slice(5).replace('-', '/');
}
// 门控动作的名字不往界面上写(AI 看不到它们,真碰巧说出来也只显示成「不在动作库里的动作」)
function _coachNm(n) { return _coachGated().has(String(n || '').trim()) ? '不在动作库里的动作' : String(n ?? '') }
function _coachChangeTxt(c) {
  const kgOk = n => c.kg != null && isWeightedMove(n);
  const spec = n => _coachSpecTxt(c.sets, c.reps, _coachPlanUnit(n) || _coachUnit(_coachCatalogMap().get(n)?.ex), kgOk(n) ? c.kg : null);
  const ex = _coachNm(c.exercise), to = _coachNm(c.to);
  switch (c.op) {
    case 'replace': { const t = spec(c.to); return `${ex} → ${to}${t ? ' ' + t : ''}` }
    case 'adjust': return `${ex} 改成 ${spec(c.exercise) || '—'}`;
    case 'remove': return `去掉 ${ex}`;
    case 'add': { const t = spec(c.exercise); return `加上 ${ex}${t ? ' ' + t : ''}` }
    case 'setting': return `${_SET_NAME[c.key] || c.key}  ${_coachSetFmt(c.key, _coachSetCur(c.key))} → ${_coachSetFmt(c.key, c.value)}`;
  }
  return '?';
}
function _coachPropHtml(p) {
  const open = p.state === 'open', gated = _coachGated();
  const res = open ? p.changes.map(_coachPropCheck) : (p.result || p.changes.map(() => ''));
  const okN = res.filter(x => !x).length;
  const rows = p.changes.map((c, i) => {
    const bad = res[i], txt = c.op === 'setting' && !open && c.from !== undefined
      ? `${_SET_NAME[c.key] || c.key}  ${_coachSetFmt(c.key, c.from)} → ${_coachSetFmt(c.key, c.value)}` : _coachChangeTxt(c);
    return `<span class="d">${_esc(c.op === 'setting' ? '设置' : _coachScopeLabel(c.scope))}</span><span class="c${bad ? ' bad' : ''}">${bad ? `<s>${_esc(txt)}</s><small class="co-err">${_esc(bad)}${open ? '，不会改' : '，没改'}</small>` : `${_esc(txt)}${c.why ? `<small>${_esc(c.why)}</small>` : ''}`}</span>`;
  }).join('');
  const drop = (p.dropped || []).filter(n => !gated.has(n));
  let foot = '';
  if (open) foot = `<div class="co-prop-btns"><button type="button" class="btn-primary" onclick="coachPropAct(this,'apply')"${okN ? '' : ' disabled'}>采纳</button><button type="button" class="btn-line" onclick="coachPropAct(this,'reject')">不要</button></div>`;
  else if (p.state === 'applied') foot = `<div class="co-prop-st olive">✓ 已写进计划${okN < p.changes.length ? ` · ${p.changes.length - okN} 条没改` : ''}</div>` + (p.snap ? `<button type="button" class="link-btn u" style="align-self:flex-start" onclick="coachPropAct(this,'undo')">撤销，回到采纳前</button>` : '');
  else if (p.state === 'rejected') foot = `<div class="co-prop-st faint">— 没改。计划照旧。</div>`;
  else if (p.state === 'undone') foot = `<div class="co-prop-st faint">已撤销 · 计划回到采纳前</div>`;
  return skinTpl('coachProp', { p, open, okN, rows, drop }, () => `<div class="co-prop" data-pid="${_esc(p.id)}"><div class="co-prop-h"><span class="dot" aria-hidden="true"></span>提议 · ${okN} 处改动</div>`
    + `<div class="co-prop-list">${rows}</div>`
    + (drop.length ? `<div class="co-meta">还提到 ${drop.length} 个不在你动作库里的动作，已去掉：${_esc(drop.join('、'))}</div>` : '')
    + foot + `</div>`);
}
function _coachPropApply(p) {
  const snap = { days: {}, st: {}, set: {}, aiW: {}, stale: !!S.planStale };
  const pick = (o, date) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => k.startsWith(date + '-')));
  const keepDay = d => {
    if (snap.days[d.date]) return;
    snap.days[d.date] = JSON.parse(JSON.stringify(d));
    snap.st[d.date] = { prog: S.prog[d.date] ? { ...S.prog[d.date] } : null, w: pick(S.weights, d.date), a: pick(S.adj, d.date), r: pick(S.exRpe, d.date) };
  };
  const keepSet = k => { if (!(k in snap.set)) snap.set[k] = JSON.parse(JSON.stringify(S[k] ?? null)) };
  const result = p.changes.map(() => '');
  let stale = false, n = 0;
  // 先改目标(它会顺带重置重点部位),同一张卡里另外给的重点部位再盖上去
  const order = p.changes.map((c, i) => [c, i]).sort((a, b) => (a[0].key === 'goal' ? -1 : 0) - (b[0].key === 'goal' ? -1 : 0));
  order.forEach(([c, i]) => {
    const bad = _coachPropCheck(c);
    if (bad) { result[i] = bad; return }
    n++;
    if (c.op === 'setting') {
      (c.key === 'goal' ? ['goal', 'focus', 'equip'] : [c.key]).forEach(keepSet);
      c.from = JSON.parse(JSON.stringify(_coachSetCur(c.key) ?? null));
      if (_coachSetApply(c.key, _coachSetParse(c.key, c.value).v)) stale = true;
      return;
    }
    const cat = _coachCatalogMap(), ex = String(c.exercise).trim(), days = _coachPropDays(c);
    if (c.op === 'add') {
      const hit = cat.get(ex), sp = _coachSpec(hit, c, true);
      days.filter(d => !d.isSwimDay && !d.exercises.some(e => e.name === ex)).forEach(d => {
        keepDay(d); d._edited = true;
        const at = _coachInsertEx(d, { name: hit.ex.n, sets: sp.sets, reps: sp.reps, unit: sp.unit, note: hit.ex.note || '', group: hit.g, diff: hit.ex.diff, bi: !!hit.ex.bi, muscle: hit.ex.muscle || [] });
        if (sp.kg) { S.weights = S.weights || {}; S.weights[d.date + '-' + at] = sp.kg }
      });
      return;
    }
    if (c.op === 'adjust' && c.scope === '以后' && c.kg != null && isWeightedMove(ex)) {
      // 以后都用这个重量:记成 AI 建议重量(和复盘采纳同一个机制),下次真练之前一直按它建议
      if (!(ex in snap.aiW)) snap.aiW[ex] = S.aiWeights?.[ex] ?? null;
      S.aiWeights = S.aiWeights || {};
      S.aiWeights[ex] = { kg: roundWeight(c.kg, ex), date: todayStr() };
    }
    days.forEach(d => {
      const i = _coachIdx(d, ex);
      if (i < 0 || (c.op === 'replace' && d.exercises.some(e => e.name === String(c.to).trim()))) return;
      keepDay(d); d._edited = true;
      if (c.op === 'remove') {
        const len = d.exercises.length;
        d.exercises.splice(i, 1);
        _reindexAfterRemoval(d.date, i, len);
      } else if (c.op === 'replace') {
        const hit = cat.get(String(c.to).trim()), sp = _coachSpec(hit, c, false);
        _swapInto(d.date, i, hit.ex, { sets: sp.sets || undefined, reps: sp.reps || undefined, kg: sp.kg || 0 });
      } else {
        const e = d.exercises[i];
        if (c.sets != null) { e.sets = c.sets; if (S.adj) delete S.adj[`${d.date}-${i}-s`] }
        if (c.reps != null) { e.reps = c.reps; if (S.adj) delete S.adj[`${d.date}-${i}-r`] }
        if (c.kg != null && c.scope !== '以后' && needsWeightUI(e)) { S.weights = S.weights || {}; S.weights[`${d.date}-${i}`] = roundWeight(c.kg, e.name) }
      }
    });
  });
  return { snap, result, stale, n };
}
function _coachPropUndo(snap) {
  let kept = 0;
  Object.entries(snap.days || {}).forEach(([date, d0]) => {
    const i = (S.plan?.days || []).findIndex(x => x.date === date), s0 = snap.st[date] || {};
    const now = Object.values(S.prog[date] || {}).filter(Boolean).length, was = Object.values(s0.prog || {}).filter(Boolean).length;
    // 采纳以后已经打卡、或者又勾了新动作的天:不回滚(免得把练过的记录对到别的动作上)
    if (i < 0 || LOG.some(l => l.date === date) || now > was) { kept++; return }
    S.plan.days[i] = d0;
    if (s0.prog) S.prog[date] = s0.prog; else delete S.prog[date];
    [['weights', 'w'], ['adj', 'a'], ['exRpe', 'r']].forEach(([k, sk]) => {
      S[k] = S[k] || {};
      Object.keys(S[k]).forEach(x => { if (x.startsWith(date + '-')) delete S[k][x] });
      Object.assign(S[k], s0[sk] || {});
    });
  });
  const setKeys = Object.keys(snap.set || {});
  setKeys.forEach(k => { S[k] = snap.set[k] });
  Object.entries(snap.aiW || {}).forEach(([k, v]) => { S.aiWeights = S.aiWeights || {}; if (v == null) delete S.aiWeights[k]; else S.aiWeights[k] = v });
  // 设置退回去了:要是采纳后已经按新设置重排过,计划就和设置对不上了 → 亮「按新设置重排」
  if (setKeys.length) S.planStale = S.planStale ? snap.stale : true;
  return kept;
}
function coachPropAct(btn, act) {
  const pid = btn && btn.closest && btn.closest('.co-prop')?.dataset.pid;
  const st = _coachLoad(), m = (st.chat || []).find(x => x.proposal && x.proposal.id === pid);
  if (!m) return;
  const p = m.proposal;
  if (act === 'reject' && p.state === 'open') {
    p.state = 'rejected'; m.after = '(她没采纳)';
    _coachSave(st); _coachShowChat();
    return;
  }
  if (act === 'apply' && p.state === 'open') {
    const { snap, result, stale, n } = _coachPropApply(p);
    (st.chat || []).forEach(x => { if (x.proposal && x !== m) delete x.proposal.snap });   // 只有最近一次采纳能撤销
    p.state = 'applied'; p.result = result; p.snap = n ? snap : null;
    const bad = [...new Set(result.filter(Boolean))];
    m.after = !n ? `(她点了采纳，但一条都没改成：${bad.join('；')})` : bad.length ? `(她采纳了；其中 ${result.filter(Boolean).length} 条没改成：${bad.join('；')})` : '(她采纳了)';
    _coachSave(st);
    saveState();
    if (typeof flashSaved === 'function') flashSaved();
    if (stale && typeof markPlanStale === 'function') markPlanStale();
    if (typeof applySettingsToUI === 'function') applySettingsToUI();
    render(); _coachShowChat();
    showToast(!n ? '一条都没改成' : `已改 ${n} 处${bad.length ? `，${result.filter(Boolean).length} 条没改` : ''}${stale ? ' · 设置改了，计划顶上可以按新设置重排' : ''}`);
    return;
  }
  if (act === 'undo' && p.state === 'applied' && p.snap) {
    const kept = _coachPropUndo(p.snap);
    p.state = 'undone'; delete p.snap; m.after = '(她采纳了，后来又撤销了)';
    _coachSave(st);
    saveState();
    if (typeof updateStaleBar === 'function') updateStaleBar();
    if (typeof applySettingsToUI === 'function') applySettingsToUI();
    render(); _coachShowChat();
    showToast(kept ? `已撤销 · ${kept} 天已经开练或打卡，没回滚` : '已撤销');
  }
}

// ══ owner 扩展包加载 ═══════════════════════════════════════
// 扩展包(private/xp.js)不在公开仓库里：只有 owner 登录后才从后端 /api/xp 取(后端再核一遍 Firebase 身份)。
// 本机按 uid 分键缓存一份，离线也能用；不经同源路径，免得被 SW 缓存。非 owner 永远不取、不存。
const XP_STORE = '__xp__';
let _xpRanV = null;
function _xpRun(code, v) {
  if (_xpRanV === v) return false;
  const el = document.createElement('script');
  el.textContent = code; // 经典脚本：在全局作用域执行，覆盖公开代码里的空壳钩子
  document.head.appendChild(el);
  el.remove();
  _xpRanV = v;
  return true;
}
async function xpLoad() {
  if (!_ownerSession()) return;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(nsKey(XP_STORE))) } catch { }
  if (cached && cached.code && _xpRun(cached.code, cached.v)) render();
  try {
    const r = await _coachFetch('/api/xp');
    if (!_ownerSession() || !r || !r.code) return;
    if (!cached || cached.v !== r.v) {
      try { localStorage.setItem(nsKey(XP_STORE), JSON.stringify({ v: r.v, code: r.code })) } catch { }
      if (_xpRanV && _xpRanV !== r.v) { _xpReload(); return } // 已经跑过旧版：整页重载最干净
      if (_xpRun(r.code, r.v)) render();
    }
  } catch { } // 离线/后端睡着：有缓存就用缓存
}
// 登出或换成非 owner：内存里已经挂上的函数体只能靠重载清掉
function xpOnAuthChange() {
  if (_ownerSession()) { xpLoad(); return }
  if (_xpRanV) _xpReload();
}
function _xpReload() { location.reload() }
