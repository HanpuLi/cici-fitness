// ══ Firebase Config ══════════════════════════════════════
const firebaseConfig={apiKey:"AIzaSyB12HcJxsqqmWoih3wnfpyqu9LDzEE9nXs",authDomain:"cici-fitness.firebaseapp.com",projectId:"cici-fitness",storageBucket:"cici-fitness.firebasestorage.app",messagingSenderId:"375793627351",appId:"1:375793627351:web:f2dbfd8e107206417f4092",measurementId:"G-ZHCCRWZ57P"};

// ══ Storage Layer ════════════════════════════════════════
const K={settings:'fit_s1',plan:'fit_p1',prog:'fit_pr1',log:'fit_log1',adj:'fit_adj1'};
function lg(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch{return null}}
function ls(k,v){try{localStorage.setItem(k,JSON.stringify(v));schedulePush()}catch{}}

// ══ State ════════════════════════════════════════════════
const S={goal:'减脂塑形',level:'初级',days:3,dur:45,equip:['健身房全套'],focus:[],limits:'',plan:null,selDay:0,prog:{},adj:{}};
let LOG=lg(K.log)||[];
let _logShowAll=false;

// ══ Limits ═══════════════════════════════════════════════
const LIMIT_RULES=[
{kw:['膝','膝盖','膝关节'],exclude:['杠铃深蹲','史密斯深蹲','腿举','哑铃弓步蹲','跳蹲','跳绳','开合跳','壶铃摆动']},
{kw:['肩','肩膀','肩关节'],exclude:['杠铃推举','哑铃肩推','侧平举','直立划船','双杠臂屈伸']},
{kw:['腰','腰椎','腰背'],exclude:['传统硬拉','罗马尼亚硬拉','俯身划船','早安式体前屈']},
{kw:['颈','颈椎'],exclude:['高位下拉','杠铃推举']},
{kw:['跳','跳跃'],exclude:['跳绳','开合跳','跳蹲','波比跳']},
{kw:['手腕','腕'],exclude:['杠铃卧推','杠铃弯举','俯卧撑','腹轮']},
{kw:['踝','脚踝'],exclude:['跳绳','开合跳','站姿提踵']},
];
function getExcluded(){const s=new Set();LIMIT_RULES.forEach(r=>{if(r.kw.some(k=>S.limits.includes(k)))r.exclude.forEach(e=>s.add(e))});return s}

