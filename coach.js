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
  } catch { throw new Error('AI 教练暂时连不上，过一会儿再试') }
  if (stream && r.ok) return r;
  let j = null;
  try { j = await r.json() } catch { }
  if (!r.ok) {
    const e = new Error((j && j.error) || ('AI 教练暂时连不上(' + r.status + ')'));
    e.status = j && j.status; e.info = j || {};
    throw e;
  }
  return j;
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
function _coachAccessCard(el, info) {
  const body = info.status === 'mismatch'
    ? `<p class="co-sub">这个邮箱已经绑定了另一个账号，AI 教练用不了。换回第一次用的登录方式试试。</p>`
    : `<p class="co-sub">AI 教练每次调用都要花钱，现在只对受邀的朋友开放。有邀请码的话填在下面；没有也没关系，计划、打卡、统计、换动作这些照常能用。</p>
    <div class="co-row"><input id="co-code" class="co-code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="邀请码，如 ABCDE-FGHJK" onkeydown="if(event.key==='Enter')coachRedeem()">
      <button class="co-btn" id="co-code-go" onclick="coachRedeem()">开通</button></div>`;
  el.innerHTML = `<div class="co-card" id="co-access"><div class="co-h"><i class="ti ti-lock"></i> ${info.status === 'mismatch' ? 'AI 教练用不了' : 'AI 教练是邀请制'}</div>${body}</div>`;
}
async function _coachCheckAccess() {
  try {
    await _coachFetch('/api/me');
    _coachRememberAccess('allowed');
    renderCoach();
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
    renderCoach();
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
  return `<div class="co-meta">${_esc(m ? m[1] : r.model || '')}${e ? ' · 思考' + _esc(e[1]) : ''} · $${Number(r.cost).toFixed(3)}</div>`;
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
async function renderCoach() {
  const el = document.getElementById('coach-content');
  if (!el) return;
  const u = _coachUser();
  if (!u) {
    el.innerHTML = `<div class="co-card co-empty"><i class="ti ti-sparkles"></i><p>登录后就能用 AI 教练：复盘、排计划、认器械、随时问。</p>
      <button class="co-btn" onclick="openLoginModal()">登录</button></div>`;
    return;
  }
  const st = _coachLoad();
  if (st.access) {
    _coachAccessCard(el, { status: st.access });
    return _coachCheckAccess();
  }
  el.innerHTML = `
  <div class="co-top">
    <span id="co-status" class="co-meta">连接中…</span>
    <span class="co-sel"><select id="co-model" aria-label="模型" onchange="coachSaveOpts()"></select><select id="co-effort" aria-label="思考深度" onchange="coachSaveOpts()"></select></span>
  </div>
  <div class="co-card" id="co-review">
    <div class="co-h"><i class="ti ti-report-analytics"></i> 每周复盘</div>
    <p class="co-sub">看最近几周练得怎么样，给出下周可以一键采纳的调整。</p>
    <div id="co-review-body"></div>
    <button class="co-btn" id="co-review-go" onclick="coachReview()">生成复盘</button>
  </div>
  <div class="co-card" id="co-plan">
    <div class="co-h"><i class="ti ti-calendar-event"></i> AI 排计划</div>
    <p class="co-sub">按你的目标、器械和最近的状态，从动作库里排。先预览，满意再采纳；已完成的天和锁定的天不动。</p>
    <textarea id="co-plan-req" rows="2" placeholder="有特别要求可以写，比如：这周膝盖不舒服 / 周三只有 30 分钟 / 多练背"></textarea>
    <div class="co-row"><select id="co-plan-span"><option value="7">接下来 7 天</option><option value="14">接下来 14 天</option></select>
      <button class="co-btn" id="co-plan-go" onclick="coachPlan()">排计划</button></div>
    <div id="co-plan-body"></div>
  </div>
  <div class="co-card" id="co-vision">
    <div class="co-h"><i class="ti ti-camera"></i> 拍器械认动作</div>
    <p class="co-sub">在健身房拍一张器械，告诉你用它能做动作库里的哪些动作，可以直接加到今天。</p>
    <label class="co-btn co-file">拍照 / 选图<input type="file" accept="image/*" capture="environment" onchange="coachVision(this)"></label>
    <div id="co-vision-body"></div>
  </div>
  <div class="co-card" id="co-chat">
    <div class="co-h"><i class="ti ti-message-circle"></i> 问教练 <button class="co-link" onclick="coachNewChat()">新对话</button></div>
    <div id="co-chat-log" class="co-chat-log"></div>
    <div id="co-chat-img"></div>
    <div class="co-row co-chat-in">
      <label class="co-icon" title="发图片"><i class="ti ti-photo"></i><input type="file" accept="image/*" onchange="coachAttach(this)"></label>
      <textarea id="co-chat-text" rows="1" placeholder="问点什么…" onkeydown="if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();coachSend()}"></textarea>
      <button class="co-btn" id="co-chat-go" onclick="coachSend()">发送</button>
    </div>
  </div>`;
  if (st.review) _coachShowReview(st.review);
  if (st.planDraft) _coachShowPlan(st.planDraft);
  _coachShowChat();
  try {
    const me = await _coachFetch('/api/me');
    window._coachMe = me;
    const o = st.opts || {};
    document.getElementById('co-model').innerHTML = `<option value="">模型·自动</option>` + me.models.map(([k, n, note]) => `<option value="${k}"${o.model === k ? ' selected' : ''}>${_esc(n)}·${_esc(note)}</option>`).join('');
    document.getElementById('co-effort').innerHTML = me.efforts.map(([k, n]) => `<option value="${k}"${(o.effort || 'medium') === k ? ' selected' : ''}>思考·${_esc(n)}</option>`).join('');
    document.getElementById('co-effort').disabled = !o.model;
    document.getElementById('co-status').textContent = `今天 $${me.today.toFixed(2)} · 本月 $${me.cycle.toFixed(2)}`;
  } catch (e) {
    if (_COACH_LOCKED.has(e.status)) {
      _coachRememberAccess(e.status);
      return _coachAccessCard(el, e.info);
    }
    const s = document.getElementById('co-status');
    if (s) { s.textContent = e.message; s.classList.add('co-err') }
  }
}
function coachSaveOpts() {
  const st = _coachLoad(), m = document.getElementById('co-model').value;
  st.opts = m ? { model: m, effort: document.getElementById('co-effort').value } : {};
  document.getElementById('co-effort').disabled = !m;
  _coachSave(st);
}
function _coachBusy(id, on, label) {
  const b = document.getElementById(id);
  if (!b) return;
  if (on) { b.dataset.t = b.textContent; b.textContent = label || '思考中…'; b.disabled = true }
  else { b.textContent = b.dataset.t || b.textContent; b.disabled = false }
}

// ── 复盘 ──
async function coachReview() {
  _coachBusy('co-review-go', true, '复盘中…（约半分钟）');
  try {
    const r = await _coachFetch('/api/review', { context: buildCoachContext({ catalog: 'names' }), ..._coachOpts('review') });
    const st = _coachLoad();
    st.review = { ...r.data, adjustments: _coachCleanAdj(r.data.adjustments), at: todayStr(), model: r.model, effort: r.effort, cost: r.cost, applied: [] };
    _coachSave(st);
    _coachShowReview(st.review);
  } catch (e) { showToast(e.message) }
  _coachBusy('co-review-go', false);
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
function _coachShowReview(rv) {
  const el = document.getElementById('co-review-body');
  if (!el) return;
  const li = arr => (arr || []).map(x => `<li>${_esc(x)}</li>`).join('');
  const adj = (rv.adjustments || []).map((a, i) => {
    const done = (rv.applied || []).includes(i);
    return `<label class="co-adj${done ? ' done' : ''}"><input type="checkbox" data-i="${i}" ${done ? 'disabled checked' : 'checked'}>
      <span><b>${_esc(_ADJ_LABEL[a.type] || a.type)}</b> ${_esc(_adjText(a))}<small>${_esc(a.reason)}</small></span></label>`;
  }).join('');
  el.innerHTML = `<div class="co-rv"><div class="co-rv-h">${_esc(rv.headline)}</div><div class="co-meta">${_esc(rv.at)}</div>
    ${_coachMd(rv.summary)}
    ${rv.wins?.length ? `<div class="co-rv-t">做得好</div><ul>${li(rv.wins)}</ul>` : ''}
    ${rv.issues?.length ? `<div class="co-rv-t">要注意</div><ul>${li(rv.issues)}</ul>` : ''}
    ${adj ? `<div class="co-rv-t">建议调整</div><div id="co-adj-list">${adj}</div>
      ${(rv.applied || []).length < rv.adjustments.length ? `<button class="co-btn co-btn-sage" onclick="coachApplyReview()">采纳勾选的</button>` : ''}` : ''}
    ${_coachCostLine(rv)}</div>`;
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
  const picks = [...document.querySelectorAll('#co-adj-list input:checked:not(:disabled)')].map(x => +x.dataset.i);
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
  // 改了天数/时长/训练量/排除 → 用原有生成器重排未来(保留过去、今天已打卡、锁定的天)
  if (regen && S.plan) { genPlan(true); showTab('coach', document.getElementById('tab-coach')) }
  else render();
  _coachShowReview(rv);
  showToast(`已采纳 ${done.length} 条`);
  if (replan) { document.getElementById('co-plan')?.scrollIntoView({ behavior: 'smooth' }); coachPlan() }
}

// ── 排计划 ──
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
  _coachBusy('co-plan-go', true, '排计划中…（约一分钟）');
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
  _coachBusy('co-plan-go', false);
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
  el.innerHTML = `<div class="co-rv">${_coachMd(dr.rationale)}
    ${dr.dropped?.length ? `<div class="co-meta co-err">已去掉 ${dr.dropped.length} 个不在你动作库里的：${_esc(dr.dropped.join('、'))}</div>` : ''}
    ${dr.days.map(d => `<div class="co-day"><div class="co-day-h">${_esc(fmtDate(d.date))} · ${_esc(d.workoutType)}</div>
      ${d.isRest ? '' : `<div class="co-day-ex">${d.exercises.map(e => `<span onclick="showExDetail('${_esc(e.name).replace(/'/g, '&#39;')}')">${_esc(e.name)} <small>${e.sets}×${e.reps}${_esc(e.unit)}</small></span>`).join('')}</div>`}</div>`).join('')}
    <div class="co-row"><button class="co-btn co-btn-sage" onclick="coachApplyPlan()">采纳这份计划</button><button class="co-link" onclick="coachDropPlan()">不要了</button></div>
    ${_coachCostLine(dr)}</div>`;
}
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
  showTab('today', document.querySelector('.tab'));
}

// ── 拍器械 ──
async function coachVision(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  const el = document.getElementById('co-vision-body');
  let img;
  try { img = await _coachImage(f) } catch (e) { return showToast(e.message) }
  el.innerHTML = `<img class="co-thumb" src="${img}"><div class="co-meta">识别中…</div>`;
  try {
    const r = await _coachFetch('/api/vision', { image: img, context: buildCoachContext({ catalog: 'full', logDays: 14 }), ..._coachOpts('vision') });
    const cat = _coachCatalogMap(), d = r.data;
    const list = (d.exercises || []).filter(e => cat.has(e.name));
    const today = S.plan?.days?.find(x => x.date === todayStr());
    const canAdd = today && !today.isRest && !today.isPrivateDay && !isLocked(today);
    window._coachVisionList = list.map(e => e.name);
    el.innerHTML = `<img class="co-thumb" src="${img}"><div class="co-rv"><div class="co-rv-h">${_esc(d.equipment)}</div>${_coachMd(d.note)}
      ${list.map((e, i) => `<div class="co-vx"><span onclick="showExDetail(window._coachVisionList[${i}])"><b>${_esc(e.name)}</b><small>${_esc(e.why)}</small></span>
        ${canAdd ? `<button class="co-link" onclick="coachAddToday(${i},this)">加到今天</button>` : ''}</div>`).join('') || '<p class="co-meta">动作库里没有对应的动作。</p>'}
      ${_coachCostLine(r)}</div>`;
  } catch (e) { el.innerHTML = `<div class="co-meta co-err">${_esc(e.message)}</div>` }
}
function coachAddToday(i, btn) {
  const name = window._coachVisionList?.[i], hit = name && _coachCatalogMap().get(name);
  const day = S.plan?.days?.find(x => x.date === todayStr());
  if (!hit || !day) return;
  if (day.exercises.some(e => e.name === name)) return showToast('今天已经有这个动作');
  const { ex, g } = hit, unit = ex.u === '秒' || ex.u === '分钟' ? ex.u : '次';
  // 加在拉伸前面
  const at = day.exercises.findIndex(e => e.isStretch);
  const item = { name: ex.n, sets: 3, reps: unit === '秒' ? (ex.hold || 30) : unit === '分钟' ? 10 : 12, unit, note: ex.note || '', group: g, diff: ex.diff, bi: !!ex.bi, muscle: ex.muscle || [] };
  if (at < 0) day.exercises.push(item);
  else {
    // 插入会让后面的按下标状态错位：整体后移一格
    const oldLen = day.exercises.length;
    ['weights', 'exRpe'].forEach(k => { if (S[k]) for (let j = oldLen - 1; j >= at; j--) { const v = S[k][day.date + '-' + j]; if (v !== undefined) S[k][day.date + '-' + (j + 1)] = v; delete S[k][day.date + '-' + j] } });
    if (S.adj) for (let j = oldLen - 1; j >= at; j--) ['s', 'r'].forEach(f => { const v = S.adj[`${day.date}-${j}-${f}`]; if (v !== undefined) S.adj[`${day.date}-${j + 1}-${f}`] = v; delete S.adj[`${day.date}-${j}-${f}`] });
    if (S.prog[day.date]) for (let j = oldLen - 1; j >= at; j--) { const v = S.prog[day.date][j]; if (v !== undefined) S.prog[day.date][j + 1] = v; delete S.prog[day.date][j] }
    day.exercises.splice(at, 0, item);
  }
  saveState(); render();
  btn.textContent = '已加'; btn.disabled = true;
  showToast(`已加到今天：${name}`);
}

// ── 对话 ──
let _coachPendingImg = null;
function coachNewChat() {
  const st = _coachLoad();
  if (st.chat?.length && !confirm('开始新对话？之前的对话会清掉。')) return;
  st.chat = []; delete st.chatCtx; _coachSave(st); _coachShowChat();
}
function _coachShowChat(streaming) {
  const el = document.getElementById('co-chat-log');
  if (!el) return;
  const chat = _coachLoad().chat || [];
  el.innerHTML = chat.length ? chat.map(m => `<div class="co-msg ${m.role}">${m.img ? '<div class="co-meta">[图片]</div>' : ''}${m.role === 'assistant' ? _coachMd(m.text) : _esc(m.text).replace(/\n/g, '<br>')}${m.meta ? _coachCostLine(m.meta) : ''}</div>`).join('')
    + (streaming ? `<div class="co-msg assistant" id="co-stream"><span class="co-meta">思考中…</span></div>` : '')
    : '<div class="co-meta">比如：「我深蹲总是膝盖往里扣怎么办」「这周只能练两次，怎么安排」「今天很累还要练吗」</div>';
  el.scrollTop = el.scrollHeight;
}
async function coachAttach(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  try { _coachPendingImg = await _coachImage(f, 1024) } catch (e) { return showToast(e.message) }
  document.getElementById('co-chat-img').innerHTML = `<div class="co-pending"><img src="${_coachPendingImg}"><button class="co-link" onclick="_coachPendingImg=null;this.parentNode.remove()">移除</button></div>`;
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
  st.chat.push({ role: 'user', text: text || '(看图)', img: !!img });
  st.chat = st.chat.slice(-COACH_CHAT_MAX);
  _coachSave(st);
  ta.value = ''; _coachPendingImg = null; document.getElementById('co-chat-img').innerHTML = '';
  _coachShowChat(true);
  _coachBusy('co-chat-go', true, '…');
  const send = st.chat.slice(-COACH_CHAT_SEND).map(m => ({ role: m.role, text: m.text }));
  while (send.length && send[0].role !== 'user') send.shift();
  let acc = '', meta = null, err = null;
  try {
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
        if (ev === 'delta') { acc += j.t; const s = document.getElementById('co-stream'); if (s) { s.innerHTML = _coachMd(acc); s.parentNode.scrollTop = s.parentNode.scrollHeight } }
        else if (ev === 'done') { acc = j.text || acc; meta = { model: j.model, effort: j.effort, cost: j.cost } }
        else if (ev === 'error') err = j.error;
      }
    }
  } catch (e) { err = e.message }
  const st2 = _coachLoad();
  st2.chat = st2.chat || [];
  if (acc) st2.chat.push({ role: 'assistant', text: acc, meta });
  else st2.chat.pop(); // 失败就撤回刚才那条，免得历史里两条用户消息连在一起
  _coachSave(st2);
  if (!acc) ta.value = text;
  _coachShowChat();
  _coachBusy('co-chat-go', false);
  if (err) showToast(err);
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
