// ══ System Version ═════════════════════════════════════════
const APP_VERSION = 'v3.1.0';
const APP_BUILD = 158;               // = sw.js 的 CACHE 编号 = index.html 页脚 build(check-static 会查,三处一起改)
const APP_BUILD_DATE = '2026-10-28';
window.APP_VERSION = APP_VERSION;
window.APP_BUILD = APP_BUILD;
window.APP_BUILD_DATE = APP_BUILD_DATE;

// ══ Firebase Config ══════════════════════════════════════
const firebaseConfig = { apiKey: "AIzaSyB12HcJxsqqmWoih3wnfpyqu9LDzEE9nXs", authDomain: "cici-fitness.firebaseapp.com", projectId: "cici-fitness", storageBucket: "cici-fitness.firebasestorage.app", messagingSenderId: "375793627351", appId: "1:375793627351:web:f2dbfd8e107206417f4092", measurementId: "G-ZHCCRWZ57P" };

// ══ Storage Layer ════════════════════════════════════════
const K = { settings: 'fit_s1', plan: 'fit_p1', prog: 'fit_pr1', log: 'fit_log1', adj: 'fit_adj1', wh: 'fit_wh1', pr: 'fit_pr', swim_log: 'fit_swim', gym_log: 'fit_gym_ach', body: 'fit_body1', xstate: 'fit_sub_depth' };
function currentUid() { return (typeof firebase !== 'undefined' && firebase.auth().currentUser && firebase.auth().currentUser.uid) || 'anon'; }
function _ownerSession() { try { const u = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser; return !!u && u.email === atob('Y2FpdGx5ZUBnbWFpbC5jb20='); } catch { return false; } }
function nsKey(k) { return currentUid() + '__' + k; }
function lg(k) { try { const v = localStorage.getItem(nsKey(k)); return v ? JSON.parse(v) : null } catch { return null } }
function ls(k, v) { try { localStorage.setItem(nsKey(k), JSON.stringify(v)); if (typeof schedulePush === 'function') schedulePush() } catch { } }
// 用户自己输入的文字(打卡备注、排除原因…)拼进 innerHTML 之前先转义
function _escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

// One-time migration: copy pre-namespace "bare" keys (fit_s1 …) into the current
// uid's namespace. Read-only copy — never deletes the bare keys, so it stays a safe
// recovery net even if the app was already opened after the namespacing change.
// __legacy_owner_uid__ stops a shared device from re-migrating one person's data to
// another account; __ns_migrated__<uid> makes it run at most once per account.
// Returns true if anything was actually copied (caller uses this to guard sync).
function migrateLegacyKeys(uid) {
  if (!uid || uid === 'anon') return false;
  if (localStorage.getItem('__ns_migrated__' + uid)) return false;
  const owner = localStorage.getItem('__legacy_owner_uid__');
  if (owner && owner !== uid) { localStorage.setItem('__ns_migrated__' + uid, '1'); return false; }
  const BARE = ['fit_s1', 'fit_p1', 'fit_pr1', 'fit_log1', 'fit_adj1', 'fit_wh1', 'fit_pr', 'fit_swim', 'fit_gym_ach', 'fit_selDate', 'fit_body1', 'fit_sub_depth'];
  let any = false;
  BARE.forEach(k => {
    const src = localStorage.getItem(k);
    if (src === null) return;
    const dst = uid + '__' + k;
    if (localStorage.getItem(dst) === null) { localStorage.setItem(dst, src); any = true; }
  });
  if (any && !owner) localStorage.setItem('__legacy_owner_uid__', uid);
  localStorage.setItem('__ns_migrated__' + uid, '1');
  return any;
}

// ══ 数据安全网:本地快照环 + 骤降拦截 + 恢复 ═══════════════════════
// 防的是"某次本地改动没成功上云 → 下次打开被较旧云端覆盖"这类丢数据。
// 纯新增:不改任何现有读写路径,只额外存档 + 提供恢复。
const SNAP_KEEP = 12;
// resolve(businessKeyName) → 该 key 的解析后值(本地或云端各给一个 resolver)
function _dataVolume(resolve) {
  let n = 0;
  const a = resolve('log'); if (Array.isArray(a)) n += a.length;
  const wh = resolve('wh'); if (wh && typeof wh === 'object') n += Object.keys(wh).length;
  const b = resolve('body'); if (Array.isArray(b)) n += b.length;
  const p = resolve('pr'); if (Array.isArray(p)) n += p.length;
  const sd = resolve('xstate'); if (sd && Array.isArray(sd.metrics)) n += sd.metrics.length;
  const sw = resolve('swim_log'); if (sw && typeof sw.count === 'number') n += sw.count;
  const gm = resolve('gym_log'); if (gm && typeof gm.count === 'number') n += gm.count;
  return n;
}
function _localDate() { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
function saveSnapshot(reason) {
  try {
    const uid = currentUid(); if (uid === 'anon') return;
    const vol = _dataVolume(k => lg(K[k]));
    if (vol === 0 && !/^pre-restore/.test(reason || '')) return;   // 空数据不占位
    const snap = { t: Date.now(), d: _localDate(), reason: reason || '', vol: vol, data: {} };
    Object.values(K).forEach(k => { const v = localStorage.getItem(uid + '__' + k); if (v !== null) snap.data[k] = v; });
    const rk = uid + '__snap_ring';
    let ring = []; try { ring = JSON.parse(localStorage.getItem(rk) || '[]'); } catch {}
    const last = ring[ring.length - 1];
    const instant = /^(predrop|pre-restore)/;   // 拦截前/恢复前的即时快照:总是新增,不合并
    if (last && last.d === snap.d && last.reason === snap.reason && !instant.test(reason || '')) ring[ring.length - 1] = snap;
    else ring.push(snap);
    while (ring.length > SNAP_KEEP) ring.shift();
    localStorage.setItem(rk, JSON.stringify(ring));
  } catch (e) {}
}
function listSnapshots() { try { return JSON.parse(localStorage.getItem(currentUid() + '__snap_ring') || '[]'); } catch { return []; } }
function restoreSnapshot(idx) {
  const ring = listSnapshots(); const snap = ring[idx]; if (!snap) return false;
  saveSnapshot('pre-restore');   // 恢复前先把"当前"存一份,别把现在弄丢
  const uid = currentUid();
  Object.entries(snap.data || {}).forEach(([k, v]) => { try { localStorage.setItem(uid + '__' + k, v); } catch {} });
  return true;
}

// ══ State ════════════════════════════════════════════════
const S = { goal: '女性薄肌', level: '初级', days: 3, dur: 60, equip: ['健身房全套'], focus: ['均衡全身'], limits: '', plan: null, selDate: null, prog: {}, adj: {}, weights: {}, exRpe: {}, poolLounger: {}, flexProg: {}, volumeMultiplier: 1.0, restDur: 45, swimLevel: '入门', weightLevel: '初级', periodMode: false, cycleEnabled: true, cycleDay: 1, cycleLength: 28, vacuumDays: [], autoVolumeAdjust: true };
let LOG = lg(K.log) || [];
let W_HIST = lg(K.wh) || {};
let PR_LIST = lg(K.pr) || []; // {date,exercise,weight,prev}
let SWIM_LOG = lg(K.swim_log) || { count: 0, milestones: [] };
let GYM_LOG = lg(K.gym_log) || { count: 0, milestones: [] };
let BODY_LOG = lg(K.body) || [];
let X_STATE = lg(K.xstate) || { count: 0, metrics: [] }; // 扩展模式的累计次数/连续天数/打卡指标(存档键名沿用旧名,不迁移)
let _logShowAll = false;
let _calWeekOffset = 0;

// ══ Goal Helper ═════════════════════════════════════════
// S.goal can be '女性薄肌', '臀腿塑形', or '女性薄肌+臀腿塑形'
function hasGoal(g) { return S.goal && S.goal.includes(g) }
function isCombinedGoal() { return hasGoal('女性薄肌') && hasGoal('臀腿塑形') }

// ══ Limits ═══════════════════════════════════════════════
const LIMIT_RULES = [
  { kw: ['膝', '膝盖', '膝关节'], exclude: ['杠铃深蹲', '颈前杠铃深蹲', '史密斯深蹲', '哈克深蹲', '钟摆深蹲', '高脚杯深蹲', '壶铃高脚杯深蹲', '倒蹬机', '哑铃弓步蹲', '保加利亚分腿蹲', '跳绳', '波比跳', '波比跳热身', '开合跳热身', '开合跳', '壶铃摆动'] },
  { kw: ['肩', '肩膀', '肩关节'], exclude: ['杠铃推举', '哑铃肩推', '器械推举', '史密斯肩推', '侧平举', '坐姿侧平举机', '绳索侧平举', '杠铃直立划船', '双杠臂屈伸', '自由泳划臂+侧头呼吸', '自由泳完整配合'] },
  { kw: ['腰', '腰椎', '腰背'], exclude: ['传统硬拉', '罗马尼亚硬拉', '俯身划船', '壶铃摆动'] },
  { kw: ['颈', '颈椎'], exclude: ['高位下拉', '杠铃推举'] },
  { kw: ['斜方', '脖子粗', '脖子', '肩颈', '颈肩', '圆肩'], exclude: ['杠铃直立划船'] },
  { kw: ['跳', '跳跃'], exclude: ['跳绳', '开合跳', '波比跳', '开合跳热身', '波比跳热身'] },
  { kw: ['手腕', '腕'], exclude: ['杠铃卧推', '杠铃弯举', '俯卧撑', '腹轮'] },
  { kw: ['踝', '脚踝'], exclude: ['跳绳', '开合跳', '站姿提踵', '开合跳热身', '波比跳热身'] },
];
// 仅「女性曲线」目标可见；其他目标在 getExcluded() 中排除（须与 EX_DETAIL「女性曲线专属」同步）
const CURVE_EXCLUSIVE_EXERCISES = [];
const _PRIVATE_POOL = [
  '蛙式臀桥', '蛙式臀冲', '深蹲底部左右摇摆（squat rock）', '跪姿深蹲（kneeling squat）', '肩胛垫高臀推', '跪姿后倒（股四拉伸）',
  '跪姿挺髋（kneeling hip thrust）', '俯卧蛙式抬腿（frog kick）', '四足髋部大绕环', '四足跪姿髋外展', '驴踢腿（donkey kick）', '鸟狗式（bird dog）', '相扑深蹲跳（sumo squat jump）',
  '青蛙趴', '高跪姿夹枕挺髋保持',
  '靠墙坐姿劈叉（wall straddle）', '快乐婴儿式（深压版）', '青蛙式（frog pose）', '臀推顶端外展保持',
  '仰卧腿画圈（leg circles）', '四足跪姿骨盆画8字', '靠墙倒箭式（分腿版）', '犁式（halasana）', '靠墙站立前屈（wall forward fold）', '仰卧牛面式（gomukhasana）',
  '仰卧快乐婴儿式', '小狗伸展式 (融心式)', '仰卧大V字开合', '池边悬浮分腿', '青蛙式开胯',
  '双腿relevé踮立保持', '靠墙静蹲开胯（turnout）', '颈深屈肌保持（chin tuck hold）', '跪姿手腕拉伸（wrist stretch）',
  '站姿并腿外旋等长（turnout）', '高跪姿挺髋保持（kneeling hip thrust hold）', '仰卧弹力带髋外展保持',
  '四足脊柱波浪（cat flow）', '四足跪姿骨盆绕环（hip circles）',
  '鳄鱼式（makarasana）', '高跪姿后倾等长（kneeling lean back）',
  '臀桥夹球保持', '抱膝排气式（apanasana）',
  '猫式伸展（cat stretch）', '挺尸式（savasana）', '骆驼式（ustrasana）',
  '卧束角式（supta baddha konasana）', '婴儿式（balasana）', '仰卧分腿保持（straddle hold）',
  // 芭蕾
  '芭蕾深蹲（plié）', '芭蕾侧踢腿（battement）', '单腿relevé踮立',
  '芭蕾后退腿（arabesque）', '芭蕾地板后展腿',
  '大踢腿（grand battement）', '前弯后腿上扬（penché）',
  '单腿passé平衡', '旋转中轴训练（pirouette prep）', '仰卧画圈腿（rond de jambe）',
  // 悬挂/拉力链
  '肩胛引体激活', '悬挂屈体静止', '悬挂直体延伸', '悬挂开胯',
  // 体操核心
  '空心体保持', '龙旗', 'L撑',
  // 水中
  '水中侧抬腿', '水中后踢腿', '水中相扑深蹲', '水中摆腿开髋', '泳池边坐姿开胯', '水中骨盆画圆',
  '水中弓步跳', '水中单腿平衡', '水中弹力带外展', '蛙泳腿开合训练',
  // 瑜伽
  '蜥蜴式（lizard）', '鸽式（eka pada kapotasana）', '弓式（dhanurasana）',
  '轮式（urdhva dhanurasana）', '花环式（malasana）', '猴神式（hanumanasana）',
, '幼犬式（puppy pose）'
, '宽膝婴儿式（balasana）'
, '死虫式保持（dead bug hold）'
, '俯冲式俯卧撑（dive bomber push-up）'
, '睡鸽式（sleeping pigeon）'
, '蛙式臀桥保持（frog pump hold）'
, '靠墙静蹲（wall sit）'
, '坐角式（upavistha konasana）'
, '低位蜥蜴式（前臂落地）'
, '侧卧抬腿画圈'
, '穿针式（thread the needle）'
, '仰卧直腿下放（leg lowering）'
, '深蹲转体'
, '死虫式（慢速对角）'
, '跪姿直腿后踢'
, '仰卧英雄式（supta virasana）'
, '斯芬克斯式（sphinx pose）'
, '跪姿股四头肌拉伸'
, '高跪姿后弯（kneeling backbend）'
, '仰卧颈部后仰伸展'
, '相扑深蹲保持（sumo squat hold）'
, '仰卧对角抬举（dead bug 变体）'
, '匍匐爬行（army crawl）'
];
// 私人池伤病过滤:LIMIT_RULES 的 exclude 只列了健身房动作名,私人池动作按名称模式补上
const PRIVATE_LIMIT_RULES = [
  { kw: ['膝', '膝盖', '膝关节'], pat: /跪姿|高跪|跪地|花环式|深蹲|弓步/ },
  { kw: ['颈', '颈椎', '脖子', '肩颈', '颈肩'], pat: /犁式|头颈|颈部|轮式|倒挂/ },
  { kw: ['腰', '腰椎', '腰背'], pat: /轮式|弓式|龙旗|后仰|后伸|后倾|挺髋|penché/ },
  { kw: ['手腕', '腕'], pat: /支撑|爬行|L撑|龙旗|轮式|手臂/ },
  { kw: ['踝', '脚踝'], pat: /足尖|relevé|踮立|弹震|弓步跳/ },
  { kw: ['肩', '肩膀', '肩关节'], pat: /悬挂|龙旗|轮式|倒挂/ },
];
function _privMaxDiff() { return S.level === '高级' ? 3 : 2; }
// ══ 配重适用性(2026-08-26 Cait 反馈①③) ═══════════════════
// 规矩:出现配重输入框 ⟺ 这个动作真的上得了重量,且详情里写清怎么上。
// 判定只看动作本身,不再看它被排进计划的哪一段 —— 此前"肩颈放松/收尾"模块里的
// 面拉、俯卧YTW 被打上 isStretch,配重框就整个消失了(反馈③);反过来芭蕾/瑜伽/
// 骨盆控制这些纯徒手动作只因按"次"计,就白白弹出一个没法填的 kg 框(反馈①)。
const NO_WEIGHT_MOVES = new Set([
  '弹力带划船',        // 阻力来自带子,没有 kg
  '肩胛引体激活', '悬挂开胯', '龙旗', '腹轮', '四足跪姿髋外展', '靠墙天使',
]);
// 徒手为主、但确实可以加负荷的动作 → 显示配重框,并在详情里给出加重方式
const WEIGHT_HOW = {
  '俯卧撑': '负重方式:背上压一片杠铃片(请人放)或穿负重背心;没有就改脚垫高/慢离心,配重填 0 即可。',
  '俯卧YTW': '负重方式:两手各持 1–2kg 小哑铃(或矿泉水瓶)。这个动作重点是肩胛控制,重量宁小勿大。',
  '引体向上': '负重方式:负重腰带挂杠铃片,或双脚夹哑铃。做不满次数就先用弹力带助力,配重填 0。',
  '助力引体向上机': '注意:这台填的是「助力配重」——配重越重越省力。照实记下你选的配重片,数字变小才是进步。',
  '助力双杠臂屈伸': '注意:同样是「助力配重」,越重越轻松。记录时照实填,追求的是数字往下走。',
  '双杠臂屈伸': '负重方式:负重腰带挂片或双脚夹哑铃;徒手做就填 0。',
  '山羊挺身': '负重方式:胸前抱一片杠铃片或哑铃。',
  '保加利亚分腿蹲': '负重方式:两手各持一只哑铃垂于体侧(填单只重量),或肩上扛杠铃。',
  '高脚杯深蹲': '负重方式:双手在胸前捧住一只哑铃或壶铃的一端,像端高脚杯。',
  '相扑深蹲': '负重方式:双手垂在体前握一只哑铃/壶铃,或肩上扛杠铃。',
  '哥萨克深蹲': '负重方式:胸前抱一只哑铃/壶铃配重(同时能当配重又能帮你保持平衡)。',
  '臀桥': '负重方式:髋部横放一根杠铃(垫好护垫)或一只哑铃,双手扶稳。',
  '蛙式臀桥': '负重方式:髋部压一只哑铃或一片杠铃片,双手按住不让它滑。',
  '蛙式臀冲': '负重方式:肩靠凳、髋上放杠铃(加护垫)或哑铃。',
  '肩胛垫高臀推': '负重方式:肩胛靠凳,髋上压杠铃(务必加护垫)或大哑铃。',
  '卷腹': '负重方式:胸前抱一片杠铃片或哑铃(想更难就举过头顶)。',
  '悬挂抬腿': '负重方式:两脚夹住一只哑铃或药球;徒手做就填 0。',
  '罗马椅抬腿': '负重方式:两脚夹住一只哑铃;徒手做就填 0。',
};
const _GEAR_RE = /杠铃|哑铃|壶铃|史密斯|绳索|器械|机|下拉|划船|臀推|硬拉|卧推|推举|弯举|下压|飞鸟|夹胸|提踵|引体|双杠|山羊挺身|倒蹬|哈克|腿屈伸|腿弯举|外展机|内收机|负重|钟摆|臂屈伸|平举|面拉|伐木/;
// 动作层面:这个名字的动作上不上得了重量
function isWeightedMove(name) {
  if (!name) return false;
  if (NO_WEIGHT_MOVES.has(name)) return false;
  return _GEAR_RE.test(name) || Object.prototype.hasOwnProperty.call(WEIGHT_HOW, name);
}
// 计划条目层面:还要按次计、且不是热身(热身一律徒手)
function needsWeightUI(ex) {
  if (!ex) return false;
  if (ex.isWarmup) return false;
  if (ex.unit && ex.unit !== '次') return false;
  return isWeightedMove(ex.name);
}
// 助力器械:填的是「助力配重」,越重越省力 → 纪录、建议重量、进步图都要反过来看(数字往下走才是进步)
const ASSISTED_MOVES = new Set(['助力引体向上机', '助力双杠臂屈伸']);
function isAssistedMove(name) { return ASSISTED_MOVES.has(name); }

// 规矩③:组次以动作本身为准 —— 计时动作优先取它自带的 hold(描述里写明的保持时长),
// 热身取 warmupSec,都没有才用调用处给的默认。手动添加、替换、划掉补位、经期替代都走这里。
// 计时只认 u 为 秒/分钟(库里有显式 u:'次' 的动作,不能用 !!ex.u 判)。
function _repsFor(ex, d = {}) {
  const u = (ex && ex.u) || '次';
  if (u === '秒') return ex.hold || ex.warmupSec || d.sec || 30;
  if (u === '分钟') return d.min || 10;
  return d.reps || 12;
}
// 计划里的动作 ex 换成库里的 alt:单位不变就沿用原来的量(按等级给的秒数/次数),
// 但 alt 自己写明了保持时长的,以它为准;单位变了按 alt 重新给(秒→次 不能把 30 秒当 30 次)
function _swapReps(ex, alt) {
  const nu = alt.u || '次';
  if (nu === ex.unit && !(nu === '秒' && (alt.hold || alt.warmupSec))) return ex.reps;
  return _repsFor(alt, { reps: ex.unit === '次' && ex.reps ? ex.reps : 12 });
}

// ══ 仅 owner 可见的私密项(2026-08-26 反馈⑥) ═══════════════
// 盆底/凯格尔这类动作不排给 Cici —— 与 _PRIVATE_POOL 分开列,因为它们本身是
// 正经训练,只是不该出现在别人的计划里。
const OWNER_ONLY_MOVES = ['凯格尔盆底收缩', '盆底放松呼吸'];

function getExcluded() {
  const s = new Set();
  LIMIT_RULES.forEach(r => { if (r.kw.some(k => S.limits.includes(k))) r.exclude.forEach(e => s.add(e)) });
  PRIVATE_LIMIT_RULES.forEach(r => {
    if (r.kw.some(k => S.limits.includes(k)))
      _PRIVATE_POOL.forEach(n => { if (r.pat.test(n)) s.add(n); });
  });

  if (!hasGoal('女性曲线')) {
    CURVE_EXCLUSIVE_EXERCISES.forEach(e => s.add(e));
  }
  if (!_ownerSession()) {
    _PRIVATE_POOL.forEach(e => s.add(e));
    OWNER_ONLY_MOVES.forEach(e => s.add(e));
  }
  // Cici 反馈健身房没有这两台具体机器 → 永久排除,计划自动用同肌群备选(坐姿划船/器械上背划船/面拉/弹力带划船等)补位
  if (hasGoal('翘臀美背')) { s.add('T把划船'); s.add('直臂下压机'); }
  if (Array.isArray(S.userExcluded)) {
    S.userExcluded.forEach(e => s.add(e));
  }
  return s;
}

function visibleExcludedCount(excluded) {
  const gated = new Set([..._PRIVATE_POOL, ...OWNER_ONLY_MOVES, ...CURVE_EXCLUSIVE_EXERCISES]);
  let n = 0;
  excluded.forEach(x => { if (!gated.has(x)) n++ });
  return n;
}

// ── 每日按序号存的状态(prog/weights/adj/exRpe)在动作数组增删/替换时的维护 ──
// prog[date] 形如 {下标:bool};weights/exRpe 键为 `date-下标`;adj 键为 `date-下标-s|r`。
function _clearExState(date, ei) {
  if (S.prog[date]) delete S.prog[date][ei];
  if (S.weights) delete S.weights[date + '-' + ei];
  if (S.adj) { delete S.adj[date + '-' + ei + '-s']; delete S.adj[date + '-' + ei + '-r']; }
  if (S.exRpe) delete S.exRpe[date + '-' + ei];
}
// 从某天动作数组删掉下标 ri(原长度 oldLen)后,把所有 >ri 的状态整体前移一位,避免打勾/重量错位一格
function _reindexAfterRemoval(date, ri, oldLen) {
  const shift = (get, set, del) => {
    for (let j = ri; j < oldLen - 1; j++) { const v = get(j + 1); if (v !== undefined) set(j, v); else del(j); }
    del(oldLen - 1);
  };
  if (S.prog[date]) shift(j => S.prog[date][j], (j, v) => S.prog[date][j] = v, j => delete S.prog[date][j]);
  if (S.weights) shift(j => S.weights[date + '-' + j], (j, v) => S.weights[date + '-' + j] = v, j => delete S.weights[date + '-' + j]);
  if (S.exRpe) shift(j => S.exRpe[date + '-' + j], (j, v) => S.exRpe[date + '-' + j] = v, j => delete S.exRpe[date + '-' + j]);
  if (S.adj) ['-s', '-r'].forEach(suf => shift(j => S.adj[date + '-' + j + suf], (j, v) => S.adj[date + '-' + j + suf] = v, j => delete S.adj[date + '-' + j + suf]));
}
// 拖拽换天:进度要跟着内容走 → 交换两天所有按日期/下标存的状态
function _swapDayState(a, b) {
  const pa = S.prog[a], pb = S.prog[b];
  if (pb !== undefined) S.prog[a] = pb; else delete S.prog[a];
  if (pa !== undefined) S.prog[b] = pa; else delete S.prog[b];
  const swapPrefix = obj => {
    if (!obj) return;
    const pA = a + '-', pB = b + '-', va = {}, vb = {};
    Object.keys(obj).forEach(k => {
      if (k.startsWith(pA)) { va[k.slice(pA.length)] = obj[k]; delete obj[k]; }
      else if (k.startsWith(pB)) { vb[k.slice(pB.length)] = obj[k]; delete obj[k]; }
    });
    Object.keys(va).forEach(s => obj[pB + s] = va[s]);
    Object.keys(vb).forEach(s => obj[pA + s] = vb[s]);
  };
  swapPrefix(S.weights); swapPrefix(S.exRpe); swapPrefix(S.adj);
}
// 有效重量:用户照预填的"建议重量"做但没手动改输入框时 getWeight 为空 → 回退用建议值,
// 否则 W_HIST 永远空、重量建议永不递进、进步图/个人纪录失效
function _effWeight(date, i, ex) {
  let w = getWeight(date, i);
  if ((w === null || w === undefined) && ex && needsWeightUI(ex) && typeof suggestWeight === 'function') {
    w = suggestWeight(ex.name);
  }
  return (w && w > 0) ? w : null;
}

// ══ 动作改名迁移(2026-08-26 反馈②) ═══════════════════════
// 一批自己编的动作名换成了搜得到的通用名/体式名。历史数据(重量史、个人纪录、
// 训练日志、已排好的计划、手动排除清单)里存的是旧名,不迁移就等于"重量记录清零"。
// 每次 loadState 都跑(云端同步回来的也可能是旧名),幂等。
const EX_RENAMES = {
  '仰卧死虫式静力': '死虫式保持（dead bug hold）',
  '仰卧空中屈膝抬臂控制': '死虫式（慢速对角）',
  '仰卧双腿V字抬高控制': '仰卧直腿下放（leg lowering）',
  '低重心核心俯冲': '俯冲式俯卧撑（dive bomber push-up）',
  '仰卧大字形核心抗阻': '仰卧对角抬举（dead bug 变体）',
  '俯卧支撑贴地式爬行': '匍匐爬行（army crawl）',
  '骨盆前后倾控制': '骨盆前后倾（pelvic tilt）',
  '侧平板髋下沉': '侧平板髋部下沉（side plank hip dip）',
  '高跪姿后展挺立': '高跪姿开胸（kneeling chest opener）',
  '跪姿躯干波浪': '四足脊柱波浪（cat flow）',
  '跪姿骨盆画圆': '四足跪姿骨盆绕环（hip circles）',
  '仰卧风车画腿': '仰卧腿画圈（leg circles）',
  '跪姿骨盆画八字': '四足跪姿骨盆画8字',
  '高跪姿双手抗阻挺立': '高跪姿后倾等长（kneeling lean back）',
  '仰卧芭蕾画弧腿': '仰卧画圈腿（rond de jambe）',
  '坐角式极限贴地': '坐角式（upavistha konasana）',
  '进阶幼犬式延展': '幼犬式（puppy pose）',
  '四足宽距向后拉伸': '宽膝婴儿式（balasana）',
  '极度鸽子式深度前屈': '睡鸽式（sleeping pigeon）',
  '极限低位蜥蜴式': '低位蜥蜴式（前臂落地）',
  '四足跪姿脊柱扭转拉伸': '穿针式（thread the needle）',
  '仰卧屈双膝大腿拉伸': '仰卧英雄式（supta virasana）',
  '俯卧髋部下压伸展': '斯芬克斯式（sphinx pose）',
  '高跪姿大腿前侧拉伸': '跪姿股四头肌拉伸',
  '高跪姿脊柱后伸流动': '高跪姿后弯（kneeling backbend）',
  '芭蕾足尖静力高抬': '双腿relevé踮立保持',
  '跪姿头颈屈肌耐久强化': '颈深屈肌保持（chin tuck hold）',
  '手腕及前臂支撑': '跪姿手腕拉伸（wrist stretch）',
  '跪姿股四极限后仰': '跪姿后倒（股四拉伸）',
  '靠墙九十度前屈': '靠墙站立前屈（wall forward fold）',
  '仰卧束角式静态拉伸': '卧束角式（supta baddha konasana）',
  '跪姿俯身婴儿式拉伸': '婴儿式（balasana）',
  '仰卧折叠犁式': '犁式（halasana）',
  '脊柱波浪': '下犬到上犬流动',
  '跪姿躯干画圈': '四足跪姿躯干绕环',
  '仰卧牛面式': '仰卧牛面式（gomukhasana）',
  '跪姿前倾手臂支撑': '鳄鱼式（makarasana）',
  '靠墙深蹲等长收缩': '靠墙静蹲（wall sit）',
  '相扑深蹲底部静力支撑': '相扑深蹲保持（sumo squat hold）',
  '并脚深蹲腰腹扭转': '深蹲转体',
  '靠墙深蹲芭蕾外展': '靠墙静蹲开胯（turnout）',
  '侧卧单腿抬高绕环': '侧卧抬腿画圈',
  '站姿下肢等长螺旋收缩': '站姿并腿外旋等长（turnout）',
  '跪姿髋环绕': '四足髋绕环（hip CARs）',
  '深度深蹲摇摆': '深蹲底部左右摇摆（squat rock）',
  '跪姿下沉触踵': '跪姿深蹲（kneeling squat）',
  '肩垫高极限臀推': '肩胛垫高臀推',
  '俯跪姿猫牛式伸展': '猫式伸展（cat stretch）',
  '跪姿后踢抬腿': '驴踢腿（donkey kick）',
  '跪姿俯身挺身': '鸟狗式（bird dog）',
  '宽距深蹲弹震': '相扑深蹲跳（sumo squat jump）',
  '仰卧蝴蝶式静力桥': '蛙式臀桥保持（frog pump hold）',
  '四足跪姿后踢伸展': '跪姿直腿后踢',
  // 2026-10 体检第 23 条:半角括号+空格的描述式名字 → 直接能搜到的名字('开合跳'已被有氧占用,热身版沿用「…热身」的叫法)
  '全身动态热身 (开合跳)': '开合跳热身',
  '腹部拉伸 (眼镜蛇式)': '眼镜蛇式'
};
function _migrateExerciseNames() {
  const R = EX_RENAMES, mv = n => (R[n] || n);
  let changed = false;
  const rekey = obj => {          // 键是动作名的表:改键;新旧都有就并起来
    if (!obj) return;
    Object.keys(obj).forEach(k => {
      if (!R[k]) return;
      const nk = R[k];
      if (Array.isArray(obj[k]) && Array.isArray(obj[nk])) obj[nk] = obj[nk].concat(obj[k]);
      else if (obj[nk] === undefined) obj[nk] = obj[k];
      delete obj[k]; changed = true;
    });
  };
  rekey(typeof W_HIST !== 'undefined' ? W_HIST : null);
  rekey(S.flexProg);
  rekey(S.userExcludeReasons);
  if (Array.isArray(S.userExcluded)) S.userExcluded = S.userExcluded.map(n => { if (R[n]) changed = true; return mv(n) });
  if (typeof PR_LIST !== 'undefined' && Array.isArray(PR_LIST))
    PR_LIST.forEach(p => { if (p && R[p.exercise]) { p.exercise = R[p.exercise]; changed = true } });
  if (typeof LOG !== 'undefined' && Array.isArray(LOG))
    LOG.forEach(l => (l && l.exercises || []).forEach(e => { if (e && R[e.name]) { e.name = R[e.name]; changed = true } }));
  if (S.plan && S.plan.days)
    S.plan.days.forEach(d => (d.exercises || []).forEach(e => { if (e && R[e.name]) { e.name = R[e.name]; changed = true } }));
  if (changed) {
    try {
      if (typeof W_HIST !== 'undefined') ls(K.wh, W_HIST);
      if (typeof PR_LIST !== 'undefined') ls(K.pr, PR_LIST);
      if (typeof LOG !== 'undefined') ls(K.log, LOG);
      saveState();
    } catch (e) { console.warn('[rename] 迁移写回失败', e); }
  }
  return changed;
}

// 门控清理(2026-08-26 反馈⑥):非 owner 的账号如果计划里还留着私有池/owner-only 动作
// —— 改门控规则之前生成的、或从云端同步回来的 —— 静默换成同肌群替补,换不出就删掉。
// 只在加载时跑一次,不提示、不留痕。
function _purgeGatedFromPlan() {
  if (typeof _ownerSession === 'function' && _ownerSession()) return;
  if (!S.plan || !S.plan.days) return;
  const gated = new Set([..._PRIVATE_POOL, ...OWNER_ONLY_MOVES]);
  let changed = false;
  S.plan.days.forEach(day => {
    if (!day.exercises) return;
    for (let i = day.exercises.length - 1; i >= 0; i--) {
      const ex = day.exercises[i];
      if (!gated.has(ex.name)) continue;
      changed = true;
      const excluded = getExcluded();
      const used = day.exercises.map(e => e.name);
      let group = null;
      for (const [g, exs] of Object.entries(DB)) { if (exs.find(e => e.n === ex.name)) { group = g; break } }
      const alts = ((group && DB[group]) || []).filter(e => !used.includes(e.n) && !excluded.has(e.n) &&
        (!e.eq || e.eq.some(q => q === '无器材' || S.equip.includes(q))));
      if (alts.length) {
        const alt = alts[0];
        const newUnit = alt.u || '次';
        const newReps = (newUnit === ex.unit) ? ex.reps : (newUnit === '秒' ? (alt.hold || 30) : newUnit === '分钟' ? 10 : (ex.reps || 12));
        _clearExState(day.date, i);
        day.exercises[i] = { name: alt.n, note: alt.note || '', sets: ex.sets, reps: newReps, unit: newUnit, group: ex.group, muscle: alt.muscle || [], diff: alt.diff, isWarmup: !!ex.isWarmup, isStretch: !!ex.isStretch, bi: !!alt.bi };
      } else {
        const oldLen = day.exercises.length;
        day.exercises.splice(i, 1);
        _reindexAfterRemoval(day.date, i, oldLen);
      }
    }
  });
  if (changed && typeof saveState === 'function') saveState();
}

// 划掉后的补位:按训练等级先筛难度(初级只要 ≤2 星),再挑和原动作难度最接近的;同分取库里靠前的
function _pickReplacement(alts, ex) {
  let pool = alts;
  if (S.level === '初级') { const easy = pool.filter(a => (a.diff || 1) <= 2); if (easy.length) pool = easy; }
  const target = ex.diff || (S.level === '高级' ? 3 : S.level === '中级' ? 2 : 1);
  return pool.slice().sort((a, b) => Math.abs((a.diff || 1) - target) - Math.abs((b.diff || 1) - target))[0];
}

// 从某天去掉一个动作:有同组(同泳段)的可用备选就补位,没有就删掉并把后面的状态前移。返回补上来的动作名或 null
function _replaceOrRemove(date, ei) {
  const sel = S.plan && S.plan.days.find(d => d.date === date);
  if (!sel || !sel.exercises[ei]) return null;
  const ex = sel.exercises[ei], name = ex.name;
  let group = null;
  for (const [g, exs] of Object.entries(DB)) { if (exs.find(e => e.n === name)) { group = g; break; } }
  const used = sel.exercises.map(e => e.name);
  const excluded = getExcluded();
  const isSwimEx = ex.group === 'swimming' || ex.swimPhase;
  let alts = [];
  if (isSwimEx) {
    // 游泳动作:限同阶段替补(否则 swimPhase 丢失、泳日分组错乱)
    const maxDiff = S.swimLevel === '入门' ? 1 : S.swimLevel === '进阶' ? 2 : 3;
    alts = (DB.swimming || []).filter(e => e.swimPhase === ex.swimPhase && e.n !== name && !used.includes(e.n) && !excluded.has(e.n) && e.diff <= maxDiff);
  } else if (group && DB[group]) {
    // 装备过滤与生成计划一致:特判"无器材"(否则有器械的用户换不出徒手动作)
    alts = DB[group].filter(e => e.n !== name && !used.includes(e.n) && !excluded.has(e.n) && (!e.eq || e.eq.some(q => q === '无器材' || S.equip.includes(q))));
  }
  sel._edited = true;
  if (alts.length > 0) {
    const alt = _pickReplacement(alts, ex);
    _clearExState(date, ei); // 新动作用干净槽位,不继承旧动作的勾选/重量/组数
    // 单位/时长按补上来的动作本身给(按次的换成按秒的不能显示成「3×12次」);热身/拉伸标记跟着原位置走
    sel.exercises[ei] = { name: alt.n, note: alt.note || '', sets: ex.sets, reps: _swapReps(ex, alt), unit: alt.u || '次', group: ex.group, muscle: alt.muscle || [], diff: alt.diff, isWarmup: !!ex.isWarmup, isStretch: !!ex.isStretch, bi: !!alt.bi };
    if (alt.swimPhase) sel.exercises[ei].swimPhase = alt.swimPhase;
    return alt.n;
  }
  const oldLen = sel.exercises.length;
  sel.exercises.splice(ei, 1);
  _reindexAfterRemoval(date, ei, oldLen); // 后续动作前移一位,按序号存的状态跟着搬,避免错位
  return null;
}

// 永久排除。reasonArg 由「换 / 划掉」面板传进来(原因 chip);不传时沿用旧的 prompt(兼容直接调用)
function excludeUserExercise(date, ei, reasonArg) {
  const sel = S.plan && S.plan.days.find(d => d.date === date);
  if (!sel || !sel.exercises || !sel.exercises[ei]) return;
  const name = sel.exercises[ei].name;
  const reason = reasonArg !== undefined ? reasonArg : prompt(`永久排除动作/器械「${name}」？\n后续所有计划将自动避开此动作。\n如有需要可填入排除原因（如：做不了 / 健身房缺器械）：`, "做不了 / 缺器械");
  if (reason === null) return;
  if (!S.userExcluded) S.userExcluded = [];
  if (!S.userExcluded.includes(name)) S.userExcluded.push(name);
  if (!S.userExcludeReasons) S.userExcludeReasons = {};
  S.userExcludeReasons[name] = reason || '用户手动排除';
  saveState();
  const alt = _replaceOrRemove(date, ei);
  showToast(alt ? `已排除「${name}」，自动换为「${alt}」` : `已排除「${name}」`);
  saveState();
  if (reasonArg !== undefined && typeof uiNotice === 'function') _todayNotice = `已永久排除 ${name} · 想恢复去「计划 → 07」`;
  render();
  if (typeof renderExcludedList === 'function') renderExcludedList();
}
// 只今天划掉:不进排除清单,这一天补一个同组动作(没有就删掉)
function strikeToday(date, ei) {
  const sel = S.plan && S.plan.days.find(d => d.date === date);
  if (!sel || !sel.exercises[ei] || isLocked(sel)) return;
  const name = sel.exercises[ei].name;
  const alt = _replaceOrRemove(date, ei);
  uiCloseOverlay('swap-modal');
  saveState();
  if (typeof uiNotice === 'function') uiNotice(alt ? `已划掉 ${name} · 只影响今天，补位动作「${alt}」已换上` : `已划掉 ${name} · 只影响今天`);
  else render();
}
window.strikeToday = strikeToday;
window.excludeUserExercise = excludeUserExercise;

function excludeUserExerciseByName(name, reasonArg) {
  if (!name) return;
  const reason = reasonArg !== undefined ? reasonArg : prompt(`永久排除动作/器械「${name}」？\n后续所有计划将自动避开此动作。\n如有需要可填入排除原因（如：做不了 / 健身房缺器械）：`, "做不了 / 缺器械");
  if (reason === null) return;
  if (!S.userExcluded) S.userExcluded = [];
  if (!S.userExcluded.includes(name)) S.userExcluded.push(name);
  if (!S.userExcludeReasons) S.userExcludeReasons = {};
  S.userExcludeReasons[name] = reason || '用户手动排除';
  
  if (S.plan && S.plan.days) {
    const today = todayStr();
    S.plan.days.forEach(day => {
      // 只动今天和以后:过去的日子(含已锁定的)是练过的记录,不该被改写、更不该重排下标
      if (!day.exercises || day.date < today) return;
      // 倒序删除并逐个重排该天的按序号状态,避免打勾/重量错位
      for (let i = day.exercises.length - 1; i >= 0; i--) {
        if (day.exercises[i].name === name) {
          const oldLen = day.exercises.length;
          day.exercises.splice(i, 1);
          _reindexAfterRemoval(day.date, i, oldLen);
        }
      }
    });
  }
  saveState(); // 排除列表 + 计划改动一起落盘
  showToast(`已永久排除动作：「${name}」`);
  render();
  if (typeof renderExcludedList === 'function') renderExcludedList();
}
window.excludeUserExerciseByName = excludeUserExerciseByName;

function restoreUserExercise(name) {
  if (S.userExcluded) S.userExcluded = S.userExcluded.filter(n => n !== name);
  if (S.userExcludeReasons) delete S.userExcludeReasons[name];
  saveState();
  showToast(`已恢复动作：「${name}」`);
  render();
  if (typeof renderExcludedList === 'function') renderExcludedList();
}
window.restoreUserExercise = restoreUserExercise;

// ══ Exercise Database (overhauled) ═══════════════════════
// Each exercise: n=name, eq=equipment, cat=category, muscle=primary muscles, diff=difficulty 1-3, note=cue
const DB = {
  chest: [
    { n: '杠铃卧推', eq: ['健身房全套'], muscle: ['胸', '三头'], diff: 2, note: '双脚踩地，肩胛骨收紧下沉，杠铃下放至胸口' },
    { n: '哑铃卧推', eq: ['哑铃', '健身房全套'], muscle: ['胸', '三头'], diff: 1, note: '手肘45°，下放至胸部两侧与肩同高' },
    { n: '上斜哑铃卧推', eq: ['哑铃', '健身房全套'], muscle: ['上胸', '三头'], diff: 2, note: '靠背30-45°，感受上胸发力' },
    { n: '下斜杠铃卧推', eq: ['健身房全套'], muscle: ['下胸', '三头'], diff: 2, note: '头朝下，杠铃下放至下胸部' },
    { n: '史密斯卧推', eq: ['健身房全套'], muscle: ['胸', '三头'], diff: 1, note: '轨道固定，专注胸大肌收缩' },
    { n: '坐姿推胸机', eq: ['健身房全套'], muscle: ['胸'], diff: 1, note: '全程控制离心，不要锁死肘部' },
    { n: '器械夹胸', eq: ['健身房全套'], muscle: ['胸大肌中缝'], diff: 1, note: '手肘微屈保持固定，想象抱树' },
    { n: '绳索夹胸', eq: ['健身房全套'], muscle: ['胸'], diff: 1, note: '顶峰收缩挤压1秒' },
    { n: '绳索下斜夹胸', eq: ['健身房全套'], muscle: ['下胸'], diff: 1, note: '高位滑轮，向腹部前方夹拢' },
    { n: '哑铃仰卧屈臂上拉', eq: ['哑铃', '健身房全套'], muscle: ['胸', '背阔'], diff: 2, note: '横躺在凳上，哑铃放至头后' },
    { n: '上斜哑铃飞鸟', eq: ['哑铃', '健身房全套'], muscle: ['上胸'], diff: 2, note: '微弯肘，感受胸肌拉伸' },
    { n: '俯卧撑', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['胸', '三头'], diff: 1, note: '核心收紧，身体一直线' },
    { n: '鳄鱼式（makarasana）', eq: ['无器材'], muscle: ['胸大肌'], diff: 1, note: '俯卧于垫，额头枕在交叠的前臂上，深长腹式呼吸，放松腰背', u: '秒' },
  ],
  shoulder: [
    { n: '杠铃推举', eq: ['健身房全套'], muscle: ['前束', '中束'], diff: 2, note: '核心收紧，不要过度后仰' },
    { n: '哑铃肩推', eq: ['哑铃', '健身房全套'], muscle: ['前束', '中束'], diff: 1, note: '不耸肩，推到顶端不完全锁死' },
    { n: '器械推举', eq: ['健身房全套'], muscle: ['前束', '中束'], diff: 1, note: '背部贴紧，手肘微靠前推起' },
    { n: '史密斯肩推', eq: ['健身房全套'], muscle: ['前束', '中束'], diff: 1, note: '固定轨迹，适合大重量冲刺' },
    { n: '侧平举', eq: ['哑铃', '健身房全套'], muscle: ['中束'], diff: 1, note: '小拇指略高于大拇指，肘微弯' },
    { n: '坐姿侧平举机', eq: ['健身房全套'], muscle: ['中束'], diff: 1, note: '小臂固定在挡板上，侧抬起' },
    { n: '绳索侧平举', eq: ['健身房全套'], muscle: ['中束'], diff: 1, note: '单臂交替，保持张力', bi: true },
    { n: '哑铃前平举', eq: ['哑铃', '健身房全套'], muscle: ['前束'], diff: 1, note: '双手交替或同时向前平举' },
    { n: '绳索前平举', eq: ['健身房全套'], muscle: ['前束'], diff: 1, note: '背对绳索，从胯部向前拉起' },
    { n: '杠铃直立划船', eq: ['健身房全套'], muscle: ['中束', '斜方肌'], diff: 2, note: '宽握，手肘向上提拉至胸口' },
    { n: '俯身飞鸟', eq: ['哑铃', '健身房全套'], muscle: ['后束'], diff: 1, note: '俯身45°，挤压肩胛' },
    { n: '反向飞鸟机', eq: ['健身房全套'], muscle: ['后束'], diff: 1, note: '控制回放速度' },
    { n: '面拉', eq: ['健身房全套', '弹力带'], muscle: ['后束', '外旋'], diff: 1, note: '拉向面部两侧，外旋手臂' },
  ],
  back: [
    { n: '引体向上', eq: ['健身房全套'], muscle: ['背阔', '二头'], diff: 3, note: '全程控制，下放慢速2-3秒' },
    { n: '助力引体向上机', eq: ['健身房全套'], muscle: ['背阔', '二头'], diff: 1, note: '调好配重（越重越轻），控制背部发力' },
    { n: '高位下拉', eq: ['健身房全套'], muscle: ['背阔'], diff: 1, note: '挺胸，拉至锁骨位置' },
    { n: '坐姿划船', eq: ['健身房全套', '弹力带'], muscle: ['中背', '菱形'], diff: 1, note: '肘贴身后拉，挤压肩胛骨' },
    { n: 'T把划船', eq: ['健身房全套'], muscle: ['中背', '背阔'], diff: 2, note: '双脚跨立，背部保持平直' },
    { n: '杠铃斜板划船', eq: ['健身房全套'], muscle: ['中背'], diff: 1, note: '胸贴上斜板，孤立背部发力' },
    { n: '哑铃单臂划船', eq: ['哑铃', '健身房全套'], muscle: ['背阔'], diff: 1, note: '拉至腰部，感受背阔收缩', bi: true },
    { n: '器械上背划船', eq: ['健身房全套'], muscle: ['上背', '菱形'], diff: 1, note: '挺胸，手肘向后拉，挤压肩胛骨中间' },
    { n: '俯身划船', eq: ['哑铃', '健身房全套'], muscle: ['中背'], diff: 2, note: '背部平行地面，核心稳定' },
    { n: '绳索直臂下压', eq: ['健身房全套'], muscle: ['背阔'], diff: 1, note: '手臂微弯，感受背阔肌' },
    { n: '直臂下压机', eq: ['健身房全套'], muscle: ['背阔'], diff: 1, note: '手肘贴着靠垫向下压' },
    { n: '山羊挺身', eq: ['健身房全套'], muscle: ['竖脊肌', '臀'], diff: 1, note: '罗马椅上，腰背平直起身' },
    { n: '弹力带划船', eq: ['弹力带'], muscle: ['中背'], diff: 1, note: '收紧肩胛骨' },
    { n: '俯卧YTW', eq: ['哑铃', '无器材', '健身房全套'], muscle: ['下斜方', '后束'], diff: 1, note: '俯卧或俯身，手臂依次摆出Y-T-W三个形状，重点激活下斜方让肩胛下沉' },
    { n: '靠墙天使', eq: ['无器材'], muscle: ['下斜方', '姿势'], diff: 1, note: '后背贴墙，手臂沿墙面上下滑动如雪天使，全程肩胛贴墙下沉', u: '次' },
  ],
  biceps: [
    { n: '杠铃弯举', eq: ['健身房全套'], muscle: ['二头'], diff: 1, note: '上臂贴身不动，只弯曲前臂' },
    { n: '哑铃弯举', eq: ['哑铃', '健身房全套'], muscle: ['二头'], diff: 1, note: '交替进行，不借力' },
    { n: '牧师椅杠铃弯举', eq: ['健身房全套'], muscle: ['二头'], diff: 2, note: '腋窝卡住垫板，避免身体借力' },
    { n: '器械弯举', eq: ['健身房全套'], muscle: ['二头'], diff: 1, note: '孤立二头，手肘固定在垫子上' },
    { n: '集中弯举', eq: ['哑铃', '健身房全套'], muscle: ['二头肌峰'], diff: 1, note: '坐姿，手肘抵在大腿内侧', bi: true },
    { n: '斜板哑铃弯举', eq: ['哑铃', '健身房全套'], muscle: ['二头长头'], diff: 2, note: '上斜椅靠背，拉长二头肌收缩' },
    { n: '锤式弯举', eq: ['哑铃', '健身房全套'], muscle: ['肱肌', '前臂'], diff: 1, note: '中立握姿，感受外侧发力' },
    { n: '绳索弯举', eq: ['健身房全套'], muscle: ['二头'], diff: 1, note: '顶峰收缩停留1秒' },
    { n: '绳索过头弯举', eq: ['健身房全套'], muscle: ['二头短头'], diff: 1, note: '龙门架高位，像李小龙一样弯举' },
  ],
  triceps: [
    { n: '绳索下压', eq: ['健身房全套'], muscle: ['三头'], diff: 1, note: '肘部贴身固定不动' },
    { n: '器械三头下压', eq: ['健身房全套'], muscle: ['三头'], diff: 1, note: '坐姿，双手握把向下推' },
    { n: '绳索过头臂屈伸', eq: ['健身房全套'], muscle: ['三头长头'], diff: 1, note: '背对龙门架，绳索从头后拉起' },
    { n: '哑铃臂屈伸', eq: ['哑铃', '健身房全套'], muscle: ['三头'], diff: 1, note: '肘朝天花板，只动前臂' },
    { n: '俯身单臂哑铃臂屈伸', eq: ['哑铃', '健身房全套'], muscle: ['三头'], diff: 1, note: '上臂贴紧躯干，向后伸直小臂', bi: true },
    { n: '双杠臂屈伸', eq: ['健身房全套'], muscle: ['三头', '胸'], diff: 3, note: '身体直立偏重三头' },
    { n: '助力双杠臂屈伸', eq: ['健身房全套'], muscle: ['三头'], diff: 1, note: '利用辅助托板完成动作' },
    { n: '窄距杠铃卧推', eq: ['健身房全套'], muscle: ['三头', '胸'], diff: 2, note: '握距与肩同宽，手肘贴紧身体' },
    { n: '仰卧臂屈伸', eq: ['哑铃', '健身房全套'], muscle: ['三头'], diff: 1, note: '上臂垂直地面，只动前臂' },
  ],
  quads: [
    { n: '杠铃深蹲', eq: ['健身房全套'], muscle: ['股四头', '臀'], diff: 2, note: '膝盖对准脚尖，蹲至大腿平行地面' },
    { n: '靠墙静蹲（wall sit）', eq: ['无器材', '健身房全套'], muscle: ['股四头', '下肢'], diff: 1, note: '背贴墙下滑至大腿平行地面，膝盖90°对准脚尖，静力保持全程均匀呼吸', u: '秒' },
    { n: '相扑深蹲保持（sumo squat hold）', eq: ['无器材', '健身房全套'], muscle: ['股四头', '内收肌', '下肢'], diff: 2, note: '宽距脚尖外展下蹲到底，手肘抵膝内侧撑开，脊柱立直在最低位静力保持', u: '秒' },
    { n: '深蹲转体', eq: ['无器材', '健身房全套'], muscle: ['股四头', '下肢', '骨盆控制'], diff: 2, note: '双脚并拢深蹲到底保持稳定，双手胸前合十，躯干缓慢向左右交替旋转，徒手小幅不负重' },
    { n: '颈前杠铃深蹲', eq: ['健身房全套'], muscle: ['股四头'], diff: 3, note: '杠铃放锁骨，背部保持直立' },
    { n: '史密斯深蹲', eq: ['健身房全套'], muscle: ['股四头', '臀'], diff: 1, note: '脚可略前移，更安全' },
    { n: '倒蹬机', eq: ['健身房全套'], muscle: ['股四头', '臀'], diff: 1, note: '靠背调至45度，双脚居中' },
    { n: '钟摆深蹲', eq: ['健身房全套'], muscle: ['股四头'], diff: 2, note: '机器轨迹类似深蹲，背部全程贴紧' },
    { n: '哈克深蹲', eq: ['健身房全套'], muscle: ['股四头'], diff: 2, note: '背部贴紧靠垫' },
    { n: '腿屈伸', eq: ['健身房全套'], muscle: ['股四头'], diff: 1, note: '顶端收缩停留1秒' },
    { n: '保加利亚分腿蹲', eq: ['哑铃', '健身房全套'], muscle: ['股四头', '臀'], diff: 2, note: '后脚搭在凳子上，重心在前方腿', bi: true },
    { n: '哑铃弓步蹲', eq: ['哑铃', '健身房全套'], muscle: ['股四头', '臀'], diff: 1, note: '步幅适中，前膝不超脚尖', bi: true },
    { n: '高脚杯深蹲', eq: ['哑铃', '无器材'], muscle: ['股四头', '臀'], diff: 1, note: '哑铃贴胸，挺胸下蹲' },
    { n: '壶铃高脚杯深蹲', eq: ['壶铃', '健身房全套'], muscle: ['股四头', '臀'], diff: 1, note: '双手托壶铃贴胸，挺胸下蹲，动作更自然' },
    { n: '相扑深蹲', eq: ['无器材', '哑铃', '壶铃', '健身房全套'], muscle: ['臀', '内收肌', '股四头'], diff: 1, note: '宽距站、脚尖外旋，挺胸下蹲到位再起，强化内收肌与臀(可哑铃/壶铃负重)' },
    { n: '哥萨克深蹲', eq: ['无器材', '哑铃', '壶铃', '健身房全套'], muscle: ['内收肌', '臀', '股四头'], diff: 2, note: '宽距站，重心移向一侧、该腿深蹲到底，另一腿伸直脚尖勾起，深度开髋+内收肌，左右交替', bi: true },
    { n: '靠墙静蹲开胯（turnout）', eq: ['无器材', '健身房全套'], muscle: ['股四头', '臀', '髋外旋'], diff: 2, note: '背贴墙半蹲，脚尖与膝向外旋打开(turnout)、保持外展张力，练股四/臀与髋外旋', u: '秒' },
  ],
  glutemed: [
    { n: '站姿绳索单腿外展', eq: ['健身房全套'], muscle: ['臀中肌'], diff: 1, note: '踝部套绳，对侧手扶机架，单腿向侧方抬起，顶峰停留1秒。本馆主力外展动作（有龙门架）', bi: true },
    { n: '侧卧抬腿画圈', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '髋外旋'], diff: 2, note: '侧卧下腿屈膝支撑，上腿伸直抬至45°后缓慢画小圈，正反各半，骨盆全程垂直不后倒', bi: true },
    { n: '弹力带螃蟹步', eq: ['弹力带', '无器材'], muscle: ['臀中肌'], diff: 1, note: '弹力带套膝上，半蹲姿向侧走15-20步/方向，全程保持张力，膝盖不内扣', bi: true },
    { n: '侧卧抬腿', eq: ['无器材', '弹力带'], muscle: ['臀中肌'], diff: 1, note: '侧卧上腿伸直向侧上方抬约45°，顶峰停留1秒，骨盆不后倒', bi: true },
    { n: '弹力带蚌式开合', eq: ['弹力带', '无器材'], muscle: ['臀中肌'], diff: 1, note: '侧卧屈膝，膝盖如蚌壳向上打开，骨盆不后翻', bi: true },
    { n: '器械外展机', eq: ['健身房全套'], muscle: ['臀中肌'], diff: 1, note: '身体前倾20-30°练上臀纤维。本馆若无此机，用站姿绳索单腿外展替代' },
    { n: '消防栓式', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀中肌'], diff: 1, note: '四足跪姿，单膝保持90°向侧上方抬起(髋外展)，顶峰挤压，练臀中肌、增胯宽', bi: true },
    { n: '站姿并腿外旋等长（turnout）', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['内收肌', '臀中肌'], diff: 1, note: '站立双腿向内并拢、同时踝/膝向外拧旋，内收+外旋等长对抗保持，激活内收肌与臀中肌', u: '秒' },
    { n: '仰卧弹力带髋外展保持', eq: ['弹力带', '无器材', '健身房全套'], muscle: ['内收肌', '臀中肌'], diff: 2, note: '仰卧抬腿、弹力带套膝上方，对抗阻力向两侧打开成V保持，强化髋外展/内收静力控制', u: '秒' },
    { n: '四足髋绕环（hip CARs）', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '髋外旋'], diff: 1, note: '四足跪姿，单侧髋做最大幅度顺逆时针绕环(hip CARs)，提升髋活动度与外旋控制', bi: true },
    { n: '芭蕾深蹲（plié）', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '内收肌', '股四头'], diff: 1, note: '双脚外旋约60°宽于肩站立，缓慢下蹲到底，膝严格对脚尖方向，挺胸芭蕾体态，顶端夹臀' },
    { n: '芭蕾侧踢腿（battement）', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '内收肌'], diff: 1, note: '扶把杆/墙站立，腿从正中向正侧方缓慢画弧踢起至髋高，脚背绷直，全程控制速度', bi: true },
    { n: '单腿relevé踮立', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '小腿', '平衡'], diff: 1, note: '单腿站立，缓慢踮起足尖至最高，顶端停留2秒再慢速放下，强化小腿与骨盆稳定控制', u: '秒', bi: true },
  ],
  hamglutes: [
    { n: '罗马尼亚硬拉', eq: ['哑铃', '健身房全套'], muscle: ['腘绳', '臀'], diff: 2, note: '微屈膝，臀部后推，感受后侧拉伸' },
    { n: '传统硬拉', eq: ['健身房全套'], muscle: ['后链全部'], diff: 3, note: '背部中立，腿部推地发力' },
    { n: '臀推', eq: ['健身房全套', '哑铃'], muscle: ['臀'], diff: 1, note: '顶端挤压臀部1-2秒' },
    { n: '史密斯臀推', eq: ['健身房全套'], muscle: ['臀'], diff: 1, note: '比杠铃更容易设置和控制' },
    { n: '腿弯举', eq: ['健身房全套'], muscle: ['腘绳'], diff: 1, note: '俯卧，控制回放' },
    { n: '坐姿腿弯举', eq: ['健身房全套'], muscle: ['腘绳'], diff: 1, note: '背贴靠垫，双腿用力向下压' },
    { n: '站姿单腿弯举机', eq: ['健身房全套'], muscle: ['腘绳'], diff: 1, note: '单腿轮流向后上方弯曲', bi: true },
    { n: '绳索后踢腿', eq: ['健身房全套'], muscle: ['臀大肌'], diff: 1, note: '脚套上把手，向后上方踢出', bi: true },
    { n: '器械内收机', eq: ['健身房全套'], muscle: ['内收肌'], diff: 1, note: '坐姿向内夹拢双腿' },
    { n: '壶铃摆动', eq: ['壶铃', '健身房全套'], muscle: ['臀', '腘绳', '核心'], diff: 1, note: '髋部爆发式前推，手臂只是挂钩' },
    { n: '臀桥', eq: ['无器材', '弹力带'], muscle: ['臀'], diff: 1, note: '顶端停留，感受臀部发力' },
    { n: '蛙式臀桥', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀', '内收肌'], diff: 1, note: '仰卧脚心相对、膝向两侧打开，顶髋夹臀，臀部+开髋激活' },
    { n: '跪姿后踢腿', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌'], diff: 1, note: '四足跪姿，屈膝腿向后上方踢起、顶端夹臀，自重臀大肌激活', bi: true },
    { n: '俯卧挺髋抬腿', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌', '腘绳'], diff: 1, note: '俯卧、骨盆压实不塌腰，单腿伸直向后上方抬起、顶端夹臀', bi: true },
    { n: '高跪姿挺髋保持（kneeling hip thrust hold）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '核心'], diff: 2, note: '高跪姿伸髋夹臀、骨盆中立顶住，等长静力保持，强化臀与核心抗伸展', u: '秒' },
    { n: '臀桥开合', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌', '臀中肌'], diff: 2, note: '臀桥顶到最高夹紧臀(完全伸髋)，保持高度把双膝向两侧打开再合拢，臀大+臀中+骨盆稳定' },
    { n: '蛙式臀冲', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀', '内收肌'], diff: 1, note: '仰卧脚心相对、双膝向两侧打开，连续顶髋至最高点并夹臀挤压' },
    { n: '深蹲底部左右摇摆（squat rock）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋外旋'], diff: 1, note: '极宽距深蹲到底，手肘撑开双膝，缓慢左右转移重心，打开髋部活动度', u: '秒' },
    { n: '跪姿深蹲（kneeling squat）', eq: ['无器材', '健身房全套'], muscle: ['股四头', '臀大肌'], diff: 2, note: '高跪姿缓慢向后沉臀至触碰脚跟，随即瞬间爆发挺髋推起，强力收臀发力' },
    { n: '肩胛垫高臀推', eq: ['无器材', '健身房全套', '哑铃'], muscle: ['臀'], diff: 2, note: '上背垫高，臀部下沉至极低位置增加幅度，挺髋至最高点并极限收缩臀肌' },
    { n: '芭蕾后退腿（arabesque）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '竖脊肌'], diff: 1, note: '扶把杆/墙站立，支撑腿微屈，动作腿向正后方缓慢抬至最高，脚背绷直指向远端，顶端收臀保持', bi: true },
    { n: '芭蕾地板后展腿', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '腘绳'], diff: 1, note: '四足跪姿，单腿伸直向后上方缓慢抬起，脚尖绷直，全程控制弧线，顶端夹臀停留1秒', bi: true },
    { n: '大踢腿（grand battement）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '髋屈肌', '下肢'], diff: 2, note: '扶把杆/墙，单腿从前/侧/后方大幅踢出，脚背绷直，踢至最高点控制1秒再以离心力还原，腿全程保持绷紧', u: '次', bi: true },
    { n: '前弯后腿上扬（penché）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '腘绳', '核心'], diff: 3, note: '单腿站立，躯干前倾与后腿同步上扬，前后形成一直线，延长颈部，脚尖指向天花板，核心抗旋转保持骨盆水平', u: '秒', bi: true },
    { n: '臀桥夹球保持', eq: ['无器材'], muscle: ['臀', '盆底肌'], diff: 2, note: '仰卧高桥位，双膝夹紧阻力物，主动收缩盆底深层肌与盆底肌群，抗重力静力保持', u: '秒' },
    { n: '抱膝排气式（apanasana）', eq: ['无器材'], muscle: ['臀', '盆底肌'], diff: 1, note: '仰卧双膝折叠贴胸，双手抱膝，深长呼吸，放松下背与髋部', u: '秒' },
    { n: '猫式伸展（cat stretch）', eq: ['无器材'], muscle: ['臀', '盆底肌'], diff: 2, note: '四足跪姿，双手向前滑让胸口沉向地面，臀部保持在膝盖上方，配合腹式呼吸放松', u: '秒' },
    { n: '仰卧分腿保持（straddle hold）', eq: ['无器材'], muscle: ['臀', '盆底肌'], diff: 3, note: '仰卧双腿垂直抬起向两侧分开成V字，双手搭膝内侧，等长保持，练内收肌柔韧与控制', u: '秒' },
    { n: '跪姿挺髋（kneeling hip thrust）', eq: ['无器材', '健身房全套'], muscle: ['臀', '髋屈肌'], diff: 2, note: '高跪姿骨盆前推至极限伸髋位，胸廓展开微向后仰，顶端夹臀收腹，控制还原' },
    { n: '俯卧蛙式抬腿（frog kick）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '髋外旋'], diff: 1, note: '俯卧双膝弯曲向两侧打开呈蛙式，骨盆压实，向上翘起双脚，顶端夹臀停留' },
    { n: '四足髋部大绕环', eq: ['无器材', '健身房全套'], muscle: ['骨盆控制', '臀'], diff: 1, note: '四足跪姿，骨盆大幅度绕环旋转摆动，全范围流动激活盆底与髋关节活动度', u: '秒' },
    { n: '四足跪姿髋外展', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌', '臀中肌'], diff: 1, note: '四足跪姿，单腿屈膝90°向侧方抬起至与髋同高，骨盆保持水平不旋转', bi: true },
    { n: '驴踢腿（donkey kick）', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌'], diff: 1, note: '四足跪姿保持膝盖弯曲90°，向正后方踢高至伸髋最大幅度，顶端停留夹臀', bi: true },
    { n: '鸟狗式（bird dog）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '竖脊肌'], diff: 1, note: '四足跪姿同时伸展对侧手腿至与身体水平，骨盆不旋转，顶端控制停留', bi: true },
    { n: '相扑深蹲跳（sumo squat jump）', eq: ['无器材', '健身房全套'], muscle: ['臀', '股四头', '内收肌'], diff: 3, note: '宽距深蹲至底部后快速爆发弹起，落地时软化膝盖立即接下次，跳跃弹震强化臀腿爆发力' },
    { n: '青蛙趴', eq: ['无器材', '健身房全套'], muscle: ['内收肌', '髋外旋'], diff: 2, note: '四足跪姿双膝向两侧打开，骨盆缓慢向下沉，被动开胯静力保持', u: '秒' },
    { n: '蛙式臀桥保持（frog pump hold）', eq: ['无器材', '健身房全套'], muscle: ['臀', '内收肌', '盆底肌'], diff: 1, note: '仰卧脚心相对膝向两侧沉，顶髋至肩膝一线后静力保持，臀肌持续收紧不塌腰', u: '秒' },
    { n: '跪姿直腿后踢', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '髋屈肌'], diff: 1, note: '四足跪姿单腿向正后方伸直踢起至与躯干一线，顶端挤压臀肌1-2秒再控制收回', bi: true },
    { n: '高跪姿夹枕挺髋保持', eq: ['无器材', '健身房全套'], muscle: ['臀', '内收肌', '盆底肌'], diff: 2, note: '高跪姿大腿上部夹住瑜伽砖或枕头，挺髋收臀，静力保持并配合呼吸', u: '秒' },
    { n: '靠墙坐姿劈叉（wall straddle）', eq: ['无器材', '健身房全套'], muscle: ['内收肌', '髋外旋'], diff: 2, note: '臀贴墙角坐地，双腿分别沿两侧墙面向外滑开，重力辅助内收肌长时间被动牵伸', u: '秒', hold: 120 },
    { n: '快乐婴儿式（深压版）', eq: ['无器材', '健身房全套'], muscle: ['内收肌', '髋外旋', '盆底肌'], diff: 2, note: '仰卧臀部垫高，双手抓脚踝将膝盖向腋下方向压，骨盆底肌主动放松，按计时保持', u: '秒' },
    { n: '青蛙式（frog pose）', eq: ['无器材', '健身房全套'], muscle: ['内收肌', '髋屈肌'], diff: 1, note: '双膝宽跪、小腿与大腿约90°，前臂撑地上身前趴，重力牵拉腹股沟与内收肌', u: '秒' },
    { n: '臀推顶端外展保持', eq: ['无器材', '健身房全套'], muscle: ['臀', '内收肌', '盆底肌'], diff: 3, note: '肩胛骨靠高台做臀推，顶端双膝向两侧外展，等长保持，练臀中肌与臀大肌', u: '秒' },
  ],
  calves: [
    { n: '站姿提踵', eq: ['无器材', '哑铃', '健身房全套'], muscle: ['小腿'], diff: 1, note: '全幅度，顶端停顿1秒' },
    { n: '史密斯提踵', eq: ['健身房全套'], muscle: ['小腿'], diff: 1, note: '前脚掌踩铃片，借史密斯机稳定' },
    { n: '腿举机提踵', eq: ['健身房全套'], muscle: ['小腿'], diff: 1, note: '在腿举机上只用前脚掌推' },
    { n: '坐姿提踵', eq: ['健身房全套'], muscle: ['比目鱼'], diff: 1, note: '膝盖90°，控制速度' },
  ],
  core: [
    { n: '腹横肌真空吸', eq: ['无器材', '健身房全套'], muscle: ['腹横肌'], diff: 1, note: '呼气收腹，肚脐向脊柱方向吸紧，每组按计时吸住20秒。收紧不增厚腰围', u: '秒', hold: 20 },
    { n: '死虫式保持（dead bug hold）', eq: ['无器材', '健身房全套'], muscle: ['核心', '骨盆控制'], diff: 1, note: '仰卧屈髋屈膝90°双臂指天，下背压实地面后静力保持，腰不离地不憋气', u: '秒' },
    { n: '死虫式（慢速对角）', eq: ['无器材', '健身房全套'], muscle: ['核心', '骨盆控制'], diff: 1, note: '仰卧桌面腿，对侧手腿缓慢远离再收回交替进行，下背全程贴地，越慢越有效' },
    { n: '仰卧直腿下放（leg lowering）', eq: ['无器材', '健身房全套'], muscle: ['核心', '下肢'], diff: 2, note: '仰卧双腿伸直抬起微分成V，缓慢下放至下背将离未离地面的临界点再抬回，全程控制' },
    { n: '俯冲式俯卧撑（dive bomber push-up）', eq: ['无器材', '健身房全套'], muscle: ['核心', '脊柱'], diff: 2, note: '下犬式起始，屈肘让胸沿地面低位向前俯冲滑出至上犬式，再倒放回起点，核心全程绷紧' },
    { n: '仰卧对角抬举（dead bug 变体）', eq: ['无器材', '健身房全套'], muscle: ['核心'], diff: 1, note: '仰卧四肢展开成大字，呼气时将对角手脚同时抬离地面2-3厘米并保持，换对角交替', u: '秒' },
    { n: '匍匐爬行（army crawl）', eq: ['无器材', '健身房全套'], muscle: ['核心', '全身'], diff: 2, note: '低平板支撑位，手肘交替带动身体贴地面向前匍匐移动，臀部压低不左右摇摆', u: '秒' },
    { n: '平板支撑', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['核心'], diff: 1, note: '臀部不要过高或下塌', u: '秒' },
    { n: '卷腹', eq: ['无器材', '健身房全套'], muscle: ['腹直肌'], diff: 1, note: '下背贴地，肩胛骨离地即可' },
    { n: '坐姿卷腹机', eq: ['健身房全套'], muscle: ['腹直肌'], diff: 1, note: '身体向前弯曲，双手抓住把手下拉' },
    { n: '悬挂抬腿', eq: ['健身房全套'], muscle: ['下腹', '髂腰'], diff: 2, note: '控制下放，避免摇摆' },
    { n: '罗马椅抬腿', eq: ['健身房全套'], muscle: ['下腹'], diff: 1, note: '手肘撑在垫子上，下放避免腰部过度反弓' },
    { n: '俄罗斯转体', eq: ['无器材', '哑铃', '健身房全套'], muscle: ['腹斜'], diff: 1, note: '脚悬空增加难度' },
    { n: '负重俄罗斯转体', eq: ['健身房全套', '哑铃'], muscle: ['腹斜'], diff: 1, note: '手持药球或哑铃片左右转动' },
    { n: '绳索伐木', eq: ['健身房全套'], muscle: ['腹斜'], diff: 1, note: '高位绳索拉至对侧膝盖外侧，如砍树' },
    { n: '死虫式', eq: ['无器材', '健身房全套'], muscle: ['核心稳定'], diff: 1, note: '下背全程贴地' },
    { n: '腹轮', eq: ['健身房全套'], muscle: ['核心'], diff: 3, note: '初级跪姿，进阶站姿' },
    { n: '侧平板支撑', eq: ['无器材', '健身房全套'], muscle: ['腹斜'], diff: 1, note: '每侧各做', u: '秒', bi: true },
    { n: '骨盆前后倾（pelvic tilt）', eq: ['无器材', '健身房全套'], muscle: ['骨盆控制', '核心'], diff: 1, note: '站/跪/仰卧，控制骨盆前倾后倾来回，强化骨盆控制与体态(翘臀也靠骨盆前倾)' },
    { n: '侧平板髋部下沉（side plank hip dip）', eq: ['无器材', '健身房全套'], muscle: ['腹斜', '臀中肌'], diff: 2, note: '侧平板支撑，髋部缓慢下沉再上顶，动态强化侧链核心与臀中肌', bi: true },
    { n: '高跪姿开胸（kneeling chest opener）', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['核心', '臀', '后肩'], diff: 2, note: '高跪姿(髋完全伸直、躯干垂直)，双臂向后下展、肩胛后缩挺胸，收紧核心抗后倒、骨盆中立保持', u: '秒' },
    { n: '四足脊柱波浪（cat flow）', eq: ['无器材', '健身房全套'], muscle: ['核心', '脊柱'], diff: 2, note: '四足跪姿下，下巴与胸口贴地向前滑动，拱背退回，脊柱S型连贯波动', u: '秒' },
    { n: '四足跪姿骨盆绕环（hip circles）', eq: ['无器材', '健身房全套'], muscle: ['核心', '骨盆控制'], diff: 1, note: '四足跪姿，控制骨盆缓慢在空中画圆，唤醒深层控制与流动力', u: '秒', bi: true },
    { n: '仰卧腿画圈（leg circles）', eq: ['无器材', '健身房全套'], muscle: ['核心', '髋屈肌'], diff: 3, note: '仰卧双腿伸直绷脚背，在空中缓慢画巨大折扇形半圆，极致控制与核心炫耀' },
    { n: '四足跪姿骨盆画8字', eq: ['无器材', '健身房全套'], muscle: ['核心', '骨盆控制'], diff: 1, note: '四足跪姿，控制骨盆在水平面做缓慢平滑的八字形轨迹移动，深度激活与放松盆底肌', u: '秒', bi: true },
    { n: '高跪姿后倾等长（kneeling lean back）', eq: ['无器材'], muscle: ['核心', '股四头'], diff: 2, note: '高跪姿，双臂自然后伸，挺胸收腹，向后倾斜15-30度等长保持，核心持续收紧', u: '秒' },
    { n: '骆驼式（ustrasana）', eq: ['无器材'], muscle: ['核心'], diff: 2, note: '高跪姿，双手扶腰后（进阶扶脚跟），胸椎向后伸展打开，颈部放松不过度后仰', u: '秒' },
    { n: '单腿passé平衡', eq: ['无器材', '健身房全套'], muscle: ['核心', '下肢'], diff: 2, note: '单腿站立，屈膝将脚尖点至对侧膝盖内侧，双臂芭蕾圆弧位，骨盆水平，感受中心线；进阶：relevé踮立或闭眼', u: '秒', bi: true },
    { n: '旋转中轴训练（pirouette prep）', eq: ['无器材', '健身房全套'], muscle: ['核心', '下肢'], diff: 2, note: '半蹲relevé蹬地提膝至passé位，双臂由开位收至前圆弧，核心锁定中轴静止（不旋转），感受整条中心线对齐', u: '次', bi: true },
    { n: '仰卧画圈腿（rond de jambe）', eq: ['无器材', '健身房全套'], muscle: ['核心', '髋屈肌', '下肢'], diff: 3, note: '仰卧双腿伸直绷脚背，在空中缓慢画巨大半圆弧（一侧→头顶→另一侧），全程腰贴地核心撑住，腿不触地', u: '次' },
    { n: '肩胛引体激活', eq: ['健身房全套'], muscle: ['背阔', '下斜方', '上肢'], diff: 1, note: '死挂状态下只做肩胛骨下沉后收（手臂全程伸直不弯曲），感受背阔发力把肩膀从耳朵旁拉离，重复15-20次', u: '次' },
    { n: '悬挂屈体静止', eq: ['健身房全套'], muscle: ['核心', '髂腰', '上肢'], diff: 2, note: '双手握单杠悬挂，核心压缩将双膝收至胸口成屈体，保持静止10-30秒，脚尖绷直，肩胛下沉不耸肩', u: '秒', hold: 20 },
    { n: '悬挂直体延伸', eq: ['健身房全套'], muscle: ['核心', '背阔', '上肢'], diff: 2, note: '死挂同时全身绷紧空心体——腹部收缩、骨盆后倾、双腿伸直并拢脚尖绷直，保持全身张力15-30秒，练悬挂体线控制', u: '秒', hold: 25 },
    { n: '悬挂开胯', eq: ['健身房全套'], muscle: ['内收肌', '核心', '上肢'], diff: 2, note: '双手握单杠悬挂，双腿伸直脚尖绷直，缓慢向两侧打开至最大幅度再并拢，内收肌离心控制全程，肩胛保持下沉', u: '次' },
    { n: '空心体保持', eq: ['无器材', '健身房全套'], muscle: ['核心', '腹直肌', '髂腰'], diff: 2, note: '仰卧双臂贴耳上举，双腿绷直离地约15cm，腰部完全贴地，全身成香蕉形弓曲，保持30-60秒不塌腰', u: '秒', hold: 40 },
    { n: '龙旗', eq: ['健身房全套'], muscle: ['核心', '腹直肌', '背阔'], diff: 3, note: '仰卧抓住固定物，全身绷直只靠肩部支撑，身体水平悬空，缓慢下放至与地面几乎平行，全程不折腰', u: '次' },
    { n: 'L撑', eq: ['无器材', '健身房全套'], muscle: ['核心', '髂腰', '上肢'], diff: 3, note: '双手撑地或双杠，双腿伸直水平举起与地面平行，脚尖绷直，肩胛下沉身体离地，保持10-30秒', u: '秒', hold: 20 },
  ],
  cardio: [
    { n: '跑步机慢跑', eq: ['健身房全套'], muscle: ['心肺'], diff: 1, note: '心率维持最大心率65-75%', u: '分钟' },
    { n: '弧形跑步机', eq: ['健身房全套'], muscle: ['心肺'], diff: 2, note: '无电机，全靠自身发力，对核心要求更高', u: '分钟' },
    { n: '划船机', eq: ['健身房全套'], muscle: ['心肺', '全身'], diff: 1, note: '腿蹬→身倾→手拉', u: '分钟' },
    { n: '风阻划船机', eq: ['健身房全套'], muscle: ['心肺', '全身'], diff: 1, note: '用力越大阻力越大，适合HIIT', u: '分钟' },
    { n: '椭圆机', eq: ['健身房全套'], muscle: ['心肺'], diff: 1, note: '保持直立，手臂协同', u: '分钟' },
    { n: '骑行机', eq: ['健身房全套'], muscle: ['心肺', '腿'], diff: 1, note: '座位高度：膝盖微弯', u: '分钟' },
    { n: '动感单车', eq: ['健身房全套'], muscle: ['心肺', '腿'], diff: 2, note: '阻力大，可站立骑行', u: '分钟' },
    { n: '攀爬机', eq: ['健身房全套'], muscle: ['心肺', '腿臀'], diff: 2, note: '踩楼梯机，对臀腿刺激更大', u: '分钟' },
    { n: '跳绳', eq: ['无器材', '健身房全套'], muscle: ['心肺', '小腿'], diff: 1, note: '手腕发力，落地轻柔', u: '分钟' },
    { n: '开合跳', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['心肺'], diff: 1, note: '膝关节微弯', u: '分钟' },
    { n: '波比跳', eq: ['无器材'], muscle: ['心肺', '全身'], diff: 2, note: '一个标准循环', u: '分钟' },
    { n: '上肢功率车', eq: ['健身房全套'], muscle: ['心肺', '上肢'], diff: 1, note: '用双臂驱动，对肩和手臂有额外刺激', u: '分钟' },
  ],
  swimming: [
    // ── 入门级 (diff:1) — 水性+蛙泳基础 ──
    { n: '水中行走热身', eq: ['泳池'], muscle: ['全身'], diff: 1, note: '沿池边行走，适应水温和浮力，活动四肢', u: '分钟', swimPhase: 'warmup' },
    { n: '水中呼吸练习', eq: ['泳池'], muscle: ['心肺'], diff: 1, note: '站立吸气→脸入水用鼻子吐泡泡→抬头，循环节奏', u: '分钟', swimPhase: 'tech' },
    { n: '扶边蛙泳腿练习', eq: ['泳池'], muscle: ['下肢', '心肺'], diff: 1, note: '口诀：收翻蹬夹。扶池边专注腿部动作，脚踝外翻勾起是关键', u: '分钟', swimPhase: 'tech' },
    { n: '蹬壁滑行练习', eq: ['泳池'], muscle: ['核心', '全身'], diff: 1, note: '蹬壁出发，全身绷紧流线型，感受水流推动滑行', u: '分钟', swimPhase: 'tech' },
    { n: '蛙泳手部划水练习', eq: ['泳池'], muscle: ['上肢', '心肺'], diff: 1, note: '浅水站立，手臂向两侧外划→向内抱水→前伸，配合抬头吸气', u: '分钟', swimPhase: 'tech' },
    { n: '蛙泳完整配合', eq: ['泳池'], muscle: ['全身', '心肺'], diff: 1, note: '划手→抬头吸气→收腿→蹬夹滑行。先划手后蹬腿，不要同时动', u: '分钟', swimPhase: 'main' },
    { n: '水中漫步放松', eq: ['泳池'], muscle: ['全身'], diff: 1, note: '慢速水中行走或缓慢踢水，让肌肉放松恢复', u: '分钟', swimPhase: 'cooldown' },
    // ── 进阶级 (diff:2) — 蛙泳巩固+耐力 ──
    { n: '蛙泳连续游', eq: ['泳池'], muscle: ['全身', '心肺'], diff: 2, note: '25-50m连续游，关注节奏和蹬腿后的滑行感', u: '分钟', swimPhase: 'main' },
    { n: '蛙泳间歇训练', eq: ['泳池'], muscle: ['心肺', '全身'], diff: 2, note: '25m×4-6组，每组之间池边休息30-45秒', u: '分钟', swimPhase: 'main' },
    { n: '踩水练习', eq: ['泳池'], muscle: ['全身', '核心'], diff: 2, note: '扶池边做蛙泳腿蹬夹节奏训练（1.4m浅池可触底，练动作协调而非浮力）；需1.5m+深水区方可完整脱底训练', u: '分钟', swimPhase: 'tech' },
    { n: '蹬壁转身练习', eq: ['泳池'], muscle: ['核心', '全身'], diff: 2, note: '游到池边后蹬壁掉头继续游，不停顿，练流畅性', u: '分钟', swimPhase: 'tech' },
    // ── 挑战级 (diff:3) — 自由泳入门 ──
    { n: '自由泳打腿练习', eq: ['泳池'], muscle: ['下肢', '核心'], diff: 3, note: '扶边或蹬壁，髋部发力上下打水，膝盖微屈脚踝放松', u: '分钟', swimPhase: 'tech' },
    { n: '自由泳划臂+侧头呼吸', eq: ['泳池'], muscle: ['上肢', '心肺'], diff: 3, note: '浅水站立/行走中练习划臂和侧头换气的配合', u: '分钟', swimPhase: 'tech' },
    { n: '自由泳完整配合', eq: ['泳池'], muscle: ['全身', '心肺'], diff: 3, note: '短距离尝试完整自由泳，手脚交替+侧头呼吸', u: '分钟', swimPhase: 'main' },
    // ── 水中感官与阻力塑形 (Aquatic Sensory) ──
    { n: '池边悬浮分腿', eq: ['泳池'], muscle: ['核心', '内收肌'], diff: 2, note: '背靠池边双臂撑起，双腿在水中受浮力托举，缓慢向两侧打开再合拢，练内收肌', u: '秒', swimPhase: 'tech' },
    { n: '水中侧抬腿', eq: ['泳池'], muscle: ['臀中肌', '内收肌'], diff: 1, note: '背靠池壁双臂撑边站稳，单腿向正侧方缓慢抬起至水面、感受全程水阻，再缓慢合回，左右交替', u: '秒', swimPhase: 'tech', bi: true },
    { n: '水中后踢腿', eq: ['泳池'], muscle: ['臀大肌'], diff: 1, note: '扶池边核心收紧，单腿向正后方缓慢踢起至最高，水阻让臀部全程持续发力，保持骨盆稳定', u: '秒', swimPhase: 'tech', bi: true },
    { n: '水中相扑深蹲', eq: ['泳池'], muscle: ['臀', '内收肌', '股四头'], diff: 1, note: '腰深水中宽距站、脚尖外旋，缓慢下蹲到底，水的浮力与阻力让每一个角度都有持续感', swimPhase: 'main' },
    { n: '水中摆腿开髋', eq: ['泳池'], muscle: ['髋屈肌', '臀中肌'], diff: 1, note: '扶池边单腿站，另一腿在水中前后大幅摆动，水阻让全幅度开髋更流畅更有感', u: '秒', swimPhase: 'tech', bi: true },
    { n: '泳池边坐姿开胯', eq: ['泳池'], muscle: ['内收肌', '下肢'], diff: 1, note: '坐于池边双腿入水，利用水的浮托支撑，缓慢将双腿向两侧最大幅度打开，感受内收肌极限拉伸', u: '秒', swimPhase: 'tech' },
    { n: '水中骨盆画圆', eq: ['泳池'], muscle: ['核心', '骨盆底肌'], diff: 1, note: '站于腰深水中双腿与肩宽，水的托举让骨盆控制更精细，闭眼缓慢画圆唤醒深层核心', u: '秒', swimPhase: 'tech' },
    { n: '水中弓步跳', eq: ['泳池'], muscle: ['下肢', '核心'], diff: 2, note: '胸深水中弓步站立，双腿跳跃交换，水阻让落地极慢肌肉全程紧绷，连续10-15次', u: '次', swimPhase: 'main' },
    { n: '水中单腿平衡', eq: ['泳池'], muscle: ['下肢', '核心'], diff: 1, note: '胸深水中单腿站立，对侧腿前伸或侧举，浮力持续破坏稳定，进阶闭眼，每侧保持30-45秒', u: '秒', swimPhase: 'tech', bi: true },
    { n: '水中弹力带外展', eq: ['泳池', '弹力带'], muscle: ['臀中肌', '内收肌'], diff: 2, note: '弹力带套双踝，扶池边胸深水中，单腿侧向外展至最大，水阻+弹力带双重抗阻，控制回位', u: '秒', swimPhase: 'tech', bi: true },
    { n: '蛙泳腿开合训练', eq: ['泳池'], muscle: ['内收肌', '臀', '下肢'], diff: 2, note: '双手扶池边仰卧漂浮，单独做蛙泳腿的外翻→蹬夹→并拢，在水中切水感最强处夹合停顿，专注内收肌主动控制', u: '次', swimPhase: 'tech' },
  ],
  warmup: [
    { n: '开合跳热身', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['全身'], diff: 1, note: '落地轻柔，保持呼吸节奏', u: '秒', warmupSec: 45 },
    { n: '肩关节环绕', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '直臂或屈臂，大幅度画圆，前后各30秒', u: '秒', warmupSec: 60 },
    { n: '扩胸运动', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '感受胸肌拉伸，动作连贯不憋气', u: '秒', warmupSec: 30 },
    { n: '徒手深蹲激活', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '臀部后坐，膝盖不内扣', u: '秒', warmupSec: 45 },
    { n: '弓步转体', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢', '核心'], diff: 1, note: '下蹲时呼气，躯干向大腿方向扭转', u: '秒', warmupSec: 45, bi: true },
    { n: '高抬腿走', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '挺胸收腹，双手抱膝向上提拉', u: '秒', warmupSec: 45 },
    { n: '登山者', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['核心', '全身'], diff: 2, note: '俯卧撑姿势，腹部收紧，交替提膝', u: '秒', warmupSec: 30 },
    { n: '颈部绕环', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '慢速半圆绕环（避免过度后仰），前后左右各方向充分活动颈椎', u: '秒', warmupSec: 30 },
    { n: '手臂前后大摆动', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '双臂放松自然摆动，幅度逐渐加大，感受肩关节前后方向的热身', u: '秒', warmupSec: 30 },
    { n: '猫牛热身', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢', '核心'], diff: 1, note: '四足跪姿，随呼吸一节一节活动胸椎和肩带，比拉伸版节奏更快、更动态', u: '秒', warmupSec: 45 },
    { n: '肘关节绕环', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '上臂贴体侧固定，小臂以肘为轴大幅绕圈，内外各方向充分热身肘关节', u: '秒', warmupSec: 30 },
    { n: '俯身直臂画圆', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '上身前倾约45°，单臂自然垂落后在矢状面画大圆，松弛肩关节囊', u: '秒', warmupSec: 30, bi: true },
    { n: '臀部激活蚌式', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢', '臀'], diff: 1, note: '侧卧屈膝叠脚，保持骨盆不动，上侧膝盖向天花板翻开再落回，激活臀中肌', u: '秒', warmupSec: 45, bi: true },
    { n: '髋关节绕环', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢', '臀'], diff: 1, note: '单腿站立，另一侧大腿抬起后画大圆，顺逆各方向充分活动髋关节', u: '秒', warmupSec: 45, bi: true },
    { n: '侧向弓步', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '向侧面大步迈出，屈膝下沉，另一腿伸直，感受内侧拉伸，左右交替', u: '秒', warmupSec: 45, bi: true },
    { n: '踝关节绕环', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '单腿略抬起，以踝为轴顺逆各绕10圈，充分活动踝关节，预防下肢损伤', u: '秒', warmupSec: 30, bi: true },
    { n: '原地跑热身', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['全身'], diff: 1, note: '原地小碎步慢跑，逐渐加快频率，核心收紧，手臂配合摆动', u: '秒', warmupSec: 60 },
    { n: '波比跳热身', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['全身'], diff: 3, note: '慢速版波比跳，每个阶段充分到位，快速提升核心温度和心率，适合高级', u: '秒', warmupSec: 30 },
  ],
  stretch: [
    { n: '婴儿式背部拉伸', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['全身', '核心'], diff: 1, note: '臀部坐向脚后跟，双手前伸，深长呼吸', u: '秒' },
    { n: '坐角式（upavistha konasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '内收肌'], diff: 2, note: '坐姿双腿向两侧最大分开，脊柱拉长从髋部折叠前倾，胸腹逐步贴向地面，到位后静力深呼吸', u: '秒' },
    { n: '幼犬式（puppy pose）', eq: ['无器材', '健身房全套'], muscle: ['全身', '脊柱'], diff: 1, note: '四足跪姿臀部保持高位，双手远端前滑让胸和下巴沉向地面，胸椎伸展深长呼吸', u: '秒' },
    { n: '宽膝婴儿式（balasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '内收肌'], diff: 1, note: '四足跪姿双膝拉宽，臀部缓慢向后坐向脚后跟，感受大腿内侧被拉长，往返或静力皆可', u: '秒' },
    { n: '睡鸽式（sleeping pigeon）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋外旋'], diff: 3, note: '鸽式基础上上身完全前趴，额头触地双臂前伸，骨盆保持水平，深度拉伸梨状肌，逐次加深', u: '秒', bi: true },
    { n: '低位蜥蜴式（前臂落地）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋屈肌'], diff: 2, note: '弓步前腿外侧放双手，前臂逐步下沉贴地，后腿伸直蹬实，骨盆下沉找髋前侧深度拉伸', u: '秒', bi: true },
    { n: '穿针式（thread the needle）', eq: ['无器材', '健身房全套'], muscle: ['脊柱', '核心'], diff: 1, note: '四足跪姿单臂从对侧腋下穿出，肩与侧脸贴地，骨盆保持稳定，胸椎旋转拉伸', u: '秒', bi: true },
    { n: '仰卧英雄式（supta virasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '股四头'], diff: 2, note: '跪坐后缓慢仰卧向后躺下（可用手肘过渡），感受大腿前侧拉伸，膝盖疼痛立即退出', u: '秒' },
    { n: '斯芬克斯式（sphinx pose）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋屈肌'], diff: 1, note: '俯卧以前臂撑起上身（斯芬克斯位），骨盆主动下压贴地，拉伸髋前侧与腹侧链', u: '秒' },
    { n: '跪姿股四头肌拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋屈肌', '股四头'], diff: 1, note: '单膝高跪姿骨盆后倾前推，同侧手向后抓脚背拉向臀部，膝下可垫软垫', u: '秒', bi: true },
    { n: '高跪姿后弯（kneeling backbend）', eq: ['无器材', '健身房全套'], muscle: ['脊柱', '核心'], diff: 2, note: '高跪姿双手扶骶骨，吸气胸椎逐节向后伸展打开，呼气回正，缓慢流动数次，腰椎不折角', u: '秒' },
    { n: '仰卧颈部后仰伸展', eq: ['无器材', '健身房全套'], muscle: ['下肢', '内收肌'], diff: 2, note: '仰卧双腿分开靠墙或悬空，下巴微抬使颈椎轻度伸展，幅度以无压迫感为限，颈椎不适立即回正', u: '秒' },
    { n: '胸部静态拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '找一面墙，单臂微屈抵住，身体向反方向转', u: '秒', bi: true },
    { n: '肩后侧拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '单臂水平伸直，另一只手将其压向胸口', u: '秒', bi: true },
    { n: '三头肌拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '手臂上举屈肘，另一手将其向后拉', u: '秒', bi: true },
    { n: '股四头肌拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '单腿站立，手抓脚踝拉向臀部', u: '秒', bi: true },
    { n: '腘绳肌/体前屈', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '坐姿或站姿，双腿伸直，身体慢慢下压', u: '秒' },
    { n: '臀大肌拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '仰卧，一腿架在另一腿膝盖上，双手抱腿拉向胸口', u: '秒', bi: true },
    { n: '髂胫束拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '交叉腿站立，身体向后腿一侧侧倾', u: '秒', bi: true },
    { n: '眼镜蛇式', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['核心'], diff: 1, note: '俯卧撑起上半身，骨盆贴地', u: '秒' },
    { n: '鸽子式开髋', eq: ['无器材', '健身房全套'], muscle: ['下肢', '臀', '髋屈肌'], diff: 1, note: '前腿屈膝外旋置于身前、后腿伸直，骨盆摆正下沉开髋，可上身前趴加深', u: '秒', hold: 45, bi: true },
    { n: '90/90髋旋转', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '坐姿前后腿各屈90°，上身直立左右倒换，练髋内/外旋灵活度', u: '秒', bi: true },
    { n: '青蛙式开胯', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '四足跪姿双膝向两侧打开，臀部缓慢前后移动，开胯拉内收肌，循序渐进', u: '秒' }, { n: '小狗伸展式 (融心式)', eq: ['无器材', '健身房全套'], muscle: ['上肢', '核心'], diff: 1, note: '双膝跪地，双臂向前伸展，胸部贴地，臀部高高翘起指向天花板', u: '秒' },
    { n: '蝴蝶式', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '坐姿脚掌相对、脚跟靠近身体，脊柱拉长后上身前倾拉内侧', u: '秒', hold: 45 },
    { n: '仰卧4字臀拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '仰卧一脚踝搭对侧膝成4字，双手抱大腿后侧拉向胸口，拉臀/梨状肌', u: '秒', bi: true },
    { n: '猫牛式', eq: ['无器材', '健身房全套'], muscle: ['核心', '全身'], diff: 1, note: '四足跪姿，吸气塌腰抬头、呼气拱背低头，随呼吸活动整段脊柱', u: '秒' },
    { n: '胸椎旋转', eq: ['无器材', '健身房全套'], muscle: ['上肢', '核心'], diff: 1, note: '四足跪姿一手扶头后，手肘向上向后打开旋转，转胸椎非腰', u: '秒', bi: true },
    { n: '盆底放松呼吸', eq: ['无器材', '健身房全套'], muscle: ['核心'], diff: 1, note: '仰卧屈膝缓慢腹式呼吸，吸气时主动让盆底放松下沉(反向凯格尔)——柔韧/舒适关键在会放松', u: '秒', hold: 90 },
    { n: '靠墙静蹲', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '背贴墙下蹲至大腿平行、膝约90°静态保持——练腿与姿势保持耐力', u: '秒' },
    { n: '深蹲保持', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '全蹲到底(亚洲蹲)、脚掌踩实、胸口打开，放松髋踝静态保持，练深蹲灵活+耐力', u: '秒' },
    { n: '臀桥保持', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['下肢'], diff: 1, note: '仰卧顶髋至肩-髋-膝一线，顶端夹臀静态保持，练臀+骨盆稳定', u: '秒' },
    { n: '鸟狗式', eq: ['无器材', '健身房全套'], muscle: ['核心'], diff: 1, note: '四足跪姿，对侧手脚伸直保持、骨盆不晃，练核心稳定与平衡', u: '秒', bi: true },
    { n: '门框开胸拉伸', eq: ['无器材', '健身房全套'], muscle: ['上肢'], diff: 1, note: '前臂贴门框、身体前倾拉开胸/前肩，改善圆肩让肩线打开、显挺拔', u: '秒', hold: 45, bi: true },
    { n: '胸椎伸展', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '坐姿双手抱头、上背靠椅背或泡沫轴向后伸展，改善含胸驼背', u: '秒' },
    { n: '颈侧拉伸', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '头侧倒、同侧手轻搭，放松颈侧/上斜方，配合收下巴改善头前伸', u: '秒', bi: true },
    { n: '脚踝绕环', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '抬起一脚，脚踝带动脚掌缓慢画大圈，顺逆各转，活动踝关节', u: '秒', bi: true },
    { n: '腓肠肌拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '弓步后腿伸直、脚跟踩地前压，拉小腿上部', u: '秒', hold: 45, bi: true },
    { n: '比目鱼肌拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '弓步后腿微屈膝、脚跟踩地下沉，拉小腿深层', u: '秒', hold: 45, bi: true },
    { n: '跪姿踝背屈', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '跪姿前脚屈膝、膝过脚尖、脚跟不离地，增加踝背屈活动度', u: '秒', bi: true },
    { n: '沙发式髋屈肌拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 2, note: '跪姿后腿胫骨贴墙/沙发、膝顶墙根，前腿屈膝成弓步，骨盆后倾收臀，深拉髂腰肌与大腿前侧、改善骨盆前倾，两侧各做', u: '秒', hold: 45, bi: true },
    { n: '双腿relevé踮立保持', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 2, note: '提踵到最高、足尖站立静力保持，练踝稳定/平衡/小腿与挺拔体态(芭蕾relevé)', u: '秒', bi: true },
    { n: '颈深屈肌保持（chin tuck hold）', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '跪/坐直、轻收下巴，颈深屈肌等长保持耐久，强化头颈姿态、改善前伸颈', u: '秒' },
    { n: '跪姿手腕拉伸（wrist stretch）', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '跪姿手掌贴地(指尖朝前或朝膝)，缓慢加载手腕/前臂屈伸肌静力支撑，强化腕部稳定', u: '秒', bi: true },
    { n: '肩胛后缩保持', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['上肢'], diff: 1, note: '肩胛骨向脊柱中线收拢并下沉、胸口微挺保持，强化上背与肩胛位置、改善圆肩', u: '秒' },
    { n: '收下巴', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '轻收下巴使颈椎中立、后脑勺微向后上，强化颈深屈、改善头前伸/乌龟颈，拉长颈线', u: '秒' },
    { n: '凯格尔盆底收缩', eq: ['无器材', '健身房全套'], muscle: ['核心'], diff: 1, note: '像憋尿般主动收缩盆底肌、保持5-10秒再完全放松，重复；增强盆底控制(与盆底放松呼吸互补)', u: '秒', hold: 120 },
    { n: '小狗伸展式 (融心式)', eq: ['无器材', '健身房全套'], muscle: ['上肢', '脊柱'], diff: 1, note: '双膝跪地、臀部高翘，胸腔与下巴完全贴地融化，极致打开胸前侧', u: '秒' }, { n: '仰卧大V字开合', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['下肢'], diff: 2, note: '仰卧双腿直指天花板，缓慢向两侧完全打开成V字再并拢，内收肌极度控制' },
    { n: '仰卧牛面式（gomukhasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 2, note: '仰卧双腿在空中紧紧交叉打结，双手抓脚背下压，极度拉扯臀外侧', u: '秒' },
    { n: '仰卧快乐婴儿式', eq: ['无器材', '健身房全套'], muscle: ['下肢', '核心'], diff: 1, note: '仰卧抓两脚外缘、膝向腋下打开下压、脚掌朝上，深层开髋并放松盆底，下背贴地', u: '秒' },
    { n: '仰卧大V字开合', eq: ['无器材', '健身房全套'], muscle: ['下肢', '盆底'], diff: 1, note: '仰卧，双腿向上伸直并向两侧极度打开成V字，依靠自身重力极度拉伸内收肌', u: '秒' },
    { n: '犁式（halasana）', eq: ['无器材', '健身房全套'], muscle: ['核心', '下肢'], diff: 2, note: '仰卧将双腿翻转过头顶触地，拉伸整条后侧链(颈部敏感者慎做、循序渐进)', u: '秒' },
    { n: '仰卧束角式', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '仰卧脚心相对、膝向两侧自然落下平躺，温和开髋、极放松(膝下可垫枕)', u: '秒' },
    { n: '下犬到上犬流动', eq: ['无器材', '健身房全套'], muscle: ['全身', '核心'], diff: 1, note: '下犬↔上犬之间一节节滚动脊柱如波浪，提升脊柱灵活与连贯控制', u: '秒' },
    { n: '四足跪姿躯干绕环', eq: ['无器材', '健身房全套'], muscle: ['全身', '核心'], diff: 1, note: '四足跪姿，胸腔与骨盆配合做大幅度圆周(顺逆各转)，解锁僵硬躯干、活动脊柱', u: '秒', bi: true },
    { n: '下犬式', eq: ['无器材', '健身房全套'], muscle: ['全身', '下肢'], diff: 1, note: '双手双脚撑地、臀向上顶成倒V，背伸直、脚跟下踩，拉伸腿后侧/小腿与肩背', u: '秒' },
    { n: '跪姿后倒（股四拉伸）', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 2, note: '高跪姿，保持躯干与大腿呈一直线并向后倾斜，极限拉伸大腿前侧与伸髋', u: '秒' },
    { n: '靠墙倒箭式（分腿版）', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '仰卧臀部贴墙，双腿沿墙面竖直向上并自然向两侧极度打开，重力开胯拉伸内收肌', u: '秒' },
    { n: '靠墙站立前屈（wall forward fold）', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '背贴墙站立，前移双脚并向下折叠前屈，使骨盆后部完全贴靠墙面，深度拉伸腿后侧', u: '秒' },
    { n: '挺尸式（savasana）', eq: ['无器材'], muscle: ['全身'], diff: 1, note: '仰卧全身自然摊开，手心向上闭眼，深长呼吸，整体放松', u: '秒', hold: 90 },
    { n: '卧束角式（supta baddha konasana）', eq: ['无器材'], muscle: ['下肢'], diff: 1, note: '仰卧脚心相对，双膝自然向两侧落下，配合腹式呼吸放松髋部', u: '秒', hold: 120 },
    { n: '婴儿式（balasana）', eq: ['无器材'], muscle: ['全身'], diff: 1, note: '跪坐于足跟，上半身向前贴地，手臂向后伸直掌心向上，深长呼吸放松', u: '秒' },
    { n: '蜥蜴式（lizard）', eq: ['无器材', '健身房全套'], muscle: ['髋屈肌', '内收肌', '下肢'], diff: 2, note: '低弓步前脚落于同侧手外侧，后腿跪或伸直，前腿膝向外张开，上身下沉，停留30-60秒，深层开髋', u: '秒', hold: 45, bi: true },
    { n: '鸽式（eka pada kapotasana）', eq: ['无器材', '健身房全套'], muscle: ['髋屈肌', '臀', '下肢'], diff: 3, note: '前腿折叠外旋横置于地（膝朝外），后腿伸直贴地，骨盆尽量水平下沉，上身可前趴或竖直，深度拉伸梨状肌与髋外旋', u: '秒', bi: true },
    { n: '弓式（dhanurasana）', eq: ['无器材', '健身房全套'], muscle: ['脊柱', '臀', '胸大肌'], diff: 3, note: '俯卧双腿屈膝，双手向后抓住脚踝，吸气抬起胸口与大腿同时离地，身体像弓一样绷紧，保持5次呼吸', u: '次' },
    { n: '轮式（urdhva dhanurasana）', eq: ['无器材', '健身房全套'], muscle: ['脊柱', '臀', '上肢', '胸大肌'], diff: 3, note: '仰卧屈膝双脚踩地，双手手掌置于耳侧，吸气推地将整个身体弓起，胸椎充分展开，大腿平行地面，保持5次呼吸', u: '次' },
    { n: '花环式（malasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '内收肌', '核心'], diff: 1, note: '双脚与髋宽或稍宽，脚尖外旋45°，深蹲到底脚跟落地，双肘撑开双膝外展，双手合十，骨盆下沉放松', u: '秒' },
    { n: '猴神式（hanumanasana）', eq: ['无器材', '健身房全套'], muscle: ['髋屈肌', '腘绳', '下肢'], diff: 3, note: '前腿向前伸直，后腿向后伸直，完成前后劈叉，骨盆水平正对前方，双手置于两侧支撑，循序渐进下沉', u: '秒', bi: true }
  ],
  // 仪态(2026-08-27):不进主循环 —— SPLITS 不引用 posture,只由 _appendPosture() 按需挑。
  // 练的是"站着不动就好看"的那部分:体态、步态、颈线、骨盆位置。
  posture: [
    { n: '头顶书本走姿（poise walk）', eq: ['无器材', '健身房全套'], muscle: ['姿势', '核心'], diff: 1, note: '头顶一本书沿直线慢走，下巴微收、头顶向上延伸，书不掉=颈椎中立、重心稳', u: '秒', hold: 60 },
    { n: '猫步走（catwalk）', eq: ['无器材', '健身房全套'], muscle: ['姿势', '臀中肌', '核心'], diff: 2, note: '沿一条直线走，每步落脚踩在中线上、骨盆随步子自然左右送，肩不晃、目视前方', u: '秒', hold: 60 },
    { n: '靠墙站立体态检查（wall posture check）', eq: ['无器材', '健身房全套'], muscle: ['姿势'], diff: 1, note: '后脑勺、上背、臀、小腿贴墙，腰后只留一掌厚度，肩胛下沉、下巴微收，记住这个位置再离墙', u: '秒', hold: 45 },
  ],
};

// ══ Split Templates ═════════════════════════════════════════
// groups = 肌群组, pick = 每组多少个动作
// ── Dev assertion: every LIMIT_RULES exclude must exactly match a DB[grp][].n.
// Exclusion uses exact name match, so a typo like '直立划船' vs '杠铃直立划船' silently
// fails to exclude. Warns on drift; no functional effect. (Runs after DB is defined.)
(function () {
  try {
    const names = new Set(); Object.values(DB).forEach(arr => arr.forEach(ex => names.add(ex.n)));
    LIMIT_RULES.forEach(r => r.exclude.forEach(n => {
      if (!names.has(n)) console.warn('[LIMIT_RULES] exclude 名在 DB 中不存在:', n, '(kw:' + r.kw.join('/') + ')');
    }));
    _PRIVATE_POOL.forEach(n => {
      if (!names.has(n)) console.warn('[pool] missing:', n);
    });
    // 配重表/门控表也按名字精确匹配 → 改名漂移会静默失效,这里出声
    [...NO_WEIGHT_MOVES, ...Object.keys(WEIGHT_HOW), ...OWNER_ONLY_MOVES].forEach(n => {
      if (!names.has(n)) console.warn('[weight/gate] 名在 DB 中不存在:', n);
    });
  } catch (e) { }
})();

const SPLITS = {
  // 2天：上肢/下肢 — AB分
  2: [
    { type: '上肢（胸/肩/背/二头/三头）', groups: ['chest', 'shoulder', 'back', 'biceps', 'triceps'], pick: { chest: 2, shoulder: 1, back: 2, biceps: 1, triceps: 1 } },
    { type: '下肢（股四/臀腿/小腿）+核心', groups: ['quads', 'hamglutes', 'calves', 'core'], pick: { quads: 2, hamglutes: 2, calves: 1, core: 1 } },
  ],
  // 3天：PPL — 推天训“推”肌群（胸+肩前中束+三头），拉天训“拉”肌群（背+肩后束+二头），腿天训下肢
  3: [
    { type: '推（胸+肩前/中束+三头）', groups: ['chest', 'shoulder', 'triceps'], pick: { chest: 3, shoulder: 2, triceps: 2 } },
    { type: '拉（背+肩后束+二头）', groups: ['back', 'biceps', 'shoulder'], pick: { back: 3, biceps: 2, shoulder: 1 } },
    { type: '腿（股四/臀腿/小腿）+核心', groups: ['quads', 'hamglutes', 'calves', 'core'], pick: { quads: 2, hamglutes: 2, calves: 1, core: 1 } },
  ],
  // 4天：胸三/背二/肩/腿 — 经典四分
  4: [
    { type: '胸+三头', groups: ['chest', 'triceps'], pick: { chest: 3, triceps: 3 } },
    { type: '背+二头', groups: ['back', 'biceps'], pick: { back: 3, biceps: 3 } },
    { type: '肩（前束/中束/后束）+核心', groups: ['shoulder', 'core'], pick: { shoulder: 4, core: 2 } },
    { type: '腿（股四+臀腿+小腿）', groups: ['quads', 'hamglutes', 'calves'], pick: { quads: 3, hamglutes: 2, calves: 1 } },
  ],
  // 5天：胸/背/肩/腿(股四主)/腿(臀腿主) — Arnold分化
  5: [
    { type: '胸+三头', groups: ['chest', 'triceps'], pick: { chest: 4, triceps: 2 } },
    { type: '背+二头', groups: ['back', 'biceps'], pick: { back: 4, biceps: 2 } },
    { type: '肩（前/中/后束）+核心', groups: ['shoulder', 'core'], pick: { shoulder: 4, core: 2 } },
    { type: '腿(股四为主)+小腿', groups: ['quads', 'calves'], pick: { quads: 4, calves: 2 } },
    { type: '臀腿(后链为主)+核心', groups: ['hamglutes', 'core'], pick: { hamglutes: 4, core: 2 } },
  ],
  // 6天：胸/背/肩/股四/臀腿/手臂
  6: [
    { type: '胸+三头', groups: ['chest', 'triceps'], pick: { chest: 4, triceps: 3 } },
    { type: '背+二头', groups: ['back', 'biceps'], pick: { back: 4, biceps: 3 } },
    { type: '肩（前/中/后束全训）', groups: ['shoulder'], pick: { shoulder: 6 } },
    { type: '腿（股四为主）+小腿', groups: ['quads', 'calves'], pick: { quads: 4, calves: 2 } },
    { type: '臀腿（后链为主）+核心', groups: ['hamglutes', 'core'], pick: { hamglutes: 4, core: 2 } },
    { type: '二头+三头+核心', groups: ['biceps', 'triceps', 'core'], pick: { biceps: 3, triceps: 3, core: 2 } },
  ],
  // 7天：6天分化+活动恢复
  7: [
    { type: '胸+三头', groups: ['chest', 'triceps'], pick: { chest: 4, triceps: 3 } },
    { type: '背+二头', groups: ['back', 'biceps'], pick: { back: 4, biceps: 3 } },
    { type: '肩（前/中/后束全训）', groups: ['shoulder'], pick: { shoulder: 6 } },
    { type: '腿（股四为主）+小腿', groups: ['quads', 'calves'], pick: { quads: 4, calves: 2 } },
    { type: '臀腿（后链为主）+核心', groups: ['hamglutes', 'core'], pick: { hamglutes: 4, core: 2 } },
    { type: '二头+三头+核心', groups: ['biceps', 'triceps', 'core'], pick: { biceps: 3, triceps: 3, core: 2 } },
    { type: '全身有氧+拉伸', groups: ['cardio', 'core'], pick: { cardio: 3, core: 2 } },
  ],
};

// ══ Glute-Leg Splits (臀腿塑形专用) ═══════════════════════
// 全部精力放在下半身：臀中肌改善腰胯比，臀大肌整体臀型，大腿前后侧让腿不显细。
// 不安排任何上肢宽度训练。
const GLUTE_SPLITS = {
  // 2天：两次都按全套来 — 臀腿综合
  2: [
    { type: '臀腿综合（髋铰链+深蹲）', groups: ['hamglutes', 'quads', 'glutemed', 'calves', 'core'], pick: { hamglutes: 2, quads: 2, glutemed: 1, calves: 1, core: 1 } },
    { type: '臀腿综合（深蹲+髋铰链）', groups: ['quads', 'hamglutes', 'glutemed', 'calves', 'core'], pick: { quads: 2, hamglutes: 2, glutemed: 1, calves: 1, core: 1 } },
  ],
  // 3天：股四日/臀腘日/综合日
  3: [
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves', 'core'], pick: { quads: 3, hamglutes: 1, calves: 1, core: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'quads', 'glutemed', 'core'], pick: { hamglutes: 3, quads: 1, glutemed: 1, core: 1 } },
    { type: '臀腿综合日', groups: ['hamglutes', 'quads', 'glutemed', 'calves', 'core'], pick: { hamglutes: 2, quads: 1, glutemed: 1, calves: 1, core: 1 } },
  ],
  // 4天：股四/臀腘/综合/臀中+小腿
  4: [
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves', 'core'], pick: { quads: 3, hamglutes: 1, calves: 1, core: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '臀腿综合日', groups: ['hamglutes', 'quads', 'glutemed', 'calves', 'core'], pick: { hamglutes: 2, quads: 1, glutemed: 1, calves: 1, core: 1 } },
    { type: '臀中肌+小腿强化', groups: ['glutemed', 'hamglutes', 'calves', 'core'], pick: { glutemed: 2, hamglutes: 1, calves: 2, core: 1 } },
  ],
  // 5天：股四/臀腘/综合/股四进阶/臀中+小腿
  5: [
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves', 'core'], pick: { quads: 3, hamglutes: 1, calves: 1, core: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '臀腿综合日', groups: ['hamglutes', 'quads', 'glutemed', 'calves', 'core'], pick: { hamglutes: 2, quads: 1, glutemed: 1, calves: 1, core: 1 } },
    { type: '臀中肌+小腿强化', groups: ['glutemed', 'hamglutes', 'calves', 'core'], pick: { glutemed: 2, hamglutes: 1, calves: 2, core: 1 } },
    { type: '轻量有氧+拉伸', groups: ['cardio', 'core'], pick: { cardio: 3, core: 2 } },
  ],
  // 6天：全下肢高频轮转
  6: [
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves', 'core'], pick: { quads: 3, hamglutes: 1, calves: 1, core: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '臀腿综合日', groups: ['hamglutes', 'quads', 'glutemed', 'calves', 'core'], pick: { hamglutes: 2, quads: 1, glutemed: 1, calves: 1, core: 1 } },
    { type: '臀中肌+小腿强化', groups: ['glutemed', 'hamglutes', 'calves', 'core'], pick: { glutemed: 2, hamglutes: 1, calves: 2, core: 1 } },
    { type: '轻量有氧+拉伸', groups: ['cardio', 'core'], pick: { cardio: 3, core: 2 } },
    { type: '臀大肌泵感日', groups: ['hamglutes', 'glutemed', 'core'], pick: { hamglutes: 4, glutemed: 1, core: 1 } },
  ],
  // 7天：6天分化+活动恢复
  7: [
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves', 'core'], pick: { quads: 3, hamglutes: 1, calves: 1, core: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '臀腿综合日', groups: ['hamglutes', 'quads', 'glutemed', 'calves', 'core'], pick: { hamglutes: 2, quads: 1, glutemed: 1, calves: 1, core: 1 } },
    { type: '臀中肌+小腿强化', groups: ['glutemed', 'hamglutes', 'calves', 'core'], pick: { glutemed: 2, hamglutes: 1, calves: 2, core: 1 } },
    { type: '轻量有氧+拉伸', groups: ['cardio', 'core'], pick: { cardio: 3, core: 2 } },
    { type: '臀大肌泵感日', groups: ['hamglutes', 'glutemed', 'core'], pick: { hamglutes: 4, glutemed: 1, core: 1 } },
    { type: '活动休息日（纯拉伸/泡沫轴）', groups: ['stretch'], pick: { stretch: 5 } },
  ],
};


// ══ Curve Splits (女性曲线 — 极致女性曲线: 圆臀+宽胯+丰满大腿+蛮腰) ══
const CURVE_SPLITS = {
  2: [
    { type: '臀大肌+腿后丰满', groups: ['hamglutes', 'quads', 'glutemed', 'core'], pick: { hamglutes: 3, quads: 2, glutemed: 1, core: 1 } },
    { type: '胯宽+大腿丰满', groups: ['glutemed', 'quads', 'hamglutes', 'core'], pick: { glutemed: 2, quads: 2, hamglutes: 2, core: 1 } },
  ],
  3: [
    { type: '臀大肌塑形（臀推/硬拉）', groups: ['hamglutes', 'quads', 'glutemed', 'core'], pick: { hamglutes: 3, quads: 1, glutemed: 1, core: 1 } },
    { type: '臀中肌·胯宽日（外展为主）', groups: ['glutemed', 'hamglutes', 'core'], pick: { glutemed: 4, hamglutes: 1, core: 1 } },
    { type: '大腿丰满日（股四+腘绳）', groups: ['quads', 'hamglutes', 'glutemed', 'core'], pick: { quads: 3, hamglutes: 2, glutemed: 1, core: 1 } },
  ],
  4: [
    { type: '臀大肌塑形（臀推为主）', groups: ['hamglutes', 'quads', 'glutemed', 'core'], pick: { hamglutes: 3, quads: 1, glutemed: 1, core: 1 } },
    { type: '臀中肌·胯宽（重）', groups: ['glutemed', 'core'], pick: { glutemed: 4, core: 2 } },
    { type: '大腿丰满（股四+腘绳）', groups: ['quads', 'hamglutes', 'core'], pick: { quads: 3, hamglutes: 2, core: 1 } },
    { type: '臀腿丰满+收腰', groups: ['hamglutes', 'glutemed', 'quads', 'core'], pick: { hamglutes: 2, glutemed: 2, quads: 1, core: 1 } },
  ],
  5: [
    { type: '臀大肌塑形（臀推为主）', groups: ['hamglutes', 'quads', 'glutemed', 'core'], pick: { hamglutes: 3, quads: 1, glutemed: 1, core: 1 } },
    { type: '臀中肌·胯宽（重）', groups: ['glutemed', 'core'], pick: { glutemed: 4, core: 2 } },
    { type: '大腿丰满（股四+腘绳）', groups: ['quads', 'hamglutes', 'core'], pick: { quads: 3, hamglutes: 2, core: 1 } }, // 少练小腿(去掉calves)
    { type: '臀中+臀大泵感', groups: ['glutemed', 'hamglutes'], pick: { glutemed: 3, hamglutes: 2 } },
    { type: '腘绳·臀腿收腰', groups: ['hamglutes', 'glutemed', 'core'], pick: { hamglutes: 3, glutemed: 1, core: 2 } },
  ],
  6: [
    { type: '臀大肌塑形（臀推为主）', groups: ['hamglutes', 'quads', 'glutemed', 'core'], pick: { hamglutes: 3, quads: 1, glutemed: 1, core: 1 } },
    { type: '臀中肌·胯宽（重）', groups: ['glutemed', 'core'], pick: { glutemed: 4, core: 2 } },
    { type: '大腿丰满（股四+腘绳）', groups: ['quads', 'hamglutes', 'core'], pick: { quads: 3, hamglutes: 2, core: 1 } }, // 少练小腿(去掉calves)
    { type: '臀中+臀大泵感', groups: ['glutemed', 'hamglutes'], pick: { glutemed: 3, hamglutes: 2 } },
    { type: '腘绳·臀腿收腰', groups: ['hamglutes', 'glutemed', 'core'], pick: { hamglutes: 3, glutemed: 1, core: 2 } },
    { type: '臀中强化+股四', groups: ['glutemed', 'quads', 'core'], pick: { glutemed: 2, quads: 2, core: 1 } },
  ],
  7: [
    { type: '臀大肌塑形（臀推为主）', groups: ['hamglutes', 'quads', 'glutemed', 'core'], pick: { hamglutes: 3, quads: 1, glutemed: 1, core: 1 } },
    { type: '臀中肌·胯宽（重）', groups: ['glutemed', 'core'], pick: { glutemed: 4, core: 2 } },
    { type: '大腿丰满（股四+腘绳）', groups: ['quads', 'hamglutes', 'core'], pick: { quads: 3, hamglutes: 2, core: 1 } }, // 少练小腿(去掉calves)
    { type: '臀中+臀大泵感', groups: ['glutemed', 'hamglutes'], pick: { glutemed: 3, hamglutes: 2 } },
    { type: '腘绳·臀腿收腰', groups: ['hamglutes', 'glutemed', 'core'], pick: { hamglutes: 3, glutemed: 1, core: 2 } },
    { type: '臀中强化+股四', groups: ['glutemed', 'quads', 'core'], pick: { glutemed: 2, quads: 2, core: 1 } },
    { type: '轻量有氧+拉伸', groups: ['cardio', 'stretch'], pick: { cardio: 3, stretch: 2 } },
  ],
};

// ══ Glute Back Splits (翘臀美背 - Cici专属) ══════════════
const GLUTE_BACK_SPLITS = {
  2: [
    { type: '臀+腿日', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '美背+臀+核心', groups: ['back', 'hamglutes', 'core'], pick: { back: 3, hamglutes: 1, core: 1 } },
  ],
  3: [
    { type: '臀大肌日（臀峰）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '美背+体态日', groups: ['back', 'core'], pick: { back: 4, core: 2 } },
    { type: '臀腿+核心综合', groups: ['hamglutes', 'quads', 'glutemed', 'core'], pick: { hamglutes: 2, quads: 1, glutemed: 1, core: 1 } },
  ],
  4: [
    { type: '臀大肌（臀峰）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '美背+体态', groups: ['back', 'core'], pick: { back: 4, core: 2 } },
    { type: '股四+臀腿', groups: ['quads', 'hamglutes', 'core'], pick: { quads: 3, hamglutes: 1, core: 1 } },
    { type: '臀中+美背收尾', groups: ['glutemed', 'back', 'core'], pick: { glutemed: 2, back: 2, core: 1 } },
  ],
  5: [
    { type: '臀大肌（臀峰）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '美背+体态', groups: ['back', 'core'], pick: { back: 4, core: 2 } },
    { type: '股四头肌', groups: ['quads', 'calves', 'core'], pick: { quads: 3, calves: 1, core: 1 } },
    { type: '臀腿综合', groups: ['hamglutes', 'glutemed', 'core'], pick: { hamglutes: 3, glutemed: 1, core: 1 } },
    { type: '美背+核心收腰', groups: ['back', 'core'], pick: { back: 3, core: 2 } },
  ],
  6: [
    { type: '臀大肌（臀峰）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '美背+体态', groups: ['back', 'core'], pick: { back: 4, core: 2 } },
    { type: '股四头肌', groups: ['quads', 'calves', 'core'], pick: { quads: 3, calves: 1, core: 1 } },
    { type: '臀腿综合', groups: ['hamglutes', 'glutemed', 'core'], pick: { hamglutes: 3, glutemed: 1, core: 1 } },
    { type: '美背+核心收腰', groups: ['back', 'core'], pick: { back: 3, core: 2 } },
    { type: '臀大肌泵感日', groups: ['hamglutes', 'core'], pick: { hamglutes: 4, core: 1 } },
  ],
  7: [
    { type: '臀大肌（臀峰）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 3, quads: 1, core: 1 } },
    { type: '美背+体态', groups: ['back', 'core'], pick: { back: 4, core: 2 } },
    { type: '股四头肌', groups: ['quads', 'calves', 'core'], pick: { quads: 3, calves: 1, core: 1 } },
    { type: '臀腿综合', groups: ['hamglutes', 'glutemed', 'core'], pick: { hamglutes: 3, glutemed: 1, core: 1 } },
    { type: '美背+核心收腰', groups: ['back', 'core'], pick: { back: 3, core: 2 } },
    { type: '臀大肌泵感日', groups: ['hamglutes', 'core'], pick: { hamglutes: 4, core: 1 } },
    { type: '轻量有氧+拉伸', groups: ['cardio', 'stretch'], pick: { cardio: 3, stretch: 2 } },
  ],
};

// ══ Combined Splits (两者结合: 臀腿为主 + 上肢维持) ════════
const COMBINED_SPLITS = {
  2: [
    { type: '上肢维持（推+拉）', groups: ['chest', 'back', 'shoulder', 'core'], pick: { chest: 1, back: 2, shoulder: 1, core: 1 } },
    { type: '臀腿综合（髋铰链+深蹲）', groups: ['hamglutes', 'quads', 'calves', 'core'], pick: { hamglutes: 3, quads: 2, calves: 1, core: 1 } },
  ],
  3: [
    { type: '上肢维持（推+拉）', groups: ['chest', 'back', 'shoulder', 'core'], pick: { chest: 1, back: 2, shoulder: 1, core: 1 } },
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves', 'core'], pick: { quads: 3, hamglutes: 1, calves: 1, core: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 4, quads: 1, core: 1 } },
  ],
  4: [
    { type: '上肢维持（推+拉）', groups: ['chest', 'back', 'shoulder', 'core'], pick: { chest: 1, back: 2, shoulder: 1, core: 1 } },
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves', 'core'], pick: { quads: 3, hamglutes: 1, calves: 1, core: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 4, quads: 1, core: 1 } },
    { type: '臀腿综合日', groups: ['hamglutes', 'quads', 'calves', 'core'], pick: { hamglutes: 2, quads: 2, calves: 1, core: 1 } },
  ],
  5: [
    { type: '上肢维持·推（胸+肩+三头）', groups: ['chest', 'shoulder', 'triceps', 'core'], pick: { chest: 2, shoulder: 1, triceps: 1, core: 1 } },
    { type: '上肢维持·拉（背+二头）', groups: ['back', 'biceps', 'core'], pick: { back: 2, biceps: 1, core: 1 } },
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves'], pick: { quads: 3, hamglutes: 1, calves: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'quads', 'core'], pick: { hamglutes: 4, quads: 1, core: 1 } },
    { type: '臀腿综合日', groups: ['hamglutes', 'quads', 'calves', 'core'], pick: { hamglutes: 2, quads: 2, calves: 1, core: 1 } },
  ],
  6: [
    { type: '上肢维持·推（胸+肩+三头）', groups: ['chest', 'shoulder', 'triceps', 'core'], pick: { chest: 2, shoulder: 1, triceps: 1, core: 1 } },
    { type: '上肢维持·拉（背+二头）', groups: ['back', 'biceps', 'core'], pick: { back: 2, biceps: 1, core: 1 } },
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves'], pick: { quads: 4, hamglutes: 1, calves: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'core'], pick: { hamglutes: 5, core: 1 } },
    { type: '臀腿综合日', groups: ['hamglutes', 'quads', 'calves', 'core'], pick: { hamglutes: 2, quads: 2, calves: 1, core: 1 } },
    { type: '臀中肌+小腿强化', groups: ['hamglutes', 'calves', 'core'], pick: { hamglutes: 3, calves: 2, core: 1 } },
  ],
  7: [
    { type: '上肢维持·推（胸+肩+三头）', groups: ['chest', 'shoulder', 'triceps', 'core'], pick: { chest: 2, shoulder: 1, triceps: 1, core: 1 } },
    { type: '上肢维持·拉（背+二头）', groups: ['back', 'biceps', 'core'], pick: { back: 2, biceps: 1, core: 1 } },
    { type: '股四头肌日（深蹲为主）', groups: ['quads', 'hamglutes', 'calves'], pick: { quads: 4, hamglutes: 1, calves: 1 } },
    { type: '臀+腘绳肌日（髋铰链为主）', groups: ['hamglutes', 'core'], pick: { hamglutes: 5, core: 1 } },
    { type: '臀腿综合日', groups: ['hamglutes', 'quads', 'calves', 'core'], pick: { hamglutes: 2, quads: 2, calves: 1, core: 1 } },
    { type: '臀中肌+小腿强化', groups: ['hamglutes', 'calves', 'core'], pick: { hamglutes: 3, calves: 2, core: 1 } },
    { type: '轻量有氧+拉伸', groups: ['cardio', 'core'], pick: { cardio: 3, core: 2 } },
  ],
};

// focusMap: 用户选择的重点→对应肌群组，上肢包括背部
const FOCUS_MAP = { '均衡全身': ['chest', 'shoulder', 'back', 'biceps', 'triceps', 'quads', 'hamglutes', 'calves', 'core', 'cardio'], '上肢': ['chest', 'shoulder', 'back', 'biceps', 'triceps'], '下肢': ['quads', 'hamglutes', 'calves'], '核心': ['core'], '有氧': ['cardio'], '游泳': ['swimming', 'core', 'back'] };

const SCHEMES = {
  '女性薄肌': {
    sets: { 初级: 3, 中级: 4, 高级: 4 }, reps: { 初级: 15, 中级: 15, 高级: 20 },
    rest: '45-60秒', cardioMin: 15, timePerSet: 105,
    intensityNote: { 初级: '轻重量高次数，感受发力', 中级: '控制离心，避免肌肉过度代偿', 高级: '全程紧绷，不追求极限重量' },
    weightGuide: { 初级: '约为最大力量的40-50%', 中级: '约为最大力量的50-60%', 高级: '约为最大力量的55-65%' }
  },
  '臀腿塑形': {
    sets: { 初级: 3, 中级: 4, 高级: 4 }, reps: { 初级: 12, 中级: 10, 高级: 8 },
    rest: '60-90秒', cardioMin: 10, timePerSet: 120,
    intensityNote: { 初级: '注重动作规范，激活臀肌', 中级: '增加负重，强调向心爆发与离心控制', 高级: '向力竭挑战，强化臀腿泵感' },
    weightGuide: { 初级: '约为最大力量的50-60%', 中级: '约为最大力量的65-75%', 高级: '约为最大力量的75-85%' }
  },
  '女性薄肌+臀腿塑形': {
    sets: { 初级: 3, 中级: 4, 高级: 4 }, reps: { 初级: 12, 中级: 10, 高级: 8 },
    rest: '60-90秒', cardioMin: 10, timePerSet: 115,
    intensityNote: { 初级: '下肢渐进超负荷，上肢轻量维持', 中级: '下肢向心爆发+离心控制，上肢控制性训练', 高级: '下肢向力竭挑战，上肢维持不增量' },
    weightGuide: { 初级: '下肢50-60% · 上肢40-50%', 中级: '下肢65-75% · 上肢50-60%', 高级: '下肢75-85% · 上肢55-65%' }
  },
  '翘臀美背': {
    sets: { 初级: 3, 中级: 4, 高级: 4 }, reps: { 初级: 12, 中级: 12, 高级: 10 },
    rest: '60-90秒', cardioMin: 10, timePerSet: 110,
    intensityNote: {
      初级: '臀推顶端挤压，背部动作专注肩胛后收下沉',
      中级: '臀推加重强调臀峰，划船/下拉控制离心',
      高级: '臀推突破，美背日加量，核心真空吸收紧腰腹'
    },
    weightGuide: {
      初级: '臀推约max的60-70%，背部约50-60%',
      中级: '臀推约max的75-85%，背部约60-70%',
      高级: '臀推约max的85-95%，背部约70-80%'
    }
  },
  '女性曲线': {
    sets: { 初级: 3, 中级: 4, 高级: 4 }, reps: { 初级: 15, 中级: 12, 高级: 10 },
    rest: '60-90秒', cardioMin: 12, timePerSet: 115,
    intensityNote: {
      初级: '先激活臀中肌，外展每次必练做到酸胀；臀推顶端挤压；股四+腘绳认真练，把大腿练丰满',
      中级: '外展加阻力保持15-20次，臀推顶端2秒挤压；股四/腘绳渐进超负荷堆大腿肉感',
      高级: '外展向力竭、臀中每次不能跳；臀推/硬拉冲纪录；股四+腘绳大重量堆丰满大腿'
    },
    weightGuide: {
      初级: '臀推约max的60-70%；外展类15-20次能完成的阻力；腿部12-15次到位',
      中级: '臀推约max的75-85%；外展类15-20次仍吃力；腿部10-12次渐进加重',
      高级: '臀推约max的85-95%；外展力竭；腿部8-12次大重量堆围度'
    }
  }
};
const TIPS = {
  '女性薄肌': '组间休息45-60秒保持心率。训练后做一组拉伸放松。重点强化臀腿和核心线条。',
  '臀腿塑形': '全部精力放在下半身，把视觉重心拉下来。臀推是最优先的动作，直接针对臀大肌。臀中肌侧向训练是改善腰胯比的关键，别跳过。重量选最后两次比较吃力的程度，每周尽量加一点点。蛋白质每公斤体重每天1.6-2克，热量吃够才能长肌肉。',
  '女性薄肌+臀腿塑形': '以臀腿为主战场，上肢仅做维持性训练。下半身每周2-3次，髋铰链和深蹲交替。上肢每周1-2次轻量推拉即可，不追求上肢增量。蛋白质每公斤体重每天1.6-2克，热量吃够才能长肌肉。',
  '翘臀美背': '臀推是提臀峰第一动作，顶端挤压1-2秒。你可以也应该练背，背阔分离感和肩胛下沉能让背显挺、视觉收腰。斜方"厚"多半是圆肩体态：停掉直立划船和耸肩，多做面拉、YTW、靠墙天使，把肩膀沉下去。收腰靠真空吸和卷腹收紧腹横肌，不是减脂。',
  '女性曲线': '极致沙漏：臀中肌外展每次必练不能跳（胯宽靠它）；臀推/硬拉渐进冲圆臀；股四+腘绳+内收都堆围度让大腿丰满柔顺。腰只做真空吸/平板，绝不做负重侧屈/转体（会把腰练方）。上肢几乎不动以免变宽。蛋白1.6-2g/kg+轻微热量盈余才能喂大臀腿；腰围靠真空吸+控总量+有氧，不靠饿。'
};
// Resolve S.goal to a canonical SCHEMES/TIPS key. S.goal may be a combo like
// '女性薄肌+臀腿塑形' or, from older data, an order-swapped/invalid string. Fall back
// along the SAME priority genPlan() uses to pick split templates, so intensity
// (sets/reps/weight) never disagrees with the chosen template.
function currentGoalKey() {
  if (SCHEMES[S.goal]) return S.goal;
  if (hasGoal('女性曲线')) return '女性曲线';
  if (hasGoal('翘臀美背')) return '翘臀美背';
  if (isCombinedGoal()) return '女性薄肌+臀腿塑形';
  if (hasGoal('臀腿塑形')) return '臀腿塑形';
  return '女性薄肌';
}
function currentScheme() { return SCHEMES[currentGoalKey()]; }
// Apply a goal toggle to S.goal/focus/equip with the exclusivity + canonical-order rules.
// Used by BOTH the settings chip (app.js) and onboarding (selectOnboardGoal) so the two can't
// drift into producing invalid keys like '翘臀美背+女性曲线'. Caller persists + re-renders.
function applyGoalToggle(goal) {
  const EXCLUSIVE = ['翘臀美背', '女性曲线']; // 整套预设方案，不与其他目标组合
  const ORDER = ['女性薄肌', '臀腿塑形'];        // 规范组合顺序，命中 '女性薄肌+臀腿塑形' key
  let goals = S.goal ? S.goal.split('+') : [];
  if (EXCLUSIVE.includes(goal)) {
    goals = goals.includes(goal) ? [] : [goal];            // 互斥：选它即清空其他；再点一次取消
  } else {
    goals = goals.filter(g => !EXCLUSIVE.includes(g));        // 选普通目标时先去掉互斥预设
    goals = goals.includes(goal) ? goals.filter(g => g !== goal) : [...goals, goal];
  }
  if (goals.length === 0) goals.push('女性薄肌');
  goals.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  S.goal = goals.join('+');
  // 重点部位跟目标走,但「柔韧·体态 / 上肢紧致 / 平衡稳定」这类附加模块是另外勾的,保留
  const addons = (S.focus || []).filter(f => ['柔韧灵活', '上肢紧致', '平衡稳定'].includes(f));
  S.focus = [(hasGoal('臀腿塑形') || hasGoal('翘臀美背') || hasGoal('女性曲线')) ? '下肢' : '均衡全身', ...addons];
  // 器材是「手上有什么」,不该因为换目标被偷偷加上健身房全套;只在一样都没选时补「无器材」
  // (徒手动作本来对所有人开放,臀中肌的徒手动作不需要额外勾器材)
  if (!Array.isArray(S.equip) || !S.equip.length) S.equip = ['无器材'];
}
// Menstrual-cycle phase from a user-set "current day" (manual slider — a PWA can't read iOS
// Health). Returns a phase label + gentle training note. Suggestion only; actual training load
// still auto-tunes from each check-in's RPE, so a wrong guess self-corrects.
function cyclePhase(day, length) {
  length = +length || 28; day = +day || 1;
  const periodLen = 5;
  const ovu = Math.max(periodLen + 3, length - 14); // 排卵 ≈ 下次月经前 14 天
  if (day <= periodLen) return { key: 'menstrual', name: '月经期', advice: '建议开「经期模式」(降负重、避高腹压)。能轻动就轻动缓解不适，痛就休息，别硬上。' };
  if (day < ovu - 1) return { key: 'follicular', name: '卵泡期', advice: '状态通常最好——可冲强度、加重量，臀腿大动作/破纪录的好窗口。' };
  if (day <= ovu + 1) return { key: 'ovulation', name: '排卵期', advice: '力量峰值，适合上大重量；充分热身、注意关节稳定。' };
  return { key: 'luteal', name: '黄体期', advice: day > length - 4 ? '经前段：减量、重恢复、睡好；想多吃属正常，优先蛋白。' : '维持训练量即可，临近经前再逐步减量。' };
}
const SWIM_TIPS = {
  '入门': '蛙泳腿口诀：收翻蹬夹。每次蹬腿后享受2-3秒滑行，不要急着做下一个动作。扶池边是你最好的练习伙伴。',
  '进阶': '好的蛙泳70%时间在滑行。关注节奏而非速度，累了就加长滑行而不是加快频率。',
  '挑战': '自由泳呼吸的秘诀：不是转头，而是转动整个身体。先用蛙泳热身，再切换到自由泳练习。'
};
const DN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ══ Swim Milestones ════════════════════════════════════════
const SWIM_MILESTONES = [
  { count: 1, icon: '', title: '初次下水', desc: '完成第一次游泳训练！' },
  { count: 3, icon: '', title: '水性初具', desc: '已完成 3 次游泳训练' },
  { count: 5, icon: '', title: '小鱼儿', desc: '已完成 5 次游泳训练' },
  { count: 10, icon: '', title: '水中小达人', desc: '已完成 10 次游泳训练！' },
  { count: 20, icon: '', title: '泳池常客', desc: '已完成 20 次游泳训练' },
  { count: 30, icon: '', title: '乘风破浪', desc: '已完成 30 次游泳训练！' },
  { count: 50, icon: '', title: '美人鱼', desc: '已完成 50 次游泳训练！！' },
];
SWIM_LOG = lg('fit_swim') || { count: 0, milestones: [] };
function checkSwimMilestone() {
  SWIM_LOG.count = (SWIM_LOG.count || 0) + 1;
  const m = SWIM_MILESTONES.find(ms => ms.count === SWIM_LOG.count);
  if (m) {
    SWIM_LOG.milestones.push({ ...m, date: todayStr() });
    const _xMsg = _xMode && _ownerSession() ? _xMilestoneText() : null;
    setTimeout(() => showToast(_xMsg || `游泳成就解锁：${m.title}！`, _xMsg ? 5000 : 3000), 500);
  }
  ls('fit_swim', SWIM_LOG);
}

const GYM_MILESTONES = [
  { count: 1, icon: '', title: '力量萌新', desc: '完成第一次力量训练！' },
  { count: 3, icon: '', title: '渐入佳境', desc: '已完成 3 次力量训练' },
  { count: 5, icon: '', title: '习惯养成', desc: '已完成 5 次力量训练' },
  { count: 10, icon: '', title: '铁骨铜筋', desc: '已完成 10 次力量训练！' },
  { count: 20, icon: '', title: '训练狂人', desc: '已完成 20 次力量训练' },
  { count: 30, icon: '', title: '钢铁之魂', desc: '已完成 30 次力量训练！' },
  { count: 50, icon: '', title: '终极雕刻家', desc: '已完成 50 次力量训练！！' },
];
GYM_LOG = lg('fit_gym_ach') || { count: 0, milestones: [] };
function checkGymMilestone() {
  GYM_LOG.count = (GYM_LOG.count || 0) + 1;
  const m = GYM_MILESTONES.find(ms => ms.count === GYM_LOG.count);
  if (m) {
    GYM_LOG.milestones.push({ ...m, date: todayStr() });
    const _xMsg = _xMode && _ownerSession() ? _xMilestoneText() : null;
    setTimeout(() => showToast(_xMsg || `力量成就解锁：${m.title}！`, _xMsg ? 5000 : 3000), 500);
  }
  ls('fit_gym_ach', GYM_LOG);
}

function rebuildAchievementsFromLogs() {
  const today = todayStr();

  // Swim Achievements
  const swimLogs = LOG.filter(l => l.isSwimDay);
  const swimCount = swimLogs.length;
  const chronoSwim = [...swimLogs].reverse(); // oldest first

  SWIM_LOG = {
    count: swimCount,
    milestones: []
  };
  SWIM_MILESTONES.forEach(ms => {
    if (swimCount >= ms.count) {
      const matchedLog = chronoSwim[ms.count - 1];
      SWIM_LOG.milestones.push({
        count: ms.count,
        icon: ms.icon || '',
        title: ms.title,
        desc: ms.desc,
        date: matchedLog ? matchedLog.date : today
      });
    }
  });
  ls('fit_swim', SWIM_LOG);

  // Gym Achievements
  const gymLogs = LOG.filter(l => !l.isSwimDay && l.workout !== '轻量替代'); // 轻量替代是替代游泳的恢复日，不计入力量成就(与进度逻辑一致)
  const gymCount = gymLogs.length;
  const chronoGym = [...gymLogs].reverse(); // oldest first

  GYM_LOG = {
    count: gymCount,
    milestones: []
  };
  GYM_MILESTONES.forEach(ms => {
    if (gymCount >= ms.count) {
      const matchedLog = chronoGym[ms.count - 1];
      GYM_LOG.milestones.push({
        count: ms.count,
        icon: ms.icon || '',
        title: ms.title,
        desc: ms.desc,
        date: matchedLog ? matchedLog.date : today
      });
    }
  });
  ls('fit_gym_ach', GYM_LOG);
}

// ══ Plan Generator ═══════════════════════════════════════
// Derive how many exercises fit in session based on duration
function calcTotalExercises() {
  const sch = currentScheme();
  const warmup = 5, cooldown = 10;
  const available = S.dur - warmup - cooldown;
  const exTime = sch.timePerSet * (sch.sets[S.level] || 3) / 60; // minutes per exercise
  let baseTarget = Math.max(2, Math.min(10, Math.floor(available / exTime)));
  if (S.volumeMultiplier) baseTarget = Math.round(baseTarget * S.volumeMultiplier);
  return Math.max(1, baseTarget);
}

// 平衡 & 单腿稳定动作（「平衡稳定」重点用；不进常规肌群池，作为附加块）
const BALANCE_MOVES = [
  { n: '单腿站立', eq: ['无器材', '健身房全套'], muscle: ['踝稳定', '核心'], diff: 1, note: '单脚站立、另一脚抬离地面，收紧核心保持；进阶闭眼或站软垫', u: '秒', bi: true },
  { n: '单腿硬拉', eq: ['无器材', '哑铃', '健身房全套'], muscle: ['臀', '腘绳', '平衡'], diff: 2, note: '单腿微屈，髋向后铰链上身前倾、后腿伸直成一线，背平直，臀腿+平衡', bi: true },
  { n: '单腿臀桥', eq: ['无器材', '健身房全套'], muscle: ['臀', '骨盆稳定'], diff: 1, note: '仰卧屈一膝、另一腿伸直，顶髋至身体一线，骨盆保持水平不下掉', bi: true },
  { n: '燕式平衡', eq: ['无器材', '健身房全套'], muscle: ['臀', '平衡'], diff: 2, note: '单腿站、上身前倾对侧腿后抬与背成一线(飞机式)，双臂平展助平衡', u: '秒', bi: true },
];
function pickExercises(split, excluded) {
  const result = [], used = new Set();
  const sch = currentScheme();
  const sets = sch.sets[S.level], reps = sch.reps[S.level];
  const focusMap = FOCUS_MAP;
  const totalTarget = calcTotalExercises();
  // Budget: distribute exercises across groups proportionally, focus groups get +1
  const favGroups = S.focus.length ? S.focus.flatMap(f => focusMap[f] || []) : [];
  const groupBudget = {};
  const baseTotal = Object.values(split.pick).reduce((a, b) => a + b, 0);

  // Add smart warmups based on split groups
  const upperGroups = ['chest', 'back', 'shoulder', 'biceps', 'triceps'];
  const lowerGroups = ['quads', 'hamglutes', 'glutemed', 'calves'];
  const hasUpper = split.groups.some(g => upperGroups.includes(g));
  const hasLower = split.groups.some(g => lowerGroups.includes(g));
  const hasCore = split.groups.includes('core');

  const wPool = (DB.warmup || []).filter(ex => !used.has(ex.n) && !excluded.has(ex.n));
  const _shufW = a => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]} return b; };
  const wSpecific = _shufW(wPool.filter(e => {
    if (hasUpper && e.muscle.includes('上肢')) return true;
    if (hasLower && e.muscle.includes('下肢')) return true;
    if (hasCore && e.muscle.includes('核心')) return true;
    return false;
  }));
  const wSpecificNames = new Set(wSpecific.map(e => e.n));
  const wGlobal = _shufW(wPool.filter(e => e.muscle.includes('全身') && !wSpecificNames.has(e.n)));
  [...wSpecific.slice(0, 3), ...wGlobal].slice(0, 3).forEach(ex => {
    if (used.has(ex.n)) return; used.add(ex.n);
    result.push({ name: ex.n, sets: 1, reps: ex.warmupSec || 45, unit: '秒', note: ex.note, group: 'warmup', diff: ex.diff, isWarmup: true, bi: !!ex.bi, muscle: ex.muscle });
  });

  split.groups.forEach(g => {
    let cnt = split.pick[g] || 1;
    // Scale by duration ratio
    cnt = Math.round(cnt * (totalTarget / baseTotal));
    cnt = Math.max(1, cnt);
    // Focus groups get one extra exercise
    if (favGroups.includes(g)) cnt = cnt + 1;
    groupBudget[g] = cnt;
  });
  // 全局配额裁剪:各组保底≥1叠加后可能超出时长预算,按 totalTarget 削最大的组(修#8,保底每组≥1)
  { let _sum = Object.values(groupBudget).reduce((a, b) => a + b, 0), _guard = 0;
    while (_sum > totalTarget && _guard++ < 60) {
      let _mg = null, _mv = 1; for (const g in groupBudget) { if (groupBudget[g] > _mv) { _mv = groupBudget[g]; _mg = g; } }
      if (!_mg) break; groupBudget[_mg]--; _sum--;
    } }

  split.groups.forEach(grp => {
    const count = groupBudget[grp] || 0;
    if (!count) return;
    let pool = (DB[grp] || []).filter(ex => ex.eq.some(e => e === '无器材' || S.equip.includes(e)) && !used.has(ex.n) && !excluded.has(ex.n));
    if (S.periodMode) {
      const skipKeywords = ['深蹲', '硬拉', '臀推', '悬挂', '腹轮', '倒蹬', '哈克', '波比', '转体', '卷腹', '抬腿', '伐木'];
      const filtered = pool.filter(ex => !skipKeywords.some(k => ex.n.includes(k)));
      if (filtered.length > 0) pool = filtered;
    }
    // 臀腿塑形/曲线: core = 收紧不增厚, 排除增厚腰侧的动作
    if ((hasGoal('臀腿塑形') || hasGoal('女性曲线')) && grp === 'core') {
      const waistThicken = ['俄罗斯转体', '负重俄罗斯转体', '绳索伐木', '腹轮'];
      const thinCore = pool.filter(ex => !waistThicken.some(k => ex.n.includes(k)));
      if (thinCore.length > 0) pool = thinCore;
    }
    // Difficulty filter
    if (S.level === '初级') pool = pool.filter(ex => ex.diff <= 2);
    if (S.level === '高级') pool.sort((a, b) => b.diff - a.diff);// prefer harder
    else { for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]] } }
    // For focused groups, put compound moves first
    if (favGroups.includes(grp)) pool.sort((a, b) => (a.diff === b.diff ? 0 : b.diff - a.diff));
    // 曲线焦点补弱:掉队的那个点,它的动作在本组里先被挑走(owner)
    if (_ownerSession()) {
      const _wf = _weakFocusMoves();
      if (_wf.size) pool.sort((a, b) => (_wf.has(a.n) ? 0 : 1) - (_wf.has(b.n) ? 0 : 1));
    }
    // Owner session: private pool exercises float to the top —— 但臀腿主力肌群例外:
    // 「优先练出臀」时负重复合动作(臀推/硬拉/外展器械)不能被徒手地板动作挤掉名额,
    // 私有动作由后面的「额外动作收尾」块保底,不占主力名额。
    if (_ownerSession()) {
      const _ps = new Set(_PRIVATE_POOL);
      const _lowerMain = hasGoal('女性曲线') && ['hamglutes', 'glutemed', 'quads'].includes(grp);
      if (_lowerMain) {
        pool.sort((a, b) => (_ps.has(a.n) ? 1 : 0) - (_ps.has(b.n) ? 1 : 0));
        if (grp === 'hamglutes') {
          const _key = /臀推|硬拉/;
          pool.sort((a, b) => ((_key.test(a.n) && !_ps.has(a.n)) ? 0 : 1) - ((_key.test(b.n) && !_ps.has(b.n)) ? 0 : 1));
        }
      } else {
        pool.sort((a, b) => (_ps.has(a.n) ? 0 : 1) - (_ps.has(b.n) ? 0 : 1));
      }
    }
    pool.slice(0, count).forEach(ex => {
      used.add(ex.n);
      // ⚠ isTime 不能写成 !!ex.u:库里有 11 个动作显式写了 u:'次'(靠墙天使/龙旗/大踢腿…),
      // 那样会被当成计时动作、按 45 秒计时,和它们"做多少次"的描述对不上(反馈⑤)。
      const isCardio = grp === 'cardio', isTime = (ex.u === '秒' || ex.u === '分钟');
      const exSets = isCardio ? 1 : sets;
      // 计时类:动作自带 hold(描述里写明的保持时长)优先于按等级给的默认秒数,
      // 免得详情写「静躺 1-2 分钟」而计时只跑 30 秒(反馈⑤)
      const exReps = isCardio ? Math.max(sch.cardioMin, 10) : (isTime ? (ex.hold || (S.level === '初级' ? 30 : S.level === '中级' ? 45 : 60)) : reps);
      // Build coaching note combining technique + goal/level context
      // Show the real last recorded weight (W_HIST) instead of a fabricated %max —
      // app has no 1RM input, so the percentage was meaningless. No history → omit.
      const lastW = getLastWeight(ex.n, true) || getLastWeight(ex.n, false);
      const _gluteProg = hasGoal('女性曲线') && ['hamglutes', 'glutemed', 'quads'].includes(grp);
      const wHint = lastW
        ? (_gluteProg ? `（上次 ${lastW.weight}kg → 今天目标:同重多1次,或 +2.5kg）` : `（上次 ${lastW.weight}kg）`)
        : (_gluteProg ? '（记录今天的重量,下次给你渐进目标——臀围度=渐进负重×吃够）' : '');
      const coaching = (S.periodMode ? '经期温和模式 | ' : '') + `${ex.note} — ${sch.intensityNote[S.level]}${wHint}`;
      result.push({ name: ex.n, sets: exSets, reps: exReps, unit: isCardio ? '分钟' : (isTime ? '秒' : '次'), note: coaching, group: grp, diff: ex.diff, bi: !!ex.bi, muscle: ex.muscle });
    });
  });

  // Always append cardio finisher if not a pure cardio day
  if (!split.groups.includes('cardio') && S.dur >= 45) {
    let cPool = DB.cardio.filter(ex => !excluded.has(ex.n) && ex.eq.some(e => e === '无器材' || S.equip.includes(e)));
    if (S.periodMode) {
      cPool = cPool.filter(ex => !ex.n.includes('跳') && !ex.n.includes('波比') && !ex.n.includes('攀爬') && !ex.n.includes('单车'));
    }
    if (hasGoal('臀腿塑形') || hasGoal('翘臀美背') || hasGoal('女性曲线')) {
      const legCardio = cPool.filter(ex => ex.n.includes('攀爬') || ex.n.includes('骑行') || ex.n.includes('单车') || ex.n.includes('椭圆'));
      cPool = legCardio.length ? legCardio : cPool.filter(ex => !ex.n.includes('上肢功率'));
    }
    if (cPool.length) {
      const cEx = cPool[Math.floor(Math.random() * cPool.length)];
      const cardioNote = (hasGoal('臀腿塑形') || hasGoal('翘臀美背') || hasGoal('女性曲线')) ? '臀腿有氧收尾 — 优先攀爬机/骑行机，保持对下肢的刺激' : '薄肌有氧收尾 — 保持心率120-140';
      result.push({ name: cEx.n, sets: 1, reps: 15, unit: '分钟', note: cardioNote, group: 'cardio', diff: cEx.diff, muscle: cEx.muscle });
    }
  }

  // 额外动作收尾：owner session 时确保计划里有至少2个私有池动作
  if (_ownerSession()) {
    const _ps = new Set(_PRIVATE_POOL);
    const already = result.filter(e => _ps.has(e.name)).length;
    if (already < 2) {
      const pPool = Object.entries(DB).flatMap(([g, exs]) =>
        exs.filter(ex => _ps.has(ex.n) && ex.eq.some(e => e === '无器材' || S.equip.includes(e)) &&
                   !used.has(ex.n) && !excluded.has(ex.n) && (ex.diff || 2) <= _privMaxDiff())
          .map(ex => ({ ...ex, _g: g }))
      );
      for (let i = pPool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pPool[i], pPool[j]] = [pPool[j], pPool[i]]; }
      pPool.slice(0, 2 - already).forEach(ex => {
        used.add(ex.n);
        const isTime = (ex.u === '秒' || ex.u === '分钟');
        result.push({ name: ex.n, sets: 2, reps: isTime ? (ex.hold || 45) : 15, unit: isTime ? '秒' : '次', note: ex.note, group: ex._g, diff: ex.diff, bi: !!ex.bi, muscle: ex.muscle || [] });
      });
    }
  }

  // 曲线焦点补弱:掉队的那个点今天没排上就补一个(owner)。必须排在拉伸之前 ——
  // 它算主体动作,会参与器械聚类;放在拉伸之后会让主体动作被拉伸夹开。
  if (_ownerSession()) _appendWeakFocus(result, used, excluded, sets);

  // 上肢紧致（「上肢紧致」重点，且非上肢日）：轻量高次数塑形，紧致不增维度、不练宽度
  if (S.focus && S.focus.includes('上肢紧致') && !hasUpper) {
    const tone = ['绳索下压', '哑铃臂屈伸', '面拉', '反向飞鸟机', '俯身飞鸟', '坐姿划船', '锤式弯举'];
    let tp = tone.map(n => { for (const g of ['triceps', 'shoulder', 'back', 'biceps']) { const f = (DB[g] || []).find(e => e.n === n); if (f) return { ex: f, grp: g } } return null }).filter(o => o && o.ex.eq.some(e => e === '无器材' || S.equip.includes(e)) && !used.has(o.ex.n) && !excluded.has(o.ex.n));
    for (let i = tp.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[tp[i], tp[j]] = [tp[j], tp[i]] }
    tp.slice(0, 2).forEach(o => { used.add(o.ex.n); result.push({ name: o.ex.n, sets: Math.min(sets, 3), reps: 18, unit: '次', note: o.ex.note + ' — 轻塑形：高次数轻重量，紧致不增维度', group: o.grp, diff: o.ex.diff, bi: !!o.ex.bi, muscle: o.ex.muscle }) });
  }
  // 平衡 & 单腿稳定（「平衡稳定」重点）
  if (S.focus && S.focus.includes('平衡稳定')) {
    let bp = BALANCE_MOVES.filter(e => e.eq.some(q => q === '无器材' || S.equip.includes(q)) && !used.has(e.n) && !excluded.has(e.n));
    for (let i = bp.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[bp[i], bp[j]] = [bp[j], bp[i]] }
    bp.slice(0, 2).forEach(e => { used.add(e.n); result.push({ name: e.n, sets: 2, reps: e.u === '秒' ? (e.hold || 30) : 12, unit: e.u || '次', note: e.note, group: 'core', diff: e.diff, bi: !!e.bi, muscle: e.muscle }) });
  }
  // Add smart stretches
  const sPool = (DB.stretch || []).filter(ex => !used.has(ex.n) && !excluded.has(ex.n));
  const _shufS = a => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]} return b; };
  const sSpecific = _shufS(sPool.filter(e => {
    if (hasUpper && e.muscle.some(m => ['上肢','胸大肌','脊柱'].includes(m))) return true;
    if (hasLower && e.muscle.some(m => ['下肢','臀','髋屈肌','内收肌'].includes(m))) return true;
    if (hasCore && e.muscle.some(m => ['核心','脊柱'].includes(m))) return true;
    return false;
  }));
  const sSpecificNames = new Set(sSpecific.map(e => e.n));
  const sGlobal = _shufS(sPool.filter(e => e.muscle.includes('全身') && !sSpecificNames.has(e.n)));
  const _flex = S.focus && S.focus.includes('柔韧灵活'); // 柔韧重点 → 收尾多排几个拉伸/开髋动作
  const sTarget = _flex ? 7 : 4;
  [...sSpecific.slice(0, sTarget), ...sGlobal].slice(0, sTarget).forEach(ex => {
    if (used.has(ex.n)) return; used.add(ex.n);
    result.push({ name: ex.n, sets: 1, reps: ex.hold || 30, unit: '秒', note: ex.note, group: 'stretch', diff: ex.diff, isStretch: true, bi: !!ex.bi, muscle: ex.muscle });
  });

  // ── 肩颈放松附加模块(Cici 反馈:缓解肩颈僵硬疼痛;约5-8分钟,练完追加,不占主计划名额) ──
  if (hasGoal('翘臀美背')) {
    [
      { name: '面拉', sets: 2, reps: 15, unit: '次', note: '肩颈放松·拉向面部两侧并外旋，激活后束、改善圆肩' },
      { name: '俯卧YTW', sets: 2, reps: 10, unit: '次', note: '肩颈放松·手臂依次摆Y-T-W，激活下斜方让肩胛下沉' },
      { name: '靠墙天使', sets: 2, reps: 10, unit: '次', note: '肩颈放松·后背贴墙、手臂沿墙上下滑，全程肩胛贴墙下沉' },
      { name: '上斜方拉伸', sets: 1, reps: 30, unit: '秒', note: '肩颈放松·头侧倒向一侧、同侧手轻扶加深，两侧各30秒放松上斜方' },
      { name: '颈部环绕', sets: 1, reps: 30, unit: '秒', note: '肩颈放松·缓慢画圈转动颈部放松颈肌，切忌快速甩头' },
    ].forEach(n => {
      // 永久排除/限制同样管这几个(此前写死,做不了面拉的人排除了下次还会出现);库里有器材要求的按器材过滤
      if (used.has(n.name) || excluded.has(n.name)) return;
      let dbEx = null; for (const exs of Object.values(DB)) { const f = exs.find(e => e.n === n.name); if (f) { dbEx = f; break } }
      if (dbEx && dbEx.eq && !dbEx.eq.some(q => q === '无器材' || S.equip.includes(q))) return;
      used.add(n.name);
      result.push({ name: n.name, sets: n.sets, reps: n.reps, unit: n.unit, note: n.note, group: 'stretch', diff: 1, isStretch: true, bi: false, muscle: ['肩颈'] });
    });
  }

  // 仪态日课:混进收尾,每天轮换 2 个(owner)
  if (_ownerSession()) _appendPosture(result, used, excluded, 2);

  return _clusterByEquip(result); // 同器械的排在一起,少来回跑(反馈④)
}

// 补弱:近 4 周练得最少的两个曲线焦点,它们的动作在同肌群里优先被选中。
// (面板上写了"下次生成计划会往这边加",这就是兑现那句话的地方。)
function _weakFocusMoves() {
  try {
    const st = curveFocusStats(4);
    if (!st.some(f => f.sets > 0)) return new Set();   // 没数据不瞎补
    const weak = st.slice().sort((a, b) => a.pct - b.pct).slice(0, 2).map(f => f.key);
    const set = new Set();
    CURVE_FOCUS.filter(f => weak.includes(f.key)).forEach(f => f.moves.forEach(m => set.add(m)));
    return set;
  } catch (e) { return new Set(); }
}

// 最弱的那个焦点如果今天一个动作都没排上(比如胯宽的动作全在 glutemed 组,
// 而今天是臀腿日),就直接追加一个 —— 光靠"同组内提优先级"补不到跨组的缺口。
function _appendWeakFocus(result, used, excluded, sets) {
  try {
    const st = curveFocusStats(4);
    if (!st.some(f => f.sets > 0)) return;
    const weak = st.slice().sort((a, b) => a.pct - b.pct)[0];
    const focus = CURVE_FOCUS.find(f => f.key === weak.key);
    if (!focus || weak.pct >= 60) return;
    if (result.some(e => focus.moves.includes(e.name))) return;   // 今天已经练到了
    const cands = focus.moves.map(m => {
      for (const exs of Object.values(DB)) { const f = exs.find(e => e.n === m); if (f) return f }
      return null;
    }).filter(ex => ex && !used.has(ex.n) && !excluded.has(ex.n) &&
      ex.eq.some(q => q === '无器材' || S.equip.includes(q)) && (ex.diff || 1) <= (S.level === '初级' ? 2 : 3));
    if (!cands.length) return;
    const seed = parseInt(todayStr().replace(/-/g, ''), 10) || 0;
    const ex = cands[seed % cands.length];
    used.add(ex.n);
    const isTime = (ex.u === '秒' || ex.u === '分钟');
    result.push({
      name: ex.n, sets: Math.min(sets, 3), reps: isTime ? (ex.hold || 45) : 15, unit: isTime ? '秒' : '次',
      note: ex.note + ` — 补弱:近 4 周「${focus.name}」只练了 ${weak.sets}/${weak.target} 组,掉队了`,
      group: 'glutemed', diff: ex.diff, bi: !!ex.bi, muscle: ex.muscle || []
    });
  } catch (e) { }
}

// ══ 仪态日课(2026-08-27) ═══════════════════════════════════
// Cait 要的是"站着不动就好看"那部分:颈线、肩胛位置、骨盆位置、步态、踮立。
// 不另开模块 —— 按她的选择混进现有计划,排在收尾,不占主计划名额。
const POSTURE_POOL = [
  '靠墙站立体态检查（wall posture check）', '头顶书本走姿（poise walk）', '猫步走（catwalk）',
  '收下巴', '肩胛后缩保持', '靠墙天使', '骨盆前后倾（pelvic tilt）',
  '双腿relevé踮立保持', '单腿relevé踮立', '高跪姿开胸（kneeling chest opener）',
];
// 每天换着来:按日期轮转,不随机 —— 同一天重开 app 不会换掉已经练一半的
function _appendPosture(result, used, excluded, n) {
  const pool = POSTURE_POOL.filter(name => !used.has(name) && !excluded.has(name));
  if (!pool.length) return;
  const seed = parseInt(todayStr().replace(/-/g, ''), 10) || 0;
  const step = Math.max(1, Math.floor(pool.length / Math.max(1, n)));   // 两个动作在池子里隔开,别一次给两个踮立
  for (let i = 0; i < n && pool.length; i++) {
    const ex = (() => { for (const exs of Object.values(DB)) { const f = exs.find(e => e.n === pool[(seed + i * step) % pool.length]); if (f) return f } return null })();
    if (!ex || used.has(ex.n)) continue;
    used.add(ex.n);
    const isTime = (ex.u === '秒' || ex.u === '分钟');
    result.push({
      name: ex.n, sets: 1, reps: isTime ? (ex.hold || 45) : 12, unit: isTime ? '秒' : '次',
      note: '仪态 · ' + ex.note, group: 'posture', diff: ex.diff, isPosture: true, bi: !!ex.bi, muscle: ex.muscle
    });
  }
}

// ══ 曲线焦点(2026-08-27) ═══════════════════════════════════
// 把"练臀"拆成看得见的承重点:每个点有自己的动作簇、自己的周目标组数、
// 以及一条对应的围度指标。练了多少 / 尺寸往哪走,两条线并排看。
// 一个动作只归第一个匹配的焦点(顺序即优先级)。
const CURVE_FOCUS = [
  { key: 'hipw', name: '胯宽', why: '臀中肌/臀小肌把髋部往外撑——腰胯比里真正改得动的那个变量', metric: 'hipw', dir: 'up', weekly: 9,
    moves: ['器械外展机', '站姿绳索单腿外展', '弹力带螃蟹步', '弹力带蚌式开合', '侧卧抬腿', '消防栓式',
            '四足髋绕环（hip CARs）', '侧卧抬腿画圈', '驴踢腿（donkey kick）', '四足跪姿髋外展', '臀部激活蚌式'] },
  { key: 'peak', name: '臀峰', why: '臀大肌上束顶起峰型——侧面那条弧线', metric: 'hip', dir: 'up', weekly: 9,
    moves: ['臀推', '史密斯臀推', '肩胛垫高臀推', '蛙式臀桥', '蛙式臀冲', '臀桥', '臀桥开合', '臀桥保持',
            '跪姿挺髋（kneeling hip thrust）', '高跪姿挺髋保持（kneeling hip thrust hold）', '高跪姿夹枕挺髋保持',
            '绳索后踢腿', '俯卧挺髋抬腿', '跪姿后踢腿', '跪姿直腿后踢', '跪姿深蹲（kneeling squat）',
            '臀桥夹球保持', '蛙式臀桥保持（frog pump hold）', '臀推顶端外展保持', '壶铃摆动'] },
  { key: 'thigh', name: '大腿填充', why: '内收肌+股四把大腿填满,并拢时那条缝才有形状', metric: 'thigh', dir: 'up', weekly: 8,
    moves: ['器械内收机', '相扑深蹲', '哥萨克深蹲', '腿屈伸', '倒蹬机', '哈克深蹲', '钟摆深蹲',
            '高脚杯深蹲', '壶铃高脚杯深蹲', '保加利亚分腿蹲', '哑铃弓步蹲', '腿弯举', '坐姿腿弯举',
            '站姿单腿弯举机', '杠铃深蹲', '史密斯深蹲', '颈前杠铃深蹲', '相扑深蹲保持（sumo squat hold）',
            '罗马尼亚硬拉', '传统硬拉'] },
  { key: 'waist', name: '细腰', why: '腹横肌把腰收紧;绕开一切增厚腰侧的动作', metric: 'waist', dir: 'down', weekly: 6,
    moves: ['腹横肌真空吸', '平板支撑', '侧平板支撑', '死虫式', '死虫式保持（dead bug hold）',
            '死虫式（慢速对角）', '仰卧对角抬举（dead bug 变体）', '卷腹', '坐姿卷腹机',
            '仰卧直腿下放（leg lowering）', '悬挂抬腿', '罗马椅抬腿', '侧平板髋部下沉（side plank hip dip）'] },
  { key: 'back', name: '腰窝背沟', why: '竖脊+背阔撑出背面的层次,腰窝是收腰的视觉锚', metric: null, dir: null, weekly: 6,
    moves: ['山羊挺身', '坐姿划船', 'T把划船', '器械上背划船', '俯身划船', '哑铃单臂划船',
            '高位下拉', '引体向上', '助力引体向上机', '杠铃斜板划船', '弹力带划船', '绳索直臂下压', '直臂下压机'] },
  { key: 'line', name: '颈线肩线', why: '肩胛下沉+颈椎中立——脖子显长、锁骨露出来', metric: null, dir: null, weekly: 5,
    moves: ['面拉', '俯卧YTW', '靠墙天使', '肩胛后缩保持', '收下巴', '颈深屈肌保持（chin tuck hold）',
            '反向飞鸟机', '俯身飞鸟', '靠墙站立体态检查（wall posture check）', '高跪姿开胸（kneeling chest opener）'] },
  { key: 'ankle', name: '脚踝小腿', why: '踮立与提踵——高跟站得住,脚背绷出线条', metric: 'ankle', dir: null, weekly: 4,
    moves: ['站姿提踵', '坐姿提踵', '史密斯提踵', '腿举机提踵', '单腿relevé踮立', '双腿relevé踮立保持',
            '头顶书本走姿（poise walk）', '猫步走（catwalk）'] },
];
// 近 N 周:每个焦点练了多少组(只算打了勾的),以及对应围度往哪个方向走了
function curveFocusStats(weeks = 4) {
  const since = addDays(todayStr(), -7 * weeks);
  const idx = {};
  CURVE_FOCUS.forEach(f => f.moves.forEach(m => { if (!idx[m]) idx[m] = f.key }));
  const sets = {}; CURVE_FOCUS.forEach(f => sets[f.key] = 0);
  (typeof LOG !== 'undefined' ? LOG : []).forEach(l => {
    if (!l || l.date < since) return;
    (l.exercises || []).forEach(e => {
      if (!e || e.done === false) return;
      const k = idx[e.name]; if (!k) return;
      sets[k] += (e.sets || 1);
    });
  });
  return CURVE_FOCUS.map(f => {
    const target = f.weekly * weeks;
    let trend = null, from = null, to = null;
    if (f.metric && typeof BODY_LOG !== 'undefined') {
      const pts = BODY_LOG.filter(x => x.date >= since && x[f.metric] != null);
      if (pts.length >= 2) {
        from = pts[0][f.metric]; to = pts[pts.length - 1][f.metric];
        trend = Math.round((to - from) * 10) / 10;
      }
    }
    return { key: f.key, name: f.name, why: f.why, metric: f.metric, dir: f.dir,
             sets: sets[f.key], target, pct: Math.min(100, Math.round(sets[f.key] / target * 100)), trend, from, to };
  });
}

// ══ 同器械聚类(2026-08-26 反馈④) ═══════════════════════════
// 计划本来按肌群顺序排,同一台机器/同一个区的动作被拆到计划的三个地方,
// 练一次要在龙门架↔杠铃区↔器械区之间来回跑。这里把主体动作按"去哪儿练"聚成块。
// 两条保险:①只重排主体动作,热身/拉伸/有氧/游泳原位不动;
//         ②只在同一大区(上肢/下肢/核心)内部聚类,免得二头弯举被拉到腿前面。
// 顺序即优先级:先判专机,再判自由重量,兜底徒手。('史密斯提踵'要先归史密斯机,
// 不能被后面的"提踵→固定器械"截走,所以顺序不能随便调。)
const EQUIP_ZONES = [
  [/史密斯/, '史密斯机'],
  [/绳索|龙门|面拉|伐木|直臂下压/, '龙门架/绳索'],
  [/弹力带/, '弹力带'],
  [/引体向上|双杠|悬挂|罗马椅|龙旗|L撑|肩胛引体/, '单杠/双杠架'],
  [/器械|机|倒蹬|哈克|钟摆|腿屈伸|腿弯举|高位下拉|坐姿划船|提踵|助力/, '固定器械'],
  [/哑铃|壶铃/, '哑铃区'],
  [/杠铃|硬拉|臀推|划船|山羊挺身|窄距/, '杠铃区'],
];
// 名字里看不出器械、但实际就是拿哑铃做的动作,显式钉住(否则会被当徒手排到垫子上)
const EQUIP_OVERRIDE = {
  '侧平举': '哑铃区', '俯身飞鸟': '哑铃区', '集中弯举': '哑铃区', '锤式弯举': '哑铃区',
  '仰卧臂屈伸': '哑铃区', '负重俄罗斯转体': '哑铃区', '俯卧YTW': '哑铃区',
  '保加利亚分腿蹲': '哑铃区', '高脚杯深蹲': '哑铃区', '相扑深蹲': '哑铃区', '哥萨克深蹲': '哑铃区',
};
function equipZone(name) {
  if (!name) return '垫上/徒手';
  if (EQUIP_OVERRIDE[name]) return EQUIP_OVERRIDE[name];
  for (const [re, zone] of EQUIP_ZONES) if (re.test(name)) return zone;
  return '垫上/徒手';
}
function _clusterByEquip(exs) {
  const isMain = e => e && !e.isWarmup && !e.isStretch && !e.isPosture && e.group !== 'cardio' && e.group !== 'swimming';
  const slots = exs.map((e, i) => i).filter(i => isMain(exs[i]));
  if (slots.length < 3) return exs;
  const UPPER = ['chest', 'shoulder', 'back', 'biceps', 'triceps'];
  const LOWER = ['quads', 'glutemed', 'hamglutes', 'calves'];
  const zoneOf = g => UPPER.includes(g) ? 'upper' : LOWER.includes(g) ? 'lower' : 'other';
  const bodyRank = {}, equipRank = {};
  slots.forEach(i => {
    const b = zoneOf(exs[i].group);
    if (!(b in bodyRank)) bodyRank[b] = Object.keys(bodyRank).length;
    const k = b + '|' + equipZone(exs[i].name);
    if (!(k in equipRank)) equipRank[k] = Object.keys(equipRank).length;
  });
  const key = i => [bodyRank[zoneOf(exs[i].group)], equipRank[zoneOf(exs[i].group) + '|' + equipZone(exs[i].name)], i];
  const ordered = slots.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    return (ka[0] - kb[0]) || (ka[1] - kb[1]) || (ka[2] - kb[2]);
  });
  const out = exs.slice();
  slots.forEach((pos, k) => { out[pos] = exs[ordered[k]]; });
  return out;
}

// ══ Calendar helpers (local timezone) ═══════════════════
function _pad(n) { return String(n).padStart(2, '0') }
let _mockDate = sessionStorage.getItem('__dev_mock_date__') || null;
function todayStr() { const d = _mockDate ? new Date(_mockDate) : new Date(); return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}` }
function dateStr(d) { return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}` }
function addDays(base, n) { const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + n); return dateStr(d) }
function dayDiff(a, b) { const da = new Date(a + 'T12:00:00'); const db = new Date(b + 'T12:00:00'); return Math.round((db - da) / (24 * 60 * 60 * 1000)) }
function fmtDate(ds) { const d = new Date(ds + 'T12:00:00'); return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] + '·' + (d.getMonth() + 1) + '/' + (d.getDate()) }

// ══ Lock check ══════════════════════════════════════════
function isLocked(day) {
  // Today is NEVER locked — you should always be able to edit today's workout
  if (day.date === todayStr()) return false;
  // If it is a future date, it's not locked
  if (day.date > todayStr()) return false;
  // Only past dates can be locked
  if (!S.unlockedDates) S.unlockedDates = [];
  if (S.unlockedDates.includes(day.date)) return false;
  return true;
}

// ══ Weight Tracking ═════════════════════════════════════
function getWeight(date, ei) {
  if (!S.weights) S.weights = {};
  return S.weights[date + '-' + ei] || null;
}
function setWeight(date, ei, val) {
  if (!S.weights) S.weights = {};
  S.weights[date + '-' + ei] = val;
  // PR check
  if (val > 0) {
    const sel = S.plan?.days?.find(d => d.date === date);
    if (sel && sel.exercises[ei]) {
      const exName = sel.exercises[ei].name;
      const hist = W_HIST[exName];
      const ws = (hist && hist.length) ? hist.map(h => h.weight).filter(w => w > 0) : [];
      // 助力器械越重越省力:助力配重比以往都小才算新纪录
      const assisted = isAssistedMove(exName);
      const maxPrev = ws.length ? (assisted ? Math.min(...ws) : Math.max(...ws)) : 0;
      // Dedupe per (date,exercise): editing the weight field mustn't push a new PR + toast on
      // every keystroke. maxPrev excludes today (W_HIST is written at check-in), so update an
      // existing same-day PR in place, and retract it if the value drops back to/below old best.
      const prIdx = PR_LIST.findIndex(p => p.date === date && p.exercise === exName);
      if (maxPrev > 0 && (assisted ? val < maxPrev : val > maxPrev)) {
        if (prIdx >= 0) { PR_LIST[prIdx].weight = val; PR_LIST[prIdx].prev = maxPrev; }
        else { showToast(assisted ? `${exName} 新纪录！助力降到 ${val}kg` : `${exName} 新纪录！${val}kg`); PR_LIST.unshift({ date, exercise: exName, weight: val, prev: maxPrev }); if (PR_LIST.length > 50) PR_LIST = PR_LIST.slice(0, 50); }
        ls(K.pr, PR_LIST);
      } else if (prIdx >= 0) { PR_LIST.splice(prIdx, 1); ls(K.pr, PR_LIST); }
    }
  }
  saveState();
}
function getLastWeight(exName, excludePeriod = false) {
  const hist = W_HIST[exName];
  if (!hist || !hist.length) return null;
  if (excludePeriod) {
    for (let i = hist.length - 1; i >= 0; i--) {
      if (!hist[i].period) return hist[i];
    }
    return null; // 全是经期记录 → 返回null,让上层用默认而非经期减载值(修#10)
  }
  return hist[hist.length - 1];
}

// ══ Weight Rounding by Equipment Type ═══════════════════
function _isDumbbell(n) { return n.includes('哑铃') || n.includes('壶铃') }
function _isBarbell(n) {
  if (n.includes('杠铃') || n.includes('史密斯')) return true;
  if (!n.includes('硬拉')) return false;
  if (_isDumbbell(n) || n.includes('单腿') || n.includes('单臂') || n.includes('徒手')) return false;
  const ex = (() => { for (const exs of Object.values(DB)) { const f = exs.find(e => e.n === n); if (f) return f } return null })();
  if (ex && ex.eq && ex.eq.length && ex.eq.every(e => e === '无器材' || e === '哑铃' || e === '壶铃')) return false;
  return true;
}
function roundWeight(w, exName) {
  if (isAssistedMove(exName)) return Math.round(w / 5) * 5; // 助力器械配重片按 5kg 一档,建议值得是能插上的数
  if (_isBarbell(exName)) return Math.round(w / 2.5) * 2.5; // 杠铃: 2.5kg倍数
  return Math.round(w); // 哑铃/壶铃/器械/绳索: 整数kg
}
// 逐动作 RPE(感受):按 date-ei 存;打卡时优先于"整场RPE"记进 W_HIST,让自动调重更准
function getExRpe(date, ei) { if (!S.exRpe) S.exRpe = {}; const v = S.exRpe[date + '-' + ei]; return (v === undefined || v === null) ? null : v; }
function setExRpe(date, ei, val) { if (!S.exRpe) S.exRpe = {}; S.exRpe[date + '-' + ei] = val; if (typeof saveState === 'function') saveState(); if (typeof render === 'function') render(); }
function getWeightStep(exName) {
  if (isAssistedMove(exName)) return 5;
  if (_isBarbell(exName)) return 2.5;
  return 1;
}

// Default weight recommendation based on exercise type + difficulty level
function getDefaultWeight(exName) {
  const n = exName;
  const wl = S.weightLevel || '初级';   // 重量档独立于水平(动作难度),默认保守
  // 助力器械填的是助力:初学给多一点助力(按器械 kg 刻度的大致起点,照实改成你选的配重片)
  if (isAssistedMove(n)) return ({ 初级: 30, 中级: 20, 高级: 10 })[wl] || 30;

  // ── Equipment detection (name + DB fallback) ──
  const _dbEx = (() => { for (const exs of Object.values(DB)) { const f = exs.find(e => e.n === n); if (f) return f } return null })();
  const isDumbbell = n.includes('哑铃') || n.includes('壶铃') || n.includes('高脚杯') || (_dbEx && _dbEx.eq.some(e => e === '哑铃' || e === '壶铃'));
  const isCable = n.includes('绳索') || n.includes('缆绳');
  // 硬拉≠杠铃:哑铃/单腿/徒手的硬拉不按杠铃给重量(修_isBarbell仅凭名字含"硬拉"就判杠铃、塞15kg起始的误判)
  const isBarbell = n.includes('杠铃') || n.includes('史密斯') || (n.includes('硬拉') && !isDumbbell && !isCable && !n.includes('单腿') && !n.includes('单臂') && !n.includes('徒手') && !(_dbEx && _dbEx.eq.length && _dbEx.eq.every(e => e === '无器材')));

  // ── Movement category detection ──
  // 下肢复合 (Squat/Deadlift/Leg Press/Hip Thrust)
  const isLegCompound = n.includes('深蹲') || n.includes('硬拉') || n.includes('臀推') || n.includes('腿举') || n.includes('提踵');
  // 上肢推 (Bench Press — 卧推类)
  const isUpperPush = n.includes('卧推');
  // 过头推 (Overhead Press — 推举/肩推, 比卧推轻)
  const isOverhead = n.includes('推举') || n.includes('肩推');
  // 上肢拉 (Row/Pulldown)
  const isUpperPull = n.includes('划船') || n.includes('引体') || n.includes('下拉') || n.includes('直立划船');
  // 小肌群孤立 (Curl/Extension/Lateral Raise)
  const isIsolation = n.includes('弯举') || n.includes('臂屈伸') || n.includes('侧平举') || n.includes('前平举') || n.includes('飞鸟') || n.includes('夹胸') || n.includes('外展') || n.includes('内收') || n.includes('画腿') || n.includes('侧抬') || n.includes('后踢') || n.includes('踢腿') || n.includes('绕环') || n.includes('平衡') || n.includes('开合');
  // 其他腿部/臀部
  const isLeg = isLegCompound || n.includes('腿') || n.includes('臀') || n.includes('股') || n.includes('弓步');

  // ── 杠铃/史密斯: 按动作类型 × 等级 ──
  if (isBarbell) {
    // 基础值: 标准杠=20kg空杆, EZ杆/短杆=10kg
    const bases = {
      legCompound: { 初级: 15, 中级: 25, 高级: 35 },  // 深蹲/硬拉/臀推: 15kg起 (可用女子杆/固定杠铃)
      upperPush: { 初级: 12.5, 中级: 20, 高级: 30 },  // 卧推: 12.5kg起 (可用轻量固定杠铃)
      overhead: { 初级: 7.5, 中级: 12.5, 高级: 20 },  // 推举/肩推: 7.5kg起 (可用曲柄杆/轻量固定杠铃)
      upperPull: { 初级: 10, 中级: 15, 高级: 25 },  // 划船/直立划船: 10kg起
      isolation: { 初级: 5, 中级: 10, 高级: 15 },  // 弯举: EZ杆/轻固定杆5kg起
      other: { 初级: 10, 中级: 15, 高级: 25 }   // 兜底
    };
    let cat = 'other';
    if (isLegCompound) cat = 'legCompound';
    else if (isUpperPush) cat = 'upperPush';
    else if (isOverhead) cat = 'overhead';
    else if (isUpperPull) cat = 'upperPull';
    else if (isIsolation) cat = 'isolation';
    return roundWeight(bases[cat][wl] || bases[cat]['初级'], n);
  }

  // ── 哑铃/壶铃: 整数kg, 按肌群大小微调 ──
  if (isDumbbell) {
    const dbases = { 初级: 2, 中级: 5, 高级: 8 };
    let w = dbases[wl] || 2;
    if (isIsolation) w = Math.max(1, Math.round(w * 0.6));
    else if (isLegCompound) w = Math.round(w * 1.5);
    return roundWeight(w, n);
  }

  // ── 绳索: 整数kg ──
  if (isCable) {
    const cbases = { 初级: 5, 中级: 10, 高级: 15 };
    let w = cbases[wl] || 5;
    if (isIsolation) w = Math.max(2, Math.round(w * 0.7));
    else if (isLegCompound) w = Math.round(w * 1.5);
    return roundWeight(w, n);
  }

  // ── 器械 (坐姿推胸机/腿屈伸/etc): 整数kg ──
  const mbases = { 初级: 5, 中级: 10, 高级: 15 };
  let w = mbases[wl] || 5;
  if (isIsolation) w = Math.max(2, Math.round(w * 0.7));
  else if (isLegCompound) w = Math.round(w * 1.5);
  return roundWeight(w, n);
}

// Estimated 1RM (Epley) from real W_HIST sets that recorded reps — gives genuine strength
// guidance to replace the removed fabricated %max. Returns null until there's rep-tagged history.
function estimate1RM(exName) {
  if (isAssistedMove(exName)) return null; // 助力配重算不出 1RM
  const h = (W_HIST[exName] || []).filter(x => x.weight > 0 && x.reps > 0);
  if (!h.length) return null;
  let best = 0; h.slice(-12).forEach(x => { const r = Math.min(x.reps, 15); const e = x.weight * (1 + r / 30); if (e > best) best = e; });
  return best > 0 ? Math.round(best * 10) / 10 : null;
}
function weightForReps(oneRM, reps) { return oneRM ? Math.round(oneRM / (1 + reps / 30)) : null; }
function suggestWeight(exName) {
  let target;
  const last = getLastWeight(exName, true); // Get last non-period weight
  const ai = S.aiWeights && S.aiWeights[exName]; // AI 复盘采纳的目标重量：在下一次真练这个动作之前有效
  if (ai && ai.kg > 0 && (!last || !last.date || last.date < ai.date)) {
    target = ai.kg;
  } else if (!last) {
    target = getDefaultWeight(exName); // 无非经期历史(含全经期)→ 用默认起始,不从经期减载值递进(修#10)
  } else {
    const w = last.weight, rpe = last.rpe || 6;
    const step = getWeightStep(exName);
    if (isAssistedMove(exName)) {
      // 助力器械反过来:轻松 → 减助力,吃力 → 加助力
      if (rpe <= 4) target = Math.max(0, roundWeight(w - step * 2, exName));
      else if (rpe <= 6) target = Math.max(0, roundWeight(w - step, exName));
      else if (rpe <= 8) target = w;
      else target = roundWeight(w + step, exName);
    } else {
      // RPE-based progression
      if (rpe <= 4) target = roundWeight(w + step * 2, exName); // Too easy → +2 steps
      else if (rpe <= 6) target = roundWeight(w + step, exName);   // Moderate → +1 step
      else if (rpe <= 8) target = w;                              // Good → same weight
      else target = Math.max(step, roundWeight(w - step, exName)); // Hard/max → -1 step
    }
  }
  if (S.periodMode) {
    const step = getWeightStep(exName);
    // 经期减载:普通动作减重量;助力器械是加助力
    target = isAssistedMove(exName) ? roundWeight(target * 1.25, exName) : Math.max(step, roundWeight(target * 0.75, exName));
  }
  return target;
}
// ══ Swimming Plan Generator ═════════════════════════════
// 泳日:水中训练约占 65%,其余留给桑拿/热水池恢复。水中动作最少要 25 分钟
// (热身5 + 技术/主项≥15 + 放松5),所以下限取 25 —— 恢复模块和泳池计划共用这一个公式
function _swimMinutes(totalMins) { return Math.max(25, Math.round((totalMins || 60) * 0.65)); }
function pickSwimExercises() {
  const level = S.swimLevel || '入门';
  const excluded = getExcluded();
  const maxDiff = level === '入门' ? 1 : level === '进阶' ? 2 : 3;
  const pool = (DB.swimming || []).filter(ex => ex.diff <= maxDiff && !excluded.has(ex.n));
  const result = [];
  
  // Proportional time allocation: ~65% for water drills, 35% reserved for thermal recovery
  const totalMins = S.dur || 60;
  const swimMins = _swimMinutes(totalMins);
  const remMins = Math.max(15, swimMins - 10); // reserve 5m warmup + 5m cooldown
  
  const phaseTimes = {
    warmup: 5,
    tech: Math.round(remMins * 0.6),
    main: Math.round(remMins * 0.4),
    cooldown: 5
  };
  
  const phases = ['warmup', 'tech', 'main', 'cooldown'];
  const _sps = _ownerSession() ? new Set(_PRIVATE_POOL) : null;
  const _ownerPool = !!_sps;

  phases.forEach(phase => {
    if (_ownerPool && phase === 'main') return; // no lap swimming for owner
    const pExs = pool.filter(ex => ex.swimPhase === phase);
    for (let i = pExs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pExs[i], pExs[j]] = [pExs[j], pExs[i]] }
    if (_sps && phase === 'tech') pExs.sort((a, b) => (_sps.has(a.n) ? 0 : 1) - (_sps.has(b.n) ? 0 : 1));
    const pick = phase === 'warmup' ? 1 : phase === 'cooldown' ? 1 : phase === 'tech' ? Math.min(pExs.length, _ownerPool ? 6 : (level === '入门' ? 4 : 3)) : Math.min(pExs.length, 2);
    const totalTime = phaseTimes[phase] || 10;
    pExs.slice(0, pick).forEach((ex, i) => {
      const mins = Math.max(3, Math.round(totalTime / pick));
      result.push({ name: ex.n, sets: 1, reps: mins, unit: '分钟', note: ex.note, group: 'swimming', diff: ex.diff, isWarmup: phase === 'warmup', isStretch: phase === 'cooldown', bi: false, swimPhase: phase });
    });
  });
  return result;
}

// ══ Plan Generator (calendar) ═══════════════════════════

// Scientific ratio: strength-primary + swim cross-training
// (strength is always >= swim, because user's goal is 女性薄肌)
const SWIM_SPLIT = {
  2: { gym: 1, swim: 1 },
  3: { gym: 2, swim: 1 },
  4: { gym: 3, swim: 1 },
  5: { gym: 3, swim: 2 },
  6: { gym: 4, swim: 2 },
  7: { gym: 4, swim: 3 },
};

// Weekly patterns: G=gym, S=swim, R=rest
// Principles: alternate gym/swim when possible, avoid swim right after upper body day
const COMBO_PATTERNS = {
  '1+1': ['G', 'R', 'R', 'S', 'R', 'R', 'R'],
  '2+1': ['G', 'R', 'S', 'R', 'G', 'R', 'R'],
  '3+1': ['G', 'S', 'R', 'G', 'R', 'G', 'R'],
  '2+2': ['G', 'S', 'R', 'G', 'S', 'R', 'R'],
  '3+2': ['G', 'S', 'G', 'R', 'G', 'S', 'R'],
  '4+2': ['G', 'G', 'S', 'G', 'G', 'S', 'R'],
  '4+3': ['G', 'S', 'G', 'S', 'G', 'S', 'G'],
};

// ── Period mode: gentle land-based alternative to swim ──
function pickPeriodAlternative() {
  const excluded = getExcluded();
  const _equipOk = ex => !ex.eq || ex.eq.some(q => q === '无器材' || S.equip.includes(q)); // 按用户装备过滤,别开出没有的器械
  const corePool = (DB.core || []).filter(ex => ex.diff <= 1 && !excluded.has(ex.n) && _equipOk(ex) && !ex.n.includes('转体') && !ex.n.includes('卷腹') && !ex.n.includes('抬腿') && !ex.n.includes('伐木'));
  const cardioPool = (DB.cardio || []).filter(ex => ex.diff <= 1 && !excluded.has(ex.n) && _equipOk(ex) && !ex.n.includes('跳') && !ex.n.includes('波比'));
  const exercises = [];
  // 1. Warm-up: light cardio 10min
  const warmup = cardioPool.find(ex => ex.n.includes('椭圆') || ex.n.includes('骑行') || ex.n.includes('慢跑')) || cardioPool[0];
  if (warmup) exercises.push({ name: warmup.n, sets: 1, reps: 10, unit: '分钟', note: warmup.note + ' — 保持轻松心率', group: 'cardio', diff: 1, isWarmup: true, bi: false });
  // 2. Core: 2-3 gentle core exercises
  for (let i = corePool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[corePool[i], corePool[j]] = [corePool[j], corePool[i]]; }
  corePool.slice(0, 3).forEach(ex => {
    exercises.push({ name: ex.n, sets: 3, reps: _repsFor(ex, { sec: 30, reps: 12 }), unit: ex.u || '次', note: ex.note, group: 'core', diff: 1, isWarmup: false, bi: ex.bi || false });
  });
  // 3. Cool-down stretch 5min
  exercises.push({ name: '全身拉伸放松', sets: 1, reps: 5, unit: '分钟', note: '针对下背、髋屈肌和腿后侧进行缓慢拉伸', group: 'cardio', diff: 1, isStretch: true, bi: false });
  return exercises;
}

const _PRIV_MUSCLE_MAP = {
  hamglutes: ['臀', '臀大肌', '盆底肌', '内收肌', '髋外旋', '髋屈肌'],
  quads:     ['股四头', '下肢', '内收肌', '髋屈肌'],
  core:      ['核心', '骨盆控制', '脊柱', '腹斜'],
  chest:     ['胸大肌', '上肢'],
  back:      ['上肢'],
  shoulder:  ['上肢'],
  stretch:   ['下肢', '全身', '核心'],
};
function pickPrivateForSplit(split, excluded, usedSet) {
  const relevantMuscles = new Set();
  (split.groups || []).forEach(g => (_PRIV_MUSCLE_MAP[g] || []).forEach(m => relevantMuscles.add(m)));
  const ps = new Set(_PRIVATE_POOL);
  const pool = [];
  Object.entries(DB).forEach(([, exs]) => {
    exs.forEach(ex => {
      if (ps.has(ex.n) && !excluded.has(ex.n) && !usedSet.has(ex.n) &&
          ex.eq.some(e => e === '无器材' || S.equip.includes(e)) &&
          (ex.muscle || []).some(m => relevantMuscles.has(m)))
        pool.push(ex);
    });
  });
  // 难度上限跟训练等级走,不跟深度分走——深度分只在身体准备度允许的范围内排偏好
  const _cap = _privMaxDiff();
  const _fit = pool.filter(ex => (ex.diff || 2) <= _cap);
  if (_fit.length >= 2) { pool.length = 0; pool.push(..._fit); }
  const depthScore = _xDepthScore();
  pool.sort((a, b) => {
    const da = a.diff || 2, db2 = b.diff || 2;
    if (depthScore >= 2.5) return db2 - da;
    if (depthScore <= 1.5) return da - db2;
    return Math.random() - 0.5;
  });
  return pool.slice(0, 2).map(ex => {
    usedSet.add(ex.n);
    return { name: ex.n, sets: 2, reps: _repsFor(ex, { sec: 45, min: 15, reps: 15 }), unit: ex.u || '次',
             note: ex.note, diff: ex.diff, bi: !!ex.bi, muscle: ex.muscle || [] };
  });
}

function genPlan(isRecalibrate = false, preserveFuture = false, keepEdited = false) {
  _skipAutoRegen = false; // Reset so future auto-regen can trigger
  const hasPool = S.equip.includes('泳池');
  const excluded = getExcluded();
  const today = todayStr();

  // Determine gym vs swim day counts
  let gymPerWeek = S.days, swimPerWeek = 0;
  if (hasPool) {
    const sp = SWIM_SPLIT[S.days] || { gym: Math.max(2, S.days - 1), swim: 1 };
    gymPerWeek = sp.gym; swimPerWeek = sp.swim;
  }

  // Select the correct split template based on GYM days (not total)
  // 臀腿塑形 uses dedicated lower-body-only splits
  const splits = hasGoal('女性曲线') ? (CURVE_SPLITS[gymPerWeek] || CURVE_SPLITS[3]) :
hasGoal('翘臀美背') ? (GLUTE_BACK_SPLITS[gymPerWeek] || GLUTE_BACK_SPLITS[3]) :
        isCombinedGoal() ? (COMBINED_SPLITS[gymPerWeek] || COMBINED_SPLITS[3]) :
          (hasGoal('臀腿塑形') ? (GLUTE_SPLITS[gymPerWeek] || GLUTE_SPLITS[3]) : (SPLITS[gymPerWeek] || SPLITS[3]));

  // Build weekly pattern
  let pattern;
  if (hasPool) {
    const key = gymPerWeek + '+' + swimPerWeek;
    pattern = (COMBO_PATTERNS[key] || COMBO_PATTERNS['3+2']).map(c => c === 'G' ? 1 : c === 'S' ? 2 : 0);
  } else {
    const gymPatterns = {
      2: [1, 0, 0, 1, 0, 0, 0],
      3: [1, 0, 1, 0, 1, 0, 0],
      4: [1, 1, 0, 1, 1, 0, 0],
      5: [1, 1, 1, 0, 1, 1, 0],
      6: [1, 1, 1, 1, 1, 1, 0],
      7: [1, 1, 1, 1, 1, 1, 1]
    };
    pattern = gymPatterns[S.days] || gymPatterns[3];
  }

  // If recalibrating, keep the original start date to preserve the calendar view.
  // Otherwise, start a fresh 14-day cycle from today.
  const startDate = (isRecalibrate && S.plan && S.plan.days.length > 0) ? S.plan.days[0].date : today;

  const days = [];

  // Determine which days to preserve exactly as they were
  const preserve = {};
  if (S.plan) {
    for (let d of S.plan.days) {
      const hasProgress = (d.date === today && Object.values(S.prog[today] || {}).some(Boolean));
      if (!isRecalibrate) {
        if (isLocked(d) || hasProgress) preserve[d.date] = d; // 今天练了一半不动(否则勾选/重量会按下标错挂到新动作上)
      } else {
        if (d.date < today || hasProgress || isLocked(d) || (preserveFuture && d.date > today) || (keepEdited && (d._ai || d._edited) && d.date > today)) preserve[d.date] = d;
      }
    }
  }

  // Determine start split index based on the last workout done or preserved
  let startSplitIdx = 0;
  let lastGymWorkoutType = null;

  if (isRecalibrate && S.plan) {
    const sortedPreserved = Object.values(preserve).sort((a, b) => a.date.localeCompare(b.date));
    for (let j = sortedPreserved.length - 1; j >= 0; j--) {
      const d = sortedPreserved[j];
      if (!d.isRest && !d.isSwimDay && !d.isPrivateDay && d.workoutType !== '轻量替代' && isDone(d)) {
        lastGymWorkoutType = d.workoutType;
        break;
      }
    }
  }
  if (!lastGymWorkoutType && LOG.length > 0) {
    const lastLog = LOG.slice().reverse().find(l => !l.isSwimDay && l.workout !== '休息' && l.workout !== '游泳训练' && l.workout !== '轻量替代');
    if (lastLog) {
      lastGymWorkoutType = lastLog.workout;
    }
  }
  if (lastGymWorkoutType) {
    const idx = splits.findIndex(s => s.type === lastGymWorkoutType);
    if (idx !== -1) {
      startSplitIdx = (idx + 1) % splits.length;
    } else {
      const idxSub = splits.findIndex(s => s.type.includes(lastGymWorkoutType) || lastGymWorkoutType.includes(s.type.slice(0, 4)));
      if (idxSub !== -1) {
        startSplitIdx = (idxSub + 1) % splits.length;
      }
    }
  }

  let generatedGymCount = 0;
  const _usedPrivate = new Set();

  for (let i = 0; i < 14; i++) {
    const ds = addDays(startDate, i);
    if (preserve[ds]) {
      days.push(preserve[ds]);
      continue;
    }

    const dObj = new Date(ds + 'T12:00:00');
    const dow = (dObj.getDay() + 6) % 7; // 0=Mon, 6=Sun
    const dayType = pattern[dow]; // 0=rest, 1=gym, 2=swim

    if (dayType === 1) {
      // Gym day
      const split = splits[(startSplitIdx + generatedGymCount) % splits.length];
      generatedGymCount++;
      const exs = pickExercises(split, excluded);
      if (_ownerSession()) {
        pickPrivateForSplit(split, excluded, _usedPrivate).forEach(e => exs.push(e));
      }
      days.push({ date: ds, isRest: false, workoutType: split.type, duration: S.dur, exercises: exs, _splitGroups: split.groups || [] });
    } else if (dayType === 2) {
      // Swim day (or period alternative)
      if (S.periodMode) {
        days.push({ date: ds, isRest: false, isSwimDay: false, workoutType: '轻量替代', duration: 40, exercises: pickPeriodAlternative() });
      } else {
        days.push({ date: ds, isRest: false, isSwimDay: true, workoutType: '游泳训练', duration: S.dur, exercises: pickSwimExercises() });
      }
    } else {
      days.push({ date: ds, isRest: true, workoutType: '休息', duration: 0, exercises: [] });
    }
  }


  const sch = currentScheme();
  const isSwimPlan = hasPool && swimPerWeek > 0;
  let tipText = TIPS[currentGoalKey()] || TIPS['女性薄肌'];
  if (isSwimPlan) {
    tipText += `\n游泳水平：${SWIM_TIPS[S.swimLevel || '入门']}\n本周安排：${gymPerWeek}天力量 + ${swimPerWeek}天游泳`;
  }
  // 新生成的日子：清掉旧计划按下标存的打勾/重量/RPE/组次调整
  days.forEach(d => {
    if (preserve[d.date]) return;
    delete S.prog[d.date];
    ['weights', 'exRpe', 'adj'].forEach(k => { if (S[k]) Object.keys(S[k]).forEach(x => { if (x.startsWith(d.date + '-')) delete S[k][x] }) });
  });
  S.plan = { days, tip: tipText, rest: sch.rest, excludedCount: visibleExcludedCount(excluded) };
  if (!preserveFuture) S.planStale = false; // 未来的天已按当前设置重排 → 「设置已改」提示可以收起
  // Reset calendar view offset and select today
  _calWeekOffset = 0;
  const todayDay = days.find(d => d.date === today);
  S.selDate = todayDay ? today : (days.find(d => !d.isRest)?.date || today);
  saveState();
  if (typeof applySettingsToUI === 'function') applySettingsToUI();
  render();
  // 计划页里的开关(经期模式等)触发的重排留在原页;生成 / 重排按钮照旧跳到「今天」
  if (_genStay) _genStay = false;
  else showTab('today');
}

function assessPlanIntensity() {
  // Sort a copy of LOG by date descending to always evaluate the 3 most recent entries
  const sortedLogs = [...LOG].sort((a, b) => b.date.localeCompare(a.date));
  const gymLogs = sortedLogs.filter(l => !l.isSwimDay && l.workout !== '休息' && l.workout !== '游泳训练' && l.workout !== '轻量替代').slice(0, 3);
  if (gymLogs.length < 2) {
    return {
      status: '评估中',
      desc: '打卡 2 次后开始自动评估强度',
      icon: '',
      cls: 'intensity-none'
    };
  }

  let totalRpe = 0;
  let totalExLogged = 0;
  let totalExPlanned = 0;
  let hasHighRpe = 0;

  gymLogs.forEach(l => {
    totalRpe += (l.rpe || 6);
    totalExLogged += (l.exerciseCount || 0);
    totalExPlanned += (l.exercises ? l.exercises.filter(e => !e.isWarmup && !e.isStretch).length : (l.exerciseCount || 6));
    if (l.rpe >= 8) hasHighRpe++;
  });

  const avgRpe = totalRpe / gymLogs.length;
  const completionRate = totalExPlanned > 0 ? (totalExLogged / totalExPlanned) : 1.0;

  if (avgRpe >= 7.5 || hasHighRpe >= 2 || completionRate < 0.85) {
    return {
      status: '强度超标',
      desc: `近期RPE均值 ${avgRpe.toFixed(1)}，已自动下调后续计划量`,
      icon: '',
      cls: 'intensity-over'
    };
  } else if (avgRpe <= 5.0 && completionRate >= 0.98) {
    return {
      status: '低于实际能力',
      desc: `近期训练较轻松，已自动上调后续计划量`,
      icon: '',
      cls: 'intensity-under'
    };
  } else {
    return {
      status: '契合度极佳',
      desc: '训练量完美匹配您的体能，保持适中',
      icon: '',
      cls: 'intensity-balanced'
    };
  }
}

function confirmGenPlan() {
  if (S.plan && S.plan.days && S.plan.days.length &&
      !confirm('生成一份全新的计划？\n今天之后的安排都会换掉（已完成和今天已经开练的不动）。')) return;
  genPlan();
}

// 设置页改了目标/器材/天数等之后:按新设置重排今天之后还没开练的天(已完成、今天已开练的不动)
function applyStaleSettings() {
  if (!S.plan || !S.plan.days || !S.plan.days.length) { genPlan(); return; }
  const today = todayStr();
  const touched = S.plan.days.some(d => d.date > today && (d._edited || d._ai));
  if (touched && !confirm('按新设置重排今天之后的安排？\n你手动改过或 AI 排过的未来几天也会按新设置重排；已完成的、今天已经开练的不动。')) return;
  genPlan(true);
  showToast('已按新设置重排后面的计划');
}
window.applyStaleSettings = applyStaleSettings;

function recalibratePlan() {
  if (!S.plan) return;
  genPlan(true);
  showToast('已保留历史记录，重排本周剩余天数');
}

function autoAlignPlan() {
  if (!S.plan || !S.plan.days || !S.plan.days.length) return;
  const today = todayStr();

  // Determine splits
  const hasPool = S.equip.includes('泳池');
  let gymPerWeek = S.days;
  if (hasPool) {
    const sp = SWIM_SPLIT[S.days] || { gym: Math.max(2, S.days - 1), swim: 1 };
    gymPerWeek = sp.gym;
  }
  const splits = hasGoal('女性曲线') ? (CURVE_SPLITS[gymPerWeek] || CURVE_SPLITS[3]) :
hasGoal('翘臀美背') ? (GLUTE_BACK_SPLITS[gymPerWeek] || GLUTE_BACK_SPLITS[3]) :
        isCombinedGoal() ? (COMBINED_SPLITS[gymPerWeek] || COMBINED_SPLITS[3]) :
          (hasGoal('臀腿塑形') ? (GLUTE_SPLITS[gymPerWeek] || GLUTE_SPLITS[3]) : (SPLITS[gymPerWeek] || SPLITS[3]));

  // 1. Find last completed gym workout type
  let lastCompletedType = null;

  const pastDays = S.plan.days.filter(d => d.date < today);
  const sortedPast = pastDays.sort((a, b) => a.date.localeCompare(b.date));
  for (let j = sortedPast.length - 1; j >= 0; j--) {
    const d = sortedPast[j];
    if (!d.isRest && !d.isSwimDay && !d.isPrivateDay && d.workoutType !== '轻量替代' && isDone(d)) {
      lastCompletedType = d.workoutType;
      break;
    }
  }

  if (!lastCompletedType && typeof LOG !== 'undefined' && LOG.length > 0) {
    const lastLog = LOG.slice().reverse().find(l => !l.isSwimDay && l.workout !== '休息' && l.workout !== '游泳训练' && l.workout !== '轻量替代');
    if (lastLog) {
      lastCompletedType = lastLog.workout;
    }
  }

  // 2. Determine expected workout type for the first future gym day
  let expectedType = null;
  if (lastCompletedType) {
    const idx = splits.findIndex(s => s.type === lastCompletedType || s.type.includes(lastCompletedType) || lastCompletedType.includes(s.type.slice(0, 4)));
    if (idx !== -1) {
      expectedType = splits[(idx + 1) % splits.length].type;
    }
  }
  if (!expectedType) {
    expectedType = splits[0].type;
  }

  // 3. Find first future gym day
  const firstFutureGymDay = S.plan.days.find(d => d.date >= today && !d.isRest && !d.isSwimDay && !d.isPrivateDay && d.workoutType !== '轻量替代');

  if (firstFutureGymDay) {
    const scheduledType = firstFutureGymDay.workoutType;
    const match = (scheduledType === expectedType || scheduledType.includes(expectedType) || expectedType.includes(scheduledType.slice(0, 4)));
    if (!match) {
      // #6 不再静默重排:旧行为会重挑未来天(覆盖你手改的动作)且 genPlan 末尾强跳"今日"页。
      // 改为温和提示 + 亮出「重排剩余」按钮,是否重排由你决定。
      // 「只重排剩余」常驻在「计划 → 08」
      if (typeof showToast === 'function' && !window._autoAlignNotified) {
        window._autoAlignNotified = true;
        setTimeout(() => showToast('检测到漏练，后续顺序可能偏移。想对齐就去「计划 → 08」点「只重排剩余」（会按当前进度重排；你手改过的未来动作会被覆盖）', 6000), 900);
      }
    }
  }
}

// ══ Render ══════════════════════════════════════════════
function isDone(day) {
  if (!day || !day.exercises.length) return false;
  if (LOG.some(l => l.date === day.date)) return true;
  const p = S.prog[day.date] || {};
  return day.exercises.every((_, i) => p[i]);
}
function getAdj(date, ei, f, base) { return S.adj[date + '-' + ei + '-' + f] ?? base }

let _dragSrc = null;
let _skipAutoRegen = false;

// ══ 今天页(ui-v3) ═════════════════════════════════════════
// 版式照样稿:提示行 → 教练便签 → 标题 + 元信息 → 开始引导训练 → 00 热身块 → 01.. 主项 → 加动作 → 99 拉伸块 → 完成打卡。
// 周历画在「计划」页(uiRenderPlanCal),点一格 = 选这天,再回到这里看。
let _exOpen = {};                    // 规格行展开:key = date-下标
let _blkOpen = { w: false, s: false }; // 热身 / 拉伸块展开
let _genStay = false;                // 计划页里的开关触发重排时留在原页,不跳到今天
function toggleExEdit(date, i) { const k = date + '-' + i; _exOpen[k] = !_exOpen[k]; render(); }
function toggleBlock(k) { _blkOpen[k] = !_blkOpen[k]; render(); }
function _q(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }   // 拼进 onclick 单引号字符串
function _isBlockWarm(ex) { return !!ex.isWarmup; }
function _isBlockStretch(ex) { return !!ex.isStretch && !isWeightedMove(ex.name); }
function _unitTxt(ex, reps) { return `${reps}${ex.unit || '次'}${ex.bi ? '/每侧' : ''}`; }
function _timedSec(ex, reps) { return ex.unit === '分钟' ? reps * 60 : reps; }
function _detailAttrs(name, date, i) { return `data-act="detail" data-name="${_escHtml(name)}"${date ? ` data-date="${date}" data-i="${i}"` : ''}`; }
// 一行 −/+ (直接调 onclick 的版本,今天页规格展开区用)
function _stepRowHtml(label, valHtml, dec, inc, decDis) {
  return `<div class="stepper"><span class="step-lbl">${label}</span><button type="button" class="step-btn" onclick="${dec}" aria-label="${label} 减少"${decDis ? ' disabled' : ''}>−</button><span class="step-val">${valHtml}</span><button type="button" class="step-btn" onclick="${inc}" aria-label="${label} 增加">+</button></div>`;
}
function stepWeight(date, i, dir) {
  const day = S.plan && S.plan.days.find(d => d.date === date); if (!day) return;
  const ex = day.exercises[i]; if (!ex) return;
  const step = getWeightStep(ex.name);
  const base = getWeight(date, i) ?? suggestWeight(ex.name) ?? 0;
  const next = Math.max(0, Math.round((base + dir * step) * 10) / 10);
  setWeight(date, i, next);
  render();
}
function _todayNotices(sel, today) {
  let h = '';
  if (S.planStale) h += `<div class="stale-bar"><span>训练设置改过了，计划还是按旧设置排的</span><button class="regen-btn" onclick="applyStaleSettings()">按新设置重排</button></div>`;
  if (typeof _todayNotice !== 'undefined' && _todayNotice) h += `<div class="notice" role="status"><span>${_escHtml(_todayNotice)}</span><button class="link-btn" onclick="uiNotice('')">知道了</button></div>`;
  if (sel && sel.date !== today) h += `<div class="notice"><span>正在看 ${fmtDate(sel.date)} ${sel.date.slice(5).replace('-', '/')}</span><button class="link-btn u" onclick="calGoToday()">回到今天</button></div>`;
  const isIos = /iphone|ipad|ipod/.test((navigator.userAgent || '').toLowerCase()) || (/macintosh/i.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);   // iPadOS 的 UA 写的是 Macintosh
  const isStandalone = ('standalone' in navigator) && navigator.standalone;
  let hide = false; try { hide = !!localStorage.getItem('hideInstallPrompt'); } catch (e) { }
  if (isIos && !isStandalone && !hide) h += skinTpl('iosInstall', null, () => `<div class="notice" id="ios-install-prompt"><span><span class="faint">[ 装到主屏幕 ]</span> Safari 右下角 ••• → 分享 → 添加到主屏幕，离线也能打开。</span><button class="link-btn" onclick="try{localStorage.setItem('hideInstallPrompt','1')}catch(e){};document.getElementById('ios-install-prompt').remove()">关闭</button></div>`);
  return h;
}
// 主项一行
function _exRowHtml(date, ex, i, o) {
  const done = !!o.pd[i];
  const alt = o.isX ? _xAltDesc(ex.name) : null;
  const sets = getAdj(date, i, 's', ex.sets), reps = getAdj(date, i, 'r', ex.reps);
  const needsWt = needsWeightUI(ex);
  const curW = getWeight(date, i);
  const lastW = needsWt ? getLastWeight(ex.name) : null;
  const sugW = needsWt ? suggestWeight(ex.name) : null;
  const dispW = curW !== null ? curW : (sugW ?? '');
  let dispName = ex.name, dispNote = ex.note || '';
  if (alt) { try { dispName = _xDec(alt.name) || ex.name; dispNote = _xDec(alt.steps[0]) || ex.note; } catch (e) { } }
  const pdot = o.pv && o.pv.has(ex.name) ? `<span class="pdot"${alt ? ` onclick="event.stopPropagation();_xShowAltDesc('${_q(ex.name)}')" style="cursor:pointer"` : ''}></span>` : '';
  const isPR = needsWt && W_HIST[ex.name] && W_HIST[ex.name].length > 0 && (curW || 0) >= Math.max(...W_HIST[ex.name].map(h => h.weight));
  const pr = isPR ? `<span class="pr-tag" title="个人纪录">[ 纪录 ]</span>` : '';
  const key = date + '-' + i, open = !!_exOpen[key] && !o.locked;
  const kgTxt = needsWt ? (curW !== null ? ` · ${curW} kg` : (sugW ? ` · 建议 ${sugW} kg` : '')) : (o.locked && curW ? ` · ${curW} kg` : '');
  const spec = `${sets}×${_unitTxt(ex, reps)}${kgTxt}`;
  const zone = !ex.isWarmup ? equipZone(ex.name) : '';
  const sub = [zone && zone !== '垫上/徒手' ? zone : '', ...(ex.muscle || [])].filter(Boolean).join(' · ');
  const timed = ex.unit === '秒' || ex.unit === '分钟';
  const box = o.locked ? uiBox(done, 'aria-disabled="true" tabindex="-1"', `完成 ${ex.name}`) : uiBox(done, `onclick="tog('${date}',${i})"`, `完成 ${ex.name}`);
  let h = `<div class="ex-row${done ? ' done' : ''}" data-i="${i}"><div class="ex-top"><span class="idx">${o.idx}</span><div class="ex-main">`
    + `<button type="button" class="exname${String(dispName).length > 18 ? ' long' : ''}" ${_detailAttrs(ex.name, date, i)}>${dispName}${pdot}${pr}</button>`
    + (sub ? `<span class="ex-sub">${_escHtml(sub)}</span>` : '')
    + (o.locked ? `<span class="ex-spec static">${spec}</span>` : `<button type="button" class="ex-spec" aria-expanded="${open}" onclick="toggleExEdit('${date}',${i})">${spec}<span class="em">${open ? '▴ 收起' : '▾ 调整'}</span></button>`)
    + `</div>${box}</div>`;
  if (open) {
    const secStep = ex.unit === '秒';
    h += `<div class="ex-edit">`
      + _stepRowHtml('组', `${sets}`, `adj('${date}',${i},'s',-1)`, `adj('${date}',${i},'s',1)`, sets <= 1)
      + _stepRowHtml(ex.unit === '秒' ? '秒' : ex.unit === '分钟' ? '分钟' : '次', `${reps}${ex.bi ? '<span class="step-unit"> /每侧</span>' : ''}`, `adj('${date}',${i},'r',-1)`, `adj('${date}',${i},'r',1)`, reps <= (secStep ? 5 : 1));
    if (needsWt) {
      const e1 = typeof estimate1RM === 'function' ? estimate1RM(ex.name) : null;
      h += `<div class="stepper"><span class="step-lbl">kg</span><button type="button" class="step-btn" onclick="stepWeight('${date}',${i},-1)" aria-label="重量减少">−</button>`
        + `<input class="step-input wt-input" type="number" inputmode="decimal" step="${getWeightStep(ex.name)}" min="0" value="${dispW}" placeholder="${sugW || ''}" aria-label="重量 kg" onchange="setWeight('${date}',${i},+this.value);render()">`
        + `<button type="button" class="step-btn" onclick="stepWeight('${date}',${i},1)" aria-label="重量增加">+</button></div>`
        + `<div class="note-line">${lastW ? `上次 ${lastW.weight} kg` : `建议 ${sugW || '?'} kg`}${sugW && lastW && sugW !== lastW.weight ? ` <span class="faint">→</span> 建议 ${sugW} kg` : ''}${e1 ? ` <span class="faint">· 1RM≈${e1}</span>` : ''}</div>`
        + `<span class="sub-label">感受</span><div class="seg light" role="radiogroup" aria-label="这个动作的感受" style="--n:3">${[['轻松', 4], ['刚好', 6.5], ['吃力', 8.5]].map(([l, v]) => { const on = getExRpe(date, i) === v; return `<button type="button" class="seg-btn${on ? ' on' : ''}" role="radio" aria-checked="${on}" onclick="setExRpe('${date}',${i},${v})">${l}</button>`; }).join('')}</div>`;
    }
    h += `<div class="actions"><button type="button" class="link-btn" onclick="startTimer(${S.restDur || 45},'组间休息')">休息 ${S.restDur || 45}s</button></div>`
      + (dispNote || ex.bi ? `<div class="exnote">${dispNote}${ex.bi ? '（左右各做一遍算 1 组）' : ''}</div>` : '')
      + `</div>`;
  }
  if (!o.locked) {
    const aiOn = typeof coachAccess === 'function' && coachAccess() === 'on';
    h += `<div class="actions ex-acts">`
      + (timed ? `<button type="button" class="link-btn" onclick="startTimer(${_timedSec(ex, reps)}, '${_q(ex.name)}')">计时 ${_unitTxt(ex, reps).replace('/每侧', '')}</button>` : '')
      + `<button type="button" class="link-btn demo-btn" onclick="openDemo('${_q(ex.name)}')">示范</button>`
      + `<button type="button" class="link-btn swap-btn" onclick="swapExercise('${date}',${i})">换 / 划掉</button>`
      + (aiOn ? `<button type="button" class="link-btn" onclick="coachAskAbout('${_q(ex.name)}')">问教练</button>` : '')
      + `</div>`;
  }
  return h + `</div>`;
}
// 热身 / 拉伸块里的一项
function _miniRowHtml(date, ex, i, o) {
  const done = !!o.pd[i];
  const sets = getAdj(date, i, 's', ex.sets), reps = getAdj(date, i, 'r', ex.reps);
  const alt = o.isX ? _xAltDesc(ex.name) : null;
  let dispName = ex.name;
  if (alt) { try { dispName = _xDec(alt.name) || ex.name; } catch (e) { } }
  const pdot = o.pv && o.pv.has(ex.name) ? `<span class="pdot"${alt ? ` onclick="event.stopPropagation();_xShowAltDesc('${_q(ex.name)}')" style="cursor:pointer"` : ''}></span>` : '';
  const timed = ex.unit === '秒' || ex.unit === '分钟';
  const box = o.locked ? uiBox(done, 'aria-disabled="true" tabindex="-1"', `完成 ${ex.name}`, 'sm') : uiBox(done, `onclick="tog('${date}',${i})"`, `完成 ${ex.name}`, 'sm');
  return `<div class="mini-row${done ? ' done' : ''}"><div class="mini-main"><button type="button" class="mini-name exname${String(dispName).length > 18 ? ' long' : ''}" ${_detailAttrs(ex.name, date, i)}>${dispName}${pdot}</button><span class="mini-spec">${sets > 1 ? sets + '×' : ''}${_unitTxt(ex, reps)}</span></div>`
    + (o.locked ? '' : `<div class="actions">${timed ? `<button type="button" class="link-btn" onclick="startTimer(${_timedSec(ex, reps)}, '${_q(ex.name)}')">计时</button>` : ''}<button type="button" class="link-btn" onclick="openSwapSheet('${date}',${i})">划掉</button></div>`)
    + box + `</div>`;
}
function _blockHtml(kind, date, items, o) {
  if (!items.length) return '';
  const allDone = items.every(([, i]) => o.pd[i]);
  const sec = items.reduce((s, [ex, i]) => { const r = getAdj(date, i, 'r', ex.reps), n = getAdj(date, i, 's', ex.sets) || 1; return s + (ex.unit === '分钟' ? r * 60 : ex.unit === '秒' ? r * n * (ex.bi ? 2 : 1) : 45 * n); }, 0);
  const open = !!_blkOpen[kind];
  const label = kind === 'w' ? '热身' : '拉伸';
  let h = `<div class="blk${kind === 's' && !open ? ' last' : ''}"><button type="button" class="blk-head" aria-expanded="${open}" onclick="toggleBlock('${kind}')"><span class="idx">${kind === 'w' ? '00' : '99'}</span><span>${label}</span><span class="meta">${items.length} 项 · ${Math.max(1, Math.round(sec / 60))} min ${open ? '▴' : '▾'}</span></button>`
    + (o.locked ? '' : uiBoxRow(allDone, '全部做完', `onclick="togBlock('${date}','${kind}')" aria-label="${label}全部做完"`, 'end')) + `</div>`;
  if (open) h += `<div class="blk-list${kind === 's' ? ' last' : ''}">${items.map(([ex, i]) => _miniRowHtml(date, ex, i, o)).join('')}</div>`;
  return h;
}
// 一键勾完整块(再点一次全部取消)
function togBlock(date, kind) {
  const day = S.plan && S.plan.days.find(d => d.date === date); if (!day || isLocked(day)) return;
  const idx = day.exercises.map((ex, i) => [ex, i]).filter(([ex]) => kind === 'w' ? _isBlockWarm(ex) : _isBlockStretch(ex)).map(([, i]) => i);
  if (!idx.length) return;
  if (!S.prog[date]) S.prog[date] = {};
  const allDone = idx.every(i => S.prog[date][i]);
  idx.forEach(i => { S.prog[date][i] = !allDone; });
  if (!allDone) {
    wkMarkStart(date);
    playExerciseDoneSound();
    if (_xMode && _ownerSession()) { const m = _xPick('tog_toast'); if (m) showToast(m, 2500); }
  }
  saveState(); render();
  if (!allDone) _maybeOpenRpe(date);
}
// 勾满了一天 → 弹打卡(tog 和 togBlock 共用)
function _maybeOpenRpe(date) {
  const day = S.plan.days.find(d => d.date === date);
  if (!day || !isDone(day) || LOG.find(l => l.date === date)) return false;
  _pendingRpeDate = date;
  _pendingRpeDay = day;
  _rpeEyebrow(day);
  if (day.isSwimDay) {
    document.getElementById('rpe-modal-title').innerText = '游泳训练完成！';
    document.getElementById('rpe-modal-desc').innerText = '评估今天游泳的累计程度';
  }
  const _openRpe = () => { updateRpeModalLabels(); _rpeOpen(); };
  if (_xMode && _ownerSession() && _xBeforeRpe(_openRpe)) return true;
  setTimeout(_openRpe, 100);
  return true;
}
function _readListHtml(exs, date) {
  return `<div class="read-list">${exs.map((ex, i) => {
    const done = ex.done !== false;
    return `<div class="ex-row${done ? ' done' : ' struck'}"><div class="ex-top"><span class="idx">${String(i + 1).padStart(2, '0')}</span><div class="ex-main"><button type="button" class="exname" ${_detailAttrs(ex.name)}>${ex.name}</button>`
      + `<span class="ex-spec static">${ex.sets || '?'}×${ex.reps || '?'}${ex.unit || '次'}${ex.weight ? ` · ${ex.weight} kg` : ''}</span></div>${uiBox(done, 'aria-disabled="true" tabindex="-1"', done ? '已完成' : '没做')}</div></div>`;
  }).join('')}</div>`;
}
function _logMetaHtml(lg) {
  return `<div class="hist-detail-meta">${lg.rpe ? `<span class="hist-detail-chip rpe">RPE ${lg.rpe}/10</span>` : ''}${lg.mood ? `<span class="hist-detail-chip mood">${lg.mood}</span>` : ''}<span class="hist-detail-chip dur">${lg.exerciseCount || (lg.exercises || []).length} 个动作</span>${wkLogMin(lg) ? `<span class="hist-detail-chip dur">用时 ${wkLogMin(lg)} min</span>` : ''}</div>`;
}
function _dayMuscles(sel) {
  const m = [];
  sel.exercises.forEach(ex => { if (ex.isWarmup || ex.isStretch) return; (ex.muscle || []).forEach(x => { if (!m.includes(x)) m.push(x); }); });
  return m.slice(0, 3);
}

function render() {
  _xTheme();
  if (typeof uiUpdateMasthead === 'function') uiUpdateMasthead();
  const mainEl = document.getElementById('main');
  if (!S.plan) {
    if (mainEl) mainEl.innerHTML = _todayNotices(null, todayStr()) + `<div class="empty"><p>还没有训练计划。</p><p class="hint">去「计划」把目标、天数、器械设好，在「08」生成；或者走一遍新手设置，五步就好。</p>`
      + `<div class="btn-row"><button class="btn-primary" onclick="showTab('plan')">去计划</button><button class="btn-outline" onclick="uiOpenOobe(false)">新手设置</button></div></div>`;
    const pc = document.getElementById('plan-cal'); if (pc) pc.innerHTML = '';
    if (typeof uiRenderPlanSummary === 'function') uiRenderPlanSummary();
    if (typeof uiOobeCheck === 'function') uiOobeCheck();
    return;
  }
  if (typeof uiOobeCheck === 'function') uiOobeCheck();
  const { days: planDays, tip } = S.plan;
  const today = todayStr();
  const planStart = planDays[0]?.date || today;
  const planEnd = planDays[planDays.length - 1]?.date || today;
  // Auto-regenerate if plan has expired (today is past the last plan day)
  if (today > planEnd && !_skipAutoRegen) {
    _skipAutoRegen = true; // prevent infinite loop during this render cycle
    genPlan(false); // fresh plan from today (recalibrate would reuse old expired startDate)
    return;
  }
  const viewStart = addDays(planStart, _calWeekOffset * 7);
  const viewEnd = addDays(viewStart, 13);
  const visibleDays = [];
  for (let i = 0; i < 14; i++) {
    const ds = addDays(viewStart, i);
    const planDay = planDays.find(d => d.date === ds);
    if (planDay) { visibleDays.push({ ...planDay, _src: 'plan' }) }
    else {
      const logE = LOG.find(l => l.date === ds);
      if (logE) { visibleDays.push({ date: ds, isRest: false, _src: 'log', workoutType: logE.workout, duration: logE.duration, exercises: (logE.exercises || []).map(e => ({ name: e.name, sets: e.sets, reps: e.reps, unit: e.unit, weight: e.weight, note: '' })), _logEntry: logE }) }
      else { visibleDays.push({ date: ds, isRest: true, _src: 'empty', workoutType: '—', exercises: [] }) }
    }
  }
  let sel = visibleDays.find(d => d.date === S.selDate);
  if (!sel) sel = visibleDays.find(d => d.date === today) || visibleDays.find(d => !d.isRest) || visibleDays[0];
  const isCurrentView = visibleDays.some(d => d.date === today);
  if (typeof uiRenderPlanCal === 'function') uiRenderPlanCal(visibleDays, sel, today, isCurrentView, viewStart, viewEnd);
  if (typeof uiRenderPlanSummary === 'function') uiRenderPlanSummary();
  if (!mainEl) return;

  let h = _todayNotices(sel, today);
  if (_xMode && _ownerSession()) h += _xPlanTop(today);
  if (typeof skinHas === 'function' && skinHas('todayBody')) {
    // 运动风格:今天页正文整块换成卡片版式(skin-sport.js「10 今天」);功能、数据、调用的函数和下面纸墨那段一一对应
    h += SKIN_TPL.sport.todayBody({ sel, today, planDays, tip });
  } else {
  if (typeof coachTodayNoteHtml === 'function') h += coachTodayNoteHtml(sel ? sel.date : today);

  if (sel && !sel.isRest) {
    const lg = LOG.find(l => l.date === sel.date);
    if (sel._src === 'log' && !planDays.find(dd => dd.date === sel.date)) {
      // 只在日志里的历史日
      const lgE = sel._logEntry;
      h += `<div class="wk-head"><div class="wk-title">${_escHtml(sel.workoutType)}</div><div class="wk-meta"><span>${fmtDate(sel.date)}</span><span>${sel.duration || '?'} min</span><span class="accent">历史记录</span></div></div>`;
      if (lgE && lgE.exercises && lgE.exercises.length) h += _logMetaHtml(lgE) + _readListHtml(lgE.exercises, sel.date);
      else h += `<div class="hist-empty">该日训练详情不可用</div>`;
      if (lgE && lgE.note) h += `<div class="hist-note">"${_escHtml(lgE.note)}"</div>`;
    } else if (isLocked(sel) && lg) {
      // 已锁定且已打卡
      h += `<div class="wk-head"><div class="wk-title">${_escHtml(lg.workout)}</div><div class="wk-meta"><span>${fmtDate(sel.date)}</span><span>${lg.duration || sel.duration} min</span>${lg.isSwimDay ? `<span>${S.swimLevel || '入门'}</span>` : ''}<span class="olive">已打卡</span><span>已锁定</span></div>`
        + `<div class="wk-tools"><button class="link-btn u" onclick="unlockDate('${sel.date}')">解除锁定</button>${!sel.isPrivateDay ? `<button class="link-btn u" onclick="shareWorkout('${sel.date}')">分享卡片</button>` : ''}</div></div>`;
      h += _logMetaHtml(lg);
      h += (lg.exercises && lg.exercises.length) ? _readListHtml(lg.exercises, sel.date) : `<div class="hist-empty">该日训练详情不可用</div>`;
      if (lg.note) h += `<div class="hist-note">"${_escHtml(lg.note)}"</div>`;
      if (typeof coachFeedbackHtml === 'function') h += coachFeedbackHtml(sel.date);
      h += typeof renderRecoveryModule === 'function' ? renderRecoveryModule(sel) : '';
    } else {
      const pd = S.prog[sel.date] || {};
      const locked = isLocked(sel);
      const _pvSet = _ownerSession() ? new Set(_PRIVATE_POOL) : null;
      const isX = _xMode && _ownerSession() && hasGoal('女性曲线');
      const o = { pd, locked, pv: _pvSet, isX, idx: '' };
      const alreadyLogged = !!lg;
      const checkedCount = Object.keys(pd).filter(k => pd[k]).length;
      if (sel.isSwimDay && !locked) {
        // ── 泳日:按阶段分组 ──
        const PHASE_LABELS = { warmup: '热身', tech: '技术练习', main: '主练', cooldown: '放松' };
        h += `<div class="wk-head"><div class="wk-title">${_escHtml(sel.workoutType)}</div><div class="wk-meta"><span>${S.swimLevel || '入门'}</span><span>${sel.duration} min</span><span>${sel.exercises.length} 项</span></div></div>`;
        if (!alreadyLogged) h += `<button class="btn-primary" onclick="startGuided('${sel.date}')">▶&#xFE0E; 开始引导训练</button>`;
        let lastPhase = '', n = 0;
        sel.exercises.forEach((ex, i) => {
          const phase = ex.swimPhase || 'main';
          if (phase !== lastPhase) { lastPhase = phase; h += `<div class="phase-head">${PHASE_LABELS[phase] || phase}</div>`; }
          const done = !!pd[i], reps = getAdj(sel.date, i, 'r', ex.reps);
          n++;
          h += `<div class="ex-row${done ? ' done' : ''}" data-i="${i}"><div class="ex-top"><span class="idx">${String(n).padStart(2, '0')}</span><div class="ex-main"><button type="button" class="exname" ${_detailAttrs(ex.name, sel.date, i)}>${ex.name}</button>`
            + `<span class="ex-spec static">${reps} 分钟</span>${ex.note ? `<span class="exnote">${ex.note}</span>` : ''}</div>${uiBox(done, `onclick="tog('${sel.date}',${i})"`, `完成 ${ex.name}`)}</div>`
            + `<div class="actions ex-acts">${!done ? `<button type="button" class="link-btn" onclick="startTimer(${reps * 60}, '${_q(ex.name)}')">计时 ${reps} 分钟</button>` : ''}`
            + (phase !== 'warmup' && phase !== 'cooldown' ? `<button type="button" class="link-btn swap-btn" onclick="swapExercise('${sel.date}',${i})">换 / 划掉</button>` : `<button type="button" class="link-btn" onclick="openSwapSheet('${sel.date}',${i})">划掉</button>`)
            + `</div></div>`;
        });
        if (!isDone(sel)) h += `<button class="add-row" onclick="openAddExerciseModal('${sel.date}')">+ 加一个动作</button>`;
        h += typeof renderRecoveryModule === 'function' ? renderRecoveryModule(sel) : '';
        if (!alreadyLogged) h += `<div class="today-foot"><button class="btn-outline" onclick="endWorkoutEarly('${sel.date}')">${checkedCount === sel.exercises.length ? '完成游泳训练' : '结束训练并打卡'}</button></div>`;
        else if (typeof coachFeedbackHtml === 'function') h += coachFeedbackHtml(sel.date);
      } else {
        // ── 力量日 / 私密日 / 锁定未打卡 ──
        const mus = _dayMuscles(sel);
        const mainN = sel.exercises.filter(ex => !_isBlockWarm(ex) && !_isBlockStretch(ex)).length;
        h += `<div class="wk-head"><div class="wk-title">${_escHtml(sel.workoutType)}</div><div class="wk-meta">${mus.length ? `<span>${mus.join(' · ')}</span>` : ''}<span>${sel.duration} min</span><span>${mainN} 主项</span>`
          + `${sel.isPrivateDay ? `<span class="accent">另有安排</span>` : ''}${sel.isSwimDay ? `<span>${S.swimLevel || '入门'}</span>` : ''}${locked ? `<span>未打卡 · 已锁定</span>` : ''}</div>`
          + `<div class="wk-tools">${locked ? `<button class="link-btn u" onclick="unlockDate('${sel.date}')">解除锁定</button>` : `<span class="tag">休息</span><button class="link-btn" onclick="startTimer(45, '组间休息')">45s</button><button class="link-btn" onclick="startTimer(60, '组间休息')">60s</button>`}</div></div>`;
        if (!locked && !alreadyLogged && sel.exercises.length) h += `<button class="btn-primary" onclick="startGuided('${sel.date}')">▶&#xFE0E; 开始引导训练</button><div style="height:18px"></div>`;
        const all = sel.exercises.map((ex, i) => [ex, i]);
        const warm = all.filter(([ex]) => _isBlockWarm(ex)), str = all.filter(([ex]) => _isBlockStretch(ex));
        const main = all.filter(([ex]) => !_isBlockWarm(ex) && !_isBlockStretch(ex));
        h += _blockHtml('w', sel.date, warm, o);
        main.forEach(([ex, i], k) => { o.idx = String(k + 1).padStart(2, '0'); h += _exRowHtml(sel.date, ex, i, o); });
        if (!locked && !isDone(sel) && !sel.isSwimDay) h += `<button class="add-row" onclick="openAddExerciseModal('${sel.date}')">+ 加一个动作（按今天的肌群筛）</button>`;
        h += _blockHtml('s', sel.date, str, o);
        h += typeof renderRecoveryModule === 'function' ? renderRecoveryModule(sel) : '';
        if (_xMode && _ownerSession()) h += _xTaskPanel(sel.date);
        if (!locked && !alreadyLogged) {
          h += `<div class="today-foot"><button class="btn-outline" onclick="endWorkoutEarly('${sel.date}')">${checkedCount === sel.exercises.length ? '完成打卡' : '结束训练并打卡'}</button></div>`;
        } else if (alreadyLogged) {
          h += `<div class="today-foot"><div class="note-line"><span class="olive">[ 已打卡 ]</span> RPE ${lg.rpe || '—'} · ${lg.exerciseCount || 0} 个动作</div><div class="actions"><button class="link-btn u" onclick="editLog(${LOG.indexOf(lg)})">编辑记录</button>${!sel.isPrivateDay ? `<button class="link-btn u" onclick="shareWorkout('${sel.date}')">分享卡片</button>` : ''}</div></div>`;
          if (typeof coachFeedbackHtml === 'function') h += coachFeedbackHtml(sel.date);
        }
      }
    }
  } else if (sel && sel.isRest) {
    h += `<div class="wk-head"><div class="wk-title">休息日</div><div class="wk-meta"><span>${fmtDate(sel.date)}</span></div></div><div class="hint">好好恢复，明天继续。</div>`;
    h += typeof renderRecoveryModule === 'function' ? renderRecoveryModule(sel) : '';
  }
  if (tip) h += `<div class="tip" style="white-space:pre-line">${_escHtml(tip)}</div>`;
  if (_xMode && _ownerSession() && hasGoal('女性曲线')) {
    h += (_xp() && _xp().curveTipHtml) || '';
  }
  }   // 纸墨正文结束
  mainEl.innerHTML = h;
  if (typeof skinAfterRender === 'function') skinAfterRender('today');
  _wmSync();

  if ('setAppBadge' in navigator) {
    const todayPlan = S.plan?.days.find(d => d.date === today);
    if (todayPlan && !todayPlan.isRest && !LOG.some(l => l.date === today && l.workout === todayPlan.workoutType)) {
      navigator.setAppBadge(1).catch(() => { });
    } else {
      navigator.clearAppBadge().catch(() => { });
    }
  }
}

// ══ Interactions ════════════════════════════════════════
function selectDate(ds) {
  S.selDate = ds;
  if (S.plan && S.plan.days && S.plan.days.length) {
    const planStart = S.plan.days[0].date;
    const diff = dayDiff(planStart, ds);
    const currentStart = _calWeekOffset * 7;
    if (diff < currentStart || diff >= currentStart + 14) {
      _calWeekOffset = Math.floor(diff / 7);
    }
  }
  saveState();
  render();
}

// ══ Timer System & Premium Audio Synthesizers ════════════
let _timerInterval = null;
let _audioCtx = null;

function _getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function unlockAudio() {
  try {
    const ctx = _getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch (e) { }
}
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

// ── Shared: create a simple convolution reverb impulse ──
function _makeReverb(ctx, decay, len) {
  const rate = ctx.sampleRate;
  const length = rate * len;
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  return conv;
}

// ── Shared: noise burst exciter (like a mallet or pluck) ──
function _noiseExcite(ctx, duration) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

// ── 提示音静音开关(localStorage 持久) ──
function _soundMuted() { try { return localStorage.getItem('soundMuted') === '1'; } catch (e) { return false; } }
function toggleSound() { const m = !_soundMuted(); try { localStorage.setItem('soundMuted', m ? '1' : '0'); } catch (e) {} if (!m) { try { playExerciseDoneSound(); } catch(e){} } return m; }

// Sound 1: Rest timer ended — singing bowl (振荡器合成,D4+泛音,长衰减)
function playDing() {
  try {
    if (_soundMuted()) return;
    const ctx = _getAudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain(); master.gain.value = 0.5;
    const reverb = _makeReverb(ctx, 2.5, 2.5);
    const dry = ctx.createGain(); dry.gain.value = 0.7;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    master.connect(dry); dry.connect(ctx.destination);
    master.connect(reverb); reverb.connect(wet); wet.connect(ctx.destination);
    const freqs = [293.66, 440, 587.33, 880];
    const levels = [0.9, 0.4, 0.25, 0.12];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(levels[i], now + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0008, now + 2.8);
      o.connect(env); env.connect(master); o.start(now); o.stop(now + 2.9);
    });
  } catch (e) { console.warn('Audio:', e); }
}

// Sound 2: Rest timer starts — soft wind chime (两声高音)
function playRestStartSound() {
  try {
    if (_soundMuted()) return;
    const ctx = _getAudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain(); master.gain.value = 0.4;
    const reverb = _makeReverb(ctx, 3, 1.5);
    const dry = ctx.createGain(); dry.gain.value = 0.6;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    master.connect(dry); dry.connect(ctx.destination);
    master.connect(reverb); reverb.connect(wet); wet.connect(ctx.destination);
    const chimes = [ { freq: 1318.5, delay: 0, vol: 0.5, decay: 0.9 }, { freq: 1760, delay: 0.08, vol: 0.3, decay: 0.7 } ];
    chimes.forEach(c => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = c.freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now + c.delay);
      env.gain.linearRampToValueAtTime(c.vol, now + c.delay + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0008, now + c.delay + c.decay);
      o.connect(env); env.connect(master); o.start(now + c.delay); o.stop(now + c.delay + c.decay + 0.05);
    });
  } catch (e) { console.warn('Audio:', e); }
}

// Sound 3: Exercise checked off — marimba tap (基频+柔和八度)
function playExerciseDoneSound() {
  try {
    if (_soundMuted()) return;
    const ctx = _getAudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain(); master.gain.value = 0.5;
    const reverb = _makeReverb(ctx, 4, 0.6);
    const dry = ctx.createGain(); dry.gain.value = 0.75;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    master.connect(dry); dry.connect(ctx.destination);
    master.connect(reverb); reverb.connect(wet); wet.connect(ctx.destination);
    [{ f: 784, v: 0.8, d: 0.45 }, { f: 1568, v: 0.15, d: 0.25 }].forEach(n => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = n.f;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(n.v, now + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0008, now + n.d);
      o.connect(env); env.connect(master); o.start(now); o.stop(now + n.d + 0.05);
    });
  } catch (e) { console.warn('Audio:', e); }
}

// Sound 4: Workout complete — ascending kalimba arpeggio (五声音阶)
function playWorkoutCompleteSound() {
  try {
    if (_soundMuted()) return;
    const ctx = _getAudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain(); master.gain.value = 0.42;
    const reverb = _makeReverb(ctx, 2, 2.5);
    const dry = ctx.createGain(); dry.gain.value = 0.6;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    master.connect(dry); dry.connect(ctx.destination);
    master.connect(reverb); reverb.connect(wet); wet.connect(ctx.destination);
    const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.14;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.6, t + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0008, t + 0.8);
      o.connect(env); env.connect(master); o.start(t); o.stop(t + 0.85);
    });
  } catch (e) { console.warn('Audio:', e); }
}

let _wakeLock = null;
async function _requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      _wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) { console.warn('WakeLock failed:', err); }
  }
}
function _releaseWakeLock() {
  if (_wakeLock !== null) {
    _wakeLock.release().catch(() => { });
    _wakeLock = null;
  }
}

// ══ 扩展包钩子(owner 专属) ═══════════════════════════════════════
// 扩展模式的全部内容(文本池、动作别名描述、样式、入口、写作台)都在 owner 登录后由后端
// 下发的私有包里,执行后写入 window.XP 并覆盖下面这些同名空壳。公开代码只留机制:
// 没有 XP(非 owner / 未加载)时,空壳什么都不做,所有扩展分支自然不触发。
var _xMode = false;          // 扩展模式开关(入口在私有包里)
var _xDetailMode = false;    // 动作详情是否显示扩展描述(随 _xMode 打开)
function _xp() { return (typeof window !== 'undefined' && window.XP) || null; }
function _xDb() { const x = _xp(); return (x && x.db) || null; }
function _xDec(s) { try { return decodeURIComponent(atob(s)); } catch (e) { return s; } }
function _xAltDesc(name) { const x = _xp(); return (x && x.exDesc && x.exDesc[name]) || null; }
function _xLabel(k, fb) { const x = _xp(); return (x && x.labels && x.labels[k] != null) ? x.labels[k] : fb; }
// 取一个文本池并解码;tiered=true 时按累计次数分层截取
function _xTexts(key, tiered = true) {
  const db = _xDb(), arr = db && Array.isArray(db[key]) ? db[key] : null;
  if (!arr) return [];
  const out = arr.map(s => { try { return decodeURIComponent(atob(s)); } catch (e) { return ''; } }).filter(Boolean);
  return tiered ? (_xTierSlice(out) || []) : out;
}
function _xPick(key, tiered = true) { const a = _xTexts(key, tiered); return a.length ? a[Math.floor(Math.random() * a.length)] : null; }
// 分层:累计次数越多,文本池开放得越多
function _xTier() {
  const n = X_STATE.count || 0;
  if (n >= 15) return 4;
  if (n >= 7)  return 3;
  if (n >= 3)  return 2;
  return 1;
}
function _xTierSlice(arr) {
  if (!arr || !arr.length) return arr;
  const fracs = [0.25, 0.5, 0.75, 1.0];
  const avail = Math.max(1, Math.ceil(arr.length * fracs[_xTier() - 1]));
  return arr.slice(0, avail);
}
// owner 排私有池动作时参考最近几次扩展打卡的指标(没有数据 → 1)
function _xDepthScore() {
  const m = X_STATE.metrics || [];
  if (!m.length) return 1;
  const recent = m.slice(-5);
  const avg = f => recent.reduce((s, r) => s + (r?.[f] || 1), 0) / recent.length;
  return (avg('sec') + avg('lock') + avg('mental')) / 3;
}

// —— 空壳:由私有包覆盖。签名即接口 ——
function _xTheme() {}                                   // render() 开头调;负责扩展模式的退出按钮等
function _xMilestoneText() { return null; }              // 成就 toast 的替换文案
function _xPlanTop(today) { return ''; }                 // 计划页顶部附加 HTML
function _xCalMark(date) { return ''; }                  // 日历格附加标记 HTML
function _xTaskPanel(date) { return ''; }                // 当日动作列表下方附加面板 HTML
function _xShowAltDesc(name) {}                          // 点动作名旁的小点时的弹层
function _xGuidedStart(cb) { cb(); }                     // 引导模式开场;必须最终调用 cb
function _xGuidedStop() {}                               // 引导模式结束清理(可重复调用)
function _xOnSetDone() {}                                // 引导模式完成一组
function _xRpeModal(titleEl, descEl, noteEl, box) { return false; } // 接管打卡弹窗时返回 true
function _xCollectMetrics() { return null; }             // 打卡时收集附加指标(存进 LOG[].subMetrics)
function _xAfterCheckin(date, metrics) {}                // 打卡写入 LOG 之后
function _xBeforeRpe(open) { return false; }             // 打开打卡弹窗前;接管时返回 true 并自行调用 open()
function _xHistExtra(entry) { return ''; }               // 历史详情每条记录下方附加 HTML
const _X_STUBS = { _xTheme, _xMilestoneText, _xPlanTop, _xCalMark, _xTaskPanel, _xShowAltDesc, _xGuidedStart, _xGuidedStop,
  _xOnSetDone, _xRpeModal, _xCollectMetrics, _xAfterCheckin, _xBeforeRpe, _xHistExtra };

// 私有包执行完调用:把 owner 专属的旧名迁移和动作说明覆盖应用上(幂等)
let _xNoteOrig = null;
function _xApply() {
  const x = _xp();
  if (!x || !_ownerSession()) return;
  if (x.renames) {
    let added = false;
    Object.entries(x.renames).forEach(([o, n]) => { if (!EX_RENAMES[o]) { EX_RENAMES[o] = n; added = true; } });
    if (added && typeof _migrateExerciseNames === 'function') _migrateExerciseNames();
  }
  if (x.noteOverrides && !_xNoteOrig) {
    _xNoteOrig = [];
    Object.values(DB).forEach(exs => exs.forEach(e => {
      if (x.noteOverrides[e.n] != null) { _xNoteOrig.push([e, e.note]); e.note = x.noteOverrides[e.n]; }
    }));
  }
}
// 换成非 owner 账号时调用:关模式、还原说明、撤掉私有包挂上去的一切(内存里的函数体只能靠刷新页面彻底清掉)
function _xReset() {
  _xMode = false; _xDetailMode = false;
  try { _xGuidedStop(); } catch (e) {}
  if (_xNoteOrig) { _xNoteOrig.forEach(([e, n]) => { e.note = n; }); _xNoteOrig = null; }
  const x = _xp();
  Object.assign(window, _X_STUBS);
  ((x && x.globals) || []).forEach(k => { try { delete window[k]; } catch (e) { window[k] = undefined; } });
  try { document.querySelectorAll('[data-xp]').forEach(el => el.remove()); } catch (e) {}
  try { delete window.XP; } catch (e) { window.XP = undefined; }
}
// 退出扩展模式(Esc / 双击空白处 / 退出按钮)
function _xExit(toast) {
  if (!_xMode) return;
  _xMode = false; _xDetailMode = false;
  _xGuidedStop();
  if (typeof stopTimer === 'function') stopTimer();
  const mWorkout = document.getElementById('workout-modal');
  if (mWorkout) mWorkout.classList.remove('open');
  const mRpe = document.getElementById('rpe-modal');
  if (mRpe) mRpe.classList.remove('open');
  if (typeof render === 'function') render();
  if (toast && typeof showToast === 'function') showToast('标准模式已恢复');
}
window._xExit = _xExit;

function _refreshNextDayPrivate() {
  if (!S.plan || !_ownerSession()) return;
  const today = todayStr();
  const ps = new Set(_PRIVATE_POOL);
  const excluded = getExcluded();
  const nextDay = S.plan.days.find(d =>
    d.date >= today && !d.isRest && !d.isSwimDay && !isDone(d) && d._splitGroups
  );
  if (!nextDay) return;
  nextDay.exercises = nextDay.exercises.filter(ex => !ps.has(ex.name));
  const fresh = pickPrivateForSplit({ groups: nextDay._splitGroups }, excluded, new Set());
  nextDay.exercises.push(...fresh);
  ls(K.plan, S.plan);
}

function _notifMuted() { try { return localStorage.getItem('notifMuted') === '1'; } catch (e) { return false; } }
function toggleNotif() { const m = !_notifMuted(); try { localStorage.setItem('notifMuted', m ? '1' : '0'); } catch (e) {} return m; }

function _ensureNotifyPermission() {
  try { if (!_notifMuted() && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
}
function _notifyRestDone() {
  try {
    if (_notifMuted()) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification('休息结束', { body: '休息结束，开始下一组', tag: 'rest-done', renotify: true });
      setTimeout(() => { try { n.close(); } catch (e) {} }, 8000);
    }
  } catch (e) {}
}

let _timerEndTime = 0;
let _timerFired = false;
let _timerKind = '', _timerTotal = 0;   // 这次计时是什么(原始标签)/ 总秒数:运动风格今天页的组间倒计时读它们
let _multiTimerQueue = [];
let _multiTimerIdx = 0;

function startMultiTimer(segments) {
  if (!segments || !segments.length) return;
  _multiTimerQueue = segments;
  _multiTimerIdx = 0;
  _runNextMultiSegment();
}
window.startMultiTimer = startMultiTimer;

function _runNextMultiSegment() {
  if (_multiTimerIdx >= _multiTimerQueue.length) {
    _multiTimerQueue = [];
    _multiTimerIdx = 0;
    showToast('冷热交替引导完成！体表循环全面激活');
    playWorkoutCompleteSound();
    clearInterval(_timerInterval); // 最后一段收尾:停表+放屏幕锁
    _releaseWakeLock();
    return;
  }
  const seg = _multiTimerQueue[_multiTimerIdx];
  _multiTimerIdx++;
  startTimer(seg.sec, `[${_multiTimerIdx}/${_multiTimerQueue.length}] ${seg.label}`);
}

// Restore timer from sessionStorage (e.g. iOS killed page)
try {
  const storedEnd = Number(sessionStorage.getItem('__timer_end__') || 0);
  if (storedEnd > 0 && _timerEndTime === 0) {
    _timerEndTime = storedEnd;
    if (Date.now() >= storedEnd) {
      _timerFired = true;
      setTimeout(() => { playDing(); _notifyRestDone(); }, 500);
      try { sessionStorage.removeItem('__timer_end__'); sessionStorage.removeItem('__timer_label__'); } catch(e) {}
    } else {
      const remainSec = Math.ceil((storedEnd - Date.now()) / 1000);
      const storedLabel = sessionStorage.getItem('__timer_label__') || '恢复计时';
      startTimer(remainSec, storedLabel);
    }
  }
} catch(e) {}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _timerEndTime > 0) {
    if (Date.now() >= _timerEndTime && !_timerFired) {
      _timerFired = true;
      playDing();
      _notifyRestDone();
      const bar = document.getElementById('universal-timer');
      if (bar) setTimeout(() => bar.classList.remove('show'), 3000);
      try { sessionStorage.removeItem('__timer_end__'); sessionStorage.removeItem('__timer_label__'); } catch(e) {}
    }
  }
});

// opts(只有运动风格的「+15 s」在用):{ quiet: 不放开始音, total: 进度条按这个总秒数算 }
function startTimer(seconds, label = "休息中", opts) {
  clearInterval(_timerInterval);
  _releaseWakeLock();
  _requestWakeLock();

  const bar = document.getElementById('universal-timer');
  const timeEl = document.getElementById('timer-time');
  const lblEl = document.getElementById('timer-label');
  const prog = document.getElementById('timer-progress');
  if (!bar) return;

  _timerKind = label;
  if (_xMode && _ownerSession() && label === '组间休息') {
    const cue = _xPick('rest_cues');
    if (cue) label = cue;
  }

  lblEl.innerText = label;
  lblEl.style.color = '';
  timeEl.style.color = '';
  bar.style.background = '';
  bar.style.boxShadow = '';
  delete bar.dataset.overtime;
  delete bar.dataset.dinged;
  bar.classList.add('show');
  unlockAudio();
  _ensureNotifyPermission();
  if (!(opts && opts.quiet)) playRestStartSound();

  const total = (opts && opts.total) || seconds;
  _timerTotal = total;
  const endTime = Date.now() + seconds * 1000;
  _timerEndTime = endTime;
  _timerFired = false;
  try { sessionStorage.setItem('__timer_end__', String(endTime)); sessionStorage.setItem('__timer_label__', label); } catch(e) {}

  function update() {
    const remain = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    timeEl.innerText = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    prog.style.width = ((total - remain) / total * 100) + '%';

    if (remain <= 0) {
      if (remain === 0 && !bar.dataset.dinged) {
        _timerFired = true;
        playDing();
        _notifyRestDone();
        bar.dataset.dinged = '1';
        const _xOvertime = _xMode && _ownerSession() && hasGoal('女性曲线');
        if (!_xOvertime) {
          setTimeout(() => { bar.classList.remove('show'); }, 3000);
        }
        const _isMulti = _multiTimerQueue.length > 0;
        // 多段表(冷热交替浴):无论中途还是最后一段都续跑一次——最后一段会命中完成分支(提示+复位+收尾)
        if (_isMulti) {
          setTimeout(() => { _runNextMultiSegment(); }, 2000);
        }
        // 收尾:非扩展模式超时提示、且不是多段表 → 释放 setInterval 与屏幕唤醒锁(多段表由 _runNextMultiSegment 收尾)。
        // 原来的清理写在恒不成立的 remain<=-3 分支里=死代码,导致计时结束后空转、屏幕不灭耗电。
        if (!_xOvertime && !_isMulti) {
          clearInterval(_timerInterval);
          _releaseWakeLock();
        }
      }
      
      if (_xMode && _ownerSession() && hasGoal('女性曲线')) {
        const overtime = -Math.floor((endTime - Date.now()) / 1000);
        if (overtime >= 3) {
          if (!bar.dataset.overtime) {
            bar.dataset.overtime = '1';
            bar.style.background = 'rgba(150, 0, 0, 0.9)';
            lblEl.style.color = '#fff';
            timeEl.style.color = '#ff6b6b';
            lblEl.innerText = _xPick('overtime_msgs', false) || '时间到，开始下一组';
            if ('vibrate' in navigator) {
              const pulse = setInterval(() => {
                if (!document.getElementById('universal-timer').classList.contains('show')) clearInterval(pulse);
                else navigator.vibrate([100, 50, 100]);
              }, 2000);
            }
          }
          if (overtime % 2 === 0) {
            bar.style.boxShadow = '0 0 30px rgba(255, 0, 0, 0.8)';
          } else {
            bar.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.4)';
          }
        }
      }
    }
  }

  update();
  _timerInterval = setInterval(update, 200);
}

function stopTimer() {
  clearInterval(_timerInterval);
  _releaseWakeLock();
  const bar = document.getElementById('universal-timer');
  if (bar) bar.classList.remove('show');
}

// ══ 这天开练的时间(两套风格共用) ═════════════════════════
// 存本机 localStorage fit_spsets,和运动风格今天页的「做到第几组」同一份:{ 日期: { s: {动作下标: 组数}, t0: 开练时刻 } },
// 只留近 7 天,不进云端、不进快照。只记今天的:第一次勾动作 / 勾整块 / 完成第一组 / 开始引导训练(看别的日子时点了不算)。
// 打卡时算出实际用时(分钟),写进那条记录的可选字段 elapsedMin(计划时长 duration 原样不动,统计还在用它)。
const WK_DAY_KEY = 'fit_spsets';
const WK_ELAPSED_MAX = 300;   // 超过 5 小时不像一次训练(早上勾了一项、晚上才打卡),就当没有
function _wkDays() { try { return JSON.parse(localStorage.getItem(nsKey(WK_DAY_KEY)) || '{}') || {}; } catch (e) { return {}; } }
function _wkDaysSave(a) {
  const old = addDays(todayStr(), -7);
  for (const k of Object.keys(a)) if (k < old) delete a[k];
  try { localStorage.setItem(nsKey(WK_DAY_KEY), JSON.stringify(a)); } catch (e) { }
}
function wkStartAt(date) { const d = _wkDays()[date]; return (d && d.t0) || 0; }
function wkMarkStart(date) {
  if (date !== todayStr()) return;
  const a = _wkDays(), d = a[date] || (a[date] = { s: {} });
  if (d.t0) return;
  d.t0 = Date.now();
  _wkDaysSave(a);
}
// 实际用时(分钟,至少 1);没有开练时间、或长得不像一次训练就是 null
function wkElapsedMin(date, at) {
  const t0 = wkStartAt(date); if (!t0) return null;
  const m = Math.round(((at || Date.now()) - t0) / 60000);
  return m >= 0 && m <= WK_ELAPSED_MAX ? Math.max(1, m) : null;
}
// 一条打卡记录里的实际用时(分钟);老记录没有这个字段、或者值不对(导入的备份)都是 0
function wkLogMin(lg) { const m = Math.round(+(lg && lg.elapsedMin)); return m > 0 && m <= WK_ELAPSED_MAX ? m : 0; }

let _pendingRpeDate = null;
let _pendingRpeDay = null;
let _editingLogIdx = null;
let _rpeElapsed = null;   // 打卡面板打开那一刻的实际用时(分钟);挑分数、写备注的时间不算进去

function updateRpeModalLabels() {
  const isOwner = _ownerSession();
  const isX = _xMode && isOwner && hasGoal('女性曲线');
  const titleEl = document.getElementById('rpe-modal-title');
  const descEl = document.getElementById('rpe-modal-desc');
  const noteEl = document.getElementById('rpe-note');
  const extraBox = document.getElementById('rpe-extra');
  if (!titleEl || !descEl || !noteEl) return;

  const buttons = document.querySelectorAll('#rpe-modal .rpe-btn');
  const stdLabels = [
    '毫无感觉', '极度轻松', '轻松', '略感疲劳',
    '适中', '正常训练', '偏难', '困难',
    '极限', '力竭'
  ];
  const ownerLabels = isOwner ? _xLabel('rpeOwner', null) : null;
  const labels = Array.isArray(ownerLabels) && ownerLabels.length === stdLabels.length ? ownerLabels : stdLabels;

  buttons.forEach((btn, idx) => {
    const lbl = btn.querySelector('.rpe-lbl');
    if (lbl && labels[idx]) {
      lbl.innerText = labels[idx];
    }
  });

  if (isX && _xRpeModal(titleEl, descEl, noteEl, extraBox)) return;
  if (extraBox) { extraBox.style.display = 'none'; extraBox.innerHTML = ''; }
  // always reset to standard text so extension text never leaks
  if (isOwner) {
    titleEl.innerText = '训练强度评估';
    descEl.innerText = '选择最接近你今天身体训练强度与身体感受的感受分值';
    noteEl.placeholder = '记录你的训练表现与身体反馈（选填，如：今天腿部发力顺、下背有点紧）';
  } else {
    titleEl.innerText = '疲劳度评估';
    descEl.innerText = '选择最接近你今天训练感受的分数';
    noteEl.placeholder = '有什么想记录的？（选填，如：今天状态不好、卧推加了5kg）';
  }
}

// 打卡面板:点分数 = 选中,再点「完成」才提交(样稿流程);「跳过」照旧直接提交
let _pickedRpe = null;
function _rpeEyebrow(day, text) {
  const el = document.getElementById('rpe-eyebrow'); if (!el) return;
  // 新打卡才有实际用时;编辑旧记录不显示
  _rpeElapsed = day && !text ? wkElapsedMin(day.date) : null;
  // 运动风格:完成数挪进标题下面的数字块(skin-sport.js 60 区),实际用时也在那里
  skinTpl('rpeEyebrow', { el, day, text, elapsed: _rpeElapsed }, () => {
    _rpeElapsedLine(_rpeElapsed);
    if (text) { el.textContent = text; return; }
    if (!day) { el.textContent = '打卡'; return; }
    const p = S.prog[day.date] || {}, c = Object.keys(p).filter(k => p[k]).length;
    el.textContent = `打卡 · ${day.workoutType} · ${c}/${day.exercises.length}`;
  });
}
// 纸墨:说明下面一行「实际用时  48 分钟」(运行时插的节点;没有用时就不出现)
function _rpeElapsedLine(min) {
  let row = document.getElementById('rpe-elapsed');
  if (!min) { if (row) row.remove(); return; }
  const desc = document.getElementById('rpe-modal-desc'); if (!desc) return;
  if (!row) { row = document.createElement('div'); row.id = 'rpe-elapsed'; row.className = 'rpe-elapsed'; desc.insertAdjacentElement('afterend', row); }
  row.innerHTML = `<span class="k">实际用时</span><span class="v">${min}<small> 分钟</small></span>`;
}
function pickRPE(n) {
  _pickedRpe = n;
  document.querySelectorAll('#rpe-modal .rpe-btn').forEach((b, i) => b.setAttribute('aria-checked', String(i + 1 === n)));
  const s = document.getElementById('rpe-submit'); if (s) s.disabled = false;
}
function _rpeResetPick(pre) {
  _pickedRpe = null;
  document.querySelectorAll('#rpe-modal .rpe-btn').forEach(b => b.setAttribute('aria-checked', 'false'));
  const s = document.getElementById('rpe-submit'); if (s) s.disabled = true;
  if (pre) pickRPE(pre);
}
function _rpeOpen(pre) { _rpeResetPick(pre); document.getElementById('rpe-modal').classList.add('open'); }
function submitPickedRPE() { if (_pickedRpe == null) return; submitRPE(_pickedRpe); }

function closeRpeModal() {
  document.getElementById('rpe-modal').classList.remove('open');
  _rpeResetPick();
  _pendingRpeDate = null;
  _pendingRpeDay = null;
  _editingLogIdx = null;
  _rpeElapsed = null;
  _pendingEarlyEnd = false; // 从弹窗外部关闭也复位,否则残留会让"练满"被误判成提前结束、跳过强度评估
}

function editLog(idx) {
  const l = LOG[idx];
  if (!l) return;
  _pendingRpeDate = l.date;
  _pendingRpeDay = null;
  _editingLogIdx = idx;

  document.getElementById('rpe-modal-title').innerText = '编辑记录 (' + l.date.slice(5) + ')';
  document.getElementById('rpe-modal-desc').innerText = '更新您的疲劳度评估和备注信息';
  const noteEl = document.getElementById('rpe-note');
  if (noteEl) noteEl.value = l.note || '';

  updateRpeModalLabels();
  _rpeEyebrow(null, '编辑记录 · ' + l.date.slice(5));
  _rpeOpen(l.rpe);
}

function submitRPE(rpe, isSkip = false) {
  if (!_pendingRpeDate) {
    closeRpeModal();
    return;
  }
  const noteEl = document.getElementById('rpe-note');
  const note = noteEl ? noteEl.value.trim() : '';
  const actualRpe = isSkip ? 6 : rpe;
  let _fbDate = null;   // 这次是新打卡(不是编辑旧记录):收尾后异步要教练反馈
  const moods = ['疲惫', '偏累', '一般', '舒适', '饱满', '充沛', '火热', '极佳', '突破', '力竭'];

  if (_editingLogIdx !== null) {
    // Edit mode
    LOG[_editingLogIdx].rpe = actualRpe;
    LOG[_editingLogIdx].mood = moods[actualRpe - 1] || '一般';
    LOG[_editingLogIdx].note = note;
    ls(K.log, LOG);
    showToast('已更新记录');
  } else if (_pendingRpeDay) {
    // New log mode
    const day = _pendingRpeDay;
    const date = _pendingRpeDate;
    const _dayIsSwim = !!day.isSwimDay;
    const checkedCount = Object.keys(S.prog[date] || {}).filter(k => S.prog[date][k]).length;
    const totalEx = day.exercises.length;

    const isX = _xMode && _ownerSession();
    const xMetrics = isX ? _xCollectMetrics() : null;

    // 防同日重复打卡:重算/改类型后再次打卡会走到这,同一天只保留一条(与全app的日期唯一键一致)
    const _dupIdx = LOG.findIndex(l => l.date === date);
    if (_dupIdx !== -1) LOG.splice(_dupIdx, 1);
    LOG.unshift({
      date: date,
      workout: day.workoutType,
      duration: day.duration,
      ...(_rpeElapsed ? { elapsedMin: _rpeElapsed } : {}),   // 实际用时(分钟,可选;老记录没有)
      exerciseCount: checkedCount,
      rpe: actualRpe,
      exercises: day.exercises.map((ex, i) => ({
        name: ex.name,
        sets: getAdj(date, i, 's', ex.sets),
        reps: getAdj(date, i, 'r', ex.reps),
        unit: ex.unit,
        weight: _effWeight(date, i, ex),
        done: !!(S.prog[date] && S.prog[date][i])
      })),
      mood: moods[actualRpe - 1] || '一般',
      note: note,
      isSwimDay: _dayIsSwim,
      subMetrics: xMetrics
    });
    ls(K.log, LOG);
    _fbDate = date;

    if (isX) _xAfterCheckin(date, xMetrics);

    if (!_dayIsSwim) {
      const isManual = (S.autoVolumeAdjust === false);
      const volChk = document.getElementById('chk-reduce-volume');
      const userWantsReduce = isManual && uiBoxOn(volChk);
      const m0 = S.volumeMultiplier || 1.0;
      const pct = () => Math.round(Math.abs((S.volumeMultiplier || 1.0) / m0 - 1) * 100);
      // 系数变了才重排今天之后的天(手动改过的、AI 采纳的、已锁定的不动)，新系数才真正作用到接下来的训练
      const applyVol = () => { if (Math.abs((S.volumeMultiplier || 1.0) - m0) > 1e-6) setTimeout(() => { genPlan(true, false, true); }, 100); };

      if (isManual) {
        if (_pendingEarlyEnd && !userWantsReduce) {
          showToast(`打卡成功！已按您的设置保留当前计划训练量`);
        } else if (userWantsReduce) {
          S.volumeMultiplier = Math.max(0.5, m0 * 0.93);
          showToast(`已按您的选择下调后续训练量 ${pct()}%`);
          applyVol();
        } else {
          const assessment = assessPlanIntensity();
          if (assessment.cls === 'intensity-over') {
            S.volumeMultiplier = Math.max(0.5, m0 * 0.93);
            showToast(`强度超标：后续训练量已自动下调 ${pct()}%`);
            applyVol();
          } else {
            showToast(`打卡成功！`);
          }
        }
      } else {
        const assessment = assessPlanIntensity();
        let toastMsg = '';
        if (assessment.cls === 'intensity-over') {
          S.volumeMultiplier = Math.max(0.5, m0 * 0.93);
          toastMsg = `强度超标：后续训练量已自动下调 ${pct()}%`;
        } else if (assessment.cls === 'intensity-under') {
          S.volumeMultiplier = Math.min(1.5, m0 * 1.03);
          toastMsg = `强度低于能力：已自动上调后续训练量 ${pct()}%`;
        } else {
          if (m0 > 1.0) S.volumeMultiplier = Math.max(1.0, m0 - 0.05);
          if (m0 < 1.0) S.volumeMultiplier = Math.min(1.0, m0 + 0.05);
          toastMsg = `强度适中：完美契合您的体能！`;
        }
        showToast(toastMsg);
        applyVol();
      }

      if (day.workoutType !== '轻量替代') checkGymMilestone(); // recovery day doesn't count toward strength milestones
    } else {
      showToast(isSkip ? `游泳训练完成！` : `游泳完成。RPE ${actualRpe}/10`);
      checkSwimMilestone();
    }

    // Save weight history per exercise
    // 同一天再次打卡(重算/改完再打一次)会走到这:先删掉这一天已有的重量记录再写,否则同一天记两条,1RM 估算和进步图都被带偏
    Object.keys(W_HIST).forEach(n => { W_HIST[n] = W_HIST[n].filter(h => h.date !== date); if (!W_HIST[n].length) delete W_HIST[n]; });
    day.exercises.forEach((ex, i) => {
      const w = _effWeight(date, i, ex); // 没手动改则回退建议值,保证照做也进历史
      if (w && w > 0 && needsWeightUI(ex) && S.prog[date] && S.prog[date][i]) { // only record weight for exercises actually completed
        if (!W_HIST[ex.name]) W_HIST[ex.name] = [];
        W_HIST[ex.name].push({ date, weight: w, rpe: (getExRpe(date, i) ?? actualRpe), period: S.periodMode, reps: getAdj(date, i, 'r', ex.reps) }); // 逐动作RPE优先(无则用整场RPE);reps=实际调整次数 → 估算 1RM
        if (W_HIST[ex.name].length > 50) W_HIST[ex.name] = W_HIST[ex.name].slice(-50);
      }
    });
    ls(K.wh, W_HIST);

    // Re-lock: remove from unlockedDates if it was previously unlocked
    if (S.unlockedDates && S.unlockedDates.includes(date)) {
      S.unlockedDates = S.unlockedDates.filter(d => d !== date);
    }
    playWorkoutCompleteSound();
  }

  if (noteEl) noteEl.value = '';

  // Reset modal text back to default for next time
  document.getElementById('rpe-modal-title').innerText = '今日疲劳度评估';
  document.getElementById('rpe-modal-desc').innerText = '选择最接近你今天训练感受的分数';
  const volRow = document.getElementById('volume-down-row');
  if (volRow) volRow.style.display = 'none';
  _pendingEarlyEnd = false;

  closeRpeModal();
  saveState(); render();
  if (typeof renderStats === 'function') renderStats(); // Refresh stats view
  if (typeof renderLog === 'function') renderLog(); // Refresh log view
  // 打卡已经落盘、弹窗已关;AI 反馈后台去要,慢了失败了都不挡打卡
  if (_fbDate && typeof coachAfterCheckin === 'function') { try { coachAfterCheckin(_fbDate, { skipped: isSkip }); } catch (e) { } }
}

let _pendingEarlyEnd = false;

function endWorkoutEarly(date) {
  const day = S.plan.days.find(d => d.date === date);
  if (!day) return;
  const checkedCount = Object.keys(S.prog[date] || {}).filter(k => S.prog[date][k]).length;
  const totalEx = day.exercises.length;

  _pendingRpeDate = date;
  _pendingRpeDay = day;
  _pendingEarlyEnd = (checkedCount < totalEx);

  const volRow = document.getElementById('volume-down-row');
  const volChk = document.getElementById('chk-reduce-volume');
  const manualMode = (S.autoVolumeAdjust === false);
  if (volRow) {
    volRow.style.display = (manualMode && checkedCount < totalEx) ? 'block' : 'none';
    uiSetBox(volChk, false);
  }
  _rpeEyebrow(day);

  document.getElementById('rpe-modal-title').innerText = checkedCount < totalEx ? '训练提前结束打卡' : '训练完成打卡';
  document.getElementById('rpe-modal-desc').innerText = `已完成 ${checkedCount}/${totalEx} 个动作，请评估今日的疲劳度：`;
  updateRpeModalLabels();
  _rpeOpen();
}

function tog(date, ei) {
  // If date is locked, do nothing (safety guard)
  const dayCheck = S.plan.days.find(d => d.date === date);
  if (dayCheck && isLocked(dayCheck)) return;

  if (!S.prog[date]) S.prog[date] = {};
  S.prog[date][ei] = !S.prog[date][ei];

  if (S.prog[date][ei]) {
    wkMarkStart(date);
    playExerciseDoneSound();
    if (_xMode && _ownerSession()) {
      const m = _xPick('tog_toast');
      if (m) showToast(m, 2500);
    }
  }

  saveState(); render();

  // Auto rest timer when checking off an exercise (not unchecking)
  // Skip auto timer for swim days (swimming is continuous, not set-based)
  const day = S.plan.days.find(d => d.date === date);
  if (S.prog[date][ei] && !isDone(day) && (S.restDur || 45) > 0 && !day.isSwimDay) {
    startTimer(S.restDur || 45, '组间休息');
  }

  // 勾满一天就弹打卡(全app以"日期"为唯一打卡键;曾用 date+类型 → 重算改类型后同日可二次打卡)
  if (day && isDone(day)) _maybeOpenRpe(date);
}

// ══ Exercise Swap ════════════════════════════════════════
// 「换 / 划掉」面板:原因 chip → 同肌群备选(点了就换) → 只今天划掉 / 永久排除。
// 热身 / 纯拉伸不换(swapExercise 照旧给提示),只能从块里点「划掉」打开没有备选的面板。
let _swapReason = '', _swapShowAll = false, _swapCtx = null;
const SWAP_REASONS = [['器械被占'], ['做着不舒服'], ['太难了'], ['健身房没有']];
function _swapAltsFor(sel, ex) {
  const isSwimEx = ex.group === 'swimming' || ex.swimPhase;
  const excluded = getExcluded();
  const used = sel.exercises.map(e => e.name);
  if (isSwimEx) {
    const maxDiff = S.swimLevel === '入门' ? 1 : S.swimLevel === '进阶' ? 2 : 3;
    return (DB.swimming || []).filter(e => e.swimPhase === ex.swimPhase && e.n !== ex.name && !used.includes(e.n) && !excluded.has(e.n) && e.diff <= maxDiff);
  }
  let group = null;
  for (const [g, exs] of Object.entries(DB)) { if (exs.find(e => e.n === ex.name)) { group = g; break } }
  if (!group) return null;
  return DB[group].filter(e => e.n !== ex.name && !used.includes(e.n) && !excluded.has(e.n) && (!e.eq || e.eq.some(q => q === '无器材' || S.equip.includes(q))));
}
function _swapModalEl() {
  let modal = document.getElementById('swap-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'swap-modal';
    modal.className = 'ex-modal-overlay';
    modal.onclick = e => { if (e.target === modal) modal.classList.remove('open'); };
    document.body.appendChild(modal);
  }
  return modal;
}
function swapExercise(date, ei) {
  const sel = S.plan.days.find(d => d.date === date);
  if (!sel) return;
  const ex = sel.exercises[ei];
  // 拉伸块里能上重量的(翘臀美背肩颈模块的面拉、俯卧YTW)也能换;纯拉伸/热身不换
  if (ex.isWarmup || (ex.isStretch && !isWeightedMove(ex.name))) { showToast('热身/拉伸不支持替换'); return }
  const alts = _swapAltsFor(sel, ex);
  if (alts === null) { showToast('找不到替代动作'); return }
  window._swapAlts = alts;   // doSwap 按下标取
  openSwapSheet(date, ei, true);
}
function openSwapSheet(date, ei, withAlts) {
  const sel = S.plan && S.plan.days.find(d => d.date === date);
  if (!sel || !sel.exercises[ei]) return;
  if (!withAlts) window._swapAlts = [];
  _swapCtx = { date, ei, byName: null };
  _swapReason = ''; _swapShowAll = false;
  _renderSwapSheet();
  _swapModalEl().classList.add('open');
}
// 动作详情里没有日期时(历史记录、AI 草稿):按名字永久排除
function openExcludeByName(name) {
  _swapCtx = { byName: name };
  _swapReason = ''; window._swapAlts = [];
  _renderSwapSheet();
  _swapModalEl().classList.add('open');
}
function swapSetReason(v) {
  _swapReason = _swapReason === v ? '' : v;
  document.querySelectorAll('#swap-modal [data-group="swapReason"] .chip').forEach(b => { const on = b.dataset.v === _swapReason; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  if (typeof coachSwapOnReason === 'function') coachSwapOnReason();
}
function swapShowAll() { _swapShowAll = true; _renderSwapSheet(); }
function _renderSwapSheet() {
  const modal = _swapModalEl(), c = _swapCtx || {};
  const diffLabel = ['', '★', '★★', '★★★'];
  if (c.byName) {
    modal.innerHTML = skinTpl('swapSheetByName', { name: c.byName, reason: _swapReason }, () => `<div class="ex-modal-card" onclick="event.stopPropagation()"><div class="ex-modal-hdr"><div><div class="sheet-eyebrow">永久排除</div><div class="sheet-title">${_escHtml(c.byName)}</div></div><button class="ex-modal-close" onclick="uiCloseOverlay('swap-modal')">关闭</button></div>`
      + `<span class="sub-label">为什么（选一个，记在排除清单里）</span>${uiChips('', 'swapReason', SWAP_REASONS, v => v === _swapReason)}`
      + `<p class="sheet-desc">后面的计划、换动作、热身和收尾都会避开它；今天和以后的安排里有它的都会删掉。想恢复去「计划 → 07」。</p>`
      + `<button class="btn-line accent" onclick="excludeFromSheet()">✕ 永久排除</button><button class="btn-line" onclick="uiCloseOverlay('swap-modal')">取消</button></div>`);
    return;
  }
  const sel = S.plan.days.find(d => d.date === c.date), ex = sel && sel.exercises[c.ei];
  if (!ex) { modal.classList.remove('open'); return; }
  const alts = window._swapAlts || [];
  const pos = sel.exercises.filter((e, i) => i <= c.ei && !e.isWarmup && !(e.isStretch && !isWeightedMove(e.name))).length;
  const canSwap = !(ex.isWarmup || (ex.isStretch && !isWeightedMove(ex.name)));
  const shown = _swapShowAll ? alts : alts.slice(0, 3);
  const aiOn = typeof coachAccess === 'function' && coachAccess() === 'on';
  const optHtml = (alt, idx) => {
    const unit = alt.u || '次', reps = _swapReps(ex, alt);
    const last = W_HIST[alt.n] ? W_HIST[alt.n][W_HIST[alt.n].length - 1].weight : null;
    return `<button type="button" class="swap-option" onclick="doSwap('${c.date}',${c.ei},${idx})"><span><span class="so-n">${alt.n}</span><span class="so-s">${ex.sets}×${reps}${unit}${last ? ` · 上次 ${last} kg` : ''} · ${diffLabel[alt.diff || 1]}</span></span>${alt.note ? `<span class="so-note">${alt.note}</span>` : ''}</button>`;
  };
  // 运动风格换结构(skin-sport.js 60 区);ctx 给它同一份数据,点了调的函数和纸墨一样
  modal.innerHTML = skinTpl('swapSheet', { date: c.date, ei: c.ei, sel, ex, alts, pos, canSwap, aiOn, reason: _swapReason, showAll: _swapShowAll }, () => `<div class="ex-modal-card" onclick="event.stopPropagation()">`
    + `<div class="ex-modal-hdr"><div><div class="sheet-eyebrow">${canSwap ? '换掉' : '划掉'}${canSwap && pos ? ` · ${String(pos).padStart(2, '0')}` : ''}</div><div class="sheet-title">${_escHtml(ex.name)}</div></div><button class="ex-modal-close" onclick="uiCloseOverlay('swap-modal')">关闭</button></div>`
    + uiChips('', 'swapReason', SWAP_REASONS, v => v === _swapReason)
    + (canSwap && aiOn && typeof coachSwapHtml === 'function' ? coachSwapHtml(c.date, c.ei) : '')
    + (canSwap ? (alts.length ? `<div class="sheet-eyebrow" style="margin-top:4px">[ 同肌群 · 按规则 ]</div><div>${shown.map((a) => optHtml(a, alts.indexOf(a))).join('')}`
      + (!_swapShowAll && alts.length > 3 ? `<button type="button" class="swap-option swap-more" onclick="swapShowAll()"><span class="so-s" style="margin:0">其他同肌群动作 ${alts.length - 3} 个 →</span></button>` : '') + `</div>`
      : `<p class="sheet-desc">没有更多同肌群的备选，可以只今天划掉，或者永久排除。</p>`)
      : `<p class="sheet-desc">热身 / 拉伸不换，可以只今天划掉，或者永久排除。</p>`)
    + `<div class="btn-row" style="border-top:1px solid var(--line);padding-top:12px"><button class="btn-line" onclick="strikeToday('${c.date}',${c.ei})">只今天划掉</button><button class="btn-line accent" onclick="excludeFromSheet()">✕ 永久排除</button></div>`
    + (aiOn ? `<button type="button" class="link-btn u" onclick="uiCloseOverlay('swap-modal');coachAskAbout('${_q(ex.name)}','换')">问教练怎么换</button>` : '')
    + `<button class="btn-line" onclick="uiCloseOverlay('swap-modal')">关闭</button></div>`);
}
function excludeFromSheet() {
  const c = _swapCtx || {};
  uiCloseOverlay('swap-modal');
  const reason = _swapReason || '用户手动排除';
  if (c.byName) { excludeUserExerciseByName(c.byName, reason); return; }
  excludeUserExercise(c.date, c.ei, reason);
}
window.openSwapSheet = openSwapSheet;
window.openExcludeByName = openExcludeByName;

function doSwap(date, ei, altIdx) {
  const alt = window._swapAlts[altIdx];
  if (alt) _applySwap(date, ei, alt);
}
// 把某天第 ei 个动作换成库里的 alt(只改数据,不落盘不刷新)。o = {sets, reps, kg}:AI 给了就用,不给沿用原来的量
function _swapInto(date, ei, alt, o = {}) {
  const sel = S.plan && S.plan.days.find(d => d.date === date);
  if (!sel || !sel.exercises[ei] || !alt) return false;
  sel._edited = true;
  const ex = sel.exercises[ei];
  const newUnit = alt.u || '次';
  // 单位不变沿用原来的量(swim 分钟↔分钟、gym 次↔次;旧代码把 分钟 一律压成 1);
  // 新动作写明了 hold 的以 hold 为准(规矩③)
  const newReps = o.reps || _swapReps(ex, alt);
  // Carry muscle/group/diff/swimPhase so render tags, the swim-phase grouping, and a
  // second swap's swim-detection don't break.
  sel.exercises[ei] = { name: alt.n, note: alt.note || '', sets: o.sets || ex.sets, reps: newReps, unit: newUnit, group: ex.group, muscle: alt.muscle || [], diff: alt.diff, isWarmup: false, isStretch: false, bi: !!alt.bi };
  if (alt.swimPhase) sel.exercises[ei].swimPhase = alt.swimPhase;
  // The new exercise inherits a fresh slot — drop the previous exercise's weight/adjust/done/rpe.
  _clearExState(date, ei);
  // AI 给的是建议重量,还没举过:直接写进当天的重量格,不走 setWeight(那里会当成新纪录记 PR)
  if (o.kg > 0 && needsWeightUI(sel.exercises[ei])) { if (!S.weights) S.weights = {}; S.weights[date + '-' + ei] = o.kg; }
  return true;
}
function _applySwap(date, ei, alt, o) {
  if (!_swapInto(date, ei, alt, o)) return;
  const m = document.getElementById('swap-modal'); if (m) m.classList.remove('open');
  saveState(); render();
  showToast(`已替换为 ${alt.n}`);
}

function adj(date, ei, f, delta) {
  const k = date + '-' + ei + '-' + f;
  const day = S.plan.days.find(d => d.date === date);
  if (day) day._edited = true;
  const ex = day.exercises[ei];
  const base = f === 's' ? ex.sets : ex.reps;
  // 按秒计的动作一次调 5 秒(30→45 不用点 15 下),最少 5 秒;其余一次 1
  const secStep = f === 'r' && ex.unit === '秒';
  const step = secStep ? 5 : 1, min = secStep ? 5 : 1;
  S.adj[k] = Math.max(min, (S.adj[k] ?? base) + delta * step);
  saveState(); render();
}

function unlockDate(date) {
  if (confirm('确定要解除锁定吗？\n您的动作勾选记录将被保留，但此日将变为可编辑状态。')) {
    if (!S.unlockedDates) S.unlockedDates = [];
    if (!S.unlockedDates.includes(date)) S.unlockedDates.push(date);
    saveState(); render();
    if (typeof renderStats === 'function') renderStats();
    showToast('已解锁 ' + fmtDate(date));
  }
}

function shareWorkout(date) {
  const lg = LOG.find(l => l.date === date);
  if (lg) {
    if (typeof openShareModal === 'function') openShareModal(lg);
  } else {
    alert('未找到打卡记录');
  }
}

// ══ Drag to reorder ════════════════════════════════════
function dragStart(e, date) {
  _dragSrc = date;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function dragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function dragDrop(e, targetDate) {
  e.preventDefault();
  if (!_dragSrc || _dragSrc === targetDate) return;
  const days = S.plan.days;
  const si = days.findIndex(d => d.date === _dragSrc);
  const ti = days.findIndex(d => d.date === targetDate);
  if (si < 0 || ti < 0) return;
  const src = days[si], tgt = days[ti];
  // Only allow swapping unlocked workout days
  if (isLocked(src) || isLocked(tgt)) return;
  // Don't rearrange a day that's already checked in — it would orphan its LOG/progress
  // and (since the dup-guard keys on date) let the day be checked in twice.
  if (LOG.some(l => l.date === src.date) || LOG.some(l => l.date === tgt.date)) return;
  // Swap workout content (keep dates fixed). isSwimDay must travel with the content,
  // or the moved day renders/logs in the wrong (swim vs gym) mode.
  [src.workoutType, tgt.workoutType] = [tgt.workoutType, src.workoutType];
  [src.exercises, tgt.exercises] = [tgt.exercises, src.exercises];
  [src.isRest, tgt.isRest] = [tgt.isRest, src.isRest];
  [src.isSwimDay, tgt.isSwimDay] = [tgt.isSwimDay, src.isSwimDay];
  [src.duration, tgt.duration] = [tgt.duration, src.duration];
  [src._splitGroups, tgt._splitGroups] = [tgt._splitGroups, src._splitGroups]; // 按肌群挑额外动作要靠它
  [src.isPrivateDay, tgt.isPrivateDay] = [tgt.isPrivateDay, src.isPrivateDay];
  _swapDayState(src.date, tgt.date); // 勾选/重量/组数次数按日期存,跟着内容一起换,避免"勾了一半没打卡"的天错位
  saveState(); render();
  showToast('已交换训练顺序');
}
function dragEnd() { _dragSrc = null; document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging')); }

// ══ Touch drag (mobile) ═════════════════════════════════
let _touchSrc = null, _touchEl = null, _touchClone = null;
let _dragStartPt = { x: 0, y: 0 };
function initTouchDrag() {
  const grid = document.getElementById('cal-grid'); if (!grid) return;
  grid.addEventListener('touchstart', e => {
    const dc = e.target.closest('.dc[draggable]'); if (!dc) return;
    if (dc.classList.contains('locked')) return;
    _touchSrc = dc.getAttribute('onclick')?.match(/selectDate\('([^']+)'\)/)?.[1] || null;
    _touchEl = dc; dc.classList.add('dragging');
    const touch = e.touches[0];
    _dragStartPt = { x: touch.clientX, y: touch.clientY };

    const rect = dc.getBoundingClientRect();
    _touchClone = dc.cloneNode(true);
    _touchClone.classList.add('touch-clone');
    _touchClone.style.width = rect.width + 'px';
    _touchClone.style.height = rect.height + 'px';
    _touchClone.style.left = rect.left + 'px';
    _touchClone.style.top = rect.top + 'px';
    document.body.appendChild(_touchClone);
  }, { passive: false });

  grid.addEventListener('touchmove', e => {
    if (!_touchClone) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - _dragStartPt.x;
    const dy = touch.clientY - _dragStartPt.y;
    const rect = _touchEl.getBoundingClientRect();
    _touchClone.style.left = (rect.left + dx) + 'px';
    _touchClone.style.top = (rect.top + dy) + 'px';
  }, { passive: false });

  grid.addEventListener('touchend', e => {
    if (!_touchSrc) { return }
    if (_touchClone) _touchClone.style.display = 'none';
    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.dc');
    if (target && target !== _touchEl) {
      const tDate = target.getAttribute('onclick')?.match(/selectDate\('([^']+)'\)/)?.[1];
      // dragDrop reads the source from _dragSrc (set by the mouse path); the touch
      // path stores it in _touchSrc, so bridge it or the drop is a silent no-op.
      if (tDate) { _dragSrc = _touchSrc; dragDrop({ preventDefault() { } }, tDate); }
    }
    if (_touchEl) _touchEl.classList.remove('dragging');
    if (_touchClone) _touchClone.remove();
    _dragSrc = null; _touchSrc = null; _touchEl = null; _touchClone = null;
  }, { passive: true });
}

// ══ Exercise Detail Modal ═══════════════════════════════
// Detail data inline - key exercises with full breakdown
const EX_DETAIL = {
  // === 替代擦边姿势的正经训练（哥萨克深蹲 / 高跪姿开胸（kneeling chest opener） / 沙发式髋屈肌拉伸）===
  '靠墙静蹲开胯（turnout）': { muscles: ['股四头', '臀', '髋外旋肌'], steps: ['后背贴墙，双脚略宽于肩、脚尖与膝向外旋打开(turnout)', '沿墙下滑半蹲，膝始终对准脚尖方向、保持外旋张力', '保持或缓慢起落'], tips: ['膝别内扣、跟着脚尖外旋', '背贴墙保持躯干直立'], mistakes: ['膝内扣', '塌腰离墙'] },
  '站姿并腿外旋等长（turnout）': { muscles: ['内收肌', '臀中肌'], steps: ['站立、双腿并拢', '想象把两腿向内夹紧的同时、脚掌/膝向外拧旋(对抗)', '在内收与外旋的对抗中等长保持'], tips: ['是"内夹+外旋"同时进行的等长对抗', '臀侧与大腿内侧同时有感'], mistakes: ['只做单方向', '憋气'] },
  '仰卧弹力带髋外展保持': { muscles: ['内收肌', '臀中肌(外展)'], steps: ['仰卧、双腿向上伸直，弹力带套于膝上方', '对抗弹力带向两侧打开成V', '在打开位静态保持，再控制合拢'], tips: ['打开靠外展肌、合拢靠内收肌，两端都慢', '下背贴地'], mistakes: ['用惯性弹开', '塌腰离地'] },
  '高跪姿挺髋保持（kneeling hip thrust hold）': { muscles: ['臀大肌', '核心(抗伸展)'], steps: ['高跪姿、髋完全伸直、躯干与大腿成一线', '夹臀顶髋至骨盆中立、收紧核心', '等长静力保持，不塌腰、不撅臀'], tips: ['力在臀和核心、不在腰', '从头到膝一条直线'], mistakes: ['塌腰顶肚子', '坐向脚跟'] },
  '双腿relevé踮立保持': { muscles: ['小腿', '踝稳定', '平衡'], steps: ['站直、收紧核心', '提踵到最高、用前脚掌/足尖支撑', '保持挺拔静力站立，缓慢落下'], tips: ['脚趾抓地帮助平衡、晃就扶物', '想象头顶向上拔'], mistakes: ['脚踝外翻', '塌腰撅臀'] },
  '颈深屈肌保持（chin tuck hold）': { muscles: ['颈深屈肌'], steps: ['跪或坐直、目视前方', '轻收下巴(做双下巴)、颈椎中立', '维持该姿态做耐久保持，肩放松'], tips: ['力度轻、是收下巴不是低头', '改善头前伸/乌龟颈'], mistakes: ['变成低头', '耸肩'] },
  '跪姿手腕拉伸（wrist stretch）': { muscles: ['前臂', '腕关节'], steps: ['跪姿、手掌贴地(指尖朝前，进阶朝向膝盖)', '缓慢把体重加载到手腕、前臂屈伸肌', '静力支撑保持，换方向'], tips: ['循序渐进、痛就减载', '强化腕部稳定与抗压'], mistakes: ['一次加载太猛', '耸肩塌腕'] },
  '哥萨克深蹲': { muscles: ['内收肌', '臀', '股四头'], steps: ['双脚宽于肩、脚尖略外', '重心移向一侧、该腿屈髋屈膝深蹲到底，另一腿伸直、脚尖勾起朝上', '脚跟踩实站起或平移到另一侧，左右交替'], tips: ['下蹲腿脚跟尽量不离地、膝对脚尖', '柔韧不够先扶物或减小深度', '可手持哑铃/壶铃于胸前加重'], mistakes: ['塌腰圆背', '伸直腿那侧脚外翻'] },
  '高跪姿开胸（kneeling chest opener）': { muscles: ['核心(抗伸展)', '臀', '后肩'], steps: ['双膝着地成高跪姿，髋完全伸直、躯干与大腿成一直线', '双臂向后下方伸展、肩胛后缩、挺胸', '收紧核心与臀抵住向后倒的力，骨盆中立不塌腰，静态保持'], tips: ['想象从头到膝一条直线、别用塌腰假挺', '可双手握弹力带向后拉增加后肩刺激'], mistakes: ['塌腰顶肚子', '耸肩', '坐向脚跟'] },
  '沙发式髋屈肌拉伸': { muscles: ['髂腰肌', '股四头'], steps: ['面向墙/沙发跪姿，后腿小腿胫骨贴墙、膝顶墙根，前腿屈膝踩地成弓步', '收紧后侧臀、骨盆后倾(收尾骨)，上身立直', '感受后髋前侧与大腿前侧强拉伸，两侧各30-60秒'], tips: ['骨盆后倾才拉得到髂腰肌、别塌腰代偿', '太强先把膝离墙远一点'], mistakes: ['塌腰把拉伸躲掉', '上身前倾'] },
  // === 臀/髋/腿 补充 2（髋环绕 / 相扑深蹲 / 俯卧挺髋 / 侧平板髋部下沉（side plank hip dip））===
  '四足髋绕环（hip CARs）': { muscles: ['臀中肌', '髋外旋肌'], steps: ['四足跪姿，手在肩下、膝在髋下', '一侧屈膝腿向外、向上、向后画大圈(髋 CARs)', '缓慢控制最大幅度，顺逆各转后换边'], tips: ['越慢越大幅度越好', '骨盆尽量稳、靠髋去画'], mistakes: ['用腰晃代替髋', '速度太快'] },
  '相扑深蹲': { muscles: ['臀', '内收肌', '股四头'], steps: ['双脚明显宽于肩、脚尖外旋约45°', '挺胸收腹，臀向下坐到大腿接近平行', '脚跟踩实站起、顶端夹臀'], tips: ['膝盖对准脚尖方向', '可双手托哑铃/壶铃于胸前加重'], mistakes: ['膝盖内扣', '脚跟离地'] },
  '俯卧挺髋抬腿': { muscles: ['臀大肌', '腘绳'], steps: ['俯卧、额头枕手，骨盆压实地面', '单腿伸直向后上方抬起', '顶端夹臀停留，缓慢回放后换边'], tips: ['用臀发力、不要塌腰过伸', '抬到臀部收紧即可'], mistakes: ['塌腰用下背', '骨盆离地'] },
  '侧平板髋部下沉（side plank hip dip）': { muscles: ['腹斜', '臀中肌'], steps: ['侧平板支撑、身体成一条线', '髋部缓慢向下沉接近地面', '再用侧腰/臀侧发力顶回，重复后换边'], tips: ['全程一条直线、不前后倒', '慢起慢落'], mistakes: ['塌腰', '髋向前转'] },
  // === 臀/髋 补充（蛙式臀桥 / 消防栓式 / 驴踢 / 骨盆控制）===
  '消防栓式': { muscles: ['臀中肌'], steps: ['四足跪姿，手在肩下、膝在髋下', '保持屈膝90°，单腿向侧上方抬起(髋外展)', '顶峰挤压臀侧停留1秒，缓慢回放后换边'], tips: ['骨盆保持朝下、别跟着翻', '以臀侧发力为准、不靠甩'], mistakes: ['骨盆侧翻借力', '用腰代偿'] },
  '蛙式臀桥': { muscles: ['臀', '内收肌'], steps: ['仰卧，脚心相对、膝向两侧打开(蛙式)', '顶髋抬臀至顶端、夹臀', '顶端停留后缓慢下放，不完全落地'], tips: ['用臀发力、膝保持外展', '想象把耻骨推向天花板'], mistakes: ['塌腰用腰顶', '膝盖夹回去'] },
  '跪姿后踢腿': { muscles: ['臀大肌'], steps: ['四足跪姿、核心收紧', '屈膝腿(脚跟朝上)向后上方踢起', '顶端夹臀停留，缓慢回放后换边'], tips: ['踢到与躯干水平即可、别塌腰过伸', '全程脚跟朝天'], mistakes: ['塌腰借力', '骨盆歪斜'] },
  '骨盆前后倾（pelvic tilt）': { muscles: ['骨盆控制', '核心'], steps: ['仰卧屈膝(或站/跪)', '骨盆后倾：腰贴地、收尾骨；前倾：轻微塌腰、翘尾骨', '两端来回缓慢、精准控制'], tips: ['主动控制骨盆——翘臀靠前倾、收腰靠后倾', '动作小而准'], mistakes: ['整段腰大幅晃', '憋气'] },
  // === 平衡 / 单腿稳定（平衡稳定 模块）===
  '单腿站立': { muscles: ['踝稳定', '核心'], steps: ['单脚站立，另一脚抬离地面', '收紧核心、目视前方保持', '进阶可闭眼或站软垫上，换边'], tips: ['脚趾轻抓地帮助稳定', '晃就先睁眼/手扶墙'], mistakes: ['憋气', '骨盆歪斜'] },
  '单腿硬拉': { muscles: ['臀', '腘绳', '平衡'], steps: ['单腿微屈站立', '髋向后铰链、上身前倾，后腿向后伸成一线', '背平直、臀腿发力站起，换边'], tips: ['想象后脚跟向后推墙', '先扶物找到平衡再脱手或加哑铃'], mistakes: ['弓背', '膝盖锁死', '骨盆打开转胯'] },
  '单腿臀桥': { muscles: ['臀', '骨盆稳定'], steps: ['仰卧屈一膝、另一腿伸直', '支撑腿发力顶髋至身体一线', '骨盆保持水平不下掉，换边'], tips: ['用臀不用腰', '骨盆两侧等高'], mistakes: ['塌腰', '骨盆歪向一侧'] },
  '燕式平衡': { muscles: ['臀', '平衡', '下背'], steps: ['单腿站立', '上身前倾、对侧腿向后抬，与背成一条直线(飞机式)', '双臂平展帮助平衡，保持后换边'], tips: ['核心收紧、视线落地面前方'], mistakes: ['弓背塌腰', '骨盆侧翻'] },
  // === 开髋放松 / 脊柱流动 / 臀桥开合 ===
  '下犬式': { muscles: ['腘绳', '小腿', '肩背'], steps: ['四足跪姿，脚趾踩地', '臀向上向后顶起，伸直腿与背成倒V', '脚跟向下踩、头颈放松在两臂之间'], tips: ['背伸不直就先微屈膝、把背拉长优先', '双手压实、肩远离耳朵'], mistakes: ['含胸圆背', '耸肩'] },
  '臀桥开合': { muscles: ['臀大肌', '臀中肌'], steps: ['仰卧臀桥顶到最高、夹紧臀(完全伸髋)', '保持高度，把双膝向两侧缓慢打开', '再合拢，全程顶髋不掉、重复'], tips: ['可膝上套弹力带加阻力', '骨盆别下沉、靠臀控制'], mistakes: ['打开时臀掉下来', '用腰顶'] },
  '仰卧快乐婴儿式': { muscles: ['髋', '盆底'], steps: ['仰卧屈膝，双手抓两脚外缘(或脚踝/小腿)', '膝向两侧腋下方向打开下压、脚掌朝上', '下背贴地放松，可轻轻左右摇'], tips: ['深层开髋同时放松盆底', '够不到脚就抓小腿或用弹力带'], mistakes: ['抬头耸肩', '下背拱离地'] },
  '仰卧束角式': { muscles: ['髋', '内收肌'], steps: ['仰卧，脚心相对、膝向两侧自然落下', '双臂放松置于体侧，平躺', '深呼吸停留(膝下可垫枕更舒适)'], tips: ['极温和的开髋与放松、适合收尾', '不强压膝、让其自然下沉'], mistakes: ['用力压膝', '憋气'] },
  '下犬到上犬流动': { muscles: ['脊柱', '核心'], steps: ['从下犬式开始', '髋下沉、胸推向前过渡到上犬，一节节滚动脊柱', '再反向卷回下犬，像波浪般连贯'], tips: ['逐节带动脊柱、配合呼吸', '幅度由小到大'], mistakes: ['整段僵着移动', '塌腰过猛'] },
  '四足跪姿躯干绕环': { muscles: ['脊柱', '核心'], steps: ['四足跪姿，手在肩下、膝在髋下', '让胸腔与骨盆配合做大幅度圆周', '顺时针若干圈后逆时针，缓慢有控制'], tips: ['解锁僵硬躯干、活动整段脊柱', '动作大而慢'], mistakes: ['只晃骨盆不动胸椎', '速度太快'] },
  // === 体态 / 盆底 补充（肩胛后缩 / 收下巴 / 凯格尔）===
  '肩胛后缩保持': { muscles: ['菱形肌', '中斜方肌'], steps: ['坐/站直，胸口微挺', '双侧肩胛骨向脊柱中线收拢、同时向下沉', '保持(别耸肩)，再缓慢放松'], tips: ['想象把肩胛骨放进后裤兜', '可双手持弹力带辅助'], mistakes: ['耸肩', '靠挺腰代偿'] },
  '收下巴': { muscles: ['颈深屈肌'], steps: ['坐/站直、目视前方', '轻轻把下巴向后收(做双下巴)、后脑勺微向后上', '保持几秒、肩放松，重复'], tips: ['改善头前伸/乌龟颈、拉长颈线', '力度很轻、不是低头'], mistakes: ['变成低头', '耸肩'] },
  '头顶书本走姿（poise walk）': { muscles: ['颈深屈肌', '竖脊肌', '核心'], steps: ['站直，把一本不太重的平装书平放在头顶正中', '下巴微收、头顶向上延伸，肩胛下沉、两肩放松', '沿直线慢走，步子比平时小一点，脚跟先着地再过渡到前脚掌', '走到头转身再走回来，全程让书保持水平不掉'], tips: ['书掉了多半是头在往前探或身体上下起伏，放慢再来', '眼睛平视前方，不要低头看脚', '先原地顶着书站稳 10 秒再开始走'], mistakes: ['为了稳住书耸肩、脖子僵住', '挺腰塌背、肋骨外翻', '低头看书或看地面'] },
  '猫步走（catwalk）': { muscles: ['臀中肌', '核心', '小腿'], steps: ['在地上找一条直线(地板缝或贴一条胶带)', '每一步前脚落在线上，脚尖略朝前外，前脚掌先着地', '骨盆随步子自然左右送，上身保持稳定、肩膀不跟着晃', '目视前方，双臂自然摆动，一步一步匀速走'], tips: ['靠支撑腿的臀中肌稳住骨盆，骨盆的摆动是走出来的，不要刻意扭', '先赤脚或穿平底鞋练熟，再换带跟的鞋'], mistakes: ['腿交叉过线导致绊脚、膝盖内扣', '上身左右大幅扭动', '低头看线'] },
  '靠墙站立体态检查（wall posture check）': { muscles: ['竖脊肌', '中下斜方肌', '颈深屈肌', '核心'], steps: ['背靠墙站，脚跟离墙约一拳', '后脑勺、上背、臀部贴墙，小腿肚尽量贴墙', '手伸到腰后：腰和墙之间大约留一掌厚，多了就轻轻收腹让骨盆微微后倾', '肩胛下沉、下巴微收，正常呼吸，记住这个位置', '慢慢离开墙，带着这个姿势走几步'], tips: ['后脑勺贴不上墙说明头往前探，先用收下巴把头带回来，别仰头去贴', '每天固定一个时间做一次(比如刷牙后)，容易养成习惯'], mistakes: ['为了让腰贴墙过度收腹、骨盆后倾太多', '仰头让后脑勺贴墙', '耸肩、手臂用力往墙上压'] },
  '凯格尔盆底收缩': { muscles: ['骨盆底肌'], steps: ['任意姿势、放松呼吸', '像憋尿/止住排气一样收紧盆底肌', '保持5-10秒后完全放松，重复约10次(整套约2分钟，按屏幕计时)'], tips: ['和"盆底放松呼吸"配合——既要会收也要会放', '别夹臀、收腹或屏气代偿'], mistakes: ['用臀/腹/大腿代偿', '只收不放松'] },
  // === 脚踝灵活 / 小腿（少练小腿，重灵活）===
  '脚踝绕环': { muscles: ['踝'], steps: ['坐或站、抬起一只脚', '脚踝带动脚掌缓慢画大圈', '顺/逆时针各转后换脚'], tips: ['幅度尽量大、速度慢', '走路/运动前后都该常做'], mistakes: ['只动脚趾不动踝', '转太快'] },
  '腓肠肌拉伸': { muscles: ['腓肠肌(小腿上部)'], steps: ['弓步，后腿伸直、脚跟踩地', '重心前压，感受后小腿上部拉伸', '两侧各30-60秒'], tips: ['后脚尖朝正前、脚跟别离地'], mistakes: ['脚跟抬起', '含胸弓背'] },
  '比目鱼肌拉伸': { muscles: ['比目鱼肌(小腿深层)'], steps: ['弓步，后腿微屈膝、脚跟踩地', '身体下沉，感受小腿更深处', '两侧各30-60秒'], tips: ['和腓肠肌拉伸的区别在后膝微弯'], mistakes: ['膝盖打太直(变成拉腓肠肌)'] },
  '跪姿踝背屈': { muscles: ['踝背屈'], steps: ['跪姿，一脚在前屈膝', '身体前压让膝越过脚尖、脚跟不离地', '感受脚踝前侧打开，换边'], tips: ['增加踝背屈→深蹲更深、踝部更稳'], mistakes: ['脚跟离地', '膝盖内扣'] },
  // === 姿势保持 / 稳定 / 体态（柔韧·体态 模块）===
  '靠墙静蹲': { muscles: ['股四头', '臀'], steps: ['背紧贴墙，双脚前移约与肩同宽', '下蹲到大腿与地面平行、膝约90°', '静态保持，均匀呼吸'], tips: ['膝盖对准脚尖、不超脚尖', '想加难度可单手扶或踮脚尖'], mistakes: ['臀高于膝偷懒', '憋气'] },
  '深蹲保持': { muscles: ['髋', '踝', '股四头'], steps: ['双脚略宽于肩、脚尖微外', '全蹲到底，脚掌(尤其脚跟)踩实', '胸口打开，放松髋踝静态保持'], tips: ['脚跟踩不住可垫薄物', '用手肘轻顶膝盖帮助开髋'], mistakes: ['脚跟离地', '含胸圆背'] },
  '臀桥保持': { muscles: ['臀', '腘绳'], steps: ['仰卧屈膝，脚跟离臀约一拳', '顶髋至肩-髋-膝成一条线', '顶端夹臀静态保持，肋骨不外翻'], tips: ['用臀发力而非腰', '可在膝上加弹力带'], mistakes: ['塌腰用腰顶', '髋没顶到位'] },
  '鸟狗式': { muscles: ['核心', '下背', '臀'], steps: ['四足跪姿，手在肩下、膝在髋下', '对侧手脚同时伸直成一条线', '保持骨盆不晃，停留后换边'], tips: ['想象背上放杯水不洒', '先收紧核心再伸展'], mistakes: ['骨盆左右晃', '腰部下塌'] },
  '门框开胸拉伸': { muscles: ['胸大肌', '三角肌前束'], steps: ['前臂贴门框、肘略高于肩', '身体缓慢前倾/转开，拉开胸与前肩', '两侧各保持30-60秒'], tips: ['改善圆肩、让肩线打开显挺拔', '幅度循序渐进、别猛压'], mistakes: ['耸肩', '弓腰借力'] },
  '胸椎伸展': { muscles: ['胸椎', '胸'], steps: ['坐姿双手抱头，上背靠椅背或泡沫轴', '呼气时上背向后伸展打开，不塌腰', '缓慢来回或停留'], tips: ['动的是上背胸椎、不是腰', '配合深呼吸'], mistakes: ['用腰过度反弓', '憋气'] },
  '颈侧拉伸': { muscles: ['颈侧', '上斜方'], steps: ['坐或站直、收下巴', '头向一侧倒，同侧手轻搭头加一点点重量', '两侧各保持20-30秒'], tips: ['配合"收下巴"改善头前伸/乌龟颈', '只用很轻的力'], mistakes: ['用力猛拉', '耸肩'] },
  // === 柔韧 / 髋灵活 / 盆底（柔韧重点模块）===
  '鸽子式开髋': { muscles: ['臀', '髋屈肌'], steps: ['前腿屈膝外旋、小腿斜放身前，后腿向后伸直', '骨盆摆正、缓慢下沉，上身可前趴加深', '深呼吸保持30-60秒后换边'], tips: ['前膝不适就把小腿收近身体、减小角度', '髋紧可在前侧臀下垫块毛巾'], mistakes: ['骨盆歪斜', '憋气硬压'] },
  '90/90髋旋转': { muscles: ['髋内旋', '髋外旋'], steps: ['坐姿，前腿与后腿各屈约90°', '上身直立，左右倒换两腿练内外旋', '缓慢来回或每侧停留'], tips: ['坐不直就把臀部垫高'], mistakes: ['含胸塌腰代偿'] },
  '青蛙式开胯': { muscles: ['内收肌'], steps: ['四足跪姿，双膝向两侧打开，小腿与大腿约90°', '臀部缓慢向后移到拉伸位再回来', '控制幅度、循序渐进'], tips: ['膝下垫软垫', '只静态拉、不要弹震'], mistakes: ['一次开太大、拉伤腹股沟'] },
  '蝴蝶式': { muscles: ['内收肌', '髋'], steps: ['坐姿两脚掌相对、脚跟靠近身体', '坐骨坐稳、脊柱拉长后上身前倾', '双手可轻压膝盖，保持30-60秒'], tips: ['先坐直再前倾，别弓背'], mistakes: ['弓背低头代替髋前倾'] },
  '仰卧4字臀拉伸': { muscles: ['臀', '梨状肌'], steps: ['仰卧，一脚踝搭在对侧大腿上成"4"字', '双手抱住对侧大腿后侧拉向胸口', '感受臀侧拉伸，换边'], tips: ['头肩放松贴地'], mistakes: ['抬头耸肩'] },
  '猫牛式': { muscles: ['脊柱'], steps: ['四足跪姿，手在肩下、膝在髋下', '吸气塌腰抬头(牛)、呼气拱背低头(猫)', '随呼吸一节节缓慢交替'], tips: ['想象逐节带动脊柱'], mistakes: ['只动头颈、脊柱不动'] },
  '胸椎旋转': { muscles: ['胸椎', '肩'], steps: ['四足跪姿，一手扶头后', '手肘先向地面对侧穿，再向上向后打开旋转', '目光跟随手肘，换边'], tips: ['转的是胸椎、不是腰'], mistakes: ['用腰部代偿旋转'] },
  '盆底放松呼吸': { muscles: ['盆底', '核心'], steps: ['仰卧屈膝或坐姿，缓慢腹式呼吸', '吸气时主动让盆底/会阴向下"松开"(反向凯格尔)', '呼气自然回收，重复10-20次(整套约90秒，按屏幕计时)'], tips: ['这是"放松"不是用力收紧；柔韧与舒适的关键在会放松'], mistakes: ['一直收紧不放松', '憋气'] },
  // === 地板流动 / 开髋（女性曲线专属）===
  '蛙式臀冲': { muscles: ['臀大肌', '内收肌'], steps: ['仰卧，双脚脚心相对，双膝向两侧打开（尽可能贴地）', '依靠臀部发力，将骨盆向上推至最高点', '在顶端用力收紧臀大肌，髋部保持打开'], tips: ['深度刺激臀肌的同时，内收肌与髋部充分放松打开', '用臀发力，不要过度反弓腰椎'], mistakes: ['膝盖在发力时向内合拢', '用腰部代偿'] }, '四足脊柱波浪（cat flow）': { muscles: ['脊柱', '核心'], steps: ['四足跪姿，手臂前伸', '下巴与胸腔贴近地面，像猫一样向前滑动', '重心前移后，拱起背部（像猫式）连贯地退回原位'], tips: ['强调脊柱如波浪般的连贯起伏', '动作可以极其缓慢，培养深层的身体觉知和控制力'], mistakes: ['动作僵硬断层', '只动脖子不动胸椎'] },
  '四足跪姿骨盆绕环（hip circles）': { muscles: ['核心', '骨盆底肌'], steps: ['四足跪姿，保持背部平直，重心稳定', '单独控制骨盆，在空中极其缓慢地画圆', '顺时针和逆时针各画数圈'], tips: ['想象这是卧姿的肚皮舞，深度唤醒腰骶神经与血液循环', '动作幅度可以随控制力逐渐加大'], mistakes: ['整个上半身跟着一起晃动', '速度过快失去肌肉控制'] },
  '深蹲底部左右摇摆（squat rock）': { muscles: ['下肢', '髋外旋'], steps: ['极宽距深蹲到底，双手合十，手肘将双膝向外撑开', '在这个极低的位置，缓慢地将骨盆向左、向右转移重心'], tips: ['在极度打开骨盆的状态下，进一步寻找髋部最深处的拉伸感', '全程保持平稳呼吸，接纳拉扯感'], mistakes: ['重心不稳导致脚跟离地'] },
  '仰卧大V字开合': { muscles: ['内收肌', '核心'], steps: ['仰卧，双腿笔直抬向天花板', '在完全伸直的状态下，缓慢向两侧打开成极大的"V"字', '在最低点悬停，再依靠大腿内侧发力缓慢合拢'], tips: ['对内收肌的离心控制要求极高', '下放要极慢，合拢要坚决'], mistakes: ['下放速度过快拉伤内侧', '膝盖严重弯曲'] },
  '小狗伸展式 (融心式)': { muscles: ['上背部', '胸大肌'], steps: ['四足跪姿开始，保持臀部在膝盖正上方高高翘起', '双手向前滑行，让胸部和下巴贴近地面', '放松、深长呼吸'], tips: ['这是一个充分打开胸腔与肩背的体式', '若颈椎不适，可将额头垫高'], mistakes: ['臀部过度前移或后坐', '手臂没有完全伸展'] }, '仰卧牛面式（gomukhasana）': { muscles: ['臀中肌', '梨状肌'], steps: ['仰卧，双腿在空中交叉重叠（如大腿打结）', '双手抓住两只脚的脚背或脚踝，向下压向地板'], tips: ['臀外侧与梨状肌拉伸感很强', '保持下背贴地'], mistakes: ['头部抬起离开地面', '拉拽方向错误'] },
  '犁式（halasana）': { muscles: ['核心', '腘绳', '下背'], steps: ['仰卧、双手撑腰或贴地', '双腿并拢向上、再翻过头顶让脚尖触地(或尽量靠近)', '缓慢逐节卷下还原'], tips: ['颈部敏感者慎做、循序渐进', '靠核心控制、不要猛甩腿'], mistakes: ['用惯性甩腿', '让颈部强行承重'] },
  '肩胛垫高臀推': {
    muscles: ['臀大肌', '腘绳肌'],
    steps: ['背部垫高靠在凳子边缘，双脚踩实地面', '缓慢下沉骨盆，使臀部尽可能贴近地面以增加运动幅度', '脚跟踩地，挺髋至大腿与躯干呈一直线，顶峰收缩'],
    tips: ['下放时要完全松沉，感受臀肌在最底部被极致拉长', '挺髋时注意力集中在骨盆的充分伸展与对齐'],
    mistakes: ['下放幅度不足', '腰椎过度超伸代偿']
  },
  '跪姿后倒（股四拉伸）': {
    muscles: ['股四头肌', '髂腰肌'],
    steps: ['双膝跪地与肩同宽，大腿与躯干垂直，双手自然放于身体两侧', '收紧核心与臀部，保持头、胸、骨盆一直线，身体缓慢向后倾斜', '倾斜至大腿前侧极度拉伸的极限，保持稳定，缓慢起立还原'],
    tips: ['后仰过程中骨盆必须保持完全推直，不能有任何屈髋（撅屁股）', '控制下落和拉伸的节奏，接纳拉扯感'],
    mistakes: ['屈髋撅屁股偷懒', '速度过快拉伤膝关节']
  },
  '四足跪姿骨盆画8字': {
    muscles: ['骨盆控制', '腰腹核心'],
    steps: ['四足跪姿，双手在肩下，双膝在髋下，保持腰椎中立', '将注意力集中在骨盆，控制尾骨在水平面画‘∞’字轨迹', '左右方向交替，动作极其缓慢且富有韵律'],
    tips: ['控制骨盆灵活性，感受腰骶部与盆底肌的联动与放松', '上半身尽量保持固定，只动骨盆'],
    mistakes: ['上半身过度晃动代偿', '速度太快失去细节控制']
  },
  '靠墙倒箭式（分腿版）': {
    muscles: ['大腿内收肌', '髋关节'],
    steps: ['臀部紧贴墙面平躺，双腿并拢沿墙壁垂直向上伸直', '放松双腿，让重力引导双腿向两侧自然落下，呈极大V字', '在最开阔位置静力定格，深长呼吸，按屏幕计时保持(45秒起，每次+5秒，上限2分钟)'],
    tips: ['这是一个极好的被动开胯动作，在完全无对抗的状态下被动拉长肌肉', '配合盆底肌放松呼吸，顺应重力下沉'],
    mistakes: ['腿部用力对抗重力', '下背部悬空离地']
  },
  '靠墙站立前屈（wall forward fold）': {
    muscles: ['腘绳肌', '下背部'],
    steps: ['背部贴墙站立，双脚前移，臀部贴紧墙面', '从髋部折叠身体向前向下，让上半身贴向大腿', '双手可环抱小腿或触地，感受后侧极度拉长'],
    tips: ['利用墙面固定骨盆位置，使拉伸力量完全集中于大腿后侧', '深吸气挺胸，呼气时腹部贴紧大腿'],
    mistakes: ['弓背严重', '骨盆脱离墙面']
  },
  '池边悬浮分腿': {
    muscles: ['大腿内收肌', '核心'],
    steps: ['背靠池边，双臂向两侧撑在池边平台上，支撑起身体', '双腿在水中并拢伸直，受水流和浮力托举处于悬浮状态', '缓慢将双腿向两侧打开至最大，停留，再依靠大腿内侧发力闭合'],
    tips: ['水中的阻力能有效锻炼到内收肌的开合力量', '在完全打开时感受浮力对大腿内侧的向上承托'],
    mistakes: ['腿部弯曲', '身体过度摇晃']
  },
  // === 补充：背部激活 / 臀中肌 / 核心（翘臀美背的主力动作）===
  '俯卧YTW': {
    muscles: ['下斜方肌', '三角肌后束', '菱形肌'],
    steps: ['俯卧在长凳或地面上，双臂自然下垂', 'Y：拇指朝上，双臂向斜上方45°举起成 Y 形', 'T：双臂向两侧平举成 T 形，挤压肩胛', 'W：屈肘下拉成 W 形，肩胛骨向下向中收紧；每个字母顶峰停留1-2秒'],
    tips: ['全程肩胛骨下沉，想象把肩膀放进后裤兜', '徒手或很轻的重量即可，重点是激活而非负重'],
    mistakes: ['耸肩代偿（肩膀往耳朵方向缩）', '靠惯性甩手臂而非肌肉控制']
  },
  '靠墙天使': {
    muscles: ['下斜方肌', '姿势肌群'],
    steps: ['后背、臀部、后脑勺贴墙站立', '手臂贴墙屈肘成 W 形，手背尽量贴墙', '沿墙面缓慢上滑伸直成 Y 形，再滑回', '全程肩胛骨、手腕、手肘尽量不离墙'],
    tips: ['像在雪地里做天使一样上下滑动', '贴不住墙多是胸/肩前侧紧，先拉伸，幅度循序渐进'],
    mistakes: ['腰部过度拱起离墙', '为贴墙而耸肩或憋气']
  },
  '站姿绳索单腿外展': {
    muscles: ['臀中肌'],
    steps: ['踝部套上绳索扣环，侧身站在龙门架旁', '对侧手扶机架稳定，站直收紧核心', '工作腿伸直向侧方抬起，顶峰挤压臀侧停留1秒', '缓慢回放控制离心，不要让配重片砸回'],
    tips: ['上半身保持正直，不要向对侧倾倒借力', '幅度30-45°即可，感受臀侧而非大腿外侧'],
    mistakes: ['身体后仰/侧倾用惯性甩腿', '脚尖外旋变成髋屈肌发力']
  },
  '仰卧腿画圈（leg circles）': { muscles: ['下腹部', '髂腰肌', '大腿内收肌'], steps: ['仰卧，核心收紧，双腿绷直、脚尖向远延伸', '一条腿带着另一条腿在空中像折扇一样，画出夸张、缓慢的巨大半圆', '双腿交替在空中交织、画圈'], tips: ['对下腹部极其严苛，也很考验双腿与胯部的线条控制', '越慢越难'], mistakes: ['脚背松懈', '用腰部代偿，下背离开地面'] }, '跪姿深蹲（kneeling squat）': { muscles: ['股四头肌离心', '臀大肌'], steps: ['高跪姿起手，核心和臀部收紧', '大腿前侧发力控制，极其缓慢地让臀部向后下方沉，直到轻轻擦过脚后跟', '瞬间发力向前向上挺髋，回到起始高跪姿'], tips: ['慢落快起，在极度克制后强力爆发', '始终保持臀部肌肉处于紧张状态'], mistakes: ['完全放松坐到了脚后跟上失去张力'] }, '弹力带螃蟹步': {
    muscles: ['臀中肌'],
    steps: ['弹力带套在膝盖上方或脚踝处', '半蹲姿，膝微屈、臀后坐，保持张力', '一侧腿向外迈一步，另一腿跟上但不并拢', '同方向走15-20步再换方向，全程带子保持紧绷'],
    tips: ['膝盖始终对准脚尖，不要内扣', '重心压低、骨盆稳定，像螃蟹一样横向移动'],
    mistakes: ['身体左右摇晃借力', '步子并拢使弹力带松弛失张', '膝盖内扣']
  },
  '侧卧抬腿': {
    muscles: ['臀中肌'],
    steps: ['侧卧，下方腿屈膝支撑，身体成一直线', '上方腿伸直，脚尖略朝前下方', '向侧上方抬腿约45°，顶峰停留1秒', '缓慢下放控制，不完全落下以保持张力'],
    tips: ['骨盆保持垂直地面，不要向后倒', '脚跟领先发力，感受臀侧而非大腿前侧'],
    mistakes: ['骨盆后翻把动作变成屈髋', '抬得过高用腰代偿', '下放过快失去控制']
  },
  '腹横肌真空吸': {
    muscles: ['腹横肌'],
    steps: ['站姿、四足跪姿或仰卧均可，先正常呼吸', '缓慢呼气把气吐尽', '把肚脐向脊柱方向收紧吸入，像要让肚子贴到后背', '保持收紧并正常浅呼吸10-20秒，再放松'],
    tips: ['是"收紧"不是"憋气"，保持能说话的浅呼吸', '收的是深层腹横肌，能收紧腰围而非增厚'],
    mistakes: ['屏住呼吸而非真空收腹', '含胸弓背', '用力过猛导致头晕']
  },
  // === 水中训练（泳池）===
  '池边悬浮分腿': { muscles: ['大腿内收肌', '核心'], steps: ['在泳池浅水区，背靠池边，双臂向后撑住池沿', '双腿离地，在水中受浮力托举、放松', '缓慢向两侧打开双腿，再依靠内收肌合拢'], tips: ['水下阻力让每个细小动作都被放大，很练控制', '动作慢而稳'], mistakes: ['用力过猛溅起水花，失去水下阻力感'] },
  // === 胸部 (Chest) ===
  '杠铃卧推': {
    muscles: ['胸大肌', '三角肌前束', '肱三头肌'],
    steps: ['躺在卧推凳上，双眼正对杠铃下方，双脚踩实地面', '握距略宽于肩，收紧肩胛骨', '吸气，缓慢下放杠铃至乳头连线位置', '呼气，向上推起杠铃至手臂伸直，不完全锁死肘部'],
    tips: ['保持五点接触：头、上背、臀部紧贴垫子，双脚踩实', '手肘与躯干夹角约45-60度，不要打开成90度'],
    mistakes: ['弹胸借力（杠铃砸在胸上弹起）', '臀部离开垫子借力']
  },
  '哑铃卧推': {
    muscles: ['胸大肌', '三角肌前束', '肱三头肌'],
    steps: ['仰卧，肩胛骨收紧贴凳，双脚踩实', '将哑铃推至胸部正上方，掌心朝前', '缓慢下放至胸部两侧，感受胸肌拉伸（约3秒）', '用力推起至顶点，挤压胸肌'],
    tips: ['下放幅度要深于杠铃卧推，充分拉伸', '推起时哑铃不必相撞，保持张力'],
    mistakes: ['下放速度过快', '哑铃摇晃不稳']
  },
  '上斜哑铃卧推': {
    muscles: ['胸大肌上束', '三角肌前束'],
    steps: ['卧推凳调至上斜30-45度', '哑铃从锁骨正上方开始', '缓慢下放至胸部外侧', '向上推起并略微向中间聚拢'],
    tips: ['30度主要侧重上胸，角度过大容易代偿到肩膀'],
    mistakes: ['腰部过度拱起（把上斜做成了平胸）', '推起路线偏向腹部']
  },
  '下斜杠铃卧推': {
    muscles: ['胸大肌下束', '肱三头肌'],
    steps: ['双脚固定在下斜卧推凳上，身体后倾', '握距同肩宽，将杠铃下放至胸肌下沿', '向上垂直推起'],
    tips: ['动作幅度略短于平胸卧推', '起身后不要立刻站立，避免头晕'],
    mistakes: ['下放位置太靠近脖子', '臀部抬起']
  },
  '史密斯卧推': {
    muscles: ['胸大肌', '肱三头肌'],
    steps: ['调整长凳位置，使杠铃下放落在胸部中段', '背部贴紧靠垫，平稳推起和下放'],
    tips: ['无需控制平衡，可以更专注于胸肌发力', '适合冲击大重量或力竭组'],
    mistakes: ['长凳位置放错导致肩关节不适']
  },
  '坐姿推胸机': {
    muscles: ['胸大肌', '三角肌前束'],
    steps: ['调整座椅高度，使把手与胸部中段齐平', '挺胸收腹，肩胛骨贴紧靠背', '向前推起不锁死肘部', '缓慢控制回放，不要让配重片碰触'],
    tips: ['想象用手肘向中间夹，而不仅仅是向前推手'],
    mistakes: ['含胸耸肩', '头部离开靠枕向前探']
  },
  '器械夹胸': {
    muscles: ['胸大肌中缝'],
    steps: ['调整座椅，使上臂与肩同高', '手肘微屈贴在护垫上（或双手握住把手）', '向中间夹拢，顶峰收缩挤压1-2秒', '控制速度向外打开，感受拉伸'],
    tips: ['想象你要拥抱一棵大树', '挺胸，切勿含胸做'],
    mistakes: ['手臂完全伸直', '借助身体惯性前后摇晃']
  },
  '绳索夹胸': {
    muscles: ['胸大肌下缝/外侧'],
    steps: ['站在龙门架正中央，弓步站立保持稳定', '双手握住高位滑轮把手', '手臂微屈，向下前方弧线拉拢', '顶点挤压胸肌，缓慢放回'],
    tips: ['滑轮位置越高，越侧重下胸；位置越低，越侧重上胸'],
    mistakes: ['推的动作多于夹的动作', '站得太靠前或靠后']
  },
  '绳索下斜夹胸': {
    muscles: ['胸大肌下束'],
    steps: ['龙门架滑轮调至高位', '身体微微前倾', '双手从高处向肚脐前方斜向下夹拢', '顶端挤压'],
    tips: ['轨迹像是在你的前方画一个向下的"V"'],
    mistakes: ['手肘弯曲过度变为了绳索下压']
  },
  '哑铃仰卧屈臂上拉': {
    muscles: ['胸大肌', '背阔肌', '前锯肌'],
    steps: ['上背部横躺在卧推凳上，腰部悬空', '双手托住一个哑铃，举在胸口上方', '保持手臂微屈，缓慢下放哑铃至头后，感受胸腔拉开', '原轨迹拉回至胸口正上方'],
    tips: ['全程保持手肘微屈角度不变', '深吸气下放，呼气拉回'],
    mistakes: ['下放过深导致肩关节过度拉伸', '手臂大幅度屈伸']
  },
  '上斜哑铃飞鸟': {
    muscles: ['胸大肌上束'],
    steps: ['上斜凳30度仰卧', '哑铃举在锁骨上方，掌心相对', '手肘微屈固定，像张开翅膀一样向两侧下放', '感受到胸肌被充分拉伸后，拥抱式合拢'],
    tips: ['使用的重量应比卧推轻至少30-40%', '重点在于拉伸感'],
    mistakes: ['下放得过低伤及肩袖', '手肘弯曲90度变成了卧推']
  },
  '俯卧撑': {
    muscles: ['胸大肌', '肱三头肌', '核心'],
    steps: ['双手撑地，略宽于肩', '收紧核心，身体从头到脚跟呈一条直线', '屈肘下放身体，直至胸部贴近地面', '向上推起至手臂伸直'],
    tips: ['初学者可以采用膝盖着地的退阶做法', '双手距离越宽越练胸，越窄越练三头'],
    mistakes: ['塌腰（常见错误，损伤腰椎）', '臀部撅得太高']
  },

  // === 肩部 (Shoulder) ===
  '杠铃推举': {
    muscles: ['三角肌前束', '三角肌中束'],
    steps: ['站立，双手正握杠铃，略宽于肩', '杠铃置于锁骨上方，收紧核心', '将杠铃笔直向上推过头顶，直至手臂伸直', '缓慢下放回锁骨'],
    tips: ['推到最高点时，头微向前探，让杠铃在后脑勺正上方', '全程收紧臀部和腹部保持稳定'],
    mistakes: ['腰椎过度反弓（后仰）', '下半程借助腿部弹跳借力']
  },
  '哑铃肩推': {
    muscles: ['三角肌前束', '三角肌中束'],
    steps: ['坐在有靠背的椅子上', '将哑铃举至耳旁高度，掌心朝前', '向上推起，哑铃在头顶不相撞', '控制速度下放至起始位置'],
    tips: ['推到顶点时不要完全锁死手肘，保持肩膀持续发力', '如果肩膀不适，可尝试将掌心稍微相对（中立握）'],
    mistakes: ['下放位置太低（低于下巴）', '哑铃在头顶用力相撞']
  },
  '器械推举': {
    muscles: ['三角肌前束'],
    steps: ['调整座椅，使把手与肩同高', '背部紧贴靠垫', '向上推起把手，缓慢回放'],
    tips: ['器械轨迹固定，适合力竭组', '注意力集中在三角肌收缩上'],
    mistakes: ['身体离开靠背向前倾']
  },
  '史密斯肩推': {
    muscles: ['三角肌前束'],
    steps: ['在史密斯机中放置直角靠背椅', '杠铃杆下降至下巴或锁骨位置', '向上推起'],
    tips: ['可以放心尝试大重量，无需分心维持平衡', '椅子位置需仔细调整，确保杠铃轨迹顺畅'],
    mistakes: ['椅子太靠前或靠后']
  },
  '侧平举': {
    muscles: ['三角肌中束'],
    steps: ['站姿，双手持哑铃自然垂于腿侧', '手肘微屈，手腕锁定', '向两侧举起哑铃至肩膀高度', '缓慢控制下放（约3秒）'],
    tips: ['倒水诀窍：到达顶端时，小拇指略高于大拇指，能更刺激中束', '身体可微微前倾10-15度'],
    mistakes: ['耸肩借力（斜方肌代偿）', '像挥动翅膀一样靠惯性甩上去']
  },
  '坐姿侧平举机': {
    muscles: ['三角肌中束'],
    steps: ['坐稳，小臂放在器械的挡板下，双手轻握把手', '用肩膀的力量将挡板向上向外侧抬起', '顶峰停顿1秒，缓慢放回'],
    tips: ['排除了借力可能，是孤立训练中束的神器', '不要用手抓把手用力，而是用肘部往上抬'],
    mistakes: ['耸肩', '身体前倾或后仰']
  },
  '绳索侧平举': {
    muscles: ['三角肌中束'],
    steps: ['背对龙门架单侧站立，单手抓住低位绳索', '向外侧平举至肩膀高度', '控制速度缓慢放回'],
    tips: ['绳索能提供全行程的恒定张力，比哑铃刺激更深', '绳索可从身前或身后穿过'],
    mistakes: ['身体倒向一侧借力']
  },
  '哑铃前平举': {
    muscles: ['三角肌前束'],
    steps: ['站立，双手持哑铃在大腿前方', '手臂微屈，向前上方举起至眼睛高度', '缓慢下放'],
    tips: ['可以双臂同时，也可以单臂交替', '掌心可以朝下，也可以相对（锤式）'],
    mistakes: ['身体前后摇晃借力']
  },
  '绳索前平举': {
    muscles: ['三角肌前束'],
    steps: ['背对低位绳索站立，双手从胯下握住直杆或绳索', '向前上方平举至肩高', '控制回放'],
    tips: ['背靠绳索能保持全程的肌肉紧张感'],
    mistakes: ['耸肩', '挺肚子借力']
  },
  '杠铃直立划船': {
    muscles: ['三角肌中束', '斜方肌上束'],
    steps: ['站立，窄握或宽握杠铃垂于身前', '收紧核心，将杠铃沿着身体向上提拉至胸部偏上', '手肘始终高于手腕', '缓慢下放'],
    tips: ['宽握（宽于肩）更侧重三角肌中束，窄握更侧重斜方肌', '手肘向上抬引领动作'],
    mistakes: ['使用过大重量导致耸肩', '提拉过高（超过下巴）容易引发肩峰撞击']
  },
  '俯身飞鸟': {
    muscles: ['三角肌后束', '菱形肌'],
    steps: ['膝盖微屈，上半身前倾至接近与地面平行', '双手持哑铃自然下垂，手肘微屈', '向两侧向后方展开手臂', '顶峰挤压，缓慢下放'],
    tips: ['想象要把两个肩胛骨向中间捏在一起', '使用的重量要轻'],
    mistakes: ['身体站得太直，变成了侧平举', '利用起身惯性甩上去']
  },
  '反向飞鸟机': {
    muscles: ['三角肌后束'],
    steps: ['面朝器械坐下，胸口贴紧靠背', '双手水平握住把手', '向后展开手臂，顶端停留1秒', '缓慢控制放回'],
    tips: ['调节座椅高度，确保拉的过程中手、肘、肩在同一水平面上'],
    mistakes: ['肩胛骨过度后缩（导致斜方肌抢戏）', '手肘下沉']
  },
  '面拉': {
    muscles: ['三角肌后束', '肩袖肌群'],
    steps: ['将滑轮调至眼睛高度，换上双头绳索', '双手握住绳子两端，退后一步', '将绳索拉向面部两侧，同时向外旋开双手（像展示肱二头肌）', '控制回放'],
    tips: ['这是改善圆肩驼背和维持肩部健康的优秀动作之一', '重量不需要很大，关键是外旋的动作'],
    mistakes: ['向下拉向胸口（变成了划船）', '手肘低于手腕']
  },

  // === 背部 (Back) ===
  '引体向上': {
    muscles: ['背阔肌', '肱二头肌'],
    steps: ['双手略宽于肩，正握单杠', '肩胛骨先下沉启动', '将胸骨向上拉近单杠，直至下巴过杠', '缓慢且控制地下放至手臂几乎伸直'],
    tips: ['不要只用手臂拉，想象用手肘向下、向后砸向腰部', '核心收紧，保持身体稳定'],
    mistakes: ['身体大幅度摆荡（像海豚一样）', '只做半程（下放没到底，拉起没到顶）']
  },
  '助力引体向上机': {
    muscles: ['背阔肌'],
    steps: ['调整配重（注意：配重越重，动作越轻松）', '双膝跪在垫板上，双手宽握', '背部发力将身体拉起', '控制速度缓慢下落'],
    tips: ['这是无法完成自重引体向上时的优秀退阶动作'],
    mistakes: ['下放速度太快被垫板弹起']
  },
  '高位下拉': {
    muscles: ['背阔肌外侧'],
    steps: ['坐姿，大腿挡板压紧膝盖上方', '宽握直杆，挺胸，身体微微后倾（约15度）', '将杆垂直下拉至锁骨位置，挤压背阔肌', '缓慢控制杆上升至手臂伸直'],
    tips: ['下拉时挺起胸膛去迎接横杆', '视线斜向上看'],
    mistakes: ['过度后仰（借体重压下来）', '下拉到腹部（手臂过多参与）', '颈后下拉（极易伤颈椎）']
  },
  '坐姿划船': {
    muscles: ['中背部', '菱形肌', '背阔肌'],
    steps: ['坐在器械上，双脚踩实挡板，膝盖微屈', '挺胸收腹，双手握住V把', '将把手拉向肚脐位置，手肘紧贴身体两侧', '肩胛骨后缩挤压，缓慢放回'],
    tips: ['躯干保持相对固定，不要过度前后摇摆', '拉的时候先动肩胛骨，再动手臂'],
    mistakes: ['身体像划船一样大幅度前后倒', '含胸驼背']
  },
  'T把划船': {
    muscles: ['背阔肌厚度', '中背'],
    steps: ['双脚跨立在T把上方，屈髋屈膝俯身', '双手握住把手，保持背部平直', '将把手拉向胸腹交界处', '缓慢下放至手臂伸直'],
    tips: ['这个动作能上很大重量，刺激背部厚度理想', '可以选择宽把或窄把'],
    mistakes: ['弓背（存在安全隐患）', '站得太直变成了耸肩']
  },
  '杠铃斜板划船': {
    muscles: ['中背', '菱形肌'],
    steps: ['将上斜板调至30-45度，胸口贴靠在板上', '双手持哑铃或杠铃', '向后上方拉起重量，挤压肩背', '控制回放'],
    tips: ['去除了下背部的压力和身体借力，是孤立训练背部的理想动作'],
    mistakes: ['胸口离开垫板借力', '耸肩']
  },
  '哑铃单臂划船': {
    muscles: ['背阔肌下沿'],
    steps: ['同侧的手和膝盖支撑在平板凳上，保持背部平直', '另一只手持哑铃自然下垂', '将哑铃贴着身体拉向骨盆或侧腰位置', '控制下放'],
    tips: ['想象在启动一台老式割草机，手肘向天空方向提拉', '哑铃的轨迹是弧线，偏向腰部而非直上直下'],
    mistakes: ['上半身过度扭转借力', '向胸口方向直拉']
  },
  '俯身划船': {
    muscles: ['中背', '背阔肌厚度'],
    steps: ['双脚与肩同宽，屈髋俯身至躯干接近与地面平行', '双手正握或反握杠铃', '将杠铃拉向肚脐，手肘向后上方提', '控制下放'],
    tips: ['全程保持核心绷紧，保护腰椎', '反握侧重背阔肌下沿和二头，正握侧重中背厚度'],
    mistakes: ['弓背（伤腰）', '上半身抬得太高变成了耸肩']
  },
  '绳索直臂下压': {
    muscles: ['背阔肌'],
    steps: ['面对高位绳索站立，双手握住直杆或绳子，手臂微屈', '臀部微翘，身体前倾', '保持手臂角度不变，向下压至大腿前方', '缓慢控制上升，感受背阔肌完全拉伸'],
    tips: ['好的背部孤立动作，用来找背阔肌发力感或作为收尾血流激活'],
    mistakes: ['向下压的过程中弯曲手肘（变成了三头肌下压）', '身体上下起伏借力']
  },
  '直臂下压机': {
    muscles: ['背阔肌', '前锯肌'],
    steps: ['坐姿，手肘抵在器械的靠垫上', '利用背阔肌的力量将机器往下压至腹部', '缓慢回放'],
    tips: ['这是复刻经典的Nautilus Pullover器械，对背阔肌刺激显著'],
    mistakes: ['双手用力握把手代替手肘发力']
  },
  '山羊挺身': {
    muscles: ['竖脊肌', '臀大肌', '腘绳肌'],
    steps: ['双脚固定在罗马椅上，挡板位于大腿根部下方', '保持背部平直，缓慢向下俯身至能承受的最低点', '用腰背和臀腿力量挺起身体，直到身体呈一条直线'],
    tips: ['如果想练下背，保持脊柱平直；如果想练臀，可以稍微含胸并将注意力集中在夹臀上'],
    mistakes: ['起身过度反弓（向后仰），容易导致腰椎挤压受损']
  },
  '弹力带划船': {
    muscles: ['中背', '菱形肌'],
    steps: ['坐在地上，双腿伸直，将弹力带绕过脚底', '双手抓住弹力带两端，挺胸', '向后拉至腰侧，挤压肩胛骨', '缓慢放回'],
    tips: ['居家练背的优秀选择', '拉得越短，阻力越大'],
    mistakes: ['弓背驼背']
  },

  // === 手臂 (Biceps & Triceps) ===
  '杠铃弯举': {
    muscles: ['肱二头肌'],
    steps: ['站立，双手反握杠铃，与肩同宽', '大臂紧贴身体两侧固定不动', '收缩二头肌，将杠铃弯举至胸前', '顶端停顿1秒，缓慢控制下放'],
    tips: ['使用EZ曲杠可以减轻手腕的不适感', '新手可以背靠墙站立以防止身体借力'],
    mistakes: ['身体前后摇晃借力', '手肘向前移动离开躯干']
  },
  '哑铃弯举': {
    muscles: ['肱二头肌'],
    steps: ['站姿或坐姿，双手各持哑铃', '单臂交替或双臂同时弯举', '在弯举过程中手腕向外旋（小拇指朝肩膀靠拢）', '控制下放'],
    tips: ['旋腕的动作能更充分地挤压二头肌'],
    mistakes: ['下落时完全放松没有离心控制']
  },
  '牧师椅杠铃弯举': {
    muscles: ['肱二头肌下部'],
    steps: ['坐在牧师椅上，腋窝卡住靠垫顶端', '大臂平铺在斜板上', '向下放至手臂接近伸直，然后弯举向上'],
    tips: ['靠垫防止了手臂和身体的移动，是优秀的孤立动作', '不要下放到关节完全锁死，保持一点张力'],
    mistakes: ['起身离开座位借力']
  },
  '器械弯举': {
    muscles: ['肱二头肌'],
    steps: ['坐在器械上，大臂靠在垫板上，手握把手', '平稳发力拉起，缓慢放下'],
    tips: ['器械提供了全行程的均匀阻力，适合新手和力竭组'],
    mistakes: ['速度过快，完全靠机器惯性']
  },
  '集中弯举': {
    muscles: ['肱二头肌肌峰'],
    steps: ['坐在凳子上，双腿分开', '单手持哑铃，将手肘内侧抵在同侧大腿内侧', '孤立二头肌进行弯举，顶端用力挤压', '缓慢下放'],
    tips: ['这被认为是塑造二头肌"山峰"的优秀动作', '专注在每一次顶峰收缩'],
    mistakes: ['用大腿向上顶手肘借力']
  },
  '斜板哑铃弯举': {
    muscles: ['肱二头肌长头'],
    steps: ['调整卧推凳至上斜45-60度', '仰卧其上，让双臂自然垂直向地面垂下', '保持大臂垂直地面不动，弯举小臂'],
    tips: ['这个姿势能最大化拉长二头肌，带来强烈的拉伸感', '使用的重量要比站姿轻'],
    mistakes: ['举起时大臂向前抬起']
  },
  '锤式弯举': {
    muscles: ['肱肌', '肱桡肌（前臂）'],
    steps: ['站立，双手各持哑铃，掌心相对（像握锤子一样）', '大臂固定，向上弯举', '缓慢下放'],
    tips: ['这个动作能增加手臂正面的宽度，并强化前臂力量', '可以交替做，也可以跨过胸前做对角线弯举'],
    mistakes: ['手腕翻转变成了普通弯举']
  },
  '绳索弯举': {
    muscles: ['肱二头肌'],
    steps: ['面对低位滑轮，双手反握直杆把手', '保持身体稳定，大臂贴紧身体弯举', '控制速度放回'],
    tips: ['绳索能提供持续的张力，在肌肉拉长端也不会泄力'],
    mistakes: ['站得太远导致身体前倾']
  },
  '绳索过头弯举': {
    muscles: ['肱二头肌短头'],
    steps: ['站在龙门架正中央，两个高位滑轮各挂一个D型把手', '双手握住把手，手臂向两侧平伸成十字', '收缩二头肌，将双手向头部两侧弯举（像李小龙的经典姿势）'],
    tips: ['保持大臂与地面平行固定不动'],
    mistakes: ['大臂向下掉落']
  },

  '绳索下压': {
    muscles: ['肱三头肌外侧头'],
    steps: ['面对高位滑轮，双手握住直杆或V把', '大臂紧贴身体两侧，大臂和地面垂直', '只动小臂，将把手向下压至手臂完全伸直', '缓慢控制回放到小臂平行地面'],
    tips: ['每次下压到底时，用力收缩三头肌停顿0.5秒', '用绳索附件可以在底部向两边拉开，增加收缩'],
    mistakes: ['动作过程中大臂前后摇摆借力', '含胸借体重往下压']
  },
  '器械三头下压': {
    muscles: ['肱三头肌'],
    steps: ['坐在器械上，背部挺直，双手握住两侧的把手', '向下推直至手臂完全伸直', '控制回放速度'],
    tips: ['这个机器能让你安全地使用很大重量'],
    mistakes: ['耸肩往下压']
  },
  '绳索过头臂屈伸': {
    muscles: ['肱三头肌长头'],
    steps: ['背对高位或低位绳索，双手抓住绳索从后脑勺上方穿过', '身体微向前倾', '大臂固定在耳朵两侧，将小臂向前上方伸直', '控制下放，感受三头肌被充分拉伸'],
    tips: ['三头肌长头在手臂抬高时被拉长，这个动作能提供优秀的长头刺激'],
    mistakes: ['大臂跟随小臂一起上下摆动']
  },
  '哑铃臂屈伸': {
    muscles: ['肱三头肌长头'],
    steps: ['坐姿，双手托住一个哑铃，举至头顶', '保持大臂贴近耳朵，屈肘让哑铃下放到脑后', '收缩三头肌将哑铃举起至手臂伸直'],
    tips: ['哑铃下放得越深，长头拉伸感越强', '核心收紧，保持躯干直立'],
    mistakes: ['手肘向两侧过度打开']
  },
  '俯身单臂哑铃臂屈伸': {
    muscles: ['肱三头肌'],
    steps: ['单手和同侧膝盖支撑在长凳上，上半身平行地面', '另一只手持哑铃，大臂紧贴身体并与地面平行', '只动小臂，向后方伸直手臂', '缓慢放下至90度'],
    tips: ['向后伸直时，小臂应略高于背部，达到顶峰收缩'],
    mistakes: ['用甩的惯性把哑铃抛到后面', '大臂往下掉']
  },
  '双杠臂屈伸': {
    muscles: ['肱三头肌', '胸大肌下部'],
    steps: ['双手撑在双杠上，支撑起身体', '屈肘下放身体，直到大臂与地面平行或略低', '用力推起至初始位置'],
    tips: ['想要侧重三头肌：身体尽量保持直立，手肘贴近身体，双腿自然下垂', '想要侧重下胸：身体前倾，手肘向外打开'],
    mistakes: ['下放过深导致肩关节压力过大', '像打桩机一样快速弹起']
  },
  '助力双杠臂屈伸': {
    muscles: ['肱三头肌'],
    steps: ['调整配重（越重越容易），将膝盖或脚掌放在托板上', '平稳地下放和推起'],
    tips: ['好的新手退阶动作，可以专注于三头肌的发力'],
    mistakes: ['借着托板的弹力向上跳']
  },
  '窄距杠铃卧推': {
    muscles: ['肱三头肌', '胸大肌内侧'],
    steps: ['仰卧在卧推凳上，双手握距与肩同宽或略窄', '将杠铃下放至胸骨下部，大臂紧贴着身体两侧滑下', '用力推起至手臂伸直'],
    tips: ['这是增加三头肌维度的经典动作，可以使用较大重量', '握距不要太窄（不要两手碰在一起），否则会伤手腕'],
    mistakes: ['手肘向两侧打开（变成了普通卧推）']
  },
  '仰卧臂屈伸': {
    muscles: ['肱三头肌（全头）'],
    steps: ['仰卧在长凳上，双手持曲杠或哑铃在胸部上方', '大臂略微向后倾斜（不要完全垂直地面），并固定不动', '屈肘将重量下放至额头或头顶后方', '伸直手臂'],
    tips: ['俗称"碎颅者"（Skull Crushers），大臂微后倾能让三头肌在顶端也保持张力'],
    mistakes: ['大臂前后摇动变成了仰卧推举']
  },

  // === 腿部与臀部 (Legs & Glutes) ===
  '杠铃深蹲': {
    muscles: ['股四头肌', '臀大肌', '腘绳肌', '核心'],
    steps: ['将杠铃放在斜方肌上（高杠）或三角肌后束上（低杠）', '双脚与肩同宽，脚尖微外八，深吸气并憋气（瓦式呼吸）', '臀部向后坐的同时屈膝下蹲，直到大腿低于水平线', '蹬地站起，同时呼气'],
    tips: ['膝盖的朝向始终与脚尖保持一致', '重心落在脚底中央偏脚跟位置'],
    mistakes: ['膝盖严重内扣（极易伤膝）', '蹲得不够深（半蹲）', '含胸弓背']
  },
  '颈前杠铃深蹲': {
    muscles: ['股四头肌', '核心'],
    steps: ['将杠铃架在锁骨和前三角肌上，双手交叉或手指托住', '躯干保持绝对直立', '下蹲至最深处，推起'],
    tips: ['这个变式对股四头肌和核心的刺激远大于传统深蹲', '背部不适者的优秀替代动作'],
    mistakes: ['手肘往下掉导致杠铃滑落', '身体前倾']
  },
  '史密斯深蹲': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['站在史密斯机下，杠铃放在肩上', '双脚可以稍微向前迈出半步', '下蹲至平行位置，推起'],
    tips: ['双脚越靠前，越侧重臀部；双脚越在正下方，越侧重股四头肌'],
    mistakes: ['双脚位置错误导致膝盖超出脚尖过多', '过于依赖机器完全放弃核心发力']
  },
  '倒蹬机': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['躺在座椅上，背部完全贴合靠背', '双脚放在踏板中央，解开安全栓', '缓慢控制踏板下落，直到膝盖呈90度', '用脚跟发力将踏板推起'],
    tips: ['脚放得越高，越刺激臀部/腘绳肌；脚放得越低，越刺激股四头肌', '双脚间距宽练内侧，窄练外侧'],
    mistakes: ['推到顶点时膝盖完全锁死反曲（存在安全隐患）', '下落太深导致下背部离开靠背受压']
  },
  '钟摆深蹲': {
    muscles: ['股四头肌'],
    steps: ['背部紧贴机器靠板，肩膀顶住垫子', '缓慢下蹲，机器会带着你做一个向后下方的圆弧轨迹', '推起至初始位置'],
    tips: ['这台机器能提供充分的股四头肌孤立刺激，而且对腰椎友好', '可以蹲得深'],
    mistakes: ['脚踩的位置不对导致脚跟抬起']
  },
  '哈克深蹲': {
    muscles: ['股四头肌外侧'],
    steps: ['背部贴紧靠垫，肩膀顶在肩托下', '解开安全把手，缓慢下蹲至90度以下', '推起'],
    tips: ['相比倒蹬机，哈克深蹲更能模拟真实深蹲的髋膝联动', '把脚放低一些能把负荷全集中在股四头肌上'],
    mistakes: ['膝盖内扣', '下蹲速度过快']
  },
  '腿屈伸': {
    muscles: ['股四头肌'],
    steps: ['坐在器械上，调整靠背使膝盖对准机器的转轴', '脚踝挡板放在小腿下端', '用力将小腿向上踢平，在顶点收缩停留1-2秒', '缓慢控制回放'],
    tips: ['孤立股四头肌雕刻线条的优秀动作，适合放在腿部训练最后', '脚尖向外侧重内侧头，脚尖向内侧重外侧头'],
    mistakes: ['重量过大导致身体从座位上弹起', '完全不用力回放，让配重片砸下']
  },
  '保加利亚分腿蹲': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['双手持哑铃，背对长凳站立，将一只脚的脚背搭在凳子上', '另一只脚向前迈出合适距离', '下蹲至前侧大腿与地面平行，后侧膝盖几乎触地', '前脚脚跟发力推起'],
    tips: ['上半身直立更侧重股四头肌；上半身稍微前倾更侧重臀大肌', '单腿动作能有效地改善左右不平衡'],
    mistakes: ['前脚站得太近，导致膝盖过度超脚尖且脚跟离地', '后脚用力蹬']
  },
  '哑铃弓步蹲': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['双手持哑铃站立', '向前迈出一大步，下蹲至双膝都呈90度', '前脚用力蹬地回到起始位置', '可以原地交替，也可以行进式走动'],
    tips: ['步幅大练臀，步幅小练腿', '保持躯干稳定，不要左右摇晃'],
    mistakes: ['后膝重重砸在地上', '前脚掌发力而不是全脚掌发力']
  },
  '高脚杯深蹲': {
    muscles: ['股四头肌', '臀大肌', '核心'],
    steps: ['双手捧住一个哑铃或壶铃放在胸前', '双脚与肩同宽，保持挺胸，下蹲至手肘触碰膝盖内侧', '站起'],
    tips: ['重量在身前会自动强迫你保持背部直立，是新手学习深蹲的优秀入门动作'],
    mistakes: ['哑铃远离身体，导致手臂和肩膀过早疲劳', '弯腰驼背']
  },

  '罗马尼亚硬拉': {
    muscles: ['腘绳肌', '臀大肌', '竖脊肌'],
    steps: ['双手持杠铃或哑铃站立，双脚与肩同宽', '膝盖微屈并锁定角度，将臀部向后推', '杠铃贴着大腿滑下，直到感受到大腿后侧有强烈的拉伸感（通常在膝盖下方）', '臀部向前推，收缩站直'],
    tips: ['重点是"向后推臀"，而不是"弯腰放重量"', '头部保持与脊柱的自然中立'],
    mistakes: ['背部弯曲', '膝盖弯曲过多，变成了深蹲放重量']
  },
  '传统硬拉': {
    muscles: ['后链全身肌群', '背部', '核心'],
    steps: ['杠铃放在地上，双脚与肩同宽，杠铃杆在脚掌正上方', '屈髋屈膝，双手正握或正反握抓住杠铃，保持背部绝对平直', '深吸气，双腿用力蹬地，同时髋部前推将杠铃拉起', '在顶端完全站直收缩臀部', '原路控制放下'],
    tips: ['想象你是要把地板踩穿，而不是用手把杠铃拔起来', '杠铃全程都要贴着腿部滑动'],
    mistakes: ['弓背发力（极易造成腰椎间盘突出）', '起步时臀部先抬起，导致腰部承担所有重量']
  },
  '臀推': {
    muscles: ['臀大肌', '腘绳肌'],
    steps: ['肩胛骨下角靠在长凳边缘，杠铃横跨在髋骨处（垫上海绵垫）', '双脚踩实地面，与肩同宽，小腿在顶端应垂直于地面', '下巴微收，用臀部发力将髋部向上推起', '顶端用力夹紧臀部停留1-2秒', '缓慢控制下落'],
    tips: ['这是目前公认发展臀部体积的优秀动作', '保持下巴微收看向前方，有助于防止腰椎超伸'],
    mistakes: ['推到顶端时过度挺腰（用腰椎代偿）', '脚放得太远（腘绳肌发力多）或太近（股四发力多）']
  },
  '史密斯臀推': {
    muscles: ['臀大肌'],
    steps: ['在史密斯机中放置长凳，按普通臀推姿势准备', '转动杠铃解锁，进行臀推'],
    tips: ['不需要花精力平衡杠铃，更容易找到臀部孤立发力的感觉'],
    mistakes: ['长凳的位置没对准史密斯的轨迹']
  },
  '腿弯举': {
    muscles: ['腘绳肌'],
    steps: ['俯卧在器械上，脚踝后侧卡在挡板下', '双手握住把手稳定上半身', '用力向上弯曲小腿至接近臀部位置', '控制速度缓慢回放到伸直状态'],
    tips: ['下去的时候脚尖可以绷直，上来的时候脚尖勾起，刺激更深', '确保膝盖关节对准机器的旋转轴'],
    mistakes: ['发力时臀部翘起离开垫板', '回放时自由落体']
  },
  '坐姿腿弯举': {
    muscles: ['腘绳肌'],
    steps: ['坐在器械上，放下大腿固定板压紧腿部', '小腿放在下挡板上方', '用力向下、向后压小腿，弯曲到最大角度', '缓慢控制回放'],
    tips: ['坐姿能更好地拉长腘绳肌，研究表明相比俯卧可能带来更多的肌肉生长'],
    mistakes: ['大腿固定板没有压紧，导致身体移动']
  },
  '站姿单腿弯举机': {
    muscles: ['腘绳肌'],
    steps: ['站立在器械上，一侧大腿前侧贴紧靠垫，脚踝钩住挡板', '单腿向后上方弯曲', '控制回放'],
    tips: ['单腿动作，能有效地感受到肌肉的收缩，适合改善两侧不平衡'],
    mistakes: ['身体过度前倾']
  },
  '绳索后踢腿': {
    muscles: ['臀大肌'],
    steps: ['将脚踝套绑在低位绳索上', '面朝龙门架站立，双手扶住立柱稳定身体，上半身微微前倾', '工作腿向后、向上方直腿踢出，在最高点挤压臀部', '缓慢放回'],
    tips: ['踢腿的高度不需要太高，重点是臀大肌的收缩感', '脚尖微微向外转能更好刺激臀大肌'],
    mistakes: ['利用腰椎反弓（塌腰）来把腿抬得更高', '身体大幅度摇摆']
  },
  '器械外展机': {
    muscles: ['臀中肌', '臀小肌'],
    steps: ['坐在器械上，双腿并拢，大腿外侧贴紧挡板', '向外打开双腿至最大幅度，停顿1秒', '缓慢控制并拢'],
    tips: ['上半身前倾可以更多地刺激到臀大肌；上半身后靠则更多刺激臀中肌', '这是塑造"饱满臀部侧面"的好动作'],
    mistakes: ['利用身体前后摇晃借力']
  },
  '臀桥': {
    muscles: ['臀大肌', '核心'],
    steps: ['仰卧在地垫上，双膝弯曲，脚掌平放地面', '收紧核心，脚跟发力将骨盆向上推，直到肩膀、髋部、膝盖呈一条直线', '在最高点用力夹紧臀部，缓慢下放'],
    tips: ['这是一个理想的新手动作和热身激活核心动作', '想增加难度可以单腿做，或者在髋部放哑铃'],
    mistakes: ['推得过高导致腰部过度反弓']
  },
  '弹力带蚌式开合': {
    muscles: ['臀中肌'],
    steps: ['将迷你弹力带套在膝盖上方，侧卧在垫子上，双膝微屈并拢', '双脚保持接触，像蚌壳一样打开上方的膝盖', '顶端停顿，缓慢闭合'],
    tips: ['深蹲硬拉前的优秀热身动作，能激活臀部稳定肌群，防止膝盖内扣'],
    mistakes: ['打开膝盖时，骨盆跟着向后翻转（应保持骨盆垂直于地面不动）']
  },

  // === 小腿 (Calves) ===
  '站姿提踵': {
    muscles: ['腓肠肌（小腿肚）'],
    steps: ['前脚掌踩在台阶或提踵机踏板上，脚跟悬空', '最大幅度地下放脚跟，感受小腿后侧深度拉伸', '用力踮起脚尖到最高点，停顿1-2秒强烈收缩', '控制回放'],
    tips: ['小腿肌肉对全幅度（特别是拉伸感）敏感，一定要下放到最低点'],
    mistakes: ['只做上半程动作', '像弹簧一样利用跟腱弹性快速弹跳']
  },
  '史密斯提踵': {
    muscles: ['腓肠肌'],
    steps: ['在史密斯机下方放一块杠铃片或踏板', '前脚掌踩在上面，肩膀扛起杠铃', '进行全幅度的提踵动作'],
    tips: ['机器提供了稳定，你可以使用比自由负重更大的重量'],
    mistakes: ['脚站得太靠前导致失去平衡']
  },
  '腿举机提踵': {
    muscles: ['腓肠肌'],
    steps: ['躺在倒蹬机上，双腿伸直但不锁死', '将双脚下移，只让前脚掌踩在踏板下边缘', '仅转动脚踝，用前脚掌将踏板推起', '缓慢控制踏板回落拉伸小腿'],
    tips: ['安全的大重量小腿训练方法，腰部完全无压力'],
    mistakes: ['膝盖弯曲借力', '脚滑落（存在一定危险，一定要穿防滑鞋垫好脚位）']
  },
  '坐姿提踵': {
    muscles: ['比目鱼肌（小腿深层）'],
    steps: ['坐在提踵机上，大腿靠垫压在膝盖上方', '前脚掌踩在踏板上', '解开安全把手，抬起脚后跟至最高点', '控制下放至最低'],
    tips: ['因为膝盖弯曲，排除了腓肠肌的发力，是专门针对比目鱼肌的动作。能有效增加小腿下部的视觉粗度'],
    mistakes: ['起落幅度过小']
  },

  // === 核心 (Core) ===
  '平板支撑': {
    muscles: ['腹横肌', '核心全身肌群'],
    steps: ['双肘和双脚尖触地支撑身体', '手肘位于肩膀正下方', '收紧腹部、夹紧臀部，使身体从头到脚跟形成一条笔直的线', '保持正常呼吸，不要憋气'],
    tips: ['关键不在于坚持多久，而在于肌肉是否时刻紧绷', '如果觉得轻松，可以尝试将手肘往前移一点'],
    mistakes: ['塌腰（肚子掉向地面，极易腰痛）', '臀部撅得老高']
  },
  '卷腹': {
    muscles: ['腹直肌上部'],
    steps: ['仰卧在地垫上，双膝弯曲，脚踩地', '双手虚放在耳侧或交叉于胸前', '呼气，收缩腹肌将肩胛骨卷离地面，下背部始终贴紧地面', '吸气，缓慢控制回落，但肩部不完全放松'],
    tips: ['想象要把你的胸骨和骨盆拉近', '视线看向斜上方天花板，保持颈部自然'],
    mistakes: ['双手用力抱头向上拽脖子（导致颈椎受伤）', '做成完整的仰卧起坐，导致髋屈肌代偿']
  },
  '坐姿卷腹机': {
    muscles: ['腹直肌'],
    steps: ['坐在器械上，双手抓住上方把手或将手肘放在靠垫上', '双脚固定', '呼气，腹部发力将上半身向前下方卷曲', '控制速度回放'],
    tips: ['机器能让你方便地增加负重，是让腹肌维度变大的好工具', '保持背部微拱起，不要挺直背部压'],
    mistakes: ['用手臂用力拉把手代替腹部发力']
  },
  '悬挂抬腿': {
    muscles: ['腹直肌下部', '髂腰肌'],
    steps: ['双手握住单杠将身体悬挂起来', '收紧核心，呼气，将双腿（屈膝或直腿）向上方抬起', '将骨盆向胸部方向卷曲', '缓慢控制下放'],
    tips: ['初学者可以屈膝做（悬挂屈膝抬腿），进阶者可以直腿抬至触杠', '关键是骨盆要发生翻转，而不仅仅是抬大腿'],
    mistakes: ['借助身体摇摆的惯性甩上去', '下放时突然放松身体']
  },
  '罗马椅抬腿': {
    muscles: ['腹直肌下部'],
    steps: ['双肘撑在罗马椅的软垫上，背部贴紧靠背', '悬空双腿', '收缩下腹部，将膝盖提至胸前，骨盆微离开靠背', '缓慢下放'],
    tips: ['比悬挂抬腿容易，对握力没有要求', '注意力集中在下腹部的收缩感上'],
    mistakes: ['大腿只抬到水平位置，骨盆完全没卷动（变成了练大腿前侧的屈髋动作）']
  },
  '俄罗斯转体': {
    muscles: ['腹外斜肌', '腹直肌'],
    steps: ['坐在垫子上，上半身向后倾斜约45度，背部挺直', '双脚微微抬离地面', '双手交叉于胸前，呼气时将躯干转向一侧', '吸气转回，再呼气转向另一侧'],
    tips: ['如果觉得困难，双脚可以轻踩在地面上', '重点是转动肩膀和躯干，而不是手臂左右摆'],
    mistakes: ['背部过度弯曲导致腰疼', '转动速度太快没有控制']
  },
  '负重俄罗斯转体': {
    muscles: ['腹外斜肌'],
    steps: ['保持俄罗斯转体的姿势', '双手持药球或哑铃/杠铃片', '平稳地将重物从身体一侧转移到另一侧'],
    tips: ['增加负重能让侧腹肌更明显', '视线跟随重物移动'],
    mistakes: ['重物砸在地上利用反弹力']
  },
  '绳索伐木': {
    muscles: ['腹外斜肌', '核心扭转力量'],
    steps: ['站在龙门架侧面，滑轮调至高位', '双手握住一个D型把手', '像砍树一样，转身将把手向对侧膝盖下方拉去', '缓慢控制阻力退回起始位置'],
    tips: ['发力主要来自躯干的旋转，手臂只是传导力量的工具', '滑轮也可以设置在低位向高处拉'],
    mistakes: ['手臂用力拉而躯干不动']
  },
  '死虫式': {
    muscles: ['核心稳定肌群', '腹横肌'],
    steps: ['仰卧，双臂指向上方天花板，双腿屈膝抬起至大腿垂直地面（像四脚朝天的虫子）', '收紧核心，下背部死死贴住地面', '缓慢伸直左腿并向后伸直右臂，直到几乎触地', '收回，换另一侧交替进行'],
    tips: ['这是一个安全的动作，适合康复和唤醒深层核心', '关键点：下背部绝不能离开地面哪怕一毫米'],
    mistakes: ['动作过快', '背部拱起离开地面']
  },
  '腹轮': {
    muscles: ['核心全身', '背阔肌'],
    steps: ['双膝跪在软垫上，双手握住健腹轮的把手', '收紧腹肌，稍微含胸（像一只生气的猫）', '缓慢向前推出滚轮，直至身体完全伸展但未触地', '利用腹肌的收缩将身体拉回初始跪姿'],
    tips: ['挑战性较高，注意安全。', '熟练后可以尝试站姿推腹轮（高难度）'],
    mistakes: ['推出时腰椎塌陷反弓（极易拉伤腰部）', '回拉时先往后坐大腿，而不是用腹部发力']
  },
  '侧平板支撑': {
    muscles: ['腹外斜肌', '腰方肌'],
    steps: ['侧卧，用一侧的手肘和前臂支撑上半身', '双腿并拢伸直，另一只手可叉腰或指向上方', '抬起髋部，使身体从肩到脚踝成一直线', '保持设定时间后换另一侧'],
    tips: ['这是麦吉尔"核心三大金刚"动作之一，对腰椎极为友好，能有效预防腰痛'],
    mistakes: ['髋部下坠偏离直线', '身体向前或向后倾斜偏转']
  },

  // === 有氧 (Cardio) ===
  '跑步机慢跑': {
    muscles: ['心肺功能', '下肢耐力'],
    steps: ['以较慢的配速（如5km/h）快走3-5分钟热身', '将速度提升至慢跑状态（如7-9km/h）', '保持匀速呼吸，维持设定时间', '最后3-5分钟降速慢走以冷却心率'],
    tips: ['可以设置1-2%的坡度，以弥补室内没有风阻的差异，更接近户外真实跑步体验', '心率保持在最大心率的65-75%为理想的燃脂区间'],
    mistakes: ['双手紧抓跑步机扶手', '步伐太大导致脚跟重重落地']
  },
  '弧形跑步机': {
    muscles: ['心肺功能', '腘绳肌', '臀大肌'],
    steps: ['站上跑步机，双手轻扶把手', '走到跑道前段开始跑动，靠自身发力驱动履带', '想加速就靠前跑，想减速就退向中间', '结束时双手抓牢把手，双脚踩到两侧踏板上'],
    tips: ['这是一种无动力器械，燃脂效率比普通跑步机高约30%', '对核心稳定性和跑步姿势要求更高'],
    mistakes: ['上半身过度前倾', '跑动中失去平衡']
  },
  '划船机': {
    muscles: ['心肺功能', '背部', '腿部', '全身80%的肌肉'],
    steps: ['坐在滑座上，双脚绑好，双手握住把手', '【拉起顺序】：先用力蹬直双腿，然后躯干稍微向后倾斜，最后手臂拉向胸下', '【回放顺序】：先伸直手臂，然后躯干前倾，最后屈膝滑回'],
    tips: ['这是健身房里效率最高、对关节冲击最小的全身有氧器械', '记住口诀："腿-背-手，手-背-腿"'],
    mistakes: ['顺序错乱（腿还没伸直手就拉了）', '弯腰驼背']
  },
  '风阻划船机': {
    muscles: ['心肺功能', '爆发力', '全身'],
    steps: ['动作与普通划船机一致', '主要区别在于：你拉得越快、用力越猛，风扇产生的阻力就越大'],
    tips: ['适合做HIIT（高强度间歇训练），例如：全力划30秒，慢划30秒，重复10组'],
    mistakes: ['阻力挡位设置过高（通常推荐调在3-5挡之间即可模拟真实划水感）']
  },
  '椭圆机': {
    muscles: ['心肺功能'],
    steps: ['站上脚踏板，双手握住移动把手', '开始同步协调手脚的推拉运动', '保持上半身直立，核心微收紧'],
    tips: ['这是一个"零冲击"的有氧运动，适合体重较大者或有膝盖伤病的人群保护关节', '可以尝试倒着踩，能更多刺激到臀部和腘绳肌'],
    mistakes: ['身体瘫软地趴在控制面板上', '阻力设为0，只是随着惯性空转']
  },
  '骑行机': {
    muscles: ['心肺功能', '股四头肌'],
    steps: ['调整座椅高度：当你的一侧脚踏踩到最低点时，该侧膝盖应该有轻微的弯曲', '设置好阻力，开始平稳踩踏', '保持上半身稳定，不左右摇晃'],
    tips: ['坐姿骑行（有靠背的那种）对腰椎最友好，适合大体重人群'],
    mistakes: ['座椅调得太低，导致膝盖一直弯着受力（容易损伤膝盖）']
  },
  '动感单车': {
    muscles: ['心肺功能', '下肢肌群'],
    steps: ['调整座椅和车把手高度', '固定好鞋套，开始踩踏', '可以根据节奏进行坐姿骑行、站立爬坡等动作变化', '训练结束慢慢减速，不可突然停止飞轮'],
    tips: ['动感单车的飞轮很重且没有自由飞轮机制，脚踏会带着你的脚转，紧急情况需按下刹车闸'],
    mistakes: ['站立骑行时身体重心过于靠前压在手把上']
  },
  '攀爬机': {
    muscles: ['心肺功能', '臀大肌', '股四头肌'],
    steps: ['踏上楼梯踏板，按下开始键，台阶开始下降', '保持挺胸抬头，像爬楼梯一样交替向上迈步', '全脚掌着地，主动用臀部和大腿发力踩下台阶'],
    tips: ['又称"有氧之王"，燃脂效率较高，同时能有效地锻炼到臀腿肌肉', '尽量不要死死抓着扶手借力'],
    mistakes: ['上半身瘫倒在控制台上，踮着脚尖走']
  },
  '跳绳': {
    muscles: ['心肺功能', '小腿', '肩部耐力'],
    steps: ['双手握住手柄，绳子在脚后跟', '手腕发力转动绳子', '绳子从头上转过时，前脚掌轻轻弹跳跃过', '保持平稳的呼吸和节奏'],
    tips: ['跳跃的高度只需要刚好让绳子通过即可，切勿跳得太高', '是好的便携式高强度有氧运动'],
    mistakes: ['整个手臂大幅度抡圈（应该用手腕转）', '脚跟着地重重砸向地面']
  },
  '开合跳': {
    muscles: ['心肺功能', '全身协调性'],
    steps: ['站立，双脚并拢，双手自然下垂', '向上跳起，同时双脚向两侧张开，双手举过头顶击掌或靠近', '再次跳起，双脚并拢，双手放回体侧', '快速连续进行'],
    tips: ['膝盖始终保持微屈，起到缓冲作用', '这是优秀的训练前热身动作，能快速升高心率和体温'],
    mistakes: ['跳跃落地时膝盖关节完全锁死笔直']
  },
  '波比跳': {
    muscles: ['心肺功能', '爆发力', '全身绝大部分肌群'],
    steps: ['站立姿势开始，下蹲，双手撑在地面上', '双腿向后跳，呈高位平板支撑姿势', '（可选）做一个标准的俯卧撑', '双腿向前跳回深蹲姿势', '向上用力跳起，双手在头顶击掌'],
    tips: ['公认的"高强度"燃脂动作，能快速提升心率', '如果是新手，可以去掉俯卧撑，以及把双腿"跳"向后改为"走"向后以降低难度'],
    mistakes: ['在平板支撑阶段腰部严重塌陷', '落地没有缓冲，脚砸地面']
  },
  '开合跳热身': {
    muscles: ['全身'],
    steps: ['双脚并拢站立，双手自然下垂', '跳起时双脚向外张开，同时双手从身体两侧上举并在头顶击掌', '再次跳起，双脚合拢，双手收回身体两侧', '保持轻快的节奏，均匀呼吸'],
    tips: ['落地时保持膝盖微屈，前脚掌先着地，起到缓冲作用', '核心收紧，保持上半身挺直'],
    mistakes: ['全脚掌或脚跟重重砸地', '动作过于僵硬，憋气']
  },
  '肩关节环绕': {
    muscles: ['三角肌', '肩袖肌群'],
    steps: ['站立，双臂自然下垂或微微抬起', '以肩关节为轴，缓慢向前画大圆环绕约30秒', '随后反方向向后画大圆环绕约30秒'],
    tips: ['动作要连贯、缓慢，感受肩胛骨的活动', '幅度可以由小到大逐渐增加'],
    mistakes: ['速度过快导致肩关节弹响', '耸肩借力']
  },
  '扩胸运动': {
    muscles: ['胸大肌', '三角肌前束'],
    steps: ['站立，双臂曲肘平抬至胸前', '随着吸气，将双臂用力向后振，扩张胸部', '呼气，收回双臂至胸前', '可以结合上下交替振臂动作'],
    tips: ['向后振时能明显感觉到胸肌的拉伸感', '背部肩胛骨有相向挤压的感觉'],
    mistakes: ['腰部过度反折代偿', '用力过猛拉伤韧带']
  },
  '徒手深蹲激活': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['双脚与肩同宽，脚尖微向外八', '臀部向后下方坐下，像要坐在一张椅子上', '下蹲至大腿与地面平行或略低，背部保持平直', '脚后跟发力站起，恢复站立姿势'],
    tips: ['下蹲时膝盖的朝向要与脚尖一致', '重心应保持在脚掌偏后跟的位置'],
    mistakes: ['膝盖严重内扣', '弯腰驼背']
  },
  '弓步转体': {
    muscles: ['股四头肌', '臀大肌', '腹外斜肌'],
    steps: ['双脚并拢站立，单脚向前迈出一大步', '下蹲至前侧大腿平行地面，后侧膝盖微触地或悬空', '双手合十伸向前方，躯干向迈出腿的一侧旋转', '转回正前方，前脚蹬地退回起始位置，换腿重复'],
    tips: ['旋转时目光跟随双手移动，增加脊柱旋转幅度', '动作要稳定、缓慢'],
    mistakes: ['前膝超过脚尖过多导致脚跟抬起', '身体摇晃失去平衡']
  },
  '高抬腿走': {
    muscles: ['髂腰肌', '臀大肌', '下肢肌群'],
    steps: ['保持直立，双手可以叉腰或在身前', '抬起一侧膝盖，尽量贴近胸部', '双手可抱住膝盖向上拉伸一秒，然后放下', '交替另一侧腿，可以原地进行或行进间进行'],
    tips: ['核心收紧，支撑腿保持伸直', '抬腿时呼气，放下时吸气'],
    mistakes: ['上半身过度后仰去迎合膝盖']
  },
  '登山者': {
    muscles: ['核心肌群', '髋屈肌'],
    steps: ['呈标准俯卧撑姿势起始，双手略宽于肩，身体呈一条直线', '收紧腹部，将一侧膝盖迅速提至胸下', '快速将腿收回原位，同时另一侧膝盖提至胸下', '左右交替，保持较快的节奏连续进行'],
    tips: ['想象你在原地水平爬山，尽量保持臀部高度不变', '目光看向双手前方一点的地面，保持颈部自然'],
    mistakes: ['臀部撅得过高', '腰部严重塌陷受力']
  },
  '婴儿式背部拉伸': {
    muscles: ['背阔肌', '竖脊肌'],
    steps: ['双膝跪地，臀部向后坐在脚后跟上', '上半身向前趴下，额头触地', '双臂向前尽力伸展，手掌贴地', '保持姿势，深长地呼吸，每次呼气时感受背部放松'],
    tips: ['如果额头碰不到地，可以垫一个瑜伽砖或毛巾', '想象手指在向前爬行，拉长整个背部'],
    mistakes: ['臀部抬起离开了脚后跟过多']
  },
  '胸部静态拉伸': {
    muscles: ['胸大肌', '三角肌前束'],
    steps: ['找一面墙或门框，侧身站立', '将一侧小臂和手掌平贴在墙面上，大臂与地面平行（呈90度）', '身体缓慢向反方向（向外）旋转，直到胸部有明显的拉伸感', '保持30秒，然后换另一侧'],
    tips: ['可以通过调整手肘的高度（偏高或偏低）来拉伸胸大肌的不同纤维', '保持均匀呼吸，不要过度疼痛'],
    mistakes: ['身体过度前倾而不是旋转', '耸肩']
  },
  '肩后侧拉伸': {
    muscles: ['三角肌后束', '菱形肌'],
    steps: ['站立或坐姿，抬起一侧手臂使其横过胸前，与地面平行', '用另一只手钩住该手臂的手肘后侧', '轻轻向胸口方向施加压力，感受肩膀后侧的拉伸', '保持30秒后换边'],
    tips: ['被拉伸的手臂尽量保持伸直但不要死锁关节', '拉伸时保持肩膀下沉，不要耸起'],
    mistakes: ['身体跟着手臂一起旋转，失去了相对拉伸力']
  },
  '三头肌拉伸': {
    muscles: ['肱三头肌'],
    steps: ['站立或坐立，挺胸收腹', '将一侧手臂向上举起，贴近耳朵，然后弯曲手肘，手掌去触摸后背肩胛骨中间', '用另一只手握住弯曲的手肘，向后、向内轻轻按压', '感受大臂后侧的拉伸，保持30秒后换边'],
    tips: ['头不要低，可以微微向后靠在手臂上，增加拉伸感'],
    mistakes: ['过度弓背', '低头驼背']
  },
  '股四头肌拉伸': {
    muscles: ['股四头肌', '髂腰肌'],
    steps: ['单腿站立，可以单手扶墙保持平衡', '另一只手抓住同侧脚的脚踝，向臀部方向拉', '将脚跟贴近臀部，同时微微将髋部向前顶', '保持30秒后换腿'],
    tips: ['拉伸腿的膝盖应尽量与支撑腿靠拢，不要向外打开', '身体直立，不要为了拉脚踝而过度弯腰'],
    mistakes: ['腰椎过度前凸（骨盆前倾）去代偿伸髋']
  },
  '腘绳肌/体前屈': {
    muscles: ['腘绳肌', '小腿三头肌'],
    steps: ['站立，双脚并拢或与髋同宽', '保持双腿伸直（膝盖不锁死），从髋部开始折叠上半身', '双手顺着双腿慢慢向下滑，尽量去触摸脚趾或地面', '在最底端放松头部和颈椎，保持自然呼吸30秒'],
    tips: ['重点是骨盆的翻转（屁股向天空翻），而不是背部弯曲', '感觉大腿后侧有强烈拉伸感即可，不要求必须摸到地'],
    mistakes: ['膝盖完全锁死反曲', '强行弯腰低头去够地面']
  },
  '臀大肌拉伸': {
    muscles: ['臀大肌', '梨状肌'],
    steps: ['仰卧在瑜伽垫上，双膝弯曲，脚踩地', '将一侧脚踝架在另一侧腿的膝盖正下方（呈阿拉伯数字4的形状）', '双手抱住支撑腿的大腿后侧，缓慢向胸口方向拉', '感受架起腿一侧的臀部深层拉伸，保持30秒换边'],
    tips: ['尽量让肩膀和头部放松贴在地面上', '如果抱不到大腿，可以用毛巾套住大腿借力'],
    mistakes: ['过度抬头导致脖子酸痛']
  },
  '髂胫束拉伸': {
    muscles: ['髂胫束', '阔筋膜张肌'],
    steps: ['站立姿势，将要拉伸的一侧腿从另一条腿的后方交叉过去', '保持双脚踩实地面', '将一侧手臂上举，身体向没有拉伸腿的那一侧侧倾', '感受大腿外侧到腰部的拉伸感，保持30秒换边'],
    tips: ['重心尽量放在后方那条腿的脚外侧', '可以通过扶墙增加稳定性'],
    mistakes: ['身体前倾，失去了侧面的拉伸力']
  },
  '眼镜蛇式': {
    muscles: ['腹直肌'],
    steps: ['俯卧在垫子上，双腿并拢伸直，脚背贴地', '双手放在胸部两侧的地板上，手指朝前', '吸气，双臂慢慢用力推起上半身，直到双臂伸直或微屈', '头微仰看向天花板，骨盆尽量保持贴在地面'],
    tips: ['收紧臀部可以有效保护下背部', '如果腰椎感觉压迫，可以将手肘撑地（人面狮身式）代替'],
    mistakes: ['耸肩把头缩在肩膀里', '骨盆过度离开地面']
  },
  '器械内收机': {
    muscles: ['内收肌群', '大腿内侧'],
    steps: ['坐在器械上，背部贴紧靠背，双腿分开放在挡板外侧', '双手握住两侧扶手，收紧核心', '用大腿内侧力量向内夹拢双腿，顺端收缩停留 1-2 秒', '缓慢控制向外打开，不要完全放松'],
    tips: ['与器械外展机配对使用，平衡内外侧肌肉发展', '对应 Tecnogym Adductor 器械'],
    mistakes: ['用惯性夹合而不是肌肉发力', '配重片碘碰产生擞击']
  },
  '器械上背划船': {
    muscles: ['上背', '菱形肌', '中旜形肌'],
    steps: ['坐在器械上，胸部贴紧前方靠垂，双手握住把手', '手肘向后上方拉起，挤压肩胛骨中间', '顾峰收缩停留 1 秒', '缓慢控制回放至手臂伸直'],
    tips: ['与高位下拉、坐姿划船不同，这个动作主要孤立上背和菱形肌', '对应 Tecnogym Upper Back 器械'],
    mistakes: ['身体后仰借力', '仅用手臂拉而不是背部发力']
  },
  '壶铃摆动': {
    muscles: ['臀大肌', '腘绳肌', '核心肌群'],
    steps: ['双脚略宽于肩，脚尖微向外，双手握住壶铃把手', '髋部后推，让壶铃从胯间向后摆动', '臀部爆发式向前推，将壶铃用惯性摆至胸口高度', '用臀部和核心控制下落，重复'],
    tips: ['壶铃摆动是髋部铰链动作，手臂只是“挂钩”不主动发力', '对臀部和后侧链激活效果极佳'],
    mistakes: ['用手臂抑或肩膀向前拉壶铃', '弯腰驼背而不是髋部后推', '膝盖过度前推变成了深蹲']
  },
  '壶铃高脚杯深蹲': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['双手托住壶铃的球部，贴在胸前', '双脚略宽于肩，脚尖微外八', '保持挺胸，臀部向后下方坐下，类似坐在一张不存在的椅子上', '下蹲至大腿平行地面或更低，用脚后跟发力站起'],
    tips: ['壶铃的球部形状让双手托住更自然舒适，比哑铃版本更容易上手', '适合初学者和热身激活'],
    mistakes: ['胡盖内扣', '重心前移到脚掌前部']
  },
  '上肢功率车': {
    muscles: ['心肺功能', '三角肌', '胱二头肌', '胸大肌'],
    steps: ['坐在器械上，调整座椅高度，使手把在胸口高度', '双手交替採踏手把，类似爬楼梯但用手臂驱动', '保持稳定的节奏，核心收紧', '可调节阻力和转速'],
    tips: ['对应 Tecnogym Excite Top 器械', '上肢为主的有氧训练，适合下肢受伤时替代'],
    mistakes: ['只用手掊不用手臂发力', '坐姿弯腰驼背']
  },

  // === 游泳 (Swimming) ===
  '水中行走热身': {
    muscles: ['全身肌群', '心肺适应'],
    steps: ['下水后先在浅水区沿池边慢走', '双臂在水中自然前后摆动，感受水的阻力', '逐渐加快步伐，可以加入抬膝走或侧步走', '持续3-5分钟，让身体适应水温和浮力'],
    tips: ['不要急着游，让身体充分适应水温能防止抽筋', '水中行走本身就是很好的全身热身，水的阻力会让心率自然上升'],
    mistakes: ['直接跳入水中开始游（容易抽筋）', '在深水区行走（初学者应在浅水区）']
  },
  '水中呼吸练习': {
    muscles: ['呼吸肌群', '心肺功能'],
    steps: ['站在浅水区，水深到胸部', '用嘴深吸一口气，然后将脸部没入水中', '在水中通过鼻子缓慢持续地吐出气泡，直到完全吐完', '抬头出水面，用嘴迅速吸气，重复循环'],
    tips: ['口诀：嘴吸鼻吐。这是所有泳姿的呼吸基础', '吐气要缓慢持续，不要一下子全吐完', '节奏感很重要：水中吐3秒，出水吸1秒'],
    mistakes: ['在水中憋气不吐（导致下一次换气来不及）', '用嘴在水中吐气（容易呛水）', '抬头太高太急']
  },
  '扶边蛙泳腿练习': {
    muscles: ['股四头肌', '腘绳肌', '小腿', '臀大肌'],
    steps: ['双手扶住池边，身体俯卧浮在水面上', '收腿：小腿向臀部方向折叠，脚跟靠近臀部', '翻脚：脚踝向外翻，脚尖向外侧勾起（"锄头脚"）——这是获得推力的关键！', '蹬夹：向后斜下方圆弧形蹬出，然后双腿快速并拢，脚尖绷直', '感受蹬夹后身体被推动向前滑行的感觉'],
    tips: ['四字口诀：收、翻、蹬、夹', '脚踝外翻（勾脚）是最关键的一步，很多初学者忘记翻脚导致蹬不动水', '可以先在岸上趴在长凳边缘反复练习，感受勾脚动作', '蹬出后要有一个滑行停顿，不要连续不停地收蹬'],
    mistakes: ['忘记翻脚（脚尖不勾起，像自由泳一样蹬，完全没有推力）', '收腿时膝盖向外打开太多（应该是小腿折叠，膝盖基本不动）', '蹬完后没有滑行，马上又开始收腿']
  },
  '蹬壁滑行练习': {
    muscles: ['核心肌群', '全身流线型控制'],
    steps: ['面朝泳池方向，一只脚踩在池壁上', '双手合十向前伸直，夹住头部两侧', '深吸气，身体绷紧呈流线型', '用脚用力蹬离池壁，像一支箭一样向前滑行', '保持姿态不动，感受水流推动身体，直到自然停下'],
    tips: ['全身要像一根"棍子"一样笔直绷紧，这就是游泳中最重要的"流线型"', '头部不要抬起看前方，夹在两臂之间，看池底', '蹬得越用力+身体越绷紧=滑得越远'],
    mistakes: ['蹬壁后身体松垮（像一团面条，滑不动）', '头抬起看前方（破坏流线型，增加阻力）', '双腿分开']
  },
  '蛙泳手部划水练习': {
    muscles: ['三角肌', '胸大肌', '背阔肌'],
    steps: ['站在浅水区，弯腰使肩膀入水，双手前伸合拢', '双手向两侧外划，掌心向外，不要超过肩宽', '手掌转向内，向内"抱水"，同时抬头出水面迅速吸气', '双手快速向前并拢伸直，头入水，恢复初始位置'],
    tips: ['手的划水范围不要太大，向两侧打开到肩宽即可', '抱水（向内收）和抬头吸气是同时进行的', '手向前伸直的动作要快，这样可以减少阻力'],
    mistakes: ['手划得太大（超过肩宽很多，像在扒水）', '手向后划（应该是向两侧再向内，不是向后拉）', '抬头太高（只需要嘴巴出水面就够了）']
  },
  '蛙泳完整配合': {
    muscles: ['全身肌群', '心肺耐力'],
    steps: ['从蹬壁滑行姿势开始', '双手开始向外划水，同时抬头换气', '在手向内抱水的同时，开始收腿（小腿向臀部折叠）', '手向前伸直入水的瞬间，用力蹬夹腿', '蹬腿后保持流线型滑行2-3秒，再进入下一个循环'],
    tips: ['核心口诀：划手→抬头吸气→收腿→蹬夹滑行', '最重要的原则：先划手，后蹬腿。手脚不能同时动！', '每次蹬腿后要享受滑行，不要像踩水一样不停动', '初学者可以"划一次手，蹬一次腿，滑行数两秒"来控制节奏'],
    mistakes: ['手脚同时动（互相抵消推力，游不动）', '不滑行就连续做动作（迅速耗尽体力）', '把头抬得很高（增加下半身下沉的阻力）']
  },
  '水中漫步放松': {
    muscles: ['全身', '心肺恢复'],
    steps: ['在浅水区慢速行走或轻柔踢水', '双臂在水中缓慢划动，不需要用力', '调整呼吸，深长呼气让心率逐渐恢复', '可以配合简单的水中拉伸动作'],
    tips: ['这是训练结束的重要环节，帮助肌肉放松和排乳酸', '可以做一些水中的肩部和腿部拉伸'],
    mistakes: ['训练完直接上岸不做放松']
  },
  '蛙泳连续游': {
    muscles: ['全身肌群', '心肺耐力'],
    steps: ['从蹬壁出发，进入完整蛙泳配合', '保持稳定的划手-蹬腿-滑行节奏', '每次蹬腿后充分利用滑行，节省体力', '游到对面池边后蹬壁转身继续'],
    tips: ['连续游的关键是节奏而不是速度，保持从容的节奏', '关注滑行时间：好的蛙泳70%的时间都在滑行', '如果觉得累，加长滑行时间而不是加快动作频率'],
    mistakes: ['为了快而加速手脚频率（反而更累更慢）', '不敢把头放入水中导致始终仰头游']
  },
  '蛙泳间歇训练': {
    muscles: ['心肺功能', '无氧耐力', '全身'],
    steps: ['从池边出发，以较快速度游完25米', '到达对面池边后停下休息30-45秒', '再次出发游25米', '重复4-6组'],
    tips: ['间歇训练能高效提升心肺能力和游泳专项体能', '休息时不要上岸，扶着池边做几次深呼吸即可', '随着能力提升，可以缩短休息时间或增加距离到50米'],
    mistakes: ['休息时间太长（失去间歇效果）', '每一趟都用全力冲刺（应保持7-8成力即可）']
  },
  '踩水练习': {
    muscles: ['核心肌群', '腿部耐力'],
    steps: ['在深水区（确保旁边有池边可扶），身体直立', '双腿做类似蛙泳腿的动作：交替向外蹬水', '双手在水面附近轻轻划水辅助保持平衡', '保持头部在水面以上，正常呼吸'],
    tips: ['踩水和蛙泳腿非常相似，学会蛙泳腿后踩水就容易了', '这是游泳中最重要的自救技能', '不要紧张，身体越放松越容易浮起来', '刚开始练习时请确保旁边有池边可以随时抓住'],
    mistakes: ['身体过度紧张导致下沉', '动作幅度太大消耗过多体力', '在没有安全保障的深水区独自练习']
  },
  '蹬壁转身练习': {
    muscles: ['核心', '腿部爆发力'],
    steps: ['游到池边时，一只手先触壁', '身体紧贴池壁蜷缩，双脚踩上池壁', '转身面向游来的方向，蹬壁出发', '进入流线型滑行后开始正常游进'],
    tips: ['开放式转身（非翻滚转身），适合初学者', '触壁后动作要紧凑，尽量减少停留时间', '蹬壁力度要大，利用好这段"免费加速"'],
    mistakes: ['在池边停留太久再出发', '蹬壁后身体不绷紧，浪费了惯性']
  },
  '自由泳打腿练习': {
    muscles: ['臀大肌', '股四头肌', '核心'],
    steps: ['双手扶住池边，身体俯卧浮在水面', '双腿伸直，从髋部发力上下交替打水', '膝盖保持微屈，不要大幅度弯曲', '脚踝放松，像鞭子的末端一样自然摆动', '打水幅度控制在30-40厘米'],
    tips: ['打腿的力量来自髋部（大腿根部），不是膝盖', '脚踝越放松，打水越有效率', '水花不应该太大，高效的打腿水花很小'],
    mistakes: ['膝盖大幅度弯曲（像蹬自行车一样踢水）', '脚踝僵硬（水阻极大，打不动水）', '只在水面以上打水（应该是水下为主）']
  },
  '自由泳划臂+侧头呼吸': {
    muscles: ['背阔肌', '三角肌', '核心旋转'],
    steps: ['站在浅水区，弯腰使肩膀入水', '单臂向前伸直，另一只手在体侧', '前伸的手向下向后划水，同时身体向划水手一侧微微转动', '划水手到体侧时，身体随之旋转，将嘴巴转到水面以上换气', '换完气后手举过头顶向前入水，开始另一侧'],
    tips: ['呼吸的秘诀：不是转头，而是转动整个身体（身体旋转带动头部）', '嘴巴只需要一半露出水面就能吸气', '先在站立状态下反复练习划臂+转头呼吸的配合'],
    mistakes: ['抬头呼吸（应该是侧头/转体呼吸）', '只转头不转身（容易脖子酸）', '划水时手臂越过中线（应该是直线向后划）']
  },
  '自由泳完整配合': {
    muscles: ['全身肌群', '心肺耐力'],
    steps: ['蹬壁出发，进入流线型滑行', '开始交替划臂，配合连续打腿', '每划2-3次手臂换一次气（侧头呼吸）', '保持身体水平，核心收紧'],
    tips: ['初学者建议先游短距离（10-15米），不要急于游全程', '呼吸是自由泳最大的挑战，不要着急，慢慢来', '如果觉得呛水，可以回到蛙泳调整后再尝试'],
    mistakes: ['头一直抬在水面上（应该大部分时间脸在水中）', '手脚动作不协调（先专注于放松地划水，不要用蛮力）', '因为紧张而加快频率（越快越乱，应该放慢节奏）']
  }
};


// ══ Guided workout mode (逐个动作引导 + 组间自动计时) ══════
let _wmDate = null, _wmIdx = 0, _wmSet = 1;
let _wmSide = 0, _wmCd = null;   // 计时动作:双侧动作现在做到第几侧;倒计时 {idx,end,total,timer}
let _wmAdj = false, _wmExName = null;   // 「调整」展开了没有;上次画的是哪个动作(换 / 划掉之后从第 1 组重新来)
function _wmIsTimed(ex) { return !!ex && (ex.unit === '秒' || ex.unit === '分钟'); }
// 「简单」= 只做一轮:热身、纯拉伸、有氧、游泳。按秒计的主项(平板支撑 3×30秒)照样分组 + 组间休息
function _wmIsSimple(ex) { return ex.isWarmup || (ex.isStretch && !isWeightedMove(ex.name)) || ex.group === 'cardio' || ex.group === 'swimming' || !!ex.swimPhase || (ex.unit !== '次' && ex.unit !== '秒'); }
function _wmFmt(sec) { sec = Math.max(0, Math.ceil(sec)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
function _wmStopCd() {
  if (!_wmCd) return;
  clearInterval(_wmCd.timer); _wmCd = null;
  try { _releaseWakeLock(); } catch (e) {}
}
// 计时动作:主按钮「开始 N 秒」→ 卡片里倒计时 → 到点响一声,自动进入下一组/下一侧/下一个动作
function wmStartCountdown() {
  const day = S.plan && S.plan.days.find(d => d.date === _wmDate); if (!day) return;
  const ex = day.exercises[_wmIdx]; if (!_wmIsTimed(ex)) return;
  const reps = getAdj(_wmDate, _wmIdx, 'r', ex.reps);
  const total = Math.max(1, ex.unit === '分钟' ? reps * 60 : reps);
  if (typeof stopTimer === 'function') stopTimer();   // 组间休息还没跑完就开练了 → 收起休息计时
  try { unlockAudio(); } catch (e) {}
  _wmStopCd();
  _wmCd = { idx: _wmIdx, end: Date.now() + total * 1000, total, timer: null };
  try { _requestWakeLock(); } catch (e) {}
  renderGuided();
  _wmCd.timer = setInterval(_wmTick, 250);
  _wmTick();
}
function _wmTick() {
  if (!_wmCd) return;
  const left = (_wmCd.end - Date.now()) / 1000;
  const el = document.getElementById('wm-cd'); if (el) el.textContent = _wmFmt(left);
  const bar = document.getElementById('wm-cd-bar'); if (bar) bar.style.width = Math.min(100, Math.max(0, (1 - left / _wmCd.total) * 100)) + '%';
  if (left <= 0) _wmCdDone();
}
function _wmCdDone() {
  const day = S.plan && S.plan.days.find(d => d.date === _wmDate);
  const ex = day && day.exercises[_wmIdx];
  _wmStopCd();
  try { playDing(); } catch (e) {}
  try { if ('vibrate' in navigator) navigator.vibrate([150, 80, 150]); } catch (e) {}
  if (ex && ex.bi && _wmSide === 0) { _wmSide = 1; renderGuided(); return; }   // 双侧动作:换另一侧,等你准备好再点开始
  wmDoneSet();
}
function wmCancelCountdown() { _wmStopCd(); renderGuided(); }
function startGuided(date) {
  const day = S.plan && S.plan.days.find(d => d.date === date);
  if (!day || !day.exercises || !day.exercises.length) { if (typeof showToast === 'function') showToast('今天没有可做的动作'); return; }
  _wmDate = date;
  const s = day.exercises.findIndex((ex, i) => !(S.prog[date] && S.prog[date][i]));
  _wmIdx = s < 0 ? 0 : s; _wmSet = 1; _wmSide = 0; _wmStopCd(); _wmAdj = false; _wmExName = null;
  wkMarkStart(date);
  const m = document.getElementById('workout-modal'); if (m) m.classList.add('open');
  
  if (_xMode && _ownerSession()) _xGuidedStart(() => renderGuided());
  else renderGuided();
}
function wmClose() {
    _wmStopCd(); _wmSide = 0;
    const m = document.getElementById('workout-modal');
    if (m) m.classList.remove('open');
    if (typeof stopTimer === 'function') stopTimer();
    _xGuidedStop();
}
function renderGuided() {
  const date = _wmDate, day = S.plan && S.plan.days.find(d => d.date === date), card = document.getElementById('wm-card');
  if (!day || !card) return;
  const list = day.exercises;
  if (_wmIdx >= list.length) { wmClose(); render(); endWorkoutEarly(date); return; }
  const ex = list[_wmIdx], simple = _wmIsSimple(ex);
  // 换了一个动作(上一个 / 下一个、换 / 划掉):从第 1 组重新来,计时作废,「调整」收起
  if (_wmExName !== ex.name) { if (_wmExName !== null) { _wmSet = 1; _wmSide = 0; _wmStopCd(); } _wmAdj = false; _wmExName = ex.name; }
  const sets = simple ? 1 : getAdj(date, _wmIdx, 's', ex.sets), reps = getAdj(date, _wmIdx, 'r', ex.reps);
  if (!simple && _wmSet > sets) _wmSet = sets;   // 「调整」里把组数减到了当前组以下
  const needW = needsWeightUI(ex);
  const lastW = typeof getLastWeight === 'function' ? (getLastWeight(ex.name, true) || getLastWeight(ex.name, false)) : null;
  const e1rm = typeof estimate1RM === 'function' ? estimate1RM(ex.name) : null, curW = getWeight(date, _wmIdx);
  let dispName = ex.name; let dispNote = ex.note;
  const alt = _xMode && _ownerSession() && hasGoal('女性曲线') ? _xAltDesc(ex.name) : null;
  if (alt) {
    try {
      dispName = _xDec(alt.name) || ex.name;
      dispNote = _xDec(alt.steps[0]) || ex.note;
    } catch(e) {}
  }
  // 主按钮:按次的「完成这组」;按秒/分钟的先给「开始 N 秒」,倒计时中换成「提前完成」
  const doneLbl = simple ? '完成 ✓' : (_wmSet < sets ? '完成这组 → 休息' : '完成最后一组 ✓');
  const timed = _wmIsTimed(ex), running = timed && _wmCd && _wmCd.idx === _wmIdx;
  const sideLbl = ex.bi ? (_wmSide ? '另一侧 ' : '第一侧 ') : '';
  // 调整(组 / 次 / kg,和今天页同一套 adj / stepWeight;它们会 render(),render 末尾 _wmSync 把这张卡重画)、换 / 划掉、问教练
  const i = _wmIdx, adjOpen = _wmAdj, aiOn = typeof coachAccess === 'function' && coachAccess() === 'on';
  const canSwap = !(ex.isWarmup || (ex.isStretch && !isWeightedMove(ex.name))) && ex.swimPhase !== 'warmup' && ex.swimPhase !== 'cooldown';
  const unitLbl = ex.unit === '秒' ? '秒' : ex.unit === '分钟' ? '分钟' : '次';
  const kgVal = needW ? (curW !== null ? curW : (suggestWeight(ex.name) ?? '—')) : null;
  let mainBtn = `<button class="btn-primary" onclick="wmDoneSet()">${doneLbl}</button>`, cdBlock = '', altBtn = '';
  if (running) {
    cdBlock = `<div class="wm-cd"><div class="tag">${sideLbl}</div><div id="wm-cd" class="cd">${_wmFmt((_wmCd.end - Date.now()) / 1000)}</div><div class="wm-bar"><i id="wm-cd-bar"></i></div></div>`;
    mainBtn = `<button class="btn-primary" onclick="_wmCdDone()">提前完成 ✓</button>`;
    altBtn = `<button class="btn-line" onclick="wmCancelCountdown()">取消计时</button>`;
  } else if (timed) {
    mainBtn = `<button class="btn-primary" onclick="wmStartCountdown()">▶ 开始 ${sideLbl}${reps} ${ex.unit}</button>`;
    altBtn = `<button class="btn-line" onclick="wmDoneSet()">不计时，直接${doneLbl.replace(' → 休息', '')}</button>`;
  }
  // 运动风格:荧光绿焦点卡(skin-sport.js 60 区);id(wm-weight / wm-cd / wm-cd-bar)和点了调的函数不变
  card.innerHTML = skinTpl('guided', { date, idx: _wmIdx, set: _wmSet, side: _wmSide, list, ex, simple, sets, reps, needW, lastW, e1rm, curW, dispName, dispNote, timed, running, sideLbl, adjOpen, aiOn, canSwap, unitLbl, kgVal }, () => `<div class="wm-top"><span class="sheet-eyebrow">引导训练 · 动作 ${_wmIdx + 1}/${list.length}</span><button class="ex-modal-close" onclick="wmClose()" aria-label="关闭引导训练">关闭</button></div>
  <h2 class="wm-name">${dispName}</h2>
  <p class="tag">${(ex.muscle || []).join(' · ') || (ex.isWarmup ? '热身' : ex.isStretch ? '拉伸' : '')}</p>
  <div class="wm-set">${simple ? `${reps} ${ex.unit}` : `第 <b>${_wmSet}</b> / ${sets} 组 · 目标 ${reps} ${ex.unit}${ex.bi ? '/每侧' : ''}`}</div>
  ${needW ? `<div class="wm-weight"><label for="wm-weight">重量</label><input id="wm-weight" type="number" inputmode="decimal" step="0.5" value="${curW || ''}" placeholder="${lastW ? lastW.weight : ''}"><span>kg${lastW ? ' · 上次 ' + lastW.weight : ''}${e1rm ? ' · 1RM≈' + e1rm : ''}</span></div>` : ''}
  <div class="actions wm-acts"><button type="button" class="link-btn" aria-expanded="${adjOpen}" onclick="wmToggleAdj()">${adjOpen ? '▴ 收起' : '▾ 调整'}</button>${canSwap ? `<button type="button" class="link-btn swap-btn" onclick="swapExercise('${date}',${i})">换 / 划掉</button>` : `<button type="button" class="link-btn" onclick="openSwapSheet('${date}',${i})">划掉</button>`}${aiOn ? `<button type="button" class="link-btn" onclick="wmClose();coachAskAbout('${_q(ex.name)}')">问教练</button>` : ''}</div>
  ${adjOpen ? `<div class="wm-edit">${simple ? '' : _stepRowHtml('组', `${sets}`, `adj('${date}',${i},'s',-1)`, `adj('${date}',${i},'s',1)`, sets <= 1)}${_stepRowHtml(unitLbl, `${reps}${ex.bi ? '<span class="step-unit"> /每侧</span>' : ''}`, `adj('${date}',${i},'r',-1)`, `adj('${date}',${i},'r',1)`, reps <= (ex.unit === '秒' ? 5 : 1))}${needW ? `<div class="stepper"><span class="step-lbl">kg</span><button type="button" class="step-btn" onclick="stepWeight('${date}',${i},-1)" aria-label="重量减少">−</button><span class="step-val">${kgVal}</span><button type="button" class="step-btn" onclick="stepWeight('${date}',${i},1)" aria-label="重量增加">+</button></div>` : ''}</div>` : ''}
  ${dispNote ? `<div class="exnote">${dispNote}</div>` : ''}
  ${cdBlock}<div class="wm-nav"><button class="btn-line" onclick="wmNav(-1)" aria-label="上一个动作">↑</button>${mainBtn}<button class="btn-line" onclick="wmNav(1)" aria-label="下一个动作">↓</button></div>${altBtn}
  <button class="btn-line" onclick="wmFinish()">结束训练并打卡</button>`);
  const wEl = document.getElementById('wm-weight');
  if (wEl) wEl.addEventListener('change', () => { const v = parseFloat(wEl.value); if (isFinite(v) && v > 0) setWeight(date, _wmIdx, v); });
  if (typeof skinAfterRender === 'function') skinAfterRender('guided');   // 运动风格:卡里的组间倒计时接上计时器
}
// 引导卡原地重画:焦点留在刚点的那个按钮上(键盘 / 读屏不丢位置),滚动位置不动
function _wmRerender() {
  const card = document.getElementById('wm-card'); if (!card) return;
  const keyOf = el => el.id || el.getAttribute('onclick') || el.getAttribute('aria-label') || '';
  const a = document.activeElement, key = a && a !== card && card.contains(a) ? keyOf(a) : '', top = card.scrollTop;
  renderGuided();
  card.scrollTop = top;
  if (key) { const b = [...card.querySelectorAll('button, input')].find(x => keyOf(x) === key && !x.disabled); if (b) try { b.focus({ preventScroll: true }); } catch (e) { } }
}
function wmToggleAdj() { _wmAdj = !_wmAdj; _wmRerender(); }
// render() 末尾调:引导训练开着时,今天页的数据变了(组数 / 次数 / 重量、换了 / 划掉了动作)引导卡跟着变,停在同一个位置
function _wmSync() {
  const m = document.getElementById('workout-modal');
  if (!m || !m.classList.contains('open') || !_wmDate) return;
  const day = S.plan && S.plan.days.find(d => d.date === _wmDate);
  if (!day || !day.exercises || !day.exercises.length) { wmClose(); return; }
  if (_wmIdx >= day.exercises.length) _wmIdx = day.exercises.length - 1;   // 划掉的是最后一个
  _wmRerender();
}
function wmDoneSet() {
  _wmStopCd(); _wmSide = 0;
  const date = _wmDate, day = S.plan && S.plan.days.find(d => d.date === date); if (!day) return;
  const ex = day.exercises[_wmIdx], simple = _wmIsSimple(ex), sets = simple ? 1 : getAdj(date, _wmIdx, 's', ex.sets);
  if (!simple && _wmSet < sets) {
    _wmSet++;
    if (_xMode && _ownerSession()) _xOnSetDone();
    if ((S.restDur || 0) > 0 && typeof startTimer === 'function') startTimer(S.restDur, '组间休息');
    renderGuided(); return;
  }
  if (!S.prog[date]) S.prog[date] = {}; S.prog[date][_wmIdx] = true; saveState();
  _wmSet = 1; let n = _wmIdx + 1; while (n < day.exercises.length && S.prog[date] && S.prog[date][n]) n++; _wmIdx = n;
  if (_wmIdx >= day.exercises.length) { wmClose(); render(); endWorkoutEarly(date); return; }
  renderGuided();
}
function wmNav(dir) { _wmStopCd(); _wmSide = 0; const day = S.plan && S.plan.days.find(d => d.date === _wmDate); if (!day) return; _wmIdx = Math.max(0, Math.min(day.exercises.length - 1, _wmIdx + dir)); _wmSet = 1; renderGuided(); }
function wmFinish() { wmClose(); render(); endWorkoutEarly(_wmDate); }

let _currentExDetailName = '';


// ══ 动作演示 GIF(hasaneyldrm/exercises-dataset,GIF素材 © Gym Visual;走 jsDelivr 热链有CORS可缓存/离线) ══
// 锁定到固定 commit(2026-07-16 的 main):@main 不锁版本,对方一挪目录图就全挂;固定 commit 在 jsDelivr 上是 immutable 缓存
const GIF_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/';
const EXERCISE_GIF = {"杠铃卧推": "videos/0025-EIeI8Vf.gif", "哑铃卧推": "videos/0289-SpYC0Kp.gif", "上斜哑铃卧推": "videos/0314-ns0SIbU.gif", "下斜杠铃卧推": "videos/0033-GrO65fd.gif", "史密斯卧推": "videos/0748-trqKQv2.gif", "坐姿推胸机": "videos/0577-T0yTjgW.gif", "器械夹胸": "videos/0596-v3xmPAR.gif", "绳索夹胸": "videos/0188-xLYSdtg.gif", "绳索下斜夹胸": "videos/0158-7saC5zz.gif", "哑铃仰卧屈臂上拉": "videos/0288-vi8EhoE.gif", "上斜哑铃飞鸟": "videos/0319-ESOd5Pl.gif", "俯卧撑": "videos/0662-I4hDWkc.gif", "杠铃推举": "videos/0091-kTbSH9h.gif", "哑铃肩推": "videos/0405-znQUdHY.gif", "器械推举": "videos/0603-67n3r98.gif", "史密斯肩推": "videos/0766-903mzG8.gif", "侧平举": "videos/0334-DsgkuIt.gif", "坐姿侧平举机": "videos/0584-dRTfGZT.gif", "绳索侧平举": "videos/0178-goJ6ezq.gif", "哑铃前平举": "videos/0310-3eGE2JC.gif", "绳索前平举": "videos/0162-u2X71Np.gif", "杠铃直立划船": "videos/0120-UDlhcO8.gif", "俯身飞鸟": "videos/0383-EAs3xL9.gif", "反向飞鸟机": "videos/0602-myfUsKf.gif", "面拉": "videos/0203-wqNPGCg.gif", "引体向上": "videos/0652-lBDjFxJ.gif", "助力引体向上机": "videos/0017-kiJ4Z2K.gif", "高位下拉": "videos/0150-eYnzaCm.gif", "坐姿划船": "videos/0861-fUBheHs.gif", "T把划船": "videos/0606-aaXr7ld.gif", "杠铃斜板划船": "videos/0049-dmgMp3n.gif", "哑铃单臂划船": "videos/0292-C0MA9bC.gif", "器械上背划船": "videos/0581-nZZZy9m.gif", "俯身划船": "videos/0293-BJ0Hz5L.gif", "绳索直臂下压": "videos/0238-x69MAlq.gif", "山羊挺身": "videos/0489-zhMwOwE.gif", "杠铃弯举": "videos/0031-25GPyDY.gif", "哑铃弯举": "videos/0294-NbVPDMW.gif", "牧师椅杠铃弯举": "videos/0070-qOgPVf6.gif", "器械弯举": "videos/0575-q6y3OhV.gif", "集中弯举": "videos/0297-gvsWLQw.gif", "斜板哑铃弯举": "videos/0318-ae9UoXQ.gif", "锤式弯举": "videos/0313-slDvUAU.gif", "绳索弯举": "videos/0868-G08RZcQ.gif", "绳索过头弯举": "videos/1636-wDUqY2u.gif", "绳索下压": "videos/0201-3ZflifB.gif", "器械三头下压": "videos/0607-Ser9eQp.gif", "绳索过头臂屈伸": "videos/0194-2IxROQ1.gif", "哑铃臂屈伸": "videos/0430-PdmaD0N.gif", "俯身单臂哑铃臂屈伸": "videos/0333-W6PxUkg.gif", "双杠臂屈伸": "videos/0251-9WTm7dq.gif", "助力双杠臂屈伸": "videos/0019-J60bN17.gif", "窄距杠铃卧推": "videos/0030-J6Dx1Mu.gif", "仰卧臂屈伸": "videos/0351-mpKZGWz.gif", "杠铃深蹲": "videos/0043-qXTaZnJ.gif", "颈前杠铃深蹲": "videos/0042-zG0zs85.gif", "史密斯深蹲": "videos/0770-jFtipLl.gif", "倒蹬机": "videos/0739-10Z2DXU.gif", "哈克深蹲": "videos/0743-Qa55kX1.gif", "腿屈伸": "videos/0585-my33uHU.gif", "保加利亚分腿蹲": "videos/0410-qx4fgX7.gif", "哑铃弓步蹲": "videos/0336-RRWFUcw.gif", "高脚杯深蹲": "videos/1760-yn8yg1r.gif", "壶铃高脚杯深蹲": "videos/0534-ZA8b5hc.gif", "哥萨克深蹲": "videos/3643-GWoKnIm.gif", "器械外展机": "videos/0597-CHpahtl.gif", "罗马尼亚硬拉": "videos/0085-wQ2c4XD.gif", "传统硬拉": "videos/0032-ila4NZS.gif", "臀推": "videos/1409-qKBpF7I.gif", "史密斯臀推": "videos/0756-CqhoytW.gif", "腿弯举": "videos/0586-17lJ1kr.gif", "坐姿腿弯举": "videos/0599-Zg3XY7P.gif", "绳索后踢腿": "videos/0228-Kpajagk.gif", "器械内收机": "videos/0598-oHsrypV.gif", "壶铃摆动": "videos/0549-UHJlbu3.gif", "臀桥": "videos/3013-u0cNiij.gif", "站姿提踵": "videos/1373-bJYHBIN.gif", "史密斯提踵": "videos/0773-6MaEjVA.gif", "腿举机提踵": "videos/1391-ykHcWme.gif", "坐姿提踵": "videos/0594-bOOdeyc.gif", "卷腹": "videos/0274-TFqbd8t.gif", "坐姿卷腹机": "videos/1452-Wgaz7pm.gif", "悬挂抬腿": "videos/0472-I3tsCnC.gif", "罗马椅抬腿": "videos/2963-weoDEpH.gif", "俄罗斯转体": "videos/0687-XVDdcoj.gif", "负重俄罗斯转体": "videos/0846-fZFZ704.gif", "死虫式": "videos/0276-iny3m5y.gif", "腹轮": "videos/0857-NAgVB3t.gif", "侧平板支撑": "videos/0705-RKjH6Lt.gif", "肩胛引体激活": "videos/0688-uTBt1HV.gif", "L撑": "videos/3419-UpWmA5E.gif", "开合跳": "videos/3220-f9lVSSI.gif", "单腿硬拉": "videos/1757-gKozT8X.gif", "单腿臀桥": "videos/3645-rmEukuS.gif"};

function renderExDetailContent() {
  const name = _currentExDetailName;
  const altEntry = _xDetailMode ? _xAltDesc(name) : null;
  const inDict = !!altEntry;
  const altActive = _xDetailMode && _ownerSession() && altEntry;

  if (_xDetailMode && typeof showToast === 'function') {
    showToast(inDict ? '专项描述' : '此动作暂无专项描述', 2000);
  }

  const info = EX_DETAIL[name];
  let dbEx = null;
  for (const exs of Object.values(DB)) { const f = exs.find(e => e.n === name); if (f) { dbEx = f; break } }

  const muscles = info?.muscles || (dbEx?.muscle?.map(m => m) || ['—']);

  const dispName = altActive ? _xDec(altEntry.name) : name;
  const steps = altActive ? altEntry.steps.map(_xDec) : (info?.steps || [dbEx?.note || '暂无详细步骤']);
  const tips = altActive ? altEntry.tips.map(_xDec) : (info?.tips || []);
  const mistakes = altActive ? [] : (info?.mistakes || []);
  
  document.getElementById('ex-modal-title').textContent = dispName;
  document.getElementById('ex-modal-muscles').innerHTML = skinTpl('exMuscles', { muscles, dispName }, () => muscles.map(m => `<span class="jchip">${m}</span>`).join(' · ') + (typeof renderMuscleDiagram === 'function' ? renderMuscleDiagram(muscles, dispName) : ''));
  
  const _e1rm = typeof estimate1RM === 'function' ? estimate1RM(name) : null;
  const _strEl = document.getElementById('ex-modal-strength');
  if (_strEl) {
    if (altActive) {
      _strEl.innerHTML = '';
    } else {
      const _dq = encodeURIComponent(_searchTerm(name) + ' 动作教学');
      const _djump = (href, label, title) => `<a href="${href}" target="_blank" rel="noopener" title="${title}">${label}</a>`;
      const _gif = (typeof EXERCISE_GIF !== 'undefined') ? EXERCISE_GIF[name] : null;
      const _gifBlock = _gif ? `<div class="gif-box"><img src="${GIF_BASE}${_gif}" alt="${name}演示" crossorigin="anonymous" loading="lazy" onerror="this.parentElement.style.display='none'"><div class="cap">动图示范 · © Gym Visual</div></div>` : '';
      const _demo = `<p class="sec-label">示范 · 看怎么做</p>
      ${_gifBlock}
      <div class="demo-links">
        ${_djump('https://www.douyin.com/search/' + _dq, '抖音', '在抖音搜索该动作演示')}
        ${_djump('https://www.xiaohongshu.com/search_result?keyword=' + _dq, '小红书', '在小红书搜索该动作演示')}
        ${_djump('https://search.bilibili.com/all?keyword=' + _dq, 'B站', '在B站搜索该动作视频')}
        ${_djump('https://keep.com/', 'Keep', '打开 Keep app（Keep 无关键词搜索链接，需自行搜索）')}
      </div>`;
      const _str = _e1rm ? `<div class="kv wide" style="margin-top:4px"><span class="k">预计 1RM</span><span>≈ ${_e1rm} kg <span class="faint">（基于你的历史）</span></span><span class="k">目标重量</span><span>力量 5 次≈${weightForReps(_e1rm, 5)} · 增肌 10 次≈${weightForReps(_e1rm, 10)} · 塑形 15 次≈${weightForReps(_e1rm, 15)} kg</span></div>` : '';
      _strEl.innerHTML = skinTpl('exStrength', { name, gif: _gif, e1rm: _e1rm, dq: _dq }, () => _demo + _str);
    }
  }
  
  document.getElementById('ex-modal-steps').innerHTML = steps.map((s, i) => `<div class="ex-step"><span class="ex-step-n">${i + 1}</span><span>${s}</span></div>`).join('');
  // 徒手但可加负荷的动作:把"怎么上重量"顶在提示第一条(反馈①:有配重框就必须写清怎么加)
  const _howW = (!altActive && typeof WEIGHT_HOW !== 'undefined' && WEIGHT_HOW[name]) ? [WEIGHT_HOW[name]] : [];
  const _allTips = _howW.concat(tips);
  document.getElementById('ex-modal-tips').innerHTML = skinTpl('exTips', { how: _howW, tips }, () => _allTips.length ? _allTips.map((t, i) => (i < _howW.length
    ? `<div class="ex-tip how"><span class="sub-label" style="color:inherit">[ 怎么上重量 ]</span> ${t}</div>`
    : `<div class="ex-tip">${t}</div>`)).join('') : '');
  document.getElementById('ex-modal-mistakes').innerHTML = skinTpl('exMistakes', mistakes, () => mistakes.length ? `<p class="sec-label" style="color:var(--accent);margin-top:4px">常见错误</p>` + mistakes.map(m => `<div class="ex-tip mistake">${m}</div>`).join('') : '');

  // 替换 / 划掉放在顶部(体检 #22:原来在卡片最底下,要滚过整页说明才够得着)
  const actEl = document.getElementById('ex-modal-actions');
  if (actEl) {
    const d = window._currentExDetailDate, ei = window._currentExDetailEi;
    const day = d && S.plan && S.plan.days.find(x => x.date === d);
    const ex = day && ei !== null && ei !== undefined ? day.exercises[ei] : null;
    if (ex && ex.name === name && !isLocked(day)) {
      const canSwap = !(ex.isWarmup || (ex.isStretch && !isWeightedMove(ex.name)));
      actEl.innerHTML = skinTpl('exActions', { d, ei, name, canSwap }, () => canSwap
        ? `<button class="btn-line" onclick="closeExDetail();swapExercise('${d}', ${ei})">换 / 划掉</button><button class="btn-line accent" onclick="closeExDetail();openSwapSheet('${d}', ${ei})">✕ 划掉 / 永久排除</button>`
        : `<button class="btn-line accent full" onclick="closeExDetail();openSwapSheet('${d}', ${ei})">✕ 划掉 / 永久排除</button>`);
    } else {
      actEl.innerHTML = skinTpl('exActions', { name, byName: true }, () => `<button class="btn-line accent full" onclick="closeExDetail();openExcludeByName('${_q(name)}')">✕ 永久排除这个动作（以后的计划都避开）</button>`);
    }
  }
}

// 一键看示范:直接开 B 站搜该动作教学(练到不会的当场看,不用退出app满世界找)
// 搜索词:去掉名字里的括注(「挺尸式（savasana）」→「挺尸式」),否则英文/梵文括注会被一起当关键词,抖音/小红书/B站反而搜不准
function _searchTerm(name) { const t = String(name || '').replace(/\s*[（(][^）)]*[）)]\s*/g, '').trim(); return t || String(name || ''); }
function openDemo(name) {
  // 「▶示范」快捷按钮 → 抖音搜索(动作演示最多);详情弹窗里另有 抖音/小红书/B站/Keep 一排
  try { window.open('https://www.douyin.com/search/' + encodeURIComponent(_searchTerm(name) + ' 动作教学'), '_blank', 'noopener'); } catch (e) {}
}
window.openDemo = openDemo;

function showExDetail(name, date = null, ei = null) {
  _currentExDetailName = name;
  _currentExDetailDate = date;
  _currentExDetailEi = ei;
  _xDetailMode = !!_xMode;

  renderExDetailContent();
  document.getElementById('ex-modal').classList.add('open');
}
window.showExDetail = showExDetail;

function closeExDetail() {
  document.getElementById('ex-modal').classList.remove('open');
}

function calPrev() { _calWeekOffset -= 2; render() }
function calNext() { if (_calWeekOffset < 0) { _calWeekOffset = Math.min(0, _calWeekOffset + 2); render() } }
function calGoToday() { _calWeekOffset = 0; S.selDate = todayStr(); saveState(); render() }

function showHistoryDetail(dateStr) {
  const entries = LOG.filter(l => l.date === dateStr);
  const modal = document.getElementById('hist-modal');
  const content = document.getElementById('hist-modal-content');
  if (!modal || !content) return;
  const d = new Date(dateStr + 'T12:00:00');
  const dayName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  const dateFmt = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${dayName}`;
  const head = skinTpl('histHead', { d, dayName }, () => `<div class="hist-detail-header"><span class="hist-detail-date">${dateFmt}</span><button class="ex-modal-close" onclick="closeHistModal()">关闭</button></div>`);
  if (!entries.length) { content.innerHTML = head + `<div class="hist-empty">该日暂无训练记录</div>`; modal.classList.add('open'); return }
  let html = head;
  entries.forEach(entry => {
    html += skinTpl('histMeta', { entry }, () => `<div class="hist-detail-meta"><span class="hist-detail-chip type">${_escHtml(entry.workout || '训练')}</span><span class="hist-detail-chip dur">${entry.duration || '?'} min</span>${wkLogMin(entry) ? `<span class="hist-detail-chip dur">用时 ${wkLogMin(entry)} min</span>` : ''}${entry.rpe ? `<span class="hist-detail-chip rpe">RPE ${entry.rpe}/10</span>` : ''}${entry.mood ? `<span class="hist-detail-chip mood">${entry.mood}</span>` : ''}</div>`);
    if (entry.exercises && entry.exercises.length) {
      html += `<div class="hist-detail-exercises">`;
      entry.exercises.forEach(ex => { html += `<div class="hist-ex-row${ex.done === false ? ' hist-ex-undone' : ''}"><button type="button" class="hist-ex-name" ${_detailAttrs(ex.name)}>${ex.name}</button><span class="hist-ex-detail"><span>${ex.sets || '?'}×${ex.reps || '?'}${ex.unit || '次'}</span>${ex.weight ? `<span class="hist-ex-weight">${ex.weight} kg</span>` : ''}</span></div>` });
      html += `</div>`
    }
    if (entry.note) html += `<div class="hist-note">"${_escHtml(entry.note)}"</div>`;
    if (_xMode && _ownerSession()) html += _xHistExtra(entry);
    const idx = LOG.indexOf(entry);
    html += `<div class="log-actions"><button class="btn-line" onclick="closeHistModal();editLog(${idx})">编辑这条记录</button></div>`;
  });
  content.innerHTML = html; modal.classList.add('open');
}
function closeHistModal() { document.getElementById('hist-modal').classList.remove('open') }

// ══ 扩展模式快速退出:Esc 或双击页面空白处 ══════════════════
(function() {
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') _xExit(false);
  });
  window.addEventListener('dblclick', e => {
    // 只认空白容器,不拦输入框/按钮
    if (e.target === document.body || e.target.classList.contains('wrap') || e.target.id === 'main') _xExit(false);
  });
})();

// ══ EX_DETAIL 补充块(2026-07-20):补齐全库缺失的分步讲解,与主表同结构 ══
Object.assign(EX_DETAIL, {
  // —— chest ——
  '鳄鱼式（makarasana）': { muscles: ['胸大肌', '前锯肌', '核心'], steps: ['高跪姿，双手在肩正下方撑地，身体从膝到头成斜直线', '屈肘让身体整体前倾下沉，胸口靠近地面', '推地回到起始，全程核心收紧不塌腰'], tips: ['比标准俯卧撑负荷小，适合建立推力基础', '下沉速度放慢，感受胸肌被拉长'], mistakes: ['塌腰或撅臀让核心泄力', '手肘向外完全打开成90°，肩关节压力过大'] },
  // —— quads ——
  '靠墙静蹲（wall sit）': { muscles: ['股四头肌'], steps: ['背部完全贴墙，双脚前移约一步距离与肩同宽', '沿墙下滑至大腿与地面平行，膝盖成90°并对准脚尖', '双手放腿上或垂放，静力保持并均匀呼吸'], tips: ['大腿平行地面时股四头张力最大，不必蹲更低', '开始发抖是正常的等长疲劳，坚持到目标秒数'], mistakes: ['憋气', '脚跟离地或膝盖内扣'] },
  '相扑深蹲保持（sumo squat hold）': { muscles: ['股四头肌', '内收肌', '臀'], steps: ['双脚宽于肩1.5倍，脚尖外展约45°', '下蹲到最低位，双手合十、手肘抵住膝盖内侧向外撑', '脊柱立直、胸口朝前，在底部静力保持'], tips: ['手肘的外撑力帮助打开髋部，同时拉伸内收肌', '重心落在脚跟与脚掌中间'], mistakes: ['弓背低头', '脚跟翘起重心前扑'] },
  '深蹲转体': { muscles: ['股四头肌', '核心', '骨盆控制'], steps: ['双脚并拢下蹲到底，脚跟尽量踩实', '双手胸前合十稳住重心', '保持下肢不动，躯干缓慢向一侧旋转到舒适末端，回正后换边'], tips: ['徒手小幅度旋转，练的是底部稳定与胸椎灵活', '每次转到末端停一秒再回'], mistakes: ['膝盖跟着左右晃', '借惯性快速甩动躯干'] },
  // —— glutemed ——
  '侧卧抬腿画圈': { muscles: ['臀中肌', '髋外旋肌'], steps: ['侧卧，下腿屈膝支撑，骨盆垂直于地面', '上腿伸直抬至约45°', '以髋为轴缓慢画直径约30厘米的圆，正反方向各做一半次数'], tips: ['圆要小而慢，臀侧持续酸胀才是对的', '脚跟微微领先，避免大腿前侧代偿'], mistakes: ['骨盆向后翻倒变成屈髋', '画圈过大过快靠惯性'] },
  '芭蕾深蹲（plié）': { muscles: ['臀中肌', '内收肌', '股四头肌'], steps: ['双脚宽站、脚尖外展45-60°，骨盆保持中立', '脊柱垂直向下蹲，膝盖始终追踪脚尖方向', '下蹲至大腿接近平行后，夹臀站起'], tips: ['想象背贴着一面墙垂直滑动，躯干不前倾', '站起时主动收紧臀部内侧'], mistakes: ['膝盖内扣', '骨盆前倾撅臀'] },
  '芭蕾侧踢腿（battement）': { muscles: ['臀中肌', '髋外展肌'], steps: ['单手扶墙或椅背，身体立直', '工作腿绷直、脚背延伸，向正侧方快速踢起', '控制性放下，落地轻盈，完成次数后换边'], tips: ['踢起快、放下慢，高度以骨盆不歪为限', '支撑腿臀部也要收紧参与稳定'], mistakes: ['为踢高而向对侧倾倒躯干', '脚背松弛'] },
  '单腿relevé踮立': { muscles: ['小腿三头肌', '踝稳定肌', '臀中肌'], steps: ['单腿站立，另一腿屈膝贴于支撑腿', '缓慢踮起脚跟至最高点，停顿1-2秒', '缓慢下放至脚跟将触未触地面，重复'], tips: ['指尖可轻扶墙，重心压在第一、二脚趾方向', '全程骨盆水平，靠臀中肌稳住'], mistakes: ['脚踝向外翻倒', '快速弹动失去控制'] },
  // —— hamglutes ——
  '芭蕾后退腿（arabesque）': { muscles: ['臀大肌', '竖脊肌', '腘绳肌'], steps: ['单手扶墙站立，重心移至支撑腿', '工作腿绷直向正后方抬起，同时躯干微前倾保持一线', '在最高点停1-2秒，控制放下'], tips: ['先想"腿变长"再想"抬高"，避免腰椎折角', '骨盆尽量朝正前，不要为高度大幅打开髋'], mistakes: ['腰椎过度反弓代偿', '支撑腿膝盖锁死'] },
  '芭蕾地板后展腿': { muscles: ['臀大肌', '腘绳肌'], steps: ['俯卧或四足跪姿，一腿绷直向后延伸', '以臀肌发力将腿抬离地面，保持骨盆压实', '顶端停顿后缓慢下放，完成次数后换边'], tips: ['抬起高度不需要大，骨盆不动才是质量', '脚背始终延伸，想象被人向远处拉'], mistakes: ['骨盆翻转借力', '用下背代替臀肌发力'] },
  '大踢腿（grand battement）': { muscles: ['髋屈肌', '腘绳肌', '臀'], steps: ['站立扶墙，工作腿绷直', '向前（或侧、后）方向大幅踢起至个人幅度上限', '控制性收回，动作干脆但不失控'], tips: ['踢腿前先收紧核心，躯干像柱子一样不动', '幅度服从控制，宁低勿晃'], mistakes: ['弓背迎合腿的高度', '落腿时砸地'] },
  '前弯后腿上扬（penché）': { muscles: ['腘绳肌', '臀大肌', '竖脊肌'], steps: ['单腿站立，双手可扶墙或椅背', '躯干从髋部前倾的同时后腿向上延伸，两者像跷跷板联动', '到个人极限后原路缓慢回正'], tips: ['进阶动作：先在小幅度内建立平衡再逐步加深', '支撑腿微屈保护膝窝'], mistakes: ['只顾抬腿忽略脊柱延展，变成折腰', '快速起落失去控制'] },
  '臀桥夹球保持': { muscles: ['臀大肌', '内收肌', '盆底肌'], steps: ['仰卧屈膝，双膝间夹瑜伽砖或抱枕', '顶髋至肩膝一线，同时向内夹紧物体', '在顶端静力保持，均匀呼吸后缓慢下放'], tips: ['夹与顶同时用力，内收肌和臀肌协同', '下巴微收，用上背而非颈部承重'], mistakes: ['腰椎过度反弓', '顶端松掉夹持'] },
  '抱膝排气式（apanasana）': { muscles: ['盆底肌', '横膈'], steps: ['仰卧或宽跪坐，全身放松', '深长腹式吸气，感受腹腔与盆底随吸气自然下沉扩张', '呼气时不主动收缩，让盆底自然回弹，循环进行'], tips: ['这是"放松训练"不是凯格尔收缩，重点在觉察与释放张力', '配合4秒吸-6秒呼的节奏更容易放松'], mistakes: ['误做成反复用力收缩', '耸肩憋气'] },
  '猫式伸展（cat stretch）': { muscles: ['脊柱', '核心', '竖脊肌'], steps: ['四足跪姿，手在肩下膝在髋下', '吸气：塌腰抬头，坐骨向上（牛式）', '呼气：拱背低头，尾骨内卷（猫式），缓慢交替'], tips: ['让动作从尾椎逐节传导到颈椎，越慢越好', '手推地保持肩胛稳定'], mistakes: ['只动腰不动胸椎', '速度过快变成甩动'] },
  '仰卧分腿保持（straddle hold）': { muscles: ['内收肌', '腘绳肌'], steps: ['仰卧双腿伸直上举，向两侧打开成V字', '双手轻放大腿内侧，先做5秒"双腿向内合"的对抗用力（手挡住不让合）', '放松后顺势让腿再向外多开一点，重复2-3轮'], tips: ['这是PNF收缩-放松拉伸，比死拉更快见效', '对抗用力只需五成力'], mistakes: ['对抗时憋气', '放松阶段用弹震硬压'] },
  '跪姿挺髋（kneeling hip thrust）': { muscles: ['臀大肌', '髋屈肌', '股四头肌'], steps: ['高跪姿，骨盆前推至髋完全伸展', '收紧臀部，躯干作为整体微微后倾', '到大腿前侧明显拉伸处停住，缓慢回正'], tips: ['臀部全程夹紧是保护腰椎的关键', '后仰幅度宁小勿大，逐次递增'], mistakes: ['腰椎折角代替髋伸展', '速度过快'] },
  '俯卧蛙式抬腿（frog kick）': { muscles: ['臀大肌', '髋外旋肌'], steps: ['俯卧，双膝弯曲向两侧打开、脚心相对成蛙式', '骨盆压实地面，以臀肌发力将双膝连脚整体抬离地面少许', '顶端挤压1-2秒后缓慢放下'], tips: ['幅度很小是正常的，追求臀肌挤压感而非高度', '额头枕在手背上放松颈部'], mistakes: ['借腰反弓把腿甩起来', '骨盆离地'] },
  '四足髋部大绕环': { muscles: ['骨盆控制', '核心', '臀'], steps: ['四足跪姿，脊柱中立', '骨盆做大幅度的全方向绕环：前倾-侧移-后倾-另一侧', '两个方向交替，节奏缓慢连贯'], tips: ['想象用尾骨在身后画一个大圆', '肩膀和手保持稳定，只有骨盆在动'], mistakes: ['耸肩晃动上半身', '幅度小而快，失去控制训练意义'] },
  '四足跪姿髋外展': { muscles: ['臀中肌', '臀大肌'], steps: ['四足跪姿，核心收紧', '一腿保持屈膝90°，向正侧方抬起（消防栓式）', '顶端停1秒，控制放下，完成后换边'], tips: ['骨盆保持水平，不要向对侧翻转', '抬到臀侧发酸的高度即可，不攀比幅度'], mistakes: ['翻骨盆借力', '手臂弯曲身体塌陷'] },
  '驴踢腿（donkey kick）': { muscles: ['臀大肌'], steps: ['四足跪姿，一腿保持屈膝90°', '脚跟朝天花板方向向上踢起', '最高点挤压臀部1秒，缓慢收回'], tips: ['想象用脚跟去踩天花板，而不是甩小腿', '核心收紧防止腰塌'], mistakes: ['腰椎反弓代偿', '幅度过大骨盆翻转'] },
  '鸟狗式（bird dog）': { muscles: ['臀大肌', '竖脊肌', '核心'], steps: ['四足跪姿', '同时伸出对侧手与腿，至与躯干成一条水平线', '停1-2秒后收回，交换对角重复'], tips: ['出手出腿时想"变长"不是"抬高"', '骨盆保持水平如同放着一杯水'], mistakes: ['抬腿过高翻转骨盆', '塌腰'] },
  '相扑深蹲跳（sumo squat jump）': { muscles: ['臀', '股四头肌', '内收肌'], steps: ['宽距站立脚尖外展，下蹲至最低位', '在底部做小幅快速的上下弹动（幅度约10厘米）', '保持张力完成目标次数后站起'], tips: ['弹动靠肌肉控制而非松弛反弹', '高级动作，膝或髋不适立即停止'], mistakes: ['弹动幅度过大变成半蹲起', '膝盖内扣'] },
  '青蛙趴': { muscles: ['内收肌', '髋外旋肌'], steps: ['四足跪姿，双膝沿地面向两侧尽量打开', '小腿与大腿约成90°，脚踝放平', '前臂撑地，骨盆向后向下沉，让重力完成拉伸'], tips: ['锚定体位：每次保持到目标秒数，逐次+5秒加深', '疼痛和拉伸感的边界在"能深呼吸"——不能呼吸就退一点'], mistakes: ['腰塌陷代替骨盆下沉', '膝内侧受压疼痛还硬撑（垫毛巾）'] },
  '蛙式臀桥保持（frog pump hold）': { muscles: ['臀大肌', '内收肌', '盆底肌'], steps: ['仰卧，脚心相对、双膝向两侧沉', '以臀发力顶髋至肩膝成线', '顶端静力保持并均匀呼吸，到秒后缓慢下放'], tips: ['蝴蝶脚位削弱了腘绳代偿，臀肌孤立感更强', '顶端主动夹臀而非塌腰'], mistakes: ['用腰顶起', '呼吸中断'] },
  '跪姿直腿后踢': { muscles: ['臀大肌', '髋屈肌'], steps: ['四足跪姿', '一腿向正后方伸直踢出，至与躯干成一线', '顶端挤压臀肌1-2秒，控制收回后换边'], tips: ['腿伸直版比屈膝版杠杆更长，注意核心稳定', '脚尖延伸让整条腿参与'], mistakes: ['腰反弓', '骨盆歪斜'] },
  '高跪姿夹枕挺髋保持': { muscles: ['臀大肌', '内收肌', '盆底肌'], steps: ['高跪姿，大腿上部夹住瑜伽砖或滚轴', '骨盆前推至髋完全伸展，同时夹紧物体', '在完全伸髋位静力保持，均匀呼吸'], tips: ['夹持让内收肌与盆底协同参与', '躯干立直，想象头顶被线向上提'], mistakes: ['塌腰前推肚子', '夹持松掉'] },
  '靠墙坐姿劈叉（wall straddle）': { muscles: ['内收肌', '髋外旋肌'], steps: ['臀部贴近墙角坐地后仰卧', '双腿分别沿两侧墙面伸直打开', '完全放松，让重力缓慢下拉双腿，保持约2分钟(按屏幕计时)'], tips: ['被动拉伸，配合深长呼吸让内收肌逐步"融化"', '退出时先用手把双腿合拢再起身'], mistakes: ['主动用力压腿', '臀部离墙太远角度不足'] },
  '快乐婴儿式（深压版）': { muscles: ['内收肌', '髋外旋肌', '盆底肌'], steps: ['仰卧，臀下垫瑜伽砖略抬高', '双腿屈膝打开，双手分别按在两膝内侧', '呼气时手施加温和压力帮助双膝下沉，吸气保持'], tips: ['压力要"渐进且可退出"，以能深呼吸为限', '垫高骨盆让拉伸更集中在内收肌起点'], mistakes: ['猛压弹震', '腰部离地紧张'] },
  '青蛙式（frog pose）': { muscles: ['内收肌', '胸椎', '肩'], steps: ['四足跪姿，双膝拉到极宽', '双手前伸，胸口向地面下沉', '额头或下巴轻触地，骨盆保持在膝盖正上方'], tips: ['锚定体位：兼顾开胯与胸椎伸展，逐次加深', '臀不要后坐，保持在膝上方拉伸才落在内收肌'], mistakes: ['臀后坐成婴儿式', '耸肩压迫颈部'] },
  '臀推顶端外展保持': { muscles: ['臀大肌', '内收肌'], steps: ['上背垫高于凳沿，双脚踩地略宽', '连续做臀推至接近力竭', '最后一次在顶端保持，双膝向外撑开坚持数秒再放下'], tips: ['先动态后静态的复合组，臀肌刺激完整', '顶端外撑让臀中肌收尾参与'], mistakes: ['力竭后用腰代偿', '顶端塌髋'] },
  // —— core ——
  '死虫式保持（dead bug hold）': { muscles: ['腹横肌', '骨盆控制'], steps: ['仰卧，屈髋屈膝90°成桌面腿，双臂指向天花板', '呼气把下背压实地面', '保持该姿势静力不动，均匀呼吸'], tips: ['难点在"呼吸时腰也不离地"', '想象腰下压着一张纸不许抽走'], mistakes: ['腰拱起离地', '耸肩紧张'] },
  '死虫式（慢速对角）': { muscles: ['腹横肌', '骨盆控制'], steps: ['仰卧桌面腿，双臂指天', '对侧手臂与腿缓慢向远处延伸（不触地）', '收回后换对角，全程下背贴地'], tips: ['动态死虫：越慢越有效', '手脚只延伸到"腰仍贴地"的幅度'], mistakes: ['幅度贪大腰离地', '靠惯性摆动'] },
  '仰卧直腿下放（leg lowering）': { muscles: ['下腹部', '髋屈肌', '内收肌'], steps: ['仰卧，双腿伸直并拢抬至垂直', '缓慢下放同时微微分开成V', '在下背将离未离地面的临界点抬回并合拢'], tips: ['临界点因人而异，宁高勿塌', '双手可垫在骶骨下降低难度'], mistakes: ['下放过低腰反弓', '快起快落'] },
  '俯冲式俯卧撑（dive bomber push-up）': { muscles: ['核心', '胸椎', '肩'], steps: ['从下犬式开始，臀部抬高', '屈肘让胸口贴近地面，沿低位向前"钻"出', '至上犬/眼镜蛇位后，原路倒放回下犬'], tips: ['想象从矮栏杆下钻过去', '倒放回程比前进更练控制，别省略'], mistakes: ['腰部塌陷发力', '肩肘不稳砸落'] },
  '仰卧对角抬举（dead bug 变体）': { muscles: ['核心', '全身张力'], steps: ['仰卧四肢展开成大字', '呼气时对角手脚同时抬离地面2-3厘米并绷紧全身', '保持数秒放下，换对角'], tips: ['幅度极小但全身张力极大才是做对了', '头颈放松留在地面'], mistakes: ['抬太高变成仰卧起坐', '只动四肢核心不参与'] },
  '匍匐爬行（army crawl）': { muscles: ['核心', '肩带', '髋屈肌'], steps: ['低平板支撑（前臂撑地）', '前臂交替向前挪动，带动全身贴近地面向前匍匐', '臀部保持低位，身体不左右甩动'], tips: ['距离短、张力大，2-3米往返即可', '呼吸配合步伐不憋气'], mistakes: ['臀部翘高省力', '躯干大幅扭摆'] },
  '高跪姿后倾等长（kneeling lean back）': { muscles: ['核心', '臀', '竖脊肌'], steps: ['高跪姿，双手在胸前交叠互推形成对抗', '保持互推张力的同时躯干立直不动', '静力保持并均匀呼吸'], tips: ['自体对抗让核心在无器械下获得高张力', '臀同步收紧保护腰椎'], mistakes: ['耸肩', '憋气'] },
  '骆驼式（ustrasana）': { muscles: ['核心', '股四头肌', '胸椎'], steps: ['高跪姿，臀部收紧、骨盆前推', '躯干作为整体缓慢后倾，同时胸椎向上向后打开', '至大腿前侧强烈张力处保持1-2秒，核心收紧带回'], tips: ['类似小幅的仰身板（reverse plank of knees），核心全程刹车', '后倾靠膝为轴，不是折腰'], mistakes: ['腰椎折角', '后倾过快靠惯性回弹'] },
  '单腿passé平衡': { muscles: ['踝稳定肌', '核心', '臀中肌'], steps: ['单腿站立，另一脚脚尖沿支撑腿内侧上滑至膝旁（passé位）', '双臂侧平或上举，保持平衡', '稳定后可尝试闭眼或踮脚进阶'], tips: ['视线固定一点有助平衡', '支撑腿臀部收紧，骨盆水平'], mistakes: ['髋向支撑侧顶出去', '耸肩僵硬'] },
  '旋转中轴训练（pirouette prep）': { muscles: ['核心', '踝稳定肌'], steps: ['站立，一脚passé位或点地', '双臂收拢至胸前，身体沿垂直中轴缓慢旋转半圈（先不离地）', '控制停止，换方向'], tips: ['练的是"转中不散"的中轴张力，速度其次', '头部最后离开、最先到达（留头甩头）'], mistakes: ['手臂甩动带转', '中轴倾斜'] },
  '仰卧画圈腿（rond de jambe）': { muscles: ['下腹部', '髋屈肌', '内收肌'], steps: ['仰卧，双腿伸直，一腿保持贴地', '另一腿绷直抬起，在空中缓慢画出大弧线（rond de jambe）', '双方向交替后换腿'], tips: ['骨盆钉在地面不许晃，弧线才有价值', '脚背全程延伸'], mistakes: ['骨盆跟着腿滚动', '膝盖弯曲'] },
  '肩胛引体激活': { muscles: ['背阔肌', '下斜方肌', '肩胛稳定肌'], steps: ['悬挂于单杠，手臂伸直', '不屈肘，仅用肩胛骨下沉后收把身体拉高几厘米', '顶端停1-2秒，缓慢放回全悬挂'], tips: ['引体向上的地基动作，幅度小但必须精确', '想象把肩胛骨"放进后裤兜"'], mistakes: ['屈肘变成半个引体', '耸肩悬挂'] },
  '悬挂屈体静止': { muscles: ['核心', '髋屈肌', '握力'], steps: ['悬挂于单杠', '收腹抬腿至屈髋屈膝90°（或直腿90°进阶）', '静止保持，均匀呼吸'], tips: ['骨盆微微后卷让下腹真正受力', '肩胛保持轻度下沉不做死悬挂'], mistakes: ['身体前后晃动', '憋气'] },
  '悬挂直体延伸': { muscles: ['肩带', '背阔肌', '核心'], steps: ['悬挂于单杠，双腿并拢绷直', '全身主动拉长：肩胛微沉、肋骨内收、脚尖向地延伸', '保持这种"主动悬挂"状态'], tips: ['解压脊柱同时训练肩部悬挂耐力', '身体像一根绷直的缆绳'], mistakes: ['完全松懈的被动悬挂', '腰椎过度反弓'] },
  '悬挂开胯': { muscles: ['内收肌', '髋外展肌', '握力'], steps: ['悬挂于单杠', '双腿伸直缓慢向两侧打开至最大V字', '停1-2秒后靠内收肌控制合拢'], tips: ['悬挂消除了地面摩擦，开合全靠肌肉', '幅度以骨盆不歪为限'], mistakes: ['借摆动甩腿', '合拢时松弛落腿'] },
  '空心体保持': { muscles: ['腹直肌', '腹横肌'], steps: ['仰卧，下背压实地面', '双腿伸直抬离地面约30°，双臂过头延伸', '身体成浅"香蕉形"静力保持'], tips: ['体操核心地基：腰始终贴地是唯一标准', '太难就屈膝或手放体侧退阶'], mistakes: ['腰拱起离地', '下巴顶天颈部紧张'] },
  '龙旗': { muscles: ['腹直肌', '核心', '背阔肌'], steps: ['仰卧长凳，双手抓头后凳沿', '以肩上背为支点，全身绷直向上摆起至近垂直', '保持身体一条直线缓慢下放至接近水平，再收回'], tips: ['只有下放阶段贴近水平才算有效离心', '全程只有肩胛区接触凳面'], mistakes: ['折腰塌髋成"香蕉"', '下放失控砸落'] },
  'L撑': { muscles: ['腹直肌', '髋屈肌', '三头肌'], steps: ['坐姿，双手在髋旁撑实（地面或双杠）', '压肩推地把臀部抬离，双腿伸直前平举成L形', '静力保持，均匀呼吸'], tips: ['先用屈膝团身撑退阶，再逐步伸直腿', '手腕不适可用俯卧撑架'], mistakes: ['耸肩含胸', '腿下垂成"斜撑"还硬计时'] },
  // —— swimming ——
  '水中侧抬腿': { muscles: ['臀中肌'], steps: ['站于齐腰深水中，单手扶池边', '工作腿伸直向正侧方抬起对抗水阻', '控制收回，完成后换边'], tips: ['水阻双向：抬与收都主动用力', '躯干立直不向对侧歪'], mistakes: ['借水流甩腿', '身体倾倒'] },
  '水中后踢腿': { muscles: ['臀大肌', '腘绳肌'], steps: ['面向池边双手扶稳', '一腿伸直向正后方缓慢踢起', '顶端夹臀1秒，控制收回'], tips: ['水中版驴踢：慢就是阻力', '骨盆贴住想象中的墙不翻转'], mistakes: ['腰反弓', '快踢借浮力'] },
  '水中相扑深蹲': { muscles: ['臀', '股四头肌', '内收肌'], steps: ['胸口深水中宽距站立，脚尖外展', '下蹲至大腿平行（水的浮力会减轻负担）', '快速站起对抗水阻，重复'], tips: ['下慢上快，利用水阻做速度型训练', '脚跟踩实池底'], mistakes: ['被浮力带得脚跟离地', '幅度浅'] },
  '水中摆腿开髋': { muscles: ['髋关节', '内收肌'], steps: ['侧身单手扶池边', '一腿屈膝提起，膝盖由前向外侧打开画圈（开髋）', '双方向各数次后换腿'], tips: ['水的支撑让开髋更安全，幅度可稍大于陆上', '躯干稳定只动髋'], mistakes: ['耸胯代偿', '画圈过快'] },
  '泳池边坐姿开胯': { muscles: ['内收肌', '髋外旋肌'], steps: ['坐于池边，小腿垂入水中', '双腿向两侧最大打开', '身体从髋部前倾，双手向前伸展保持'], tips: ['水温放松肌肉，此时开胯效果好', '从髋折叠而不是弓背够远'], mistakes: ['弓背', '弹震下压'] },
  '水中骨盆画圆': { muscles: ['骨盆控制', '核心'], steps: ['齐腰水中双脚与肩同宽站稳', '双手叉腰，骨盆缓慢画大圆', '两个方向交替'], tips: ['水阻让骨盆环转的每一度都有反馈', '膝盖微屈上身稳定'], mistakes: ['全身跟着晃', '幅度小而敷衍'] },
  '水中弓步跳': { muscles: ['臀', '股四头肌'], steps: ['齐腰水中弓步站位', '向上跳起同时空中换腿，落地成对侧弓步', '连续交替，节奏可控'], tips: ['浮力保护关节，是低冲击的爆发力练习', '落地仍要缓冲，膝对脚尖'], mistakes: ['落地膝内扣', '越跳越浅'] },
  '水中单腿平衡': { muscles: ['踝稳定肌', '核心'], steps: ['齐腰水中单腿站立', '另一腿屈膝抬起，双臂在水中展开辅助', '保持平衡，进阶可闭眼'], tips: ['水流的扰动就是天然的不稳定训练', '支撑脚趾抓地'], mistakes: ['憋气僵硬', '抬起腿借扶池边'] },
  '水中弹力带外展': { muscles: ['臀中肌'], steps: ['脚踝套弹力带，齐腰水中站立扶池边', '工作腿对抗弹力带+水阻向侧方打开', '控制回收，完成后换边'], tips: ['双重阻力下幅度不必大，30-45°足够', '顶峰停1秒'], mistakes: ['躯干侧倾借力', '回收时放任带子拽回'] },
  '蛙泳腿开合训练': { muscles: ['内收肌', '臀', '腘绳肌'], steps: ['俯身扶浮板或池边，双腿伸直漂浮', '收腿：脚跟向臀部收、膝略分开', '翻脚外蹬画圆后并拢夹水，充分伸展滑行'], tips: ['夹水并拢的最后阶段是内收肌主戏，做完整', '收腿慢、蹬夹快'], mistakes: ['收腿过大产生阻力', '省略并拢滑行'] },
  // —— warmup ——
  '颈部绕环': { muscles: ['颈部肌群'], steps: ['站立或坐姿，肩膀下沉', '下巴引导头部缓慢画半圆：左-前-右', '双方向交替，幅度舒适'], tips: ['热身用半圆即可，避免完整后仰绕圈', '每个方向感到轻微拉伸就够'], mistakes: ['快速甩头', '大幅后仰挤压颈椎'] },
  '手臂前后大摆动': { muscles: ['肩关节', '胸背'], steps: ['站立，双臂放松', '双臂同步向前绕大圈数次', '再向后绕大圈数次'], tips: ['由小圈渐进到大圈，唤醒肩袖', '躯干稳定不跟着转'], mistakes: ['一上来就最大幅度', '耸肩'] },
  '猫牛热身': { muscles: ['脊柱', '核心'], steps: ['四足跪姿', '吸气塌腰抬头，呼气拱背低头', '随呼吸节奏连续交替8-10次'], tips: ['热身版节奏可稍快于拉伸版', '让每一节脊椎都参与'], mistakes: ['只动脖子和腰', '憋气'] },
  '肘关节绕环': { muscles: ['肘关节', '前臂'], steps: ['双臂侧平举', '以肘为轴，前臂向内向外各绕圈数次', '保持大臂不动'], tips: ['推类训练前的小关节润滑', '幅度均匀'], mistakes: ['大臂跟着甩', '速度过快'] },
  '俯身直臂画圆': { muscles: ['肩关节', '上背'], steps: ['俯身45°背平直', '双臂垂直下垂后向外画大圆', '双方向各数次'], tips: ['俯身角度让画圆经过更大肩活动范围', '核心收紧护腰'], mistakes: ['弓背', '甩动借力'] },
  '臀部激活蚌式': { muscles: ['臀中肌'], steps: ['侧卧屈膝90°，双脚并拢', '保持双脚接触，上膝像贝壳一样向上打开', '顶端停1秒缓慢合上，完成后换边'], tips: ['臀腿日必备激活：让臀中肌先"上线"', '骨盆垂直不后倒'], mistakes: ['骨盆后翻', '开合过快'] },
  '髋关节绕环': { muscles: ['髋关节'], steps: ['单腿站立扶墙', '另一膝提起，由前向外侧再向后画大圈', '双方向交替后换腿'], tips: ['下肢训练前的髋润滑，幅度渐进', '支撑侧骨盆稳定'], mistakes: ['耸胯', '躯干乱晃'] },
  '侧向弓步': { muscles: ['内收肌', '臀', '股四头肌'], steps: ['宽站，重心移向一侧下蹲成侧弓步', '另一腿伸直，感受内侧拉伸', '推回中间换边交替'], tips: ['既是热身也是内收肌动态拉伸', '屈腿侧脚跟踩实'], mistakes: ['屈膝侧膝内扣', '弓背'] },
  '踝关节绕环': { muscles: ['踝关节'], steps: ['脚尖点地或抬脚悬空', '以踝为轴向内向外各绕圈数次', '换脚重复'], tips: ['深蹲/跳跃前必做的小保险', '缓慢全幅度'], mistakes: ['敷衍画小圈', '只做单方向'] },
  '原地跑热身': { muscles: ['全身', '心肺'], steps: ['原地小步快频率跑动', '手臂自然摆动，逐步提高抬腿高度', '持续至微微出汗'], tips: ['目标是升体温升心率，不是累', '前脚掌轻着地'], mistakes: ['全脚掌砸地', '一开始就冲刺强度'] },
  '波比跳热身': { muscles: ['全身', '心肺'], steps: ['站立下蹲双手撑地', '双脚后跳成平板，再收回', '起身轻跳，连贯重复'], tips: ['热身版不求速度，动作完整即可', '平板瞬间核心收紧'], mistakes: ['塌腰过平板', '落地膝盖僵直'] },
  // —— stretch ——
  '坐角式（upavistha konasana）': { muscles: ['内收肌', '腘绳肌'], steps: ['坐姿，双腿向两侧最大打开，膝盖脚尖朝天', '脊柱先向上拉长，再从髋部折叠前倾', '双手向前爬行，胸腹逐步靠向地面，静力保持'], tips: ['先"长"后"低"：脊柱延展比够得远重要', '可坐在薄垫前沿帮助骨盆前倾'], mistakes: ['弓背用头够地', '膝盖内扣脚外翻'] },
  '幼犬式（puppy pose）': { muscles: ['胸椎', '肩', '背阔肌'], steps: ['四足跪姿，臀部保持在膝盖正上方', '双手向前滑远，胸口与下巴沉向地面', '腋窝向地面方向"融化"，深长呼吸保持'], tips: ['比婴儿式更针对胸椎伸展与肩开度', '手臂始终伸直有张力'], mistakes: ['臀后坐丢掉胸椎角度', '腰部塌陷代偿'] },
  '宽膝婴儿式（balasana）': { muscles: ['内收肌', '髋'], steps: ['四足跪姿，双膝拉宽至舒适极限', '保持手位不动，臀部缓慢向后坐向脚跟', '在内侧拉伸最强处停留，或缓慢往返'], tips: ['青蛙趴的温和前置动作，适合当天状态一般时', '往返版可作为动态热身'], mistakes: ['猛坐到底', '腰部拱起'] },
  '睡鸽式（sleeping pigeon）': { muscles: ['髋外旋肌', '梨状肌', '臀'], steps: ['前腿屈膝横放（小腿尽量平行垫子前沿），后腿伸直向后', '骨盆调正后，上身从髋前倾完全趴下', '额头触地或枕在手背，深呼吸保持'], tips: ['前侧臀部酸胀=位置正确；膝盖锐痛=立即调整', '骨盆下可垫砖保持水平'], mistakes: ['骨盆歪向一侧', '前膝受剪切力还硬撑'] },
  '低位蜥蜴式（前臂落地）': { muscles: ['髋屈肌', '内收肌'], steps: ['弓步，前脚放在同侧手外', '后腿伸直蹬实，前臂逐步下沉贴地', '骨盆整体向下沉，保持深呼吸'], tips: ['髋前侧深层拉伸之王，跑步/久坐后尤佳', '下不去就先停在手掌支撑'], mistakes: ['后腿膝盖软塌丢张力', '肩膀耸起'] },
  '穿针式（thread the needle）': { muscles: ['胸椎', '肩', '核心'], steps: ['四足跪姿', '一臂从对侧腋下穿出，掌心朝上', '肩与侧脸贴地，骨盆保持朝正下方，深呼吸保持后换边'], tips: ['穿针式：解胸椎僵硬的首选', '扭转来自胸椎，骨盆是锚'], mistakes: ['骨盆跟着转失去扭转', '压迫颈部'] },
  '仰卧英雄式（supta virasana）': { muscles: ['股四头肌', '髋屈肌'], steps: ['跪坐，双脚在臀部两侧（或臀坐脚跟上）', '双手向后支撑，缓慢降低到肘，再视柔韧躺向地面', '大腿前侧强拉伸处停留，深呼吸'], tips: ['每一步都可以是终点，不必躺平', '膝盖任何锐痛立即起身'], mistakes: ['腰椎大幅反弓', '双膝浮起离地'] },
  '斯芬克斯式（sphinx pose）': { muscles: ['髋屈肌', '腹侧链'], steps: ['俯卧，前臂撑起上身成斯芬克斯位', '骨盆主动向地面下压', '感受髋前侧与腹部拉长，保持深呼吸'], tips: ['压的是骨盆不是塌腰——耻骨找地面', '肩下沉远离耳朵'], mistakes: ['腰部挤压疼痛（降低撑起高度）', '耸肩'] },
  '跪姿股四头肌拉伸': { muscles: ['股四头肌', '髋屈肌'], steps: ['单膝高跪（膝下垫软垫），前腿弓步', '骨盆后倾并整体前推', '同侧手向后抓脚背拉向臀部，保持后换边'], tips: ['先骨盆后倾再前推，拉伸立刻翻倍', '抓不到脚可用毛巾环套'], mistakes: ['塌腰前推肚子', '躯干歪斜'] },
  '高跪姿后弯（kneeling backbend）': { muscles: ['胸椎', '核心'], steps: ['高跪姿，双手托住骶骨', '吸气时胸骨上提、胸椎逐节向后展开', '呼气缓慢回正，流动重复数次'], tips: ['后弯发生在胸椎，腰椎只是跟随', '臀部全程收紧是安全阀'], mistakes: ['头猛然后仰', '腰椎折角'] },
  '仰卧颈部后仰伸展': { muscles: ['内收肌', '颈前侧'], steps: ['仰卧靠墙抬腿并向两侧分开（重力开胯位）', '下巴轻微上抬让颈椎进入温和伸展', '幅度以完全无压迫感为限，深呼吸保持'], tips: ['分腿与颈部两处同时放松，适合训练尾声', '颈下可垫薄毛巾更舒适'], mistakes: ['颈部过度后仰', '有麻木感还继续'] },
  '挺尸式（savasana）': { muscles: ['全身'], steps: ['仰卧，四肢自然展开成大字', '从脚到头逐部位扫描：先绷紧3秒再彻底放松', '全部完成后静躺深呼吸约90秒(按屏幕计时)'], tips: ['渐进式肌肉放松法，训练后降心率极好', '呼气比吸气更长有助副交感激活'], mistakes: ['跳过绷紧直接躺（放松感减半）', '刷手机'] },
  '卧束角式（supta baddha konasana）': { muscles: ['内收肌', '髋外旋肌'], steps: ['仰卧，脚心相对、双膝向两侧沉', '双臂放松于体侧或过头', '让重力慢慢下拉双膝，保持约2分钟(按屏幕计时)'], tips: ['膝下各垫一块砖可调节强度，利于久留', '完全被动，配合腹式呼吸'], mistakes: ['主动压膝', '腰部紧张拱起'] },
  '婴儿式（balasana）': { muscles: ['下背', '肩', '髋'], steps: ['跪坐，臀部坐向脚跟', '躯干前俯，双手向前伸展，额头点地', '深长呼吸，每次呼气让身体更沉'], tips: ['万能休息位：组间、训练后都可用', '双膝分开可给腹部留出空间'], mistakes: ['臀部翘起离开脚跟', '肩颈紧张'] },
  '蜥蜴式（lizard）': { muscles: ['髋屈肌', '内收肌'], steps: ['弓步，前脚移到同侧手外侧', '后腿伸直或膝盖落地', '手掌或前臂支撑，骨盆下沉保持深呼吸'], tips: ['比极限版温和，日常保养首选', '前膝保持对准脚尖方向'], mistakes: ['肩耸起', '后腿完全松懈'] },
  '鸽式（eka pada kapotasana）': { muscles: ['髋外旋肌', '梨状肌', '髋屈肌'], steps: ['前腿屈膝横放于体前，后腿伸直向后延展', '骨盆调正朝前，双手支撑立直上身', '视柔韧前倾加深，保持后换边'], tips: ['锚定级开髋体式：立直做外旋、前趴加深度', '骨盆悬空就垫砖，别歪着硬撑'], mistakes: ['骨盆歪斜', '前膝锐痛仍坚持'] },
  '弓式（dhanurasana）': { muscles: ['脊柱伸肌', '髋屈肌', '胸'], steps: ['俯卧，屈膝双手向后抓住脚踝', '吸气时同时抬起胸和大腿，身体成弓形', '保持数个呼吸后缓慢放下'], tips: ['腿的蹬力是弓的引擎，手只是弦', '视线向前不猛抬头'], mistakes: ['膝盖向两侧大开', '用腰硬折而非全脊柱均匀后弯'] },
  '轮式（urdhva dhanurasana）': { muscles: ['脊柱', '肩', '臀', '腿'], steps: ['仰卧屈膝踩地，双手翻掌撑于耳侧', '吸气推地，先到头顶点地过渡，再完全推起成轮', '保持数个呼吸，收下巴缓慢降落'], tips: ['高级后弯：肩和胸椎的开度先到位再谈轮式', '双脚保持平行不外撇'], mistakes: ['手肘外翻撑不稳', '腰椎代偿疼痛仍强推'] },
  '花环式（malasana）': { muscles: ['髋', '内收肌', '踝'], steps: ['双脚略宽于髋、脚尖微外展，全蹲到底', '双手合十，手肘抵膝内侧向外撑', '脊柱向上延展，深呼吸保持'], tips: ['亚洲蹲的瑜伽版：每天蹲一会儿是最便宜的开髋', '脚跟踩不实可垫毛巾'], mistakes: ['弓背团成球', '重心后倒'] },
  '猴神式（hanumanasana）': { muscles: ['腘绳肌', '髋屈肌'], steps: ['半劈叉准备：前腿伸直、后膝跪地', '双手撑砖，前脚跟向前滑、后膝向后退', '在当前极限处停住，骨盆保持朝正前方'], tips: ['纵劈终点体式，用砖支撑让身体敢放松', '每次只加深一点点，以年为单位进步'], mistakes: ['骨盆歪斜硬贴地', '弹震下压'] },
});

// ══ Official Open-Source (wger) Anatomical Muscle Diagram Database ════════
// SVG 已下载到本地 ./muscles/ 同源目录(原从 wger.de 外链,但 wger 不发 CORS →
// 永远缓存不上、每次看图都得实时连 wger,网络不稳就"图解全不可用")。本地化后可被 SW 正常缓存、离线可用。
const WGER_MUSCLES = {
  biceps: { main: "./muscles/m1-main.svg", sec: "./muscles/m1-sec.svg" },
  shoulders: { main: "./muscles/m2-main.svg", sec: "./muscles/m2-sec.svg" },
  chest: { main: "./muscles/m4-main.svg", sec: "./muscles/m4-sec.svg" },
  triceps: { main: "./muscles/m5-main.svg", sec: "./muscles/m5-sec.svg" },
  abs: { main: "./muscles/m6-main.svg", sec: "./muscles/m6-sec.svg" },
  calves: { main: "./muscles/m7-main.svg", sec: "./muscles/m7-sec.svg" },
  glutes: { main: "./muscles/m8-main.svg", sec: "./muscles/m8-sec.svg" },
  trapezius: { main: "./muscles/m9-main.svg", sec: "./muscles/m9-sec.svg" },
  quads: { main: "./muscles/m10-main.svg", sec: "./muscles/m10-sec.svg" },
  hamstrings: { main: "./muscles/m11-main.svg", sec: "./muscles/m11-sec.svg" },
  lats: { main: "./muscles/m12-main.svg", sec: "./muscles/m12-sec.svg" },
  obliques: { main: "./muscles/m14-main.svg", sec: "./muscles/m14-sec.svg" }
};

function renderMuscleDiagram(muscles, exName = '') {
  if (!Array.isArray(muscles) || !muscles.length) muscles = ['全身'];
  const mStr = (muscles.join(' ') + ' ' + (exName || '')).toLowerCase();
  
  const isChest = /胸/.test(mStr);
  const isBack = /背/.test(mStr);
  const isShoulder = /肩|三角肌/.test(mStr);
  const isBiceps = /二头|肱二/.test(mStr);
  const isTriceps = /三头|肱三/.test(mStr);
  const isGlute = /臀/.test(mStr);
  const isQuads = /股四|大腿前/.test(mStr);
  const isHamstrings = /腘绳|大腿后/.test(mStr);
  const isCore = /核心|腹/.test(mStr);
  const isCalf = /小腿|踝/.test(mStr);
  const isSwim = /游泳|自由泳|蛙泳|仰泳|蝶泳/.test(mStr);

  let primaryName = muscles[0] || '目标肌群';
  let secondaryName = muscles.slice(1).join(' · ') || '';

  let imgInfo = null;
  if (isChest) imgInfo = WGER_MUSCLES.chest;
  else if (isBack) imgInfo = WGER_MUSCLES.lats;
  else if (isGlute) imgInfo = WGER_MUSCLES.glutes;
  else if (isQuads) imgInfo = WGER_MUSCLES.quads;
  else if (isHamstrings) imgInfo = WGER_MUSCLES.hamstrings;
  else if (isShoulder) imgInfo = WGER_MUSCLES.shoulders;
  else if (isBiceps) imgInfo = WGER_MUSCLES.biceps;
  else if (isTriceps) imgInfo = WGER_MUSCLES.triceps;
  else if (isCore) imgInfo = WGER_MUSCLES.abs;
  else if (isCalf) imgInfo = WGER_MUSCLES.calves;

  const POSE = isChest ? ['推类发力要领 · Push Pattern', '解剖发力', '胸大肌主导收缩，肘角保持 45°-60° 沉肩夹胸。离心控制 2 秒匀速下落，感受胸肌张力拉满。']
    : isBack ? ['拉类发力要领 · Pull Pattern', '解剖发力', '背阔肌拉动手肘后拽，肩胛骨向脊柱中线挤压。挺胸沉肩，手肘像钩子一样顺身体后拉。']
    : (isGlute || isHamstrings) ? ['髋铰链发力要领 · Hinge / Glute Drive', '解剖发力', '骨盆保持正位，臀大肌主导伸髋。顶峰收缩挤压 1 秒，膝盖微屈对准第二脚趾防止内扣。']
    : isQuads ? ['下肢屈伸发力要领 · Squat / Quad Pattern', '解剖发力', '股四头肌伸膝推地，全程脚底三角踩实。核心紧锁保持躯干稳定，避免腰部代偿。']
    : isShoulder ? ['肩部孤立发力要领 · Deltoid Alignment', '解剖发力', '沉肩锁定斜方肌，让大臂带动手臂向上提起。避免借力甩动，顶峰稍作停顿感应侧束/前束。']
    : isSwim ? ['水中动力发力要领 · Hydrodynamics Stroke', '水中发力', '高肘抱水-推进连贯，核心绷紧保持体表流线型以降低水阻。打腿由髋部发力传导至脚尖。']
    : ['目标孤立发力 · Target Isolation', '解剖发力', '建立意念-肌肉连接（Mind-Muscle Connection），在动作顶峰保持有意识的孤立张力。'];
  const posePattern = skinTpl('exPose', POSE, () => `<p class="sec-label">${POSE[0]}</p><div class="ex-tip"><span class="sub-label">[ ${POSE[1]} ]</span> ${POSE[2]}</div>`);

  const imgSection = imgInfo ? `
    <div style="display:flex;justify-content:center;align-items:center;gap:12px;background:#fff;padding:12px;border:1px solid var(--line)">
      <img src="${imgInfo.main}" alt="${primaryName}" style="max-width:130px;height:160px;object-fit:contain" loading="lazy" onerror="this.style.display='none'" />
      ${imgInfo.sec ? `<img src="${imgInfo.sec}" alt="协同肌群" style="max-width:130px;height:160px;object-fit:contain;opacity:0.85" loading="lazy" onerror="this.style.display='none'" />` : ''}
    </div>` : '';

  return `<div style="margin:10px 0 0;display:flex;flex-direction:column;gap:8px;width:100%">
    ${imgSection}
    <div class="kv"><span class="k">主发力</span><span class="accent">${primaryName}</span>${secondaryName && secondaryName !== '—' ? `<span class="k">协同辅助</span><span>${secondaryName}</span>` : ''}</div>
    ${posePattern}
  </div>`;
}
window.renderMuscleDiagram = renderMuscleDiagram;

// ══ Add Extra Exercise Modal (Filtered by today's muscles) ═
function openAddExerciseModal(date) {
  const sel = S.plan && S.plan.days.find(d => d.date === date);
  if (!sel) return;
  window._addExDate = date;

  const splitGroups = sel._splitGroups || [];
  const existingGroups = new Set();
  (sel.exercises || []).forEach(ex => { if (ex.group) existingGroups.add(ex.group); });
  const targetGroups = Array.from(new Set([...splitGroups, ...existingGroups])).filter(Boolean);

  const grpNames = {
    chest: '胸部', shoulder: '肩部', back: '背部', biceps: '二头肌', triceps: '三头肌',
    quads: '股四头肌', hamglutes: '臀腿', glutemed: '臀中肌', calves: '小腿',
    core: '核心', cardio: '有氧', warmup: '热身', stretch: '拉伸', swimming: '游泳'
  };

  let modal = document.getElementById('add-ex-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'add-ex-modal';
    modal.className = 'ex-modal-overlay';
    modal.onclick = e => { if (e.target === modal) modal.classList.remove('open'); };
    document.body.appendChild(modal);
  }

  const allGroups = Object.keys(DB);
  const otherGroups = allGroups.filter(g => !targetGroups.includes(g));

  modal.innerHTML = skinTpl('addExSheet', { date, sel, targetGroups, otherGroups, grpNames }, () => `<div class="ex-modal-card" onclick="event.stopPropagation()">
    <div class="ex-modal-hdr"><div><div class="sheet-eyebrow">加一个动作</div><div class="sheet-title">${fmtDate(date)} · ${_escHtml(sel.workoutType || '')}</div></div>
      <button class="ex-modal-close" onclick="uiCloseOverlay('add-ex-modal')">关闭</button></div>
    <span class="sub-label">今天的目标肌群</span>
    <div class="chips" id="add-ex-groups">
      ${targetGroups.length ? targetGroups.map(g => `<button type="button" class="chip" data-g="${g}" onclick="renderAddExList('${g}')">${grpNames[g] || g}</button>`).join('') : '<span class="note-line">没有特定肌群</span>'}
    </div>
    <details class="fold">
      <summary>其他肌群</summary>
      <div class="chips">
        ${otherGroups.map(g => `<button type="button" class="chip" data-g="${g}" onclick="renderAddExList('${g}')">${grpNames[g] || g}</button>`).join('')}
      </div>
    </details>
    <div id="add-ex-list"><div class="note-line">点上面的肌群看可选动作</div></div>
  </div>`);

  modal.classList.add('open');
  if (targetGroups.length) renderAddExList(targetGroups[0]);
}
window.openAddExerciseModal = openAddExerciseModal;

function renderAddExList(groupKey) {
  const date = window._addExDate;
  const sel = S.plan && S.plan.days.find(d => d.date === date);
  if (!sel || !DB[groupKey]) return;

  const usedNames = new Set((sel.exercises || []).map(e => e.name));
  const excluded = getExcluded();
  const available = DB[groupKey].filter(e => !usedNames.has(e.n) && !excluded.has(e.n) && (!e.eq || e.eq.some(q => q === '无器材' || S.equip.includes(q))));

  const listEl = document.getElementById('add-ex-list');
  if (!listEl) return;

  if (!available.length) {
    listEl.innerHTML = `<div class="note-line">这个肌群没有更多可选动作</div>`;
    return;
  }

  const diffLabel = ['', '★', '★★', '★★★'];
  document.querySelectorAll('#add-ex-modal .chip[data-g]').forEach(b => { const on = b.dataset.g === groupKey; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  listEl.innerHTML = skinTpl('addExList', { groupKey, available }, () => available.map((ex, idx) => `<button type="button" class="swap-option" onclick="doAddExercise('${groupKey}', ${idx})"><span><span class="so-n">${ex.n}</span><span class="so-s">${diffLabel[ex.diff || 1]}</span></span>${ex.note ? `<span class="so-note">${ex.note}</span>` : ''}</button>`).join(''));
  window._currentAddExPool = available;
}
window.renderAddExList = renderAddExList;

function doAddExercise(groupKey, poolIdx) {
  const date = window._addExDate;
  const sel = S.plan && S.plan.days.find(d => d.date === date);
  const ex = window._currentAddExPool[poolIdx];
  if (!sel || !ex) return;
  sel._edited = true;

  const unit = ex.u || '次';
  const sets = 3;
  const reps = _repsFor(ex, { sec: 30, min: 10, reps: 12 }); // 规矩③:带 hold 的按 hold

  sel.exercises.push({
    name: ex.n,
    note: ex.note || '',
    sets: sets,
    reps: reps,
    unit: unit,
    group: groupKey,
    muscle: ex.muscle || [],
    diff: ex.diff,
    isWarmup: false,
    isStretch: false,
    bi: !!ex.bi,
    addedManually: true
  });

  saveState();
  render();
  const modal = document.getElementById('add-ex-modal');
  if (modal) modal.classList.remove('open');
  showToast(`已添加额外动作：「${ex.n}」`);
}
window.doAddExercise = doAddExercise;

// ══ Post-Workout Hydro & Thermal Recovery Module ═══════════
// 小区有两个泳池区、交替去,其中一个没有热躺椅 → 按日期记住"本次去哪个"。
// 未选过的日子沿用最近一次的选择(交替时点一下切换即可),没有任何历史时默认"有热躺椅"。
function _poolHasLounger(date) {
  const m = S.poolLounger || {};
  if (date in m) return m[date];
  const prior = Object.keys(m).filter(d => d < date).sort();
  if (prior.length) return m[prior[prior.length - 1]];
  const any = Object.keys(m).sort();
  if (any.length) return m[any[0]];
  return true;
}
function setPoolLounger(date, has) {
  if (!S.poolLounger) S.poolLounger = {};
  S.poolLounger[date] = has;
  saveState(); render();
}
window.setPoolLounger = setPoolLounger;

function renderRecoveryModule(sel) {
  // 桑拿/Hot Tub 只在游泳日出现——健身日不会为了泡桑拿特地换泳衣
  if (!sel || !sel.isSwimDay) return '';

  // 跟随「每次时长」设置(与游泳动作的时间分配同一来源 S.dur),而不是写死的 sel.duration
  const totalMins = S.dur || sel.duration || 60;
  const swimMins = _swimMinutes(totalMins);   // 与 pickSwimExercises 同一公式,水中时间两边对得上
  const recoveryMins = Math.max(10, totalMins - swimMins);

  const hasLounger = _poolHasLounger(sel.date);

  // 按权重瓜分 recoveryMins,余数落到最后一项 → 各项加总正好等于 recoveryMins(无四舍五入溢出)
  let saunaMins, hottubMins, loungerMins;
  if (hasLounger) {
    saunaMins = Math.round(recoveryMins * 0.45);
    hottubMins = Math.round(recoveryMins * 0.30);
    loungerMins = recoveryMins - saunaMins - hottubMins;
  } else {
    saunaMins = Math.round(recoveryMins * 0.60);
    hottubMins = recoveryMins - saunaMins;
    loungerMins = 0;
  }

  const segBtn = (has, label) => `<button type="button" class="seg-btn${hasLounger === has ? ' on' : ''}" role="radio" aria-checked="${hasLounger === has}" onclick="setPoolLounger('${sel.date}',${has})">${label}</button>`;
  const row = (name, desc, btn) => `<div class="rec-row"><span><span class="rn">${name}</span><span class="rd">${desc}</span></span>${btn}</div>`;
  const loungerRow = hasLounger ? row('石板热躺椅放松', `${loungerMins} 分钟 · 全身体表静止热传导放松`, `<button class="act-play-btn" onclick="startTimer(${loungerMins}*60,'热躺椅放松中')">开始 ${loungerMins} 分</button>`) : '';

  return `<details class="recovery-box">
  <summary><span>训练后水疗与水温恢复</span><span class="tag">桑拿 · Hot Tub${hasLounger ? ' · 热躺椅' : ''} ▾</span></summary>
  <div style="display:flex;flex-direction:column;gap:8px;padding-bottom:8px">
    <span class="sub-label">本次泳池区</span>
    <div class="seg" role="radiogroup" aria-label="本次泳池区" style="--n:2">${segBtn(true, '有热躺椅')}${segBtn(false, '没有热躺椅')}</div>
    <div class="note-line">按健身时间（设为 ${totalMins} 分钟）算：建议水中训练 ${swimMins}分钟 + 排毒放松 ${recoveryMins}分钟</div>
    ${row('干蒸 / 湿蒸桑拿', `${saunaMins} 分钟 · 促进血液循环与深层排汗`, `<button class="act-play-btn" onclick="startTimer(${saunaMins}*60,'桑拿中 · 保持长呼吸')">开始 ${saunaMins} 分</button>`)}
    ${row('热水水力 Spa（Hot Tub）', `${hottubMins} 分钟 · 水力冲刷缓解关节与肌肉张力`, `<button class="act-play-btn" onclick="startTimer(${hottubMins}*60,'Hot Tub 水疗中')">开始 ${hottubMins} 分</button>`)}
    ${loungerRow}
    ${row('冷热交替浴引导', '冷 1 min ⇄ 热 3 min 循环 3 轮 · 血管泵动', `<button class="act-play-btn" onclick="startMultiTimer([{sec:60,label:'冷水冲洗/浸泡'},{sec:180,label:'Hot Tub/热水池'},{sec:60,label:'冷水冲洗/浸泡'},{sec:180,label:'Hot Tub/热水池'},{sec:60,label:'冷水冲洗/浸泡'},{sec:180,label:'Hot Tub/热水池'},{sec:60,label:'冷水收尾完成'}])">启动引导</button>`)}
  </div>
</details>`;
}
window.renderRecoveryModule = renderRecoveryModule;
