// ══ ui.js — 界面组件 / 弹窗管理 / 导航 / 计划页 / 我页 / 新手设置 ════════════
// 先于 core.js 加载;这里的函数都只在调用时才读 S / LOG 等全局,所以加载顺序没关系。
// 控件统一用 data-group + data-v(选项)、data-step(步进)、data-toggle(开关)、data-act(其他动作),
// 由文档上的一个点击监听分发 —— 计划页和新手设置用的是同一套控件和同一份处理逻辑。

// ── 小工具 ──
function uiEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function uiClamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
const UI_CHECK = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>';
function uiBoxSq() { return `<span class="box-sq" aria-hidden="true">${UI_CHECK}</span>`; }
// 自绘勾选框(只有方框,44px 点击区)
function uiBox(on, attrs, label, cls) {
  return `<button type="button" class="box${cls ? ' ' + cls : ''}" role="checkbox" aria-checked="${!!on}" aria-label="${uiEsc(label || '完成')}" ${attrs || ''}>${uiBoxSq()}</button>`;
}
// 文字 + 方框的一整行(「全部做完 ☐」「☐ 提前结束了…」)
function uiBoxRow(on, text, attrs, cls) {
  return `<button type="button" class="boxrow${cls ? ' ' + cls : ''}" role="checkbox" aria-checked="${!!on}" ${attrs || ''}>${uiBoxSq()}<span>${text}</span></button>`;
}
function uiToggleBox(el) { const on = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', String(on)); return on; }
function uiBoxOn(el) { return !!el && (el.checked === true || el.getAttribute('aria-checked') === 'true'); }
function uiSetBox(el, on) { if (el) el.setAttribute('aria-checked', String(!!on)); }

// 多选 chip:opts = [[值, 显示名]]
function uiChips(id, group, opts, isOn) {
  return `<div class="chips"${id ? ` id="${id}"` : ''} data-group="${group}">${opts.map(([v, label]) => {
    const on = !!isOn(v);
    return `<button type="button" class="chip${on ? ' on' : ''}" data-v="${uiEsc(v)}" aria-pressed="${on}">${uiEsc(label || v)}</button>`;
  }).join('')}</div>`;
}
// 分段单选:opts = [[值, 显示名, 小字]];o.disabled = {值:true}
function uiSeg(id, group, opts, cur, o = {}) {
  const tall = o.tall || opts.some(x => x[2]);
  return `<div class="seg${o.light ? ' light' : ''}"${id ? ` id="${id}"` : ''} data-group="${group}" role="radiogroup"${o.label ? ` aria-label="${uiEsc(o.label)}"` : ''} style="--n:${opts.length}">${opts.map(([v, label, sub]) => {
    const on = String(cur) === String(v), dis = !!(o.disabled && o.disabled[v]);
    return `<button type="button" class="seg-btn${on ? ' on' : ''}${tall ? ' tall' : ''}" role="radio" aria-checked="${on}" data-v="${uiEsc(v)}"${dis ? ' aria-disabled="true"' : ''}>${uiEsc(label)}${sub ? `<span class="sub">${uiEsc(sub)}</span>` : ''}</button>`;
  }).join('')}</div>`;
}
// −/+ 步进器
function uiStepper(group, label, val, unit, min, max) {
  return `<div class="stepper" data-stepper="${group}"><span class="step-lbl">${uiEsc(label)}</span>`
    + `<button type="button" class="step-btn" data-group="${group}" data-step="-1" aria-label="${uiEsc(label)} 减少"${val <= min ? ' disabled' : ''}>−</button>`
    + `<span class="step-val" aria-live="polite">${uiEsc(val)} <span class="step-unit">${uiEsc(unit)}</span></span>`
    + `<button type="button" class="step-btn" data-group="${group}" data-step="1" aria-label="${uiEsc(label)} 增加"${val >= max ? ' disabled' : ''}>+</button></div>`;
}
// 开关行:「自动调整训练量 …… [ 开 ]」
function uiToggle(key, label, hint, on, plain, id) {
  return `<button type="button" class="toggle-row${plain ? ' plain' : ''}" role="switch" aria-checked="${!!on}" data-toggle="${key}"${id ? ` id="${id}"` : ''}><span><span class="tl">${uiEsc(label)}</span>${hint ? `<span class="th">${uiEsc(hint)}</span>` : ''}</span><span class="tv">${on ? '[ 开 ]' : '[ 关 ]'}</span></button>`;
}
function uiSecLabel(text) { return `<div class="sec-label">${uiEsc(text)}</div>`; }

// ══ 弹窗管理:所有 .ex-modal-overlay 统一 aria / 焦点 / Esc ═════════════════
// 不管是哪条路径打开的(静态弹窗、动态创建的、dev 控制台、扩展包),只要是 .ex-modal-overlay
// 加上 open,这里就会补 role=dialog / aria-modal、把背景设成 inert、把焦点移进来;
// 关闭时把焦点还给打开前的元素。Esc 关最上面的一层(各弹窗自己的关闭函数,保证清理逻辑照跑)。
const _uiOpenStack = [];
const _uiReturnFocus = new Map();
const _uiOverlayClose = {
  'workout-modal': () => wmClose(),
  'rpe-modal': () => closeRpeModal(),
  'ex-modal': () => closeExDetail(),
  'hist-modal': () => closeHistModal(),
  'share-modal': () => closeShareModal(),
  'achievement-modal': () => closeAchievementModal(),
  'dev-modal': () => closeDevModal(),
  'oobe': () => uiOobeSkip(true),
};
// 扩展包等自建的浮层可以注册进来:Esc 先关它们
const _uiExtraOverlays = [];
function uiRegisterOverlay(el, close, label) {
  if (!el) return;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  if (label) el.setAttribute('aria-label', label);
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  _uiExtraOverlays.push({ el, close: close || (() => el.remove()) });
  setTimeout(() => { try { if (document.contains(el) && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); } catch (e) { } }, 0);
}
function _uiSyncBackground() {
  const app = document.getElementById('app');
  const anyOpen = _uiOpenStack.length > 0 || !document.getElementById('oobe')?.hidden;
  if (app) { app.inert = anyOpen; if (anyOpen) app.setAttribute('aria-hidden', 'true'); else app.removeAttribute('aria-hidden'); }
  document.body.classList.toggle('modal-open', anyOpen);
}
function _uiOnOverlayChange(el) {
  const open = el.classList.contains('open');
  const i = _uiOpenStack.indexOf(el);
  if (open && i < 0) {
    _uiOpenStack.push(el);
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-hidden', 'false');
    const t = el.querySelector('.ex-modal-title, .sheet-title, h2, h3');
    if (t) { if (!t.id) t.id = el.id + '-label'; el.setAttribute('aria-labelledby', t.id); }
    const a = document.activeElement;
    if (a && a !== document.body && !el.contains(a)) _uiReturnFocus.set(el, a);
    setTimeout(() => {
      if (!el.classList.contains('open') || el.contains(document.activeElement)) return;
      const f = el.querySelector('.ex-modal-close, button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      try { (f || el).focus({ preventScroll: true }); } catch (e) { }
    }, 30);
  } else if (!open && i >= 0) {
    _uiOpenStack.splice(i, 1);
    el.setAttribute('aria-hidden', 'true');
    const prev = _uiReturnFocus.get(el); _uiReturnFocus.delete(el);
    if (prev && document.contains(prev)) setTimeout(() => { try { prev.focus({ preventScroll: true }); } catch (e) { } }, 0);
  }
  _uiSyncBackground();
}
(function watchOverlays() {
  const seen = new WeakSet();
  const check = el => { if (el.classList && el.classList.contains('ex-modal-overlay')) { if (!seen.has(el)) { seen.add(el); el.setAttribute('aria-hidden', el.classList.contains('open') ? 'false' : 'true'); if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); } _uiOnOverlayChange(el); } };
  const mo = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'attributes') check(m.target);
      else {
        m.addedNodes.forEach(n => { if (n.nodeType === 1) { check(n); n.querySelectorAll && n.querySelectorAll('.ex-modal-overlay').forEach(check); } });
        m.removedNodes.forEach(n => { if (n.nodeType === 1 && _uiOpenStack.includes(n)) { _uiOpenStack.splice(_uiOpenStack.indexOf(n), 1); _uiSyncBackground(); } });
      }
    }
  });
  const start = () => {
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    document.querySelectorAll('.ex-modal-overlay').forEach(check);
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
function uiCloseTop() {
  for (let i = _uiExtraOverlays.length - 1; i >= 0; i--) {
    const o = _uiExtraOverlays[i];
    if (!document.contains(o.el)) { _uiExtraOverlays.splice(i, 1); continue; }
    _uiExtraOverlays.splice(i, 1);
    try { o.close(); } catch (e) { o.el.remove(); }
    return true;
  }
  const top = _uiOpenStack[_uiOpenStack.length - 1];
  if (top) {
    const fn = _uiOverlayClose[top.id];
    try { if (fn) fn(); else top.classList.remove('open'); } catch (e) { top.classList.remove('open'); }
    return true;
  }
  const ob = document.getElementById('oobe');
  if (ob && !ob.hidden) { uiOobeSkip(true); return true; }
  return false;
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.isComposing) return;
  if (uiCloseTop()) e.preventDefault();
});
// 关掉一个动态弹窗(换动作 / 添加动作 / 快照)
function uiCloseOverlay(id) { const m = document.getElementById(id); if (m) m.classList.remove('open'); }

