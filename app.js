// ══ app.js — Auth, Sync, Journal, Stats, UI ═════════════
let _initialLoad = true;

// ══ Dark/Light Mode Toggle ═══════════════════════════════
(function initTheme(){
    const saved = localStorage.getItem('fit_theme') || 'system';
    applyTheme(saved);
    // Sync theme button icon if system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem('fit_theme') || 'system') === 'system') {
            applyTheme('system');
        }
    });
})();

function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') {
        html.classList.add('dark');
        html.classList.remove('light');
    } else if (theme === 'light') {
        html.classList.add('light');
        html.classList.remove('dark');
    } else {
        html.classList.remove('dark', 'light');
    }
    if (typeof cfThemeColor === 'function') cfThemeColor();   // iOS 状态栏颜色跟风格 + 深浅(index.html 开机脚本)
    updateThemeBtn(theme);
}

function toggleTheme(){
    const current = localStorage.getItem('fit_theme') || 'system';
    let next = 'system';
    if (current === 'system') {
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        next = isSystemDark ? 'light' : 'dark';
    } else if (current === 'light') {
        next = 'dark';
    } else {
        next = 'system';
    }
    localStorage.setItem('fit_theme', next);
    applyTheme(next);
}

function updateThemeBtn(theme){
    if (typeof uiRenderMeLook === 'function') uiRenderMeLook();   // 外观改到「我 → 02」三段选择
    const btn = document.getElementById('theme-btn');
    if (!btn) return;
    const current = theme || localStorage.getItem('fit_theme') || 'system';
    if (current === 'system') {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
        btn.title = '跟随系统 (点击切换)';
    } else if (current === 'light') {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
        btn.title = '浅色模式 (点击切换)';
    } else {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
        btn.title = '深色模式 (点击切换)';
    }
}

// ══ State Persistence ════════════════════════════════════
function saveState(){
ls(K.settings,{goal:S.goal,level:S.level,days:S.days,dur:S.dur,equip:S.equip,focus:S.focus,limits:S.limits,volumeMultiplier:S.volumeMultiplier,restDur:S.restDur,swimLevel:S.swimLevel,weightLevel:S.weightLevel,periodMode:S.periodMode,displayName:S.displayName,sealChar:S.sealChar,cycleEnabled:S.cycleEnabled,cycleDay:S.cycleDay,cycleLength:S.cycleLength,cycleSetAt:S.cycleSetAt||null,vacuumDays:S.vacuumDays,partnerDays:S.partnerDays,partnerUid:S.partnerUid,autoVolumeAdjust:S.autoVolumeAdjust,userExcluded:S.userExcluded,userExcludeReasons:S.userExcludeReasons,cheer:S.cheer,reacts:S.reacts,partnerSeen:S.partnerSeen||null,partnerName:S.partnerName||null,aiWeights:S.aiWeights,planStale:!!S.planStale,skin:S.skin,push:S.push,partnerAlign:S.partnerAlign!==false,autoShift:S.autoShift,shiftFollowed:S.shiftFollowed,share:S.share});
if(S.plan)ls(K.plan,{plan:S.plan,prog:S.prog,adj:S.adj,weights:S.weights,exRpe:S.exRpe,poolLounger:S.poolLounger,flexProg:S.flexProg,unlockedDates:S.unlockedDates});
localStorage.setItem(nsKey('fit_selDate'), S.selDate || '');
if(typeof wpStateDirty==='function')wpStateDirty(); // 开了「主动找你」:节流上传快照(push.js)
}
function loadState(){
const s=lg(K.settings);
if(s)Object.assign(S,s);
// 风格(skin.js):有存档但没这个字段 = 老用户,一直在用纸墨,别偷偷换;没有存档(新用户)就沿用开机脚本定的
if(s)S.skin=(s.skin==='sport'||s.skin==='paper')?s.skin:'paper';
if(S.skin&&typeof skinApply==='function')skinApply(S.skin);
// 迁移：旧目标名「女性线条」→「女性曲线」。改名前存档/云端的 S.goal 可能仍是旧名，
// 与现版本 hasGoal('女性曲线') 匹配不上 → 会错误回退到练上身的方案。
if(S.goal&&S.goal.includes('女性线条')){S.goal=S.goal.replace(/女性线条/g,'女性曲线');saveState();}
const p=lg(K.plan);
if(p&&p.plan&&p.plan.days){
    S.plan=p.plan;
    S.selDate=localStorage.getItem(nsKey('fit_selDate')) || p.selDate || todayStr();
    if(_initialLoad && S.selDate<todayStr() && S.plan.days.some(d=>d.date===todayStr())){
        S.selDate=todayStr();
    }
    S.prog=p.prog||{};
    S.adj=p.adj||{};
    S.weights=p.weights||{};
    S.exRpe=p.exRpe||{};
    S.poolLounger=p.poolLounger||{};
    S.flexProg=p.flexProg||{};
    S.unlockedDates=p.unlockedDates||[];
}
else{S.plan=null;}
LOG=lg(K.log)||[];
W_HIST=lg(K.wh)||{};
PR_LIST=lg(K.pr)||[];
BODY_LOG=lg(K.body)||[];
if(typeof rebuildAchievementsFromLogs === 'function') rebuildAchievementsFromLogs();
applySettingsToUI();
if(typeof _migrateExerciseNames==='function') _migrateExerciseNames(); // 动作改名:历史数据跟着搬
if(S.plan && typeof _purgeGatedFromPlan==='function') _purgeGatedFromPlan(); // 非 owner:清掉历史计划里的门控动作
render();
if(S.plan && typeof autoAlignPlan==='function') autoAlignPlan();
_initialLoad = false;
}
function applySettingsToUI(){
// 设置的控件都在「计划」页和新手设置里,由 ui.js 按 S 现画;这里只负责触发重画和旁边几样状态
document.body.classList.toggle('theme-curve', hasGoal('女性曲线'));
if(typeof uiRenderPlanPage==='function')uiRenderPlanPage();
if(typeof uiRenderMe==='function')uiRenderMe();
if(typeof _oobe!=='undefined'&&_oobe.open&&typeof uiRenderOobe==='function')uiRenderOobe();
updateStaleBar();
}
// 设置改了会影响排课的项(目标/水平/天数/时长/器材/重点/限制/游泳水平),计划不会自己变 →
// 顶部亮一条「按新设置重排」,点了才重排今天之后的天;生成计划后自动收起
function markPlanStale(){
if(!S.plan)return;
const was=!!S.planStale;
S.planStale=true;saveState();updateStaleBar();
if(!was&&typeof render==='function')render(); // 今日页顶上也亮出来
}
function updateStaleBar(){
const bar=document.getElementById('stale-bar');
if(bar)bar.style.display=(S.plan&&S.planStale)?'':'none';
}

function updateCycleUI(){ if(typeof uiRenderP6==='function')uiRenderP6(); }
function updateSwimBreakdown(){
const el=document.getElementById('swim-breakdown');
if(!el) return;
const t=(typeof uiSwimLine==='function')?uiSwimLine():'';
if(!t){el.style.display='none';return;}
el.style.display='';
el.innerHTML=`<span class="faint">每周拆分 →</span> ${t}`;
}

// ── 搭子重合日(按周几;两边都用同一套每周排法模板,不用读对方的计划)──
// v15x 某次提交连同日历标记一起误删了 partnerOverlap,设置页的「重合」一直不显示;按原实现补回来。
// 配对后读得到对方的真实计划(共享文档 train.plan,coach.js coachSharedTraining 写的)就逐日按真实计划比(下面「搭子:按真实计划」);
// 没配对(手填天数)、对方 app 还没升级(共享文档里没有 train)才走这套按周几的老算法。
const GYM_PATTERNS={2:[1,0,0,1,0,0,0],3:[1,0,1,0,1,0,0],4:[1,1,0,1,1,0,0],5:[1,1,1,0,1,1,0],6:[1,1,1,1,1,1,0],7:[1,1,1,1,1,1,1]};
function weekdayPlanTypes(days,hasPool){
days=+days;
if(hasPool===undefined)hasPool=S.equip.includes('泳池');
if(hasPool){const sp=SWIM_SPLIT[days]||{gym:Math.max(2,days-1),swim:1};return (COMBO_PATTERNS[sp.gym+'+'+sp.swim]||COMBO_PATTERNS['3+2']).map(c=>c==='G'?1:c==='S'?2:0);}
return GYM_PATTERNS[days]||GYM_PATTERNS[3];
}
function partnerOverlap(){
if(_ppOff('plan'))return null;   // 对方关了「训练计划」:不拿每周天数猜(那是对方没同意给的),没有重合日
const real=_ppTrain();
if(real){
// 接下来两周逐日比:两边同一天同类(健身房 / 游泳)。dates = [[日期, 'g'|'s']]
const today=todayStr(),dates=[];
for(let i=0;i<14;i++){const ds=addDays(today,i),k=_myKindOn(ds);if((k==='g'||k==='s')&&partnerKindOn(ds)===k)dates.push([ds,k]);}
return {real:true,dates,gym:[],swim:[]};
}
const pp=(typeof _partnerProfile!=='undefined')?_partnerProfile:null;
const pd=(pp&&pp.days)?+pp.days:+S.partnerDays;
if(!pd||pd<2||pd>7)return null;
const myPool=S.equip.includes('泳池');
const theirPool=pp?!!pp.hasPool:myPool;
const mine=weekdayPlanTypes(S.days,myPool),theirs=weekdayPlanTypes(pd,theirPool);
const gym=[],swim=[];
for(let d=0;d<7;d++){if(mine[d]===1&&theirs[d]===1)gym.push(d);if(mine[d]===2&&theirs[d]===2)swim.push(d);}
return {gym,swim};
}
// 「重合 →」那一行(「我 → 搭子」和「计划 → 02」各一行,同一句):没得比时 null
function partnerOverlapHtml(){
if(_ppOff('plan'))return '<span class="faint">重合 →</span> TA 没共享计划，看不到重合日';
const ov=partnerOverlap();
if(!ov)return null;
if(ov.real){
if(!ov.dates.length)return '<span class="faint">重合 →</span> 接下来两周你俩没有同一天同类的训练日';
const g=ov.dates.filter(x=>x[1]==='g').map(x=>fmtDate(x[0])).join('、'),s=ov.dates.filter(x=>x[1]==='s').map(x=>fmtDate(x[0])).join('、');
return `<span class="faint">重合 →</span> 接下来两周 ${ov.dates.length} 天 · ${g?'健身房 '+g:''}${g&&s?' · ':''}${s?'游泳 '+s:''}`;
}
const g=ov.gym.map(d=>DN[d]).join('、'),s=ov.swim.map(d=>DN[d]).join('、');
if(!g&&!s)return '<span class="faint">重合 →</span> 你俩这周没有重合的训练日，换个天数试试';
return `<span class="faint">重合 →</span> ${g?'健身房 '+g:''}${g&&s?' · ':''}${s?'游泳 '+s:''}，这些天一起收拾`;
}
function updatePartnerOverlap(){
const els=['partner-overlap','plan-partner-overlap'].map(id=>document.getElementById(id)).filter(Boolean);
if(!els.length)return;
const h=partnerOverlapHtml();
els.forEach(el=>{if(h==null){el.style.display='none';return;}el.style.display='';if(el.innerHTML!==h)el.innerHTML=h;});
}

// ── 搭子:按真实计划 ──
// 一天用一个字母:g 健身房 · s 游泳 · r 休息 · p 另有安排(私密日,不对齐) · x 别的(经期的陆地轻量替代等,不对齐) · null 不知道
const _KIND_T={0:'r',1:'g',2:'s'};
function _dow0(ds){return (new Date(ds+'T12:00:00').getDay()+6)%7;}   // 0 = 周一
function _ppPaired(){const pp=(typeof _partnerProfile!=='undefined')?_partnerProfile:null;return (pp&&typeof pp==='object'&&partnerUid())?pp:null;}
function _ppTrain(){const pp=_ppPaired(),t=pp&&pp.train;return (t&&typeof t==='object'&&Array.isArray(t.plan))?t:null;}
// 对方的显示名;Cici 的账号名可能是 akane / aaakane(Cait:「akane就是cici」),一律叫 Cici
function _ppName(){const pp=_ppPaired();return ptName(pp&&pp.name).slice(0,12);}   // akane→Cici 统一走 ptName
// 对方计划里的一天 → 字母(新版共享文档每天带 k;旧版按类型名猜)
function _ppEntryKind(e){
if(!e||typeof e!=='object')return null;
if(['g','s','r','p','x'].includes(e.k))return e.k;
const t=String(e.type||'');
return t==='休息'?'r':t==='另有安排'?'p':t==='轻量替代'?'x':/游泳/.test(t)?'s':t?'g':null;
}
// 这一天对方的信息是不是真实的(对方的计划 / 打卡记录里有);不是就是按对方每周天数的标准排法补的
function _ppRealOn(ds){
const t=_ppTrain();if(!t)return false;
if(t.plan.some(x=>x&&x.date===ds))return true;
return !!(t.at&&ds<t.at&&ds>=addDays(t.at,-42)&&Array.isArray(t.logs));
}
// 对方某天练什么:计划里有就用计划;早于对方上次同步的日子看打卡记录(近 6 周,没记录 = 没练);
// 都没有(对方计划过期 / 没覆盖到)就按对方每周天数的标准排法(和老算法同一套)
function partnerKindOn(ds){
const pp=_ppPaired();if(!pp||_ppOff('plan'))return null;
const t=_ppTrain();
if(t){
const e=t.plan.find(x=>x&&x.date===ds);if(e)return _ppEntryKind(e);
if(_ppRealOn(ds)){const l=(t.logs||[]).find(x=>x&&x.date===ds);return l?(/游泳/.test(String(l.workout||''))?'s':'g'):'r';}
}
const pd=+pp.days;if(!(pd>=2&&pd<=7))return null;
return _KIND_T[weekdayPlanTypes(pd,!!pp.hasPool)[_dow0(ds)]];
}
// 我这一天(计划里的一天,或周历上只在日志里的一天)
function myDayKind(d){
if(!d)return null;
if(d.isPrivateDay)return 'p';
if(d.isRest)return 'r';
if(d.isSwimDay)return 's';
if(d.workoutType==='轻量替代')return 'x';
if(d._src==='log'&&/游泳/.test(String(d.workoutType||'')))return 's';
return 'g';
}
function _myKindOn(ds){
const d=(S.plan&&S.plan.days)?S.plan.days.find(x=>x.date===ds):null;
return d?myDayKind(d):_KIND_T[weekdayPlanTypes(S.days)[_dow0(ds)]];
}
// 周历:两边同一天同类的日子(Map 日期 → 'g'|'s');对方没有真实计划数据(没配对 / 对方没升级)→ null,周历走老算法
function partnerCoDays(days){
if(!_ppTrain())return null;
const m=new Map();
(days||[]).forEach(d=>{if(!d||d._src==='empty')return;const k=myDayKind(d);if((k==='g'||k==='s')&&partnerKindOn(d.date)===k)m.set(d.date,k);});
return m;
}

// ── 排计划对齐搭子 ──
// 谁排计划,谁去对齐对方「现有」的计划;对方的计划不会被自动改(免得两个人来回改)。对方计划没覆盖到的日子按对方每周天数的标准排法。
// 只挪训练放在哪天:每个自然周里练几次力量、几次游泳和原排法一样,所以天数少的一方自然落在天数多的一方的训练日里。
// 打分:同一天同类(力量对健身房日、游泳对游泳日)最多 → 和原排法改动最少。
// 身体和规矩优先:连续训练的天数不超过上限(原排法本身就更长的,不比原排法更长);臀腿类目标每周力量 ≤ 3 天时两次力量之间至少隔一天
// (这些分化每次都练臀腿,要 48 小时恢复)。没泳池的只对齐健身房日;经期模式下游泳日换成陆地轻量,不算分;对方「另有安排」的日子不对齐。
function partnerAlignOn(){return S.partnerAlign!==false&&!!_ppPaired()&&!_ppOff('plan');}
// 开着对齐、但这次对不了(对方关了「训练计划」;AI 排计划另外看对方许不许 AI 参考):排完的提示里说一句
function partnerAlignOffNote(ai){
const pp=_ppPaired();if(!pp||S.partnerAlign===false)return '';
if(_ppOff('plan'))return 'TA 没共享计划，这次没对齐';
if(ai&&pp.aiOk===false)return 'TA 没让 AI 参考 TA 的数据，这次没对齐';
return '';
}
function _alignRun(arr,pred,circ){let best=0,run=0;const n=arr.length,L=circ?n*2:n;for(let i=0;i<L;i++){if(pred(arr[i%n])){run++;if(run>best)best=run;}else run=0;}return Math.min(best,n);}
function _alignComb(n,k){const out=[],pre=[];const go=st=>{if(pre.length===k){out.push(pre.slice());return;}for(let i=st;i<n;i++){pre.push(i);go(i+1);pre.pop();}};go(0);return out;}
function _alignOpt(gymPerWeek){
return {swimOk:S.equip.includes('泳池')&&!S.periodMode,lowerBody:hasGoal('臀腿塑形')||hasGoal('女性曲线')||hasGoal('翘臀美背'),gymPerWeek};
}
// slots = [{date, base}] 可以挪的日子(base:0 休息 / 1 力量 / 2 游泳);fixedOn(日期) → 其余日子的类型(只用来数连续训练天数);
// pattern = 我每周的标准排法(定连续上限)。返回 {t:{日期:类型}, n 对齐天数, base 原排法对齐天数, blocked 为了恢复间隔没对上的天数, fb 其中按对方标准排法补的天数, pTrain 对方能对齐的训练日数}
function partnerAlignSolve(slots,fixedOn,pattern,opt){
opt=opt||{};
const gymWk=opt.gymPerWeek||pattern.filter(x=>x===1).length;
const capAny=Math.max(2,_alignRun(pattern,x=>x>0,true)),capGym=Math.max(opt.lowerBody&&gymWk<=3?1:2,_alignRun(pattern,x=>x===1,true));
const pk={};slots.forEach(s=>{pk[s.date]=partnerKindOn(s.date);});
const hit=(ds,ty)=>(ty===1&&pk[ds]==='g')||(ty===2&&opt.swimOk&&pk[ds]==='s')?1:0;
const weeks=new Map();
slots.forEach(s=>{const w=addDays(s.date,-_dow0(s.date));if(!weeks.has(w))weeks.set(w,[]);weeks.get(w).push(s);});
const solve=limited=>{
const t={};slots.forEach(s=>{t[s.date]=s.base;});
[...weeks.keys()].sort().forEach(w=>{
const F=weeks.get(w),n=F.length,nG=F.filter(s=>s.base===1).length,nS=F.filter(s=>s.base===2).length;
// 连续天数看这一周前后各一周:已经定了的周用新排法,还没定的用原排法,别的日子用 fixedOn
const seq=[];for(let i=-7;i<14;i++)seq.push(addDays(w,i));
const at=(ds,c)=>(c&&ds in c)?c[ds]:(ds in t)?t[ds]:fixedOn(ds);
const runs=c=>{const a=seq.map(ds=>at(ds,c));return [_alignRun(a,x=>x>0),_alignRun(a,x=>x===1)];};
const [b0,b1]=runs(null),okAny=Math.max(capAny,b0),okGym=Math.max(capGym,b1);
let best=null;
_alignComb(n,nG).forEach(gs=>{
const rest=[...Array(n).keys()].filter(i=>!gs.includes(i));
_alignComb(rest.length,nS).forEach(si=>{
const ss=si.map(i=>rest[i]),c={};
F.forEach((s,i)=>{c[s.date]=gs.includes(i)?1:ss.includes(i)?2:0;});
if(limited){const [r0,r1]=runs(c);if(r0>okAny||r1>okGym)return;}
let sc=0,ch=0;F.forEach(s=>{sc+=hit(s.date,c[s.date]);if(c[s.date]!==s.base)ch++;});
if(!best||sc>best.sc||(sc===best.sc&&ch<best.ch))best={sc,ch,c};
});
});
if(best)Object.assign(t,best.c);   // 原排法本身总在候选里,best 不会是空的
});
return t;
};
const t=solve(true),free=solve(false),cnt=x=>slots.reduce((a,s)=>a+hit(s.date,x[s.date]),0),b={};
slots.forEach(s=>{b[s.date]=s.base;});
const n=cnt(t);
return {t,n,base:cnt(b),blocked:Math.max(0,cnt(free)-n),fb:slots.filter(s=>hit(s.date,t[s.date])&&!_ppRealOn(s.date)).length,
pTrain:slots.filter(s=>pk[s.date]==='g'||(opt.swimOk&&pk[s.date]==='s')).length};
}
// 我自己某天(不在这次要挪的日子里)的类型,只用来数连续天数:过去看打卡记录,以后看计划;计划外的(end 之后)还没排,算空着
// (下次排的时候它前面这几天已经是打卡记录 / 计划,会照样按恢复间隔排,不用在这里替它占位;当成原排法会白白挡掉计划末尾的对齐)
function _alignFixed(ds,today,pattern,dayOf,end){
if(end&&ds>end)return 0;
if(ds<today){const l=LOG.find(x=>x.date===ds);return l?((l.isSwimDay||/游泳/.test(String(l.workout||'')))?2:1):0;}
const d=dayOf(ds);
if(d){const k=myDayKind(d);return k==='r'?0:(k==='g'||k==='p')?1:2;}
return pattern[_dow0(ds)];
}
let _lastPlanAlign=null;   // genPlan 最近一次的对齐结果(排完的提示用);没对齐 = null
// genPlan 用:这次新排的日子(今天及以后、不保留的)里按搭子挪训练日 → {t:{日期:0/1/2}, …};不对齐 → null(genPlan 照原排法,结果和没配对时一字不差)
function partnerAlignForGen(startDate,preserve,pattern,gymPerWeek){
_lastPlanAlign=null;
if(!partnerAlignOn())return null;
const today=todayStr(),slots=[];
for(let i=0;i<14;i++){const ds=addDays(startDate,i);if(!preserve[ds]&&ds>=today)slots.push({date:ds,base:pattern[_dow0(ds)]});}
if(!slots.length)return null;
const r=partnerAlignSolve(slots,ds=>_alignFixed(ds,today,pattern,x=>preserve[x]||null,addDays(startDate,13)),pattern,_alignOpt(gymPerWeek));
_lastPlanAlign=r;
return r;
}
// 排完 / 挪完的提示里那半句;r 不给 = genPlan 最近一次
function partnerAlignNote(r){
if(r===undefined)r=_lastPlanAlign;
if(!r)return '';
const nm=_ppName();
if(!r.pTrain)return `${nm}这两周没有能一起练的日子`;
if(!r.n)return `这两周没能和${nm}排在同一天`+(r.blocked?'（为了恢复间隔）':'');
return `和${nm}同一天同类 ${r.n} 天`+(r.blocked?`，${r.blocked} 天为了恢复间隔没对上`:'')+(r.fb&&r.fb===r.n&&+(_ppPaired()||{}).days?`（${nm}的计划没覆盖到，按 TA 每周 ${+_ppPaired().days} 天的排法对的）`:'');
}
function planAlignSuffix(){const t=partnerAlignNote()||partnerAlignOffNote();return t?' · '+t:'';}
// AI 排计划(coach.js coachPlan)带上的对齐信息:搭子这几天练什么(guess = 对方计划没覆盖、按 TA 每周天数的标准排法猜的)、两边有没有泳池。
// 规则写在后端 PLAN_SYS(和上面 partnerAlignSolve 同一套);不对齐 → null
const _KIND_AI={g:'健身房',s:'游泳',r:'休息',p:'另有安排',x:'别的安排'};
function partnerAlignForAI(dates){
if(!partnerAlignOn())return null;
const pp=_ppPaired();
if(pp.aiOk===false)return null;   // 对方关了「允许 TA 的 AI 教练参考我的数据」:搭子的安排也不发给 AI
const days=(dates||[]).map(ds=>{const k=partnerKindOn(ds);return {date:ds,partner:k?_KIND_AI[k]:'不知道',...(k&&!_ppRealOn(ds)?{guess:true}:{})};});
return {name:_ppName(),partnerDaysPerWeek:+pp.days||null,partnerPool:!!pp.hasPool,myPool:S.equip.includes('泳池'),periodMode:!!S.periodMode,days};
}
// 一份计划(AI 草稿)里有几天和搭子同一天同类
function partnerAlignCount(days){
const swimOk=S.equip.includes('泳池')&&!S.periodMode,nm=_ppName();
let n=0,pt=0,mine=0;
(days||[]).forEach(d=>{
const pk=partnerKindOn(d.date),mk=myDayKind(d);
if(pk==='g'||(swimOk&&pk==='s'))pt++;
if(mk==='g'||mk==='s')mine++;
if((mk==='g'&&pk==='g')||(swimOk&&mk==='s'&&pk==='s'))n++;
});
return {n,of:pt,mine,text:pt?`和${nm}同一天同类 ${n} 天（这几天${nm}练 ${pt} 天，你排了 ${mine} 个训练日）`:`${nm}这几天没有能一起练的日子`};
}

