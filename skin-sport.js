// ══ skin-sport.js — 「运动」风格的 HTML 模板 ═══════════════════════════════
// 在 skin.js 之后、ui.js 之前加载;这里只注册函数,运行时才读 S / LOG / uiCurrentTab 等全局。
// 设计源:样稿 Sport.dc.html。样式在 skin-sport.css(同样按页面分区)。
//
// 写法:纸墨的渲染函数里某一块写成 skinTpl('名字', ctx, ctx => 纸墨 HTML);
//       这里 SKIN_TPL.sport.名字 = (ctx, paper) => 运动 HTML。paper 是纸墨那版的函数,需要时可以直接复用。
//       没注册的名字一律走纸墨原样。改动规矩:功能、数据、onclick 调用的函数都和纸墨一样,只换结构和样子。
//
// 分区(按页面分开写):00 公用小件 · 01 刊头 · 10 今天 · 20 计划 · 30 记录 · 40 教练 · 50 我 + 新手设置 · 60 弹窗内容

// ══ 00 公用小件 ═════════════════════════════════════════════════════════
const SP = {
  // 勾的 svg(按钮里画勾用;颜色跟 currentColor)
  tick: (w = 18, sw = 3) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  icon: (d, w = 18, sw = 2.2) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`,
  I: {
    play: 'M7 4.5v15l12.5-7.5z',
    chev: 'M6 9l6 6 6-6',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    swap: 'M5 8h13l-3.5-3.5M19 16H6l3.5 3.5',
    tune: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
    minus: 'M5 12h14',
    plus: 'M12 5v14M5 12h14',
    close: 'M6 6l12 12M18 6L6 18',
    info: 'M12 11v5M12 7.5h.01',
    chat: 'M4 5h16v11H9l-5 4z'
  },
  esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  pad2: n => String(n).padStart(2, '0')
};

// 小节标题:「02 — 外观」→ 大号数字 + 标题;没编号的照样一行标题
SKIN_TPL.sport.secLabel = (text) => {
  const m = String(text).match(/^(\d{1,2})\s*[—-]+\s*(.+)$/);
  return m
    ? `<div class="sec-label sp-sec"><span class="sp-sec-n">${SP.esc(m[1])}</span><span class="sp-sec-t">${SP.esc(m[2])}</span></div>`
    : `<div class="sec-label sp-sec"><span class="sp-sec-t">${SP.esc(text)}</span></div>`;
};

// ══ 01 刊头:今天页右边进度环 + 底下分段条;别的页右边一个小胶囊 ═════════════
// 纸墨的刊头 DOM 不动:运动时插两个元素进去,换回纸墨时拿掉(ui.js uiUpdateMasthead 末尾 / skinApply 调)。
function skinMasthead() {
  const mh = document.querySelector('.masthead'); if (!mh) return;
  let aside = mh.querySelector('.sp-mh-aside'), bar = mh.querySelector('.sp-mh-bar');
  if (uiSkin() !== 'sport') {
    if (aside) aside.remove(); if (bar) bar.remove();
    const rs = document.getElementById('sp-rpe-stats'); if (rs) rs.remove();   // 打卡弹窗里运动插进去的数字块(60 区),换回纸墨一并拿掉
    return;
  }
  if (!aside) { aside = document.createElement('div'); aside.className = 'sp-mh-aside'; mh.appendChild(aside); }
  if (!bar) { bar = document.createElement('div'); bar.className = 'sp-mh-bar'; bar.setAttribute('aria-hidden', 'true'); mh.appendChild(bar); }
  const tab = typeof uiCurrentTab !== 'undefined' ? uiCurrentTab : 'today';
  let a = '', b = '';
  try {
    const f = SKIN_TPL.sport['mh_' + tab];
    if (f) { const r = f() || {}; a = r.aside || ''; b = r.bar || ''; }
  } catch (e) { }
  if (aside.innerHTML !== a) aside.innerHTML = a;
  if (bar.innerHTML !== b) bar.innerHTML = b;
  _spMhHeight();
}
// 刊头在运动风格下贴顶(sticky):把它的高度给计划页的「设置改过了」吸顶条用
let _spMhRO = null;
function _spMhHeight() {
  const mh = document.querySelector('.masthead'); if (!mh) return;
  const set = () => document.documentElement.style.setProperty('--sp-mh-h', (uiSkin() === 'sport' ? mh.offsetHeight : 0) + 'px');
  if (!_spMhRO && typeof ResizeObserver === 'function') { _spMhRO = new ResizeObserver(set); _spMhRO.observe(mh); }
  set();
}
// 进度环(今天页)
SKIN_TPL.sport.ring = (done, total) => {
  const C = 2 * Math.PI * 24, f = total ? done / total : 0;
  return `<div class="sp-ring" role="img" aria-label="主项完成 ${done} / ${total}"><svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">`
    + `<circle class="tr" cx="28" cy="28" r="24" fill="none" stroke-width="6"/>`
    + `<circle class="fl" cx="28" cy="28" r="24" fill="none" stroke-width="6" stroke-linecap="round" style="stroke-dasharray:${(f * C).toFixed(1)} ${C.toFixed(1)};opacity:${done ? 1 : 0}"/>`
    + `</svg><b>${done}/${total}</b></div>`;
};
// 开关行右边:纸墨是「[ 开 ]」字,运动画成滑块(CSS),状态靠 role=switch + aria-checked
SKIN_TPL.sport.toggleTv = () => `<span class="tv" aria-hidden="true"></span>`;
SKIN_TPL.sport.mhChip = (text) => text ? `<span class="sp-mh-chip">${SP.esc(text)}</span>` : '';

// ══ 10 今天 ═════════════════════════════════════════════════════════════
// 今天页正文(core.js render() 在运动风格下整块交给这里)。样稿第 61–339 行:
//   今日训练卡 → 教练的话(没开练时在上面) → 00 热身 → 「下一项」荧光绿焦点卡(组点 / 完成第 N 组 / 组间倒计时) → 主项全部完成
//   → 教练的话(开练后挪到这) → 接下来(其余主项,点开能调) → 99 拉伸 → 完成打卡。
// 组进度:原来的数据只记「这个动作做完没有」(S.prog),「做到第几组」只存本机(localStorage fit_spsets,不进云端、不进快照),
//   最后一组做完才调 tog() 记成做完;从别处勾掉 / 取消勾,组点跟着显示满 / 回退。换设备只丢组进度,不丢「做完」。
// 同一份存储里的「这天开练的时间」t0 两套风格共用,读写在 core.js(wkStartAt / wkMarkStart,只记今天),打卡时算实际用时。
let _spPin = null, _spJust = null;   // 「先做这个」钉住的主项 / 刚做完的主项(给「撤销」),只在内存里
function _spSetsAll() { return _wkDays(); }
function _spSetsPut(date, i, n) {
  const a = _spSetsAll(), d = a[date] || (a[date] = { s: {} });
  if (i !== null) (d.s || (d.s = {}))[i] = n;
  _wkDaysSave(a);
  if (n > 0 || i === null) wkMarkStart(date);   // 第一组 / 第一个勾 = 开练
}
function _spT0(date) { return wkStartAt(date); }
function _spSetsDone(date, i, sets, done) { if (done) return sets; const d = _spSetsAll()[date]; return Math.min((d && d.s && d.s[i]) || 0, Math.max(0, sets - 1)); }
// 这一天的主项、当前焦点、完成数(刊头进度环和正文共用)
function _spDayState(sel) {
  const pd = S.prog[sel.date] || {};
  const mains = sel.exercises.map((ex, i) => [ex, i]).filter(([ex]) => !_isBlockWarm(ex) && !_isBlockStretch(ex));
  const pin = _spPin && _spPin.date === sel.date && mains.find(([, i]) => i === _spPin.i && !pd[i]);
  const cur = pin || mains.find(([, i]) => !pd[i]) || null;
  return { pd, mains, cur, doneN: mains.filter(([, i]) => pd[i]).length, total: mains.length };
}
function _spSpec(date, ex, i, locked) {
  const sets = getAdj(date, i, 's', ex.sets), reps = getAdj(date, i, 'r', ex.reps), w = getWeight(date, i);
  const kg = needsWeightUI(ex) ? (w !== null ? `${w} kg` : (suggestWeight(ex.name) ? `建议 ${suggestWeight(ex.name)} kg` : '')) : (locked && w ? `${w} kg` : '');
  return `${sets}×${_unitTxt(ex, reps)}${kg ? ' · ' + kg : ''}`;
}
// 动作显示名(owner 扩展包的替换名 + 小点 + 纪录标,和纸墨 _exRowHtml 同一套)
function _spName(date, ex, i, o) {
  const alt = o.isX ? _xAltDesc(ex.name) : null;
  let name = ex.name, note = ex.note || '';
  if (alt) { try { name = _xDec(alt.name) || ex.name; note = _xDec(alt.steps[0]) || ex.note; } catch (e) { } }
  const pdot = o.pv && o.pv.has(ex.name) ? `<span class="pdot"${alt ? ` onclick="event.stopPropagation();_xShowAltDesc('${_q(ex.name)}')" style="cursor:pointer"` : ''}></span>` : '';
  const curW = getWeight(date, i), hist = W_HIST[ex.name];
  const pr = needsWeightUI(ex) && hist && hist.length && (curW || 0) >= Math.max(...hist.map(h => h.weight)) ? `<span class="sp-pr">纪录</span>` : '';
  return { name, note, pdot, pr };
}
// 组 / 次 / kg 三格(焦点卡是黑格,接下来列表里是描边格)。onclick 和纸墨展开区同一套:adj / stepWeight / setWeight
function _spSteps(date, ex, i) {
  const sets = getAdj(date, i, 's', ex.sets), reps = getAdj(date, i, 'r', ex.reps), sec = ex.unit === '秒';
  const unit = ex.unit === '秒' ? '秒' : ex.unit === '分钟' ? '分钟' : '次';
  const tile = (lbl, val, dec, inc, decDis, aria) => `<div class="sp-tile stepper"><span class="step-val">${val}</span><span class="step-lbl">${lbl}</span>`
    + `<div class="sp-tile-btns"><button type="button" class="step-btn" onclick="${dec}" aria-label="${aria} 减少"${decDis ? ' disabled' : ''}>${SP.icon(SP.I.minus, 18, 2.6)}</button>`
    + `<button type="button" class="step-btn" onclick="${inc}" aria-label="${aria} 增加">${SP.icon(SP.I.plus, 18, 2.6)}</button></div></div>`;
  let h = tile('组', sets, `adj('${date}',${i},'s',-1)`, `adj('${date}',${i},'s',1)`, sets <= 1, '组')
    + tile(unit + (ex.bi ? ' / 每侧' : ''), reps, `adj('${date}',${i},'r',-1)`, `adj('${date}',${i},'r',1)`, reps <= (sec ? 5 : 1), unit);
  if (needsWeightUI(ex)) {
    const curW = getWeight(date, i), sugW = suggestWeight(ex.name);
    h += `<div class="sp-tile stepper"><input class="step-input wt-input" type="number" inputmode="decimal" step="${getWeightStep(ex.name)}" min="0" value="${curW !== null ? curW : (sugW ?? '')}" placeholder="${sugW || ''}" aria-label="重量 kg" onchange="setWeight('${date}',${i},+this.value);render()"><span class="step-lbl">kg</span>`
      + `<div class="sp-tile-btns"><button type="button" class="step-btn" onclick="stepWeight('${date}',${i},-1)" aria-label="重量减少">${SP.icon(SP.I.minus, 18, 2.6)}</button>`
      + `<button type="button" class="step-btn" onclick="stepWeight('${date}',${i},1)" aria-label="重量增加">${SP.icon(SP.I.plus, 18, 2.6)}</button></div></div>`;
  }
  return `<div class="sp-tiles">${h}</div>`;
}
// 展开区里 tiles 下面的东西:上次 / 建议 / 1RM、感受(轻松 / 刚好 / 吃力)、休息、动作说明 —— 和纸墨展开区一样
function _spEditMore(date, ex, i, note) {
  let h = '';
  if (needsWeightUI(ex)) {
    const lastW = getLastWeight(ex.name), sugW = suggestWeight(ex.name), e1 = typeof estimate1RM === 'function' ? estimate1RM(ex.name) : null;
    h += `<div class="note-line">${lastW ? `上次 ${lastW.weight} kg` : `建议 ${sugW || '?'} kg`}${sugW && lastW && sugW !== lastW.weight ? ` → 建议 ${sugW} kg` : ''}${e1 ? ` · 1RM≈${e1}` : ''}</div>`
      + `<span class="sub-label">感受</span><div class="seg light" role="radiogroup" aria-label="这个动作的感受" style="--n:3">${[['轻松', 4], ['刚好', 6.5], ['吃力', 8.5]].map(([l, v]) => { const on = getExRpe(date, i) === v; return `<button type="button" class="seg-btn${on ? ' on' : ''}" role="radio" aria-checked="${on}" onclick="setExRpe('${date}',${i},${v})">${l}</button>`; }).join('')}</div>`;
  }
  const z = equipZone(ex.name);
  if (z && z !== '垫上/徒手') h += `<div class="note-line">在 ${_escHtml(z)}</div>`;
  if (note || ex.bi) h += `<div class="exnote">${note}${ex.bi ? '（左右各做一遍算 1 组）' : ''}</div>`;
  return h;
}
// 一排胶囊按钮(问教练 / 换 / 示范 / 计时 / 休息),和纸墨 ex-acts + 展开区「休息 Ns」同一套调用
function _spActs(date, ex, i, extra) { return `<div class="sp-pills ex-acts">${extra || ''}${_spActBtns(date, ex, i)}</div>`; }
function _spActBtns(date, ex, i) {
  const reps = getAdj(date, i, 'r', ex.reps), timed = ex.unit === '秒' || ex.unit === '分钟';
  const aiOn = typeof coachAccess === 'function' && coachAccess() === 'on';
  return (aiOn ? `<button type="button" class="sp-pill link-btn" onclick="coachAskAbout('${_q(ex.name)}')">问教练</button>` : '')
    + `<button type="button" class="sp-pill link-btn swap-btn" onclick="swapExercise('${date}',${i})">${SP.icon(SP.I.swap, 16)}换 / 划掉</button>`
    + `<button type="button" class="sp-pill link-btn" onclick="openDemo('${_q(ex.name)}')">示范</button>`
    + (timed ? `<button type="button" class="sp-pill link-btn" onclick="startTimer(${_timedSec(ex, reps)}, '${_q(ex.name)}')">计时 ${_unitTxt(ex, reps).replace('/每侧', '')}</button>` : '')
    + `<button type="button" class="sp-pill link-btn" onclick="startTimer(${S.restDur || 45},'组间休息')">休息 ${S.restDur || 45}s</button>`;
}
function _spBox(on, attrs, label) { return uiBox(on, attrs, label); }

