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

// ══ Split Templates ═════════════════════════════════════════
// groups = 肌群组, pick = 每组多少个动作
const SPLITS={
// 2天：上肢/下肢 — AB分
2:[
{type:'上肢（胸/肩/背/二头/三头）',groups:['chest','shoulder','back','biceps','triceps'],pick:{chest:2,shoulder:1,back:2,biceps:1,triceps:1}},
{type:'下肢（股四/臀腿/小腿）+核心',groups:['quads','hamglutes','calves','core'],pick:{quads:2,hamglutes:2,calves:1,core:1}},
],
// 3天：PPL — 推天训“推”肌群（胸+肩前中束+三头），拉天训“拉”肌群（背+肩后束+二头），腿天训下肢
3:[
{type:'推（胸+肩前/中束+三头）',groups:['chest','shoulder','triceps'],pick:{chest:3,shoulder:2,triceps:2}},
{type:'拉（背+肩后束+二头）',groups:['back','biceps','shoulder'],pick:{back:3,biceps:2,shoulder:1}},
{type:'腿（股四/臀腿/小腿）+核心',groups:['quads','hamglutes','calves','core'],pick:{quads:2,hamglutes:2,calves:1,core:1}},
],
// 4天：胸三/背二/肩/腿 — 经典四分
4:[
{type:'胸+三头',groups:['chest','triceps'],pick:{chest:3,triceps:3}},
{type:'背+二头',groups:['back','biceps'],pick:{back:3,biceps:3}},
{type:'肩（前束/中束/后束）+核心',groups:['shoulder','core'],pick:{shoulder:4,core:2}},
{type:'腿（股四+臀腿+小腿）',groups:['quads','hamglutes','calves'],pick:{quads:3,hamglutes:2,calves:1}},
],
// 5天：胸/背/肩/腿(股四主)/腿(臀腿主) — Arnold分化
5:[
{type:'胸+三头',groups:['chest','triceps'],pick:{chest:4,triceps:2}},
{type:'背+二头',groups:['back','biceps'],pick:{back:4,biceps:2}},
{type:'肩（前/中/后束）+核心',groups:['shoulder','core'],pick:{shoulder:4,core:2}},
{type:'腿(股四为主)+小腿',groups:['quads','calves'],pick:{quads:4,calves:2}},
{type:'臀腿(后链为主)+核心',groups:['hamglutes','core'],pick:{hamglutes:4,core:2}},
],
// 6天：胸/背/肩/股四/臀腿/手臂
6:[
{type:'胸+三头',groups:['chest','triceps'],pick:{chest:4,triceps:3}},
{type:'背+二头',groups:['back','biceps'],pick:{back:4,biceps:3}},
{type:'肩（前/中/后束全训）',groups:['shoulder'],pick:{shoulder:6}},
{type:'腿（股四为主）+小腿',groups:['quads','calves'],pick:{quads:4,calves:2}},
{type:'臀腿（后链为主）+核心',groups:['hamglutes','core'],pick:{hamglutes:4,core:2}},
{type:'二头+三头+核心',groups:['biceps','triceps','core'],pick:{biceps:3,triceps:3,core:2}},
],
// 7天：6天分化+活动恢复
7:[
{type:'胸+三头',groups:['chest','triceps'],pick:{chest:4,triceps:3}},
{type:'背+二头',groups:['back','biceps'],pick:{back:4,biceps:3}},
{type:'肩（前/中/后束全训）',groups:['shoulder'],pick:{shoulder:6}},
{type:'腿（股四为主）+小腿',groups:['quads','calves'],pick:{quads:4,calves:2}},
{type:'臀腿（后链为主）+核心',groups:['hamglutes','core'],pick:{hamglutes:4,core:2}},
{type:'二头+三头+核心',groups:['biceps','triceps','core'],pick:{biceps:3,triceps:3,core:2}},
{type:'全身有氧+拉伸',groups:['cardio','core'],pick:{cardio:3,core:2}},
],
};
// focusMap: 用户选择的重点→对应肌群组，上肢包括背部
const FOCUS_MAP={'上肢':['chest','shoulder','back','biceps','triceps'],'下肢':['quads','hamglutes','calves'],'核心':['core'],'有氧':['cardio']};

