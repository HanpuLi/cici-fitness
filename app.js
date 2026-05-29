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
        btn.textContent = '🌓';
        btn.title = '跟随系统 (点击切换)';
    } else if (current === 'light') {
        btn.textContent = '☀️';
        btn.title = '浅色模式 (点击切换)';
    } else {
        btn.textContent = '🌙';
        btn.title = '深色模式 (点击切换)';
    }
}

// ══ State Persistence ════════════════════════════════════
function saveState(){
ls(K.settings,{goal:S.goal,level:S.level,days:S.days,dur:S.dur,equip:S.equip,focus:S.focus,limits:S.limits,volumeMultiplier:S.volumeMultiplier,restDur:S.restDur,swimLevel:S.swimLevel,periodMode:S.periodMode});
if(S.plan)ls(K.plan,{plan:S.plan,prog:S.prog,adj:S.adj,weights:S.weights,unlockedDates:S.unlockedDates});
localStorage.setItem('fit_selDate', S.selDate || '');
}
function loadState(){
const s=lg(K.settings);
if(s)Object.assign(S,s);
const p=lg(K.plan);
if(p&&p.plan&&p.plan.days){
    S.plan=p.plan;
    S.selDate=localStorage.getItem('fit_selDate') || p.selDate || todayStr();
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
applySettingsToUI();
if(S.plan)render();
if(S.plan && typeof autoAlignPlan==='function') autoAlignPlan();
_initialLoad = false;
}
function applySettingsToUI(){
document.querySelectorAll('#g-level .chip').forEach(b=>b.classList.toggle('on',b.dataset.v===S.level));
document.getElementById('sl-days').value=S.days;
document.getElementById('v-days').textContent=S.days+'天';
document.getElementById('sl-dur').value=S.dur;
document.getElementById('v-dur').textContent=S.dur+'分钟';
document.querySelectorAll('#g-equip .chip').forEach(b=>b.classList.toggle('on',S.equip.includes(b.dataset.v)));
document.querySelectorAll('#g-focus .chip').forEach(b=>b.classList.toggle('on',S.focus.includes(b.dataset.v)));
document.getElementById('limits').value=S.limits||'';
document.querySelectorAll('#g-rest .chip').forEach(b=>b.classList.toggle('on',+b.dataset.v===(S.restDur??45)));
document.querySelectorAll('#g-swim-level .chip').forEach(b=>b.classList.toggle('on',b.dataset.v===(S.swimLevel||'入门')));
const swimPanel=document.getElementById('swim-settings');
if(swimPanel) swimPanel.style.display=S.equip.includes('泳池')?'block':'none';
const periodSwitch=document.getElementById('period-switch');
if(periodSwitch) periodSwitch.checked=!!S.periodMode;
const periodRow=document.getElementById('period-toggle-row');
if(periodRow) periodRow.classList.toggle('active',!!S.periodMode);
updateSwimBreakdown();

const rBtn = document.getElementById('recal-btn');
if(rBtn) rBtn.style.display = S.plan ? 'block' : 'none';
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
saveState();
renderLog();
if(typeof render === 'function') render();
if(typeof renderStats === 'function') renderStats();
}

async function clearAllData() {
if(confirm('⚠️ 警告：确定要清空所有计划、打卡记录和统计数据吗？此操作不可恢复！（包括云端数据）')){
    // 1. Stop realtime sync so cloud data doesn't flood back
    if(_unsub){_unsub();_unsub=null}
    // 2. Delete cloud data if logged in
    if(_db && _user){
        try{ await _db.collection('users').doc(_user.uid).delete(); }catch(e){ console.warn('Cloud clear failed:',e); }
    }
    // 3. Clear local (including weight history)
    Object.values(K).forEach(key => localStorage.removeItem(key));
    localStorage.removeItem('fit_selDate');
    W_HIST={};
    PR_LIST=[];
    location.reload();
}
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
return`<div class="heat-cell${c.active?' heat-on':''}${isToday?' heat-today':''}" title="${c.ds}" ${c.active?`onclick="showHistoryDetail('${c.ds}')"`:''} ></div>`;
}).join('');

