(function() {
    // ══ Storage Layer & Sandbox Redirect ═════════════════════════
    const SANDBOX_KEYS = [
        'fit_s1', 'fit_p1', 'fit_pr1', 'fit_log1', 'fit_adj1', 'fit_wh1', 'fit_pr', 'fit_selDate', 'fit_swim', 'fit_gym_ach'
    ];

    const originalGetItem = localStorage.getItem;
    const originalSetItem = localStorage.setItem;
    const originalRemoveItem = localStorage.removeItem;

    const isSandboxActive = () => originalGetItem.call(localStorage, '__dev_active__') === '1';

    function isSandboxKey(key) {
        return SANDBOX_KEYS.some(sk => key === sk || key.endsWith('__' + sk));
    }

    // Proxied localStorage
    localStorage.getItem = function(key) {
        if (isSandboxActive() && isSandboxKey(key)) {
            return originalGetItem.call(localStorage, '__dev__' + key);
        }
        return originalGetItem.call(localStorage, key);
    };

    localStorage.setItem = function(key, value) {
        if (isSandboxActive() && isSandboxKey(key)) {
            return originalSetItem.call(localStorage, '__dev__' + key, value);
        }
        return originalSetItem.call(localStorage, key, value);
    };

    localStorage.removeItem = function(key) {
        if (isSandboxActive() && isSandboxKey(key)) {
            return originalRemoveItem.call(localStorage, '__dev__' + key);
        }
        return originalRemoveItem.call(localStorage, key);
    };

    // Override Sync failures when sandbox is active or simulated offline mode is on
    if (isSandboxActive() || sessionStorage.getItem('__dev_mock_sync_fail__') === '1') {
        window._mockSyncFail = true;
    }

    // ══ Unlock Triggers & State ═════════════════════════════════
    let clicks = 0;
    let lastClick = 0;

    // Double-path unlock: 7 clicks on masthead OR Ctrl+Shift+D
    window.devTriggerClick = function() {
        const now = Date.now();
        if (now - lastClick > 3000) {
            clicks = 0;
        }
        clicks++;
        lastClick = now;
        if (clicks === 7) {
            unlockDevConsole();
            clicks = 0;
        }
    };

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyD') {
            e.preventDefault();
            unlockDevConsole();
        }
    });

    function unlockDevConsole() {
        if (originalGetItem.call(localStorage, 'fit_dev_unlocked') !== '1') {
            originalSetItem.call(localStorage, 'fit_dev_unlocked', '1');
            showToast('开发者测试控制台已解锁！');
            setupDevUI();
        }
        openDevModal();
    }

    // Initialize UI on load
    document.addEventListener('DOMContentLoaded', () => {
        if (originalGetItem.call(localStorage, 'fit_dev_unlocked') === '1') {
            setupDevUI();
        }
    });

    // ══ UI Injection & Management ════════════════════════════════
    let currentTab = 'sim';

    function setupDevUI() {
        if (document.getElementById('dev-float-btn')) return;

        // Floating Action Button
        const floatBtn = document.createElement('div');
        floatBtn.id = 'dev-float-btn';
        floatBtn.className = 'dev-floating-btn';
        floatBtn.innerHTML = 'DEV';
        floatBtn.title = '打开开发者控制台';
        floatBtn.onclick = openDevModal;
        document.body.appendChild(floatBtn);

        // Sandbox Sticky Banner
        if (isSandboxActive()) {
            const banner = document.createElement('div');
            banner.id = 'dev-sandbox-banner';
            banner.className = 'dev-sandbox-banner active';
            banner.innerHTML = `
                <span>[警告] 开发者沙箱模式激活中：数据仅在本地隔离存储，不修改云端数据</span>
                <button onclick="toggleSandbox(false)">退出沙箱</button>
            `;
            document.body.insertBefore(banner, document.body.firstChild);
        }

        // Modal Markup
        const modal = document.createElement('div');
        modal.id = 'dev-modal';
        modal.className = 'ex-modal-overlay';
        modal.onclick = function(e) {
            if (e.target === modal) closeDevModal();
        };

        modal.innerHTML = `
            <div class="ex-modal-card" onclick="event.stopPropagation()">
                <div class="ex-modal-hdr" style="margin-bottom: 10px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
                    <h3 class="ex-modal-title" style="font-family: var(--font-display); font-size: 18px; color: var(--ink; display: flex; align-items: center; gap: 8px;">
                        开发者测试控制台
                        <span id="dev-sandbox-badge" class="badge-dev ${isSandboxActive() ? 'active' : 'inactive'}">
                            ${isSandboxActive() ? '沙箱环境' : '真实环境'}
                        </span>
                    </h3>
                    <button class="ex-modal-close" onclick="closeDevModal()">&#10005;</button>
                </div>

                <div class="dev-tabs-container">
                    <button id="dev-tab-sim-btn" class="dev-tab-btn active" onclick="switchDevTab('sim')">模拟控制</button>
                    <button id="dev-tab-inspector-btn" class="dev-tab-btn" onclick="switchDevTab('inspector')">状态监视</button>
                    <button id="dev-tab-import-btn" class="dev-tab-btn" onclick="switchDevTab('import')">导入/导出</button>
                </div>

                <div class="dev-modal-body">
                    <!-- Tab 1: Simulation -->
                    <div id="dev-panel-sim" class="dev-panel" style="display: block;">
                        <p class="sec" style="margin-top: 0; font-weight: 600; font-size: 13px; color: var(--ink);">数据隔离沙箱 (Sandbox)</p>
                        <div style="background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; margin-bottom: 12px; font-size: 11px; line-height: 1.5; color: var(--ink2);">
                            开启沙箱后，系统会将当前真实数据复制 to 临时存储，之后的所有修改、打卡和重排都在隔离沙箱进行，退出沙箱后恢复真实数据，100% 安全。
                            <div style="margin-top: 8px; display: flex; align-items: center; gap: 10px;">
                                <button class="btn-dev" style="flex: 1; border-color: ${isSandboxActive() ? 'var(--terra)' : 'var(--border)'}" onclick="toggleSandbox(${!isSandboxActive()})">
                                    ${isSandboxActive() ? '退出隔离沙箱' : '开启隔离沙箱'}
                                </button>
                            </div>
                        </div>

                        <p class="sec" style="font-weight: 600; font-size: 13px; color: var(--ink);">测试场景预设 (Scenarios)</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                            <button class="btn-dev" onclick="applyPresetScenario('new_user')">新用户首次使用</button>
                            <button class="btn-dev" onclick="applyPresetScenario('active_user')">活跃用户 (30天历史)</button>
                            <button class="btn-dev" onclick="applyPresetScenario('period')">生理期降重打卡</button>
                            <button class="btn-dev" onclick="applyPresetScenario('mixed')">力量+游泳混合</button>
                        </div>

                        <p class="sec" style="font-weight: 600; font-size: 13px; color: var(--ink);">时钟与夏令时模拟 (Time Travel)</p>
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px; background: var(--surface2); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                            <button class="btn-dev" style="flex: 1;" onclick="toggleDstSimulation()">切换冬/夏令时时间</button>
                            <span id="dst-status" style="font-size: 11px; color: var(--ink3); font-weight: 600;">
                                ${window._mockDate ? (window._mockDate.includes('-06-') ? '模拟夏季 (DST)' : '模拟冬季 (Std)') : '系统真实时间'}
                            </span>
                        </div>

                        <p class="sec" style="font-weight: 600; font-size: 13px; color: var(--ink);">Service Worker / 缓存</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                            <button class="btn-dev dev-danger" style="grid-column:1/-1" onclick="forceSwUpdate()">⚡ 注销SW + 清缓存 + 重载</button>
                            <button class="btn-dev" onclick="checkSwVersion()">查当前SW版本</button>
                            <button class="btn-dev" onclick="skipSwWaiting()">激活等待中的SW</button>
                        </div>

                        <p class="sec" style="font-weight: 600; font-size: 13px; color: var(--ink);">通用调试小工具</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                            <button class="btn-dev" onclick="testSystemSounds('start')">测倒计时开始音</button>
                            <button class="btn-dev" onclick="testSystemSounds('end')">测倒计时结束音</button>
                            <button class="btn-dev" onclick="toggleOfflineSyncSim()">模拟离线/同步切换</button>
                            <button class="btn-dev dev-danger" onclick="clearMockOnly()">清空历史/PR</button>
                        </div>
                    </div>

                    <!-- Tab 2: State Inspector -->
                    <div id="dev-panel-inspector" class="dev-panel" style="display: none;">
                        <div style="font-size: 11px; color: var(--ink3); margin-bottom: 6px;">可折叠树状视图，展示当前运行状态：</div>
                        <div class="dev-json-tree-container" id="dev-json-tree-root">
                            <!-- JSON tree will be recursively rendered here -->
                        </div>
                    </div>

                    <!-- Tab 3: JSON Import/Export -->
                    <div id="dev-panel-import" class="dev-panel" style="display: none;">
                        <div id="dev-json-status" class="dev-status-msg success" style="display: none;"></div>
                        <textarea id="dev-json-textarea" class="dev-textarea" placeholder="在此粘贴 State JSON 进行导入..."></textarea>
                        <div style="display: flex; gap: 8px; margin-top: 10px;">
                            <button class="btn-dev" style="flex: 1;" onclick="copyDevStateJSON()">复制 State</button>
                            <button class="btn-dev" style="flex: 1;" onclick="formatDevStateTextarea()">格式化 JSON</button>
                            <button class="btn-dev" style="flex: 1; background: var(--terra); color: #fff; border-color: var(--terra);" onclick="importDevStateJSON()">保存并载入</button>
                        </div>
                    </div>
                </div>

                <div style="border-top: 1px solid var(--border); padding-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 10px; color: var(--ink3);">快捷键: Cmd/Ctrl+Shift+D 切换</span>
                    <button class="btn-dev dev-danger" style="padding: 4px 8px; font-size: 10px;" onclick="lockDevConsole()">锁定开发者模式</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Listen for textarea modifications to validate JSON live
        const txt = document.getElementById('dev-json-textarea');
        if (txt) {
            txt.addEventListener('input', validateJsonTextareaLive);
        }
    }

    window.openDevModal = function() {
        const modal = document.getElementById('dev-modal');
        if (modal) {
            modal.classList.add('open');
            refreshStateInspector();
        }
    };

    window.closeDevModal = function() {
        const modal = document.getElementById('dev-modal');
        if (modal) modal.classList.remove('open');
    };

    window.switchDevTab = function(tab) {
        currentTab = tab;
        document.querySelectorAll('.dev-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === `dev-tab-${tab}-btn`);
        });
        document.querySelectorAll('.dev-panel').forEach(panel => {
            panel.style.display = panel.id === `dev-panel-${tab}` ? 'block' : 'none';
        });

        if (tab === 'inspector') {
            refreshStateInspector();
        } else if (tab === 'import') {
            populateExportTextarea();
        }
    };

    window.lockDevConsole = function() {
        if (confirm('确定锁定开发者模式吗？锁定后浮标和快捷菜单将隐藏，需要重新在首页标题点击 7 次解锁。')) {
            originalRemoveItem.call(localStorage, 'fit_dev_unlocked');
            originalRemoveItem.call(localStorage, '__dev_active__');
            location.reload();
        }
    };

    const getUid = () => typeof currentUid === 'function' ? currentUid() : 'anon';

    // ══ Data Sandbox Toggle ═════════════════════════════════════
    window.toggleSandbox = function(enable) {
        const uid = getUid();
        if (enable) {
            // Activate Sandbox: copy current real state to sandbox keys
            SANDBOX_KEYS.forEach(k => {
                const prefixed = uid + '__' + k;
                const realVal = originalGetItem.call(localStorage, prefixed);
                if (realVal !== null) {
                    originalSetItem.call(localStorage, '__dev__' + prefixed, realVal);
                }
            });
            originalSetItem.call(localStorage, '__dev_active__', '1');
            showToast('已进入安全沙箱，您的修改不会影响真实数据');
        } else {
            // Deactivate Sandbox: clean up sandbox keys
            SANDBOX_KEYS.forEach(k => originalRemoveItem.call(localStorage, '__dev__' + uid + '__' + k));
            originalRemoveItem.call(localStorage, '__dev_active__');
            showToast('已退出安全沙箱');
        }
        setTimeout(() => location.reload(), 1000);
    };

    // ══ Scenarios / Presets ══════════════════════════════════════
    window.applyPresetScenario = function(type) {
        if (!isSandboxActive()) {
            if (!confirm('警告：您当前不在【隔离沙箱】模式。应用预设会永久修改/覆盖您的【真实训练数据】！\n\n强烈建议先开启“数据隔离沙箱”以确保数据安全。\n\n点击“确定”继续写入真实数据，点击“取消”放弃。')) {
                return;
            }
        }

        if (type === 'new_user') {
            // New user preset: Clear all plan/log/pr data
            SANDBOX_KEYS.forEach(k => localStorage.removeItem(k));
            showToast('已加载【新用户】预设！即将刷新...');
            setTimeout(() => location.reload(), 1000);
        } else if (type === 'active_user' || type === 'mixed') {
            // Unified preset history simulation: active_user uses current settings, mixed forces hybrid settings
            if (type === 'active_user') {
                if (!S.goal) S.goal = '女性薄肌';
                if (!S.level) S.level = '初级';
                if (!S.days) S.days = 4;
                if (!S.dur) S.dur = 60;
                if (!S.equip || S.equip.length === 0) S.equip = ['健身房全套', '哑铃'];
                if (!S.focus || S.focus.length === 0) S.focus = ['均衡全身'];
            } else {
                // Mixed preset: force hybrid strength + swimming settings
                S.goal = '女性薄肌';
                S.level = '初级';
                S.days = 4;
                S.dur = 60;
                S.equip = ['哑铃', '泳池'];
                S.swimLevel = '入门';
                S.focus = ['均衡全身'];
                S.limits = '';
                S.periodMode = false;
            }
            saveState();

            const dbRef = typeof DB !== 'undefined' ? DB : {};
            const getRoutineForGroup = (grp, count = 2) => {
                const pool = dbRef[grp] || [];
                const valid = pool.filter(ex => ex.eq && ex.eq.some(e => S.equip.includes(e) || e === '无器材'));
                return valid.slice(0, count);
            };

            const routine = {
                chest: getRoutineForGroup('chest'),
                triceps: getRoutineForGroup('triceps'),
                shoulder: getRoutineForGroup('shoulder'),
                back: getRoutineForGroup('back'),
                biceps: getRoutineForGroup('biceps'),
                quads: getRoutineForGroup('quads'),
                hamglutes: getRoutineForGroup('hamglutes'),
                calves: getRoutineForGroup('calves'),
                core: getRoutineForGroup('core'),
                cardio: getRoutineForGroup('cardio')
            };

            // In case DB is not loaded (like in headless tests), fallback to some static ones so tests pass
            if (Object.values(routine).every(r => r.length === 0)) {
                routine.chest = [{ n: '哑铃卧推', eq: ['哑铃'], muscle: ['胸'] }];
                routine.back = [{ n: '哑铃划船', eq: ['哑铃'], muscle: ['背'] }];
                routine.quads = [{ n: '哑铃高脚杯深蹲', eq: ['哑铃'], muscle: ['腿'] }];
            }

            const getSwimExercises = () => {
                if (typeof pickSwimExercises === 'function') {
                    return pickSwimExercises();
                }
                return [
                    { name: '水中呼吸练习', sets: 1, reps: 5, unit: '分钟' },
                    { name: '扶边蛙泳腿练习', sets: 1, reps: 15, unit: '分钟' }
                ];
            };

            const hasPool = S.equip.includes('泳池');
            const daysPerWeek = S.days || 3;
            let gymDays = daysPerWeek, swimDays = 0;
            if (hasPool) {
                const swimSplit = { 2:{gym:1,swim:1}, 3:{gym:2,swim:1}, 4:{gym:3,swim:1}, 5:{gym:3,swim:2}, 6:{gym:4,swim:2}, 7:{gym:4,swim:3} };
                const sp = swimSplit[daysPerWeek] || {gym:2, swim:1};
                gymDays = sp.gym;
                swimDays = sp.swim;
            }

            let pattern;
            if (hasPool) {
                const comboPatterns = {
                    '1+1':['G','R','R','S','R','R','R'],
                    '2+1':['G','R','S','R','G','R','R'],
                    '3+1':['G','S','R','G','R','G','R'],
                    '2+2':['G','S','R','G','S','R','R'],
                    '3+2':['G','S','G','R','G','S','R'],
                    '4+2':['G','G','S','G','G','S','R'],
                    '4+3':['G','S','G','S','G','S','G'],
                };
                const key = gymDays + '+' + swimDays;
                pattern = comboPatterns[key] || comboPatterns['3+1'];
            } else {
                const gymPatterns = {
                    2: [1,0,0,1,0,0,0],
                    3: [1,0,1,0,1,0,0],
                    4: [1,1,0,1,1,0,0],
                    5: [1,1,1,0,1,1,0],
                    6: [1,1,1,1,1,1,0],
                    7: [1,1,1,1,1,1,1]
                };
                pattern = gymPatterns[daysPerWeek] || gymPatterns[3];
            }

            const splitsRef = (typeof S !== 'undefined' && S.goal === '臀腿塑形' && typeof GLUTE_SPLITS !== 'undefined') ? GLUTE_SPLITS : (typeof SPLITS !== 'undefined' ? SPLITS : {});
            const currentSplits = splitsRef[gymDays] || [
                { type: '上肢推', groups: ['chest', 'shoulder', 'triceps'] },
                { type: '上肢拉', groups: ['back', 'biceps'] },
                { type: '下肢力量', groups: ['quads', 'hamglutes', 'calves'] },
                { type: '核心与有氧', groups: ['core', 'cardio'] }
            ];

            const today = todayStr();
            const mockLogs = [];
            const mockWh = {};
            let workoutCount = 0;

            for (let i = 30; i >= 1; i--) {
                const dayType = pattern[i % 7];
                if (!dayType || dayType === 'R' || dayType === 0) continue; 
                
                const targetDate = addDays(today, -i);
                const dayExercises = [];
                let splitType = '';

                if (dayType === 'S') {
                    splitType = '游泳训练';
                    const swimExs = getSwimExercises();
                    swimExs.forEach(ex => {
                        dayExercises.push({
                            name: ex.name || ex.n,
                            sets: ex.sets || 1,
                            reps: ex.reps || 10,
                            unit: ex.unit || '分钟',
                            weight: null,
                            done: true
                        });
                    });
                } else {
                    const splitObj = currentSplits[workoutCount % currentSplits.length];
                    workoutCount++;

                    splitType = splitObj.type;
                    const dayGroups = splitObj.groups;

                    dayGroups.forEach(grp => {
                        const exList = routine[grp] || [];
                        exList.forEach(ex => {
                            const isCardio = grp === 'cardio' || (ex.muscle && ex.muscle.includes('心肺'));
                            const reps = isCardio ? 15 : (ex.u === '秒' ? 30 : 12);
                            const unit = ex.u || '次';
                            
                            const isBodyweight = ex.eq && ex.eq.includes('无器材');
                            const hasWeight = !isCardio && grp !== 'core' && grp !== 'calves' && !isBodyweight;
                            
                            const progressStep = Math.round((30 - i) / 5);
                            const baseWeight = grp === 'chest' || grp === 'quads' || grp === 'hamglutes' ? 20 : 10;
                            const weightVal = hasWeight ? (baseWeight + progressStep) : null;

                            dayExercises.push({
                                name: ex.n,
                                sets: 3,
                                reps: reps,
                                unit: unit,
                                weight: weightVal,
                                done: true
                            });

                            if (hasWeight) {
                                if (!mockWh[ex.n]) mockWh[ex.n] = [];
                                mockWh[ex.n].push({
                                    date: targetDate,
                                    weight: weightVal,
                                    rpe: 6 + (i % 3)
                                });
                            }
                        });
                    });
                }

                mockLogs.push({
                    date: targetDate,
                    workout: splitType,
                    duration: dayType === 'S' ? 50 : (S.dur || 60),
                    exerciseCount: dayExercises.length,
                    rpe: 6 + (i % 3),
                    mood: ['爽快', '舒适', '稍累'][i % 3],
                    exercises: dayExercises,
                    note: dayType === 'S' ? '畅快游泳训练。' : '健康打卡纪录模拟。',
                    isSwimDay: dayType === 'S'
                });
            }

            mockLogs.sort((a, b) => b.date.localeCompare(a.date));
            localStorage.setItem(K.log, JSON.stringify(mockLogs));
            localStorage.setItem(K.wh, JSON.stringify(mockWh));

            const mockPr = [];
            const weightExs = Object.keys(mockWh);
            if (weightExs.length >= 2) {
                const ex1 = weightExs[0];
                const history1 = mockWh[ex1];
                if (history1.length >= 3) {
                    const midIndex = Math.floor(history1.length / 2);
                    mockPr.push({
                        date: history1[midIndex].date,
                        exercise: ex1,
                        weight: history1[midIndex].weight,
                        prev: history1[midIndex].weight - 2
                    });
                }
                const ex2 = weightExs[1];
                const history2 = mockWh[ex2];
                if (history2.length >= 3) {
                    const midIndex = Math.floor(history2.length / 2);
                    mockPr.push({
                        date: history2[midIndex].date,
                        exercise: ex2,
                        weight: history2[midIndex].weight,
                        prev: history2[midIndex].weight - 2
                    });
                }
            } else {
                mockPr.push({ date: addDays(today, -15), exercise: '哑铃卧推', weight: 12, prev: 10 });
            }
            localStorage.setItem(K.pr, JSON.stringify(mockPr));

            // Generate swim achievements
            const swimWorkoutLogs = mockLogs.filter(l => l.isSwimDay);
            const swimCount = swimWorkoutLogs.length;

            if (swimCount > 0) {
                const swimMilestonesRef = typeof SWIM_MILESTONES !== 'undefined' ? SWIM_MILESTONES : [];
                const swimLogState = {
                    count: swimCount,
                    milestones: []
                };
                const chronoSwimLogs = [...swimWorkoutLogs].reverse(); // oldest first
                
                swimMilestonesRef.forEach(ms => {
                    if (swimCount >= ms.count) {
                        const matchedLog = chronoSwimLogs[ms.count - 1];
                        swimLogState.milestones.push({
                            count: ms.count,
                            icon: ms.icon || '',
                            title: ms.title,
                            desc: ms.desc,
                            date: matchedLog ? matchedLog.date : today
                        });
                    }
                });
                localStorage.setItem(getUid() + '__fit_swim', JSON.stringify(swimLogState));
            } else {
                localStorage.removeItem(getUid() + '__fit_swim');
            }

            // Generate gym achievements
            const gymWorkoutLogs = mockLogs.filter(l => !l.isSwimDay);
            const gymCount = gymWorkoutLogs.length;

            if (gymCount > 0) {
                const gymMilestonesRef = typeof GYM_MILESTONES !== 'undefined' ? GYM_MILESTONES : [];
                const gymLogState = {
                    count: gymCount,
                    milestones: []
                };
                const chronoGymLogs = [...gymWorkoutLogs].reverse(); // oldest first
                
                gymMilestonesRef.forEach(ms => {
                    if (gymCount >= ms.count) {
                        const matchedLog = chronoGymLogs[ms.count - 1];
                        gymLogState.milestones.push({
                            count: ms.count,
                            icon: ms.icon || '',
                            title: ms.title,
                            desc: ms.desc,
                            date: matchedLog ? matchedLog.date : today
                        });
                    }
                });
                localStorage.setItem(getUid() + '__fit_gym_ach', JSON.stringify(gymLogState));
            } else {
                localStorage.removeItem(getUid() + '__fit_gym_ach');
            }

            if (typeof genPlan === 'function') {
                genPlan(true);
            }
            showToast(type === 'active_user' ? '已加载【活跃用户】预设并生成新计划！' : '已加载【力量+游泳混合】预设并生成新计划！');
            setTimeout(() => location.reload(), 1000);

        } else if (type === 'period') {
            // Period mode preset: periodMode active, mock 3 days ago workout at lowered weight
            S.periodMode = true;
            saveState();

            // Set dumbbell bench press progress benchmark
            const today = todayStr();
            const mockWh = JSON.parse(localStorage.getItem(K.wh) || '{}');
            mockWh['哑铃卧推'] = mockWh['哑铃卧推'] || [];
            if (mockWh['哑铃卧推'].length === 0) {
                mockWh['哑铃卧推'].push({ date: addDays(today, -10), weight: 15, rpe: 7 });
            }
            // Add a lower weight period workout record 3 days ago
            const periodDate = addDays(today, -3);
            mockWh['哑铃卧推'].push({ date: periodDate, weight: 10, rpe: 6, period: true });
            localStorage.setItem(K.wh, JSON.stringify(mockWh));

            // Also insert into log
            const mockLogs = JSON.parse(localStorage.getItem(K.log) || '[]');
            const oldIdx = mockLogs.findIndex(l => l.date === periodDate);
            if (oldIdx !== -1) mockLogs.splice(oldIdx, 1);

            mockLogs.push({
                date: periodDate,
                workout: '上肢推 (生理期温和)',
                duration: 35,
                exerciseCount: 1,
                rpe: 6,
                mood: '轻松',
                exercises: [{ name: '哑铃卧推', sets: 3, reps: 12, unit: '次', weight: 10, done: true }],
                note: '生理期降重打卡模拟。'
            });
            mockLogs.sort((a,b) => b.date.localeCompare(a.date));
            localStorage.setItem(K.log, JSON.stringify(mockLogs));

            if (typeof genPlan === 'function') {
                genPlan(true);
            }
            showToast('已加载【生理期】预设并生成减负计划！');
            setTimeout(() => location.reload(), 1000);
        }
    };

    // ══ Test System Sounds ══════════════════════════════════════
    window.testSystemSounds = function(type) {
        if (type === 'start') {
            if (typeof playRestStartSound === 'function') {
                playRestStartSound();
                showToast('已播放倒计时开始提示音');
            } else {
                showToast('错误：playRestStartSound 未定义');
            }
        } else if (type === 'end') {
            if (typeof playDing === 'function') {
                playDing();
                showToast('已播放倒计时结束提示音');
            } else {
                showToast('错误：playDing 未定义');
            }
        }
    };

    // ══ Toggle Offline Sync Simulation ══════════════════════════
    window.toggleOfflineSyncSim = function() {
        window._mockSyncFail = !window._mockSyncFail;
        if (window._mockSyncFail) {
            sessionStorage.setItem('__dev_mock_sync_fail__', '1');
            showToast('已开启模拟离线模式 (强制同步失败)');
        } else {
            sessionStorage.removeItem('__dev_mock_sync_fail__');
            showToast('已关闭模拟离线模式 (同步已恢复)');
        }

        const pill = document.getElementById('sync-pill');
        if (pill) {
            if (window._mockSyncFail) {
                pill.textContent = 'X';
                pill.className = 'auth-pill-sync err';
            } else {
                pill.textContent = '✓';
                pill.className = 'auth-pill-sync ok';
            }
        }
    };

    // ══ Clear Mock Data Only (History / PR) ════════════════════
    window.clearMockOnly = async function() {
        if (confirm('确定清空所有打卡历史、负重记录和个人最佳纪录（PR）吗？（此操作仅影响当前环境，若在沙箱中则仅清空沙箱数据）')) {
            const uid = getUid();
            localStorage.setItem(uid + '__fit_log1', '[]');
            localStorage.setItem(uid + '__fit_wh1', '{}');
            localStorage.setItem(uid + '__fit_pr', '[]');
            localStorage.setItem(uid + '__fit_pr1', '{}');
            
            if (typeof LOG !== 'undefined') LOG = [];
            if (typeof W_HIST !== 'undefined') W_HIST = {};
            if (typeof PR_LIST !== 'undefined') PR_LIST = [];
            if (typeof S !== 'undefined') S.prog = {};

            if (typeof pushToCloud === 'function') {
                showToast('正在同步清理到云端...');
                await pushToCloud();
            }
            
            showToast('历史记录、负重及 PR 数据已清空！正在刷新...');
            setTimeout(() => location.reload(), 800);
        }
    };

    // ══ Date/DST Simulation ══════════════════════════════════════
    window.toggleDstSimulation = function() {
        const statusEl = document.getElementById('dst-status');
        const currentMock = sessionStorage.getItem('__dev_mock_date__');

        if (!currentMock) {
            // Go to Summer time (DST)
            const dateStr = '2026-06-15T12:00:00';
            sessionStorage.setItem('__dev_mock_date__', dateStr);
            window._mockDate = dateStr;
            if (statusEl) statusEl.textContent = '模拟夏季 (DST)';
            showToast('已切换至模拟夏季 (2026-06-15)');
        } else if (currentMock.includes('-06-')) {
            // Go to Winter time (Std)
            const dateStr = '2026-12-15T12:00:00';
            sessionStorage.setItem('__dev_mock_date__', dateStr);
            window._mockDate = dateStr;
            if (statusEl) statusEl.textContent = '模拟冬季 (Std)';
            showToast('已切换至模拟冬季 (2026-12-15)');
        } else {
            // Clear simulated date
            sessionStorage.removeItem('__dev_mock_date__');
            window._mockDate = null;
            if (statusEl) statusEl.textContent = '系统真实时间';
            showToast('已恢复为系统真实时间');
        }

        // Trigger updates in primary modules
        if (typeof loadState === 'function') loadState();
        if (typeof render === 'function') render();
        if (typeof renderStats === 'function') renderStats();
    };

    // ══ Collapsible JSON Tree Viewer ═════════════════════════════
    function refreshStateInspector() {
        const rootContainer = document.getElementById('dev-json-tree-root');
        if (!rootContainer) return;

        rootContainer.innerHTML = '';
        const inspectState = {
            "S (配置和计划)": window.S,
            "LOG (训练打卡记录)": window.LOG,
            "PR_LIST (个人纪录)": window.PR_LIST,
            "W_HIST (动作负重历史)": window.W_HIST,
            "LocalStorage (真实项)": {
                "fit_theme": originalGetItem.call(localStorage, 'fit_theme'),
                "fit_dev_unlocked": originalGetItem.call(localStorage, 'fit_dev_unlocked'),
                "__dev_active__": originalGetItem.call(localStorage, '__dev_active__')
            }
        };

        const listRoot = document.createElement('ul');
        listRoot.appendChild(createJsonNode('StateRoot', inspectState, true));
        rootContainer.appendChild(listRoot);
    }

    function createJsonNode(key, value, isLast) {
        const li = document.createElement('li');
        li.style.listStyle = 'none';
        li.style.margin = '4px 0 4px 16px';
        li.style.fontFamily = 'var(--font-mono, monospace)';
        li.style.fontSize = '11px';
        li.style.lineHeight = '1.4';

        const labelSpan = document.createElement('span');
        if (key !== null) {
            const keySpan = document.createElement('span');
            keySpan.style.color = 'var(--ink)';
            keySpan.style.fontWeight = 'bold';
            keySpan.textContent = `"${key}": `;
            labelSpan.appendChild(keySpan);
        }

        if (value === null) {
            const valSpan = document.createElement('span');
            valSpan.style.color = 'var(--ink3)';
            valSpan.textContent = 'null';
            labelSpan.appendChild(valSpan);
        } else if (typeof value === 'boolean') {
            const valSpan = document.createElement('span');
            valSpan.style.color = 'var(--terra)';
            valSpan.style.fontWeight = 'bold';
            valSpan.textContent = value;
            labelSpan.appendChild(valSpan);
        } else if (typeof value === 'number') {
            const valSpan = document.createElement('span');
            valSpan.style.color = 'var(--amber)';
            valSpan.textContent = value;
            labelSpan.appendChild(valSpan);
        } else if (typeof value === 'string') {
            const valSpan = document.createElement('span');
            valSpan.style.color = 'var(--sage)';
            valSpan.textContent = `"${value}"`;
            labelSpan.appendChild(valSpan);
        } else if (typeof value === 'object') {
            const isArray = Array.isArray(value);
            const startBracket = isArray ? '[' : '{';
            const endBracket = isArray ? ']' : '}';
            const keys = Object.keys(value);
            const count = keys.length;

            const container = document.createElement('div');
            container.style.display = 'inline-block';

            const toggleSpan = document.createElement('span');
            toggleSpan.style.cursor = 'pointer';
            toggleSpan.style.userSelect = 'none';
            toggleSpan.style.marginRight = '6px';
            toggleSpan.style.color = 'var(--ink3)';
            toggleSpan.textContent = '▼';

            const bracketSpan = document.createElement('span');
            bracketSpan.style.color = 'var(--ink2)';
            bracketSpan.textContent = startBracket;

            const summarySpan = document.createElement('span');
            summarySpan.style.color = 'var(--ink3)';
            summarySpan.style.fontSize = '10px';
            summarySpan.style.fontStyle = 'italic';
            summarySpan.textContent = ` // ${count} items`;

            container.appendChild(toggleSpan);
            container.appendChild(bracketSpan);
            container.appendChild(summarySpan);
            labelSpan.appendChild(container);

            const childUl = document.createElement('ul');
            childUl.style.margin = '0';
            childUl.style.padding = '0';

            keys.forEach((k, idx) => {
                childUl.appendChild(createJsonNode(isArray ? null : k, value[k], idx === count - 1));
            });

            li.appendChild(labelSpan);
            li.appendChild(childUl);

            const endLi = document.createElement('div');
            endLi.style.fontFamily = 'var(--font-mono, monospace)';
            endLi.style.fontSize = '11px';
            endLi.style.marginLeft = '16px';
            endLi.style.color = 'var(--ink2)';
            endLi.textContent = endBracket + (isLast ? '' : ',');
            li.appendChild(endLi);

            let collapsed = true; // Collapse by default to keep clean
            
            // Set initial collapse state
            toggleSpan.textContent = '▶';
            childUl.style.display = 'none';
            endLi.style.display = 'none';
            summarySpan.textContent = ` // ${count} items ${startBracket}...${endBracket}`;

            toggleSpan.onclick = (e) => {
                e.stopPropagation();
                collapsed = !collapsed;
                if (collapsed) {
                    toggleSpan.textContent = '▶';
                    childUl.style.display = 'none';
                    endLi.style.display = 'none';
                    summarySpan.textContent = ` // ${count} items ${startBracket}...${endBracket}`;
                } else {
                    toggleSpan.textContent = '▼';
                    childUl.style.display = 'block';
                    endLi.style.display = 'block';
                    summarySpan.textContent = ` // ${count} items`;
                }
            };

            return li;
        }

        if (!isLast) {
            const commaSpan = document.createElement('span');
            commaSpan.style.color = 'var(--ink2)';
            commaSpan.textContent = ',';
            labelSpan.appendChild(commaSpan);
        }
        li.appendChild(labelSpan);
        return li;
    }

    // ══ JSON Import/Export with Validation ═════════════════════
    function getFullExportObject() {
        const exportData = {
            _meta: {
                version: 1.1,
                exported: new Date().toISOString(),
                app: 'Cici健身计划',
                sandbox: isSandboxActive()
            }
        };
        SANDBOX_KEYS.forEach(key => {
            const val = localStorage.getItem(key);
            if (val !== null) {
                try {
                    exportData[key] = JSON.parse(val);
                } catch {
                    exportData[key] = val;
                }
            }
        });
        return exportData;
    }

    function populateExportTextarea() {
        const txt = document.getElementById('dev-json-textarea');
        if (txt) {
            txt.value = JSON.stringify(getFullExportObject(), null, 2);
            validateJsonTextareaLive();
        }
    }

    window.copyDevStateJSON = function() {
        const txt = document.getElementById('dev-json-textarea');
        if (txt) {
            navigator.clipboard.writeText(txt.value)
                .then(() => showToast('State JSON 已复制到剪贴板！'))
                .catch(() => alert('复制失败，请手动在文本框中全选复制。'));
        }
    };

    window.formatDevStateTextarea = function() {
        const txt = document.getElementById('dev-json-textarea');
        if (!txt) return;
        try {
            const obj = JSON.parse(txt.value);
            txt.value = JSON.stringify(obj, null, 2);
            validateJsonTextareaLive();
        } catch (e) {
            showJsonStatusMessage(`排版格式化失败：${e.message}`, 'error');
        }
    };

    function showJsonStatusMessage(msg, type) {
        const statusEl = document.getElementById('dev-json-status');
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = `dev-status-msg ${type}`;
        statusEl.style.display = 'block';
    }

    function validateJsonTextareaLive() {
        const txt = document.getElementById('dev-json-textarea');
        if (!txt) return;
        const val = txt.value.trim();

        if (!val) {
            showJsonStatusMessage('文本框为空', 'error');
            return;
        }

        try {
            const obj = JSON.parse(val);
            // Count valid keys inside
            let validKeysCount = 0;
            Object.keys(obj).forEach(k => {
                if (SANDBOX_KEYS.includes(k)) validKeysCount++;
            });

            if (validKeysCount === 0) {
                showJsonStatusMessage('JSON 格式正确，但未包含任何有效的应用设置键名（如 fit_s1, fit_p1 等）。', 'error');
            } else {
                showJsonStatusMessage(`JSON 格式正确，检测到 ${validKeysCount} 个应用设置项可用于导入。`, 'success');
            }
        } catch (e) {
            showJsonStatusMessage(`JSON 语法错误：${e.message}`, 'error');
        }
    }

    window.importDevStateJSON = function() {
        const txt = document.getElementById('dev-json-textarea');
        if (!txt) return;

        try {
            const obj = JSON.parse(txt.value);
            let imported = false;

            Object.entries(obj).forEach(([k, v]) => {
                if (SANDBOX_KEYS.includes(k)) {
                    // Check value format - needs to be written as stringified if it's object, else raw
                    const valToWrite = typeof v === 'object' ? JSON.stringify(v) : v;
                    localStorage.setItem(k, valToWrite);
                    imported = true;
                }
            });

            if (imported) {
                showToast('导入成功，正在重新载入主界面...');
                setTimeout(() => location.reload(), 1000);
            } else {
                alert('导入失败：JSON 数据不含合规的项目参数。');
            }
        } catch (e) {
            alert(`导入失败，语法错误：${e.message}`);
        }
    };
    // ══ SW / Cache Tools ════════════════════════════════════════
    window.forceSwUpdate = async function() {
        if (!confirm('注销 Service Worker 并清除所有缓存，然后重载页面？')) return;
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.unregister()));
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            }
        } catch(e) { console.warn('SW cleanup:', e); }
        location.reload(true);
    };

    window.checkSwVersion = async function() {
        try {
            const resp = await fetch('sw.js?_t=' + Date.now());
            const text = await resp.text();
            const m = text.match(/cici-fitness-v\d+/);
            const ver = m ? m[0] : '未找到版本号';
            const reg = await navigator.serviceWorker.getRegistration();
            const active = reg?.active?.scriptURL || '无';
            showToast('服务器: ' + ver + ' | SW状态: ' + (reg?.active ? '激活' : '无'), 4000);
            console.log('server sw.js:', ver, '| active SW:', active);
        } catch(e) { showToast('查询失败: ' + e.message); }
    };

    window.skipSwWaiting = async function() {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            showToast('已发送 skipWaiting，稍后重载...');
            setTimeout(() => location.reload(), 800);
        } else {
            showToast('没有等待中的 SW');
        }
    };
})();
