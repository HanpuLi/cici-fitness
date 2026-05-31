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
global.addDays = (b, n) => '2026-06-02';
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

// Load dev.js
const devCode = fs.readFileSync(__dirname + '/../dev.js', 'utf8');
vm.runInThisContext(devCode, { filename: 'dev.js' });

// Assert helper
let passed = 0, failed = 0;
function assert(label, condition) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${label}`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${label}`);
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
    console.error(`  ❌ Test 1 Crash: ${e.message}\n${e.stack}`);
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
    console.error(`  ❌ Test 2 Crash: ${e.message}\n${e.stack}`);
}

// ── Summary ──
console.log(`\n${'═'.repeat(50)}`);
console.log(`  Dev Suite Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
