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
ls(K.settings,{goal:S.goal,level:S.level,days:S.days,dur:S.dur,equip:S.equip,focus:S.focus,limits:S.limits,volumeMultiplier:S.volumeMultiplier,restDur:S.restDur,swimLevel:S.swimLevel,periodMode:S.periodMode,displayName:S.displayName,sealChar:S.sealChar,cycleEnabled:S.cycleEnabled,cycleDay:S.cycleDay,cycleLength:S.cycleLength,vacuumDays:S.vacuumDays,partnerDays:S.partnerDays,partnerUid:S.partnerUid,cheer:S.cheer});
if(S.plan)ls(K.plan,{plan:S.plan,prog:S.prog,adj:S.adj,weights:S.weights,unlockedDates:S.unlockedDates});
localStorage.setItem(nsKey('fit_selDate'), S.selDate || '');
}
function loadState(){
const s=lg(K.settings);
if(s)Object.assign(S,s);
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
    S.unlockedDates=p.unlockedDates||[];
}
else{S.plan=null;}
LOG=lg(K.log)||[];
W_HIST=lg(K.wh)||{};
PR_LIST=lg(K.pr)||[];
BODY_LOG=lg(K.body)||[];
if(typeof rebuildAchievementsFromLogs === 'function') rebuildAchievementsFromLogs();
applySettingsToUI();
render();
if(S.plan && typeof autoAlignPlan==='function') autoAlignPlan();
_initialLoad = false;
}
function applySettingsToUI(){
document.body.classList.toggle('theme-curve', hasGoal('女性曲线'));
document.querySelectorAll('#g-goal .chip').forEach(b=>b.classList.toggle('on',hasGoal(b.dataset.v)));
document.querySelectorAll('#g-level .chip').forEach(b=>b.classList.toggle('on',b.dataset.v===S.level));
document.getElementById('sl-days').value=S.days;
document.getElementById('v-days').textContent=S.days+'天';
document.getElementById('sl-dur').value=S.dur;
document.getElementById('v-dur').textContent=S.dur+'分钟';
document.querySelectorAll('#g-equip .chip').forEach(b=>b.classList.toggle('on',S.equip.includes(b.dataset.v)));
document.querySelectorAll('#g-focus .chip').forEach(b=>{
    b.classList.remove('disabled');
    b.style.opacity = 1;
    b.style.pointerEvents = 'auto';
    b.classList.toggle('on',S.focus.includes(b.dataset.v));
});

const goalInfo = document.getElementById('goal-info');
if (goalInfo) {
    if (hasGoal('翘臀美背')) {
        goalInfo.innerHTML = "臀推顶端挤压优先；美背日强化背阔与体态（圆肩改善）；收腰靠真空吸而非减脂；避免直立划船/耸肩。";
        goalInfo.style.display = "block";
    } else if (hasGoal('女性曲线')) {
        goalInfo.innerHTML = "极致沙漏：臀大+胯宽+腿丰满同步堆围度，腰只靠真空吸/平板维持，绝不做负重侧屈/转体。大腿要练腘绳/内收/衔接，不只堆股四。上肢几乎不动以免变宽。吃够蛋白(1.6-2g/kg)+轻微热量盈余才能喂大下半身。";
        goalInfo.style.display = "block";
    } else {
        goalInfo.style.display = "none";
    }
}
document.getElementById('limits').value=S.limits||'';
document.querySelectorAll('#g-rest .chip').forEach(b=>b.classList.toggle('on',+b.dataset.v===(S.restDur??45)));
document.querySelectorAll('#g-swim-level .chip').forEach(b=>b.classList.toggle('on',b.dataset.v===(S.swimLevel||'入门')));
document.querySelectorAll('#g-partner-days .chip').forEach(b=>b.classList.toggle('on',+b.dataset.v===(+S.partnerDays||0)));
if(typeof updatePartnerOverlap==='function')updatePartnerOverlap();
if(typeof updatePairUI==='function')updatePairUI();
const swimPanel=document.getElementById('swim-settings');
if(swimPanel) swimPanel.style.display=S.equip.includes('泳池')?'block':'none';
const periodSwitch=document.getElementById('period-switch');
if(periodSwitch) periodSwitch.checked=!!S.periodMode;
const periodRow=document.getElementById('period-toggle-row');
if(periodRow) periodRow.classList.toggle('active',!!S.periodMode);
const cyEn=document.getElementById('cycle-enable-switch');
if(cyEn) cyEn.checked=S.cycleEnabled!==false;
const cyBlock=document.getElementById('cycle-block');
if(cyBlock) cyBlock.style.display=(S.cycleEnabled!==false)?'':'none';
const slCy=document.getElementById('sl-cycle'); if(slCy) slCy.value=S.cycleDay||1;
const cyLen=document.getElementById('cycle-len'); if(cyLen) cyLen.value=S.cycleLength||28;
if(typeof updateCycleUI==='function') updateCycleUI();
updateSwimBreakdown();

const rBtn = document.getElementById('recal-btn');
if(rBtn) rBtn.style.display = S.plan ? 'block' : 'none';
}

function updateCycleUI(){
  const day=S.cycleDay||1, len=S.cycleLength||28;
  const v=document.getElementById('v-cycle'); if(v) v.textContent='第'+day+'天';
  const box=document.getElementById('cycle-phase');
  if(box && typeof cyclePhase==='function'){
    const p=cyclePhase(day,len);
    const nudge=(p.key==='menstrual'&&!S.periodMode)?` <a href="#" onclick="event.preventDefault();document.getElementById('period-switch').click()" style="color:var(--terra)">一键开经期模式</a>`:'';
    box.innerHTML='<b>'+p.name+'</b>（第'+day+'/'+len+'天）<br>'+p.advice+nudge;
  }
}
function updateSwimBreakdown(){
const el=document.getElementById('swim-breakdown');
if(!el) return;
const hasPool=S.equip.includes('泳池');
if(!hasPool){el.style.display='none';return;}
el.style.display='block';
const sp=SWIM_SPLIT[S.days]||{gym:Math.max(2,S.days-1),swim:1};
const rest=7-S.days;
if(S.periodMode){
el.innerHTML=`${sp.gym}天力量（降负重） + ${sp.swim}天陆地替代${rest>0?` + ${rest}天休息`:''}`;
}else{
el.innerHTML=`${sp.gym}天力量 + ${sp.swim}天游泳${rest>0?` + ${rest}天休息`:''}`;
}
}