// Muscle distribution with bar
const dist={};
LOG.slice(0,60).forEach(l=>{
if(l.exercises)l.exercises.forEach(ex=>{
for(const[grp,exs]of Object.entries(DB)){
if(exs.find(e=>e.n===ex.name)){dist[grp]=(dist[grp]||0)+1;break}}
});
});
const grpNames={chest:'胸',shoulder:'肩',back:'背',biceps:'二头',triceps:'三头',quads:'股四头',hamglutes:'臀腿',calves:'小腿',core:'核心',cardio:'有氧',swimming:'游泳'};
const distEntries=Object.entries(dist).sort((a,b)=>b[1]-a[1]);
const maxDist=distEntries[0]?.[1]||1;

el.innerHTML=`
<div class="streak-box"><div class="streak-num">${streak}</div><div class="streak-lbl">连续打卡天数</div></div>
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
if(!SWIM_LOG||!SWIM_LOG.count) return '';
const swimCount=SWIM_LOG.count;
const swimLogs=LOG.filter(l=>l.isSwimDay);
const thisMonthSwim=swimLogs.filter(l=>l.date.startsWith(today.toISOString().slice(0,7)));
const totalSwimMin=swimLogs.reduce((s,l)=>s+(l.duration||0),0);
const nextMs=SWIM_MILESTONES.find(m=>m.count>swimCount);
const unlockedMs=(SWIM_LOG.milestones||[]).slice().reverse();
return `<div class="panel">
  <p class="panel-title">🏊 游泳成就</p>
  <div class="stats">
    <div class="stat"><div class="stat-val">${swimCount}</div><div class="stat-lbl">总游泳次数</div></div>
    <div class="stat"><div class="stat-val">${thisMonthSwim.length}</div><div class="stat-lbl">本月游泳</div></div>
    <div class="stat"><div class="stat-val">${totalSwimMin}</div><div class="stat-lbl">总游泳分钟</div></div>
  </div>
  ${nextMs?`<div style="margin-top:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span>下一成就: ${nextMs.icon} ${nextMs.title}</span>
      <span style="font-weight:600;color:var(--terra)">${swimCount}/${nextMs.count}</span>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(swimCount/nextMs.count*100)}%"></div></div>
  </div>`:'<div style="margin-top:8px;text-align:center;font-size:12px;color:var(--sage)">🧜 所有成就已解锁！</div>'}
  ${unlockedMs.length?`<div style="margin-top:10px">
    ${unlockedMs.map(m=>`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border)">
      <span style="font-size:16px">${m.icon}</span>
      <div style="flex:1"><span style="font-weight:600">${m.title}</span><span style="color:var(--ink3);margin-left:6px;font-size:11px">${m.desc}</span></div>
      <span style="font-size:10px;color:var(--ink3)">${m.date||''}</span>
    </div>`).join('')}
  </div>`:''}
</div>`;
})()}
`;
}

// ══ Export / Import ══════════════════════════════════════
function exportForAI(){
const recent=LOG.slice(0,30);
if(!recent.length){alert('暂无日志记录');return}
const dist={};
recent.forEach(l=>{if(l.exercises)l.exercises.forEach(ex=>{for(const[g,exs]of Object.entries(DB)){if(exs.find(e=>e.n===ex.name)){dist[g]=(dist[g]||0)+1;break}}})});
const grpNames={chest:'胸',shoulder:'肩',back:'背',biceps:'二头',triceps:'三头',quads:'股四头',hamglutes:'臀腿',calves:'小腿',core:'核心',cardio:'有氧',swimming:'游泳'};
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
let _localDirty=false; // When true, local changes are pending push — block cloud-to-local sync

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
const photo=_user.photoURL?`<img src="${_user.photoURL}" class="auth-avatar" alt="">`:'👤';
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
// If local changes are pending push, do NOT let cloud overwrite them
if(_localDirty){
    console.log('[sync] skipped cloud→local: local changes pending push');
    return;
}
let changed=false;
Object.entries(doc.data()).forEach(([k,v])=>{
const lv=localStorage.getItem(k);
const cv=JSON.stringify(v);
if(lv!==cv){try{localStorage.setItem(k,cv);changed=true}catch{}}
});
if(changed){loadState();renderLog();showToast('☁ 已从云端同步')}
},e=>console.warn('Sync error:',e));
// Initial push — send local data up first so cloud has latest
setTimeout(()=>pushToCloud(),1000);
}