// ── 焦点卡:「下一项 · 03」 ──
function _spFocusHtml(sel, st, o) {
  const [ex, i] = st.cur, date = sel.date, done = !!st.pd[i];
  const sets = getAdj(date, i, 's', ex.sets), reps = getAdj(date, i, 'r', ex.reps), n = _spSetsDone(date, i, sets, done);
  const nm = _spName(date, ex, i, o), pos = SP.pad2(st.mains.findIndex(([, k]) => k === i) + 1);
  const inSession = st.doneN > 0 || n > 0;
  const needW = needsWeightUI(ex), w = getWeight(date, i), sugW = needW ? suggestWeight(ex.name) : null;
  const kgVal = needW ? (w !== null ? w : (sugW ?? '—')) : '自重';
  const kgSize = !needW ? 'sm' : String(kgVal).length > 4 ? 'md' : '';
  const open = !!_exOpen[date + '-' + i] && !o.locked;
  const part = (ex.muscle || [])[0] || equipZone(ex.name) || '';
  const timedU = ex.unit === '秒' ? '秒' : ex.unit === '分钟' ? '分钟' : '次';
  const last = n + 1 >= sets;
  let h = `<section class="sp-focus ex-row" data-i="${i}" aria-label="${inSession ? '现在' : '下一项'}：${_escHtml(nm.name)}">`;
  if (_spJust && _spJust.date === date) h += _spJustHtml(sel);
  h += `<div class="sp-f-top"><span class="sp-f-tag">${inSession ? '现在' : '下一项'} · ${pos}</span>${part ? `<span class="sp-f-part">${_escHtml(part)}</span>` : ''}</div>`
    + `<button type="button" class="sp-f-name exname" ${_detailAttrs(ex.name, date, i)}>${nm.name}${nm.pdot}${nm.pr}</button>`
    + `<div class="sp-f-nums"><div><span class="sp-f-lbl">组 × ${timedU}${ex.bi ? ' / 每侧' : ''}</span><span class="sp-f-big">${sets}×${reps}</span></div>`
    + `<div><span class="sp-f-lbl">${needW ? '重量 KG' : '负重'}</span><span class="sp-f-big ${kgSize}">${kgVal}</span></div></div>`;
  if (!o.locked) {
    h += `<div class="sp-f-sets"><div class="sp-dots" role="group" aria-label="组进度">${Array.from({ length: sets }, (_, k) => `<button type="button" class="sp-dot${k < n ? ' on' : ''}" onclick="spDot('${date}',${i},${k})" aria-label="第 ${k + 1} 组${k < n ? ' · 已完成，点一下撤回' : ''}"><i></i></button>`).join('')}</div>`
      + `<span class="sp-f-setline">${n >= sets ? '全部组完成' : `第 ${n + 1} 组 / 共 ${sets} 组`}</span></div>`
      + `<div class="sp-f-acts ex-acts"><button type="button" class="sp-pill dark ex-spec${open ? ' on' : ''}" aria-expanded="${open}" onclick="toggleExEdit('${date}',${i})">${SP.icon(SP.I.tune, 16)}${open ? '收起' : '调整'}</button>`
      + _spActBtns(date, ex, i) + `</div>`;
    if (open) h += `<div class="sp-f-edit ex-edit">${_spSteps(date, ex, i)}${_spEditMore(date, ex, i, nm.note)}</div>`;
    h += `<div class="sp-rest" id="sp-rest" hidden><div class="sp-rest-l"><span class="sp-rest-k">组间休息<span id="sp-rest-next"></span></span><span class="sp-rest-t" id="sp-rest-t">0:00</span><div class="sp-rest-bar"><i id="sp-rest-bar"></i></div></div>`
      + `<div class="sp-rest-r"><button type="button" class="sp-rest-add" onclick="spRestAdd(15)">+15 s</button><button type="button" class="sp-rest-skip" onclick="stopTimer();spRestTick()">跳过</button></div></div>`
      + `<button type="button" class="sp-f-do" onclick="spSet('${date}',${i})">${SP.tick(22, 3)}${last ? '完成最后一组' : `完成第 ${n + 1} 组`}</button>`;
  }
  return h + `</section>`;
}
function _spJustHtml(sel) {
  const ex = sel.exercises[_spJust.i]; if (!ex || !(S.prog[sel.date] || {})[_spJust.i]) return '';
  return `<div class="sp-just" role="status">${SP.tick(18, 2.8)}<span><b>${_escHtml(ex.name)}</b> 做完了 · <span class="sp-num">${_escHtml(_spSpec(sel.date, ex, _spJust.i))}</span></span><button type="button" onclick="spUndo('${sel.date}',${_spJust.i})">撤销</button></div>`;
}
// ── 接下来:其余主项(没做的在前、做完的在后),点一行展开调整 ──
function _spQueueHtml(sel, st, o) {
  const date = sel.date, rest = st.mains.filter(m => m !== st.cur);
  const items = rest.filter(([, i]) => !st.pd[i]).concat(rest.filter(([, i]) => st.pd[i]));
  const canAdd = !o.locked && !isDone(sel);
  if (!items.length && !canAdd) return '';
  let h = `<div class="sp-qhead"><span>接下来</span><span class="sp-num">${items.filter(([, i]) => !st.pd[i]).length} 项待做 · ${st.doneN} 项完成</span></div><div class="sp-card sp-queue">`;
  items.forEach(([ex, i]) => {
    const done = !!st.pd[i], open = !!_exOpen[date + '-' + i] && !o.locked, nm = _spName(date, ex, i, o);
    const pos = SP.pad2(st.mains.findIndex(([, k]) => k === i) + 1);
    h += `<div class="sp-q ex-row${done ? ' done' : ''}" data-i="${i}"><div class="sp-q-top">`
      + (o.locked ? `<div class="sp-q-main"><span class="sp-q-idx">${pos}</span><span class="sp-q-txt"><span class="sp-q-name">${nm.name}${nm.pdot}${nm.pr}</span><span class="sp-q-spec">${_spSpec(date, ex, i, true)}</span></span></div>`
        : `<button type="button" class="sp-q-main ex-spec" aria-expanded="${open}" onclick="toggleExEdit('${date}',${i})"><span class="sp-q-idx">${pos}</span><span class="sp-q-txt"><span class="sp-q-name">${nm.name}${nm.pdot}${nm.pr}</span><span class="sp-q-spec">${_spSpec(date, ex, i)}</span></span></button>`)
      + (o.locked ? _spBox(done, 'aria-disabled="true" tabindex="-1"', `完成 ${ex.name}`) : _spBox(done, `onclick="spTog('${date}',${i})"`, `完成 ${ex.name}`)) + `</div>`;
    if (open) {
      h += `<div class="sp-q-edit ex-edit">${_spSteps(date, ex, i)}${_spEditMore(date, ex, i, nm.note)}`
        + _spActs(date, ex, i, (!done ? `<button type="button" class="sp-pill on" onclick="spPin('${date}',${i})">先做这个</button>` : '') + `<button type="button" class="sp-pill exname" ${_detailAttrs(ex.name, date, i)}>动作要点</button>`) + `</div>`;
    }
    h += `</div>`;
  });
  if (canAdd) h += `<button type="button" class="sp-add add-row" onclick="openAddExerciseModal('${date}')"><span class="sp-add-ico">${SP.icon(SP.I.plus, 14, 3)}</span><span class="sp-add-t">加一个动作</span><span class="sp-add-s">按今天的肌群筛</span></button>`;
  return h + `</div>`;
}
// ── 00 热身 / 99 拉伸 ──
function _spBlockHtml(kind, date, items, o) {
  if (!items.length) return '';
  const allDone = items.every(([, i]) => o.pd[i]), open = !!_blkOpen[kind], label = kind === 'w' ? '热身' : '拉伸';
  const sec = items.reduce((s, [ex, i]) => { const r = getAdj(date, i, 'r', ex.reps), n = getAdj(date, i, 's', ex.sets) || 1; return s + (ex.unit === '分钟' ? r * 60 : ex.unit === '秒' ? r * n * (ex.bi ? 2 : 1) : 45 * n); }, 0);
  let h = `<div class="sp-card sp-blk blk"><div class="sp-blk-top"><button type="button" class="sp-blk-head blk-head" aria-expanded="${open}" onclick="toggleBlock('${kind}')"><span class="sp-q-idx">${kind === 'w' ? '00' : '99'}</span>`
    + `<span class="sp-blk-t"><span>${label}</span><span class="sp-num">${items.length} 项 · ${Math.max(1, Math.round(sec / 60))} MIN</span></span>${SP.icon(SP.I.chev, 18)}</button>`
    + (o.locked ? '' : uiBoxRow(allDone, '全部做完', `onclick="togBlock('${date}','${kind}')" aria-label="${label}全部做完"`, 'end')) + `</div>`;
  if (open) {
    h += `<div class="sp-blk-list">${items.map(([ex, i]) => {
      const done = !!o.pd[i], sets = getAdj(date, i, 's', ex.sets), reps = getAdj(date, i, 'r', ex.reps), nm = _spName(date, ex, i, o);
      const timed = ex.unit === '秒' || ex.unit === '分钟';
      return `<div class="sp-mini mini-row${done ? ' done' : ''}"><button type="button" class="sp-mini-name exname" ${_detailAttrs(ex.name, date, i)}>${nm.name}${nm.pdot}</button><span class="sp-mini-dose">${sets > 1 ? sets + '×' : ''}${_unitTxt(ex, reps)}</span>`
        + (o.locked ? '' : (timed ? `<button type="button" class="sp-mini-act link-btn" onclick="startTimer(${_timedSec(ex, reps)}, '${_q(ex.name)}')">计时</button>` : '') + `<button type="button" class="sp-mini-act link-btn" onclick="openSwapSheet('${date}',${i})">划掉</button>`)
        + (o.locked ? uiBox(done, 'aria-disabled="true" tabindex="-1"', `完成 ${ex.name}`, 'sm') : uiBox(done, `onclick="spTog('${date}',${i})"`, `完成 ${ex.name}`, 'sm')) + `</div>`;
    }).join('')}</div>`;
  }
  return h + `</div>`;
}
// ── 今日训练卡 ──
function _spDayCard(sel, today, st, o, lg) {
  const mus = _dayMuscles(sel), date = sel.date;
  const eyebrow = (date === today ? '今日训练' : `${fmtDate(date)}`) + (sel.isSwimDay ? ' · Swim' : sel.isPrivateDay ? ' · 另有安排' : ' · Gym');
  let h = `<div class="sp-card sp-day wk-head"><div class="sp-day-top"><div class="sp-day-l"><span class="sp-eyebrow">${eyebrow}</span><span class="sp-day-t wk-title">${_escHtml(sel.workoutType)}</span>${mus.length ? `<span class="sp-day-m">${mus.join(' · ')}</span>` : ''}</div>`
    + `<div class="sp-day-r"><div><b>${sel.duration || '?'}</b><span>MIN</span></div><div><b>${st.total}</b><span>主项</span></div></div></div>`;
  if (lg) {
    h += `<div class="today-foot sp-logged"><div class="sp-done-bar">${SP.tick(20, 2.6)}<span>${date === today ? '今天已打卡' : '已打卡'}</span><span class="sp-num">RPE ${lg.rpe || '—'} · ${lg.exerciseCount || 0} 个动作</span></div>`
      + `<div class="sp-pills"><button type="button" class="sp-pill link-btn" onclick="editLog(${LOG.indexOf(lg)})">编辑记录</button>${!sel.isPrivateDay ? `<button type="button" class="sp-pill link-btn" onclick="shareWorkout('${date}')">分享卡片</button>` : ''}${o.locked ? `<button type="button" class="sp-pill link-btn" onclick="unlockDate('${date}')">解除锁定</button>` : ''}</div></div>`;
  } else if (o.locked) {
    h += `<div class="sp-locked"><span>未打卡 · 已锁定</span><button type="button" class="sp-pill" onclick="unlockDate('${date}')">解除锁定</button></div>`;
  } else if (sel.exercises.length) {
    const t0 = _spT0(date), checked = Object.keys(o.pd).filter(k => o.pd[k]).length;
    if (!checked && !t0) h += `<button type="button" class="btn-primary sp-go" onclick="startGuided('${date}')">${SP.icon(SP.I.play, 18)}开始引导训练</button>`;
    else h += `<div class="sp-session"><div><span class="sp-eyebrow">训练中${t0 ? ' · 用时' : ' · 已完成'}</span><span class="sp-session-t" id="sp-elapsed" data-t0="${t0}">${t0 ? _spClock((Date.now() - t0) / 1000) : `${checked}/${sel.exercises.length}`}</span></div>`
      + `<div class="sp-session-b"><button type="button" class="sp-pill" onclick="startGuided('${date}')">引导训练</button><button type="button" class="sp-pill strong" onclick="endWorkoutEarly('${date}')">结束 · 打卡</button></div></div>`;
    h += `<div class="sp-rest-tools wk-tools"><span>休息</span><button type="button" class="sp-pill link-btn" onclick="startTimer(45, '组间休息')">45s</button><button type="button" class="sp-pill link-btn" onclick="startTimer(60, '组间休息')">60s</button></div>`;
  }
  return h + `</div>`;
}
function _spClock(s) { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + SP.pad2(m) : m) + ':' + SP.pad2(x); }

SKIN_TPL.sport.todayBody = ({ sel, today, planDays, tip }) => {
  let h = '';
  const note = typeof coachTodayNoteHtml === 'function' ? coachTodayNoteHtml(sel ? sel.date : today) : '';
  if (sel && !sel.isRest) {
    const lg = LOG.find(l => l.date === sel.date);
    if ((sel._src === 'log' && !planDays.find(dd => dd.date === sel.date)) || (isLocked(sel) && lg)) {
      // 只在日志里的历史日 / 已锁定且已打卡:只读
      const hist = sel._src === 'log' && !planDays.find(dd => dd.date === sel.date), e = hist ? sel._logEntry : lg;
      h += note + `<div class="sp-card sp-day wk-head"><div class="sp-day-top"><div class="sp-day-l"><span class="sp-eyebrow">${fmtDate(sel.date)} · ${hist ? '历史记录' : '已打卡 · 已锁定'}</span><span class="sp-day-t wk-title">${_escHtml(e ? e.workout || sel.workoutType : sel.workoutType)}</span></div>`
        + `<div class="sp-day-r"><div><b>${(e && e.duration) || sel.duration || '?'}</b><span>MIN</span></div></div></div>`;
      if (!hist) h += `<div class="sp-pills wk-tools"><button type="button" class="sp-pill link-btn" onclick="unlockDate('${sel.date}')">解除锁定</button>${!sel.isPrivateDay ? `<button type="button" class="sp-pill link-btn" onclick="shareWorkout('${sel.date}')">分享卡片</button>` : ''}</div>`;
      h += `</div>`;
      if (e && e.exercises && e.exercises.length) h += `<div class="sp-card sp-read">${_logMetaHtml(e)}${_readListHtml(e.exercises, sel.date)}</div>`;
      else h += `<div class="sp-card hist-empty">该日训练详情不可用</div>`;
      if (e && e.note) h += `<div class="sp-card hist-note">"${_escHtml(e.note)}"</div>`;
      if (!hist) { if (typeof coachFeedbackHtml === 'function') h += coachFeedbackHtml(sel.date); h += typeof renderRecoveryModule === 'function' ? renderRecoveryModule(sel) : ''; }
    } else {
      const pd = S.prog[sel.date] || {}, locked = isLocked(sel);
      const o = { pd, locked, pv: _ownerSession() ? new Set(_PRIVATE_POOL) : null, isX: _xMode && _ownerSession() && hasGoal('女性曲线') };
      const st = _spDayState(sel), checkedCount = Object.keys(pd).filter(k => pd[k]).length;
      const inSession = !lg && (checkedCount > 0 || _spT0(sel.date) > 0);
      h += _spDayCard(sel, today, st, o, lg);
      if (!inSession) h += note;
      if (sel.isSwimDay && !locked) {
        // 泳日:按阶段分组(纸墨同一套行,换成卡片)
        const PHASE_LABELS = { warmup: '热身', tech: '技术练习', main: '主练', cooldown: '放松' };
        let lastPhase = '', n = 0, open = false;
        sel.exercises.forEach((ex, i) => {
          const phase = ex.swimPhase || 'main';
          if (phase !== lastPhase) { if (open) h += `</div>`; lastPhase = phase; open = true; h += `<div class="sp-card sp-swim"><div class="sp-swim-h phase-head">${PHASE_LABELS[phase] || phase}</div>`; }
          const done = !!pd[i], reps = getAdj(sel.date, i, 'r', ex.reps); n++;
          h += `<div class="sp-q ex-row${done ? ' done' : ''}" data-i="${i}"><div class="sp-q-top"><div class="sp-q-main"><span class="sp-q-idx">${SP.pad2(n)}</span><span class="sp-q-txt"><button type="button" class="sp-q-name exname" ${_detailAttrs(ex.name, sel.date, i)}>${ex.name}</button><span class="sp-q-spec">${reps} 分钟</span>${ex.note ? `<span class="exnote">${ex.note}</span>` : ''}</span></div>`
            + uiBox(done, `onclick="spTog('${sel.date}',${i})"`, `完成 ${ex.name}`) + `</div><div class="sp-pills ex-acts">${!done ? `<button type="button" class="sp-pill link-btn" onclick="startTimer(${reps * 60}, '${_q(ex.name)}')">计时 ${reps} 分钟</button>` : ''}`
            + (phase !== 'warmup' && phase !== 'cooldown' ? `<button type="button" class="sp-pill link-btn swap-btn" onclick="swapExercise('${sel.date}',${i})">换 / 划掉</button>` : `<button type="button" class="sp-pill link-btn" onclick="openSwapSheet('${sel.date}',${i})">划掉</button>`) + `</div></div>`;
        });
        if (open) h += `</div>`;
        if (!isDone(sel)) h += `<button type="button" class="sp-card sp-add add-row" onclick="openAddExerciseModal('${sel.date}')"><span class="sp-add-ico">${SP.icon(SP.I.plus, 14, 3)}</span><span class="sp-add-t">加一个动作</span></button>`;
        if (inSession) h += note;
        h += typeof renderRecoveryModule === 'function' ? renderRecoveryModule(sel) : '';
        if (!lg) h += `<div class="today-foot sp-foot"><button type="button" class="btn-outline sp-checkin${checkedCount === sel.exercises.length ? ' on' : ''}" onclick="endWorkoutEarly('${sel.date}')">${checkedCount === sel.exercises.length ? '完成游泳训练' : `结束训练并打卡 · ${checkedCount}/${sel.exercises.length}`}</button></div>`;
        else if (typeof coachFeedbackHtml === 'function') h += coachFeedbackHtml(sel.date);
      } else {
        const all = sel.exercises.map((ex, i) => [ex, i]);
        h += _spBlockHtml('w', sel.date, all.filter(([ex]) => _isBlockWarm(ex)), o);
        if (st.cur) h += _spFocusHtml(sel, st, o);
        else if (st.total && !lg && !locked) {
          // 主项全部做完
          const vol = st.mains.reduce((a, [ex, i]) => a + (needsWeightUI(ex) ? (getWeight(sel.date, i) || 0) * getAdj(sel.date, i, 's', ex.sets) * getAdj(sel.date, i, 'r', ex.reps) : 0), 0);
          const t0 = _spT0(sel.date);
          h += `<section class="sp-focus sp-alldone">${_spJust && _spJust.date === sel.date ? _spJustHtml(sel) : ''}<span class="sp-f-tag">主项全部完成</span><span class="sp-f-huge">${st.doneN}/${st.total}</span>`
            + `<span class="sp-f-sum">${vol ? `总训练量 <b>${Math.round(vol)} kg</b>` : ''}${vol && t0 ? ' · ' : ''}${t0 ? `用时 <b>${_spClock((Date.now() - t0) / 1000)}</b>` : ''}${vol || t0 ? '。' : ''}拉伸做完就去打卡。</span>`
            + `<button type="button" class="sp-f-do" onclick="endWorkoutEarly('${sel.date}')">去打卡</button></section>`;
        }
        if (inSession) h += note;
        h += _spQueueHtml(sel, st, o);
        h += _spBlockHtml('s', sel.date, all.filter(([ex]) => _isBlockStretch(ex)), o);
        h += typeof renderRecoveryModule === 'function' ? renderRecoveryModule(sel) : '';
        if (_xMode && _ownerSession()) h += _xTaskPanel(sel.date);
        if (!locked && !lg) {
          const allIn = checkedCount === sel.exercises.length;
          h += `<div class="today-foot sp-foot"><button type="button" class="btn-outline sp-checkin${allIn ? ' on' : ''}" onclick="endWorkoutEarly('${sel.date}')">${allIn ? '完成打卡' : `完成打卡 · ${checkedCount}/${sel.exercises.length}`}</button></div>`;
        } else if (lg && typeof coachFeedbackHtml === 'function') h += coachFeedbackHtml(sel.date);
      }
    }
  } else if (sel && sel.isRest) {
    h += note + `<div class="sp-card sp-day wk-head"><span class="sp-eyebrow">${fmtDate(sel.date)}</span><span class="sp-day-t wk-title">休息日</span><span class="sp-day-m">好好恢复，明天继续。</span></div>`;
    h += typeof renderRecoveryModule === 'function' ? renderRecoveryModule(sel) : '';
  }
  if (tip) h += `<div class="sp-card tip" style="white-space:pre-line">${_escHtml(tip)}</div>`;
  if (_xMode && _ownerSession() && hasGoal('女性曲线')) h += (_xp() && _xp().curveTipHtml) || '';
  return h;
};