function updatePartnerOverlap(){
const el=document.getElementById('partner-overlap');
if(!el)return;
const ov=(typeof partnerOverlap==='function')?partnerOverlap():null;
if(!ov){el.style.display='none';return;}
el.style.display='block';
const g=ov.gym.map(d=>DN[d]).join('、'),s=ov.swim.map(d=>DN[d]).join('、');
if(!g&&!s){el.innerHTML='你俩这周没有重合的训练日，换个天数试试';return;}
el.innerHTML=`重合：${g?'健身房 '+g:''}${g&&s?' · ':''}${s?'游泳 '+s:''} 📦 这些天一起收拾`;
}

// ══ Tabs ═════════════════════════════════════════════════
function showTab(id,btn){
document.querySelectorAll('.panel-tab').forEach(p=>p.classList.remove('active'));
document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
document.getElementById(id).classList.add('active');
btn.classList.add('active');
btn.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
if(id==='journal')renderLog();
if(id==='stats-tab')renderStats();
}

// ══ Journal / Log — Git-style timeline ═══════════════════
function toggleLogHistory(){_logShowAll=!_logShowAll;renderLog()}

function renderLog(){
const btn=document.getElementById('jrnl-toggle');
if(btn)btn.textContent=_logShowAll?'只看近14天':`显示全部(${LOG.length})`;
const el=document.getElementById('log-list');
if(!el)return;
const cut=new Date();cut.setDate(cut.getDate()-14);
const entries=_logShowAll?LOG:LOG.filter(x=>new Date(x.date)>=cut);
if(!entries.length){el.innerHTML='<div class="empty"><i class="ti ti-barbell" style="font-size:32px;opacity:.2"></i><p>完成训练后自动记录</p></div>';return}
// Group by month for git-style headers
const byMonth={};
entries.forEach(x=>{const m=x.date.slice(0,7);if(!byMonth[m])byMonth[m]=[];byMonth[m].push(x)});
let html='';
Object.entries(byMonth).forEach(([month,items])=>{
const[y,m]=month.split('-');
html+=`<div class="tl-month">${y}年${parseInt(m)}月</div><div class="tl-wrap">`;
items.forEach((x,i)=>{
const isLast=i===items.length-1;
const logIdx=LOG.indexOf(x);
const mood=x.mood||'一般';
html+=`
<div class="tl-item">
  <div class="tl-left">
    <div class="tl-dot" style="font-size:10px;font-weight:600">${mood.slice(0,2)}</div>
    ${isLast&&Object.keys(byMonth)[Object.keys(byMonth).length-1]===month?'':'<div class="tl-line"></div>'}
  </div>
  <div class="tl-card">
    <div class="tl-card-hdr">
      <div>
        <span class="tl-date">${x.date}</span>
        <span class="tl-type">${x.workout}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="jchip">${x.duration||'?'}分钟</span>
      </div>
    </div>
    <div class="tl-chips">
      <span class="jchip done-c">${x.exerciseCount||0}个动作完成</span>
      ${x.exercises?x.exercises.slice(0,4).map(e=>`<span class="jchip${e.done===false?' undone':''}">${e.name}${e.weight?` ${e.weight}kg`:''}</span>`).join('')+((x.exercises.length>4)?`<span class="jchip" style="opacity:.5">+${x.exercises.length-4}个</span>`:''):''}
    </div>
    ${x.note?`<div class="jentry-note">"${x.note}"</div>`:''}
    <div class="log-actions" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
      <button class="log-act-btn" onclick="editLog(${logIdx})">编辑</button>
      <button class="log-act-btn" style="color:var(--sage)" onclick="shareWorkoutFromIndex(${logIdx})">分享</button>
      <button class="log-act-btn del" onclick="delLog(${logIdx})">删除</button>
    </div>
  </div>
</div>`;
});
html+='</div>';
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

async function clearAllData() {
if(confirm('警告：确定要清空所有计划、打卡记录和统计数据吗？此操作不可恢复！（包括云端数据）')){
    // 1. Stop realtime sync so cloud data doesn't flood back
    if(_unsub){_unsub();_unsub=null}
    // 2. Delete cloud data if logged in
    if(_db && _user){
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
    S.plan=null; S.prog={}; S.adj={}; S.weights={}; S.unlockedDates=[]; S.volumeMultiplier=1.0; S.selDate=null;
    // 4. Force state save so local variables are reset
    saveState();location.reload();
}
}

// ══ Body metrics (体重/围度 — 体型进度, 腰臀比 WHR) ════════
function logVacuum(){
  const t=todayStr(); if(!S.vacuumDays)S.vacuumDays=[];
  if(S.vacuumDays.includes(t)){if(typeof showToast==='function')showToast('今天已打卡');return;}
  S.vacuumDays.push(t); if(S.vacuumDays.length>400)S.vacuumDays=S.vacuumDays.slice(-400);
  saveState(); if(typeof showToast==='function')showToast('真空吸已打卡 ✓'); if(typeof renderStats==='function')renderStats();
}
function logBody(){
  const g=id=>{const el=document.getElementById(id);if(!el)return null;const v=parseFloat(el.value);return isFinite(v)&&v>0?Math.round(v*10)/10:null;};
  const e={date:todayStr(),weight:g('b-weight'),waist:g('b-waist'),hip:g('b-hip'),thigh:g('b-thigh')};
  if(['weight','waist','hip','thigh'].every(k=>e[k]==null)){showToast('请至少填写一项');return;}
  const i=BODY_LOG.findIndex(x=>x.date===e.date);
  if(i>=0){['weight','waist','hip','thigh'].forEach(k=>{if(e[k]!=null)BODY_LOG[i][k]=e[k];});}
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
function renderBodyPanel(){
  const IN='width:100%;padding:6px 8px;margin-top:3px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--ink);font-size:14px;box-sizing:border-box';
  const latest=BODY_LOG.length?BODY_LOG[BODY_LOG.length-1]:{};
  const pv=f=>latest[f]!=null?latest[f]:'';
  const _isSubBody=typeof _globalSubMode!=='undefined'&&_globalSubMode&&typeof _ownerSession==='function'&&_ownerSession();
  const lblmap=(_isSubBody&&typeof _getSubDb==='function')?( ()=>{const db=_getSubDb(),dec=s=>{try{return decodeURIComponent(atob(s))}catch(e){return''}};const bl=db?.body_labels||{};return{weight:dec(bl.weight)||'体重',waist:dec(bl.waist)||'腰围',hip:dec(bl.hip)||'臀围',thigh:dec(bl.thigh)||'大腿围'};} )():{weight:'体重',waist:'腰围',hip:'臀围',thigh:'大腿围'};
  const fld=(id,lbl,u)=>`<label style="font-size:11px;color:var(--ink3)">${lbl}<span style="opacity:.6"> ${u}</span><input id="${id}" type="number" inputmode="decimal" step="0.1" value="${pv(id.slice(2))}" style="${IN}"></label>`;
  const spark=(f,unit,better)=>{
    const pts=BODY_LOG.filter(x=>x[f]!=null);
    if(pts.length<2)return '';
    const vals=pts.map(x=>x[f]),mn=Math.min(...vals),mx=Math.max(...vals),rg=mx-mn||1;
    const last=vals[vals.length-1],delta=Math.round((last-vals[0])*10)/10;
    const good=better==='down'?delta<0:better==='up'?delta>0:null;
    const col=good===true?'var(--sage)':good===false?'var(--terra)':'var(--ink3)';
    return `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;font-weight:600">${lblmap[f]}</span><span style="font-size:11px;font-weight:600;color:${col}">${delta>0?'+':''}${delta}${unit} · 现 ${last}${unit}</span></div><div style="display:flex;gap:2px;height:24px;align-items:flex-end">${pts.slice(-14).map(p=>{const h=(p[f]-mn)/rg*70+30;return `<div style="flex:1;background:var(--terra);opacity:.7;border-radius:2px 2px 0 0;height:${h}%" title="${p.date}: ${p[f]}${unit}"></div>`}).join('')}</div></div>`;
  };
  const whrPts=BODY_LOG.filter(x=>x.waist!=null&&x.hip!=null);
  let whrBlock='';
  if(whrPts.length){
    const cur=whrPts[whrPts.length-1].waist/whrPts[whrPts.length-1].hip;
    const d=whrPts.length>1?Math.round((cur-whrPts[0].waist/whrPts[0].hip)*100)/100:null;
    whrBlock=`<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0;padding:8px 10px;background:var(--surface2);border-radius:8px"><span style="font-size:12px">腰臀比 WHR<span style="font-size:10px;color:var(--ink3)"> · 越低越沙漏</span></span><b style="font-size:16px;color:var(--terra)">${cur.toFixed(2)}${d!=null?`<span style="font-size:11px;color:${d<0?'var(--sage)':d>0?'var(--terra)':'var(--ink3)'};margin-left:6px">${d>0?'+':''}${d}</span>`:''}</b></div>`;
  }
  const charts=['weight','waist','hip','thigh'].map(f=>spark(f,f==='weight'?'kg':'cm',f==='waist'?'down':f==='hip'?'up':null)).join('');
  const _subBodyTitle=(_isSubBody&&typeof _getSubDb==='function')?(()=>{const db=_getSubDb(),dec=s=>{try{return decodeURIComponent(atob(s))}catch(e){return''}};return dec(db?.body_labels?.panel_title)||'';})():'';
  const hist=BODY_LOG.length?`<details style="margin-top:6px"><summary style="font-size:11px;color:var(--ink3);cursor:pointer">历史记录 (${BODY_LOG.length})</summary><div style="margin-top:6px">${[...BODY_LOG].reverse().slice(0,40).map(x=>`<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:4px 0;border-bottom:1px solid var(--border)"><span>${x.date}</span><span style="color:var(--ink3);flex:1;text-align:right;margin-right:8px">${[x.weight!=null?x.weight+'kg':'',x.waist!=null?lblmap.waist[0]+x.waist:'',x.hip!=null?lblmap.hip[0]+x.hip:'',x.thigh!=null?lblmap.thigh[0]+x.thigh:''].filter(Boolean).join(' · ')}</span><span onclick="delBody('${x.date}')" style="color:var(--terra);cursor:pointer;padding:0 4px">✕</span></div>`).join('')}</div></details>`:'';
  return `<div class="panel"><p class="panel-title">${_subBodyTitle||'身体记录 📏'} <span style="font-size:11px;color:var(--ink3);font-weight:400">${_subBodyTitle?'':' 体型才是真正的进度'}</span></p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${fld('b-weight',lblmap.weight,'kg')}${fld('b-waist',lblmap.waist,'cm')}${fld('b-hip',lblmap.hip,'cm')}${fld('b-thigh',lblmap.thigh,'cm')}</div><button onclick="logBody()" class="exp-btn" style="width:100%;margin-top:10px">保存今日数据</button>${(()=>{const d=S.vacuumDays||[],t=todayStr();let st=0;for(let i=0;i<400;i++){const ds=addDays(t,-i);if(d.includes(ds))st++;else if(i>0)break;}const dn=d.includes(t);return `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:8px 10px;background:var(--surface2);border-radius:8px"><div><div style="font-size:12px;font-weight:600">真空吸收腰打卡</div><div style="font-size:10px;color:var(--ink3)">连续 ${st} 天 · 累计 ${d.length} 次</div></div><button onclick="logVacuum()" class="exp-btn" style="font-size:12px;padding:6px 12px${dn?';opacity:.5':''}">${dn?'今日已打 ✓':'今日打卡'}</button></div>`;})()}${whrBlock}${charts}${hist}</div>`;
}

// ══ Stats ════════════════════════════════════════════════
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
const weekDone=weekDays.filter(d=>isDone(d)).length;
const weekTotal=weekDays.length;
const weekPct=weekTotal?Math.round(weekDone/weekTotal*100):0;

// 12-week heatmap
const heatCells=[];
for(let i=83;i>=0;i--){
const ds=addDays(tStr,-i);
const d=new Date(ds+'T12:00:00');
heatCells.push({ds,active:logDates.has(ds),day:d.getDay()});
}
const heatHtml=heatCells.map(c=>{
const isToday=c.ds===tStr;
return`<div class="heat-cell${c.active?' heat-on':''}${isToday?' heat-today':''}" title="${c.ds}" ${c.active?`onclick="showHistoryDetail('${c.ds}')"`:''} ></div>`;
}).join('');

// Muscle distribution with bar
const dist={};
LOG.filter(l=>l.date>=addDays(tStr,-60)).forEach(l=>{ // 近60「天」(原 slice(-60) 是最近60「条」)
if(l.exercises)l.exercises.forEach(ex=>{
let found = false;
for(const[grp,exs]of Object.entries(DB)){
const foundEx = exs.find(e=>e.n===ex.name);
if(foundEx){
if(grp==='swimming'){
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
} else {
dist[grp]=(dist[grp]||0)+1;
}
found = true;
break;
}
}
});
});
const grpNames={chest:'胸',shoulder:'肩',back:'背',biceps:'二头',triceps:'三头',quads:'股四头',hamglutes:'臀腿',calves:'小腿',core:'核心',cardio:'有氧',swim_upper:'游泳(上肢)',swim_lower:'游泳(下肢)',swim_core:'游泳(核心)',swim_cardio:'游泳(心肺)'};
const distEntries=Object.entries(dist).sort((a,b)=>b[1]-a[1]);
const maxDist=distEntries[0]?.[1]||1;

el.innerHTML=`
<div class="streak-box"><div class="streak-num">${streak}</div><div class="streak-lbl">连续打卡天数</div></div>
${typeof renderBodyPanel==='function'?renderBodyPanel():''}
<div class="panel">
  <p class="panel-title" style="margin-bottom:.75rem">近12周训练热图</p>
  <div class="heat-grid">${heatHtml}</div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ink3);margin-top:6px"><span>12周前</span><span>今天</span></div>
</div>
<div class="panel">
  <p class="panel-title">本周完成率</p>
  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>${weekDone}/${weekTotal} 天</span><b style="color:var(--terra)">${weekPct}%</b></div>
  <div class="progress-bar"><div class="progress-fill" style="width:${weekPct}%"></div></div>
</div>
<div class="panel">
  <p class="panel-title">本月</p>
  <div class="stats">
    <div class="stat"><div class="stat-val">${monthLogs.length}</div><div class="stat-lbl">训练天</div></div>
    <div class="stat"><div class="stat-val">${monthLogs.reduce((s,l)=>s+(l.exerciseCount||0),0)}</div><div class="stat-lbl">完成动作</div></div>
    <div class="stat"><div class="stat-val">${monthLogs.reduce((s,l)=>s+(l.duration||0),0)}</div><div class="stat-lbl">总分钟</div></div>
  </div>
  <div class="stats" style="margin-top:8px">
    <div class="stat"><div class="stat-val">${monthLogs.filter(l=>l.exercises&&l.exercises.some(e=>e.unit!=='分钟')).length}</div><div class="stat-lbl">力量训练</div></div>
    <div class="stat"><div class="stat-val">${monthLogs.reduce((s,l)=>s+(l.exercises?l.exercises.filter(e=>e.unit==='分钟').reduce((a,e)=>a+e.reps,0):0),0)}</div><div class="stat-lbl">有氧分钟</div></div>
    <div class="stat"><div class="stat-val">${monthLogs.filter(l=>l.rpe).length?Math.round(monthLogs.filter(l=>l.rpe).reduce((s,l)=>s+l.rpe,0)/monthLogs.filter(l=>l.rpe).length*10)/10:'—'}</div><div class="stat-lbl">平均RPE</div></div>
  </div>
</div>
${distEntries.length?`
<div class="panel">
  <p class="panel-title">肌群训练量（近60天）</p>
  ${distEntries.map(([g,c])=>`
    <div class="dist-row">
      <span style="min-width:52px">${grpNames[g]||g}</span>
      <div class="dist-bar-wrap"><div class="dist-bar-fill" style="width:${Math.round(c/maxDist*100)}%"></div></div>
      <span class="dist-val">${c}</span>
    </div>`).join('')}
</div>`:''}
${(()=>{
const wtEx=Object.entries(W_HIST).filter(([,h])=>h.length>=2).sort((a,b)=>b[1].length-a[1].length).slice(0,6);
if(!wtEx.length)return '';
return `<div class="panel">
  <p class="panel-title">重量进步</p>
  ${wtEx.map(([name,hist])=>{
    const max=Math.max(...hist.map(h=>h.weight));
    const min=Math.min(...hist.map(h=>h.weight));
    const range=max-min||1;
    const first=hist[0].weight;
    const last=hist[hist.length-1].weight;
    const delta=last-first;
    const recent=hist.slice(-12);
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px;font-weight:600">${name}</span>
        <span style="font-size:11px;font-weight:600;color:${delta>0?'var(--sage)':delta<0?'var(--terra)':'var(--ink3)'}">${delta>0?'+':''}${delta}kg</span>
      </div>
      <div style="display:flex;gap:2px;height:28px;align-items:flex-end">
        ${recent.map(h=>{
          const pct=range>0?((h.weight-min)/range*70+30):50;
          return `<div style="flex:1;background:var(--terra);border-radius:2px 2px 0 0;height:${pct}%;opacity:.7" title="${h.date}: ${h.weight}kg"></div>`;
        }).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--ink3);margin-top:2px">
        <span>${recent[0]?.date?.slice(5)||''}</span>
        <span>${last}kg</span>
      </div>
    </div>`;
  }).join('')}
</div>`;
})()}
${PR_LIST.length?`
<div class="panel">
  <p class="panel-title">\ud83c\udfc6 个人纪录</p>
  ${PR_LIST.slice(0,10).map(pr=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
      <div>
        <span style="font-weight:600">${pr.exercise}</span>
        <span style="color:var(--ink3);margin-left:6px">${pr.date}</span>
      </div>
      <div>
        <span style="color:var(--ink3);text-decoration:line-through;margin-right:4px">${pr.prev}kg</span>
        <span style="font-weight:700;color:var(--terra)">${pr.weight}kg</span>
      </div>
    </div>
  `).join('')}
</div>`:''}
${(()=>{
if(!GYM_LOG||!GYM_LOG.count) return '';
const gymCount=GYM_LOG.count;
const gymLogs=LOG.filter(l=>!l.isSwimDay);
const thisMonthGym=gymLogs.filter(l=>l.date.startsWith(thisMonth));
const totalGymMin=gymLogs.reduce((s,l)=>s+(l.duration||0),0);
const nextMs=GYM_MILESTONES.find(m=>m.count>gymCount);
const badgesHtml = GYM_MILESTONES.map((ms, idx) => {
    const isUnlocked = gymCount >= ms.count;
    const matchedLog = (GYM_LOG.milestones || []).find(m => m.count === ms.count);
    const badgeSvg = typeof getAchievementBadgeSvg === 'function' ? getAchievementBadgeSvg(ms, isUnlocked) : '';
    return `
    <div class="ach-badge-card" onclick="openAchievementModal('gym', ${idx})" style="flex: 1 1 20%; min-width: 65px; text-align: center; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); border: 1px solid ${isUnlocked?'var(--border2)':'transparent'}; background: ${isUnlocked?'var(--surface)':'none'}; transition: all 0.2s ease;">
        <div style="margin-bottom: 4px;">${badgeSvg}</div>
        <div style="font-size: 10px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${ms.title}">${ms.title}</div>
        <div style="font-size: 9px; color: var(--ink3);">${isUnlocked && matchedLog ? matchedLog.date.slice(5) : `${gymCount}/${ms.count}`}</div>
    </div>
    `;
}).join('');

return `<div class="panel">
  <p class="panel-title">力量成就</p>
  <div class="stats">
    <div class="stat"><div class="stat-val">${gymCount}</div><div class="stat-lbl">总力量次数</div></div>
    <div class="stat"><div class="stat-val">${thisMonthGym.length}</div><div class="stat-lbl">本月力量</div></div>
    <div class="stat"><div class="stat-val">${totalGymMin}</div><div class="stat-lbl">总力量分钟</div></div>
  </div>
  ${nextMs?`<div style="margin-top:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span>下一成就: ${nextMs.title}</span>
      <span style="font-weight:600;color:var(--terra)">${gymCount}/${nextMs.count}</span>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(gymCount/nextMs.count*100)}%"></div></div>
  </div>`:'<div style="margin-top:12px;text-align:center;font-size:12px;color:var(--sage)">所有成就已解锁！</div>'}
  
  <p class="panel-title" style="font-size: 11px; color: var(--ink3); margin-top: 16px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">力量勋章墙</p>
  <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: start;">
    ${badgesHtml}
  </div>
</div>`;
})()}
${(()=>{
if(!SWIM_LOG||!SWIM_LOG.count) return '';
const swimCount=SWIM_LOG.count;
const swimLogs=LOG.filter(l=>l.isSwimDay);
const thisMonthSwim=swimLogs.filter(l=>l.date.startsWith(thisMonth));
const totalSwimMin=swimLogs.reduce((s,l)=>s+(l.duration||0),0);
const nextMs=SWIM_MILESTONES.find(m=>m.count>swimCount);
const badgesHtml = SWIM_MILESTONES.map((ms, idx) => {
    const isUnlocked = swimCount >= ms.count;
    const matchedLog = (SWIM_LOG.milestones || []).find(m => m.count === ms.count);
    const badgeSvg = typeof getAchievementBadgeSvg === 'function' ? getAchievementBadgeSvg(ms, isUnlocked) : '';
    return `
    <div class="ach-badge-card" onclick="openAchievementModal('swim', ${idx})" style="flex: 1 1 20%; min-width: 65px; text-align: center; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); border: 1px solid ${isUnlocked?'var(--border2)':'transparent'}; background: ${isUnlocked?'var(--surface)':'none'}; transition: all 0.2s ease;">
        <div style="margin-bottom: 4px;">${badgeSvg}</div>
        <div style="font-size: 10px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${ms.title}">${ms.title}</div>
        <div style="font-size: 9px; color: var(--ink3);">${isUnlocked && matchedLog ? matchedLog.date.slice(5) : `${swimCount}/${ms.count}`}</div>
    </div>
    `;
}).join('');

return `<div class="panel">
  <p class="panel-title">游泳成就</p>
  <div class="stats">
    <div class="stat"><div class="stat-val">${swimCount}</div><div class="stat-lbl">总游泳次数</div></div>
    <div class="stat"><div class="stat-val">${thisMonthSwim.length}</div><div class="stat-lbl">本月游泳</div></div>
    <div class="stat"><div class="stat-val">${totalSwimMin}</div><div class="stat-lbl">总游泳分钟</div></div>
  </div>
  ${nextMs?`<div style="margin-top:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span>下一成就: ${nextMs.title}</span>
      <span style="font-weight:600;color:var(--terra)">${swimCount}/${nextMs.count}</span>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(swimCount/nextMs.count*100)}%"></div></div>
  </div>`:'<div style="margin-top:12px;text-align:center;font-size:12px;color:var(--sage)">所有成就已解锁！</div>'}
  
  <p class="panel-title" style="font-size: 11px; color: var(--ink3); margin-top: 16px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">游泳勋章墙</p>
  <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: start;">
    ${badgesHtml}
  </div>
</div>`;
})()}
`;
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
} else {
dist[g]=(dist[g]||0)+1;
}
break;
}
}
});
});
const grpNames={chest:'胸',shoulder:'肩',back:'背',biceps:'二头',triceps:'三头',quads:'股四头',hamglutes:'臀腿',calves:'小腿',core:'核心',cardio:'有氧',swim_upper:'游泳(上肢)',swim_lower:'游泳(下肢)',swim_core:'游泳(核心)',swim_cardio:'游泳(心肺)'};
const distStr=Object.entries(dist).sort((a,b)=>b[1]-a[1]).map(([g,c])=>`${grpNames[g]||g}${c}组`).join('·');