const SCHEMES={
// sets/reps per level; timePerSet = rest+work time estimate; cardioMin = minimum cardio minutes
'减脂塑形':{
  sets:{初级:3,中级:4,高级:4},reps:{初级:15,中级:12,高级:12},
  rest:'45-60秒',cardioMin:15,timePerSet:105, // 45s work + 60s rest
  intensityNote:{初级:'轻中重量，感受肌肉燃烧感',中级:'中等重量，组间不超60秒',高级:'超级组搭配，保持心率'},
  weightGuide:{初级:'约为最大力量的50-60%',中级:'约为最大力量的65-75%',高级:'约为最大力量的70-80%'}
},
'增肌力量':{
  sets:{初级:3,中级:4,高级:5},reps:{初级:10,中级:8,高级:6},
  rest:'90-120秒',cardioMin:0,timePerSet:180,
  intensityNote:{初级:'能完成全程的重量，最后1-2个稍难',中级:'组间可感受轻微恢复',高级:'最后一组力竭，可借助辅助'},
  weightGuide:{初级:'约为最大力量的65-70%',中级:'约为最大力量的75-80%',高级:'约为最大力量的85-90%'}
},
'提升耐力':{
  sets:{初级:3,中级:3,高级:4},reps:{初级:20,中级:18,高级:15},
  rest:'30-45秒',cardioMin:20,timePerSet:75,
  intensityNote:{初级:'全程匀速，不追求重量',中级:'保持节奏，控制呼吸',高级:'缩短休息，挑战极限'},
  weightGuide:{初级:'约为最大力量的40-50%',中级:'约为最大力量的50-60%',高级:'约为最大力量的60-65%'}
},
'整体健康':{
  sets:{初级:3,中级:3,高级:4},reps:{初级:12,中级:12,高级:12},
  rest:'60-90秒',cardioMin:10,timePerSet:135,
  intensityNote:{初级:'以舒适为主，感受目标肌群',中级:'稳定发力，不借力',高级:'追求质量而非数量'},
  weightGuide:{初级:'约为最大力量的55-65%',中级:'约为最大力量的65-70%',高级:'约为最大力量的70-80%'}
},
'灵活柔韧':{
  sets:{初级:3,中级:3,高级:3},reps:{初级:12,中级:12,高级:12},
  rest:'60秒',cardioMin:10,timePerSet:120,
  intensityNote:{初级:'感受全幅度拉伸，不追求重量',中级:'控制离心阶段3-4秒',高级:'挑战单侧或增加幅度'},
  weightGuide:{初级:'轻重量，全幅度优先',中级:'中等重量，注重控制',高级:'中等重量，离心优先'}
},
};
const TIPS={
'减脂塑形':'组间休息45-60秒保持心率。训练后补充蛋白质15-30g。热量缺口控制在300-500kcal/天，避免过度节食。',
'增肌力量':'组间休息90-120秒确保恢复。训练后30分钟内补充蛋白质25-40g+碳水50-80g。保证充足睡眠7-8小时。',
'提升耐力':'渐进增加有氧时长，每周增幅≤10%。注意补水，训练前后各补充300-500ml水。',
'整体健康':'不要连续两天训练同一部位。每晚保证7-8小时睡眠，这是恢复的关键。',
'灵活柔韧':'训练后进行10-15分钟静态拉伸，每个姿势保持30秒以上。可搭配泡沫轴放松。',
};
const DN=['周一','周二','周三','周四','周五','周六','周日'];

// ══ Plan Generator ═══════════════════════════════════════
// Derive how many exercises fit in session based on duration
function calcTotalExercises(){
const sch=SCHEMES[S.goal];
const warmup=5,cooldown=5;
const available=S.dur-warmup-cooldown;
const exTime=sch.timePerSet*(sch.sets[S.level]||3)/60; // minutes per exercise
return Math.max(4,Math.min(12,Math.floor(available/exTime)));
}