// ── 交互:组 / 撤销 / 先做这个 / 勾选 ──
// 完成下一组:不是最后一组 → 记组数 + 开组间倒计时;最后一组 → tog() 记成做完(tog 自己会开倒计时、放音效、该弹打卡就弹)
function spSet(date, i) {
  const day = S.plan && S.plan.days.find(d => d.date === date); if (!day || isLocked(day)) return;
  const ex = day.exercises[i]; if (!ex) return;
  const sets = getAdj(date, i, 's', ex.sets), done = !!(S.prog[date] || {})[i], n = _spSetsDone(date, i, sets, done) + 1;
  _spJust = null;
  if (n >= sets) return _spFinish(date, i, sets, done);
  _spSetsPut(date, i, n);
  render();
  if ((S.restDur || 45) > 0) startTimer(S.restDur || 45, '组间休息');
}
// 点第 k 个组点:点已完成的 = 撤回到它之前;点没完成的 = 做到它为止
function spDot(date, i, k) {
  const day = S.plan && S.plan.days.find(d => d.date === date); if (!day || isLocked(day)) return;
  const ex = day.exercises[i], sets = getAdj(date, i, 's', ex.sets), done = !!(S.prog[date] || {})[i];
  const n = _spSetsDone(date, i, sets, done), to = k < n ? k : k + 1;
  _spJust = null;
  if (to >= sets) return _spFinish(date, i, sets, done);
  _spSetsPut(date, i, to);
  if (done) tog(date, i); else render();
}
function _spFinish(date, i, sets, done) {
  _spSetsPut(date, i, sets);
  if (done) return render();
  _spJust = { date, i }; if (_spPin && _spPin.i === i) _spPin = null;
  tog(date, i);
}
function spUndo(date, i) {
  const day = S.plan && S.plan.days.find(d => d.date === date); if (!day) return;
  const ex = day.exercises[i], sets = getAdj(date, i, 's', ex.sets);
  _spJust = null; _spPin = { date, i };
  _spSetsPut(date, i, Math.max(0, sets - 1));
  if ((S.prog[date] || {})[i]) tog(date, i); else render();
  if (typeof stopTimer === 'function') stopTimer();
}
function spPin(date, i) {
  _spPin = { date, i }; _spJust = null; _exOpen[date + '-' + i] = false; render();
  const f = document.querySelector('#main .sp-focus'); if (f) try { f.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { }
}
// 勾选框:照旧 tog(),顺手记下这天开练的时间(训练中 · 用时)
function spTog(date, i) {
  if (!_spT0(date) && !(S.prog[date] || {})[i]) _spSetsPut(date, null);
  _spJust = null; tog(date, i);
}
// 组间倒计时:+15 s(接着现在剩的时间往后加,进度条按加长后的总时长算)
function spRestAdd(sec) {
  if (!_timerEndTime || Date.now() >= _timerEndTime) return;
  const left = Math.ceil((_timerEndTime - Date.now()) / 1000);
  startTimer(left + sec, _timerKind || '组间休息', { quiet: true, total: (_timerTotal || left) + sec });
  spRestTick();
}
// 焦点卡里的倒计时 / 训练用时:跟着顶上的计时条走(同一个计时器),每 250ms 刷一次。
// 焦点卡在屏幕上时把顶上的计时条收起来(body.sp-rest-vis),划出去了计时条再出来。
let _spTick = null;
function spRestTick() {
  if (typeof _spGOpen === 'function' && _spGOpen()) return spGRestTick();   // 引导训练开着:倒计时显示在引导卡里(60 区)
  const box = document.getElementById('sp-rest'), el = document.getElementById('sp-elapsed');
  if (!box && !el) { clearInterval(_spTick); _spTick = null; document.body.classList.remove('sp-rest-vis'); return; }
  if (el && +el.dataset.t0) el.textContent = _spClock((Date.now() - +el.dataset.t0) / 1000);
  if (!box) { document.body.classList.remove('sp-rest-vis'); return; }
  const bar = document.getElementById('universal-timer');
  const on = !!bar && bar.classList.contains('show') && _timerKind === '组间休息' && _timerEndTime > Date.now();
  box.hidden = !on;
  if (!on) { document.body.classList.remove('sp-rest-vis'); return; }
  const left = (_timerEndTime - Date.now()) / 1000;
  document.getElementById('sp-rest-t').textContent = _spClock(Math.ceil(left));
  const b = document.getElementById('sp-rest-bar'); if (b) b.style.width = Math.max(0, Math.min(100, left / (_timerTotal || 1) * 100)) + '%';
  const r = box.getBoundingClientRect(), mh = document.querySelector('.masthead');
  document.body.classList.toggle('sp-rest-vis', r.bottom > (mh ? mh.offsetHeight : 0) && r.top < innerHeight);
}
SKIN_TPL.sport.after_today = () => {
  const f = document.querySelector('#main .sp-focus[data-i]'), nx = document.getElementById('sp-rest-next');
  if (f && nx) {
    const day = S.plan && S.plan.days.find(d => d.date === (S.selDate || todayStr())), i = +f.dataset.i, ex = day && day.exercises[i];
    if (ex) { const sets = getAdj(day.date, i, 's', ex.sets), n = _spSetsDone(day.date, i, sets, !!(S.prog[day.date] || {})[i]); nx.textContent = n > 0 && n < sets ? ` · 下一组 ${n + 1}/${sets}` : ` · 下一项 ${ex.name}`; }
  }
  spRestTick();
  if (!_spTick && (document.getElementById('sp-rest') || document.getElementById('sp-elapsed'))) _spTick = setInterval(spRestTick, 250);
};

// ── 刊头:选中的训练日 → 进度环 + 每个主项一段;休息日 → 小胶囊 ──
SKIN_TPL.sport.mh_today = () => {
  if (typeof S === 'undefined' || !S.plan) return {};
  const sel = S.plan.days.find(d => d.date === (S.selDate || todayStr())); if (!sel) return {};
  if (sel.isRest) return { aside: SKIN_TPL.sport.mhChip('休息日') };
  const st = _spDayState(sel); if (!st.total) return {};
  return { aside: SKIN_TPL.sport.ring(st.doneN, st.total), bar: st.mains.map(([, i]) => `<i class="${st.pd[i] ? 'on' : st.cur && st.cur[1] === i ? 'cur' : ''}"></i>`).join('') };
};
// 教练的话:卡片头是荧光绿小方块 + 「教练」+ 时间
SKIN_TPL.sport.coachNote = (n) => `<div class="sp-card sp-coach coach-note" id="co-note"><div class="sp-coach-h"><span class="sp-coach-ico">${SP.icon(SP.I.chat, 16)}</span><b>教练</b><span class="sp-num">${_coachHM(n.at)}</span></div>`
  + `<div class="prose">${_esc(n.text)}</div><button type="button" class="sp-link" onclick="showTab('coach')">接着问${SP.icon(SP.I.arrow, 16, 2.4)}</button></div>`;
SKIN_TPL.sport.coachFbOpen = (date, fb) => `<div class="sp-card sp-coach co-fb" id="co-fb-${_esc(date)}" aria-live="polite"><div class="sp-coach-h"><span class="sp-coach-ico">${SP.icon(SP.I.chat, 16)}</span><b>教练</b>${fb.at && fb.state === 'ok' ? `<span class="sp-num">${_coachHM(fb.at)}</span>` : ''}</div>`;
// 训练中陪练(coach.js coachQuickOpen):底部面板 —— 顶上「陪练」小标签 + 动作名大字 + 黑底三格(第几组 / 重量 / 刚才的感受),
// 中间对话(教练左边荧光绿小头像 + 白卡气泡,我右边墨底气泡),下面一排快捷问题胶囊 + 胶囊输入框 + 圆形发送键
SKIN_TPL.sport.coachQuick = ({ sugg }) => `<div class="ex-modal-card sp-sh-card sp-cq" onclick="event.stopPropagation()">`
  + `<div class="sp-cq-top"><div id="cq-head" class="cq-head sp-cq-head"></div><button type="button" class="ex-modal-close" onclick="coachQuickClose()">关闭</button></div>`
  + `<div id="cq-log" class="cq-log sp-cq-log" aria-live="polite"></div>`
  + `<div class="chips cq-sugg sp-cq-sugg">${sugg.map(([l, q]) => `<button type="button" class="chip" data-q="${SP.esc(q)}" onclick="coachQuickSend(this.dataset.q)">${SP.esc(l)}</button>`).join('')}</div>`
  + `<div class="cq-row sp-cq-row"><textarea id="cq-text" rows="1" placeholder="问教练…" aria-label="问教练" onkeydown="if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();coachQuickSend()}"></textarea><button type="button" class="send" id="cq-go" onclick="coachQuickSend()">发送</button></div>`
  + `<span class="co-meta cq-foot">快模型，回答很短 · 教练看得到你做到第几组 · 今天的陪练记录只存在这台手机上</span></div>`;
SKIN_TPL.sport.coachQuickHead = ({ t, ex, name, status }) => {
  let tiles = '';
  if (ex) {
    const kg = ex.kg != null ? ex.kg : ex.kgSuggested;
    tiles = `<div class="sp-cq-tiles">`
      + `<div><b>${ex.done ? '完成' : `${Math.min(ex.setsDone + 1, ex.sets)}/${ex.sets}`}</b><span>${ex.done ? '这个动作' : '组'}</span></div>`
      + `<div><b>${kg != null ? SP.esc(kg) : '自重'}</b><span>${kg != null ? (ex.kg != null ? 'KG' : '建议 KG') : '负重'}</span></div>`
      + `<div><b class="sm">${ex.feel ? SP.esc(ex.feel) : '—'}</b><span>刚才</span></div></div>`;
  }
  return `<span class="sheet-eyebrow">陪练 · ${SP.esc(status)}</span><div class="sheet-title">${SP.esc(name || t.type || '今天')}</div>${tiles}`;
};
SKIN_TPL.sport.coachQuickLog = ({ msgs, streaming }) => {
  const av = `<span class="sp-co-av" aria-hidden="true">${SP.icon(SP.I.chat, 15)}</span>`;
  const coach = inner => `<div class="cq-msg co sp-cq-co">${av}<div class="sp-msg-col">${inner}</div></div>`;
  if (!msgs.length && !streaming) return `<div class="sp-cq-empty">练到一半有问题直接问：下一组多重、哪里不对劲、想换个动作。教练看得到你做到第几组；让它换动作、改重量、开计时，它会直接改，不合适点「撤销」。</div>`;
  return msgs.map(m => m.role === 'assistant'
    ? coach(`<div class="co-text sp-bub">${_coachMd(m.text)}</div>${m.action ? _coachActHtml(m.action) : ''}${m.mem ? _coachMemNoteHtml(m.mem) : ''}${m.meta ? _coachCostLine(m.meta) : ''}`)
    : `<div class="cq-msg me sp-cq-me"><span class="co-text sp-bub">${SP.esc(m.text)}</span></div>`).join('')
    + (streaming ? coach(`<div class="co-text sp-bub" id="cq-stream"><span class="co-meta">想一下…</span></div>`) : '');
};
// 装到主屏幕的提示(只在 iOS Safari、还没装时):运动版是白卡 + 粗标题,不带纸墨的方括号标签
SKIN_TPL.sport.iosInstall = () => `<div class="notice sp-install" id="ios-install-prompt"><span><b>装到主屏幕</b> Safari 右下角 ••• → 分享 → 添加到主屏幕，离线也能打开。</span><button class="link-btn" onclick="try{localStorage.setItem('hideInstallPrompt','1')}catch(e){};document.getElementById('ios-install-prompt').remove()">关闭</button></div>`;
// —— 10 今天 · 写在这行上面 ——

// ══ 20 计划 ═════════════════════════════════════════════════════════════
// 刊头右边:每周几天
SKIN_TPL.sport.mh_plan = () => ({ aside: SKIN_TPL.sport.mhChip(typeof S !== 'undefined' && S.days ? `${S.days} 天 / 周` : '') });

// 周历卡片头(ui.js uiRenderPlanCal):标题 + 日期范围 + 回到今天 / 翻页;下面一排星期(按这两周第一周实际的星期排,
// 计划不一定从周一开始);图例写在这里,CSS 用 order 排到格子下面。格子本身(.dc,拖拽 / 点选 / owner 标记都在上面)不换结构,只换样子
SKIN_TPL.sport.planCalNav = ({ visibleDays, isCurrentView, viewStart, viewEnd, coDows }) => {
  const DW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return `<div class="cal-nav sp-cal-head"><span class="sp-cal-tt"><span class="sp-cal-t">两周安排</span>`
    + `<span class="cal-nav-label">${viewStart.slice(5).replace('-', '/')} — ${viewEnd.slice(5).replace('-', '/')}</span></span>`
    + (!isCurrentView ? `<button type="button" class="link-btn sp-cal-back" onclick="calGoToday()">回到今天</button>` : '')
    + `<button type="button" class="link-btn sp-cal-arr" onclick="calPrev()" aria-label="上两周">${SP.icon('M15 5l-7 7 7 7', 20, 2.4)}</button>`
    + `<button type="button" class="link-btn sp-cal-arr" onclick="calNext()" ${isCurrentView ? 'disabled' : ''} aria-label="下两周">${SP.icon('M9 5l7 7-7 7', 20, 2.4)}</button></div>`
    + `<div class="sp-cal-dows" aria-hidden="true">${visibleDays.slice(0, 7).map(d => `<span>${DW[new Date(d.date + 'T12:00:00').getDay()]}</span>`).join('')}</div>`
    + `<div class="sp-cal-key">${coDows ? `<span><i class="sp-cal-dot"></i>搭子也练</span>` : ''}<span>✓ 已完成</span></div>`;
};

// 当前设置卡片(ui.js uiRenderPlanSummary):设置一行一项 + 纸墨那几行计划统计(kv 原样接上) + 01–08 跳转胶囊
SKIN_TPL.sport.planSummary = ({ kv }) => {
  const rest = +(S.restDur ?? 45), focus = (S.focus && S.focus.length ? S.focus : ['均衡全身']).map(v => (UI_FOCUS.find(x => x[0] === v) || [])[1] || v);
  const rows = [
    ['目标', (S.goal || '').split('+').join(' + ') || '—'],
    ['每周', `${S.days} 天 × ${S.dur} min · 组间${rest ? ` ${rest} s` : '不计时'}`],
    ['器械', (S.equip || []).join(' + ') || '无器材'],
    ['部位', focus.join(' · ')],
    ['周期', S.cycleEnabled !== false ? `开 · 今天第 ${S.cycleDay || 1} 天` : '关']
  ];
  if (typeof skinMasthead === 'function' && uiCurrentTab === 'plan') skinMasthead();   // 天数改了:刊头右边的「N 天 / 周」跟着变(设置一改这里就重画)
  return `<div class="plan-sum sp-psum"><div class="sp-psum-h"><span class="sp-psum-t">当前设置</span><span class="saved-dot" id="saved-dot" aria-hidden="true"></span></div>`
    + `<div class="kv">${rows.map(([k, v]) => `<span class="k">${k}</span><span>${SP.esc(v)}</span>`).join('')}</div>${kv}`
    + `<nav class="sec-index" aria-label="计划分节">${UI_PLAN_INDEX.map(([id, t]) => { const [n, l] = t.split(' '); return `<a href="#${id}" data-act="scrollTo" data-target="${id}"><b>${n}</b>${l}</a>`; }).join('')}</nav></div>`;
};

// 小节标题带「 · 补充」的(03 器械 · 可多选 / 04 / 05):补充那半句拆成小灰字
SKIN_TPL.sport.planSec = (text) => {
  const t = String(text), i = t.indexOf(' · ');
  const h = SKIN_TPL.sport.secLabel(i < 0 ? t : t.slice(0, i));
  return i < 0 ? h : h.replace(/<\/div>$/, `<span class="sp-sec-s">${SP.esc(t.slice(i + 3))}</span></div>`);
};

// 03 Tecnogym 对照表的展开按钮:整行描边按钮 + 箭头(纸墨是「▸ / ▾」字)
SKIN_TPL.sport.planTecnoBtn = (on) => `<button type="button" class="link-btn sp-tecno-btn" data-toggle="tecno" aria-expanded="${on}" aria-controls="tecno-table">Tecnogym 器械对照表${SP.icon(SP.I.chev, 18, 2.2)}</button>`;

// 06 周期阶段:四段按天数分宽的周期条 + 三角标出今天 + 浅灰说明框(阶段划分和 core.js cyclePhase 同一套算法)
SKIN_TPL.sport.planPhase = () => {
  const day = S.cycleDay || 1, len = S.cycleLength || 28, p = cyclePhase(day, len);
  const ovu = Math.max(8, len - 14);
  const segs = [['menstrual', '月经', 1, 5], ['follicular', '卵泡', 6, ovu - 2], ['ovulation', '排卵', ovu - 1, ovu + 1], ['luteal', '黄体', ovu + 2, len]];
  const nudge = p.key === 'menstrual' && !S.periodMode;
  return `<div id="cycle-phase" class="sp-phase">`
    + `<div class="sp-phase-bar" aria-hidden="true"><i class="sp-phase-mk" style="left:${((day - 0.5) / len * 100).toFixed(2)}%"></i>`
    + segs.map(([k, l, a, b]) => `<span class="${k === p.key ? 'on' : ''}" style="flex-grow:${Math.max(1, b - a + 1)}">${l}</span>`).join('') + `</div>`
    + `<div class="sp-phase-box"><b>${SP.esc(p.name)} · 第 ${day}/${len} 天</b><span class="hint">${SP.esc(p.advice)}</span>`
    + (nudge ? `<button type="button" class="sp-phase-go" data-toggle="period">一键开经期模式</button>` : '') + `</div></div>`;
};

// 07 已排除:标题要「07」大号数字,可 #excluded-head 的字由 app.js renderExcludedList 整句改写 →
// 那句留着给读屏(CSS 视觉隐藏),另画一个只给眼睛看的标题,条数用 CSS 计数器数 .ex-list-row(放在列表后面才数得到,CSS order 提到最上)
SKIN_TPL.sport.planP7 = (ctx, paper) => paper().replace('<div id="excluded-list"></div>',
  `<div id="excluded-list"></div><div class="sec-label sp-sec sp-p7-h" aria-hidden="true"><span class="sp-sec-n">07</span><span class="sp-sec-t">已排除的动作 / 器械</span><span class="sp-p7-n"></span></div>`);

// 采纳过、还能撤销的教练提议(coach.js coachPlanPropsHtml;节点由 ui.js 插在「当前设置」上面):墨色粗边白卡,
// 荧光绿「教练」小签 + 一句摘要 + 撤销。撤销按钮在 .co-prop[data-pid] 里,走 coachPropAct 同一套
SKIN_TPL.sport.planProps = ({ items }) => items.map(it => `<div class="co-prop plan-prop sp-pp" data-pid="${SP.esc(it.id)}"><span class="sp-pp-tag">教练</span>`
  + `<span class="pp-t">${SP.esc(it.text)}，已写进计划</span><button type="button" class="link-btn u" onclick="coachPropAct(this,'undo')">撤销</button></div>`).join('');
// —— 20 计划 · 写在这行上面 ——

// ══ 30 记录 ═════════════════════════════════════════════════════════════
// 记录页:白卡片堆叠。大数字三格(第三格荧光绿底)→ 训练量柱 → 本月 → 日志(左边日期块)→ 热力格 → 各明细卡。
// 数据都由 app.js / coach.js / core.js 算好传进来(或照原样再算一遍),这里只排版;按钮的 onclick / id / aria 和纸墨一样。
// 纸墨的 ASCII 条(█░)、虚线分隔、[ 方括号 ] 标签,运动里换成实心条、细实线、胶囊。
const _spLog = {
  mon: m => (typeof _UI_MON_EN !== 'undefined' ? _UI_MON_EN[m] || '' : '').toUpperCase(),
  // 卡片头:标题 + 右边一行细字
  head: (t, aside) => `<div class="sp-ph"><p class="panel-title">${t}</p>${aside ? `<span class="sp-pu">${aside}</span>` : ''}</div>`,
  // 实心进度条(0–1)
  meter: f => `<span class="sp-meter" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Math.round((f || 0) * 100)))}%"></i></span>`,
  // 涨跌的颜色:好 = 荧光绿底小块,坏 = 红字,不好说 = 淡字
  dir: (good, bad) => good ? 'sp-up' : bad ? 'sp-dn' : 'sp-eq'
};

// 刊头右边胶囊:连续打卡天数(和本页大数字「连续打卡天数」同一个算法);断了就显示本月次数
SKIN_TPL.sport.mh_log = () => {
  if (typeof LOG === 'undefined' || typeof todayStr !== 'function') return {};
  const T = todayStr(), days = new Set(LOG.map(l => l.date));
  let st = 0;
  for (let i = 0; i < 365; i++) { if (days.has(addDays(T, -i))) st++; else if (i > 0) break; }
  const n = LOG.filter(l => l.date.startsWith(T.slice(0, 7))).length;
  return { aside: SKIN_TPL.sport.mhChip(st ? `连续 ${st} 天` : `本月 ${n} 次`) };
};

// 每周复盘(coach.js coachRenderReview / _coachShowReview):白卡,左上荧光绿「WEEK 44 复盘」胶囊
SKIN_TPL.sport.logReviewLocked = ({ a }) => `<button type="button" class="row-btn sp-rv-lock" onclick="showTab('coach')"><span class="sp-rv-chip off">复盘</span><span class="sp-rv-lk"><span class="rk">${a === 'none' ? 'AI 教练是邀请制' : '登录后可用'}</span><span class="rv">每周看最近练得怎么样，给出可以一键采纳的调整</span></span>${SP.icon(SP.I.arrow, 18)}</button>`;
// 容器带 data-skin="sport":换回纸墨时 coachRenderReview 认出来整块重建
SKIN_TPL.sport.logReviewBox = () => `<div class="co-card sp-rv" id="co-review" data-skin="sport"><div id="co-review-body"></div><button class="btn-outline" id="co-review-go" onclick="coachReview()">生成复盘</button></div>`;
SKIN_TPL.sport.logReviewEmpty = () => `<div class="sp-rv-top"><span class="sp-rv-chip">复盘</span><span class="sp-rv-when">每周</span></div><div class="hint">看最近几周练得怎么样，给出下周可以一键采纳的调整。</div>`;
SKIN_TPL.sport.logReview = ({ rv, adj, left, applied }) => {
  const wk = typeof _uiIsoWeek === 'function' ? `WEEK ${_uiIsoWeek(rv.at)} ` : '';
  const when = rv.auto ? `${new Date(rv.at + 'T12:00:00').getDay() === 1 ? '周一' : '本周'}自动生成` : String(rv.at || '').slice(5).replace('-', '/');
  const li = arr => (arr || []).map(x => `<li>${SP.esc(x)}</li>`).join('');
  return `<div class="sp-rv-top"><span class="sp-rv-chip">${wk}复盘</span><span class="sp-rv-when">${when}</span></div>`
    + `<div class="co-rv"><div class="rv-h">${SP.esc(rv.headline)}</div>${_coachMd(rv.summary)}`
    + (rv.wins?.length ? `<div class="co-rv-t">做得好</div><ul>${li(rv.wins)}</ul>` : '')
    + (rv.issues?.length ? `<div class="co-rv-t">要注意</div><ul>${li(rv.issues)}</ul>` : '')
    + (adj ? `<div class="sub-label">建议调整 · 勾选后一键采纳</div><div id="co-adj-list">${adj}</div>`
      + (left > 0 ? `<button class="btn-primary" id="co-adopt" onclick="coachApplyReview()">采纳勾选的 ${left} 条</button>` : `<div class="sp-rv-done">${SP.tick(16, 3)}已采纳 ${applied.length} 条</div>`) : '')
    + `${_coachCostLine(rv)}</div>`;
};

// 大数字三格 + 训练量柱 + 本月(app.js renderStats 的 top)
SKIN_TPL.sport.logTop = (c) => {
  const big = (n, lbl, cls) => `<div class="sp-bigc${cls ? ' ' + cls : ''}"><span class="bignum">${n}</span><span class="biglbl">${lbl}</span></div>`;
  const bars = c.weeks.map((w, i) => {
    const h = w.sets ? Math.max(6, Math.round(w.sets / c.maxW * 100)) : 0;
    return `<div class="sp-bar${i === c.weeks.length - 1 ? ' cur' : ''}"><b>${w.sets}</b><i${w.sets ? '' : ' class="z"'} style="height:${h}px"></i><span>${w.w}</span></div>`;
  }).join('');
  const ml = c.monthLogs, sum = f => ml.reduce((s, l) => s + f(l), 0);
  const cell = (n, lbl, unit) => `<div><b>${n}${unit ? `<small>${unit}</small>` : ''}</b><span>${lbl}</span></div>`;
  return `<div class="bignums sp-big">${big(ml.length, '本月次数')}${big(`${c.weekPct}<small>%</small>`, `本周完成率 · ${c.weekDone}/${c.weekTotal}`)}${big(c.streak, '连续打卡天数', 'on')}</div>`
    + `<div class="panel" id="vol-panel">${_spLog.head('训练量 · 近四周', '单位：组')}<div class="sp-bars">${bars}</div></div>`
    + `<div class="panel" id="month-panel">${_spLog.head('本月')}<div class="sp-mgrid">`
    + cell(ml.length, '训练天')
    + cell(sum(l => l.exerciseCount || 0), '完成动作')
    + cell(sum(l => l.duration || 0), '总分钟')
    + cell(ml.filter(l => l.exercises && l.exercises.some(e => e.unit !== '分钟')).length, '力量训练', '次')
    + cell(sum(l => l.exercises ? l.exercises.filter(e => e.unit === '分钟').reduce((a, e) => a + e.reps, 0) : 0), '有氧分钟')
    + cell(c.avgRpe, '平均 RPE')
    + cell(c.monthPR, '新纪录')
    + `</div><div class="sp-wk"><span>本周</span>${_spLog.meter(c.weekPct / 100)}<b>${c.weekPct}%</b></div></div>`;
};

// 日志一行(app.js renderLog):左边日期块(大号日 + 月份缩写),中间练了什么,右边 RPE 胶囊
SKIN_TPL.sport.logRow = ({ x, open }) => {
  const [, m, d] = x.date.split('-');
  return `<button type="button" class="log-row sp-lrow" aria-expanded="${open}" onclick="toggleLogRow('${x.date}')">`
    + `<span class="sp-ld"><b>${d}</b><i>${_spLog.mon(+m - 1)}</i></span>`
    + `<span class="sp-lm"><span class="lw">${SP.esc(x.workout || '训练')}</span><span class="lt">${x.duration || '?'} min${wkLogMin(x) ? ` · 用时 ${wkLogMin(x)} min` : ''} · ${x.exerciseCount || 0} 个动作${x.mood ? ' · ' + SP.esc(x.mood) : ''}</span></span>`
    + (x.rpe ? `<span class="lr">RPE ${x.rpe}</span>` : `<span class="lr none">—</span>`) + `</button>`;
};

// 近 12 周热力:真格子(只看不点,当天详情从日志进)
SKIN_TPL.sport.logHeat = (c) => {
  let cells = '';
  ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].forEach((lbl, r) => {
    cells += `<span class="sp-hl">${lbl}</span>`;
    for (let col = 0; col < 13; col++) {
      const ds = addDays(c.gridStart, col * 7 + r);
      cells += `<i class="${ds > c.tStr || ds < c.start ? 'nil' : (c.logDates.has(ds) ? 'on' : 'off') + (ds === c.tStr ? ' td' : '')}"></i>`;
    }
  });
  return `<div class="panel" id="heat-panel">${_spLog.head('近 12 周 · 有打卡的天')}`
    + `<div class="sp-heat" role="img" aria-label="近 12 周训练热图，实心格表示当天有打卡">${cells}</div>`
    + `<div class="sp-hkey"><span><i class="on"></i>练了</span><span><i class="off"></i>没练</span><span><i class="off td"></i>今天</span></div>`
    + `<div class="foot-note">看某天的详情，在上面的日志里点开。</div></div>`;
};