let logStr=recent.map(l=>{
const exStr=l.exercises?l.exercises.map(e=>`${e.name}${e.weight?' '+e.weight+'kg':''} ${e.sets}×${e.reps}${e.unit}`).join(', '):'';
return `- ${l.date} | ${l.workout} | ${l.duration||'?'}分钟${l.rpe?' | RPE '+l.rpe+'/10':''}\n  动作：${exStr}${l.note?'\n  备注：'+l.note:''}`;
}).join('\n');

const text=`【Cici 健身日志 - AI 分析请求】\n训练目标：${S.goal} | 水平：${S.level} | 器材：${S.equip.join('+')}\n近${recent.length}次训练：\n\n${logStr}\n\n肌群分布（近30天）：${distStr||'无数据'}\n\n请帮我分析：\n1. 训练计划是否均衡？哪个肌群训练不足？\n2. 根据我的目标（${S.goal}），有什么需要改进？\n3. 下阶段如何调整计划？`;
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
LOG.forEach(x=>{
const exDetail=x.exercises?x.exercises.map(e=>`${e.name}${e.weight?' '+e.weight+'kg':''} ${e.sets}x${e.reps}${e.unit}`).join('; '):'';
rows.push(`${x.date},"${x.workout}",${x.duration},${x.exerciseCount},${x.rpe||''},"${x.mood||''}","${exDetail}","${(x.note||'').replace(/"/g,'""')}"`);
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
const allowed = new Set(Object.values(K));
let imported = false;
Object.entries(data).forEach(([k,v])=>{
    if(allowed.has(k)){
        ls(k,v);
        imported = true;
    }
});
if (imported) {
    location.reload();
} else {
    alert('未找到有效的备份数据');
}
}catch{alert('文件格式错误')}
};reader.readAsText(file);
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

