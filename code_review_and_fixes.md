# Cici健身计划 — 代码审查与修复清单（交接 Claude Code）

## 说明
本文档基于对 `core.js` / `app.js` / `sw.js` / `Index.html` 的实际逐行审查，给出确认的 bug、修复方案（含 before/after）、冗余项，以及一份未审查清单。所有行号为审查时的近似位置，请以代码内容定位为准。项目根目录：`/Users/caitlye/Desktop/Cici健身计划/`。

优先级：**P0**（数据安全 / 正常使用即触发）> **P1**（功能错配）> **P2**（冗余 / 体验）。

## 与数据恢复的关系（先读）
**P0-2（命名空间迁移缺失）的修复，同时就是 Cici 数据的干净恢复方案。** Cici 的 iOS Safari 自更新后未打开过，她的旧"裸键"数据完好。一旦部署了带迁移逻辑的新代码，她下次打开 app 时会自动把裸键复制到她 uid 的命名空间，无需手动 Web Inspector。迁移对裸键是**只读复制、不删除**，所以即使她已经打开过 app，迁移在之后任何时候运行仍然有效。桌面上那份 `cici_data_recovery_automation_prompt.md` 退化为备选方案。**建议：先实现并部署 P0-2，再让 Cici 打开手机。**

---

## P0-1　多选目标导致强度方案静默错配
**位置**：`app.js` 目标 chip 处理（约 720-742 行）；`core.js` genPlan 分发（约 972 行）与 `SCHEMES[S.goal]||SCHEMES['女性薄肌']`（genPlan 约 1080 行、pickExercises 约 617 行）。

**现状**：训练目标是多选 chip，`S.goal = goals.join('+')`。SCHEMES 仅有 5 个精确 key：`女性薄肌 / 臀腿塑形 / 女性薄肌+臀腿塑形 / 倒三角矫正 / 翘臀美背`。genPlan 用 `hasGoal()`（子串、顺序无关）选模板，但 SCHEMES / TIPS 用 `S.goal` 精确匹配。

**问题**：
1. **顺序依赖**：先点"臀腿塑形"再点"女性薄肌"→ `S.goal='臀腿塑形+女性薄肌'`，SCHEMES 无此 key → 静默回退女性薄肌方案。连合法组合都不稳。
2. **新目标组合**：选"倒三角矫正"后再叠加任何目标 → 无对应 SCHEME key → genPlan 因 `hasGoal('倒三角矫正')` 选了 ATHLETIC 模板，但 sets/reps/weightGuide 回退成女性薄肌（15-20 次低重量）。模板与强度脱节，用户无感知。

**修复**：把"倒三角矫正""翘臀美背"设为整套预设、与一切互斥（单选）；仅"女性薄肌+臀腿塑形"可组合；组合时强制规范顺序。重写 chip 处理（替换 app.js 约 720-742 行的 IIFE）：
```js
(function(){
const el=document.getElementById('g-goal');if(!el)return;
const EXCLUSIVE=['倒三角矫正','翘臀美背']; // 整套方案，不可与其他目标组合
el.addEventListener('click',e=>{
  const b=e.target.closest('.chip');if(!b)return;
  const goal=b.dataset.v;
  let goals = S.goal ? S.goal.split('+') : [];
  if(EXCLUSIVE.includes(goal)){
    goals = goals.includes(goal) ? [] : [goal];           // 互斥：选它即清空其他；再点一次清空
  } else {
    goals = goals.filter(g=>!EXCLUSIVE.includes(g));        // 选普通目标时先去掉互斥预设
    goals = goals.includes(goal) ? goals.filter(g=>g!==goal) : [...goals, goal];
  }
  if(goals.length===0) goals.push('女性薄肌');
  const ORDER=['女性薄肌','臀腿塑形'];                       // 规范顺序，保证组合 key 命中
  goals.sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b));
  S.goal = goals.join('+');
  if(hasGoal('倒三角矫正')||hasGoal('臀腿塑形')||hasGoal('翘臀美背')){
    S.focus=['下肢'];
    ['健身房全套','弹力带','无器材'].forEach(x=>{ if(!S.equip.includes(x)) S.equip.push(x); }); // 见 P1-2
  } else { S.focus=['均衡全身']; }
  saveState(); applySettingsToUI(); flashSaved();
});
})();
```
并加防御性 scheme 选择，让 SCHEMES 缺 key 时按与 genPlan **相同的优先级**回退（而非永远女性薄肌）。在 `core.js` 加 helper，genPlan 与 pickExercises 都用它：
```js
function currentScheme(){
  if(SCHEMES[S.goal]) return SCHEMES[S.goal];
  if(hasGoal('倒三角矫正')) return SCHEMES['倒三角矫正'];
  if(hasGoal('翘臀美背'))   return SCHEMES['翘臀美背'];
  if(isCombinedGoal())      return SCHEMES['女性薄肌+臀腿塑形'];
  if(hasGoal('臀腿塑形'))   return SCHEMES['臀腿塑形'];
  return SCHEMES['女性薄肌'];
}
```
把两处 `const sch=SCHEMES[S.goal]||SCHEMES['女性薄肌'];` 改为 `const sch=currentScheme();`。TIPS 同理按优先级回退。