// 肌群训练量:横条
SKIN_TPL.sport.logDist = (c) => `<div class="panel" id="dist-panel">${_spLog.head('肌群训练量 · 近 60 天')}<div class="sp-hbars">`
  + c.distEntries.map(([g, n]) => `<div class="sp-hbar"><span class="k">${SP.esc((typeof _GRP_NAMES !== 'undefined' && _GRP_NAMES[g]) || g)}</span>${_spLog.meter(n / c.maxDist)}<b>${n}</b></div>`).join('')
  + `</div></div>`;

// 重量进步:动作名 + 现在的重量(大数字),下面一排小柱,最后一根荧光绿
SKIN_TPL.sport.logWt = (c) => `<div class="panel" id="wt-panel">${_spLog.head('重量进步')}` + c.wtEx.map(([name, hist]) => {
  const ws = hist.map(h => h.weight), max = Math.max(...ws), min = Math.min(...ws), range = max - min || 1;
  const first = hist[0].weight, last = hist[hist.length - 1].weight, delta = last - first, recent = hist.slice(-12);
  const asst = typeof isAssistedMove === 'function' && isAssistedMove(name);   // 助力器械:数字往下走才是进步
  const good = asst ? delta < 0 : delta > 0, bad = asst ? delta > 0 : delta < 0;
  const rm = typeof estimate1RM === 'function' ? estimate1RM(name) : null;
  return `<div class="sp-wt"><div class="sp-wt-h"><span class="sp-wt-n">${SP.esc(name)}${rm ? `<small>1RM≈${rm}kg</small>` : ''}</span><span class="sp-wt-v"><b>${last}</b><small>kg</small></span></div>`
    + `<div class="spark sp-spark">${recent.map(h => `<i style="height:${range > 0 ? ((h.weight - min) / range * 70 + 30) : 50}%" title="${h.date}: ${h.weight}kg"></i>`).join('')}</div>`
    + `<div class="sp-wt-f"><span>${recent[0]?.date?.slice(5) || ''}</span><span class="${_spLog.dir(good, bad)}">${asst ? '助力 ' : ''}${delta > 0 ? '+' : ''}${delta}kg</span></div></div>`;
}).join('') + `</div>`;