function initFirebase(){
try{
if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
_db=firebase.firestore();
firebase.auth().onAuthStateChanged(handleAuth);
}catch(e){console.warn('Firebase init failed:',e);renderAuthBtn()}
}

function handleAuth(user){
_user=user;
updateProfileUI();
// Recover pre-namespace data into this account before reading state. If anything
// was migrated, mark local dirty so the realtime listener can't overwrite the
// just-recovered keys with a stale/empty cloud doc before our first push.
if(user && typeof migrateLegacyKeys==='function' && migrateLegacyKeys(user.uid)) _localDirty=true;
loadState();
if(typeof render === 'function') render();
if(typeof renderLog === 'function') renderLog();
if(typeof renderStats === 'function') renderStats();
applySettingsToUI();
renderAuthBtn();
if(user){setupRealtimeSync();showToast('已连接');pushProfile();subscribePartner();}
else{if(_unsub){_unsub();_unsub=null}if(_partnerUnsub){_partnerUnsub();_partnerUnsub=null}_partnerProfile=null;}
if(typeof updatePairUI==='function')updatePairUI();
}

window.updateProfileUI = function() {
    // Prefer a user-set display name (Chinese-name friendly) over Google's `given family` split.
    const gName = (_user && _user.displayName) ? _user.displayName.split(' ')[0] : '我的';
    const name = (S.displayName && S.displayName.trim()) ? S.displayName.trim() : gName;
    const seal = (S.sealChar && S.sealChar.trim()) ? S.sealChar.trim() : ((name && name.charAt(0).toUpperCase()) || '健');
    const titleEl = document.getElementById('doc-title');
    if (titleEl) titleEl.textContent = `${name}健身计划`;
    const nameEl = document.getElementById('user-name');
    if (nameEl) { nameEl.textContent = `${name}的计划`; nameEl.style.cursor = 'pointer'; nameEl.title = '点击修改显示名 / 印章'; nameEl.onclick = editProfileName; }
    const sealEl = document.getElementById('user-seal');
    if (sealEl) { sealEl.textContent = seal; sealEl.style.cursor = 'pointer'; sealEl.title = '点击修改显示名 / 印章'; sealEl.onclick = editProfileName; }
};
window.editProfileName = function() {
    const cur = (S.displayName && S.displayName.trim()) ? S.displayName.trim() : ((_user && _user.displayName) ? _user.displayName.split(' ')[0] : '');
    const n = prompt('显示名（用于标题与"…的计划"）：', cur);
    if (n === null) return; // cancelled
    S.displayName = n.trim() || null; // empty restores Google/default name
    const sc = prompt('印章字（建议1-2字，留空自动取名字首字）：', (S.sealChar || ''));
    if (sc !== null) S.sealChar = sc.trim() || null;
    if (typeof saveState === 'function') saveState();
    updateProfileUI();
    if (typeof showToast === 'function') showToast('已更新显示名');
};