// ══ 导航 / 刊头 ═══════════════════════════════════════════
const UI_TABS = ['today', 'plan', 'log', 'coach', 'me'];
const UI_TAB_ALIAS = { settings: 'plan', journal: 'log', 'stats-tab': 'log' };
const UI_HEADS = { today: '今天', plan: '计划', log: '记录', coach: '教练', me: '我' };
let uiCurrentTab = 'today';
let _todayNotice = '';
function showTab(id, btn) {
  id = UI_TAB_ALIAS[id] || id;
  if (!UI_TABS.includes(id)) id = 'today';
  const changed = id !== uiCurrentTab;
  uiCurrentTab = id;
  document.querySelectorAll('.panel-tab').forEach(p => { const on = p.id === id; p.classList.toggle('active', on); p.hidden = !on; });
  document.querySelectorAll('.tabbar .tab').forEach(t => { const on = t.dataset.tab === id; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  if (changed) { _todayNotice = ''; window.scrollTo(0, 0); }
  uiUpdateMasthead();
  if (id === 'today' && changed && typeof render === 'function') render();
  if (id === 'plan') uiRenderPlanPage();
  if (id === 'log') { if (typeof renderStats === 'function') renderStats(); if (typeof renderLog === 'function') renderLog(); if (typeof coachRenderReview === 'function') coachRenderReview(); }
  if (id === 'coach' && typeof renderCoach === 'function') renderCoach();
  if (id === 'me') uiRenderMe();
  uiUpdateComposer();
}
// 底部导航键盘:左右方向键在页签间移动(tablist 约定)
document.addEventListener('keydown', e => {
  const t = e.target.closest && e.target.closest('.tabbar .tab');
  if (!t || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const tabs = [...document.querySelectorAll('.tabbar .tab')], i = tabs.indexOf(t);
  const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  n.focus(); showTab(n.dataset.tab, n); e.preventDefault();
});
function uiUpdateComposer() {
  const on = uiCurrentTab === 'coach' && typeof coachAccess === 'function' && coachAccess() === 'on';
  const c = document.getElementById('composer');
  if (c) c.hidden = !on;
  document.body.classList.toggle('has-composer', on);
}
const _UI_DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const _UI_MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function _uiIsoWeek(ds) {
  const d = new Date(ds + 'T12:00:00'); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
function uiUpdateMasthead() {
  const T = typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10);
  const d = new Date(T + 'T12:00:00');
  const dateEl = document.getElementById('mh-date'), eb = document.getElementById('mh-eyebrow'), hl = document.getElementById('mh-headline');
  if (dateEl) dateEl.textContent = `${_UI_DOW_EN[d.getDay()]} ${d.getDate()} ${_UI_MON_EN[d.getMonth()]}`;
  if (hl) hl.textContent = UI_HEADS[uiCurrentTab] || '今天';
  if (!eb) return;
  let t = '';
  try {
    if (uiCurrentTab === 'today') {
      const plan = typeof S !== 'undefined' && S.plan;
      const sel = plan && plan.days.find(x => x.date === (S.selDate || T));
      if (sel) {
        const n = dayDiff(plan.days[0].date, sel.date) + 1;
        t = `Day ${n} / ${sel.isRest ? 'Rest' : sel.isSwimDay ? 'Swim' : 'Gym'}`;
      } else t = 'No plan';
    } else if (uiCurrentTab === 'plan') t = `Week ${_uiIsoWeek(T)}`;
    else if (uiCurrentTab === 'log') { const n = (typeof LOG !== 'undefined' ? LOG : []).filter(l => l.date.startsWith(T.slice(0, 7))).length; t = `${_UI_MON_EN[d.getMonth()]} · ${n} session${n === 1 ? '' : 's'}`; }
    else if (uiCurrentTab === 'coach') t = (typeof coachModelLabel === 'function') ? coachModelLabel() : 'AI';
    else if (uiCurrentTab === 'me') t = 'Settings';
  } catch (e) { }
  eb.textContent = t;
}
function uiNotice(text) { _todayNotice = text || ''; if (uiCurrentTab === 'today' && typeof render === 'function') render(); }

// ══ 控件分发 ═════════════════════════════════════════════
const _uiPlan = { tecno: false };
const _uiGen = { scope: 'all', method: 'rule', span: '7' };
function _uiAfterSetting(stale) {
  if (typeof saveState === 'function') saveState();
  if (typeof flashSaved === 'function') flashSaved();
  if (stale && typeof markPlanStale === 'function') markPlanStale();
  uiRefreshSettings();
}
function uiSetOption(group, v) {
  switch (group) {
    case 'goal':
      if (v === '女性曲线' && hasGoal('女性曲线')) return;   // 女性曲线选中后不能单点取消(沿用旧设置页)
      applyGoalToggle(v);
      if (typeof saveState === 'function') saveState();
      if (typeof applySettingsToUI === 'function') applySettingsToUI();
      if (typeof flashSaved === 'function') flashSaved();
      if (typeof markPlanStale === 'function') markPlanStale();
      return;
    case 'level': S.level = v; return _uiAfterSetting(true);
    case 'wlevel': S.weightLevel = v; _uiAfterSetting(false); if (typeof render === 'function') render(); return;
    case 'rest': S.restDur = +v; return _uiAfterSetting(false);
    case 'equip': S.equip = S.equip.includes(v) ? S.equip.filter(x => x !== v) : [...S.equip, v]; return _uiAfterSetting(true);
    case 'swim': S.swimLevel = v; return _uiAfterSetting(true);
    case 'focus': {
      let f = (S.focus || []).slice();
      if (v === '均衡全身') f = ['均衡全身'];
      else {
        f = f.filter(x => x !== '均衡全身');
        f = f.includes(v) ? f.filter(x => x !== v) : [...f, v];
        if (!f.length) f = ['均衡全身'];
      }
      S.focus = f; return _uiAfterSetting(true);
    }
    case 'partnerDays':
      S.partnerDays = +v || 0;
      if (typeof saveState === 'function') saveState();
      if (typeof flashSaved === 'function') flashSaved();
      if (typeof updatePartnerOverlap === 'function') updatePartnerOverlap();
      uiRenderMePair();
      if (S.plan && typeof render === 'function') render();
      return;
    case 'theme':
      try { localStorage.setItem('fit_theme', v); } catch (e) { }
      if (typeof applyTheme === 'function') applyTheme(v);
      return uiRenderMeLook();
    case 'genScope': _uiGen.scope = v; return uiRenderP8();
    case 'genMethod':
      if (v === 'ai' && !(typeof coachAccess === 'function' && coachAccess() === 'on')) return;
      _uiGen.method = v; return uiRenderP8();
    case 'aiSpan': _uiGen.span = v; return uiRenderP8();
    case 'model': if (typeof coachSetModel === 'function') coachSetModel(v); return uiRenderMeAI();
    case 'effort': if (typeof coachSetEffort === 'function') coachSetEffort(v); return uiRenderMeAI();
    case 'swapReason': if (typeof swapSetReason === 'function') swapSetReason(v); return;
  }
}
function uiStep(group, dir) {
  switch (group) {
    case 'days': S.days = uiClamp((+S.days || 3) + dir, 2, 7); return _uiAfterSetting(true);
    case 'dur': S.dur = uiClamp((+S.dur || 60) + dir * 5, 20, 90); return _uiAfterSetting(true);
    case 'cycleDay': { const len = S.cycleLength || 28; S.cycleDay = uiClamp((S.cycleDay || 1) + dir, 1, len); return _uiAfterSetting(false); }
    case 'cycleLen': { S.cycleLength = uiClamp((S.cycleLength || 28) + dir, 20, 40); S.cycleDay = Math.min(S.cycleDay || 1, S.cycleLength); return _uiAfterSetting(false); }
  }
}
function uiToggleSetting(key) {
  switch (key) {
    case 'autoVol': S.autoVolumeAdjust = !(S.autoVolumeAdjust !== false); return _uiAfterSetting(false);
    case 'cycle': {
      S.cycleEnabled = !(S.cycleEnabled !== false);
      let ch = false; if (!S.cycleEnabled && S.periodMode) { S.periodMode = false; ch = true; }
      _uiAfterSetting(false);
      if (ch && S.plan) { _genStay = true; genPlan(true); }
      return;
    }
    case 'period':
      S.periodMode = !S.periodMode;
      _uiAfterSetting(false);
      if (S.plan) { _genStay = true; genPlan(true); }
      return;
    case 'sound': {
      const on = typeof _soundMuted === 'function' ? _soundMuted() : false;   // 原来是关 → 打开
      try { localStorage.setItem('soundMuted', on ? '0' : '1'); } catch (e) { }
      if (on) { try { playExerciseDoneSound(); } catch (e) { } }
      if (typeof flashSaved === 'function') flashSaved();
      return uiRenderMeRemind();
    }
    case 'notif': {
      const on = typeof _notifMuted === 'function' ? _notifMuted() : false;
      try { localStorage.setItem('notifMuted', on ? '0' : '1'); } catch (e) { }
      if (on && 'Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { } }
      return uiRenderMeRemind();
    }
    case 'tecno': _uiPlan.tecno = !_uiPlan.tecno; return uiRenderP3();
  }
}
// data-act:列表里的按钮(避免把动作名拼进 onclick 字符串)
const UI_ACTS = {
  restore: el => restoreUserExercise(el.dataset.name),
  detail: el => showExDetail(el.dataset.name, el.dataset.date || null, el.dataset.i != null ? +el.dataset.i : null),
  scrollTo: el => { const t = document.getElementById(el.dataset.target); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
};
document.addEventListener('click', e => {
  const t = e.target;
  if (!t || !t.closest) return;
  const act = t.closest('[data-act]');
  if (act && UI_ACTS[act.dataset.act]) { e.preventDefault(); UI_ACTS[act.dataset.act](act); return; }
  const step = t.closest('[data-step]');
  if (step && step.dataset.group) { if (!step.disabled) uiStep(step.dataset.group, +step.dataset.step); return; }
  const tg = t.closest('[data-toggle]');
  if (tg) { uiToggleSetting(tg.dataset.toggle); return; }
  const opt = t.closest('[data-v]');
  const grp = opt && opt.parentElement && opt.parentElement.closest('[data-group]');
  if (opt && grp) { if (opt.getAttribute('aria-disabled') === 'true') return; uiSetOption(grp.dataset.group, opt.dataset.v); }
}, true);   // 捕获阶段:弹窗卡片上有 event.stopPropagation(),冒泡阶段收不到里面的点击

// 设置变了:重画计划页各节、新手设置当前步、「我」里相关的节
function uiRefreshSettings() {
  uiRenderPlanPage();
  if (_oobe.open) uiRenderOobe();
  uiRenderMeLook(); uiRenderMeRemind();
}

// ══ 计划页 ═══════════════════════════════════════════════
const UI_GOALS = [['女性薄肌'], ['臀腿塑形'], ['翘臀美背'], ['女性曲线']];
const UI_FOCUS = [['均衡全身', '均衡全身'], ['上肢'], ['下肢'], ['核心'], ['有氧'], ['游泳'], ['柔韧灵活', '柔韧·体态'], ['上肢紧致'], ['平衡稳定']];
const UI_EQUIP = [['无器材'], ['弹力带'], ['壶铃'], ['哑铃'], ['健身房全套'], ['泳池']];
const UI_SWIM = [['入门', '入门', '水性 + 蛙泳基础'], ['进阶', '进阶', '蛙泳巩固 + 耐力'], ['挑战', '挑战', '+ 自由泳入门']];
function uiGoalNote() {
  if (hasGoal('翘臀美背')) return '臀推顶端挤压优先；美背日强化背阔与体态（圆肩改善）；收腰靠真空吸而非减脂；避免直立划船、耸肩。';
  if (hasGoal('女性曲线')) return '沙漏方向：臀、胯、腿同步堆围度，腰只靠真空吸和平板维持，不做负重侧屈或转体。大腿要练腘绳、内收，不只堆股四。上肢少动以免变宽。蛋白吃够（1.6–2 g/kg）加轻微热量盈余。';
  return '';
}
function uiSwimLine() {
  if (!S.equip.includes('泳池')) return '';
  const sp = (typeof SWIM_SPLIT !== 'undefined' && SWIM_SPLIT[S.days]) || { gym: Math.max(2, S.days - 1), swim: 1 };
  const rest = 7 - S.days;
  return (S.periodMode ? `${sp.gym} 天力量（降负重） + ${sp.swim} 天陆地替代` : `${sp.gym} 天力量 + ${sp.swim} 天游泳`) + (rest > 0 ? ` + ${rest} 天休息` : '');
}
function uiPlanSummaryLine() {
  return `${S.days} 天 × ${S.dur} min · ${(S.equip || []).join(' + ') || '无器材'} · ${(S.goal || '').split('+').join(' + ')}`;
}
const UI_PLAN_INDEX = [['p1', '01 目标'], ['p2', '02 时间'], ['p3', '03 器械'], ['p4', '04 部位'], ['p5', '05 身体'], ['p6', '06 周期'], ['p7', '07 排除'], ['p8', '08 生成']];
function uiRenderPlanSummary() {
  const el = document.getElementById('plan-summary'); if (!el) return;
  let kv = '';
  if (S.plan && S.plan.days && S.plan.days.length) {
    const wd = S.plan.days.filter(d => !d.isRest), done = wd.filter(d => isDone(d)).length;
    const total = wd.reduce((s, d) => s + d.exercises.length, 0);
    const ex = visibleExcludedCount(getExcluded());
    const it = assessPlanIntensity();
    kv = `<div class="kv"><span class="k">计划</span><span>${wd.length} 个训练日 · 已完成 ${done}/${wd.length} · ${total} 个动作</span>`
      + `<span class="k">强度</span><span>${uiEsc(it.status)} <span class="faint">· ${uiEsc(it.desc)}</span></span>`
      + (ex ? `<span class="k">过滤</span><span class="warn-tag">已过滤${ex}个受限动作</span>` : '') + `</div>`;
  } else {
    kv = `<div class="note-line">还没有计划 · 设好下面几项后到「08」生成。</div>`;
  }
  el.innerHTML = `<div class="plan-sum"><div class="note-line"><span class="faint">当前 →</span> ${uiEsc(uiPlanSummaryLine())}<span class="saved-dot" id="saved-dot" aria-hidden="true"></span></div>${kv}
  <nav class="sec-index" aria-label="计划分节">${UI_PLAN_INDEX.map(([id, t]) => `<a href="#${id}" data-act="scrollTo" data-target="${id}">${t}</a>`).join('')}</nav></div>`;
}
function uiRenderPlanPage() {
  const host = document.getElementById('plan-sections'); if (!host || typeof S === 'undefined') return;
  if (!host.dataset.built) {
    host.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8].map(n => `<section class="psec" id="p${n}"></section>`).join('');
    host.dataset.built = '1';
  }
  uiRenderPlanSummary();
  uiRenderP1(); uiRenderP2(); uiRenderP3(); uiRenderP4(); uiRenderP5(); uiRenderP6();
  if (typeof renderExcludedList === 'function') renderExcludedList(); else uiRenderP7();
  uiRenderP8();
  if (typeof updateStaleBar === 'function') updateStaleBar();
}
function _uiP1Html(pfx) {
  const note = uiGoalNote();
  return `<span class="sub-label">目标 · 可多选</span>${uiChips(pfx + 'goal', 'goal', UI_GOALS, v => hasGoal(v))}`
    + `<div ${pfx === 'g-' ? 'id="goal-info" ' : ''}class="hint quote-rule" style="display:${note ? '' : 'none'}">${uiEsc(note)}</div>`;
}
function _uiLevelHtml(pfx, long) {
  return `<span class="sub-label">动作难度</span>${uiSeg(pfx + 'level', 'level', [['初级', '初级'], ['中级', '中级'], ['高级', '高级']], S.level, { label: '动作难度' })}`
    + `<span class="sub-label">${long ? '重量强度 · 只影响建议重量，和动作难度分开' : '重量强度 · 只影响建议重量'}</span>${uiSeg(pfx + 'weight-level', 'wlevel', [['初级', '轻'], ['中级', '中'], ['高级', '重']], S.weightLevel || '初级', { label: '重量强度' })}`;
}
function _uiTimeHtml() { return uiStepper('days', '每周', S.days, '天', 2, 7) + uiStepper('dur', '每次', S.dur, 'min', 20, 90); }
function _uiFocusHtml(pfx) { return uiChips(pfx + 'focus', 'focus', UI_FOCUS, v => (S.focus || []).includes(v)); }
function _uiEquipHtml(pfx) { return uiChips(pfx + 'equip', 'equip', UI_EQUIP, v => S.equip.includes(v)); }
function _uiSwimSegHtml(pfx) { return uiSeg(pfx + 'swim-level', 'swim', UI_SWIM, S.swimLevel || '入门', { label: '游泳水平' }); }
function uiRenderP1() {
  const el = document.getElementById('p1'); if (!el) return;
  el.innerHTML = uiSecLabel('01 — 目标与强度') + _uiP1Html('g-') + `<div style="height:4px"></div>` + _uiLevelHtml('g-', true);
}
function uiRenderP2() {
  const el = document.getElementById('p2'); if (!el) return;
  const sw = uiSwimLine();
  el.innerHTML = uiSecLabel('02 — 时间与节奏') + _uiTimeHtml()
    + `<div id="swim-breakdown" class="note-line" style="display:${sw ? '' : 'none'}"><span class="faint">每周拆分 →</span> ${uiEsc(sw)}</div>`
    + `<span class="sub-label">组间休息</span>${uiSeg('g-rest', 'rest', [['30', '30s'], ['45', '45s'], ['60', '60s'], ['90', '90s'], ['0', '关']], String(S.restDur ?? 45), { label: '组间休息' })}`
    + uiToggle('autoVol', '自动调整训练量', S.autoVolumeAdjust !== false ? '按疲劳度自动调；提前结束打卡时不再单独问' : '关了以后，提前结束打卡时自己勾选要不要下调', S.autoVolumeAdjust !== false, false, 'auto-vol-switch');
}
const UI_TECNO = [
  ['力量器械', [['Chest Press', '坐姿推胸机'], ['Shoulder Press', '器械推举'], ['Pectoral', '器械夹胸'], ['Reverse Fly', '反向飞鸟机'], ['Lat Machine', '高位下拉'], ['Low Row', '坐姿划船'], ['Upper Back', '器械上背划船'], ['Leg Press', '倒蹬机'], ['Leg Extension', '腿屈伸'], ['Leg Curl', '腿弯举 / 坐姿腿弯举'], ['Adductor', '器械内收机'], ['Abductor', '器械外展机'], ['Arm Curl', '器械弯举'], ['Arm Extension', '器械三头下压'], ['Delts Machine', '坐姿侧平举机'], ['Multi Hip', '绳索后踢腿'], ['Abdominal', '坐姿卷腹机'], ['Lower Back', '山羊挺身']]],
  ['有氧器械', [['Excite Run', '跑步机慢跑'], ['Skillmill', '弧形跑步机'], ['Synchro / Vario', '椭圆机'], ['Excite Bike', '骑行机'], ['Skillbike', '动感单车'], ['Excite Climb', '攀爬机'], ['Skillrow', '划船机'], ['Excite Top', '上肢功率车']]],
  ['自由重量与配件', [['Dumbbells', '哑铃动作'], ['Kettlebells', '壶铃动作'], ['Bench', '卧推凳动作'], ['Bands', '弹力带动作']]],
];
function uiRenderP3() {
  const el = document.getElementById('p3'); if (!el) return;
  const pool = S.equip.includes('泳池');
  el.innerHTML = uiSecLabel('03 — 器械 · 可多选') + _uiEquipHtml('g-')
    + `<div id="swim-settings" style="display:${pool ? 'flex' : 'none'};flex-direction:column;gap:8px;margin-top:4px"><span class="sub-label">游泳水平 · 和健身等级分开调</span>${_uiSwimSegHtml('g-')}</div>`
    + `<button type="button" class="link-btn" data-toggle="tecno" aria-expanded="${_uiPlan.tecno}" aria-controls="tecno-table">Tecnogym 器械对照表 ${_uiPlan.tecno ? '▾' : '▸'}</button>`
    + `<div class="tecno" id="tecno-table"${_uiPlan.tecno ? '' : ' hidden'}>${UI_TECNO.map(([h, rows]) => `<div class="tg"><span class="th2">${h}</span>${rows.map(([en, zh]) => `<span class="tr"><span>${en}</span><span>${zh}</span></span>`).join('')}</div>`).join('')}<span class="faint">选「健身房全套」就已覆盖 Plurima / Selection / Biostrength / Excite / Skill 全系列。</span></div>`;
}
function uiRenderP4() {
  const el = document.getElementById('p4'); if (!el) return;
  el.innerHTML = uiSecLabel('04 — 重点部位 · 可多选') + _uiFocusHtml('g-') + `<span class="foot-note">「均衡全身」= 没有偏好，和其他部位互斥。</span>`;
}
// 05:textarea 只建一次(重画会丢输入焦点),之后只更新下面那行说明
function uiLimitsHint() {
  const lim = S.limits || '';
  if (!lim.trim()) return '写上哪里不舒服，排计划时按关键词避开对应动作；热身和有氧收尾也照这个避开。';
  const gated = new Set([...(typeof _PRIVATE_POOL !== 'undefined' ? _PRIVATE_POOL : []), ...(typeof OWNER_ONLY_MOVES !== 'undefined' ? OWNER_ONLY_MOVES : [])]);
  const hits = (typeof LIMIT_RULES !== 'undefined' ? LIMIT_RULES : []).filter(r => r.kw.some(k => lim.includes(k)));
  if (!hits.length) return '没有对上已知关键词（膝、肩、腰、颈、跳、手腕、脚踝…），计划不会因此避开动作。';
  const parts = hits.map(r => { const k = r.kw.find(x => lim.includes(x)); const names = r.exclude.filter(n => !gated.has(n)); return `${k} → ${names.slice(0, 4).join(' · ')}${names.length > 4 ? ` 等 ${names.length} 个` : ''}`; });
  return `按关键词避开：${parts.join('；')}。热身和有氧收尾也照这个避开。`;
}
function uiRenderP5() {
  const el = document.getElementById('p5'); if (!el) return;
  if (!el.dataset.built) {
    el.innerHTML = uiSecLabel('05 — 身体情况 · 限制或注意')
      + `<textarea id="limits" class="line-area" rows="2" aria-label="身体情况" placeholder="例如：膝盖不适、肩伤、避免跳跃"></textarea><div id="limits-hint" class="note-line"></div>`;
    el.dataset.built = '1';
    el.querySelector('#limits').addEventListener('input', e => { S.limits = e.target.value; if (typeof saveState === 'function') saveState(); if (typeof markPlanStale === 'function') markPlanStale(); uiUpdateLimitsHint(); });
  }
  const ta = el.querySelector('#limits');
  if (ta && document.activeElement !== ta) ta.value = S.limits || '';
  uiUpdateLimitsHint();
}
function uiUpdateLimitsHint() { const h = document.getElementById('limits-hint'); if (h) h.textContent = uiLimitsHint(); }
function _uiPhaseHtml() {
  const day = S.cycleDay || 1, len = S.cycleLength || 28;
  const p = cyclePhase(day, len);
  const nudge = p.key === 'menstrual' && !S.periodMode;
  return `<div id="cycle-phase" class="accent-rule"><span class="mono" style="font-size:13px">${uiEsc(p.name)} · 第 ${day}/${len} 天</span><span class="hint">${uiEsc(p.advice)}</span>${nudge ? `<button type="button" class="link-btn accent u" style="color:var(--accent)" data-toggle="period">一键开经期模式</button>` : ''}</div>`;
}
function uiRenderP6() {
  const el = document.getElementById('p6'); if (!el) return;
  const on = S.cycleEnabled !== false, len = S.cycleLength || 28;
  el.innerHTML = uiSecLabel('06 — 周期') + uiToggle('cycle', '生理期 / 周期功能', '没有生理周期可以关，下面的选项会收起', on, true, 'cycle-enable-switch')
    + `<div id="cycle-block" style="display:${on ? 'flex' : 'none'};flex-direction:column;gap:10px">`
    + uiToggle('period', '经期模式', '游泳日换成陆地训练，力量日降负重、避开高腹压动作', !!S.periodMode, false, 'period-switch')
    + uiStepper('cycleDay', '今天是', S.cycleDay || 1, `/ ${len} 天`, 1, len) + uiStepper('cycleLen', '周期长度', len, '天', 20, 40)
    + `<button type="button" class="btn-line" onclick="cyclePeriodStart()">今天来月经了 · 周期归到第 1 天</button>`
    + _uiPhaseHtml()
    + `<span class="foot-note">仅供参考，以身体感受为准；训练量仍会随每次打卡的 RPE 微调。</span></div>`;
}
function uiRenderP7() {
  const el = document.getElementById('p7'); if (!el) return;
  if (!el.querySelector('#excluded-list')) {
    el.innerHTML = `<div class="sec-label" id="excluded-head">07 — 已排除的动作 / 器械</div><div id="excluded-list"></div>`
      + `<span class="foot-note">在「今天」点动作的「换 / 划掉 → 永久排除」加进来。排计划、换动作、热身和收尾都会避开。</span>`;
  }
}
function uiAiOn() { return typeof coachAccess === 'function' && coachAccess() === 'on'; }
function uiRenderP8() {
  const el = document.getElementById('p8'); if (!el) return;
  const ai = uiAiOn();
  if (!ai && _uiGen.method === 'ai') _uiGen.method = 'rule';
  const reqOld = document.getElementById('co-plan-req');
  const req = reqOld ? reqOld.value : '';
  const isAi = _uiGen.method === 'ai';
  const label = isAi ? '先预览，满意再替换' : (_uiGen.scope === 'rest' ? '只重排剩余的天' : '生成全新计划');
  const note = isAi ? '按你的目标、器械和最近的状态，从动作库里排。先预览，满意再采纳；已完成的天、锁定的天和今天已经开练的不动。'
    : _uiGen.scope === 'all' ? '今天之后的安排都会换掉；已完成的天和今天已经开练的部分不动。' : '保留历史记录，只重排本周还没练的天。';
  el.innerHTML = uiSecLabel('08 — 生成 / 重排')
    + (isAi ? '' : uiSeg('gen-scope', 'genScope', [['all', '生成全新计划'], ['rest', '只重排剩余']], _uiGen.scope, { label: '范围' }))
    + uiSeg('gen-method', 'genMethod', [['rule', '规则生成', '离线 · 秒出'], ['ai', 'AI 排', ai ? '看最近状态 · ~30 s' : '未开通']], _uiGen.method, { label: '生成方式', disabled: { ai: !ai } })
    + (isAi ? `<div style="display:flex;flex-direction:column;gap:10px">${uiSeg('ai-span', 'aiSpan', [['7', '接下来 7 天'], ['14', '接下来 14 天']], _uiGen.span, { light: true, label: '天数' })}`
      + `<input type="hidden" id="co-plan-span" value="${_uiGen.span}"><input id="co-plan-req" class="line-input" placeholder="要求（可空）：周五只有 30 分钟" aria-label="排计划的要求" value="${uiEsc(req)}"></div>` : '')
    + `<button type="button" class="btn-primary" id="gen-btn" onclick="uiGenerate()">${label}</button>`
    + `<div class="foot-note">${note}</div><div id="co-plan-body"></div>`;
  if (typeof coachShowPlanDraft === 'function') coachShowPlanDraft();
}
function uiGenerate() {
  if (_uiGen.method === 'ai') { if (typeof coachPlan === 'function') coachPlan(); return; }
  const had = !!(S.plan && S.plan.days && S.plan.days.length);
  if (_uiGen.scope === 'rest' && had) {
    if (!confirm('只重排剩余的天？\n已完成的和今天已经开练的不动；你手动改过的未来几天会按当前设置重排。')) return;
    recalibratePlan();
    uiNotice('已保留历史记录，重排了本周剩下的天');
    return;
  }
  confirmGenPlan();
  if (S.plan && S.plan.days && S.plan.days.length && uiCurrentTab === 'today') uiNotice(had ? '换上了一份全新的计划 · 想改去「计划」' : '计划排好了 · 想改去「计划」');
}

// ══ 计划页:周历(由 render() 调用) ═══════════════════════════
function uiRenderPlanCal(visibleDays, sel, today, isCurrentView, viewStart, viewEnd) {
  const el = document.getElementById('plan-cal'); if (!el) return;
  const _xCal = (typeof _xMode !== 'undefined') && _xMode && _ownerSession();
  const ov = (typeof partnerOverlap === 'function') ? partnerOverlap() : null;
  const coDows = ov ? new Set([...ov.gym, ...ov.swim]) : null;
  const dows = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  let h = `<div class="cal-nav"><button type="button" class="link-btn" onclick="calPrev()" aria-label="上两周">‹ 上两周</button>`
    + `<span class="cal-nav-label">${viewStart.slice(5).replace('-', '/')} — ${viewEnd.slice(5).replace('-', '/')}</span>`
    + (!isCurrentView ? `<button type="button" class="link-btn" onclick="calGoToday()">回到今天</button>` : '')
    + `<button type="button" class="link-btn" onclick="calNext()" ${isCurrentView ? 'disabled' : ''} aria-label="下两周" style="text-align:right">下两周 ›</button></div>`;
  h += `<div class="cal-scroll"><div class="daygrid" id="cal-grid" role="grid" aria-label="两周日历">`;
  visibleDays.forEach(d => {
    const isPlan = d._src === 'plan', isLog = d._src === 'log', isNone = d._src === 'empty';
    const locked = isPlan && isLocked(d);
    const done = isPlan ? isDone(d) : isLog;
    const isSel = d.date === (sel && sel.date), isToday = d.date === today;
    let cls = 'dc';
    if (isNone) cls += ' no-data';
    else if (isLog && !isPlan) cls += ' historical';
    else if (d.isRest && isPlan) cls += ' rest';
    else if (done && isPlan) cls += ' done';
    if (isToday) cls += ' today';
    if (locked && !d.isRest) cls += ' locked';
    if (d.isSwimDay) cls += ' swim-day';
    if (d.isPrivateDay) cls += ' prv-day';
    if (coDows && isPlan && !d.isRest && coDows.has((new Date(d.date + 'T12:00:00').getDay() + 6) % 7)) cls += ' co-day';
    if (isSel && !isNone) cls += ' sel';
    const drag = (isPlan && !d.isRest && !locked) ? `draggable="true" ondragstart="dragStart(event,'${d.date}')" ondragover="dragOver(event)" ondrop="dragDrop(event,'${d.date}')" ondragend="dragEnd()"` :
      (isPlan && !d.isRest && locked ? `ondragover="dragOver(event)" ondrop="dragDrop(event,'${d.date}')"` : '');
    const click = isNone ? '' : `onclick="selectDate('${d.date}');showTab('today')"`;   // 点一格 = 选这天并回到「今天」看
    const dt = new Date(d.date + 'T12:00:00');
    const tag = d.isRest ? (isPlan ? '休' : '—') : d.isPrivateDay ? '另' : d.isSwimDay ? '泳' : _uiShortType(d.workoutType);
    let mark = '';
    if (done && isPlan) mark = _xCal ? '<span style="color:var(--accent)">●</span>' : '✓';
    else if (isLog && !isPlan) mark = '✓';
    else if (locked && !d.isRest) mark = '锁';
    h += `<div class="${cls}" role="gridcell" tabindex="${isNone ? -1 : 0}" aria-label="${fmtDate(d.date)} ${uiEsc(d.isRest ? '休息' : d.workoutType || '')}${done ? ' 已完成' : ''}${isSel ? ' 选中' : ''}" ${drag} ${click}>`
      + `<span class="dw">${dows[dt.getDay()]}</span><span class="dn">${dt.getDate()}</span><span class="dt">${uiEsc(tag)}</span><span class="dm">${mark}${_xCal ? _xCalMark(d.date) : ''}</span><span class="dd"></span></div>`;
  });
  h += `</div></div>`;
  el.innerHTML = h;
  if (typeof initTouchDrag === 'function') initTouchDrag();
}
// 周历格里只放一两个字:按训练类型取一个代表字
function _uiShortType(t) {
  t = String(t || '');
  const map = [['游泳', '泳'], ['轻量', '轻'], ['推', '推'], ['拉', '拉'], ['腿', '腿'], ['臀', '臀'], ['背', '背'], ['胸', '胸'], ['肩', '肩'], ['核心', '核'], ['全身', '全'], ['上肢', '上'], ['下肢', '下'], ['有氧', '氧'], ['AI', 'AI']];
  for (const [k, v] of map) if (t.includes(k)) return v;
  return t.slice(0, 2) || '练';
}
// 周历格支持键盘:Enter / 空格选中
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('dc') && e.target.getAttribute('onclick')) { e.preventDefault(); e.target.click(); }
});

// ══ 我 ═══════════════════════════════════════════════════
function uiRenderMe() {
  const host = document.getElementById('me-content'); if (!host || typeof S === 'undefined') return;
  if (!host.dataset.built) {
    host.innerHTML = ['me-acct', 'me-look', 'me-pair', 'me-remind', 'me-ai', 'me-data'].map(id => `<section class="psec" id="${id}"></section>`).join('')
      + `<button type="button" class="row-btn" style="border-bottom:1px solid var(--line)" onclick="uiOpenOobe(false)"><span><span class="rk">重新走一遍新手设置</span><span class="rv">改完会问要不要重排计划；记录不动</span></span><span class="ra">→</span></button>`
      + `<section class="psec" id="me-wipe"></section>`;
    host.dataset.built = '1';
  }
  uiRenderMeAcct(); uiRenderMeLook(); uiRenderMePair(); uiRenderMeRemind(); uiRenderMeAI(); uiRenderMeData(); uiRenderMeWipe();
}
function _uiUser() { try { return (typeof _user !== 'undefined' && _user) || (typeof firebase !== 'undefined' && firebase.auth().currentUser) || null; } catch (e) { return null; } }
function uiRenderMeAcct() {
  const el = document.getElementById('me-acct'); if (!el) return;
  if (el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // 正在输入就别重画
  const u = _uiUser();
  const gName = (u && u.displayName) ? u.displayName.split(' ')[0] : '';
  const name = (S.displayName && S.displayName.trim()) ? S.displayName.trim() : gName;
  const seal = (S.sealChar && S.sealChar.trim()) ? S.sealChar.trim() : ((name && name.charAt(0).toUpperCase()) || '健');
  const head = `<div class="id-line"><span class="seal" id="user-seal">${uiEsc(seal)}</span><h2 id="user-name">${uiEsc(name ? `${name}的计划` : '我的健身计划')}</h2></div>`;
  if (u) {
    const how = (u.providerData || []).some(p => p && p.providerId === 'google.com') ? 'Google 账号' : '邮箱账号';
    el.innerHTML = uiSecLabel('01 — 账号') + head
      + `<div class="kv-form"><label class="k" for="me-name">显示名</label><input id="me-name" class="line-input" value="${uiEsc(S.displayName || '')}" placeholder="${uiEsc(gName || '起个名字')}" autocomplete="nickname" onchange="uiSaveProfile()">`
      + `<label class="k" for="me-seal">印章字</label><input id="me-seal" class="line-input" value="${uiEsc(S.sealChar || '')}" placeholder="留空取名字首字" maxlength="2" onchange="uiSaveProfile()">`
      + `<span class="k">登录</span><span class="v">${how} · ${uiEsc(u.email || '已登录')}</span>`
      + `<span class="k">同步</span><span class="v"><span id="sync-pill" class="auth-pill-sync ok">云端已同步</span></span></div>`
      + `<button type="button" class="btn-line" style="align-self:flex-start" onclick="signOutUser()">登出</button>`;
  } else {
    el.innerHTML = uiSecLabel('01 — 账号') + head
      + `<span class="hint">不登录也能用，数据只存在这台手机上；登录后多设备同步，也能用搭子和 AI 教练。</span>`
      + `<div class="kv-form"><label class="k" for="me-name">显示名</label><input id="me-name" class="line-input" value="${uiEsc(S.displayName || '')}" placeholder="起个名字" autocomplete="nickname" onchange="uiSaveProfile()">`
      + `<label class="k" for="me-seal">印章字</label><input id="me-seal" class="line-input" value="${uiEsc(S.sealChar || '')}" placeholder="留空取名字首字" maxlength="2" onchange="uiSaveProfile()"></div>`
      + `<input id="login-email" class="line-input" type="email" autocomplete="username" placeholder="邮箱" aria-label="邮箱">`
      + `<input id="login-pass" class="line-input" type="password" autocomplete="current-password" placeholder="密码（至少 6 位）" aria-label="密码" onkeydown="if(event.key==='Enter')signInEmail()">`
      + `<div id="login-msg" class="note-line" role="alert" style="color:var(--accent);min-height:0"></div>`
      + `<div class="btn-row"><button type="button" class="btn-primary" style="min-height:48px;font-size:14px" onclick="signInEmail()">登录</button><button type="button" class="btn-outline" style="min-height:48px;font-size:14px" onclick="signUpEmail()">注册</button></div>`
      + `<button type="button" class="btn-line" style="color:var(--muted)" onclick="signInGoogle()">用 Google 登录（限 Safari）</button>`;
  }
}
function uiSaveProfile() {
  const n = document.getElementById('me-name'), s = document.getElementById('me-seal');
  if (n) S.displayName = n.value.trim() || null;
  if (s) S.sealChar = s.value.trim() || null;
  if (typeof saveState === 'function') saveState();
  if (typeof updateProfileUI === 'function') updateProfileUI();
  if (typeof scheduleProfilePush === 'function') scheduleProfilePush();
  showToast('已更新显示名');
}
function uiRenderMeLook() {
  const el = document.getElementById('me-look'); if (!el) return;
  let cur = 'system'; try { cur = localStorage.getItem('fit_theme') || 'system'; } catch (e) { }
  el.innerHTML = uiSecLabel('02 — 外观') + uiSeg('theme-seg', 'theme', [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']], cur, { label: '外观' });
}
function uiRenderMePair() {
  const el = document.getElementById('me-pair'); if (!el) return;
  if (!el.dataset.built) {
    el.innerHTML = uiSecLabel('03 — 训练搭子')
      + `<span class="hint">配对后日历会标出你俩重合的健身房 / 游泳日，能看对方今日状态、互相加油。只分享天数和当日类型。</span>`
      + `<div class="pair-grid"><span class="k">我的配对码</span><code id="my-pair-code" class="pair-code">（请先登录）</code><button type="button" class="btn-line" onclick="copyMyPairCode()">复制</button>`
      + `<label class="k" for="partner-code-input">搭子配对码</label><input id="partner-code-input" class="line-input" style="font-size:14px" type="text" placeholder="粘贴对方的码" autocomplete="off" spellcheck="false"><button type="button" class="btn-line" id="pair-btn" onclick="savePartnerCode()">连接</button></div>`
      + `<div id="pair-status" class="pair-status" style="display:none"></div>`
      + `<div id="pair-cheer" style="display:none"><button type="button" class="btn-line" id="cheer-btn" onclick="sendCheer()">给搭子加油</button></div>`
      + `<div id="partner-days-row" style="display:flex;flex-direction:column;gap:6px"><span class="sub-label">还没配对？也可以手动填搭子每周练几天，先看重合日</span><div id="partner-days-chips"></div></div>`
      + `<div id="partner-overlap" class="note-line" style="display:none"></div>`;
    el.dataset.built = '1';
  }
  const pd = +S.partnerDays || 0;
  const chips = document.getElementById('partner-days-chips');
  if (chips) chips.innerHTML = uiChips('g-partner-days', 'partnerDays', [['0', '关闭'], ['2', '2 天'], ['3', '3 天'], ['4', '4 天'], ['5', '5 天'], ['6', '6 天'], ['7', '7 天']], v => +v === pd);
  if (typeof updatePairUI === 'function') updatePairUI();
  if (typeof updatePartnerOverlap === 'function') updatePartnerOverlap();
}
function uiRenderMeRemind() {
  const el = document.getElementById('me-remind'); if (!el) return;
  const snd = typeof _soundMuted === 'function' ? !_soundMuted() : true;
  const ntf = typeof _notifMuted === 'function' ? !_notifMuted() : true;
  el.innerHTML = uiSecLabel('04 — 提醒')
    + uiToggle('sound', '提示音', '休息结束、打勾、完成时的音效；健身房或深夜可以关', snd, true, 'sound-enable-switch')
    + uiToggle('notif', '系统通知', '休息结束弹锁屏 / 后台通知；关了只有声音', ntf, true, 'notif-enable-switch');
}
function uiRenderMeAI() {
  const el = document.getElementById('me-ai'); if (!el) return;
  el.innerHTML = uiSecLabel('05 — AI 教练') + (typeof coachMeSectionHtml === 'function' ? coachMeSectionHtml() : '');
}
function uiRenderMeData() {
  const el = document.getElementById('me-data'); if (!el) return;
  const row = (k, v, attrs) => `<button type="button" class="row-btn kv3" ${attrs}><span class="rk">${k}</span><span class="rv">${v}</span><span class="ra">→</span></button>`;
  el.innerHTML = uiSecLabel('06 — 数据')
    + row('备份 JSON', '下载全部数据', 'onclick="exportJSON()"')
    + `<label class="row-btn kv3"><span class="rk">导入</span><span class="rv">从备份 JSON 恢复</span><span class="ra">→</span><input type="file" accept=".json,application/json" onchange="importJSON(this)" aria-label="从备份 JSON 恢复"></label>`
    + row('导出 CSV', '打卡记录表格', 'onclick="exportCSV()"')
    + row('恢复快照', '从自动快照里挑一份回滚', 'onclick="showSnapshotRestore()"')
    + row('AI 分析导出', '复制一份给别的 AI 看', 'onclick="exportForAI()"');
}
let _uiWipe = 0, _uiWipeTimer = null;
function uiRenderMeWipe() {
  const el = document.getElementById('me-wipe'); if (!el) return;
  el.innerHTML = uiSecLabel('07 — 恢复出厂')
    + `<button type="button" class="wipe-btn${_uiWipe === 1 ? ' armed' : ''}" id="wipe-btn" onclick="uiWipeTap()">${_uiWipe === 1 ? '再点一次确认：全部删除，不能恢复' : '清空所有数据（恢复出厂）'}</button>`
    + `<span class="foot-note">计划、打卡、统计全部删掉，云端和搭子能看到的状态也一起删。删之前先备份 JSON。</span>`;
}
function uiWipeTap() {
  clearTimeout(_uiWipeTimer);
  if (_uiWipe === 1) { _uiWipe = 0; uiRenderMeWipe(); clearAllData(true); return; }
  _uiWipe = 1; uiRenderMeWipe();
  _uiWipeTimer = setTimeout(() => { _uiWipe = 0; uiRenderMeWipe(); }, 6000);   // 6 秒内没点第二次就复位
}

// ══ 新手设置 ═══════════════════════════════════════════════
const _oobe = { open: false, step: 0, auto: false };
const UI_OOBE_TITLES = ['先定几件事', '练什么', '强度和时间', '有什么器械', '身体情况', '好了'];
let _authKnown = false;   // 第一次拿到登录状态之前不自动弹(免得已登录的人先闪一下)
function uiHasAnyData() {
  try {
    return (typeof LOG !== 'undefined' && LOG.length > 0) || (typeof BODY_LOG !== 'undefined' && BODY_LOG.length > 0) || (typeof W_HIST !== 'undefined' && Object.keys(W_HIST).length > 0);
  } catch (e) { return false; }
}
function uiOobeShouldAuto() {
  if (typeof S === 'undefined' || S.plan || uiHasAnyData() || !_authKnown) return false;
  try { if (sessionStorage.getItem('__oobe_dismissed__') === '1') return false; } catch (e) { }
  // 登录了:先等第一份云端快照(云端有计划就直接拉下来,不用再设一遍)
  try { const u = _uiUser(); if (u && typeof _cloudFirstSnap !== 'undefined' && !_cloudFirstSnap) return false; } catch (e) { }
  // 登录了、本机还有未登录时的记录、合并还没问过 → 等合并(_checkAnonMerge)走完再说
  try {
    const u = _uiUser();
    if (u && typeof _anonHasData === 'function' && _anonHasData() && !localStorage.getItem('__anon_merge_asked__' + u.uid)) return false;
  } catch (e) { }
  return true;
}
// render() 每次画今天页时调:没计划没数据 → 自动弹;自动弹出来之后计划到了(云端拉下来 / 合并)→ 自动关
function uiOobeCheck() {
  if (_oobe.open) { if (_oobe.auto && S.plan) uiCloseOobe(); return; }
  if (uiOobeShouldAuto()) uiOpenOobe(true);
}
function uiOpenOobe(auto) {
  _oobe.open = true; _oobe.auto = !!auto; _oobe.step = 0;
  const el = document.getElementById('oobe'); if (!el) return;
  const a = document.activeElement; _oobe.ret = (a && a !== document.body) ? a : null;
  el.hidden = false;
  uiRenderOobe();
  _uiSyncBackground();
  setTimeout(() => { const f = el.querySelector('.oobe-foot .btn-primary'); if (f) try { f.focus({ preventScroll: true }); } catch (e) { } }, 30);
}
function uiCloseOobe() {
  _oobe.open = false;
  const el = document.getElementById('oobe'); if (el) { el.hidden = true; el.innerHTML = ''; }
  _uiSyncBackground();
  if (_oobe.ret && document.contains(_oobe.ret)) try { _oobe.ret.focus({ preventScroll: true }); } catch (e) { }
}
function uiOobeGo(step) { _oobe.step = uiClamp(step, 0, 5); uiRenderOobe(); const b = document.querySelector('#oobe .oobe-body'); if (b) b.scrollTop = 0; }
function uiOobeNext() { if (_oobe.step >= 5) return uiOobeFinish(); uiOobeGo(_oobe.step + 1); }
function uiOobeBack() { if (_oobe.step > 0) uiOobeGo(_oobe.step - 1); }
// 跳过:第一次用 → 按当前(默认)设置排好第一周;重走 → 直接关
function uiOobeSkip(viaEsc) {
  try { sessionStorage.setItem('__oobe_dismissed__', '1'); } catch (e) { }
  const first = !S.plan;
  if (first && viaEsc) { uiCloseOobe(); return; }   // Esc 只是关掉,不替人生成
  uiCloseOobe();
  if (first) { _genStay = false; genPlan(false); showTab('today'); uiNotice('用默认设置排好了第一周 · 想改去「计划」'); }
}
function uiOobeFinish() {
  try { sessionStorage.setItem('__oobe_dismissed__', '1'); } catch (e) { }
  const first = !S.plan;
  uiCloseOobe();
  if (first) { _genStay = false; genPlan(false); showTab('today'); uiNotice('第一周计划排好了 · 想改去「计划」'); return; }
  if (S.planStale) {
    if (confirm('设置改过了。按新设置重排今天之后的安排？\n记录不动；选「取消」就先不排，「计划」页顶上会一直提示。')) applyStaleSettings();
  } else showToast('设置没有变化，计划照旧');
}
function uiOobeLogin() {
  try { sessionStorage.setItem('__oobe_dismissed__', '1'); } catch (e) { }
  uiCloseOobe();
  showTab('me');
  setTimeout(() => { const e = document.getElementById('login-email'); if (e) { e.scrollIntoView({ block: 'center' }); try { e.focus(); } catch (x) { } } }, 50);
}
function uiOobeImport(input) {
  try { sessionStorage.setItem('__oobe_dismissed__', '1'); } catch (e) { }
  importJSON(input);
}
function uiRenderOobe() {
  const el = document.getElementById('oobe'); if (!el || !_oobe.open) return;
  const s = _oobe.step;
  const keepLimits = document.getElementById('ob-limits');
  const limitsFocused = keepLimits && document.activeElement === keepLimits;
  let body = '';
  if (s === 0) {
    body = `<div class="prose" style="font-size:18px;line-height:1.7">一分钟，定四件事：练什么、多久练一次、手边有什么器械、身体有没有要注意的。</div>`
      + `<div class="hint" style="font-size:15px">这里的每个开关，之后都在「计划」页里，一模一样，随时能改。</div>`
      + `<div style="border-top:1px solid var(--line)">`
      + `<label class="row-btn"><span><span class="rk">从备份恢复</span><span class="rv">选之前导出的 JSON，直接回到原来的计划和记录</span></span><span class="ra">→</span><input type="file" accept=".json,application/json" onchange="uiOobeImport(this)" aria-label="从备份恢复"></label>`
      + `<button type="button" class="row-btn" onclick="uiOobeLogin()"><span><span class="rk">已有账号，登录同步</span><span class="rv">云端有数据就直接拉下来，不用再设一遍</span></span><span class="ra">→</span></button></div>`;
  } else if (s === 1) {
    body = _uiP1Html('ob-') + `<span class="sub-label" style="margin-top:6px">重点部位 · 可多选，不确定就「均衡全身」</span>` + _uiFocusHtml('ob-');
  } else if (s === 2) {
    body = _uiLevelHtml('ob-', false) + `<div style="height:6px"></div>` + _uiTimeHtml();
  } else if (s === 3) {
    const sw = uiSwimLine();
    body = `<span class="sub-label">器械 · 可多选</span>` + _uiEquipHtml('ob-')
      + (S.equip.includes('泳池') ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px"><span class="sub-label">游泳水平</span>${_uiSwimSegHtml('ob-')}<div class="note-line"><span class="faint">每周拆分 →</span> ${uiEsc(sw)}</div></div>` : '');
  } else if (s === 4) {
    const on = S.cycleEnabled !== false, len = S.cycleLength || 28;
    body = `<span class="sub-label">限制或注意 · 没有就空着</span><textarea id="ob-limits" class="line-area" rows="2" aria-label="身体情况" placeholder="例如：膝盖不适、肩伤、避免跳跃"></textarea>`
      + uiToggle('cycle', '生理期 / 周期功能', '没有生理周期可以关，下面的选项会收起', on)
      + (on ? uiStepper('cycleDay', '今天是', S.cycleDay || 1, `/ ${len} 天`, 1, len) : '');
  } else {
    const wl = { 初级: '轻', 中级: '中', 高级: '重' }[S.weightLevel || '初级'];
    const rows = [['目标', (S.goal || '').split('+').join(' + ')], ['部位', (S.focus || []).join(' · ')], ['强度', `难度${S.level} · 重量${wl}`],
      ['每周', `${S.days} 天 × ${S.dur} min`], ['器械', (S.equip || []).join(' + ') || '无器材'], ['周期', S.cycleEnabled !== false ? `开 · 今天第 ${S.cycleDay || 1} 天` : '关']];
    if ((S.limits || '').trim()) rows.push(['注意', S.limits.trim()]);
    body = `<div class="kv" style="font-size:14px;line-height:1.9">${rows.map(([k, v]) => `<span class="k">${k}</span><span>${uiEsc(v)}</span>`).join('')}</div>`
      + `<div style="border-top:1px solid var(--line);padding-top:12px;display:flex;flex-direction:column;gap:8px" class="hint">`
      + `<span><span class="sub-label">[ 装到主屏幕 ]</span> Safari 底部分享 → 添加到主屏幕。离线也能打开，计时提醒更稳。</span>`
      + `<span><span class="sub-label">[ 同步 ]</span> 不登录也能用，数据只在这台手机上；想换手机不丢，去「我」登录。</span></div>`;
  }
  const first = !S.plan;
  const nextLabel = s === 0 ? '开始' : s === 5 ? (first ? '生成第一周计划' : '完成') : '下一步';
  el.innerHTML = `<div class="oobe-head"><div class="oobe-top"><span>新手设置 · ${s <= 0 ? '欢迎' : `0${s} / 05`}</span>`
    + `<button type="button" class="link-btn" onclick="uiOobeSkip()">${first ? '跳过，用默认' : '关闭'}</button></div>`
    + `<div class="oobe-bar" aria-hidden="true">${'■'.repeat(s) + '□'.repeat(5 - s)}</div>`
    + `<h2 class="oobe-title" id="oobe-title">${UI_OOBE_TITLES[s]}<span class="mh-dot">.</span></h2></div>`
    + `<div class="oobe-body">${body}</div>`
    + `<div class="oobe-foot"><button type="button" class="btn-line" onclick="uiOobeBack()" style="visibility:${s > 0 ? 'visible' : 'hidden'}">上一步</button>`
    + `<button type="button" class="btn-primary" onclick="uiOobeNext()">${nextLabel}</button></div>`;
  const ta = document.getElementById('ob-limits');
  if (ta) {
    ta.value = S.limits || '';
    ta.addEventListener('input', e => { S.limits = e.target.value; if (typeof saveState === 'function') saveState(); if (typeof markPlanStale === 'function') markPlanStale(); const l = document.getElementById('limits'); if (l && document.activeElement !== l) l.value = S.limits; uiUpdateLimitsHint(); });
    if (limitsFocused) { try { ta.focus(); } catch (e) { } }
  }
}