// 个人纪录:旧重量划掉 → 新重量放荧光绿底块
SKIN_TPL.sport.logPr = (c) => `<div class="panel" id="pr-panel">${_spLog.head('个人纪录')}<div class="sp-rows">`
  + c.list.map(pr => `<div class="sp-pr"><span class="sp-pr-n"><b>${SP.esc(pr.exercise)}</b><span>${SP.esc(pr.date)}</span></span><span class="sp-pr-v"><s>${pr.prev}kg</s>${SP.icon(SP.I.arrow, 14, 2.4)}<b>${pr.weight}<small>kg</small></b></span></div>`).join('')
  + `</div></div>`;

// 力量 / 游泳成就:三个数 + 下一个的进度条 + 勋章墙(勋章按钮就是纸墨那组,只换样子)
SKIN_TPL.sport.logAch = (c) => `<div class="panel" id="ach-${c.kind}">${_spLog.head(`${c.nm}成就`)}`
  + `<div class="sp-mgrid sp-g3"><div><b>${c.count}</b><span>总${c.nm}次数</span></div><div><b>${c.thisM.length}</b><span>本月${c.nm}</span></div><div><b>${c.totalMin}</b><span>总${c.nm}分钟</span></div></div>`
  + (c.nextMs
    ? `<div class="sp-next"><div class="sp-next-h"><span>下一个 · ${SP.esc(c.nextMs.title)}</span><b>${c.count}/${c.nextMs.count}</b></div>${_spLog.meter(c.count / c.nextMs.count)}</div>`
    : `<div class="sp-alldone">${SP.tick(16, 3)}所有成就已解锁！</div>`)
  + `<p class="sub-label">${c.nm}勋章墙</p><div class="ach-wall sp-achw">${c.badges}</div></div>`;

// 曲线焦点:每个承重点一条实心进度
SKIN_TPL.sport.logCurve = (c) => `<div class="panel" id="curve-panel">${_spLog.head('曲线焦点', '近 4 周')}<div class="sp-sub">练了多少 vs 尺寸往哪走</div>`
  + c.st.map(f => {
    const good = f.trend == null ? null : (f.dir === 'up' ? f.trend > 0 : f.dir === 'down' ? f.trend < 0 : null);
    const trend = f.trend != null ? ` <span class="${_spLog.dir(good === true, good === false)}">${f.trend > 0 ? '+' : ''}${f.trend}cm</span>` : (f.metric ? ' <span class="sp-eq">没量</span>' : '');
    return `<div class="sp-cv"><div class="sp-cv-h"><b>${f.name}</b><span>${f.sets}/${f.target} 组${trend}</span></div><div class="sp-cv-m">${_spLog.meter(f.pct / 100)}<b>${f.pct}%</b></div><div class="foot-note">${f.why}</div></div>`;
  }).join('')
  + `<div class="hint quote-rule">${c.hint}</div></div>`;

// 身体记录(app.js renderBodyPanel):输入格、保存、真空吸打卡、比例、小柱、历史
SKIN_TPL.sport.bodyVac = (c) => `<div class="sp-vac"><span class="sp-vac-t"><b>真空吸收腰打卡</b><span class="foot-note">连续 ${c.st} 天 · 累计 ${c.n} 次</span></span>`
  + `<button type="button" class="btn-line sp-vac-b${c.dn ? ' done' : ''}" onclick="logVacuum()"${c.dn ? ' aria-disabled="true"' : ''}>${c.dn ? SP.tick(16, 3) + '今日已打' : '今日打卡'}</button></div>`;
SKIN_TPL.sport.bodyHist = (c) => `<details class="fold sp-fold"><summary>历史记录（${BODY_LOG.length}）</summary><div class="sp-rows">`
  + [...BODY_LOG].reverse().slice(0, 40).map(x => `<div class="sp-bh"><span class="sp-bh-d">${x.date}</span><span class="sp-bh-v">${BODY_FIELDS.filter(f => x[f.k] != null).map(f => (f.k === 'weight' ? x.weight + 'kg' : c.L(f.k).slice(0, 2) + x[f.k])).join(' · ')}</span><button type="button" class="link-btn sp-del" onclick="delBody('${x.date}')" aria-label="删除 ${x.date} 的记录">删除</button></div>`).join('')
  + `</div></details>`;
SKIN_TPL.sport.bodyPanel = (c) => `<div class="panel" id="body-panel">${_spLog.head(c.title, '体型才是真正的进度')}`
  + `<div class="body-grid">${c.core}</div>`
  + `<details class="fold sp-fold"><summary>更多围度（胸 / 胯宽 / 下腹 / 大腿根 / 小腿 / 脚踝）</summary><div class="body-grid">${c.more}</div><div class="foot-note">每项都有量法提示（长按 / 悬停标签）。位置固定住，数字才有意义。</div></details>`
  + `<button type="button" class="btn-outline" onclick="logBody()">保存今日数据</button>${c.vac}`
  + (c.ratios ? `<div class="kv wide sp-ratios">${c.ratios}</div>${c.whrNote}` : '')
  + (c.charts ? `<div class="sp-charts">${c.charts}</div>` : '') + c.hist + `</div>`;

// 历史详情弹窗(core.js showHistoryDetail):头上大号日期;每条记录先一排数字格(RPE 那格荧光绿底)
SKIN_TPL.sport.histHead = ({ d, dayName }) => `<div class="hist-detail-header sp-hh"><span class="hist-detail-date sp-hdate"><b>${d.getDate()}</b><span><i>${_spLog.mon(d.getMonth())} ${d.getFullYear()}</i><i>${dayName}</i></span></span><button class="ex-modal-close" onclick="closeHistModal()">关闭</button></div>`;
// 有实际用时(打卡记下的 elapsedMin)就多一格「用时 MIN」,四格时排成 2 × 2
SKIN_TPL.sport.histMeta = ({ entry }) => `<div class="hist-detail-meta sp-hm"><div class="sp-hm-n">${SP.esc(entry.workout || '训练')}</div><div class="sp-hm-s${wkLogMin(entry) && entry.rpe && entry.mood ? ' n4' : ''}">`
  + `<span><b>${entry.duration || '?'}</b><i>MIN</i></span>`
  + (wkLogMin(entry) ? `<span><b>${wkLogMin(entry)}</b><i>用时 MIN</i></span>` : '')
  + (entry.rpe ? `<span class="on"><b>${entry.rpe}<small>/10</small></b><i>RPE</i></span>` : '')
  + (entry.mood ? `<span><b class="t">${SP.esc(entry.mood)}</b><i>感受</i></span>` : '')
  + `</div></div>`;