// ── 「对齐搭子的训练日」:把我接下来(今天之后、没锁、没开练、没打卡、不是私密日)的训练日挪到和搭子对齐 ──
// 只在这些天之间换内容(像周历拖拽换天:整天的动作 / 类型 / 按日期存的勾选、重量、组次一起走),每个自然周里同类的内容按原来的先后落到新位置,
// 分化顺序不乱、每周天数不变。先预览,点采纳才改;采纳前存快照能撤销(只留最近一次,存本机);撤销时已经开练、打卡或又改过的天不回滚。
const ALIGN_STORE='fit_align1';
let _alignDraft=null;
function _alignLoad(){try{return JSON.parse(localStorage.getItem(nsKey(ALIGN_STORE)))||null;}catch(e){return null;}}
function _alignSave(v){try{if(v)localStorage.setItem(nsKey(ALIGN_STORE),JSON.stringify(v));else localStorage.removeItem(nsKey(ALIGN_STORE));}catch(e){}}
function _alignMovable(d,today){return !!d&&d.date>today&&!isLocked(d)&&!d.isPrivateDay&&!isDone(d)&&!LOG.some(l=>l.date===d.date)&&!Object.values(S.prog[d.date]||{}).some(Boolean);}
function _alignDayLabel(d){const k=myDayKind(d);return k==='r'?'休息':k==='s'?'游泳':String(d.workoutType||'训练');}
const _KIND_ZH={g:'健身房',s:'游泳',r:'休息',p:'另有安排',x:'轻量'};
function partnerAlignReady(){return !!(_ppPaired()&&!_ppOff('plan')&&S.plan&&S.plan.days&&S.plan.days.length);}
// 算一份预览:{at, moves:[[原日期, 新日期]], rows:[{date, was, now, pk}], r};没有能挪的天 → {none:'原因'}
function partnerAlignDraftCalc(){
if(_ppOff('plan'))return {none:'TA 没共享计划，没法对齐'};
if(!partnerAlignReady())return {none:'先和搭子连上、有了计划才能对齐'};
const today=todayStr(),days=S.plan.days.filter(d=>_alignMovable(d,today));
if(!days.length)return {none:'接下来没有能挪的天（已经开练、打卡或锁定的不动）'};
const typ=d=>{const k=myDayKind(d);return k==='r'?0:k==='g'?1:2;};   // 轻量替代占游泳日的位置
const slots=days.map(d=>({date:d.date,base:typ(d)})),pattern=weekdayPlanTypes(S.days);
const sp=S.equip.includes('泳池')?(SWIM_SPLIT[S.days]||{gym:Math.max(2,S.days-1)}):{gym:S.days};
const dayOf=ds=>S.plan.days.find(x=>x.date===ds)||null;
const r=partnerAlignSolve(slots,ds=>_alignFixed(ds,today,pattern,dayOf,S.plan.days[S.plan.days.length-1].date),pattern,_alignOpt(sp.gym));
// 每周里同类的内容按日期先后对到新位置
const wk={};slots.forEach(s=>{const w=addDays(s.date,-_dow0(s.date));(wk[w]=wk[w]||[]).push(s);});
const moves=[];
Object.values(wk).forEach(F=>[0,1,2].forEach(ty=>{
const src=F.filter(s=>s.base===ty).map(s=>s.date).sort(),dst=F.filter(s=>r.t[s.date]===ty).map(s=>s.date).sort();
src.forEach((a,i)=>{if(dst[i]&&dst[i]!==a)moves.push([a,dst[i]]);});
}));
moves.sort((a,b)=>a[1].localeCompare(b[1]));
const rows=moves.map(([a,b])=>({date:b,was:_alignDayLabel(dayOf(b)),now:_alignDayLabel(dayOf(a)),pk:partnerKindOn(b)}));
return {at:today,moves,rows,r};
}
function partnerAlignPreview(){
const dr=partnerAlignDraftCalc();
if(dr.none){_alignDraft=null;showToast(dr.none);}
else if(!dr.moves.length){_alignDraft=null;showToast(dr.r.n?`已经对齐了：${partnerAlignNote(dr.r)}，不用挪`:(partnerAlignNote(dr.r)||'没有能挪的'));}
else _alignDraft=dr;
if(typeof uiRenderP2==='function')uiRenderP2();
}
function partnerAlignDrop(){_alignDraft=null;if(typeof uiRenderP2==='function')uiRenderP2();}
function partnerAlignApply(){
const dr=_alignDraft;if(!dr)return;
// 采纳前按现在的计划重算一遍:预览之后可能已经开练 / 打卡 / 换了搭子的计划
const now=partnerAlignDraftCalc();
if(now.none||JSON.stringify(now.moves)!==JSON.stringify(dr.moves)){_alignDraft=now.none||!now.moves.length?null:now;if(typeof uiRenderP2==='function')uiRenderP2();showToast(now.none||(now.moves.length?'计划刚变过，按现在的重新预览了一遍':'现在已经对齐了，不用挪'));return;}
const idx=ds=>S.plan.days.findIndex(x=>x.date===ds);
const pick=(o,ds)=>Object.fromEntries(Object.entries(o||{}).filter(([k])=>k.startsWith(ds+'-')).map(([k,v])=>[k.slice(ds.length+1),v]));
const dates=[...new Set(dr.moves.flat())],snap={days:{},st:{}};
dates.forEach(ds=>{snap.days[ds]=JSON.parse(JSON.stringify(S.plan.days[idx(ds)]));snap.st[ds]={prog:S.prog[ds]?{...S.prog[ds]}:null,weights:pick(S.weights,ds),adj:pick(S.adj,ds),exRpe:pick(S.exRpe,ds)};});
const putSt=(ds,st)=>{
if(st.prog)S.prog[ds]={...st.prog};else delete S.prog[ds];
['weights','adj','exRpe'].forEach(k=>{S[k]=S[k]||{};Object.keys(S[k]).forEach(x=>{if(x.startsWith(ds+'-'))delete S[k][x];});Object.entries(st[k]||{}).forEach(([x,v])=>{S[k][ds+'-'+x]=v;});});
};
dr.moves.forEach(([a,b])=>{S.plan.days[idx(b)]={...JSON.parse(JSON.stringify(snap.days[a])),date:b};putSt(b,snap.st[a]);});
const after={};dates.forEach(ds=>{after[ds]=JSON.stringify(S.plan.days[idx(ds)]);});
_alignSave({at:dr.at,moves:dr.moves,snap,after,note:partnerAlignNote(dr.r)});
_alignDraft=null;
saveState();render();if(typeof uiRenderP2==='function')uiRenderP2();
showToast(`挪了 ${dr.moves.length} 天 · ${partnerAlignNote(dr.r)}`);
}
// 撤销按「换位圈」整圈回滚(a→b→c→a 三天一起换的,只回滚其中一天会一天两份、丢一份):圈里有一天已经开练 / 打卡 / 又改过,这一圈就不动
function _alignCycles(moves){
const to=new Map(moves),seen=new Set(),out=[];
moves.forEach(([a])=>{if(seen.has(a))return;const c=[];let x=a;while(x!==undefined&&!seen.has(x)){seen.add(x);c.push(x);x=to.get(x);}out.push(c);});
return out;
}
function _alignOkToUndo(st,ds){
const i=S.plan&&S.plan.days?S.plan.days.findIndex(x=>x.date===ds):-1;
return i>=0&&ds>todayStr()&&!LOG.some(l=>l.date===ds)&&JSON.stringify(S.plan.days[i])===st.after[ds]&&!Object.values(S.prog[ds]||{}).some(Boolean);
}
// 还能撤销的天数(0 = 撤销那一行不用再显示)
function partnerAlignUndoable(){
const st=_alignLoad();if(!st||!st.moves||!st.snap)return 0;
return _alignCycles(st.moves).filter(c=>c.every(ds=>_alignOkToUndo(st,ds))).reduce((a,c)=>a+c.length,0);
}
function partnerAlignUndo(){
const st=_alignLoad();if(!st||!st.snap)return;
let back=0,kept=0;
_alignCycles(st.moves).forEach(c=>{
if(!c.every(ds=>_alignOkToUndo(st,ds))){kept+=c.length;return;}
c.forEach(ds=>{
const i=S.plan.days.findIndex(x=>x.date===ds),s0=st.snap.st[ds]||{};
S.plan.days[i]=st.snap.days[ds];
if(s0.prog)S.prog[ds]={...s0.prog};else delete S.prog[ds];
['weights','adj','exRpe'].forEach(k=>{S[k]=S[k]||{};Object.keys(S[k]).forEach(x=>{if(x.startsWith(ds+'-'))delete S[k][x];});Object.entries(s0[k]||{}).forEach(([x,v])=>{S[k][ds+'-'+x]=v;});});
back++;
});
});
_alignSave(null);
saveState();render();if(typeof uiRenderP2==='function')uiRenderP2();
showToast(kept?`已撤销 · ${kept} 天已经开练、打卡或又改过，没回滚`:'已撤销，回到对齐前');
}

// ══ Tabs ═══ showTab 在 ui.js(底部导航、页签 aria、刊头) ══

// ══ Journal / Log — Git-style timeline ═══════════════════
function toggleLogHistory(){_logShowAll=!_logShowAll;renderLog()}

let _logOpen=null; // 展开的那条(日期)
function toggleLogRow(date){ _logOpen=_logOpen===date?null:date; renderLog(); }
function renderLog(){
const btn=document.getElementById('jrnl-toggle');
if(btn)btn.textContent=_logShowAll?'只看近 14 天':`显示全部（${LOG.length}）`;
const el=document.getElementById('log-list');
if(!el)return;
const cut=new Date();cut.setDate(cut.getDate()-14);const cutStr=(typeof dateStr==='function')?dateStr(cut):cut.toISOString().split('T')[0];
const entries=(_logShowAll?LOG:LOG.filter(x=>x.date>=cutStr)).slice().sort((a,b)=>b.date.localeCompare(a.date));
if(!entries.length){el.innerHTML=`<div class="note-line" style="padding:12px 0">${LOG.length?'近 14 天没有打卡，点上面「显示全部」看更早的。':'— 完成训练后自动记在这里。'}</div>`;return}
let html='',lastMonth='';
entries.forEach(x=>{
const m=x.date.slice(0,7);
if(m!==lastMonth&&_logShowAll){lastMonth=m;const[y,mo]=m.split('-');html+=`<div class="log-month">${y} · ${String(parseInt(mo)).padStart(2,'0')}</div>`;}
const logIdx=LOG.indexOf(x);
const open=_logOpen===x.date;
html+=skinTpl('logRow',{x,open},()=>`<button type="button" class="log-row" aria-expanded="${open}" onclick="toggleLogRow('${x.date}')"><span><span class="lw">${_escHtml(x.workout||'训练')}</span><span class="lt">${x.date.slice(5).replace('-','/')} · ${x.duration||'?'} min${wkLogMin(x)?' · 用时 '+wkLogMin(x)+' min':''} · ${x.exerciseCount||0} 个动作${x.mood?' · '+_escHtml(x.mood):''}</span></span><span class="lr">${x.rpe?'RPE '+x.rpe:'—'}</span></button>`);
if(typeof ptLogRxHtml==='function')html+=ptLogRxHtml(x.date);   // 搭子对这次打卡的回应(没有就是空串)
if(open){
html+=`<div class="log-detail"><div class="jentry-chips">${x.exercises?x.exercises.map(e=>`<span class="jchip${e.done===false?' undone':''}">${e.name}${e.weight?` ${e.weight}kg`:''}</span>`).join(''):''}</div>`
+(x.note?`<div class="jentry-note">"${_escHtml(x.note)}"</div>`:'')
+`<div class="log-actions"><button class="btn-line" onclick="showHistoryDetail('${x.date}')">详情</button><button class="btn-line" onclick="editLog(${logIdx})">编辑</button><button class="btn-line" onclick="shareWorkoutFromIndex(${logIdx})">分享</button><button class="btn-line accent" onclick="delLog(${logIdx})">删除</button></div></div>`;
}
});
el.innerHTML=html;
}

function delLog(idx){
if(!confirm('确定删除这条记录？'))return;
const logEntry = LOG[idx];
LOG.splice(idx,1);
_syncTombAdd('log',logEntry.date);   // 还没推上去之前开机合并云端,别把云端那条再并回来
ls(K.log,LOG);
const dateHasOtherLogs = LOG.some(entry => entry.date === logEntry.date);
if (!dateHasOtherLogs && S.prog[logEntry.date]) {
    delete S.prog[logEntry.date];
}
// Achievement counts/milestones are derived from LOG; recompute or they stay inflated until reload.
if (typeof rebuildAchievementsFromLogs === 'function') rebuildAchievementsFromLogs();
// Drop weight history & PRs recorded on that date (unless another log still covers it),
// so deleted lifts stop feeding the "上次kg" suggestion and PR list.
if (!dateHasOtherLogs) {
    Object.keys(W_HIST).forEach(n => { W_HIST[n] = W_HIST[n].filter(h => h.date !== logEntry.date); if (!W_HIST[n].length) delete W_HIST[n]; });
    ls(K.wh, W_HIST);
    if (PR_LIST.some(p => p.date === logEntry.date)) { PR_LIST = PR_LIST.filter(p => p.date !== logEntry.date); ls(K.pr, PR_LIST); }
}
saveState();
renderLog();
if(typeof render === 'function') render();
if(typeof renderStats === 'function') renderStats();
}

// force=true:「我 → 07」已经点过两次确认,不再弹 confirm;直接调用(不带参数)仍弹 confirm
async function clearAllData(force) {
if(force===true||confirm('警告：确定要清空所有计划、打卡记录和统计数据吗？此操作不可恢复！（包括云端数据）')){
    // 1. Stop realtime sync so cloud data doesn't flood back
    if(_unsub){_unsub();_unsub=null}
    // 2. Delete cloud data if logged in
    if(_db && _user){
        // 搭子能看到的 shared/profile 是子文档,删父文档不会连带删它 → 单独删,否则搭子还看得到旧状态
        try{ await _db.collection('users').doc(_user.uid).collection('shared').doc('profile').delete(); }catch(e){ console.warn('Shared profile clear failed:',e); }
        try{ await _db.collection('users').doc(_user.uid).delete(); }catch(e){ console.warn('Cloud clear failed:',e); }
    }
    // 3. Clear local (including weight history) using nsKey
    Object.values(K).forEach(key => localStorage.removeItem(nsKey(key)));
    localStorage.removeItem(nsKey('fit_selDate'));
    // Reset in-memory globals too — don't rely solely on reload (logs, history, achievements, plan progress).
    LOG.length=0;
    W_HIST={};
    PR_LIST=[];
    BODY_LOG=[];
    GYM_LOG={count:0,milestones:[]};
    SWIM_LOG={count:0,milestones:[]};
    S.plan=null; S.prog={}; S.adj={}; S.weights={}; S.exRpe={}; S.unlockedDates=[]; S.volumeMultiplier=1.0; S.selDate=null;
    // 4. Force state save so local variables are reset
    saveState();location.reload();
}
}