// ══ Exercise Database (overhauled) ═══════════════════════
// Each exercise: n=name, eq=equipment, cat=category, muscle=primary muscles, diff=difficulty 1-3, note=cue
const DB = {
chest:[
{n:'杠铃卧推',eq:['健身房全套'],muscle:['胸','三头'],diff:2,note:'双脚踩地，肩胛骨收紧下沉，杠铃下放至胸口'},
{n:'哑铃卧推',eq:['哑铃','健身房全套'],muscle:['胸','三头'],diff:1,note:'手肘45°，下放至胸部两侧与肩同高'},
{n:'上斜哑铃卧推',eq:['哑铃','健身房全套'],muscle:['上胸','三头'],diff:2,note:'靠背30-45°，感受上胸发力'},
{n:'坐姿推胸机',eq:['健身房全套'],muscle:['胸'],diff:1,note:'全程控制离心，不要锁死肘部'},
{n:'绳索夹胸',eq:['健身房全套'],muscle:['胸'],diff:1,note:'顶峰收缩挤压1秒'},
{n:'上斜哑铃飞鸟',eq:['哑铃','健身房全套'],muscle:['上胸'],diff:2,note:'微弯肘，感受胸肌拉伸'},
{n:'俯卧撑',eq:['无器材','弹力带','哑铃','健身房全套'],muscle:['胸','三头'],diff:1,note:'核心收紧，身体一直线'},
],
shoulder:[
{n:'杠铃推举',eq:['健身房全套'],muscle:['前束','中束'],diff:2,note:'核心收紧，不要过度后仰'},
{n:'哑铃肩推',eq:['哑铃','健身房全套'],muscle:['前束','中束'],diff:1,note:'不耸肩，推到顶端不完全锁死'},
{n:'侧平举',eq:['哑铃','健身房全套'],muscle:['中束'],diff:1,note:'小拇指略高于大拇指，肘微弯'},
{n:'绳索侧平举',eq:['健身房全套'],muscle:['中束'],diff:1,note:'单臂交替，保持张力'},
{n:'俯身飞鸟',eq:['哑铃','健身房全套'],muscle:['后束'],diff:1,note:'俯身45°，挤压肩胛'},
{n:'反向飞鸟机',eq:['健身房全套'],muscle:['后束'],diff:1,note:'控制回放速度'},
{n:'面拉',eq:['健身房全套','弹力带'],muscle:['后束','外旋'],diff:1,note:'拉向面部两侧，外旋手臂'},
],
back:[
{n:'引体向上',eq:['健身房全套'],muscle:['背阔','二头'],diff:3,note:'全程控制，下放慢速2-3秒'},
{n:'高位下拉',eq:['健身房全套'],muscle:['背阔'],diff:1,note:'挺胸，拉至锁骨位置'},
{n:'坐姿划船',eq:['健身房全套','弹力带'],muscle:['中背','菱形'],diff:1,note:'肘贴身后拉，挤压肩胛骨'},
{n:'哑铃单臂划船',eq:['哑铃','健身房全套'],muscle:['背阔'],diff:1,note:'拉至腰部，感受背阔收缩'},
{n:'俯身划船',eq:['哑铃','健身房全套'],muscle:['中背'],diff:2,note:'背部平行地面，核心稳定'},
{n:'绳索直臂下压',eq:['健身房全套'],muscle:['背阔'],diff:1,note:'手臂微弯，感受背阔肌'},
{n:'弹力带划船',eq:['弹力带'],muscle:['中背'],diff:1,note:'收紧肩胛骨'},
],
biceps:[
{n:'杠铃弯举',eq:['健身房全套'],muscle:['二头'],diff:1,note:'上臂贴身不动，只弯曲前臂'},
{n:'哑铃弯举',eq:['哑铃','健身房全套'],muscle:['二头'],diff:1,note:'交替进行，不借力'},
{n:'锤式弯举',eq:['哑铃','健身房全套'],muscle:['肱肌','前臂'],diff:1,note:'中立握姿，感受外侧发力'},
{n:'绳索弯举',eq:['健身房全套'],muscle:['二头'],diff:1,note:'顶峰收缩停留1秒'},
],
triceps:[
{n:'绳索下压',eq:['健身房全套'],muscle:['三头'],diff:1,note:'肘部贴身固定不动'},
{n:'哑铃臂屈伸',eq:['哑铃','健身房全套'],muscle:['三头'],diff:1,note:'肘朝天花板，只动前臂'},
{n:'双杠臂屈伸',eq:['健身房全套'],muscle:['三头','胸'],diff:3,note:'身体直立偏重三头'},
{n:'仰卧臂屈伸',eq:['哑铃','健身房全套'],muscle:['三头'],diff:1,note:'上臂垂直地面，只动前臂'},
],
quads:[
{n:'杠铃深蹲',eq:['健身房全套'],muscle:['股四头','臀'],diff:2,note:'膝盖对准脚尖，蹲至大腿平行地面'},
{n:'史密斯深蹲',eq:['健身房全套'],muscle:['股四头','臀'],diff:1,note:'脚可略前移，更安全'},
{n:'腿举',eq:['健身房全套'],muscle:['股四头','臀'],diff:1,note:'不要锁死膝盖，下放至90°'},
{n:'哈克深蹲',eq:['健身房全套'],muscle:['股四头'],diff:2,note:'背部贴紧靠垫'},
{n:'腿屈伸',eq:['健身房全套'],muscle:['股四头'],diff:1,note:'顶端收缩停留1秒'},
{n:'哑铃弓步蹲',eq:['哑铃','健身房全套'],muscle:['股四头','臀'],diff:1,note:'步幅适中，前膝不超脚尖'},
{n:'高脚杯深蹲',eq:['哑铃','无器材'],muscle:['股四头','臀'],diff:1,note:'哑铃贴胸，挺胸下蹲'},
],
hamglutes:[
{n:'罗马尼亚硬拉',eq:['哑铃','健身房全套'],muscle:['腘绳','臀'],diff:2,note:'微屈膝，臀部后推，感受后侧拉伸'},
{n:'传统硬拉',eq:['健身房全套'],muscle:['后链全部'],diff:3,note:'背部中立，腿部推地发力'},
{n:'臀推',eq:['健身房全套','哑铃'],muscle:['臀'],diff:1,note:'顶端挤压臀部1-2秒'},
{n:'腿弯举',eq:['健身房全套'],muscle:['腘绳'],diff:1,note:'俯卧，控制回放'},
{n:'臀桥',eq:['无器材','弹力带'],muscle:['臀'],diff:1,note:'顶端停留，感受臀部发力'},
{n:'弹力带蚌式开合',eq:['弹力带','无器材'],muscle:['臀中'],diff:1,note:'侧卧，膝盖打开'},
],
calves:[
{n:'站姿提踵',eq:['无器材','哑铃','健身房全套'],muscle:['小腿'],diff:1,note:'全幅度，顶端停顿1秒'},
{n:'坐姿提踵',eq:['健身房全套'],muscle:['比目鱼'],diff:1,note:'膝盖90°，控制速度'},
],
core:[
{n:'平板支撑',eq:['无器材','弹力带','哑铃','健身房全套'],muscle:['核心'],diff:1,note:'臀部不要过高或下塌',u:'秒'},
{n:'卷腹',eq:['无器材','健身房全套'],muscle:['腹直肌'],diff:1,note:'下背贴地，肩胛骨离地即可'},
{n:'悬挂抬腿',eq:['健身房全套'],muscle:['下腹','髂腰'],diff:2,note:'控制下放，避免摇摆'},
{n:'俄罗斯转体',eq:['无器材','哑铃','健身房全套'],muscle:['腹斜'],diff:1,note:'脚悬空增加难度'},
{n:'死虫式',eq:['无器材','健身房全套'],muscle:['核心稳定'],diff:1,note:'下背全程贴地'},
{n:'腹轮',eq:['健身房全套'],muscle:['核心'],diff:3,note:'初级跪姿，进阶站姿'},
{n:'侧平板支撑',eq:['无器材','健身房全套'],muscle:['腹斜'],diff:1,note:'每侧各做',u:'秒'},
],
cardio:[
{n:'跑步机慢跑',eq:['健身房全套'],muscle:['心肺'],diff:1,note:'心率维持最大心率65-75%',u:'分钟'},
{n:'划船机',eq:['健身房全套'],muscle:['心肺','全身'],diff:1,note:'腿蹬→身倾→手拉',u:'分钟'},
{n:'椭圆机',eq:['健身房全套'],muscle:['心肺'],diff:1,note:'保持直立，手臂协同',u:'分钟'},
{n:'骑行机',eq:['健身房全套'],muscle:['心肺','腿'],diff:1,note:'座位高度：膝盖微弯',u:'分钟'},
{n:'跳绳',eq:['无器材','健身房全套'],muscle:['心肺','小腿'],diff:1,note:'手腕发力，落地轻柔',u:'分钟'},
{n:'开合跳',eq:['无器材','弹力带','哑铃','健身房全套'],muscle:['心肺'],diff:1,note:'膝关节微弯',u:'分钟'},
{n:'波比跳',eq:['无器材'],muscle:['心肺','全身'],diff:2,note:'一个标准循环',u:'分钟'},
]};