---

## P0-2　命名空间迁移缺失（数据丢失根因 + Cici 恢复）
**位置**：`core.js` 约 6-9 行（`currentUid` / `nsKey` / `lg` / `ls`）。

**现状**：`lg/ls` 用 `nsKey(k)=currentUid()+'__'+k` 读写，但没有任何把旧"裸键"迁移到前缀键的逻辑。未登录时 `currentUid()` 返回 `'anon'`。

**问题**：旧版本数据存于裸键（`fit_s1` 等）。新版本读 `${uid}__fit_s1`（不存在）→ 显示空。这就是 Cici 记录消失的原因；裸键数据仍在 localStorage，只是不再被读取。

**修复**：加一次性迁移，在拿到 uid 后、首次 `loadState()` 之前运行（`app.js` 的 `handleAuth` 内）。规则：仅当本设备裸键尚未被任何账户认领时，迁移给当前 uid，避免共享设备误把 A 的数据迁给 B。
```js
function migrateLegacyKeys(uid){
  if(!uid || uid==='anon') return;
  if(localStorage.getItem('__ns_migrated__'+uid)) return;
  const owner=localStorage.getItem('__legacy_owner_uid__');
  if(owner && owner!==uid){ localStorage.setItem('__ns_migrated__'+uid,'1'); return; }
  const BARE=['fit_s1','fit_p1','fit_pr1','fit_log1','fit_adj1','fit_wh1','fit_pr','fit_swim','fit_gym_ach','fit_selDate'];
  let any=false;
  BARE.forEach(k=>{
    const src=localStorage.getItem(k);
    if(src===null) return;
    const dst=uid+'__'+k;
    if(localStorage.getItem(dst)===null){ localStorage.setItem(dst,src); any=true; }
  });
  if(any && !owner) localStorage.setItem('__legacy_owner_uid__',uid);
  localStorage.setItem('__ns_migrated__'+uid,'1');
}
```
在 `handleAuth(user)` 内、读状态之前调用 `migrateLegacyKeys(user.uid)`。**不要删除裸键**（保留作安全副本）。

可选（匿名期数据）：登录瞬间把 `anon__*` 复制到 `${uid}__*`（仅当目标键不存在），解决未登录先用、登录后数据消失。

---

## P0-3　selDate 键名写读不一致
**位置**：`app.js` saveState（约 65 行）与 loadState（约 70 行）；clearAllData（约 205 行附近）。

**现状**：saveState 写裸键 `localStorage.setItem('fit_selDate', ...)`，loadState 读 `localStorage.getItem(nsKey('fit_selDate'))`，clearAllData 删 `nsKey('fit_selDate')`。

**问题**：写读键名不一致，selDate 永远读不回，每次回退 `todayStr()`；saveState 写的裸键也永远清不掉，残留。

**修复**：把 `'fit_selDate'` 纳入 `K`（如 `K.selDate='fit_selDate'`），saveState / loadState / clearAllData 统一走 `nsKey('fit_selDate')`。最小改动：把 saveState 那行改成 `localStorage.setItem(nsKey('fit_selDate'), JSON.stringify(S.selDate))`。