// ══ Body metrics (体重/围度 — 体型进度, 腰臀比 WHR) ════════
function logVacuum(){
  const t=todayStr(); if(!S.vacuumDays)S.vacuumDays=[];
  if(S.vacuumDays.includes(t)){if(typeof showToast==='function')showToast('今天已打卡');return;}
  S.vacuumDays.push(t); if(S.vacuumDays.length>400)S.vacuumDays=S.vacuumDays.slice(-400);
  saveState(); if(typeof showToast==='function')showToast('真空吸已打卡'); if(typeof renderStats==='function')renderStats();
}
// ══ 围度字段(2026-08-27 扩到 10 项) ═════════════════════
// core:true 的 4 项常显,其余收在"更多围度"里。better = 往哪个方向走算好。
// 量法写在 tip 里 —— 每次量的位置不一样,数字就是噪声。
const BODY_FIELDS=[
  {k:'weight',lbl:'体重',u:'kg',better:null,core:true,tip:'固定早起空腹、同一台秤'},
  {k:'waist',lbl:'腰围',u:'cm',better:'down',core:true,tip:'最细处(肋下与髂嵴之间),正常呼气末、别收腹'},
  {k:'hip',lbl:'臀围',u:'cm',better:'up',core:true,tip:'臀部最丰满处水平一圈,脚并拢'},
  {k:'thigh',lbl:'大腿围',u:'cm',better:'up',core:true,tip:'大腿中段,双脚与髋同宽站立'},
  {k:'bust',lbl:'胸围',u:'cm',better:'up',core:false,tip:'乳点水平一圈,软尺不勒'},
  {k:'hipw',lbl:'胯宽',u:'cm',better:'up',core:false,tip:'正面站直,两侧大转子(髋部最外突点)之间的横向宽度——不是围度'},
  {k:'lowab',lbl:'下腹',u:'cm',better:'down',core:false,tip:'脐下 5cm 水平一圈,低腰线那一圈'},
  {k:'upthigh',lbl:'大腿根',u:'cm',better:'up',core:false,tip:'紧贴臀褶下方最粗处'},
  {k:'calf',lbl:'小腿',u:'cm',better:null,core:false,tip:'小腿最粗处'},
  {k:'ankle',lbl:'脚踝',u:'cm',better:'down',core:false,tip:'踝骨上方最细处'},
];
const BODY_KEYS=BODY_FIELDS.map(f=>f.k);
function logBody(){
  const g=id=>{const el=document.getElementById(id);if(!el)return null;const v=parseFloat(el.value);return isFinite(v)&&v>0?Math.round(v*10)/10:null;};
  const e={date:todayStr()}; BODY_KEYS.forEach(k=>{e[k]=g('b-'+k)});
  if(BODY_KEYS.every(k=>e[k]==null)){showToast('请至少填写一项');return;}
  const i=BODY_LOG.findIndex(x=>x.date===e.date);
  if(i>=0){BODY_KEYS.forEach(k=>{if(e[k]!=null)BODY_LOG[i][k]=e[k];});}
  else BODY_LOG.push(e);
  BODY_LOG.sort((a,b)=>a.date.localeCompare(b.date));
  ls(K.body,BODY_LOG);
  showToast('已记录身体数据');
  if(typeof renderStats==='function')renderStats();
}
function delBody(date){
  if(!confirm('删除 '+date+' 的身体记录？'))return;
  BODY_LOG=BODY_LOG.filter(x=>x.date!==date);
  _syncTombAdd('body',date);
  ls(K.body,BODY_LOG);
  if(typeof renderStats==='function')renderStats();
}
function _bodyLbl(k,fallback){
  // 扩展模式:标签可由 owner 私有包覆盖;取不到就用默认
  try{
    if(typeof _xMode!=='undefined'&&_xMode&&typeof _ownerSession==='function'&&_ownerSession()&&typeof _xDb==='function'){
      const bl=(_xDb()||{}).body_labels||{};
      if(bl[k]){const v=decodeURIComponent(atob(bl[k]));if(v)return v;}
    }
  }catch(e){}
  return fallback;
}
function renderBodyPanel(){
  const latest=BODY_LOG.length?BODY_LOG[BODY_LOG.length-1]:{};
  const L=k=>_bodyLbl(k,(BODY_FIELDS.find(f=>f.k===k)||{}).lbl||k);
  const fld=f=>`<label title="${f.tip}">${L(f.k)} <span class="faint">${f.u}</span><input id="b-${f.k}" type="number" inputmode="decimal" step="0.1" value="${latest[f.k]!=null?latest[f.k]:''}" aria-label="${L(f.k)}（${f.u}）"></label>`;
  const core=BODY_FIELDS.filter(f=>f.core).map(fld).join('');
  const more=BODY_FIELDS.filter(f=>!f.core).map(fld).join('');

  // ── 比例:体型是比例说了算,不是单个数字 ──
  const ratio=(label,cur,fmt,delta,better,note)=>{
    if(cur==null)return '';
    const good=delta==null?null:(better==='down'?delta<0:delta>0);
    const col=good===true?'var(--olive)':good===false?'var(--accent)':'var(--faint)';
    return `<span class="k">${label}</span><span>${fmt(cur)}${delta!=null?` <span style="color:${col}">${delta>0?'+':''}${fmt(delta)}</span>`:''}${note?` <span class="faint">· ${note}</span>`:''}</span>`;
  };
  const pair=(a,b,f)=>{ // 取首尾两次都量全的记录,算比例的变化
    const pts=BODY_LOG.filter(x=>x[a]!=null&&(b==null||x[b]!=null));
    if(!pts.length)return [null,null];
    const cur=f(pts[pts.length-1]),first=f(pts[0]);
    return [cur,pts.length>1?cur-first:null];
  };
  const [whr,whrD]=pair('waist','hip',x=>x.waist/x.hip);
  const [hwd,hwdD]=pair('waist','hip',x=>x.hip-x.waist);
  const [bwd,bwdD]=pair('bust','waist',x=>x.bust-x.waist);
  const [tw,twD]=pair('thigh','waist',x=>x.thigh/x.waist);
  const [hw,hwD]=pair('hipw',null,x=>x.hipw);
  const r2=v=>Math.round(v*100)/100, r1=v=>Math.round(v*10)/10;
  let ratios=[
    ratio('腰臀比',whr,r2,whrD,'down','目标 0.70，越低越沙漏'),
    ratio('臀腰差',hwd,r1,hwdD,'up','cm，越大轮廓越明显'),
    ratio('胸腰差',bwd,r1,bwdD,'up','cm'),
    ratio('大腿 / 腰',tw,r2,twD,'up','大腿相对腰的丰满度'),
    ratio('胯宽',hw,r1,hwD,'up','cm，臀中肌撑出来的横向宽度'),
  ].filter(Boolean).join('');
  let whrNote='';
  if(whr!=null){
    const gap=Math.round((whr-0.70)*100)/100;
    whrNote=`<div class="foot-note">${gap<=0?'WHR 已经到 0.70 以下了，沙漏线成立，继续保持。':`离 0.70 还差 ${gap}，走臀围往上、腰围往下两头夹，别靠掉秤。`}</div>`;
  }
  const spark=f=>{
    const pts=BODY_LOG.filter(x=>x[f.k]!=null);
    if(pts.length<2)return '';
    const vals=pts.map(x=>x[f.k]),mn=Math.min(...vals),mx=Math.max(...vals),rg=mx-mn||1;
    const last=vals[vals.length-1],delta=Math.round((last-vals[0])*10)/10;
    const good=f.better==='down'?delta<0:f.better==='up'?delta>0:null;
    const col=good===true?'var(--olive)':good===false?'var(--accent)':'var(--faint)';
    return `<div style="display:flex;flex-direction:column;gap:4px"><div class="note-line" style="display:flex;justify-content:space-between"><span>${L(f.k)}</span><span style="color:${col}">${delta>0?'+':''}${delta}${f.u} · 现 ${last}${f.u}</span></div><div class="spark">${pts.slice(-14).map(p=>`<i style="height:${(p[f.k]-mn)/rg*70+30}%" title="${p.date}: ${p[f.k]}${f.u}"></i>`).join('')}</div></div>`;
  };
  const charts=BODY_FIELDS.map(spark).join('');
  const vac=(()=>{const d=S.vacuumDays||[],t=todayStr();let st=0;for(let i=0;i<400;i++){const ds=addDays(t,-i);if(d.includes(ds))st++;else if(i>0)break;}const dn=d.includes(t);
    return skinTpl('bodyVac',{st,n:d.length,dn},()=>`<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:center;border-top:1px dashed var(--line);padding-top:8px"><span><span style="display:block">真空吸收腰打卡</span><span class="foot-note">连续 ${st} 天 · 累计 ${d.length} 次</span></span><button type="button" class="btn-line" onclick="logVacuum()"${dn?' aria-disabled="true" style="opacity:.5"':''}>${dn?'今日已打 ✓':'今日打卡'}</button></div>`);})();
  const hist=BODY_LOG.length?skinTpl('bodyHist',{L},()=>`<details class="fold"><summary>历史记录（${BODY_LOG.length}）</summary><div>${[...BODY_LOG].reverse().slice(0,40).map(x=>`<div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;column-gap:8px;align-items:center;border-bottom:1px dashed var(--line)" class="note-line"><span>${x.date}</span><span class="faint" style="text-align:right">${BODY_FIELDS.filter(f=>x[f.k]!=null).map(f=>(f.k==='weight'?x.weight+'kg':L(f.k).slice(0,2)+x[f.k])).join(' · ')}</span><button type="button" class="link-btn accent" style="text-align:center" onclick="delBody('${x.date}')" aria-label="删除 ${x.date} 的记录">删除</button></div>`).join('')}</div></details>`):'';
  const title=_bodyLbl('panel_title','身体记录');
  return skinTpl('bodyPanel',{title,core,more,vac,ratios,whrNote,charts,hist},()=>`<div class="panel" id="body-panel"><p class="panel-title">${title} · 体型才是真正的进度</p>
<div class="body-grid">${core}</div>
<details class="fold"><summary>更多围度（胸 / 胯宽 / 下腹 / 大腿根 / 小腿 / 脚踝）</summary><div class="body-grid">${more}</div><div class="foot-note">每项都有量法提示（长按 / 悬停标签）。位置固定住，数字才有意义。</div></details>
<button type="button" class="btn-outline" style="min-height:48px;font-size:14px" onclick="logBody()">保存今日数据</button>${vac}
${ratios?`<div class="kv wide">${ratios}</div>${whrNote}`:''}${charts}${hist}</div>`);
}

// ══ 曲线焦点面板(2026-08-27) ═══════════════════════════════
// 左边:这 4 周每个承重点练了多少组 / 目标多少。右边:对应围度往哪个方向走。
// 练量够但尺寸不动 = 吃不够或该加重;尺寸动但练量少 = 别的因素,别归功于训练。
function renderCurvePanel(){
  if(typeof curveFocusStats!=='function')return '';
  if(!hasGoal('女性曲线'))return ''; // 这些承重点(胯宽/臀峰/细腰…)只对「女性曲线」目标有意义
  const st=curveFocusStats(4);
  const total=st.reduce((a,f)=>a+f.sets,0);
  const weak=[...st].sort((a,b)=>a.pct-b.pct)[0];
  const rows=st.map(f=>{
    const good=f.trend==null?null:(f.dir==='up'?f.trend>0:f.dir==='down'?f.trend<0:null);
    const tcol=good===true?'var(--olive)':good===false?'var(--accent)':'var(--faint)';
    const trend=f.trend!=null?` <span style="color:${tcol}">${f.trend>0?'+':''}${f.trend}cm</span>`:(f.metric?' <span class="faint">没量</span>':'');
    return `<div style="display:flex;flex-direction:column;gap:2px"><div class="note-line" style="display:flex;justify-content:space-between;gap:8px;color:var(--ink)"><span>${f.name}</span><span class="faint">${f.sets}/${f.target} 组${trend}</span></div><div class="ascii" style="line-height:1.3">${_asciiBar(f.pct/100,16)} <span class="faint">${f.pct}%</span></div><div class="foot-note">${f.why}</div></div>`;
  }).join('');
  const hint=total===0
    ? '还没有打卡数据，练几次之后这里就会告诉你哪个点在掉队。'
    : `最弱的一条是<b style="color:var(--accent);font-weight:400">${weak.name}</b>(${weak.sets}/${weak.target} 组)。${(typeof _ownerSession==='function'&&_ownerSession())?'下次生成计划时我会往这边加,你也可以':'可以'}直接在计划里手动添加动作补上。`; // 自动补弱(_appendWeakFocus)只对 owner 开,别给别人许兑现不了的承诺
  return skinTpl('logCurve',{st,hint},()=>`<div class="panel" id="curve-panel"><p class="panel-title">曲线焦点 · 近 4 周练了多少 vs 尺寸往哪走</p>
${rows}<div class="hint quote-rule">${hint}</div></div>`);
}

// ══ Stats ════════════════════════════════════════════════
function _asciiBar(frac,width){ const w=width||10, n=Math.max(0,Math.min(w,Math.round((frac||0)*w))); return '█'.repeat(n)+'░'.repeat(w-n); }
const _GRP_NAMES={chest:'胸',shoulder:'肩',back:'背',biceps:'二头',triceps:'三头',quads:'股四头',hamglutes:'臀腿',glutemed:'臀中肌',calves:'小腿',core:'核心',cardio:'有氧',warmup:'热身',stretch:'拉伸',posture:'仪态',swim_upper:'游泳(上肢)',swim_lower:'游泳(下肢)',swim_core:'游泳(核心)',swim_cardio:'游泳(心肺)'};
function _isoWeekOf(ds){ return (typeof _uiIsoWeek==='function')?_uiIsoWeek(ds):0; }
function renderStats(){
const el=document.getElementById('stats-content');
if(!el)return;
const tStr = todayStr();
const thisMonth = tStr.slice(0, 7);

// Streak
const logDates=new Set(LOG.map(l=>l.date));
let streak=0;
for(let i=0;i<365;i++){
const ds=addDays(tStr,-i);
if(logDates.has(ds))streak++;
else if(i>0)break;
}

// Month stats
const monthLogs=LOG.filter(l=>l.date.startsWith(thisMonth));
const t7str=addDays(tStr,-6); // -6 + 双闭区间 = 7 天窗口(原 -7 是 8 天)
const weekDays=S.plan?S.plan.days.filter(d=>(!d.isRest||d.isMissed)&&d.date>=t7str&&d.date<=tStr):[]; // 没练(已顺延)的标记日算没练的训练日,别当休息日
const weekDone=weekDays.filter(d=>LOG.some(l=>l.date===d.date)).length; // 与"本月训练天/连续天数"口径一致:以已打卡(LOG)为准,而非勾满即算
const weekTotal=weekDays.length;
const weekPct=weekTotal?Math.round(weekDone/weekTotal*100):0;
const monthPR=PR_LIST.filter(p=>p.date&&p.date.startsWith(thisMonth)).length;
const rpeLogs=monthLogs.filter(l=>l.rpe);
const avgRpe=rpeLogs.length?Math.round(rpeLogs.reduce((s,l)=>s+l.rpe,0)/rpeLogs.length*10)/10:'—';

// 训练量 · 近四周(按自然周,数完成了的组)
const weeks=[];
for(let w=3;w>=0;w--){
  const end=addDays(tStr,-7*w), start=addDays(end,-6);
  const ls=LOG.filter(l=>l.date>=start&&l.date<=end);
  const sets=ls.reduce((s,l)=>s+(l.exercises||[]).filter(e=>e.done!==false).reduce((a,e)=>a+(+e.sets||1),0),0);
  weeks.push({w:'W'+String(_isoWeekOf(end)).padStart(2,'0'),sets,n:ls.length});
}
const maxW=Math.max(1,...weeks.map(x=>x.sets));

// 12-week heat(只看不点:格子做不到 44px;当天详情从日志进)
const DOW=['MO','TU','WE','TH','FR','SA','SU'];
const start=addDays(tStr,-83);
const startDow=(new Date(start+'T12:00:00').getDay()+6)%7;
const gridStart=addDays(start,-startDow);
const heatRows=DOW.map((lbl,r)=>{
  let line=`<span class="faint">${lbl}</span> `;
  for(let c=0;c<13;c++){
    const ds=addDays(gridStart,c*7+r);
    if(ds>tStr||ds<start){line+='  ';continue;}
    line+=ds===tStr?`<span class="td">${logDates.has(ds)?'■':'□'}</span> `:logDates.has(ds)?`<span class="on">■</span> `:`<span class="off">·</span> `;
  }
  return line;
}).join('\n');

// Muscle distribution
const dist={};
LOG.filter(l=>l.date>=addDays(tStr,-60)).forEach(l=>{ // 近60「天」(原 slice(-60) 是最近60「条」)
if(l.exercises)l.exercises.forEach(ex=>{
for(const[grp,exs]of Object.entries(DB)){
const foundEx = exs.find(e=>e.n===ex.name);
if(foundEx){
if(grp==='swimming'){
(foundEx.muscle||[]).forEach(m=>{
if(m==='上肢') dist['swim_upper']=(dist['swim_upper']||0)+1;
else if(m==='下肢') dist['swim_lower']=(dist['swim_lower']||0)+1;
else if(m==='核心') dist['swim_core']=(dist['swim_core']||0)+1;
else if(m==='心肺') dist['swim_cardio']=(dist['swim_cardio']||0)+1;
else if(m==='全身'){['swim_upper','swim_lower','swim_core','swim_cardio'].forEach(k=>dist[k]=(dist[k]||0)+1);}
});
} else if(grp!=='warmup'&&grp!=='stretch'){
dist[grp]=(dist[grp]||0)+1;
}
break;
}
}
});
});
const distEntries=Object.entries(dist).sort((a,b)=>b[1]-a[1]);
const maxDist=distEntries[0]?.[1]||1;

const ascRow=(k,bar,v)=>`<div style="display:grid;grid-template-columns:76px minmax(0,1fr) auto;column-gap:8px;align-items:baseline" class="note-line"><span class="faint">${k}</span><span class="ascii" style="line-height:1.6;overflow:hidden">${bar}</span><span>${v}</span></div>`;

const top=skinTpl('logTop',{monthLogs,weekPct,weekDone,weekTotal,streak,weeks,maxW,monthPR,avgRpe},()=>`<div class="bignums">
<div><span class="bignum">${monthLogs.length}</span><span class="biglbl">本月次数</span></div>
<div><span class="bignum">${weekPct}<small>%</small></span><span class="biglbl">本周完成率 · ${weekDone}/${weekTotal}</span></div>
<div><span class="bignum">${streak}</span><span class="biglbl">连续打卡天数</span></div>
</div>
<div class="panel" id="vol-panel"><p class="panel-title">训练量 · 近四周</p>
${weeks.map(x=>ascRow(x.w,_asciiBar(x.sets/maxW,10),`${String(x.sets).padStart(2,' ')} 组`)).join('')}
</div>
<div class="panel" id="month-panel"><p class="panel-title">本月</p>
<div class="kv wide"><span class="k">训练天</span><span>${monthLogs.length}</span>
<span class="k">完成动作</span><span>${monthLogs.reduce((s,l)=>s+(l.exerciseCount||0),0)}</span>
<span class="k">总分钟</span><span>${monthLogs.reduce((s,l)=>s+(l.duration||0),0)}</span>
<span class="k">力量训练</span><span>${monthLogs.filter(l=>l.exercises&&l.exercises.some(e=>e.unit!=='分钟')).length} 次</span>
<span class="k">有氧分钟</span><span>${monthLogs.reduce((s,l)=>s+(l.exercises?l.exercises.filter(e=>e.unit==='分钟').reduce((a,e)=>a+e.reps,0):0),0)}</span>
<span class="k">平均 RPE</span><span>${avgRpe}</span>
<span class="k">新纪录</span><span>${monthPR}</span></div>
<div class="ascii" style="line-height:1.4"><span class="k">本周 </span>${_asciiBar(weekPct/100,16)} ${weekPct}%</div>
</div>`);

const heat=skinTpl('logHeat',{tStr,start,gridStart,logDates},()=>`<div class="panel" id="heat-panel"><p class="panel-title">近 12 周 · 有打卡的天</p><div class="heat" aria-label="近 12 周训练热图，■ 表示当天有打卡">${heatRows}</div><div class="foot-note">■ 练了　· 没练　□ 今天。看某天的详情，在上面的日志里点开。</div></div>`);

const distHtml=distEntries.length?skinTpl('logDist',{distEntries,maxDist},()=>`<div class="panel" id="dist-panel"><p class="panel-title">肌群训练量 · 近 60 天</p>${distEntries.map(([g,c])=>ascRow(_GRP_NAMES[g]||g,_asciiBar(c/maxDist,12),c)).join('')}</div>`):'';

const wtHtml=(()=>{
const wtEx=Object.entries(W_HIST).filter(([,h])=>h.length>=2).sort((a,b)=>b[1].length-a[1].length).slice(0,6);
if(!wtEx.length)return '';
return skinTpl('logWt',{wtEx},()=>`<div class="panel" id="wt-panel"><p class="panel-title">重量进步</p>
  ${wtEx.map(([name,hist])=>{
    const max=Math.max(...hist.map(h=>h.weight));
    const min=Math.min(...hist.map(h=>h.weight));
    const range=max-min||1;
    const first=hist[0].weight;
    const last=hist[hist.length-1].weight;
    const delta=last-first;
    const recent=hist.slice(-12);
    const asst=typeof isAssistedMove==='function'&&isAssistedMove(name); // 助力器械:数字往下走才是进步
    const good=asst?delta<0:delta>0, bad=asst?delta>0:delta<0;
    const rm=(typeof estimate1RM==='function')?estimate1RM(name):null;
    return `<div style="display:flex;flex-direction:column;gap:4px">
      <div class="note-line" style="display:flex;justify-content:space-between;gap:8px;color:var(--ink)"><span>${name}${rm?` <span class="faint">1RM≈${rm}kg</span>`:''}</span><span style="color:${good?'var(--olive)':bad?'var(--accent)':'var(--faint)'}">${asst?'助力 ':''}${delta>0?'+':''}${delta}kg</span></div>
      <div class="spark" style="height:28px">${recent.map(h=>`<i style="height:${range>0?((h.weight-min)/range*70+30):50}%" title="${h.date}: ${h.weight}kg"></i>`).join('')}</div>
      <div class="foot-note" style="display:flex;justify-content:space-between"><span>${recent[0]?.date?.slice(5)||''}</span><span>${last}kg</span></div>
    </div>`;
  }).join('')}
</div>`);
})();

const prHtml=PR_LIST.length?skinTpl('logPr',{list:PR_LIST.slice(0,10)},()=>`<div class="panel" id="pr-panel"><p class="panel-title">个人纪录</p>
  ${PR_LIST.slice(0,10).map(pr=>`<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:8px;align-items:baseline;border-bottom:1px dashed var(--line);padding:6px 0"><span><span style="display:block">${pr.exercise}</span><span class="foot-note">${pr.date}</span></span><span class="note-line"><span class="faint" style="text-decoration:line-through">${pr.prev}kg</span> → <span class="accent">${pr.weight}kg</span></span></div>`).join('')}
</div>`):'';

const achHtml=(kind)=>{
const isGym=kind==='gym', L=isGym?GYM_LOG:SWIM_LOG, MS=isGym?GYM_MILESTONES:SWIM_MILESTONES;
if(!L||!L.count) return '';
const count=L.count;
const logs=LOG.filter(l=>isGym?!l.isSwimDay:l.isSwimDay);
const thisM=logs.filter(l=>l.date.startsWith(thisMonth));
const totalMin=logs.reduce((s,l)=>s+(l.duration||0),0);
const nextMs=MS.find(m=>m.count>count);
const badges=MS.map((ms,idx)=>{
  const on=count>=ms.count;
  const matched=(L.milestones||[]).find(m=>m.count===ms.count);
  const svg=typeof getAchievementBadgeSvg==='function'?getAchievementBadgeSvg(ms,on):'';
  return `<button type="button" class="ach-badge-card${on?' on':''}" onclick="openAchievementModal('${kind}', ${idx})" aria-label="${ms.title}${on?' 已解锁':' 未解锁'}">${svg}<span class="an">${ms.title}</span><span class="ad">${on&&matched?matched.date.slice(5):`${count}/${ms.count}`}</span></button>`;
}).join('');
const nm=isGym?'力量':'游泳';
return skinTpl('logAch',{kind,nm,count,thisM,totalMin,nextMs,badges},()=>`<div class="panel" id="ach-${kind}"><p class="panel-title">${nm}成就</p>
<div class="kv wide"><span class="k">总${nm}次数</span><span>${count}</span><span class="k">本月${nm}</span><span>${thisM.length}</span><span class="k">总${nm}分钟</span><span>${totalMin}</span></div>
${nextMs?`<div class="ascii" style="line-height:1.4"><span class="k">下一个 · ${nextMs.title} </span>\n${_asciiBar(count/nextMs.count,16)} ${count}/${nextMs.count}</div>`:'<div class="note-line olive">所有成就已解锁！</div>'}
<p class="sub-label">${nm}勋章墙</p><div class="ach-wall">${badges}</div></div>`);
};

// 日志列表(#journal)夹在「本月」和后面的明细之间:innerHTML 重画前先把它拿出来,画完放回去
const journal=document.getElementById('journal');
el.innerHTML=top+(typeof ptLogPanelHtml==='function'?ptLogPanelHtml():'')+`<div id="journal-slot"></div>`+heat+distHtml+wtHtml+prHtml
  +(typeof renderBodyPanel==='function'?renderBodyPanel():'')
  +(typeof renderCurvePanel==='function'?renderCurvePanel():'')
  +achHtml('gym')+achHtml('swim');
const slot=document.getElementById('journal-slot');
if(journal&&slot)slot.replaceWith(journal);
if(typeof uiUpdateMasthead==='function')uiUpdateMasthead();
}

// ══ Export / Import ══════════════════════════════════════
function exportForAI(){
const recent=LOG.filter(l=>l.date>=addDays(todayStr(),-30)).sort((a,b)=>b.date.localeCompare(a.date)); // 近30「天」, 最新在前(原 slice(-30) 取的是最旧30条)
if(!recent.length){alert('暂无日志记录');return}
const dist={};
recent.forEach(l=>{
if(l.exercises)l.exercises.forEach(ex=>{
for(const[g,exs]of Object.entries(DB)){
const foundEx = exs.find(e=>e.n===ex.name);
if(foundEx){
if(g==='swimming'){
const muscles=foundEx.muscle||[];
muscles.forEach(m=>{
if(m==='上肢') dist['swim_upper']=(dist['swim_upper']||0)+1;
else if(m==='下肢') dist['swim_lower']=(dist['swim_lower']||0)+1;
else if(m==='核心') dist['swim_core']=(dist['swim_core']||0)+1;
else if(m==='心肺') dist['swim_cardio']=(dist['swim_cardio']||0)+1;
else if(m==='全身'){
dist['swim_upper']=(dist['swim_upper']||0)+1;
dist['swim_lower']=(dist['swim_lower']||0)+1;
dist['swim_core']=(dist['swim_core']||0)+1;
dist['swim_cardio']=(dist['swim_cardio']||0)+1;
}
});
} else if(g!=='warmup'&&g!=='stretch'){
dist[g]=(dist[g]||0)+(ex.sets||1);
}
break;
}
}
});
});
const grpNames={chest:'胸',shoulder:'肩',back:'背',biceps:'二头',triceps:'三头',quads:'股四头',hamglutes:'臀腿',glutemed:'臀中肌',calves:'小腿',core:'核心',cardio:'有氧',warmup:'热身',stretch:'拉伸',posture:'仪态',swim_upper:'游泳(上肢)',swim_lower:'游泳(下肢)',swim_core:'游泳(核心)',swim_cardio:'游泳(心肺)'};
const distStr=Object.entries(dist).sort((a,b)=>b[1]-a[1]).map(([g,c])=>`${grpNames[g]||g}${c}组`).join('·');

let logStr=recent.map(l=>{
const exStr=l.exercises?l.exercises.map(e=>`${e.name}${e.weight?' '+e.weight+'kg':''} ${e.sets}×${e.reps}${e.unit}`).join(', '):'';
return `- ${l.date} | ${l.workout} | ${l.duration||'?'}分钟${l.rpe?' | RPE '+l.rpe+'/10':''}\n  动作：${exStr}${l.note?'\n  备注：'+l.note:''}`;
}).join('\n');

const exEx = (S.userExcluded || []).map(n => `${n}${S.userExcludeReasons && S.userExcludeReasons[n] ? '(' + S.userExcludeReasons[n] + ')' : ''}`).join('、');
const exExStr = exEx ? `\n\n用户已永久排除动作/器械：${exEx}\n（分析与规划新方案时请避免包含上述动作与器械）` : '';

const text=`【${S.displayName||'Cici'} 健身日志 - AI 分析请求】\n训练目标：${S.goal} | 水平：${S.level} | 器材：${S.equip.join('+')}\n近${recent.length}次训练：\n\n${logStr}\n\n肌群分布（近30天）：${distStr||'无数据'}${exExStr}\n\n请帮我分析：\n1. 训练计划是否均衡？哪个肌群训练不足？\n2. 根据我的目标（${S.goal}），有什么需要改进？\n3. 下阶段如何调整计划？`;
const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fitness_ai_analysis_'+new Date().toISOString().split('T')[0]+'.txt';a.click();
showToast('已导出 AI 分析文件');
}
function exportJSON(){
const data={_meta:{version:1,exported:new Date().toISOString(),app:'Cici健身计划'}};
Object.entries(K).forEach(([,key])=>{const v=lg(key);if(v!==null)data[key]=v});
const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fitness_backup_'+new Date().toISOString().split('T')[0]+'.json';a.click();
}
function exportCSV(){
if(!LOG.length){alert('暂无日志记录');return}
const rows=['日期,训练类型,时长(分钟),动作数,RPE,感受,动作详情,备注'];
const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
LOG.forEach(x=>{
const exDetail=x.exercises?x.exercises.map(e=>`${e.name}${e.weight?' '+e.weight+'kg':''} ${e.sets}x${e.reps}${e.unit}`).join('; '):'';
const exCount=(x.exercises&&x.exercises.length)||x.exerciseCount||0;
rows.push(`${x.date},${q(x.workout)},${x.duration},${exCount},${x.rpe||''},${q(x.mood||'')},${q(exDetail)},${q(x.note||'')}`);
});
const blob=new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fitness_'+new Date().toISOString().split('T')[0]+'.csv';a.click();
}
function importJSON(input){
const file=input.files[0];if(!file)return;
const reader=new FileReader();
reader.onload=e=>{
try{
const data=JSON.parse(e.target.result);
if(data._meta&&data._meta.app&&data._meta.app!=='Cici健身计划'){if(!confirm('这份备份似乎不是本应用导出的，仍要导入吗？'))return;}
const allowed = new Set(Object.values(K));
let imported = false;
Object.entries(data).forEach(([k,v])=>{
    if(allowed.has(k) && v!==null && v!==undefined){
        ls(k,v);
        imported = true;
    }
});
if (imported) {
    try{sessionStorage.setItem('_justImported',currentUid())}catch(e){}   // 记是哪个账号导入的:未登录时导入、之后才登录的不算
    location.reload();
} else {
    alert('未找到有效的备份数据');
}
}catch{alert('文件格式错误')}
};reader.readAsText(file);
}

// 本地快照恢复 UI(数据安全网)
function showSnapshotRestore(){
if(typeof listSnapshots!=='function'){return}
const ring=listSnapshots();
if(!ring.length){alert('还没有本地快照(用一阵子后每天会自动存档,异常时也会自动拦截存档)');return}
const rows=ring.slice().reverse().map((s,ri)=>{
const idx=ring.length-1-ri;
const tag=/predrop/.test(s.reason)?' · 异常拦截存档':(s.reason==='pre-restore'?' · 恢复前':'');
return `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;align-items:center;border-bottom:1px dashed var(--line);padding:4px 0"><span><span style="display:block" class="mono">${s.d}</span><span class="foot-note">${s.vol||0} 条${tag}</span></span><button type="button" class="btn-line" onclick="doRestoreSnapshot(${idx})">恢复</button></div>`;
}).join('');
let m=document.getElementById('snap-restore-modal');
if(!m){m=document.createElement('div');m.id='snap-restore-modal';m.className='ex-modal-overlay';m.onclick=e=>{if(e.target===m)m.classList.remove('open')};document.body.appendChild(m);}
m.innerHTML=`<div class="ex-modal-card" onclick="event.stopPropagation()"><div class="ex-modal-hdr"><div><div class="sheet-eyebrow">数据</div><h3 class="ex-modal-title">恢复本地快照</h3></div><button class="ex-modal-close" onclick="uiCloseOverlay('snap-restore-modal')">关闭</button></div><p class="sheet-desc">每天自动存档，检测到数据异常时也会自动拦截存档。恢复前会先把「当前」也存一份，可以再切回来。</p><div>${rows}</div><button type="button" class="btn-line" onclick="uiCloseOverlay('snap-restore-modal')">关闭</button></div>`;
m.classList.add('open');
}
function doRestoreSnapshot(idx){
if(!confirm('恢复到这份快照?当前数据会先自动存一份(可再切回),然后刷新。'))return;
if(restoreSnapshot(idx)){try{sessionStorage.setItem('_justImported',currentUid())}catch(e){}location.reload();}
}