function schedulePush(){
if(!_db||!_user)return;
_localDirty=true; // Block cloud-to-local until push completes
clearTimeout(_pushTimer);
_pushTimer=setTimeout(pushToCloud,2000);
}

async function pushToCloud(){
if(!_db||!_user||_pushing)return;
if(typeof _mockSyncFail !== 'undefined' && _mockSyncFail) {
    console.log('[sync] simulated push failure (offline)');
    const pill=document.getElementById('sync-pill');
    if(pill){pill.textContent='❌';pill.className='auth-pill-sync err'}
    return;
}
_pushing=true;
const data={};
CLOUD_KEYS.forEach(k=>{const v=localStorage.getItem(k);if(v!==null){try{data[k]=JSON.parse(v)}catch{data[k]=v}}});
try{
await _db.collection('users').doc(_user.uid).set(data,{merge:true});
_localDirty=false; // Push succeeded — safe to accept cloud updates again
const pill=document.getElementById('sync-pill');
if(pill){pill.textContent='✓';pill.className='auth-pill-sync ok'}
}catch(e){console.warn('Push failed:',e);_localDirty=false}
_pushing=false;
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
        { label: '运动心境', val: `${logEntry.mood || '💪'}${logEntry.rpe ? ` (RPE ${logEntry.rpe})` : ''}` }
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
    
    // 9. Draw exercises list
    let y = 300;
    const exList = logEntry.exercises || [];
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
    ctx.fillText('Cici', 0, -2);
    ctx.font = 'bold 8px "Noto Serif SC", Georgia, serif';
    ctx.fillText('印记', 0, 8);
    ctx.restore();
    
    return canvas.toDataURL('image/png');
}

// ══ Developer Console & Testing Helpers ══════════════════
let _devClicks = 0;
let _devLastClick = 0;
let _mockSyncFail = false;

function _checkSyncAlert() {
    if (_user && !_mockSyncFail) {
        return confirm('⚠️ 警告：检测到您已登录 Google 账号。生成测试历史数据会自动同步至云端，可能会覆盖或污染您的真实训练记录！\n\n建议先在测试控制台中开启“模拟同步状态切换”（断开云同步）或退出登录。\n\n点击“确定”继续生成并上传，点击“取消”放弃。');
    }
    return true;
}

function triggerDevClick() {
    const now = Date.now();
    if (now - _devLastClick > 3000) {
        _devClicks = 0;
    }
    _devClicks++;
    _devLastClick = now;
    if (_devClicks === 7) {
        showToast('🛠️ 开发者测试控制台已解锁！');
        openDevModal();
        _devClicks = 0;
    }
}

function openDevModal() {
    const modal = document.getElementById('dev-modal');
    if (modal) modal.classList.add('open');
    updateStateInspector();
}

function closeDevModal() {
    const modal = document.getElementById('dev-modal');
    if (modal) modal.classList.remove('open');
}

function updateStateInspector() {
    const el = document.getElementById('dev-state-inspector');
    if (el) {
        el.value = JSON.stringify({
            S,
            logCount: LOG.length,
            prCount: PR_LIST.length,
            isOfflineSimulated: _mockSyncFail,
            simulatedDate: _mockDate || '当前真实系统时间'
        }, null, 2);
    }
}