function signInGoogle(){
firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e=>alert('登录失败: '+e.message));
}
function signOutUser(){
if(confirm('确定退出登录？'))firebase.auth().signOut();
}

function renderAuthBtn(){
const el=document.getElementById('auth-btn');if(!el)return;
if(_user){
const name=_user.displayName?_user.displayName.split(' ')[0]:'已登录';
const photo=_user.photoURL?`<img src="${_user.photoURL}" class="auth-avatar" alt="">`:`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
el.innerHTML=`<div class="auth-pill-left">${photo}<span style="font-size:12px">${name}</span></div><div class="auth-pill-sync" id="sync-pill">✓</div><button class="auth-pill-signout" onclick="signOutUser()">退出</button>`;
}else{
el.innerHTML=`<button class="auth-sign-in" onclick="signInGoogle()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>登录同步</button>`;
}
}

function setupRealtimeSync(){
if(!_db||!_user)return;
if(_unsub)_unsub();
_unsub=_db.collection('users').doc(_user.uid).onSnapshot(doc=>{
if(!doc.exists)return;
// If local changes are pending push, do NOT let cloud overwrite them
if(_localDirty){
    console.log('[sync] skipped cloud→local: local changes pending push');
    return;
}
let changed=false;
Object.entries(doc.data()).forEach(([k,v])=>{
const nk=nsKey(k);
const lv=localStorage.getItem(nk);
const cv=JSON.stringify(v);
if(lv!==cv){try{localStorage.setItem(nk,cv);changed=true}catch{}}
});
if(changed){loadState();renderLog();showToast('已从云端同步')}
},e=>console.warn('Sync error:',e));
// Initial push — send local data up first so cloud has latest
setTimeout(()=>pushToCloud(),1000);
}

