// ══ System Version ═════════════════════════════════════════
const APP_VERSION = 'v3.1.0';
const APP_BUILD = 170;               // = sw.js 的 CACHE 编号 = index.html 页脚 build(check-static 会查,三处一起改)
const APP_BUILD_DATE = '2026-11-11';
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
// 值没变就不写、不标脏(开机重算成就之类的自动写盘不能算「本机改过」,否则开机合并会拿本机旧设置 / 旧计划盖掉云端);变了记下是哪个键(app.js _syncMarkKey)
function ls(k, v) { try { const s = JSON.stringify(v), nk = nsKey(k); if (localStorage.getItem(nk) === s) return; localStorage.setItem(nk, s); if (typeof _syncMarkKey === 'function') _syncMarkKey(k); if (typeof schedulePush === 'function') schedulePush() } catch { } }
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
const S = { goal: '女性薄肌', level: '初级', days: 3, dur: 60, equip: ['健身房全套'], focus: ['均衡全身'], limits: '', plan: null, selDate: null, prog: {}, adj: {}, weights: {}, exRpe: {}, poolLounger: {}, flexProg: {}, volumeMultiplier: 1.0, restDur: 45, swimLevel: '入门', weightLevel: '初级', periodMode: false, cycleEnabled: true, vacuumDays: [], autoVolumeAdjust: true };
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
const OWNER_ONLY_MOVES = ['凯格尔盆底收缩', '盆底放松呼吸',
  // 仪态日课是 Cait 的,不进别人的计划 / AI 目录 / 共享(靠墙天使除外:Cici 肩颈模块在用)
  '靠墙站立体态检查（wall posture check）', '头顶书本走姿（poise walk）', '猫步走（catwalk）',
  '收下巴', '肩胛后缩保持', '高跪姿开胸（kneeling chest opener）'];
// 下架:不再排进任何人的计划,已排进去的开机时换掉;库里条目留着,历史记录和详情还查得到
const RETIRED_MOVES = ['骨盆前后倾（pelvic tilt）',
  // 2026-11-05 仪态日课和真空吸都不留(Cait)
  '收下巴', '肩胛后缩保持', '颈深屈肌保持（chin tuck hold）', '高跪姿开胸（kneeling chest opener）',
  '头顶书本走姿（poise walk）', '猫步走（catwalk）', '靠墙站立体态检查（wall posture check）', '腹横肌真空吸',
  // 只是转骨盆,没有训练负荷
  '四足跪姿骨盆画8字', '四足跪姿骨盆绕环（hip circles）', '四足髋部大绕环', '水中骨盆画圆',
  // 查不到通行做法 / 练不到标的 / 属于舞蹈技巧
  '悬挂开胯', '仰卧牛面式（gomukhasana）', '仰卧对角抬举（dead bug 变体）', '深蹲转体', '仰卧颈部后仰伸展', '旋转中轴训练（pirouette prep）', '鳄鱼式（makarasana）',
  // 和留下的动作是同一个:幼犬=小狗伸展,青蛙趴/开胯=青蛙式,画圈腿=腿画圈,低位蜥蜴=蜥蜴式,宽膝婴儿=婴儿式,蛙式臀冲=蛙式臀桥
  '幼犬式（puppy pose）', '青蛙趴', '青蛙式开胯', '仰卧画圈腿（rond de jambe）', '低位蜥蜴式（前臂落地）', '宽膝婴儿式（balasana）', '蛙式臀冲'];

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
  RETIRED_MOVES.forEach(e => s.add(e));
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
  if (!S.plan || !S.plan.days) return;
  const isOwner = typeof _ownerSession === 'function' && _ownerSession();
  const gated = new Set(isOwner ? RETIRED_MOVES : [..._PRIVATE_POOL, ...OWNER_ONLY_MOVES, ...RETIRED_MOVES]);
  let changed = false;
  S.plan.days.forEach(day => {
    if (!day.exercises) return;
    for (let i = day.exercises.length - 1; i >= 0; i--) {
      const ex = day.exercises[i];
      if (day.date >= todayStr() && (ex.isPosture || /补弱:近 4 周「(腰窝背沟|颈线肩线)」/.test(ex.note || ''))) {   // 仪态日课和背/肩补弱都停了:今天和以后已排的直接去掉,不补位
        changed = true;
        const oldLen = day.exercises.length;
        day.exercises.splice(i, 1);
        _reindexAfterRemoval(day.date, i, oldLen);
        continue;
      }
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
    { n: '杠铃卧推', eq: ['健身房全套'], muscle: ['胸', '三头'], diff: 2, note: '肩胛收紧下沉、双脚踩实，杠铃下放到胸口再推起' },
    { n: '哑铃卧推', eq: ['哑铃', '健身房全套'], muscle: ['胸', '三头'], diff: 1, note: '哑铃下放到胸部两侧、手肘略收，推回胸口正上方' },
    { n: '上斜哑铃卧推', eq: ['哑铃', '健身房全套'], muscle: ['上胸', '三头'], diff: 2, note: '靠背调成上斜，哑铃从上胸两侧推到锁骨正上方' },
    { n: '下斜杠铃卧推', eq: ['健身房全套'], muscle: ['下胸', '三头'], diff: 2, note: '双脚勾牢、头低脚高，杠铃下放到下胸再垂直推起' },
    { n: '史密斯卧推', eq: ['健身房全套'], muscle: ['胸', '三头'], diff: 1, note: '凳子摆到杠铃落在胸口中段，推不动转腕就能挂钩' },
    { n: '坐姿推胸机', eq: ['健身房全套'], muscle: ['胸'], diff: 1, note: '把手对准胸口中段，背贴靠背推出，回放时配重不碰底' },
    { n: '器械夹胸', eq: ['健身房全套'], muscle: ['胸大肌中缝'], diff: 1, note: '手肘微屈保持不变，双手在胸前合拢，再慢慢打开' },
    { n: '绳索夹胸', eq: ['健身房全套'], muscle: ['胸'], diff: 1, note: '滑轮调到胸口高度，弓步站，手肘微屈向前水平合拢' },
    { n: '绳索下斜夹胸', eq: ['健身房全套'], muscle: ['下胸'], diff: 1, note: '高位滑轮，手肘微屈，从斜上方向腹部前方合拢' },
    { n: '哑铃仰卧屈臂上拉', eq: ['哑铃', '健身房全套'], muscle: ['胸', '背阔'], diff: 2, note: '上背横搭在凳上、臀部悬空，哑铃沿弧线放到头后再拉回' },
    { n: '上斜哑铃飞鸟', eq: ['哑铃', '健身房全套'], muscle: ['上胸'], diff: 2, note: '手肘微屈固定，哑铃向两侧弧线打开再合拢' },
    { n: '俯卧撑', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['胸', '三头'], diff: 1, note: '核心收紧，从头到脚跟一条直线，胸口贴近地面再推起' },
    { n: '鳄鱼式（makarasana）', eq: ['无器材'], muscle: ['胸大肌'], diff: 1, note: '俯卧于垫，额头枕在交叠的前臂上，深长腹式呼吸，放松腰背', u: '秒' },
  ],
  shoulder: [
    { n: '杠铃推举', eq: ['健身房全套'], muscle: ['前束', '中束'], diff: 2, note: '站直收紧臀腹，杠铃从锁骨垂直推过头顶，不后仰' },
    { n: '哑铃肩推', eq: ['哑铃', '健身房全套'], muscle: ['前束', '中束'], diff: 1, note: '背贴靠背不耸肩，哑铃从耳侧推到头顶上方' },
    { n: '器械推举', eq: ['健身房全套'], muscle: ['前束', '中束'], diff: 1, note: '背贴直立靠背，握把从肩高推起，不锁死手肘' },
    { n: '史密斯肩推', eq: ['健身房全套'], muscle: ['前束', '中束'], diff: 1, note: '凳子摆在杠下，杠铃从锁骨推起，推不动转腕挂钩' },
    { n: '侧平举', eq: ['哑铃', '健身房全套'], muscle: ['中束'], diff: 1, note: '手肘微屈、手腕不高过手肘，向两侧举到肩高，不耸肩' },
    { n: '坐姿侧平举机', eq: ['健身房全套'], muscle: ['中束'], diff: 1, note: '上臂外侧抵住挡板，用手肘带着向两侧抬到肩高' },
    { n: '绳索侧平举', eq: ['健身房全套'], muscle: ['中束'], diff: 1, note: '侧对低位滑轮，用外侧手把把手举到肩高，身体不倒', bi: true },
    { n: '哑铃前平举', eq: ['哑铃', '健身房全套'], muscle: ['前束'], diff: 1, note: '手肘微屈，双臂同时向前举到肩高，身体不晃' },
    { n: '绳索前平举', eq: ['健身房全套'], muscle: ['前束'], diff: 1, note: '背对低位滑轮，绳从两腿间穿过，向前举到肩高' },
    { n: '杠铃直立划船', eq: ['健身房全套'], muscle: ['中束', '斜方肌'], diff: 2, note: '握距略宽于肩，手肘带动沿身体提到胸口，不过下巴' },
    { n: '俯身飞鸟', eq: ['哑铃', '健身房全套'], muscle: ['后束'], diff: 1, note: '屈髋俯身、背部平直，手肘微屈向两侧展开' },
    { n: '反向飞鸟机', eq: ['健身房全套'], muscle: ['后束'], diff: 1, note: '胸口贴紧靠垫，手肘微屈向后展开，慢慢回放' },
    { n: '面拉', eq: ['健身房全套', '弹力带'], muscle: ['后束', '外旋'], diff: 1, note: '绳拉向脸部，手肘高抬外展，两手分到耳朵两侧' },
  ],
  back: [
    { n: '引体向上', eq: ['健身房全套'], muscle: ['背阔', '二头'], diff: 3, note: '肩胛先下沉再拉，下巴过杠，慢慢放回手臂伸直' },
    { n: '助力引体向上机', eq: ['健身房全套'], muscle: ['背阔', '二头'], diff: 1, note: '双膝跪稳垫板，背部发力拉起，慢慢下落别被垫板弹起' },
    { n: '高位下拉', eq: ['健身房全套'], muscle: ['背阔'], diff: 1, note: '挺胸略后仰，把杆垂直拉到锁骨前，慢放回手臂伸直' },
    { n: '坐姿划船', eq: ['健身房全套', '弹力带'], muscle: ['中背', '菱形'], diff: 1, note: '背平直，上身挺直后手肘贴身把把手拉向肚脐，肩胛向后夹' },
    { n: 'T把划船', eq: ['健身房全套'], muscle: ['中背', '背阔'], diff: 2, note: '屈髋俯身、背部平直，把手拉向胸腹交界处' },
    { n: '杠铃斜板划船', eq: ['健身房全套'], muscle: ['中背'], diff: 1, note: '胸口贴紧斜板，正握杠铃拉向胸下，肩膀不耸' },
    { n: '哑铃单臂划船', eq: ['哑铃', '健身房全套'], muscle: ['背阔'], diff: 1, note: '一侧手膝撑凳背平直，哑铃沿弧线拉向侧腰', bi: true },
    { n: '器械上背划船', eq: ['健身房全套'], muscle: ['上背', '菱形'], diff: 1, note: '胸贴靠垫，手肘外展与肩同高向后拉，夹紧肩胛' },
    { n: '俯身划船', eq: ['哑铃', '健身房全套'], muscle: ['中背'], diff: 2, note: '屈髋俯身背平直，杠铃拉向肚脐，核心收紧' },
    { n: '绳索直臂下压', eq: ['健身房全套'], muscle: ['背阔'], diff: 1, note: '手臂伸直不弯，把直杆从胸前压到大腿前' },
    { n: '直臂下压机', eq: ['健身房全套'], muscle: ['背阔'], diff: 1, note: '手肘弯曲角度不变，用背部把头上方的把手沿弧线拉到胸前' },
    { n: '山羊挺身', eq: ['健身房全套'], muscle: ['竖脊肌', '臀'], diff: 1, note: '挡板在大腿根，背平直下放，再挺起到身体成直线' },
    { n: '弹力带划船', eq: ['弹力带'], muscle: ['中背'], diff: 1, note: '带子绕过脚底，挺胸把带子拉向腰侧，夹紧肩胛' },
    { n: '俯卧YTW', eq: ['哑铃', '无器材', '健身房全套'], muscle: ['下斜方', '后束'], diff: 1, note: '俯卧依次把手臂摆成Y、T、W，肩胛全程下沉' },
    { n: '靠墙天使', eq: ['无器材'], muscle: ['下斜方', '姿势'], diff: 1, note: '背贴墙，手臂贴墙从W滑到Y再滑回，肩不耸' },
  ],
  biceps: [
    { n: '杠铃弯举', eq: ['健身房全套'], muscle: ['二头'], diff: 1, note: '上臂贴身不动，只弯前臂把杠铃举到胸前' },
    { n: '哑铃弯举', eq: ['哑铃', '健身房全套'], muscle: ['二头'], diff: 1, note: '左右交替，上臂贴身不动，身体不晃', bi: true },
    { n: '牧师椅杠铃弯举', eq: ['健身房全套'], muscle: ['二头'], diff: 2, note: '腋窝卡住斜垫、上臂平贴，下放到接近伸直再弯举' },
    { n: '器械弯举', eq: ['健身房全套'], muscle: ['二头'], diff: 1, note: '上臂平放在垫板上，平稳弯起，慢慢放回' },
    { n: '集中弯举', eq: ['哑铃', '健身房全套'], muscle: ['二头肌峰'], diff: 1, note: '坐姿，手肘抵住同侧大腿内侧，只动前臂', bi: true },
    { n: '斜板哑铃弯举', eq: ['哑铃', '健身房全套'], muscle: ['二头长头'], diff: 2, note: '背贴上斜靠背，手臂垂直下垂，上臂不动只弯前臂' },
    { n: '锤式弯举', eq: ['哑铃', '健身房全套'], muscle: ['肱肌', '前臂'], diff: 1, note: '掌心相对握哑铃，上臂贴身，左右交替弯举', bi: true },
    { n: '绳索弯举', eq: ['健身房全套'], muscle: ['二头'], diff: 1, note: '面对低位滑轮，上臂贴身不动，弯举到胸前' },
    { n: '绳索过头弯举', eq: ['健身房全套'], muscle: ['二头短头'], diff: 1, note: '双臂侧平伸握高位把手，上臂不动，向头两侧弯举' },
  ],
  triceps: [
    { n: '绳索下压', eq: ['健身房全套'], muscle: ['三头'], diff: 1, note: '上臂贴身固定，只动前臂把杆压到手臂伸直' },
    { n: '器械三头下压', eq: ['健身房全套'], muscle: ['三头'], diff: 1, note: '坐直背贴靠垫，双手握身体两侧把手向下推到伸直' },
    { n: '绳索过头臂屈伸', eq: ['健身房全套'], muscle: ['三头长头'], diff: 1, note: '背对低位滑轮站直，上臂贴耳不动，向上伸直手臂' },
    { n: '哑铃臂屈伸', eq: ['哑铃', '健身房全套'], muscle: ['三头'], diff: 1, note: '坐姿双手托一只哑铃，手肘朝上不动，只动前臂' },
    { n: '俯身单臂哑铃臂屈伸', eq: ['哑铃', '健身房全套'], muscle: ['三头'], diff: 1, note: '上臂贴身与地面平行，只动前臂向后伸直', bi: true },
    { n: '双杠臂屈伸', eq: ['健身房全套'], muscle: ['三头', '胸'], diff: 3, note: '身体直立、手肘贴身，下放到上臂约与地面平行再撑起' },
    { n: '助力双杠臂屈伸', eq: ['健身房全套'], muscle: ['三头'], diff: 1, note: '双膝跪稳托垫，身体直立，屈肘下放再推起' },
    { n: '窄距杠铃卧推', eq: ['健身房全套'], muscle: ['三头', '胸'], diff: 2, note: '握距约与肩同宽，手肘贴身，杠铃下放到下胸' },
    { n: '仰卧臂屈伸', eq: ['哑铃', '健身房全套'], muscle: ['三头'], diff: 1, note: '上臂接近垂直不动，屈肘把哑铃放到额头两侧' },
  ],
  quads: [
    { n: '靠墙静蹲', eq: ['无器材', '健身房全套'], muscle: ['股四头', '臀'], diff: 1, note: '背贴墙下滑到大腿与地面平行，膝对脚尖，按计时静止保持', u: '秒' },
    { n: '杠铃深蹲', eq: ['健身房全套'], muscle: ['股四头', '臀'], diff: 2, note: '杠铃压稳上背，臀向后坐、膝对脚尖，蹲到大腿至少平行再站起' },
    { n: '靠墙静蹲（wall sit）', eq: ['无器材', '健身房全套'], muscle: ['股四头', '下肢'], diff: 1, note: '背贴墙下滑到大腿平行地面，膝对脚尖，按计时静止保持并均匀呼吸', u: '秒' },
    { n: '相扑深蹲保持（sumo squat hold）', eq: ['无器材', '健身房全套'], muscle: ['股四头', '内收肌', '下肢'], diff: 2, note: '宽站脚尖外展蹲到底，合掌用肘撑开膝内侧，背立直按计时保持', u: '秒' },
    { n: '深蹲转体', eq: ['无器材', '健身房全套'], muscle: ['股四头', '下肢', '骨盆控制'], diff: 2, note: '双脚并拢深蹲到底保持稳定，双手胸前合十，躯干缓慢向左右交替旋转，徒手小幅不负重' },
    { n: '颈前杠铃深蹲', eq: ['健身房全套'], muscle: ['股四头'], diff: 3, note: '杠铃架在锁骨和肩前，手肘抬高，躯干直立下蹲再站起' },
    { n: '史密斯深蹲', eq: ['健身房全套'], muscle: ['股四头', '臀'], diff: 1, note: '杠铃放上背，双脚在杠下或略前，蹲到大腿平行再推起' },
    { n: '倒蹬机', eq: ['健身房全套'], muscle: ['股四头', '臀'], diff: 1, note: '背臀贴紧靠垫，双脚踩踏板中部，屈膝放下再蹬起，顶端不锁膝' },
    { n: '钟摆深蹲', eq: ['健身房全套'], muscle: ['股四头'], diff: 2, note: '背和肩贴紧靠垫，跟着机器弧线慢慢蹲深，再脚掌发力推起' },
    { n: '哈克深蹲', eq: ['健身房全套'], muscle: ['股四头'], diff: 2, note: '背贴靠垫、肩顶肩托，下蹲到大腿平行或更低再推起' },
    { n: '腿屈伸', eq: ['健身房全套'], muscle: ['股四头'], diff: 1, note: '膝盖对准器械转轴，伸膝把小腿抬到接近伸直，顶端稍停再慢慢放下' },
    { n: '保加利亚分腿蹲', eq: ['哑铃', '健身房全套'], muscle: ['股四头', '臀'], diff: 2, note: '后脚背搭凳，重心放前腿，下蹲到前大腿平行再前脚跟推起', bi: true },
    { n: '哑铃弓步蹲', eq: ['哑铃', '健身房全套'], muscle: ['股四头', '臀'], diff: 1, note: '向前迈步下蹲到双膝约成直角，前脚踩实蹬回，左右交替', bi: true },
    { n: '高脚杯深蹲', eq: ['哑铃', '无器材'], muscle: ['股四头', '臀'], diff: 1, note: '双手竖捧哑铃贴胸，挺胸下蹲到手肘碰膝内侧再站起' },
    { n: '壶铃高脚杯深蹲', eq: ['壶铃', '健身房全套'], muscle: ['股四头', '臀'], diff: 1, note: '双手握壶铃把手两侧贴胸，挺胸臀向后坐，蹲到大腿平行再站起' },
    { n: '相扑深蹲', eq: ['无器材', '哑铃', '壶铃', '健身房全套'], muscle: ['臀', '内收肌', '股四头'], diff: 1, note: '宽站脚尖外展，挺胸臀向下坐到大腿平行，膝对脚尖再站起' },
    { n: '哥萨克深蹲', eq: ['无器材', '哑铃', '壶铃', '健身房全套'], muscle: ['内收肌', '臀', '股四头'], diff: 2, note: '宽站，重心移向一侧蹲到底，另一腿伸直脚尖朝上，左右交替', bi: true },
    { n: '靠墙静蹲开胯（turnout）', eq: ['无器材', '健身房全套'], muscle: ['股四头', '臀', '髋外旋'], diff: 2, note: '背贴墙半蹲，脚尖和膝同时向外打开，按计时保持膝不内扣', u: '秒' },
  ],
  glutemed: [
    { n: '站姿绳索单腿外展', eq: ['健身房全套'], muscle: ['臀中肌'], diff: 1, note: '脚踝套绳扶稳机架，工作腿伸直向外侧抬起，上身不侧倒', bi: true },
    { n: '侧卧抬腿画圈', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '髋外旋'], diff: 2, note: '侧卧下腿屈膝，上腿伸直抬起后慢慢画小圈，骨盆不后倒', bi: true },
    { n: '弹力带螃蟹步', eq: ['弹力带', '无器材'], muscle: ['臀中肌'], diff: 1, note: '弹力带套膝上，半蹲向一侧横走，双脚不并拢，带子全程绷紧', bi: true },
    { n: '侧卧抬腿', eq: ['无器材', '弹力带'], muscle: ['臀中肌'], diff: 1, note: '侧卧双腿伸直，上腿向侧上方抬起，顶端稍停，骨盆不后倒', bi: true },
    { n: '弹力带蚌式开合', eq: ['弹力带', '无器材'], muscle: ['臀中肌'], diff: 1, note: '侧卧屈膝双脚并拢，上方膝像蚌壳打开，骨盆不后翻', bi: true },
    { n: '器械外展机', eq: ['健身房全套'], muscle: ['臀中肌'], diff: 1, note: '背靠靠背坐稳，大腿外侧贴挡板，双腿向外打开再慢慢并拢' },
    { n: '消防栓式', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀中肌'], diff: 1, note: '四足跪姿，膝保持弯曲向侧上方抬起，骨盆朝下不跟着翻', bi: true },
    { n: '站姿并腿外旋等长（turnout）', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['内收肌', '臀中肌'], diff: 1, note: '并腿站，大腿内侧夹紧同时脚掌向外拧，按计时保持这股对抗', u: '秒' },
    { n: '仰卧弹力带髋外展保持', eq: ['弹力带', '无器材', '健身房全套'], muscle: ['内收肌', '臀中肌'], diff: 2, note: '仰卧双腿上举，弹力带套膝上，向两侧打开成V按计时保持', u: '秒' },
    { n: '四足髋绕环（hip CARs）', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '髋外旋'], diff: 1, note: '四足跪姿稳住骨盆，用一侧髋带着膝盖慢慢画最大的圈', bi: true },
    { n: '芭蕾深蹲（plié）', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '内收肌', '股四头'], diff: 1, note: '宽站脚尖外开，躯干垂直下蹲，膝始终对脚尖，站起时夹臀' },
    { n: '芭蕾侧踢腿（battement）', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '内收肌'], diff: 1, note: '扶墙站直，工作腿绷脚背向正侧方抬到髋高，再慢慢放下', bi: true },
    { n: '单腿relevé踮立', eq: ['无器材', '健身房全套'], muscle: ['臀中肌', '小腿', '平衡'], diff: 1, note: '单腿站，慢慢踮到最高稍停再慢放，连续做到计时结束', u: '秒', bi: true },
  ],
  hamglutes: [
    { n: '臀桥保持', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀', '腘绳'], diff: 1, note: '仰卧屈膝顶髋到肩-髋-膝一线，夹紧臀部静止不动', u: '秒' },
    { n: '罗马尼亚硬拉', eq: ['哑铃', '健身房全套'], muscle: ['腘绳', '臀'], diff: 2, note: '膝盖微屈固定，臀部向后推，杠铃贴腿下放到腿后侧拉紧再站起' },
    { n: '传统硬拉', eq: ['健身房全套'], muscle: ['后链全部'], diff: 3, note: '杠铃贴腿，背部平直，双腿蹬地把杠铃拉起站直' },
    { n: '臀推', eq: ['健身房全套', '哑铃'], muscle: ['臀'], diff: 1, note: '上背靠凳、杠铃压髋，脚跟踩地顶髋到一条线，顶端夹臀' },
    { n: '史密斯臀推', eq: ['健身房全套'], muscle: ['臀'], diff: 1, note: '长凳横在史密斯机前，杠压髋部，顶髋到一条线后夹臀' },
    { n: '腿弯举', eq: ['健身房全套'], muscle: ['腘绳'], diff: 1, note: '俯卧，脚踝后侧卡住滚垫，小腿弯向臀部，慢慢放回' },
    { n: '坐姿腿弯举', eq: ['健身房全套'], muscle: ['腘绳'], diff: 1, note: '背贴靠垫、大腿压板压紧，小腿向下向后弯到最大再慢放' },
    { n: '站姿单腿弯举机', eq: ['健身房全套'], muscle: ['腘绳'], diff: 1, note: '大腿前侧贴住靠垫，单腿小腿向后上方勾起，慢慢放回', bi: true },
    { n: '绳索后踢腿', eq: ['健身房全套'], muscle: ['臀大肌'], diff: 1, note: '脚踝套低位绳索，躯干稳住，腿伸直向后踢到臀部收紧', bi: true },
    { n: '器械内收机', eq: ['健身房全套'], muscle: ['内收肌'], diff: 1, note: '背贴靠背，大腿内侧发力把双腿向内夹拢，慢慢打开' },
    { n: '壶铃摆动', eq: ['壶铃', '健身房全套'], muscle: ['臀', '腘绳', '核心'], diff: 1, note: '臀部向后推再向前爆发伸髋，手臂伸直只挂住壶铃' },
    { n: '臀桥', eq: ['无器材', '弹力带'], muscle: ['臀'], diff: 1, note: '仰卧屈膝，脚跟踩地顶髋到肩-髋-膝一线，顶端夹臀再慢放' },
    { n: '蛙式臀桥', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀', '内收肌'], diff: 1, note: '仰卧脚心相对、膝盖向两侧打开，顶髋夹臀再慢放' },
    { n: '跪姿后踢腿', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌'], diff: 1, note: '四足跪姿，屈膝脚底朝天，大腿向后上抬到与躯干一线', bi: true },
    { n: '俯卧挺髋抬腿', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌', '腘绳'], diff: 1, note: '俯卧骨盆压实，单腿伸直向后上抬，顶端夹臀', bi: true },
    { n: '高跪姿挺髋保持（kneeling hip thrust hold）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '核心'], diff: 2, note: '高跪姿髋完全伸直，夹臀让头到膝成一线，静止保持', u: '秒' },
    { n: '臀桥开合', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌', '臀中肌'], diff: 2, note: '臀桥顶到最高不掉，双膝向两侧慢慢打开再合拢' },
    { n: '蛙式臀冲', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀', '内收肌'], diff: 1, note: '仰卧脚心相对、双膝向两侧打开，连续顶髋至最高点并夹臀挤压' },
    { n: '跪姿深蹲（kneeling squat）', eq: ['无器材', '健身房全套'], muscle: ['股四头', '臀大肌'], diff: 2, note: '高跪姿慢慢后坐到臀部轻碰脚跟，再快速挺髋回到高跪' },
    { n: '肩胛垫高臀推', eq: ['无器材', '健身房全套', '哑铃'], muscle: ['臀'], diff: 2, note: '上背靠凳，臀部沉到接近地面，脚跟踩地顶髋到一条线' },
    { n: '芭蕾后退腿（arabesque）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '竖脊肌'], diff: 1, note: '单手扶墙，工作腿绷直向正后方抬起，骨盆朝前，控制放下', bi: true },
    { n: '芭蕾地板后展腿', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '腘绳'], diff: 1, note: '四足跪姿，单腿伸直、脚背绷直向后上抬，骨盆不转', bi: true },
    { n: '大踢腿（grand battement）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '髋屈肌', '下肢'], diff: 2, note: '扶墙站直，工作腿绷直向上踢起，控制落回，躯干不晃', bi: true },
    { n: '前弯后腿上扬（penché）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '腘绳', '核心'], diff: 3, note: '单腿站，上身前倾后腿上抬如跷跷板，骨盆水平，静止保持', u: '秒', bi: true },
    { n: '臀桥夹球保持', eq: ['无器材'], muscle: ['臀', '盆底肌'], diff: 2, note: '仰卧膝间夹球或瑜伽砖，顶髋到一条线并夹紧，静止保持', u: '秒' },
    { n: '仰卧分腿保持（straddle hold）', eq: ['无器材'], muscle: ['臀', '盆底肌'], diff: 3, note: '仰卧双腿上举向两侧分开，双手扶大腿内侧，静止保持', u: '秒' },
    { n: '跪姿挺髋（kneeling hip thrust）', eq: ['无器材', '健身房全套'], muscle: ['臀', '髋屈肌'], diff: 2, note: '高跪姿夹臀推髋，躯干整体微微后倾，到大腿前侧拉伸就回正' },
    { n: '俯卧蛙式抬腿（frog kick）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '髋外旋'], diff: 1, note: '俯卧脚心相对、膝向两侧打开，骨盆压实，臀部发力抬起双膝' },
    { n: '四足髋部大绕环', eq: ['无器材', '健身房全套'], muscle: ['骨盆控制', '臀'], diff: 1, note: '四足跪姿，骨盆大幅度绕环旋转摆动，全范围流动激活盆底与髋关节活动度', u: '秒' },
    { n: '四足跪姿髋外展', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌', '臀中肌'], diff: 1, note: '四足跪姿，屈膝腿向侧方抬到与髋同高，骨盆保持水平', bi: true },
    { n: '驴踢腿（donkey kick）', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['臀大肌'], diff: 1, note: '四足跪姿屈膝，脚跟朝天花板向上踢到大腿与躯干一线', bi: true },
    { n: '鸟狗式（bird dog）', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '竖脊肌'], diff: 1, note: '四足跪姿，对侧手和腿同时伸直到与躯干一线，骨盆不转', bi: true },
    { n: '相扑深蹲跳（sumo squat jump）', eq: ['无器材', '健身房全套'], muscle: ['臀', '股四头', '内收肌'], diff: 3, note: '宽站距脚尖外开下蹲，向上跳起，落地屈膝缓冲接下一次' },
    { n: '青蛙趴', eq: ['无器材', '健身房全套'], muscle: ['内收肌', '髋外旋'], diff: 2, note: '四足跪姿双膝向两侧打开，骨盆缓慢向下沉，被动开胯静力保持', u: '秒' },
    { n: '蛙式臀桥保持（frog pump hold）', eq: ['无器材', '健身房全套'], muscle: ['臀', '内收肌', '盆底肌'], diff: 1, note: '仰卧脚心相对、膝向两侧打开，顶髋到一条线，静止保持', u: '秒' },
    { n: '跪姿直腿后踢', eq: ['无器材', '健身房全套'], muscle: ['臀大肌', '髋屈肌'], diff: 1, note: '四足跪姿，单腿伸直向后抬到与躯干一线，顶端夹臀', bi: true },
    { n: '高跪姿夹枕挺髋保持', eq: ['无器材', '健身房全套'], muscle: ['臀', '内收肌', '盆底肌'], diff: 2, note: '高跪姿大腿间夹枕头或瑜伽砖，挺髋夹臀，静止保持', u: '秒' },
    { n: '臀推顶端外展保持', eq: ['无器材', '健身房全套'], muscle: ['臀', '内收肌', '盆底肌'], diff: 3, note: '上背靠凳顶髋到一条线，双膝向外撑开，静止保持', u: '秒' },
  ],
  calves: [
    { n: '双腿relevé踮立保持', eq: ['无器材', '健身房全套'], muscle: ['小腿'], diff: 2, note: '双脚同时踮到最高点停住，脚踝立正不外翻', u: '秒' },
    { n: '站姿提踵', eq: ['无器材', '哑铃', '健身房全套'], muscle: ['小腿'], diff: 1, note: '前脚掌踩台阶边缘，脚跟下放到底再踮到最高' },
    { n: '史密斯提踵', eq: ['健身房全套'], muscle: ['小腿'], diff: 1, note: '杠压在肩后上背，前脚掌踩踏板，全幅度提踵' },
    { n: '腿举机提踵', eq: ['健身房全套'], muscle: ['小腿'], diff: 1, note: '腿伸直不锁死，只动脚踝用前脚掌推踏板' },
    { n: '坐姿提踵', eq: ['健身房全套'], muscle: ['比目鱼'], diff: 1, note: '膝盖弯成直角、靠垫压膝上方，脚跟抬到最高再放到底' },
  ],
  core: [
    { n: '鸟狗式', eq: ['无器材', '健身房全套'], muscle: ['核心'], diff: 1, note: '四足跪姿，对侧手脚同时伸直停住，骨盆和腰都不晃', u: '秒', bi: true },
    { n: '凯格尔盆底收缩', eq: ['无器材', '健身房全套'], muscle: ['核心'], diff: 1, note: '像憋尿一样收紧盆底肌，停一会儿再完全放松，交替进行', u: '秒', hold: 120 },
    { n: '腹横肌真空吸', eq: ['无器材', '健身房全套'], muscle: ['腹横肌'], diff: 1, note: '呼气收腹，肚脐向脊柱方向吸紧，每组按计时吸住20秒', u: '秒', hold: 20 },
    { n: '死虫式保持（dead bug hold）', eq: ['无器材', '健身房全套'], muscle: ['核心', '骨盆控制'], diff: 1, note: '仰卧桌面腿、双臂指天，下背压住地面不动，正常呼吸不憋气', u: '秒' },
    { n: '死虫式（慢速对角）', eq: ['无器材', '健身房全套'], muscle: ['核心', '骨盆控制'], diff: 1, note: '仰卧桌面腿，对侧手脚慢慢伸远再收回，左右交替，下背全程贴地' },
    { n: '仰卧直腿下放（leg lowering）', eq: ['无器材', '健身房全套'], muscle: ['核心', '下肢'], diff: 2, note: '仰卧双腿伸直从垂直慢慢下放，腰快离地前停住再抬回' },
    { n: '俯冲式俯卧撑（dive bomber push-up）', eq: ['无器材', '健身房全套'], muscle: ['核心', '脊柱'], diff: 2, note: '臀部高位起，胸口贴近地面向前钻出抬胸，再原路退回' },
    { n: '仰卧对角抬举（dead bug 变体）', eq: ['无器材', '健身房全套'], muscle: ['核心'], diff: 1, note: '仰卧四肢展开成大字，呼气时将对角手脚同时抬离地面2-3厘米并保持，换对角交替', u: '秒' },
    { n: '匍匐爬行（army crawl）', eq: ['无器材', '健身房全套'], muscle: ['核心', '全身'], diff: 2, note: '前臂撑地低平板姿势，两侧前臂交替向前挪，臀部压低不摇摆', u: '秒' },
    { n: '平板支撑', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['核心'], diff: 1, note: '前臂撑地，身体从头到脚跟一条直线，臀部不高不塌', u: '秒' },
    { n: '卷腹', eq: ['无器材', '健身房全套'], muscle: ['腹直肌'], diff: 1, note: '屈膝仰卧，下背贴地，只把肩胛骨卷离地面' },
    { n: '坐姿卷腹机', eq: ['健身房全套'], muscle: ['腹直肌'], diff: 1, note: '坐稳固定好双脚，用腹部把上身向前下方卷，不靠手拉' },
    { n: '悬挂抬腿', eq: ['健身房全套'], muscle: ['下腹', '髂腰'], diff: 2, note: '悬挂单杠，双腿伸直抬到水平后慢慢放下，不靠摆动' },
    { n: '罗马椅抬腿', eq: ['健身房全套'], muscle: ['下腹'], diff: 1, note: '前臂撑垫背贴靠背，双腿伸直抬到水平再慢慢放下' },
    { n: '俄罗斯转体', eq: ['无器材', '哑铃', '健身房全套'], muscle: ['腹斜'], diff: 1, note: '坐姿上身后倾背挺直，双手胸前合握，转动肩膀和躯干左右交替' },
    { n: '负重俄罗斯转体', eq: ['健身房全套', '哑铃'], muscle: ['腹斜'], diff: 1, note: '双手在胸前握重物，双脚离地，转动躯干把重物带到身体两侧' },
    { n: '绳索伐木', eq: ['健身房全套'], muscle: ['腹斜'], diff: 1, note: '侧对高位滑轮，像砍树一样转体把把手斜向下拉到对侧髋外', bi: true },
    { n: '死虫式', eq: ['无器材', '健身房全套'], muscle: ['核心稳定'], diff: 1, note: '仰卧桌面腿，对侧手脚伸远再收回交替进行，下背全程贴地' },
    { n: '腹轮', eq: ['健身房全套'], muscle: ['核心'], diff: 3, note: '跪姿推出时收腹微含胸，腰不塌，用腹部把轮子拉回' },
    { n: '侧平板支撑', eq: ['无器材', '健身房全套'], muscle: ['腹斜'], diff: 1, note: '前臂撑地肘在肩下，髋部顶起，身体从头到脚一条直线', u: '秒', bi: true },
    { n: '骨盆前后倾（pelvic tilt）', eq: ['无器材', '健身房全套'], muscle: ['骨盆控制', '核心'], diff: 1, note: '站/跪/仰卧，控制骨盆前倾后倾来回，活动腰椎和骨盆(康复或学动作时用)' },
    { n: '侧平板髋部下沉（side plank hip dip）', eq: ['无器材', '健身房全套'], muscle: ['腹斜', '臀中肌'], diff: 2, note: '侧平板姿势，髋部慢慢下沉接近地面再顶回，身体不前后倒', bi: true },
    { n: '高跪姿开胸（kneeling chest opener）', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['核心', '臀', '后肩'], diff: 2, note: '高跪姿(髋完全伸直、躯干垂直)，双臂向后下展、肩胛后缩挺胸，收紧核心抗后倒、骨盆中立保持', u: '秒' },
    { n: '四足脊柱波浪（cat flow）', eq: ['无器材', '健身房全套'], muscle: ['核心', '脊柱'], diff: 2, note: '四足跪姿，胸口贴近地面向前滑，再拱背退回，脊柱连贯起伏', u: '秒' },
    { n: '四足跪姿骨盆绕环（hip circles）', eq: ['无器材', '健身房全套'], muscle: ['核心', '骨盆控制'], diff: 1, note: '四足跪姿，控制骨盆缓慢在空中画圆，活动腰椎和髋', u: '秒', bi: true },
    { n: '仰卧腿画圈（leg circles）', eq: ['无器材', '健身房全套'], muscle: ['核心', '髋屈肌'], diff: 3, note: '仰卧双腿并拢伸直，在空中慢慢画圈，腰全程贴地' },
    { n: '四足跪姿骨盆画8字', eq: ['无器材', '健身房全套'], muscle: ['核心', '骨盆控制'], diff: 1, note: '四足跪姿，控制骨盆在水平面做缓慢平滑的八字形轨迹移动，深度激活与放松盆底肌', u: '秒', bi: true },
    { n: '高跪姿后倾等长（kneeling lean back）', eq: ['无器材'], muscle: ['核心', '股四头'], diff: 2, note: '高跪姿，从膝到头一条直线向后倾，停住保持，核心和臀收紧', u: '秒' },
    { n: '骆驼式（ustrasana）', eq: ['无器材'], muscle: ['核心'], diff: 2, note: '高跪姿推髋向前，双手扶腰后打开胸口，颈部不过度后仰', u: '秒' },
    { n: '单腿passé平衡', eq: ['无器材', '健身房全套'], muscle: ['核心', '下肢'], diff: 2, note: '单腿站稳，另一脚脚尖贴在支撑腿膝旁，骨盆水平不歪', u: '秒', bi: true },
    { n: '旋转中轴训练（pirouette prep）', eq: ['无器材', '健身房全套'], muscle: ['核心', '下肢'], diff: 2, note: '半蹲relevé蹬地提膝至passé位，双臂由开位收至前圆弧，核心锁定中轴静止（不旋转），感受整条中心线对齐', u: '次', bi: true },
    { n: '仰卧画圈腿（rond de jambe）', eq: ['无器材', '健身房全套'], muscle: ['核心', '髋屈肌', '下肢'], diff: 3, note: '仰卧双腿伸直绷脚背，在空中缓慢画巨大半圆弧（一侧→头顶→另一侧），全程腰贴地核心撑住，腿不触地', u: '次' },
    { n: '肩胛引体激活', eq: ['健身房全套'], muscle: ['背阔', '下斜方', '上肢'], diff: 1, note: '悬挂时手臂伸直不弯，只靠肩胛下沉后收把身体抬高一点' },
    { n: '悬挂屈体静止', eq: ['健身房全套'], muscle: ['核心', '髂腰', '上肢'], diff: 2, note: '悬挂单杠收腹提膝成团身，停住不晃，肩膀下沉不耸肩', u: '秒', hold: 20 },
    { n: '悬挂直体延伸', eq: ['健身房全套'], muscle: ['核心', '背阔', '上肢'], diff: 2, note: '主动悬挂，收腹骨盆后卷，双腿并拢伸直，全身绷成一条线', u: '秒', hold: 25 },
    { n: '悬挂开胯', eq: ['健身房全套'], muscle: ['内收肌', '核心', '上肢'], diff: 2, note: '双手握单杠悬挂，双腿伸直脚尖绷直，缓慢向两侧打开至最大幅度再并拢，内收肌离心控制全程，肩胛保持下沉', u: '次' },
    { n: '空心体保持', eq: ['无器材', '健身房全套'], muscle: ['核心', '腹直肌', '髂腰'], diff: 2, note: '仰卧双臂贴耳上举、双腿伸直离地，腰贴地，全身成浅弧', u: '秒', hold: 40 },
    { n: '龙旗', eq: ['健身房全套'], muscle: ['核心', '腹直肌', '背阔'], diff: 3, note: '仰卧凳上抓住头后凳沿，只靠肩部支撑，全身绷直慢慢下放' },
    { n: 'L撑', eq: ['无器材', '健身房全套'], muscle: ['核心', '髂腰', '上肢'], diff: 3, note: '双手撑地压肩，臀部离地，双腿伸直前平举成L形', u: '秒', hold: 20 },
  ],
  cardio: [
    { n: '跑步机慢跑', eq: ['健身房全套'], muscle: ['心肺'], diff: 1, note: '用能边跑边说完整句子的速度，步子小、落地轻', u: '分钟' },
    { n: '弧形跑步机', eq: ['健身房全套'], muscle: ['心肺'], diff: 2, note: '没有电机，往前靠就加速，往后退就减速', u: '分钟' },
    { n: '划船机', eq: ['健身房全套'], muscle: ['心肺', '全身'], diff: 1, note: '拉时先蹬腿再后倾再拉手，回程反过来', u: '分钟' },
    { n: '风阻划船机', eq: ['健身房全套'], muscle: ['心肺', '全身'], diff: 1, note: '动作同划船机，拉得越快越猛阻力越大', u: '分钟' },
    { n: '椭圆机', eq: ['健身房全套'], muscle: ['心肺'], diff: 1, note: '上身直立，手推拉把手配合脚踩，阻力别调到零', u: '分钟' },
    { n: '骑行机', eq: ['健身房全套'], muscle: ['心肺', '腿'], diff: 1, note: '座椅调到脚踏最低时膝盖微弯，上身稳住不晃', u: '分钟' },
    { n: '动感单车', eq: ['健身房全套'], muscle: ['心肺', '腿'], diff: 2, note: '调好座椅和车把，坐稳踩踏，停车要按刹车', u: '分钟' },
    { n: '攀爬机', eq: ['健身房全套'], muscle: ['心肺', '腿臀'], diff: 2, note: '挺胸直立，全脚掌踩台阶交替上迈，手只轻扶', u: '分钟' },
    { n: '跳绳', eq: ['无器材', '健身房全套'], muscle: ['心肺', '小腿'], diff: 1, note: '手腕转绳、前脚掌小跳，跳到刚好过绳就够', u: '分钟' },
    { n: '开合跳', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['心肺'], diff: 1, note: '前脚掌落地、膝盖微屈，双脚开合配合双臂侧举', u: '分钟' },
    { n: '波比跳', eq: ['无器材'], muscle: ['心肺', '全身'], diff: 2, note: '蹲下撑地、跳成平板、跳回再起跳，平板时腰不塌', u: '分钟' },
    { n: '上肢功率车', eq: ['健身房全套'], muscle: ['心肺', '上肢'], diff: 1, note: '手柄与胸口同高，双臂交替摇转，上身坐直不晃', u: '分钟' },
  ],
  swimming: [
    // ── 入门级 (diff:1) — 水性+蛙泳基础 ──
    { n: '水中行走热身', eq: ['泳池'], muscle: ['全身'], diff: 1, note: '浅水区沿池边慢走，双臂在水里前后摆，逐渐加快步子', u: '分钟', swimPhase: 'warmup' },
    { n: '水中呼吸练习', eq: ['泳池'], muscle: ['心肺'], diff: 1, note: '嘴吸气后脸入水，用鼻子慢慢吐泡泡，吐完抬头再吸', u: '分钟', swimPhase: 'tech' },
    { n: '扶边蛙泳腿练习', eq: ['泳池'], muscle: ['下肢', '心肺'], diff: 1, note: '双手扶池边俯卧漂浮，按收、翻、蹬、夹做蛙泳腿，翻脚是关键', u: '分钟', swimPhase: 'tech' },
    { n: '蹬壁滑行练习', eq: ['泳池'], muscle: ['核心', '全身'], diff: 1, note: '背对池壁蹬出，双臂夹头伸直、全身绷紧成一条线向前滑', u: '分钟', swimPhase: 'tech' },
    { n: '蛙泳手部划水练习', eq: ['泳池'], muscle: ['上肢', '心肺'], diff: 1, note: '浅水弯腰站立练划手：外划、抱水同时抬头吸气、双手前伸', u: '分钟', swimPhase: 'tech' },
    { n: '蛙泳完整配合', eq: ['泳池'], muscle: ['全身', '心肺'], diff: 1, note: '先划手抬头吸气，再收腿蹬夹，伸直滑行后进入下一次', u: '分钟', swimPhase: 'main' },
    { n: '水中漫步放松', eq: ['泳池'], muscle: ['全身'], diff: 1, note: '浅水区慢走或轻轻踢水，放慢呼吸让心率降下来', u: '分钟', swimPhase: 'cooldown' },
    // ── 进阶级 (diff:2) — 蛙泳巩固+耐力 ──
    { n: '蛙泳连续游', eq: ['泳池'], muscle: ['全身', '心肺'], diff: 2, note: '从蹬壁出发连续蛙泳，保持划手、蹬腿、滑行的稳定节奏', u: '分钟', swimPhase: 'main' },
    { n: '蛙泳间歇训练', eq: ['泳池'], muscle: ['心肺', '全身'], diff: 2, note: '游一个池长用稍快速度，到边扶池休息再出发，循环到计时结束', u: '分钟', swimPhase: 'main' },
    { n: '踩水练习', eq: ['泳池'], muscle: ['全身', '核心'], diff: 2, note: '身体直立扶池边，腿做蛙泳式蹬夹把身体托起，逐步放手', u: '分钟', swimPhase: 'tech' },
    { n: '蹬壁转身练习', eq: ['泳池'], muscle: ['核心', '全身'], diff: 2, note: '游到池边手先触壁，身体团紧转向，双脚踩壁蹬出继续游', u: '分钟', swimPhase: 'tech' },
    // ── 挑战级 (diff:3) — 自由泳入门 ──
    { n: '自由泳打腿练习', eq: ['泳池'], muscle: ['下肢', '核心'], diff: 3, note: '扶池边俯卧伸直，从大腿根发力上下交替打水，脚踝放松', u: '分钟', swimPhase: 'tech' },
    { n: '自由泳划臂+侧头呼吸', eq: ['泳池'], muscle: ['上肢', '心肺'], diff: 3, note: '浅水弯腰站立，两臂轮流划水，身体随划水转动带头侧转吸气', u: '分钟', swimPhase: 'tech' },
    { n: '自由泳完整配合', eq: ['泳池'], muscle: ['全身', '心肺'], diff: 3, note: '蹬壁滑行后交替划臂、连续打腿，身体转动带头侧转吸气', u: '分钟', swimPhase: 'main' },
    // ── 水中感官与阻力塑形 (Aquatic Sensory) ──
    { n: '池边悬浮分腿', eq: ['泳池'], muscle: ['核心', '内收肌'], diff: 2, note: '背靠池壁双臂撑住池沿，双腿浮起后慢慢向两侧打开再合拢', u: '秒', swimPhase: 'tech' },
    { n: '水中侧抬腿', eq: ['泳池'], muscle: ['臀中肌', '内收肌'], diff: 1, note: '侧身站、近池一侧手扶池边，外侧腿伸直向侧方慢抬再慢收', u: '秒', bi: true, swimPhase: 'tech' },
    { n: '水中后踢腿', eq: ['泳池'], muscle: ['臀大肌'], diff: 1, note: '面向池壁双手扶边，一腿伸直向正后方慢踢，骨盆保持朝前', u: '秒', bi: true, swimPhase: 'tech' },
    { n: '水中相扑深蹲', eq: ['泳池'], muscle: ['臀', '内收肌', '股四头'], diff: 1, note: '宽距站、脚尖外展，慢慢蹲到大腿接近平行，脚跟踩实站起', swimPhase: 'main' },
    { n: '水中摆腿开髋', eq: ['泳池'], muscle: ['髋屈肌', '臀中肌'], diff: 1, note: '侧身单手扶池边，外侧腿在水中前后大幅度摆动，躯干不晃', u: '秒', bi: true, swimPhase: 'tech' },
    { n: '泳池边坐姿开胯', eq: ['泳池'], muscle: ['内收肌', '下肢'], diff: 1, note: '坐在池边小腿垂入水中，大腿向两侧打开，从髋部前倾保持', u: '秒', swimPhase: 'tech' },
    { n: '水中骨盆画圆', eq: ['泳池'], muscle: ['核心', '骨盆底肌'], diff: 1, note: '站于腰深水中双腿与肩宽，缓慢画圆，活动腰椎和髋', u: '秒', swimPhase: 'tech' },
    { n: '水中弓步跳', eq: ['泳池'], muscle: ['下肢', '核心'], diff: 2, note: '弓步站好跳起，空中交换前后腿，落地成另一侧弓步并屈膝缓冲', swimPhase: 'main' },
    { n: '水中单腿平衡', eq: ['泳池'], muscle: ['下肢', '核心'], diff: 1, note: '单腿站稳，另一腿屈膝抬起，双臂在水中张开保持平衡', u: '秒', bi: true, swimPhase: 'tech' },
    { n: '水中弹力带外展', eq: ['泳池', '弹力带'], muscle: ['臀中肌', '内收肌'], diff: 2, note: '弹力带套双踝，侧身扶池边，外侧腿对抗带子和水向侧方打开', u: '秒', bi: true, swimPhase: 'tech' },
    { n: '蛙泳腿开合训练', eq: ['泳池'], muscle: ['内收肌', '臀', '下肢'], diff: 2, note: '俯卧扶池边或浮板，单练蛙泳腿，蹬出后用力夹腿并拢停顿', swimPhase: 'tech' },
  ],
  warmup: [
    { n: '开合跳热身', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['全身'], diff: 1, note: '跳开时双臂经体侧抬到约肩高，跳回时放下，前脚掌轻落地', u: '秒', warmupSec: 45 },
    { n: '肩关节环绕', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '双臂伸直以肩为轴慢慢画大圆，计时一半向前、一半向后', u: '秒', warmupSec: 60 },
    { n: '扩胸运动', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '双臂伸直前平举，保持肩高向两侧打开、向后振，再收回身前', u: '秒', warmupSec: 30 },
    { n: '徒手深蹲激活', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '双臂抬到肩高保持平衡，臀部向后坐下，膝盖对准脚尖，脚跟发力站起', u: '秒', warmupSec: 45 },
    { n: '弓步转体', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢', '核心'], diff: 1, note: '向前迈步成弓步，上身转向前腿一侧，转回后蹬地站起', u: '秒', bi: true, warmupSec: 45 },
    { n: '高抬腿走', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '挺胸收腹，一侧膝盖抬向胸口，双手抱膝向上提一下再放下', u: '秒', warmupSec: 45 },
    { n: '登山者', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['核心', '全身'], diff: 2, note: '高位平板撑，双手在肩正下方，左右膝交替快速提向胸口', u: '秒', warmupSec: 30 },
    { n: '颈部绕环', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '肩膀下沉，下巴带头部慢慢从一侧经胸前画到另一侧，不后仰', u: '秒', warmupSec: 30 },
    { n: '手臂前后大摆动', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '双臂放松，同步向前上方摆起、再向后摆到身后，幅度逐渐加大', u: '秒', warmupSec: 30 },
    { n: '猫牛热身', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢', '核心'], diff: 1, note: '四足跪姿，吸气塌腰抬头、呼气拱背低头，跟着呼吸连续交替', u: '秒', warmupSec: 45 },
    { n: '肘关节绕环', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '上臂贴住体侧，屈肘后小臂以肘为轴画圈，向内向外各做一半', u: '秒', warmupSec: 30 },
    { n: '俯身直臂画圆', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '一手扶椅背俯身，另一臂放松垂下，靠身体轻晃带手臂画圆', u: '秒', bi: true, warmupSec: 30 },
    { n: '臀部激活蚌式', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢', '臀'], diff: 1, note: '侧卧屈膝双脚并拢，骨盆不动，上侧膝盖向上打开再慢慢合上', u: '秒', bi: true, warmupSec: 45 },
    { n: '髋关节绕环', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢', '臀'], diff: 1, note: '单腿站稳，另一膝提起到髋高，由前向外向后画大圈', u: '秒', bi: true, warmupSec: 45 },
    { n: '侧向弓步', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '向侧面迈一大步，屈膝下沉，另一腿伸直，感受大腿内侧拉伸', u: '秒', bi: true, warmupSec: 45 },
    { n: '踝关节绕环', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '双手叉腰站稳，一脚脚尖点地，以脚踝为轴慢慢画圈', u: '秒', bi: true, warmupSec: 30 },
    { n: '原地跑热身', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['全身'], diff: 1, note: '原地小步慢跑，前脚掌轻落地，手臂屈肘前后摆，逐渐加快', u: '秒', warmupSec: 60 },
    { n: '波比跳热身', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['全身'], diff: 3, note: '下蹲撑地、双脚后跳成平板再收回，起身轻跳，慢速做完整', u: '秒', warmupSec: 30 },
  ],
  stretch: [
    { n: '深蹲底部左右摇摆（squat rock）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋外旋'], diff: 1, note: '宽距蹲到底，双手合十用手肘撑开膝盖，慢慢左右移重心', u: '秒' },
    { n: '抱膝排气式（apanasana）', eq: ['无器材'], muscle: ['臀', '盆底肌'], diff: 1, note: '仰卧双膝收向胸口，双手抱住小腿，下背和头放松贴地', u: '秒' },
    { n: '猫式伸展（cat stretch）', eq: ['无器材'], muscle: ['臀', '盆底肌'], diff: 2, note: '四足跪姿，吸气塌腰抬头、呼气拱背卷尾骨，从骨盆带动慢慢交替', u: '秒' },
    { n: '靠墙坐姿劈叉（wall straddle）', eq: ['无器材', '健身房全套'], muscle: ['内收肌', '髋外旋'], diff: 2, note: '仰卧臀贴墙，双腿沿墙向两侧滑开，靠腿的重量被动拉开大腿内侧', u: '秒', hold: 120 },
    { n: '快乐婴儿式（深压版）', eq: ['无器材', '健身房全套'], muscle: ['内收肌', '髋外旋', '盆底肌'], diff: 2, note: '仰卧臀下垫高，双手抓脚踝把膝盖往腋下方向带，盆底放松', u: '秒' },
    { n: '青蛙式（frog pose）', eq: ['无器材', '健身房全套'], muscle: ['内收肌', '髋屈肌'], diff: 1, note: '双膝向两侧宽跪、前臂撑地，臀部留在两膝连线上，腹股沟往下沉', u: '秒' },
    { n: '婴儿式背部拉伸', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['全身', '核心'], diff: 1, note: '跪坐回脚跟，上身前趴，双臂向前伸直，额头落地放松背部', u: '秒' },
    { n: '坐角式（upavistha konasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '内收肌'], diff: 2, note: '坐姿双腿向两侧大幅分开，先坐直再从髋部前倾，背保持平直', u: '秒' },
    { n: '幼犬式（puppy pose）', eq: ['无器材', '健身房全套'], muscle: ['全身', '脊柱'], diff: 1, note: '四足跪姿臀部保持高位，双手远端前滑让胸和下巴沉向地面，胸椎伸展深长呼吸', u: '秒' },
    { n: '宽膝婴儿式（balasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '内收肌'], diff: 1, note: '四足跪姿双膝拉宽，臀部缓慢向后坐向脚后跟，感受大腿内侧被拉长，往返或静力皆可', u: '秒' },
    { n: '睡鸽式（sleeping pigeon）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋外旋'], diff: 3, note: '鸽式前腿横放、后腿伸直，骨盆摆正后上身前趴，额头落地放松', u: '秒', bi: true },
    { n: '低位蜥蜴式（前臂落地）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋屈肌'], diff: 2, note: '弓步前腿外侧放双手，前臂逐步下沉贴地，后腿伸直蹬实，骨盆下沉找髋前侧深度拉伸', u: '秒', bi: true },
    { n: '穿针式（thread the needle）', eq: ['无器材', '健身房全套'], muscle: ['脊柱', '核心'], diff: 1, note: '四足跪姿，一臂从对侧腋下穿过，肩和侧脸落地，骨盆不动', u: '秒', bi: true },
    { n: '仰卧英雄式（supta virasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '股四头'], diff: 2, note: '跪坐在两脚之间，用手和手肘慢慢向后躺，膝盖贴地，膝痛就退', u: '秒' },
    { n: '斯芬克斯式（sphinx pose）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋屈肌'], diff: 1, note: '俯卧前臂撑起上身，手肘在肩下，耻骨压地，拉开髋前侧', u: '秒' },
    { n: '跪姿股四头肌拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢', '髋屈肌', '股四头'], diff: 1, note: '单膝跪地弓步，骨盆后倾前推，同侧手向后抓脚背拉向臀部', u: '秒', bi: true },
    { n: '高跪姿后弯（kneeling backbend）', eq: ['无器材', '健身房全套'], muscle: ['脊柱', '核心'], diff: 2, note: '高跪姿双手托骶骨，臀部收紧，吸气挺胸向后展开，呼气回正', u: '秒' },
    { n: '仰卧颈部后仰伸展', eq: ['无器材', '健身房全套'], muscle: ['下肢', '内收肌'], diff: 2, note: '仰卧双腿分开靠墙或悬空，下巴微抬使颈椎轻度伸展，幅度以无压迫感为限，颈椎不适立即回正', u: '秒' },
    { n: '胸部静态拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '小臂贴墙或门框、手肘与肩同高，身体慢慢向外转', u: '秒', bi: true },
    { n: '肩后侧拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '一臂伸直横过胸前，另一手扣住肘部拉向对侧肩', u: '秒', bi: true },
    { n: '三头肌拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['上肢'], diff: 1, note: '一臂上举屈肘，手伸向后背，另一手按住肘部往头后拉', u: '秒', bi: true },
    { n: '股四头肌拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '单腿站立扶墙或椅背，同侧手抓脚踝，脚跟拉向臀部', u: '秒', bi: true },
    { n: '腘绳肌/体前屈', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '站姿双腿伸直不锁膝，从髋部折叠前屈，头颈放松下垂', u: '秒' },
    { n: '臀大肌拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '仰卧一脚踝架在另一腿膝上，双手抱住支撑腿拉向胸口', u: '秒', bi: true },
    { n: '髂胫束拉伸', eq: ['无器材', '弹力带', '哑铃', '壶铃', '健身房全套'], muscle: ['下肢'], diff: 1, note: '要拉的腿交叉到另一腿后面，同侧手臂上举，上身向对侧侧弯', u: '秒', bi: true },
    { n: '眼镜蛇式', eq: ['无器材', '弹力带', '哑铃', '健身房全套'], muscle: ['核心'], diff: 1, note: '俯卧双手撑在肩下推起上身，骨盆贴地，肩膀下沉', u: '秒' },
    { n: '鸽子式开髋', eq: ['无器材', '健身房全套'], muscle: ['下肢', '臀', '髋屈肌'], diff: 1, note: '前腿屈膝横放身前，后腿向后伸直，骨盆摆正下沉，可前趴加深', u: '秒', hold: 45, bi: true },
    { n: '90/90髋旋转', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '坐姿前后腿各屈成直角，上身立直朝前腿前倾，换边时双膝倒向另一侧', u: '秒', bi: true },
    { n: '青蛙式开胯', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '四足跪姿双膝向两侧打开，臀部缓慢前后移动，开胯拉内收肌，循序渐进', u: '秒' },
    { n: '小狗伸展式 (融心式)', eq: ['无器材', '健身房全套'], muscle: ['上肢', '核心'], diff: 1, note: '四足跪姿臀部留在膝盖上方，双手前伸，胸口沉向地面', u: '秒' },
    { n: '蝴蝶式', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '坐姿脚掌相对、双手握脚，先坐直，再从髋部前倾', u: '秒', hold: 45 },
    { n: '仰卧4字臀拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '仰卧一脚踝搭在对侧膝上，双手抱大腿后侧拉向胸口，拉臀部', u: '秒', bi: true },
    { n: '猫牛式', eq: ['无器材', '健身房全套'], muscle: ['核心', '全身'], diff: 1, note: '四足跪姿，吸气塌腰抬头、呼气拱背低头，随呼吸一节节活动脊柱', u: '秒' },
    { n: '胸椎旋转', eq: ['无器材', '健身房全套'], muscle: ['上肢', '核心'], diff: 1, note: '四足跪姿一手扶头后，手肘先向下穿再向上打开，转上背不转腰', u: '秒', bi: true },
    { n: '盆底放松呼吸', eq: ['无器材', '健身房全套'], muscle: ['核心'], diff: 1, note: '仰卧屈膝慢慢腹式呼吸，吸气时让盆底放松下沉，呼气自然回弹', u: '秒', hold: 90 },
    { n: '深蹲保持', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '全蹲到底、脚跟踩实，胸口打开，髋和脚踝放松静态保持', u: '秒' },
    { n: '门框开胸拉伸', eq: ['无器材', '健身房全套'], muscle: ['上肢'], diff: 1, note: '前臂贴门框、肘略高于肩，同侧脚前跨半步，身体前移拉开胸前', u: '秒', hold: 45, bi: true },
    { n: '胸椎伸展', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '坐在椅上双手抱头，以椅背上沿为支点向后伸展上背，腰不反弓', u: '秒' },
    { n: '颈侧拉伸', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '站直下巴微收，一手叉腰，另一手越过头顶轻搭，头向搭手一侧倒', u: '秒', bi: true },
    { n: '脚踝绕环', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '站立叉腰，一脚脚尖点地，用脚踝带动脚跟慢慢画大圈', u: '秒', bi: true },
    { n: '腓肠肌拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '面墙扶墙，后腿伸直、脚跟踩地，身体前压拉小腿上部', u: '秒', hold: 45, bi: true },
    { n: '比目鱼肌拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '面墙扶墙，后脚跟踩地、后膝微弯，身体下沉拉小腿深层', u: '秒', hold: 45, bi: true },
    { n: '跪姿踝背屈', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '半跪姿前脚踩地，膝盖向前越过脚尖，前脚跟始终不离地', u: '秒', bi: true },
    { n: '沙发式髋屈肌拉伸', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 2, note: '背对墙跪地，后腿小腿竖贴墙面，前脚踩地成弓步，收臀骨盆后倾', u: '秒', hold: 45, bi: true },
    { n: '颈深屈肌保持（chin tuck hold）', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '跪/坐直、下巴轻轻内收，颈深屈肌等长保持耐久，强化头颈姿态、改善前伸颈', u: '秒' },
    { n: '跪姿手腕拉伸（wrist stretch）', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '四足跪姿双掌贴地，身体缓慢前后移，把体重逐渐压到手腕上', u: '秒' },
    { n: '肩胛后缩保持', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['上肢'], diff: 1, note: '肩胛骨向脊柱中线收拢并下沉、胸口微挺保持，强化上背与肩胛位置、改善圆肩', u: '秒' },
    { n: '收下巴', eq: ['无器材', '健身房全套'], muscle: ['全身'], diff: 1, note: '下巴轻轻内收使颈椎中立、后脑勺微向后上，练颈深屈肌', u: '秒' },
    { n: '仰卧大V字开合', eq: ['无器材', '弹力带', '健身房全套'], muscle: ['下肢'], diff: 2, note: '仰卧双腿伸直朝天花板，向两侧慢慢打开成V字，借腿的重量保持', u: '秒' },
    { n: '仰卧牛面式（gomukhasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 2, note: '仰卧双腿在空中紧紧交叉打结，双手抓脚背下压，极度拉扯臀外侧', u: '秒' },
    { n: '仰卧快乐婴儿式', eq: ['无器材', '健身房全套'], muscle: ['下肢', '核心'], diff: 1, note: '仰卧屈膝，双手从膝内侧抓住脚掌外缘，膝向腋下打开，脚掌朝上', u: '秒' },
    { n: '犁式（halasana）', eq: ['无器材', '健身房全套'], muscle: ['核心', '下肢'], diff: 2, note: '仰卧双臂压地，双腿并拢翻过头顶，脚尖落向头后地面', u: '秒' },
    { n: '仰卧束角式', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '仰卧脚心相对，膝盖向两侧自然落下，双手放松在小腹或体侧', u: '秒' },
    { n: '下犬到上犬流动', eq: ['无器材', '健身房全套'], muscle: ['全身', '核心'], diff: 1, note: '下犬与上犬之间来回过渡，髋先下沉、胸再前推，手臂始终伸直', u: '秒' },
    { n: '四足跪姿躯干绕环', eq: ['无器材', '健身房全套'], muscle: ['全身', '核心'], diff: 1, note: '四足跪姿，胸腔和骨盆一起慢慢画大圈，计时一半时换方向', u: '秒' },
    { n: '下犬式', eq: ['无器材', '健身房全套'], muscle: ['全身', '下肢'], diff: 1, note: '手脚撑地，臀部向上向后顶成倒V，背拉长，脚跟向地面踩', u: '秒' },
    { n: '跪姿后倒（股四拉伸）', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 2, note: '高跪姿，头到膝保持一条直线，整个身体慢慢向后倾，髋不弯', u: '秒' },
    { n: '靠墙倒箭式（分腿版）', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '仰卧臀部贴墙，双腿沿墙竖直向上，再顺着墙面向两侧打开', u: '秒' },
    { n: '靠墙站立前屈（wall forward fold）', eq: ['无器材', '健身房全套'], muscle: ['下肢'], diff: 1, note: '臀部靠墙站立，双脚前移，从髋部向前折叠，上身垂向双腿', u: '秒' },
    { n: '挺尸式（savasana）', eq: ['无器材'], muscle: ['全身'], diff: 1, note: '仰卧全身摊开，手心向上闭眼，从脚到头逐处放松', u: '秒', hold: 90 },
    { n: '卧束角式（supta baddha konasana）', eq: ['无器材'], muscle: ['下肢'], diff: 1, note: '仰卧脚心相对，双膝自然向两侧落下，双手放松在小腹或体侧', u: '秒', hold: 120 },
    { n: '婴儿式（balasana）', eq: ['无器材'], muscle: ['全身'], diff: 1, note: '跪坐向脚跟，上身前俯贴大腿，双臂向前伸直，额头点地', u: '秒' },
    { n: '蜥蜴式（lizard）', eq: ['无器材', '健身房全套'], muscle: ['髋屈肌', '内收肌', '下肢'], diff: 2, note: '低弓步前脚放到同侧手外侧，后膝落地，骨盆向前向下沉', u: '秒', hold: 45, bi: true },
    { n: '鸽式（eka pada kapotasana）', eq: ['无器材', '健身房全套'], muscle: ['髋屈肌', '臀', '下肢'], diff: 3, note: '前腿屈膝横放体前，后腿向后伸直，骨盆摆正，双手撑地立直上身', u: '秒', bi: true },
    { n: '弓式（dhanurasana）', eq: ['无器材', '健身房全套'], muscle: ['脊柱', '臀', '胸大肌'], diff: 3, note: '俯卧屈膝双手抓脚踝，小腿向后蹬，把胸口和大腿一起抬离地面', u: '秒' },
    { n: '轮式（urdhva dhanurasana）', eq: ['无器材', '健身房全套'], muscle: ['脊柱', '臀', '上肢', '胸大肌'], diff: 3, note: '仰卧屈膝踩地，双手翻掌撑在耳旁，推地把髋和胸抬起成拱', u: '秒' },
    { n: '花环式（malasana）', eq: ['无器材', '健身房全套'], muscle: ['下肢', '内收肌', '核心'], diff: 1, note: '宽脚全蹲到底，双手胸前合十，手肘抵膝内侧向外撑，背立直', u: '秒' },
    { n: '猴神式（hanumanasana）', eq: ['无器材', '健身房全套'], muscle: ['髋屈肌', '腘绳', '下肢'], diff: 3, note: '前腿向前、后腿向后伸直滑开成前后劈叉，骨盆朝正前方', u: '秒', bi: true },
  ],
  // 仪态日课 2026-11-05 已停:这几个动作已下架(RETIRED_MOVES),条目留着给历史记录查说明。
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
      高级: '臀推突破，美背日加量'
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
  '翘臀美背': '臀推是提臀峰第一动作，顶端挤压1-2秒。你可以也应该练背，背阔分离感和肩胛下沉能让背显挺、视觉收腰。斜方"厚"多半是圆肩体态：停掉直立划船和耸肩，多做面拉、YTW、靠墙天使，把肩膀沉下去。',
  '女性曲线': '极致沙漏：臀中肌外展每次必练不能跳（胯宽靠它）；臀推/硬拉渐进冲圆臀；股四+腘绳+内收都堆围度让大腿丰满柔顺。腰只做平板类，绝不做负重侧屈/转体（会把腰练方）。上肢几乎不动以免变宽。蛋白1.6-2g/kg+轻微热量盈余才能喂大臀腿；腰围靠控总量+有氧，不靠饿。'
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
// 经期:只有 S.periodMode 一个开关,她自己开、自己关。不记起止日、不算第几天、不推算周期、不预测。
const SWIM_TIPS = {
  '入门': '蛙泳腿口诀：收翻蹬夹。每次蹬腿后享受2-3秒滑行，不要急着做下一个动作。扶池边是你最好的练习伙伴。',
  '进阶': '好的蛙泳70%时间在滑行。关注节奏而非速度，累了就加长滑行而不是加快频率。',
  '挑战': '自由泳呼吸的秘诀：不是转头，而是转动整个身体。先用蛙泳热身，再切换到自由泳练习。'
};
// 方案要点(计划页顶部;没开通 AI 的今天页底部):按现在的目标 / 计划实时取,不用排计划那一刻冻结的 S.plan.tip(改了目标不重排也跟着变)。
// AI 排的计划另附它的排法理由(S.plan.tip 以「AI 教练：」开头的那段)
function planTipText() {
  let t = TIPS[currentGoalKey()] || TIPS['女性薄肌'];
  const wk = ((S.plan && S.plan.days) || []).slice(0, 7);
  const swim = wk.filter(d => d.isSwimDay).length, gym = wk.filter(d => !d.isRest && !d.isSwimDay).length;
  if (swim > 0) t += `\n游泳水平：${SWIM_TIPS[S.swimLevel || '入门']}\n本周安排：${gym}天力量 + ${swim}天游泳`;
  const ai = S.plan && typeof S.plan.tip === 'string' && S.plan.tip.startsWith('AI 教练：') ? S.plan.tip : '';
  return ai ? t + '\n' + ai : t;
}
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
      const _stretchDay = (split.groups || []).includes('stretch');
      const pPool = Object.entries(DB).flatMap(([g, exs]) =>
        (g === 'swimming' || g === 'warmup' || (g === 'stretch' && !_stretchDay)) ? [] : exs.filter(ex => _ps.has(ex.n) && ex.eq.some(e => e === '无器材' || S.equip.includes(e)) &&
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
      result.push({ name: n.name, sets: n.sets, reps: n.reps, unit: n.unit, note: n.note, group: 'stretch', diff: 1, isStretch: n.unit !== '次', bi: false, muscle: ['肩颈'] });
    });
  }

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
  { key: 'waist', name: '细腰', why: '只练核心稳定,腰围主要看总热量和有氧', metric: 'waist', dir: 'down', weekly: 6,
    moves: ['平板支撑', '侧平板支撑', '死虫式', '死虫式保持（dead bug hold）',
            '死虫式（慢速对角）', '卷腹', '坐姿卷腹机',
            '仰卧直腿下放（leg lowering）', '悬挂抬腿', '罗马椅抬腿', '侧平板髋部下沉（side plank hip dip）'] },
  { key: 'ankle', name: '脚踝小腿', why: '踮立与提踵——高跟站得住,脚背绷出线条', metric: 'ankle', dir: null, weekly: 4,
    moves: ['站姿提踵', '坐姿提踵', '史密斯提踵', '腿举机提踵', '单腿relevé踮立', '双腿relevé踮立保持'] },
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
  const _stretchDay = (split.groups || []).includes('stretch');
  Object.entries(DB).forEach(([g, exs]) => {
    if (g === 'swimming' || g === 'warmup' || (g === 'stretch' && !_stretchDay)) return;   // 趴着呼吸、水中动作不占力量日
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
  // 已配对、开着「排计划时跟搭子对齐」:今天及以后新排的日子按搭子现有的计划挪训练日(app.js partnerAlignForGen;
  // 每周练几次不变,只换放在哪天)。没配对 / 关了 → null,下面照原排法,结果和以前一字不差
  const _align = typeof partnerAlignForGen === 'function' ? partnerAlignForGen(startDate, preserve, pattern, gymPerWeek) : null;

  for (let i = 0; i < 14; i++) {
    const ds = addDays(startDate, i);
    if (preserve[ds]) {
      days.push(preserve[ds]);
      continue;
    }

    const dObj = new Date(ds + 'T12:00:00');
    const dow = (dObj.getDay() + 6) % 7; // 0=Mon, 6=Sun
    const dayType = _align && _align.t[ds] !== undefined ? _align.t[ds] : pattern[dow]; // 0=rest, 1=gym, 2=swim

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
  showToast('已按新设置重排后面的计划' + (typeof planAlignSuffix === 'function' ? planAlignSuffix() : ''));
}
window.applyStaleSettings = applyStaleSettings;

function recalibratePlan() {
  if (!S.plan) return;
  genPlan(true);
  showToast('已保留历史记录，重排本周剩余天数' + (typeof planAlignSuffix === 'function' ? planAlignSuffix() : ''));
}

function autoAlignPlan() {
  if (!S.plan || !S.plan.days || !S.plan.days.length) return;
  // 2026-11-10 Cici:漏练后不自动顺延、也不弹「去重排」提示 —— 停练后怎么恢复由教练(AI)安排(buildCoachContext 带 missed)。
  // 这里只把以前自动顺延过的最近几批撤回(autoShiftRun → _shRetireAll),下面的旧对齐提示不再跑
  autoShiftRun(); return;
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

// ══ 没练自动顺延(2026-10-29) ════════════════════════════
// Cait:「如果一天没有练(健身房11pm肯定关了)，能不能直接自动重排后面的？你拿捏程度」。
// 只「挪」不重排:整天的内容原样搬(动作、手改的组数次数 / 重量 / RPE 跟着日期键一起搬),不重挑动作,不切页、不动选中的日子。
//   · 没练 = 训练日(非休息、非私密、非标记日)整天没有任何痕迹(打卡记录 / 勾过动作 / 运动风格记过组或开练时间),
//     且日期已过,或者是今天且已过 23:00。只看最近 7 天;撤销过的(_noShift)、手动解锁过的不管。
//   · 挪:没练的那次挪到下一天,下一天也是训练日就把它的再往后挪,直到碰到休息日吸收。私密日 / 已经练过的天 /
//     已经过去的休息日是固定桩,跳过。吸收日要在 7 天内(从今天算)。连续几天没练按日期一天一天处理。
//   · 不练伤:挪完的连续训练天数最多比原计划最长的那段多 1 天(SHIFT_RUN_SLACK),且封顶 6 天(每 7 天至少 1 个休息日);
//     相邻两天都是下肢日的对数不许比原来多。多给 1 天的理由(2026-10-29 主会话拍板):Cait「你拿捏程度」,她们要的是课别丢;
//     照字面「不许比原计划长」,3 天计划(一 / 三 / 五)周一、周三没练都挪不动只能少练,挪成连练两天可以接受,下肢相邻照样挡。
//     违反、或 7 天内没有休息日 → 丢掉链条末尾那一次(先后顺序不跳);还不行就只标记、什么都不挪。宁可少练,不过量。
//   · 被挪走的那天 = 标记日:isRest + isMissed(不算训练日,也不算休息日的成就),missedOrig 记原计划,
//     missedTo 记那次训练最后落到哪天(null = 这周少练)。打卡记录 / 热图都按 LOG 算,不受影响。
//   · 每批改动留快照(S.plan.shifts,只存受影响的日子),今天页顶上一条提示可撤销;撤销后那几天记 _noShift,不再顺延。
//     顺延掉的那天后来有了打卡记录、挪过去的天都还没动 → 自动撤回。
//   · 确定性:同样的计划 + 打卡算出同样的结果(不用随机数,id 用日期);搭子同一天都没去,两边各自顺延后照样对齐。只改自己的计划。
//   · 有搭子(已配对、读得到对方计划、开着「排计划时跟搭子对齐」):挪法在过得了身体规则的里挑和对方同一天同类最多的;
//     对方顺延了、我那天练了 → 按「对齐搭子的训练日」自动跟一次(见下面「跟着搭子顺延」)。
const SHIFT_BACK = 7, SHIFT_REACH = 7, SHIFT_HOUR = 23, SHIFT_MAX_RUN = 6;
const SHIFT_RUN_SLACK = 1;   // 允许比原计划多连练几天(见上:3 天计划挪成连练两天可以接受);封顶仍是 SHIFT_MAX_RUN
const SHIFT_LOWER = ['quads', 'glutemed', 'hamglutes', 'calves'];
function autoShiftOn() { return false; }   // 2026-11-10 起停用(Cici:顺延不符合停练后恢复的逻辑,由教练安排);S.autoShift 旧值保留不读
function _shLate() { return new Date().getHours() >= SHIFT_HOUR; }
// 那天练过没有:打卡记录 / 勾过任何动作 / 运动风格记过组数或开练时间(本机)
function _shAct(date) {
  if (LOG.some(l => l.date === date)) return true;
  if (Object.values(S.prog[date] || {}).some(Boolean)) return true;
  const w = _wkDays()[date];
  return !!(w && (w.t0 || Object.values(w.s || {}).some(n => n > 0)));
}
function _shTrain(d) { return !!d && !d.isRest; }   // 连练口径:私密日 / 游泳 / 轻量替代都算练;休息日和标记日不算
function _shLower(d) {                              // 臀腿 / 下肢日:主项里下肢动作至少 2 个、占一半以上
  if (!d || d.isRest || d.isSwimDay || d.isPrivateDay) return false;
  const m = (d.exercises || []).filter(e => !e.isWarmup && !e.isStretch);
  const n = m.filter(e => SHIFT_LOWER.includes(e.group)).length;
  return n >= 2 && n * 2 >= m.length;
}
function _shMissable(d, c) {
  if (!d || d.isRest || d.isPrivateDay || d.isMissed || d._noShift || !(d.exercises || []).length) return false;
  if (d.date < c.today) { if (d.date < addDays(c.today, -SHIFT_BACK)) return false; }
  else if (!(d.date === c.today && c.late)) return false;
  if ((S.unlockedDates || []).includes(d.date)) return false;   // 手动解锁了 = 打算补打卡
  return !c.act(d.date);
}
function _shContent(d) { const o = {}; for (const k in d) if (k !== 'date' && k !== '_noShift') o[k] = d[k]; return o; }
function _shMarker(d) { return { date: d.date, isRest: true, isMissed: true, workoutType: '没练（已顺延）', duration: 0, exercises: [], missedOrig: { type: d.workoutType || '', n: (d.exercises || []).length, ...(d.isSwimDay ? { swim: true } : {}) }, missedTo: null }; }
function _shRun(days, a, b) { let best = 0, run = 0; days.forEach(d => { if (d.date < a || d.date > b) return; run = _shTrain(d) ? run + 1 : 0; if (run > best) best = run; }); return best; }
function _shPairs(days, a, b) { let n = 0; for (let i = 1; i < days.length; i++) if (days[i - 1].date >= a && days[i].date <= b && _shLower(days[i - 1]) && _shLower(days[i])) n++; return n; }
// 挪完不能比挪之前更累:最长连练 ≤ max(原计划上限, 这一段本来就有的),相邻下肢日不增加
function _shOk(pre, post, a, b, cap) { return _shRun(post, a, b) <= Math.max(cap, _shRun(pre, a, b)) && _shPairs(post, a, b) <= _shPairs(pre, a, b); }
// 一步:days[mi] 没练 → 全部候选挪法。窗口 = 之后 7 天内不是固定桩的日子(同样没练的过去训练日 / 以后的训练日和休息日)。
//   full(k):从没练那天到窗口第 k 格(必须是休息日)整段往后挪一格,第 k 格的休息日把最后那格吸收掉;
//            k = 第一个休息日就是最初的「挪到下一天、下一天也练就再往后、碰到休息日为止」
//   tail:挪到第一个休息日之前、丢掉链尾那次 / mark:只标记(丢掉没练的那次本身)
function _shCands(days, mi, c) {
  const M = days[mi], gone = d => d.date < c.today || (d.date === c.today && c.late);
  const limit = addDays(c.late ? c.today : addDays(c.today, -1), SHIFT_REACH);
  const W = [];
  for (let j = mi + 1; j < days.length && days[j].date <= limit; j++) {
    const X = days[j];
    if (X.isPrivateDay || X.isMissed) continue;                  // 私密日 / 标记日:固定桩
    if (gone(X)) { if (_shMissable(X, c)) W.push(j); continue; }  // 过去的天:同样没练的跟着挪(下一步再处理它),别的不动
    if (c.act(X.date)) continue;                                   // 已经开练 / 打过卡:不动
    W.push(j);
  }
  const mk = (src, tgt, n, kind, k) => {
    const out = days.slice(), moves = [];
    out[mi] = _shMarker(M);
    for (let i = 0; i < n; i++) { out[tgt[i]] = { ..._shContent(days[src[i]]), date: days[tgt[i]].date }; moves.push([days[src[i]].date, days[tgt[i]].date]); }
    const di = n < src.length ? src[n] : null;   // 丢掉的那次在哪天(mark = 没练的那天本身)
    return { kind, k, days: out, moves, drop: di != null ? days[di].date : null, dropType: di != null ? (days[di].workoutType || '') : null, last: moves.length ? moves[moves.length - 1][1] : M.date };
  };
  const out = [];
  W.forEach((j, k) => { if (days[j].isRest) out.push(mk([mi, ...W.slice(0, k)], W.slice(0, k + 1), k + 1, 'full', k)); });
  const k0 = W.findIndex(j => days[j].isRest), chain = k0 < 0 ? W : W.slice(0, k0);
  out.push(mk([mi, ...chain], chain, chain.length, chain.length ? 'tail' : 'mark'));
  if (chain.length) out.push(mk([mi], [], 0, 'mark'));
  return out;
}
// 和搭子对齐(只在已配对、读得到对方计划、开着「排计划时跟搭子对齐」时;规则和 app.js partnerAlignSolve 同一套口径:
// 同一天同类 = 力量对健身房日、游泳对游泳日,没泳池 / 经期模式不算游泳)
function _shAlignOn() { try { return typeof partnerAlignOn === 'function' && partnerAlignOn() && !!_ppTrain(); } catch (e) { return false; } }
function _shAligned(d) {
  const mk = myDayKind(d), pk = partnerKindOn(d.date), swim = S.equip.includes('泳池') && !S.periodMode;
  return (mk === 'g' && pk === 'g') || (swim && mk === 's' && pk === 's');
}
function _shAlignMiss(d) {   // 这天两边有一方要练、却没对上
  const mk = myDayKind(d), pk = partnerKindOn(d.date), swim = S.equip.includes('泳池') && !S.periodMode;
  return (mk === 'g' || mk === 's' || pk === 'g' || (swim && pk === 's')) && !_shAligned(d);
}
function _shSig(d) { return d ? JSON.stringify([!!d.isRest, !!d.isMissed, !!d.isSwimDay, d.workoutType || '', (d.exercises || []).map(e => e.name)]) : ''; }
// 某天的快照 / 指纹(计划那天 + 按日期存的勾选、重量、组次调整、RPE、泳池选择)
function _shPick(o, dt) { const p = dt + '-', r = {}; Object.keys(o || {}).forEach(k => { if (k.startsWith(p)) r[k.slice(p.length)] = o[k]; }); return r; }
function _shState(dt) { return { p: S.prog[dt] ? { ...S.prog[dt] } : null, w: _shPick(S.weights, dt), a: _shPick(S.adj, dt), r: _shPick(S.exRpe, dt), pl: S.poolLounger && dt in S.poolLounger ? S.poolLounger[dt] : null }; }
function _shClear(dt) {
  delete S.prog[dt];
  ['weights', 'adj', 'exRpe'].forEach(k => { if (S[k]) Object.keys(S[k]).forEach(x => { if (x.startsWith(dt + '-')) delete S[k][x]; }); });
  if (S.poolLounger) delete S.poolLounger[dt];
}
function _shPut(dt, st) {
  _shClear(dt); if (!st) return;
  if (st.p) S.prog[dt] = st.p;
  [['weights', 'w'], ['adj', 'a'], ['exRpe', 'r']].forEach(([k, sk]) => Object.entries(st[sk] || {}).forEach(([x, v]) => { S[k] = S[k] || {}; S[k][dt + '-' + x] = v; }));
  if (st.pl != null) { S.poolLounger = S.poolLounger || {}; S.poolLounger[dt] = st.pl; }
}
function _shFp(dt) {
  const d = (S.plan && S.plan.days || []).find(x => x.date === dt);
  const c = d ? { ...d } : null; if (c) delete c._noShift;
  return JSON.stringify([c, _shState(dt)]);
}
function _shTop() { const L = (S.plan && S.plan.shifts) || []; for (let i = L.length - 1; i >= 0; i--) if (L[i].state === 'on') return L[i]; return null; }
// 登录了就等云端快照:这次登录 / 最近一次切回前台之后,收到并应用过一份自己文档的云端快照才算(app.js cloudFresh;
// 因为本机有没推上去的改动而跳过的不算)。否则拿本机旧数据顺延、再推上云,会盖掉别的设备刚打的卡。
// 最多等 30 秒(按时钟算,手机后台把计时器拖慢也不会多等),等不到这次就不跑;之后快照到了(app.js _onOwnSnap)再按新数据判断
const SHIFT_WAIT_MS = 30000;
function _shReady() { try { return typeof cloudFresh === 'function' ? cloudFresh() : (!_user || !!_cloudFirstSnap); } catch (e) { return true; } }
let _shWaitT = null, _shWaitUntil = 0;
function _shWait() {
  if (_shWaitT) return;
  if (!_shWaitUntil) _shWaitUntil = Date.now() + SHIFT_WAIT_MS;
  if (Date.now() > _shWaitUntil) return;
  _shWaitT = setTimeout(() => { _shWaitT = null; autoShiftCheck(); }, 2000);
}
function _shNewEpoch() { clearTimeout(_shWaitT); _shWaitT = null; _shWaitUntil = 0; }   // app.js cloudNewEpoch 调:重新开始等
function autoShiftCheck() { if (S.plan && S.plan.days && S.plan.days.length) autoShiftRun(); }

// 自己没练就顺延(开关「没练自动顺延」),然后看搭子有没有新顺延要跟(开关「排计划时跟搭子对齐」)。先自己、后跟随:两人同一天都没练时各自顺延就对齐了
function autoShiftRun() {
  if (!S.plan || !S.plan.days || !S.plan.days.length) return false;
  if (!_shReady()) { _shWait(); return false; }
  _shWaitUntil = 0;
  return _shRetireAll();
}
// 停用顺延时把还生效的顺延 / 跟随批次撤回(最近 7 天内、挪过去的天还没开练、之后没再改过计划才撤;从新到旧,
// 和手动「撤销」同一套 _shRestore)。撤不了的留着当历史。每批只试一次(state 改成 retired / kept)
function _shRetireAll() {
  if (!S.plan) return false;
  const from = addDays(todayStr(), -7);
  let changed = false;
  const walk = (L, isFollow) => {
    for (let i = (L || []).length - 1; i >= 0; i--) {
      const b = L[i]; if (!b || b.state !== 'on') continue;
      if (b.at < from || !b.snap) { b.state = 'kept'; b.seen = true; changed = true; continue; }
      const why = _shRestore(b, false);
      b.state = why ? 'kept' : 'retired'; b.seen = true; changed = true;
    }
  };
  walk(S.plan.follows, true);
  walk(S.plan.shifts, false);
  if (changed) _shAfter();
  return changed;
}
function _shSelfRun() {
  const today = todayStr(), c = { today, late: _shLate(), act: _shAct };
  const reverted = _shRevertIfLogged(today);
  let days = S.plan.days.slice().sort((a, b) => a.date.localeCompare(b.date));
  const first = days.findIndex(d => _shMissable(d, c));
  if (first < 0) { if (reverted) _shAfter(); return reverted; }
  const cap = Math.min(_shRun(days, '', '9999') + SHIFT_RUN_SLACK, SHIFT_MAX_RUN);   // 每 7 天至少 1 个休息日
  const snapDates = days.slice(first).map(d => d.date);
  const snap = { days: {}, st: {} };
  snapDates.forEach(dt => { snap.days[dt] = JSON.parse(JSON.stringify(days.find(d => d.date === dt))); snap.st[dt] = _shState(dt); });
  const where = {}; snapDates.forEach(dt => { where[dt] = dt; });   // 每天原来那次训练现在落在哪天
  const align = _shAlignOn();
  const steps = [], touched = new Set();
  for (let i = first; i < days.length; i++) {
    if (!_shMissable(days[i], c)) continue;
    const a = addDays(days[i].date, -SHIFT_REACH);
    // 挑挪法:先不丢课(过得了身体规则的 full 里挑);都过不了才丢一次(链尾优先,其次只标记)。
    // 同一档里:和搭子同一天同类的天数多的优先 → 改动的天数少的优先 → 吸收的休息日靠前的优先。没有随机,同样输入同样结果
    const cands = _shCands(days, i, c).filter(x => x.kind === 'mark' || _shOk(days, x.days, a, addDays(x.last, SHIFT_REACH), cap));
    const win = new Set(cands.flatMap(x => x.moves.flat()).concat(days[i].date));
    const sc = x => align ? x.days.filter(d => win.has(d.date) && _shAligned(d)).length : 0;
    const ch = x => x.days.filter((d, n) => win.has(d.date) && _shSig(d) !== _shSig(days[n])).length;
    const rank = x => [x.kind === 'full' ? 0 : 1, -sc(x), x.kind === 'full' ? ch(x) : 0, x.kind === 'full' ? x.k : x.kind === 'tail' ? 0 : 1];
    const pick = cands.map(x => [rank(x), x]).sort((p, q) => { for (let n = 0; n < 4; n++) if (p[0][n] !== q[0][n]) return p[0][n] - q[0][n]; return 0; })[0][1];
    // 按日期存的状态跟着内容搬(源都没练过,只有手改的组数次数 / 重量这些);丢掉的那次清掉(快照里留着)
    const bag = {};
    pick.moves.forEach(([f]) => { bag[f] = _shState(f); });
    if (pick.drop) _shClear(pick.drop);
    pick.moves.forEach(([f]) => _shClear(f));
    pick.moves.forEach(([f, t]) => _shPut(t, bag[f]));
    const inv = {}; pick.moves.forEach(([f, t]) => { inv[f] = t; });
    Object.keys(where).forEach(o => { const cur = where[o]; if (cur == null) return; if (cur in inv) where[o] = inv[cur]; else if (cur === pick.drop) where[o] = null; });
    touched.add(days[i].date); pick.moves.forEach(([f, t]) => { touched.add(f); touched.add(t); });
    steps.push({ date: days[i].date, dropType: pick.dropType });
    days = pick.days;
  }
  // 标记日:原计划按这一批之前的样子记,missedTo = 那次训练最后落到哪天
  steps.forEach(st => {
    const d = days.find(x => x.date === st.date), o = snap.days[st.date];
    if (o) d.missedOrig = { type: o.workoutType || '', n: (o.exercises || []).length, ...(o.isSwimDay ? { swim: true } : {}) };
    d.missedTo = where[st.date] || null;
  });
  S.plan.days = days;
  const b = { id: 'sh-' + today + '-' + steps[0].date, at: today, missed: steps.map(s => s.date), shifted: steps.filter(s => where[s.date]).length, dropped: steps.filter(s => s.dropType != null).map(s => s.dropType), state: 'on', snap: { days: {}, st: {} }, post: {} };
  touched.forEach(dt => { b.snap.days[dt] = snap.days[dt]; b.snap.st[dt] = snap.st[dt]; b.post[dt] = _shFp(dt); });
  if (align) b.align = { nm: _ppName(), off: days.filter(d => touched.has(d.date) && d.date >= today && _shAlignMiss(d)).length };
  S.plan.shifts = (S.plan.shifts || []).concat(b).slice(-6);
  _shAfter();
  return true;
}
function _shAfter() { saveState(); render(); if (typeof renderStats === 'function') try { renderStats(); } catch (e) { } }
// 撤销 / 撤回:挪过去的天已经开练、或者顺延后计划又改过 → 不动,返回原因。
// logged = 顺延掉的那天后来有了打卡 / 勾选(另一台设备补的,_shRevertIfLogged):那天自己的状态本来就变了,指纹只比计划那天;
// 写回时那天的状态以现在的为准(另一台设备的勾选 / 重量),快照里有、现在没有的补上
const _shFpDay = fp => { try { return JSON.stringify(JSON.parse(fp)[0]); } catch (e) { return fp; } };
function _shMerge(a, c) { a = a || {}; return { p: a.p || c.p ? { ...(a.p || {}), ...(c.p || {}) } : null, w: { ...a.w, ...c.w }, a: { ...a.a, ...c.a }, r: { ...a.r, ...c.r }, pl: c.pl != null ? c.pl : (a.pl ?? null) }; }
function _shRestore(b, noShift, logged) {
  if (!b || !b.snap) return '这次顺延已经没法撤销了';
  const dates = Object.keys(b.snap.days), idx = dt => S.plan.days.findIndex(d => d.date === dt);
  if (dates.some(dt => idx(dt) < 0)) return '计划已经换过，没法撤销';
  if (dates.some(dt => !b.missed.includes(dt) && _shAct(dt))) return '挪过去的训练已经开练了，没法撤销';
  const own = dt => logged && b.missed.includes(dt);
  if (Object.keys(b.post || {}).some(dt => own(dt) ? _shFpDay(_shFp(dt)) !== _shFpDay(b.post[dt]) : _shFp(dt) !== b.post[dt])) return '顺延之后又改过计划，没法撤销';
  dates.forEach(dt => { S.plan.days[idx(dt)] = JSON.parse(JSON.stringify(b.snap.days[dt])); _shPut(dt, own(dt) ? _shMerge(b.snap.st[dt], _shState(dt)) : b.snap.st[dt]); });
  if (noShift) b.missed.forEach(dt => { S.plan.days[idx(dt)]._noShift = true; });
  delete b.snap; delete b.post;
  return '';
}
// 顺延掉的那天后来有了打卡记录(比如另一台设备补的),挪过去的天都还没动 → 自动撤回
function _shRevertIfLogged(today) {
  const b = _shTop(); if (!b || !b.snap) return false;
  const hit = b.missed.filter(dt => LOG.some(l => l.date === dt) || Object.values(S.prog[dt] || {}).some(Boolean));
  if (!hit.length || _shRestore(b, false, true)) return false;
  b.state = 'reverted'; b.seen = true;
  const msg = `${hit.map(dt => _shWd(dt, today)).join('、')}补了打卡，那次顺延已经撤回`;
  if (typeof uiNotice === 'function') uiNotice(msg); else showToast(msg);
  return true;
}
function autoShiftUndo() {
  const b = _shTop(); if (!b) return;
  const why = _shRestore(b, true);
  if (why) { showToast(why); return; }
  b.state = 'undone'; b.seen = true;
  _shAfter();
  showToast('已撤销顺延 · 那天练过的话，点开那天解锁后补打卡');
}
function autoShiftDismiss() { const b = _shTop(); if (!b) return; b.seen = true; saveState(); render(); }
window.autoShiftUndo = autoShiftUndo; window.autoShiftDismiss = autoShiftDismiss;
const _SH_WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'], _SH_CN = ['零', '一', '两', '三', '四', '五', '六', '七'];
function _shWd(dt, today) { return dt === today ? '今天' : _SH_WD[new Date(dt + 'T12:00:00').getDay()]; }
function _shText(b) {
  const parts = [b.missed.map(dt => _shWd(dt, b.at)).join('、') + '没打卡'];
  if (b.shifted) parts.push(`后面的训练已顺延${_SH_CN[b.shifted] || b.shifted}天`);
  if (b.dropped.length) parts.push(`排不开，这周少练${_SH_CN[b.dropped.length] || b.dropped.length}次`);
  if (b.align) parts.push(b.align.off ? `和 ${b.align.nm} 对不上 ${b.align.off} 天` : `已和 ${b.align.nm} 对齐`);
  return { main: parts.join('，'), hint: '其实练了只是忘了打卡？点撤销，再去补打卡', id: 'shift-notice', undo: 'autoShiftUndo()', dismiss: 'autoShiftDismiss()', tag: '顺延' };
}
// 今天页顶上的提示(_todayNotices):自己最近一批顺延 / 最近一次跟着搭子对齐,各一条;没点「知道了」、三天内
function _shNoticeHtml(t) {
  return skinTpl('shiftNotice', t, t => `<div class="notice" id="${t.id}" role="status"><span>${_escHtml(t.main)}。${_escHtml(t.hint)}</span><button type="button" class="link-btn u" onclick="${t.undo}">撤销</button><button type="button" class="link-btn" onclick="${t.dismiss}">知道了</button></div>`);
}
function autoShiftNoticeHtml(today) {
  return '';   // 顺延已停用(2026-11-10),不再有「今天没打卡,这周少练一次 · 撤销 / 知道了」这张卡
  let h = '';
  const b = autoShiftOn() ? _shTop() : null;
  if (b && !b.seen && b.at >= addDays(today, -2)) h += _shNoticeHtml(_shText(b));
  const f = _shFollowTop();
  if (f && !f.seen && f.at >= addDays(today, -2)) h += _shNoticeHtml({ main: `${f.nm || '搭子'} 没去成，后面的训练跟着对齐了`, hint: '', id: 'follow-notice', undo: 'autoShiftFollowUndo()', dismiss: 'autoShiftFollowDismiss()', tag: '对齐' });
  return h;
}

// ── 跟着搭子顺延(2026-10-29 Cait「有搭子的情况下仍然要对齐」)──
// 对方共享文档 train.shifts = 对方最近几批顺延 [{id, at, undone?}](coach.js coachSharedTraining,只有批次 id 和日期)。
// 读到一个新的、还有效的批次 → 按「对齐搭子的训练日」同一套算法(app.js partnerAlignDraftCalc:只挪今天之后、没锁、没开练、
// 没打卡、不是私密日的训练日,每周天数和分化顺序不变)自动采纳,今天页提示可撤销。每个对方批次只跟一次(S.shiftFollowed,随设置云同步)。
// 对方撤销了那一批、我还没开练 → 跟着撤回。我跟随产生的改动记在 S.plan.follows,不算我的顺延批次、不进我共享的 shifts → 对方不会再跟回来。
// 两人同一天都没练(对方没练的那天我也没练 / 也顺延了):各自顺延就已经对齐,不跟。
const SH_ID_RE = /^sh-\d{4}-\d\d-\d\d-(\d{4}-\d\d-\d\d)$/;
function _shPartnerShifts() {
  const t = _shAlignOn() ? _ppTrain() : null;
  return t && Array.isArray(t.shifts) ? t.shifts.filter(x => x && typeof x.id === 'string' && SH_ID_RE.test(x.id) && typeof x.at === 'string') : [];
}
function _shFollowTop() { const L = (S.plan && S.plan.follows) || []; for (let i = L.length - 1; i >= 0; i--) if (L[i].state === 'on') return L[i]; return null; }
function _shFollowRun() {
  if (!S.plan || !S.plan.days || !S.plan.days.length) return false;
  const list = _shPartnerShifts(); if (!list.length) return false;
  const today = todayStr(), nm = _ppName(), done = new Set(S.shiftFollowed || []);
  let changed = false, seenNew = false;
  // 对方撤销了我跟过的那一批 → 我这边还没开练、也没再改过就撤回
  ((S.plan && S.plan.follows) || []).filter(f => f.state === 'on').forEach(f => {
    const p = list.find(x => x.id === f.pid);
    if (!p || !p.undone || _shRestore(f, false)) return;
    f.state = 'reverted'; f.seen = true; changed = true;
    if (typeof uiNotice === 'function') uiNotice(`${nm} 撤销了那次顺延，你的训练也跟着撤回了`);
  });
  list.filter(p => !p.undone && !done.has(p.id)).sort((x, y) => x.id.localeCompare(y.id)).forEach(p => {
    done.add(p.id); seenNew = true;
    if (p.at < addDays(today, -2)) return;                 // 配对前 / 很久以前的批次:只记下,不跟
    const md = p.id.match(SH_ID_RE)[1], mine = S.plan.days.find(d => d.date === md);
    if (mine && (mine.isMissed || (!mine.isRest && !mine.isPrivateDay && !_shAct(md)))) return;   // 那天我也没练:各自顺延
    const dr = typeof partnerAlignDraftCalc === 'function' ? partnerAlignDraftCalc() : { none: true };
    if (dr.none || !dr.moves.length) return;               // 跟随后计划不会变:不提示
    const idx = ds => S.plan.days.findIndex(x => x.date === ds), dates = [...new Set(dr.moves.flat())];
    const f = { pid: p.id, at: today, nm, missed: [], state: 'on', snap: { days: {}, st: {} }, post: {} };
    dates.forEach(ds => { f.snap.days[ds] = JSON.parse(JSON.stringify(S.plan.days[idx(ds)])); f.snap.st[ds] = _shState(ds); });
    dr.moves.forEach(([a, b]) => { S.plan.days[idx(b)] = { ...JSON.parse(JSON.stringify(f.snap.days[a])), date: b }; _shPut(b, f.snap.st[a]); });
    dates.forEach(ds => { f.post[ds] = _shFp(ds); });
    S.plan.follows = (S.plan.follows || []).concat(f).slice(-6);
    changed = true;
  });
  if (seenNew) S.shiftFollowed = [...done].slice(-20);
  if (changed) _shAfter(); else if (seenNew) saveState();
  return changed;
}
function autoShiftFollowUndo() {
  const f = _shFollowTop(); if (!f) return;
  const why = _shRestore(f, false);
  if (why) { showToast(why.replace('顺延', '对齐')); return; }
  f.state = 'undone'; f.seen = true;
  _shAfter();
  showToast('已撤销，回到跟着对齐之前');
}
function autoShiftFollowDismiss() { const f = _shFollowTop(); if (!f) return; f.seen = true; saveState(); render(); }
window.autoShiftFollowUndo = autoShiftFollowUndo; window.autoShiftFollowDismiss = autoShiftFollowDismiss;
// 标记日在今天页 / 历史里的一句话
function autoShiftMissedLine(d) {
  const o = d.missedOrig || {};
  return `原计划「${_escHtml(o.type || '训练')}」${o.n ? ` · ${o.n} 个动作` : ''}，${d.missedTo ? `已顺延到 ${fmtDate(d.missedTo)}` : '排不开，这周少练一次'}。`;
}
// 给 AI 教练的事实:最近 14 天排了训练却没练的日子(2026-11-10 起不自动顺延,漏练后怎么接上由教练安排)。
// 没练 = 过去的训练日(非休息、非私密)整天没有打卡 / 勾选 / 记组;以前自动顺延留下的标记日照样算,result 写当时怎么处理的。
// 私密日不进(和旧口径一样);coach.js 再按门控过一遍类型名
function autoShiftFacts(back = 14) {
  const today = todayStr(), from = addDays(today, -back);
  return ((S.plan && S.plan.days) || []).filter(d => d.date >= from && d.date < today && !d.isPrivateDay && (d.isMissed || (!d.isRest && !_shAct(d.date))))
    .map(d => d.isMissed
      ? { date: d.date, planned: (d.missedOrig && d.missedOrig.type) || '', result: d.missedTo ? '当时自动顺延到 ' + d.missedTo : '当时没排开' }
      : { date: d.date, planned: d.workoutType || '', result: '没练' });
}
// 打开 app(loadState → autoAlignPlan)、切回前台、23:00 那一刻都检查一次
let _shTimerId = null;
function _shArm() {
  clearTimeout(_shTimerId);
  const n = new Date(), t = new Date(n.getTime()); t.setHours(SHIFT_HOUR, 0, 1, 0);
  if (t <= n) t.setDate(t.getDate() + 1);
  _shTimerId = setTimeout(() => { autoShiftCheck(); _shArm(); }, Math.min(t - n, 2147000000));
}
// 切回前台:先开新的一轮(之前收到的云端快照不算了,并主动向服务器要一份),等那份到了再顺延
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (typeof cloudNewEpoch === 'function') cloudNewEpoch(true); autoShiftCheck(); _shArm(); } });
_shArm();

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
// 动作属于哪一段由动作库决定:库里归拉伸/热身的,不管怎么加进来(AI、手动、换动作、旧计划)都进那一段。
// 只改标记、不动顺序,按下标存的勾选和重量不受影响。两组之外也有同名条目的不算。
let _blockNames = null;
function _blockNameSets() {
  if (_blockNames) return _blockNames;
  const inOther = g => n => Object.entries(DB).some(([k, a]) => k !== g && a.some(e => e.n === n));
  _blockNames = {
    stretch: new Set(DB.stretch.map(e => e.n).filter(n => !inOther('stretch')(n))),
    warmup: new Set(DB.warmup.map(e => e.n).filter(n => !inOther('warmup')(n))),
  };
  return _blockNames;
}
function _syncBlockFlags() {
  if (!S.plan || !S.plan.days) return;
  const b = _blockNameSets();
  S.plan.days.forEach(d => (d.exercises || []).forEach(e => {
    if (e.swimPhase || e.isWarmup) return;
    // 打了拉伸标记、但库里属于力量组的(靠墙天使、靠墙静蹲…):退回训练段。能上重量的本来就不进拉伸段,不动
    if (e.isStretch) { if (!isWeightedMove(e.name) && Object.entries(DB).some(([g, a]) => g !== 'stretch' && g !== 'warmup' && a.some(x => x.n === e.name))) e.isStretch = false; return; }
    if (b.stretch.has(e.name)) e.isStretch = true;
    else if (b.warmup.has(e.name)) e.isWarmup = true;
  }));
}
// 动作库改了说明 / 每侧 / 计时(2026-11-10 全库核对)后,把还没练的计划跟上:今天(没锁、这个动作还没勾)和以后的日子里
//   · note:换成库里的新要点(力量动作后面 app 自动接的「 — 强度说明」和经期前缀照留);
//   · bi:跟库(以前生成的计划没带上每侧标记,列表就只写「45 秒」不写「每侧」);
//   · 热身 / 拉伸段的计时秒数:库里写了 warmupSec / hold 的跟库(这两段固定 1 组;手动调过的走 S.adj 覆盖,不受影响)。
// 过去的日子、锁定的日子、已经勾掉的动作一律不动(那是练过的记录)。确定性,每次 render 跑,只在有差异时改。
function _dbEx(name) { for (const a of Object.values(DB)) { const f = a.find(x => x.n === name); if (f) return f; } return null; }
function _syncExFromDB() {
  if (!S.plan || !S.plan.days) return false;
  const today = todayStr(), P = '经期温和模式 | ';
  let ch = false;
  S.plan.days.forEach(d => {
    if (d.date < today || !d.exercises || (typeof isLocked === 'function' && isLocked(d))) return;
    const pd = S.prog[d.date] || {};
    d.exercises.forEach((e, i) => {
      if (pd[i] || e.swimPhase) return;
      const db = _dbEx(e.name); if (!db) return;
      if (db.note) {
        let n = e.note || '', pre = '';
        if (n.startsWith(P)) { pre = P; n = n.slice(P.length); }
        const k = n.indexOf(' — '), nn = pre + db.note + (k >= 0 ? n.slice(k) : '');
        if (nn !== e.note) { e.note = nn; ch = true; }
      }
      if (!!e.bi !== !!db.bi) { e.bi = !!db.bi; ch = true; }
      if (e.unit === '秒' && (db.u || '次') === '秒') {
        const want = e.isWarmup ? db.warmupSec : (e.isStretch ? db.hold : null);
        if (want && e.reps !== want) { e.reps = want; ch = true; }
      }
    });
  });
  return ch;
}
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
// 今天页顶上记经期:经期中一行状态 + 结束了;没在经期时一个不抢眼的入口(owner 没有经期,不显示入口)
function _periodTodayHtml() {
  if (S.cycleEnabled === false) return '';
  if (S.periodMode) return `<div class="notice period-line" role="status"><span>经期中</span><button type="button" class="link-btn u" data-toggle="period">结束了</button></div>`;
  return _ownerSession() ? '' : `<div class="period-mark"><button type="button" class="link-btn" data-toggle="period">今天来月经了</button></div>`;
}
function _todayNotices(sel, today) {
  let h = '';
  if (S.planStale) h += `<div class="stale-bar"><span>训练设置改过了，计划还是按旧设置排的</span><button class="regen-btn" onclick="applyStaleSettings()">按新设置重排</button></div>`;
  h += autoShiftNoticeHtml(today);   // 没练自动顺延:最近一次的提示 + 撤销
  if (!sel || sel.date === today) h += _periodTodayHtml();
  if (typeof _todayNotice !== 'undefined' && _todayNotice) h += `<div class="notice" role="status"><span>${_escHtml(_todayNotice)}</span><button class="link-btn" onclick="uiNotice('')">知道了</button></div>`;
  // 「正在看 X · 回到今天」条:运动风格不要(2026-11-10 Cici:太碍事,她自己会选今天),skin-sport.js viewingNotice 返回空;纸墨照旧
  if (sel && sel.date !== today) h += skinTpl('viewingNotice', { sel }, () => `<div class="notice"><span>正在看 ${fmtDate(sel.date)} ${sel.date.slice(5).replace('-', '/')}</span><button class="link-btn u" onclick="calGoToday()">回到今天</button></div>`);
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
  if (allDone) wkClearIfEmpty(date);
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
// 打卡记录里的动作没存 bi:按动作库补「每侧」(Cici 截图里「臀部激活蚌式 1×45秒」其实是每侧 45 秒)
function _logBi(ex) { if (ex.bi !== undefined) return !!ex.bi; const d = typeof _dbEx === 'function' ? _dbEx(ex.name) : null; return !!(d && d.bi); }
function _readListHtml(exs, date) {
  return `<div class="read-list">${exs.map((ex, i) => {
    const done = ex.done !== false;
    return `<div class="ex-row${done ? ' done' : ' struck'}"><div class="ex-top"><span class="idx">${String(i + 1).padStart(2, '0')}</span><div class="ex-main"><button type="button" class="exname" ${_detailAttrs(ex.name)}>${ex.name}</button>`
      + `<span class="ex-spec static">${ex.sets || '?'}×${ex.reps || '?'}${ex.unit || '次'}${_logBi(ex) ? '/每侧' : ''}${ex.weight ? ` · ${ex.weight} kg` : ''}</span></div>${uiBox(done, 'aria-disabled="true" tabindex="-1"', done ? '已完成' : '没做')}</div></div>`;
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
  _syncBlockFlags();
  _syncExFromDB();   // 和上面一样只改内存、不单独存:开机时云端快照还没到,单独 saveState 会把旧计划标脏、盖掉另一台设备的新计划(sync163);每次 render 都会重新对齐
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
  const { days: planDays } = S.plan;
  // 开通了 AI 的今天页有每天换的「教练的话」,方案要点只在计划页放;没登录 / 没开通的照旧放在今天页底部
  const tip = (typeof coachAccess === 'function' && coachAccess() === 'on') ? '' : planTipText();
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
  if (typeof ptTodayHtml === 'function') h += ptTodayHtml(sel ? sel.date : today);   // 搭子今天练到哪(app.js「搭子」节)

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
    h += `<div class="wk-head"><div class="wk-title">${sel.isMissed ? '没练（已顺延）' : '休息日'}</div><div class="wk-meta"><span>${fmtDate(sel.date)}</span></div></div><div class="hint">${sel.isMissed ? autoShiftMissedLine(sel) : '好好恢复，明天继续。'}</div>`;
    h += typeof renderRecoveryModule === 'function' && !sel.isMissed ? renderRecoveryModule(sel) : '';
  }
  if (tip) h += `<div class="tip" style="white-space:pre-line">${_escHtml(tip)}</div>`;
  if (_xMode && _ownerSession() && hasGoal('女性曲线')) {
    h += (_xp() && _xp().curveTipHtml) || '';
  }
  }   // 纸墨正文结束
  mainEl.innerHTML = h;
  if (typeof skinAfterRender === 'function') skinAfterRender('today');
  _wmSync();
  if (typeof partnerLiveTick === 'function') partnerLiveTick();   // 搭子看得到我练到哪:进度变了排一次推送(节流)

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
// 这天还有没有真的进度:打过卡、勾着动作、做过组。开练时刻 t0 本身不算。
function wkHasWork(date) {
  if (LOG.some(l => l.date === date)) return true;
  if (Object.values(S.prog[date] || {}).some(Boolean)) return true;
  const w = _wkDays()[date];
  return !!(w && Object.values(w.s || {}).some(n => n > 0));
}
// 进度全撤掉了:开练时刻作废。否则勾了又取消也会被自动顺延、推送、搭子卡当成今天练过。
function wkClearIfEmpty(date) {
  if (wkHasWork(date)) return;
  const a = _wkDays(), d = a[date];
  if (d && d.t0) { delete d.t0; _wkDaysSave(a); }
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
      subMetrics: xMetrics,
      ...(day.isPrivateDay ? { priv: 1 } : {})   // 私密日的打卡:计划翻页后也认得出,不进共享(coach.js _coachLogOk)
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
  } else wkClearIfEmpty(date);

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
  '靠墙静蹲开胯（turnout）': { muscles: ['股四头', '臀', '髋外旋肌'], steps: ['背靠墙站立，双脚略宽于肩、向前离墙约一步，脚尖向外转开。', '从髋部带动大腿向外转，让膝盖朝向和脚尖一致。', '沿墙下滑到半蹲，或到你还能保持膝对脚尖的高度，后背和臀部贴住墙。', '保持不动，膝盖持续向外，均匀呼吸，坚持到计时结束。', '结束时扶墙沿墙慢慢滑回站立。'], tips: ['脚尖外开角度以膝盖跟得上为准，跟不上就把脚尖收回一点。', '太吃力先蹲高一些。', '墙面太滑可以在背后垫一块瑜伽垫。'], mistakes: ['膝盖内扣，和脚尖方向不一致。', '塌腰、臀部离墙。', '膝内侧出现锐痛就停。'] },
  '站姿并腿外旋等长（turnout）': { muscles: ['内收肌', '臀中肌'], steps: ['双脚并拢站在不滑的地面上，膝盖伸直但不锁死，收紧腹部。', '双腿用力向内夹紧，感觉大腿内侧发力。', '同时脚掌踩住地面不动，从髋部发力像要把双脚向外拧开，感觉臀侧发力。', '两股力同时保持，身体不晃，均匀呼吸，坚持到计时结束后放松。'], tips: ['可以在两膝之间夹一个软球或折好的毛巾，更容易找到夹紧的感觉。', '平衡不好可以一手轻扶墙。', '光脚或穿防滑鞋，脚掌不要真的转动。'], mistakes: ['只夹不拧，或只拧不夹。', '憋气。', '膝或髋出现锐痛就停。'] },
  '仰卧弹力带髋外展保持': { muscles: ['内收肌', '臀中肌(外展)'], steps: ['迷你弹力带套在膝盖上方，仰卧在垫子上，双臂放在身体两侧。', '双腿向上伸直，脚底朝天，下背贴住垫子。', '对抗弹力带把双腿向两侧打开成 V 形，开到下背仍能贴地的幅度。', '在打开位置保持不动，均匀呼吸，坚持到计时结束。', '结束时慢慢合拢双腿，屈膝放下双脚。'], tips: ['腿伸直太累时可以微屈膝。', '弹力带太紧打不开就换轻一档。', '头下可以垫一条折好的毛巾。'], mistakes: ['用惯性把腿弹开。', '塌腰，下背离开垫子。', '腿发麻或髋部锐痛就停。'] },
  '高跪姿挺髋保持（kneeling hip thrust hold）': { muscles: ['臀大肌', '核心(抗伸展)'], steps: ['跪在垫子上，双膝与髋同宽，小腿和脚背贴地，上身立起。', '臀部向前推，直到髋完全伸直，从头、肩、髋到膝成一条直线。', '夹紧臀部，肋骨往下收，腹部收紧，不让腰向前顶。', '保持不动、均匀呼吸，坚持到计时结束。', '结束后放松臀部，慢慢坐回脚跟或起身。'], tips: ['膝盖跪着疼就在膝下多垫一层垫子或毛巾。', '侧对镜子检查头到膝是不是一条线。'], mistakes: ['塌腰把肚子往前顶。', '臀部向后撅，往脚跟方向坐。', '膝或腰出现锐痛就停。'] },
  '双腿relevé踮立保持': { muscles: ['小腿', '踝稳定', '平衡'], steps: ['双脚并拢或与髋同宽站直，脚尖朝前；需要时一只手轻扶墙或椅背。', '收紧腹部和臀部，双脚同时抬起脚跟，踮到演示图里的最高位置，重心落在大脚趾和二脚趾根部。', '在最高点停住，脚踝保持正中，不向外或向内倒，头顶向上延伸。', '自然呼吸，按计时保持。', '计时结束后慢慢落下脚跟，抖一抖小腿放松。'], tips: ['晃得厉害先扶墙，稳了再改成只用指尖轻碰墙。', '光脚或穿薄底鞋在硬地面上做，更容易找平衡。'], mistakes: ['脚踝外翻，重心压在小脚趾一侧。', '塌腰撅臀。', '足底或跟腱出现锐痛、小腿抽筋就停。'] },
  '颈深屈肌保持（chin tuck hold）': { muscles: ['颈深屈肌'], steps: ['跪或坐直、目视前方', '下巴轻轻内收(做双下巴)、颈椎中立', '维持该姿态做耐久保持，肩放松'], tips: ['力度轻、是下巴微收、不是低头'], mistakes: ['变成低头', '耸肩'] },
  '跪姿手腕拉伸（wrist stretch）': { muscles: ['前臂', '腕关节'], steps: ['四足跪在垫子上，双手在肩膀正下方，手掌完全贴地、手指张开，指尖朝前。', '手肘伸直但不锁死，肩膀下沉远离耳朵。', '身体慢慢向前移，肩膀移到手腕前方，掌根始终压地，手腕和前臂有拉伸感。', '在能承受的位置停一两口呼吸再退回，计时前一半这样慢慢前后移动。', '计时后一半把双手转过来，指尖朝向膝盖、掌心仍贴地，身体缓慢向后坐，拉前臂内侧。', '结束时把重量移回膝盖，抬起双手轻轻甩一甩手腕。'], tips: ['指尖朝膝盖太强，可以先只转到指尖朝两侧。', '也可以单手做，另一只手撑在旁边分担体重。', '膝盖不舒服就在膝下垫折叠毛巾。'], mistakes: ['一下子把太多体重压到手腕上。', '耸肩、手肘锁死。', '手腕锐痛或手指发麻就减少重量或停下。'] },
  '哥萨克深蹲': { muscles: ['内收肌', '臀', '股四头'], steps: ['双脚分开约两倍肩宽，脚尖略向外；负重时双手在胸前抱一只哑铃、壶铃或杠铃片。', '重心移向一侧，该侧屈髋屈膝向下蹲，另一条腿伸直，脚跟着地、脚尖勾起朝上。', '蹲到下蹲腿脚跟还能着地、背部还能挺直的最低位置。', '下蹲腿脚跟踩实站起回到中间，再换另一侧；左右交替，每侧都做够目标次数算 1 组。'], tips: ['柔韧不够先扶着椅背或门框做，或只蹲到一半深度。', '胸前抱重物能帮身体向前平衡，先用轻的。', '下蹲腿膝盖对准脚尖。'], mistakes: ['弯腰弓背。', '下蹲腿脚跟抬起。', '伸直腿大腿内侧或膝内侧出现锐痛就停。'] },
  '高跪姿开胸（kneeling chest opener）': { muscles: ['核心(抗伸展)', '臀', '后肩'], steps: ['双膝着地成高跪姿，髋完全伸直、躯干与大腿成一直线', '双臂向后下方伸展、肩胛后缩、挺胸', '收紧核心与臀抵住向后倒的力，骨盆中立不塌腰，静态保持'], tips: ['想象从头到膝一条直线、别用塌腰假挺', '可双手握弹力带向后拉增加后肩刺激'], mistakes: ['塌腰顶肚子', '耸肩', '坐向脚跟'] },
  '沙发式髋屈肌拉伸': { muscles: ['髂腰肌', '股四头'], steps: ['背对墙或沙发，在墙根放一块软垫；一侧膝盖跪在垫上贴近墙根，小腿沿墙竖直向上，脚背贴墙。', '另一条腿向前迈出踩地，前膝弯成直角左右，双手扶前膝或撑在身体两侧地面。', '收紧后腿一侧的臀部，尾骨向下卷，让骨盆后倾。', '上身慢慢立直，直到后腿大腿前侧和髋部前侧有强烈拉伸感，腰不塌。', '平稳呼吸，按计时保持 45 秒；太强就把上身放低一点。', '计时结束后上身前倾、双手撑地，先把后腿从墙上放下来，再换另一侧。'], tips: ['太强先把后膝离墙根远一点，或上身前倾双手撑地做。', '后膝下垫厚毛巾或折叠垫，膝盖不要直接压在硬地上。', '在沙发上做时，后脚背搭在沙发座面或靠背上，前脚踩地。'], mistakes: ['塌腰挺肚子，把拉伸躲掉。', '前膝向内扣。', '膝盖压痛或髋前锐痛就停。'] },
  // === 臀/髋/腿 补充 2（髋环绕 / 相扑深蹲 / 俯卧挺髋 / 侧平板髋部下沉（side plank hip dip））===
  '四足髋绕环（hip CARs）': { muscles: ['臀中肌', '髋外旋肌'], steps: ['四足跪在垫子上，双手在肩正下方，双膝在髋正下方，背部平直，收紧腹部。', '保持屈膝，把一条腿的膝盖向前收向胸口方向。', '膝盖向外侧打开抬起，像消防栓式那样抬到最高。', '保持高度，把膝盖向后转，大腿向后伸，脚底朝天。', '再把腿放回起始位置，这算画完一圈；动作要慢，每个方向都走到自己能控制的最大幅度。', '一半次数按这个方向画，另一半反方向画；做完一侧再换另一条腿。'], tips: ['膝盖下垫毛巾或折起的垫子。', '控制不住时先把圈画小，保证骨盆不动。', '可以对着镜子看骨盆有没有歪。'], mistakes: ['用腰左右晃代替髋转动。', '速度太快，变成甩腿。', '髋部有卡住感或锐痛就停，缩小幅度。'] },
  '相扑深蹲': { muscles: ['臀', '内收肌', '股四头'], steps: ['双脚明显宽于肩，脚尖向外约 45 度；负重时双手握一只哑铃或壶铃垂在两腿之间。', '挺胸收紧腹部，屈膝屈髋，臀部直直向下坐，膝盖顺着脚尖方向打开。', '蹲到大腿接近与地面平行。', '脚跟踩实站起，站直时收紧臀部。'], tips: ['先徒手练熟再拿哑铃或壶铃。', '重物垂在两腿之间时手臂放松，只是拿着，不要甩。', '髋部紧蹲不深时，先蹲到舒服的深度。'], mistakes: ['膝盖内扣。', '脚跟离地。', '上身前倾弯腰；膝或髋出现锐痛就停。'] },
  '俯卧挺髋抬腿': { muscles: ['臀大肌', '腘绳'], steps: ['俯卧在垫子上，双手交叠垫在额头下（也可以双臂贴在身体两侧或压在身下），双腿伸直。', '收紧腹部，让骨盆前侧压实地面。', '一条腿保持伸直，臀部发力把它向后上方抬离地面，抬到臀部收紧即可，骨盆不离地。', '顶端夹臀停一下，慢慢放回，做完一侧次数再换另一侧。'], tips: ['抬的高度很小是正常的，骨盆不离地比抬高更重要。', '髋骨压地疼可以在髋下垫一条折叠毛巾。'], mistakes: ['塌腰用下背把腿翘起。', '骨盆一侧离地翻开。', '腰部出现锐痛就停。'] },
  '侧平板髋部下沉（side plank hip dip）': { muscles: ['腹斜', '臀中肌'], steps: ['侧卧，下方前臂撑地，手肘在肩膀正下方，双腿伸直叠放，上方手叉腰。', '把髋部顶起，身体从头到脚踝成一条直线。', '慢慢让髋部往下沉，接近地面，不在地面上停留或放松。', '用侧腰和臀部外侧发力把髋部顶回直线，算一次；这一侧做完再换另一侧。'], tips: ['演示图里髋部放回了地面；你下沉到接近地面就顶回，不在地上停。', '降阶：下方膝盖弯曲着地做。', '下沉和顶起都放慢，不要靠弹。'], mistakes: ['髋部向前转，身体往前倒。', '下沉后直接坐到地上休息。', '肩部出现锐痛就停。'] },
  // === 臀/髋 补充（蛙式臀桥 / 消防栓式 / 驴踢 / 骨盆控制）===
  '消防栓式': { muscles: ['臀中肌'], steps: ['四足跪在垫子上，双手在肩正下方，双膝在髋正下方，背部平直。', '一条腿保持屈膝约 90 度，膝盖向侧上方抬起，抬到骨盆要跟着翻之前，顶端停一下。', '慢慢放回，膝盖轻触或接近垫子。', '做完一侧次数后换另一条腿。'], tips: ['膝盖下垫毛巾或折起的垫子。', '进阶可在膝盖上方套迷你弹力带。', '抬不高没关系，骨盆不动更重要。'], mistakes: ['骨盆向侧翻借力。', '塌腰或拱背。', '髋或膝出现锐痛就停。'] },
  '蛙式臀桥': { muscles: ['臀', '内收肌'], steps: ['仰卧，屈膝把两脚脚心相对贴在一起，脚跟尽量靠近臀部，膝盖向两侧自然打开。', '双臂放体侧，收紧腹部，双脚外侧压地。', '臀部用力把髋顶起，顶到髋部伸直，膝盖保持向两侧打开。', '在顶端夹紧臀部停一下，再慢慢下放，臀部不完全落地接着做下一次。'], tips: ['加重时在髋部压一只哑铃或一片杠铃片，双手按住不让它滑。', '髋部打不开时，脚跟离臀部远一点。', '想着把耻骨推向天花板。'], mistakes: ['用腰往上拱。', '顶起时膝盖向中间合拢。', '髋或腹股沟出现锐痛就停。'] },
  '跪姿后踢腿': { muscles: ['臀大肌'], steps: ['四足跪在垫子上，双手在肩正下方，膝盖在髋正下方，背部平直。', '一条腿保持屈膝，脚底朝向天花板。', '臀部发力把这条腿向后上方抬起，抬到大腿与躯干大致一线，顶端夹臀停一下。', '慢慢放回到膝盖接近地面，做完一侧次数再换另一侧。'], tips: ['膝盖跪着疼就在膝下多垫一层垫子或毛巾。', '抬到大腿与躯干一线就够了，不要为了高度塌腰。'], mistakes: ['塌腰把腿抬得更高。', '骨盆向工作腿一侧歪斜翻开。', '腰部出现锐痛就停。'] },
  '骨盆前后倾（pelvic tilt）': { muscles: ['骨盆控制', '核心'], steps: ['仰卧屈膝(或站/跪)', '骨盆后倾：腰贴地、收尾骨；前倾：轻微塌腰、翘尾骨', '两端来回缓慢、精准控制'], tips: ['动作小而准'], mistakes: ['整段腰大幅晃', '憋气'] },
  // === 平衡 / 单腿稳定（平衡稳定 模块）===
  '单腿站立': { muscles: ['踝稳定', '核心'], steps: ['单脚站立，另一脚抬离地面', '收紧核心、目视前方保持', '进阶可闭眼或站软垫上，换边'], tips: ['脚趾轻抓地帮助稳定', '晃就先睁眼/手扶墙'], mistakes: ['憋气', '骨盆歪斜'] },
  '单腿硬拉': { muscles: ['臀', '腘绳', '平衡'], steps: ['单腿微屈站立', '髋向后铰链、上身前倾，后腿向后伸成一线', '背平直、臀腿发力站起，换边'], tips: ['想象后脚跟向后推墙', '先扶物找到平衡再脱手或加哑铃'], mistakes: ['弓背', '膝盖锁死', '骨盆打开转胯'] },
  '单腿臀桥': { muscles: ['臀', '骨盆稳定'], steps: ['仰卧屈一膝、另一腿伸直', '支撑腿发力顶髋至身体一线', '骨盆保持水平不下掉，换边'], tips: ['用臀不用腰', '骨盆两侧等高'], mistakes: ['塌腰', '骨盆歪向一侧'] },
  '燕式平衡': { muscles: ['臀', '平衡', '下背'], steps: ['单腿站立', '上身前倾、对侧腿向后抬，与背成一条直线(飞机式)', '双臂平展帮助平衡，保持后换边'], tips: ['核心收紧、视线落地面前方'], mistakes: ['弓背塌腰', '骨盆侧翻'] },
  // === 开髋放松 / 脊柱流动 / 臀桥开合 ===
  '下犬式': { muscles: ['腘绳', '小腿', '肩背'], steps: ['四足跪姿，双手在肩膀稍前方、与肩同宽，手指张开，脚趾回勾踩地。', '呼气，膝盖离地，臀部向上向后推，先保持屈膝，把背拉长。', '在背保持平直的前提下慢慢伸直双腿，脚跟向地面踩，全身成倒V。', '到位时手掌压实、肩膀远离耳朵，头放松在两臂之间，大腿后侧、小腿和肩背有拉伸感。', '平稳呼吸，按计时保持。', '结束时屈膝跪回地面，臀部坐向脚跟休息。'], tips: ['背伸不直就先屈膝，把背拉长优先，脚跟落不到地没关系。', '手腕不舒服，在掌根下垫折叠毛巾，或把手撑在瑜伽砖上。', '双脚稍微分宽一点，会更容易把臀部推高。'], mistakes: ['含胸圆背。', '耸肩，肩膀挤到耳朵旁。', '手腕或肩膀锐痛就跪下休息。'] },
  '臀桥开合': { muscles: ['臀大肌', '臀中肌'], steps: ['仰卧屈膝，双脚与髋同宽踩地，双臂放体侧。', '脚跟踩地顶髋到肩、髋、膝一条线，夹紧臀部。', '保持髋的高度，双膝向两侧慢慢打开，脚掌外侧压地。', '再慢慢把双膝合回，打开再合拢算一次，全程髋不往下掉。', '做完次数后慢慢把髋放回地面。'], tips: ['可在膝盖上方套一根弹力带增加阻力。', '髋往下掉就减小开合幅度。'], mistakes: ['打开膝盖时臀部掉下来。', '用腰往上拱。', '腰或髋出现锐痛就停。'] },
  '仰卧快乐婴儿式': { muscles: ['髋', '盆底'], steps: ['仰卧在垫子上，屈膝把双腿收向胸口。', '双膝分开到比躯干略宽，双手从两膝内侧穿过，抓住两只脚掌的外缘；够不到就抓脚踝或小腿。', '小腿竖直、脚掌朝向天花板，双手把脚轻轻往下拉，让膝盖朝腋下方向下沉。', '到位时骶骨和下背贴地，头和肩膀放松在垫子上，大腿内侧和腹股沟有拉伸感。', '平稳呼吸，按计时保持；也可以轻轻左右摇晃。', '结束时松开双手，双脚落回垫子踩地，再伸直双腿。'], tips: ['够不到脚，用弹力带或毛巾套在脚掌上拉住。', '头和肩膀放松贴地；颈部不舒服就在头下垫折叠毛巾。', '髋部紧时先抓一只脚做半边，另一条腿伸直放在地上。'], mistakes: ['抬头耸肩。', '尾骨翘起、下背离地。', '髋部或膝盖锐痛就松手退出。'] },
  '仰卧束角式': { muscles: ['髋', '内收肌'], steps: ['仰卧在垫子上，屈膝双脚踩地。', '两只脚心相对贴在一起，脚跟靠近臀部，距离以舒服为准。', '让两侧膝盖慢慢向外落下，不用手压，大腿内侧和腹股沟有温和的拉伸感。', '双手轻放在小腹上或放在身体两侧，肩膀和下背放松贴地。', '用鼻子慢慢呼吸，按计时保持。', '结束时用手从大腿外侧把两膝托回中间，双脚踩地后再伸直双腿。'], tips: ['膝盖下各垫一个枕头或瑜伽砖，拉伸更轻，也更容易放松。', '脚跟离臀部远一些，拉伸感会减轻。'], mistakes: ['用手往下压膝盖。', '下背拱起离地。', '腹股沟或膝盖内侧锐痛就把膝托起来退出。'] },
  '下犬到上犬流动': { muscles: ['脊柱', '核心'], steps: ['从下犬式开始：双手撑地与肩同宽，双脚与髋同宽，臀部顶高成倒V。', '吸气，身体向前移，肩膀来到手腕正上方，像平板支撑。', '髋部向地面下沉，胸口向前向上推，脚背翻转贴地，进入上犬：手臂伸直、大腿离地、肩膀下沉。', '呼气，收腹，髋部向上向后推，脚趾回勾踩地，回到下犬，脊柱从腰到上背依次弯曲再伸展。', '配合呼吸慢慢来回，做到计时结束。', '结束时停在下犬，屈膝跪下，臀部坐回脚跟休息。'], tips: ['腰不舒服，把上犬换成眼镜蛇式（大腿和髋留在地面）。', '脚背翻不过来，可以全程脚趾踩地。', '腿后侧紧时，在下犬里屈膝。', '演示图只是起始的下犬姿势，上犬那一半没有图，照 steps 第 2、3 步做。'], mistakes: ['上犬时耸肩、手肘锁死。', '下背塌得太猛，腰部被挤。', '腰部或手腕锐痛就停。'] },
  '四足跪姿躯干绕环': { muscles: ['脊柱', '核心'], steps: ['四足跪在垫子上，双手在肩膀正下方，膝盖在髋部正下方，脊柱中立。', '身体先向右移，再把臀部带向后方脚跟，接着移向左边，最后向前回到肩膀略超过手腕，连成一个圆。', '移动时脊柱跟着弯：向后时拱背，向前时胸口下沉、抬头看前方。', '圈尽量画大，手掌和膝盖不离地，动作慢而连贯。', '计时前一半顺时针转，后一半逆时针转，配合呼吸。', '结束时回到中立四足跪姿，臀部坐回脚跟休息。'], tips: ['膝盖下垫折叠毛巾或软垫。', '手腕不舒服可以握拳撑地，或把前臂放在地上做。', '刚开始圈画小一点，熟练后再加大。'], mistakes: ['只晃骨盆，上背不动。', '速度太快，变成甩动。', '腰部锐痛或手腕痛就停。'] },
  // === 体态 / 盆底 补充（肩胛后缩 / 下巴微收 / 凯格尔）===
  '肩胛后缩保持': { muscles: ['菱形肌', '中斜方肌'], steps: ['坐/站直，胸口微挺', '双侧肩胛骨向脊柱中线收拢、同时向下沉', '保持(别耸肩)，再缓慢放松'], tips: ['想象把肩胛骨放进后裤兜', '可双手持弹力带辅助'], mistakes: ['耸肩', '靠挺腰代偿'] },
  '收下巴': { muscles: ['颈深屈肌'], steps: ['坐/站直、目视前方', '轻轻把下巴向后收(做双下巴)、后脑勺微向后上', '保持几秒、肩放松，重复'], tips: ['力度很轻、不是低头'], mistakes: ['变成低头', '耸肩'] },
  '头顶书本走姿（poise walk）': { muscles: ['颈深屈肌', '竖脊肌', '核心'], steps: ['站直，把一本不太重的平装书平放在头顶正中', '下巴微收、头顶向上延伸，肩胛下沉、两肩放松', '沿直线慢走，步子比平时小一点，脚跟先着地再过渡到前脚掌', '走到头转身再走回来，全程让书保持水平不掉'], tips: ['书掉了多半是头在往前探或身体上下起伏，放慢再来', '眼睛平视前方，不要低头看脚', '先原地顶着书站稳 10 秒再开始走'], mistakes: ['为了稳住书耸肩、脖子僵住', '挺腰塌背、肋骨外翻', '低头看书或看地面'] },
  '猫步走（catwalk）': { muscles: ['臀中肌', '核心', '小腿'], steps: ['在地上找一条直线(地板缝或贴一条胶带)', '每一步前脚落在线上，脚尖略朝前外，前脚掌先着地', '骨盆随步子自然左右送，上身保持稳定、肩膀不跟着晃', '目视前方，双臂自然摆动，一步一步匀速走'], tips: ['靠支撑腿的臀中肌稳住骨盆，骨盆的摆动是走出来的，不要刻意扭', '先赤脚或穿平底鞋练熟，再换带跟的鞋'], mistakes: ['腿交叉过线导致绊脚、膝盖内扣', '上身左右大幅扭动', '低头看线'] },
  '靠墙站立体态检查（wall posture check）': { muscles: ['竖脊肌', '中下斜方肌', '颈深屈肌', '核心'], steps: ['背靠墙站，脚跟离墙约一拳', '后脑勺、上背、臀部贴墙，小腿肚尽量贴墙', '手伸到腰后：腰和墙之间大约留一掌厚，多了就轻轻收腹让骨盆微微后倾', '肩胛下沉、下巴微收，正常呼吸，记住这个位置', '慢慢离开墙，带着这个姿势走几步'], tips: ['后脑勺贴不上墙说明头往前探，先用下巴微收把头带回来，别仰头去贴', '每天固定一个时间做一次(比如刷牙后)，容易养成习惯'], mistakes: ['为了让腰贴墙过度收腹、骨盆后倾太多', '仰头让后脑勺贴墙', '耸肩、手臂用力往墙上压'] },
  '凯格尔盆底收缩': { muscles: ['骨盆底肌'], steps: ['选一个放松的姿势：仰卧屈膝、坐在椅子上或站着都可以，肩膀和腹部放松，正常呼吸。', '像要憋住尿、忍住排气那样，把会阴和肛门周围向上、向内收紧。', '收紧时臀部、大腿和腹部尽量不用力，也不屏气；收住停几秒。', '然后完全放松，放松的时间不短于收紧的时间，感觉盆底真正松开。', '一收一放循环进行，做到屏幕计时结束。'], tips: ['不确定有没有收对，可以仰卧屈膝做，手放在下腹，收紧时下腹不应明显鼓起或用力往下压。', '和「盆底放松呼吸」搭配练习，收和放同样重要。', '刚开始收紧停得短一点，能稳定收住再慢慢延长。'], mistakes: ['用夹臀、夹腿或收腹代替盆底收紧。', '只顾收紧，没有完全放松就开始下一次。', '收紧时屏气；出现盆腔疼痛或不适就停止，必要时咨询盆底康复专业人员。'] },
  // === 脚踝灵活 / 小腿（少练小腿，重灵活）===
  '脚踝绕环': { muscles: ['踝'], steps: ['站直，双手叉腰，重心放在一条腿上，支撑腿膝盖微屈。', '另一只脚稍微向前放，脚跟抬起，脚尖轻点地面。', '以脚尖为支点，用脚踝带动脚跟慢慢画圈，把圈尽量画大，脚踝前后左右都转到。', '计时前一半顺时针转，后一半逆时针转，速度慢而均匀。', '平稳呼吸，支撑腿保持稳定，身体不跟着晃。', '一侧计时结束后把脚放平，换另一只脚点地，做到计时结束。'], tips: ['平衡不好时一手扶墙或椅背。', '也可以坐在椅子上，把一只脚抬离地面画圈。'], mistakes: ['只动脚趾，脚踝没有转动。', '转得太快，圈越画越小。', '脚踝出现锐痛或卡住就停。'] },
  '腓肠肌拉伸': { muscles: ['腓肠肌(小腿上部)'], steps: ['面对墙站立，距离约一臂，双手与肩同高扶在墙上。', '一只脚向后退一步，后腿伸直，后脚尖朝正前方，脚跟踩实地面；前腿屈膝。', '屈前膝，髋部向墙的方向前压，从后脚跟到头保持一条斜线。', '到位时后腿小腿肚上部（膝盖下方）有明显拉伸感，后脚跟始终不离地。', '平稳呼吸，按计时保持 45 秒，呼气时可以再前压一点。', '计时结束后前腿发力把重心移回，收回后脚，换另一条腿在后，做到计时结束。'], tips: ['拉伸感不明显，就让后脚再往后退一些。', '后脚跟总是抬起，把后脚往前挪一点，减小步幅。', '想接着拉小腿深层，同样的站位把后膝稍弯，就是比目鱼肌拉伸。'], mistakes: ['后脚跟抬起。', '后脚尖向外撇。', '小腿或跟腱锐痛就停。'] },
  '比目鱼肌拉伸': { muscles: ['比目鱼肌(小腿深层)'], steps: ['面对墙站立，双手与肩同高扶墙，一只脚在前，另一只脚向后退半步，两脚尖都朝前。', '后脚跟踩实地面，后膝微微弯曲，前膝也跟着弯。', '髋部向下沉、后膝向前顶，后脚跟仍不离地。', '到位时后腿小腿下段、脚跟上方的深处有拉伸感，而不是膝盖下方。', '平稳呼吸，按计时保持 45 秒。', '计时结束后伸直双腿、收回后脚，换另一条腿在后，做到计时结束。'], tips: ['后脚的步子比腓肠肌拉伸小一些，更容易拉到深层。', '拉伸感不明显，就再多弯一点后膝。', '没有墙时可以双手扶椅背或扶杆。'], mistakes: ['后膝伸直，变成了拉腓肠肌。', '后脚跟抬起。', '跟腱或脚跟锐痛就停。'] },
  '跪姿踝背屈': { muscles: ['踝背屈'], steps: ['在垫子上半跪：一侧膝盖跪地，另一只脚在前踩地，前脚离后膝约一个脚掌多。', '双手扶在前膝上，或一手扶墙，上身立直。', '重心慢慢前移，前膝向前越过脚尖，膝盖对着第二、三脚趾的方向。', '到位时前脚跟始终贴地，小腿后侧和跟腱有拉伸感，脚踝前侧有轻微挤压感。', '可以停在最远处保持，也可以慢慢前后小幅摆动，按计时进行，平稳呼吸。', '一侧计时结束后把重心移回，换另一条腿在前重复；起身时双手扶膝慢慢站起。'], tips: ['后膝下垫折叠毛巾或软垫。', '在前脚尖前方墙根处放个目标物（或直接用膝盖碰墙），每次看膝盖能不能再往前一点。', '脚踝前侧卡着疼，就减小前移幅度。'], mistakes: ['前脚跟离地。', '膝盖向内扣。', '脚踝前侧锐痛就停。'] },
  // === 姿势保持 / 稳定 / 体态（柔韧·体态 模块）===
  '靠墙静蹲': { muscles: ['股四头', '臀'], steps: ['背靠墙站立，后脑、上背和臀部贴墙，双脚与肩同宽，向前迈出约一步。', '沿墙慢慢下滑，直到大腿与地面平行，小腿大致垂直地面，膝盖约成 90 度并对准脚尖。', '双手放在大腿上或垂在身体两侧，不要用手推腿借力。', '保持这个高度不动，均匀呼吸，坚持到计时结束。', '结束时双手扶腿或扶墙，沿墙慢慢滑回站立。'], tips: ['膝盖跑到脚尖前面时，把双脚再往前挪一点。', '太吃力先蹲高一点（大腿高于平行），能稳住再降到平行。', '墙面太滑时在背后垫一块瑜伽垫或毛巾；进阶可抬起脚跟、用前脚掌支撑。'], mistakes: ['臀部高于膝盖，蹲得不够低。', '憋气，或双手撑大腿借力。', '膝盖出现锐痛就停，改为蹲高一些再试。'] },
  '深蹲保持': { muscles: ['髋', '踝', '股四头'], steps: ['双脚比肩略宽站立，脚尖自然向外转，脚跟踩实地面。', '屈髋屈膝慢慢往下蹲，膝盖顺着脚尖方向向外打开，臀部一直沉到最低处，悬在两脚之间。', '到位时整个脚掌（尤其脚跟）贴地，膝盖对着脚尖，胸口向前打开、背尽量立直，大腿内侧、臀部和脚踝前侧有拉开感。', '双手在两膝之间合拢，或自然搭在膝上，用手肘轻轻把膝盖向外撑。', '用鼻子均匀呼吸，按计时保持，每次呼气让髋部再放松下沉一点。', '结束时双手扶膝或扶地，重心稍微前移，慢慢伸直双腿站起来。'], tips: ['脚跟踩不住，在脚跟下垫一卷毛巾或薄垫。', '平衡不好时面对柱子、门框或固定器械，双手抓住再蹲。', '蹲不到底可以在臀下垫一块瑜伽砖或软垫坐着保持（演示图就垫了软垫），熟练后再降低高度。'], mistakes: ['脚跟离地，重心全压在前脚掌。', '含胸圆背，膝盖向内扣。', '膝盖或腹股沟锐痛、腿发麻就站起来，不要硬撑。'] },
  '臀桥保持': { muscles: ['臀', '腘绳'], steps: ['仰卧在垫子上，屈膝，双脚与髋同宽踩实地面，脚跟离臀部约一拳，双臂放在身体两侧、掌心朝下。', '收紧腹部，脚跟用力踩地，把髋部向上顶，直到肩、髋、膝成一条斜线。', '在顶端夹紧臀部，肋骨往下收，不要把腰往上拱。', '保持这个高度不动，均匀呼吸，坚持到计时结束。', '结束后从上背到臀部一节一节慢慢放回地面。'], tips: ['太吃力先把髋顶得低一点，能稳住再顶到一条线。', '进阶可在膝盖上方套一根弹力带，全程把膝向外撑住；或改成单腿保持。', '脖子后面不舒服可以垫一条折叠毛巾。'], mistakes: ['用腰往上拱，腰发酸而臀部没感觉。', '保持中髋部慢慢往下掉。', '腰或膝出现锐痛就停，放下休息。'] },
  '鸟狗式': { muscles: ['核心', '下背', '臀'], steps: ['四足跪在垫子上，手在肩膀正下方，膝盖在髋部正下方，背部放平，眼睛看手前方的地面。', '先收紧腹部，再把一侧手臂向前伸直、对侧腿向后伸直，手和脚抬到与躯干大致同高。', '从指尖到脚跟成一条线，骨盆两侧保持水平，伸出的腿不往外撇，停在这个位置按计时保持，正常呼吸。', '这一侧计时结束后手脚慢慢收回四足位，换另一侧手臂和对侧腿，同样保持到计时结束。'], tips: ['膝盖下垫折叠的毛巾或厚一点的垫子，跪久了不硌。', '保持不住时先只伸腿、手不离地，稳了再加上手臂。', '进阶：保持时让伸出的手和对侧膝盖在身体下方慢慢相碰再伸回，全程骨盆不晃。'], mistakes: ['腿抬得过高，腰往下塌成反弓。', '身体往支撑侧歪，骨盆一边高一边低。', '下背或手腕出现锐痛就停下休息。'] },
  '门框开胸拉伸': { muscles: ['胸大肌', '三角肌前束'], steps: ['站在门框旁，一侧前臂竖直贴住门框侧面，肘弯成直角、肘略高于肩。', '同侧脚向前跨出半步，另一只手自然垂放。', '身体慢慢向前移，胸口微微转离贴门框的手臂，直到胸前和肩膀前侧有拉伸感。', '到位时肩膀下沉远离耳朵，腰不塌、肋骨不外翻，前臂始终贴住门框。', '平稳呼吸，按计时保持 45 秒，呼气时可以再往前移一点。', '计时结束后身体先退回原位再放下手臂，换另一侧手臂贴门框，做到计时结束。'], tips: ['上下挪动肘的位置，找到胸前拉得最明显的高度。', '没有门框，可以用墙角或健身房的立柱代替。', '手臂发麻就把肘放低一点，前移幅度也减小。'], mistakes: ['耸肩、肩膀往前顶。', '塌腰挺肚子借力往前冲。', '肩关节前侧锐痛或手指发麻就退回来。'] },
  '胸椎伸展': { muscles: ['胸椎', '胸'], steps: ['坐在有靠背的椅子上，椅背上沿大约到肩胛骨下缘，双脚平踩地面，臀部坐到椅面靠后。', '双手手指交叉托住后脑，两肘向前收拢，轻轻收紧腹部，让下肋骨不外翻。', '吸气准备，呼气时以椅背上沿为支点，上背向后伸展，两肘慢慢打开指向斜上方。', '到位时后仰的是两块肩胛骨之间那一段，下背和臀部仍贴着椅子，胸口前侧有打开感。', '吸气回到直立，呼气再向后伸展，按计时缓慢来回；也可以在后仰位置停几口呼吸。', '结束时先回到直立坐姿，再放下双手。'], tips: ['用泡沫轴做：仰卧，把泡沫轴横放在肩胛骨下方，臀部着地，双手抱头向后伸展，做几次后把泡沫轴往上挪一点。', '椅背太矮靠不到上背，在背后垫一条折叠毛巾。', '颈部紧张时让双手多托住头的重量，头不要往后甩。'], mistakes: ['腰向前顶、肋骨外翻，弯的是下背而不是上背。', '憋气或猛地甩头后仰。', '背部锐痛或手臂发麻就停。'] },
  '颈侧拉伸': { muscles: ['颈侧', '上斜方'], steps: ['站直，双脚与髋同宽，下巴微收，肩膀放松下沉。', '右手叉在腰上，左手从上方越过头顶，掌心轻搭在右耳上方。', '头慢慢向左侧倒，左耳朝左肩方向靠，脸保持朝前，不转头。', '到位时右侧脖子到肩膀上沿有拉伸感；左手只加一点手臂的重量，不往下拽。', '平稳呼吸，按计时保持，呼气时让右肩再往下沉一点。', '计时结束后先松开左手，用颈部自己的力量把头慢慢扶正，再换成左手叉腰、右手搭头、头向右倒，做另一侧。'], tips: ['也可以坐着做：不拉伸那一侧的手抓住椅面边缘，肩膀更容易沉下去。', '拉伸感不够，可以把脸稍微转向腋下方向，拉到颈部斜后方。', '演示图左右两侧交替演示；跟计时做时先一侧保持到计时结束，再换另一侧。'], mistakes: ['用手猛拽头。', '被拉伸那一侧耸肩，拉伸感消失。', '手臂发麻、头晕或颈部锐痛就停。'] },
  // === 柔韧 / 髋灵活 / 盆底（柔韧重点模块）===
  '鸽子式开髋': { muscles: ['臀', '髋屈肌'], steps: ['从四足跪姿开始，右膝向前移到右手腕后方，右小腿斜放在身前。', '左腿向后伸直，膝盖和脚背朝下贴地。', '双手撑在前腿两侧，上身立直，调整骨盆让两侧髋骨朝前；右侧臀部下面空着就垫毛巾。', '骨盆慢慢往下沉，右侧臀部和左侧髋前侧都有拉伸感；想加深可以双手向前爬，上身前趴。', '按计时保持 45 秒，平稳呼吸。', '结束时双手撑地，左脚脚趾踩地，把右腿收回四足位；换左腿在前，做另一侧。'], tips: ['前膝不舒服就把前脚收近身体，减小角度。', '先保持上身直立（演示图是直立版），熟悉后再前趴。'], mistakes: ['骨盆歪向一侧。', '憋气硬压。', '前膝扭痛、锐痛或腿发麻就退出。'] },
  '90/90髋旋转': { muscles: ['髋内旋', '髋外旋'], steps: ['坐在垫子上，双膝弯曲、双脚踩地，两脚分开比肩稍宽，双手撑在身后。', '双膝一起倒向左侧落地：左腿在前，小腿横在身前，膝盖弯成直角；右腿在身体右侧，大腿朝侧面、小腿朝后，也弯成直角。', '双手轻扶地面或离开地面，上身坐直，胸口对着前腿的小腿。', '保持背部平直，从髋部向前腿小腿方向前倾，左侧臀部有拉伸感，右髋前侧也有被拉开的感觉。', '按计时保持这一侧，平稳呼吸。', '换边时双手撑在身后，双膝抬起，像雨刷一样慢慢倒向右侧，变成右腿在前、左腿在后，做另一侧。', '结束时双膝回到中间，双腿伸直。'], tips: ['坐不直、骨盆往后倒时，在臀下垫折叠毛巾或瑜伽砖。', '熟练后换边时可以不用手撑，只靠髋部把双膝转过去。', '膝盖不舒服就把两脚分得宽一点，角度放大。'], mistakes: ['含胸塌腰，靠弓背去前倾。', '换边时甩动，或膝盖砸地。', '膝盖出现扭痛或锐痛就停。'] },
  '青蛙式开胯': { muscles: ['内收肌'], steps: ['四足跪姿，双膝向两侧打开，小腿与大腿约90°', '臀部缓慢向后移到拉伸位再回来', '控制幅度、循序渐进'], tips: ['膝下垫软垫', '只静态拉、不要弹震'], mistakes: ['一次开太大、拉伤腹股沟'] },
  '蝴蝶式': { muscles: ['内收肌', '髋'], steps: ['坐在垫子上，屈膝，两脚掌相对贴在一起，膝盖向两侧打开。', '双手握住两只脚，把脚跟拉近身体到舒服的距离。', '坐骨坐稳，脊柱向上拉长，让膝盖自然向地面下沉，大腿内侧有拉伸感。', '想加深时保持背部平直，从髋部向前倾，到背还能保持平直的深度就停。', '按计时保持 45 秒，平稳呼吸，呼气时让大腿内侧放松。', '结束时上身回正，双手托住膝盖外侧把双腿合拢，再伸直。'], tips: ['坐不直就在臀下垫折叠毛巾；脚跟离身体远一点，拉伸会轻一些。', '演示图先坐直，再从髋部前倾到最深处，然后回到坐直，反复做；跟着计时做时，前倾到背还能平直的深度就停住保持。'], mistakes: ['弓背低头代替髋部前倾。', '用手猛压膝盖上下弹。', '腹股沟或膝盖出现锐痛就退出。'] },
  '仰卧4字臀拉伸': { muscles: ['臀', '梨状肌'], steps: ['仰卧在垫子上，屈膝，双脚踩地，头肩放松贴地。', '抬起右腿，把右脚踝外侧搭在左膝上方的大腿上，右脚勾起，右膝向外打开。', '抬起左脚，双手分别从两腿之间和左腿外侧穿过，十指相扣抱住左大腿后侧。', '把左大腿慢慢拉向胸口，直到右侧臀部外侧有拉伸感，尾骨仍贴在垫子上。', '按计时保持，平稳呼吸。', '结束时松手，左脚落地、右脚放下；换左脚踝搭在右膝上，做另一侧。'], tips: ['抱不到就用毛巾绕过大腿后侧拉住两端。', '架起的那只脚勾起，可以保护膝盖。'], mistakes: ['抬头耸肩。', '尾骨和下背被拉离垫子。', '膝盖扭痛或腿发麻就松开。'] },
  '猫牛式': { muscles: ['脊柱'], steps: ['四足跪姿，手在肩膀正下方、膝在髋部正下方，膝下垫软，背先摆平。', '吸气，腹部向下沉，尾骨和胸口向上抬，最后抬头看斜前方（牛式）。', '呼气，手推地，尾骨向下卷，背从下往上一节节拱起，最后低头看向肚脐（猫式）。', '拱背时两块肩胛骨之间撑开，塌腰时胸口打开，腰部不挤痛。', '跟着呼吸慢慢来回交替，做到计时结束。', '结束时回到背部平直，再把臀部坐回脚跟休息。'], tips: ['手腕不舒服可以握拳撑地或前臂撑地。', '想象脊柱从尾骨开始一节节带动，头最后动。'], mistakes: ['只动头颈，脊柱不动。', '速度太快变成甩动。', '腰部出现锐痛就缩小塌腰的幅度。'] },
  '胸椎旋转': { muscles: ['胸椎', '肩'], steps: ['四足跪姿，手在肩下、膝在髋下，膝下垫软。', '右手放到头后，手指轻扶后脑，右肘指向侧面。', '呼气，上背向左转，右肘向下、朝左手手腕方向穿过去。', '吸气，上背向右转，右肘向上、向后打开指向天花板，目光跟着手肘，右侧胸口有打开感。', '臀部保持在膝盖上方、骨盆朝下不动，转动来自上背；这一侧来回做到计时结束。', '换左手扶头后，用同样的方法做另一侧；结束时手放回地面，臀部坐回脚跟休息。'], tips: ['臀部向后坐一些再做，更容易锁住腰，让转动集中在上背。', '动作慢，每次在最高处停一下呼吸。'], mistakes: ['用腰和骨盆跟着转。', '手用力拉头，颈部被扯。', '上背或肩部出现锐痛就缩小幅度。'] },
  '盆底放松呼吸': { muscles: ['盆底', '核心'], steps: ['仰卧在垫子上，屈膝，双脚踩地与髋同宽（也可以坐着做）。', '一手放在腹部、一手放在下肋骨，肩膀和下巴放松。', '用鼻子慢慢吸气，让腹部和两侧肋骨向外扩张，同时让会阴周围的肌肉向下松开（反向凯格尔），感觉两侧坐骨之间变宽。', '用嘴慢慢呼气，腹部回落，盆底自然回到原位，不主动用力收紧。', '呼气比吸气稍长，节奏放慢，按计时持续 90 秒。', '结束时自然呼吸几次，侧身用手撑起来。'], tips: ['感觉不到盆底变化时，可以坐在一卷毛巾上做，吸气时感觉会阴向下压向毛巾。', '这是放松练习，不是凯格尔收缩。'], mistakes: ['一直收紧不放松，或吸气时用力往下憋。', '憋气、耸肩。', '出现盆腔疼痛或头晕就停，改回正常呼吸。'] },
  // === 地板流动 / 开髋（女性曲线专属）===
  '蛙式臀冲': { muscles: ['臀大肌', '内收肌'], steps: ['仰卧，双脚脚心相对，双膝向两侧打开（尽可能贴地）', '依靠臀部发力，将骨盆向上推至最高点', '在顶端用力收紧臀大肌，髋部保持打开'], tips: ['深度刺激臀肌的同时，内收肌与髋部充分放松打开', '用臀发力，不要过度反弓腰椎'], mistakes: ['膝盖在发力时向内合拢', '用腰部代偿'] }, '四足脊柱波浪（cat flow）': { muscles: ['脊柱', '核心'], steps: ['四足跪在垫子上，手在肩膀下方或稍微往前，膝盖在髋部下方，背部放平。', '吸气，屈肘，让下巴和胸口贴近地面，像猫钻过低处一样向前滑，重心随之前移。', '滑到胸口在双手之间时，伸直手臂把胸抬起，背部微微下凹，眼睛看前方。', '呼气，从尾骨开始一节节把背向上拱起，低头，臀部往后退。', '退回四足跪姿后接着下一次，整个过程连贯不停，按计时做到结束。', '结束时回到四足跪姿，臀部坐向脚跟休息一下再起身。'], tips: ['动作越慢越好，留意每一段脊柱怎么动。', '手腕不舒服时双手握拳撑地，或手下垫折叠毛巾。', '膝盖下垫厚一点的垫子。'], mistakes: ['只动脖子，胸背不动。', '动作一段一段断开，像几个分开的姿势。', '腰部或手腕出现锐痛就停。'] },
  '四足跪姿骨盆绕环（hip circles）': { muscles: ['核心', '骨盆底肌'], steps: ['四足跪姿，保持背部平直，重心稳定', '单独控制骨盆，在空中极其缓慢地画圆', '顺时针和逆时针各画数圈'], tips: ['想象这是卧姿的肚皮舞，深度唤醒腰骶神经与血液循环', '动作幅度可以随控制力逐渐加大'], mistakes: ['整个上半身跟着一起晃动', '速度过快失去肌肉控制'] },
  '深蹲底部左右摇摆（squat rock）': { muscles: ['下肢', '髋外旋'], steps: ['双脚比肩宽站立，脚尖向外转，脚跟踩实。', '屈髋屈膝慢慢蹲到最低，上身保持立起，臀部悬在两脚之间。', '双手在胸前合十，手肘抵在两膝内侧，把膝盖轻轻向外撑，膝盖对着脚尖方向。', '重心慢慢移向左脚，左膝弯得更深，右侧大腿内侧和髋部出现拉伸感；再慢慢经过中间移向右脚。', '左右来回做到计时结束，动作慢、呼吸不憋，脚跟尽量不离地。', '结束时双手扶膝或扶地，先把重心放回中间，再慢慢站起来。'], tips: ['蹲不到底或脚跟抬起，可以在臀下垫瑜伽砖坐着做（演示图就垫了坐垫），或在脚跟下垫一卷毛巾。', '平衡不好时面对柱子或门框，双手抓住扶稳再移重心。', '左右移动的幅度从小开始，熟练后再加大。'], mistakes: ['膝盖向内扣，和脚尖方向不一致。', '移重心太快，变成左右甩动。', '膝盖或腹股沟出现锐痛、腿发麻就停，站起来活动一下。'] },
  '仰卧大V字开合': { muscles: ['内收肌', '核心'], steps: ['仰卧在垫子上，双臂放在身体两侧，掌心向下，下背贴地。', '双腿并拢伸直向上抬起，脚底朝天花板，腿与地面大致垂直。', '吸气准备，呼气时双腿保持伸直，慢慢向两侧分开成V字。', '打开到大腿内侧有明显拉伸感、下背仍贴地的位置停住，让腿的重量自然往下带，不额外用力压。', '平稳呼吸，按计时保持。', '结束时先微屈膝，大腿内侧发力把双腿慢慢收拢到中间，再屈膝抱腿，双脚落地。'], tips: ['腿后侧紧、伸不直，可以微屈膝。', '想省力就把臀部贴墙，让双腿沿墙打开（即靠墙倒箭式分腿版）。', '想练下放控制，可以把弹力带绕过双脚、双手拉住两端，在计时内缓慢打开再收拢几次，下放一定要慢。'], mistakes: ['下放太快，腿突然掉下去拉伤大腿内侧。', '下背拱起离地。', '腹股沟锐痛或腿发麻就把腿收回来。'] },
  '小狗伸展式 (融心式)': { muscles: ['上背部', '胸大肌'], steps: ['四足跪姿，手在肩下、膝在髋下，膝盖下垫软。', '脚背贴地，双手一点点向前走，手臂伸直，手掌贴地。', '臀部保持在膝盖正上方，不向后坐，大腿与地面垂直。', '胸口向地面下沉，额头或下巴落到垫子上，腋下、肩前和上背有拉长感。', '手掌轻压地面、手臂不塌，按计时保持，呼气时让胸口再沉一点。', '结束时双手往回走到肩下，回到四足位，再把臀部坐回脚跟休息。'], tips: ['额头碰不到地或颈部不适，就在额头下垫瑜伽砖。', '肩膀太紧时双手分开宽一点，或把双手放在瑜伽砖上。', '下背有挤压感时腹部轻轻收一点，不要使劲塌腰。'], mistakes: ['臀部往前移或坐回脚跟，变成婴儿式。', '为了下巴贴地而仰头挤压颈部。', '肩膀出现锐痛或手发麻就退出。'] }, '仰卧牛面式（gomukhasana）': { muscles: ['臀中肌', '梨状肌'], steps: ['仰卧，双腿在空中交叉重叠（如大腿打结）', '双手抓住两只脚的脚背或脚踝，向下压向地板'], tips: ['臀外侧与梨状肌拉伸感很强', '保持下背贴地'], mistakes: ['头部抬起离开地面', '拉拽方向错误'] },
  '犁式（halasana）': { muscles: ['核心', '腘绳', '下背'], steps: ['仰卧在垫子上，双臂放在身体两侧，掌心向下，头下不垫枕头。', '屈膝把膝盖收向胸口，双手压地、腹部发力，把臀部卷离地面。', '双腿伸直并拢，慢慢越过头顶向后放，脚尖落在头后的地面上；落不到地就停在半空，用双手托住后腰。', '到位时重量落在肩膀和上臂，不压在脖子上；头不左右转，后背和大腿后侧有拉伸感。', '平稳呼吸，按计时保持。', '结束时双手压地、屈膝，脊柱一节一节从上往下卷回地面，臀部落地后再放下双腿。'], tips: ['肩膀下垫一块折叠毯（头留在毯外的地面上），可以减少颈部受压。', '脚落不到地，在头后放一把椅子或瑜伽砖，把脚尖搭在上面。', '颈部有旧伤、头晕或血压问题的先不做，改做仰卧抱膝。'], mistakes: ['甩腿借惯性翻上去。', '在姿势里转头。', '颈部疼痛、头晕或手发麻立刻退出。'] },
  '肩胛垫高臀推': { muscles: ['臀大肌', '腘绳肌'], steps: ['坐在地上，背靠长凳或沙发边，让肩胛骨下沿抵住凳边，屈膝双脚与肩同宽踩地。', '徒手时双手放在髋两侧；加重时把杠铃(垫好护垫)或一只大哑铃放在髋部折痕处，双手扶稳。', '下巴微收，脚跟踩地顶髋到肩、髋、膝成一条线，顶端小腿大致垂直地面，夹紧臀部。', '慢慢下放，让臀部沉到接近地面，再做下一次。'], tips: ['凳子要靠墙或固定住，防止推的时候滑走。', '加重时小幅加，顶不到一条线就退回上次重量。', '杠铃压得髋骨疼就加厚护垫。'], mistakes: ['下放幅度太小，只在上半段动。', '顶端仰头挺腰。', '腰或髋骨出现锐痛就停。'] },
  '跪姿后倒（股四拉伸）': { muscles: ['股四头肌', '髂腰肌'], steps: ['双膝跪在垫子上与髋同宽，脚背贴地，大腿与地面垂直，双手放在身体两侧。', '收紧臀部和腹部，让头、肩、髋、膝在一条直线上。', '保持这条直线，以膝盖为轴，整个身体慢慢向后倾。', '倾到大腿前侧有明显拉伸、自己还能稳住的角度就停，髋部不弯、不撅臀。', '平稳呼吸，按计时保持；撑不住就先回到直立，缓一下再倾。', '结束时臀部和大腿前侧发力，把身体慢慢拉回直立，再坐下或起身。'], tips: ['膝盖下垫折叠垫或厚毛巾。', '第一次只倾一点点，熟悉后再加大角度。', '可以在身后放一个靠垫，万一撑不住有地方落。'], mistakes: ['屈髋撅臀，拉伸感跑掉。', '一下倒得太深，靠惯性往回弹。', '膝盖锐痛立刻停。'] },
  '四足跪姿骨盆画8字': {
    muscles: ['骨盆控制', '腰腹核心'],
    steps: ['四足跪姿，双手在肩下，双膝在髋下，保持腰椎中立', '将注意力集中在骨盆，控制尾骨在水平面画‘∞’字轨迹', '左右方向交替，动作极其缓慢且富有韵律'],
    tips: ['控制骨盆灵活性，感受腰骶部与盆底肌的联动与放松', '上半身尽量保持固定，只动骨盆'],
    mistakes: ['上半身过度晃动代偿', '速度太快失去细节控制']
  },
  '靠墙倒箭式（分腿版）': { muscles: ['大腿内收肌', '髋关节'], steps: ['侧身坐在墙边，一侧臀部贴墙，然后转身躺下，同时把双腿抬起靠到墙上。', '臀部尽量挪到贴近墙根，下背平贴地面，双腿并拢伸直靠墙，双臂放在身体两侧。', '双腿保持伸直，脚跟沿墙面慢慢向两侧滑开成V字。', '滑到大腿内侧有拉伸感就停，让腿的重量自然往下落，腿不用力。', '平稳呼吸，按计时保持。', '结束时双手扶住大腿外侧，把双腿沿墙推回中间并拢，屈膝转向一侧，再用手撑地坐起。'], tips: ['拉伸太强，就让臀部离墙远一点。', '下背不舒服，在臀下垫一条折叠毯。', '腿发麻时屈膝把脚掌贴墙休息一下。'], mistakes: ['下背悬空离地。', '腿用力往回夹，对抗重力。', '腹股沟锐痛或脚发麻就把腿收回中间。'] },
  '靠墙站立前屈（wall forward fold）': { muscles: ['腘绳肌', '下背部'], steps: ['背对墙站立，双脚与髋同宽，脚跟离墙约一个脚掌长，臀部靠在墙上。', '膝盖微屈，双手放在大腿上。', '呼气，臀部保持贴墙，从髋部向前向下折叠上身，双手顺着腿往下滑。', '到位时臀部仍贴墙，大腿后侧有拉伸感；双手环抱小腿、互抱手肘或触地，头颈放松下垂。', '吸气时背稍微拉长，呼气时上身再往下放一点，按计时保持。', '结束时屈膝，双手扶住大腿，背部一节一节卷起回到站立，头最后抬起。'], tips: ['腿后侧紧，就多屈一点膝，让腹部先贴到大腿。', '想拉得更强，双脚离墙再远一点。', '容易头晕的话起身更慢，站起后停一下再走。'], mistakes: ['弓背，只用腰往下够。', '臀部离开墙面。', '腿后侧锐痛、腿发麻或头晕就停。'] },
  '池边悬浮分腿': { muscles: ['大腿内收肌', '核心'], steps: ['在浅水区背靠池壁站好，双臂向后张开，肘部或手掌撑在池沿上。', '收紧腹部，双脚离开池底，双腿向前伸直或略向前下方浮起。', '两腿伸直，缓慢向两侧打开到舒适的最大幅度。', '用大腿内侧的力量把双腿慢慢合拢，对抗水的阻力。', '保持慢速连续开合，背部始终靠住池壁，做到计时结束后放下双脚站稳。'], tips: ['腿浮不起来可以屈膝做，难度更低。', '肩膀不舒服时改为双手抓池沿、背贴池壁，减轻手臂负担。', '合拢比打开更慢一点，内侧的发力感更清楚。'], mistakes: ['动作太快溅起水花，失去水的阻力。', '耸肩、肩膀扛住全身重量。', '腹股沟出现锐痛时立刻停下，下次缩小打开幅度。'] },
  // === 补充：背部激活 / 臀中肌 / 核心（翘臀美背的主力动作）===
  '俯卧YTW': { muscles: ['下斜方肌', '三角肌后束', '菱形肌'], steps: ['俯卧在垫子上，额头垫一条毛巾；也可以胸口趴在上斜凳上，双臂自然下垂。', 'Y：拇指朝上，双臂沿斜上方抬起成Y字形，抬到与身体同高或略低，稍停后放下。', 'T：双臂向两侧平举成T字形，肩胛骨向中间夹，稍停后放下。', 'W：屈肘，把手肘向下拉向腰侧成W字形，肩胛骨向下、向中间收紧，稍停后放下。', 'Y、T、W各做一次算1次。'], tips: ['没有凳子也可以站着屈髋俯身做。', '先徒手，控制好了再两手各拿小哑铃或矿泉水瓶，重量宁小勿大。'], mistakes: ['耸肩，肩膀往耳朵方向缩。', '甩手臂靠惯性抬起。', '腰部拱起借力；肩部锐痛或手发麻立即停。'] },
  '靠墙天使': { muscles: ['下斜方肌', '姿势肌群'], steps: ['背靠墙站，双脚离墙一小步，膝盖微屈，臀部、上背和后脑勺贴墙。', '屈肘，把上臂和手背贴墙，摆成W字形。', '呼气，手臂沿墙面向上滑，接近伸直成Y字形，肩胛骨保持下沉。', '再沿墙滑回W形，肩胛骨向下收，这算1次。'], tips: ['手背贴不到墙就只贴到能贴的位置，幅度慢慢加大。', '也可以仰躺在地上做，地面代替墙。'], mistakes: ['腰拱起、离开墙面。', '为了贴墙而耸肩或憋气。', '肩前侧出现锐痛或手发麻就停。'] },
  '站姿绳索单腿外展': { muscles: ['臀中肌'], steps: ['把滑轮调到最低，脚踝扣环套在离机器较远的那条腿上，侧身站在龙门架旁，靠近机器的手扶住机架。', '站直收紧腹部，支撑腿膝盖微屈。', '工作腿保持伸直、脚尖朝前，向外侧抬起，抬到臀侧明显用力而上身仍直立的高度，顶端停一下。', '慢慢放回，配重片不要碰撞；做完一侧次数后转身换另一条腿。'], tips: ['抬起幅度不必大，三四十度左右通常就够。', '上身保持正直，不要向对侧倾倒借力。', '没有龙门架可用器械外展机替代。'], mistakes: ['身体后仰或侧倾，用惯性甩腿。', '脚尖向外转，变成大腿前侧发力。', '髋部出现锐痛就停。'] },
  '仰卧腿画圈（leg circles）': { muscles: ['下腹部', '髂腰肌', '大腿内收肌'], steps: ['仰卧在垫子上，双臂放在身体两侧掌心向下，双腿伸直并拢抬向天花板，脚尖向远处延伸。', '收紧腹部，把下背压向地面。', '双腿并拢，慢慢向一侧画出一个圈：向一侧下放、经过下方、从另一侧回到顶端。', '下一次换方向画圈，顺逆交替，回到顶端算一次。'], tips: ['圈画得小一点、腿抬得高一点，难度会降低。', '降阶：一次只画一条腿，另一条腿屈膝踩地。', '双手可以垫在臀部下面帮助腰贴地。'], mistakes: ['圈画得太大，腰离开地面。', '动作太快，靠甩腿。', '下背出现疼痛就停。'] }, '跪姿深蹲（kneeling squat）': { muscles: ['股四头肌离心', '臀大肌'], steps: ['跪在垫子上，双膝与髋同宽，上身立起成高跪姿，双手合在胸前。', '收紧腹部和臀部，上身保持直立，臀部慢慢向后下方坐。', '坐到臀部轻轻碰到脚跟，不要坐实放松。', '臀部发力快速向前挺髋，回到高跪姿并夹紧臀部，再做下一次。'], tips: ['膝盖跪着疼就在膝下多垫一层垫子或毛巾。', '可在身后低处固定一根弹力带绕过髋部，挺髋时增加阻力。', '下坐时大腿前侧有拉伸感是正常的，太紧就先坐浅一点。'], mistakes: ['坐到脚跟上完全放松，失去张力。', '挺髋到顶时腰往前顶。', '膝盖出现锐痛就停。'] }, '弹力带螃蟹步': { muscles: ['臀中肌'], steps: ['把迷你弹力带套在膝盖上方（进阶套在脚踝），双脚约髋宽站立。', '屈膝半蹲，臀部向后坐，上身略前倾，让弹力带绷紧。', '一只脚向侧面迈出一步，另一只脚跟过来半步，双脚不并拢；每迈一步算一次。', '向同一方向走够目标次数，再反方向走回来，两个方向都走够算 1 组。'], tips: ['膝盖始终对准脚尖。', '保持同样的蹲姿高度，不要越走越直。', '场地不够长就折返着走。'], mistakes: ['身体左右摇晃借力。', '双脚并拢，弹力带松掉。', '膝盖内扣；髋或膝出现锐痛就停。'] },
  '侧卧抬腿': { muscles: ['臀中肌'], steps: ['侧卧在垫子上，下方前臂撑地或枕在头下，上方手在胸前扶地，双腿伸直叠放，身体成一直线。', '上方腿伸直，脚尖朝前或略朝下。', '向侧上方抬腿到约 45 度，顶端停一下。', '慢慢放下但不完全落下；做完一侧次数后翻身换边。'], tips: ['侧卧不稳时，把下方腿屈膝放在身前支撑。', '进阶可在脚踝套弹力带。', '脚跟略领先，用力感在臀侧而不是大腿前侧。'], mistakes: ['骨盆向后翻，变成向前抬腿。', '抬得过高，用腰侧代偿。', '髋部出现锐痛就停。'] },
  '腹横肌真空吸': {
    muscles: ['腹横肌'],
    steps: ['站姿、四足跪姿或仰卧均可，先正常呼吸', '缓慢呼气把气吐尽', '把肚脐向脊柱方向收紧吸入，像要让肚子贴到后背', '保持收紧并正常浅呼吸10-20秒，再放松'],
    tips: ['是"收紧"不是"憋气"，保持能说话的浅呼吸', '收的是深层腹横肌，能收紧腰围而非增厚'],
    mistakes: ['屏住呼吸而非真空收腹', '含胸弓背', '用力过猛导致头晕']
  },
  // === 水中训练（泳池）===
  '池边悬浮分腿': { muscles: ['大腿内收肌', '核心'], steps: ['在浅水区背靠池壁站好，双臂向后张开，肘部或手掌撑在池沿上。', '收紧腹部，双脚离开池底，双腿向前伸直或略向前下方浮起。', '两腿伸直，缓慢向两侧打开到舒适的最大幅度。', '用大腿内侧的力量把双腿慢慢合拢，对抗水的阻力。', '保持慢速连续开合，背部始终靠住池壁，做到计时结束后放下双脚站稳。'], tips: ['腿浮不起来可以屈膝做，难度更低。', '肩膀不舒服时改为双手抓池沿、背贴池壁，减轻手臂负担。', '合拢比打开更慢一点，内侧的发力感更清楚。'], mistakes: ['动作太快溅起水花，失去水的阻力。', '耸肩、肩膀扛住全身重量。', '腹股沟出现锐痛时立刻停下，下次缩小打开幅度。'] },
  // === 胸部 (Chest) ===
  '杠铃卧推': { muscles: ['胸大肌', '三角肌前束', '肱三头肌'], steps: ['仰卧在卧推凳上，眼睛位于杠铃正下方，头、上背、臀部贴凳，双脚踩实地面。', '双手正握，握距略宽于肩，肩胛骨向后收紧并下沉，把杠铃推离架钩，移到肩膀正上方。', '吸气，屈肘把杠铃控制着下放到乳头连线附近，手肘与躯干大约成 45–60 度。', '杠铃轻触胸口后呼气推起，推到手臂接近伸直，杠铃回到肩膀正上方。', '做完最后一次，先把杠推到架钩正上方，再向后挂回去，确认挂稳再松手。'], tips: ['手腕立直，杠铃压在掌根正上方，不要向后折腕。', '找不到搭子，就改到带保护杠的深蹲架里做，保护杠调到躺下后略低于胸口的位置；普通卧推架没有保护杠，不要一个人做到推不动。', '加重量时每次小幅加，动作变形就退回上次的重量。'], mistakes: ['杠铃砸在胸口借反弹推起。', '臀部离开凳面、腰拱得过高借力。', '下放时手肘向两侧打开成一字；肩部出现锐痛立即停。'] },
  '哑铃卧推': { muscles: ['胸大肌', '三角肌前束', '肱三头肌'], steps: ['坐在平板凳一端，哑铃立在大腿上；向后躺下时用大腿顶一下，把哑铃送到胸口上方。', '头、上背、臀部贴凳，双脚踩实，肩胛骨收紧下沉，掌心朝脚的方向，手臂接近伸直。', '吸气，屈肘把哑铃沿弧线下放到胸部两侧，手肘与躯干大约成 45 度。', '呼气，把哑铃推回胸口正上方，两只哑铃靠近但不相撞。', '做完把哑铃收到胸口，屈膝坐起，把哑铃放回大腿后再放到地上。'], tips: ['哑铃很重、自己举不到起始位置时，请搭子递到你手里。', '肩膀不舒服可以改成掌心相对推。', '两侧力量不一样时，以弱侧能完成的次数为准。'], mistakes: ['下放太快，在底部弹起来。', '推起时哑铃左右晃，或在顶部用力相撞。', '肩前侧出现锐痛就停，减轻重量或缩小下放幅度。'] },
  '上斜哑铃卧推': { muscles: ['胸大肌上束', '三角肌前束'], steps: ['把靠背调到 30–45 度，坐下后哑铃立在大腿上，背靠下去时用大腿把哑铃送到肩膀上方。', '背和臀部贴紧靠背和坐垫，双脚踩实，肩胛骨收紧，掌心朝前握住哑铃。', '吸气，屈肘把哑铃下放到上胸两侧，手肘略低于肩。', '呼气，把哑铃推回锁骨正上方，推起时两只哑铃略向中间靠拢。', '做完把哑铃收回胸口，坐直后放到大腿上再放地面。'], tips: ['靠背越陡越接近推肩，肩膀先酸就把靠背调低一格。', '哑铃很重时请搭子帮你递到起始位置。'], mistakes: ['腰大幅拱起、臀部离开坐垫，把上斜做成了平板。', '推起路线偏向腹部，哑铃没有回到锁骨上方。', '肩部出现锐痛立即停。'] },
  '下斜杠铃卧推': { muscles: ['胸大肌下束', '肱三头肌'], steps: ['把双脚勾在下斜凳的脚垫下，躺下后头低脚高，眼睛位于杠铃正下方。', '双手正握，握距略宽于肩，肩胛骨收紧，在搭子协助下把杠铃移到胸口正上方。', '吸气，把杠铃下放到下胸，也就是胸肌下沿的位置。', '呼气，向上垂直推到手臂接近伸直。', '做完把杠推回架钩挂稳，先在凳上坐几秒再起身。'], tips: ['头低位做完容易头晕，坐稳几秒再站起来。', '头低脚高时头胀不舒服，就换成平板卧推。'], mistakes: ['杠铃下放位置太靠近脖子。', '臀部抬离凳面。', '双脚没勾牢，推起时身体往下滑。'] },
  '史密斯卧推': { muscles: ['胸大肌', '肱三头肌'], steps: ['把平板凳推进史密斯机，躺下试一下，让杠下放时正好落在胸口中段（乳头连线附近）。', '把安全挡块调到略低于胸口的高度；双手正握、略宽于肩，肩胛骨收紧，转动手腕把杠从挂钩上解开。', '吸气，沿轨道把杠下放到胸口。', '呼气，推到手臂接近伸直；做完转腕把杠挂回挂钩。'], tips: ['推不动时转动手腕就能挂在最近的挂钩上，或让杠落在安全挡块上，所以没有搭子也能做。', '杠落在脖子或肚子上，说明凳子位置不对，挪好再做。'], mistakes: ['凳子位置不对，杠铃轨迹别着肩膀。', '没设安全挡块就做到力竭。'] },
  '坐姿推胸机': { muscles: ['胸大肌', '三角肌前束'], steps: ['调座椅高度，让把手与胸口中段齐平，坐下后背贴靠背、双脚踩地。', '双手握把，肩胛骨向后收紧贴住靠背，手肘略低于肩。', '呼气，向前推到手臂接近伸直，不锁死肘部。', '吸气，控制着把把手收回胸前，配重片不要碰到底。'], tips: ['推的时候双手微微向中间靠，胸口参与得更多。', '头始终贴住靠垫。'], mistakes: ['含胸耸肩，肩膀离开靠背。', '头向前探离开靠垫。', '回放太快，配重片砸响。'] },
  '器械夹胸': { muscles: ['胸大肌中缝'], steps: ['调座椅高度，坐下后把手大约与肩同高，背贴靠背，双脚踩地。', '双手握住两侧把手，手肘微屈，胸口挺起，肩膀放低。', '呼气，手臂保持弧形，把两侧把手向胸前合拢，在中间稍停。', '吸气，控制速度向两侧打开，打开到胸前有拉伸感、肩膀仍贴着靠背为止。'], tips: ['如果是带护垫的蝴蝶机，就把前臂贴在护垫上推，路线一样。', '打开时肩前侧发紧，就缩小打开幅度。'], mistakes: ['手臂伸得笔直，或弯成直角变成推。', '身体前后摇晃借力。', '打开过大，肩前侧出现锐痛时立即停。'] },
  '绳索夹胸': { muscles: ['胸大肌下缝/外侧'], steps: ['把龙门架两侧滑轮调到胸口高度，各装一个单手把手，站在中间，一手握一个。', '一脚在前一脚在后站成小弓步，上身挺直或略前倾，手臂向两侧打开，手肘微屈。', '呼气，手肘角度不变，双手沿弧线向前，在胸口正前方合拢，稍停。', '吸气，控制速度打开，回到胸前有拉伸感、手还在身体两侧的位置。'], tips: ['站的位置以起始时绳子已经有拉力为准，太近没有阻力，太远会被拽着走。', '滑轮调高、向下合拢就是「绳索下斜夹胸」；滑轮放低、向上合拢偏上胸。'], mistakes: ['手肘越弯越多，变成向前推。', '打开时手被拉到身体后方，肩前侧受压；肩部锐痛立即停。'] },
  '绳索下斜夹胸': { muscles: ['胸大肌下束'], steps: ['把龙门架两侧滑轮调到最高，各装一个单手把手，站在中间，一手握一个。', '双脚与肩同宽平行站，身体直立，腹部收紧，双臂向斜上方打开，手肘微屈。', '呼气，保持手肘角度，双手沿弧线向身前下方合拢，在腹部前方合拢，稍停。', '吸气，控制速度沿原路线把手臂打开回到斜上方。'], tips: ['站不稳可以改成一脚在前的小弓步。', '合拢时两只手可以上下交叠一点，下一次换另一只手在上。'], mistakes: ['手肘弯得越来越多，变成了绳索下压。', '耸肩、身体前后摆动借力。'] },
  '哑铃仰卧屈臂上拉': { muscles: ['胸大肌', '背阔肌', '前锯肌'], steps: ['坐在平板凳侧边，双手托一只哑铃，向后躺下，让上背部横搭在凳面上，身体与凳子垂直。', '屈膝，双脚踩实地面，臀部离开凳面悬空，大致与凳面同高；双手一起握牢哑铃手柄，举在胸口正上方，手肘微屈。', '吸气，手肘角度不变，让哑铃沿弧线向头后下放，放到上臂接近和身体成一直线、胸口和腋下有拉伸感为止。', '呼气，沿原路线把哑铃拉回胸口正上方。', '做完把哑铃收到胸口，再坐起放下。'], tips: ['先用轻重量找幅度，肩膀活动度不够就少放一点。', '哑铃在脸的正上方，双手交叠扣紧哑铃柄，务必握牢。'], mistakes: ['手肘大幅屈伸，变成了臂屈伸。', '下放过深，腰大幅反拱。', '肩部出现锐痛或手臂发麻立即停。'] },
  '上斜哑铃飞鸟': { muscles: ['胸大肌上束'], steps: ['把靠背调到 30–45 度，坐下背靠后，把哑铃举到胸口上方，掌心相对，手肘微屈。', '吸气，手肘角度不变，哑铃沿弧线向两侧打开，打开到上臂大约与身体平齐、胸前有拉伸感。', '呼气，沿原弧线把哑铃合拢回胸口上方，两只哑铃不相撞。', '做完把哑铃收到胸口，坐起后再放下。'], tips: ['重量要明显轻于上斜卧推，以能控制住弧线为准。', '肩膀不舒服就缩小打开幅度。'], mistakes: ['下放过低，肩前侧受压；肩部锐痛立即停。', '手肘弯成直角，变成了上斜卧推。'] },
  '俯卧撑': { muscles: ['胸大肌', '肱三头肌', '核心'], steps: ['双手撑地，略宽于肩，手指朝前；脚尖撑地，双脚并拢或稍分开。', '收紧腹部和臀部，让身体从头到脚跟成一条直线。', '吸气，屈肘下放，手肘斜向后，下放到胸口离地约一拳。', '呼气，双手推地，把身体整体推回到手臂伸直。'], tips: ['标准版做不了，先改成双手扶在凳子或台面上做，或者膝盖着地做。', '标准版太轻松，可以背上压一片杠铃片（请人帮忙放）或穿负重背心，也可以把脚垫高。', '手腕不舒服可以握住哑铃把手做，让手腕保持立直。'], mistakes: ['塌腰，腰比胸先落地。', '臀部撅得太高。', '手肘向两侧打开成一字。'] },

  // === 肩部 (Shoulder) ===
  '杠铃推举': { muscles: ['三角肌前束', '三角肌中束'], steps: ['在深蹲架里把杠挂在略低于肩的高度，双手正握，握距与肩同宽或略宽。', '杠铃架在锁骨上方，起杠后退一小步，双脚与髋同宽，收紧臀部和腹部。', '呼气，把杠铃垂直向上推，经过脸前时头稍向后让开，杠铃过头顶后头回到两臂之间，推到手臂伸直。', '吸气，控制着沿原路线把杠铃放回锁骨。', '做完向前走回架子，把杠挂回架钩。'], tips: ['推不动时把杠放回锁骨或挂回架子，不要硬顶。', '腰总是后仰，可以先改成坐姿或用哑铃做。'], mistakes: ['腰椎过度后仰，用上胸去推。', '屈膝弹腿借力。', '肩部锐痛或手臂发麻立即停。'] },
  '哑铃肩推': { muscles: ['三角肌前束', '三角肌中束'], steps: ['把靠背调到接近直立，坐下背贴靠背，哑铃立在大腿上，借大腿一顶把哑铃举到耳朵两侧，掌心朝前。', '双脚踩实，腹部收紧，肩膀下沉。', '呼气，把哑铃向上推到手臂接近伸直，两只哑铃在头顶靠近但不相撞。', '吸气，控制着下放到耳朵两侧，哑铃大约与下巴同高；做完先放回大腿再放地面。'], tips: ['肩膀不舒服可以改成掌心相对推。', '推不动时把哑铃放回大腿，不要从头顶直接扔下。'], mistakes: ['耸肩，脖子缩起来。', '腰离开靠背大幅后仰。', '哑铃在头顶用力相撞。'] },
  '器械推举': { muscles: ['三角肌前束'], steps: ['调座椅高度，让把手与肩同高或略高，坐下后背和头贴紧靠背。', '双手正握把手，握距略宽于肩，手肘在把手正下方、略靠身体前方。', '呼气，向上推到手臂接近伸直，不锁死肘部。', '吸气，控制着下放回肩高，配重不要碰到底。'], tips: ['器械轨道固定，推不动时直接放回起点就行，没有搭子也能做到力竭。', '座椅太低时手肘会掉到肩膀以下，肩前侧发紧就把座椅调高一格。'], mistakes: ['身体离开靠背向前倾。', '耸肩，推的时候脖子缩起来。'] },
  '史密斯肩推': { muscles: ['三角肌前束'], steps: ['把直角靠背凳放进史密斯机，坐下后让杠下落时正好经过下巴前方、落到锁骨上方。', '把安全挡块调到略低于锁骨的高度；双手正握、略宽于肩，转动手腕解开挂钩。', '呼气，把杠铃沿轨道推到手臂接近伸直。', '吸气，控制着下放到下巴或锁骨高度；做完转腕挂回挂钩。'], tips: ['推不动时转腕挂钩，或让杠落在安全挡块上。', '下放时杠擦到鼻子或下巴，说明凳子太靠前，往后挪一点。'], mistakes: ['凳子太靠前或太靠后，轨道别着肩膀。', '腰离开靠背后仰。'] },
  '侧平举': { muscles: ['三角肌中束'], steps: ['站立，双脚与髋同宽，双手持哑铃垂在体侧，掌心朝向身体。', '手肘微屈并保持不变，肩膀下沉，上身可以微微前倾。', '呼气，用上臂带动把哑铃向两侧举到与肩同高，手肘和手腕大致同高。', '吸气，慢慢下放回体侧。'], tips: ['重量宁轻勿重，能慢慢放下来才算合适。', '身体总想晃，可以坐在凳子边上做，路线一样。'], mistakes: ['耸肩，用斜方肌把哑铃提上去。', '身体摆动，靠惯性把哑铃甩起来。', '举到顶端刻意内旋（小拇指朝上翻），肩膀出现挤压痛就停。'] },
  '坐姿侧平举机': { muscles: ['三角肌中束'], steps: ['调座椅高度，让肩关节与器械转轴大致对齐，坐下背贴靠垫。', '屈肘，上臂外侧抵住挡板，双手轻握把手。', '呼气，用上臂把挡板向两侧抬到与肩同高，稍停。', '吸气，控制着放回，配重不要碰到底。'], tips: ['手只是轻握，发力点在上臂外侧贴着挡板的位置。', '肩膀和转轴对不齐时挡板会蹭着手臂走，先调好座椅再加重量。'], mistakes: ['耸肩。', '身体前倾或后仰借力。'] },
  '绳索侧平举': { muscles: ['三角肌中束'], steps: ['把滑轮调到最低，装单手把手，侧身站在滑轮旁。', '用离滑轮远的那只手握把手，绳索从身前斜穿过；另一只手叉腰或扶住器械稳住身体。', '呼气，手肘微屈，把手臂向外侧举到与肩同高。', '吸气，慢慢放回身前。', '这一侧做完，转身换另一只手做同样的次数。'], tips: ['重量宁轻勿重，绳子全程都要有拉力。', '没有低位滑轮时，可以脚踩弹力带一端，用同样的方式做。'], mistakes: ['身体倒向一侧借力。', '耸肩。'] },
  '哑铃前平举': { muscles: ['三角肌前束'], steps: ['站立，双脚与髋同宽，双手持哑铃放在大腿前方，掌心朝向大腿。', '收紧腹部，手肘微屈。', '呼气，双臂同时向前举到与肩同高。', '吸气，慢慢放回大腿前。'], tips: ['也可以掌心相对（锤式握）举。', '想左右交替做，每只手都做到目标次数。'], mistakes: ['身体后仰、前后摇晃借力。', '耸肩。'] },
  '绳索前平举': { muscles: ['三角肌前束'], steps: ['低位滑轮装短直杆，背对器械站立，绳索从两腿之间穿过。', '双手正握直杆放在大腿前，手肘微屈，腹部收紧。', '呼气，向前举到与肩同高。', '吸气，控制着放回大腿前。'], tips: ['离器械远一点站，起始时绳子就有拉力。', '也可以换成绳索附件、掌心相对握着举。'], mistakes: ['耸肩。', '挺肚子、身体后仰借力。'] },
  '杠铃直立划船': { muscles: ['三角肌中束', '斜方肌上束'], steps: ['站立，双手正握杠铃，握距略宽于肩，杠铃垂在大腿前。', '收紧腹部；呼气，手肘向外向上带动，让杠铃贴着身体提到胸口高度。', '顶端手肘略高于手腕、大约与肩同高。', '吸气，慢慢下放回大腿前。'], tips: ['肩膀不舒服可以改用哑铃或绳索做，手的路线更自由。', '重量选到能让手肘带动、肩膀不跟着耸起来为准。'], mistakes: ['重量太大，靠耸肩把杠提上去。', '提得过高超过下巴；出现肩部锐痛立即停。'] },
  '俯身飞鸟': { muscles: ['三角肌后束', '菱形肌'], steps: ['双手持哑铃站立，膝盖微屈，屈髋把上身前倾到接近与地面平行，背部平直。', '哑铃自然垂在胸口下方，掌心相对，手肘微屈。', '呼气，用上臂带动把哑铃向两侧展开，展到上臂与背部大致同高。', '吸气，慢慢放回。'], tips: ['腰背撑不住时，可以胸口趴在上斜凳上做。', '重量要轻。'], mistakes: ['上身站得太直，变成了侧平举。', '起身借惯性把哑铃甩上去。', '腰背弓起；腰部不适立即停。'] },
  '反向飞鸟机': { muscles: ['三角肌后束'], steps: ['调座椅高度，让把手与肩同高，面朝器械坐，胸口贴紧靠垫。', '双手握把，手肘微屈。', '呼气，手臂向后向两侧展开，展到与身体大致在同一平面，稍停。', '吸气，控制着放回，配重不要碰到底。'], tips: ['手、肘、肩在同一高度时路线最顺；手肘往下掉就把座椅调高。', '也可以掌心相对握竖把手做，肩膀更舒服。'], mistakes: ['耸肩，肩胛骨用力往中间夹到脖子发紧。', '手肘下沉。', '回放太快，配重片砸响。'] },
  '面拉': { muscles: ['三角肌后束', '肩袖肌群'], steps: ['把滑轮调到略高于头顶，装双头绳索，面对器械站。', '双手握住绳两端，后退到手臂伸直时已有拉力。', '呼气，手肘向外向后抬高，把绳拉向脸部，绳的两端分到耳朵两侧。', '吸气，控制着伸直手臂放回。'], tips: ['重量轻一点，能把绳拉到脸前、手肘不往下掉为准。', '在家可以把弹力带挂在高处做，动作一样。'], mistakes: ['拉向胸口，变成了划船。', '手肘低于手腕。', '身体后仰借力。'] },

  // === 背部 (Back) ===
  '引体向上': { muscles: ['背阔肌', '肱二头肌'], steps: ['双手正握单杠，握距略宽于肩，身体自然悬垂，手臂伸直。', '先把肩胛骨向下、向后收，让肩膀离开耳朵，再开始屈肘。', '手肘向下、向身体两侧拉，把胸口拉近单杠，直到下巴高过横杠。', '控制着慢慢下放，回到手臂接近伸直的悬垂位置，再做下一次。', '做完一组，双脚踩回踏台或轻轻落地后再松手。'], tips: ['拉不满次数时脚踩弹力带助力，或先换助力引体向上机。', '能稳定做满次数后，再用负重腰带挂杠铃片或双脚夹哑铃加重。', '手心出汗容易滑，握杠前擦干或用防滑粉。'], mistakes: ['身体前后摆荡，借惯性把自己甩上去。', '只做半程：下放不到底，或下巴没过杠。', '耸肩、伸脖子去够杠；肩或肘出现锐痛立即停。'] },
  '助力引体向上机': { muscles: ['背阔肌'], steps: ['先选助力配重：配重越重越省力，第一次从偏重的助力试起。', '踩上台阶，双手宽握上方把手，一侧膝盖先跪到垫板上，再放另一侧，手臂伸直悬垂。', '肩胛骨下沉，手肘向下、向两侧拉，把身体拉到下巴高过把手。', '控制着下落到手臂接近伸直，不让垫板把你弹上去。', '做完一组，先一只脚踩回台阶，再放另一只，最后松手。'], tips: ['能稳定做满次数后，下次把助力配重调小一格，助力越小越接近徒手引体向上。', '站在踏板上的机型做法相同，双脚并拢踩稳踏板。'], mistakes: ['下落太快，被垫板弹起来。', '膝盖没跪稳就开始拉，从垫板上滑脱。', '耸肩、只用手臂拉；肩部出现锐痛立即停。'] },
  '高位下拉': { muscles: ['背阔肌外侧'], steps: ['面对拉力器坐好，有大腿挡板就把挡板压在膝盖上方，演示里的长凳没有挡板，就双脚踩实地面。', '双手正握直杆，握距比肩宽，挺胸，上身略向后仰。', '肩胛骨先下沉，再屈肘把杆从头前垂直拉到锁骨前方。', '在底部稍停、肩胛骨向中间夹，再控制着让杆回到手臂伸直的位置。'], tips: ['想象把手肘往下、往后放进裤兜，背部发力更明显。', '下拉时挺胸迎向横杆，眼睛看斜上方。', '加重就加配重片，动作变形就减回来。'], mistakes: ['后仰过大，用体重把杆压下来。', '把杆拉到腹部，或拉到颈后。', '耸肩用手臂硬拉；肩部出现锐痛就停。'] },
  '坐姿划船': { muscles: ['中背部', '菱形肌', '背阔肌'], steps: ['坐在低位拉力器前，双脚踩实踏板，膝盖微屈，双手握住把手（V把或直杆都可以），手臂前伸，上身跟着稍向前倾，背部保持平直。', '先把上身挺直到与地面接近垂直，挺胸收腹，肩胛骨往后收。', '再屈肘把把手拉向肚脐，手肘贴着身体两侧向后走，上身停在垂直位置，不再往后仰。', '停一下挤压肩胛骨中间，再控制着把手臂伸回前方，上身随之稍前倾回到起始位置，背始终平直。', '做完一组把把手送回前方，让配重落稳再松手。'], tips: ['没有拉力器就用弹力带：坐在地上把带子绕过脚底，做法相同。', '身体被拉得往前倒，说明配重太重，先减。'], mistakes: ['上身往后仰过垂直，靠后仰把配重拉回来。', '前倾时弓背驼背，或耸肩。', '下背出现疼痛就停，检查是不是弓背了。'] },
  'T把划船': { muscles: ['背阔肌厚度', '中背'], steps: ['双脚踩在T把划船机的踏板上，与髋同宽；没有专用机就跨立在杠铃两侧。', '屈膝屈髋俯身，背部平直，胸口朝前下方，双手握住把手，手臂伸直。', '肩胛骨后收，手肘向后拉，把把手拉向胸腹交界处。', '停一下，再控制着放回到手臂伸直，背部形状全程不变。'], tips: ['宽握把时手肘向外，窄握把时手肘贴身，两种都可以。', '下背容易累就先减重，或改做胸口有支撑的杠铃斜板划船。'], mistakes: ['弓背，或拉的时候猛地抬起上身。', '站得太直，动作变成耸肩。', '下背出现锐痛立即停。'] },
  '杠铃斜板划船': { muscles: ['中背', '菱形肌'], steps: ['把上斜凳调到中等角度，胸口和腹部趴在凳面上，双脚在凳后撑地。', '双手正握杠铃，握距略宽于肩，手臂自然垂直向下。', '肩胛骨先往后收，再屈肘把杠铃拉向胸部下方。', '停一下，再控制着放回到手臂伸直，胸口始终贴着凳面。', '做完一组先把杠铃放回地上或架子上，再起身。'], tips: ['杠铃放在地上够不着时，把杠铃搁在两块垫高的杠铃片上，方便取杠。', '加片每次小幅加，胸口离开凳面就是太重了。'], mistakes: ['胸口离开凳面，抬上身借力。', '耸肩，把杠铃往脖子方向拉。', '肩部或下背出现锐痛就停。'] },
  '哑铃单臂划船': { muscles: ['背阔肌下沿'], steps: ['左手和左膝撑在平凳上，右脚踩地，背部平直，接近与地面平行。', '右手持哑铃，手臂自然下垂，掌心朝向身体。', '手肘贴着身体向后上方拉，把哑铃拉向侧腰。', '停一下，再控制着放回到手臂伸直。', '这一侧做完规定次数，换右手右膝撑凳，左手持铃做同样次数。'], tips: ['没有凳子，可以一手扶在齐腰高的台面上俯身做。', '两侧力量不一样时，以弱侧能完成的次数为准。'], mistakes: ['上身扭转，借转体把哑铃甩上来。', '把哑铃直着往胸口拉。', '下背出现疼痛就停。'] },
  '俯身划船': { muscles: ['中背', '背阔肌厚度'], steps: ['双脚与肩同宽，膝盖微屈，屈髋俯身到上身接近与地面平行，背部平直。', '双手正握杠铃，握距略宽于肩，手臂自然下垂。', '肩胛骨后收，手肘向后拉，把杠铃拉向肚脐到下胸之间。', '停一下，再控制着放回到手臂伸直，上身角度全程不变。'], tips: ['只有哑铃时，双手各持一只哑铃，做法相同。', '反握时手肘更贴身，正握时手肘稍向外，两种都可以。', '下背容易累，先减重或改做胸口有支撑的杠铃斜板划船。'], mistakes: ['弓背。', '每拉一次上身就抬起来借力。', '下背出现锐痛立即停。'] },
  '绳索直臂下压': { muscles: ['背阔肌'], steps: ['高位滑轮装上直杆，面对器械站立，双脚与肩同宽，后退一小步让绳索绷紧。', '双手正握直杆，手臂伸直，肘部不锁死，杆在胸前高度。', '上身直立或略前倾，肩胛下沉，用背部把杆沿弧线压到大腿前方。', '停一下，再控制着让杆回到胸前高度，手臂角度全程不变。'], tips: ['也可以换成绳索把手，压到底时两端向外分开一点。', '感觉不到背在用力，就减重量、放慢速度。'], mistakes: ['下压时弯曲手肘，变成三头肌下压。', '身体上下起伏借力。', '肩部出现锐痛就停。'] },
  '直臂下压机': { muscles: ['背阔肌', '前锯肌'], steps: ['调好座椅，让肩膀与器械转轴大致对齐，背靠靠垫坐好，有安全带就系上。', '双手握住头部上方的把手，手肘弯曲，这个弯曲角度全程保持不变；有肘垫的机型就把上臂贴住肘垫。', '肩胛下沉，用背部把把手沿弧线向前下方拉到胸前。', '停一下，再控制着让把手回到头部上方，腋下有被拉开的感觉，肩不疼。'], tips: ['肘垫款主要靠上臂压垫发力，手只轻扶把手。', '回到头顶时肩前侧发紧，就缩小回程幅度。'], mistakes: ['拉的过程中手肘越弯越多，把动作变成了下拉或划船。', '回程太快，让配重砸下来。', '肩关节出现锐痛立即停。'] },
  '山羊挺身': { muscles: ['竖脊肌', '臀大肌', '腘绳肌'], steps: ['调好罗马椅高度，让挡板在大腿根、髋骨下方，双脚固定在脚垫下。', '双手交叉放在胸前，身体从头到脚成一直线。', '保持背部平直，以髋为轴向下俯身到能控制的最低点。', '用臀部和腰背发力挺起，回到身体成一直线就停，不向后仰。'], tips: ['想加重就胸前抱一片杠铃片或哑铃。', '挡板太高会卡住髋部俯不下去，往下调一格。'], mistakes: ['顶端过度后仰。', '下放太快，在底部弹起来。', '腰部出现锐痛立即停。'] },
  '弹力带划船': { muscles: ['中背', '菱形肌'], steps: ['坐在地上或带靠背的矮凳上，双腿向前伸直，弹力带中段绕过脚底。', '双手各握一端，掌心相对，挺胸坐直，手臂伸直时带子已经微微绷紧。', '肩胛骨后收，手肘贴身向后拉，把手拉到腰侧。', '停一下，再控制着让手回到前方。'], tips: ['想加大阻力，手握在离脚更近的位置，或换更粗的带子。', '坐不直可以背靠墙或沙发做。'], mistakes: ['弓背驼背。', '回程让带子把手猛地拽回去。', '下背或肩部出现锐痛就停。'] },

  // === 手臂 (Biceps & Triceps) ===
  '杠铃弯举': { muscles: ['肱二头肌'], steps: ['站立，双脚与髋同宽，双手反握杠铃，握距约与肩同宽，杠铃垂在大腿前。', '上臂贴住身体两侧，肩膀放松。', '呼气，弯曲手肘把杠铃举到胸前，稍停。', '吸气，慢慢放回到手臂接近伸直。'], tips: ['手腕不舒服可以改用 EZ 曲杠。', '身体总想晃，可以背靠墙站着做。'], mistakes: ['身体前后摇晃借力。', '手肘向前移动离开身体。'] },
  '哑铃弯举': { muscles: ['肱二头肌'], steps: ['站立，双手各持哑铃垂在体侧，掌心朝前，上臂贴住身体。', '呼气，一只手弯曲手肘把哑铃举到肩前，另一只手保持不动。', '吸气，慢慢放回到手臂伸直，再换另一只手。', '左右交替，每只手都做到目标次数。'], tips: ['坐在凳上做更不容易借力。', '也可以从掌心朝内开始，举起过程中把掌心转向上。'], mistakes: ['下放时一下掉下去，没有控制。', '身体左右扭动借力。'] },
  '牧师椅杠铃弯举': { muscles: ['肱二头肌下部'], steps: ['调座椅高度，坐下后腋窝贴住斜垫顶端，上臂平贴在斜垫上。', '双手反握杠铃，握距约与肩同宽。', '呼气，弯举杠铃到前臂接近垂直，稍停。', '吸气，慢慢放下到手臂接近伸直，不要完全锁死。'], tips: ['手腕不舒服可以用 EZ 曲杠。', '底部放慢一点，不要靠肘关节卡住来休息。'], mistakes: ['屁股离开座位借力。', '底部突然放松，让重量把肘关节拽直；肘部锐痛立即停。'] },
  '器械弯举': { muscles: ['肱二头肌'], steps: ['调座椅高度，让上臂平放在垫板上、手肘对准器械转轴。', '双手反握把手，背挺直。', '呼气，弯曲手肘把把手拉起，稍停。', '吸气，慢慢放回到手臂接近伸直，配重不碰到底。'], tips: ['手肘没对准转轴时动作会别扭，先调好座椅再加重量。', '手腕保持立直，不要向里勾。'], mistakes: ['速度过快，靠惯性甩。', '上臂离开垫板，身体后仰。'] },
  '集中弯举': { muscles: ['肱二头肌肌峰'], steps: ['坐在凳子边缘，双腿分开，单手持哑铃。', '上身前倾，持哑铃那只手的上臂后侧靠近手肘处抵在同侧大腿内侧，手臂自然下垂。', '呼气，弯举哑铃到肩前，稍停。', '吸气，慢慢放下到手臂接近伸直。', '这一侧做完目标次数，换另一只手。'], tips: ['另一只手撑在另一侧大腿上稳住身体。', '上身前倾的角度全程保持不变。'], mistakes: ['用大腿向上顶手肘借力。', '上身跟着抬起来。'] },
  '斜板哑铃弯举': { muscles: ['肱二头肌长头'], steps: ['把靠背调到 45–60 度，坐下背贴靠背，双手持哑铃自然下垂，掌心朝前。', '上臂保持垂直地面，肩膀贴住靠背。', '呼气，弯举哑铃到肩前。', '吸气，慢慢放回到手臂伸直。'], tips: ['重量要比站姿弯举轻；肩前侧拉扯太强就把靠背调高一点。', '靠背调得越低，起始时手臂越靠后、越难，先从较高的角度开始。'], mistakes: ['弯举时上臂向前抬。', '头和肩离开靠背。'] },
  '锤式弯举': { muscles: ['肱肌', '肱桡肌（前臂）'], steps: ['站立，双手各持哑铃垂在体侧，掌心相对（像握锤子）。', '上臂贴住身体不动。', '呼气，一只手弯举到肩前，掌心始终相对。', '吸气，慢慢放回，再换另一只手；每只手都做到目标次数。'], tips: ['也可以双手同时做。', '也可以把哑铃举向对侧肩前，做斜向的锤式弯举。'], mistakes: ['手腕翻转，变成普通弯举。', '身体晃动借力。'] },
  '绳索弯举': { muscles: ['肱二头肌'], steps: ['低位滑轮装直杆，面对器械站，离器械约半步，双手反握，握距与肩同宽。', '上臂贴住身体两侧。', '呼气，弯举到胸前，稍停。', '吸气，控制着放回到手臂接近伸直。'], tips: ['换成绳索附件、掌心相对，就是绳索锤式弯举。', '想全程有拉力，站的位置让起始时绳子已经绷紧。'], mistakes: ['站得太远，身体被拽得前倾。', '手肘前移、身体后仰借力。'] },
  '绳索过头弯举': { muscles: ['肱二头肌短头'], steps: ['两侧滑轮调到高于肩，各装一个单手把手，站在龙门架正中间。', '双手各握一个把手，手臂向两侧平伸成一字，掌心朝上。', '呼气，上臂保持水平不动，弯曲手肘把把手拉向头部两侧，稍停。', '吸气，慢慢伸直手臂放回。'], tips: ['站不稳可以一脚在前站成小弓步。', '两边把手的重量要一样，左右手才能对称发力。'], mistakes: ['上臂往下掉。', '耸肩。'] },

  '绳索下压': { muscles: ['肱三头肌外侧头'], steps: ['高位滑轮装直杆（或 V 把、绳索），面对器械站，膝盖微屈，上身稍前倾。', '双手正握，上臂贴住身体两侧，前臂大约与地面平行。', '呼气，只动前臂，把杆向下压到手臂伸直，稍停。', '吸气，慢慢放回到前臂与地面平行。'], tips: ['用绳索附件时，压到底可以把绳的两头向外分开。', '站得离器械近一点，杆落下时贴着身体前方走。'], mistakes: ['上臂前后摆动借力。', '含胸、用体重往下压。'] },
  '器械三头下压': { muscles: ['肱三头肌'], steps: ['调座椅高度，坐下背贴靠垫，双脚踩地。', '双手握住身体两侧的把手，手肘向后、贴近身体。', '呼气，向下推到手臂伸直，稍停。', '吸气，慢慢放回到手肘大约成直角。'], tips: ['回放幅度以肩前侧没有压迫感为准。', '座椅调到推到底时手刚好在臀部两侧，路线最顺。'], mistakes: ['耸肩往下压。', '手肘向两侧外翻。', '回放过深，肩前侧受压；出现锐痛立即停。'] },
  '绳索过头臂屈伸': { muscles: ['肱三头肌长头'], steps: ['低位滑轮装绳索，双手握住绳的两端，转身背对器械，把绳从肩后拉到头后。', '站直，双脚与肩同宽，上臂贴近耳朵两侧，手肘朝前上方，前臂在头后弯曲。', '呼气，上臂不动，把前臂向正上方伸直。', '吸气，慢慢屈肘放回头后，上臂后侧有拉伸感。'], tips: ['也可以用高位滑轮，背对器械弓步前倾，向前上方伸直。', '肩膀活动度不够、手肘夹不住，就把重量减轻或改做绳索下压。'], mistakes: ['上臂跟着前臂上下摆动。', '腰后仰、肋骨外翻。'] },
  '哑铃臂屈伸': { muscles: ['肱三头肌长头'], steps: ['坐在有靠背的凳上，背贴靠背，双手托住一只哑铃的一端，举到头顶正上方。', '上臂贴近耳朵，手肘朝上。', '吸气，屈肘把哑铃放到脑后，上臂后侧有拉伸感。', '呼气，伸直手臂把哑铃举回头顶。'], tips: ['双手虎口交叠托住哑铃，哑铃在头顶，务必握牢。', '肩膀活动度不够、手肘夹不住，就改做绳索下压。'], mistakes: ['手肘向两侧大幅打开。', '腰离开靠背后仰。'] },
  '俯身单臂哑铃臂屈伸': { muscles: ['肱三头肌'], steps: ['不持哑铃那一侧的手和膝盖撑在平板凳上，上身与地面平行，另一只脚踩地。', '另一只手持哑铃，上臂贴住身体并与地面平行，手肘弯成直角。', '呼气，上臂不动，把前臂向后伸直，稍停。', '吸气，慢慢放回到直角。', '这一侧做完目标次数，换另一侧撑凳、换手做。'], tips: ['伸直时前臂可以略高于背部。', '支撑那只手的手掌在肩膀正下方，背部保持平直。'], mistakes: ['靠甩的惯性把哑铃抛到后面。', '上臂往下掉。', '腰背塌陷。'] },
  '双杠臂屈伸': { muscles: ['肱三头肌', '胸大肌下部'], steps: ['双手握住双杠，踩台阶或轻跳撑起身体，手臂伸直，肩膀下沉。', '身体保持直立，双腿自然下垂或屈膝交叉在身后。', '吸气，屈肘下放身体，手肘向后贴近身体，下放到上臂约与地面平行。', '呼气，推杠把身体撑回手臂伸直。', '做完踩回台阶再下来，不要直接跳下。'], tips: ['徒手做不了，先用助力器械或弹力带辅助。', '徒手轻松后，可以用负重腰带挂片或双脚夹哑铃加重。', '上身前倾、手肘外开会更偏胸。'], mistakes: ['下放过深，肩前侧压力过大；肩部锐痛立即停。', '耸肩，肩膀缩到耳朵边。', '在底部快速弹起。'] },
  '助力双杠臂屈伸': { muscles: ['肱三头肌'], steps: ['选好助力配重（越重越轻松），踩上台阶，双手握把，双膝跪到托垫上。', '手臂伸直撑起，肩膀下沉，身体保持直立。', '吸气，屈肘下放到上臂约与地面平行。', '呼气，推起到手臂伸直；做完先踩回台阶再松手。'], tips: ['进步的方向是助力配重越来越轻。', '每次下放到同样深度，记录的配重才有可比性。'], mistakes: ['借托垫的反弹向上跳。', '耸肩。'] },
  '窄距杠铃卧推': { muscles: ['肱三头肌', '胸大肌内侧'], steps: ['仰卧在卧推凳上，眼睛在杠铃正下方，双脚踩实。', '双手正握，握距约与肩同宽，肩胛骨收紧，把杠推离架钩移到肩膀正上方。', '吸气，手肘贴着身体两侧，把杠铃下放到胸骨下部。', '呼气，推起到手臂接近伸直；做完把杠挂回架钩。'], tips: ['握距不要太窄，双手不要靠在一起，否则手腕吃力。', '找不到搭子，就改到带保护杠的深蹲架里做，保护杠调到躺下后略低于胸口的位置；普通卧推架没有保护杠，不要一个人做到推不动。'], mistakes: ['手肘向两侧打开，变成了普通卧推。', '杠铃砸在胸口借反弹推起。'] },
  '仰卧臂屈伸': { muscles: ['肱三头肌（全头）'], steps: ['仰卧在平板凳上，双脚踩实，双手各持一只哑铃举在胸口上方，掌心相对。', '上臂保持接近垂直地面，固定不动。', '吸气，屈肘把哑铃慢慢放到额头两侧。', '呼气，伸直手臂把哑铃推回胸口上方。', '做完先把哑铃收到胸口，再坐起放下。'], tips: ['也可以用 EZ 曲杠做，路线相同；杠很重时请人站在头后方递杠、接杠。', '推不起来时，屈肘让哑铃沿脸侧移到肩膀两侧，再收到胸口坐起。', '肘部不舒服就减轻重量，或改做绳索下压。'], mistakes: ['上臂前后摆动，变成了仰卧推举。', '手肘向两侧打开。', '肘部出现锐痛立即停。'] },

  // === 腿部与臀部 (Legs & Glutes) ===
  '杠铃深蹲': { muscles: ['股四头肌', '臀大肌', '腘绳肌', '核心'], steps: ['在深蹲架里把杠铃放在略低于肩的高度并设好保护杠；钻到杠下，把杠放在上背斜方肌上，双手略宽于肩握紧。', '伸髋伸膝把杠铃抬离架钩，后退两三小步，双脚与肩同宽，脚尖略向外。', '深吸气收紧腹部，臀部向后坐同时屈膝下蹲，膝盖顺着脚尖方向，蹲到大腿至少与地面平行。', '脚掌踩实发力站起，过了最费力的位置再呼气，站直后吸气做下一次。', '做完最后一次向前走回架子，确认杠铃两端都碰到立柱后再放到架钩上。'], tips: ['也可以把杠放在肩后三角肌上（低杠），上身会更前倾，选定一种后固定下来。', '重心放在脚掌中部，杠铃在脚掌中部上方垂直上下。', '加重时小幅加，动作变形就退回上次的重量。'], mistakes: ['膝盖向内扣。', '下蹲时含胸弓背、腰部变圆。', '只蹲一半深度；腰或膝出现锐痛立即停。'] },
  '颈前杠铃深蹲': { muscles: ['股四头肌', '核心'], steps: ['在深蹲架里把杠铃放在略低于肩的高度并设好保护杠；走到杠前，让杠贴住锁骨和三角肌前侧。', '双臂在胸前交叉，双手搭在对侧肩上压住杠铃，手肘向前抬高到接近与地面平行。', '把杠铃抬离架钩，后退两三小步，双脚与肩同宽，脚尖略向外。', '吸气收紧腹部，躯干直立、手肘保持抬高，屈膝下蹲到大腿至少与地面平行，再脚掌发力站起。', '做完向前走回架子，确认杠铃碰到立柱后再放下。'], tips: ['手腕柔韧够的话，也可以用前架式：手指在肩外侧勾住杠，手肘同样抬高。', '先用空杠练熟握法，重量通常比背杠深蹲轻不少。', '站不起来时把杠铃向前推离身体、人往后退，让杠落到保护杠上。'], mistakes: ['手肘往下掉，杠铃向前滑。', '上身前倾、塌胸。', '手腕或肩部出现锐痛就停，换交叉握法或减重。'] },
  '史密斯深蹲': { muscles: ['股四头肌', '臀大肌'], steps: ['把史密斯机的安全挡块调到略低于你蹲到底时杠铃的高度。', '站到杠下，杠铃放在上背斜方肌上，双手略宽于肩握杠；双脚约肩宽，站在杠铃正下方或略前半步。', '转动杠铃把挂钩转出卡槽解锁，吸气收紧腹部，屈髋屈膝下蹲到大腿与地面平行。', '脚掌踩实推起，站直后呼气。', '做完转动杠铃把挂钩挂回最近的卡槽，确认挂稳再松手。'], tips: ['双脚越往前越偏臀部发力，越靠近杠下越偏大腿前侧。', '前移半步以内即可，太靠前下背容易离开中立。', '先用轻重量找好站位再加重。'], mistakes: ['双脚位置不对，蹲到底时脚跟抬起或膝盖明显超出脚尖。', '完全靠轨道撑着，腹部不收紧、腰塌下去。', '膝或腰出现锐痛就停。'] },
  '倒蹬机': { muscles: ['股四头肌', '臀大肌'], steps: ['坐进倒蹬机，背部和臀部贴紧靠垫，双脚约肩宽踩在踏板中部。', '双腿把踏板推起一点，双手扳开两侧的安全锁把手。', '吸气，屈膝让踏板慢慢下降，降到膝盖约 90 度或臀部即将离开靠垫之前停住。', '呼气，全脚掌踩实把踏板蹬回去，膝盖保持微屈不锁死。', '做完把踏板推到顶，扳回安全锁把手，确认锁住后再收腿。'], tips: ['双脚放高一些更偏臀部和大腿后侧，放低一些更偏大腿前侧。', '膝盖对准脚尖方向，脚尖可略向外。', '先用轻重量找好下放深度再加重。'], mistakes: ['推到顶时膝盖完全伸直锁死。', '下放太深，臀部和下背被卷离靠垫。', '膝或腰出现锐痛就停。'] },
  '钟摆深蹲': { muscles: ['股四头肌'], steps: ['站上钟摆深蹲机踏板，背部贴紧靠板，肩膀顶在肩垫下，双手握住两侧把手。', '双脚约肩宽踩在踏板中部，打开安全锁。', '吸气，慢慢屈膝下蹲，机器会带着你沿向后下方的弧线移动，蹲到大腿平行或更深。', '呼气，全脚掌踩实把机器推回起始位置，膝盖不锁死。', '做完把安全锁扣回再离开机器。'], tips: ['蹲到底时脚跟抬起，就把双脚在踏板上往前挪一点。', '先用轻重量找到舒服的下蹲深度，再逐步加重。'], mistakes: ['脚踩得太靠后，蹲到底脚跟抬起。', '下蹲太快，在底部借反弹。', '膝或腰出现锐痛就停。'] },
  '哈克深蹲': { muscles: ['股四头肌外侧'], steps: ['背靠哈克深蹲机靠垫，肩膀顶在肩托下，双手握住把手；双脚约肩宽踩在踏板中部，脚尖略向外。', '伸腿把机器推起一点，打开安全把手。', '吸气，慢慢屈膝下蹲到大腿与踏板平行或更低，背部全程贴住靠垫。', '呼气，脚掌踩实把机器推回去，膝盖不锁死；做完扳回安全把手锁住再离开。'], tips: ['双脚放低一些更偏大腿前侧，放高一些臀部参与更多。', '先用轻重量找到背部能全程贴住靠垫的下蹲深度，再逐步加重。'], mistakes: ['膝盖内扣。', '下蹲太快，在底部反弹。', '膝盖出现锐痛就停，减重或减小深度。'] },
  '腿屈伸': { muscles: ['股四头肌'], steps: ['坐上腿屈伸机，调整靠背让膝盖对准器械转轴，脚踝挡板压在小腿下端、脚踝上方。', '双手握住座位两侧把手，背贴靠背，臀部坐稳。', '呼气，伸膝把小腿向上抬到接近伸直，顶端停一下。', '吸气，控制着慢慢放回，配重片不要碰撞。'], tips: ['顶端停顿时大腿前侧用力收紧，不要靠甩。', '膝盖不舒服可以减重，或只在膝盖舒服的角度范围内做。'], mistakes: ['重量太大，身体从座位上弹起。', '放下太快，让配重片砸下。', '膝盖前侧出现锐痛就停。'] },
  '保加利亚分腿蹲': { muscles: ['股四头肌', '臀大肌'], steps: ['双手各持一只哑铃垂在体侧，背对平凳站立，把一只脚的脚背搭在凳面上。', '另一只脚向前迈出，站到下蹲时前膝大致在脚踝正上方的位置。', '吸气，前腿屈膝下蹲到前侧大腿与地面平行，后膝接近但不碰地。', '呼气，前脚全脚掌踩实、脚跟发力推起；做完一侧次数再换另一条腿在前。'], tips: ['上身直立更偏大腿前侧，上身稍前倾更偏臀部。', '平衡不好先不拿哑铃，或一手扶墙。', '凳子太高时换矮一些的台阶。'], mistakes: ['前脚离凳子太近，前脚跟抬起。', '后腿用力蹬凳借力。', '前膝或后腿髋前侧出现锐痛就停。'] },
  '哑铃弓步蹲': { muscles: ['股四头肌', '臀大肌'], steps: ['双手各持一只哑铃垂在体侧，双脚与髋同宽站立。', '一条腿向前迈出一大步，双膝同时弯曲下蹲，蹲到前大腿接近平行、后膝接近但不碰地。', '前脚全脚掌踩实发力，蹬回起始站姿。', '换另一条腿迈步，左右交替，每条腿都做够目标次数算 1 组。'], tips: ['平衡不好先不拿哑铃，练熟再加重。', '步幅以下蹲时两膝都能接近直角为准。', '场地够长也可以向前行进着交替。'], mistakes: ['后膝重重砸到地上。', '前脚跟抬起，只用前脚掌发力。', '膝盖出现锐痛就停。'] },
  '高脚杯深蹲': { muscles: ['股四头肌', '臀大肌', '核心'], steps: ['双手托住哑铃上端，让哑铃竖直贴在胸前，手肘朝下。', '双脚与肩同宽，脚尖略向外，挺胸收紧腹部。', '吸气，臀部向后下方坐，蹲到手肘碰到膝盖内侧或大腿与地面平行。', '呼气，脚掌踩实站起。'], tips: ['也可以用壶铃，做法见「壶铃高脚杯深蹲」。', '重物放在身前时，上身更容易保持直立。', '没有哑铃时先徒手练动作，双手在胸前合拢。'], mistakes: ['哑铃离身体太远，手臂和肩先累。', '弯腰驼背。', '膝盖出现锐痛就停。'] },

  '罗马尼亚硬拉': { muscles: ['腘绳肌', '臀大肌', '竖脊肌'], steps: ['杠铃从地上按硬拉方式拉起或从架子上取下（哑铃版每手一只），站直，双脚与髋同宽，双手正握，握距略宽于腿。', '膝盖微屈后固定住这个角度，吸气，臀部向后推，上身随之前倾，背部保持平直。', '杠铃贴着大腿往下滑，下放到大腿后侧明显拉紧、背还能保持平直的位置，通常在膝盖下方到小腿中段。', '臀部向前推、站直，到顶端夹紧臀部，呼气。', '做完最后一次，屈膝下蹲把杠铃放回地面或挂回架子。'], tips: ['重点是臀部向后推，而不是弯腰把重量往下放。', '头颈跟着背部一起前倾，眼睛看前下方地面。', '加重时小幅加，下放变浅或背开始变圆就退回上次重量。'], mistakes: ['背部弯曲、圆肩。', '膝盖越弯越多，变成半个深蹲。', '腰部出现锐痛立即停。'] },
  '传统硬拉': { muscles: ['后链全身肌群', '背部', '核心'], steps: ['杠铃放在地上，双脚与髋同宽站在杠下，杠铃在脚掌中部正上方。', '屈髋屈膝下去，双手正握（或一正一反）握住杠铃，握距略宽于腿，小腿贴近杠铃，背部挺直。', '深吸气收紧腹部，双腿蹬地，杠铃贴着小腿和大腿上行，过膝后髋部向前推。', '站直后夹紧臀部，不要向后仰。', '臀部先向后推、杠铃贴腿下行，过膝后再屈膝，把杠铃放回地面。'], tips: ['想着用脚把地板往下推，而不是用手把杠铃往上拔。', '手臂只负责挂住杠铃，全程伸直。', '加重时小幅加，起杠时背先弯就退回上次重量。'], mistakes: ['弓背拉起。', '起步时臀部先抬高，变成直腿用腰拉。', '腰部出现锐痛立即停，放下杠铃。'] },
  '臀推': { muscles: ['臀大肌', '腘绳肌'], steps: ['坐在地上，背靠长凳，让肩胛骨下沿抵住凳边；把杠铃滚到髋部折痕处，中间垫好护垫。', '屈膝，双脚与肩同宽踩实地面，双手握住髋两侧的杠铃。', '下巴微收、眼睛看前方，脚跟用力踩地，把髋向上顶到肩、髋、膝成一条线，顶端小腿大致垂直地面。', '在顶端夹紧臀部停一两秒，再慢慢下放，臀部接近地面再做下一次。'], tips: ['顶端小腿不垂直就调脚位：脚太远腿后侧发酸，太近大腿前侧发酸。', '凳子要靠墙或固定住，防止推的时候滑走。', '加重时小幅加；也可以把一只哑铃横放在髋上做。'], mistakes: ['顶端仰头挺腰，腰往上拱。', '下放太快，杠铃砸在髋上。', '腰部出现锐痛就停；髋骨被压得疼就加厚护垫。'] },
  '史密斯臀推': { muscles: ['臀大肌'], steps: ['把长凳横放在史密斯机前，背靠长凳坐在地上，让杠在髋部正上方；杠上套好护垫。', '肩胛骨下沿抵住凳边，屈膝双脚踩地，把杠落到髋部折痕处。', '双手握杠，顶髋把杠抬起一点，转动杠铃让挂钩离开卡槽解锁。', '脚跟踩地顶髋到肩、髋、膝成一条线，顶端夹紧臀部，再慢慢下放，臀部接近地面再做下一次。', '做完最后一次在顶端把杠转回去挂进最近的卡槽，再从杠下出来。'], tips: ['开始前用空杠试一次，确认杠的轨迹正好落在髋部折痕上。', '把保护挡块调到臀部接近地面的高度，推不起来时杠会停在挡块上。', '加重时小幅加，顶不到一条线就退回上次重量。'], mistakes: ['长凳离杠太远或太近，杠压在肚子或大腿上。', '顶端仰头挺腰。', '腰或髋骨出现锐痛就停。'] },
  '腿弯举': { muscles: ['腘绳肌'], steps: ['调好器械，让膝盖在垫子边缘外、对准器械转轴；俯卧，脚踝后侧卡在滚垫下。', '双手握住前方把手，髋部压实垫子。', '小腿用力向臀部方向弯起，弯到最大幅度停一下。', '慢慢放回到腿接近伸直，再做下一次。'], tips: ['放回时脚尖可以绷直，弯起时脚尖勾起。', '滚垫压在小腿下端、脚踝上方，不要压在跟腱上。', '加重时小幅加，臀部开始离垫就退回上次重量。'], mistakes: ['发力时臀部翘起离开垫子。', '放回时让配重直接砸下去。', '膝后出现锐痛或抽筋就停。'] },
  '坐姿腿弯举': { muscles: ['腘绳肌'], steps: ['调好靠背，让膝盖对准器械转轴；坐下后小腿后侧放在滚垫上方。', '放下大腿压板，压紧在膝盖上方，双手握住两侧把手。', '小腿用力向下、向后压，弯到最大角度停一下。', '慢慢放回到腿接近伸直，再做下一次。'], tips: ['背始终贴住靠垫，上身不要前后晃。', '加重时小幅加，弯不到原来的幅度就退回上次重量。'], mistakes: ['大腿压板没压紧，身体在座位上移动。', '放回时让配重直接砸下去。', '膝后出现锐痛或抽筋就停。'] },
  '站姿单腿弯举机': { muscles: ['腘绳肌'], steps: ['调好器械，让膝盖对准转轴；面朝器械站立，双手握住前方把手。', '一侧大腿前侧贴紧靠垫，脚踝后侧钩在滚垫下，另一条腿站稳。', '工作腿小腿向后上方勾起，弯到最大幅度停一下，大腿始终贴住靠垫。', '慢慢放回到腿接近伸直，做完一侧次数再换另一条腿。'], tips: ['支撑腿膝盖微屈，不要锁死。', '加重时小幅加，大腿离开靠垫就退回上次重量。'], mistakes: ['上身前倾、髋部翘起借力。', '放回时让配重直接砸下去。', '膝后出现锐痛或抽筋就停。'] },
  '绳索后踢腿': { muscles: ['臀大肌'], steps: ['把脚踝套扣在低位绳索上，套在一侧脚踝。', '面朝绳索机站立，双手扶住机架，躯干保持直立或只微微前倾，支撑腿膝盖微屈。', '工作腿膝盖基本伸直（可以微屈），向后踢到臀部收紧的位置，停一下。', '慢慢放回到双脚并拢附近，做完一侧次数再把脚踝套换到另一侧。'], tips: ['踢腿高度不用追求，臀部收紧了就到位。', '站得离机器远一点，放回时绳索仍有张力。', '加重时小幅加，开始塌腰甩腿就退回上次重量。'], mistakes: ['塌腰把腿甩得更高。', '身体跟着腿前后大幅摇摆。', '腰部出现锐痛就停。'] },
  '器械外展机': { muscles: ['臀中肌', '臀小肌'], steps: ['调好座椅，坐上外展机，背贴靠背，双脚踩在脚踏上，大腿外侧贴住挡板。', '双手握住两侧把手。', '呼气，双腿向外打开到最大幅度，停一下。', '吸气，慢慢并拢，配重片不要碰撞。'], tips: ['本馆若没有这台机器，用「站姿绳索单腿外展」替代。', '上身也可以稍向前倾做，选一种姿势固定下来。', '先用轻重量找到全程可控的幅度。'], mistakes: ['身体前后摇晃借力。', '并拢太快让配重片砸下。', '髋部出现锐痛就停。'] },
  '臀桥': { muscles: ['臀大肌', '核心'], steps: ['仰卧在垫子上，屈膝，双脚与髋同宽踩地，脚跟离臀部约一拳，双臂放体侧、掌心朝下。', '收紧腹部，脚跟用力踩地，把髋部顶起，直到肩、髋、膝成一条斜线。', '在顶端夹紧臀部停一下，不要把腰往上拱。', '慢慢把髋放回到臀部接近地面，再做下一次。'], tips: ['加重时把一只哑铃或一根垫好护垫的杠铃横放在髋部，双手扶稳。', '进阶可做单腿臀桥：一条腿伸直抬起，另一条腿发力。'], mistakes: ['推得过高，腰向上拱。', '脚离臀部太远，腿后侧抽筋。', '腰部出现锐痛就停。'] },
  '弹力带蚌式开合': { muscles: ['臀中肌'], steps: ['迷你弹力带套在膝盖上方，侧卧在垫子上，下方手臂枕在头下，屈髋屈膝约 45 度，双膝双脚叠放。', '上方手扶在髋部，确认骨盆垂直地面。', '双脚保持贴在一起，把上方膝盖向上打开，开到骨盆要跟着后翻之前停一下。', '慢慢合拢；做完一侧次数后翻身换边。'], tips: ['没有弹力带先徒手练。', '打开幅度不用大，骨盆不动比幅度更重要。', '可以放在深蹲、硬拉之前做热身。'], mistakes: ['打开膝盖时骨盆跟着向后翻。', '双脚分开。', '髋部出现锐痛就停。'] },

  // === 小腿 (Calves) ===
  '站姿提踵': { muscles: ['腓肠肌（小腿肚）'], steps: ['前脚掌站在台阶边缘，脚跟悬空，双脚与髋同宽；晃的话一只手扶栏杆或墙。', '控制着放低脚跟到台阶以下，小腿后侧有拉开感。', '用前脚掌发力把脚跟抬到最高，在顶端停一下。', '再控制着下放到最低，开始下一次。'], tips: ['没有台阶就在平地做，幅度小一些。', '加重时单手拿哑铃，另一只手扶墙。'], mistakes: ['只做上半程，脚跟没放下去。', '像弹簧一样快速上下弹。', '跟腱或足底出现锐痛就停。'] },
  '史密斯提踵': { muscles: ['腓肠肌'], steps: ['把史密斯杠调到略低于肩的高度，在杠下放一块稳固的踏板或杠铃片。', '站到杠下，杠压在肩后上背，双手握杠，前脚掌踩在踏板边缘，脚跟悬空。', '转动杠铃脱钩，膝盖微屈不锁死，脚跟控制着下放到低于踏板。', '前脚掌发力把脚跟抬到最高，停一下再慢慢下放。', '做完一组，转动杠铃挂回挂钩再离开。'], tips: ['先把安全挡块调到略低于最低点的位置。', '杠铃片容易滑，有专用踏板就用踏板。'], mistakes: ['脚站得太靠前或太靠后，史密斯轨道是直的，重心偏了会前后倒。', '膝盖反复屈伸借力。', '跟腱出现锐痛就停。'] },
  '腿举机提踵': { muscles: ['腓肠肌'], steps: ['坐进倒蹬机，背和臀部贴紧靠垫，双脚与髋同宽，前脚掌踩在踏板下边缘，脚跟悬在板外。', '用腿把踏板推起，打开保险把手，腿伸直但膝盖不锁死。', '膝盖角度不动，只动脚踝，用前脚掌把踏板推远，推到最高停一下。', '控制着让踏板回落，脚跟向自己方向回到底，小腿后侧有拉开感。', '做完一组，腿保持伸直，扣上保险把手，确认锁住后再把脚从踏板上拿下来。'], tips: ['穿防滑鞋，前脚掌踩深一点比只用脚尖更稳。', '加重就加片，加重后先做一两次确认脚踩得稳。'], mistakes: ['膝盖弯曲借力。', '前脚掌从踏板上滑脱，所以不要光脚做。', '跟腱出现锐痛就停。'] },
  '坐姿提踵': { muscles: ['比目鱼肌（小腿深层）'], steps: ['坐上坐姿提踵机，调靠垫压在膝盖上方的大腿处，前脚掌踩在踏板边缘，脚跟悬空。', '先抬起脚跟把靠垫顶起，打开安全把手。', '脚跟控制着下放到最低，再用前脚掌把脚跟抬到最高，顶端停一下。', '做完一组，在顶端把安全把手推回锁住，再下放、离开。'], tips: ['加重就加配重片。', '靠垫压得膝盖不舒服，可以垫一条毛巾。'], mistakes: ['起落幅度太小。', '靠垫压在膝盖骨上。', '跟腱出现锐痛就停。'] },

  // === 核心 (Core) ===
  '平板支撑': { muscles: ['腹横肌', '核心全身肌群'], steps: ['趴在垫子上，前臂撑地，手肘在肩膀正下方，双脚并拢或略分开，脚尖着地。', '收紧腹部、夹紧臀部，把身体撑起，从头到脚跟成一条直线。', '眼睛看双手之间的地面，脖子放松，按计时保持，正常呼吸不憋气。', '计时结束先放下膝盖，再趴下休息。'], tips: ['演示图背上放了一片杠铃片，是负重版；我们做徒手版，不放杠铃片。', '撑不住时可以改成跪姿平板（膝盖着地），保持身体从头到膝一条线。', '觉得轻松时把手肘往前挪一点，难度会增加。'], mistakes: ['腰往下塌，肚子掉向地面。', '臀部撅得很高。', '下背出现疼痛就停，改用跪姿或缩短时间。'] },
  '卷腹': { muscles: ['腹直肌上部'], steps: ['仰卧在垫子上，屈膝，双脚踩地与髋同宽。', '双手指尖轻放在头后两侧（或交叉在胸前），手肘打开。', '呼气，收缩腹部，把头、肩和上背卷离地面，肩胛骨离地即可，下背始终贴着地面。', '吸气，慢慢放回，肩膀快碰地时开始下一次。'], tips: ['想象把胸骨往骨盆方向拉近。', '眼睛看斜上方，下巴和胸口之间留一个拳头的距离。', '加重：胸前抱一片杠铃片或一只哑铃，更难可以举过头顶。'], mistakes: ['双手抱头往上拽脖子。', '起得太高做成仰卧起坐，变成大腿根在发力。', '颈部或下背出现疼痛就停。'] },
  '坐姿卷腹机': { muscles: ['腹直肌'], steps: ['调好座椅高度，坐上去，双脚勾在脚垫下固定。', '双手握住肩膀上方的把手（或手肘放在靠垫上），背靠靠背。', '呼气，收缩腹部，把上半身向前下方卷曲，背部弯成弧形。', '吸气，控制速度回到起始位置，配重片不要撞在一起。'], tips: ['选一个能慢速完成的配重，做不稳就减轻。', '手只是扶着把手，力量来自腹部。'], mistakes: ['用手臂拉把手代替腹部发力。', '回放太快，配重片砰地撞回去。', '下背出现疼痛就停。'] },
  '悬挂抬腿': { muscles: ['腹直肌下部', '髂腰肌'], steps: ['正手握单杠，握距与肩同宽，身体悬垂，肩膀稍微下沉，不要完全松垮。', '收紧腹部，双腿伸直并拢，呼气向前抬到大约与地面平行。', '在顶端稍停，然后吸气慢慢放下双腿，回到悬垂。', '身体晃起来时先停住，等稳了再做下一次。'], tips: ['降阶：屈膝把膝盖提向胸口。', '进阶：腿抬到水平后继续让骨盆向上卷，把腿抬得更高。', '加重：两脚夹住一只哑铃或药球；握力不够可以用助力带。'], mistakes: ['借身体前后摆动的惯性把腿甩上去。', '下放时突然松掉，身体被带着晃。', '肩部出现锐痛或手抓不住就停。'] },
  '罗马椅抬腿': { muscles: ['腹直肌下部'], steps: ['站上罗马椅（悬垂抬腿架），前臂放在两侧软垫上，双手握住把手，背贴紧靠背。', '双腿悬空伸直并拢，收紧腹部，肩膀下沉不耸肩。', '呼气，双腿伸直向前抬到大约与地面平行，下背保持贴着靠背。', '吸气，慢慢放下双腿，不让腰离开靠背向前反弓。'], tips: ['降阶：屈膝把膝盖提向胸口。', '进阶：抬到水平后让骨盆稍微离开靠背向上卷一点。', '加重：两脚夹住一只哑铃。'], mistakes: ['借摆动把腿甩上去。', '下放时腰离开靠背向前反弓。', '下背或肩部出现疼痛就停。'] },
  '俄罗斯转体': { muscles: ['腹外斜肌', '腹直肌'], steps: ['坐在垫子上屈膝，上身后倾，背部挺直，不要弓背。', '双脚脚跟轻踩在地上（和演示图一致），双手在胸前合握。', '呼气，把躯干和肩膀转向一侧，手跟着躯干走。', '吸气转回中间，再呼气转向另一侧，左右各转一次算一次。'], tips: ['想更难就把双脚抬离地面，靠坐骨保持平衡；腰不舒服就放回地面。', '要更难就拿一只哑铃，见「负重俄罗斯转体」。', '眼睛跟着手走，转的是肩膀，不是只有手臂摆。'], mistakes: ['弓背坐，腰往下塌。', '转得太快，靠甩手完成。', '下背出现疼痛就停。'] },
  '负重俄罗斯转体': { muscles: ['腹外斜肌'], steps: ['坐在垫子上屈膝，上身后倾，背部挺直，双脚并拢稍微抬离地面。', '双手在胸前握住一片杠铃片、药球或一只哑铃。', '呼气，转动躯干，把重物带到身体一侧，重物不碰地。', '吸气转回中间，再转向另一侧，左右各转一次算一次。'], tips: ['先从轻的重物开始，转得稳再加重。', '腰不舒服时双脚踩地做。'], mistakes: ['重物砸到地上借反弹转回来。', '弓背或转得太快。', '下背出现疼痛就停。'] },
  '绳索伐木': { muscles: ['腹外斜肌', '核心扭转力量'], steps: ['把滑轮调到高位，装一个把手，侧身站在龙门架旁，双脚比肩略宽。', '双手一起握住把手，手臂伸直，从靠近器械一侧的肩膀上方开始。', '呼气，转动躯干，带着把手斜向下拉过身体，拉到对侧髋部外侧；双膝微屈，靠近器械那只脚的脚跟可以跟着离地转动。', '吸气，控制着转回起始位置；做完这一侧，转身换另一侧。'], tips: ['手臂基本伸直，力量来自躯干转动。', '也可以把滑轮调到低位，从低往高拉。', '配重从轻开始，能控制住回程再加重。'], mistakes: ['只用手臂拉，躯干不转。', '回程被配重拽回去，没有控制。', '下背出现扭痛就停。'] },
  '死虫式': { muscles: ['核心稳定肌群', '腹横肌'], steps: ['仰卧在垫子上，双臂伸直指向天花板，屈髋屈膝，大腿垂直地面、小腿与地面平行。', '收紧腹部，呼气把下背压向地面。', '慢慢伸直一条腿向前下放，同时对侧手臂向头顶方向放低，都停在接近地面但不触地的位置。', '收回起始位置，换另一侧手臂和腿，左右交替，每伸出一次算一次。'], tips: ['演示图只画了腿：手臂一直指天不动，而且只演示了一侧。完整做法是伸腿的同时把对侧手臂往头顶方向放低，左右交替。', '幅度只做到腰还贴得住地面为止。', '降阶：就照演示图，手臂指天不动，只交替下放腿。'], mistakes: ['动作太快，靠惯性甩。', '下背拱起离开地面。', '下背出现疼痛就停。'] },
  '腹轮': { muscles: ['核心全身', '背阔肌'], steps: ['双膝跪在软垫上，双手握住健腹轮两侧把手，轮子放在膝盖前方的地面上。', '收紧腹部、稍微含胸，臀部收紧，让下背保持平或微微拱起。', '吸气，慢慢向前推出轮子，身体跟着伸展，推到腰快要塌之前停住。', '呼气，用腹部发力把轮子拉回膝盖前方。'], tips: ['演示图推到了身体几乎贴地的最远位置，那是熟练后的幅度；你推到腰还撑得住、不塌的位置就拉回。', '刚开始面对墙推，轮子碰墙就停，控制幅度。', '膝盖下垫折叠毛巾或软垫。', '熟练后可以尝试站姿推腹轮，难度高很多。'], mistakes: ['推出时腰塌下去反弓。', '回拉时先往后坐，用大腿把身体带回来。', '下背出现疼痛就停。'] },
  '侧平板支撑': { muscles: ['腹外斜肌', '腰方肌'], steps: ['侧卧在垫子上，下方前臂撑地，手肘在肩膀正下方，双腿伸直叠放。', '上方手叉腰，收紧腹部，把髋部向上顶起，身体从头到脚踝成一条直线。', '身体正对侧面，不往前倒也不往后仰，按计时保持，正常呼吸。', '这一侧计时结束后放下髋部，翻身换另一侧，同样保持到计时结束。'], tips: ['降阶：下方膝盖弯曲着地做。', '两脚叠放不稳时，可以上方脚放在下方脚前面。', '前臂下垫一块折叠毛巾会舒服一些。'], mistakes: ['髋部下坠，身体不成直线。', '身体往前或往后倒。', '肩部出现锐痛就停。'] },

  // === 有氧 (Cardio) ===
  '跑步机慢跑': { muscles: ['心肺功能', '下肢耐力'], steps: ['双脚踩在两侧踏边上，夹好安全夹，启动后再踏上履带。', '先快走几分钟热身，再调到能边跑边说话的慢跑速度。', '上身放松直立，步幅小一点，脚落在身体下方，手臂自然前后摆。', '计时最后几分钟降速慢走，等呼吸平稳再按停止。', '履带完全停下后再下来。'], tips: ['可以加一点坡度，跑起来更接近户外。', '膝盖不舒服就改成坡度快走。'], mistakes: ['双手死抓扶手。', '步子太大，脚跟重重砸地。', '胸闷、头晕立即停。'] },
  '弧形跑步机': { muscles: ['心肺功能', '腘绳肌', '臀大肌'], steps: ['双手扶住两侧扶手，站到弧形履带最低的位置。', '一只手先扶着，慢慢往前走，脚踩到弧面前段时履带开始转。', '熟悉后放开扶手，在前段跑：越靠前越快，往中间退就慢下来。', '上身直立，脚落在身体下方，手臂自然摆动。', '结束时退回弧底中间逐渐放慢，履带停下后扶着扶手下来。'], tips: ['第一次先走，不要直接跑。', '有阻力调节杆的机型，第一次调到最轻。'], mistakes: ['上身过度前倾。', '一下子冲到最前段，失去平衡。', '头晕或胸闷立即停。'] },
  '划船机': { muscles: ['心肺功能', '背部', '腿部', '全身'], steps: ['坐在滑座上，双脚踩进踏板，绑带扣在脚掌最宽处。', '起始：屈膝到小腿接近竖直，上身略前倾，手臂伸直握住把手。', '拉：先蹬直双腿，再让上身略向后倾，最后把把手拉到下胸，演示图就是这个结束位置。', '回：先把手臂伸直，再上身前倾，最后屈膝让滑座滑回起始位置。', '按计时连续划，结束后把把手轻轻放回挂钩。'], tips: ['刚开始不用划得很猛，先把顺序做对。', '记口诀：拉是腿、背、手，回是手、背、腿。'], mistakes: ['腿还没蹬直手就开始拉。', '弓背驼背。', '下背出现疼痛就停。'] },
  '风阻划船机': { muscles: ['心肺功能', '爆发力', '全身'], steps: ['坐上滑座，双脚绑好，先把风门拨杆调到中低档。', '起始屈膝，上身略前倾，手臂伸直握住把手。', '拉：先蹬腿，再上身后倾，最后手拉到下胸。', '回：先伸直手臂，再上身前倾，最后屈膝滑回。', '想更费力就拉得更快更猛，不要只靠调高风门。'], tips: ['做间歇就在计时内交替全力划和轻松划，不必整段都全力。', '风门调在中低档时手感最接近划水，调太高像在拉重物。'], mistakes: ['风门调得太高，拉几下腰就累。', '顺序乱，腿还没蹬直手就拉。', '弓背；下背疼就停。'] },
  '椭圆机': { muscles: ['心肺功能'], steps: ['扶住固定把手踏上踏板，踩稳后换握活动把手。', '设好阻力，脚往前下方踩，手跟着推拉活动把手；把手和踏板是连着动的，顺着它的节奏走，不要和它对着用力。', '上身直立，核心微收，全脚掌踩在踏板上。', '结束时减慢速度，踏板停下后扶着固定把手下来。'], tips: ['可以倒着踩，用力方向不同。', '膝盖或手臂不舒服时，握固定把手只用腿踩。'], mistakes: ['趴在控制面板上。', '阻力为零，只随惯性空转。', '踮着脚尖踩。'] },
  '骑行机': { muscles: ['心肺功能', '股四头肌'], steps: ['调座椅高度：脚踏在最低点时，膝盖还留一点弯曲。', '坐好，前脚掌踩在脚踏中央，有绑带就扣好。', '设好阻力后平稳踩踏，双手轻扶车把，上身不左右晃。', '结束前降低阻力慢慢踩一会儿再停。'], tips: ['腰背容易累，可以换成带靠背的卧式车。', '膝盖前侧疼多半是座椅太低，往上调。'], mistakes: ['座椅太低，膝盖一直弯着受力。', '踩踏时屁股左右扭。', '头晕或胸闷立即停。'] },
  '动感单车': { muscles: ['心肺功能', '下肢肌群'], steps: ['调座椅高度（脚踏最低时膝盖微弯）和前后位置，车把调到与座椅差不多高。', '把脚放进脚套或锁好锁片，先设一个踩得动的阻力。', '坐着踩踏，上身略前倾，双手轻扶车把，核心收紧。', '结束时慢慢降速，再按下刹车让飞轮停住，最后把脚取出来。'], tips: ['想站起来骑先加大阻力，重心放在脚上，臀部在座椅正上方。', '飞轮没有空转，脚踏会带着脚一直转，紧急时直接按刹车。'], mistakes: ['阻力太小，飞轮带着脚转。', '站骑时把体重压在车把上。', '突然停脚不按刹车。'] },
  '攀爬机': { muscles: ['心肺功能', '臀大肌', '股四头肌'], steps: ['双手扶扶手踏上底部台阶，选好速度后按开始，台阶开始向下转。', '挺胸抬头，像爬楼梯一样一步一阶交替往上迈。', '整个脚掌踩在台阶上，用臀部和大腿发力踩下去。', '结束时把速度降到最低，台阶停下后扶着扶手下来。'], tips: ['跟不上就降速，不要靠扶手撑着身体。', '手只轻扶扶手保持平衡。'], mistakes: ['上身趴在控制台上。', '踮着脚尖走。', '头晕或胸闷立即停。'] },
  '跳绳': { muscles: ['心肺功能', '小腿', '肩部耐力'], steps: ['双手握柄，绳子在脚跟后方，手肘贴近身体两侧，前臂向前下方伸出。', '手腕发力，把绳子从后往前甩过头顶。', '绳子快到脚下时，前脚掌轻轻弹起跳过，膝盖微屈落地。', '按计时保持均匀节奏，累了就停下来原地踏步，缓过来再继续。'], tips: ['调绳长：单脚踩住绳子中间，手柄拉到腋下高度。', '在木地板或软垫上跳，膝盖更舒服。'], mistakes: ['整条手臂大圈抡绳。', '跳得太高，或脚跟砸地。', '小腿或胫骨前侧出现疼痛就停。'] },
  '开合跳': { muscles: ['心肺功能', '全身协调性'], steps: ['站直，双脚并拢，双臂放在身体两侧。', '跳起，双脚向两侧分开落地，同时双臂向两侧举到与肩同高，熟练后可以举过头顶。', '再跳起，双脚并拢落地，双臂放回体侧。', '按计时连续进行，前脚掌先着地，膝盖微屈缓冲。'], tips: ['想减小冲击就不跳，左右脚轮流向侧面迈出。', '跳不了整段就和原地踏步交替，累了先放慢，直到计时结束。'], mistakes: ['落地时膝盖锁直。', '膝盖向内扣。', '膝盖或脚踝出现锐痛就停。'] },
  '波比跳': { muscles: ['心肺功能', '爆发力', '全身绝大部分肌群'], steps: ['站立，双脚与肩同宽。', '下蹲，双手撑在脚前的地面上。', '双脚向后跳成高位平板，身体从头到脚一直线；演示里这里加了一个俯卧撑，可做可不做。', '双脚跳回双手后方，回到蹲姿。', '向上跳起，双臂举过头顶，落地后接着做下一次。'], tips: ['降阶：双脚一只一只往后走，不跳，也不做俯卧撑。', '按计时做，累了就放慢节奏，或站着缓几口气再继续。'], mistakes: ['平板时塌腰。', '落地没有屈膝缓冲。', '手腕或下背出现锐痛就停。'] },
  '开合跳热身': { muscles: ['全身'], steps: ['双脚并拢站立，双臂自然垂在体侧。', '向上跳起，落地时双脚向两侧分开略比肩宽，同时双臂经体侧向上抬到大约与肩同高。', '再跳起，双脚并拢落地，双臂经体侧放回身体两侧。', '保持轻快节奏、均匀呼吸，连续做到计时结束。'], tips: ['落地时膝盖微屈、前脚掌先着地，声音越轻越好。', '怕吵或膝盖不适时改成不跳版：一只脚轮流向侧点地，双臂照样上举。', '核心收紧，上身保持直立。', '想多活动肩膀，双臂可以一路举到头顶，其余动作不变。'], mistakes: ['全脚掌或脚跟重重砸地。', '动作僵硬、憋气。', '膝盖或脚踝出现疼痛时改成不跳版。'] },
  '肩关节环绕': { muscles: ['三角肌', '肩袖肌群'], steps: ['双脚与髋同宽站立，腹部收紧，肩膀下沉放松。', '双臂向两侧伸直抬起，也可以弯肘把指尖搭在肩上。', '以肩关节为轴，手臂向前画圆，从小圆开始，几圈后逐渐变大。', '肩胛骨跟着一起动，自然呼吸，画圆速度保持缓慢均匀。', '做到计时一半时，改成向后画圆，同样由小到大。', '计时结束后双臂慢慢放回体侧，轻轻抖一抖。'], tips: ['直臂画圆更费力，肩膀没热起来时先用指尖搭肩的屈臂版。', '后段向后画圆时稍微挺胸，肩前侧会更打开。', '幅度只做到不痛的范围。'], mistakes: ['速度过快、甩手臂，肩关节弹响。', '耸肩，肩膀跟着往耳朵方向抬。', '肩部出现锐痛或手臂发麻时立刻停下。'] },
  '扩胸运动': { muscles: ['胸大肌', '三角肌前束'], steps: ['双脚与肩同宽站立，双臂伸直向前平举到肩高，掌心相对。', '吸气，双臂保持肩高、伸直向两侧打开，向后振到胸前有拉伸感，肩胛骨向中间收。', '呼气，双臂保持肩高收回到身前平举的位置。', '连贯地开合，做到计时结束。'], tips: ['手臂伸直有压力时可以微微弯肘。', '向后振的幅度由小到大，前几次轻一点。', '腰背保持中立，靠肩膀和胸打开，而不是挺腰。'], mistakes: ['向后振时腰往前顶、过度反弓。', '第一下就猛力向后甩。', '肩前侧出现锐痛时减小幅度或停下。'] },
  '徒手深蹲激活': { muscles: ['股四头肌', '臀大肌'], steps: ['双脚与肩同宽站立，脚尖略向外，双臂伸直抬到肩高（向前或向两侧都行）帮助平衡。', '臀部向后下方坐，像要坐到身后的椅子上，同时屈膝。', '下蹲到大腿接近与地面平行，背部平直，膝盖朝脚尖方向。', '脚跟踩实发力站起，节奏平稳，连续做到计时结束。'], tips: ['蹲不下去或会抬脚跟，可以身后放一把椅子，臀部轻碰椅面就站起。', '重心在脚掌中后部。', '热身用中等速度，不追求下得很深。'], mistakes: ['膝盖往里扣。', '弯腰驼背，胸口贴向大腿。', '膝盖出现锐痛时减小下蹲深度或停下。'] },
  '弓步转体': { muscles: ['股四头肌', '臀大肌', '腹外斜肌'], steps: ['双脚并拢站立，双手握拳，屈肘收在胸前。', '一只脚向前迈一大步，下蹲成弓步，前侧大腿接近水平，后膝悬空或轻触地面。', '呼气，上身连同双手向前腿一侧转，髋部保持朝前，眼睛跟着转。', '转回正前方，前脚蹬地退回站立。', '这一侧计时内都用同一条腿向前迈；换边后另一条腿做同样时间。'], tips: ['站不稳时把两脚左右距离拉开一点，像站在两条轨道上。', '转体幅度由小到大，只转上身，髋部保持朝前。', '后膝着地会硌，可以在后膝下垫毛巾。', '演示图只演示了一侧；这一侧计时结束后换另一条腿在前，做同样时间。'], mistakes: ['前脚跟抬起，重心压到前脚尖。', '转体时前膝向内倒。', '腰部出现锐痛时减小转体幅度或停下。'] },
  '高抬腿走': { muscles: ['髂腰肌', '臀大肌', '下肢肌群'], steps: ['站直，双脚与髋同宽，腹部收紧。', '抬起一侧膝盖，尽量靠近胸口，支撑腿伸直。', '双手抱住小腿上方，把膝盖向胸口轻轻提一下，停一秒左右。', '放下这条腿向前迈一步，换另一侧膝盖抬起抱膝。', '左右交替向前走或原地做，到计时结束。'], tips: ['支撑腿那一侧可以顺势踮起脚尖，难度更高。', '站不稳就不抱膝，只做抬膝，或一只手扶墙。', '抬腿时呼气，放下时吸气。'], mistakes: ['上身后仰去够膝盖。', '弯腰低头去抱膝，背部弓起。', '膝盖或髋前侧出现锐痛时停下。'] },
  '登山者': { muscles: ['核心肌群', '髋屈肌'], steps: ['双手撑地在肩膀正下方，双腿向后伸直，成高位平板，从头到脚跟一条直线。', '收紧腹部，把一侧膝盖向胸口提起。', '这条腿退回原位的同时，另一侧膝盖提向胸口。', '左右交替，保持平稳的较快节奏，做到计时结束。'], tips: ['降阶：双手撑在椅子或台阶上，或放慢速度一步一步换腿。', '保持臀部高度不变，肩膀始终在手腕上方。', '目光看双手前方一点的地面，颈部自然。'], mistakes: ['臀部撅得过高。', '腰部塌陷。', '手腕疼时改成握拳或撑在台阶上，腰痛就停下。'] },
  '婴儿式背部拉伸': { muscles: ['背阔肌', '竖脊肌'], steps: ['跪在垫子上，两个大脚趾靠拢，膝盖并拢或分开到与髋同宽。', '臀部向后坐到脚跟上，上身从髋部向前折叠趴下。', '双臂向前伸直，手掌平贴地面，额头落在垫子上。', '到位时臀部尽量压回脚跟，手指继续向前够，腋下、腰两侧和下背有拉长感。', '放松肩颈，慢慢深呼吸，吸气时感到后背扩张，按计时保持。', '结束时双手往回走到肩膀下方，用手撑起上身，回到跪坐。'], tips: ['额头碰不到地就垫瑜伽砖或折叠毛巾；臀部坐不到脚跟，可以在大腿和小腿之间夹一卷毛巾。', '想多拉一侧腰背，可以把双手一起移向左边或右边。', '膝盖不舒服时膝下垫厚一点，或把双膝分开。'], mistakes: ['臀部抬离脚跟太多，重量压在手臂上。', '耸肩，脖子僵着。', '膝盖出现锐痛或脚背抽筋就退出，换个膝盖位置再试。'] },
  '胸部静态拉伸': { muscles: ['胸大肌', '三角肌前束'], steps: ['侧身站在墙边或门框旁，要拉的那只手臂靠墙。', '手臂抬起，手肘弯成直角、与肩膀同高，小臂和手掌贴住墙面或门框。', '靠墙一侧的脚向前跨小半步，肩胛骨向后向下收。', '身体慢慢向外转（离开墙的方向），直到胸口前侧和肩前侧有明显拉伸感。', '按计时保持，平稳呼吸，肩膀不往前顶、不耸起。', '结束时身体转回正面，手臂离开墙；换另一侧手臂贴墙，做同样的步骤。'], tips: ['手肘放高一点拉的是胸口下部，放低一点拉的是胸口上部，可以分别试。', '肩膀不稳或脱臼过的人，手肘放低于肩，转动幅度小一点。', '没有墙时可以扶住柱子或深蹲架立柱。'], mistakes: ['身体往前倾压过去，肩膀前侧被挤痛，而不是转身。', '耸肩。', '肩前侧出现锐痛或手臂发麻就退出。'] },
  '肩后侧拉伸': { muscles: ['三角肌后束', '菱形肌'], steps: ['站直（也可以坐着），双脚与肩同宽，肩膀放松下沉。', '抬起右臂伸直，横过胸前，与地面大致平行。', '左手扣住右臂肘部附近的上臂。', '左手把右臂轻轻拉向左肩，上身保持朝前不转，右肩后侧有拉伸感。', '按计时保持，平稳呼吸，右肩不耸起。', '结束时慢慢放下右臂；换左臂横过胸前、右手拉，做另一侧。'], tips: ['手扣在肘部稍上方的上臂，不要直接压肘关节。', '拉伸感不明显时，把手臂放低一点或抬高一点，找最明显的角度。'], mistakes: ['身体跟着手臂一起转，拉不到肩后侧。', '耸肩，被拉的肩膀顶到耳朵旁。', '肩关节出现锐痛就松开。'] },
  '三头肌拉伸': { muscles: ['肱三头肌'], steps: ['站直或坐直，收腹，肩膀放松。', '右臂向上举起贴近耳朵，屈肘，让右手掌落到后背两块肩胛骨之间。', '左手举起，扶住右肘。', '左手把右肘轻轻向头后、向左拉，右上臂后侧有拉伸感。', '头保持正，可以轻轻向后靠住右上臂，按计时保持，平稳呼吸。', '结束时松开左手，慢慢放下右臂；换左臂上举、右手拉，做另一侧。'], tips: ['肩膀太紧够不到肘部时用一条毛巾：上面的手抓毛巾一端垂到背后，下面的手从背后拉另一端。', '头不要往前低，保持在手臂前面。'], mistakes: ['腰往前顶、肋骨外翻，用拱背代替拉肩。', '低头含胸。', '肩关节出现锐痛或手发麻就放下。'] },
  '股四头肌拉伸': { muscles: ['股四头肌', '髂腰肌'], steps: ['站在墙或椅背旁边，一只手扶住保持平衡，双脚并拢。', '重心放到靠墙一侧的腿上，支撑腿微屈不锁死。', '外侧那条腿屈膝，脚跟向后抬起，用同侧手抓住脚踝或脚背。', '把脚跟拉向臀部，两膝靠拢、膝盖朝下，髋部轻轻向前推，大腿前侧有拉伸感。', '上身保持直立，收紧臀部，按计时保持，平稳呼吸。', '结束时慢慢放下脚；转身换另一只手扶墙，拉另一条腿。'], tips: ['抓不到脚踝就用毛巾或弹力带套住脚背拉。', '膝盖不舒服时，不要把脚跟硬拉到贴臀，拉到有拉伸感就停。', '想加强时先收紧臀部让骨盆后倾，再把脚往后带。'], mistakes: ['腰往前拱，用骨盆前倾代偿。', '拉伸腿的膝盖向外打开或向前跑。', '膝盖出现锐痛就松手。'] },
  '腘绳肌/体前屈': { muscles: ['腘绳肌', '小腿三头肌'], steps: ['站立，双脚并拢或与髋同宽，膝盖伸直但不锁死。', '双手放在大腿前侧，保持背部平直，臀部向后推，从髋部开始向前折叠。', '双手顺着大腿、小腿往下滑，去够脚尖或地面；够不到就停在小腿上。', '到底后让头和颈部放松下垂，重心稍微放在前脚掌，大腿后侧有明显拉伸感。', '按计时保持，呼气时让上身再放松往下一点。', '结束时微屈膝，双手扶大腿，慢慢把上身卷起来，头最后抬起，避免起身太快头晕。'], tips: ['想先热一下，可以像演示图那样慢慢前屈、再起身站直几次，然后在最低处停住保持。', '腿后侧很紧时允许膝盖微屈，让感觉落在大腿后侧而不是下背。', '可以双手互抱手肘，让上身靠重量自然下垂。'], mistakes: ['膝盖锁死向后顶。', '弓背低头硬去够地面。', '大腿后侧出现锐痛、腰痛或腿发麻就停。'] },
  '臀大肌拉伸': { muscles: ['臀大肌', '梨状肌'], steps: ['仰卧在垫子上，双膝弯曲，双脚踩地。', '抬起右脚，把右脚踝外侧架在左膝上方的大腿上，右膝向外打开，两腿交叉成数字四的形状。', '左脚离地，双手分别从两腿之间和左腿外侧伸过去，抱住左大腿后侧。', '慢慢把左大腿拉向胸口，直到右侧臀部深处有拉伸感；头和肩膀贴在垫子上。', '按计时保持，呼气时可以用右手肘轻轻把右膝向外推一点。', '结束时松开双手，左脚落地、右脚放下；换左脚踝架在右膝上，做另一侧。'], tips: ['抱不到大腿时，用毛巾绕过大腿后侧拉住两端。', '拉伸太强就让支撑脚继续踩在地上，只把架起的膝盖向外推。'], mistakes: ['抬头耸肩，脖子发酸。', '下背和臀部被拉离垫子。', '膝盖出现扭痛或腿发麻就松开。'] },
  '髂胫束拉伸': { muscles: ['髂胫束', '阔筋膜张肌'], steps: ['站直，可以侧对墙，方便扶。', '要拉右侧时，右腿从左腿后面交叉到左边，两只脚都踩实。', '右臂举过头顶，左手叉腰或扶墙。', '右侧髋部向右推出去，上身向左侧弯，直到右侧大腿外侧和腰侧有拉伸感。', '身体保持在一个平面上，不往前弯腰，按计时保持，平稳呼吸。', '结束时上身回正、右脚收回；换左腿交叉到右腿后面，左臂上举向右侧弯，做另一侧。'], tips: ['重心放在后面那条腿上，髋部往外推的幅度比上身侧弯更重要。', '站不稳就让一只手扶墙。'], mistakes: ['上身往前弯腰，侧面没拉到。', '耸肩、憋气。', '膝盖外侧或髋部出现锐痛就回正。'] },
  '眼镜蛇式': { muscles: ['腹直肌'], steps: ['俯卧在垫子上，双腿伸直，并拢或与髋同宽，脚背贴地。', '双手放在肩膀下方稍前的位置，手指朝前，手肘向身体收拢。', '吸气，双手推地，把头和胸口慢慢抬起，手臂伸直或保持微屈。', '骨盆和大腿前侧仍压在地上，臀部轻轻收紧，肩膀向下远离耳朵，腹部前侧和胸口有拉长感。', '目光看斜上方，颈后不挤，按计时保持，平稳呼吸。', '结束时呼气，慢慢屈肘把上身放回地面，头侧向一边休息。'], tips: ['腰部有挤压感就屈肘降低高度，或改成前臂撑地的斯芬克斯式。', '双腿分开到与髋同宽，下背的压力会小一些。'], mistakes: ['耸肩，把头缩在肩膀里。', '为了把手臂伸直让骨盆离地。', '下背出现锐痛就降低高度或放下。'] },
  '器械内收机': { muscles: ['内收肌群', '大腿内侧'], steps: ['调好起始开合角度，坐上器械，背贴紧靠背，双腿分开，大腿内侧贴住两侧挡板。', '双手握住两侧把手，收紧腹部。', '大腿内侧用力把双腿向内夹拢，夹到两侧挡板接近并拢，停一两秒。', '慢慢向外打开回到起始角度，配重片不要落下碰响，再做下一次。'], tips: ['起始角度先开小一点，大腿内侧有拉伸感但不疼即可。', '加重时小幅加，夹不拢或开始晃身体就退回上次重量。'], mistakes: ['靠甩腿的惯性夹拢。', '打开时放松让配重片砸下。', '大腿内侧或腹股沟出现锐痛就停。'] },
  '器械上背划船': { muscles: ['上背', '菱形肌', '中斜方肌'], steps: ['调座椅高度，让把手与肩同高，坐好后胸口贴紧前方靠垫，双脚踩稳。', '双手正握宽距把手，手臂向前伸直。', '手肘向两侧打开、与肩同高，水平向后拉，直到肩胛骨在背中间夹紧。', '停一下，再控制着让把手回到手臂伸直的位置。'], tips: ['想更集中练背中间，就放慢回程。', '有对握把的机型，对握时手肘贴身拉，用法相同。'], mistakes: ['胸口离开靠垫，身体后仰借力。', '耸肩，只用手臂拉。', '肩部出现锐痛就停。'] },
  '壶铃摆动': { muscles: ['臀大肌', '腘绳肌', '核心肌群'], steps: ['双脚略宽于肩，脚尖微向外，壶铃放在身前约一脚远的地上。', '臀部后推、背部平直，双手握住把手，把壶铃向后拉到两腿之间。', '臀部爆发式向前推、站直并夹臀，让壶铃靠这股力量摆到胸口到肩的高度，手臂保持伸直。', '壶铃落下时顺势臀部后推，让它从两腿之间向后摆，接着做下一次。', '做完最后一次，壶铃后摆后放回身前地面。'], tips: ['手臂只是挂钩，不用肩膀往上抬。', '先用轻壶铃把节奏练熟再加重，加重时小幅加。'], mistakes: ['用手臂或肩膀把壶铃往上拉。', '弯腰驼背，而不是臀部后推。', '膝盖弯太多变成深蹲；腰部出现锐痛立即停。'] },
  '壶铃高脚杯深蹲': { muscles: ['股四头肌', '臀大肌'], steps: ['双手握住壶铃把手两侧，壶铃球部朝下贴在胸前，手肘朝下。', '双脚与肩同宽或略宽，脚尖略向外。', '吸气，挺胸，臀部向后下方坐，下蹲到大腿与地面平行或更低。', '呼气，脚掌踩实、脚跟发力站起。'], tips: ['也可以把壶铃倒过来、双手托住球部贴胸，选手腕舒服的握法。', '先用较轻的壶铃熟悉动作。'], mistakes: ['膝盖内扣。', '重心跑到前脚掌，脚跟抬起。', '膝盖出现锐痛就停。'] },
  '上肢功率车': { muscles: ['心肺功能', '三角肌', '肱二头肌', '胸大肌'], steps: ['调座椅高度，让手柄转轴大致与胸口同高，坐好，双脚踩稳。', '双手握住手柄，摇到最远点时手肘仍略弯。', '双臂交替推拉摇转，节奏均匀。', '结束前降低阻力慢摇一会儿再停。'], tips: ['可以反方向摇。', '下肢受伤时可以用它代替跑步机或单车做有氧。'], mistakes: ['只转手腕，不用手臂发力。', '弯腰驼背。', '肩部出现锐痛就停。'] },

  // === 游泳 (Swimming) ===
  '水中行走热身': { muscles: ['全身肌群', '心肺适应'], steps: ['从池梯下水，站在浅水区靠近池边的位置，水深到腰附近（大腿到胸口之间都可以）。', '沿池边向前慢走，脚掌整个踩实池底，双臂在水中自然前后摆动，感受水的阻力。', '走几趟后逐渐加快步子，可以穿插抬膝走（膝盖往上提）和侧向走（横着迈步）。', '保持正常呼吸，持续走到计时结束，让身体适应水温和浮力再开始游。'], tips: ['怕滑可以一只手轻扶池边走，适应后再放开。', '水凉时多走一会儿、步子加快一点，身体热起来再进入后面的练习。', '侧向走时两个方向都走，左右均衡。'], mistakes: ['一下水就直接开始游，没有适应水温（容易抽筋）。', '在脚踩不到底的深水区行走。', '小腿或脚底出现抽筋时继续硬走：应停下扶池边，把脚尖往回勾拉伸小腿。'] },
  '水中呼吸练习': { muscles: ['呼吸肌群', '心肺功能'], steps: ['站在浅水区，水深到胸，双手可以扶住池边。', '抬头用嘴深吸一口气，然后弯膝或低头把整张脸没入水中。', '在水里用鼻子（也可以口鼻一起）缓慢、持续地吐出气泡，直到快吐完。', '抬头出水，先把嘴边的水吐掉，再用嘴快速吸气。', '按这个节奏连续循环到计时结束，越做越放松。'], tips: ['口诀：嘴吸、水下吐。水下吐气的时间比出水吸气长得多。', '怕水进鼻子可以先戴鼻夹，熟练后再拿掉。', '熟练后试着整个人下蹲没入水中吐气，再站起来吸。'], mistakes: ['在水里憋气不吐，出水后要先吐再吸，换气来不及。', '出水后用鼻子吸气（会呛水）。', '感觉头晕时立刻停下，站直正常呼吸缓一缓。'] },
  '扶边蛙泳腿练习': { muscles: ['股四头肌', '腘绳肌', '小腿', '臀大肌'], steps: ['双手扶住池边（或池边的扶手），身体俯卧伸直浮在水面，脸可以入水也可以抬头。', '收腿：小腿向臀部方向折叠，脚跟靠近臀部，膝盖大约与髋同宽。', '翻脚：两只脚尖朝外勾起，脚掌内侧朝后，这一步决定蹬水有没有力。', '蹬夹：用脚掌内侧向后、略向外画半圆蹬出，最后两腿伸直并拢，脚尖绷直。', '并拢后停一下让身体漂直，再开始下一次，持续到计时结束。'], tips: ['四字口诀：收、翻、蹬、夹。', '可以先在岸上趴在长凳或床边练勾脚和画圆，找感觉后再下水。', '抬头做容易腰往下沉，憋得住就把脸放进水里做，吐气配合。', '收腿慢一点、蹬夹快一点。'], mistakes: ['忘记翻脚，脚尖绷着往后蹬，几乎没有推力。', '收腿时把大腿往肚子下面收太多，膝盖分得很开，阻力很大。', '膝盖内侧出现疼痛时停下，减小蹬腿幅度，疼痛不消就别再练。'] },
  '蹬壁滑行练习': { muscles: ['核心肌群', '全身流线型控制'], steps: ['背对池壁站在浅水区，一只脚踩在池壁上，另一只脚站在池底。', '双臂向前伸直，双手上下叠在一起，上臂夹住耳朵两侧。', '深吸一口气，身体前倾把脸放进水里，站立的那只脚也收上来踩到池壁上。', '双脚同时用力蹬离池壁，全身绷直向前滑，眼睛看池底。', '保持这个姿态不动、慢慢吐气，滑到速度降下来再站起，回到池壁重复到计时结束。'], tips: ['全身要像一根棍子一样直，腿并拢、脚尖绷直。', '站起时先收腿到胸前、双手往下压水，再把脚放到池底，这样站得稳。', '怕呛水可以先戴鼻夹练。'], mistakes: ['蹬出去后身体松垮、腿分开，滑不远。', '抬头看前方，下半身会往下沉。', '在人多的泳道蹬壁前不看前方，容易撞人：出发前先确认前面没人。'] },
  '蛙泳手部划水练习': { muscles: ['三角肌', '胸大肌', '背阔肌'], steps: ['站在浅水区，双脚前后站稳，弯腰让肩膀没入水中，双手向前伸直并拢，脸入水。', '双手掌心朝外向两侧斜下方划开，打开到比肩稍宽。', '手掌转向内、向下向内抱水，手肘保持高位，同时抬头让嘴出水吸气。', '双手在胸前下方合拢后快速向前伸直，头回到水中吐气。', '按这个节奏连续做到计时结束；熟练后可以边慢慢向前走边做。'], tips: ['划水范围不用大，手不要划到肩膀后面。', '抱水和抬头吸气同时发生，前伸时脸回到水里。', '演示动画是游进中的划手，站立练习时手的路线和动画一样。'], mistakes: ['手往后拉到大腿边（那是自由泳的划法），蛙泳手只划到胸前。', '抬头太高，下巴出水就够了。', '肩膀前侧出现疼痛时减小划水幅度，仍疼就停止。'] },
  '蛙泳完整配合': { muscles: ['全身肌群', '心肺耐力'], steps: ['从蹬壁滑行的流线姿势开始。', '双手向外划水，同时抬头出水吸气，此时腿保持伸直不动。', '双手向内抱水时开始收腿，脚跟靠近臀部。', '双手向前伸直、头回到水里，紧接着翻脚蹬夹。', '蹬夹后保持流线滑行一会儿再开始下一次划手，练到计时结束。'], tips: ['口诀：划手、吸气、收腿、蹬夹、滑行。', '初学时数节奏：划一次手、蹬一次腿、滑一下。', '累了就拉长滑行，不要加快手脚频率。'], mistakes: ['手脚同时动，推力互相抵消，游不动。', '不滑行就连着做，体力很快耗尽。', '抬头过高，下半身下沉。'] },
  '水中漫步放松': { muscles: ['全身', '心肺恢复'], steps: ['游完后回到浅水区，站稳。', '沿池边放慢速度行走，双臂在水中轻轻划动，不用力。', '也可以扶住池边，身体放松漂浮，双腿轻轻踢水。', '放慢呼吸，呼气比吸气长一点，直到计时结束、呼吸平稳。'], tips: ['可以顺带扶池边做小腿和大腿前侧的静态拉伸。', '觉得冷就加快一点步子，别在水里站着不动。'], mistakes: ['游完马上上岸，没有放松。', '放松时还在用力划水打腿。', '出现头晕、胸闷时立刻上岸坐下，告诉救生员。'] },
  '蛙泳连续游': { muscles: ['全身肌群', '心肺耐力'], steps: ['蹬壁出发，进入完整蛙泳配合。', '保持稳定的划手、吸气、蹬腿、滑行节奏，每次蹬腿后都滑一下。', '游到对面池边手先触壁，用开放式转身蹬壁继续。', '按自己的能力连续游到计时结束；需要时在池边扶一下喘口气再出发。'], tips: ['连续游看的是节奏，不是速度。', '觉得累就拉长滑行时间，不要加快动作。', '初学时可以先游单程，熟练后再连续往返。'], mistakes: ['为了快而加快手脚频率，反而更累更慢。', '不敢把脸放进水里，一直仰头游，腰和颈很快就酸。', '出现抽筋时立刻停下扶池边，把抽筋那条腿的脚尖往回勾。'] },
  '蛙泳间歇训练': { muscles: ['心肺功能', '无氧耐力', '全身'], steps: ['在池边准备，蹬壁出发。', '用比平时稍快、但还能保持动作完整的速度游完一个池长。', '到对面手触壁后停下，扶着池边做几次深呼吸休息。', '呼吸缓下来后再出发，往返循环到计时结束。'], tips: ['强度用七八成力就够，不要每趟都冲刺。', '休息时不要上岸，扶池边站着或漂着。', '能力提升后可以缩短休息、或一次游两个池长再休息。'], mistakes: ['休息过长，变成了慢游。', '每趟都全力冲刺，后面动作完全变形。', '出现胸闷、头晕时停止训练，上岸休息。'] },
  '踩水练习': { muscles: ['核心肌群', '腿部耐力'], steps: ['在浅水区靠池边处，双手扶住池边，身体直立，脚离开池底。', '双腿做类似蛙泳腿的动作：收腿、翻脚、向下向外蹬，再并拢，蹬的方向朝下。', '腿的动作连续、不停顿，感受每次蹬夹把身体往上托。', '熟练后换成单手扶池边，另一只手在胸前水面下左右平划辅助。', '能托住自己后再双手离开池边，双手平划、头保持在水面上正常呼吸，脚随时可以放下站立。', '练到计时结束；要在脚够不到底的深水区练，必须有人在旁边看着。'], tips: ['1.4 米的池子大多能脚踩到底，适合练腿的节奏；真正离底的踩水要到更深的区域，并有救生员或同伴在场。', '身体越放松越容易浮起，肩膀以下都放进水里。', '也可以两腿交替做蛙泳式蹬水（打蛋器式），比同时蹬更稳。'], mistakes: ['身体紧张、手脚乱扑，反而往下沉。', '动作幅度太大太快，很快没力气。', '独自在深水区练习；任何时候慌了就先抓池边。'] },
  '蹬壁转身练习': { muscles: ['核心', '腿部爆发力'], steps: ['游到池边时，一只手（蛙泳时双手）先触壁。', '触壁后屈膝把身体团紧，靠近池壁，同时身体转向侧面、准备回游的方向。', '触壁的手从水面上方甩向前方，头随之入水，双脚踩上池壁。', '双脚用力蹬壁，进入流线型滑行，滑一段后开始正常游，练到计时结束。'], tips: ['这是开放式转身（不翻滚），适合初学者。', '转身时可以趁头在水面上吸一口气。', '先慢慢做清楚每一步，再追求不停顿。'], mistakes: ['在池边停太久再出发。', '蹬壁后身体不绷紧，浪费了蹬壁的速度。', '离池壁太远就转身，脚够不到墙；也要注意别撞到头。'] },
  '自由泳打腿练习': { muscles: ['臀大肌', '股四头肌', '核心'], steps: ['双手扶住池边（或手扶浮板），身体俯卧伸直浮在水面。', '双腿伸直并拢，从髋部（大腿根）发力上下交替打水。', '膝盖只有轻微弯曲，脚尖绷直、脚踝放松，像鞭子末端一样跟着摆。', '打水幅度不大，脚跟刚好碰到水面，大部分动作在水下。', '脸入水时用鼻子吐气，需要时抬头吸气，持续到计时结束。'], tips: ['脚踝越松，打水越有效。', '水花小而密才是对的，大水花说明膝盖弯太多。', '熟练后可以手扶浮板离开池边向前打腿。'], mistakes: ['膝盖大幅弯曲，像蹬自行车一样踢水。', '脚踝僵硬、勾着脚，几乎打不动水。', '腰部或髋屈肌出现疼痛时停下，减小幅度。'] },
  '自由泳划臂+侧头呼吸': { muscles: ['背阔肌', '三角肌', '核心旋转'], steps: ['站在浅水区，双脚前后站稳，弯腰让肩膀没入水中，双臂向前伸直，脸入水。', '一只手向下、向后划水，一直划到大腿旁边，另一只手保持前伸。', '划水时身体朝划水手那一侧转动，头跟着身体侧转，嘴露出水面吸气。', '吸完气，划水手从水面上方向前移回入水，头转回水中吐气。', '换另一只手划，两侧交替练到计时结束；熟练后可以边慢走边做。'], tips: ['侧转吸气时下面那只耳朵贴着前伸的手臂，嘴半露出水面就够了。', '转的是整个身体，不只是脖子。', '演示动画是游进中的完整自由泳，站立练习时手臂路线和转头时机跟动画一样。'], mistakes: ['抬头向前吸气，而不是侧转。', '只转头不转身，脖子很快酸痛。', '划水手越过身体中线，划成S形太大或交叉。'] },
  '自由泳完整配合': { muscles: ['全身肌群', '心肺耐力'], steps: ['蹬壁出发，进入流线型滑行。', '开始连续打腿，再加入两臂交替划水。', '每划两三次手转身侧头吸一次气，脸在水里时持续吐气。', '身体保持水平、核心收紧，游一段距离后停下调整呼吸，再出发练到计时结束。'], tips: ['初学者每次先游短距离，不必一口气游完一个池长。', '呛水了就站起来，改游一段蛙泳调整，再试。', '动作越慢越容易协调。'], mistakes: ['头一直抬在水面上，下半身下沉。', '紧张时加快划臂频率，越游越乱。', '憋气不吐，换气时吸不进来。'] },
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
    if (_wmDate && _wmSet <= 1) wkClearIfEmpty(_wmDate);   // 打开引导又关掉、一组都没做 = 没开练
    _wmStopCd(); _wmSide = 0;
    const m = document.getElementById('workout-modal');
    if (m) m.classList.remove('open');
    if (typeof stopTimer === 'function') stopTimer();
    _xGuidedStop();
    if (typeof partnerLiveTick === 'function') partnerLiveTick();
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
  <div class="wm-set">${simple ? `${reps} ${ex.unit}` : `第 <b>${_wmSet}</b> / ${sets} 组 · 目标 ${reps} ${ex.unit}${ex.bi ? '/每侧' : ''}`}</div>${date === todayStr() && typeof ptWithHtml === 'function' ? ptWithHtml('g') : ''}
  ${needW ? `<div class="wm-weight"><label for="wm-weight">重量</label><input id="wm-weight" type="number" inputmode="decimal" step="0.5" value="${curW || ''}" placeholder="${lastW ? lastW.weight : ''}"><span>kg${lastW ? ' · 上次 ' + lastW.weight : ''}${e1rm ? ' · 1RM≈' + e1rm : ''}</span></div>` : ''}
  <div class="actions wm-acts"><button type="button" class="link-btn" aria-expanded="${adjOpen}" onclick="wmToggleAdj()">${adjOpen ? '▴ 收起' : '▾ 调整'}</button>${canSwap ? `<button type="button" class="link-btn swap-btn" onclick="swapExercise('${date}',${i})">换 / 划掉</button>` : `<button type="button" class="link-btn" onclick="openSwapSheet('${date}',${i})">划掉</button>`}${aiOn ? `<button type="button" class="link-btn" onclick="wmClose();coachAskAbout('${_q(ex.name)}')">问教练</button>` : ''}</div>
  ${adjOpen ? `<div class="wm-edit">${simple ? '' : _stepRowHtml('组', `${sets}`, `adj('${date}',${i},'s',-1)`, `adj('${date}',${i},'s',1)`, sets <= 1)}${_stepRowHtml(unitLbl, `${reps}${ex.bi ? '<span class="step-unit"> /每侧</span>' : ''}`, `adj('${date}',${i},'r',-1)`, `adj('${date}',${i},'r',1)`, reps <= (ex.unit === '秒' ? 5 : 1))}${needW ? `<div class="stepper"><span class="step-lbl">kg</span><button type="button" class="step-btn" onclick="stepWeight('${date}',${i},-1)" aria-label="重量减少">−</button><span class="step-val">${kgVal}</span><button type="button" class="step-btn" onclick="stepWeight('${date}',${i},1)" aria-label="重量增加">+</button></div>` : ''}</div>` : ''}
  ${dispNote ? `<div class="exnote">${dispNote}</div>` : ''}
  ${cdBlock}<div class="wm-nav"><button class="btn-line" onclick="wmNav(-1)" aria-label="上一个动作">↑</button>${mainBtn}<button class="btn-line" onclick="wmNav(1)" aria-label="下一个动作">↓</button></div>${altBtn}
  <button class="btn-line" onclick="wmFinish()">结束训练并打卡</button>`);
  const wEl = document.getElementById('wm-weight');
  if (wEl) wEl.addEventListener('change', () => { const v = parseFloat(wEl.value); if (isFinite(v) && v > 0) setWeight(date, _wmIdx, v); });
  if (typeof skinAfterRender === 'function') skinAfterRender('guided');   // 运动风格:卡里的组间倒计时接上计时器
  if (typeof partnerLiveTick === 'function') partnerLiveTick();   // 引导里第几组变了:搭子那边跟着变
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


// ══ 动作演示图 ══════════════════════════════════════════
// 两个来源:① Gym visual 的 3D 动图(hasaneyldrm/exercises-dataset 收录,180×180,走 jsDelivr 热链,有 CORS 可缓存 / 离线;
//   每处使用都要带「© Gym visual — https://gymvisual.com/」);② 数据集里没有的(瑜伽 / 拉伸 / 游泳等)用 Wikimedia Commons
//   上开放授权(CC0 / PD / CC BY / CC BY-SA)的动图或图,写明作者和授权、链回文件页。
// EXERCISE_MEDIA[动作名] = 'videos/xxx.gif'(Gym visual,前面拼 GIF_BASE)或 { u: 图地址, p: Commons 文件页, l: 授权, a: 作者, k: 'gif' | 'image' }。
// 每一条都对照缩略图核过「照着做就是我们说明里这个动作」(2026-11-10 Cici:GIF 和说明有时候对不上);对不上的宁可没有。
// 锁定到固定 commit(2026-07-16 的 main):@main 不锁版本,对方一挪目录图就全挂;固定 commit 在 jsDelivr 上是 immutable 缓存
const GIF_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/';
const EXERCISE_MEDIA = {"杠铃卧推":"videos/0025-EIeI8Vf.gif","哑铃卧推":"videos/0289-SpYC0Kp.gif","上斜哑铃卧推":"videos/0314-ns0SIbU.gif","下斜杠铃卧推":"videos/0033-GrO65fd.gif","史密斯卧推":"videos/0748-trqKQv2.gif","坐姿推胸机":"videos/0577-T0yTjgW.gif","器械夹胸":"videos/0596-v3xmPAR.gif","绳索夹胸":"videos/0188-xLYSdtg.gif","绳索下斜夹胸":"videos/0227-Pr9Rhf4.gif","哑铃仰卧屈臂上拉":"videos/0375-9XjtHvS.gif","上斜哑铃飞鸟":"videos/0319-ESOd5Pl.gif","俯卧撑":"videos/0662-I4hDWkc.gif","杠铃推举":"videos/1456-wdRZISl.gif","哑铃肩推":"videos/0405-znQUdHY.gif","器械推举":"videos/0587-CggQhII.gif","史密斯肩推":"videos/0766-903mzG8.gif","侧平举":"videos/0334-DsgkuIt.gif","坐姿侧平举机":"videos/0584-dRTfGZT.gif","绳索侧平举":"videos/0192-wEulIzp.gif","哑铃前平举":"videos/0310-3eGE2JC.gif","绳索前平举":"videos/0162-u2X71Np.gif","杠铃直立划船":"videos/0120-UDlhcO8.gif","俯身飞鸟":"videos/0380-v1qBec9.gif","反向飞鸟机":"videos/0602-myfUsKf.gif","面拉":"videos/0203-wqNPGCg.gif","杠铃弯举":"videos/0031-25GPyDY.gif","哑铃弯举":"videos/0285-BU15nH4.gif","牧师椅杠铃弯举":"videos/0070-qOgPVf6.gif","器械弯举":"videos/0575-q6y3OhV.gif","集中弯举":"videos/0297-gvsWLQw.gif","斜板哑铃弯举":"videos/0318-ae9UoXQ.gif","锤式弯举":"videos/0313-slDvUAU.gif","绳索弯举":"videos/0868-G08RZcQ.gif","绳索过头弯举":"videos/1636-wDUqY2u.gif","绳索下压":"videos/0201-3ZflifB.gif","器械三头下压":"videos/1451-BRImeP8.gif","绳索过头臂屈伸":"videos/0194-2IxROQ1.gif","哑铃臂屈伸":"videos/2188-kont8Ut.gif","俯身单臂哑铃臂屈伸":"videos/0333-W6PxUkg.gif","双杠臂屈伸":"videos/0814-X6C6i5Y.gif","助力双杠臂屈伸":"videos/0019-J60bN17.gif","窄距杠铃卧推":"videos/0030-J6Dx1Mu.gif","仰卧臂屈伸":"videos/0351-mpKZGWz.gif","引体向上":"videos/0652-lBDjFxJ.gif","助力引体向上机":"videos/0017-kiJ4Z2K.gif","高位下拉":"videos/0150-eYnzaCm.gif","坐姿划船":"videos/0861-fUBheHs.gif","T把划船":"videos/0606-aaXr7ld.gif","杠铃斜板划船":"videos/0049-dmgMp3n.gif","哑铃单臂划船":"videos/0292-C0MA9bC.gif","器械上背划船":"videos/1350-7I6LNUG.gif","俯身划船":"videos/0027-eZyBC3j.gif","绳索直臂下压":"videos/0238-x69MAlq.gif","直臂下压机":"videos/2285-4U7iLb5.gif","山羊挺身":"videos/0489-zhMwOwE.gif","弹力带划船":"videos/3144-Nu7jqFE.gif","双腿relevé踮立保持":"videos/1373-bJYHBIN.gif","站姿提踵":"videos/1490-6HmFgmx.gif","腿举机提踵":"videos/1391-ykHcWme.gif","坐姿提踵":"videos/0594-bOOdeyc.gif","跑步机慢跑":"videos/0684-y5p0H8a.gif","弧形跑步机":{"u":"https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Cross_Runner_-_Curved_Treadmill_01.jpg/500px-Cross_Runner_-_Curved_Treadmill_01.jpg","p":"https://commons.wikimedia.org/wiki/File:Cross_Runner_-_Curved_Treadmill_01.jpg","l":"CC BY-SA 4.0","a":"Burkhard Mücke","k":"image"},"划船机":{"u":"https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8d/Raising_the_bar_012815-A-TU438-003.jpg/500px-Raising_the_bar_012815-A-TU438-003.jpg","p":"https://commons.wikimedia.org/wiki/File:Raising_the_bar_012815-A-TU438-003.jpg","l":"Public domain","a":"Sgt. Jesse Smith","k":"image"},"风阻划船机":{"u":"https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8d/Raising_the_bar_012815-A-TU438-003.jpg/500px-Raising_the_bar_012815-A-TU438-003.jpg","p":"https://commons.wikimedia.org/wiki/File:Raising_the_bar_012815-A-TU438-003.jpg","l":"Public domain","a":"Sgt. Jesse Smith","k":"image"},"椭圆机":"videos/2141-rjtuP6X.gif","骑行机":"videos/0798-a8VDgLw.gif","动感单车":"videos/2138-H1PESYI.gif","攀爬机":"videos/2311-j9Q5crt.gif","跳绳":"videos/2612-e1e76I2.gif","开合跳":"videos/3220-f9lVSSI.gif","波比跳":"videos/1160-dK9394r.gif","上肢功率车":"videos/2139-pAIWRGu.gif","杠铃深蹲":"videos/0043-qXTaZnJ.gif","相扑深蹲保持（sumo squat hold）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Upave%C5%9B%C4%81sana.jpg/500px-Upave%C5%9B%C4%81sana.jpg","p":"https://commons.wikimedia.org/wiki/File:Upave%C5%9B%C4%81sana.jpg","l":"CC BY-SA 4.0","a":"robzabelyoga.com","k":"image"},"颈前杠铃深蹲":"videos/0042-zG0zs85.gif","史密斯深蹲":"videos/0770-jFtipLl.gif","倒蹬机":"videos/0739-10Z2DXU.gif","哈克深蹲":"videos/0743-Qa55kX1.gif","腿屈伸":"videos/0585-my33uHU.gif","保加利亚分腿蹲":"videos/0410-qx4fgX7.gif","哑铃弓步蹲":"videos/0336-RRWFUcw.gif","高脚杯深蹲":"videos/1760-yn8yg1r.gif","壶铃高脚杯深蹲":"videos/0534-ZA8b5hc.gif","哥萨克深蹲":"videos/3643-GWoKnIm.gif","侧卧抬腿":"videos/0710-7WaDzyL.gif","器械外展机":"videos/0597-CHpahtl.gif","芭蕾深蹲（plié）":{"u":"https://upload.wikimedia.org/wikipedia/commons/b/b1/2007-08-24_Hawaii_Shiva_Rea.jpg","p":"https://commons.wikimedia.org/wiki/File:2007-08-24_Hawaii_Shiva_Rea.jpg","l":"CC BY-SA 3.0","a":"Loveobx23","k":"image"},"单腿relevé踮立":"videos/1387-0jp9Rlz.gif","臀桥保持":"videos/0668-UpAlold.gif","罗马尼亚硬拉":"videos/0085-wQ2c4XD.gif","传统硬拉":"videos/0032-ila4NZS.gif","臀推":"videos/0058-SNFfUff.gif","腿弯举":"videos/0586-17lJ1kr.gif","坐姿腿弯举":"videos/0599-Zg3XY7P.gif","站姿单腿弯举机":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Standing_leg_curls_2.svg/500px-Standing_leg_curls_2.svg.png","p":"https://commons.wikimedia.org/wiki/File:Standing_leg_curls_2.svg","l":"CC BY-SA 3.0","a":"Everkinetic","k":"image"},"绳索后踢腿":"videos/0228-Kpajagk.gif","器械内收机":"videos/0598-oHsrypV.gif","壶铃摆动":"videos/0549-UHJlbu3.gif","臀桥":"videos/0668-UpAlold.gif","跪姿深蹲（kneeling squat）":"videos/3236-Pjbc0Kt.gif","肩胛垫高臀推":"videos/0058-SNFfUff.gif","芭蕾后退腿（arabesque）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Arabesque_%2826916085736%29.jpg/500px-Arabesque_%2826916085736%29.jpg","p":"https://commons.wikimedia.org/wiki/File:Arabesque_(26916085736).jpg","l":"CC BY-SA 2.0","a":"Estitxu Carton","k":"image"},"鸟狗式（bird dog）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Bird_dog_exercise.jpg/500px-Bird_dog_exercise.jpg","p":"https://commons.wikimedia.org/wiki/File:Bird_dog_exercise.jpg","l":"CC BY 2.0","a":"PTPioneer","k":"image"},"跪姿直腿后踢":"videos/0130-u27Kcdz.gif","鸟狗式":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Pilates_01.jpg/500px-Pilates_01.jpg","p":"https://commons.wikimedia.org/wiki/File:Pilates_01.jpg","l":"Public domain","a":"J. Vílchez","k":"image"},"凯格尔盆底收缩":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Kegel_Excercise.svg/500px-Kegel_Excercise.svg.png","p":"https://commons.wikimedia.org/wiki/File:Kegel_Excercise.svg","l":"CC BY-SA 4.0","a":"MillaAndriana08","k":"image"},"死虫式（慢速对角）":"videos/0276-iny3m5y.gif","仰卧直腿下放（leg lowering）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Legraises.gif/500px-Legraises.gif","p":"https://commons.wikimedia.org/wiki/File:Legraises.gif","l":"CC BY-SA 4.0","a":"Wensceslao","k":"gif"},"俯冲式俯卧撑（dive bomber push-up）":"videos/3662-XPUDTt7.gif","平板支撑":"videos/2135-VBAWRPG.gif","卷腹":"videos/0274-TFqbd8t.gif","坐姿卷腹机":"videos/1452-Wgaz7pm.gif","悬挂抬腿":"videos/0475-4Ml7QFO.gif","罗马椅抬腿":"videos/2963-weoDEpH.gif","俄罗斯转体":"videos/0687-XVDdcoj.gif","负重俄罗斯转体":"videos/0845-WU9BLIs.gif","绳索伐木":"videos/0862-fhZQPlV.gif","死虫式":"videos/0276-iny3m5y.gif","腹轮":"videos/0857-NAgVB3t.gif","侧平板支撑":"videos/0705-RKjH6Lt.gif","侧平板髋部下沉（side plank hip dip）":"videos/0705-RKjH6Lt.gif","骆驼式（ustrasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Ustrasana_Yoga-Asana_Nina-Mel.jpg/500px-Ustrasana_Yoga-Asana_Nina-Mel.jpg","p":"https://commons.wikimedia.org/wiki/File:Ustrasana_Yoga-Asana_Nina-Mel.jpg","l":"CC BY 3.0","a":"Kennguru","k":"image"},"单腿passé平衡":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Santavuori-balettia-kaikille-retire.png/500px-Santavuori-balettia-kaikille-retire.png","p":"https://commons.wikimedia.org/wiki/File:Santavuori-balettia-kaikille-retire.png","l":"CC BY-SA 4.0","a":"Heli Santavuori","k":"image"},"肩胛引体激活":"videos/0688-uTBt1HV.gif","L撑":"videos/3419-UpWmA5E.gif","水中行走热身":{"u":"https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Woman_walks_in_indoor_swimming_pool_at_wellness_center.jpg/500px-Woman_walks_in_indoor_swimming_pool_at_wellness_center.jpg","p":"https://commons.wikimedia.org/wiki/File:Woman_walks_in_indoor_swimming_pool_at_wellness_center.jpg","l":"CC BY 2.0","a":"Shixart1985","k":"image"},"蛙泳手部划水练习":{"u":"https://upload.wikimedia.org/wikipedia/commons/1/10/Breaststroke.gif","p":"https://commons.wikimedia.org/wiki/File:Breaststroke.gif","l":"CC BY-SA 4.0","a":"fxqf","k":"gif"},"蛙泳完整配合":{"u":"https://upload.wikimedia.org/wikipedia/commons/7/7d/Breaststroke2.gif","p":"https://commons.wikimedia.org/wiki/File:Breaststroke2.gif","l":"CC BY-SA 4.0","a":"fxqf","k":"gif"},"水中漫步放松":{"u":"https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Woman_walks_in_indoor_swimming_pool_at_wellness_center.jpg/500px-Woman_walks_in_indoor_swimming_pool_at_wellness_center.jpg","p":"https://commons.wikimedia.org/wiki/File:Woman_walks_in_indoor_swimming_pool_at_wellness_center.jpg","l":"CC BY 2.0","a":"Shixart1985","k":"image"},"蛙泳连续游":{"u":"https://upload.wikimedia.org/wikipedia/commons/7/7d/Breaststroke2.gif","p":"https://commons.wikimedia.org/wiki/File:Breaststroke2.gif","l":"CC BY-SA 4.0","a":"fxqf","k":"gif"},"蛙泳间歇训练":{"u":"https://upload.wikimedia.org/wikipedia/commons/7/7d/Breaststroke2.gif","p":"https://commons.wikimedia.org/wiki/File:Breaststroke2.gif","l":"CC BY-SA 4.0","a":"fxqf","k":"gif"},"自由泳划臂+侧头呼吸":{"u":"https://upload.wikimedia.org/wikipedia/commons/e/eb/Freestyle_swimming2_without_text.gif","p":"https://commons.wikimedia.org/wiki/File:Freestyle_swimming2_without_text.gif","l":"CC BY-SA 4.0","a":"fxqf","k":"gif"},"自由泳完整配合":{"u":"https://upload.wikimedia.org/wikipedia/commons/e/eb/Freestyle_swimming2_without_text.gif","p":"https://commons.wikimedia.org/wiki/File:Freestyle_swimming2_without_text.gif","l":"CC BY-SA 4.0","a":"fxqf","k":"gif"},"开合跳热身":"videos/3220-f9lVSSI.gif","扩胸运动":"videos/1167-3uj0Ozg.gif","徒手深蹲激活":"videos/3119-75Bgtjy.gif","弓步转体":"videos/1688-K9VL0Jq.gif","登山者":"videos/0630-RJgzwny.gif","俯身直臂画圆":{"u":"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5f/Pendulum_exercise_%28passive_exercise%29.jpg/500px-Pendulum_exercise_%28passive_exercise%29.jpg","p":"https://commons.wikimedia.org/wiki/File:Pendulum_exercise_(passive_exercise).jpg","l":"CC0","a":"M.C. Morgan","k":"image"},"踝关节绕环":"videos/1368-uL9CsKm.gif","原地跑热身":"videos/0685-oLrKqDH.gif","波比跳热身":"videos/1160-dK9394r.gif","深蹲底部左右摇摆（squat rock）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Upave%C5%9B%C4%81sana.jpg/500px-Upave%C5%9B%C4%81sana.jpg","p":"https://commons.wikimedia.org/wiki/File:Upave%C5%9B%C4%81sana.jpg","l":"CC BY-SA 4.0","a":"robzabelyoga.com","k":"image"},"抱膝排气式（apanasana）":"videos/1418-znP9SIh.gif","猫式伸展（cat stretch）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Yoga_at_Your_Park_-_Bitilasana.jpg/500px-Yoga_at_Your_Park_-_Bitilasana.jpg","p":"https://commons.wikimedia.org/wiki/File:Yoga_at_Your_Park_-_Bitilasana.jpg","l":"Public domain","a":"Mary O'Neill","k":"image"},"青蛙式（frog pose）":"videos/2571-2Dk4xQV.gif","婴儿式背部拉伸":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Balasana_.jpg/500px-Balasana_.jpg","p":"https://commons.wikimedia.org/wiki/File:Balasana_.jpg","l":"CC BY-SA 4.0","a":"UmaPrykhodko","k":"image"},"坐角式（upavistha konasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Upavisha_Konasana....jpg/500px-Upavisha_Konasana....jpg","p":"https://commons.wikimedia.org/wiki/File:Upavisha_Konasana....jpg","l":"CC BY-SA 4.0","a":"Yogini Asha","k":"image"},"仰卧英雄式（supta virasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Supta-Virasana_Yoga-Asana_Nina-Mel.jpg/500px-Supta-Virasana_Yoga-Asana_Nina-Mel.jpg","p":"https://commons.wikimedia.org/wiki/File:Supta-Virasana_Yoga-Asana_Nina-Mel.jpg","l":"CC BY 3.0","a":"Kennguru","k":"image"},"斯芬克斯式（sphinx pose）":"videos/1362-DIVyqrU.gif","肩后侧拉伸":"videos/0669-xifhB5W.gif","三头肌拉伸":"videos/0643-Z5YStHW.gif","股四头肌拉伸":{"u":"https://upload.wikimedia.org/wikipedia/commons/8/81/Quad_stretch-CDC_strength_training_for_older_adults.gif","p":"https://commons.wikimedia.org/wiki/File:Quad_stretch-CDC_strength_training_for_older_adults.gif","l":"Public domain","a":"Centers for Disease Control and Prevention","k":"gif"},"腘绳肌/体前屈":"videos/3212-BbfB8Gb.gif","眼镜蛇式":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Bhujangasana_zamkovoi.jpg/500px-Bhujangasana_zamkovoi.jpg","p":"https://commons.wikimedia.org/wiki/File:Bhujangasana_zamkovoi.jpg","l":"CC BY-SA 4.0","a":"Sezam777","k":"image"},"鸽子式开髋":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/IMG_0585_2--_Swan.jpg/500px-IMG_0585_2--_Swan.jpg","p":"https://commons.wikimedia.org/wiki/File:IMG_0585_2--_Swan.jpg","l":"CC BY-SA 3.0","a":"Christy Collins","k":"image"},"蝴蝶式":"videos/1494-bWlZvXh.gif","猫牛式":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Yoga_at_Your_Park_-_Bitilasana.jpg/500px-Yoga_at_Your_Park_-_Bitilasana.jpg","p":"https://commons.wikimedia.org/wiki/File:Yoga_at_Your_Park_-_Bitilasana.jpg","l":"Public domain","a":"Mary O'Neill","k":"image"},"深蹲保持":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Upave%C5%9B%C4%81sana.jpg/500px-Upave%C5%9B%C4%81sana.jpg","p":"https://commons.wikimedia.org/wiki/File:Upave%C5%9B%C4%81sana.jpg","l":"CC BY-SA 4.0","a":"robzabelyoga.com","k":"image"},"颈侧拉伸":"videos/0716-oQRJYkC.gif","脚踝绕环":"videos/1368-uL9CsKm.gif","腓肠肌拉伸":"videos/1377-m0tCHqc.gif","犁式（halasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Plough_pose.jpg/500px-Plough_pose.jpg","p":"https://commons.wikimedia.org/wiki/File:Plough_pose.jpg","l":"CC BY-SA 3.0","a":"Satheesan.vn","k":"image"},"仰卧束角式":{"u":"https://upload.wikimedia.org/wikipedia/commons/6/6a/Supta_baddha_konasana_variation.jpg","p":"https://commons.wikimedia.org/wiki/File:Supta_baddha_konasana_variation.jpg","l":"CC BY-SA 2.0","a":"Trollderella (en.wikipedia), cropped by Ludmiła Pilecka","k":"image"},"下犬到上犬流动":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Downward-Facing-Dog.JPG/500px-Downward-Facing-Dog.JPG","p":"https://commons.wikimedia.org/wiki/File:Downward-Facing-Dog.JPG","l":"CC BY 3.0","a":"Iveto","k":"image"},"下犬式":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Downward-Facing-Dog.JPG/500px-Downward-Facing-Dog.JPG","p":"https://commons.wikimedia.org/wiki/File:Downward-Facing-Dog.JPG","l":"CC BY 3.0","a":"Iveto","k":"image"},"挺尸式（savasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Shavasana.jpg/500px-Shavasana.jpg","p":"https://commons.wikimedia.org/wiki/File:Shavasana.jpg","l":"CC BY-SA 3.0","a":"Joseph RENGER","k":"image"},"卧束角式（supta baddha konasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/6/6a/Supta_baddha_konasana_variation.jpg","p":"https://commons.wikimedia.org/wiki/File:Supta_baddha_konasana_variation.jpg","l":"CC BY-SA 2.0","a":"Trollderella (en.wikipedia), cropped by Ludmiła Pilecka","k":"image"},"婴儿式（balasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Balasana_zamkovoi.jpg/500px-Balasana_zamkovoi.jpg","p":"https://commons.wikimedia.org/wiki/File:Balasana_zamkovoi.jpg","l":"CC BY-SA 4.0","a":"Sezam777","k":"image"},"鸽式（eka pada kapotasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/IMG_0585_2--_Swan.jpg/500px-IMG_0585_2--_Swan.jpg","p":"https://commons.wikimedia.org/wiki/File:IMG_0585_2--_Swan.jpg","l":"CC BY-SA 3.0","a":"Christy Collins","k":"image"},"弓式（dhanurasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Dhanurasana.jpg/500px-Dhanurasana.jpg","p":"https://commons.wikimedia.org/wiki/File:Dhanurasana.jpg","l":"CC BY-SA 3.0","a":"Joseph RENGER","k":"image"},"轮式（urdhva dhanurasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Chakrasana_Yoga-Asana_Nina-Mel.jpg/500px-Chakrasana_Yoga-Asana_Nina-Mel.jpg","p":"https://commons.wikimedia.org/wiki/File:Chakrasana_Yoga-Asana_Nina-Mel.jpg","l":"CC BY 3.0","a":"Kennguru","k":"image"},"花环式（malasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Upave%C5%9B%C4%81sana.jpg/500px-Upave%C5%9B%C4%81sana.jpg","p":"https://commons.wikimedia.org/wiki/File:Upave%C5%9B%C4%81sana.jpg","l":"CC BY-SA 4.0","a":"robzabelyoga.com","k":"image"},"猴神式（hanumanasana）":{"u":"https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Hanumaanasana.jpg/500px-Hanumaanasana.jpg","p":"https://commons.wikimedia.org/wiki/File:Hanumaanasana.jpg","l":"CC BY-SA 4.0","a":"Mohan Yoga India","k":"image"}};
const GV_CREDIT = '© Gym visual', GV_LINK = 'https://gymvisual.com/';
// 统一取图:{ url, kind, credit, link };没有就 null
function exMedia(name) {
  const m = EXERCISE_MEDIA[name];
  if (!m) return null;
  if (typeof m === 'string') return { url: GIF_BASE + m, kind: 'gif', credit: GV_CREDIT, link: GV_LINK, gv: true };
  return { url: m.u, kind: m.k || 'image', credit: [m.a, m.l, 'Wikimedia Commons'].filter(Boolean).join(' · '), link: m.p || '', gv: false };
}
// 列表行 / 焦点卡左边的缩略图(运动风格用;纸墨列表不放)。没有图给一个空占位块,行高不跳
function exThumbHtml(name, cls = 'sp-thumb') {
  const m = exMedia(name);
  if (!m) return `<span class="${cls} none" aria-hidden="true"></span>`;
  return `<img class="${cls}" src="${_escHtml(m.url)}" alt="" aria-hidden="true" loading="lazy" decoding="async" crossorigin="anonymous" onerror="this.classList.add('err')">`;
}
// 详情弹窗里的大图 + 署名(两套风格共用)
function exMediaBlock(name) {
  const m = exMedia(name);
  if (!m) return '';
  const cred = _escHtml(m.credit + (m.gv ? ' — gymvisual.com' : ''));   // 纯文字署名(小链接点不中,ui3 审计)
  return `<div class="gif-box"><img src="${_escHtml(m.url)}" alt="${_escHtml(name)}演示" crossorigin="anonymous" loading="lazy" onerror="this.parentElement.style.display='none'"><div class="cap">${m.kind === 'gif' ? '动图示范' : '姿势示意'} · ${cred}</div></div>`;
}
window.exMedia = exMedia; window.exThumbHtml = exThumbHtml; window.exMediaBlock = exMediaBlock;
// ══ 需要搭子保护的动作(2026-11-10 Cici「需要搭子做保护的动作要标出来」)══
// 标准:做到力竭时会被重量压住、自己脱不开、器械又没有保护挂钩 / 保护杠的。level 必须 / 建议;how = 搭子站哪、手放哪、什么时候接。
const EX_SPOT = {
  '杠铃卧推': { level: '必须', how: '搭子站在凳头后方，双手一正一反握在你双手内侧的杠上，只跟随不发力；起杠时帮你把杠送到肩膀正上方，你推不动、杠停住或往下沉时，立刻握杠向上拉，一起挂回架钩。' },
  '哑铃卧推': { level: '建议', how: '用大重量时，搭子站或跪在凳头后方，双手扶在你的手腕上（不要扶手肘）；开始时帮你把哑铃稳在胸口上方，你推不动时托住手腕向上助力。' },
  '上斜哑铃卧推': { level: '建议', how: '用大重量时，搭子站在靠背后方，双手扶住你的手腕；开始时帮你把哑铃稳在肩膀上方，你推不动时托住手腕向上助力。' },
  '下斜杠铃卧推': { level: '必须', how: '搭子站在凳头后方，双手一正一反握在你双手内侧的杠上，只跟随不发力；起杠时帮你把杠送到肩膀正上方，你推不动、杠停住或往下沉时，立刻握杠向上拉，一起挂回架钩。下斜凳起杠角度别扭，起杠和还杠都由搭子帮忙。' },
  '哑铃仰卧屈臂上拉': { level: '建议', how: '用大重量时，搭子站在你头部后方，双手放在哑铃下方虚托跟随；开始时把哑铃递到你胸口上方，你拉不回来时托住哑铃帮你拉回胸口上方。' },
  '窄距杠铃卧推': { level: '必须', how: '搭子站在凳头后方，双手一正一反握在你双手内侧的杠上，只跟随不发力；起杠时帮你把杠送到肩膀正上方，你推不动、杠停住或往下沉时，立刻握杠向上拉，一起挂回架钩。' },
  '仰卧臂屈伸': { level: '建议', how: '用大重量或 EZ 曲杠时，搭子站在你头部后方，双手虚托在哑铃或杠下方跟随；开始时把重量递到你胸口上方，你推不起来时托住重量帮你推回，或直接接走。' },
  '杠铃深蹲': { level: '建议', how: '在设好保护杠的深蹲架里可以自己做；没有保护杠时要有搭子：搭子站在你正后方，双脚前后分开，双手放在你两侧腋下附近但不碰你，随你下蹲一起屈膝；你停住站不起来时，双手从腋下托住你胸廓两侧向上帮你站起，再一起走回架子挂杠。' },
  '颈前杠铃深蹲': { level: '建议', how: '没有保护杠时建议有搭子：搭子站在你正后方，双手放在你两侧腋下附近但不碰你，随你下蹲一起屈膝；你停住站不起来时，从腋下托住你胸廓两侧向上帮你站起。设好保护杠时可以不用搭子，失败时自己把杠铃向前推离身体、落到保护杠上。' },
  '保加利亚分腿蹲': { level: '建议', how: '按负重方式肩上扛杠铃做时才需要：最好在深蹲架里做，把保护杠调到略低于你蹲到底时杠铃的高度；没有保护杠时，搭子站在你正后方，双手放在你两侧腋下附近但不碰你，随你下蹲一起屈膝，你站不起来时从腋下托住胸廓两侧帮你站起。两手拿哑铃做时不需要搭子，做不起来直接松手放下哑铃。' },
  '相扑深蹲': { level: '建议', how: '按负重方式肩上扛杠铃做时才需要：在深蹲架里做并设好保护杠；没有保护杠时，搭子站在你正后方，双手放在你两侧腋下附近但不碰你，随你下蹲一起屈膝，你站不起来时从腋下托住胸廓两侧帮你站起。徒手或手持一只哑铃、壶铃做时不需要搭子，做不起来直接把重物放到两脚之间的地上。' },
};
function exSpot(name) { return EX_SPOT[name] || null; }
// Keep 动作页(2026-11-10):Keep 没有搜索网址,但每个动作有自己的页面 keep.com/exercises/<id>?gender=f(女示范)。
// 下面是和 Keep 动作库(4729 个)同名、并逐个打开核过标题的;对不上的动作不放 Keep 按钮(以前那个链到首页 = 下载页)。
// 用 keep.com 不用 gotokeep.com:后者在 iPhone 上会被 Keep app 截走,落到哪页没验证过
const EX_KEEP = {"上斜哑铃卧推": "5763d3b011fc5077c3acf58b", "下斜杠铃卧推": "66b0790e5568440001816aa8", "上斜哑铃飞鸟": "5763d3b011fc5077c3acf586", "俯卧撑": "54af5ef25c5f72d2058c5b34", "引体向上": "564b0b02a9f7e955480ff002", "坐姿划船": "644a53a70877660001933432", "绳索直臂下压": "66a70de0d835de000117e20f", "山羊挺身": "595f4f30ff247f33e297eb9d", "杠铃弯举": "5979cae611fc50467bd124e3", "哑铃弯举": "54af5ef35c5f72d2058c5d11", "双杠臂屈伸": "66b077eb5568440001814cf5", "助力双杠臂屈伸": "68dbeeb505da460001a4f1cf", "靠墙静蹲": "55cc42cae5882abe3cefc081", "杠铃深蹲": "5763d3b011fc5077c3acf5be", "靠墙静蹲（wall sit）": "55cc42cae5882abe3cefc081", "哈克深蹲": "595f4eedff247f33e297eb6d", "壶铃高脚杯深蹲": "5c176f89d734a23bcbcc4a04", "相扑深蹲": "564b0b02a9f7e955480ff00f", "臀桥": "55cc42cd5f9bd587372f64c9", "史密斯提踵": "66b09886d547f9000174cb19", "坐姿提踵": "682165d95815710001feb0fa", "死虫式（慢速对角）": "595f4dc4ff247f33e297ea82", "平板支撑": "63a51fc986e699000124e0b0", "卷腹": "55cc42efb312f5f484e89acd", "俄罗斯转体": "595f4e55ff247f33e297eaf1", "死虫式": "595f4dc4ff247f33e297ea82", "骆驼式（ustrasana）": "6a910272ea5edb00013f6092", "划船机": "66053d038b78a100016d3f30", "跳绳": "595f4f2eff247f33e297eb99", "开合跳": "62e2261293b6420001c638fe", "颈部绕环": "595f4ccfff247f33e297ea21", "猫式伸展（cat stretch）": "55cc42d24a334c5f820adca7", "仰卧英雄式（supta virasana）": "67fc7d93db92f00001debcc5", "眼镜蛇式": "67fcd1e7db92f00001e1944c", "猫牛式": "68006efc27121300015d51e1", "犁式（halasana）": "67fcd92027121300013f16e9", "仰卧束角式": "67fc7d4ddb92f00001deb8fb", "下犬式": "6a910276de389600012d5375", "婴儿式（balasana）": "67f7792d93e7c40001bf41d9", "弓式（dhanurasana）": "67fcbe5427121300013e09ee", "轮式（urdhva dhanurasana）": "67fdc5df271213000146c6b0", "花环式（malasana）": "67fdc60e271213000146c8ed", "高位下拉": "66a73a08f370cc00014b0f6a", "腿弯举": "681b0b6219ea5f0001f47f37", "肩后侧拉伸": "55cc42ecb77ff62b81a9ac3c"};
function exKeepUrl(name) { const i = EX_KEEP[name]; return i ? `https://keep.com/exercises/${i}?gender=f` : ''; }
window.exKeepUrl = exKeepUrl;
window.exSpot = exSpot;

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
      const _gif = exMedia(name);
      const _gifBlock = exMediaBlock(name);
      const _demo = `<p class="sec-label">示范 · 看怎么做</p>
      ${_gifBlock}
      <div class="demo-links">
        ${_djump('https://www.douyin.com/search/' + _dq, '抖音', '在抖音搜索该动作演示')}
        ${_djump('https://www.xiaohongshu.com/search_result?keyword=' + _dq, '小红书', '在小红书搜索该动作演示')}
        ${_djump('https://search.bilibili.com/all?keyword=' + _dq, 'B站', '在B站搜索该动作视频')}
        ${exKeepUrl(name) ? _djump(exKeepUrl(name), 'Keep', '打开 Keep 上这个动作的示范页') : ''}
      </div>`;
      const _str = _e1rm ? `<div class="kv wide" style="margin-top:4px"><span class="k">预计 1RM</span><span>≈ ${_e1rm} kg <span class="faint">（基于你的历史）</span></span><span class="k">目标重量</span><span>力量 5 次≈${weightForReps(_e1rm, 5)} · 增肌 10 次≈${weightForReps(_e1rm, 10)} · 塑形 15 次≈${weightForReps(_e1rm, 15)} kg</span></div>` : '';
      _strEl.innerHTML = skinTpl('exStrength', { name, gif: _gif, e1rm: _e1rm, dq: _dq }, () => _demo + _str);
    }
  }
  
  document.getElementById('ex-modal-steps').innerHTML = steps.map((s, i) => `<div class="ex-step"><span class="ex-step-n">${i + 1}</span><span>${s}</span></div>`).join('');
  // 徒手但可加负荷的动作:把"怎么上重量"顶在提示第一条(反馈①:有配重框就必须写清怎么加)
  const _howW = (!altActive && typeof WEIGHT_HOW !== 'undefined' && WEIGHT_HOW[name]) ? [WEIGHT_HOW[name]] : [];
  const _allTips = _howW.concat(tips);
  const _spot = altActive ? null : exSpot(name);
  const _spotHtml = _spot ? `<div class="ex-tip how"><span class="sub-label" style="color:inherit">[ ${_spot.level === '必须' ? '需要搭子保护' : '建议有人保护'} ]</span> ${_spot.how}</div>` : '';
  document.getElementById('ex-modal-tips').innerHTML = skinTpl('exTips', { how: _howW, tips, spot: _spot }, () => _spotHtml + (_allTips.length ? _allTips.map((t, i) => (i < _howW.length
    ? `<div class="ex-tip how"><span class="sub-label" style="color:inherit">[ 怎么上重量 ]</span> ${t}</div>`
    : `<div class="ex-tip">${t}</div>`)).join('') : ''));
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
  // 「▶示范」快捷按钮 → 抖音搜索(动作演示最多);详情弹窗里另有 抖音/小红书/B站 一排(Keep 没有能直达动作的链接,2026-11-10 删)
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
  '靠墙静蹲（wall sit）': { muscles: ['股四头肌'], steps: ['背靠墙站立，后脑、上背和臀部贴墙，双脚与肩同宽，向前迈出约一步。', '沿墙慢慢下滑到大腿与地面平行，膝盖约成 90 度并对准脚尖。', '双手放在大腿上或垂在身体两侧，不要用手推腿借力。', '保持不动，均匀呼吸，坚持到计时结束。', '结束时扶墙沿墙慢慢滑回站立。'], tips: ['大腿平行就够了，不需要蹲得更低。', '腿开始发抖是正常的，姿势没变就继续到计时结束。', '太吃力先蹲高一点，能稳住再降到平行。'], mistakes: ['憋气。', '脚跟离地或膝盖向内扣。', '膝盖出现锐痛就停。'] },
  '相扑深蹲保持（sumo squat hold）': { muscles: ['股四头肌', '内收肌', '臀'], steps: ['双脚分开约肩宽的一倍半，脚尖向外约 45 度，脚跟踩实。', '屈膝屈髋向下蹲，膝盖顺着脚尖方向打开，蹲到你脚跟还能着地的最低位置。', '双手在胸前合掌，用两侧手肘抵住膝盖内侧，轻轻向外撑。', '胸口朝前、背部立直，均匀呼吸，在底部保持到计时结束。', '结束时双手扶膝或扶地，慢慢站起来。'], tips: ['蹲不下去或脚跟抬起时，在臀部下方垫一块瑜伽砖或坐垫，坐在上面保持。', '脚跟着地困难也可以在脚跟下垫一条折好的毛巾。', '重心放在脚跟和前脚掌之间。'], mistakes: ['弓背低头，胸口塌下去。', '脚跟翘起、重心往前扑。', '膝盖内侧或髋部锐痛、腿发麻就停。'] },
  '深蹲转体': { muscles: ['股四头肌', '核心', '骨盆控制'], steps: ['双脚并拢下蹲到底，脚跟尽量踩实', '双手胸前合十稳住重心', '保持下肢不动，躯干缓慢向一侧旋转到舒适末端，回正后换边'], tips: ['徒手小幅度旋转，练的是底部稳定与胸椎灵活', '每次转到末端停一秒再回'], mistakes: ['膝盖跟着左右晃', '借惯性快速甩动躯干'] },
  // —— glutemed ——
  '侧卧抬腿画圈': { muscles: ['臀中肌', '髋外旋肌'], steps: ['侧卧在垫子上，下方腿屈膝支撑，下方手臂枕在头下，骨盆垂直地面。', '上方腿伸直，抬到约 45 度。', '以髋为轴慢慢画小圈，正反方向各做一半次数，每画一圈算一次。', '做完放下腿，翻身换另一侧。'], tips: ['圈要小、要慢，臀侧持续发酸才对。', '脚跟稍微领先，脚尖不要朝天。', '太累可以把圈画得更小，或中途放下腿歇一下。'], mistakes: ['骨盆向后翻倒。', '圈画得太大太快，靠惯性。', '髋部出现锐痛就停。'] },
  '芭蕾深蹲（plié）': { muscles: ['臀中肌', '内收肌', '股四头肌'], steps: ['双脚宽于肩站立，脚尖向外打开 45 到 60 度，骨盆中立，双手叉腰或侧平举。', '躯干保持垂直，屈膝向正下方蹲，膝盖始终朝着脚尖方向。', '蹲到大腿接近与地面平行，或你还能保持膝对脚尖的最低位置。', '脚跟踩实站起，站直时收紧臀部。'], tips: ['想象背贴着一面墙上下滑动，上身不前倾。', '髋部紧时先减小外开角度，以膝跟得上为准。', '平衡不好可以一手扶椅背。'], mistakes: ['膝盖内扣。', '骨盆前倾撅臀。', '膝内侧出现锐痛就停。'] },
  '芭蕾侧踢腿（battement）': { muscles: ['臀中肌', '髋外展肌'], steps: ['侧身站在墙或椅背旁，靠近的手轻扶，身体立直，收紧腹部，支撑腿伸直。', '外侧腿伸直、脚背绷直，从身体正中向正侧方抬起，抬到约髋部高度或骨盆不歪的最高处。', '抬起可以稍快，放下要慢，控制着落回起始位置，脚尖轻点地。', '做完一侧次数后转身换另一条腿。'], tips: ['平衡好可以不扶墙，双臂垂放或侧平举。', '高度以骨盆不歪为准，抬不到髋高没关系。', '支撑腿的臀部也要收紧帮助稳定。'], mistakes: ['为了抬高把上身向对侧倾倒。', '脚背松弛。', '甩上去后不控制、直接砸下；髋部锐痛就停。'] },
  '单腿relevé踮立': { muscles: ['小腿三头肌', '踝稳定肌', '臀中肌'], steps: ['单腿站立，另一条腿屈膝把脚收在身后离地，双手放松在身前，或一手轻扶墙。', '慢慢踮起支撑脚的脚跟，踮到最高，在顶端稍停。', '慢慢放下，脚跟快碰地时再次踮起。', '连续起落，做到计时结束，再换另一条腿做同样的时间。'], tips: ['平衡不好时指尖轻扶墙。', '重心压向大脚趾和第二脚趾方向，骨盆保持水平。', '进阶可以站在台阶边缘，手扶墙或栏杆，让脚跟落到台阶以下再踮起。'], mistakes: ['脚踝向外翻。', '快速弹动，失去控制。', '小腿或跟腱出现锐痛就停。'] },
  // —— hamglutes ——
  '芭蕾后退腿（arabesque）': { muscles: ['臀大肌', '竖脊肌', '腘绳肌'], steps: ['侧对墙或把杆站立，一只手扶住，重心移到支撑腿，支撑腿膝盖微屈。', '工作腿伸直、脚背绷直，脚尖点在身后地面。', '臀部发力把工作腿向正后方抬起，躯干基本直立、可随腿抬高略微前倾，空着的手向前或向侧伸出保持平衡。', '在最高点停一两秒，骨盆保持朝前，然后控制放回脚尖点地。', '做完一侧次数后转身，换另一只手扶墙做另一侧。'], tips: ['先想着把腿向远处伸，再往上抬，高度宁低也不要折腰。', '扶墙的手只是轻扶，不要靠它拉住身体。'], mistakes: ['腰向前塌，用腰抬腿。', '髋向工作腿一侧大幅打开转身。', '支撑腿膝盖锁死；腰部出现锐痛就停。'] },
  '芭蕾地板后展腿': { muscles: ['臀大肌', '腘绳肌'], steps: ['四足跪在垫子上，双手在肩正下方，膝盖在髋正下方，背部平直。', '一条腿向后伸直，脚背绷直，脚尖轻点地面。', '臀部发力把这条腿缓慢向后上方抬起，抬到与躯干大致一线，骨盆两侧保持水平。', '顶端停一下，再沿弧线慢慢放回脚尖点地，做完一侧次数再换另一侧。'], tips: ['抬的高度不用大，骨盆不转动更重要。', '膝盖跪着疼就在膝下多垫一层垫子或毛巾。'], mistakes: ['骨盆向工作腿一侧翻开借力。', '塌腰用下背抬腿。', '腰部出现锐痛就停。'] },
  '大踢腿（grand battement）': { muscles: ['髋屈肌', '腘绳肌', '臀'], steps: ['侧对墙或把杆站立，一只手扶住，双腿伸直，工作腿脚尖点地。', '收紧腹部，躯干立直；每组选定一个方向：向前、向侧或向后。', '工作腿保持伸直、脚背绷直，快速向选定方向踢起到自己能控制的最高点。', '在最高点稳住，再慢慢放回脚尖点地，不要让腿自由落下砸地。', '做完一侧次数后转身换手，做另一侧。'], tips: ['高度服从控制，宁低勿晃。', '先从向前踢开始，熟练后再做侧踢和后踢。', '向后踢时上身可略微前倾，骨盆保持朝前。'], mistakes: ['弓背或后仰去迎合腿的高度。', '落腿时砸地，或支撑腿膝盖弯曲。', '腿后侧或髋部出现锐痛就停。'] },
  '前弯后腿上扬（penché）': { muscles: ['腘绳肌', '臀大肌', '竖脊肌'], steps: ['面对墙或椅背站立，双手扶住，重心移到支撑腿，支撑腿膝盖微屈。', '工作腿向后伸直，脚背绷直，脚尖点地。', '以髋为轴，上身向前下倾，同时工作腿向后上方抬起，两者像跷跷板一样同步，从头到后脚保持一条长线。', '到自己能控制的位置停住，骨盆两侧保持水平，均匀呼吸，保持到计时结束。', '上身和后腿同步慢慢回到站立，后脚落地后换另一条腿做支撑，同样计时。'], tips: ['先只做到上身和后腿接近水平，平衡稳了再加深。', '上身前倾较深时，扶墙的手可以沿墙下滑，或改扶椅座。', '腿后侧太紧时支撑腿可以多弯一点。'], mistakes: ['只顾抬腿，弓背折腰。', '骨盆向工作腿一侧翻开。', '快速起落失去控制；腿后侧或腰出现锐痛就停。'] },
  '臀桥夹球保持': { muscles: ['臀大肌', '内收肌', '盆底肌'], steps: ['仰卧屈膝，双脚与髋同宽踩地，两膝之间夹一个小球、瑜伽砖或叠起的抱枕，双臂放体侧。', '双膝先向内夹住物体，再脚跟踩地把髋顶起到肩、髋、膝成一条线。', '在顶端同时夹紧臀部和膝间物体，肋骨往下收。', '保持不动、均匀呼吸，坚持到计时结束。', '结束后慢慢把髋放回地面，再松开膝间物体。'], tips: ['下巴微收，用上背而不是脖子承重。', '太吃力先顶低一点，能稳住再顶到一条线。'], mistakes: ['腰向上拱。', '保持中膝间物体松掉或滑落。', '腰、膝或腹股沟出现锐痛就停。'] },
  '抱膝排气式（apanasana）': { muscles: ['盆底肌', '横膈'], steps: ['仰卧在垫子上，双腿屈膝踩地，头和肩膀放松。', '先抬起一条腿再抬另一条，屈膝把两个膝盖收到胸口上方。', '双手抱住小腿前侧或膝盖下方，轻轻把大腿拉向胸口，两膝可以并拢，也可以分开到与髋同宽。', '到位时下背平贴垫子、尾骨微微离地即可，臀部和下背有温和的拉开感，肩膀不耸。', '用鼻子慢慢吸气让腹部顶住大腿，呼气时手臂再把膝盖往胸口带一点，按计时保持。', '结束时松开双手，一次放下一只脚踩地，再把双腿伸直。'], tips: ['演示图里头肩略抬离地面，做的时候头放松贴地即可；颈部不舒服可以在头下垫折叠毛巾。', '抱不住小腿就改抱大腿后侧，或用毛巾绕过小腿拉住两端。', '保持时可以让膝盖小幅左右轻晃，让下背在垫子上滚动放松。'], mistakes: ['用力猛拉膝盖，把臀部整个拉离地面。', '憋气、耸肩。', '膝盖被挤压疼痛或下背出现锐痛就松开，改抱大腿后侧。'] },
  '猫式伸展（cat stretch）': { muscles: ['脊柱', '核心', '竖脊肌'], steps: ['四足跪在垫子上，手在肩膀正下方，膝盖在髋部正下方，背先摆平。', '吸气，尾骨向上翘、骨盆前倾，腹部向下沉，胸口向前送，最后抬头看斜前方（牛式）。', '呼气，尾骨向下卷、骨盆后倾，手推地把背从下往上一节节拱起，最后低头看向大腿（猫式）。', '到位的标准：拱背时两块肩胛骨之间撑开、下背有拉开感；塌腰时胸口打开、腹部前侧拉长，腰不挤痛。', '跟着呼吸一吸一呼慢慢交替，做到计时结束，每次都由骨盆先动、头最后到。', '结束时回到背部平直的四足位，再把臀部坐回脚跟休息。'], tips: ['膝盖下垫折叠的垫子或毛巾；手腕不舒服可以握拳撑地或用前臂撑地。', '幅度从小开始，越慢越能感到脊柱一节节在动。', '腰容易挤的人，塌腰那一半做小一点，重点放在拱背。'], mistakes: ['只动脖子和腰，胸椎和骨盆不动。', '速度太快变成甩动。', '腰部出现锐痛就缩小幅度，仍痛就停。'] },
  '仰卧分腿保持（straddle hold）': { muscles: ['内收肌', '腘绳肌'], steps: ['仰卧在垫子上，臀部贴地，双腿并拢伸直向上举，脚跟朝天花板，双手放在身体两侧。', '双腿保持伸直，慢慢向两侧打开成 V 字。', '打开到大腿内侧有明显拉伸感但不疼的位置，双手轻扶在大腿内侧靠近膝盖处，帮着稳住腿。', '腰背贴地，均匀呼吸，保持到计时结束；呼气时可以让腿再自然向外沉一点。', '结束时双手托住大腿外侧，慢慢把双腿合拢。', '屈膝收向胸前，再侧身起来。'], tips: ['腿后侧太紧时膝盖微屈，或把臀部靠墙，让双腿顺着墙面向两侧打开。', '想加强时，计时前半段让腿向内轻轻对抗双手(约五成力)，后半段放松再让腿向外打开一点。', '腰下不舒服可以垫一条折叠毛巾。'], mistakes: ['用手或甩腿往下硬压。', '对抗或保持时憋气。', '腹股沟或膝内侧出现锐痛、腿发麻就停。'] },
  '跪姿挺髋（kneeling hip thrust）': { muscles: ['臀大肌', '髋屈肌', '股四头肌'], steps: ['跪在垫子上，双膝与髋同宽，小腿和脚背贴地，上身立起，双手放在臀部或胸前。', '夹紧臀部，骨盆向前推到髋完全伸直。', '保持臀部夹紧，从头到膝作为一个整体微微向后倾，胸口打开。', '后倾到大腿前侧有明显拉伸感就停住，再用臀部和腹部把身体带回直立，再做下一次。'], tips: ['后倾幅度宁小勿大，每次稳住了再逐渐加深。', '膝盖跪着疼就在膝下多垫一层垫子或毛巾。', '下巴微收，头跟着躯干一起后倾，不要单独把头往后仰。'], mistakes: ['腰向后折，而髋没有伸直。', '速度太快，后倾时失去控制。', '头单独向后仰，脖子受力。', '腰或膝出现锐痛就停。'] },
  '俯卧蛙式抬腿（frog kick）': { muscles: ['臀大肌', '髋外旋肌'], steps: ['俯卧在垫子上，双手交叠垫在额头下。', '屈膝让两脚脚心相对，膝盖向两侧打开成蛙式。', '收紧腹部，骨盆前侧压实地面。', '臀部发力把双膝连同双脚一起抬离地面少许，顶端夹臀停一下，再慢慢放下。'], tips: ['抬起幅度很小是正常的，臀部收紧比高度重要。', '髋骨压地疼可以在髋下垫一条折叠毛巾。'], mistakes: ['借腰向上反弓把腿甩起来。', '骨盆离地。', '腰部出现锐痛就停。'] },
  '四足髋部大绕环': { muscles: ['骨盆控制', '核心', '臀'], steps: ['四足跪姿，脊柱中立', '骨盆做大幅度的全方向绕环：前倾-侧移-后倾-另一侧', '两个方向交替，节奏缓慢连贯'], tips: ['想象用尾骨在身后画一个大圆', '肩膀和手保持稳定，只有骨盆在动'], mistakes: ['耸肩晃动上半身', '幅度小而快，失去控制训练意义'] },
  '四足跪姿髋外展': { muscles: ['臀中肌', '臀大肌'], steps: ['四足跪在垫子上，双手在肩正下方，膝盖在髋正下方，背部平直。', '一条腿保持屈膝，膝和脚一起向正侧方抬起。', '抬到大腿与髋同高或臀侧发酸的高度，停一下，骨盆不向对侧倒。', '慢慢放回膝盖接近地面，做完一侧次数再换另一侧。'], tips: ['抬不到髋高就抬到骨盆还能保持水平的高度。', '可在膝盖上方套一根弹力带增加阻力。', '膝盖跪着疼就在膝下多垫一层垫子或毛巾。'], mistakes: ['骨盆向对侧翻转借力。', '支撑手臂弯曲、身体塌向一侧。', '髋部出现锐痛就停。'] },
  '驴踢腿（donkey kick）': { muscles: ['臀大肌'], steps: ['四足跪在垫子上，双手在肩正下方，膝盖在髋正下方，背部平直。', '一条腿保持屈膝，脚底朝向天花板。', '臀部发力把脚跟向天花板方向推，抬到大腿与躯干大致一线，顶端夹臀停一下。', '慢慢放回到膝盖接近地面，做完一侧次数再换另一侧。'], tips: ['想着用脚跟去踩天花板，而不是甩小腿。', '膝盖跪着疼就在膝下多垫一层垫子或毛巾。'], mistakes: ['塌腰把腿抬得更高。', '幅度过大，骨盆翻开。', '腰部出现锐痛就停。'] },
  '鸟狗式（bird dog）': { muscles: ['臀大肌', '竖脊肌', '核心'], steps: ['四足跪在垫子上，双手在肩正下方，膝盖在髋正下方，背部平直，眼睛看双手之间的地面。', '收紧腹部，同时把一只手向前、对侧腿向后伸直，伸到与躯干大致一线。', '在顶端停一两秒，骨盆和肩保持水平。', '慢慢把手和膝盖收回起始位置，这一组对角做完次数，再换另一组对角。'], tips: ['想着手和脚往两头伸远，而不是往上抬高。', '太难先只伸腿、不伸手。', '膝盖跪着疼就在膝下多垫一层垫子或毛巾。'], mistakes: ['腿抬过高，骨盆翻开。', '塌腰或弓背。', '腰部出现锐痛就停。'] },
  '相扑深蹲跳（sumo squat jump）': { muscles: ['臀', '股四头肌', '内收肌'], steps: ['双脚站得比肩宽，脚尖向外转，双手合在胸前。', '臀部向后下方坐，下蹲到大腿接近平行，膝盖朝脚尖方向打开。', '双脚蹬地向上跳起，空中伸直髋和膝。', '前脚掌先着地、膝盖顺势弯曲缓冲，回到下蹲位置后接下一次跳。', '做完次数后站起，走动调整呼吸。'], tips: ['先不跳，把相扑深蹲的下蹲位置练稳，再加跳跃。', '降阶：只踮起脚跟不离地，或跳低一点。', '穿运动鞋，在不打滑的地面上做。'], mistakes: ['落地时膝盖向内扣。', '落地直腿砸地，没有屈膝缓冲。', '膝、髋或脚踝出现锐痛就停。'] },
  '青蛙趴': { muscles: ['内收肌', '髋外旋肌'], steps: ['四足跪姿，双膝沿地面向两侧尽量打开', '小腿与大腿约成90°，脚踝放平', '前臂撑地，骨盆向后向下沉，让重力完成拉伸'], tips: ['锚定体位：每次保持到目标秒数，逐次+5秒加深', '疼痛和拉伸感的边界在"能深呼吸"——不能呼吸就退一点'], mistakes: ['腰塌陷代替骨盆下沉', '膝内侧受压疼痛还硬撑（垫毛巾）'] },
  '蛙式臀桥保持（frog pump hold）': { muscles: ['臀大肌', '内收肌', '盆底肌'], steps: ['仰卧，屈膝把两脚脚心相对贴在一起，脚跟靠近臀部，膝盖向两侧自然打开，双臂放体侧。', '收紧腹部，双脚外侧压地，臀部发力把髋顶起，顶到肩、髋、膝成一条线。', '在顶端夹紧臀部，膝盖保持向两侧打开，腰不往上拱。', '保持不动、均匀呼吸，坚持到计时结束。', '结束后慢慢把髋放回地面。'], tips: ['顶不到一条线就先顶低一点，能稳住再加高。', '髋部打不开时，脚跟离臀部远一点。'], mistakes: ['用腰往上顶。', '保持中憋气。', '髋或腹股沟出现锐痛就停。'] },
  '跪姿直腿后踢': { muscles: ['臀大肌', '髋屈肌'], steps: ['四足跪在垫子上，双手在肩正下方，膝盖在髋正下方，背部平直。', '一条腿向后伸直，脚尖轻点地面。', '臀部发力把伸直的腿向后上方抬起，抬到与躯干大致一线，顶端夹臀停一两秒。', '慢慢放回脚尖点地，做完一侧次数再换另一侧。'], tips: ['腿伸直比屈膝版更吃力，腹部要收紧。', '膝盖跪着疼就在膝下多垫一层垫子或毛巾。', '演示图是一侧膝盖和双手撑在长凳上做的，腿放下时屈膝落到凳边；在垫子上做时腿保持伸直，放回到脚尖点地即可。'], mistakes: ['腰向下塌、腿抬过高。', '骨盆向工作腿一侧歪斜。', '腰部出现锐痛就停。'] },
  '高跪姿夹枕挺髋保持': { muscles: ['臀大肌', '内收肌', '盆底肌'], steps: ['跪在垫子上，双膝与髋同宽，两侧大腿上部之间夹一个枕头或瑜伽砖，上身立起。', '大腿向内夹住物体，同时臀部向前推到髋完全伸直，从头到膝成一条直线。', '收紧腹部，肋骨往下收，腰不往前顶。', '保持不动、均匀呼吸，坚持到计时结束。', '结束后先放松臀部，再坐回脚跟取下物体。'], tips: ['膝盖跪着疼就在膝下多垫一层垫子或毛巾。', '枕头太软夹不住就换瑜伽砖。'], mistakes: ['塌腰把肚子往前顶。', '保持中夹持松掉，物体滑落。', '膝、腰或腹股沟出现锐痛就停。'] },
  '靠墙坐姿劈叉（wall straddle）': { muscles: ['内收肌', '髋外旋肌'], steps: ['在墙边铺好垫子，侧身坐下，一侧臀部和髋部贴住墙根。', '上身向后躺下，同时把双腿转上墙，臀部尽量贴墙，双腿并拢沿墙向上伸直，脚跟靠墙。', '膝盖伸直但不锁死，让双腿沿墙面慢慢向两侧滑开，滑到大腿内侧有明显但还能放松的拉伸感为止。', '下背和后脑贴地，双手放在身体两侧或腹部，腿不主动用力，只让重量往下带。', '按计时保持 2 分钟，慢慢深呼吸，每次呼气让大腿内侧再放松一点。', '结束时先屈膝，用双手托住大腿外侧把双腿合拢，再转向一侧侧躺片刻，用手撑起来。'], tips: ['腿后侧太紧、臀部贴不了墙，就离墙远一点，臀部和墙之间留一拳距离。', '拉伸太强就把双腿往中间收一点，或双手托住大腿外侧减少下沉。', '穿袜子或在脚跟下垫毛巾，腿更容易在墙面上滑动。'], mistakes: ['用手往下压腿，或主动用力把腿往两边打。', '腰部拱起离地，或臀部离墙太远。', '腿脚发麻、刺痛或大腿内侧出现锐痛，先把腿合拢屈膝，缓解后再继续。'] },
  '快乐婴儿式（深压版）': { muscles: ['内收肌', '髋外旋肌', '盆底肌'], steps: ['仰卧，在臀部下面垫一块折叠毛巾或平放的瑜伽砖，让骨盆略微垫高。', '屈膝把双腿收向胸口，两膝分开到比躯干略宽。', '小腿竖起与地面垂直，脚掌朝向天花板，双手从腿内侧抓住脚踝（够得到也可以抓脚掌外缘）。', '呼气时用手把膝盖往腋下方向、朝地面带，大腿内侧和腹股沟有拉伸感，骶骨压在垫高的毛巾或瑜伽砖上，下背不离地。', '吸气时保持不动，呼气再放松一点，按计时保持；压力以还能平稳深呼吸为限，盆底不用力。', '结束时松手，把双膝并拢收回胸前，双脚落地，抽出垫子再起身。'], tips: ['抓不到脚踝就抓小腿，或用毛巾、弹力带绕过脚掌拉住。', '髋部很紧时先不垫高，熟悉以后再加垫子。', '可以让身体在垫子上轻轻左右滚动，帮两侧髋部放松。'], mistakes: ['猛拉弹压，靠惯性往下压膝盖。', '头肩抬起、下背离垫。', '腹股沟或膝盖出现锐痛、腿发麻就松手退出。'] },
  '青蛙式（frog pose）': { muscles: ['内收肌', '胸椎', '肩'], steps: ['四足跪姿，手在肩下，膝盖下垫折叠的垫子或毛巾。', '双膝慢慢向两侧滑开，滑到大腿内侧有拉伸感为止；小腿向后放，能做到的话让两脚分开、脚踝在膝盖正后方。', '双手向前移，屈肘把前臂放到地上，上身降低，臀部保持在两膝连线的正上方。', '先小幅把骨盆前后摇几次，找到大腿内侧拉伸最明显的位置。', '在这个位置停住，腹股沟向地面放松，背部保持平直，按计时保持并慢慢呼吸。', '结束时双手推回四足位，再一点点把膝盖收拢，臀部坐回脚跟休息。'], tips: ['膝盖下一定要垫软，两膝分得越宽，膝盖压力越大。', '拉伸太强就把膝盖收近一点，或让臀部稍往后移。', '可以把胸口或额头放在瑜伽砖上，减少肩膀负担。'], mistakes: ['臀部坐回脚跟变成婴儿式，大腿内侧没有拉到。', '塌腰、耸肩挤压颈部。', '膝盖内侧或腹股沟出现锐痛，立即收拢膝盖退出。'] },
  '臀推顶端外展保持': { muscles: ['臀大肌', '内收肌'], steps: ['坐在地上，背靠长凳或沙发边，肩胛骨下沿抵住凳边；可在膝盖上方套一根弹力带。', '屈膝，双脚比髋略宽踩地，脚尖略向外。', '脚跟踩地把髋顶起到肩、髋、膝成一条线，夹紧臀部。', '保持髋的高度，双膝向外撑开(套带时撑住弹力带)，膝盖朝脚尖方向。', '保持不动、均匀呼吸，坚持到计时结束，再慢慢把髋放回地面。'], tips: ['凳子要靠墙或固定住，防止滑走。', '没有弹力带也可以做，靠臀部主动把膝向外撑。', '髋往下掉就先撑小一点。'], mistakes: ['髋往下掉还在硬撑。', '顶端仰头挺腰。', '腰或髋出现锐痛就停。'] },
  // —— core ——
  '死虫式保持（dead bug hold）': { muscles: ['腹横肌', '骨盆控制'], steps: ['仰卧在垫子上，屈髋屈膝，大腿垂直地面、小腿与地面平行（桌面腿），双臂伸直指向天花板。', '呼气，肋骨往下收，把下背轻轻压向地面，腰和地面之间不留缝。', '保持这个姿势不动，手脚都不晃，按计时保持，均匀呼吸。', '计时结束先把双脚放回地面，再放下手臂休息。'], tips: ['吸气时也要让腰贴着地面，这是这个动作最难的部分。', '腰总是离地，可以把双脚放得离臀部近一点，或改成双脚踩地只抬手臂。', '进阶：保持时把手臂往头顶方向稍微放低一点，腰仍要贴地。'], mistakes: ['腰拱起离开地面还继续计时。', '耸肩、脖子用力或憋气。', '下背出现疼痛就停。'] },
  '死虫式（慢速对角）': { muscles: ['腹横肌', '骨盆控制'], steps: ['仰卧在垫子上，屈髋屈膝成桌面腿，双臂伸直指向天花板，呼气把下背压向地面。', '慢慢把一侧手臂向头顶方向放低，同时对侧腿向前伸直下放，手脚都停在离地面一点点的高度，不触地。', '停一下，再慢慢把手臂和腿收回起始位置。', '换另一侧手臂和对侧腿做同样的动作，左右交替，每伸出一次算一次。'], tips: ['演示图只画了腿：手臂一直指天不动，而且只演示了一侧。完整做法是伸腿的同时把对侧手臂往头顶方向放低，左右交替。', '越慢越好，伸出和收回各用几秒钟。', '只伸到腰还贴得住地面的幅度，伸不远就伸短一点。', '降阶：照演示图只动腿不动手，或者腿屈膝用脚跟轻点地面。'], mistakes: ['幅度太大，腰离开地面。', '动作太快，靠甩手甩腿完成。', '下背出现疼痛就停。'] },
  '仰卧直腿下放（leg lowering）': { muscles: ['下腹部', '髋屈肌', '内收肌'], steps: ['仰卧在垫子上，双手放在身体两侧掌心向下，双腿伸直并拢抬到垂直地面。', '呼气把下背压向地面，然后慢慢把双腿往下放，下放时双腿可以稍微分开一点。', '感觉腰马上要离开地面时停住，这就是你的最低点。', '收紧腹部，把双腿抬回垂直位置并重新并拢，算一次。'], tips: ['演示动图里双腿一直放到地面、全程并拢，那是完整幅度；你只放到腰还贴得住地面的高度就抬回。', '双手垫在臀部下方（骶骨下面）可以降低难度。', '最低点因人而异，宁可放得高一点也不要让腰拱起。', '降阶：屈膝做，或者一次只放一条腿。'], mistakes: ['双腿放得太低，腰拱起离地。', '下放时直接掉下去，没有控制。', '下背出现疼痛就停。'] },
  '俯冲式俯卧撑（dive bomber push-up）': { muscles: ['核心', '胸椎', '肩'], steps: ['从俯卧撑位开始，双手略宽于肩撑地，然后把臀部向上推高成倒V形，双脚略宽于髋。', '屈肘，让头和胸口贴近地面，沿着双手之间的低位向前滑出。', '继续向前，伸直手臂把胸抬起，髋部放低但不贴地，眼睛看前方。', '屈肘把胸口放低，沿原路往后退，臀部重新推高回到倒V形，算一次。'], tips: ['想象从一道很矮的栏杆下钻过去再钻回来。', '回程比前进难，不要省掉，做不了就先只做前进那一半，再走回倒V。', '手腕不舒服可以握俯卧撑架做。'], mistakes: ['前进时腰塌下去靠腰发力。', '肩肘不稳，胸口直接砸到地上。', '肩部或手腕出现锐痛就停。'] },
  '仰卧对角抬举（dead bug 变体）': { muscles: ['核心', '全身张力'], steps: ['仰卧四肢展开成大字', '呼气时对角手脚同时抬离地面2-3厘米并绷紧全身', '保持数秒放下，换对角'], tips: ['幅度极小但全身张力极大才是做对了', '头颈放松留在地面'], mistakes: ['抬太高变成仰卧起坐', '只动四肢核心不参与'] },
  '匍匐爬行（army crawl）': { muscles: ['核心', '肩带', '髋屈肌'], steps: ['前臂撑地、脚尖着地，做成前臂平板支撑，身体从头到脚跟一条线。', '一侧前臂向前挪一小步，另一侧跟上，交替前进，用前臂拖着身体向前移动，双脚跟着在地上滑或小步挪。', '臀部保持低位，躯干不左右甩，正常呼吸。', '场地不够长就到头后掉头或往回爬，做到计时结束。'], tips: ['在光滑的地板上穿袜子，或脚下垫毛巾，脚更容易滑动。', '前臂不舒服时在瑜伽垫上做，或穿长袖。', '降阶：膝盖着地做。'], mistakes: ['臀部翘高省力。', '躯干大幅扭动，腰塌下去。', '肩部或下背出现锐痛就停。'] },
  '高跪姿后倾等长（kneeling lean back）': { muscles: ['核心', '臀', '竖脊肌'], steps: ['跪在垫子上，膝盖与髋同宽，大腿和躯干立直，脚背贴地，双臂交叉在胸前或垂在身体两侧。', '收紧臀部和腹部，让膝盖、髋部、肩膀和头保持一条直线。', '以膝盖为轴整个身体向后小幅倾斜，大腿前侧有明显用力感就停住。', '停在这个角度按计时保持，均匀呼吸，腰不往后折。', '计时结束时用大腿和腹部把身体拉回立直，再坐下休息。'], tips: ['膝盖下垫厚垫子或折叠毛巾。', '先只倾斜一点点，感觉能稳稳拉回来再加大角度。', '保持不住就中途回到立直位休息一下再继续。'], mistakes: ['髋部弯曲，变成坐向后方。', '腰往后折，只有上身在后仰。', '膝盖出现锐痛就停。'] },
  '骆驼式（ustrasana）': { muscles: ['核心', '股四头肌', '胸椎'], steps: ['跪在垫子上，膝盖与髋同宽，脚背贴地（或脚尖踩地，会更容易），躯干立直。', '双手放在后腰或臀部上方，手指朝下，收紧臀部，把髋部往前推。', '吸气，胸口向上抬，上背向后打开，肩胛骨往中间收。', '髋部保持在膝盖正上方，胸口往上往后，前侧大腿和腹部有拉伸感；下巴微收，颈部顺着脊柱，不往后甩头。', '停在这里按计时保持，平稳呼吸；能力够可以把双手依次放到脚跟上。', '结束时双手回到后腰，收紧腹部，先抬头再把身体带回立直，最后坐到脚跟上休息。'], tips: ['膝盖下垫厚垫子或折叠毛巾。', '手够不到脚跟就一直扶后腰，或把脚尖踩地让脚跟抬高。', '保持不住就中途回到立直位休息几次呼吸，再进入，直到计时结束。', '演示图是进阶版：双手扶脚跟，头也向后仰了。基础版双手扶后腰，下巴微收，颈部顺着脊柱不往后仰；颈椎不适的人一直按基础版做。'], mistakes: ['髋部向后坐，只靠腰往后折。', '猛地后甩头，颈部受压。', '腰部出现锐痛、头晕或手脚发麻就慢慢退出。'] },
  '单腿passé平衡': { muscles: ['踝稳定肌', '核心', '臀中肌'], steps: ['站直，双脚并拢，眼睛看前方固定的一点，收紧腹部。', '重心移到一条腿上，支撑腿膝盖伸直但不锁死，另一条腿屈膝外开，脚尖沿着支撑腿内侧往上滑到膝盖旁边。', '双手叉腰或背在身后，站稳后可以把双臂打开成圆弧，骨盆两侧保持水平，支撑侧臀部收紧。', '按计时保持，均匀呼吸；晃了就用支撑脚的脚掌和脚趾轻轻抓地调整，实在站不住就点一下地再回到姿势。', '这一侧计时结束后，脚尖沿支撑腿滑回地面，换另一条腿支撑，同样保持到计时结束。'], tips: ['站不稳时一只手轻扶墙或椅背。', '进阶：支撑脚踮起脚跟，或闭上眼睛。', '光脚或穿薄底鞋更容易站稳。'], mistakes: ['髋部往支撑腿一侧顶出去。', '耸肩、全身僵住、憋气。', '脚踝或膝盖出现疼痛就停。'] },
  '旋转中轴训练（pirouette prep）': { muscles: ['核心', '踝稳定肌'], steps: ['站立，一脚passé位或点地', '双臂收拢至胸前，身体沿垂直中轴缓慢旋转半圈（先不离地）', '控制停止，换方向'], tips: ['练的是"转中不散"的中轴张力，速度其次', '头部最后离开、最先到达（留头甩头）'], mistakes: ['手臂甩动带转', '中轴倾斜'] },
  '仰卧画圈腿（rond de jambe）': { muscles: ['下腹部', '髋屈肌', '内收肌'], steps: ['仰卧，双腿伸直，一腿保持贴地', '另一腿绷直抬起，在空中缓慢画出大弧线（rond de jambe）', '双方向交替后换腿'], tips: ['骨盆钉在地面不许晃，弧线才有价值', '脚背全程延伸'], mistakes: ['骨盆跟着腿滚动', '膝盖弯曲'] },
  '肩胛引体激活': { muscles: ['背阔肌', '下斜方肌', '肩胛稳定肌'], steps: ['正手握单杠，握距略宽于肩，身体悬垂，手臂伸直。', '手肘不弯，把肩胛骨向下、向后收，肩膀离开耳朵，身体被抬高一小段。', '在顶端停一下，感觉背部用力。', '慢慢放松肩胛，回到完全悬垂，算一次。'], tips: ['幅度很小，做准比做大重要。', '想象把肩胛骨放进后裤兜。', '够不着单杠或握不住时，可以脚踩箱子分担一部分体重。'], mistakes: ['屈肘变成半个引体向上。', '耸肩悬挂，肩膀贴着耳朵。', '肩部出现锐痛就停。'] },
  '悬挂屈体静止': { muscles: ['核心', '髋屈肌', '握力'], steps: ['正手握单杠，身体悬垂，肩膀稍微下沉，不完全松垮。', '收紧腹部，屈膝把双腿抬起，大腿至少抬到与地面平行，能力够就把膝盖收向胸口。', '骨盆微微向后卷，让下腹用力，脚尖绷直，身体不前后晃。', '停在这个姿势按计时保持，均匀呼吸，结束时慢慢放下腿再松手。'], tips: ['握力不够可以用助力带。', '进阶：双腿伸直抬到水平保持。', '身体晃起来先停一下，稳住再开始计时。'], mistakes: ['身体前后摆动。', '憋气，或耸肩挂在杠上。', '肩部出现锐痛或手抓不住就停。'] },
  '悬挂直体延伸': { muscles: ['肩带', '背阔肌', '核心'], steps: ['正手握单杠，握距与肩同宽，身体悬垂，双腿并拢伸直。', '肩膀稍微下沉，让肩膀离开耳朵，手臂仍然伸直。', '收紧腹部，肋骨往里收，骨盆向后卷一点，脚尖绷直向下延伸，身体不弓腰。', '保持全身绷紧不晃，按计时保持，均匀呼吸，结束时双脚落地再松手。'], tips: ['握力不够可以用助力带。', '身体像一根绷直的绳子，从手到脚尖都在用力。'], mistakes: ['完全放松地挂着，肩膀贴到耳朵。', '腰往前反弓，腿往后翘。', '肩部出现锐痛就停。'] },
  '悬挂开胯': { muscles: ['内收肌', '髋外展肌', '握力'], steps: ['悬挂于单杠', '双腿伸直缓慢向两侧打开至最大V字', '停1-2秒后靠内收肌控制合拢'], tips: ['悬挂消除了地面摩擦，开合全靠肌肉', '幅度以骨盆不歪为限'], mistakes: ['借摆动甩腿', '合拢时松弛落腿'] },
  '空心体保持': { muscles: ['腹直肌', '腹横肌'], steps: ['仰卧在垫子上，收紧腹部，把下背压向地面。', '双臂伸直贴着耳朵举过头顶，头和肩胛骨抬离地面。', '双腿伸直并拢抬离地面，放到腰还贴得住地面的最低高度，身体成一条浅弧。', '保持不动，按计时保持，均匀呼吸，结束时先放下腿和手臂再放松。'], tips: ['腰贴住地面是唯一标准，腿放不低就抬高一些。', '降阶：屈膝做，或双手放在身体两侧。', '下背和地面之间不应该能塞进手。'], mistakes: ['腰拱起离地还继续计时。', '下巴顶向天花板，脖子紧张。', '下背出现疼痛就停。'] },
  '龙旗': { muscles: ['腹直肌', '核心', '背阔肌'], steps: ['仰卧在平板凳上，双手从头部两侧抓住头后方的凳沿或固定的柱子。', '收紧腹部和臀部，把双腿和臀部向上举起，身体接近垂直，只有肩部和上背接触凳面。', '身体保持一条直线，从肩到脚尖不弯，慢慢向下放，直到接近水平。', '在不折腰的前提下把身体拉回接近垂直，算一次。'], tips: ['降阶：屈膝做，或者只做慢慢下放那一段，放到底后屈膝收回。', '凳子要稳固，抓的地方要结实，不会被拉动。', '放到腰开始弯时就停在那里，不追求更低。'], mistakes: ['髋部弯曲，身体折成两段。', '下放失控，身体砸到凳子上。', '用后脑和脖子顶凳面借力；下背或肩颈出现疼痛就停。'] },
  'L撑': { muscles: ['腹直肌', '髋屈肌', '三头肌'], steps: ['坐在地上，双腿伸直并拢，双手放在髋部两侧撑地，手指朝前。', '手臂伸直，肩膀往下压，把臀部撑离地面。', '收紧腹部，双腿伸直抬起，与地面平行，脚尖绷直。', '保持这个姿势不动，按计时保持，均匀呼吸，结束时先放下腿再坐下。'], tips: ['降阶：屈膝团身撑，双脚离地即可，熟练后再逐步伸直腿。', '手腕不舒服时用俯卧撑架或双杠做。', '腿抬不到水平时可以先一条腿伸直、一条腿屈膝。'], mistakes: ['耸肩含胸，肩膀贴到耳朵。', '腿垂下去还继续计时。', '手腕或肩部出现锐痛就停。'] },
  // —— swimming ——
  '水中侧抬腿': { muscles: ['臀中肌'], steps: ['站在齐腰到齐胸深的水中，侧身对着池壁，靠近池壁那只手扶住池边。', '身体站直，支撑腿微屈，腹部收紧。', '外侧那条腿伸直、脚尖朝前，缓慢向正侧方抬起，抬到骨盆不歪的最高处。', '停一下，再用同样慢的速度把腿收回，抬和收都主动用力，连续做到这一侧计时结束。', '转身换另一只手扶池边，另一条腿做同样时间。'], tips: ['水的阻力两个方向都有，越慢越费力。', '不扶池边、双手叉腰做，平衡要求更高。', '想加阻力可以在脚踝套泳池专用的阻力脚套。'], mistakes: ['借水流把腿甩上去。', '躯干向对侧歪，用侧腰代替臀部发力。', '髋部外侧出现锐痛时停止。'] },
  '水中后踢腿': { muscles: ['臀大肌', '腘绳肌'], steps: ['面向池壁站在齐腰到齐胸深的水中，双手扶住池边，身体略前倾。', '腹部收紧，支撑腿微屈。', '另一条腿伸直，缓慢向正后方抬起，抬到腰不往下塌的最高处，臀部收紧停一下。', '控制速度把腿收回到支撑腿旁，连续做到这一侧计时结束。', '换另一条腿做同样时间。'], tips: ['越慢越能感觉到水的阻力。', '骨盆两侧保持水平、正对池壁，不要随抬腿往外翻。', '可以在脚踝套泳池专用的阻力脚套增加阻力。'], mistakes: ['为了抬高而塌腰、腰部反弓。', '快速踢腿借水的浮力。', '腰部出现疼痛时减小抬腿高度，仍疼就停止。'] },
  '水中相扑深蹲': { muscles: ['臀', '股四头肌', '内收肌'], steps: ['站在齐腰到齐胸深的水中，双脚比肩宽很多，脚尖向外转。', '双臂在水中向前伸或扶住池边，帮助站稳。', '屈髋屈膝慢慢下蹲，膝盖朝脚尖方向打开，蹲到大腿接近平行。', '脚跟踩实池底向上站起，站起时可以稍快，对抗水的阻力，然后重复。'], tips: ['下慢上快，水越深站起时阻力越明显。', '脚底打滑可以穿泳池防滑鞋。', '想更难就双手不扶池边，在胸前合掌。'], mistakes: ['被浮力带着脚跟离地。', '膝盖往里扣。', '膝关节出现锐痛时停止，下次减小下蹲深度。'] },
  '水中摆腿开髋': { muscles: ['髋关节', '内收肌'], steps: ['侧身对着池壁站在齐腰到齐胸深的水中，靠池壁的手扶住池边。', '身体站直，支撑腿微屈，腹部收紧。', '外侧腿放松，先向前摆起，再向后摆过身体，前后连续摆动。', '幅度从小到大逐渐增加，摆到髋部前后都有舒展感为止，躯干不跟着前后晃。', '保持自然呼吸，摆到这一侧计时结束。', '转身换另一只手扶池边，另一条腿摆同样时间，结束后双脚站稳。'], tips: ['水的阻力会让摆动变慢，幅度可以比陆上大一点，但不要猛甩。', '想多活动一个方向，可以在计时后段改成向两侧摆。', '支撑脚怕滑可以穿泳池防滑鞋。'], mistakes: ['躯干跟着腿前后晃，或塌腰。', '一开始就用最大幅度猛甩。', '髋部或腹股沟出现锐痛时立刻停下。'] },
  '泳池边坐姿开胯': { muscles: ['内收肌', '髋外旋肌'], steps: ['坐在池边，臀部坐稳在池沿上，小腿自然垂入水中。', '双手撑在身后池沿，挺直腰背。', '大腿向两侧慢慢打开，到大腿内侧有明显拉伸感但不痛为止，膝盖朝上或略朝外。', '保持背部挺直，从髋部向前倾，双手移到身前的池沿或撑在大腿上。', '停在大腿内侧有拉伸感的位置，平稳呼吸，每次呼气可以前倾一点点，保持到计时结束。', '结束时先用手撑着把上身抬回直立，再慢慢把双腿收拢。'], tips: ['池沿太硬可以垫一条折好的毛巾坐。', '前倾不下去就只做打开腿、上身挺直这一步，停在大腿内侧有拉伸感的位置保持。', '池沿湿滑时双手一直撑稳，别让身体往池里滑。'], mistakes: ['为了前倾得更多而弓背。', '一下一下往下压（弹震式），应该停在原位保持。', '腹股沟出现锐痛或腿发麻时立刻收腿。'] },
  '水中骨盆画圆': { muscles: ['骨盆控制', '核心'], steps: ['齐腰水中双脚与肩同宽站稳', '双手叉腰，骨盆缓慢画大圆', '两个方向交替'], tips: ['水阻让骨盆环转的每一度都有反馈', '膝盖微屈上身稳定'], mistakes: ['全身跟着晃', '幅度小而敷衍'] },
  '水中弓步跳': { muscles: ['臀', '股四头肌'], steps: ['站在齐腰到齐胸深的水中，一脚在前一脚在后成弓步，双膝微屈。', '双臂在水中前后摆动配合，向上跳起。', '在空中交换前后腿，落地成另一侧弓步，前膝对着脚尖、屈膝缓冲。', '落稳后马上接下一次，左右交替连续做。'], tips: ['水越深浮力越大、对膝盖冲击越小，也越难跳高。', '跳不动时改成不跳的交替弓步走。', '脚底打滑可以穿泳池防滑鞋。'], mistakes: ['落地时前膝往里扣。', '越跳越浅，弓步做不到位。', '膝盖或脚踝出现疼痛时停止。'] },
  '水中单腿平衡': { muscles: ['踝稳定肌', '核心'], steps: ['站在齐腰到齐胸深的水中，离池壁一步远，方便随时扶。', '重心移到一条腿上，支撑腿微屈，脚趾抓住池底。', '另一条腿屈膝抬起到大腿接近水平，双臂在水中向两侧张开帮助平衡。', '保持身体直立、正常呼吸，站稳到这一侧计时结束。', '放下脚换另一条腿做同样时间。'], tips: ['站得很稳后，把抬起的腿向前伸直或向侧举，难度更高。', '再进阶可以闭眼，但要离池壁近一点。', '一开始站不稳，可以一只手指尖轻碰池壁。'], mistakes: ['憋气、全身僵硬。', '抬起的腿一直靠在池壁或支撑腿上借力。', '脚踝出现疼痛时停止。'] },
  '水中弹力带外展': { muscles: ['臀中肌'], steps: ['把弹力带套在两只脚踝上，站在齐腰到齐胸深的水中，侧身对着池壁，靠池壁的手扶住池边。', '身体站直，支撑腿微屈，腹部收紧。', '外侧腿伸直、脚尖朝前，对抗弹力带和水的阻力向正侧方打开。', '打开到带子绷紧、骨盆仍不歪的位置停一下，再慢慢收回，不让带子把腿拽回去。', '连续做到这一侧计时结束，转身换另一侧做同样时间。'], tips: ['双重阻力下幅度不必大，打开到骨盆不歪的范围就够。', '带子太紧做不动就换轻一档的带子，或把带子套在膝盖上方。', '用完把弹力带用清水冲干净晾干，池水里的氯会让带子老化变脆。'], mistakes: ['身体向对侧倾斜借力。', '收回时放任带子把腿拽回。', '髋外侧出现锐痛，或带子勒得脚踝发麻时立刻停下。'] },
  '蛙泳腿开合训练': { muscles: ['内收肌', '臀', '腘绳肌'], steps: ['双手扶住池边或浮板，身体俯卧伸直浮在水面。', '慢慢收腿，脚跟向臀部靠近，膝盖略分开。', '翻脚勾起，用脚掌内侧向后、向外画半圆蹬出。', '两腿伸直后用大腿内侧发力快速夹拢，并拢后停一下，身体伸直滑行，再做下一次。'], tips: ['夹腿并拢是这个练习的重点，每次都做完整。', '收腿慢、蹬夹快。', '憋得住气就把脸放进水里做，身体更容易保持水平。'], mistakes: ['收腿过大，大腿收到肚子下面，阻力很大。', '省略并拢，蹬出后腿还分着就收下一次。', '膝盖内侧出现疼痛时停止，下次减小蹬腿宽度。'] },
  // —— warmup ——
  '颈部绕环': { muscles: ['颈部肌群'], steps: ['站立或坐直，双肩放松下沉，双手自然放在体侧或大腿上。', '头慢慢向一侧倾，耳朵靠向肩膀，感到颈侧轻微拉伸。', '下巴向胸口方向往下画，经过胸前，头部画出半个圆。', '继续画到另一侧，耳朵靠向另一侧肩膀。', '再沿原路慢慢画回来，左右来回做半圆，配合缓慢呼吸，做到计时结束。', '结束时头回到正中，轻轻转头左右看一看。'], tips: ['热身只做前半圆，不做完整一圈，不往后仰。', '幅度做到有轻微拉伸感就够，不用硬压。', '肩膀容易跟着抬时，双手可以向下轻拉椅子边。'], mistakes: ['快速甩头。', '头向后仰挤压颈椎。', '出现头晕、手臂发麻或刺痛时立刻停止。'] },
  '手臂前后大摆动': { muscles: ['肩关节', '胸背'], steps: ['双脚与髋同宽站立，膝盖微屈，双臂自然垂在体侧。', '双臂放松伸直，同步向前上方摆起，先摆到胸前高度。', '顺势让双臂向下、向后摆到身后，胸前会有打开的感觉。', '前后连续摆动，每几下把幅度加大一点，最终向前摆到头顶附近。', '保持呼吸顺畅，躯干稳定，摆到计时结束。', '最后几下逐渐减小幅度，让双臂自然停在体侧。'], tips: ['摆动靠惯性，不要用力甩。', '也可以一只手向前一只手向后交替摆，像走路摆臂放大版。', '肩膀紧时先在胸前高度来回摆，暖了再往上。'], mistakes: ['一上来就摆到最大幅度。', '耸肩，或身体跟着前后晃。', '肩部出现锐痛或弹响伴疼痛时停下。'] },
  '猫牛热身': { muscles: ['脊柱', '核心'], steps: ['四足跪姿：双手在肩膀正下方，膝盖在髋部正下方，背部放平。', '吸气，腹部向下沉，尾骨和胸口向上抬，目光看向前上方（牛式）。', '呼气，手推地，背部从尾骨到颈部一节一节向上拱起，下巴收向胸口（猫式）。', '两个姿势跟着呼吸连续交替，热身版节奏可以比拉伸版稍快。', '每一下都让脊柱从腰到上背依次参与，做到计时结束。', '结束时回到背部放平，再慢慢坐回脚跟上或站起。'], tips: ['膝盖硌就在下面垫折好的垫子或毛巾。', '手腕不舒服可以握拳撑地，或用前臂撑地做。', '塌腰时不要压到腰痛，幅度做到舒适即可。'], mistakes: ['只动脖子和腰，上背不动。', '憋气，或节奏快到跟不上呼吸。', '腰部出现锐痛时减小塌腰幅度或停下。'] },
  '肘关节绕环': { muscles: ['肘关节', '前臂'], steps: ['站直，上臂贴住体侧，屈肘让小臂向前平伸，手握空拳。', '上臂固定不动，小臂以肘为轴向内画圈，幅度由小到大。', '画圈时手腕放松，肘关节在可活动范围内尽量做满。', '做到计时一半，改为向外画圈。', '保持自然呼吸，速度均匀，做到计时结束。', '结束后双臂伸直放下，轻轻甩一甩手。'], tips: ['想同时活动肩膀，也可以双臂侧平举再做，但更容易累。', '做推类训练（卧推、俯卧撑）前可以先做这个。', '两只手可以同时做，也可以一只一只做。'], mistakes: ['大臂跟着晃，变成了肩绕环。', '速度太快、甩手。', '肘部出现锐痛或手指发麻时停止。'] },
  '俯身直臂画圆': { muscles: ['肩关节', '上背'], steps: ['站在椅子或长凳旁，一只手扶住椅背，双脚前后分开站稳。', '从髋部向前俯身，背部平直，另一只手臂完全放松、自然垂向地面。', '身体轻轻前后、左右晃动，带着垂下的手臂在身体下方画圆，手臂本身不用力。', '圆圈由小到大，计时一半顺时针、一半逆时针。', '保持自然呼吸，肩膀放松，做到这一侧计时结束。', '慢慢直起身，换另一只手扶椅背，另一侧手臂做同样时间。'], tips: ['手里可以拿一个很轻的水瓶，让手臂更容易垂直放松。', '腰不舒服时俯身角度可以小一点，前脚稍微屈膝。', '肩膀紧张、画不动时先只做前后小幅度摆动。'], mistakes: ['弓背或耸肩。', '用肩膀主动甩手臂，而不是让它放松晃动。', '肩部出现锐痛或手臂发麻时停止。'] },
  '臀部激活蚌式': { muscles: ['臀中肌'], steps: ['侧卧在垫子上，下侧手臂垫在头下，屈髋屈膝，双脚和双膝叠在一起。', '上侧手扶在骨盆上，确认骨盆垂直地面、不向后倒。', '双脚保持接触，上侧膝盖向天花板方向打开，打开到骨盆开始后倒之前。', '在最高点停一下，再慢慢合上，连续做到这一侧计时结束。', '翻身到另一侧，同样做到计时结束。'], tips: ['进阶：在膝盖上方套一根弹力带。', '背靠墙侧卧做，可以防止骨盆往后倒。', '下侧髋骨硌得疼时多垫一层垫子。'], mistakes: ['为了打开得更大，骨盆向后翻。', '开合太快，靠惯性。', '髋部出现锐痛时停下。'] },
  '髋关节绕环': { muscles: ['髋关节'], steps: ['站直，双手叉腰（不稳就一只手扶墙）。', '重心移到一条腿上，支撑腿微屈。', '另一侧膝盖向前提起到接近髋部高度。', '膝盖带着大腿向外侧打开，再向后、向下画回来，画出一个大圈。', '计时一半由前向外画，另一半反方向由外向前画，躯干保持不动。', '放下这条腿，换另一条腿做同样时间。'], tips: ['圈由小到大，先在舒服的范围内做。', '支撑那一侧骨盆保持水平，不往上耸。', '平衡不好就扶墙做，注意力放在髋上。'], mistakes: ['耸胯或身体跟着歪。', '画得太快，变成甩腿。', '髋部或腹股沟出现锐痛时停下。'] },
  '侧向弓步': { muscles: ['内收肌', '臀', '股四头肌'], steps: ['双脚并拢站立，双手在胸前合拢或向前平举。', '向一侧迈出一大步，脚尖朝前或略向外。', '重心移到迈出的这条腿上，臀部向后坐，屈膝下沉；另一条腿伸直，脚掌踩实。', '下到伸直那条腿的大腿内侧有拉伸感，背部平直，膝盖朝脚尖方向。', '屈腿那只脚蹬地推回站立，这一侧计时内都向同一边迈步。', '换另一侧做同样时间。'], tips: ['下不去时步子迈小一点，或只下到半程。', '双手可以扶在屈腿那侧的大腿上帮助平衡。', '热身用中速，不追求最深。'], mistakes: ['屈腿那侧膝盖向内扣。', '弯腰驼背，或屈腿侧脚跟离地。', '大腿内侧出现锐痛时停下。'] },
  '踝关节绕环': { muscles: ['踝关节'], steps: ['站直，双手叉腰（不稳就一只手扶墙）。', '重心放在一条腿上，另一只脚稍微向前，脚尖轻点地面、脚跟抬起。', '以脚踝为轴，脚跟带着画圈，尽量把踝关节各个方向都做到。', '计时一半顺时针，另一半逆时针，速度缓慢均匀。', '保持自然呼吸，做到这一侧计时结束。', '换另一只脚做同样时间。'], tips: ['也可以坐在椅子上，把一只脚抬离地面画圈。', '画大圈、放慢速度，比快速画小圈更有用。', '跳跃和深蹲前做。'], mistakes: ['敷衍地画小圈。', '只做一个方向。', '脚踝出现锐痛或打软时停下。'] },
  '原地跑热身': { muscles: ['全身', '心肺'], steps: ['站直，双脚与髋同宽，手臂屈肘。', '原地小步慢跑，前脚掌轻轻落地。', '手臂屈肘前后自然摆动，与腿的节奏配合。', '逐渐加快步频、稍微抬高膝盖，跑到计时结束。'], tips: ['目的是让身体热起来，不是跑累。', '楼下有邻居时改成快速原地踏步。', '穿鞋做，减少对脚踝和膝盖的冲击。'], mistakes: ['全脚掌砸地，声音很响。', '一开始就冲刺。', '胸闷、头晕时停下。'] },
  '波比跳热身': { muscles: ['全身', '心肺'], steps: ['双脚与肩同宽站立。', '下蹲，双手撑在双脚前方的地面上。', '双脚向后跳成高位平板，身体成一条直线，腹部收紧。', '双脚跳回到双手后方，回到蹲姿。', '站起并轻轻向上跳，双臂上举，落地屈膝缓冲后接下一次，做到计时结束。'], tips: ['演示图里在平板位多做了一个俯卧撑，热身版可以省略。', '降阶：双脚一步一步后退、再一步一步收回，不跳。', '热身版不求快，每个阶段都做到位。'], mistakes: ['跳成平板时塌腰。', '落地时膝盖伸直、重重砸地。', '手腕或腰部出现疼痛时改成降阶版或停下。'] },
  // —— stretch ——
  '坐角式（upavistha konasana）': { muscles: ['内收肌', '腘绳肌'], steps: ['坐在垫子上，双腿向两侧尽量分开伸直，膝盖和脚尖朝向天花板。', '双手放在大腿上或身后地面，坐骨坐稳，先把脊柱向上拉长。', '保持背部平直，从髋部向前倾，双手放到身前地面，一点点向前移。', '前倾到大腿内侧和后侧有明显拉伸感、背还能保持平直的深度就停，不必贴地。', '按计时保持，呼吸平稳；每次呼气时可以让双手再往前挪一点。', '结束时双手往回走，用手撑地把上身推回直立，再慢慢把双腿并拢。'], tips: ['骨盆往后倒、背拱起时，坐在折叠毛巾或垫子边缘上，骨盆更容易前倾。', '腿后侧太紧可以微屈膝。', '演示图是柔韧很好时的最深版本（胸口贴地、手抓脚）；做不到就停在背还能平直的深度，可以把胸口或额头放在瑜伽砖上保持。'], mistakes: ['弓背低头去够地面。', '膝盖和脚尖向内倒，腿没有朝上伸直。', '膝盖后侧或大腿内侧出现锐痛、腿发麻就退回。'] },
  '幼犬式（puppy pose）': { muscles: ['胸椎', '肩', '背阔肌'], steps: ['四足跪姿，臀部保持在膝盖正上方', '双手向前滑远，胸口与下巴沉向地面', '腋窝向地面方向"融化"，深长呼吸保持'], tips: ['比婴儿式更针对胸椎伸展与肩开度', '手臂始终伸直有张力'], mistakes: ['臀后坐丢掉胸椎角度', '腰部塌陷代偿'] },
  '宽膝婴儿式（balasana）': { muscles: ['内收肌', '髋'], steps: ['四足跪姿，双膝拉宽至舒适极限', '保持手位不动，臀部缓慢向后坐向脚跟', '在内侧拉伸最强处停留，或缓慢往返'], tips: ['青蛙趴的温和前置动作，适合当天状态一般时', '往返版可作为动态热身'], mistakes: ['猛坐到底', '腰部拱起'] },
  '睡鸽式（sleeping pigeon）': { muscles: ['髋外旋肌', '梨状肌', '臀'], steps: ['从四足跪姿开始，把一侧膝盖向前移到同侧手腕后方，小腿斜放在身前，脚落在另一侧手附近。', '另一条腿向后伸直，膝盖和脚背朝下贴地。', '双手撑地立起上身，调整骨盆，让两侧髋骨都朝前、高度接近；前腿一侧臀部下面空着，就垫毛巾或瑜伽砖。', '保持骨盆不歪，双手向前爬，先前臂落地，再把额头放在前臂或地面上，前腿一侧臀部深处有酸胀的拉伸感。', '放松肩膀，慢慢深呼吸，按计时保持这一侧。', '结束时双手撑地抬起上身，后脚脚趾踩地，把前腿收回四足位；换另一条腿在前，做同样的步骤。'], tips: ['前小腿越接近与垫子前沿平行越难，膝盖不舒服就把前脚收向身体，让小腿斜一些。', '上身趴不下去时，把前臂或额头放在瑜伽砖上。', '髋部很紧的人可以先做「鸽子式开髋」的直立版本。'], mistakes: ['骨盆歪向前腿一侧，重量全压在一边臀部上。', '后腿向外歪，脚背没有朝下。', '前膝感到扭拧或锐痛还继续往下压；出现锐痛、麻木立即退出。'] },
  '低位蜥蜴式（前臂落地）': { muscles: ['髋屈肌', '内收肌'], steps: ['弓步，前脚放在同侧手外', '后腿伸直蹬实，前臂逐步下沉贴地', '骨盆整体向下沉，保持深呼吸'], tips: ['髋前侧深层拉伸之王，跑步/久坐后尤佳', '下不去就先停在手掌支撑'], mistakes: ['后腿膝盖软塌丢张力', '肩膀耸起'] },
  '穿针式（thread the needle）': { muscles: ['胸椎', '肩', '核心'], steps: ['四足跪姿，手在肩下、膝在髋下，膝盖下垫软。', '右手掌心朝上，从左手和左膝之间向左侧穿过去，沿地面一直滑。', '左手肘弯曲，上身降低，让右肩外侧和右侧脸颊落到垫子上。', '臀部仍在膝盖正上方，骨盆朝下不跟着转，上背和右肩后侧有扭转、拉开的感觉。', '左手撑在地上或向前伸直，按计时保持，呼气时让上背再放松一点。', '结束时左手推地，把右臂抽回，回到四足位；再换左臂穿过去，做另一侧。'], tips: ['侧脸落地不舒服，可以在脸下垫折叠毛巾。', '想加深，可以把上面那只手绕到背后，手背贴在下背。', '手腕不适可以用拳头撑地。'], mistakes: ['臀部向一侧坐下或骨盆跟着转，扭转就没了。', '头和颈部承受大部分体重，脖子被压痛。', '肩膀出现锐痛或手臂发麻就退出。'] },
  '仰卧英雄式（supta virasana）': { muscles: ['股四头肌', '髋屈肌'], steps: ['跪在垫子上，两膝并拢，双脚分开到比臀部略宽，脚背贴地、脚趾朝后。', '臀部坐到两脚之间的地面上；坐不下去就在臀下垫一块瑜伽砖或折叠毛巾。', '双手放在身后地面，上身慢慢向后倒，先用手撑，再换成手肘撑地。', '大腿前侧已经有强烈拉伸感就停在手肘撑这一步；还能再往后，就让背和头慢慢躺到地上，或靠在垫高的枕头上。', '两膝始终贴地、不张开，下背不过度拱起，按计时保持并平稳呼吸。', '结束时先用手肘撑起，再用手推起上身回到跪坐，接着上身前倾、双手撑地，一条腿一条腿伸直。'], tips: ['每一步都可以是终点，不必躺平。', '背后可以竖放几块瑜伽砖或叠起的枕头，躺在上面降低难度。', '脚背太紧或抽筋时，在脚踝下垫一卷毛巾。'], mistakes: ['为了躺下让膝盖离地，或膝盖向两侧张得很开。', '腰椎大幅拱起，肋骨往上顶。', '膝盖出现任何锐痛或麻木，立刻起身退出。'] },
  '斯芬克斯式（sphinx pose）': { muscles: ['髋屈肌', '腹侧链'], steps: ['俯卧在垫子上，双腿伸直，并拢或与髋同宽，脚背贴地。', '手肘放在肩膀正下方，前臂平行向前贴地，手掌朝下。', '前臂压地，把胸口撑离地面，肩膀向下远离耳朵，目光看前方地面。', '耻骨和髋骨压向地面，臀部轻轻收紧，腹部前侧和髋前侧有拉长感，下背不挤痛。', '撑起后保持不动，平稳呼吸，按计时保持。', '结束时慢慢把胸口放回地面，头侧向一边休息片刻再起身。'], tips: ['下背有挤压感时，把手肘往前移一点，降低撑起高度。', '脖子不舒服时下巴微收，看前方地面，不要向上仰头。'], mistakes: ['耸肩，肩膀缩到耳朵旁。', '骨盆离地、塌腰硬挤腰椎。', '下背出现锐痛或腿发麻就放下。'] },
  '跪姿股四头肌拉伸': { muscles: ['股四头肌', '髋屈肌'], steps: ['在垫子上单膝跪地，后膝下垫软垫，前腿屈膝踩在身前，前膝在前脚踝正上方。', '上身立直，收紧后腿一侧的臀部，让骨盆轻轻后倾（尾骨向下）。', '保持骨盆后倾，身体整体向前平移一点，后腿大腿前侧和髋前侧出现拉伸感。', '后腿屈膝把脚抬起，用同侧手向后抓住脚背，慢慢把脚跟拉向臀部；另一只手扶前膝或扶墙保持平衡。', '上身保持直立，按计时保持，平稳呼吸。', '结束时先松开脚、慢慢放下，退回双膝跪地；换另一条腿在后，做同样的步骤。'], tips: ['抓不到脚就用毛巾或弹力带套住脚背拉。', '平衡不稳时侧对墙或沙发，空着的手扶住。', '拉伸太强时不抓脚，只做骨盆后倾、向前平移这一步。'], mistakes: ['塌腰把肚子往前顶，拉伸跑到腰上。', '上身歪向一侧。', '后膝压痛、大腿前侧或膝盖出现锐痛就松手退出。'] },
  '高跪姿后弯（kneeling backbend）': { muscles: ['胸椎', '核心'], steps: ['双膝跪地与髋同宽，膝下垫软，大腿与地面垂直，脚背贴地或脚趾踩地。', '双手放在下背和骶骨上，手指向下，手肘向后收拢。', '收紧臀部，髋部轻轻向前推，大腿保持垂直。', '吸气，胸骨向上抬，胸口向上向后展开，上背一点点向后弯，头跟着脊柱自然后仰，不猛甩。', '呼气，慢慢回到上身直立；跟着呼吸反复做到计时结束，最后一次可以在后弯位置停几次呼吸。', '结束时先回到直立，臀部坐回脚跟，上身前趴做婴儿式放松下背。'], tips: ['脚趾踩地可以让骨盆位置更高，后弯更容易。', '颈部不舒服就下巴微收，眼睛看前上方，不把头仰到底。', '熟练后可以双手向后扶脚跟，不要勉强。'], mistakes: ['头猛地后仰，甩到颈部。', '腰部折成一个角，弯的位置全在下背。', '下背出现锐痛、头晕或手臂发麻就立刻回正。'] },
  '仰卧颈部后仰伸展': { muscles: ['内收肌', '颈前侧'], steps: ['仰卧靠墙抬腿并向两侧分开（重力开胯位）', '下巴轻微上抬让颈椎进入温和伸展', '幅度以完全无压迫感为限，深呼吸保持'], tips: ['分腿与颈部两处同时放松，适合训练尾声', '颈下可垫薄毛巾更舒适'], mistakes: ['颈部过度后仰', '有麻木感还继续'] },
  '挺尸式（savasana）': { muscles: ['全身'], steps: ['仰卧在垫子上，双腿伸直自然分开，脚尖自然向外倒。', '双臂放在身体两侧、稍离开躯干，掌心向上，肩膀下沉。', '闭上眼睛，下巴微收，后脑勺放松。', '从脚开始，依次放松小腿、大腿、臀部、腹部、胸口、肩膀、手臂和脸；哪里放松不下来，就先绷紧几秒再松开。', '用鼻子自然呼吸，按计时静躺 90 秒。', '结束时先动动手指脚趾，屈膝转向一侧，再用手撑地慢慢坐起。'], tips: ['腰不舒服，在膝下垫一卷毛巾。', '训练后容易冷，可以盖一条毛巾。'], mistakes: ['躺着看手机。', '计时一结束就猛地坐起来，容易头晕。'] },
  '卧束角式（supta baddha konasana）': { muscles: ['内收肌', '髋外旋肌'], steps: ['仰卧在垫子上，屈膝双脚踩地。', '两只脚心相对贴在一起，脚跟靠近臀部，距离以舒服为准。', '让两侧膝盖慢慢向外落下，不用手压，大腿内侧和腹股沟有温和的拉伸感。', '双手轻放在小腹上或放在身体两侧，肩膀和下背放松贴地。', '用腹部慢慢呼吸，按计时保持 120 秒。', '结束时用手从大腿外侧把两膝托回中间，双脚踩地后再伸直双腿。'], tips: ['保持时间长，膝盖下各垫一块瑜伽砖或枕头会更容易放松。', '脚跟离臀部远一些，拉伸感会减轻。'], mistakes: ['用手往下压膝盖。', '腰部紧张拱起离地。', '腹股沟或膝盖内侧锐痛就把膝托起来退出。'] },
  '婴儿式（balasana）': { muscles: ['下背', '肩', '髋'], steps: ['跪在垫子上，脚背贴地，两个大脚趾靠拢，双膝并拢或分开到与垫子同宽。', '臀部向后坐到脚跟上。', '上身从髋部向前俯下，腹部落在大腿上（膝盖分开时落在两腿之间），额头点地。', '双臂向前伸直，掌心贴地，肩膀放松；下背和臀部有拉长感。', '用鼻子深长呼吸，按计时保持，每次呼气让臀部再往脚跟沉一点。', '结束时双手撑地往回走，慢慢把上身抬起，回到跪坐。'], tips: ['臀部坐不到脚跟，在臀部和脚跟之间夹一个枕头或折叠毯。', '额头够不着地，垫一块瑜伽砖。', '双臂也可以放回身体两侧、掌心向上，肩膀会更放松。'], mistakes: ['臀部翘起离开脚跟。', '耸肩、肩颈紧张。', '膝盖或脚背锐痛就退出，改成仰卧抱膝。'] },
  '蜥蜴式（lizard）': { muscles: ['髋屈肌', '内收肌'], steps: ['四足跪姿开始，右脚向前迈到右手外侧，脚掌踩实，右膝在脚踝正上方。', '左膝落地，膝下垫毯，左脚背贴地。', '双手撑在右脚内侧的地面上，骨盆慢慢向前向下沉。', '到位时左侧髋前侧和右侧大腿内侧有拉伸感，右膝对着脚尖方向，可以微微向外打开。', '想加深就把双前臂落到地面或瑜伽砖上；平稳呼吸，按计时保持 45 秒。', '计时结束后双手撑地，右脚退回四足跪姿，换左脚在前，做到计时结束。'], tips: ['手撑不到地，就撑在两块瑜伽砖上。', '想加大强度，后腿伸直、膝盖离地。', '后膝跪着疼，下面垫折叠毛巾或软垫。'], mistakes: ['前膝向内扣，或前膝远远超过脚尖。', '耸肩塌胸，全靠手臂撑着。', '腹股沟或膝盖锐痛就退出。'] },
  '鸽式（eka pada kapotasana）': { muscles: ['髋外旋肌', '梨状肌', '髋屈肌'], steps: ['四足跪姿开始，右膝向前移到右手腕后方，右小腿斜放在身体前方，右脚靠近左髋前方。', '左腿向后伸直，膝盖和脚背贴地，脚尖指向正后方。', '调整骨盆，让两侧髋骨尽量都朝前、高度一致，双手撑在身体两侧地面，上身立直。', '到位时右侧臀部外侧有拉伸感；右臀悬空就在下面垫瑜伽砖或折叠毯。', '平稳呼吸，按计时保持；想加深就双手往前走，上身前趴到前臂或额头落地。', '计时结束后双手撑地，后脚趾回勾，把右腿收回四足跪姿，换左腿在前，做到计时结束。'], tips: ['骨盆坐不平就垫砖，别歪着硬撑。', '前膝不舒服，把前脚收近腹股沟，减小小腿横放的角度。', '做不了就改成仰卧 4 字拉伸，作用部位相同、膝盖压力更小。'], mistakes: ['骨盆歪斜，整个人坐到一边。', '后腿外翻，膝盖朝向侧面。', '前膝锐痛立即退出。'] },
  '弓式（dhanurasana）': { muscles: ['脊柱伸肌', '髋屈肌', '胸'], steps: ['俯卧在垫子上，额头点地，双臂放在身体两侧。', '屈膝让脚跟靠近臀部，双手向后分别抓住两侧脚踝外侧，膝盖与髋同宽。', '吸气，小腿向后向上蹬手，借这股力把胸口和大腿同时抬离地面，身体成弓形。', '到位时只有腹部着地，肩膀向后打开，视线看前下方，脖子不往后折。', '平稳呼吸，按计时保持；撑不住就放下歇一口气再抬起，做到计时结束。', '结束时呼气，慢慢把胸口和大腿放回地面，松开双手，侧脸贴地休息。'], tips: ['抓不到脚踝，用毛巾或弹力带套住脚背，双手拉住两端。', '先练半弓式：一手抓同侧脚踝，另一手前伸撑地，两侧交替。', '腹部压得不舒服，在腹下垫一条薄毯。'], mistakes: ['膝盖向两侧大开。', '憋气、猛抬头。', '腰部锐痛或腿发麻立即放下。'] },
  '轮式（urdhva dhanurasana）': { muscles: ['脊柱', '肩', '臀', '腿'], steps: ['仰卧屈膝，双脚与髋同宽踩地，脚跟靠近臀部，脚尖朝前。', '双手翻过来撑在耳朵两侧，手指指向肩膀，手肘朝上不外翻。', '吸气，双脚踩地把髋抬起，再双手推地，先让头顶轻轻点地停一下；这时体重主要由双手双脚撑住，不压在脖子上，手肘保持与肩同宽。', '再次吸气，手臂和腿同时推直，头离开地面，胸口向两手之间推，身体成拱形。', '平稳呼吸，按计时保持；撑不住就下巴微收、屈肘屈膝，让后脑勺和上背先落地，躺下歇一口气再推起，做到计时结束。', '结束时下巴微收，屈肘屈膝，先让后脑勺和上背落地，再放下臀部，抱膝休息。'], tips: ['先把桥式和头顶点地的过渡做稳，再推完整轮式。', '推不起来，在墙根放两块瑜伽砖，双手撑在砖上做。', '推起后双脚往手的方向挪近一点，胸口更容易打开。', '肩、手腕、腰或颈部有伤先不做；第一次推轮式可以请人在旁边扶住上背。'], mistakes: ['手肘向外翻，撑不稳。', '双脚外撇、膝盖向外开。', '腰部或手腕锐痛、头晕立即放下。'] },
  '花环式（malasana）': { muscles: ['髋', '内收肌', '踝'], steps: ['双脚比髋略宽站立，脚尖向外转。', '屈髋屈膝蹲到最低，脚跟尽量踩实，臀部悬在两脚之间。', '上臂放到两膝内侧，双手在胸前合十。', '手肘抵住膝盖内侧向外撑，膝盖同时回推手肘，脊柱向上立直、肩膀下沉。', '到位时大腿内侧、腹股沟和脚踝有拉伸感；平稳呼吸，按计时保持。', '结束时双手撑地，臀部抬起，慢慢伸直双腿站起来。'], tips: ['蹲不到底，在臀下垫一块瑜伽砖或软垫坐着做（演示图就垫了软垫）。', '脚跟踩不实，在脚跟下垫一卷毛巾。', '平衡不好，背靠墙或面对立柱扶着做。'], mistakes: ['弓背团成一团。', '重心向后倒。', '膝盖或腹股沟锐痛就站起来。'] },
  '猴神式（hanumanasana）': { muscles: ['腘绳肌', '髋屈肌'], steps: ['半跪开始：右脚在前踩地，左膝跪地，在身体两侧各放一块瑜伽砖。', '右腿向前伸直，脚尖回勾，上身微微前倾，双手扶砖。', '右脚跟慢慢向前滑，同时左膝向后退，骨盆逐渐下沉。', '停在当前能控制的深度：骨盆两侧朝正前方，后腿膝盖和脚背朝下，前腿后侧和后腿髋前侧有拉伸感。', '平稳呼吸，按计时保持；骨盆悬空就在前腿大腿下或臀下垫瑜伽砖承重。', '计时结束后双手撑砖，前脚跟往回收，后膝向前收回半跪，换另一侧，做到计时结束。'], tips: ['演示图是骨盆完全落地、双臂上举的完整版，做不到就停在双手扶砖的深度。', '先做低弓步和坐姿前屈把腿前后侧都活动开再做。', '地面太滑，脚跟下垫毛巾帮助滑动和控制。'], mistakes: ['骨盆歪向一侧，为了贴地硬坐下去。', '往下弹震着压。', '腿后侧或腹股沟锐痛立即退出。'] },
});

// ══ 主发力 / 协同肌群(文字) ══
// 2026-11-10 Cici:以前那套肌肉示意图(wger 解剖图按关键词粗配,常对不上)不要了,只留文字;muscles/ 目录一并删掉
function renderMuscleDiagram(muscles, exName = '') {
  if (!Array.isArray(muscles) || !muscles.length) muscles = ['全身'];
  const primaryName = muscles[0] || '目标肌群';
  const secondaryName = muscles.slice(1).join(' · ') || '';
  return `<div style="margin:10px 0 0;display:flex;flex-direction:column;gap:8px;width:100%">
    <div class="kv"><span class="k">主发力</span><span class="accent">${primaryName}</span>${secondaryName && secondaryName !== '—' ? `<span class="k">协同辅助</span><span>${secondaryName}</span>` : ''}</div>
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

  const allGroups = Object.keys(DB).filter(g => g !== 'posture');
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
  const _inBlock = groupKey === 'stretch' || groupKey === 'warmup';
  const sets = _inBlock ? 1 : 3;
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
    isWarmup: groupKey === 'warmup',
    isStretch: groupKey === 'stretch',
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
    <div class="note-line">按健身时间（设为 ${totalMins} 分钟）算：建议水中训练 ${swimMins}分钟 + 放松 ${recoveryMins}分钟</div>
    ${row('干蒸 / 湿蒸桑拿', `${saunaMins} 分钟 · 促进血液循环与深层排汗`, `<button class="act-play-btn" onclick="startTimer(${saunaMins}*60,'桑拿中 · 保持长呼吸')">开始 ${saunaMins} 分</button>`)}
    ${row('热水水力 Spa（Hot Tub）', `${hottubMins} 分钟 · 水力冲刷缓解关节与肌肉张力`, `<button class="act-play-btn" onclick="startTimer(${hottubMins}*60,'Hot Tub 水疗中')">开始 ${hottubMins} 分</button>`)}
    ${loungerRow}
    ${row('冷热交替浴引导', '冷 1 min ⇄ 热 3 min 循环 3 轮 · 血管泵动', `<button class="act-play-btn" onclick="startMultiTimer([{sec:60,label:'冷水冲洗/浸泡'},{sec:180,label:'Hot Tub/热水池'},{sec:60,label:'冷水冲洗/浸泡'},{sec:180,label:'Hot Tub/热水池'},{sec:60,label:'冷水冲洗/浸泡'},{sec:180,label:'Hot Tub/热水池'},{sec:60,label:'冷水收尾完成'}])">启动引导</button>`)}
  </div>
</details>`;
}
window.renderRecoveryModule = renderRecoveryModule;
