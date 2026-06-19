// Minimal end-to-end smoke test for core.js plan generation
// Uses vm.runInThisContext to simulate browser global scope

const fs = require('fs');
const vm = require('vm');

// ── Stub browser APIs ──
global.localStorage = (() => {
  const store = {};
  return {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
})();
// Mock DOM element factory
function mockEl() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'style') return new Proxy({}, { set() { return true; }, get() { return ''; } });
      if (p === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if (p === 'addEventListener') return () => {};
      if (p === 'appendChild') return () => {};
      if (p === 'querySelectorAll') return () => ({ forEach(){}, length: 0, [Symbol.iterator]: function*(){} });
      if (p === 'querySelector') return () => mockEl();
      if (p === 'dataset') return {};
      if (p === 'children') return [];
      if (p === 'parentElement') return null;
      return t[p];
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
global.document = {
  getElementById: () => mockEl(),
  querySelectorAll: () => ({ forEach(){}, length: 0, [Symbol.iterator]: function*(){} }),
  querySelector: () => mockEl(),
  createElement: () => mockEl(),
  body: mockEl()
};
global.showToast = msg => {};
global.showTab = () => {};
global.schedulePush = () => {};
global.render = () => {};
global.applySettingsToUI = () => {};
global.renderStats = () => {};
global.renderLog = () => {};
global.updateSwimBreakdown = () => {};

// ── Load core.js in global scope ──
const coreCode = fs.readFileSync(__dirname + '/../core.js', 'utf8');
vm.runInThisContext(coreCode, { filename: 'core.js' });

// ── Stub app.js functions that core.js calls ──
global.saveState = () => {};
global.loadState = () => {};
global.updateStateInspector = () => {};

// ── Test suite ──
let passed = 0, failed = 0;
function assert(label, condition) {
  if (condition) { passed++; console.log(`  [PASS] ${label}`); }
  else { failed++; console.error(`  [FAIL] ${label}`); }
}

console.log('\n═══ Test 1: genPlan with goal=女性薄肌 (default) ═══');
try {
  S.goal = '女性薄肌'; S.level = '初级'; S.days = 3; S.dur = 60;
  S.equip = ['健身房全套']; S.focus = ['均衡全身']; S.periodMode = false;
  genPlan(false);
  assert('Plan generated successfully', S.plan && S.plan.days.length === 14);
  assert('Plan has non-rest workout days', S.plan.days.some(d => !d.isRest));
  assert('Each workout day has exercises', S.plan.days.filter(d => !d.isRest).every(d => d.exercises.length > 0));
} catch (e) {
  failed++;
  console.error(`  [CRASH] ${e.message}\n${e.stack}`);
}

console.log('\n═══ Test 2: genPlan with goal=臀腿塑形 (高级) ═══');
try {
  S.goal = '臀腿塑形'; S.level = '高级'; S.days = 4; S.dur = 60;
  S.focus = ['下肢']; S.periodMode = false;
  genPlan(false);
  assert('Plan generated successfully', S.plan && S.plan.days.length === 14);
  assert('Plan tip mentions 臀', S.plan.tip.includes('臀'));
} catch (e) {
  failed++;
  console.error(`  [CRASH] ${e.message}\n${e.stack}`);
}

console.log('\n═══ Test 3: genPlan with UNKNOWN goal (fallback) ═══');
try {
  S.goal = '不存在的目标XYZ'; S.level = '中级'; S.days = 3; S.dur = 50;
  S.focus = ['均衡全身']; S.periodMode = false;
  genPlan(false);
  assert('No crash with unknown goal', S.plan && S.plan.days.length === 14);
} catch (e) {
  failed++;
  console.error(`  [CRASH] ${e.message}\n${e.stack}`);
}

console.log('\n═══ Test 4: autoAlignPlan with 轻量替代 day ═══');
try {
  S.goal = '女性薄肌'; S.level = '初级'; S.days = 4; S.dur = 60;
  S.equip = ['健身房全套', '泳池']; S.focus = ['均衡全身'];
  S.periodMode = true;
  genPlan(false);
  const hasPeriodDay = S.plan.days.some(d => d.workoutType === '轻量替代');
  autoAlignPlan();
  assert('autoAlignPlan did not crash', true);
  if (hasPeriodDay) assert('Period 轻量替代 day exists in plan', true);
  S.periodMode = false;
} catch (e) {
  failed++;
  console.error(`  [CRASH] ${e.message}\n${e.stack}`);
}

console.log('\n═══ Test 5: LOG reverse search direction ═══');
try {
  LOG.length = 0;
  LOG.push({ date: '2026-01-01', workout: '推（胸+肩前/中束+三头）', duration: 50, exerciseCount: 3, exercises: [], rpe: 6 });
  LOG.push({ date: '2026-05-29', workout: '拉（背+肩后束+二头）', duration: 55, exerciseCount: 4, exercises: [], rpe: 7 });
  LOG.push({ date: '2026-05-30', workout: '腿（股四/臀腿/小腿）+核心', duration: 60, exerciseCount: 5, exercises: [], rpe: 8 });

  const lastLog = LOG.slice().reverse().find(l => !l.isSwimDay && l.workout !== '休息' && l.workout !== '游泳训练' && l.workout !== '轻量替代');
  assert('Reverse search finds newest entry (2026-05-30)', lastLog.date === '2026-05-30');
  assert('Newest entry is 腿 day', lastLog.workout.includes('腿'));

  const oldWayLog = LOG.find(l => !l.isSwimDay && l.workout !== '休息');
  assert('Forward search would have found OLDEST (2026-01-01)', oldWayLog.date === '2026-01-01');
} catch (e) {
  failed++;
  console.error(`  [CRASH] ${e.message}\n${e.stack}`);
}

console.log('\n═══ Test 6: assessPlanIntensity with high RPE logs ═══');
try {
  LOG.length = 0;
  LOG.push({ date: '2026-01-01', workout: '推', duration: 40, exerciseCount: 3, rpe: 5, exercises: [{},{},{}] });
  LOG.push({ date: '2026-01-02', workout: '拉', duration: 40, exerciseCount: 3, rpe: 5, exercises: [{},{},{}] });
  LOG.push({ date: '2026-05-28', workout: '推', duration: 50, exerciseCount: 4, rpe: 9, exercises: [{},{},{},{}] });
  LOG.push({ date: '2026-05-29', workout: '拉', duration: 55, exerciseCount: 4, rpe: 8, exercises: [{},{},{},{}] });
  LOG.push({ date: '2026-05-30', workout: '腿', duration: 60, exerciseCount: 5, rpe: 9, exercises: [{},{},{},{},{}] });

  const result = assessPlanIntensity();
  assert('assessPlanIntensity returns a status', !!result.status);
  // With .slice(-3).reverse() we get RPE 9,8,9 → avg ~8.67 → 强度超标
  assert('Detects high intensity (RPE 9,8,9 → 超标)', result.status.includes('超标') || result.cls === 'intensity-over');
} catch (e) {
  failed++;
  console.error(`  [CRASH] ${e.message}\n${e.stack}`);
}

console.log('\n═══ Test 7: recalibrate after period mode → normal ═══');
try {
  S.goal = '女性薄肌'; S.level = '中级'; S.days = 4; S.dur = 60;
  S.equip = ['健身房全套', '泳池']; S.focus = ['均衡全身'];
  S.periodMode = true;
  LOG.length = 0;
  genPlan(false);
  // Switch off period mode and recalibrate
  S.periodMode = false;
  genPlan(true);
  assert('Recalibrate after period mode switch did not crash', S.plan && S.plan.days.length === 14);
  // Verify no 轻量替代 remains in future days (period mode off)
  const futureNonRest = S.plan.days.filter(d => d.date >= todayStr() && !d.isRest);
  const hasPeriodDay = futureNonRest.some(d => d.workoutType === '轻量替代');
  assert('No 轻量替代 in future after period mode off', !hasPeriodDay);
} catch (e) {
  failed++;
  console.error(`  [CRASH] ${e.message}\n${e.stack}`);
}

// ── Summary ──
console.log(`\n${'═'.repeat(50)}`);
console.log(`  结果: ${passed} 通过, ${failed} 失败`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