// ══ Sync Toast ═══════════════════════════════════════════
let _toastTimer=null;
function showToast(msg, dur){
const el=document.getElementById('sync-toast');
if(!el)return;
el.textContent=msg;el.classList.add('show');
clearTimeout(_toastTimer);
_toastTimer=setTimeout(()=>el.classList.remove('show'), dur || 3500);
}

// ══ Firebase Auth & Cloud Sync ═══════════════════════════
const CLOUD_KEYS=Object.values(K);
let _db=null,_user=null,_pushTimer=null,_pushing=false,_unsub=null;
let _localDirty=false; // When true, local changes are pending push — block cloud-to-local sync
let _cloudFirstSnap=false; // 这次登录后是否已经收到过第一份云端快照
// 开机:等自己文档的第一份「服务器」快照处理完(_onOwnSnap)才许推。之前 v162 是开机 1 秒后不管快照到没到都整键推本机,
// 网络慢时本机旧数据会盖掉另一台设备刚写的打卡 / 勾选。等的时候改动照样记、未推送标记照样落盘,快照到了再推(要合并就先合并)
let _ownBoot=false, _ownBootImport=false, _ownBootT=null;
// 最近一次确认过的云端内容(应用了的快照 / 推成功的那份 / 合并时的云端那份):键 → 规范化 JSON(键排好序,跟字段顺序无关)。null = 不知道
let _cloudKnown=null;
// 本机脏的时候收到的别处写入的云端快照(没应用):推之前先跟它合并,别拿本机整键盖掉它
let _pendingSnap=null;
function _syncCanon(v){ if(v===null||typeof v!=='object')return JSON.stringify(v); if(Array.isArray(v))return '['+v.map(_syncCanon).join(',')+']'; return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+_syncCanon(v[k])).join(',')+'}'; }
function _syncKnown(o){ const r={}; Object.keys(o||{}).forEach(k=>{r[k]=_syncCanon(o[k]);}); return r; }
// 自己文档的云端快照「收到并应用了」几次(本机有没推上去的改动、或骤降拦截而跳过的不算)。没练自动顺延靠它判断本机数据新不新(core.js _shReady):
// 这次登录 / 最近一次切回前台之后没收到过,就别拿本机的旧数据顺延(否则另一台设备刚打的卡会被推上去的旧计划 / 记录整键盖掉)
let _cloudSeq=0,_cloudEpochSeq=0;
function cloudFresh(){ return !_user||_cloudSeq>_cloudEpochSeq; }
// 新的一轮(登录、切回前台):之前收到的不算了。fetch=true 时主动向服务器要一份自己的文档 —— 切回前台时云端没变,监听不会再推
function cloudNewEpoch(fetch){
  _cloudEpochSeq=_cloudSeq;
  if(typeof _shNewEpoch==='function')_shNewEpoch();
  if(!fetch||!_db||!_user||!_unsub)return;
  const uid=_user.uid;
  try{ _db.collection('users').doc(uid).get({source:'server'}).then(doc=>{ if(_user&&_user.uid===uid&&_unsub)_onOwnSnap(doc); }).catch(()=>{}); }catch(e){}
}

function initFirebase(){
try{
if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
_db=firebase.firestore();
firebase.auth().onAuthStateChanged(handleAuth);
}catch(e){console.warn('Firebase init failed:',e);renderAuthBtn();if(typeof _authKnown!=='undefined'){_authKnown=true;if(typeof render==='function')render();}}
}

function handleAuth(user){
_user=user;
_cloudSeq=0;cloudNewEpoch(false);   // 换了账号:之前收到的云端快照不算
// 切账号时复位扩展模式残留(否则登出→换人登录后仍可能弹出扩展提示);非 owner 再把私有包挂上去的东西全撤掉
if(typeof _xMode!=='undefined'){_xMode=false;_xDetailMode=false;}
if(typeof _xReset==='function'&&!(typeof _ownerSession==='function'&&_ownerSession()))_xReset();
updateProfileUI();
// Recover pre-namespace data into this account before reading state. If anything
// was migrated, mark local dirty so the realtime listener can't overwrite the
// just-recovered keys with a stale/empty cloud doc before our first push.
if(user && typeof migrateLegacyKeys==='function' && migrateLegacyKeys(user.uid)){ _localDirty=true; _dirtyFlag(true); }   // 落盘标记、不记键 = 开机合并时全当本机改过
loadState();
if(typeof saveSnapshot==='function') saveSnapshot('load');
if(typeof render === 'function') render();
if(typeof renderLog === 'function') renderLog();
if(typeof renderStats === 'function') renderStats();
applySettingsToUI();
renderAuthBtn();
if(user){setupRealtimeSync();showToast('已连接');pushProfile();subscribePartner();_checkAnonMerge(user.uid);}
else{if(_unsub){_unsub();_unsub=null}if(_partnerUnsub){_partnerUnsub();_partnerUnsub=null}_partnerProfile=null;}
if(typeof updatePairUI==='function')updatePairUI();
if(typeof xpOnAuthChange==='function')xpOnAuthChange();
if(typeof _authKnown!=='undefined')_authKnown=true;
if(typeof coachProbeAccess==='function')coachProbeAccess();
if(typeof uiRenderMe==='function')uiRenderMe();
if(typeof uiRenderP8==='function')uiRenderP8();
if(typeof uiUpdateComposer==='function')uiUpdateComposer();
if(typeof render==='function')render();   // 登录状态定了:没计划没数据时这里才弹新手设置
if(typeof ptResumePending==='function')ptResumePending();   // 打开的是配对链接:登录状态定了再问「和 X 配对？」(没登录先引导登录)
}

// ── 未登录(本地模式)攒的数据 → 登录后并进账号 ──
// 未登录时数据存在 anon__* 下,登录后读的是 <uid>__*,本机记录看起来就「消失」了。
// 账号本身(本机 + 云端)还是空的时候问一句要不要搬过来;账号已有数据就不合并(避免两份记录互相覆盖),只提示一下。
// 搬完删掉 anon__*,免得同一台设备换另一个账号登录时又把同一批记录并进去。
const _ANON_DATA_KEYS=['fit_p1','fit_log1','fit_wh1','fit_body1','fit_pr','fit_swim','fit_gym_ach'];
function _hasData(prefix,get){
  return _ANON_DATA_KEYS.some(k=>{
    let v=get(prefix+k); if(v==null||v==='')return false;
    if(typeof v==='string'){try{v=JSON.parse(v)}catch(e){return false}}
    if(Array.isArray(v))return v.length>0;
    if(v&&typeof v==='object'){if(typeof v.count==='number')return v.count>0;if(v.plan)return !!(v.plan.days&&v.plan.days.length);return Object.keys(v).length>0;}
    return !!v;
  });
}
function _anonHasData(){try{return _hasData('anon__',k=>localStorage.getItem(k))}catch(e){return false}}
function _checkAnonMerge(uid){
  try{
    if(!uid||!_db||!_anonHasData()||localStorage.getItem('__anon_merge_asked__'+uid))return;
    _db.collection('users').doc(uid).get().then(doc=>{
      if(currentUid()!==uid)return; // 期间换了账号
      _offerAnonMerge(uid,doc&&doc.exists?doc.data():null);
    }).catch(e=>console.warn('[anon-merge] 读云端失败,下次登录再问',e)); // 断网时不问(没法确认账号是不是空的)
  }catch(e){}
}
function _offerAnonMerge(uid,cloud){
  if(!uid||uid==='anon'||!_anonHasData())return false;
  const localHas=_hasData(uid+'__',k=>localStorage.getItem(k));
  const cloudHas=!!cloud&&_hasData('',k=>cloud[k]);
  localStorage.setItem('__anon_merge_asked__'+uid,'1');
  if(localHas||cloudHas){showToast('这台设备上还有未登录时的记录，退出登录可以看到',5000);return false;}
  let n=0;try{n=(JSON.parse(localStorage.getItem('anon__fit_log1')||'[]')||[]).length}catch(e){}
  if(!confirm(`这台设备上有未登录时记下的计划和打卡${n?`（${n} 条打卡记录）`:''}。\n要把它们并进当前账号吗？\n\n选「取消」也不会删，退出登录后仍能看到。`))return false;
  const keys=[...new Set([...Object.values(K),'fit_selDate'])];
  keys.forEach(k=>{const v=localStorage.getItem('anon__'+k);if(v!==null)localStorage.setItem(uid+'__'+k,v);});
  keys.forEach(k=>localStorage.removeItem('anon__'+k));
  _localDirty=true;_dirtyFlag(true); // 先推本机上云,别让云端那份空文档盖回来
  loadState();
  if(typeof saveSnapshot==='function')saveSnapshot('anon-merge');
  if(typeof renderLog==='function')renderLog();
  if(typeof renderStats==='function')renderStats();
  clearTimeout(_pushTimer);_pushTimer=setTimeout(pushToCloud,0);
  showToast('已把本机记录并进账号');
  return true;
}

window.updateProfileUI = function() {
    // Prefer a user-set display name (Chinese-name friendly) over Google's `given family` split.
    // 没有名字时别拼成「我的的计划」(旧 PR #5 里修过的)
    const gName = (_user && _user.displayName) ? _user.displayName.split(' ')[0] : '';
    const name = (S.displayName && S.displayName.trim()) ? S.displayName.trim() : gName;
    const seal = (S.sealChar && S.sealChar.trim()) ? S.sealChar.trim() : ((name && name.charAt(0).toUpperCase()) || '健');
    const titleEl = document.getElementById('doc-title');
    if (titleEl) titleEl.textContent = name ? `${name}健身计划` : '我的健身计划';
    // 名字和印章现在放在「我 → 01 账号」页头
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = name ? `${name}的计划` : '我的健身计划';
    const sealEl = document.getElementById('user-seal');
    if (sealEl) sealEl.textContent = seal;
};
// 旧入口(点刊头印章改名)已经换成「我 → 01」里的两个输入框;保留函数,调用时跳过去并聚焦
window.editProfileName = function() {
    if (typeof showTab === 'function') showTab('me');
    setTimeout(() => { const n = document.getElementById('me-name'); if (n) { n.scrollIntoView({ block: 'center' }); try { n.focus(); } catch (e) {} } }, 50);
};

function signInGoogle(){
firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e=>alert('登录失败: '+e.message));
}
function signOutUser(){
if(confirm('确定退出登录？'))firebase.auth().signOut();
}
// ── 邮箱/密码登录:纯API无跳转,主屏幕PWA里也能登(绕开Google OAuth在iOS PWA的sessionStorage死结)──
// 登录表单内嵌在「我 → 01 账号」:openLoginModal 保留名字,改成跳过去并聚焦邮箱
function openLoginModal(){if(typeof showTab==='function')showTab('me');setTimeout(()=>{const g=document.getElementById('login-msg');if(g)g.textContent='';const e=document.getElementById('login-email');if(e){e.scrollIntoView({block:'center'});try{e.focus()}catch(x){}}},50);}
function closeLoginModal(){const g=document.getElementById('login-msg');if(g)g.textContent='';}
function _loginMsg(t){const e=document.getElementById('login-msg');if(e)e.textContent=t;}
function _authErr(e){const c=(e&&e.code)||'';
if(c==='auth/wrong-password'||c==='auth/invalid-credential')return '邮箱或密码错误';
if(c==='auth/user-not-found')return '账号不存在，请先点「注册」';
if(c==='auth/email-already-in-use')return '该邮箱已注册，请直接「登录」';
if(c==='auth/invalid-email')return '邮箱格式不对';
if(c==='auth/weak-password')return '密码太弱（至少6位）';
if(c==='auth/operation-not-allowed')return '还没在 Firebase 控制台启用「邮箱/密码」登录';
if(c==='auth/network-request-failed')return '网络不通，检查连接';
return (e&&e.message)||'失败';}
function signInEmail(){
const em=((document.getElementById('login-email')||{}).value||'').trim(),pw=(document.getElementById('login-pass')||{}).value||'';
if(!em||!pw){_loginMsg('请填邮箱和密码');return;}
_loginMsg('登录中…');
firebase.auth().signInWithEmailAndPassword(em,pw).then(()=>closeLoginModal()).catch(e=>_loginMsg(_authErr(e)));
}
function signUpEmail(){
const em=((document.getElementById('login-email')||{}).value||'').trim(),pw=(document.getElementById('login-pass')||{}).value||'';
if(!em||!pw){_loginMsg('请填邮箱和密码');return;}
if(pw.length<6){_loginMsg('密码至少6位');return;}
_loginMsg('注册中…');
firebase.auth().createUserWithEmailAndPassword(em,pw).then(()=>closeLoginModal()).catch(e=>_loginMsg(_authErr(e)));
}

function renderAuthBtn(){
if(typeof uiRenderMeAcct==='function')uiRenderMeAcct();
_syncPill();
}
// 同步状态:写在「我 → 01」的「同步」一行(#sync-pill)
let _syncState={ok:true,at:null};
function _syncPill(ok,at){
if(ok!==undefined)_syncState={ok,at:at||_syncState.at};
const pill=document.getElementById('sync-pill');if(!pill)return;
const t=_syncState.at?` · ${String(_syncState.at.getHours()).padStart(2,'0')}:${String(_syncState.at.getMinutes()).padStart(2,'0')}`:'';
pill.textContent=_syncState.ok?`云端已同步${t}`:'没同步上，稍后自动重试';
pill.className='auth-pill-sync '+(_syncState.ok?'ok':'err');
pill.style.color=_syncState.ok?'':'var(--accent)';
}

function setupRealtimeSync(){
if(!_db||!_user)return;
if(_unsub)_unsub();
// 刚导入过备份:强制把本地(导入的数据)先推上云,别让旧云端快照盖回来致导入失效(修#1)
const _justImported=(()=>{try{const v=sessionStorage.getItem('_justImported');if(v!==null)sessionStorage.removeItem('_justImported');return v===_user.uid}catch(e){return false}})();
if(_justImported)_localDirty=true;
const _pendingFromLastRun=_dirtyFlagSet(); // 上次关 app 前还有没推上去的改动
if(_pendingFromLastRun)_localDirty=true;
_cloudFirstSnap=false;
_cloudSeq=0;cloudNewEpoch(false);
_ownBoot=true;_ownBootImport=_justImported;clearTimeout(_ownBootT);_ownBootT=null;_cloudKnown=null;_pendingSnap=null;
_unsub=_db.collection('users').doc(_user.uid).onSnapshot(_onOwnSnap,e=>{console.warn('Sync error:',e);_ownBootFetch();});
// 开机推送:刚导入 / 恢复了存档 → 立刻推(用户明确要本机覆盖云端)。别的情况等自己文档的第一份服务器快照(_onOwnSnap):
// 本机没改动 → 应用云端,不推;云端没有这份文档(新用户)→ 推本机;本机有没推上去的改动 → 先按键合并(_syncMerge)再推
if(_justImported){clearTimeout(_pushTimer);_pushTimer=setTimeout(pushToCloud,0);}
}
// 开机还没等到服务器快照(离线时 SDK 先给的缓存不算、监听出错):隔 5 秒主动向服务器要一份,要到了按开机那份处理
function _ownBootFetch(){
  if(_ownBootT||!_ownBoot||!_db||!_user)return;
  const uid=_user.uid;
  _ownBootT=setTimeout(()=>{
    _ownBootT=null;
    if(!_ownBoot||!_db||!_user||_user.uid!==uid||!_unsub)return;
    try{ _db.collection('users').doc(uid).get({source:'server'}).then(d=>{ if(_ownBoot&&_user&&_user.uid===uid&&_unsub)_onOwnSnap(d); }).catch(()=>_ownBootFetch()); }catch(e){}
  },5000);
}
// 自己文档的一份云端快照(监听推来的,或切回前台时主动要的)
function _onOwnSnap(doc){
// 新手设置要等第一份云端快照回来再决定弹不弹(换新设备登录时本机是空的,别在云端数据到之前先让人从头设一遍)
// 离线时 SDK 会先给一份缓存里的(常常是「文档不存在」):不能当成新用户把本机推上去,也不算「云端是新的」(顺延照等);
// 开机时也不拿它解锁新手设置(否则新设备离线登录会从头设一遍,联网后本机新建的计划盖掉云端那份)
const cached=!!(doc&&doc.metadata&&doc.metadata.fromCache);
if(_ownBoot&&cached&&!_ownBootImport){_ownBootFetch();return;}
const _first=!_cloudFirstSnap;
if(_first){_cloudFirstSnap=true;if(!doc.exists&&typeof render==='function')setTimeout(render,0);}
if(_ownBoot){
  if(_ownBootImport){   // 刚导入:本机覆盖云端,这份不应用;本机就是要的数据,算「收到了」
    _ownBoot=false;_ownBootImport=false;_cloudSeq++;
    if(_localDirty){clearTimeout(_pushTimer);_pushTimer=setTimeout(pushToCloud,0);}
    _ptSeenSync();if(typeof autoShiftCheck==='function')autoShiftCheck();
    return;
  }
  _ownBoot=false;clearTimeout(_ownBootT);_ownBootT=null;
  if(!doc.exists){_cloudKnown=null;_localDirty=true;clearTimeout(_pushTimer);_pushTimer=setTimeout(pushToCloud,0);}   // 新用户:把本机推上去建文档
  else if(_localDirty){_syncMerge(doc.data(),'开机');return;}   // 本机有没推上去的改动:不整键盲推,先合并
}
if(!doc.exists){if(cached)return;_cloudKnown=null;_cloudSeq++;_ptSeenSync();if(typeof autoShiftCheck==='function')autoShiftCheck();return;}   // 云端还没有这份文档:本机就是最新的
// If local changes are pending push, do NOT let cloud overwrite them
if(_localDirty){
    console.log('[sync] skipped cloud→local: local changes pending push');
    if(!cached&&!(doc.metadata&&doc.metadata.hasPendingWrites))_pendingSnap=doc.data();   // 自己刚写的回声不算
    if(_first&&typeof render==='function')setTimeout(render,0);
    return;
}
const cd=doc.data();
// 骤降拦截:云端数据比本地大幅偏少 → 疑似"旧云盖新本地"(丢数据主因),拦住不覆盖,本机为主跟云端合并后推上去
const localVol=_dataVolume(k=>lg(K[k]));
const cloudVol=_dataVolume(k=>cd[K[k]]);
if(localVol>=15 && cloudVol < localVol*0.6){
  saveSnapshot('predrop-blocked');
  _syncMerge(cd,'骤降',true);   // 云端这份信不过:全按本机改过处理
  showToast('云端数据异常偏少，已保留本机数据'); return;
}
let changed=false;
Object.entries(cd).forEach(([k,v])=>{
const nk=nsKey(k);
const lv=localStorage.getItem(nk);
const cv=JSON.stringify(v);
if(lv!==cv){try{localStorage.setItem(nk,cv);changed=true}catch{}}
});
_cloudKnown=_syncKnown(cd);
_cloudSeq++;   // 先记「收到了」再 loadState(它会顺带跑没练自动顺延)
if(changed){loadState();renderLog();showToast('已从云端同步');saveSnapshot('post-sync')}
else if(_first&&typeof render==='function')render();   // 第一份快照没带来变化:也重画一次,让新手设置按最新状态判断
_ptSeenSync();   // 搭子快照先到时没写盘的「读到过搭子」,现在写
if(typeof autoShiftCheck==='function')autoShiftCheck();   // 正等着这份快照的顺延:不用等下一轮轮询
}

let _dirtyId=0; // bumped on every local change; lets a push detect changes that arrive mid-flight
// 未推送标记同时落盘:内存里的 _localDirty 会随 app 被杀掉而丢,下次打开时云端旧快照就会整键盖回来
function _dirtyFlag(on){try{if(currentUid()==='anon')return;on?localStorage.setItem(nsKey('__dirty__'),'1'):localStorage.removeItem(nsKey('__dirty__'))}catch(e){}}
function _dirtyFlagSet(){try{return localStorage.getItem(nsKey('__dirty__'))==='1'}catch(e){return false}}
// 本机删掉、还没推上去的打卡 / 身体记录的日期(只存本机,不上云,推送成功后清掉):合并云端时同日期那条别再并回来
function _syncTombGet(){try{const t=JSON.parse(localStorage.getItem(nsKey('__deleted__'))||'{}')||{};return{log:Array.isArray(t.log)?t.log:[],body:Array.isArray(t.body)?t.body:[]};}catch(e){return{log:[],body:[]};}}
// 本机改过、还没推上去的键(只存本机,推送成功后清掉)。返回 null = 不知道是哪些(老版本留下的未推送标记、迁移、没记下):合并时全当改过
function _syncDirtyKeys(){try{const v=JSON.parse(localStorage.getItem(nsKey('__dirtykeys__'))||'null');return Array.isArray(v)?v:null}catch(e){return null}}
function _syncMarkKey(k){try{if(currentUid()==='anon'||!CLOUD_KEYS.includes(k))return;const nk=nsKey('__dirtykeys__');
  let a=JSON.parse(localStorage.getItem(nk)||'null');
  if(a===null)a=_dirtyFlagSet()?'*':[];   // 已有未推送标记却没记键:是哪些不知道,保持「全当改过」
  if(Array.isArray(a)&&!a.includes(k))a.push(k);
  localStorage.setItem(nk,JSON.stringify(a));}catch(e){}}
function _syncClearDirty(){try{localStorage.removeItem(nsKey('__deleted__'));localStorage.removeItem(nsKey('__dirtykeys__'))}catch(e){}}
function _syncTombAdd(kind,date){if(!_db||!_user||!date)return;try{const t=_syncTombGet();if(!t[kind].includes(date)){t[kind].push(date);localStorage.setItem(nsKey('__deleted__'),JSON.stringify(t));}}catch(e){}}