function pickExercises(split,excluded){
const result=[],used=new Set();
const sch=SCHEMES[S.goal];
const sets=sch.sets[S.level],reps=sch.reps[S.level];
const focusMap=FOCUS_MAP;
const totalTarget=calcTotalExercises();
// Budget: distribute exercises across groups proportionally, focus groups get +1
const favGroups=S.focus.length?S.focus.flatMap(f=>focusMap[f]||[]):[];
const groupBudget={};
const baseTotal=Object.values(split.pick).reduce((a,b)=>a+b,0);
split.groups.forEach(g=>{
let cnt=split.pick[g]||1;
// Scale by duration ratio
cnt=Math.round(cnt*(totalTarget/baseTotal));
cnt=Math.max(1,cnt);
// Focus groups get one extra exercise
if(favGroups.includes(g))cnt=Math.min(cnt+1,cnt+1);
// Goal: endurance/fat-loss → limit strength groups, add cardio
if(S.goal==='提升耐力'&&g==='cardio')cnt=Math.max(cnt,2);
if(S.goal==='增肌力量'&&g==='cardio')cnt=0;
groupBudget[g]=cnt;
});

split.groups.forEach(grp=>{
const count=groupBudget[grp]||0;
if(!count)return;
let pool=(DB[grp]||[]).filter(ex=>ex.eq.some(e=>S.equip.includes(e))&&!used.has(ex.n)&&!excluded.has(ex.n));
// Difficulty filter
if(S.level==='初级')pool=pool.filter(ex=>ex.diff<=2);
if(S.level==='高级')pool.sort((a,b)=>b.diff-a.diff);// prefer harder
else{for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}}
// For focused groups, put compound moves first
if(favGroups.includes(grp))pool.sort((a,b)=>(a.diff===b.diff?0:b.diff-a.diff));
pool.slice(0,count).forEach(ex=>{
used.add(ex.n);
const isCardio=grp==='cardio',isTime=!!ex.u;
const exSets=isCardio?1:sets;
const exReps=isCardio?Math.max(sch.cardioMin,10):(isTime?(S.level==='初级'?30:S.level==='中级'?45:60):reps);
// Build coaching note combining technique + goal/level context
const coaching=`${ex.note} — ${sch.intensityNote[S.level]}（${sch.weightGuide[S.level]}）`;
result.push({name:ex.n,sets:exSets,reps:exReps,unit:isCardio?'分钟':(isTime?'秒':'次'),note:coaching,group:grp,diff:ex.diff});
});
});
return result;
}