let _dirtyId=0; // bumped on every local change; lets a push detect changes that arrive mid-flight
function schedulePush(){
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
    const pill=document.getElementById('sync-pill');
    if(pill){pill.textContent='X';pill.className='auth-pill-sync err'}
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
if(_dirtyId===sentId){ _localDirty=false; } else { clearTimeout(_pushTimer); _pushTimer=setTimeout(pushToCloud,2000); }
const pill=document.getElementById('sync-pill');
if(pill){pill.textContent='✓';pill.className='auth-pill-sync ok'}
}catch(e){
console.warn('Push failed:',e);
// Keep _localDirty=true so the snapshot listener can't overwrite the unpushed change; retry with backoff.
const pill=document.getElementById('sync-pill');
if(pill){pill.textContent='X';pill.className='auth-pill-sync err'}
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
function buildSharedProfile(){
  const today=todayStr();
  const td=(S.plan&&S.plan.days)?S.plan.days.find(d=>d.date===today):null;
  const myName=(S.displayName&&S.displayName.trim())||(_user&&_user.displayName?_user.displayName.split(' ')[0]:'搭子');
  const pu=partnerUid();
  return {
    name: myName,
    days: +S.days||null,
    hasPool: S.equip.includes('泳池'),
    todayType: td?(td.isRest?'休息':td.workoutType):'—',
    todayDone: td?!!isDone(td):false,
    swimCount: (typeof SWIM_LOG!=='undefined'&&SWIM_LOG.count)||0,
    cheer: (S.cheer&&S.cheer.date)?S.cheer:null,   // my latest cheer TO my partner
    allowedReaders: pu?[pu]:[],                     // who may read this doc (the rule checks this)
    lastActive: today
  };
}
function pushProfile(){
  if(!_db||!_user) return;
  try{
    _db.collection('users').doc(_user.uid).collection('shared').doc('profile')
       .set(buildSharedProfile(),{merge:true}).catch(e=>console.warn('profile push failed:',e));
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
window.sendCheer=function(emoji){
  if(!partnerUid()){ showToast('先和搭子配对'); return; }
  S.cheer={ date:todayStr(), emoji:emoji||'💪' };
  saveState(); pushProfile(); updatePairUI(); if(typeof render==='function')render();
  showToast('已给搭子加油 '+(emoji||'💪'));
};
function updatePairUI(){
  const me=document.getElementById('my-pair-code');
  if(me) me.textContent=_user?_user.uid:'（请先登录）';
  const inp=document.getElementById('partner-code-input');
  if(inp&&document.activeElement!==inp) inp.value=partnerUid()||'';
  const pdRow=document.getElementById('partner-days-row');
  if(pdRow) pdRow.style.display=partnerUid()?'none':'block'; // paired → manual day-count hidden
  const status=document.getElementById('pair-status');
  if(status){
    const pu=partnerUid();
    if(!pu){ status.style.display='none'; }
    else{
      status.style.display='block';
      if(_partnerProfile){
        const c=_partnerProfile.cheer;
        const cheerLine=(c&&c.date===todayStr())?` · TA今天给你 ${c.emoji}`:'';
        status.innerHTML=`已连接 <b>${_partnerProfile.name||'搭子'}</b> · 今日：${_partnerProfile.todayType}${_partnerProfile.todayDone?' ✓':''}${cheerLine} · <a href="#" onclick="unpairPartner();return false">解除</a>`;
      }else{
        status.innerHTML=`已保存配对码，等对方也填上你的配对码即可连接 · <a href="#" onclick="unpairPartner();return false">取消</a>`;
      }
    }
  }
}

// ══ UI Bindings ══════════════════════════════════════════
function flashSaved(){
  const dot=document.getElementById('saved-dot');
  if(dot){dot.classList.add('show');setTimeout(()=>dot.classList.remove('show'),1200);}
}

function single(id,key){
const el=document.getElementById(id);if(!el)return;
el.addEventListener('click',e=>{
const b=e.target.closest('.chip');if(!b)return;
document.querySelectorAll('#'+id+' .chip').forEach(c=>c.classList.remove('on'));
b.classList.add('on');S[key]=b.dataset.v;saveState();
flashSaved();
});
}
function multi(id,key){
const el=document.getElementById(id);if(!el)return;
el.addEventListener('click',e=>{
const b=e.target.closest('.chip');if(!b)return;
b.classList.toggle('on');
const v=b.dataset.v;
S[key]=S[key].includes(v)?S[key].filter(x=>x!==v):[...S[key],v];
saveState();
flashSaved();
});
}
// goal chip: plain toggle; 女性曲线 won't deselect once active
(function(){
  const el = document.getElementById('g-goal');
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.dataset.v === '女性曲线' && hasGoal('女性曲线')) return;
    applyGoalToggle(b.dataset.v);
    saveState();
    applySettingsToUI();
    flashSaved();
  });
})();
// 专项模式: 通过 dev console 按钮触发 (见 dev.js toggleSubMode)
window.toggleSubMode = function() {
  if (!_ownerSession()) return;
  _globalSubMode = !_globalSubMode;
  if (typeof _exDetailSubMode !== 'undefined') _exDetailSubMode = _globalSubMode;
  document.body.classList.toggle('sub-active', _globalSubMode);
  if (typeof render === 'function') render();
  const todayBtn = document.querySelector('.tab[onclick*="today"]');
  if (todayBtn) showTab('today', todayBtn);
  if (typeof showToast === 'function') showToast(_globalSubMode ? '专项模式已开启' : '标准模式已恢复');
};