// ── 本机有没推上去的改动、云端那份又可能有别的设备新写的:按键合并(不再整键盲推本机)──
// 打卡记录 fit_log1:按 date 合并(全 app 一天一条)。两边同一天都有:都带 at / ts 时取更新的;没有时间字段(现在的记录都没有)以本机为准 ——
//   本机这条要么就是还没推上去的改动(编辑过 / 重打卡),要么和云端是同一条
// 计划 fit_p1:计划本身和其余字段本机为准;按日期的勾选 prog 取并集(同一天同一下标任一边勾了就算勾;两边计划那一格不是同一个动作时不并);
//   当天的重量 / 组数次数 / 单动作感受(weights / adj / exRpe)只补本机没打卡那几天、本机缺的格子
// 身体记录 fit_body1:按 date 合并,同一天逐项本机有值的为准、本机空着的用云端的
// 动作重量 fit_wh1 / 新纪录 fit_pr:按日期跟着打卡走 —— 本机有那天的打卡(或刚删掉)就以本机为准,只有云端有的那天并进来
// 其余键(设置、扩展状态、成就计数…)本机为准(成就计数 loadState 时按记录重算)
function _syncTs(x){const v=x&&(x.at!=null?x.at:x.ts);if(v==null)return null;const n=typeof v==='number'?v:Date.parse(v);return isFinite(n)?n:null;}
function _syncExName(p,d,i){const days=p&&p.plan&&p.plan.days;if(!Array.isArray(days))return undefined;const day=days.find(x=>x&&x.date===d);const ex=day&&day.exercises&&day.exercises[i];return ex?ex.name:undefined;}
function _syncMergeKeys(loc,cd,tomb){
  const out={}, J=v=>JSON.parse(JSON.stringify(v));
  const L=loc[K.log], C=cd[K.log];
  let logOut=L;
  if(Array.isArray(L)&&Array.isArray(C)){
    const pos=new Map();logOut=L.slice();logOut.forEach((x,i)=>{if(x&&x.date&&!pos.has(x.date))pos.set(x.date,i)});
    let add=false;
    C.forEach(c=>{
      if(!c||!c.date||tomb.log.includes(c.date))return;
      if(!pos.has(c.date)){pos.set(c.date,logOut.length);logOut.push(J(c));add=true;return;}
      const i=pos.get(c.date),tl=_syncTs(logOut[i]),tc=_syncTs(c);
      if(tl!=null&&tc!=null&&tc>tl)logOut[i]=J(c);
    });
    if(add)logOut.sort((a,b)=>String(b&&b.date||'').localeCompare(String(a&&a.date||'')));
    out[K.log]=logOut;
  }
  // 「这天归本机」:本机有这天的打卡,或这天刚在本机删掉 → 这天的重量 / 新纪录 / 勾选以本机为准
  const own=new Set([...(Array.isArray(L)?L:[]).map(x=>x&&x.date),...tomb.log]);
  const PL=loc[K.plan], PC=cd[K.plan];
  if(PL&&PC&&typeof PL==='object'&&typeof PC==='object'){
    const p=J(PL);p.prog=(p.prog&&typeof p.prog==='object')?p.prog:{};
    // 当天改过的重量 / 组数次数 / 单动作感受(键 = 日期-下标[-s|-r]):那天不归本机、本机没这个键、两边那一格是同一个动作,才用云端的
    ['weights','adj','exRpe'].forEach(f=>{
      const cf=PC[f];if(!cf||typeof cf!=='object')return;
      Object.entries(cf).forEach(([key,v])=>{
        const d=key.slice(0,10),i=key.slice(11).split('-')[0];
        if(v==null||!/^\d{4}-\d\d-\d\d$/.test(d)||own.has(d)||i==='')return;
        if(!p[f]||typeof p[f]!=='object')p[f]={};
        if(p[f][key]!=null)return;
        if(_syncExName(PL,d,i)!==_syncExName(PC,d,i))return;
        p[f][key]=J(v);
      });
    });
    if(PC.prog&&typeof PC.prog==='object')Object.entries(PC.prog).forEach(([d,cp])=>{
      if(!cp||typeof cp!=='object'||tomb.log.includes(d))return;
      Object.entries(cp).forEach(([i,v])=>{
        if(!v||(p.prog[d]&&Object.prototype.hasOwnProperty.call(p.prog[d],i)))return;   // 本机这格有值(含取消勾选的 false)就以本机为准
        if(_syncExName(PL,d,i)!==_syncExName(PC,d,i))return;   // 两边计划这一格不是同一个动作(一边重排过):勾选对不上,不并
        if(!p.prog[d]||typeof p.prog[d]!=='object')p.prog[d]={};
        p.prog[d][i]=v;
      });
    });
    out[K.plan]=p;
  }
  const BL=loc[K.body], BC=cd[K.body];
  if(Array.isArray(BL)&&Array.isArray(BC)){
    const b=J(BL), at=new Map();b.forEach((x,i)=>{if(x&&x.date)at.set(x.date,i)});
    BC.forEach(c=>{
      if(!c||!c.date||tomb.body.includes(c.date))return;
      if(!at.has(c.date)){at.set(c.date,b.length);b.push(J(c));return;}
      const x=b[at.get(c.date)];Object.keys(c).forEach(f=>{if(x[f]==null&&c[f]!=null)x[f]=c[f];});
    });
    b.sort((x,y)=>String(x&&x.date||'').localeCompare(String(y&&y.date||'')));
    out[K.body]=b;
  }
  const WL=loc[K.wh], WC=cd[K.wh];
  if(WL&&WC&&typeof WL==='object'&&typeof WC==='object'&&!Array.isArray(WL)&&!Array.isArray(WC)){
    const w=J(WL);
    Object.entries(WC).forEach(([n,arr])=>{
      if(!Array.isArray(arr))return;
      const mine=Array.isArray(w[n])?w[n]:[];
      const add=arr.filter(h=>h&&h.date&&!own.has(h.date)&&!mine.some(m=>m&&m.date===h.date)).map(J);
      if(!add.length)return;
      w[n]=mine.concat(add).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-50);
    });
    out[K.wh]=w;
  }
  const RL=loc[K.pr], RC=cd[K.pr];
  if(Array.isArray(RL)&&Array.isArray(RC)){
    const add=RC.filter(c=>c&&c.date&&!own.has(c.date)&&!RL.some(x=>x&&x.date===c.date&&x.exercise===c.exercise)).map(J);
    out[K.pr]=add.length?RL.concat(add).sort((a,b)=>String(b&&b.date||'').localeCompare(String(a&&a.date||''))).slice(0,50):RL;
  }
  return out;
}
function _syncMerge(cd,why,allLocal){
  saveSnapshot('pre-merge');   // 合并前本机这份先存一份(「我 → 数据」里能恢复)
  const tomb=_syncTombGet(), loc={};
  CLOUD_KEYS.forEach(k=>{const v=localStorage.getItem(nsKey(k));if(v!==null){try{loc[k]=JSON.parse(v)}catch(e){loc[k]=v}}});
  const m=_syncMergeKeys(loc,cd||{},tomb), dk=allLocal?null:_syncDirtyKeys();
  _cloudKnown=_syncKnown(cd||{});
  let got=0;
  const hasC=k=>cd&&cd[k]!==undefined&&cd[k]!==null;
  CLOUD_KEYS.forEach(k=>{
    let v;
    if(!(k in loc)){if(hasC(k)){v=cd[k];got++;}else return;}   // 本机没有这个键:用云端的
    else if(dk&&!dk.includes(k)){if(hasC(k))v=cd[k];else return;}   // 本机没改过这个键:云端的为准(别拿本机旧设置 / 旧计划盖掉别的设备新写的)
    else if(k in m)v=m[k];
    else return;   // 本机改过:本机为准
    const s=JSON.stringify(v);
    if(localStorage.getItem(nsKey(k))!==s){try{localStorage.setItem(nsKey(k),s);if(k in loc)got++;}catch(e){}}
  });
  console.log('[sync] merged cloud→local ('+(why||'')+'), keys changed: '+got);
  _localDirty=true;_dirtyId++;_dirtyFlag(true);
  _cloudSeq++;   // 云端这份已经并进本机了:算「收到了」(顺延按合并后的数据判断)
  loadState();renderLog();if(typeof renderStats==='function')renderStats();
  if(got)saveSnapshot('post-merge');
  _ptSeenSync();
  if(typeof autoShiftCheck==='function')autoShiftCheck();
  clearTimeout(_pushTimer);_pushTimer=setTimeout(pushToCloud,0);
}
function schedulePush(){
_dirtyFlag(true);
if(!_db||!_user)return;
_localDirty=true; _dirtyId++; // Block cloud→local until pushed
clearTimeout(_pushTimer);
_pushTimer=setTimeout(pushToCloud,2000);
scheduleProfilePush(); // keep the shared partner profile fresh as state changes
}
// Flush a pending push immediately when the page is hidden/closed, so a change made within the
// 2s debounce isn't lost (otherwise the next launch's snapshot overwrites it with stale cloud).
function flushPush(){ if(_db&&_user&&_localDirty&&!_pushing){ clearTimeout(_pushTimer); pushToCloud(); } }
if(typeof document!=='undefined'){
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') flushPush(); });
  window.addEventListener('pagehide',flushPush);
}

async function pushToCloud(){
if(!_db||!_user||_pushing)return;
if(_ownBoot&&!_ownBootImport)return;   // 还没见过云端那份:先别推(改动和落盘标记都留着,快照到了 _onOwnSnap 再推,要合并先合并)
// 本机脏的时候别处写过云端(那份快照没应用):先合并再推,合并完会重新排一次推送
if(_pendingSnap){const c=_pendingSnap;_pendingSnap=null;if(!(_cloudKnown&&Object.keys(c).every(k=>_cloudKnown[k]===_syncCanon(c[k])))){_syncMerge(c,'推送前');return;}}
if(typeof _mockSyncFail !== 'undefined' && _mockSyncFail) {
    console.log('[sync] simulated push failure (offline)');
    _syncPill(false);
    clearTimeout(_pushTimer); _pushTimer=setTimeout(pushToCloud,5000); // keep dirty + retry
    return;
}
const sentId=_dirtyId;
const data={};
CLOUD_KEYS.forEach(k=>{const v=localStorage.getItem(nsKey(k));if(v!==null){try{data[k]=JSON.parse(v)}catch{data[k]=v}}});
// 要推的和最近确认过的云端那份一模一样(比如刚应用完快照、重算成就又写了一遍同样的值):不推,省得白推一次
if(_cloudKnown&&Object.keys(data).every(k=>_cloudKnown[k]===_syncCanon(data[k]))){ _localDirty=false; _dirtyFlag(false); _syncClearDirty(); _syncPill(true,new Date()); return; }
_pushing=true;
try{
// 逐键整块替换(merge:true 是深合并:本机删掉的勾选 / 重量 / 动作历史永远删不到云端,下次合并又冒回来)
await _db.collection('users').doc(_user.uid).set(data,{mergeFields:Object.keys(data)});
_cloudKnown=Object.assign(_cloudKnown||{},_syncKnown(data));
// Only stop blocking cloud→local if no newer change arrived during the await; else keep dirty + reschedule.
if(_dirtyId===sentId){ _localDirty=false; _dirtyFlag(false); _syncClearDirty(); } else { clearTimeout(_pushTimer); _pushTimer=setTimeout(pushToCloud,2000); }
_syncPill(true,new Date());
}catch(e){
console.warn('Push failed:',e);
// Keep _localDirty=true so the snapshot listener can't overwrite the unpushed change; retry with backoff.
_syncPill(false);
clearTimeout(_pushTimer); _pushTimer=setTimeout(pushToCloud,5000);
}
_pushing=false;
}

// ══ 好友机制 / Partner Sync ══════════════════════════════
// Each account publishes a deliberately-curated profile to
// users/{uid}/shared/profile (owner-write, friend-read gated by allowedReaders —
// see firestore.rules). Private/定制 data is NEVER written here. Pairing is a
// mutual uid exchange: each person adds the other's uid to their own
// allowedReaders. No cross-account write ever happens — even a "cheer" is written
// to your OWN profile and read by your partner.
let _partnerProfile=null;   // latest snapshot of partner's shared/profile (or null)
let _partnerUnsub=null;
let _partnerRetry=null;
let _profilePushTimer=null;

function partnerUid(){ return (S.partnerUid && String(S.partnerUid).trim()) || null; }

// Whitelist-only shareable profile. Anything not listed simply never leaves the
// private doc — that's what keeps owner-only content from ever reaching a partner.
// train = 搭子互通的训练数据(计划、记录、重量、感受),由 coach.js coachSharedTraining() 按「给别人看」那套门控(_shareGated)过滤,owner 也照拦:
// 私密池 / 盆底动作、私密日、私密模式的记录一律不进;身体数据(体重围度、身体情况、周期)和打卡备注原文也不进。
// 下面三项也只在配对后写(实现在本节后半「搭子:实时进度 / 回应 / 连续周数」):
// live = 今天的实时进度(在练什么、第几组、做完几项、开练时间;动作名过同一套门控,私密的写「另有安排」,私密日整天只写「另有安排」);
// reacts = 我发给搭子的回应(固定几个词,对今天 / 对某次打卡);weeks = 每周打卡几天(同一套门控的记录)+ 每周目标,算双人连续周数用。
function buildSharedProfile(){
  const today=todayStr();
  const td=(S.plan&&S.plan.days)?S.plan.days.find(d=>d.date===today):null;
  const myName=(S.displayName&&S.displayName.trim())||(_user&&_user.displayName?_user.displayName.split(' ')[0]:'搭子');
  const pu=partnerUid();
  let train=null, live=null, weeks=null;
  try{ train=(pu&&typeof coachSharedTraining==='function')?coachSharedTraining():null; }catch(e){ console.warn('shared training build failed:',e); }   // 没配对就不写
  try{ if(pu){ live=_ptLiveStamp(_ptLiveCore()); weeks=_ptMyWeeks(); } }catch(e){ console.warn('shared live build failed:',e); }
  return _shareFilter({   // 「共享给 TA」关掉的类在这里删(见下)
    name: myName,
    days: +S.days||null,
    hasPool: S.equip.includes('泳池'),
    todayType: td?(td.isPrivateDay?'另有安排':td.isRest?'休息':typeof _shareType==='function'?_shareType(td.workoutType,_coachDayK(td)):'训练'):'—',   // 类型名过门控(coach.js _shareType)
    todayDone: td?!!isDone(td):false,
    swimCount: (typeof SWIM_LOG!=='undefined'&&SWIM_LOG.count)||0,
    cheer: (S.cheer&&S.cheer.date)?S.cheer:null,   // my latest cheer TO my partner(旧版只读这个键:对今天的最近一次回应)
    allowedReaders: pu?[pu]:[],                     // who may read this doc (the rule checks this)
    lastActive: today,
    train,
    live,
    weeks,
    reacts: pu?_ptMyReacts():null
  });
}
// ── 共享给 TA(「我 → 03」每类一个开关;S.share 随 fit_s1 云同步,没设过 / undefined = 开,老用户升级后分享的内容不变)──
// 后过滤:buildSharedProfile 照旧生成整份,这里按关掉的类删路径;coachSharedTraining 内部不动。删不存在的路径是空操作(train.shifts 由「没练自动顺延」加)。
// 路径:a.b 一层层往下;x[] = 数组里每一项;* = 对象里每个键。[路径, 正则] = 不删字段,只把字串里匹配的部分去掉(重量 / RPE 是嵌在一行字里的)。
// 名字、今天练什么(todayType / todayDone)、回应(reacts / cheer)、days / hasPool 是配对的基本功能,不做开关。
// 关了的类记在 off(对方据此显示「TA 没共享…」,和「对方 app 还没升级、没有这个字段」分开);AI 那一项写 aiOk:false,对方 app 读到就不把搭子数据放进 AI 快照。
// 每项:[键, 名字, 分享什么, 关掉后对方少了什么, 要删的路径]
const SHARE_CATS=[
  ['plan','训练计划','未来两周每天练什么、顺延','TA 没法跟你对齐，也看不到你俩的重合日',['train.plan','train.shifts']],
  ['logs','打卡记录','练了什么、时长、完成情况、月度汇总','TA 看不到你的打卡，也没法回应某一次',['train.logs','train.history','train.stats']],
  ['weights','重量','各动作最近的重量','TA 看不到你各个动作练多重',['train.weights',['train.logs[].ex[]',/ \S+kg(?= \S+×)/g]]],
  ['feel','感受','RPE 和每个动作的感受','TA 看不到你练得累不累、每个动作感觉怎样',['train.logs[].rpe','train.logs[].feel','train.history[].avgRpe',['train.weights.*[]',/ RPE\S+/g]]],
  ['live','实时进度','今天做到哪、第几组','TA 的今天页看不到你练到哪，也没有「一起练」',['live','train.today']],
  ['weeks','连续周数','每周练了几天','TA 那边不显示你俩连续几周',['weeks']],
  ['ai','允许 TA 的 AI 教练参考我的数据','','TA 的 AI 教练不读你的数据',[]]
];
function shareOn(k){ return !(S.share&&S.share[k]===false); }
function shareCatLabel(k){ const c=SHARE_CATS.find(x=>x[0]===k); return c?c[1]:String(k).slice(0,12); }
function _shareWalk(o,keys,fn){
  if(!o||typeof o!=='object') return;
  const k=keys[0], arr=k.endsWith('[]'), name=arr?k.slice(0,-2):k, rest=keys.slice(1);
  (name==='*'?Object.keys(o):[name]).forEach(n=>{
    if(!Object.prototype.hasOwnProperty.call(o,n)) return;
    if(!arr){ if(rest.length) _shareWalk(o[n],rest,fn); else fn(o,n); return; }
    const a=o[n]; if(!Array.isArray(a)) return;
    a.forEach((v,i)=>{ if(rest.length) _shareWalk(v,rest,fn); else fn(a,i); });
  });
}
function _shareFilter(p){
  const off=SHARE_CATS.map(c=>c[0]).filter(k=>!shareOn(k));
  if(!off.length) return p;   // 全开 = 和原来一字不差
  SHARE_CATS.forEach(([k,,,,paths])=>{
    if(shareOn(k)) return;
    paths.forEach(x=>{ const [path,re]=Array.isArray(x)?x:[x,null];
      _shareWalk(p,path.split('.'),(o,n)=>{ if(!re) delete o[n]; else if(typeof o[n]==='string') o[n]=o[n].replace(re,''); }); });
  });
  const o2=off.filter(k=>k!=='ai');
  if(o2.length) p.off=o2;
  if(!shareOn('ai')) p.aiOk=false;
  return p;
}
// 「我 → 03 · 共享给 TA」的开关(ui.js uiToggleSetting 的 share.*):改完立刻推一次共享文档
window.shareToggle=function(k){
  if(!SHARE_CATS.some(c=>c[0]===k)) return;
  S.share={...(S.share||{}),[k]:!shareOn(k)};
  saveState(); pushProfile();
  if(typeof uiRenderPairShare==='function') uiRenderPairShare();
  if(typeof flashSaved==='function') flashSaved();
};
// 对方关掉了哪一类(对方是旧版本 / 没配对 = 都没关)
function _ppOff(k){ const pp=_ppPaired(); return !!(pp&&Array.isArray(pp.off)&&pp.off.includes(k)); }
// 整份覆盖(不 merge):这份文档只由 buildSharedProfile 写,覆盖才能把过时的字段 / 已经不分享的数据一起清掉。
// 和上次推的一字不差就不推(saveState 每次都会排一次推送)
let _profileLast=null;
function pushProfile(){
  if(!_db||!_user) return;
  try{
    const p=buildSharedProfile(), key=_user.uid+'|'+JSON.stringify(p);
    if(key===_profileLast) return;
    _db.collection('users').doc(_user.uid).collection('shared').doc('profile')
       .set(p).then(()=>{_profileLast=key;}).catch(e=>console.warn('profile push failed:',e));
  }catch(e){ console.warn('profile push error:',e); }
}
function scheduleProfilePush(){
  if(!_db||!_user) return;
  clearTimeout(_profilePushTimer);
  _profilePushTimer=setTimeout(pushProfile,1500);
}
function subscribePartner(retry){
  if(_partnerUnsub){ _partnerUnsub(); _partnerUnsub=null; }
  clearTimeout(_partnerRetry);
  _partnerProfile=null;
  const pu=partnerUid();
  if(!(retry&&_ptRead==='denied')) _ptRead=pu&&_db&&_user?'loading':'idle';   // 15 秒一次的重试不把状态改回「正在连接」(免得状态行来回闪)
  if(!_db||!_user||!pu){ if(typeof updatePairUI==='function')updatePairUI(); if(typeof render==='function')render(); return; }
  _partnerUnsub=_db.collection('users').doc(pu).collection('shared').doc('profile').onSnapshot(doc=>{
    const prev=_partnerProfile;
    _partnerProfile=doc.exists?doc.data():null;
    _ptOnSnap(prev,doc.exists);
    if(typeof autoShiftCheck==='function')autoShiftCheck();   // 搭子顺延了 → 跟着对齐(core.js 没练自动顺延);没新批次时什么都不做
    if(typeof updatePartnerOverlap==='function')updatePartnerOverlap();
    if(typeof updatePairUI==='function')updatePairUI();
    // 只是实时进度 / 回应变了(对方每做完一组都会推一次):原地换搭子卡,不整页重画(免得打断正在输入的重量)
    if(_ptSig(prev)!==_ptSig(_partnerProfile)){ if(typeof render==='function')render(); } else ptRefresh();
  },e=>{
    // permission-denied = partner hasn't added me to their allowedReaders yet.
    // Firestore terminates a denied listener and won't auto-resume once access is
    // granted, so retry periodically until both sides have paired.
    const had=!!_partnerProfile;
    _partnerProfile=null; _ptRead='denied';
    if(had&&typeof render==='function')render();   // 刚刚还读得到(对方断开了):把今天页的搭子卡撤掉
    if(typeof updatePairUI==='function')updatePairUI();
    console.warn('partner read:',e.code||e.message);
    if(_partnerUnsub){ _partnerUnsub(); _partnerUnsub=null; }
    clearTimeout(_partnerRetry);
    _partnerRetry=setTimeout(()=>{ if(partnerUid()&&!_partnerProfile) subscribePartner(true); },15000);
  });
}
window.copyMyPairCode=function(){
  if(!_user){ showToast('请先登录'); return; }
  if(navigator.clipboard) navigator.clipboard.writeText(_user.uid).then(()=>showToast('配对码已复制')).catch(()=>showToast('配对码：'+_user.uid));
  else showToast('配对码：'+_user.uid);
};
window.savePartnerCode=function(){
  const inp=document.getElementById('partner-code-input');
  const code=inp?inp.value.trim():'';
  if(!_user){ showToast('请先登录再配对'); return; }
  if(code&&code===_user.uid){ showToast('不能填自己的配对码'); return; }
  if(code!==partnerUid()){ S.partnerSeen=null; S.partnerName=null; }
  S.partnerUid=code||null;
  if(code) S.partnerDays=null;   // paired: overlap follows partner's real day count
  saveState(); pushProfile(); subscribePartner(); updatePairUI(); flashSaved();
  showToast(code?'已保存搭子配对码':'已取消配对');
};
window.unpairPartner=function(){
  S.partnerUid=null; S.partnerSeen=null; S.partnerName=null; saveState(); pushProfile(); subscribePartner(); updatePairUI(); showToast('已解除配对');
};
// 旧入口(「我 → 03」原来的「给搭子加油」):现在是几种回应里的「加油」,对今天发
window.sendCheer=function(word){ ptReact(typeof word==='string'&&word?word:'加油','today',todayStr()); };
// 「我 → 03」:状态写清楚(没登录 / 还没配对 / 你已添加 TA、等 TA 加你 / 已互相配对 / TA 已经不跟你配对了)、分享链接、回应、最近收到的回应
function updatePairUI(){
  const me=document.getElementById('my-pair-code');
  if(me) me.textContent=_user?_user.uid:'（请先登录）';
  const inp=document.getElementById('partner-code-input');
  if(inp&&document.activeElement!==inp) inp.value=partnerUid()||'';
  const pu=partnerUid(), st=_ptState(), T=todayStr();
  const btn=document.getElementById('pair-btn');
  if(btn){ btn.textContent=pu?'断开':'连接'; btn.onclick=pu?unpairPartner:savePartnerCode; }
  const pdRow=document.getElementById('partner-days-row');
  if(pdRow) pdRow.style.display=pu?'none':'flex'; // paired → manual day-count hidden
  ['pair-share-btn','pair-qr-btn'].forEach(id=>{ const b=document.getElementById(id); if(b) b.disabled=!_user; });
  const shareBtn=document.getElementById('pair-share-btn');
  if(shareBtn) shareBtn.textContent=st==='ok'?'再发一次配对链接':'分享配对链接';
  const qr=document.getElementById('pair-qr');
  if(qr&&!qr.hidden){ if(_user) qr.innerHTML=_ptQrPanel(); else { qr.hidden=true; const qb=document.getElementById('pair-qr-btn'); if(qb) qb.setAttribute('aria-expanded','false'); } }
  const cheerRow=document.getElementById('pair-cheer');
  if(cheerRow){
    cheerRow.style.display=st==='ok'?'':'none';
    const w=document.getElementById('pair-words');
    if(w) w.innerHTML=st==='ok'?ptWordBtns('today',T,'cheer-btn'):'';
  }
  const status=document.getElementById('pair-status');
  if(status){
    const pp=_partnerProfile, nm=_escHtml(ptName(pp?pp.name:S.partnerName));
    status.style.display='block';
    status.dataset.state=st;
    if(st==='ok'){
      // 对方能控制的名字 / 类型 / 回应一律走 textContent(check-static 查这条);显示名再按 akane → Cici 换一次
      const v=ptView(), rx=ptRxWords('today',T);
      status.replaceChildren();
      const nameEl=document.createElement('b');
      nameEl.textContent=String(_partnerProfile.name||'搭子');
      nameEl.textContent=ptName(nameEl.textContent);
      const ok=document.createElement('span'); ok.className='olive'; ok.textContent='已连接 ';
      status.append(ok,nameEl,document.createTextNode(` · 你俩已互相配对 · 今天：${v?v.type:'—'}${v&&v.st==='done'?'（已练完）':''}${rx.length?` · TA 今天对你说：${rx.join('、')}`:''}`));
    }else status.innerHTML={
      signedout:'还没登录。登录后才能配对搭子。',
      none:'还没配对。点「分享配对链接」发给搭子，TA 打开后点「配对」就加上你了；再让 TA 把 TA 的链接发回给你，你俩就互相连上了。',
      loading:'正在连接搭子…',
      waiting:`<span class="accent">你已添加 ${S.partnerName?`<b>${nm}</b>`:'TA'}，等 TA 加你。</span>把你的配对链接发给 TA，TA 打开点「配对」就连上了。`,
      gone:`<span class="accent">${S.partnerName?`<b>${nm}</b>`:'TA'} 已经不跟你配对了</span>（TA 断开了，或者换了搭子）。可以点下面的「断开」，或者把你的配对链接重新发给 TA。`
    }[st]||'';
  }
  const rxEl=document.getElementById('pair-rx');
  if(rxEl){
    const list=st==='ok'?_ptRxList().filter(r=>r.d>=addDays(T,-13)).sort((a,b)=>(b.at||0)-(a.at||0)||b.d.localeCompare(a.d)).slice(0,5):[];
    rxEl.style.display=list.length?'':'none';
    rxEl.innerHTML=list.length?`<span class="sub-label">TA 最近的回应</span><ul class="pt-rx-list">${list.map(r=>`<li><span class="k">${r.to==='log'?`你 ${r.d.slice(5).replace('-','/')} 的打卡`:r.d===T?'今天':r.d.slice(5).replace('-','/')}</span><b>${_escHtml(r.w)}</b></li>`).join('')}</ul>`:'';
  }
}