// ══ Calendar helpers ════════════════════════════════════
function todayStr(){return new Date().toISOString().split('T')[0]}
function dateStr(d){return d.toISOString().split('T')[0]}
function addDays(base,n){const d=new Date(base);d.setDate(d.getDate()+n);return dateStr(d)}
function fmtDate(ds){const d=new Date(ds+'T00:00:00');return['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]+'·'+(d.getMonth()+1)+'/'+(d.getDate())}

// ══ Lock check ══════════════════════════════════════════
function isLocked(day){
// Past dates always locked
if(day.date<todayStr())return true;
// Today: locked if any exercise already checked
if(day.date===todayStr()){const p=S.prog[day.date]||{};return Object.values(p).some(Boolean)}
return false;
}

// ══ Plan Generator (calendar) ═══════════════════════════
function genPlan(){
const splits=SPLITS[S.days]||SPLITS[3];
const excluded=getExcluded();
const today=todayStr();

// Always start calendar from today
const startDate=today;

// Preserve locked days from existing plan
const locked={};
if(S.plan){S.plan.days.forEach(d=>{if(isLocked(d))locked[d.date]=d;})}

// Build 14-day calendar (2 weeks)
const patterns = {
2: [1,0,0,1,0,0,0],
3: [1,0,1,0,1,0,0],
4: [1,1,0,1,1,0,0],
5: [1,1,1,0,1,1,0],
6: [1,1,1,1,1,1,0],
7: [1,1,1,1,1,1,1]
};
const pattern = patterns[S.days] || patterns[3];
const days=[];
let splitIdx=0;

for(let i=0;i<14;i++){
const ds=addDays(startDate,i);
if(locked[ds]){
days.push(locked[ds]);
if(!locked[ds].isRest) splitIdx++;
continue;
}
const isWorkout = pattern[i % 7] === 1;
if(isWorkout){
const split=splits[splitIdx%splits.length];
splitIdx++;
days.push({date:ds,isRest:false,workoutType:split.type,duration:S.dur,exercises:pickExercises(split,excluded)});
}else{
days.push({date:ds,isRest:true,workoutType:'休息',duration:0,exercises:[]});
}
}

const sch=SCHEMES[S.goal];
S.plan={days,tip:TIPS[S.goal],rest:sch.rest,excludedCount:excluded.size};
// Select today or first workout
const todayDay=days.find(d=>d.date===today);
S.selDate=todayDay?today:(days.find(d=>!d.isRest)?.date||today);
saveState();render();
showTab('today',document.querySelector('.tab'));
}

// ══ Render ══════════════════════════════════════════════
function isDone(day){
if(!day||!day.exercises.length)return false;
const p=S.prog[day.date]||{};
return day.exercises.every((_,i)=>p[i]);
}
function getAdj(date,ei,f,base){return S.adj[date+'-'+ei+'-'+f]??base}

let _dragSrc=null;

function render(){
if(!S.plan)return;
const{days,tip,rest,excludedCount}=S.plan;
const today=todayStr();
const workoutDays=days.filter(d=>!d.isRest);
const doneDays=workoutDays.filter(d=>isDone(d));
const sel=days.find(d=>d.date===S.selDate)||days.find(d=>!d.isRest)||days[0];

// Stats row
let h=`<div class="plan-header"><p class="panel-title" style="margin:0">训练计划${excludedCount?`<span class="warn-tag">已过滤${excludedCount}个受限动作</span>`:''}</p><button class="regen-btn" onclick="genPlan()">重新生成</button></div>
<div class="stats">
<div class="stat"><div class="stat-val">${workoutDays.length}</div><div class="stat-lbl">计划天</div></div>
<div class="stat"><div class="stat-val">${doneDays.length}/${workoutDays.length}</div><div class="stat-lbl">已完成</div></div>
<div class="stat"><div class="stat-val">${workoutDays.reduce((s,d)=>s+d.exercises.length,0)}</div><div class="stat-lbl">总动作</div></div>
</div>`;

// Calendar grid (14 days)
h+=`<div class="cal-scroll"><div class="daygrid" id="cal-grid">`;
days.forEach(d=>{
const locked=isLocked(d),done=isDone(d),isSel=d.date===S.selDate,isToday=d.date===today;
let cls='dc';
if(d.isRest)cls+=' rest';
else if(done)cls+=' done';
else if(isSel)cls+=' sel';
if(isToday)cls+=' today';
if(locked&&!d.isRest)cls+=' locked';
const drag=(!d.isRest&&!locked)?`draggable="true" ondragstart="dragStart(event,'${d.date}')" ondragover="dragOver(event)" ondrop="dragDrop(event,'${d.date}')" ondragend="dragEnd()"`:
(!d.isRest&&locked?`ondragover="dragOver(event)" ondrop="dragDrop(event,'${d.date}')"`:'' );
const click=`onclick="selectDate('${d.date}')"`;
h+=`<div class="${cls}" ${drag} ${click}>
<div class="dn">${fmtDate(d.date)}</div>
<div class="dt">${d.isRest?'休息':d.workoutType}</div>
${done?'<i class="ti ti-check" style="font-size:10px;color:#3e7d52"></i>':''}
${locked&&!d.isRest?'<i class="ti ti-lock" style="font-size:9px;color:var(--ink3)"></i>':''}
</div>`;
});
h+=`</div></div>`;

// Selected day detail
if(sel&&!sel.isRest){
const locked=isLocked(sel),pd=S.prog[sel.date]||{};
h+=`<div class="wh">
<span class="wh-title">${fmtDate(sel.date)} · ${sel.workoutType}</span>
<span class="badge">${sel.duration}分钟</span>
${rest?`<span class="badge" style="background:var(--blue-bg);color:var(--blue);border-color:rgba(75,107,138,.25)">休息${rest}</span>`:''}
${locked?`<span class="warn-tag">🔒 已锁定</span>${sel.date===todayStr()?`<button class="regen-btn" style="margin-left:8px;font-size:10px;padding:2px 8px" onclick="unlockDate('${sel.date}')">解除锁定</button>`:''}`:''}
</div>
<div class="exlist">${sel.exercises.map((ex,i)=>{
const done=pd[i];
const sets=getAdj(sel.date,i,'s',ex.sets);
const reps=getAdj(sel.date,i,'r',ex.reps);
return`<div class="exrow${done?' done-ex':''}">
<div style="flex:1;min-width:0">
<div class="exname" onclick="showExDetail('${ex.name}')" style="cursor:pointer">${ex.name} <i class="ti ti-info-circle" style="font-size:11px;opacity:.4;vertical-align:middle"></i></div>
<div class="exnote">${ex.note}</div>
</div>
${!locked?`
<div class="adjg"><button class="ab" onclick="adj('${sel.date}',${i},'s',-1)">-</button><span class="av">${sets}组</span><button class="ab" onclick="adj('${sel.date}',${i},'s',1)">+</button></div>
<div class="adjg"><button class="ab" onclick="adj('${sel.date}',${i},'r',-1)">-</button><span class="av">${reps}${ex.unit}</span><button class="ab" onclick="adj('${sel.date}',${i},'r',1)">+</button></div>
<button class="cb${done?' ck':''}" onclick="tog('${sel.date}',${i})"><i class="ti ti-check"></i></button>
`:`<span class="av" style="opacity:.5">${sets}×${reps}${ex.unit}</span>`}
</div>`;}).join('')}</div>`;
}else if(sel&&sel.isRest){
h+=`<div class="tip" style="text-align:center;padding:2rem">😴 休息日 — 好好恢复，明天继续</div>`;
}
h+=`<div class="tip">${tip}</div>`;
document.getElementById('main').innerHTML=h;
}

// ══ Interactions ════════════════════════════════════════
function selectDate(ds){S.selDate=ds;saveState();render()}

function tog(date,ei){
if(!S.prog[date])S.prog[date]={};
S.prog[date][ei]=!S.prog[date][ei];
const day=S.plan.days.find(d=>d.date===date);
if(day&&isDone(day)){
const exists=LOG.find(l=>l.date===date&&l.workout===day.workoutType);
if(!exists){
LOG.unshift({date,workout:day.workoutType,duration:day.duration,exerciseCount:day.exercises.length,
exercises:day.exercises.map((ex,i)=>({name:ex.name,sets:getAdj(date,i,'s',ex.sets),reps:getAdj(date,i,'r',ex.reps),unit:ex.unit})),mood:'💪',note:''});
ls(K.log,LOG);
showToast('🎉 训练完成！已自动记录');
}
}
saveState();render();
}

function adj(date,ei,f,delta){
const k=date+'-'+ei+'-'+f;
const day=S.plan.days.find(d=>d.date===date);
const ex=day.exercises[ei];
const base=f==='s'?ex.sets:ex.reps;
S.adj[k]=Math.max(1,(S.adj[k]??base)+delta);
saveState();render();
}

function unlockDate(date){
if(confirm('解除锁定将清空本日的所有打卡记录，确定继续？')){
delete S.prog[date];
saveState();render();
}
}

// ══ Drag to reorder ════════════════════════════════════
function dragStart(e,date){
_dragSrc=date;
e.currentTarget.classList.add('dragging');
e.dataTransfer.effectAllowed='move';
}
function dragOver(e){e.preventDefault();e.dataTransfer.dropEffect='move';}
function dragDrop(e,targetDate){
e.preventDefault();
if(!_dragSrc||_dragSrc===targetDate)return;
const days=S.plan.days;
const si=days.findIndex(d=>d.date===_dragSrc);
const ti=days.findIndex(d=>d.date===targetDate);
if(si<0||ti<0)return;
const src=days[si],tgt=days[ti];
// Only allow swapping unlocked workout days
if(isLocked(src)||isLocked(tgt))return;
// Swap workout content (keep dates fixed)
[src.workoutType,tgt.workoutType]=[tgt.workoutType,src.workoutType];
[src.exercises,tgt.exercises]=[tgt.exercises,src.exercises];
[src.isRest,tgt.isRest]=[tgt.isRest,src.isRest];
[src.duration,tgt.duration]=[tgt.duration,src.duration];
saveState();render();
showToast('已交换训练顺序');
}
function dragEnd(){_dragSrc=null;document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));}