---

## P1-1　肩部限制规则动作名不匹配（且需全表核对）
**位置**：`core.js` LIMIT_RULES（约 27-37 行）vs DB（约 80-150 行）。

**现状**：肩规则 `exclude` 含 `'直立划船'`，但 DB.shoulder（约 85 行）动作名是 `'杠铃直立划船'`。过滤用精确匹配（`!excluded.has(ex.n)`）。

**问题**：勾"肩"伤病时 `'直立划船'` 匹配不上 `'杠铃直立划船'`，直立划船没被排除。斜方规则（约 32 行）用了正确全名所以有效。

**修复**：肩规则里 `'直立划船'` → `'杠铃直立划船'`。并**逐条核对** LIMIT_RULES 所有 `exclude` 字符串是否精确等于某个 `DB[grp][].n`，修正所有不匹配（如膝规则的 `'腿举' / '跳蹲' / '哑铃弓步蹲'`，肩规则的 `'侧平举'` 是否需覆盖 `'坐姿侧平举机' / '绳索侧平举'` 等，对照 DB 实际命名）。建议加开发期断言：遍历所有 `exclude`，在 DB 里找不到的名字 `console.warn`。

---

## P1-2　臀中肌动作被器材过滤掉（Cait 的头号优先级）
**位置**：`core.js` pickExercises 池过滤（约 656 行）与有氧收尾过滤（约 678 行）；DB.glutemed（约 123 行）；`app.js` 目标 chip 强制器材（约 734 行，已并入 P0-1 修复）。

**现状**：池过滤 `ex.eq.some(e=>S.equip.includes(e))`。glutemed 里弹力带螃蟹步 / 侧卧抬腿 / 蚌式的 eq 含 `弹力带`/`无器材`，绳索外展和器械外展机为 `健身房全套`。选倒三角时原代码只强制加 `健身房全套`。

**问题**：Cait 只勾"健身房全套"时，臀中肌池只剩绳索外展 + 器械外展机，而她健身房**没有外展机**，实际只剩 1 个可做动作，但"臀中肌宽度（重）"日要 4 个。她的头号优先级被废掉。

**修复（推荐，单行且通用）**：让 `无器材`（徒手）动作永远可用——徒手在哪都能做，本不该被器材过滤：
```js
// before（约 656 行）
let pool=(DB[grp]||[]).filter(ex=>ex.eq.some(e=>S.equip.includes(e))&&!used.has(ex.n)&&!excluded.has(ex.n));
// after
let pool=(DB[grp]||[]).filter(ex=>ex.eq.some(e=>e==='无器材'||S.equip.includes(e))&&!used.has(ex.n)&&!excluded.has(ex.n));
```
有氧收尾那处的 `cPool` 过滤（约 678 行）同样把 `e=>S.equip.includes(e)` 改成 `e=>e==='无器材'||S.equip.includes(e)`。这样侧卧抬腿（含无器材）始终可选。**另外**（已并入 P0-1 chip 修复）：选倒三角 / 臀腿 / 翘臀时把 `弹力带`、`无器材` 一并加入 `S.equip`，让螃蟹步 / 蚌式也进池。

---

## P1-3　每次打卡重洗未来计划
**位置**：`core.js` 自动调节（约 2088 行 `setTimeout(()=>{genPlan(true)},100)`）；genPlan 的 preserve 逻辑（约 1015-1025 行）。

**现状**：每次记录非游泳训练后调 `genPlan(true)`，它保留过去 / 锁定 / 今天有进度的天，但未锁定的未来天会被**重新随机选动作**。

**问题**：用户今天看到的"下周二"动作，打完今天卡后被换掉，计划不稳定。多数人期望未来安排固定。

**修复（设计决策，建议方案）**：把"训练量调节"和"重选动作"分离。打卡后不要整体 `genPlan(true)` 重选；改为对已生成的未来未锁定天**原地按 `volumeMultiplier` 调整组数**，不替换动作。具体：genPlan(true) 时把已存在的未来未锁定天也纳入 `preserve`（保留动作选择），仅对其 `sets` 应用新的 multiplier；只有 14 天窗口需新增的天才新选动作。或加一个"锁定计划"开关交给用户。

