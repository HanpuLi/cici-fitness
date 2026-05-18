// ══ app.js — Auth, Sync, Journal, Stats, UI ═════════════

// ══ State Persistence ════════════════════════════════════
function saveState(){
ls(K.settings,{goal:S.goal,level:S.level,days:S.days,dur:S.dur,equip:S.equip,focus:S.focus,limits:S.limits});
if(S.plan)ls(K.plan,{plan:S.plan,selDate:S.selDate,prog:S.prog,adj:S.adj});
}
function loadState(){
const s=lg(K.settings);
if(s)Object.assign(S,s);
const p=lg(K.plan);
if(p&&p.plan&&p.plan.days){S.plan=p.plan;S.selDate=p.selDate||todayStr();S.prog=p.prog||{};S.adj=p.adj||{}}
else{S.plan=null;}
LOG=lg(K.log)||[];
applySettingsToUI();
if(S.plan)render();
}
function applySettingsToUI(){
document.querySelectorAll('#g-goal .chip').forEach(b=>b.classList.toggle('on',b.dataset.v===S.goal));
document.querySelectorAll('#g-level .chip').forEach(b=>b.classList.toggle('on',b.dataset.v===S.level));
document.getElementById('sl-days').value=S.days;
document.getElementById('v-days').textContent=S.days+'天';
document.getElementById('sl-dur').value=S.dur;
document.getElementById('v-dur').textContent=S.dur+'分钟';
document.querySelectorAll('#g-equip .chip').forEach(b=>b.classList.toggle('on',S.equip.includes(b.dataset.v)));
document.querySelectorAll('#g-focus .chip').forEach(b=>b.classList.toggle('on',S.focus.includes(b.dataset.v)));
document.getElementById('limits').value=S.limits||'';
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
const mood=x.mood||'💪';
html+=`
<div class="tl-item">
  <div class="tl-left">
    <div class="tl-dot">${mood}</div>
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
        <button class="jentry-del" onclick="delLog(${logIdx})">×</button>
      </div>
    </div>
    <div class="tl-chips">
      <span class="jchip done-c">${x.exerciseCount||0}个动作完成</span>
      ${x.exercises?x.exercises.slice(0,3).map(e=>`<span class="jchip">${e.name}</span>`).join('')+((x.exercises.length>3)?`<span class="jchip" style="opacity:.5">+${x.exercises.length-3}个</span>`:''):''}
    </div>
    ${x.note?`<div class="jentry-note">"${x.note}"</div>`:''}
  </div>
</div>`;
});
html+='</div>';
});
el.innerHTML=html;
}

function delLog(idx){
if(!confirm('确定删除这条记录？'))return;
LOG.splice(idx,1);ls(K.log,LOG);renderLog();
}

// ══ Stats ════════════════════════════════════════════════
function renderStats(){
const el=document.getElementById('stats-content');
if(!el)return;
const today=new Date();

// Streak
let streak=0;
for(let i=0;i<365;i++){
const d=new Date(today);d.setDate(d.getDate()-i);
if(LOG.find(l=>l.date===d.toISOString().split('T')[0]))streak++;
else if(i>0)break;
}

// Month stats
const thisMonth=today.toISOString().slice(0,7);
const monthLogs=LOG.filter(l=>l.date.startsWith(thisMonth));
const today7=new Date();today7.setDate(today7.getDate()-7);const t7str=today7.toISOString().split('T')[0];
const weekDays=S.plan?S.plan.days.filter(d=>!d.isRest&&d.date>=t7str&&d.date<=today.toISOString().split('T')[0]):[];
const weekDone=weekDays.filter(d=>isDone(d)).length;
const weekTotal=weekDays.length;
const weekPct=weekTotal?Math.round(weekDone/weekTotal*100):0;

// 12-week heatmap
const logDates=new Set(LOG.map(l=>l.date));
const heatCells=[];
for(let i=83;i>=0;i--){
const d=new Date(today);d.setDate(d.getDate()-i);
const ds=d.toISOString().split('T')[0];
heatCells.push({ds,active:logDates.has(ds),day:d.getDay()});
}
const heatHtml=heatCells.map(c=>{
const isToday=c.ds===today.toISOString().split('T')[0];
return`<div class="heat-cell${c.active?' heat-on':''}${isToday?' heat-today':''}" title="${c.ds}"></div>`;
}).join('');

// Muscle distribution with bar
const dist={};
LOG.slice(0,60).forEach(l=>{
if(l.exercises)l.exercises.forEach(ex=>{
for(const[grp,exs]of Object.entries(DB)){
if(exs.find(e=>e.n===ex.name)){dist[grp]=(dist[grp]||0)+1;break}}
});
});
const grpNames={chest:'胸',shoulder:'肩',back:'背',biceps:'二头',triceps:'三头',quads:'股四头',hamglutes:'臀腿',calves:'小腿',core:'核心',cardio:'有氧'};
const distEntries=Object.entries(dist).sort((a,b)=>b[1]-a[1]);
const maxDist=distEntries[0]?.[1]||1;

el.innerHTML=`
<div class="streak-box"><div class="streak-num">${streak}</div><div class="streak-lbl">🔥 连续打卡天数</div></div>
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
`;
}