// ══ Exercise Detail Modal ═══════════════════════════════
// Detail data inline - key exercises with full breakdown
const EX_DETAIL={
'哑铃卧推':{muscles:['胸大肌（主）','三角肌前束','肱三头肌'],steps:['仰卧，双脚踩实地面，肩胛骨收紧贴凳','哑铃举至胸上方，手肘约45°夹角','缓慢下放至胸部两侧，感受胸肌拉伸（约3秒）','用力向上推起，顶端不完全锁死肘关节'],tips:['手肘不要外展至90°，否则会损伤肩袖','下放越慢，胸肌刺激越深'],mistakes:['弹力借力：哑铃碰胸后弹起，失去离心控制','耸肩代偿：肩膀用力而非胸肌']},
'杠铃卧推':{muscles:['胸大肌（主）','三角肌前束','肱三头肌'],steps:['躺在卧推凳上，眼睛位于杠铃正下方','握距略宽于肩，拇指环握','深吸气，将杠铃下放至乳头位置','呼气，用力推起至起始位'],tips:['全程五点接触：头/上背/臀/双脚','下背可轻微弓起，不要过度后仰'],mistakes:['握距过宽伤肩','闭眼握（大拇指不环握）危险']},
'高位下拉':{muscles:['背阔肌（主）','肱二头肌','大圆肌'],steps:['坐姿，大腿固定在靠垫下','正手宽握握把，挺胸微后仰','将横杆拉至锁骨位置，感受背阔肌收缩','缓慢回放至手臂伸直，感受拉伸'],tips:['想象"用肘部向下向后拉"而非用手','收缩时挤压肩胛骨'],mistakes:['借助身体大幅摆动','颈后下拉（容易伤颈椎）']},
'深蹲':{muscles:['股四头肌（主）','臀大肌','腘绳肌'],steps:['站距与肩同宽，脚尖微外八（15-30°）','深吸气收腹，脊柱中立','慢慢下蹲至大腿平行或以下，膝盖对准脚尖','蹬地站起，全程保持核心收紧'],tips:['下蹲时重心在脚中央偏后','膝盖不要内扣（常见错误）'],mistakes:['膝盖内扣（容易受伤）','脚跟离地（踝关节灵活性不足）']},
'臀推':{muscles:['臀大肌（主）','腘绳肌','竖脊肌'],steps:['肩胛骨下缘靠在凳子边缘，杠铃/哑铃放在髋骨位置','双脚踩地，膝盖90°','用力向上推髋，顶端停留1-2秒收缩臀部','缓慢下放，臀部不要碰地'],tips:['顶端注意"夹"臀，不要单纯靠腰部后仰','站距越宽，臀部刺激越多'],mistakes:['腰部代偿：拱腰而非臀部发力','膝盖内扣']},
'罗马尼亚硬拉':{muscles:['腘绳肌（主）','臀大肌','竖脊肌'],steps:['站直，哑铃/杠铃在大腿前方','膝盖微屈（锁定），臀部向后推','脊柱中立，慢慢让重物沿腿下滑','感受腘绳肌拉紧后，驱动臀部向前站起'],tips:['下放时感受"拉伸"而非弯腰','杠铃全程贴近腿部'],mistakes:['弓背（脊柱弯曲）','膝盖过多弯曲（变成深蹲硬拉）']},
'平板支撑':{muscles:['腹横肌','腹直肌','臀大肌'],steps:['肘撑地，肩膀在肘正上方','身体成一直线，从头到脚跟','收紧腹部和臀部','保持呼吸，不要憋气'],tips:['可以在镜子前做检查姿势','累了先放下，不要塌腰支撑'],mistakes:['臀部过高（减少核心刺激）','臀部下塌（增加腰部压力）']},
'侧平举':{muscles:['三角肌中束（主）'],steps:['站姿或坐姿，哑铃自然垂于两侧','手肘微弯，小拇指略高于大拇指','手臂抬至肩膀高度，稍作停顿','缓慢放下（离心控制3秒）'],tips:['重量越轻越能感受到中束','想象"把手肘抬起来"而非手'],mistakes:['借助身体惯性甩起','重量太重导致斜方肌代偿']},
};