// ══ 搭子:配对链接 / 实时进度 / 回应 / 双人连续周数 / 二维码 ═══════════════════
// 纸墨的 HTML 在这里(skinTpl 的 paperFn);运动的在 skin-sport.js(ptToday / ptWith 在 10 今天,ptLog / ptLogRx 在 30 记录)。
// 一切都只写自己的 shared/profile、只读对方的,不跨账号写(规则不用改)。
const PT_WORDS=['加油','太强了','一起练？','我也去'];   // 回应只有这几个固定词(推送、旧版本兼容都好办)
let _ptRead='idle';   // 读对方共享文档:idle / loading / ok / missing(文档不存在)/ denied(没权限 = 对方没加我,或者把我删了)
// 显示名:Cici 的账号名可能是 akane / aaakane(Cait:「akane就是cici」),界面上一律显示 Cici
function ptName(n){ const s=String(n==null?'':n).trim().slice(0,20); return /^a+kane/i.test(s)?'Cici':(s||'搭子'); }
function ptWord(w){ return PT_WORDS.includes(w)?w:'加油'; }   // 旧版本 cheer.emoji 里可能是表情符号:一律当「加油」
// 没登录 / 还没配对 / 正在连 / 你已添加 TA、等 TA 加你 / 已互相配对 / TA 已经不跟你配对了(读过对方、现在读不到了)
function _ptState(){
  if(!_user) return 'signedout';
  const pu=partnerUid(); if(!pu) return 'none';
  if(_partnerProfile) return 'ok';
  if(_ptRead==='loading') return 'loading';
  return S.partnerSeen===pu?'gone':'waiting';
}

// ── 实时进度 live(写进自己的 shared/profile;搭子的今天页搭子卡、「一起练」那行读它) ──
// 动作名过「给别人看」那套门控(_shareGated:私密池 + 盆底,owner 也照拦),私密的写「另有安排」;私密日整天只写「另有安排」。
// 「第几组」:引导训练里用引导卡的组数;今天页用运动风格的组进度(本机 fit_spsets);纸墨没有组进度就只写动作名。
function _ptWmOpen(date){ try{ return typeof _wmDate!=='undefined'&&_wmDate===date&&document.getElementById('workout-modal').classList.contains('open'); }catch(e){ return false; } }
function _ptLiveCore(){
  const T=todayStr(), td=S.plan&&S.plan.days?S.plan.days.find(d=>d.date===T):null;
  if(!td) return {date:T,st:'none'};
  if(td.isPrivateDay) return {date:T,st:'private'};
  if(td.isRest) return {date:T,st:'rest'};
  const gated=typeof _shareGated==='function'?_shareGated():new Set(typeof _PRIVATE_POOL!=='undefined'?_PRIVATE_POOL:[]), pd=S.prog[T]||{};
  const mains=td.exercises.map((e,i)=>[e,i]).filter(([e])=>!_isBlockWarm(e)&&!_isBlockStretch(e)&&!gated.has(e.name));
  const t0=typeof wkStartAt==='function'?(+wkStartAt(T)||0):0, g=_ptWmOpen(T);
  const st=LOG.some(l=>l.date===T)?'done':(t0||g||Object.values(pd).some(Boolean))?'training':'idle';
  const out={date:T,st,type:String(typeof _shareType==='function'?_shareType(td.workoutType,_coachDayK(td)):'训练').slice(0,20),done:mains.filter(([,i])=>pd[i]).length,total:mains.length};
  if(t0) out.t0=t0;
  if(st==='training'){
    let i=-1,set=0,sets=0;
    if(g){
      i=_wmIdx; const ex=td.exercises[i];
      if(ex){ const one=typeof _wmIsSimple==='function'&&_wmIsSimple(ex); sets=one?1:getAdj(T,i,'s',ex.sets); set=one?0:Math.min(_wmSet,sets); }
      out.guided=true;
    }else if(typeof _spDayState==='function'){
      const c=_spDayState(td).cur;
      if(c){ i=c[1]; sets=getAdj(T,i,'s',c[0].sets); const n=_spSetsDone(T,i,sets,!!pd[i]); set=(uiSkin()==='sport'||n>0)?Math.min(n+1,sets):0; }
    }
    const ex=i>=0?td.exercises[i]:null;
    if(ex){ const hide=gated.has(ex.name); out.cur={name:hide?'另有安排':String(ex.name).slice(0,24),...(set&&!hide?{set,sets}:{})}; }
  }
  return out;
}
// at = 实时进度最后一次「内容变了」的时间(不是推送时间:内容没变,文档就一字不差,不重复写)
let _ptLiveSig='',_ptLiveAt=0,_ptLiveTimer=null,_ptLivePushAt=0;
function _ptLiveStamp(live){ const sig=JSON.stringify(live); if(sig!==_ptLiveSig){ _ptLiveSig=sig; _ptLiveAt=Date.now(); } return {...live,at:_ptLiveAt}; }
// render() / renderGuided() / wmClose() 末尾调:进度变了就排一次推送。节流:两次之间至少隔 8 秒,期间的变化合并成一次推出去
function partnerLiveTick(){
  if(!_db||!_user||!partnerUid()||_ptLiveTimer) return;
  let sig=''; try{ sig=JSON.stringify(_ptLiveCore()); }catch(e){ return; }
  if(sig===_ptLiveSig) return;
  _ptLiveTimer=setTimeout(()=>{ _ptLiveTimer=null; _ptLivePushAt=Date.now(); pushProfile(); },Math.max(1500,8000-(Date.now()-_ptLivePushAt)));
}

// ── 双人连续周数:两个人这一周(周一到周日)都练够自己的每周目标,才算一周;只合作,不排名 ──
function _ptWeekKey(ds){ const d=new Date(ds+'T12:00:00'); return addDays(ds,-((d.getDay()+6)%7)); }
// 每周目标 = 每周练几天。私密日的打卡不进共享数据,所以计划里有私密日的,目标按平均每周私密日数减掉(不然永远凑不够)
function _ptGoal(){
  const days=Math.max(1,Math.min(7,Math.round(+S.days)||3)), pl=(S.plan&&S.plan.days)||[], priv=pl.filter(d=>d.isPrivateDay).length;
  return priv?Math.max(1,days-Math.round(priv/Math.max(1,pl.length/7))):days;
}
// 写进共享文档的 weeks:最近 26 周每周打卡了几天(和 train 同一套「给别人看」的门控:私密日、私密模式的记录不算,owner 也一样)
function _ptMyWeeks(){
  const ok=typeof _coachLogOk==='function'?_coachLogOk(true):(l=>l&&!l.subMetrics), cur=_ptWeekKey(todayStr()), from=addDays(cur,-7*25), n={};
  new Set(LOG.filter(l=>ok(l)&&l.date>=from).map(l=>l.date)).forEach(d=>{ const w=_ptWeekKey(d); n[w]=(n[w]||0)+1; });
  return {goal:_ptGoal(),n};
}
function _ptPartnerWeeks(pp){
  const goal=v=>Math.max(1,Math.min(7,Math.round(+v)||3)), isD=d=>/^\d{4}-\d\d-\d\d$/.test(d||''), n={};
  if(pp.weeks&&pp.weeks.n&&typeof pp.weeks.n==='object'){ Object.entries(pp.weeks.n).forEach(([w,c])=>{ if(isD(w)) n[w]=Math.max(0,+c||0); }); return {goal:goal(pp.weeks.goal||pp.days),n}; }
  // 对方还是旧版本(没有 weeks):用 train 里近 6 周的打卡明细照样数
  new Set(((pp.train&&Array.isArray(pp.train.logs))?pp.train.logs:[]).map(l=>l&&l.date).filter(isD)).forEach(d=>{ const w=_ptWeekKey(d); n[w]=(n[w]||0)+1; });
  return {goal:goal(pp.days),n};
}
function ptJointStreak(){
  const pp=_partnerProfile; if(!pp||!partnerUid()) return null;
  const me=_ptMyWeeks(), pa=_ptPartnerWeeks(pp), cur=_ptWeekKey(todayStr());
  const ok=w=>(me.n[w]||0)>=me.goal&&(pa.n[w]||0)>=pa.goal;
  let weeks=ok(cur)?1:0;   // 这周还没练够不算断:从上周往前数
  for(let w=addDays(cur,-7),k=0;k<52&&ok(w);w=addDays(w,-7),k++) weeks++;
  return {weeks,thisOk:ok(cur),me:me.n[cur]||0,meGoal:me.goal,pa:pa.n[cur]||0,paGoal:pa.goal};
}

// ── 回应:几个固定词,能对搭子的「今天」发,也能对搭子的某一次打卡发;写在自己的 shared/profile.reacts,对方读 ──
// 一条 = {w 词, to 'today' / 'log', d 对象的日期(今天 / 那次打卡的日期), at 发出时间};留 21 天、最多 30 条
function _ptMyReacts(){ const cut=Date.now()-21*864e5; return (S.reacts||[]).filter(r=>r&&r.at>cut&&PT_WORDS.includes(r.w)).slice(-30).map(r=>({w:r.w,to:r.to==='log'?'log':'today',d:String(r.d).slice(0,10),at:+r.at})); }
// 搭子发给我的(对方是旧版本:只有 cheer = 今天的「加油」)
function _ptRxList(pp){
  pp=pp||_partnerProfile; if(!pp) return [];
  if(Array.isArray(pp.reacts)) return pp.reacts.filter(r=>r&&typeof r.d==='string').map(r=>({w:ptWord(r.w),to:r.to==='log'?'log':'today',d:r.d.slice(0,10),at:+r.at||0}));
  const c=pp.cheer; return c&&c.date?[{w:ptWord(c.emoji),to:'today',d:String(c.date).slice(0,10),at:0}]:[];
}
function ptRxWords(to,d){ return [...new Set(_ptRxList().filter(r=>r.to===to&&r.d===d).map(r=>r.w))]; }
function ptMine(to,d){ return new Set((S.reacts||[]).filter(r=>r&&r.to===to&&r.d===d).map(r=>r.w)); }
// 一排回应按钮:发过的变实心、不能再点(同一个词对同一个对象只发一次)。firstId 给第一个按钮(「我 → 03」的 #cheer-btn,旧代码 / 测试认它)
function ptWordBtns(to,d,firstId){
  const mine=ptMine(to,d);
  return PT_WORDS.map((w,k)=>{ const on=mine.has(w); return `<button type="button" class="chip pt-w${on?' on':''}" data-w="${w}"${k===0&&firstId?` id="${firstId}"`:''}${on?` disabled aria-label="${w}，已发"`:''} onclick="ptReact('${w}','${to}','${d}')">${w}</button>`; }).join('');
}
window.ptReact=function(word,to,d){
  if(!partnerUid()){ showToast('先和搭子配对'); return; }
  word=ptWord(word); to=to==='log'?'log':'today'; d=/^\d{4}-\d\d-\d\d$/.test(d||'')?d:todayStr();
  if(ptMine(to,d).has(word)) return;
  const cut=Date.now()-21*864e5;
  S.reacts=(S.reacts||[]).filter(r=>r&&r.at>cut).concat([{w:word,to,d,at:Date.now()}]).slice(-30);
  if(to==='today') S.cheer={date:todayStr(),emoji:word};   // 旧版本只认 cheer(今天最近的一次;字段名沿用 emoji,内容是文字)
  saveState(); pushProfile();
  // 推送到对方手机(ai-push 提供;没有就算了)。ref:对今天 = 'today',对某次打卡 = 那次打卡的日期
  if(typeof window.pushNotifyPartner==='function'){ try{ window.pushNotifyPartner({kind:to==='today'?'cheer':'react',word,date:d,ref:to==='today'?'today':d}); }catch(e){ console.warn('pushNotifyPartner:',e); } }
  ptRefresh();
  showToast(`已发给 ${ptName(_partnerProfile?_partnerProfile.name:S.partnerName)}：${word}`);
};
// 收到新回应:弹一句(推送是另一条路;这里管 app 开着的时候)
function _ptToastNew(){
  const pp=_partnerProfile; if(!pp) return;
  const key=nsKey('fit_pt_rx'), list=_ptRxList(pp).filter(r=>r.at), mx=list.reduce((a,r)=>Math.max(a,r.at),0);
  let seen=0; try{ seen=+localStorage.getItem(key)||0; }catch(e){}
  if(!mx||mx<=seen) return;
  try{ localStorage.setItem(key,String(mx)); }catch(e){}
  if(!seen&&mx<Date.now()-10*60e3) return;   // 第一次读到:老的不弹
  const r=list.filter(x=>x.at>seen).sort((a,b)=>b.at-a.at)[0];
  showToast(`${ptName(pp.name)}：${r.w}${r.to==='log'?`（你 ${r.d.slice(5).replace('-','/')} 的打卡）`:''}`);
}

// ── 搭子今天怎么样(读对方的 live;对方是旧版本就退回 todayType / todayDone / train.today / train.plan) ──
const PT_ST={unk:'没共享进度',training:'在练',paused:'练到一半',done:'练完了',idle:'还没开练',rest:'今天休息',private:'另有安排',none:'今天没安排'};
function ptView(){
  const pp=_partnerProfile; if(!pp||!partnerUid()) return null;
  const T=todayStr(), lv=pp.live&&pp.live.date===T?pp.live:null, tr=pp.train&&typeof pp.train==='object'?pp.train:null;
  const planT=tr&&Array.isArray(tr.plan)?tr.plan.find(d=>d&&d.date===T):null;
  const active=!pp.lastActive||pp.lastActive===T;   // 对方今天打开过 app(旧文档没有这个字段:照旧信 todayType)
  const gated=typeof _shareGated==='function'?_shareGated():new Set(), s=(v,n)=>String(v==null?'':v).slice(0,n);   // 搭子的数据:照「给别人看」那套拦
  let type=active?pp.todayType:(planT&&planT.type), st='idle', done=null, total=null, cur=null, t0=0;
  if(lv){
    st=PT_ST[lv.st]&&lv.st!=='paused'?lv.st:'idle';
    if(lv.type) type=lv.type;
    done=Math.max(0,+lv.done||0); total=Math.max(0,+lv.total||0); t0=+lv.t0||0;
    if(lv.cur&&lv.cur.name){ const nm=s(lv.cur.name,24); cur={name:gated.has(nm)?'另有安排':nm,set:+lv.cur.set||0,sets:+lv.cur.sets||0}; }
    if(st==='training'&&!(Date.now()-(+lv.at||0)<45*60e3)) st='paused';   // 四十多分钟没动静(关了 app / 忘了打卡):不算「在练」
  }else if(active){
    const tt=tr&&tr.at===T&&tr.today?tr.today:null;
    if(tt){ done=Math.max(0,+tt.done||0); total=Math.max(0,+tt.total||0); }
    st=pp.todayDone||(tt&&tt.status==='已打卡')?'done':tt&&tt.status==='训练中'?'paused':'idle';
  }
  if(type==='休息'&&st==='idle') st='rest';
  if(type==='另有安排') st='private';
  if(!type||type==='—'){ if(st==='idle') st='none'; type='—'; }
  if(st==='private'){ type='另有安排'; cur=null; done=total=null; t0=0; }
  if(st==='idle'&&_ppOff('live')) st='unk';   // 对方关了实时进度:不知道练没练,别写「还没开练」
  return {name:ptName(pp.name),type:s(type,20),st,done,total,cur,t0};
}
function _ptProgTxt(v){ return v.total?`${v.done}/${v.total} 项`:''; }
function _ptNowTxt(v){ const c=v.cur; if(!c||c.name==='另有安排') return ''; return `在做 ${c.name}${c.set&&c.sets?` · 第 ${c.set}/${c.sets} 组`:''}`; }
function _ptHM(t){ const d=new Date(t); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

// 今天页的搭子卡(只在看今天、读得到对方时出现):纸墨是发丝线隔开的一小节,运动是白卡片
function ptTodayHtml(date){
  if(date!==todayStr()) return '';
  const v=ptView(); if(!v) return '';
  const e=_escHtml, rx=ptRxWords('today',date), live=v.st==='training'||v.st==='paused';
  const prog=live||v.st==='done'?_ptProgTxt(v):'', now=v.st==='training'?_ptNowTxt(v):'', start=live&&v.t0?_ptHM(v.t0)+' 开练':'';
  const off=v.st!=='private'&&_ppOff('live')?'TA 没共享实时进度':'';   // 对方在「共享给 TA」里关了实时进度:只有今天练什么、练完没
  return skinTpl('ptToday',{v,rx,date,prog,now,start,off},()=>`<section class="pt-line" id="pt-card" aria-label="搭子 ${e(v.name)} 今天">`
    + `<div class="pt-head"><span class="tag">[ 搭子 ]</span><b>${e(v.name)}</b><span class="pt-type">${e(v.type)}</span><span class="pt-st ${v.st}">${PT_ST[v.st]}</span></div>`
    + (prog||now||start?`<div class="note-line pt-prog">${[prog,e(now),start].filter(Boolean).join(' · ')}</div>`:'')
    + (off?`<div class="note-line pt-off">${off}</div>`:'')
    + (rx.length?`<div class="note-line pt-rx">TA 对你说：<b>${rx.map(e).join('、')}</b></div>`:'')
    + `<div class="chips pt-words" role="group" aria-label="给 ${e(v.name)} 回应">${ptWordBtns('today',date)}</div></section>`);
}
// 「一起练」一行:我在练(今天页训练中 / 引导训练里)、搭子也在练时,写「Cici 在做 臀推 · 第 2/4 组」。
// 读得到对方就先留一个 hidden 的占位,搭子开练时 ptRefresh 原地填上;没配对 / 读不到时什么都不输出(页面和原来一字不差)
function ptWithHtml(where){
  const v=ptView(); if(!v||_ppOff('live')) return '';   // 对方关了实时进度:连占位都不留
  const on=v.st==='training', now=_ptNowTxt(v), text=now?`${v.name} ${now}`:`${v.name} 也在练${v.total?` · ${v.done}/${v.total} 项`:''}`;
  return skinTpl('ptWith',{v,where,on,text},()=>`<div class="pt-with note-line" id="pt-with-${where}"${on?'':' hidden'}><span class="pt-dot" aria-hidden="true"></span>${_escHtml(text)}</div>`);
}
// 记录页「搭子」卡:你俩连续 N 周 + 本周各自进度 + TA 最近的打卡(能回应)。只列类型、时长、动作数、RPE,不列动作名
let _ptLogOpen=null;
function ptLogPanelHtml(){
  const pp=_partnerProfile; if(!pp||!partnerUid()) return '';
  // 对方在「共享给 TA」里关了连续周数 → js = null(不拿打卡明细替它数);关了打卡记录 → logsOff,列表换成一句说明
  const name=ptName(pp.name), js=_ppOff('weeks')?null:ptJointStreak(), logsOff=_ppOff('logs'), e=_escHtml, s=(v,n)=>String(v==null?'':v).slice(0,n);
  const logs=((pp.train&&Array.isArray(pp.train.logs))?pp.train.logs:[]).filter(l=>l&&/^\d{4}-\d\d-\d\d$/.test(l.date||'')).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5)
    .map(l=>({date:l.date,workout:s(l.workout||'训练',16),min:Math.max(0,+l.min||0),rpe:Math.max(0,+l.rpe||0),n:Array.isArray(l.ex)?l.ex.length:0,mine:[...ptMine('log',l.date)],open:_ptLogOpen===l.date}));
  return skinTpl('ptLog',{name,js,logs,logsOff},()=>`<div class="panel" id="pt-log"><p class="panel-title">搭子 · ${e(name)}</p>`
    + (js?`<div class="kv wide"><span class="k">你俩连续</span><span><b>${js.weeks}</b> 周</span><span class="k">本周</span><span>你 ${js.me}/${js.meGoal} · ${e(name)} ${js.pa}/${js.paGoal}${js.thisOk?' · <span class="olive">这周算上了</span>':''}</span></div>`
    + `<div class="foot-note">两个人这一周都练够各自的每周天数，才算一周。只看一起坚持了多久，不比谁练得多。</div>`
      :`<div class="kv wide pt-off"><span class="k">你俩连续</span><span>TA 没共享</span></div>`)
    + (logsOff?`<div class="note-line pt-off">TA 没共享打卡记录</div>`:'')
    + (logs.length?`<p class="sub-label">${e(name)} 最近的打卡</p><div class="pt-logs">${logs.map(l=>`<div class="pt-lrow"><div class="pt-ltop"><span class="pt-ltxt"><span class="lw">${e(l.workout)}</span><span class="lt">${_ptLogMeta(l)}</span></span>`
      + `<button type="button" class="link-btn u" data-d="${l.date}" aria-expanded="${l.open}" onclick="ptLogToggle('${l.date}')">${l.open?'收起':'回应'}</button></div>`
      + (l.mine.length?`<div class="note-line">你说：${l.mine.map(e).join('、')}</div>`:'')
      + (l.open?`<div class="chips pt-words" role="group" aria-label="回应 ${e(name)} ${l.date.slice(5).replace('-','/')} 的打卡">${ptWordBtns('log',l.date)}</div>`:'')
      + `</div>`).join('')}</div>`:'')
    + `</div>`);
}
function _ptLogMeta(l){ return `${l.date.slice(5).replace('-','/')}${l.min?` · ${l.min} min`:''}${l.n?` · ${l.n} 个动作`:''}${l.rpe?` · RPE ${l.rpe}`:''}`; }
window.ptLogToggle=function(d){
  _ptLogOpen=_ptLogOpen===d?null:d;
  _ptSwap('pt-log',ptLogPanelHtml());
  const b=document.querySelector(`#pt-log [data-d="${d}"]`); if(b) try{ b.focus({preventScroll:true}); }catch(e){}
};
// 我的日志行下面:搭子对这次打卡的回应
function ptLogRxHtml(date){
  const pp=_partnerProfile; if(!pp||!partnerUid()) return '';
  const w=ptRxWords('log',date); if(!w.length) return '';
  return skinTpl('ptLogRx',{name:ptName(pp.name),w},({name,w})=>`<div class="pt-rx-log note-line">${_escHtml(name)}：<b>${w.map(_escHtml).join('、')}</b></div>`);
}