// ══ Improved Split Templates ═════════════════════════════
// More logical muscle groupings with proper volume distribution
const SPLITS={
2:[
{type:'上肢',groups:['chest','shoulder','back','biceps','triceps','core'],pick:{chest:2,shoulder:2,back:2,biceps:1,triceps:1,core:1}},
{type:'下肢+有氧',groups:['quads','hamglutes','calves','core','cardio'],pick:{quads:2,hamglutes:2,calves:1,core:1,cardio:1}},
],
3:[
{type:'推（胸/肩/三头）',groups:['chest','shoulder','triceps','core'],pick:{chest:3,shoulder:2,triceps:2,core:1}},
{type:'拉（背/二头）',groups:['back','biceps','shoulder','core'],pick:{back:3,biceps:2,shoulder:1,core:1}},// shoulder=rear delt
{type:'腿（股四/臀腿/小腿）',groups:['quads','hamglutes','calves','core'],pick:{quads:3,hamglutes:2,calves:1,core:1}},
],
4:[
{type:'胸+三头',groups:['chest','triceps','core'],pick:{chest:3,triceps:2,core:1}},
{type:'背+二头',groups:['back','biceps','core'],pick:{back:3,biceps:2,core:1}},
{type:'肩+核心',groups:['shoulder','core'],pick:{shoulder:4,core:2}},
{type:'腿+臀',groups:['quads','hamglutes','calves'],pick:{quads:3,hamglutes:2,calves:1}},
],
5:[
{type:'胸',groups:['chest','triceps'],pick:{chest:4,triceps:2}},
{type:'背',groups:['back','biceps'],pick:{back:4,biceps:2}},
{type:'肩+核心',groups:['shoulder','core'],pick:{shoulder:4,core:2}},
{type:'腿（股四重点）',groups:['quads','calves','core'],pick:{quads:4,calves:1,core:1}},
{type:'臀腿+有氧',groups:['hamglutes','quads','cardio'],pick:{hamglutes:3,quads:1,cardio:1}},
],
6:[
{type:'胸',groups:['chest','triceps'],pick:{chest:4,triceps:2}},
{type:'背',groups:['back','biceps'],pick:{back:4,biceps:2}},
{type:'肩',groups:['shoulder','core'],pick:{shoulder:4,core:2}},
{type:'腿（股四）',groups:['quads','calves'],pick:{quads:4,calves:1}},
{type:'臀腿（后链）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
{type:'弱项+有氧',groups:['chest','back','shoulder','cardio'],pick:{chest:1,back:1,shoulder:1,cardio:2}},
]};

const SCHEMES={
'减脂塑形':{sets:{初级:3,中级:4,高级:4},reps:{初级:15,中级:12,高级:12},rest:'45-60秒',cardioMin:15},
'增肌力量':{sets:{初级:3,中级:4,高级:5},reps:{初级:10,中级:8,高级:6},rest:'90-120秒',cardioMin:0},
'提升耐力':{sets:{初级:3,中级:3,高级:4},reps:{初级:20,中级:18,高级:15},rest:'30-45秒',cardioMin:20},
'整体健康':{sets:{初级:3,中级:3,高级:4},reps:{初级:12,中级:12,高级:12},rest:'60-90秒',cardioMin:10},
'灵活柔韧':{sets:{初级:3,中级:3,高级:3},reps:{初级:12,中级:12,高级:12},rest:'60秒',cardioMin:10},
};
const TIPS={
'减脂塑形':'组间休息45-60秒保持心率。训练后补充蛋白质15-30g。热量缺口控制在300-500kcal/天，避免过度节食。',
'增肌力量':'组间休息90-120秒确保恢复。训练后30分钟内补充蛋白质25-40g+碳水50-80g。保证充足睡眠7-8小时。',
'提升耐力':'渐进增加有氧时长，每周增幅≤10%。注意补水，训练前后各补充300-500ml水。',
'整体健康':'不要连续两天训练同一部位。每晚保证7-8小时睡眠，这是恢复的关键。',
'灵活柔韧':'训练后进行10-15分钟静态拉伸，每个姿势保持30秒以上。可搭配泡沫轴放松。',
};
const DN=['周一','周二','周三','周四','周五','周六','周日'];

// ══ Plan Generator (overhauled) ═════════════════════════
function pickExercises(split,excluded){
const result=[],used=new Set();
const sch=SCHEMES[S.goal];
const sets=sch.sets[S.level],reps=sch.reps[S.level];
const focusMap={'上肢':['chest','shoulder','back','biceps','triceps'],'下肢':['quads','hamglutes','calves'],'核心':['core'],'有氧':['cardio']};

split.groups.forEach(grp=>{
const count=split.pick[grp]||1;
let pool=(DB[grp]||[]).filter(ex=>ex.eq.some(e=>S.equip.includes(e))&&!used.has(ex.n)&&!excluded.has(ex.n));
// Filter by difficulty for beginners
if(S.level==='初级') pool=pool.filter(ex=>ex.diff<=2);
// Prioritize focused muscles
if(S.focus.length){
const favGroups=S.focus.flatMap(f=>focusMap[f]||[]);
if(favGroups.includes(grp)) pool.sort(()=>Math.random()-.5);
}else{
for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
}
pool.slice(0,count).forEach(ex=>{
used.add(ex.n);
const isCardio=grp==='cardio',isTime=!!ex.u;
result.push({name:ex.n,sets:isCardio?1:sets,reps:isCardio?Math.max(sch.cardioMin,10):(isTime?(S.level==='初级'?30:S.level==='中级'?45:60):reps),unit:isCardio?'分钟':(isTime?'秒':'次'),note:ex.note,group:grp});
});
});
return result;
}

function genPlan(){
const splits=SPLITS[S.days]||SPLITS[3];
const excluded=getExcluded();
const gap=Math.floor(7/S.days);
const slots=[];for(let i=0;i<S.days;i++)slots.push(Math.min(6,i*gap));
const weekPlan=[];
for(let di=0;di<7;di++){
const si=slots.indexOf(di);
if(si===-1){weekPlan.push({dayIndex:di,isRest:true,workoutType:'休息',duration:0,exercises:[]})}
else{
const split=splits[si%splits.length];
weekPlan.push({dayIndex:di,isRest:false,workoutType:split.type,duration:S.dur,exercises:pickExercises(split,excluded)});
}}
const sch=SCHEMES[S.goal];
S.plan={weekPlan,tip:TIPS[S.goal],rest:sch.rest,excludedCount:excluded.size};
S.selDay=weekPlan.find(d=>!d.isRest)?.dayIndex??0;
S.prog={};S.adj={};
saveState();render();
showTab('today',document.querySelector('.tab'));
}

// ══ Render ═══════════════════════════════════════════════
function isDone(day){if(!day.exercises.length)return false;const p=S.prog[day.dayIndex]||{};return day.exercises.every((_,i)=>p[i])}
function getAdj(di,ei,f,base){return S.adj[di+'-'+ei+'-'+f]??base}

function render(){
if(!S.plan)return;
const{weekPlan,tip,rest,excludedCount}=S.plan;
const total=weekPlan.filter(d=>!d.isRest).length;
const done=weekPlan.filter(d=>!d.isRest&&isDone(d)).length;
const totalEx=weekPlan.reduce((s,d)=>s+d.exercises.length,0);
const sel=weekPlan.find(d=>d.dayIndex===S.selDay)||weekPlan.find(d=>!d.isRest);
let h=`<div class="plan-header"><p class="panel-title" style="margin:0">本周计划${excludedCount?`<span class="warn-tag">已过滤${excludedCount}个受限动作</span>`:''}</p><button class="regen-btn" onclick="genPlan()">重新生成</button></div>
<div class="stats"><div class="stat"><div class="stat-val">${total}</div><div class="stat-lbl">训练天</div></div><div class="stat"><div class="stat-val">${done}/${total}</div><div class="stat-lbl">已完成</div></div><div class="stat"><div class="stat-val">${totalEx}</div><div class="stat-lbl">总动作</div></div></div>
<div class="daygrid">${weekPlan.map(d=>{
const dn=isDone(d),isSel=d.dayIndex===S.selDay;
const cls='dc'+(d.isRest?' rest':dn?' done':isSel?' sel':'');
const click=d.isRest?'':'onclick="selectDay('+d.dayIndex+')"';
return`<div class="${cls}" ${click}><div class="dn">${DN[d.dayIndex]}</div><div class="dt">${d.isRest?'休息':d.workoutType}</div>${dn?'<i class="ti ti-check" style="font-size:11px;color:#3e7d52"></i>':''}</div>`;
}).join('')}</div>`;

if(sel&&!sel.isRest){
const pd=S.prog[sel.dayIndex]||{};
h+=`<div class="wh"><span class="wh-title">${DN[sel.dayIndex]} · ${sel.workoutType}</span><span class="badge">${sel.duration}分钟</span>${rest?`<span class="badge" style="background:var(--blue-bg);color:var(--blue);border-color:rgba(75,107,138,.25)">休息${rest}</span>`:''}</div>
<div class="exlist">${sel.exercises.map((ex,i)=>{
const exDone=pd[i];
const sets=getAdj(sel.dayIndex,i,'s',ex.sets);
const reps=getAdj(sel.dayIndex,i,'r',ex.reps);
return`<div class="exrow${exDone?' done-ex':''}">
<div><div class="exname">${ex.name}</div><div class="exnote">${ex.note}</div></div>
<div class="adjg"><button class="ab" onclick="adj(${sel.dayIndex},${i},'s',-1)">-</button><span class="av">${sets}组</span><button class="ab" onclick="adj(${sel.dayIndex},${i},'s',1)">+</button></div>
<div class="adjg"><button class="ab" onclick="adj(${sel.dayIndex},${i},'r',-1)">-</button><span class="av">${reps}${ex.unit}</span><button class="ab" onclick="adj(${sel.dayIndex},${i},'r',1)">+</button></div>
<button class="cb${exDone?' ck':''}" onclick="tog(${sel.dayIndex},${i})"><i class="ti ti-check"></i></button>
</div>`;}).join('')}</div>`;
}
h+=`<div class="tip">${tip}</div>`;
document.getElementById('main').innerHTML=h;
}

function selectDay(di){S.selDay=di;saveState();render()}
function tog(di,ei){
if(!S.prog[di])S.prog[di]={};
S.prog[di][ei]=!S.prog[di][ei];
// Auto-log when day completed
const day=S.plan.weekPlan.find(d=>d.dayIndex===di);
if(day&&isDone(day)){
const today=new Date().toISOString().split('T')[0];
const exists=LOG.find(l=>l.date===today&&l.workout===day.workoutType);
if(!exists){
LOG.unshift({date:today,workout:day.workoutType,duration:day.duration,exerciseCount:day.exercises.length,exercises:day.exercises.map((ex,i)=>({name:ex.name,sets:getAdj(di,i,'s',ex.sets),reps:getAdj(di,i,'r',ex.reps),unit:ex.unit})),mood:'',note:''});
ls(K.log,LOG);renderLog();
showToast('🎉 训练完成！已自动记录');
}}
saveState();render();
}
function adj(di,ei,f,delta){
const k=di+'-'+ei+'-'+f;
const day=S.plan.weekPlan.find(d=>d.dayIndex===di);
const ex=day.exercises[ei];
const base=f==='s'?ex.sets:ex.reps;
S.adj[k]=Math.max(1,(S.adj[k]??base)+delta);
saveState();render();
}