function showExDetail(name){
const info=EX_DETAIL[name];
// Find from DB for muscles
let dbEx=null;
for(const exs of Object.values(DB)){const f=exs.find(e=>e.n===name);if(f){dbEx=f;break}}
const muscles=info?.muscles||(dbEx?.muscle?.map(m=>m)||['—']);
const steps=info?.steps||['详见动作说明'];
const tips=info?.tips||[];
const mistakes=info?.mistakes||[];

document.getElementById('ex-modal-title').textContent=name;
document.getElementById('ex-modal-muscles').innerHTML=muscles.map(m=>`<span class="jchip">${m}</span>`).join('');
document.getElementById('ex-modal-steps').innerHTML=steps.map((s,i)=>`<div class="ex-step"><span class="ex-step-n">${i+1}</span><span>${s}</span></div>`).join('');
document.getElementById('ex-modal-tips').innerHTML=tips.length?tips.map(t=>`<div class="ex-tip">💡 ${t}</div>`).join(''):'';
document.getElementById('ex-modal-mistakes').innerHTML=mistakes.length?`<p style="font-size:11px;font-weight:600;color:var(--terra);margin:8px 0 4px">常见错误</p>`+mistakes.map(m=>`<div class="ex-tip" style="border-color:var(--terra-br);color:var(--terra)">⚠️ ${m}</div>`).join(''):'';
document.getElementById('ex-modal').classList.add('open');
}
function closeExDetail(){document.getElementById('ex-modal').classList.remove('open');}

