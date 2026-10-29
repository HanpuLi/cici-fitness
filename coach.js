// ══ AI 教练 ═══════════════════════════════════════════════
// 后端在家里主力机(~/fitness-coach，Funnel /fit)，key 不进前端；用 app 自己的 Firebase 登录鉴权。
// 隐私：门控分两种用途(2026-10-29 起;Cait「我的所有动作都需要对ai可见」)——
//   发给自己的 AI(_coachGated / _coachHidePriv):owner 会话什么都不拦,私密池动作、私密日真实内容、带 subMetrics 的记录都进快照;
//     非 owner 照旧拦私密池 + 盆底、私密日只报「另有安排」、带 subMetrics 的记录不进,另有 getExcluded() 兜底。
//   给别人看 / 会被别人看到(_shareGated,share=true):搭子共享文档、推送快照和推送文字,永远照旧拦,owner 也一样。
// 对话只存本机(nsKey 命名空间)，不进云同步。
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
// 当前账号此刻真能排的动作：过 getExcluded() + 器械 + 门控(非 owner 拦私密池 + 盆底；owner 全给自己的 AI)
function _coachCatalogMap(priv = _coachGated()) {
  const excluded = getExcluded(), hasPool = S.equip.includes('泳池'), m = new Map();
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
function _coachCatalog(full, gated) {
  const out = {};
  _coachCatalogMap(gated).forEach(({ ex, g }) => {
    const t = ex.u === '秒' || ex.u === '分钟' ? `|${ex.u}${ex.hold ? ' ' + ex.hold : ''}` : '';
    (out[g] = out[g] || []).push(full ? `${ex.n}|${(ex.muscle || []).join('/')}|难度${ex.diff || 1}${t}` : ex.n);
  });
  return out;
}
// 哪些打卡记录能给 AI / 搭子看:私密模式的(带 subMetrics)、私密日的不给;owner 自己的 AI 全给。share=true(搭子 / 推送)永远不给
function _coachLogOk(share) {
  if (!_coachHidePriv(share)) return l => !!l;
  const privDays = new Set((S.plan?.days || []).filter(d => d.isPrivateDay).map(d => d.date));
  return l => l && !l.subMetrics && !privDays.has(l.date);
}
const _COACH_FEEL = { 4: '轻松', 6.5: '刚好', 8.5: '吃力' };
function _coachFeel(date, i) { const v = typeof getExRpe === 'function' ? getExRpe(date, i) : null; return v == null ? null : (_COACH_FEEL[v] || `RPE ${v}`) }
// 一次打卡 → 快照里的一条(动作串格式后端会解析:「名字 [12.5kg ]3×12次[ 未做]」,别改;感受另放 feel)
// withSub:带上自定义指标 subMetrics(只有 owner 自己的 AI 快照传 true)
function _coachLogItem(l, okEx, withNote, withSub) {
  const ex = [], feel = {};
  (l.exercises || []).forEach((e, i) => {
    if (!okEx(e.name)) return;
    ex.push(`${e.name}${e.weight ? ' ' + e.weight + 'kg' : ''} ${e.sets}×${e.reps}${e.unit || ''}${e.done === false ? ' 未做' : ''}`);
    const f = _coachFeel(l.date, i); if (f) feel[e.name] = f;
  });
  if (!ex.length) return null;
  return { date: l.date, workout: l.workout, min: l.duration, rpe: l.rpe, ex, ...(Object.keys(feel).length ? { feel } : {}), ...(withNote && l.note ? { note: l.note } : {}), ...(withSub && l.subMetrics ? { subMetrics: l.subMetrics } : {}) };
}
// 更早的记录按月压成一行:几次、平均 RPE、总分钟、练了哪些类型
function _coachHistory(logs, before) {
  const by = {};
  logs.filter(l => l.date < before).forEach(l => {
    const m = l.date.slice(0, 7), x = by[m] || (by[m] = { month: m, sessions: 0, minutes: 0, rpe: [], types: {} });
    x.sessions++; x.minutes += +l.duration || 0; if (l.rpe) x.rpe.push(+l.rpe);
    const t = String(l.workout || '其他').slice(0, 12); x.types[t] = (x.types[t] || 0) + 1;
  });
  return Object.values(by).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .map(x => ({ month: x.month, sessions: x.sessions, minutes: x.minutes, ...(x.rpe.length ? { avgRpe: Math.round(x.rpe.reduce((a, b) => a + b, 0) / x.rpe.length * 10) / 10 } : {}), types: x.types }));
}
// 每个动作最近几次的重量(最近练过的动作排前面)
function _coachWeights(okEx, per = 6, maxN = 40) {
  return Object.fromEntries(Object.entries(typeof W_HIST !== 'undefined' ? W_HIST : {})
    .filter(([n, h]) => okEx(n) && Array.isArray(h) && h.length)
    .sort((a, b) => String(b[1][b[1].length - 1].date).localeCompare(String(a[1][a[1].length - 1].date)))
    .slice(0, maxN)
    .map(([n, h]) => [n, h.slice(-per).map(x => `${String(x.date).slice(5)} ${x.weight}kg${x.reps ? '×' + x.reps : ''}${x.rpe ? ' RPE' + x.rpe : ''}`)]));
}
// 连续打卡天数、本月统计、成就(只数能给人看的记录);gated = 调用方那一路的门控
function _coachStats(logs, gated = _coachGated()) {
  const today = todayStr(), m = today.slice(0, 7), dates = new Set(logs.map(l => l.date));
  let streak = 0;
  for (let i = 0; i < 365; i++) { if (dates.has(addDays(today, -i))) streak++; else if (i > 0) break; }
  const ml = logs.filter(l => l.date.startsWith(m)), rp = ml.filter(l => l.rpe);
  const ach = (L, kind) => ((L && L.milestones) || []).map(x => `${kind}·${x.title}${x.date ? '(' + x.date + ')' : ''}`);
  return {
    streakDays: streak, totalSessions: logs.length,
    thisMonth: { sessions: ml.length, minutes: ml.reduce((a, l) => a + (+l.duration || 0), 0), ...(rp.length ? { avgRpe: Math.round(rp.reduce((a, l) => a + +l.rpe, 0) / rp.length * 10) / 10 } : {}), prs: PR_LIST.filter(p => p.date && p.date.startsWith(m) && !gated.has(p.exercise)).length },
    achievements: [...ach(typeof GYM_LOG !== 'undefined' ? GYM_LOG : null, '力量'), ...ach(typeof SWIM_LOG !== 'undefined' ? SWIM_LOG : null, '游泳')],
  };
}
// 今天的实时状态:做到哪个动作第几组、每个动作的感受、开练时间和用时、组间倒计时。私密日 / 门控动作不给(owner 自己的 AI 给);
// share=true(搭子共享文档)照旧不给
function _coachTodayState(focusName, share) {
  const date = todayStr(), d = S.plan?.days?.find(x => x.date === date);
  if (!d) return { date, status: '没有计划' };
  if (d.isPrivateDay && _coachHidePriv(share)) return { date, status: '另有安排' };
  if (d.isRest) return { date, status: '休息日' };
  const gated = share ? _shareGated() : _coachGated(), pd = S.prog[date] || {}, lg = LOG.find(l => l.date === date);
  const sp = (typeof _spSetsAll === 'function' ? _spSetsAll()[date] : null) || {};
  const exercises = [];
  d.exercises.forEach((e, i) => {
    if (gated.has(e.name)) return;
    const sets = getAdj(date, i, 's', e.sets), reps = getAdj(date, i, 'r', e.reps), done = !!pd[i];
    const w = needsWeightUI(e) ? getWeight(date, i) : null, sug = needsWeightUI(e) && w == null ? suggestWeight(e.name) : null, f = _coachFeel(date, i);
    exercises.push({
      name: e.name, sets, reps, unit: e.unit || '次', ...(w != null ? { kg: w } : sug ? { kgSuggested: sug } : {}),
      setsDone: done ? sets : Math.min((sp.s && sp.s[i]) || 0, sets), done, ...(f ? { feel: f } : {}),
      ...(e.isWarmup ? { block: '热身' } : e.isStretch && !isWeightedMove(e.name) ? { block: '拉伸' } : {}),
    });
  });
  // 现在在做的:运动风格的焦点卡(钉住的 / 第一个没做完的主项);纸墨同一套规则
  let cur = null;
  if (typeof _spDayState === 'function') { const st = _spDayState(d); cur = st.cur ? st.cur[1] : null }
  else cur = d.exercises.findIndex((e, i) => !pd[i] && !e.isWarmup && !(e.isStretch && !isWeightedMove(e.name)));
  const ce = cur != null && cur >= 0 ? d.exercises[cur] : null;
  const t0 = sp.t0 || 0, started = !!t0 || Object.values(pd).some(Boolean);
  const out = { date, type: d.workoutType, status: lg ? '已打卡' : started ? '训练中' : '没开练', exercises };
  if (t0) { const t = new Date(t0); out.startedAt = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; out.elapsedMin = Math.round((Date.now() - t0) / 60000) }
  if (ce && !gated.has(ce.name) && !lg) { const x = exercises.find(z => z.name === ce.name); if (x) out.current = { name: ce.name, set: Math.min(x.setsDone + 1, x.sets), of: x.sets } }
  if (focusName && !gated.has(focusName) && exercises.some(z => z.name === focusName)) out.askingAbout = focusName;
  if (typeof _timerEndTime !== 'undefined' && _timerEndTime > Date.now() && document.getElementById('universal-timer')?.classList.contains('show')) out.timer = { label: _timerKind === '组间休息' ? '组间休息' : '计时', leftSec: Math.ceil((_timerEndTime - Date.now()) / 1000) };
  if (lg) out.logged = { rpe: lg.rpe, min: lg.duration, ...(lg.subMetrics && !_coachHidePriv(share) ? { subMetrics: lg.subMetrics } : {}) };
  return out;
}
// 每条消息都带的实时状态(只放进那一条,不进缓存前缀)
function buildCoachLive(focusName) { return { today: _coachTodayState(focusName) } }
// 搭子分享出来的训练数据(对方 app 已经按 _shareGated 过滤过;这里再按 _shareGated 过一遍,字串截短。是别人的数据,owner 也照拦)
function _coachPartner() {
  const pp = typeof _partnerProfile !== 'undefined' ? _partnerProfile : null;
  if (!pp || typeof partnerUid !== 'function' || !partnerUid()) return null;
  if (pp.aiOk === false) return null;   // 搭子在「共享给 TA」里关了「允许 TA 的 AI 教练参考我的数据」:整块不进快照(靠这边的 app 照办)
  const gated = _shareGated(), str = (v, n) => String(v ?? '').slice(0, n);
  const clean = v => typeof v === 'string' ? ([...gated].some(g => v.includes(g)) ? null : str(v, 120)) : Array.isArray(v) ? v.map(clean).filter(x => x != null).slice(0, 60)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !gated.has(k)).slice(0, 60).map(([k, x]) => [str(k, 40), clean(x)]).filter(([, x]) => x != null)) : typeof v === 'number' || typeof v === 'boolean' ? v : null;
  const t = pp.train && typeof pp.train === 'object' ? pp.train : null;
  return { name: str(pp.name || '搭子', 20), today: str(pp.todayType || '—', 20), todayDone: !!pp.todayDone, lastActive: str(pp.lastActive, 10),
    ...(t ? { plan: clean(t.plan), recentLogs: clean(t.logs), history: clean(t.history), weights: clean(t.weights), stats: clean(t.stats) } : { note: '搭子的 app 还没升级，只有今天的类型' }),
    // 搭子关掉没共享的类(免得 AI 把「没共享」当成「没练」)
    ...(Array.isArray(pp.off) && pp.off.length ? { notShared: pp.off.slice(0, 8).map(k => typeof shareCatLabel === 'function' ? shareCatLabel(k) : str(k, 12)) } : {}) };
}
// 给 AI 的数据快照。非 owner:私密池 / 盆底动作、私密日、私密模式的记录不进,另有 getExcluded() 兜底;owner 自己的 AI 全进(含 subMetrics)。
// opts:catalog('names' / 'full')、logDays(明细天数,默认 42)、live(false 不带今天的实时状态)、partner(false 不带搭子)、
// share(true = 会被别人看到的用途,按 _shareGated 照旧全拦,owner 也一样)。「主动找你」的推送快照用 share:true(推送文字上锁屏)
function buildCoachContext(opts = {}) {
  const today = todayStr(), share = !!opts.share, gated = share ? _shareGated() : _coachGated(), hide = _coachHidePriv(share);
  const okEx = n => !gated.has(n);
  const sch = currentScheme();
  const logOk = _coachLogOk(share), logs = LOG.filter(logOk).sort((a, b) => a.date.localeCompare(b.date));
  const from = addDays(today, -(opts.logDays || 42));
  const ctx = {
    settings: {
      goal: S.goal, level: S.level, daysPerWeek: S.days, minutesPerSession: S.dur, equipment: S.equip, focus: S.focus,
      limits: S.limits || '无', volumeMultiplier: S.volumeMultiplier || 1, restSec: S.restDur,
      scheme: sch ? { sets: sch.sets[S.level], reps: sch.reps[S.level], restSec: sch.rest } : null,
      ...(S.equip.includes('泳池') ? { swimLevel: S.swimLevel } : {}),
      ...(S.cycleEnabled && S.periodMode ? { periodMode: true } : {}),
    },
    userExcluded: (S.userExcluded || []).filter(okEx).map(n => n + (S.userExcludeReasons?.[n] ? `(${S.userExcludeReasons[n]})` : '')),
    recentLogs: logs.filter(l => l.date >= from).map(l => _coachLogItem(l, okEx, true, !hide)).filter(Boolean),
    history: _coachHistory(logs, from),
    weightHistory: _coachWeights(okEx),
    stats: _coachStats(logs, gated),
    body: BODY_LOG.slice(-12),
    prs: PR_LIST.filter(p => okEx(p.exercise)).slice(-15),
  };
  if (opts.live !== false) ctx.today = _coachTodayState(undefined, share);
  if (S.plan && S.plan.days) {
    ctx.upcoming = S.plan.days.filter(d => d.date >= today).slice(0, 14).map(d =>
      d.isPrivateDay && hide ? { date: d.date, type: '(另有安排)' } :
        d.isRest ? { date: d.date, type: '休息' } :
          { date: d.date, type: d.workoutType, ex: d.exercises.filter(e => okEx(e.name)).map(e => `${e.name} ${e.sets}×${e.reps}${e.unit}`) });
    // 计划里要上重量的动作，app 下次会建议多少 kg(AI 复盘调重量时参考)
    const nx = {};
    S.plan.days.filter(d => d.date >= today && !(d.isPrivateDay && hide)).forEach(d => d.exercises.forEach(e => {
      if (okEx(e.name) && !nx[e.name] && needsWeightUI(e)) { const w = suggestWeight(e.name); if (w) nx[e.name] = w }
    }));
    ctx.nextSuggestedKg = nx;
    // 最近自动顺延过哪几天(没练 → 后面的训练往后挪;标记日不会是私密日,类型名再按门控过一遍)
    const sh = typeof autoShiftFacts === 'function' ? autoShiftFacts().filter(x => ![...gated].some(g => x.planned.includes(g))) : [];
    if (sh.length) ctx.autoShifted = sh;
  }
  if (opts.catalog) ctx.catalog = _coachCatalog(opts.catalog === 'full', gated);
  // 开了周期功能、而且自己设过第几天:当前周期阶段(「计划 → 06」里手动设的,不会自动往后数;setOn = 最后一次设的日子)。
  // 周期功能默认是开的、默认第 1 天:从没设过的人不发,免得 AI 对没设过(或没有周期)的人说「今天经期第一天」
  if (S.cycleEnabled !== false && S.cycleSetAt && typeof cyclePhase === 'function') {
    const day = +S.cycleDay || 1, length = +S.cycleLength || 28;
    ctx.cycle = { phase: cyclePhase(day, length).name, day, length, setOn: S.cycleSetAt };
  }
  if (opts.partner !== false) { const p = _coachPartner(); if (p) ctx.partner = p }
  return ctx;
}
// 搭子互通:写进共享文档的训练数据(计划、记录、重量、感受)。会被搭子看到 → 一律走 _shareGated / share=true(owner 也照拦),
// 另外不放身体数据(体重围度、身体情况、周期)、不放打卡备注原文(可能写了身体情况);只放最近一段 + 按月汇总,控制文档大小
// plan 每天带 k(g 健身房 / s 游泳 / r 休息 / p 另有安排 / x 别的):对方排计划对齐、周历算同一天同类用它(app.js partnerKindOn),
// AI 排的游泳日类型名不一定带「游泳」,所以不靠类型名猜
function coachSharedTraining() {
  const today = todayStr(), gated = _shareGated(), okEx = n => !gated.has(n);
  const logs = LOG.filter(_coachLogOk(true)).sort((a, b) => a.date.localeCompare(b.date)), from = addDays(today, -42);
  const td = S.plan?.days?.find(d => d.date === today);
  const t = {
    v: 1, at: today,
    plan: (S.plan?.days || []).filter(d => d.date >= today).slice(0, 14).map(d => d.isPrivateDay ? { date: d.date, type: '另有安排', k: 'p' } : d.isRest ? { date: d.date, type: '休息', k: 'r' }
      : { date: d.date, type: d.workoutType, k: d.isSwimDay ? 's' : d.workoutType === '轻量替代' ? 'x' : 'g', ex: d.exercises.filter(e => okEx(e.name)).map(e => `${e.name} ${e.sets}×${e.reps}${e.unit}`) }),
    today: td && !td.isPrivateDay && !td.isRest ? (() => { const s = _coachTodayState(undefined, true); return { status: s.status, done: (s.exercises || []).filter(e => e.done).length, total: (s.exercises || []).length } })() : null,
    logs: logs.filter(l => l.date >= from).map(l => _coachLogItem(l, okEx, false)).filter(Boolean),
    history: _coachHistory(logs, from),
    weights: _coachWeights(okEx, 5, 30),
    stats: (({ streakDays, totalSessions, thisMonth, achievements }) => ({ streakDays, totalSessions, thisMonth: { sessions: thisMonth.sessions, minutes: thisMonth.minutes }, achievements }))(_coachStats(logs, gated)),
    // 最近几批没练自动顺延:只有批次 id(sh-日期-没练那天)和日期,撤销过的标 undone;搭子那边据此跟着对齐(core.js _shFollowRun)。
    // 只放自己的顺延批次,不放「跟着搭子对齐」的改动(否则两边来回跟)
    shifts: ((S.plan && S.plan.shifts) || []).slice(-4).map(b => ({ id: String(b.id || '').slice(0, 40), at: String(b.at || '').slice(0, 10), ...(b.state !== 'on' ? { undone: true } : {}) })),
  };
  // Firestore 单文档 1MB:这里卡在 200KB 以内(正常十几 KB),超了先砍最早的明细再砍重量
  while (JSON.stringify(t).length > 200000 && (t.logs.length > 7 || Object.keys(t.weights).length > 5)) {
    if (t.logs.length > 7) t.logs = t.logs.slice(Math.ceil(t.logs.length / 4)); else t.weights = Object.fromEntries(Object.entries(t.weights).slice(0, 5));
  }
  return t;
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
  c.innerHTML = `<div id="co-chat-ref"></div><div id="co-chat-img"></div><div class="composer-row">`
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
  _coachRefPaint();
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
    + `<div class="kv"><span class="k">本月</span><span>已用 $${Number(me.cycle || 0).toFixed(2)}</span><span class="k">今天</span><span>$${Number(me.today || 0).toFixed(2)}${me.daily_cap ? ` / 上限 $${Number(me.daily_cap).toFixed(2)}` : ''}</span><span class="k">额度</span><span>每天有上限；每月 17 号重置</span></div>`)
    + coachMemSectionHtml();
}
// ── 我 → 05「教练记住的事」:长期记忆存在后端(按账号),这里列出、逐条删、全清 ──
// 列表缓存在内存(window._coachMem,按 uid);对话里记住 / 忘掉了什么会把缓存作废,下次画「我」时重新读
function coachMemSectionHtml() {
  const uid = _coachUser()?.uid ?? null;
  let mem = window._coachMem && window._coachMemUid === uid ? window._coachMem : null;
  if (!mem) { mem = { loading: true }; coachMemLoad() }
  return skinTpl('meAIMem', { mem }, ({ mem }) => `<div class="co-mem" id="co-mem"><span class="sub-label" style="margin-top:4px">教练记住的事</span>`
    + (mem.loading ? `<span class="note-line" role="status">读取中…</span>`
      : mem.err ? `<span class="note-line co-err">${_esc(mem.err)}</span><button type="button" class="link-btn u" style="align-self:flex-start" onclick="coachMemLoad(true)">再试一次</button>`
        : !mem.items.length ? `<span class="note-line">还没有。在对话里跟教练说「记住……」，伤病、偏好、目标这些它会记下，开新对话也不忘。</span>`
          : `<div class="co-memlist">${mem.items.map(x => `<div class="co-mem-row"><span class="t">${_esc(x.text)}<small>${_esc(String(x.at || '').slice(5, 10).replace('-', '/'))}${x.src === 'quick' ? ' · 陪练' : ''}</small></span><button type="button" class="link-btn u" data-id="${_esc(x.id)}" onclick="coachMemDelete(this.dataset.id)" aria-label="删掉：${_esc(x.text)}">删掉</button></div>`).join('')}</div>`
          + `<button type="button" class="btn-line" style="align-self:flex-start" onclick="coachMemClear()">全部清空</button>`)
    + `<span class="foot-note">记在家里的服务器上，只给你自己的教练看；私密内容不会记。</span></div>`);
}
let _coachMemBusy = false;
async function coachMemLoad(force) {
  if (_coachMemBusy || coachAccess() !== 'on') return;
  const uid = _coachUser()?.uid ?? null;
  if (!force && window._coachMem && window._coachMemUid === uid && !window._coachMem.loading) return;
  _coachMemBusy = true;
  let mem;
  try { const r = await _coachFetch('/api/memory'); mem = { items: Array.isArray(r.items) ? r.items : [] } }
  catch (e) { mem = { items: [], err: e.code === 404 ? '后端还没升级，暂时看不了' : e.message } }
  _coachMemBusy = false;
  window._coachMem = mem; window._coachMemUid = uid;
  if (typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'me' && typeof uiRenderMeAI === 'function') uiRenderMeAI();
}
async function _coachMemPost(body, okMsg) {
  try {
    const r = await _coachFetch('/api/memory', body);
    window._coachMem = { items: r.items || [] };
    showToast(okMsg);
  } catch (e) {
    if (e.info && Array.isArray(e.info.items)) window._coachMem = { items: e.info.items };
    showToast(e.message);
  }
  window._coachMemUid = _coachUser()?.uid ?? null;
  if (typeof uiRenderMeAI === 'function') uiRenderMeAI();
}
function coachMemDelete(id) { if (id) return _coachMemPost({ op: 'delete', id }, '删掉了 · 教练以后不再参考这条') }
function coachMemClear() {
  const n = (window._coachMem?.items || []).length;
  if (!n || !confirm(`清空教练记住的 ${n} 件事？清了就找不回来。`)) return;
  return _coachMemPost({ op: 'clear' }, '清空了');
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
  // 最近两周一次都没练(或只有私密模式的记录;owner 的私密模式记录也算):没东西可复盘,不自动花这笔钱
  if (!LOG.some(l => l.date >= addDays(today, -14) && (!l.subMetrics || !_coachHidePriv()))) return;
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
  if (b) { b.textContent = `采纳所选 ${n} 条`; b.disabled = !n; }
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
  // 刚采纳的那几条能撤销(只留最近一次采纳的快照);下面是「改一下 / 聊聊」
  const undo = rv.snap && (rv.cur || 0) === rv.snap.ver ? rv.snap.idx.length : 0, rvb = _coachRvHtml('review', '');
  el.innerHTML = skinTpl('logReview', { rv, adj, left, applied, undo, rvb }, () => `<div class="co-rv"><div class="rv-h">${_esc(rv.headline)}<span class="accent">.</span></div>
    ${_coachMd(rv.summary)}
    ${rv.wins?.length ? `<div class="co-rv-t">做得好</div><ul>${li(rv.wins)}</ul>` : ''}
    ${rv.issues?.length ? `<div class="co-rv-t">要注意</div><ul>${li(rv.issues)}</ul>` : ''}
    ${adj ? `<div class="sub-label" style="margin-top:4px">建议调整 · 勾选后一键采纳</div><div id="co-adj-list">${adj}</div>
      ${left > 0 ? `<button class="btn-primary" id="co-adopt" onclick="coachApplyReview()">采纳所选 ${left} 条</button>` : `<div class="note-line olive">✓ 已采纳 ${applied.length} 条</div>`}` : ''}
    ${undo ? `<button type="button" class="link-btn u" style="align-self:flex-start" onclick="coachReviewUndo()">撤销刚才采纳的 ${undo} 条</button>` : ''}
    ${_coachCostLine(rv)}${rvb}</div>`);
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
  // 撤销用的快照:只撤这次采纳的几条(设置原值、AI 建议重量原值;要重排的话连今天起的计划一起存)
  const today = todayStr(), snap = { ver: rv.cur || 0, idx: [], set: {}, aiW: {}, stale: !!S.planStale, from: today };
  _COACH_RV_SET.forEach(k => { if (k in S) snap.set[k] = JSON.parse(JSON.stringify(S[k])) });
  const days0 = _coachDaySnap((S.plan?.days || []).filter(d => d.date >= today).map(d => d.date));
  picks.forEach(i => {
    const a = rv.adjustments[i], v = Number(a.value);
    if (a.type === 'weight') {
      if (!(v > 0 && v < 500) || !cat.has(a.exercise)) return;
      if (!(a.exercise in snap.aiW)) snap.aiW[a.exercise] = S.aiWeights?.[a.exercise] ?? null;
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
  // 「重排计划」那条只是跳去 AI 排,本身不改东西;其余的留快照(覆盖上一次采纳的)
  snap.idx = done.filter(i => rv.adjustments[i].type !== 'replan');
  if (regen && S.plan) snap.plan = days0;
  if (snap.idx.length) rv.snap = snap; else delete rv.snap;
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
// 复盘采纳会动的设置(撤销时按快照放回去;快照里没有的键 = 原来就没设,删掉)
const _COACH_RV_SET = ['volumeMultiplier', 'dur', 'days', 'userExcluded', 'userExcludeReasons'];
// 计划里一批天的快照 / 恢复(复盘采纳、AI 排计划草稿采纳的撤销用;规矩同提议卡的 _coachPropUndo)
function _coachDaySnap(dates) {
  const pick = (o, date) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => k.startsWith(date + '-')));
  const out = { dates: [...dates], days: {}, st: {} };
  dates.forEach(date => {
    const d = S.plan?.days?.find(x => x.date === date);
    out.days[date] = d ? JSON.parse(JSON.stringify(d)) : null;
    out.st[date] = { prog: S.prog[date] ? { ...S.prog[date] } : null, w: pick(S.weights, date), a: pick(S.adj, date), r: pick(S.exRpe, date) };
  });
  return out;
}
// 采纳以后已经打卡、或者又勾了新动作的天不回滚(返回这样的天数);快照里原来没有的天删掉;已经过去的天不动。
// from:这天起计划里冒出来、快照里没有的天也删掉(复盘重排可能多排出几天)
function _coachDayRestore(sn, from) {
  const today = todayStr(), dates = new Set(sn.dates);
  if (from) (S.plan?.days || []).forEach(d => { if (d.date >= from) dates.add(d.date) });
  let kept = 0;
  dates.forEach(date => {
    if (date < today || !S.plan) return;
    const i = S.plan.days.findIndex(x => x.date === date), s0 = sn.st[date] || {};
    const now = Object.values(S.prog[date] || {}).filter(Boolean).length, was = Object.values(s0.prog || {}).filter(Boolean).length;
    if (LOG.some(l => l.date === date) || now > was) { kept++; return }
    const d0 = sn.days[date];
    if (d0) { if (i >= 0) S.plan.days[i] = d0; else S.plan.days.push(d0) }
    else if (i >= 0) S.plan.days.splice(i, 1);
    if (s0.prog) S.prog[date] = s0.prog; else delete S.prog[date];
    [['weights', 'w'], ['adj', 'a'], ['exRpe', 'r']].forEach(([k, sk]) => {
      S[k] = S[k] || {};
      Object.keys(S[k]).forEach(x => { if (x.startsWith(date + '-')) delete S[k][x] });
      Object.assign(S[k], s0[sk] || {});
    });
  });
  if (S.plan) S.plan.days.sort((a, b) => a.date.localeCompare(b.date));
  return kept;
}
// 撤销最近一次采纳的复盘调整:设置、AI 建议重量放回去;那次重排过计划的,今天起的计划也回到采纳前;那几条回到没采纳
function coachReviewUndo() {
  const st = _coachLoad(), rv = st.review, sn = rv && rv.snap;
  if (!sn) return;
  _COACH_RV_SET.forEach(k => { if (k in sn.set) S[k] = sn.set[k]; else delete S[k] });
  Object.entries(sn.aiW || {}).forEach(([k, v]) => { S.aiWeights = S.aiWeights || {}; if (v == null) delete S.aiWeights[k]; else S.aiWeights[k] = v });
  const kept = sn.plan ? _coachDayRestore(sn.plan, sn.from) : 0;
  S.planStale = sn.stale;
  const v = (rv.cur || 0) === sn.ver ? rv : rv.vers && rv.vers[sn.ver];
  if (v) v.applied = (v.applied || []).filter(i => !sn.idx.includes(i));
  delete rv.snap;
  _coachSave(st);
  saveState();
  if (typeof applySettingsToUI === 'function') applySettingsToUI();
  if (typeof updateStaleBar === 'function') updateStaleBar();
  render();
  coachRenderReview();
  showToast(kept ? `已撤销 · ${kept} 天已经开练或打卡，没回滚` : '已撤销 · 回到采纳前');
}

// ── 排计划(在「计划 → 08」选 AI 排) ──
function _coachPlanDates(span) {
  const today = todayStr(), out = [];
  for (let i = 0; i < span; i++) {
    const ds = addDays(today, i);
    const d = S.plan?.days?.find(x => x.date === ds);
    if (d && ((d.isPrivateDay && _coachHidePriv()) || isLocked(d) || isDone(d))) continue;   // 私密日:owner 的 AI 也能排
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
    // 已配对、开着「排计划时跟搭子对齐」:把搭子这几天练什么和对齐规则一起带上(后端写进提示词);搭子的计划只当参考,不会被改
    const align = typeof partnerAlignForAI === 'function' ? partnerAlignForAI(dates) : null;
    const request = document.getElementById('co-plan-req')?.value || '';
    const r = await _coachFetch('/api/plan', {
      context: buildCoachContext({ catalog: 'full' }), dates, ...(align ? { align } : {}),
      request, ..._coachOpts('plan')
    });
    const draft = _coachValidatePlan(r.data, dates);
    draft.model = r.model; draft.effort = r.effort; draft.cost = r.cost;
    draft.dates = dates; draft.req = request;   // 「改一下」照原来的日期和要求再排
    _rvOpen.delete('plan:'); _rvDraft.delete('plan:');
    if (align && typeof partnerAlignCount === 'function') draft.align = partnerAlignCount(draft.days);
    else if (typeof partnerAlignOffNote === 'function' && partnerAlignOffNote(true)) draft.align = { text: partnerAlignOffNote(true) };   // 开着对齐但搭子没共享计划 / 不许 AI 参考:说一句这次没对齐
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
      if (!hit || seen.has(e.name)) { if (!hit && !_coachGated().has(e.name)) dropped.push(e.name); return }   // 门控动作的名字不往界面上写
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
  const al = dr.align;   // 跟搭子对齐了几天(_coachValidatePlan 之后按草稿现算的)
  // 采纳过:收成一行「已写进计划 N 天 · 撤销 / 收起」;撤销以后草稿回到待定
  if (dr.state === 'applied') {
    el.innerHTML = skinTpl('planDraftDone', { dr }, () => `<div class="co-rv" style="border-top:1px solid var(--line);padding-top:12px"><div class="note-line olive">✓ AI 排的 ${dr.appliedN || 0} 天已经写进计划</div>
      <div style="display:flex;gap:20px">${dr.snap ? `<button type="button" class="link-btn u" onclick="coachPlanUndo()">撤销，回到采纳前</button>` : ''}<button type="button" class="link-btn u" onclick="coachDropPlan()">收起</button></div></div>`);
    return;
  }
  // 多于一天:每天前面一个勾选框,「采纳」只写勾上的那几天(dr.off = 没勾的日期)
  const sel = dr.days.length > 1, off = new Set(dr.off || []), selN = dr.days.filter(d => !off.has(d.date)).length;
  const label = selN === dr.days.length ? '采纳这份计划' : `采纳所选 ${selN} 天`, rvb = _coachRvHtml('plan', '');
  el.innerHTML = skinTpl('planDraft', { dr, al, sel, off, selN, label, rvb }, () => `<div class="co-rv" style="border-top:1px solid var(--line);padding-top:12px"><div class="sec-label">[ AI 排 ] 预览 · ${_esc(dr.at || '')}</div>${_coachMd(dr.rationale)}
    ${al ? `<div class="co-meta co-align">${_esc(al.text)}</div>` : ''}
    ${dr.dropped?.length ? `<div class="co-meta co-err">已去掉 ${dr.dropped.length} 个不在你动作库里的：${_esc(dr.dropped.join('、'))}</div>` : ''}
    ${sel ? `<div class="sub-label" style="margin-top:4px">不想要的那天去掉勾</div>` : ''}
    ${dr.days.map(d => `<div class="co-day">${sel ? `<button type="button" class="adj-row co-day-sel" style="border-top:0;padding:4px 0" role="checkbox" aria-checked="${!off.has(d.date)}" data-d="${_esc(d.date)}" onclick="coachPlanSel(this)">${uiBoxSq()}<span class="what co-day-h">${_esc(fmtDate(d.date))} · ${_esc(d.workoutType)}</span></button>` : `<div class="co-day-h">${_esc(fmtDate(d.date))} · ${_esc(d.workoutType)}</div>`}
      ${d.isRest ? '' : `<div class="co-day-ex">${d.exercises.map(e => `<button type="button" data-act="detail" data-name="${_esc(e.name)}">${_esc(e.name)} <small>${e.sets}×${e.reps}${_esc(e.unit)}</small></button>`).join('')}</div>`}</div>`).join('')}
    <div class="btn-row"><button class="btn-primary" id="co-plan-adopt" style="min-height:44px;font-size:14px" onclick="coachApplyPlan()"${selN ? '' : ' disabled'}>${label}</button><button class="btn-line" onclick="coachDropPlan()">不要了</button></div>
    ${_coachCostLine(dr)}${rvb}</div>`);
}
// 草稿里勾 / 不勾某一天:记进 dr.off(存本机),按钮跟着改字
function coachPlanSel(btn) {
  const st = _coachLoad(), dr = st.planDraft, date = btn && btn.dataset.d;
  if (!dr || dr.state === 'applied' || !date) return;
  const on = uiToggleBox(btn), off = new Set(dr.off || []);
  if (on) off.delete(date); else off.add(date);
  dr.off = [...off].sort();
  _coachSave(st);
  const n = dr.days.filter(d => !off.has(d.date)).length, b = document.getElementById('co-plan-adopt');
  if (b) { b.textContent = n === dr.days.length ? '采纳这份计划' : `采纳所选 ${n} 天`; b.disabled = !n }
}
function coachShowPlanDraft() { const st = _coachLoad(); _coachShowPlan(st.planDraft || null); }
function coachDropPlan() { const st = _coachLoad(); delete st.planDraft; _coachSave(st); _rvOpen.delete('plan:'); _coachShowPlan(null) }
function coachApplyPlan() {
  const st = _coachLoad(), dr = st.planDraft;
  if (!dr || dr.state === 'applied') return;
  // 采纳前再核一遍：生成之后可能已经打卡/换了账号设置;没勾的那几天不动
  const ok = new Set(_coachPlanDates(30)), cat = _coachCatalogMap(), off = new Set(dr.off || []);
  const days = dr.days.filter(d => ok.has(d.date) && !off.has(d.date)).map(d => ({ ...d, exercises: d.exercises.filter(e => cat.has(e.name)) }));
  if (!days.length) return showToast(off.size ? '勾上的日子都已经过去或完成了' : '这份草稿里的日子都已经过去或完成了');
  // 撤销用的快照:这几天原来的样子(原来没有的记 null)+ 计划顶上那句说明
  const snap = { ..._coachDaySnap(days.map(d => d.date)), tip: S.plan ? S.plan.tip : null };
  if (!S.plan) S.plan = { days: [], tip: '', rest: currentScheme().rest, excludedCount: visibleExcludedCount(getExcluded()) };
  const used = new Set();
  days.forEach(d => {
    // owner:AI 排的这天里已经有私密池动作(owner 的 AI 看得到、能排)就不再追加,免得重复
    if (!d.isRest && !d.isSwimDay && _ownerSession() && !d.exercises.some(e => _PRIVATE_POOL.includes(e.name))) {
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
  // 草稿留着(收成一行「已写进计划 · 撤销」),快照只留这一次的
  dr.state = 'applied'; dr.appliedN = days.length; dr.snap = snap;
  _rvOpen.delete('plan:');
  _coachSave(st);
  saveState(); render();
  showToast(`已采纳 ${days.length} 天`);
  showTab('today');
  if (typeof uiNotice === 'function') uiNotice(`AI 排的 ${days.length} 天已经写进计划`);
}
// 撤销 AI 排计划的采纳:那几天回到采纳前(已经开练 / 打卡的天不回滚),草稿回到待定,可以再改、再采纳
function coachPlanUndo() {
  const st = _coachLoad(), dr = st.planDraft;
  if (!dr || dr.state !== 'applied' || !dr.snap) return;
  const kept = _coachDayRestore(dr.snap);
  if (S.plan && dr.snap.tip !== null && dr.snap.tip !== undefined) S.plan.tip = dr.snap.tip;
  delete dr.state; delete dr.snap; delete dr.appliedN;
  _coachSave(st);
  saveState(); render();
  coachShowPlanDraft();
  showToast(kept ? `已撤销 · ${kept} 天已经开练或打卡，没回滚` : '已撤销 · 计划回到采纳前');
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
  _rvOpen.delete('vision:'); _rvDraft.delete('vision:');
  try {
    const r = await _coachFetch('/api/vision', { image: img, context: buildCoachContext({ catalog: 'full', logDays: 14 }), ..._coachOpts('vision') });
    // 结果放在内存里(照片不进本机存储):「改一下」带着照片和这一版再问;切回上一版、加到今天的撤销都靠它
    window._coachVis = { img, ..._coachVisTake(r.data || {}, r), added: {} };
    _coachVisionPaint();
  } catch (e) { window._coachVis = null; el.innerHTML = `<div class="co-meta co-err" style="padding:8px 0">${_esc(e.message)}</div>` }
}
function _coachVisTake(d, r) {
  const cat = _coachCatalogMap();
  return { equipment: String(d.equipment || ''), note: String(d.note || ''), model: r.model, effort: r.effort, cost: r.cost,
    list: (Array.isArray(d.exercises) ? d.exercises : []).filter(e => e && cat.has(e.name)).map(e => ({ name: e.name, why: String(e.why || '') })) };
}
function _coachVisionPaint() {
  const el = document.getElementById('co-vision-body'), v = window._coachVis;
  if (!el || !v) return;
  const today = S.plan?.days?.find(x => x.date === todayStr());
  const canAdd = today && !today.isRest && !(today.isPrivateDay && _coachHidePriv()) && !isLocked(today);
  window._coachVisionList = v.list.map(e => e.name);
  // 加到今天:每个动作单独加;加了的那条换成「已加 · 撤销」(撤销走对话小改同一套快照)
  el.innerHTML = `<div style="padding:8px 0 12px;display:flex;flex-direction:column;gap:8px"><img class="co-thumb" src="${v.img}" alt="刚拍的器械"><div class="co-rv"><div class="co-rv-h">${_esc(v.equipment)}</div>${_coachMd(v.note)}
      ${v.list.map((e, i) => `<div class="co-vx"><button type="button" onclick="showExDetail(window._coachVisionList[${i}])"><span>${_esc(e.name)}</span><small>${_esc(e.why)}</small></button>
        ${v.added[e.name] ? `<button class="btn-line" onclick="coachVisionUndo(${i})">已加 · 撤销</button>` : canAdd ? `<button class="btn-line" onclick="coachAddToday(${i},this)">加到今天</button>` : ''}</div>`).join('') || '<p class="co-meta">动作库里没有对应的动作。</p>'}
      ${_coachCostLine(v)}${_coachRvHtml('vision', '')}</div></div>`;
}
function coachAddToday(i, btn) {
  const v = window._coachVis, name = window._coachVisionList?.[i], hit = name && _coachCatalogMap().get(name);
  const day = S.plan?.days?.find(x => x.date === todayStr());
  if (!hit || !day) return;
  if (day.exercises.some(e => e.name === name)) return showToast('今天已经有这个动作');
  // 和对话里「加动作」同一套执行和快照(组数次数按库里的默认),撤销只撤这一个
  const { result, snap } = _coachTodayApply([{ op: 'add', exercise: name, sets: null, reps: null, kg: null }]);
  if (result[0]) return showToast(result[0]);
  if (v) v.added[name] = snap;
  saveState(); render();
  if (v) _coachVisionPaint(); else if (btn) { btn.textContent = '已加'; btn.disabled = true }
  showToast(`已加到今天：${name} · 可以撤销`);
}
function coachVisionUndo(i) {
  const v = window._coachVis, name = v && v.list[i] && v.list[i].name, snap = name && v.added[name];
  if (!snap) return;
  const why = _coachTodayUndo(snap);
  if (why) return showToast(why);
  delete v.added[name];
  saveState(); render();
  _coachVisionPaint();
  showToast(`已撤销：${name} 不加了`);
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
// 门控两种用途(调用点逐个判断用哪个,别混):
// _shareGated():给别人看 / 会被别人看到的(搭子共享文档、推送快照和推送文字):私密池 + 盆底,永远拦,owner 也一样。
// _coachGated():发给自己的 AI(快照、live、catalog、对话 / 提议 / 换动作的校验):owner 会话不拦(空集合);
//   非 owner 同 _shareGated(),AI 看不到也不许它动(就算碰巧说出名字也当「不在动作库里」)。
// _coachHidePriv(share):私密日只报「另有安排」、带 subMetrics 的记录不进 —— 非 owner 或 share 时为 true。
function _shareGated() { return new Set([..._PRIVATE_POOL, ...(typeof OWNER_ONLY_MOVES !== 'undefined' ? OWNER_ONLY_MOVES : [])]) }
function _coachGated() { return _ownerSession() ? new Set() : _shareGated() }
function _coachHidePriv(share) { return !!share || !_ownerSession() }
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
    // 下面是「改一下 / 聊聊」(聊聊 = 带着这段话去教练页接着问)
    return skinTpl('coachNote', { ...n, rvb: _coachRvHtml('note', today) }, n => `<div class="coach-note" id="co-note"><div class="sec-label">[ 教练 ] Note · ${_coachHM(n.at)}</div><div class="prose">${_esc(n.text)}</div>${n.rvb}</div>`);
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
  // 拿到结果以后下面接「改一下 / 聊聊」(两种风格都是 _coachRvHtml 画的)
  const r0 = _swapReason ? _swapAI.get(x.key) : null;
  return _coachSwapInner0(x) + (r0 && r0.state === 'ok' ? _coachRvHtml('swap', x.key) : '');
}
function _coachSwapInner0(x) {
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
// 打卡先落盘、弹窗先关,反馈后台去要;到了显示在「今天」打卡那行下面。私密模式的打卡、私密日不发,私密池动作不进(owner 都发,带 subMetrics)。
function _coachSessionFor(date, o = {}) {
  const lg = LOG.find(l => l.date === date), hide = _coachHidePriv();
  if (!lg || (lg.subMetrics && hide)) return null;
  const day = S.plan?.days?.find(d => d.date === date);
  if (day && day.isPrivateDay && hide) return null;
  const priv = hide ? _coachPriv() : new Set();
  const exercises = (lg.exercises || []).map((e, i) => {
    const r = typeof getExRpe === 'function' ? getExRpe(date, i) : null;
    return { name: e.name, sets: e.sets, reps: e.reps, unit: e.unit || '次', kg: e.weight || null, done: e.done !== false, ...(r != null ? { rpe: r } : {}) };
  }).filter(e => !priv.has(e.name));
  if (!exercises.length) return null;
  return { date, workout: lg.workout, rpe: o.skipped ? null : lg.rpe, min: lg.duration || null, note: lg.note || '', exercises, ...(lg.subMetrics && !hide ? { subMetrics: lg.subMetrics } : {}) };
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
  return open + `<div class="prose">${_esc(fb.text)}</div>${next}${lim}${_coachCostLine(fb)}${_coachRvHtml('feedback', date)}</div>`;
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
    ? `<div class="co-msg assistant"><span class="who">[ 教练 ]${m.at ? ' ' + _coachHM(m.at) : ''}</span><div class="co-text">${_coachMd(m.text)}</div>${m.action ? _coachActHtml(m.action) : ''}${m.proposal ? _coachPropHtml(m.proposal) : ''}${m.mem ? _coachMemNoteHtml(m.mem) : ''}${m.meta ? _coachCostLine(m.meta) : ''}</div>`
    : `<div class="co-msg user"><span class="who">你${m.at ? ' · ' + _coachHM(m.at) : ''}</span>${m.ref ? _coachRefHtml(m.ref) : ''}${m.img ? '<span class="co-meta">[ 图片 ]</span>' : ''}<span class="co-text">${_esc(m.text).replace(/\n/g, '<br>')}</span></div>`).join('')
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
// 今天页「问教练」/ 换动作面板「问教练怎么换」:正在看今天时就地打开陪练小面板(训练中随时问,带实时状态);
// 看别的日子、在别的页时照旧跳到教练页,输入框里先填好开头
function coachAskAbout(name, kind) {
  // 从引导训练里来的(引导卡上的「问教练」、引导里打开的换动作面板):先把全屏的引导关掉,不然盖在教练页上
  const wm = document.getElementById('workout-modal'); if (wm && wm.classList.contains('open') && typeof wmClose === 'function') wmClose();
  if (typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'today' && coachAccess() === 'on' && (S.selDate || todayStr()) === todayStr()) return coachQuickOpen(name, kind);
  showTab('coach');
  setTimeout(() => {
    const ta = document.getElementById('co-chat-text');
    if (!ta) return;
    ta.value = kind === '换' ? `「${name}」今天做不了，换成什么好？` : `关于「${name}」：`;
    try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { }
  }, 60);
}
// 对话 / 陪练共用的 SSE 读取:delta 边到边回调;action / proposal / memory / done / error 收起来交给调用方
async function _coachStream(path, body, onDelta) {
  const out = { text: '', meta: null, err: null, prop: null, act: null, mem: null };
  try {
    await _coachSerial(async () => {
      const r = await _coachFetch(path, body, { stream: true });
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
          if (ev === 'delta') { out.text += j.t; if (onDelta) onDelta(out.text) }
          else if (ev === 'proposal') out.prop = j;
          else if (ev === 'action') out.act = j;
          else if (ev === 'memory') out.mem = j;
          else if (ev === 'done') { out.text = j.text || out.text; out.meta = { model: j.model, effort: j.effort, cost: j.cost } }
          else if (ev === 'error') out.err = j.error;
        }
      }
    });
  } catch (e) {
    out.err = e.message;
    if (_COACH_LOCKED.has(e.status)) { _coachRememberAccess(e.status); setTimeout(() => _coachRefreshEntries(), 0) }
  }
  return out;
}
// 回来的结果 → 一条助手消息:小改当场执行(留撤销),记忆变动记一行,提议照旧画卡片
function _coachReplyMsg(res) {
  const m = { role: 'assistant', text: res.text, meta: res.meta, at: Date.now() };
  const pr = _coachPropFrom(res.prop);
  if (pr) m.proposal = pr;
  if (res.act) { const a = coachTodayAct(res.act); if (a) { m.action = a; m.after = _coachActAfter(a) } }
  if (res.mem) {
    const mm = { added: (res.mem.added || []).map(x => String(x.text || '')).filter(Boolean).slice(0, 5), removed: (res.mem.removed || []).map(x => String(x.text || '')).filter(Boolean).slice(0, 5), blocked: +res.mem.blocked || 0 };
    if (mm.added.length || mm.removed.length || mm.blocked) m.mem = mm;
    window._coachMem = null;   // 「我 → 05」里的列表下次重新读
  }
  return m;
}
// 发出去的历史:提议卡 / 小改之后补的那句(「(她采纳了)」「(已直接改了…)」)跟着那条助手消息一起发,AI 才知道改没改成
// 「聊聊」带进来的引用(m.ref)放在她那条话前面;提议卡「改一下」改过几版(m.rev)也跟着那条助手消息发
function _coachHist(list, n) {
  const send = list.slice(-n).map(m => ({ role: m.role, text: (m.ref ? _coachRefText(m.ref) + '\n\n' : '') + m.text
    + (m.role === 'assistant' && m.rev ? '\n\n' + m.rev : '') + (m.role === 'assistant' && m.after ? '\n\n' + m.after : '') }));
  while (send.length && send[0].role !== 'user') send.shift();
  return send;
}
async function coachSend() {
  const ta = document.getElementById('co-chat-text');
  const text = (ta.value || '').trim();
  const st = _coachLoad(), ref = st.chatRef || null;   // 「聊聊」带进来的那份结果:跟这条一起发,发完就清掉
  if (!text && !_coachPendingImg && !ref) return;
  st.chat = st.chat || [];
  // 数据快照在对话开头拍一次，整段对话沿用(后端放进第一条消息，缓存命中省钱)；要用最新数据就点「新对话」。
  // 今天做到哪、用时这些会变的,每条消息另带 live(只放进那一条)
  if (!st.chat.length || !st.chatCtx) st.chatCtx = buildCoachContext({ catalog: 'names', logDays: 28 });
  const img = _coachPendingImg;
  st.chat.push({ role: 'user', text: text || (img ? '(看图)' : '这份我想跟你聊聊。'), img: !!img, at: Date.now(), ...(ref ? { ref: { k: ref.k, t: ref.t, s: ref.s } } : {}) });
  delete st.chatRef;
  st.chat = st.chat.slice(-COACH_CHAT_MAX);
  _coachSave(st);
  ta.value = ''; _coachPendingImg = null; document.getElementById('co-chat-img').innerHTML = '';
  _coachRefPaint();
  _coachShowChat(true);
  _coachBusy('co-chat-go', true, '…');
  const res = await _coachStream('/api/chat', { messages: _coachHist(st.chat, COACH_CHAT_SEND), context: st.chatCtx, live: buildCoachLive(), gate: [..._coachGated()], image: img || undefined, ..._coachOpts('chat') },
    t => { const s = document.getElementById('co-stream'); if (s) s.innerHTML = _coachMd(t) });
  const reply = res.text ? _coachReplyMsg(res) : null;   // 先执行小改(它会改存档),再读存档追加
  const st2 = _coachLoad();
  st2.chat = st2.chat || [];
  if (reply) st2.chat.push(reply);
  else { const u = st2.chat.pop(); if (u && u.ref && !st2.chatRef) st2.chatRef = u.ref }   // 失败就撤回刚才那条(引用放回输入框上面)，免得历史里两条用户消息连在一起
  _coachSave(st2);
  if (!res.text) { ta.value = text; _coachRefPaint() }
  _coachShowChat();
  _coachBusy('co-chat-go', false);
  if (res.err) showToast(res.err);
}

// ══ 训练中陪练:今天页底部的小对话面板 ══
// 今天页「问教练」(纸墨主项行 / 运动焦点卡和展开行)在这里就地问,不跳页。每条都带今天的实时状态(做到哪个动作第几组、
// 刚才的感受、用时),走 /api/quick(快模型、回答很短);面板里同样能直接小改今天的训练(和对话里同一套执行 / 撤销)。
// 当天的陪练记录存本机(st.quick,换一天自动清空);数据快照在当天第一问时拍一次(缓存命中),实时状态每次现拍。
const COACH_QUICK_MAX = 16, COACH_QUICK_SEND = 8;
let _cqFocus = null, _cqBusy = false;
function _coachQuickState(st) {
  const today = todayStr();
  if (!st.quick || st.quick.date !== today) st.quick = { date: today, msgs: [] };
  return st.quick;
}
function _coachQuickEl() {
  let el = document.getElementById('coach-quick');
  if (!el) {
    el = document.createElement('div');
    el.id = 'coach-quick';
    el.className = 'ex-modal-overlay';
    el.onclick = e => { if (e.target === el) coachQuickClose() };
    document.body.appendChild(el);
  }
  return el;
}
function _coachQuickSugg() {
  const f = _cqFocus, p = f ? `「${f}」` : '';
  return [['下一组多重', `${p}下一组用多重？`], ['太吃力了', `${p}这组好吃力，怎么办？`], ['换一个', f ? `「${f}」今天想换一个，换什么？` : '今天想换个动作，换什么？'], ['动作要点', `${p}动作要点是什么？`]];
}
function coachQuickOpen(name, kind) {
  if (coachAccess() !== 'on') return;
  _cqFocus = name && !_coachGated().has(name) ? name : null;
  const el = _coachQuickEl(), sugg = _coachQuickSugg();
  el.innerHTML = skinTpl('coachQuick', { sugg }, ({ sugg }) => `<div class="ex-modal-card cq-card" onclick="event.stopPropagation()">`
    + `<div class="ex-modal-hdr"><div id="cq-head" class="cq-head"></div><button type="button" class="ex-modal-close" onclick="coachQuickClose()">关闭</button></div>`
    + `<div id="cq-log" class="cq-log" aria-live="polite"></div>`
    + `<div class="chips cq-sugg">${sugg.map(([l, q]) => `<button type="button" class="chip" data-q="${_esc(q)}" onclick="coachQuickSend(this.dataset.q)">${_esc(l)}</button>`).join('')}</div>`
    + `<div class="cq-row"><textarea id="cq-text" rows="1" placeholder="问教练…" aria-label="问教练" onkeydown="if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();coachQuickSend()}"></textarea><button type="button" class="send" id="cq-go" onclick="coachQuickSend()">发送</button></div>`
    + `<span class="co-meta cq-foot">快模型，回答很短 · 教练看得到你做到第几组 · 今天的陪练记录只存在这台手机上</span></div>`);
  el.classList.add('open');
  _coachQuickPaint();
  const ta = document.getElementById('cq-text');
  if (ta && kind === '换' && _cqFocus) ta.value = `「${_cqFocus}」今天做不了，换成什么好？`;
  _coachEnsureMe();
}
function coachQuickClose() { const el = document.getElementById('coach-quick'); if (el) el.classList.remove('open') }
// 面板头:现在在做的动作、第几组、重量、刚才的感受、用时(和发给教练的实时状态同一份)
function _coachQuickHeadHtml() {
  const t = _coachTodayState(_cqFocus), name = _cqFocus || t.current?.name || '';
  const ex = (t.exercises || []).find(e => e.name === name) || null;
  const bits = [];
  if (ex) {
    bits.push(ex.done ? '已做完' : `第 ${Math.min(ex.setsDone + 1, ex.sets)} / ${ex.sets} 组`);
    if (ex.kg != null) bits.push(`${ex.kg} kg`); else if (ex.kgSuggested) bits.push(`建议 ${ex.kgSuggested} kg`);
    if (ex.feel) bits.push(`刚才：${ex.feel}`);
  }
  const status = t.status + (t.elapsedMin != null && t.status === '训练中' ? ` · 用时 ${t.elapsedMin} 分` : '');
  return skinTpl('coachQuickHead', { t, ex, name, bits, status }, () => `<div class="sheet-eyebrow">[ 陪练 ] ${_esc(status)}</div><div class="sheet-title">${_esc(name || t.type || '今天')}</div>${bits.length ? `<span class="note-line cq-state">${_esc(bits.join(' · '))}</span>` : ''}`);
}
function _coachQuickLogHtml(streaming) {
  const msgs = _coachQuickState(_coachLoad()).msgs;
  return skinTpl('coachQuickLog', { msgs, streaming }, () => (msgs.length ? msgs.map(m => m.role === 'assistant'
    ? `<div class="cq-msg co"><span class="who">[ 教练 ]${m.at ? ' ' + _coachHM(m.at) : ''}</span><div class="co-text">${_coachMd(m.text)}</div>${m.action ? _coachActHtml(m.action) : ''}${m.mem ? _coachMemNoteHtml(m.mem) : ''}${m.meta ? _coachCostLine(m.meta) : ''}</div>`
    : `<div class="cq-msg me"><span class="co-text">${_esc(m.text)}</span></div>`).join('')
    : `<div class="note-line">练到一半有问题直接问：下一组多重、哪里不对劲、想换个动作。教练看得到你做到第几组；让它换动作、改重量、开计时，它会直接改，不合适点「撤销」。</div>`)
    + (streaming ? `<div class="cq-msg co"><span class="who">[ 教练 ]</span><div class="co-text" id="cq-stream"><span class="co-meta">想一下…</span></div></div>` : ''));
}
function _coachQuickPaint(streaming) {
  const el = document.getElementById('coach-quick');
  if (!el || !el.classList.contains('open')) return;
  const h = document.getElementById('cq-head'), lg = document.getElementById('cq-log');
  if (h) h.innerHTML = _coachQuickHeadHtml();
  if (lg) { lg.innerHTML = _coachQuickLogHtml(streaming); const last = lg.lastElementChild; if (last && typeof last.scrollIntoView === 'function') last.scrollIntoView({ block: 'nearest' }) }
  const go = document.getElementById('cq-go');
  if (go) { go.disabled = _cqBusy; go.textContent = _cqBusy ? '…' : '发送' }
  el.querySelectorAll('.cq-sugg .chip').forEach(b => { b.disabled = _cqBusy });
}
async function coachQuickSend(preset) {
  if (_cqBusy) return;
  const ta = document.getElementById('cq-text');
  const text = String(preset || (ta && ta.value) || '').trim();
  if (!text) { if (ta) ta.focus(); return }
  _cqBusy = true;
  const st = _coachLoad(), q = _coachQuickState(st);
  if (!q.ctx) q.ctx = buildCoachContext({ catalog: 'names', logDays: 14, live: false });
  q.msgs.push({ role: 'user', text, at: Date.now() });
  q.msgs = q.msgs.slice(-COACH_QUICK_MAX);
  _coachSave(st);
  if (ta && !preset) ta.value = '';
  _coachQuickPaint(true);
  const res = await _coachStream('/api/quick', { messages: _coachHist(q.msgs, COACH_QUICK_SEND), context: q.ctx, live: buildCoachLive(_cqFocus), gate: [..._coachGated()] },
    t => { const s = document.getElementById('cq-stream'); if (s) s.innerHTML = _coachMd(t) });
  const reply = res.text ? _coachReplyMsg(res) : null;
  const st2 = _coachLoad(), q2 = _coachQuickState(st2);
  if (reply) q2.msgs.push(reply);
  else { q2.msgs.pop(); if (ta && !preset) ta.value = text }
  _coachSave(st2);
  _cqBusy = false;
  _coachQuickPaint();
  if (res.err) showToast(res.err);
}

// ══ 对话里直接改今天的训练(小改:换 / 加 / 划掉 / 调组次重量 / 计时 / 身体情况) ══
// 后端 SSE action {id, message, changes[≤6], dropped[]};前端收到就执行(不用点采纳),对话里显示「已改：… · 撤销」。
// 执行前再核一遍(动作库 / 门控 / 今天的状态 / 数值范围),核不过的划掉写原因;每次执行留快照,只有最近一次能撤销。
// 改的永远是这台手机上当前账号的「今天」;私密日、休息日、已打卡的天不动结构(计时、身体情况照样可以)。
const _TODAY_OPS = ['swap', 'add', 'strike', 'adjust', 'timer', 'limit'];
function _coachTodayDay() { return S.plan?.days?.find(d => d.date === todayStr()) || null }
function _coachTodayIdx(day, name, allowDone) { const pd = S.prog[day.date] || {}; return day.exercises.findIndex((e, i) => e.name === name && (allowDone || !pd[i])) }
// 组进度(运动风格存在本机 fit_spsets,按下标):插入 / 删掉 / 换掉一个动作时跟着挪,免得错位。delta 0 = 这个下标清零
function _coachSpShift(date, at, delta) {
  if (typeof _spSetsAll !== 'function') return;
  const a = _spSetsAll(), d = a[date];
  if (!d || !d.s) return;
  const s = {};
  Object.entries(d.s).forEach(([k, v]) => { k = +k; if (k === at && delta <= 0) return; s[k >= at && delta ? k + delta : k] = v });
  d.s = s;
  try { localStorage.setItem(nsKey('fit_spsets'), JSON.stringify(a)) } catch { }
}
function _coachProgress(date) {
  const p = Object.values(S.prog[date] || {}).filter(Boolean).length;
  const d = typeof _spSetsAll === 'function' ? _spSetsAll()[date] : null;
  return p * 100 + Object.values((d && d.s) || {}).reduce((a, v) => a + (+v || 0), 0);
}
// 核一条小改:合规返回 '',不合规返回原因
function _coachTodayCheck(c, day) {
  if (!c || !_TODAY_OPS.includes(c.op)) return '看不懂这条改法';
  if (c.op === 'timer') return Number.isInteger(c.seconds) && c.seconds >= 5 && c.seconds <= 900 ? '' : '计时长度不对';
  if (c.op === 'limit') return typeof c.text === 'string' && c.text.trim() && c.text.length <= 80 ? '' : '身体情况写得不对';
  if (!day) return '今天没有训练计划';
  if (day.isPrivateDay && _coachHidePriv()) return '今天另有安排，不改';
  if (day.isRest) return '今天是休息日';
  if (LOG.some(l => l.date === day.date)) return '今天已经打卡了';
  const gated = _coachGated(), cat = _coachCatalogMap();
  const ex = String(c.exercise || '').trim(), to = String(c.to || '').trim();
  const notIn = n => `「${_coachNm(n || '?')}」不在你现在的动作库里`;
  if (!ex || gated.has(ex)) return notIn(ex);
  let unit;
  if (c.op === 'add') {
    if (!cat.has(ex)) return notIn(ex);
    if (day.isSwimDay) return '今天是游泳日';
    if (day.exercises.some(e => e.name === ex)) return '今天已经有这个动作';
    unit = _coachUnit(cat.get(ex).ex);
  } else {
    const i = _coachTodayIdx(day, ex, c.op === 'adjust');
    if (i < 0) return day.exercises.some(e => e.name === ex) ? `「${ex}」已经做完了` : `今天的计划里没有「${ex}」`;
    const e = day.exercises[i];
    unit = e.unit || '次';
    if (c.op === 'swap') {
      if (e.isWarmup || (e.isStretch && !isWeightedMove(e.name))) return '热身 / 拉伸不换';
      if (day.isSwimDay || e.group === 'swimming' || e.swimPhase) return '游泳项目只按阶段换';
      if (!to || gated.has(to) || !cat.has(to)) return notIn(to);
      if (to === ex) return '换成的还是同一个动作';
      if (day.exercises.some(x => x.name === to)) return `今天已经有「${to}」了`;
      unit = _coachUnit(cat.get(to).ex);
    }
    if (c.op === 'adjust') {
      if (c.sets == null && c.reps == null && c.kg == null) return '没说改成多少';
      if (c.sets == null && c.reps == null && !needsWeightUI(e)) return `「${ex}」不用上重量`;
    }
  }
  const [lo, hi] = _COACH_REPS[unit] || [1, 600];
  if (c.sets != null && !(Number.isInteger(c.sets) && c.sets >= 1 && c.sets <= 8)) return `组数 ${c.sets} 不合理`;
  if (c.reps != null && !(Number.isInteger(c.reps) && c.reps >= lo && c.reps <= hi)) return `${unit === '次' ? '次数' : '时长'} ${c.reps}${unit} 不合理`;
  if (c.kg != null && !(typeof c.kg === 'number' && c.kg > 0 && c.kg <= 300)) return `重量 ${c.kg} kg 不合理`;
  return '';
}
function _coachTodayTxt(c) {
  const ex = _coachNm(c.exercise), to = _coachNm(c.to);
  const unitOf = n => { const d = _coachTodayDay(), e = d && d.exercises.find(x => x.name === n); return e ? e.unit || '次' : _coachUnit(_coachCatalogMap().get(n)?.ex) };
  const spec = n => _coachSpecTxt(c.sets, c.reps, unitOf(n), c.kg != null && isWeightedMove(n) ? c.kg : null);
  const sec = n => n >= 60 && n % 60 === 0 ? `${n / 60} 分钟` : `${n} 秒`;
  switch (c.op) {
    case 'swap': { const t = spec(c.to); return `${ex} → ${to}${t ? ' ' + t : ''}` }
    case 'add': { const t = spec(c.exercise); return `加上 ${ex}${t ? ' ' + t : ''}` }
    case 'strike': return `今天不做 ${ex}`;
    case 'adjust': return `${ex} 改成 ${spec(c.exercise) || '—'}`;
    case 'timer': return `计时 ${sec(c.seconds)}${c.text && c.text !== '计时' ? ' · ' + c.text : ''}`;
    case 'limit': return `身体情况加上「${c.text}」`;
  }
  return '?';
}
// 执行。返回 {result[], n, snap|null}:result 每条 '' = 改了、否则是没改的原因
function _coachTodayApply(changes) {
  const date = todayStr(), day0 = _coachTodayDay();
  const pick = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => k.startsWith(date + '-')));
  const sp0 = typeof _spSetsAll === 'function' ? _spSetsAll()[date] : null;
  const snap = { date, day: day0 ? JSON.parse(JSON.stringify(day0)) : null, prog: S.prog[date] ? { ...S.prog[date] } : null, w: pick(S.weights), a: pick(S.adj), r: pick(S.exRpe), sp: sp0 ? JSON.parse(JSON.stringify(sp0)) : null, keys: { adj: {}, w: {} }, structural: false };
  const result = changes.map(() => '');
  let n = 0;
  changes.forEach((c, k) => {
    const day = _coachTodayDay(), bad = _coachTodayCheck(c, day);
    if (bad) { result[k] = bad; return }
    n++;
    if (c.op === 'timer') { startTimer(c.seconds, String(c.text || '计时').slice(0, 20)); snap.timer = String(c.text || '计时').slice(0, 20); return }
    if (c.op === 'limit') {
      if (!('limits' in snap)) { snap.limits = S.limits || ''; snap.stale = !!S.planStale }
      const add = c.text.trim(), cur = (S.limits || '').trim();
      if (!cur.includes(add)) S.limits = cur ? `${cur}；${add}` : add;
      if (typeof markPlanStale === 'function') markPlanStale();
      return;
    }
    day._edited = true;
    const cat = _coachCatalogMap(), ex = String(c.exercise).trim();
    if (c.op === 'add') {
      const hit = cat.get(ex), sp = _coachSpec(hit, c, true);
      const at = _coachInsertEx(day, { name: hit.ex.n, sets: sp.sets, reps: sp.reps, unit: sp.unit, note: hit.ex.note || '', group: hit.g, diff: hit.ex.diff, bi: !!hit.ex.bi, muscle: hit.ex.muscle || [], addedManually: true });
      _coachSpShift(date, at, 1);
      if (sp.kg) { S.weights = S.weights || {}; S.weights[date + '-' + at] = sp.kg }
      snap.structural = true; return;
    }
    const i = _coachTodayIdx(day, ex, c.op === 'adjust');
    if (c.op === 'strike') {
      const len = day.exercises.length;
      day.exercises.splice(i, 1);
      _reindexAfterRemoval(date, i, len);
      _coachSpShift(date, i, -1);
      snap.structural = true; return;
    }
    if (c.op === 'swap') {
      const hit = cat.get(String(c.to).trim()), sp = _coachSpec(hit, c, false);
      _swapInto(date, i, hit.ex, { sets: sp.sets || undefined, reps: sp.reps || undefined, kg: sp.kg || 0 });
      _coachSpShift(date, i, 0);
      snap.structural = true; return;
    }
    // adjust:和点 −/+ 一样写进当天的调整(S.adj)/重量格;重量是建议值,不走 setWeight(那里会记成新纪录)
    const e = day.exercises[i];
    S.adj = S.adj || {}; S.weights = S.weights || {};
    const keep = (o, key, bag) => { if (!(key in snap.keys[bag])) snap.keys[bag][key] = o[key] === undefined ? null : o[key] };
    if (c.sets != null) { keep(S.adj, `${date}-${i}-s`, 'adj'); S.adj[`${date}-${i}-s`] = c.sets }
    if (c.reps != null) { const [lo, hi] = _COACH_REPS[e.unit || '次'] || [1, 600]; keep(S.adj, `${date}-${i}-r`, 'adj'); S.adj[`${date}-${i}-r`] = Math.max(lo, Math.min(hi, c.reps)) }
    if (c.kg != null && needsWeightUI(e)) { keep(S.weights, `${date}-${i}`, 'w'); S.weights[`${date}-${i}`] = roundWeight(c.kg, e.name) }
  });
  if (snap.structural) { try { _spPin = null; _spJust = null } catch { } }   // 运动风格「先做这个」/「做完了」记的是下标,结构变了就作废
  snap.mark = _coachProgress(date);
  return { result, n, snap: n ? snap : null };
}
// 撤销:回到执行前。结构改过(换 / 加 / 划掉)的,要是之后又练了或已经打卡,就不回滚(免得把进度对到别的动作上)
function _coachTodayUndo(snap) {
  const date = snap.date;
  if (snap.structural || Object.keys(snap.keys.adj).length || Object.keys(snap.keys.w).length) {
    if (todayStr() !== date) return '已经不是那天了，没撤';
    if (LOG.some(l => l.date === date)) return '今天已经打卡了，没撤';
  }
  if (snap.structural) {
    if (_coachProgress(date) > snap.mark) return '改完之后又练了，撤销会把进度对错位，没撤。想改回去直接跟教练说';
    const i = (S.plan?.days || []).findIndex(x => x.date === date);
    if (i < 0 || !snap.day) return '那天已经不在计划里了';
    S.plan.days[i] = snap.day;
    if (snap.prog) S.prog[date] = snap.prog; else delete S.prog[date];
    [['weights', 'w'], ['adj', 'a'], ['exRpe', 'r']].forEach(([k, sk]) => {
      S[k] = S[k] || {};
      Object.keys(S[k]).forEach(x => { if (x.startsWith(date + '-')) delete S[k][x] });
      Object.assign(S[k], snap[sk] || {});
    });
    if (typeof _spSetsAll === 'function') {
      const a = _spSetsAll();
      if (snap.sp) a[date] = snap.sp; else delete a[date];
      try { localStorage.setItem(nsKey('fit_spsets'), JSON.stringify(a)) } catch { }
    }
    try { _spPin = null; _spJust = null } catch { }
  } else {
    [['adj', 'adj'], ['weights', 'w']].forEach(([k, bag]) => Object.entries(snap.keys[bag]).forEach(([key, v]) => { S[k] = S[k] || {}; if (v == null) delete S[k][key]; else S[k][key] = v }));
  }
  if ('limits' in snap) { S.limits = snap.limits; S.planStale = snap.stale }
  if (snap.timer && typeof _timerKind !== 'undefined' && _timerKind === snap.timer && _timerEndTime > Date.now()) stopTimer();
  return '';
}
function _coachActAfter(a) {
  const ok = a.changes.filter((c, k) => !a.result[k]).map(_coachTodayTxt), bad = a.changes.map((c, k) => a.result[k] ? `${_coachTodayTxt(c)}(${a.result[k]})` : '').filter(Boolean);
  if (a.state === 'undone') return '(这些改动她后来点了撤销，今天的训练回到改之前)';
  return (ok.length ? `(已直接改了今天的训练：${ok.join('；')})` : '') + (bad.length ? `(没改成：${bad.join('；')})` : '');
}
// SSE action → 执行 → 存进那条助手消息的记录 {id, date, changes, dropped, result, state, snap}
function coachTodayAct(j) {
  if (!j || typeof j !== 'object' || !Array.isArray(j.changes) || !j.changes.length) return null;
  const changes = j.changes.slice(0, 6).filter(c => c && typeof c === 'object');
  const { result, n, snap } = _coachTodayApply(changes);
  const a = { id: String(j.id || ('a' + Date.now())).slice(0, 80), date: todayStr(), changes, dropped: (Array.isArray(j.dropped) ? j.dropped : []).filter(x => typeof x === 'string').slice(0, 6), result, state: n ? 'applied' : 'failed', snap };
  if (n) {
    // 只有最近一次能撤销:对话和陪练两边旧的快照都清掉
    const st = _coachLoad();
    [...(st.chat || []), ...((st.quick && st.quick.msgs) || [])].forEach(m => { if (m.action) delete m.action.snap });
    _coachSave(st);
    saveState();
    if (typeof flashSaved === 'function') flashSaved();
    if (typeof uiRenderP5 === 'function' && snap && 'limits' in snap) uiRenderP5();
    if (typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'today') render();
    const bad = result.filter(Boolean).length;
    showToast(`已改 ${n} 处${bad ? `，${bad} 条没改` : ''} · 可以撤销`);
  }
  return a;
}
function coachActUndo(btn) {
  const aid = btn && btn.closest && btn.closest('.co-act')?.dataset.aid;
  const st = _coachLoad(), all = [...(st.chat || []), ...((st.quick && st.quick.msgs) || [])];
  const m = all.find(x => x.action && x.action.id === aid);
  if (!m || m.action.state !== 'applied' || !m.action.snap) return;
  const why = _coachTodayUndo(m.action.snap);
  if (why) { m.action.undoErr = why; _coachSave(st); _coachRepaint(); showToast(why); return }
  m.action.state = 'undone'; delete m.action.snap; delete m.action.undoErr; m.after = _coachActAfter(m.action);
  _coachSave(st);
  saveState();
  if (typeof uiRenderP5 === 'function') uiRenderP5();
  if (typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'today') render();
  _coachRepaint();
  showToast('已撤销 · 今天的训练回到改之前');
}
function _coachRepaint() { _coachShowChat(); if (typeof _coachQuickPaint === 'function') _coachQuickPaint() }
function _coachActHtml(a) {
  const okN = a.result.filter(x => !x).length;
  const rows = a.changes.map((c, k) => {
    const bad = a.result[k], txt = _coachTodayTxt(c);
    return `<li class="${bad ? 'bad' : ''}">${bad ? `<s>${_esc(txt)}</s><small class="co-err">${_esc(bad)}，没改</small>` : `<span>${_esc(txt)}</span>${c.why ? `<small>${_esc(c.why)}</small>` : ''}`}</li>`;
  }).join('');
  const gated = _coachGated(), drop = (a.dropped || []).filter(n => !gated.has(n));
  const head = a.state === 'applied' ? `已改 · 今天 · ${okN} 处` : a.state === 'undone' ? '已撤销 · 今天的训练回到改之前' : '没改成';
  // 改过了(不管还能不能撤销)就有「不对，说说」:带着这次改了什么去教练对话
  const talk = a.state === 'applied' && okN ? `<button type="button" class="link-btn u" data-rk="action:${_esc(a.id)}" onclick="coachDiscuss(this)">不对，说说</button>` : '';
  return skinTpl('coachAct', { a, okN, rows, drop, head, talk }, () => `<div class="co-act" data-aid="${_esc(a.id)}"><div class="co-act-h"><span class="dot" aria-hidden="true"></span>${_esc(head)}</div>`
    + `<ul class="co-act-list">${rows}</ul>`
    + (drop.length ? `<div class="co-meta">还提到 ${drop.length} 个不在你今天计划或动作库里的：${_esc(drop.join('、'))}</div>` : '')
    + (a.undoErr ? `<div class="co-meta co-err">${_esc(a.undoErr)}</div>` : '')
    + (a.state === 'applied' && (a.snap || talk) ? `<div style="display:flex;flex-wrap:wrap;column-gap:20px">${a.snap ? `<button type="button" class="link-btn u" onclick="coachActUndo(this)">撤销</button>` : ''}${talk}</div>` : '')
    + `</div>`);
}
// 记忆变动:一行小字(「已记住：…」)
function _coachMemNoteHtml(mm) {
  const parts = [];
  if (mm.added?.length) parts.push(`已记住：${mm.added.map(t => `「${t}」`).join('')}`);
  if (mm.removed?.length) parts.push(`已忘掉：${mm.removed.map(t => `「${t}」`).join('')}`);
  if (mm.blocked) parts.push(`有 ${mm.blocked} 条不适合记，没存`);
  return skinTpl('coachMemNote', { mm, parts }, () => `<div class="co-memnote">${parts.map(_esc).join(' · ')} · <button type="button" class="link-btn u" onclick="showTab('me')">在「我 → 05」里看</button></div>`);
}

// ══ 对话里的「提议改计划」卡片 ══
// 后端在 done 之前发 SSE proposal {id, message, changes[≤8], dropped[]};这里画卡片,「采纳」才改,「不要」作废。
// 采纳前客户端再核一遍(动作库 / getExcluded / 私密池 / 数值范围 / 那天的状态),核不过的划掉并写原因;
// 已完成的天、今天已经勾了的动作不动;采纳前存快照,卡片上能撤销(只留最近一次采纳的快照)。
const _COACH_OPS = ['replace', 'adjust', 'remove', 'add', 'setting'];
const _COACH_SKIP = '没选';   // 采纳时她去掉了勾的那条:结果里记这个(卡片上划掉写「没选，没改」)
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
// 这条改动要落在哪些天:指定日期 = 那一天;「以后」= 今天之后所有还没练完的训练日。休息日、私密日(owner 除外)、已打卡的天都不动
function _coachPropDays(c) {
  const today = todayStr(), hide = _coachHidePriv();
  const ok = d => d && !d.isRest && !(d.isPrivateDay && hide) && !isDone(d) && d.date >= today;
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
    if (d.isPrivateDay && _coachHidePriv()) return '那天另有安排，不改';
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
// 门控动作的名字不往界面上写(AI 看不到它们,真碰巧说出来也只显示成「不在动作库里的动作」);owner 的 _coachGated 是空的 → 显示真名
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
// 卡片上一条改动的文字:采纳以后的「改设置」写当时的「从 → 到」(现在的值已经是新值了)
function _coachRowTxt(c, open) {
  return c.op === 'setting' && !open && c.from !== undefined
    ? `${_SET_NAME[c.key] || c.key}  ${_coachSetFmt(c.key, c.from)} → ${_coachSetFmt(c.key, c.value)}` : _coachChangeTxt(c);
}
function _coachPropHtml(p) {
  const open = p.state === 'open', gated = _coachGated();
  const res = open ? p.changes.map(_coachPropCheck) : (p.result || p.changes.map(() => ''));
  const okN = res.filter(x => !x).length;
  const rows = p.changes.map((c, i) => {
    const bad = res[i], txt = _coachRowTxt(c, open);
    return `<span class="d">${_esc(c.op === 'setting' ? '设置' : _coachScopeLabel(c.scope))}</span><span class="c${bad ? ' bad' : ''}">${bad ? `<s>${_esc(txt)}</s><small class="co-err">${_esc(bad)}${open ? '，不会改' : '，没改'}</small>` : `${_esc(txt)}${c.why ? `<small>${_esc(c.why)}</small>` : ''}`}</span>`;
  }).join('');
  // 待定、不止一条:每条一个勾选框,没勾的(p.off)采纳时跳过;全勾着按钮叫「采纳」,去掉过勾叫「采纳所选」
  const off = new Set(p.off || []), multi = open && p.changes.length > 1;
  const selN = res.filter((x, i) => !x && !off.has(i)).length, label = selN === res.filter(x => !x).length ? '采纳' : '采纳所选';
  const sel = !multi ? '' : p.changes.map((c, i) => {
    const bad = res[i], txt = _coachRowTxt(c, true), d = c.op === 'setting' ? '设置' : _coachScopeLabel(c.scope);
    return `<button type="button" class="adj-row co-prop-sel" role="checkbox" aria-checked="${!bad && !off.has(i)}" data-i="${i}"${bad ? ' aria-disabled="true"' : ' onclick="coachPropSel(this)"'}>${uiBoxSq()}<span><span class="what">${_esc(d)} · ${bad ? `<s>${_esc(txt)}</s>` : _esc(txt)}</span>${bad ? `<span class="why co-err">${_esc(bad)}，不会改</span>` : c.why ? `<span class="why">${_esc(c.why)}</span>` : ''}</span></button>`;
  }).join('');
  const drop = (p.dropped || []).filter(n => !gated.has(n));
  const msg = p.vers && p.msg ? p.msg : '', rvb = open ? _coachRvHtml('proposal', p.id) : '';   // 改过的版本:教练这一版说的话写在卡片里
  let foot = '';
  if (open) foot = `<div class="co-prop-btns"><button type="button" class="btn-primary" onclick="coachPropAct(this,'apply')"${selN ? '' : ' disabled'}>${label}</button><button type="button" class="btn-line" onclick="coachPropAct(this,'reject')">不要</button></div>`;
  else if (p.state === 'applied') foot = `<div class="co-prop-st olive">✓ 已写进计划${okN < p.changes.length ? ` · ${p.changes.length - okN} 条没改` : ''}</div>` + (p.snap ? `<button type="button" class="link-btn u" style="align-self:flex-start" onclick="coachPropAct(this,'undo')">撤销，回到采纳前</button>` : '');
  else if (p.state === 'rejected') foot = `<div class="co-prop-st faint">— 没改。计划照旧。</div><button type="button" class="link-btn u" style="align-self:flex-start" onclick="coachPropAct(this,'reopen')">再看看</button>`;
  else if (p.state === 'undone') foot = `<div class="co-prop-st faint">已撤销 · 计划回到采纳前</div>`;
  return skinTpl('coachProp', { p, open, okN, rows, drop, sel, label, msg, rvb }, () => `<div class="co-prop" data-pid="${_esc(p.id)}"><div class="co-prop-h"><span class="dot" aria-hidden="true"></span>提议 · ${okN} 处改动</div>`
    + (msg ? `<div class="co-text">${_coachMd(msg)}</div>` : '')
    + (sel ? `<div class="co-prop-sels">${sel}</div>` : `<div class="co-prop-list">${rows}</div>`)
    + (drop.length ? `<div class="co-meta">还提到 ${drop.length} 个不在你动作库里的动作，已去掉：${_esc(drop.join('、'))}</div>` : '')
    + foot + rvb + `</div>`);
}
// 提议卡上勾 / 不勾一条:记进 p.off(存本机),按钮跟着改字;不重画整段对话(免得滚动跳)
function coachPropSel(btn) {
  const card = btn && btn.closest && btn.closest('.co-prop'), pid = card && card.dataset.pid, i = +btn.dataset.i;
  const st = _coachLoad(), m = (st.chat || []).find(x => x.proposal && x.proposal.id === pid);
  if (!m || m.proposal.state !== 'open' || btn.getAttribute('aria-disabled') === 'true') return;
  const on = uiToggleBox(btn), off = new Set(m.proposal.off || []);
  if (on) off.delete(i); else off.add(i);
  m.proposal.off = [...off].sort((a, b) => a - b);
  _coachSave(st);
  const all = card.querySelectorAll('.co-prop-sel:not([aria-disabled="true"])').length, n = card.querySelectorAll('.co-prop-sel[aria-checked="true"]:not([aria-disabled="true"])').length;
  const b = card.querySelector('.co-prop-btns .btn-primary');
  if (b) { b.textContent = n === all ? '采纳' : '采纳所选'; b.disabled = !n }
}
// 计划页「采纳过的教练提议」:还能撤销的(采纳了、快照还在 —— 只有最近一次采纳留快照)每条一句摘要 + 撤销。
// 撤销按钮放在 .co-prop[data-pid] 里,点了走 coachPropAct 同一套(撤销后 render() 会把这块重画掉)。没有就返回空串,整块不显示。
function coachPlanProps() {
  return (_coachLoad().chat || []).filter(m => m.proposal && m.proposal.state === 'applied' && m.proposal.snap).map(m => {
    const p = m.proposal, res = p.result || [], ok = p.changes.filter((c, i) => !res[i]);
    const c = ok[0] || p.changes[0];
    const head = c ? `${c.op === 'setting' ? '设置' : _coachScopeLabel(c.scope)} · ${_coachRowTxt(c, false)}` : '计划改动';
    return { id: p.id, at: m.at, n: ok.length, text: head + (ok.length > 1 ? ` 等 ${ok.length} 处` : '') };
  });
}
function coachPlanPropsHtml() {
  const items = coachPlanProps();
  if (!items.length) return '';
  return skinTpl('planProps', { items }, () => items.map(it => `<div class="co-prop plan-prop" data-pid="${_esc(it.id)}"><span class="pp-k">[ 教练提议 · 已采纳 ]</span>`
    + `<span class="pp-t">${_esc(it.text)}</span><button type="button" class="link-btn u" onclick="coachPropAct(this,'undo')">撤销</button></div>`).join(''));
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
  const result = p.changes.map(() => ''), off = new Set(p.off || []);
  let stale = false, n = 0;
  // 先改目标(它会顺带重置重点部位),同一张卡里另外给的重点部位再盖上去
  const order = p.changes.map((c, i) => [c, i]).sort((a, b) => (a[0].key === 'goal' ? -1 : 0) - (b[0].key === 'goal' ? -1 : 0));
  order.forEach(([c, i]) => {
    if (off.has(i)) { result[i] = _COACH_SKIP; return }   // 她去掉了勾的:不改
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
  // 「不要」之后「再看看」:回到待定,采纳 / 不要重新可点(每条改动按现在的计划重新核一遍)
  if (act === 'reopen' && p.state === 'rejected') {
    p.state = 'open'; delete m.after;
    _coachSave(st); _coachShowChat();
    return;
  }
  if (act === 'apply' && p.state === 'open') {
    const { snap, result, stale, n } = _coachPropApply(p);
    (st.chat || []).forEach(x => { if (x.proposal && x !== m) delete x.proposal.snap });   // 只有最近一次采纳能撤销
    p.state = 'applied'; p.result = result; p.snap = n ? snap : null;
    _rvOpen.delete('proposal:' + p.id);
    // 没勾的(她不要的)和核不过的(没改成的)分开告诉 AI
    const skipped = p.changes.filter((c, i) => result[i] === _COACH_SKIP).map(_coachChangeTxt);
    const badN = result.filter(x => x && x !== _COACH_SKIP).length, bad = [...new Set(result.filter(x => x && x !== _COACH_SKIP))];
    const part = skipped.length ? `其中 ${n} 条；没选：${skipped.join('；')}` : '';
    m.after = !n ? `(她点了采纳，但一条都没改成：${bad.join('；')})` : badN ? `(她采纳了${part ? part + '；' : '；'}其中 ${badN} 条没改成：${bad.join('；')})` : `(她采纳了${part})`;
    _coachSave(st);
    saveState();
    if (typeof flashSaved === 'function') flashSaved();
    if (stale && typeof markPlanStale === 'function') markPlanStale();
    if (typeof applySettingsToUI === 'function') applySettingsToUI();
    render(); _coachShowChat();
    showToast(!n ? '一条都没改成' : `已改 ${n} 处${badN ? `，${badN} 条没改` : ''}${stale ? ' · 设置改了，计划顶上可以按新设置重排' : ''}`);
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

// ══ AI 结果:改一下 / 聊聊 ══════════════════════════════════
// 每份 AI 给的结果(提议卡、复盘、AI 排计划草稿、换动作推荐、认器械、打卡反馈、教练的话)下面都有:
//   改一下 = 写哪里不对 → /api/revise 在正看的这一版上改,回同样格式的新版本,原地换掉;旧版本留着(卡上「上一版 / 下一版」),
//            每轮都把之前所有意见一起带上。新版本照样过前端原来那套校验(_coachPropFrom / _coachCleanAdj / _coachValidatePlan / …)。
//   聊聊   = 去教练对话,下一条消息带上这份结果(对话里显示「关于这份 XX」);教练可以再给一张提议卡(同样能逐条勾、改一下)。
// 对话 / 陪练里已经直接改了今天的(change_today)没有「改一下」,只有「不对，说说」(同聊聊,带着这次改了什么)。
// 每种结果一个适配(_RV):get(id) → {obj, save}、fields 每版存哪些字段、original 发给 AI 的上一版(去掉门控动作)、body 原接口要的
// 附加字段(快照照原接口现拍)、take 新版本过校验、after 换了版本之后的事、paint 重画、ref 聊聊带的摘要、base 模型设置跟哪个接口、can 现在能不能改。
const _RV_MAX = 6;   // 每份结果最多留几版
const _rvOpen = new Set(), _rvBusy = new Set(), _rvDraft = new Map();   // 输入框开着的 / 正在改的 / 没发出去的意见(按「种类:id」)
function _rvClip(s, n) { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
function _rvOkName(n) { return !_coachGated().has(String(n || '').trim()) }
function _rvVal(v) { return v === null || v === undefined ? '' : Array.isArray(v) ? v.join('、') : String(v) }
function _rvPick(o, fields) { const v = {}; fields.forEach(f => { if (o[f] !== undefined) v[f] = JSON.parse(JSON.stringify(o[f])) }); return v }
function _rvPut(o, fields, v) { v = JSON.parse(JSON.stringify(v)); fields.forEach(f => { if (v[f] !== undefined) o[f] = v[f]; else delete o[f] }) }
const _RV = {
  proposal: {
    name: '提议', base: 'chat', fields: ['changes', 'dropped', 'msg', 'off'],
    get(id) { const st = _coachLoad(), m = (st.chat || []).find(x => x.proposal && x.proposal.id === id); return m ? { obj: m.proposal, m, st, save: () => _coachSave(st) } : null },
    can: h => h.obj.state === 'open',
    original: h => ({
      message: _rvClip(h.obj.msg || h.m.text, 200) || '(见修改)',
      changes: h.obj.changes.filter(c => _rvOkName(c.exercise) && _rvOkName(c.to)).map(c => ({
        scope: c.op === 'setting' ? '以后' : String(c.scope || '以后'), op: c.op, exercise: c.exercise || '', to: c.to || '',
        sets: c.sets ?? null, reps: c.reps ?? null, kg: c.kg ?? null, key: c.key || '',
        value: c.op !== 'setting' ? '' : c.key === 'limits' && !c.value ? '无' : _rvVal(c.value), why: c.why || ''
      }))
    }),
    body: h => ({ context: h.st.chatCtx || buildCoachContext({ catalog: 'names', logDays: 28 }) }),
    take(h, d) {
      const p = _coachPropFrom({ id: h.obj.id, changes: d.changes, dropped: d.dropped });
      return { changes: p ? p.changes : [], dropped: p ? p.dropped : (Array.isArray(d.dropped) ? d.dropped.filter(n => typeof n === 'string').slice(0, 8) : []), msg: _rvClip(d.message, 200), off: [] };
    },
    // 对话历史里跟着那条助手消息告诉 AI:她提过什么意见、提议现在是第几版
    after(h) { const o = h.obj; h.m.rev = `(她对这张提议提了修改意见：${(o.notes || []).map(n => `「${n}」`).join('')}；现在卡片上是第 ${o.cur + 1} 版：${o.changes.map(_coachChangeTxt).join('；') || '没有改动'})` },
    paint(id) {   // 重画整段对话会滚到最底下:画完把这张卡滚回视野里
      _coachShowChat();
      const c = [...document.querySelectorAll('#co-chat-log .co-prop')].find(x => x.dataset.pid === id);
      if (c && typeof c.scrollIntoView === 'function' && typeof uiCurrentTab !== 'undefined' && uiCurrentTab === 'coach') c.scrollIntoView({ block: 'nearest' });
    },
    ref: h => ({ t: '提议', s: (h.obj.changes || []).map(c => `${c.op === 'setting' ? '设置' : _coachScopeLabel(c.scope)} ${_coachRowTxt(c, h.obj.state === 'open')}`).join('；') }),
  },
  review: {
    name: '复盘', base: 'review', fields: ['headline', 'summary', 'wins', 'issues', 'adjustments', 'applied', 'model', 'effort', 'cost'],
    get() { const st = _coachLoad(); return st.review ? { obj: st.review, st, save: () => _coachSave(st) } : null },
    can: () => true,
    original: h => ({
      headline: h.obj.headline || '', summary: h.obj.summary || '', wins: h.obj.wins || [], issues: h.obj.issues || [],
      adjustments: (h.obj.adjustments || []).filter(a => _rvOkName(a.exercise)).map(a => ({ type: a.type, exercise: a.exercise || '', value: Number(a.value) || 0, reason: a.reason || '' }))
    }),
    body: () => ({ context: buildCoachContext({ catalog: 'names' }) }),
    take(h, d, r) {
      if (!d.headline && !d.summary) throw new Error('AI 回的格式不对，再试一次');
      const arr = a => (Array.isArray(a) ? a : []).map(x => String(x));
      return { headline: String(d.headline || ''), summary: String(d.summary || ''), wins: arr(d.wins), issues: arr(d.issues), adjustments: _coachCleanAdj(Array.isArray(d.adjustments) ? d.adjustments : []), applied: [], model: r.model, effort: r.effort, cost: r.cost };
    },
    paint: () => coachRenderReview(),
    ref: h => ({ t: '复盘', s: `${h.obj.headline || ''}。` + ((h.obj.adjustments || []).length ? '建议调整：' + h.obj.adjustments.map(_adjText).join('；') : '') }),
  },
  plan: {
    name: '计划草稿', base: 'plan', fields: ['rationale', 'days', 'dropped', 'align', 'off', 'model', 'effort', 'cost'],
    get() { const st = _coachLoad(); return st.planDraft ? { obj: st.planDraft, st, save: () => _coachSave(st) } : null },
    can: h => h.obj.state !== 'applied',
    original: h => ({
      rationale: h.obj.rationale || '',
      days: (h.obj.days || []).map(d => ({ date: d.date, isRest: !!d.isRest, workoutType: d.workoutType || '', exercises: (d.exercises || []).filter(e => _rvOkName(e.name)).map(e => ({ name: e.name, group: e.group || '', sets: e.sets, reps: e.reps })) }))
    }),
    body(h) {
      const dates = h.obj.dates || h.obj.days.map(d => d.date), al = typeof partnerAlignForAI === 'function' ? partnerAlignForAI(dates) : null;
      return { context: buildCoachContext({ catalog: 'full' }), dates, ...(al ? { align: al } : {}), request: h.obj.req || '' };
    },
    take(h, d, r) {
      const dates = h.obj.dates || h.obj.days.map(x => x.date), dr = _coachValidatePlan(d, dates);
      if (!dr.days.length) throw new Error('新的一版里没有能用的日子，还是上一版');
      const al = typeof partnerAlignForAI === 'function' && partnerAlignForAI(dates) && typeof partnerAlignCount === 'function' ? partnerAlignCount(dr.days) : null;
      return { rationale: dr.rationale, days: dr.days, dropped: dr.dropped, align: al, off: [], model: r.model, effort: r.effort, cost: r.cost };
    },
    paint: () => coachShowPlanDraft(),
    ref: h => ({ t: '计划草稿', s: (h.obj.days || []).map(d => `${String(d.date).slice(5).replace('-', '/')} ${d.isRest ? '休息' : `${d.workoutType}：${d.exercises.filter(e => _rvOkName(e.name)).map(e => e.name).join('、')}`}`).join('；') }),
  },
  swap: {
    name: '换动作推荐', base: 'swap', fields: ['options', 'dropped', 'model', 'effort', 'cost'],
    get(id) { const x = _coachSwapCtx(), e = x && x.key === id ? _swapAI.get(id) : null; return e && e.state === 'ok' ? { obj: e, x, save() { } } : null },
    can: () => true,
    original: h => ({ options: (h.obj.options || []).map(o => ({ name: o.name, sets: o.sets, reps: o.reps, kg: o.kg ?? null, why: o.why || '' })) }),
    body: h => ({ context: buildCoachContext({ catalog: 'full', logDays: 28 }), exercise: h.x.ex.name, reason: _SWAP_WHY[_swapReason] || _swapReason, date: h.x.c.date }),
    take: (h, d, r) => ({ ..._coachCleanSwap(d, h.x.c.date, h.x.c.ei), model: r.model, effort: r.effort, cost: r.cost }),
    paint: () => _coachSwapPaint(),
    ref: h => ({ t: '换动作推荐', s: `换掉「${_coachNm(h.x.ex.name)}」(${_swapReason || '没说原因'})：` + ((h.obj.options || []).map(o => `${o.name} ${_coachSpecTxt(o.sets, o.reps, o.unit, o.kg)}`).join('；') || '没挑出合适的') }),
  },
  vision: {
    name: '认器械结果', base: 'vision', fields: ['equipment', 'note', 'list', 'model', 'effort', 'cost'],
    get() { const v = window._coachVis; return v ? { obj: v, save() { } } : null },
    can: () => true,
    original: h => ({ equipment: h.obj.equipment, note: h.obj.note, exercises: h.obj.list.map(e => ({ name: e.name, why: e.why })) }),
    body: h => ({ context: buildCoachContext({ catalog: 'full', logDays: 14 }), image: h.obj.img }),
    take: (h, d, r) => _coachVisTake(d, r),
    paint: () => _coachVisionPaint(),
    ref: h => ({ t: '认器械结果', s: `${h.obj.equipment}：${h.obj.list.map(e => e.name).join('、') || '动作库里没有对应的动作'}` }),
  },
  feedback: {
    name: '打卡反馈', base: 'feedback', fields: ['text', 'limit_add', 'next', 'limitAdded', 'model', 'effort', 'cost'],
    get(date) { const st = _coachLoad(), fb = (st.feedback || {})[date]; return fb && fb.state === 'ok' ? { obj: fb, st, date, save: () => _coachSave(st) } : null },
    can: h => !!_coachSessionFor(h.date, { skipped: !!h.obj.skipped }),
    original: h => ({ text: h.obj.text || '', limit_add: h.obj.limit_add || null, next_adjust: (h.obj.next || []).map(a => ({ exercise: a.exercise, change: a.change, why: a.why || '' })) }),
    body: h => ({ context: buildCoachContext({ catalog: 'names', logDays: 28 }), session: _coachSessionFor(h.date, { skipped: !!h.obj.skipped }) }),
    take(h, d, r) {
      const f = _coachCleanFb(d);
      if (!f.text) throw new Error('AI 回的格式不对，再试一次');
      return { ...f, limitAdded: !!(f.limit_add && (S.limits || '').includes(f.limit_add)), model: r.model, effort: r.effort, cost: r.cost };
    },
    paint(date) { const el = document.getElementById('co-fb-' + date); if (el) el.outerHTML = coachFeedbackHtml(date) },
    ref: h => ({ t: '打卡反馈', s: `${h.date.slice(5).replace('-', '/')} 打卡后：${h.obj.text}` + ((h.obj.next || []).length ? ' 下次：' + h.obj.next.map(a => `${a.exercise} ${a.change}`).join('；') : '') }),
  },
  note: {
    name: '教练的话', base: null, fields: ['text', 'model', 'effort', 'cost'],   // 原接口不带「我 → 05」选的模型,这里也不带
    get(date) { const st = _coachLoad(), n = st.note; return n && n.text && n.date === date ? { obj: n, st, save: () => _coachSave(st) } : null },
    can: () => true,
    original: h => ({ note: h.obj.text }),
    body: () => ({ context: buildCoachContext({ logDays: 14 }) }),
    take(h, d, r) {
      const t = String(d.note || '').trim().slice(0, 200);
      if (!t) throw new Error('AI 回的格式不对，再试一次');
      return { text: t, model: r.model, effort: r.effort, cost: r.cost };
    },
    paint() { const el = document.getElementById('co-note'); if (el) el.outerHTML = coachTodayNoteHtml(todayStr()) },
    ref: h => ({ t: '教练的话', s: h.obj.text }),
  },
  action: {   // 对话 / 陪练里已经直接改了今天的训练:只有「不对，说说」
    name: '改动', fields: [],
    get(id) { const st = _coachLoad(), m = [...(st.chat || []), ...((st.quick && st.quick.msgs) || [])].find(x => x.action && x.action.id === id); return m ? { obj: m.action, save() { } } : null },
    can: () => false,
    ref(h) {
      const a = h.obj, ok = a.changes.filter((c, k) => !a.result[k]).map(_coachTodayTxt);
      return { t: '改动', s: `教练${a.date === todayStr() ? '今天' : ' ' + String(a.date).slice(5)}直接改了训练${a.state === 'undone' ? '(她后来撤销了)' : ''}：${ok.join('；')}` };
    },
  },
};
// 「改一下 / 聊聊」那一条(带版本切换;点开是输入框)。没开通 AI、结果不在了就不画
function _coachRvHtml(kind, id) {
  if (coachAccess() !== 'on') return '';
  const A = _RV[kind], h = A && A.get(id);
  if (!h) return '';
  const rk = kind + ':' + (id || ''), o = h.obj, busy = _rvBusy.has(rk), can = A.can(h), open = can && !busy && _rvOpen.has(rk);
  const c = { rk, kind, name: A.name, n: o.vers ? o.vers.length : 1, cur: o.vers ? o.cur : 0, busy, open, can, draft: _rvDraft.get(rk) || '', notes: o.notes || [] };
  return skinTpl('coachRv', c, c => `<div class="co-rvw" data-rk="${_esc(c.rk)}" style="display:flex;flex-direction:column;gap:6px">`
    + (c.n > 1 ? `<div class="co-meta" style="display:flex;flex-wrap:wrap;align-items:center;column-gap:16px">第 ${c.cur + 1} / ${c.n} 版${c.cur > 0 ? `<button type="button" class="link-btn u" onclick="coachRvVer(this,-1)">上一版</button>` : ''}${c.cur < c.n - 1 ? `<button type="button" class="link-btn u" onclick="coachRvVer(this,1)">下一版</button>` : ''}</div>` : '')
    + (c.busy ? `<span class="note-line" role="status">教练在按你的意见改…</span>`
      : c.open ? `<textarea class="line-area" rows="2" aria-label="哪里不对、想怎么改" placeholder="哪里不对、想怎么改。可以只说某一条：「第 2 条不要」「深蹲换成别的」" oninput="coachRvDraft(this)">${_esc(c.draft)}</textarea>`
        + (c.notes.length ? `<span class="note-line">之前说过：${c.notes.map(x => `「${_esc(x)}」`).join('')}</span>` : '')
        + `<div class="btn-row"><button type="button" class="btn-primary" onclick="coachRvSend(this)">发送</button><button type="button" class="btn-line" onclick="coachRvToggle(this)">取消</button></div>`
        : `<div style="display:flex;column-gap:20px">${c.can ? `<button type="button" class="link-btn u" onclick="coachRvToggle(this)">改一下</button>` : ''}<button type="button" class="link-btn u" onclick="coachDiscuss(this)">聊聊</button></div>`)
    + `</div>`);
}
function _rvKey(el) {
  const w = el && el.closest && el.closest('[data-rk]'), rk = w ? w.dataset.rk : '', i = rk.indexOf(':');
  return i > 0 && _RV[rk.slice(0, i)] ? { rk, kind: rk.slice(0, i), id: rk.slice(i + 1), w } : null;
}
function coachRvToggle(btn) {
  const k = _rvKey(btn);
  if (!k) return;
  if (_rvOpen.has(k.rk)) _rvOpen.delete(k.rk); else _rvOpen.add(k.rk);
  _RV[k.kind].paint(k.id);
  if (!_rvOpen.has(k.rk)) return;
  const ta = [...document.querySelectorAll('.co-rvw textarea')].find(t => t.closest('[data-rk]').dataset.rk === k.rk);
  if (ta) { try { ta.focus({ preventScroll: true }) } catch { } }
}
function coachRvDraft(ta) { const k = _rvKey(ta); if (k) _rvDraft.set(k.rk, ta.value) }
// 切到上一版 / 下一版:当前这版的勾选、采纳状态先存回去
function coachRvVer(btn, d) {
  const k = _rvKey(btn);
  if (!k || _rvBusy.has(k.rk)) return;
  const A = _RV[k.kind], h = A.get(k.id), o = h && h.obj;
  if (!o || !o.vers || !A.can(h)) return;
  const to = o.cur + d;
  if (to < 0 || to >= o.vers.length) return;
  o.vers[o.cur] = _rvPick(o, A.fields);
  o.cur = to; _rvPut(o, A.fields, o.vers[to]);
  if (A.after) A.after(h);
  h.save();
  A.paint(k.id);
}
async function coachRvSend(btn) {
  const k = _rvKey(btn);
  if (!k || _rvBusy.has(k.rk)) return;
  const ta = k.w.querySelector('textarea'), note = String((ta && ta.value) || '').trim().slice(0, 500);
  if (!note) { if (ta) ta.focus(); return showToast('先写一句哪里不对') }
  const A = _RV[k.kind], h = A.get(k.id);
  if (!h || !A.can(h)) return;
  const notes = [...(h.obj.notes || []), note].slice(-10);
  const body = { kind: k.kind, original: A.original(h), notes, gate: [..._coachGated()], ...A.body(h), ...(A.base ? _coachOpts(A.base) : {}) };
  _rvDraft.set(k.rk, note);
  _rvBusy.add(k.rk); A.paint(k.id);
  let err = '', n = 0;
  try {
    const r = await _coachPoint('/api/revise', body);
    const h2 = A.get(k.id);   // 等的这会儿存档可能变了:重新取,还能改才换
    if (!h2 || !A.can(h2)) throw new Error('这份结果已经变了，没换');
    const nv = A.take(h2, r.data || {}, r), o = h2.obj;
    if (!o.vers) { o.vers = [_rvPick(o, A.fields)]; o.cur = 0 }
    o.vers[o.cur] = _rvPick(o, A.fields);
    o.vers.push(nv);
    while (o.vers.length > _RV_MAX) o.vers.shift();
    o.cur = o.vers.length - 1; n = o.vers.length;
    _rvPut(o, A.fields, nv);
    o.notes = notes;
    if (A.after) A.after(h2);
    h2.save();
    _rvOpen.delete(k.rk); _rvDraft.delete(k.rk);
  } catch (e) { err = e.message || '没改成' }
  _rvBusy.delete(k.rk);
  A.paint(k.id);
  showToast(err ? `没改成：${err}` : `改好了 · 第 ${n} 版，不满意可以切回上一版`);
}
// 聊聊 / 不对，说说:把这份结果记成「待带上的引用」,跳到教练对话;从弹窗、陪练面板、引导训练里点的先把它们关掉
function coachDiscuss(btn) {
  const k = _rvKey(btn);
  if (!k) return;
  const h = _RV[k.kind].get(k.id);
  if (!h) return showToast('这份结果已经不在了');
  const r = _RV[k.kind].ref(h), st = _coachLoad();
  st.chatRef = { k: k.kind, t: r.t, s: _rvClip(r.s, 600), at: Date.now() };
  _coachSave(st);
  if (document.getElementById('swap-modal')?.classList.contains('open')) uiCloseOverlay('swap-modal');
  if (document.getElementById('coach-quick')?.classList.contains('open')) coachQuickClose();
  const wm = document.getElementById('workout-modal'); if (wm && wm.classList.contains('open') && typeof wmClose === 'function') wmClose();
  showTab('coach');
  setTimeout(() => { _coachRefPaint(); const ta = document.getElementById('co-chat-text'); if (ta) { try { ta.focus() } catch { } } }, 60);
}
// 引用:发给 AI 的写法 / 她那条消息上面的小引用 / 输入框上面「待带上」的那条
function _coachRefText(ref) { return `[她点了「聊聊」，关于这份${ref.t}]\n${ref.s}` }
function _coachRefHtml(ref) {
  return skinTpl('coachRef', ref, r => `<span class="co-meta co-ref" style="display:block;border-left:2px solid var(--line);padding-left:8px">关于这份${_esc(r.t)}：${_esc(_rvClip(r.s, 80))}</span>`);
}
function _coachRefPaint() {
  const el = document.getElementById('co-chat-ref');
  if (!el) return;
  const ref = _coachLoad().chatRef;
  el.innerHTML = !ref ? '' : skinTpl('coachRefPending', ref, r => `<div class="co-pending"><span class="co-meta" style="flex:1;min-width:0;border-left:2px solid var(--ink);padding-left:8px">关于这份${_esc(r.t)}：${_esc(_rvClip(r.s, 60))}</span><button type="button" class="link-btn" onclick="coachRefClear()">不带了</button></div>`);
}
function coachRefClear() { const st = _coachLoad(); delete st.chatRef; _coachSave(st); _coachRefPaint() }

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