// ── 对方文档到了 ──
// 会频繁变的(实时进度、回应、今天勾了几个)不算「内容变了」:只变这些就原地换搭子卡,不整页重画
function _ptSig(p){ if(!p) return ''; const {live,reacts,cheer,lastActive,todayDone,train,...rest}=p; return JSON.stringify([rest,train?{...train,today:null,at:null}:null]); }
// 记住「读到过」:以后读不到了 = TA 不跟你配对了。自己的第一份云端快照到之前只记在内存:这时写盘会把本机弄脏,
// 那份快照就会被当成「本机有没推上去的改动」跳过,接着本机的旧数据整键推上去(_onOwnSnap 收到后再调一次,那时才写)
function _ptSeenSync(){
  const pu=partnerUid(), pp=_partnerProfile; if(!pp||!pu) return;
  const nm=String(pp.name||'').slice(0,20);
  if(S.partnerSeen!==pu||(nm&&S.partnerName!==nm)){ S.partnerSeen=pu; if(nm) S.partnerName=nm; if(!_user||_cloudSeq>0) saveState(); }
}
function _ptOnSnap(prev,exists){
  const pu=partnerUid(), pp=_partnerProfile;
  _ptRead=exists?'ok':'missing';
  if(pp&&pu){
    const nm=String(pp.name||'').slice(0,20);
    _ptSeenSync();
    _ptToastNew();
  }
  const m=document.getElementById('pt-pair-modal');
  if(_ptModalStep===2&&m&&m.classList.contains('open')) _ptModalShow2();
}
// 原地换:今天页搭子卡、「一起练」那行(今天页 / 引导卡)、记录页搭子卡;焦点留在原来那个按钮(发过的词变成不能点:落到下一个能点的)
function _ptSwap(id,html){
  const el=document.getElementById(id); if(!el) return;
  const a=document.activeElement, idx=a&&el.contains(a)?[...el.querySelectorAll('button')].indexOf(a):-1;
  const t=document.createElement('div'); t.innerHTML=html||''; const n=t.firstElementChild;
  if(!n){ el.remove(); return; }
  el.replaceWith(n);
  if(idx>=0){ const bs=[...n.querySelectorAll('button')], b=bs.slice(idx).find(x=>!x.disabled)||bs.find(x=>!x.disabled); if(b) try{ b.focus({preventScroll:true}); }catch(e){} }
}
function ptRefresh(){
  const T=todayStr();
  _ptSwap('pt-card',ptTodayHtml(T));
  _ptSwap('pt-with-f',ptWithHtml('f'));
  _ptSwap('pt-with-g',ptWithHtml('g'));
  _ptSwap('pt-log',ptLogPanelHtml());
  if(typeof uiCurrentTab!=='undefined'&&uiCurrentTab==='log'&&typeof renderLog==='function') renderLog();
  updatePairUI();
}

// ── 配对链接:「我 → 03」分享 #pair=<我的 uid>&n=<名字>;对方打开 → 确认「和 X 配对？」→ 写进 TA 自己的 partnerUid ──
// 规则只允许各写各的,对方没法替我把 TA 加进我的 allowedReaders(我也不知道 TA 的 uid):所以 TA 确认后要把 TA 的链接发回来,我点一次,才算互相配对。
function _ptMyName(){ return (S.displayName&&S.displayName.trim())||(_user&&_user.displayName?_user.displayName.split(' ')[0]:'')||''; }
function ptPairUrl(){
  if(!_user) return '';
  let base=location.href.split('#')[0].split('?')[0]; try{ base=new URL('index.html',base).href; }catch(e){}
  const nm=_ptMyName().slice(0,20);
  return `${base}#pair=${encodeURIComponent(_user.uid)}${nm?'&n='+encodeURIComponent(nm):''}`;
}
// iPhone / 安卓:系统分享面板;不支持就复制;复制也不行就把二维码和链接摊开
window.sharePairLink=async function(){
  if(!_user){ showToast('请先登录'); return; }
  const url=ptPairUrl();
  if(navigator.share){ try{ await navigator.share({title:'做我的训练搭子',text:'打开链接，点「配对」，我们就是训练搭子了。',url}); return; }catch(e){ if(e&&e.name==='AbortError') return; } }
  try{ await navigator.clipboard.writeText(url); showToast('配对链接已复制，发给搭子'); }
  catch(e){ togglePairQR(true); showToast('没能复制，长按下面的链接手动复制'); }
};
window.togglePairQR=function(force){
  const box=document.getElementById('pair-qr'), b=document.getElementById('pair-qr-btn'); if(!box) return;
  const open=force===true||box.hidden;
  if(open&&!_user){ showToast('请先登录'); return; }
  box.hidden=!open; if(b) b.setAttribute('aria-expanded',String(open));
  box.innerHTML=open?_ptQrPanel():'';
};
function _ptQrPanel(){
  const url=ptPairUrl(); if(!url) return '';
  return `<div class="pair-qr-img">${ptQrSvg(url,'配对链接二维码')}</div><span class="foot-note">让搭子用手机相机扫一下，或者把这个链接发过去：</span><code class="pair-url">${_escHtml(url)}</code>`;
}
// 打开带 #pair= 的链接:先记在 sessionStorage(没登录要先去登录,Google 登录会整页跳走再回来),再从地址栏拿掉;登录状态定了(handleAuth)再问
const _PT_PEND='fit_pair_pending';
function _ptReadLink(){
  try{
    const h=location.hash||'', m=/[#&]pair=([A-Za-z0-9_-]{6,128})/.exec(h); if(!m) return false;
    const nm=/[#&]n=([^&]*)/.exec(h); let name=''; try{ name=nm?decodeURIComponent(nm[1]):''; }catch(e){}
    sessionStorage.setItem(_PT_PEND,JSON.stringify({uid:m[1],name:String(name).trim().slice(0,20)}));
    history.replaceState(null,'',location.pathname+location.search);
    return true;
  }catch(e){ return false; }
}
_ptReadLink();
window.addEventListener('hashchange',()=>{ if(_ptReadLink()&&typeof _authKnown!=='undefined'&&_authKnown) ptResumePending(); });
function _ptPending(){ try{ return JSON.parse(sessionStorage.getItem(_PT_PEND)||'null'); }catch(e){ return null; } }
function _ptClearPending(){ try{ sessionStorage.removeItem(_PT_PEND); }catch(e){} }
let _ptModalStep=0,_ptModalP=null;
function ptResumePending(){
  const p=_ptPending(); if(!p||!p.uid) return;
  if(!_user){ _ptModalLogin(p); return; }
  _ptClearPending(); _ptModalP=p;
  if(p.uid===_user.uid){ showToast('这是你自己的配对链接，发给搭子用'); return; }
  if(partnerUid()===p.uid){ if(_ptState()==='ok') showToast(`已经和 ${ptName(_partnerProfile.name)} 配对了`); else _ptModalShow2(); return; }
  _ptModalAsk();
}
// 确认弹窗(底部面板;压在新手设置上面,刚注册的人也看得到)
function _ptModal(inner){
  let m=document.getElementById('pt-pair-modal');
  if(!m){ m=document.createElement('div'); m.id='pt-pair-modal'; m.className='ex-modal-overlay'; m.onclick=e=>{ if(e.target===m) ptPairClose(); }; document.body.appendChild(m); }
  m.innerHTML=`<div class="ex-modal-card pt-pair-card" onclick="event.stopPropagation()">${inner}</div>`;
  m.classList.add('open');
}
function _ptHdr(t){ return `<div class="ex-modal-hdr"><div><div class="sheet-eyebrow">训练搭子</div><h3 class="ex-modal-title">${t}</h3></div><button type="button" class="ex-modal-close" onclick="ptPairCancel()">关闭</button></div>`; }
window.ptPairClose=function(){ _ptModalStep=0; uiCloseOverlay('pt-pair-modal'); };
if(typeof _uiOverlayClose!=='undefined') _uiOverlayClose['pt-pair-modal']=()=>ptPairClose();   // Esc = 关闭(没登录时那份待配对留着,登录后照样接着问)
window.ptPairCancel=function(){ _ptClearPending(); _ptModalP=null; ptPairClose(); };
function _ptModalAsk(){
  const p=_ptModalP, nm=_escHtml(ptName(p.name)), cur=partnerUid();
  _ptModalStep=1;
  _ptModal(_ptHdr(`和 ${nm} 配对？`)
    + `<p class="sheet-desc">配对后你俩能看到对方今天练什么、练到第几组，能互相回应；训练计划、记录、重量和感受默认互通，AI 教练也会参考，每一类都能在「我 → 03」关掉。身体数据、备注原文和私密内容不分享。</p>`
    + (cur?`<p class="sheet-desc pt-warn">你现在的搭子是 ${_escHtml(ptName(_partnerProfile?_partnerProfile.name:S.partnerName))}，配对后换成 ${nm}。</p>`:'')
    + `<button type="button" class="btn-primary" onclick="ptPairConfirm()">配对</button><button type="button" class="btn-ghost" onclick="ptPairCancel()">先不了</button>`);
}
window.ptPairConfirm=function(){
  const p=_ptModalP; if(!p||!_user){ ptPairClose(); return; }
  if(p.uid!==partnerUid()) S.partnerSeen=null;
  S.partnerUid=p.uid; S.partnerName=p.name||null; S.partnerDays=null;
  saveState(); pushProfile(); subscribePartner(); updatePairUI();
  _ptModalShow2();
};
function _ptModalShow2(){
  const p=_ptModalP||{}, ok=_ptState()==='ok', nm=_escHtml(ptName(ok?_partnerProfile.name:(p.name||S.partnerName)));
  _ptModalStep=2;
  _ptModal(_ptHdr(ok?`和 ${nm} 配对好了`:`已添加 ${nm}`)
    + (ok?`<p class="sheet-desc">你俩已经互相配对。今天页能看到 TA 练到哪了，也能给 TA 回应。</p><button type="button" class="btn-primary" onclick="ptPairClose();showTab('today')">去今天页</button>`
      :`<p class="sheet-desc">还差一步：把你的配对链接发给 ${nm}，TA 打开点「配对」，你俩就连上了。</p><button type="button" class="btn-primary" onclick="sharePairLink()">分享我的配对链接</button><button type="button" class="btn-ghost" onclick="ptPairClose()">稍后再发</button>`));
}
function _ptModalLogin(p){
  _ptModalP=p; _ptModalStep=1;
  _ptModal(_ptHdr(`${_escHtml(ptName(p.name))} 邀请你做训练搭子`)
    + `<p class="sheet-desc">先登录（或注册）再配对，登录后会接着问你。</p>`
    + `<button type="button" class="btn-primary" onclick="ptPairGoLogin()">去登录</button>`
    + `<p class="sheet-desc">平时用的是装到主屏幕的 app？打开 app，在「我 → 03」把这个配对码粘贴进去也行：</p>`
    + `<div class="pt-code-row"><code class="pair-code">${_escHtml(p.uid)}</code><button type="button" class="btn-line" onclick="ptCopyPendingCode()">复制</button></div>`
    + `<button type="button" class="btn-ghost" onclick="ptPairCancel()">先不了</button>`);
}
window.ptCopyPendingCode=function(){
  const p=_ptModalP; if(!p) return;
  if(navigator.clipboard) navigator.clipboard.writeText(p.uid).then(()=>showToast('配对码已复制')).catch(()=>showToast('配对码：'+p.uid)); else showToast('配对码：'+p.uid);
};
window.ptPairGoLogin=function(){
  _ptModalStep=0; uiCloseOverlay('pt-pair-modal');
  if(typeof _oobe!=='undefined'&&_oobe.open&&typeof uiOobeSkip==='function') uiOobeSkip(true);   // 新手设置盖着:先关掉(和 Esc 一样,不替人生成计划)
  showTab('me');
  setTimeout(()=>{ const i=document.getElementById('login-email'); if(i) try{ i.scrollIntoView({block:'center'}); i.focus({preventScroll:true}); }catch(e){} },80);
};

// ── 二维码:自写小生成器(字节模式、纠错 M、版本 1–10,最多约 210 字节;配对链接一般 100 字节上下)。不引 CDN,离线也能出 ──
const _QR_M=[null,[10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],[16,4,27,0,0],[18,4,31,0,0],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44]];   // [每块纠错码数, 组一块数, 组一每块数据码, 组二块数, 组二每块数据码]
const _QR_AL=[null,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];   // 校正图形中心
function ptQrMatrix(text){
  const bytes=[...new TextEncoder().encode(String(text))];
  let ver=1;
  while(ver<=10&&12+(ver>9?8:0)+bytes.length*8>(_QR_M[ver][1]*_QR_M[ver][2]+_QR_M[ver][3]*_QR_M[ver][4])*8) ver++;
  if(ver>10) return null;
  const [ecn,b1,d1,b2,d2]=_QR_M[ver], dn=b1*d1+b2*d2, n=17+4*ver;
  // 数据码:模式 0100 + 长度 + 字节 + 结束符,补齐整字节,再用 EC / 11 填满
  const bits=[], put=(v,k)=>{ for(let i=k-1;i>=0;i--) bits.push(v>>>i&1); };
  put(4,4); put(bytes.length,ver>9?16:8); bytes.forEach(b=>put(b,8)); put(0,Math.min(4,dn*8-bits.length));
  while(bits.length%8) bits.push(0);
  const data=[]; for(let i=0;i<bits.length;i+=8) data.push(bits.slice(i,i+8).reduce((a,b)=>a<<1|b,0));
  for(let p=0xEC;data.length<dn;p^=0xEC^0x11) data.push(p);
  // 里德-所罗门纠错码(GF(256),本原多项式 0x11D),分块后交织
  const EXP=[],LOG=[]; for(let i=0,x=1;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if(x&256) x^=0x11D; }
  const mul=(a,b)=>a&&b?EXP[(LOG[a]+LOG[b])%255]:0;
  let gen=[1]; for(let i=0;i<ecn;i++){ const g=new Array(gen.length+1).fill(0); gen.forEach((c,j)=>{ g[j]^=c; g[j+1]^=mul(c,EXP[i]); }); gen=g; }
  const blocks=[]; let off=0;
  for(let k=0;k<b1+b2;k++){ const len=k<b1?d1:d2, blk=data.slice(off,off+len); off+=len; const r=new Array(ecn).fill(0); blk.forEach(b=>{ const f=b^r.shift(); r.push(0); for(let j=0;j<ecn;j++) r[j]^=mul(gen[j+1],f); }); blocks.push([blk,r]); }
  const cw=[]; for(let i=0;i<Math.max(d1,d2);i++) blocks.forEach(([b])=>{ if(i<b.length) cw.push(b[i]); });
  for(let i=0;i<ecn;i++) blocks.forEach(([,r])=>cw.push(r[i]));
  // 功能图形:时序 / 定位(带分隔) / 校正 / 格式 / 版本
  const M=Array.from({length:n},()=>new Array(n).fill(0)), F=Array.from({length:n},()=>new Array(n).fill(false));
  const set=(x,y,v)=>{ M[y][x]=v?1:0; F[y][x]=true; };
  for(let i=0;i<n;i++){ set(6,i,i%2===0); set(i,6,i%2===0); }
  [[3,3],[n-4,3],[3,n-4]].forEach(([cx,cy])=>{ for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++){ const x=cx+dx,y=cy+dy,d=Math.max(Math.abs(dx),Math.abs(dy)); if(x>=0&&y>=0&&x<n&&y<n) set(x,y,d!==2&&d!==4); } });
  const al=_QR_AL[ver], L=al.length;
  al.forEach((ay,i)=>al.forEach((ax,j)=>{ if((!i&&!j)||(!i&&j===L-1)||(i===L-1&&!j)) return; for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1); }));
  const fmt=mask=>{   // 纠错 M = 00,BCH(15,5),掩 0x5412
    let r=mask; for(let i=0;i<10;i++) r=r<<1^(r>>>9)*0x537;
    const b=(mask<<10|r)^0x5412, bit=i=>b>>>i&1;
    for(let i=0;i<=5;i++) set(8,i,bit(i));
    set(8,7,bit(6)); set(8,8,bit(7)); set(7,8,bit(8));
    for(let i=9;i<15;i++) set(14-i,8,bit(i));
    for(let i=0;i<8;i++) set(n-1-i,8,bit(i));
    for(let i=8;i<15;i++) set(8,n-15+i,bit(i));
    set(8,n-8,1);
  };
  fmt(0);
  if(ver>=7){ let r=ver; for(let i=0;i<12;i++) r=r<<1^(r>>>11)*0x1F25; const b=ver<<12|r; for(let i=0;i<18;i++){ const v=b>>>i&1,a=n-11+i%3,c=Math.floor(i/3); set(a,c,v); set(c,a,v); } }
  // 数据:从右下角起两列一组,之字形上下填
  let k=0;
  for(let right=n-1;right>=1;right-=2){
    if(right===6) right=5;
    for(let v=0;v<n;v++) for(let j=0;j<2;j++){ const x=right-j,y=(right+1&2)===0?n-1-v:v; if(!F[y][x]&&k<cw.length*8){ M[y][x]=cw[k>>>3]>>>7-(k&7)&1; k++; } }
  }
  // 八种掩码挑罚分最低的(连续同色、2×2 色块、类定位图形、深浅比例)
  const MASK=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,x=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
    (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
  const apply=m=>{ for(let y=0;y<n;y++) for(let x=0;x<n;x++) if(!F[y][x]&&MASK[m](x,y)) M[y][x]^=1; };
  const score=()=>{
    let s=0,dark=0;
    for(let i=0;i<n;i++) [M[i].join(''),M.map(r=>r[i]).join('')].forEach(l=>{ (l.match(/0{5,}|1{5,}/g)||[]).forEach(r=>s+=r.length-2); s+=40*(l.match(/(?=10111010000|00001011101)/g)||[]).length; });
    for(let y=0;y<n-1;y++) for(let x=0;x<n-1;x++){ const c=M[y][x]; if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1]) s+=3; }
    M.forEach(r=>r.forEach(c=>dark+=c));
    return s+10*Math.floor(Math.abs(dark*20-n*n*10)/(n*n));
  };
  let best=0,bestS=Infinity;
  for(let m=0;m<8;m++){ apply(m); fmt(m); const s=score(); if(s<bestS){ bestS=s; best=m; } apply(m); }
  apply(best); fmt(best);
  return M;
}
// 二维码 SVG:白底黑块 + 4 格留白(深色模式也保持白底黑块,手机相机才认得出)
function ptQrSvg(text,label){
  const M=ptQrMatrix(text); if(!M) return '';
  const n=M.length,q=4,d=[];
  M.forEach((r,y)=>r.forEach((c,x)=>{ if(c) d.push(`M${x+q} ${y+q}h1v1h-1z`); }));
  return `<svg xmlns="http://www.w3.org/2000/svg" class="qr-svg" viewBox="0 0 ${n+2*q} ${n+2*q}" role="img" aria-label="${_escHtml(label||'二维码')}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${d.join('')}" fill="#111111"/></svg>`;
}

// ══ UI Bindings ══════════════════════════════════════════
// 计划页 / 新手设置 / 我 的控件统一在 ui.js 里分发(data-group / data-step / data-toggle)
function flashSaved(){
  const dot=document.getElementById('saved-dot');
  if(dot){dot.classList.add('show');setTimeout(()=>dot.classList.remove('show'),1200);}
}

window.toggleChangelog=function(){
const el=document.getElementById('changelog-box'), btn=document.getElementById('app-version');
if(!el)return;
const open=el.style.display==='none';
el.style.display=open?'block':'none';
if(btn){btn.setAttribute('aria-expanded',String(open));btn.textContent=btn.textContent.replace(/[▾▴]$/,open?'▴':'▾');}
};

window.renderExcludedList=function(){
if(typeof uiRenderP7==='function')uiRenderP7();
const list=document.getElementById('excluded-list');
const head=document.getElementById('excluded-head');
if(!list) return;
const arr=S.userExcluded||[];
if(head)head.textContent=`07 — 已排除的动作 / 器械 · ${arr.length}`;
if(!arr.length){ list.innerHTML='<span class="note-line" style="color:var(--faint)">— 没有排除的动作。</span>'; return; }
list.innerHTML=arr.map(name=>{
const reason=S.userExcludeReasons&&S.userExcludeReasons[name]?S.userExcludeReasons[name]:'用户手动排除';
return `<div class="ex-list-row"><span><span class="n">${_escHtml(name)}</span><span class="why">${_escHtml(reason)}</span></span><button type="button" class="btn-line" data-act="restore" data-name="${_escHtml(name)}" aria-label="恢复 ${_escHtml(name)}">恢复</button></div>`;
}).join('');
};
window.cyclePeriodStart=function(){S.cycleDay=1;S.cycleSetAt=todayStr();saveState();applySettingsToUI();flashSaved();if(typeof showToast==='function')showToast('已记录：周期第 1 天');};

// ══ Share Card Generator ════════════════════════════════
let _currentShareImgUrl = null;
let _currentShareDate = '';

function shareWorkoutFromIndex(idx) {
    const lg = LOG[idx];
    if (lg) openShareModal(lg);
}

function openShareModal(logEntry) {
    if (!logEntry) return;
    const imgUrl = drawShareCard(logEntry);
    _currentShareImgUrl = imgUrl;
    _currentShareDate = logEntry.date;
    
    const container = document.getElementById('share-card-preview-container');
    if (container) {
        container.innerHTML = `<img src="${imgUrl}" alt="打卡卡片预览" />`;
    }
    // 第一次画时网络字体可能还没到(canvas 不等字体):到了再画一遍
    if (typeof skinCanvasRedraw === 'function') skinCanvasRedraw(() => {
        const m = document.getElementById('share-modal'), img = container && container.querySelector('img');
        if (!m || !m.classList.contains('open') || _currentShareDate !== logEntry.date || !img) return;
        _currentShareImgUrl = drawShareCard(logEntry); img.src = _currentShareImgUrl;
    });
    
    const modal = document.getElementById('share-modal');
    if (modal) modal.classList.add('open');
}

function closeShareModal() {
    const modal = document.getElementById('share-modal');
    if (modal) modal.classList.remove('open');
}

function downloadShareCard() {
    if (!_currentShareImgUrl) return;
    const a = document.createElement('a');
    a.href = _currentShareImgUrl;
    a.download = `cici_workout_${_currentShareDate}.png`;
    a.click();
}

// ══ Achievement Badges & Sharing ═════════════════════════
let _currentAchType = '';
let _currentAchIdx = 0;
let _currentAchImgUrl = '';
let _achShareMode = false;

function openAchievementModal(type, index) {
    const ms = (type === 'gym' ? GYM_MILESTONES : SWIM_MILESTONES)[index];
    const userLog = type === 'gym' ? GYM_LOG : SWIM_LOG;
    const isUnlocked = userLog.count >= ms.count;
    const matchedLog = userLog.milestones.find(m => m.count === ms.count);
    const dateStr = matchedLog ? matchedLog.date : '';
    
    _currentAchType = type;
    _currentAchIdx = index;
    _currentAchImgUrl = '';
    _achShareMode = false;
    
    document.getElementById('ach-modal-name').textContent = ms.title;
    document.getElementById('ach-modal-desc').textContent = ms.desc;
    
    const statusEl = document.getElementById('ach-modal-status');
    if (isUnlocked) {
        statusEl.textContent = `已解锁 · ${dateStr}`;
        statusEl.style.color = 'var(--sage)';
    } else {
        statusEl.textContent = `未解锁 · 进度 ${userLog.count}/${ms.count}`;
        statusEl.style.color = 'var(--ink3)';
    }
    
    // Set Badge SVG
    const badgeContainer = document.getElementById('ach-modal-badge-container');
    badgeContainer.innerHTML = getAchievementBadgeSvg(ms, isUnlocked);
    
    // Hide share preview and reset button
    document.getElementById('ach-modal-share-container').style.display = 'none';
    const actionBtn = document.getElementById('ach-action-btn');
    actionBtn.textContent = '生成成就卡片';
    
    // Open Modal
    document.getElementById('achievement-modal').classList.add('open');
}

function closeAchievementModal() {
    document.getElementById('achievement-modal').classList.remove('open');
}

function toggleAchShareCard() {
    const btn = document.getElementById('ach-action-btn');
    const container = document.getElementById('ach-modal-share-container');
    
    if (!_achShareMode) {
        // Draw the share card
        const imgUrl = drawAchievementShareCard(_currentAchType, _currentAchIdx);
        _currentAchImgUrl = imgUrl;
        
        container.innerHTML = `<img src="${imgUrl}" alt="成就卡片" />`;
        const _t = _currentAchType, _i = _currentAchIdx;
        if (typeof skinCanvasRedraw === 'function') skinCanvasRedraw(() => {   // 字体到了再画一遍(同上)
            const img = container.querySelector('img');
            if (!_achShareMode || _t !== _currentAchType || _i !== _currentAchIdx || !img) return;
            _currentAchImgUrl = drawAchievementShareCard(_t, _i); img.src = _currentAchImgUrl;
        });
        container.style.display = 'flex';
        btn.textContent = '下载勋章卡';
        _achShareMode = true;
    } else {
        // Download the share card
        if (!_currentAchImgUrl) return;
        const ms = (_currentAchType === 'gym' ? GYM_MILESTONES : SWIM_MILESTONES)[_currentAchIdx];
        const a = document.createElement('a');
        a.href = _currentAchImgUrl;
        a.download = `cici_achievement_${ms.title}.png`;
        a.click();
    }
}