// ══ Export / Import ══════════════════════════════════════
function exportForAI(){
const recent=LOG.slice(0,30);
if(!recent.length){alert('暂无日志记录');return}
const dist={};
recent.forEach(l=>{if(l.exercises)l.exercises.forEach(ex=>{for(const[g,exs]of Object.entries(DB)){if(exs.find(e=>e.n===ex.name)){dist[g]=(dist[g]||0)+1;break}}})});
const grpNames={chest:'胸',shoulder:'肩',back:'背',biceps:'二头',triceps:'三头',quads:'股四头',hamglutes:'臀腿',calves:'小腿',core:'核心',cardio:'有氧'};
const distStr=Object.entries(dist).sort((a,b)=>b[1]-a[1]).map(([g,c])=>`${grpNames[g]||g}${c}组`).join('·');

let logStr=recent.map(l=>{
const exStr=l.exercises?l.exercises.map(e=>`${e.name} ${e.sets}×${e.reps}${e.unit}`).join(', '):'';
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
const rows=['日期,训练类型,时长(分钟),动作数,感受,备注'];
LOG.forEach(x=>rows.push(`${x.date},"${x.workout}",${x.duration},${x.exerciseCount},"${x.mood||''}","${(x.note||'').replace(/"/g,'""')}"`));
const blob=new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fitness_'+new Date().toISOString().split('T')[0]+'.csv';a.click();
}
function importJSON(input){
const file=input.files[0];if(!file)return;
const reader=new FileReader();
reader.onload=e=>{
try{
const data=JSON.parse(e.target.result);
Object.entries(data).forEach(([k,v])=>{if(k!=='_meta')ls(k,v)});
location.reload();
}catch{alert('文件格式错误')}
};reader.readAsText(file);
}

// ══ Sync Toast ═══════════════════════════════════════════
let _toastTimer=null;
function showToast(msg){
const el=document.getElementById('sync-toast');
if(!el)return;
el.textContent=msg;el.classList.add('show');
clearTimeout(_toastTimer);
_toastTimer=setTimeout(()=>el.classList.remove('show'),3500);
}

// ══ Firebase Auth & Cloud Sync ═══════════════════════════
const CLOUD_KEYS=Object.values(K);
let _db=null,_user=null,_pushTimer=null,_pushing=false,_unsub=null;

function initFirebase(){
try{
if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
_db=firebase.firestore();
firebase.auth().onAuthStateChanged(handleAuth);
}catch(e){console.warn('Firebase init failed:',e);renderAuthBtn()}
}

function handleAuth(user){
_user=user;renderAuthBtn();
if(user){setupRealtimeSync();showToast('✓ 已连接')}
else{if(_unsub){_unsub();_unsub=null}}
}

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
const photo=_user.photoURL?`<img src="${_user.photoURL}" class="auth-avatar" alt="">`:' 👤';
el.innerHTML=`<div class="auth-pill-left">${photo}<span style="font-size:12px">${name}</span></div><div class="auth-pill-sync" id="sync-pill">✓</div><button class="auth-pill-signout" onclick="signOutUser()">退出</button>`;
}else{
el.innerHTML=`<button class="auth-sign-in" onclick="signInGoogle()">🔐 登录同步</button>`;
}
}

function setupRealtimeSync(){
if(!_db||!_user)return;
if(_unsub)_unsub();
_unsub=_db.collection('users').doc(_user.uid).onSnapshot(doc=>{
if(!doc.exists)return;
let changed=false;
Object.entries(doc.data()).forEach(([k,v])=>{
const lv=localStorage.getItem(k);
const cv=JSON.stringify(v);
if(lv!==cv){try{localStorage.setItem(k,cv);changed=true}catch{}}
});
if(changed){loadState();renderLog();showToast('☁ 已从云端同步')}
},e=>console.warn('Sync error:',e));
// Initial push
setTimeout(()=>pushToCloud(),1000);
}

function schedulePush(){
if(!_db||!_user)return;
clearTimeout(_pushTimer);
_pushTimer=setTimeout(pushToCloud,2000);
}

async function pushToCloud(){
if(!_db||!_user||_pushing)return;
_pushing=true;
const data={};
CLOUD_KEYS.forEach(k=>{const v=localStorage.getItem(k);if(v!==null){try{data[k]=JSON.parse(v)}catch{data[k]=v}}});
try{
await _db.collection('users').doc(_user.uid).set(data,{merge:true});
const pill=document.getElementById('sync-pill');
if(pill){pill.textContent='✓';pill.className='auth-pill-sync ok'}
}catch(e){console.warn('Push failed:',e)}
_pushing=false;
}

// ══ UI Bindings ══════════════════════════════════════════
function single(id,key){
document.getElementById(id).addEventListener('click',e=>{
const b=e.target.closest('.chip');if(!b)return;
document.querySelectorAll('#'+id+' .chip').forEach(c=>c.classList.remove('on'));
b.classList.add('on');S[key]=b.dataset.v;saveState();
const dot=document.getElementById('saved-dot');dot.classList.add('show');setTimeout(()=>dot.classList.remove('show'),1200);
});
}
function multi(id,key){
document.getElementById(id).addEventListener('click',e=>{
const b=e.target.closest('.chip');if(!b)return;
b.classList.toggle('on');
const v=b.dataset.v;
S[key]=S[key].includes(v)?S[key].filter(x=>x!==v):[...S[key],v];
saveState();
});
}
single('g-goal','goal');single('g-level','level');
multi('g-equip','equip');multi('g-focus','focus');
document.getElementById('sl-days').addEventListener('input',e=>{S.days=+e.target.value;document.getElementById('v-days').textContent=S.days+'天';saveState()});
document.getElementById('sl-dur').addEventListener('input',e=>{S.dur=+e.target.value;document.getElementById('v-dur').textContent=S.dur+'分钟';saveState()});
document.getElementById('limits').addEventListener('input',e=>{S.limits=e.target.value;saveState()});

// ══ Init ═════════════════════════════════════════════════
loadState();
renderAuthBtn(); // show login button immediately, don't wait for Firebase
initFirebase();