// ── 分享卡片(canvas,600×850):浅底 #f2f2ee、白卡、墨 #111,荧光绿只做底色块 ──
// 内容和纸墨那张一样(app.js _drawShareCardPaper / _drawAchievementShareCardPaper),只换颜色、色块、版式。
// 字体照纸墨的写法给,skinCanvas 自动换成运动字体:ZCOOL → 标题 · Courier → 数字 / 小标签 · Garamond → 正文 · 其他 → 中文
const _spCv = {
  C: { bg: '#f2f2ee', card: '#ffffff', ink: '#111111', muted: '#55554f', faint: '#64645d', line: '#d9d9d2', track: '#e2e2db', neon: '#d4ff3d', neonMuted: '#45531a' },
  F: {
    head: px => `normal ${px}px "ZCOOL XiaoWei"`,
    num: px => `bold ${px}px "Courier Prime"`,
    lbl: px => `normal ${px}px "Courier Prime"`,
    body: px => `normal ${px}px "EB Garamond"`,
    cjk: px => `normal ${px}px "Noto Serif SC"`,
    cjkB: px => `bold ${px}px "Noto Serif SC"`
  },
  canvas() {
    const cv = document.createElement('canvas'); cv.width = 600; cv.height = 850;
    const ctx = typeof skinCanvas === 'function' ? skinCanvas(cv.getContext('2d')) : cv.getContext('2d');
    ctx.fillStyle = this.C.bg; ctx.fillRect(0, 0, 600, 850);
    return [cv, ctx];
  },
  box(ctx, x, y, w, h, r, fill) {
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  },
  // 按字断行(用当前字体量宽),最多 max 行,超了最后一行加省略号
  lines(ctx, text, maxW, max) {
    const out = []; let line = '';
    for (const ch of String(text)) { if (line && ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; }
    if (line) out.push(line);
    if (out.length > max) { let l = out[max - 1]; while (l && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1); out.length = max; out[max - 1] = l + '…'; }
    return out;
  },
  // 一行放得下就用 px,放不下逐级缩到 min
  fit(ctx, font, text, maxW, px, min) {
    for (; px > min; px -= 2) { ctx.font = font(px); if (ctx.measureText(text).width <= maxW) return px; }
    ctx.font = font(min); return min;
  }
};
SKIN_TPL.sport.shareCard = (e) => {
  const { C, F } = _spCv, [cv, ctx] = _spCv.canvas();
  ctx.textAlign = 'left';
  // 1. 刊头:日期小标签 + 大标题
  ctx.fillStyle = C.faint; ctx.font = F.num(24); ctx.fillText(fmtDate(e.date), 40, 68);
  ctx.fillStyle = C.ink; ctx.font = F.head(50); ctx.fillText('Cici 健身日记', 40, 126);
  // 2. 三格:训练时间 / 完成动作(白卡大数字),运动心境(荧光绿底)
  const tw = (520 - 24) / 3, ty = 150, th = 120;
  [['训练时间', String(e.duration || 0), '分钟'], ['完成动作', String(e.exerciseCount || (e.exercises || []).length), '个']].forEach(([lbl, v, u], i) => {
    const x = 40 + i * (tw + 12);
    _spCv.box(ctx, x, ty, tw, th, 22, C.card);
    ctx.fillStyle = C.faint; ctx.font = F.cjk(17); ctx.fillText(lbl, x + 18, ty + 32);
    ctx.fillStyle = C.ink; _spCv.fit(ctx, F.num, v, tw - 76, 64, 30); ctx.fillText(v, x + 16, ty + 98);
    const vw = ctx.measureText(v).width; ctx.fillStyle = C.muted; ctx.font = F.cjk(18); ctx.fillText(u, x + 16 + vw + 6, ty + 98);
  });
  {
    const x = 40 + 2 * (tw + 12), mood = e.mood || '一般';
    _spCv.box(ctx, x, ty, tw, th, 22, C.neon);
    ctx.fillStyle = C.neonMuted; ctx.font = F.cjk(17); ctx.fillText('运动心境', x + 18, ty + 32);
    ctx.fillStyle = C.ink; _spCv.fit(ctx, F.head, mood, tw - 36, 34, 18);
    ctx.fillText(_spCv.lines(ctx, mood, tw - 36, 1)[0], x + 18, ty + (e.rpe ? 76 : 86));
    if (e.rpe) { ctx.fillStyle = C.neonMuted; ctx.font = F.num(22); ctx.fillText(`RPE ${e.rpe}`, x + 18, ty + 104); }
  }
  // 3. 今日训练内容(白卡):私密动作照纸墨一样过滤掉
  const pv = (typeof _PRIVATE_POOL !== 'undefined') ? new Set([..._PRIVATE_POOL, ...OWNER_ONLY_MOVES]) : new Set();
  const list = (e.exercises || []).filter(x => !pv.has(x.name)), limit = 8, more = list.length - limit;
  ctx.font = F.cjk(17);
  const note = e.note ? _spCv.lines(ctx, `“ ${e.note} ”`, 520 - 72, 2) : [];
  const cy = 290, rowH = 34, bodyH = 64 + Math.min(list.length, limit) * rowH + (more > 0 ? rowH : 0) + (note.length ? 14 + note.length * 26 : 0);
  _spCv.box(ctx, 40, cy, 520, Math.max(bodyH + 18, 96), 28, C.card);
  ctx.fillStyle = C.ink; ctx.font = F.cjkB(22); ctx.fillText('今日训练内容', 64, cy + 46);
  let y = cy + 46 + 44;
  list.slice(0, limit).forEach((x, i) => {
    if (i) { ctx.fillStyle = C.line; ctx.fillRect(64, y - 24, 472, 1.5); }
    const det = `${x.weight ? `${x.weight}kg ` : ''}${x.sets}组 × ${x.reps}${x.unit || '次'}`;
    ctx.font = F.lbl(20); const dw = ctx.measureText(det).width;
    ctx.textAlign = 'right'; ctx.fillStyle = C.muted; ctx.fillText(det, 536, y);
    ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.font = F.cjk(19); ctx.fillText(_spCv.lines(ctx, x.name, 472 - dw - 16, 1)[0] || '', 64, y);
    y += rowH;
  });
  if (more > 0) { ctx.fillStyle = C.faint; ctx.font = F.body(16); ctx.fillText(`... 还有其他 ${more} 个动作已打卡`, 64, y); y += rowH; }
  if (note.length) {
    y += 6;
    ctx.fillStyle = C.ink; ctx.fillRect(64, y - 20, 4, note.length * 26 + 2);
    ctx.fillStyle = C.muted; ctx.font = F.cjk(17); note.forEach((l, i) => ctx.fillText(l, 80, y + i * 26));
  }
  // 4. 底部:每日一句(和纸墨同一组、同一个取法)+ 落款 + 荧光绿底印记
  const quotes = [
    "每一个缓缓落下的重量，都是对身体的温柔致敬。",
    "在缓慢而笃定的重复中，感受肌肉与呼吸的宁静。",
    "水流抚平喧嚣，重力沉淀心绪。",
    "慢慢来，最适合你的节奏，就是最好的进度。",
    "身体记得你流下的每一滴汗，和每一次平稳的呼吸。"
  ];
  const ds = e.date || '2026-05-29';
  let hash = 0; for (let i = 0; i < ds.length; i++) hash += ds.charCodeAt(i);
  ctx.fillStyle = C.muted; ctx.font = F.cjk(17);
  _spCv.lines(ctx, quotes[hash % quotes.length], 410, 2).forEach((l, i) => ctx.fillText(l, 40, 786 + i * 24));
  ctx.fillStyle = C.faint; ctx.font = F.lbl(16); ctx.fillText('CICI FITNESS APP', 40, 830);
  const seal = (S.sealChar && S.sealChar.trim()) ? S.sealChar.trim() : (S.displayName && S.displayName.trim()) ? S.displayName.trim() : (typeof _user !== 'undefined' && _user && _user.displayName) ? _user.displayName.split(' ')[0] : '健身';
  _spCv.box(ctx, 480, 754, 80, 80, 20, C.neon);
  ctx.textAlign = 'center'; ctx.fillStyle = C.ink; _spCv.fit(ctx, F.head, seal, 64, 30, 12);
  ctx.fillText(_spCv.lines(ctx, seal, 64, 1)[0], 520, 796);
  ctx.fillStyle = C.neonMuted; ctx.font = F.cjk(13); ctx.fillText('印记', 520, 820);
  return cv.toDataURL('image/png');
};
SKIN_TPL.sport.achCard = ({ type, idx }) => {
  const { C, F } = _spCv, [cv, ctx] = _spCv.canvas();
  const ms = (type === 'gym' ? GYM_MILESTONES : SWIM_MILESTONES)[idx], L = type === 'gym' ? GYM_LOG : SWIM_LOG;
  const on = L.count >= ms.count, hit = (L.milestones || []).find(m => m.count === ms.count);
  // 1. 标题
  ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.font = F.head(48); ctx.fillText('Cici 健身成就勋章', 40, 104);
  // 2. 白卡:中间大圆(解锁 = 荧光绿底,没解锁 = 灰底 + 一圈进度),圆里是这枚勋章要的次数
  _spCv.box(ctx, 40, 140, 520, 580, 32, C.card);
  const cx = 300, cy = 352, r = 124;
  ctx.fillStyle = on ? C.neon : C.track; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (!on) {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.arc(cx, cy, r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, L.count / ms.count)); ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.fillStyle = on ? C.ink : C.muted; ctx.font = F.num(128); ctx.fillText(String(ms.count), cx, cy + 34);
  ctx.fillStyle = on ? C.neonMuted : C.faint; ctx.font = F.cjk(24); ctx.fillText('次', cx, cy + 78);
  // 3. 状态胶囊:解锁 = 墨底荧光绿字;没解锁 = 细边灰字
  const st = on ? `已解锁 · ${hit ? hit.date : '未解锁'}` : `尚未解锁 (${L.count}/${ms.count})`;
  ctx.font = F.num(22); const sw = ctx.measureText(st).width + 48;
  if (on) _spCv.box(ctx, cx - sw / 2, 508, sw, 48, 24, C.ink);
  else { _spCv.box(ctx, cx - sw / 2, 508, sw, 48, 24, C.line); _spCv.box(ctx, cx - sw / 2 + 2, 510, sw - 4, 44, 22, C.card); }
  ctx.fillStyle = on ? C.neon : C.muted; ctx.fillText(st, cx, 540);
  // 4. 名字 + 说明
  ctx.fillStyle = C.ink; _spCv.fit(ctx, F.head, ms.title, 460, 50, 28); ctx.fillText(ms.title, cx, 622);
  ctx.fillStyle = C.muted; ctx.font = F.body(22);
  _spCv.lines(ctx, ms.desc, 440, 2).forEach((l, i) => ctx.fillText(l, cx, 670 + i * 30));
  // 5. 落款
  ctx.textAlign = 'left'; ctx.fillStyle = C.faint; ctx.font = F.lbl(18); ctx.fillText('CICI FITNESS · 极简专业健身助理', 40, 790);
  return cv.toDataURL('image/png');
};
// —— 30 记录 · 写在这行上面 ——

// ══ 40 教练 ═════════════════════════════════════════════════════════════
// coach.js 里包了 skinTpl 的块:coachOut(未登录)/ coachAccess(邀请制、账号不符)/ coachMain(已开通:认器械入口 + 对话框)/
// coachChat(对话气泡)/ coachProp(对话里的提议卡)。id、onclick、data-pid 都和纸墨一样;输入条 #composer 结构不变,只在 CSS 里换样子。
const _spCoI = {
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  cam: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  photo: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
  next: 'M9 6l6 6-6 6'
};
// 门:未登录 / 邀请制 —— 白卡,小标签 + 大标题 + 灰字说明
SKIN_TPL.sport.coachOut = () => `<div class="psec co-card co-empty sp-co-gate">`
  + `<span class="sp-co-eyebrow">AI 教练 · 未登录</span>`
  + `<div class="sp-co-big">登录后就能用 AI 教练</div>`
  + `<div class="sp-co-sub">复盘、排计划、认器械、随时问。</div>`
  + `<button class="btn-outline" onclick="openLoginModal()">去「我」登录</button></div>`;
SKIN_TPL.sport.coachAccess = ({ mis }) => `<div class="psec co-card sp-co-gate" id="co-access">`
  + `<div class="sp-co-gate-h"><span class="sp-co-lock">${SP.icon(_spCoI.lock, 18)}</span><span class="sp-co-eyebrow">AI 教练 · ${mis ? '用不了' : '邀请制'}</span></div>`
  + (mis ? `<div class="sp-co-big">这个邮箱已经绑定了另一个账号，AI 教练用不了</div><div class="sp-co-sub">换回第一次用的登录方式试试。</div>`
    : `<div class="sp-co-big">AI 教练每次调用都要花钱，现在只对受邀的朋友开放</div>`
    + `<div class="sp-co-sub">有邀请码的话填在下面；没有也没关系，计划、打卡、统计、换动作这些照常能用。</div>`
    + `<input id="co-code" class="line-input code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="邀请码 · ABCDE-FGHJK" aria-label="邀请码" onkeydown="if(event.key==='Enter')coachRedeem()">`
    + `<button class="btn-primary" id="co-code-go" onclick="coachRedeem()">开通</button><span class="foot-note">邀请码用一次就作废，两周内有效。</span>`)
  + `</div>`;
// 已开通:顶上认器械入口(荧光绿图标块 + 说明 + 箭头),下面是对话(气泡直接排在页面上,不再套卡片)
SKIN_TPL.sport.coachMain = () => `<div class="co-card co-entry sp-co-vision" id="co-vision">`
  + `<label class="row-btn sp-co-vrow"><span class="sp-co-vic">${SP.icon(_spCoI.cam, 20, 2)}</span><span><span class="rk">拍器械认动作</span><span class="rv">在健身房拍一张器械，告诉你用它能做动作库里的哪些动作，可以直接加到今天</span></span><span class="ra">${SP.icon(_spCoI.next, 16)}</span><input type="file" accept="image/*" capture="environment" onchange="coachVision(this)" aria-label="拍器械认动作"></label>`
  + `<div id="co-vision-body"></div></div>`
  + `<div class="co-card sp-co-chat" id="co-chat">`
  + `<div class="sec-head sp-co-chat-h"><span class="sec-label">对话</span><button class="link-btn" onclick="coachNewChat()">新对话</button></div>`
  + `<div id="co-chat-log" class="co-chat-log" aria-live="polite"></div>`
  + `<div class="co-foot">对话只存在这台手机上 · <span id="co-status" class="co-meta">连接中…</span></div></div>`;
// 对话气泡:我 = 右边墨底(深色 = 荧光绿底),教练 = 左边荧光绿小头像 + 白卡气泡;提议卡和花费跟在教练那条下面
SKIN_TPL.sport.coachChat = ({ chat, streaming }) => {
  const av = `<span class="sp-co-av" aria-hidden="true">${SP.icon(SP.I.chat, 17)}</span>`;
  const coach = (t, inner) => `<div class="co-msg assistant sp-msg-co">${av}<div class="sp-msg-col"><span class="who">教练${t ? ' · ' + t : ''}</span>${inner}</div></div>`;
  if (!chat.length) return `<div class="sp-co-empty"><span class="sp-co-eyebrow">比如</span>`
    + ['我深蹲总是膝盖往里扣怎么办', '这周只能练两次，怎么安排', '今天很累还要练吗'].map(q => `<span class="sp-co-ex">「${q}」</span>`).join('') + `</div>`;
  return chat.map(m => m.role === 'assistant'
    ? coach(m.at ? _coachHM(m.at) : '', `<div class="co-text sp-bub">${_coachMd(m.text)}</div>${m.action ? _coachActHtml(m.action) : ''}${m.proposal ? _coachPropHtml(m.proposal) : ''}${m.mem ? _coachMemNoteHtml(m.mem) : ''}${m.meta ? _coachCostLine(m.meta) : ''}`)
    : `<div class="co-msg user sp-msg-me"><span class="who">你${m.at ? ' · ' + _coachHM(m.at) : ''}</span>`
    + (m.img ? `<span class="sp-co-img">${SP.icon(_spCoI.photo, 16, 2)}图片</span>` : '')
    + `<div class="co-text sp-bub">${SP.esc(m.text).replace(/\n/g, '<br>')}</div></div>`).join('')
    + (streaming ? coach('', `<div class="co-text sp-bub" id="co-stream"><span class="co-meta">思考中…</span></div>`) : '');
};
// 提议卡:墨色粗边白卡;「提议」荧光绿小签;采纳 2 : 不要 1;采纳后荧光绿条 + 撤销;不要之后一行灰字 + 「再看看」(回到待定)
// rows 是纸墨那版拼好的 <span class="d">哪天</span><span class="c">改什么</span>,结构够用,样子在 CSS 里换
SKIN_TPL.sport.coachProp = ({ p, open, okN, rows, drop }) => {
  let foot = '';
  if (open) foot = `<div class="co-prop-btns"><button type="button" class="btn-primary" onclick="coachPropAct(this,'apply')"${okN ? '' : ' disabled'}>采纳</button><button type="button" class="btn-line" onclick="coachPropAct(this,'reject')">不要</button></div>`;
  else if (p.state === 'applied') foot = `<div class="sp-prop-done">${SP.tick(18, 2.8)}<span>已写进计划${okN < p.changes.length ? ` · ${p.changes.length - okN} 条没改` : ''}</span>`
    + (p.snap ? `<button type="button" class="link-btn u" onclick="coachPropAct(this,'undo')">撤销</button>` : '') + `</div>`;
  else if (p.state === 'rejected') foot = `<div class="sp-prop-no"><span class="co-prop-st sp-prop-st">没改，计划照旧。</span><button type="button" class="link-btn" onclick="coachPropAct(this,'reopen')">再看看</button></div>`;
  else if (p.state === 'undone') foot = `<div class="co-prop-st sp-prop-st">已撤销 · 计划回到采纳前</div>`;
  return `<div class="co-prop sp-prop" data-pid="${SP.esc(p.id)}"><div class="co-prop-h"><span class="sp-prop-tag">提议</span><span class="sp-prop-t">${okN} 处改动</span></div>`
    + `<div class="co-prop-list">${rows}</div>`
    + (drop.length ? `<div class="co-meta">还提到 ${drop.length} 个不在你动作库里的动作，已去掉：${SP.esc(drop.join('、'))}</div>` : '')
    + foot + `</div>`;
};
// 小改卡(对话里 / 陪练面板里都用):已经执行了,所以不是「采纳 / 不要」而是荧光绿小签「已改」+ 一条条带勾 + 撤销胶囊
// rows 是纸墨那版拼好的 <li>(没改成的划线 + 原因),结构够用,样子在 CSS 里换(40 区 .sp-act)
_spCoI.mem = 'M7 4h10v16l-5-4-5 4z';
SKIN_TPL.sport.coachAct = ({ a, okN, rows, drop }) => {
  const tag = a.state === 'applied' ? '已改' : a.state === 'undone' ? '已撤销' : '没改成';
  const t = a.state === 'applied' ? `今天 · ${okN} 处` : a.state === 'undone' ? '今天的训练回到改之前' : '这次一条都没改';
  return `<div class="co-act sp-act${a.state === 'applied' ? '' : ' off'}" data-aid="${SP.esc(a.id)}"><div class="sp-act-h"><span class="sp-act-tag">${tag}</span><span class="sp-act-t">${t}</span></div>`
    + `<ul class="co-act-list sp-act-list">${rows}</ul>`
    + (drop.length ? `<div class="co-meta">还提到 ${drop.length} 个不在你今天计划或动作库里的：${SP.esc(drop.join('、'))}</div>` : '')
    + (a.undoErr ? `<div class="co-meta co-err">${SP.esc(a.undoErr)}</div>` : '')
    + (a.state === 'applied' && a.snap ? `<button type="button" class="link-btn sp-act-undo" onclick="coachActUndo(this)">${SP.icon(SP.I.swap, 16)}撤销</button>` : '')
    + `</div>`;
};
// 记住 / 忘掉了什么:书签小图标 + 一行字 + 「看看」(去「我 → 05」)
SKIN_TPL.sport.coachMemNote = ({ parts }) => `<div class="co-memnote sp-memnote"><span class="sp-memnote-ic">${SP.icon(_spCoI.mem, 15)}</span><span class="sp-memnote-t">${parts.map(SP.esc).join(' · ')}</span>`
  + `<button type="button" class="link-btn sp-memnote-go" onclick="showTab('me')">看看</button></div>`;
// 刊头右边小胶囊:已开通 = 当前模型,未开通 = 邀请制,未登录 = 未登录
SKIN_TPL.sport.mh_coach = () => {
  const a = typeof coachAccess === 'function' ? coachAccess() : 'out';
  let t = a === 'none' ? '邀请制' : '未登录';
  if (a === 'on') { const l = typeof coachModelLabel === 'function' ? coachModelLabel() : ''; t = !l || l === 'Auto' ? '自动' : l; }
  return { aside: SKIN_TPL.sport.mhChip(t) };
};
// —— 40 教练 · 写在这行上面 ——

// ══ 50 我 + 新手设置 ═══════════════════════════════════════════════════
// ui.js 里包了 skinTpl 的块:meAcct(01 账号)/ meData(06 数据)/ oobe0、oobe5(新手设置第 0 步和最后一步)/ oobeFrame(新手设置的头、进度、底部按钮);
// coach.js 里:meAIOff / meAIOn(05 AI 教练)。02 外观(skin.js 画好的分段)、03 搭子、04 提醒、07 恢复出厂、版本号只在 CSS 里换样子。
// 第 1–4 步的控件和计划页是同一套(uiChips / uiSeg / uiStepper / uiToggle),也只换样子。
const _spMeI = {
  next: 'M9 6l6 6-6 6',
  down: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  up: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  snap: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v4l3 2',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  home: 'M5 4h14v16H5zM12 9v6M9 12h6',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z'
};
// 01 账号:荧光绿印章块 + 名字 + 登录方式 / 同步状态;显示名、印章字两格并排;没登录时下面是登录表单
SKIN_TPL.sport.meAcct = ({ u, how, gName, name, seal }) => {
  const head = `<div class="id-line sp-id"><span class="seal" id="user-seal">${uiEsc(seal)}</span><div class="sp-id-t"><h2 id="user-name">${uiEsc(name ? `${name}的计划` : '我的健身计划')}</h2>`
    + (u ? `<span class="sp-id-sub">${how} · ${uiEsc(u.email || '已登录')}</span><span class="sp-id-sub"><span id="sync-pill" class="auth-pill-sync ok">云端已同步</span></span>` : '')
    + `</div></div>`;
  const fields = `<div class="sp-me-fields"><label class="sp-field"><span class="sub-label">显示名</span><input id="me-name" class="line-input" value="${uiEsc(S.displayName || '')}" placeholder="${uiEsc(u ? (gName || '起个名字') : '起个名字')}" autocomplete="nickname" onchange="uiSaveProfile()"></label>`
    + `<label class="sp-field"><span class="sub-label">印章字</span><input id="me-seal" class="line-input" value="${uiEsc(S.sealChar || '')}" placeholder="留空取名字首字" maxlength="2" onchange="uiSaveProfile()"></label></div>`;
  if (u) return uiSecLabel('01 — 账号') + head + fields
    + `<button type="button" class="btn-line" style="align-self:flex-start" onclick="signOutUser()">登出</button>`;
  return uiSecLabel('01 — 账号') + head + fields
    + `<div class="sp-me-login"><span class="sp-me-h">登录 / 注册</span>`
    + `<span class="hint">不登录也能用，数据只存在这台手机上；登录后多设备同步，也能用搭子和 AI 教练。</span>`
    + `<input id="login-email" class="line-input" type="email" autocomplete="username" placeholder="邮箱" aria-label="邮箱">`
    + `<input id="login-pass" class="line-input" type="password" autocomplete="current-password" placeholder="密码（至少 6 位）" aria-label="密码" onkeydown="if(event.key==='Enter')signInEmail()">`
    + `<div id="login-msg" class="note-line sp-err" role="alert"></div>`
    + `<div class="btn-row"><button type="button" class="btn-primary" onclick="signInEmail()">登录</button><button type="button" class="btn-outline" onclick="signUpEmail()">注册</button></div>`
    + `<button type="button" class="btn-line" onclick="signInGoogle()">用 Google 登录（限 Safari）</button></div>`;
};
// 05 AI 教练:没开通 = 一行带箭头的按钮(去教练页);开通了 = 模型单选(圆圈)+ 思考深度分段 + 两格花费
SKIN_TPL.sport.meAIOff = (a) => `<button type="button" class="row-btn sp-me-go" onclick="showTab('coach')"><span>${a === 'none' ? '邀请制 · 有邀请码去「教练」页填' : '登录后可用'}</span><span class="ra">${SP.icon(SP.I.arrow, 16, 2.4)}</span></button>`;
SKIN_TPL.sport.meAIOn = ({ me, o, models, efforts, effCur }) => `<span class="sub-label">模型</span>`
  + `<div class="sp-models" data-group="model" role="radiogroup" aria-label="模型">${models.map(([k, n, note]) => {
    const on = (o.model || '') === k;
    return `<button type="button" class="model-row" role="radio" aria-checked="${on}" data-v="${SP.esc(k)}"><span class="sp-radio" aria-hidden="true"></span><span>${SP.esc(n)}</span><span class="note">${SP.esc(note || '')}</span></button>`;
  }).join('')}</div>`
  + `<span class="sub-label">${o.model ? '思考深度' : '思考深度 · 选「自动」时按任务定'}</span>`
  + `<div${o.model ? '' : ' class="sp-dim"'}>${uiSeg('co-effort', 'effort', efforts.map(([k, n]) => [k, n]), effCur, { label: '思考深度', disabled: o.model ? {} : Object.fromEntries(efforts.map(([k]) => [k, true])) })}</div>`
  + `<div class="sp-me-stats"><div><span class="sub-label">本月已用</span><b>$${Number(me.cycle || 0).toFixed(2)}</b></div>`
  + `<div><span class="sub-label">今天</span><b>$${Number(me.today || 0).toFixed(2)}</b>${me.daily_cap ? `<small>上限 $${Number(me.daily_cap).toFixed(2)}</small>` : ''}</div></div>`
  + `<span class="foot-note">额度：每天有上限；每月 17 号重置</span>`;
// 05 里「教练记住的事」:白卡里一行一条(字 + 日期),右边「删掉」胶囊;底下红框「全部清空」
SKIN_TPL.sport.meAIMem = ({ mem }) => `<div class="co-mem sp-mem" id="co-mem"><span class="sub-label">教练记住的事</span>`
  + (mem.loading ? `<span class="note-line" role="status">读取中…</span>`
    : mem.err ? `<span class="note-line co-err">${SP.esc(mem.err)}</span><button type="button" class="link-btn sp-mem-retry" onclick="coachMemLoad(true)">再试一次</button>`
      : !mem.items.length ? `<div class="sp-mem-empty">还没有。在对话里跟教练说「记住……」，伤病、偏好、目标这些它会记下，开新对话也不忘。</div>`
        : `<div class="co-memlist sp-mem-list">${mem.items.map(x => `<div class="co-mem-row"><span class="t">${SP.esc(x.text)}<small>${SP.esc(String(x.at || '').slice(5, 10).replace('-', '/'))}${x.src === 'quick' ? ' · 陪练' : ''}</small></span><button type="button" class="link-btn sp-mem-del" data-id="${SP.esc(x.id)}" onclick="coachMemDelete(this.dataset.id)" aria-label="删掉：${SP.esc(x.text)}">删掉</button></div>`).join('')}</div>`
        + `<button type="button" class="btn-line sp-mem-clear" onclick="coachMemClear()">全部清空</button>`)
  + `<span class="foot-note">记在家里的服务器上，只给你自己的教练看；私密内容不会记。</span></div>`;
// 06 数据:每行左边一个小图标块,右边箭头
SKIN_TPL.sport.meData = () => {
  const inner = (k, v, ic) => `<span class="sp-me-ic">${SP.icon(ic, 16)}</span><span><span class="rk">${k}</span><span class="rv">${v}</span></span><span class="ra">${SP.icon(_spMeI.next, 16)}</span>`;
  const row = (k, v, ic, attrs) => `<button type="button" class="row-btn sp-me-row" ${attrs}>${inner(k, v, ic)}</button>`;
  return uiSecLabel('06 — 数据')
    + row('备份 JSON', '下载全部数据', _spMeI.down, 'onclick="exportJSON()"')
    + `<label class="row-btn sp-me-row">${inner('导入', '从备份 JSON 恢复', _spMeI.up)}<input type="file" accept=".json,application/json" onchange="importJSON(this)" aria-label="从备份 JSON 恢复"></label>`
    + row('导出 CSV', '打卡记录表格', _spMeI.table, 'onclick="exportCSV()"')
    + row('恢复快照', '从自动快照里挑一份回滚', _spMeI.snap, 'onclick="showSnapshotRestore()"')
    + row('AI 分析导出', '复制一份给别的 AI 看', _spMeI.copy, 'onclick="exportForAI()"');
};
// 刊头右边小胶囊:登录了 = 已同步,没登录 = 未登录
SKIN_TPL.sport.mh_me = () => ({ aside: SKIN_TPL.sport.mhChip(typeof _uiUser === 'function' && _uiUser() ? '已同步' : '未登录') });

// 新手设置:顶上步骤标签 + 跳过胶囊,五段进度条,900 大标题;底部 上一步 1 : 下一步 2
SKIN_TPL.sport.oobeFrame = ({ s, first, nextLabel, body }) => `<div class="oobe-head"><div class="oobe-top"><span>新手设置 · ${s <= 0 ? '欢迎' : `${SP.pad2(s)} / 05`}</span>`
  + `<button type="button" class="link-btn" onclick="uiOobeSkip()">${first ? '跳过，用默认' : '关闭'}</button></div>`
  + `<div class="oobe-bar sp-ob-bar" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => `<i${i <= s ? ' class="on"' : ''}></i>`).join('')}</div>`
  + `<h2 class="oobe-title" id="oobe-title">${UI_OOBE_TITLES[s]}<span class="mh-dot">.</span></h2>`
  + (s === 0 ? `<p class="sp-ob-sub">一分钟，定四件事。这里的每个开关，之后都在「计划」页里，一模一样，随时能改。</p>` : '') + `</div>`
  + `<div class="oobe-body">${body}</div>`
  + `<div class="oobe-foot"><button type="button" class="btn-line" onclick="uiOobeBack()" style="visibility:${s > 0 ? 'visible' : 'hidden'}">上一步</button>`
  + `<button type="button" class="btn-primary" onclick="uiOobeNext()">${nextLabel}</button></div>`;
// 第 0 步:荧光绿四格卡(定哪四件事)+ 风格分段(skin.js)+ 从备份恢复 / 登录同步两行
SKIN_TPL.sport.oobe0 = () => `<div class="sp-ob-four">${[['01', '练什么'], ['02', '多久练一次'], ['03', '手边有什么器械'], ['04', '身体有没有要注意的']].map(([n, t]) => `<span><b>${n}</b>${t}</span>`).join('')}</div>`
  + (typeof skinPickHtml === 'function' ? skinPickHtml() : '')
  + `<div class="sp-ob-rows">`
  + `<label class="row-btn"><span><span class="rk">从备份恢复</span><span class="rv">选之前导出的 JSON，直接回到原来的计划和记录</span></span><span class="ra">${SP.icon(_spMeI.next, 16)}</span><input type="file" accept=".json,application/json" onchange="uiOobeImport(this)" aria-label="从备份恢复"></label>`
  + `<button type="button" class="row-btn" onclick="uiOobeLogin()"><span><span class="rk">已有账号，登录同步</span><span class="rv">云端有数据就直接拉下来，不用再设一遍</span></span><span class="ra">${SP.icon(_spMeI.next, 16)}</span></button></div>`;
// 最后一步:设置摘要白卡(一行一项)+ 装到主屏幕 / 同步两条说明
SKIN_TPL.sport.oobe5 = (rows) => `<div class="kv sp-ob-sum">${rows.map(([k, v]) => `<span class="k">${k}</span><span>${uiEsc(v)}</span>`).join('')}</div>`
  + `<div class="sp-ob-tips">`
  + `<span class="sp-me-ic">${SP.icon(_spMeI.home, 16)}</span><span><b>装到主屏幕</b><span>Safari 右下角 ••• → 分享 → 添加到主屏幕。离线也能打开，计时提醒更稳。</span></span>`
  + `<span class="sp-me-ic">${SP.icon(_spMeI.cloud, 16)}</span><span><b>同步</b><span>不登录也能用，数据只在这台手机上；想换手机不丢，去「我」登录。</span></span></div>`;
// —— 50 我 + 新手设置 · 写在这行上面 ——

// ══ 60 弹窗内容(换动作 / 加动作 / 打卡 / 动作详情 / 引导训练 / 历史 / 分享 / 成就) ═══
// 样稿:换 / 划掉 971–1022、加一个动作 1022–1055、打卡 1055–1103、引导训练用今天页「下一项」焦点卡 146–219。
// 每个模板拿到的 ctx 就是纸墨那版用的同一份数据;按钮调的函数、参数、id、data-* 和纸墨一样。
// 动作名 / 说明照纸墨原样插(库里的字),用户能改的字(训练类型、原因)转义。
const _sp6 = {
  // 规格「3×12 · 20 kg」:按次不写单位,秒 / 分钟写上
  spec: (sets, reps, unit, kg) => {
    const u = !unit || unit === '次' ? '' : unit;
    const a = [];
    if (sets && reps) a.push(`${sets}×${reps}${u}`); else if (sets) a.push(`${sets} 组`); else if (reps) a.push(`${reps}${u || ' 次'}`);
    if (kg) a.push(`${kg} kg`);
    return a.join(' · ');
  },
  // 难度:三格小条(读屏念「难度 N」)
  diff: d => {
    d = d || 1;
    return `<span class="sp-sh-diff" aria-hidden="true">${[1, 2, 3].map(i => `<i${i <= d ? ' class="on"' : ''}></i>`).join('')}</span><span class="sp-sh-vh">难度 ${d}</span>`;
  },
  // 面板头:小标签 + 大标题(.sheet-title 给弹窗管理当 aria-labelledby)+ 一行规格
  head: (eb, title, spec) => `<div class="sp-sh-head"><span class="sheet-eyebrow">${eb}</span><div class="sheet-title">${title}</div>${spec ? `<span class="sp-sh-spec">${spec}</span>` : ''}</div>`,
  // 备选卡:整张卡是一个按钮(点了就换 / 加),右边胶囊只是样子
  card: (onclick, name, spec, note, go) => `<button type="button" class="swap-option sp-sh-alt" onclick="${onclick}"><span class="sp-sh-l"><span class="so-n">${name}</span>${spec ? `<span class="so-s">${spec}</span>` : ''}${note ? `<span class="so-note">${note}</span>` : ''}</span><span class="sp-sh-go">${go || '换成这个'}</span></button>`,
  // 紧凑行(白卡里一行一个):加动作的列表、换动作「其他同肌群」展开后
  row: (onclick, name, spec, note, go) => `<button type="button" class="swap-option sp-sh-row" onclick="${onclick}"><span class="sp-sh-l"><span class="so-n">${name}</span>${spec ? `<span class="so-s">${spec}</span>` : ''}${note ? `<span class="so-note">${note}</span>` : ''}</span><span class="sp-sh-go">${go}</span></button>`
};

// —— 换 / 划掉 ——
SKIN_TPL.sport.swapSheet = (c) => {
  const { date, ei, ex, alts, pos, canSwap, aiOn, reason, showAll } = c;
  const unit = ex.unit || '次';
  const w = needsWeightUI(ex) ? getWeight(date, ei) : null;
  const part = (ex.muscle || [])[0] || (ex.isWarmup ? '热身' : ex.isStretch ? '拉伸' : '');
  const eb = [canSwap ? '换掉' : '划掉', canSwap && pos ? SP.pad2(pos) : '', part].filter(Boolean).join(' · ');
  const spec = _sp6.spec(getAdj(date, ei, 's', ex.sets), getAdj(date, ei, 'r', ex.reps), unit, w);
  const altSpec = (alt) => {
    const last = W_HIST[alt.n] ? W_HIST[alt.n][W_HIST[alt.n].length - 1].weight : null;
    return _sp6.spec(ex.sets, _swapReps(ex, alt), alt.u || '次') + (last ? ` · 上次 ${last} kg` : '') + _sp6.diff(alt.diff);
  };
  const pick = (alt) => `doSwap('${date}',${ei},${alts.indexOf(alt)})`;
  let list = '';
  if (!canSwap) list = `<p class="sheet-desc">热身 / 拉伸不换，可以只今天划掉，或者永久排除。</p>`;
  else if (!alts.length) list = `<p class="sheet-desc">没有更多同肌群的备选，可以只今天划掉，或者永久排除。</p>`;
  else {
    const top = alts.slice(0, 3), rest = alts.slice(3);
    list = `<div class="sp-sh-grp">同肌群 · 按规则</div>`
      + `<div class="sp-sh-alts">${top.map(a => _sp6.card(pick(a), a.n, altSpec(a), a.note || '')).join('')}</div>`
      + (rest.length && !showAll ? `<button type="button" class="swap-option swap-more sp-sh-more" aria-expanded="false" onclick="swapShowAll()"><span>其他同肌群动作 ${rest.length} 个</span>${SP.icon(SP.I.chev, 16)}</button>` : '')
      + (rest.length && showAll ? `<span class="sub-label">其他同肌群动作</span><div class="sp-sh-rows">${rest.map(a => _sp6.row(pick(a), a.n, altSpec(a), '', '换成这个')).join('')}</div>` : '');
  }
  return `<div class="ex-modal-card sp-sh-card" onclick="event.stopPropagation()">`
    + _sp6.head(eb, _escHtml(ex.name), spec)
    + `<span class="sub-label">为什么换</span>` + uiChips('', 'swapReason', SWAP_REASONS, v => v === reason)
    + (canSwap && aiOn && typeof coachSwapHtml === 'function' ? coachSwapHtml(date, ei) : '')
    + list
    + `<div class="sp-sh-acts"><button class="btn-line sp-sh-strike" onclick="strikeToday('${date}',${ei})">只今天划掉</button><button class="btn-line sp-sh-excl" onclick="excludeFromSheet()">永久排除</button></div>`
    + (aiOn ? `<button type="button" class="link-btn sp-sh-ask" onclick="uiCloseOverlay('swap-modal');coachAskAbout('${_q(ex.name)}','换')">${SP.icon(SP.I.chat, 16)}问教练怎么换</button>` : '')
    + `<button type="button" class="sp-sh-close" onclick="uiCloseOverlay('swap-modal')">关闭</button></div>`;
};
// 动作详情里没有日期时(历史记录、AI 草稿):按名字永久排除
SKIN_TPL.sport.swapSheetByName = (c) => `<div class="ex-modal-card sp-sh-card" onclick="event.stopPropagation()">`
  + _sp6.head('永久排除', _escHtml(c.name))
  + `<span class="sub-label">为什么（选一个，记在排除清单里）</span>` + uiChips('', 'swapReason', SWAP_REASONS, v => v === c.reason)
  + `<p class="sheet-desc">后面的计划、换动作、热身和收尾都会避开它；今天和以后的安排里有它的都会删掉。想恢复去「计划 → 07」。</p>`
  + `<div class="sp-sh-acts one"><button class="btn-line sp-sh-excl" onclick="excludeFromSheet()">永久排除</button></div>`
  + `<button type="button" class="sp-sh-close" onclick="uiCloseOverlay('swap-modal')">取消</button></div>`;
// 面板里的 AI 推荐(coach.js _coachSwapInner):AI 小牌 + 「推荐 · 按『原因』」,结果是同样的备选卡
SKIN_TPL.sport.swapAI = ({ reason, r }) => {
  const head = `<div class="sp-sh-grp"><span class="sp-sh-ai">AI</span><span>推荐${reason ? ` · 按「${SP.esc(reason)}」` : ''}</span></div>`;
  if (!reason) return head + `<p class="note-line">选上面一个原因，教练按原因挑最多 3 个替代。</p>`;
  if (!r || r.state === 'loading') return head + `<p class="note-line" role="status">教练在挑…</p>`;
  if (r.state === 'err') return head + `<p class="note-line co-err">AI 推荐没拿到：${SP.esc(r.error)}</p><button type="button" class="link-btn sp-sh-retry" onclick="coachSwapRetry()">再试一次</button>`;
  const drop = r.dropped && r.dropped.length ? `<span class="co-meta">已去掉 ${r.dropped.length} 个不在你动作库里的</span>` : '';
  if (!r.options.length) return head + `<p class="note-line">教练这次没挑出你现在能做的替代，用下面按规则的。</p>` + drop;
  return head + `<div class="sp-sh-alts">${r.options.map((o, k) => _sp6.card(`coachSwapPick(${k})`, SP.esc(o.name), SP.esc(_sp6.spec(o.sets, o.reps, o.unit, o.kg)), o.why ? SP.esc(o.why) : '')).join('')}</div>` + drop + _coachCostLine(r);
};

// —— 加一个动作 ——
// 肌群 chip 保留 .chip + data-g(renderAddExList 靠它们切选中),运动里画成分段
SKIN_TPL.sport.addExSheet = ({ date, sel, targetGroups, otherGroups, grpNames }) => {
  const chip = g => `<button type="button" class="chip" data-g="${g}" onclick="renderAddExList('${g}')">${grpNames[g] || g}</button>`;
  return `<div class="ex-modal-card sp-sh-card" onclick="event.stopPropagation()">`
    + _sp6.head(`${fmtDate(date)} · ${_escHtml(sel.workoutType || '')}`, '加一个动作')
    + `<span class="sub-label">今天的目标肌群</span>`
    + (targetGroups.length ? `<div class="chips sp-sh-seg" id="add-ex-groups">${targetGroups.map(chip).join('')}</div>` : `<div class="chips" id="add-ex-groups"><span class="note-line">没有特定肌群</span></div>`)
    + `<details class="fold sp-sh-fold"><summary>其他肌群${SP.icon(SP.I.chev, 16)}</summary><div class="chips sp-sh-seg">${otherGroups.map(chip).join('')}</div></details>`
    + `<div id="add-ex-list" class="sp-sh-rows"><div class="note-line">点上面的肌群看可选动作</div></div>`
    + `<button type="button" class="btn-outline sp-sh-done" onclick="uiCloseOverlay('add-ex-modal')">关闭</button></div>`;
};
SKIN_TPL.sport.addExList = ({ groupKey, available }) => available.map((ex, idx) => {
  const spec = [(ex.muscle || []).slice(0, 2).join(' · '), _sp6.spec(3, _repsFor(ex, { sec: 30, min: 10, reps: 12 }), ex.u || '次')].filter(Boolean).join(' · ');
  return _sp6.row(`doAddExercise('${groupKey}', ${idx})`, ex.n, spec + _sp6.diff(ex.diff), ex.note || '', '加入');
}).join('');

// —— 打卡(#rpe-modal 是 index.html 的静态 DOM,样子全在 CSS) ——
// 小标签只写「打卡 · 类型」,完成数 / 总量 / 时长挪到标题下面三块数字。数字块是运动自己插的一个节点,
// 默认行内 display:none(换回纸墨时不出现),运动 CSS 只在带 .sp-on 时显示;编辑旧记录时不显示。
// 第三格:有开练时间就是实际用时(core.js wkElapsedMin,打卡时一起记进这条记录),没有就是计划时长。
SKIN_TPL.sport.rpeEyebrow = ({ el, day, text, elapsed }) => {
  const pl = document.getElementById('rpe-elapsed'); if (pl) pl.remove();   // 纸墨那行「实际用时」(换过风格时可能还留着)
  const title = document.getElementById('rpe-modal-title');
  let box = document.getElementById('sp-rpe-stats');
  if (!box && title) {
    box = document.createElement('div'); box.id = 'sp-rpe-stats'; box.className = 'sp-rpe-stats'; box.style.display = 'none';
    title.insertAdjacentElement('afterend', box);
  }
  if (text || !day) { el.textContent = text || '打卡'; if (box) box.classList.remove('sp-on'); return; }
  el.textContent = `打卡 · ${day.workoutType}`;
  if (!box) return;
  const p = S.prog[day.date] || {}, c = Object.keys(p).filter(k => p[k]).length;
  let vol = 0;
  day.exercises.forEach((ex, i) => {
    if (!p[i] || !needsWeightUI(ex)) return;
    const w = typeof _effWeight === 'function' ? _effWeight(day.date, i, ex) : getWeight(day.date, i);
    if (w > 0) vol += getAdj(day.date, i, 's', ex.sets) * getAdj(day.date, i, 'r', ex.reps) * w;
  });
  const tile = (v, k) => `<div class="sp-rpe-stat"><b>${v}</b><span>${k}</span></div>`;
  box.innerHTML = tile(`${c}/${day.exercises.length}`, '完成动作')
    + tile(vol > 0 ? Math.round(vol).toLocaleString('en-US') : '—', '总量 kg')
    + (elapsed ? tile(elapsed, '用时 min') : tile(day.duration ? day.duration : '—', '时长 min'));
  box.classList.add('sp-on');
};

// —— 动作详情(#ex-modal 静态骨架,下面几块是 showExDetail 填的) ——
SKIN_TPL.sport.exActions = (c) => c.byName
  ? `<button class="btn-line sp-sh-excl full" onclick="closeExDetail();openExcludeByName('${_q(c.name)}')">永久排除这个动作（以后的计划都避开）</button>`
  : c.canSwap
    ? `<button class="btn-line sp-sh-strike" onclick="closeExDetail();swapExercise('${c.d}', ${c.ei})">${SP.icon(SP.I.swap, 16)}换 / 划掉</button><button class="btn-line sp-sh-excl" onclick="closeExDetail();openSwapSheet('${c.d}', ${c.ei})">划掉 / 永久排除</button>`
    : `<button class="btn-line sp-sh-excl full" onclick="closeExDetail();openSwapSheet('${c.d}', ${c.ei})">划掉 / 永久排除</button>`;
// 肌群:一排胶囊(不要「 · 」分隔),下面是肌肉图(renderMuscleDiagram 同一份)
SKIN_TPL.sport.exMuscles = ({ muscles, dispName }) => `<div class="sp-ex-mus">${muscles.map(m => `<span class="jchip">${m}</span>`).join('')}</div>`
  + (typeof renderMuscleDiagram === 'function' ? `<div class="sp-ex-diag">${renderMuscleDiagram(muscles, dispName)}</div>` : '');
// 肌肉图下面的发力要领:方括号小标签换成小牌
SKIN_TPL.sport.exPose = (P) => `<p class="sec-label">${P[0]}</p><div class="ex-tip sp-ex-pose"><span class="sp-ex-tag">${P[1]}</span>${P[2]}</div>`;
// 示范(动图 + 四个站外搜索)+ 力量数据(预计 1RM 大字 + 5 / 10 / 15 次三块)
SKIN_TPL.sport.exStrength = ({ name, gif, e1rm, dq }) => {
  const jump = (href, label, title) => `<a href="${href}" target="_blank" rel="noopener" title="${title}">${label}</a>`;
  const gifBlock = gif ? `<div class="gif-box"><img src="${GIF_BASE}${gif}" alt="${name}演示" crossorigin="anonymous" loading="lazy" onerror="this.parentElement.style.display='none'"><div class="cap">动图示范 · © Gym Visual</div></div>` : '';
  const demo = `<p class="sec-label">示范 · 看怎么做</p>${gifBlock}<div class="demo-links">`
    + jump('https://www.douyin.com/search/' + dq, '抖音', '在抖音搜索该动作演示')
    + jump('https://www.xiaohongshu.com/search_result?keyword=' + dq, '小红书', '在小红书搜索该动作演示')
    + jump('https://search.bilibili.com/all?keyword=' + dq, 'B站', '在B站搜索该动作视频')
    + jump('https://keep.com/', 'Keep', '打开 Keep app（Keep 无关键词搜索链接，需自行搜索）') + `</div>`;
  if (!e1rm) return demo;
  return demo + `<div class="sp-ex-1rm"><div class="sp-ex-1rm-top"><span class="sp-ex-1rm-k">预计 1RM<small>基于你的历史</small></span><span class="sp-ex-1rm-v">≈ ${e1rm}<small>kg</small></span></div>`
    + `<div class="sp-ex-1rm-grid">${[[5, '力量'], [10, '增肌'], [15, '塑形']].map(([n, l]) => `<div><b>${weightForReps(e1rm, n)}<small>kg</small></b><span>${l} · ${n} 次</span></div>`).join('')}</div></div>`;
};
SKIN_TPL.sport.exTips = ({ how, tips }) => how.map(t => `<div class="ex-tip how"><span class="sp-ex-tag">怎么上重量</span>${t}</div>`).join('')
  + tips.map(t => `<div class="ex-tip">${t}</div>`).join('');
SKIN_TPL.sport.exMistakes = (m) => m.length ? `<p class="sec-label sp-ex-warn">常见错误</p>` + m.map(x => `<div class="ex-tip mistake">${x}</div>`).join('') : '';

// —— 引导训练(全屏):今天页「下一项」焦点卡的样子 ——
// 荧光绿大卡:动作名、64px 组×次 / 重量(重量就是输入框,id 仍是 wm-weight)、组点、调整 / 问教练 / 换 胶囊、
// 调整展开 = 黑格组 / 次 / kg(和焦点卡同一套 adj / stepWeight;改完 core.js _wmSync 重画这张卡)、组间倒计时、黑底荧光绿主按钮
SKIN_TPL.sport.guided = (c) => {
  const { date, idx, set, list, ex, simple, sets, reps, needW, lastW, e1rm, curW, dispName, dispNote, timed, running, sideLbl, adjOpen, aiOn, canSwap, unitLbl, kgVal } = c;
  const i = idx;
  const acts = `<div class="sp-f-acts sp-g-acts"><button type="button" class="sp-pill dark${adjOpen ? ' on' : ''}" aria-expanded="${adjOpen}" onclick="wmToggleAdj()">${SP.icon(SP.I.tune, 16)}${adjOpen ? '收起' : '调整'}</button>`
    + (aiOn ? `<button type="button" class="sp-pill" onclick="wmClose();coachAskAbout('${_q(ex.name)}')">问教练</button>` : '')
    + (canSwap ? `<button type="button" class="sp-pill swap-btn" onclick="swapExercise('${date}',${i})">${SP.icon(SP.I.swap, 16)}换 / 划掉</button>`
      : `<button type="button" class="sp-pill" onclick="openSwapSheet('${date}',${i})">划掉</button>`) + `</div>`;
  const tile = (lbl, val, dec, inc, decDis, aDec, aInc) => `<div class="sp-tile stepper"><span class="step-val">${val}</span><span class="step-lbl">${lbl}</span>`
    + `<div class="sp-tile-btns"><button type="button" class="step-btn" onclick="${dec}" aria-label="${aDec}"${decDis ? ' disabled' : ''}>${SP.icon(SP.I.minus, 18, 2.6)}</button>`
    + `<button type="button" class="step-btn" onclick="${inc}" aria-label="${aInc}">${SP.icon(SP.I.plus, 18, 2.6)}</button></div></div>`;
  const tiles = !adjOpen ? '' : `<div class="sp-tiles sp-g-tiles">`
    + (simple ? '' : tile('组', sets, `adj('${date}',${i},'s',-1)`, `adj('${date}',${i},'s',1)`, sets <= 1, '组 减少', '组 增加'))
    + tile(unitLbl + (ex.bi ? ' / 每侧' : ''), reps, `adj('${date}',${i},'r',-1)`, `adj('${date}',${i},'r',1)`, reps <= (ex.unit === '秒' ? 5 : 1), `${unitLbl} 减少`, `${unitLbl} 增加`)
    + (needW ? tile('kg', kgVal, `stepWeight('${date}',${i},-1)`, `stepWeight('${date}',${i},1)`, false, '重量减少', '重量增加') : '') + `</div>`;
  // 组间倒计时:和今天页焦点卡同一个计时器(顶上的计时条),这里只是显示;卡在屏幕上时计时条收起(spGRestTick)
  const rest = `<div class="sp-rest" id="sp-g-rest" hidden><div class="sp-rest-l"><span class="sp-rest-k">组间休息<span id="sp-g-rest-next">${!simple && set > 1 ? ` · 下一组 ${set}/${sets}` : ''}</span></span><span class="sp-rest-t" id="sp-g-rest-t">0:00</span><div class="sp-rest-bar"><i id="sp-g-rest-bar"></i></div></div>`
    + `<div class="sp-rest-r"><button type="button" class="sp-rest-add" onclick="spRestAdd(15);spGRestTick()">+15 s</button><button type="button" class="sp-rest-skip" onclick="stopTimer();spGRestTick()">跳过</button></div></div>`;
  const unit = ex.unit || '次';
  const part = (ex.muscle || []).join(' · ') || (ex.isWarmup ? '热身' : ex.isStretch ? '拉伸' : '');
  const doneLbl = simple ? '完成' : set < sets ? `完成第 ${set} 组` : '完成最后一组';
  const doBtn = (fn, ico, label) => `<button class="btn-primary sp-g-do" onclick="${fn}">${ico}${label}</button>`;
  let main, alt = '', cd = '';
  if (running) {
    cd = `<div class="wm-cd sp-g-cd"><span class="tag">${sideLbl ? sideLbl.trim() + ' · ' : ''}计时中</span><div id="wm-cd" class="cd">${_wmFmt((_wmCd.end - Date.now()) / 1000)}</div><div class="wm-bar"><i id="wm-cd-bar"></i></div></div>`;
    main = doBtn('_wmCdDone()', SP.tick(22, 3), '提前完成');
    alt = `<button class="btn-line sp-wm-alt" onclick="wmCancelCountdown()">取消计时</button>`;
  } else if (timed) {
    main = doBtn('wmStartCountdown()', `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="${SP.I.play}" fill="currentColor"/></svg>`, `开始 ${sideLbl}${reps} ${unit}`);
    alt = `<button class="btn-line sp-wm-alt" onclick="wmDoneSet()">不计时，直接${doneLbl}</button>`;
  } else main = doBtn('wmDoneSet()', SP.tick(22, 3), doneLbl);
  const big = simple ? String(reps) : `${sets}×${reps}`;
  const bigLbl = simple ? (unit === '次' ? '次数' : unit) : `组 × ${unit}${ex.bi ? ' · 每侧' : ''}`;
  const dots = simple ? '' : Array.from({ length: sets }, (_, i) => (i + 1 < set ? '<i class="on"></i>' : i + 1 === set ? '<i class="cur"></i>' : '<i></i>')).join('');
  const meta = needW ? [lastW ? `上次 ${lastW.weight} kg` : '', e1rm ? `1RM≈${e1rm}` : ''].filter(Boolean).join(' · ') : '';
  return `<div class="wm-top"><span class="sheet-eyebrow">引导训练</span><button class="ex-modal-close" onclick="wmClose()" aria-label="关闭引导训练">关闭</button></div>`
    + `<div class="sp-g-card">`
    + `<div class="sp-g-top"><span class="sp-g-tag">动作 ${SP.pad2(idx + 1)} / ${SP.pad2(list.length)}</span>${part ? `<span class="sp-g-part">${part}</span>` : ''}</div>`
    + `<h2 class="wm-name">${dispName}</h2>`
    + `<div class="sp-g-grid${needW ? '' : ' one'}"><div class="sp-g-cell"><span class="sp-g-lbl">${bigLbl}</span><span class="sp-g-big${big.length > 5 ? ' sm' : ''}">${big}</span></div>`
    + (needW ? `<div class="sp-g-cell"><label class="sp-g-lbl" for="wm-weight">重量 KG</label><input id="wm-weight" class="sp-g-kg" type="number" inputmode="decimal" step="0.5" value="${curW || ''}" placeholder="${lastW ? lastW.weight : ''}"></div>` : '')
    + `</div>`
    + (simple ? '' : `<div class="sp-g-sets"><span class="sp-g-dots" aria-hidden="true">${dots}</span><span class="sp-g-line">第 ${set} 组 / 共 ${sets} 组</span></div>`)
    + (meta ? `<div class="sp-g-meta">${meta}</div>` : '')
    + acts + tiles + rest
    + cd + main + `</div>`
    + alt
    + (dispNote ? `<div class="exnote sp-wm-note">${dispNote}</div>` : '')
    + `<div class="wm-nav sp-wm-nav"><button class="btn-line" onclick="wmNav(-1)" aria-label="上一个动作"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>上一个</button>`
    + `<button class="btn-line" onclick="wmNav(1)" aria-label="下一个动作">下一个<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>`
    + `<button class="btn-line sp-wm-end" onclick="wmFinish()">结束训练并打卡</button>`;
};
// 引导卡里的组间倒计时:照今天页 spRestTick 的做法,读同一个计时器(_timerKind / _timerEndTime / _timerTotal),每 250ms 刷一次;
// 显示着的时候收起顶上的计时条(body.sp-rest-vis)。引导关了就停,把计时条的显示交还给今天页
let _spGTick = null;
function _spGOpen() { const m = document.getElementById('workout-modal'); return !!(m && m.classList.contains('open') && document.getElementById('sp-g-rest')); }
function spGRestTick() {
  const box = document.getElementById('sp-g-rest');
  if (!_spGOpen()) { clearInterval(_spGTick); _spGTick = null; document.body.classList.remove('sp-rest-vis'); if (typeof spRestTick === 'function') spRestTick(); return; }
  const bar = document.getElementById('universal-timer');
  const on = !!bar && bar.classList.contains('show') && _timerKind === '组间休息' && _timerEndTime > Date.now();
  box.hidden = !on;
  document.body.classList.toggle('sp-rest-vis', on);
  if (!on) return;
  const left = (_timerEndTime - Date.now()) / 1000;
  document.getElementById('sp-g-rest-t').textContent = _spClock(Math.ceil(left));
  const b = document.getElementById('sp-g-rest-bar'); if (b) b.style.width = Math.max(0, Math.min(100, left / (_timerTotal || 1) * 100)) + '%';
}
SKIN_TPL.sport.after_guided = () => {
  spGRestTick();
  if (!_spGTick && _spGOpen()) _spGTick = setInterval(spGRestTick, 250);
};
// —— 60 弹窗内容 · 写在这行上面 ——

// ══ 99 结束 ═════════════════════════════════════════════════════════════