window.triggerPanic = function() {
  _globalSubMode = false;
  document.body.classList.remove('sub-active');
  const overlay = document.getElementById('sub-strobing-overlay-guided');
  if (overlay) overlay.remove();
  if (typeof render === 'function') render();
  if (typeof showToast === 'function') showToast('标准模式已恢复');
};

single('g-level','level');
multi('g-equip','equip');multi('g-focus','focus');
(function(){
const el=document.getElementById('g-rest');if(!el)return;
el.addEventListener('click',e=>{
const b=e.target.closest('.chip');if(!b)return;
document.querySelectorAll('#g-rest .chip').forEach(c=>c.classList.remove('on'));
b.classList.add('on');S.restDur=+b.dataset.v;saveState();
flashSaved();
});
})();
// Swim level selector
(function(){
const el=document.getElementById('g-swim-level');if(!el)return;
el.addEventListener('click',e=>{
const b=e.target.closest('.chip');if(!b)return;
document.querySelectorAll('#g-swim-level .chip').forEach(c=>c.classList.remove('on'));
b.classList.add('on');S.swimLevel=b.dataset.v;saveState();
flashSaved();
})})();

// 搭子 weekly day-count selector (drives the calendar overlap markers)
(function(){
const el=document.getElementById('g-partner-days');if(!el)return;
el.addEventListener('click',e=>{
const b=e.target.closest('.chip');if(!b)return;
document.querySelectorAll('#g-partner-days .chip').forEach(c=>c.classList.remove('on'));
b.classList.add('on');S.partnerDays=+b.dataset.v||0;saveState();
flashSaved();
updatePartnerOverlap();
if(S.plan&&typeof render==='function')render();
})})();