function genMockHistory(days) {
    if (!_checkSyncAlert()) return;
    if (!confirm(`确定生成过去 ${days} 天的模拟打卡历史记录吗？这会覆盖同日期的数据。`)) return;
    
    const splitNames = ["上肢推", "上肢拉", "下肢力量", "核心与胸", "有氧塑形"];
    const baseDate = todayStr();
    
    for (let i = days; i >= 1; i--) {
        // 60% training probability
        if (Math.random() > 0.6) continue;
        
        const targetDate = addDays(baseDate, -i);
        // Exclude if already exists (or overwrite)
        const existIdx = LOG.findIndex(l => l.date === targetDate);
        if (existIdx !== -1) {
            LOG.splice(existIdx, 1);
        }
        
        const isSwim = S.equip.includes('泳池') && Math.random() > 0.7;
        let entry;
        
        if (isSwim) {
            entry = {
                date: targetDate,
                workout: '游泳训练',
                duration: Math.round(30 + Math.random() * 20),
                exerciseCount: 3,
                rpe: Math.round(5 + Math.random() * 3),
                mood: ["😊 舒畅", "😅 略累", "🥰 精神饱满"][Math.floor(Math.random() * 3)],
                exercises: [
                    { name: '水中呼吸练习', sets: 1, reps: 5, unit: '分钟', done: true },
                    { name: '蛙泳连续游', sets: 1, reps: 30, unit: '分钟', done: true },
                    { name: '水中漫步放松', sets: 1, reps: 5, unit: '分钟', done: true }
                ],
                note: '自动生成的模拟游泳训练。',
                isSwimDay: true
            };
        } else {
            const splitName = splitNames[i % splitNames.length];
            const exercises = [];
            // Pick a few random exercises from chest/back/quads
            const poolGroups = ['chest', 'back', 'quads', 'hamglutes'];
            const grp = poolGroups[Math.floor(Math.random() * poolGroups.length)];
            const dbList = DB[grp] || [];
            
            dbList.slice(0, 3).forEach(ex => {
                exercises.push({
                    name: ex.n,
                    sets: 3,
                    reps: 12,
                    unit: '次',
                    weight: Math.round(10 + Math.random() * 15),
                    done: true
                });
            });
            
            entry = {
                date: targetDate,
                workout: splitName,
                duration: Math.round(40 + Math.random() * 25),
                exerciseCount: exercises.length,
                rpe: Math.round(5 + Math.random() * 4),
                mood: ["💪 爽快", "😊 舒适", "😅 稍累"][Math.floor(Math.random() * 3)],
                exercises: exercises,
                note: '自动生成的模拟力量训练。'
            };
        }
        LOG.push(entry);
    }
    
    LOG.sort((a, b) => a.date.localeCompare(b.date));
    ls(K.log, LOG);
    loadState();
    renderLog();
    if (typeof renderStats === 'function') renderStats();
    if (typeof render === 'function') render();
    updateStateInspector();
    showToast(`成功生成 ${days} 天的模拟训练记录！`);
}

function genMockPRs() {
    if (!_checkSyncAlert()) return;
    PR_LIST = [
        { date: addDays(todayStr(), -12), exercise: '传统硬拉', weight: 80, prev: 75 },
        { date: addDays(todayStr(), -8), exercise: '杠铃深蹲', weight: 65, prev: 60 },
        { date: addDays(todayStr(), -5), exercise: '杠铃卧推', weight: 45, prev: 40 },
        { date: addDays(todayStr(), -2), exercise: '罗马尼亚硬拉', weight: 60, prev: 55 }
    ];
    ls(K.pr, PR_LIST);
    
    // Inject weight history for progression charts
    W_HIST['传统硬拉'] = [{ date: addDays(todayStr(), -20), weight: 70, rpe: 7 }, { date: addDays(todayStr(), -12), weight: 80, rpe: 8 }];
    W_HIST['杠铃深蹲'] = [{ date: addDays(todayStr(), -18), weight: 60, rpe: 6 }, { date: addDays(todayStr(), -8), weight: 65, rpe: 7 }];
    W_HIST['杠铃卧推'] = [{ date: addDays(todayStr(), -15), weight: 40, rpe: 7 }, { date: addDays(todayStr(), -5), weight: 45, rpe: 8 }];
    W_HIST['罗马尼亚硬拉'] = [{ date: addDays(todayStr(), -10), weight: 55, rpe: 7 }, { date: addDays(todayStr(), -2), weight: 60, rpe: 8 }];
    ls(K.wh, W_HIST);
    
    loadState();
    if (typeof renderStats === 'function') renderStats();
    if (typeof render === 'function') render();
    updateStateInspector();
    showToast('已注入模拟 PR 纪录与训练重量历史！');
}

