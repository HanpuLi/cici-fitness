// Developer Console Sandbox and Validation smoke test
const fs = require('fs');
const vm = require('vm');

// ── Stub browser APIs ──
const rawStore = {};
global.localStorage = {
    getItem: k => rawStore[k] ?? null,
    setItem: (k, v) => { rawStore[k] = String(v); },
    removeItem: k => { delete rawStore[k]; }
};

// Stub DOM element and document structure
function mockEl() {
    return new Proxy({}, {
        get(t, p) {
            if (p === 'style') return new Proxy({}, { set() { return true; }, get() { return ''; } });
            if (p === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
            if (p === 'addEventListener') return () => {};
            if (p === 'appendChild') return () => {};
            return t[p];
        },
        set(t, p, v) { t[p] = v; return true; }
    });
}
global.document = {
    getElementById: () => mockEl(),
    querySelectorAll: () => [],
    querySelector: () => mockEl(),
    createElement: () => mockEl(),
    body: mockEl(),
    addEventListener: () => {}
};

global.window = global;
global.showToast = () => {};
global.todayStr = () => '2026-06-01';
global.addDays = (base, n) => {
    const d = new Date(base + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
};
global.saveState = () => {};
global.genPlan = () => {};
global.setTimeout = (fn) => fn();
global.location = { reload: () => {} };

// Global variables that Cici expects
global.S = { goal: '女性薄肌' };
global.LOG = [];
global.PR_LIST = [];
global.W_HIST = {};
global.K = {
    settings: 'fit_s1',
    plan: 'fit_p1',
    prog: 'fit_pr1',
    log: 'fit_log1',
    adj: 'fit_adj1',
    wh: 'fit_wh1',
    pr: 'fit_pr'
};

// Global milestone lists
global.SWIM_MILESTONES = [
    { count: 1, title: '初次下水', desc: '完成第一次游泳训练！' },
    { count: 3, title: '水性初具', desc: '已完成 3 次游泳训练' }
];
global.GYM_MILESTONES = [
    { count: 1, title: '力量萌新', desc: '完成第一次力量训练！' },
    { count: 3, title: '渐入佳境', desc: '已完成 3 次力量训练' }
];

// Load dev.js
const devCode = fs.readFileSync(__dirname + '/../dev.js', 'utf8');
vm.runInThisContext(devCode, { filename: 'dev.js' });

// Assert helper
let passed = 0, failed = 0;
function assert(label, condition) {
    if (condition) {
        passed++;
        console.log(`  [PASS] ${label}`);
    } else {
        failed++;
        console.error(`  [FAIL] ${label}`);
    }
}

console.log('═══ Test 1: LocalStorage Sandbox Redirection ═══');
try {
    // 1. Initially, no sandbox, writing fit_s1 goes to fit_s1
    localStorage.setItem('fit_s1', JSON.stringify({ goal: '女性薄肌' }));
    assert('Normal store write goes to fit_s1', rawStore['fit_s1'] === '{"goal":"女性薄肌"}');
    assert('Normal store does not have sandbox key', rawStore['__dev__fit_s1'] === undefined);

    // 2. Enable Sandbox
    toggleSandbox(true);
    
    // In our implementation, toggleSandbox(true) sets __dev_active__ = 1
    // and copies the keys, then reloads. Let's simulate the reload/proxy effect.
    assert('Sandbox active key is set', rawStore['__dev_active__'] === '1');
    assert('Real key copied to sandbox key', rawStore['__dev__fit_s1'] === '{"goal":"女性薄肌"}');

    // 3. Write in Sandbox
    localStorage.setItem('fit_s1', JSON.stringify({ goal: '臀腿塑形' }));
    assert('Sandbox write redirected to __dev__fit_s1', rawStore['__dev__fit_s1'] === '{"goal":"臀腿塑形"}');
    assert('Real data fit_s1 remains untouched', rawStore['fit_s1'] === '{"goal":"女性薄肌"}');

    // 4. Read in Sandbox
    const sandboxedVal = localStorage.getItem('fit_s1');
    assert('Sandbox read returns sandboxed value', JSON.parse(sandboxedVal).goal === '臀腿塑形');

    // 5. Disable Sandbox
    toggleSandbox(false);
    assert('Sandbox active key removed', rawStore['__dev_active__'] === undefined);
    assert('Sandbox keys cleared', rawStore['__dev__fit_s1'] === undefined);
    assert('Real data fit_s1 is still intact', rawStore['fit_s1'] === '{"goal":"女性薄肌"}');

} catch (e) {
    failed++;
    console.error(`  [CRASH] Test 1 Crash: ${e.message}\n${e.stack}`);
}

console.log('\n═══ Test 2: JSON Import Syntax and Scheme Validator ═══');
try {
    // We can directly call the validation functions in global scope or test raw parsing
    // Mock the textarea inside DOM
    const textareaMock = { value: '' };
    const statusMsgMock = { textContent: '', className: '', style: { display: 'none' } };

    global.document.getElementById = (id) => {
        if (id === 'dev-json-textarea') return textareaMock;
        if (id === 'dev-json-status') return statusMsgMock;
        return mockEl();
    };

    // Test copyDevStateJSON
    textareaMock.value = 'invalid json';
    // Let's call importDevStateJSON and check alert or catch
    let alertCalled = false;
    global.alert = (msg) => {
        alertCalled = true;
    };
    importDevStateJSON();
    assert('Malformed JSON import is blocked and alerts error', alertCalled);

    // Test import validation with valid scheme keys
    alertCalled = false;
    textareaMock.value = JSON.stringify({
        fit_s1: { goal: '女性薄肌' },
        fit_log1: []
    });
    // This should reload (which we'll mock)
    let reloadCalled = false;
    global.location = { reload: () => { reloadCalled = true; } };
    
    importDevStateJSON();
    assert('Valid schema JSON import passes and reloads page', reloadCalled);
    assert('Imported fit_s1 is written', localStorage.getItem('fit_s1') !== null);

} catch (e) {
    failed++;
    console.error(`  [CRASH] Test 2 Crash: ${e.message}\n${e.stack}`);
}

console.log('\n═══ Test 3: Sound and Simulation Utilities ═══');
try {
    // 1. Test testSystemSounds
    let soundPlayed = '';
    global.playRestStartSound = () => { soundPlayed = 'start'; };
    global.playDing = () => { soundPlayed = 'end'; };
    
    testSystemSounds('start');
    assert('testSystemSounds("start") plays correct audio', soundPlayed === 'start');
    
    testSystemSounds('end');
    assert('testSystemSounds("end") plays correct audio', soundPlayed === 'end');

    // 2. Test toggleOfflineSyncSim
    // Mock sessionStorage
    const sessionStore = {};
    global.sessionStorage = {
        setItem: (k, v) => { sessionStore[k] = String(v); },
        removeItem: k => { delete sessionStore[k]; },
        getItem: k => sessionStore[k] ?? null
    };

    window._mockSyncFail = false;
    toggleOfflineSyncSim();
    assert('toggleOfflineSyncSim toggles mock status to true', window._mockSyncFail === true);
    assert('toggleOfflineSyncSim stores state in sessionStorage', sessionStore['__dev_mock_sync_fail__'] === '1');

    toggleOfflineSyncSim();
    assert('toggleOfflineSyncSim toggles mock status back to false', window._mockSyncFail === false);
    assert('toggleOfflineSyncSim removes state from sessionStorage', sessionStore['__dev_mock_sync_fail__'] === undefined);

    // 3. Test clearMockOnly
    let confirmCalled = false;
    global.confirm = () => { confirmCalled = true; return true; };
    localStorage.setItem('fit_log1', '[]');
    localStorage.setItem('fit_wh1', '{}');
    localStorage.setItem('fit_pr', '[]');

    clearMockOnly();
    assert('clearMockOnly prompts for confirmation', confirmCalled);
    assert('clearMockOnly clears historical logs', localStorage.getItem('fit_log1') === null);
    assert('clearMockOnly clears weight history', localStorage.getItem('fit_wh1') === null);
    assert('clearMockOnly clears PR lists', localStorage.getItem('fit_pr') === null);

    // 4. Test active_user Preset Scenario
    // Mock DB structure for the test
    global.DB = {
        chest: [{ n: '杠铃卧推', eq: ['健身房全套'], muscle: ['胸'] }],
        back: [{ n: '引体向上', eq: ['健身房全套'], muscle: ['背'] }],
        quads: [{ n: '杠铃深蹲', eq: ['健身房全套'], muscle: ['腿'] }]
    };
    applyPresetScenario('active_user');
    
    const logsJson = localStorage.getItem('fit_log1');
    const whJson = localStorage.getItem('fit_wh1');
    const prJson = localStorage.getItem('fit_pr');
    
    assert('active_user preset writes logs to local storage', logsJson !== null);
    assert('active_user preset writes weight history to local storage', whJson !== null);
    assert('active_user preset writes PR list to local storage', prJson !== null);
    
    const parsedLogs = JSON.parse(logsJson);
    const parsedWh = JSON.parse(whJson);
    const parsedPr = JSON.parse(prJson);
    
    assert('Mock logs are non-empty', parsedLogs.length > 0);
    // Check if sorted descending (newest first)
    let isDescending = true;
    for (let j = 0; j < parsedLogs.length - 1; j++) {
        if (parsedLogs[j].date < parsedLogs[j+1].date) {
            isDescending = false;
        }
    }
    assert('Mock logs are sorted in descending order (newest first)', isDescending);
    
    // Check that exercises are dynamic and match the split
    const chestLog = parsedLogs.find(l => l.workout === '上肢推');
    if (chestLog) {
        assert('Upper body push split contains chest exercises', chestLog.exercises.some(e => e.name === '杠铃卧推'));
        assert('Upper body push split does not contain legs exercises', !chestLog.exercises.some(e => e.name === '杠铃深蹲'));
    }
    
    // Check achievements
    const gymAchJson = localStorage.getItem('fit_gym_ach');
    assert('active_user preset generates Gym achievements', gymAchJson !== null);
    if (gymAchJson) {
        const parsedGymAch = JSON.parse(gymAchJson);
        assert('Gym achievement milestones list is non-empty', parsedGymAch.milestones.length > 0);
        assert('Gym achievement count matches logs count', parsedGymAch.count === parsedLogs.filter(l => !l.isSwimDay).length);
        assert('Gym achievement date matches matched log date', parsedGymAch.milestones[0].date !== undefined);
    }

} catch (e) {
    failed++;
    console.error(`  [CRASH] Test 3 Crash: ${e.message}\n${e.stack}`);
}

// ── Summary ──
console.log(`\n${'═'.repeat(50)}`);
console.log(`  Dev Suite Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