// Period mode toggle
const periodSwitch=document.getElementById('period-switch');
if(periodSwitch) periodSwitch.addEventListener('change',function(){
S.periodMode=this.checked;
const row=document.getElementById('period-toggle-row');
if(row) row.classList.toggle('active',S.periodMode);
saveState();
flashSaved();
updateSwimBreakdown();
if(S.plan){genPlan(true);render();}
});

// Show/hide swim settings when 泳池 equipment is toggled
const _origEquipEl=document.getElementById('g-equip');
if(_origEquipEl){
_origEquipEl.addEventListener('click',()=>{
const swimPanel=document.getElementById('swim-settings');
if(swimPanel) swimPanel.style.display=S.equip.includes('泳池')?'block':'none';
updateSwimBreakdown();
});
}
document.getElementById('sl-days').addEventListener('input',e=>{S.days=+e.target.value;document.getElementById('v-days').textContent=S.days+'天';saveState();updateSwimBreakdown()});
document.getElementById('sl-dur').addEventListener('input',e=>{S.dur=+e.target.value;document.getElementById('v-dur').textContent=S.dur+'分钟';saveState()});
document.getElementById('limits').addEventListener('input',e=>{S.limits=e.target.value;saveState()});
// Cycle controls (manual slider; whole block hidden when 「生理期/周期功能」 is off)
const cyEnSw=document.getElementById('cycle-enable-switch');
if(cyEnSw) cyEnSw.addEventListener('change',function(){S.cycleEnabled=this.checked;let ch=false;if(!this.checked&&S.periodMode){S.periodMode=false;ch=true;}saveState();applySettingsToUI();flashSaved();if(ch&&S.plan){genPlan(true);render();}});
const slCycle=document.getElementById('sl-cycle');
if(slCycle) slCycle.addEventListener('input',e=>{S.cycleDay=+e.target.value;updateCycleUI();saveState();});
const cyLenEl=document.getElementById('cycle-len');
if(cyLenEl) cyLenEl.addEventListener('input',e=>{S.cycleLength=Math.max(20,Math.min(40,+e.target.value||28));updateCycleUI();saveState();});
window.cyclePeriodStart=function(){S.cycleDay=1;saveState();applySettingsToUI();flashSaved();if(typeof showToast==='function')showToast('已记录：周期第1天');};

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
        container.innerHTML = `<img src="${imgUrl}" style="max-width:100%; max-height:450px; border-radius:4px; display:block;" alt="打卡卡片预览" />`;
    }
    
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
    actionBtn.style.background = 'var(--sage)';
    
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
        
        container.innerHTML = `<img src="${imgUrl}" style="width:100%; border-radius:var(--radius); display:block;" alt="成就卡片" />`;
        container.style.display = 'flex';
        btn.textContent = '下载勋章卡';
        btn.style.background = 'var(--terra)';
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

function drawAchievementShareCard(type, idx) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 850;
    const ctx = canvas.getContext('2d');
    
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
    ctx.font = 'bold 13px "Outfit", system-ui, sans-serif';
    ctx.fillText(isUnlocked ? `已解锁 · ${dateStr}` : `尚未解锁 (${userLog.count}/${ms.count})`, 300, 520);
    
    ctx.fillStyle = '#2c2825';
    ctx.font = 'bold 36px "ZCOOL XiaoWei", "Noto Serif SC", Georgia, serif';
    ctx.fillText(ms.title, 300, 580);
    
    ctx.fillStyle = '#6b6560';
    ctx.font = 'normal 15px "Outfit", system-ui, sans-serif';
    ctx.fillText(ms.desc, 300, 630);
    
    ctx.strokeStyle = '#d5cec2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(120, 680);
    ctx.lineTo(480, 680);
    ctx.stroke();
    
    ctx.fillStyle = '#9b948a';
    ctx.font = 'normal 12px "Outfit", system-ui, sans-serif';
    ctx.fillText('CICI FITNESS · 极简专业健身助理', 300, 720);
    
    return canvas.toDataURL('image/png');
}

function drawShareCard(logEntry) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 850;
    const ctx = canvas.getContext('2d');
    
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
    ctx.font = 'normal 13px "DM Mono", "Outfit", sans-serif';
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
        ctx.font = 'normal 12px "Outfit", system-ui, sans-serif';
        ctx.fillText(st.label, x, 168);
        
        ctx.fillStyle = '#2c2825';
        ctx.font = 'bold 18px "Outfit", system-ui, sans-serif';
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
    const _pvFilter = (typeof _PRIVATE_POOL !== 'undefined') ? new Set(_PRIVATE_POOL) : new Set();
    const exList = (logEntry.exercises || []).filter(ex => !_pvFilter.has(ex.name));
    const limit = 8;
    exList.slice(0, limit).forEach(ex => {
        // Exercise Name
        ctx.fillStyle = '#2c2825';
        ctx.font = 'normal 14px "Noto Serif SC", system-ui, serif';
        ctx.fillText(`• ${ex.name}`, 50, y);
        
        // Detail
        ctx.fillStyle = '#8c8070';
        ctx.font = 'normal 13px "DM Mono", "Outfit", monospace';
        ctx.textAlign = 'right';
        const wtStr = ex.weight ? `${ex.weight}kg ` : '';
        ctx.fillText(`${wtStr}${ex.sets}组 × ${ex.reps}${ex.unit || '次'}`, 550, y);
        ctx.textAlign = 'left'; // reset
        y += 36;
    });
    
    if (exList.length > limit) {
        ctx.fillStyle = '#8c8070';
        ctx.font = 'italic 12px "Outfit", system-ui, sans-serif';
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
    ctx.font = 'normal 10px "DM Mono", "Outfit", monospace';
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
    ctx.font = 'bold 9px "Cormorant Garamond", Georgia, serif';
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
renderAuthBtn(); // show login button immediately, don't wait for Firebase
initFirebase();

// Fetch BDSM database
(function() {
  fetch('scratch/obfuscated_v2.json')
    .then(r => r.text())
    .then(text => {
      localStorage.setItem('__obfuscated_v2_cache__', text);
    }).catch(e => console.error(e));
})();