function genMockPeriodLog() {
    if (!_checkSyncAlert()) return;
    // Inject normal training first if none exists to establish benchmark
    if (!W_HIST['哑铃卧推'] || W_HIST['哑铃卧推'].length === 0) {
        W_HIST['哑铃卧推'] = [{ date: addDays(todayStr(), -10), weight: 15, rpe: 7, period: false }];
    }
    
    // Inject a low weight log in periodMode 3 days ago
    const targetDate = addDays(todayStr(), -3);
    const existIdx = LOG.findIndex(l => l.date === targetDate);
    if (existIdx !== -1) LOG.splice(existIdx, 1);
    
    const entry = {
        date: targetDate,
        workout: '上肢推 (生理期温和)',
        duration: 35,
        exerciseCount: 1,
        rpe: 6,
        mood: '😅 轻松',
        exercises: [{ name: '哑铃卧推', sets: 3, reps: 12, unit: '次', weight: 10, done: true }],
        note: '经期模拟打卡，实测降重推荐。'
    };
    LOG.push(entry);
    LOG.sort((a, b) => a.date.localeCompare(b.date));
    ls(K.log, LOG);
    
    W_HIST['哑铃卧推'].push({ date: targetDate, weight: 10, rpe: 6, period: true });
    ls(K.wh, W_HIST);
    
    loadState();
    renderLog();
    if (typeof renderStats === 'function') renderStats();
    if (typeof render === 'function') render();
    updateStateInspector();
    showToast('已注入生理期“哑铃卧推”10kg (正常为15kg) 低负重打卡！');
}

function toggleDstSimulation() {
    const el = document.getElementById('dst-status');
    if (!_mockDate) {
        // Mock BST/DST Summer (June)
        _mockDate = '2026-06-15T12:00:00';
        if (el) el.textContent = '模拟夏季 (DST)';
        showToast('已切换至模拟夏季夏令时时间 (2026-06-15)');
    } else if (_mockDate === '2026-06-15T12:00:00') {
        // Mock GMT Winter (December)
        _mockDate = '2026-12-15T12:00:00';
        if (el) el.textContent = '模拟冬季 (Standard)';
        showToast('已切换至模拟冬季标准时间 (2026-12-15)');
    } else {
        _mockDate = null;
        if (el) el.textContent = '标准状态';
        showToast('已恢复系统当前真实时间');
    }
    loadState();
    if (typeof render === 'function') render();
    if (typeof renderStats === 'function') renderStats();
    updateStateInspector();
}

function quickGenPlan(goal, level) {
    S.goal = goal;
    S.level = level;
    if (goal === '臀腿塑形') {
        S.focus = ['下肢'];
        if (!S.equip.includes('健身房全套')) S.equip.push('健身房全套');
    } else {
        S.focus = ['均衡全身'];
    }
    saveState();
    if (typeof genPlan === 'function') genPlan(true);
    if (typeof render === 'function') render();
    updateStateInspector();
    showToast(`已快速生成 ${goal} (${level}) 专属计划！`);
}

function testSystemSounds(type) {
    if (type === 'start') {
        if (typeof playRestStartSound === 'function') {
            playRestStartSound();
            showToast('已鸣响倒计时启动音（风铃声）');
        }
    } else {
        if (typeof playDing === 'function') {
            playDing();
            showToast('已鸣响倒计时结束音（铜磬声）');
        }
    }
}

function toggleOfflineSyncSim() {
    _mockSyncFail = !_mockSyncFail;
    showToast(_mockSyncFail ? '“离线同步模拟”已开启：打卡将无法回传云端' : '“离线同步模拟”已关闭：恢复网络数据传输');
    
    const pill = document.getElementById('sync-pill');
    if (pill) {
        if (_mockSyncFail) {
            pill.textContent = '❌';
            pill.className = 'auth-pill-sync err';
        } else {
            pill.textContent = '✓';
            pill.className = 'auth-pill-sync ok';
        }
    }
    updateStateInspector();
}

function clearMockOnly() {
    if (!confirm('确定清除测试控制台生成的模拟数据（LOG、W_HIST、PR_LIST）吗？\n您的主要配置设置和登录状态将被完整保留。')) return;
    LOG = [];
    ls(K.log, LOG);
    PR_LIST = [];
    ls(K.pr, PR_LIST);
    W_HIST = {};
    ls(K.wh, W_HIST);
    
    loadState();
    renderLog();
    if (typeof renderStats === 'function') renderStats();
    if (typeof render === 'function') render();
    updateStateInspector();
    showToast('模拟打卡及负重进步历史已被清除！');
}

// ══ Init ═════════════════════════════════════════════════
loadState();
renderAuthBtn(); // show login button immediately, don't wait for Firebase
initFirebase();