---

## P1-4　weightGuide 假精确（贴在每个动作上）
**位置**：`core.js` pickExercises 教练提示拼接（约 690 行）。

**现状**：
```js
const coaching = (S.periodMode ? '经期温和模式 | ' : '') + `${ex.note} — ${sch.intensityNote[S.level]}（${sch.weightGuide[S.level]}）`;
```
每个动作都显示"约 max 的 XX%"。

**问题**：app 无任何 1RM 输入或测试，`%max` 无依据，初学者无法执行。而 `W_HIST` 已记录每个动作的真实历史重量，更有参照价值。

**修复（推荐）**：用 `W_HIST` 最近一次重量替代虚构百分比。先确认 `W_HIST` 元素结构（约 2100 行 "Save weight history" 处），取该动作最近一条 `weight`：有则显示"上次 X kg，本次持平或加一档"，无则只给次数区间提示、不显示 `%max`。**最小改动**：直接删掉 `（${sch.weightGuide[S.level]}）`，保留 `intensityNote`。SCHEMES 里的 `weightGuide` 字段可一并移除或留作备用。

---

## P2　冗余 / 清理
- **dev.js 进了生产**：`sw.js` 的 LOCAL_ASSETS 含 `'./dev.js'`；`Index.html`（约 332-337 行）"Developer Testing Console" 下 script 引入。发布版应移除该 `<script>` 并从 `sw.js` LOCAL_ASSETS 删除，或加开关（仅 `localStorage.__dev__` 时加载）。
- **_mockDate dev 钩子**：`core.js` 约 706 行读 `sessionStorage.__dev_mock_date__` 伪造日期。若移除 dev 控制台则一并删。
- **scratch/ 目录**：`smoke_test.js` / `dev_smoke_test.js` / `find_emojis.js` / `rpe_styles.css` 是测试残留，部署时排除（加进 `.gitignore` 或不发布）。
- **护肤计划.html**：与健身工程无关，建议移出本 repo。
- **死代码**：`core.js` 约 654 行 `cnt=Math.min(cnt+1,cnt+1)` 等价于 `cnt=cnt+1`，去掉无意义的 `Math.min`。

---

## 可加功能（非 bug，按需）
- **计划稳定开关**：对应 P1-3，默认锁定已生成的未来安排。
- **基于 W_HIST 的真实负重提示**：对应 P1-4，数据现成，把假 `%max` 换成"上次多少 kg"。
- **可编辑 profile 名与印章**：现在 `updateProfileUI` 从 Google displayName 取首字 / 首字母（`name.charAt(0)`、`split(' ')[0]`），中文名不理想，应单独存可编辑显示名与印章字。
- **迁移安全网**：即 P0-2，已兼作 Cici 恢复。

---

## 未审查清单（请 Claude Code 自行复核，本次未读）
以下未逐行读，可能另有 bug，改动前先读相关代码：
- `app.js` 约 335-590（renderStats 剩余、计划渲染、配重 UI、日历、分享）与 745-1499。
- `core.js` 1095-3254 大部分：成就 / 里程碑实际逻辑、游泳模块、onboarding（约 1352 行 `selectOnboardGoal`）、动作详情 / 百科文案（约 2469-2708，可能还有别的断言）。

---

## 建议处理顺序
1. **P0-2 迁移**（先做并部署，Cici 打开手机即自动恢复）。
2. **P0-1 多选目标错配**（影响每个用户的训练参数正确性）。
3. **P0-3 selDate、P1-1 限制名、P1-2 器材过滤**（小而确定）。
4. **P1-3 计划稳定、P1-4 假精确**（设计 / 体验）。
5. **P2 清理**。

每改一条单独提交，便于回滚与验证。改完建议跑一遍 `scratch/` 里的 smoke test（如果还保留），并手动验证：两个账户登录不串号、Cait 选倒三角后每天都有可做的臀中肌动作、Cici 选翘臀美背有美背日、目标单选/组合不再回退错方案。
