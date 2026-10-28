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
ls(K.settings,{goal:S.goal,level:S.level,days:S.days,dur:S.dur,equip:S.equip,focus:S.focus,limits:S.limits,volumeMultiplier:S.volumeMultiplier,restDur:S.restDur,swimLevel:S.swimLevel,weightLevel:S.weightLevel,periodMode:S.periodMode,displayName:S.displayName,sealChar:S.sealChar,cycleEnabled:S.cycleEnabled,cycleDay:S.cycleDay,cycleLength:S.cycleLength,cycleSetAt:S.cycleSetAt||null,vacuumDays:S.vacuumDays,partnerDays:S.partnerDays,partnerUid:S.partnerUid,autoVolumeAdjust:S.autoVolumeAdjust,userExcluded:S.userExcluded,userExcludeReasons:S.userExcludeReasons,cheer:S.cheer,aiWeights:S.aiWeights,planStale:!!S.planStale,skin:S.skin});
if(S.plan)ls(K.plan,{plan:S.plan,prog:S.prog,adj:S.adj,weights:S.weights,exRpe:S.exRpe,poolLounger:S.poolLounger,flexProg:S.flexProg,unlockedDates:S.unlockedDates});
localStorage.setItem(nsKey('fit_selDate'), S.selDate || '');
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
const GYM_PATTERNS={2:[1,0,0,1,0,0,0],3:[1,0,1,0,1,0,0],4:[1,1,0,1,1,0,0],5:[1,1,1,0,1,1,0],6:[1,1,1,1,1,1,0],7:[1,1,1,1,1,1,1]};
function weekdayPlanTypes(days,hasPool){
days=+days;
if(hasPool===undefined)hasPool=S.equip.includes('泳池');
if(hasPool){const sp=SWIM_SPLIT[days]||{gym:Math.max(2,days-1),swim:1};return (COMBO_PATTERNS[sp.gym+'+'+sp.swim]||COMBO_PATTERNS['3+2']).map(c=>c==='G'?1:c==='S'?2:0);}
return GYM_PATTERNS[days]||GYM_PATTERNS[3];
}
function partnerOverlap(){
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
function updatePartnerOverlap(){
const el=document.getElementById('partner-overlap');
if(!el)return;
const ov=partnerOverlap();
if(!ov){el.style.display='none';return;}
el.style.display='';
const g=ov.gym.map(d=>DN[d]).join('、'),s=ov.swim.map(d=>DN[d]).join('、');
if(!g&&!s){el.innerHTML='<span class="faint">重合 →</span> 你俩这周没有重合的训练日，换个天数试试';return;}
el.innerHTML=`<span class="faint">重合 →</span> ${g?'健身房 '+g:''}${g&&s?' · ':''}${s?'游泳 '+s:''}，这些天一起收拾`;
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
const weekDays=S.plan?S.plan.days.filter(d=>!d.isRest&&d.date>=t7str&&d.date<=tStr):[];
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
el.innerHTML=top+`<div id="journal-slot"></div>`+heat+distHtml+wtHtml+prHtml
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
    try{sessionStorage.setItem('_justImported','1')}catch(e){}
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
if(restoreSnapshot(idx)){try{sessionStorage.setItem('_justImported','1')}catch(e){}location.reload();}
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

function initFirebase(){
try{
if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
_db=firebase.firestore();
firebase.auth().onAuthStateChanged(handleAuth);
}catch(e){console.warn('Firebase init failed:',e);renderAuthBtn();if(typeof _authKnown!=='undefined'){_authKnown=true;if(typeof render==='function')render();}}
}

function handleAuth(user){
_user=user;
// 切账号时复位扩展模式残留(否则登出→换人登录后仍可能弹出扩展提示);非 owner 再把私有包挂上去的东西全撤掉
if(typeof _xMode!=='undefined'){_xMode=false;_xDetailMode=false;}
if(typeof _xReset==='function'&&!(typeof _ownerSession==='function'&&_ownerSession()))_xReset();
updateProfileUI();
// Recover pre-namespace data into this account before reading state. If anything
// was migrated, mark local dirty so the realtime listener can't overwrite the
// just-recovered keys with a stale/empty cloud doc before our first push.
if(user && typeof migrateLegacyKeys==='function' && migrateLegacyKeys(user.uid)) _localDirty=true;
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
const _justImported=(()=>{try{return sessionStorage.getItem('_justImported')==='1'}catch(e){return false}})();
if(_justImported){_localDirty=true;try{sessionStorage.removeItem('_justImported')}catch(e){}}
const _pendingFromLastRun=_dirtyFlagSet(); // 上次关 app 前还有没推上去的改动
if(_pendingFromLastRun)_localDirty=true;
_cloudFirstSnap=false;
_unsub=_db.collection('users').doc(_user.uid).onSnapshot(doc=>{
// 新手设置要等第一份云端快照回来再决定弹不弹(换新设备登录时本机是空的,别在云端数据到之前先让人从头设一遍)
const _first=!_cloudFirstSnap;
if(_first){_cloudFirstSnap=true;if(!doc.exists&&typeof render==='function')setTimeout(render,0);}
if(!doc.exists)return;
// If local changes are pending push, do NOT let cloud overwrite them
if(_localDirty){
    console.log('[sync] skipped cloud→local: local changes pending push');
    if(_first&&typeof render==='function')setTimeout(render,0);
    return;
}
const cd=doc.data();
// 骤降拦截:云端数据比本地大幅偏少 → 疑似"旧云盖新本地"(丢数据主因),拦住不覆盖,反把本地推上云
const localVol=_dataVolume(k=>lg(K[k]));
const cloudVol=_dataVolume(k=>cd[K[k]]);
if(localVol>=15 && cloudVol < localVol*0.6){
  saveSnapshot('predrop-blocked');
  _localDirty=true; clearTimeout(_pushTimer); _pushTimer=setTimeout(pushToCloud,0);
  showToast('云端数据异常偏少，已保留本机数据'); return;
}
let changed=false;
Object.entries(cd).forEach(([k,v])=>{
const nk=nsKey(k);
const lv=localStorage.getItem(nk);
const cv=JSON.stringify(v);
if(lv!==cv){try{localStorage.setItem(nk,cv);changed=true}catch{}}
});
if(changed){loadState();renderLog();showToast('已从云端同步');saveSnapshot('post-sync')}
else if(_first&&typeof render==='function')render();   // 第一份快照没带来变化:也重画一次,让新手设置按最新状态判断
},e=>console.warn('Sync error:',e));
// Initial push — send local data up first so cloud has latest(刚导入过则立即推,尽量缩短被旧快照覆盖的窗口)
setTimeout(()=>pushToCloud(),(_justImported||_pendingFromLastRun)?0:1000);
}

let _dirtyId=0; // bumped on every local change; lets a push detect changes that arrive mid-flight
// 未推送标记同时落盘:内存里的 _localDirty 会随 app 被杀掉而丢,下次打开时云端旧快照就会整键盖回来
function _dirtyFlag(on){try{if(currentUid()==='anon')return;on?localStorage.setItem(nsKey('__dirty__'),'1'):localStorage.removeItem(nsKey('__dirty__'))}catch(e){}}
function _dirtyFlagSet(){try{return localStorage.getItem(nsKey('__dirty__'))==='1'}catch(e){return false}}
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
if(typeof _mockSyncFail !== 'undefined' && _mockSyncFail) {
    console.log('[sync] simulated push failure (offline)');
    _syncPill(false);
    clearTimeout(_pushTimer); _pushTimer=setTimeout(pushToCloud,5000); // keep dirty + retry
    return;
}
_pushing=true;
const sentId=_dirtyId;
const data={};
CLOUD_KEYS.forEach(k=>{const v=localStorage.getItem(nsKey(k));if(v!==null){try{data[k]=JSON.parse(v)}catch{data[k]=v}}});
try{
await _db.collection('users').doc(_user.uid).set(data,{merge:true});
// Only stop blocking cloud→local if no newer change arrived during the await; else keep dirty + reschedule.
if(_dirtyId===sentId){ _localDirty=false; _dirtyFlag(false); } else { clearTimeout(_pushTimer); _pushTimer=setTimeout(pushToCloud,2000); }
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
// train = 搭子互通的训练数据(计划、记录、重量、感受),由 coach.js coachSharedTraining() 按 AI 快照同一套门控过滤:
// 私密池 / 盆底动作、私密日、私密模式的记录一律不进;身体数据(体重围度、身体情况、周期)和打卡备注原文也不进。
function buildSharedProfile(){
  const today=todayStr();
  const td=(S.plan&&S.plan.days)?S.plan.days.find(d=>d.date===today):null;
  const myName=(S.displayName&&S.displayName.trim())||(_user&&_user.displayName?_user.displayName.split(' ')[0]:'搭子');
  const pu=partnerUid();
  let train=null;
  try{ train=(pu&&typeof coachSharedTraining==='function')?coachSharedTraining():null; }catch(e){ console.warn('shared training build failed:',e); }   // 没配对就不写
  return {
    name: myName,
    days: +S.days||null,
    hasPool: S.equip.includes('泳池'),
    todayType: td?(td.isPrivateDay?'另有安排':td.isRest?'休息':td.workoutType):'—',
    todayDone: td?!!isDone(td):false,
    swimCount: (typeof SWIM_LOG!=='undefined'&&SWIM_LOG.count)||0,
    cheer: (S.cheer&&S.cheer.date)?S.cheer:null,   // my latest cheer TO my partner
    allowedReaders: pu?[pu]:[],                     // who may read this doc (the rule checks this)
    lastActive: today,
    train
  };
}
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
function subscribePartner(){
  if(_partnerUnsub){ _partnerUnsub(); _partnerUnsub=null; }
  clearTimeout(_partnerRetry);
  _partnerProfile=null;
  const pu=partnerUid();
  if(!_db||!_user||!pu){ if(typeof updatePairUI==='function')updatePairUI(); if(typeof render==='function')render(); return; }
  _partnerUnsub=_db.collection('users').doc(pu).collection('shared').doc('profile').onSnapshot(doc=>{
    _partnerProfile=doc.exists?doc.data():null;
    if(typeof updatePartnerOverlap==='function')updatePartnerOverlap();
    if(typeof updatePairUI==='function')updatePairUI();
    if(typeof render==='function')render();
  },e=>{
    // permission-denied = partner hasn't added me to their allowedReaders yet.
    // Firestore terminates a denied listener and won't auto-resume once access is
    // granted, so retry periodically until both sides have paired.
    _partnerProfile=null;
    if(typeof updatePairUI==='function')updatePairUI();
    console.warn('partner read:',e.code||e.message);
    if(_partnerUnsub){ _partnerUnsub(); _partnerUnsub=null; }
    clearTimeout(_partnerRetry);
    _partnerRetry=setTimeout(()=>{ if(partnerUid()&&!_partnerProfile) subscribePartner(); },15000);
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
  S.partnerUid=code||null;
  if(code) S.partnerDays=null;   // paired: overlap follows partner's real day count
  saveState(); pushProfile(); subscribePartner(); updatePairUI(); flashSaved();
  showToast(code?'已保存搭子配对码':'已取消配对');
};
window.unpairPartner=function(){
  S.partnerUid=null; saveState(); pushProfile(); subscribePartner(); updatePairUI(); showToast('已解除配对');
};
window.sendCheer=function(word){
  if(!partnerUid()){ showToast('先和搭子配对'); return; }
  // 字段名沿用 emoji(搭子那边的旧版本读这个键),内容改成文字
  S.cheer={ date:todayStr(), emoji:(typeof word==='string'&&word)?word:'加油' };
  saveState(); pushProfile(); updatePairUI(); if(typeof render==='function')render();
  showToast('已给搭子加油');
};
function updatePairUI(){
  const me=document.getElementById('my-pair-code');
  if(me) me.textContent=_user?_user.uid:'（请先登录）';
  const inp=document.getElementById('partner-code-input');
  if(inp&&document.activeElement!==inp) inp.value=partnerUid()||'';
  const pu=partnerUid();
  const btn=document.getElementById('pair-btn');
  if(btn){ btn.textContent=pu?'断开':'连接'; btn.onclick=pu?unpairPartner:savePartnerCode; }
  const pdRow=document.getElementById('partner-days-row');
  if(pdRow) pdRow.style.display=pu?'none':'flex'; // paired → manual day-count hidden
  const cheerRow=document.getElementById('pair-cheer');
  if(cheerRow){
    cheerRow.style.display=(pu&&_partnerProfile)?'':'none';
    const cb=document.getElementById('cheer-btn');
    if(cb){ const sent=S.cheer&&S.cheer.date===todayStr(); cb.textContent=sent?'今天已加油':'给搭子加油'; cb.disabled=!!sent; }
  }
  const status=document.getElementById('pair-status');
  if(status){
    status.replaceChildren();
    if(!pu){ status.style.display='none'; }
    else{
      status.style.display='block';
      if(_partnerProfile){
        const c=_partnerProfile.cheer;
        const cheered=!!(c&&c.date===todayStr());
        const nameEl=document.createElement('b');
        nameEl.textContent=String(_partnerProfile.name||'搭子');
        const ok=document.createElement('span'); ok.className='olive'; ok.textContent='已连接 ';
        status.append(ok,nameEl);
        status.append(document.createTextNode(
          ` · 今天：${String(_partnerProfile.todayType||'—')}${_partnerProfile.todayDone?'（已练完）':''}${cheered?' · TA 今天给你加油了':''}`
        ));
      }else{
        status.append(document.createTextNode('已保存配对码，等对方也填上你的配对码就能连上。'));
      }
    }
  }
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