function getAchievementBadgeSvg(ms, isUnlocked) {
    const opacity = isUnlocked ? 1.0 : 0.25;
    const filter = isUnlocked ? '' : 'filter="url(#ach-grayscale)"';
    
    let primaryColor, secondaryColor, accentColor, innerIcon;
    const count = ms.count;
    const isSwim = ms.desc.includes('游泳');

    if (count <= 3) {
        primaryColor = '#b25e36';
        secondaryColor = '#e3a88a';
        accentColor = '#f5b595';
    } else if (count <= 10) {
        primaryColor = '#64748b';
        secondaryColor = '#cbd5e1';
        accentColor = '#94a3b8';
    } else if (count <= 30) {
        primaryColor = '#b45309';
        secondaryColor = '#fef08a';
        accentColor = '#f59e0b';
    } else {
        primaryColor = '#0369a1';
        secondaryColor = '#bae6fd';
        accentColor = '#38bdf8';
    }

    if (isSwim) {
        if (count <= 3) {
            innerIcon = `<path d="M12,28 C16,28 17,24 20,24 C23,24 24,28 28,28 C32,28 33,24 36,24 C39,24 40,28 44,28" stroke="${primaryColor}" stroke-width="3" fill="none" stroke-linecap="round" />
                         <path d="M12,34 C16,34 17,30 20,30 C23,30 24,34 28,34 C32,34 33,30 36,30 C39,30 40,34 44,34" stroke="${accentColor}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8" />`;
        } else if (count <= 5) {
            innerIcon = `<path d="M14,30 C20,22 36,22 42,30 C36,38 20,38 14,30 Z" fill="${accentColor}" opacity="0.8"/>
                         <path d="M42,30 L48,24 L46,30 L48,36 Z" fill="${primaryColor}"/>
                         <circle cx="20" cy="28" r="1.5" fill="#fff"/>`;
        } else if (count <= 10) {
            innerIcon = `<circle cx="28" cy="20" r="4" fill="${primaryColor}"/>
                         <path d="M16,28 Q28,24 40,28 M20,34 Q28,32 36,34" stroke="${accentColor}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
        } else if (count <= 20) {
            innerIcon = `<path d="M28,16 L28,38 M22,16 L22,24 Q28,26 34,24 L34,16 M20,20 L20,16 M36,20 L36,16" stroke="${primaryColor}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
        } else if (count <= 30) {
            innerIcon = `<path d="M16,32 L40,32 L36,38 L20,38 Z" fill="${primaryColor}"/>
                         <path d="M26,14 L26,30 M26,16 L36,26 L26,26 Z" fill="${accentColor}" opacity="0.9"/>`;
        } else {
            innerIcon = `<path d="M16,22 L22,16 L28,24 L34,16 L40,22 L38,32 L18,32 Z" fill="${primaryColor}"/>
                         <path d="M12,36 Q28,30 44,36" stroke="${accentColor}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
        }
    } else {
        if (count <= 1) {
            innerIcon = `<rect x="26" y="16" width="4" height="20" rx="2" fill="${primaryColor}"/>
                         <rect x="20" y="18" width="16" height="4" rx="1" fill="${accentColor}"/>
                         <rect x="20" y="30" width="16" height="4" rx="1" fill="${accentColor}"/>`;
        } else if (count <= 3) {
            innerIcon = `<path d="M22,24 C18,24 16,27 16,32 C16,37 20,40 28,40 C36,40 40,37 40,32 C40,27 38,24 34,24 Z" fill="${primaryColor}"/>
                         <path d="M22,24 L22,20 C22,16 34,16 34,20 L34,24" stroke="${accentColor}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
        } else if (count <= 5) {
            innerIcon = `<path d="M18,18 L28,14 L38,18 L38,28 C38,34 28,38 28,38 C28,38 18,34 18,28 Z" fill="${primaryColor}"/>
                         <path d="M22,20 L28,17 L34,20 L34,26 C34,31 28,34 28,34 C28,34 22,31 22,26 Z" fill="${accentColor}" opacity="0.8"/>`;
        } else if (count <= 10) {
            innerIcon = `<path d="M16,34 C16,26 24,24 28,24 C34,24 40,28 36,34 C34,36 28,38 28,38 C28,38 18,38 16,34 Z" fill="${primaryColor}"/>
                         <path d="M22,24 Q28,14 34,20 L28,24" stroke="${accentColor}" stroke-width="3" fill="none"/>`;
        } else if (count <= 20) {
            innerIcon = `<path d="M28,14 C28,14 36,18 36,26 C36,34 28,40 28,40 C28,40 20,34 20,26 C20,18 28,14 28,14 Z" fill="${accentColor}" opacity="0.9"/>
                         <path d="M28,20 C28,20 32,22 32,28 C32,34 28,36 28,36 C28,36 24,34 24,28 C24,22 28,20 28,20 Z" fill="${primaryColor}"/>`;
        } else if (count <= 30) {
            innerIcon = `<polygon points="30,12 18,26 26,26 24,40 38,22 30,22" fill="${accentColor}"/>
                         <polygon points="30,12 22,26 26,26 24,36 34,22 30,22" fill="${primaryColor}" opacity="0.8"/>`;
        } else {
            innerIcon = `<polygon points="28,12 32,22 42,22 34,28 38,38 28,32 18,38 22,28 14,22 24,22" fill="${accentColor}"/>
                         <circle cx="28" cy="24" r="3.5" fill="${primaryColor}"/>`;
        }
    }

    return `
    <svg width="36" height="36" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" ${filter} style="opacity: ${opacity}; transition: transform 0.2s ease-in-out; display: inline-block;">
        <defs>
            <filter id="ach-grayscale">
                <feColorMatrix type="matrix" values="0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0 0 0 1 0"/>
            </filter>
            <linearGradient id="grad-ach-${count}-${isSwim}" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="${secondaryColor}"/>
                <stop offset="100%" stop-color="${primaryColor}"/>
            </linearGradient>
        </defs>
        <circle cx="28" cy="28" r="25" stroke="url(#grad-ach-${count}-${isSwim})" stroke-width="1.5" stroke-dasharray="4 2" />
        <circle cx="28" cy="28" r="22" fill="var(--surface)" stroke="var(--border)" stroke-width="1"/>
        <circle cx="28" cy="28" r="18" fill="url(#grad-ach-${count}-${isSwim})" opacity="0.15" />
        <g>
            ${innerIcon}
        </g>
        ${!isUnlocked ? `
        <circle cx="43" cy="43" r="8" fill="var(--bg)" stroke="var(--border)" stroke-width="1"/>
        <path d="M41,41 L41,39 C41,37.5 45,37.5 45,39 L45,41 M39,41 L47,41 L47,46 L39,46 Z" stroke="var(--ink3)" stroke-width="1" fill="none" stroke-linejoin="round"/>
        ` : ''}
    </svg>
    `;
}

// 分享卡片按风格画:运动的在 skin-sport.js(SKIN_TPL.sport.achCard / shareCard),纸墨的是下面 _draw…Paper
function drawAchievementShareCard(type, idx) {
    return typeof skinTpl === 'function' ? skinTpl('achCard', { type, idx }, c => _drawAchievementShareCardPaper(c.type, c.idx)) : _drawAchievementShareCardPaper(type, idx);
}
function _drawAchievementShareCardPaper(type, idx) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 850;
    const ctx = typeof skinCanvas === 'function' ? skinCanvas(canvas.getContext('2d')) : canvas.getContext('2d');   // 字体跟风格走(skin.js)
    
    // 1. Background
    ctx.fillStyle = '#f5f4ef';
    ctx.fillRect(0, 0, 600, 850);
    
    // 2. Artistic borders
    ctx.strokeStyle = '#d5cec2';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 586, 836);
    
    ctx.strokeStyle = '#8c8070';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(22, 22, 556, 806);
    
    // 3. Header title
    ctx.fillStyle = '#2c2825';
    ctx.textAlign = 'center';
    ctx.font = 'normal 32px "ZCOOL XiaoWei", "Noto Serif SC", Georgia, serif';
    ctx.fillText('Cici 健身成就勋章', 300, 100);
    
    // 4. Divider
    ctx.strokeStyle = '#d5cec2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 140);
    ctx.lineTo(520, 140);
    ctx.stroke();

    const ms = (type === 'gym' ? GYM_MILESTONES : SWIM_MILESTONES)[idx];
    const userLog = type === 'gym' ? GYM_LOG : SWIM_LOG;
    const isUnlocked = userLog.count >= ms.count;
    const matchedLog = userLog.milestones.find(m => m.count === ms.count);
    const dateStr = matchedLog ? matchedLog.date : '未解锁';

    // 5. Draw Medal in Center (300, 360)
    const cx = 300, cy = 340, r = 120;
    
    let primaryColor, secondaryColor, accentColor;
    const count = ms.count;
    if (count <= 3) {
        primaryColor = '#b25e36';
        secondaryColor = '#e3a88a';
        accentColor = '#f5b595';
    } else if (count <= 10) {
        primaryColor = '#64748b';
        secondaryColor = '#cbd5e1';
        accentColor = '#94a3b8';
    } else if (count <= 30) {
        primaryColor = '#b45309';
        secondaryColor = '#fef08a';
        accentColor = '#f59e0b';
    } else {
        primaryColor = '#0369a1';
        secondaryColor = '#bae6fd';
        accentColor = '#38bdf8';
    }

    const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grad.addColorStop(0, secondaryColor);
    grad.addColorStop(1, primaryColor);
    
    ctx.strokeStyle = grad;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.strokeStyle = '#d5cec2';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r - 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#fcfbfa';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d5cec2';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = primaryColor;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const isSwim = type === 'swim';
    if (isSwim) {
        if (count <= 3) {
            ctx.beginPath();
            ctx.moveTo(-40, -10);
            ctx.bezierCurveTo(-20, -30, -20, 10, 0, -10);
            ctx.bezierCurveTo(20, -30, 20, 10, 40, -10);
            ctx.stroke();
            ctx.strokeStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(-40, 10);
            ctx.bezierCurveTo(-20, -10, -20, 30, 0, 10);
            ctx.bezierCurveTo(20, -10, 20, 30, 40, 10);
            ctx.stroke();
        } else if (count <= 5) {
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(-35, 0);
            ctx.quadraticCurveTo(-10, -25, 20, 0);
            ctx.quadraticCurveTo(-10, 25, -35, 0);
            ctx.fill();
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.moveTo(20, 0);
            ctx.lineTo(35, -15);
            ctx.lineTo(30, 0);
            ctx.lineTo(35, 15);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-20, -4, 3, 0, Math.PI*2);
            ctx.fill();
        } else if (count <= 10) {
            ctx.beginPath();
            ctx.arc(0, -25, 12, 0, Math.PI*2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-40, 5);
            ctx.quadraticCurveTo(0, -10, 40, 5);
            ctx.moveTo(-30, 20);
            ctx.quadraticCurveTo(0, 12, 30, 20);
            ctx.stroke();
        } else if (count <= 20) {
            ctx.beginPath();
            ctx.moveTo(0, -35); ctx.lineTo(0, 35);
            ctx.moveTo(-20, -15); ctx.lineTo(-20, 5);
            ctx.quadraticCurveTo(0, 15, 20, 5); ctx.lineTo(20, -15);
            ctx.moveTo(-28, -5); ctx.lineTo(-28, -15);
            ctx.moveTo(28, -5); ctx.lineTo(28, -15);
            ctx.stroke();
        } else if (count <= 30) {
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.moveTo(-35, 15);
            ctx.lineTo(35, 15);
            ctx.lineTo(25, 30);
            ctx.lineTo(-25, 30);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(-5, -25);
            ctx.lineTo(-5, 10);
            ctx.lineTo(25, 10);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(-30, -5);
            ctx.lineTo(-15, -25);
            ctx.lineTo(0, -5);
            ctx.lineTo(15, -25);
            ctx.lineTo(30, -5);
            ctx.lineTo(25, 20);
            ctx.lineTo(-25, 20);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(-40, 30);
            ctx.quadraticCurveTo(0, 18, 40, 30);
            ctx.stroke();
        }
    } else {
        if (count <= 1) {
            ctx.fillStyle = primaryColor;
            ctx.fillRect(-5, -35, 10, 70);
            ctx.fillStyle = accentColor;
            ctx.fillRect(-20, -30, 40, 10);
            ctx.fillRect(-20, 20, 40, 10);
        } else if (count <= 3) {
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.arc(0, 12, 30, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(0, -10, 16, Math.PI, 0);
            ctx.stroke();
        } else if (count <= 5) {
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.moveTo(-25, -25);
            ctx.lineTo(0, -32);
            ctx.lineTo(25, -25);
            ctx.lineTo(25, 5);
            ctx.quadraticCurveTo(25, 25, 0, 35);
            ctx.quadraticCurveTo(-25, 25, -25, 5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(-18, -19);
            ctx.lineTo(0, -24);
            ctx.lineTo(18, -19);
            ctx.lineTo(18, 4);
            ctx.quadraticCurveTo(18, 19, 0, 27);
            ctx.quadraticCurveTo(-18, 19, -18, 4);
            ctx.closePath();
            ctx.fill();
        } else if (count <= 10) {
            ctx.beginPath();
            ctx.arc(0, 15, 20, 0, Math.PI*2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(-15, -5, 15, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(-20, -15);
            ctx.quadraticCurveTo(0, -30, 20, -10);
            ctx.stroke();
        } else if (count <= 20) {
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(0, -35);
            ctx.quadraticCurveTo(25, -15, 25, 15);
            ctx.quadraticCurveTo(25, 38, 0, 38);
            ctx.quadraticCurveTo(-25, 38, -25, 15);
            ctx.quadraticCurveTo(-25, -15, 0, -35);
            ctx.fill();
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.moveTo(0, -15);
            ctx.quadraticCurveTo(14, -3, 14, 15);
            ctx.quadraticCurveTo(14, 28, 0, 28);
            ctx.quadraticCurveTo(-14, 28, -14, 15);
            ctx.quadraticCurveTo(-14, -3, 0, -15);
            ctx.fill();
        } else if (count <= 30) {
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(5, -35);
            ctx.lineTo(-20, -2);
            ctx.lineTo(-3, -2);
            ctx.lineTo(-7, 33);
            ctx.lineTo(20, 5);
            ctx.lineTo(5, 5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.moveTo(5, -35);
            ctx.lineTo(-12, -2);
            ctx.lineTo(-3, -2);
            ctx.lineTo(-7, 25);
            ctx.lineTo(14, 5);
            ctx.lineTo(5, 5);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * 35, -Math.sin((18 + i * 72) * Math.PI / 180) * 35);
                ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * 15, -Math.sin((54 + i * 72) * Math.PI / 180) * 15);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = isUnlocked ? '#3e7d52' : '#9b948a';
    ctx.font = 'bold 13px "EB Garamond", "Noto Serif SC", Georgia, serif';
    ctx.fillText(isUnlocked ? `已解锁 · ${dateStr}` : `尚未解锁 (${userLog.count}/${ms.count})`, 300, 520);
    
    ctx.fillStyle = '#2c2825';
    ctx.font = 'bold 36px "ZCOOL XiaoWei", "Noto Serif SC", Georgia, serif';
    ctx.fillText(ms.title, 300, 580);
    
    ctx.fillStyle = '#6b6560';
    ctx.font = 'normal 15px "EB Garamond", "Noto Serif SC", Georgia, serif';
    ctx.fillText(ms.desc, 300, 630);
    
    ctx.strokeStyle = '#d5cec2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(120, 680);
    ctx.lineTo(480, 680);
    ctx.stroke();
    
    ctx.fillStyle = '#9b948a';
    ctx.font = 'normal 12px "EB Garamond", "Noto Serif SC", Georgia, serif';
    ctx.fillText('CICI FITNESS · 极简专业健身助理', 300, 720);
    
    return canvas.toDataURL('image/png');
}

function drawShareCard(logEntry) {
    return typeof skinTpl === 'function' ? skinTpl('shareCard', logEntry, _drawShareCardPaper) : _drawShareCardPaper(logEntry);
}
function _drawShareCardPaper(logEntry) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 850;
    const ctx = typeof skinCanvas === 'function' ? skinCanvas(canvas.getContext('2d')) : canvas.getContext('2d');   // 字体跟风格走(skin.js)
    
    // 1. Background (warm beige paper texture style)
    ctx.fillStyle = '#f5f4ef';
    ctx.fillRect(0, 0, 600, 850);
    
    // 2. Artistic borders
    ctx.strokeStyle = '#d5cec2';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 586, 836);
    
    ctx.strokeStyle = '#8c8070';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(22, 22, 556, 806);
    
    // 3. Header title (ZCOOL XiaoWei Calligraphic styling)
    ctx.fillStyle = '#2c2825';
    ctx.textAlign = 'center';
    ctx.font = 'normal 32px "ZCOOL XiaoWei", "Noto Serif SC", Georgia, serif';
    ctx.fillText('Cici 健身日记', 300, 78);
    
    // 4. Subtitle (DM Mono / Outfit style)
    ctx.fillStyle = '#8c8070';
    ctx.font = 'normal 13px "Courier Prime", ui-monospace, monospace';
    ctx.fillText(fmtDate(logEntry.date), 300, 108);
    
    // 5. Divider
    ctx.strokeStyle = '#d5cec2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 132);
    ctx.lineTo(560, 132);
    ctx.stroke();
    
    // 6. Stats block (3 columns)
    const stats = [
        { label: '训练时间', val: `${logEntry.duration || 0} 分钟` },
        { label: '完成动作', val: `${logEntry.exerciseCount || (logEntry.exercises || []).length} 个` },
        { label: '运动心境', val: `${logEntry.mood || '一般'}${logEntry.rpe ? ` (RPE ${logEntry.rpe})` : ''}` }
    ];
    const colWidth = 520 / 3;
    stats.forEach((st, idx) => {
        const x = 40 + idx * colWidth + colWidth / 2;
        ctx.fillStyle = '#8c8070';
        ctx.font = 'normal 12px "EB Garamond", "Noto Serif SC", Georgia, serif';
        ctx.fillText(st.label, x, 168);
        
        ctx.fillStyle = '#2c2825';
        ctx.font = 'bold 18px "EB Garamond", "Noto Serif SC", Georgia, serif';
        ctx.fillText(st.val, x, 198);
    });
    
    // 7. Divider
    ctx.beginPath();
    ctx.moveTo(40, 224);
    ctx.lineTo(560, 224);
    ctx.stroke();
    
    // 8. Title of exercises list
    ctx.fillStyle = '#2c2825';
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px "Noto Serif SC", Georgia, serif';
    ctx.fillText('今日训练内容', 50, 262);
    
    // 9. Draw exercises list (strip private-pool exercises from share card)
    let y = 300;
    const _pvFilter = (typeof _PRIVATE_POOL !== 'undefined') ? new Set([..._PRIVATE_POOL, ...OWNER_ONLY_MOVES]) : new Set();
    const exList = (logEntry.exercises || []).filter(ex => !_pvFilter.has(ex.name));
    const limit = 8;
    exList.slice(0, limit).forEach(ex => {
        // Exercise Name
        ctx.fillStyle = '#2c2825';
        ctx.font = 'normal 14px "Noto Serif SC", system-ui, serif';
        ctx.fillText(`• ${ex.name}`, 50, y);
        
        // Detail
        ctx.fillStyle = '#8c8070';
        ctx.font = 'normal 13px "Courier Prime", ui-monospace, monospace';
        ctx.textAlign = 'right';
        const wtStr = ex.weight ? `${ex.weight}kg ` : '';
        ctx.fillText(`${wtStr}${ex.sets}组 × ${ex.reps}${ex.unit || '次'}`, 550, y);
        ctx.textAlign = 'left'; // reset
        y += 36;
    });
    
    if (exList.length > limit) {
        ctx.fillStyle = '#8c8070';
        ctx.font = 'italic 12px "EB Garamond", "Noto Serif SC", Georgia, serif';
        ctx.fillText(`... 还有其他 ${exList.length - limit} 个动作已打卡`, 50, y);
        y += 36;
    }
    
    // 10. Notes section
    if (logEntry.note) {
        y += 8;
        ctx.fillStyle = '#8c8070';
        ctx.font = 'italic 12px "Noto Serif SC", system-ui, serif';
        
        const noteText = `“ ${logEntry.note} ”`;
        // Basic line-wrapping for canvas text
        let line = '';
        let lineCount = 0;
        for (let i = 0; i < noteText.length; i++) {
            let testLine = line + noteText[i];
            let metrics = ctx.measureText(testLine);
            if (metrics.width > 480 && i > 0) {
                ctx.fillText(line, 50, y);
                line = noteText[i];
                y += 20;
                lineCount++;
                if (lineCount >= 2) break;
            } else {
                line = testLine;
            }
        }
        if (lineCount < 2) {
            ctx.fillText(line, 50, y);
        }
    }
    
    // 11. Divider
    ctx.strokeStyle = '#d5cec2';
    ctx.beginPath();
    ctx.moveTo(40, 725);
    ctx.lineTo(560, 725);
    ctx.stroke();
    
    // 12. Motivative quote based on date hash
    const quotes = [
        "每一个缓缓落下的重量，都是对身体的温柔致敬。",
        "在缓慢而笃定的重复中，感受肌肉与呼吸的宁静。",
        "水流抚平喧嚣，重力沉淀心绪。",
        "慢慢来，最适合你的节奏，就是最好的进度。",
        "身体记得你流下的每一滴汗，和每一次平稳的呼吸。"
    ];
    let hash = 0;
    const dateStr = logEntry.date || '2026-05-29';
    for (let i = 0; i < dateStr.length; i++) {
        hash += dateStr.charCodeAt(i);
    }
    const quote = quotes[hash % quotes.length];
    
    ctx.fillStyle = '#8c8070';
    ctx.textAlign = 'center';
    ctx.font = 'italic 13px "Noto Serif SC", Georgia, serif';
    ctx.fillText(quote, 300, 758);
    
    // 13. App Branding
    ctx.fillStyle = '#b4b0a7';
    ctx.font = 'normal 10px "Courier Prime", ui-monospace, monospace';
    ctx.fillText('CICI FITNESS APP', 300, 792);
    
    // 14. Red Calligraphic Seal (Stamp)
    ctx.save();
    ctx.strokeStyle = 'rgba(198, 88, 56, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.translate(510, 755);
    ctx.rotate(-0.1);
    // Draw seal circle
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
    // Inner calligraphic text
    ctx.fillStyle = 'rgba(198, 88, 56, 0.75)';
    ctx.font = 'bold 9px "EB Garamond", Georgia, serif';
    const _sealName = (S.sealChar && S.sealChar.trim()) ? S.sealChar.trim() : (S.displayName && S.displayName.trim()) ? S.displayName.trim() : (_user && _user.displayName) ? _user.displayName.split(' ')[0] : '健身';
    ctx.fillText(_sealName, 0, -2);
    ctx.font = 'bold 8px "Noto Serif SC", Georgia, serif';
    ctx.fillText('印记', 0, 8);
    ctx.restore();
    
    return canvas.toDataURL('image/png');
}

// ══ Developer Console Bridge ════════════════════════════
var _mockSyncFail = window._mockSyncFail || false;
function triggerDevClick() {
    if (typeof window.devTriggerClick === 'function') {
        window.devTriggerClick();
    }
}

// ══ Init ═════════════════════════════════════════════════
loadState();
if(typeof showTab==='function')showTab('today');
renderAuthBtn(); // show login button immediately, don't wait for Firebase
initFirebase();

// 旧版本会把扩展数据缓存到这个不分账号的键里;扩展内容已改由 owner 私有包下发,这里清掉残留
try { localStorage.removeItem('__obfuscated_v2_cache__'); } catch (e) {}
