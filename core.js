// ══ Firebase Config ══════════════════════════════════════
const firebaseConfig={apiKey:"AIzaSyB12HcJxsqqmWoih3wnfpyqu9LDzEE9nXs",authDomain:"cici-fitness.firebaseapp.com",projectId:"cici-fitness",storageBucket:"cici-fitness.firebasestorage.app",messagingSenderId:"375793627351",appId:"1:375793627351:web:f2dbfd8e107206417f4092",measurementId:"G-ZHCCRWZ57P"};

// ══ Storage Layer ════════════════════════════════════════
const K={settings:'fit_s1',plan:'fit_p1',prog:'fit_pr1',log:'fit_log1',adj:'fit_adj1'};
function lg(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch{return null}}
function ls(k,v){try{localStorage.setItem(k,JSON.stringify(v));schedulePush()}catch{}}

// ══ State ════════════════════════════════════════════════
const S={goal:'减脂塑形',level:'初级',days:3,dur:45,equip:['健身房全套'],focus:[],limits:'',plan:null,selDate:null,prog:{},adj:{}};
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
{n:'下斜杠铃卧推',eq:['健身房全套'],muscle:['下胸','三头'],diff:2,note:'头朝下，杠铃下放至下胸部'},
{n:'史密斯卧推',eq:['健身房全套'],muscle:['胸','三头'],diff:1,note:'轨道固定，专注胸大肌收缩'},
{n:'坐姿推胸机',eq:['健身房全套'],muscle:['胸'],diff:1,note:'全程控制离心，不要锁死肘部'},
{n:'器械夹胸',eq:['健身房全套'],muscle:['胸大肌中缝'],diff:1,note:'手肘微屈保持固定，想象抱树'},
{n:'绳索夹胸',eq:['健身房全套'],muscle:['胸'],diff:1,note:'顶峰收缩挤压1秒'},
{n:'绳索下斜夹胸',eq:['健身房全套'],muscle:['下胸'],diff:1,note:'高位滑轮，向腹部前方夹拢'},
{n:'哑铃仰卧屈臂上拉',eq:['哑铃','健身房全套'],muscle:['胸','背阔'],diff:2,note:'横躺在凳上，哑铃放至头后'},
{n:'上斜哑铃飞鸟',eq:['哑铃','健身房全套'],muscle:['上胸'],diff:2,note:'微弯肘，感受胸肌拉伸'},
{n:'俯卧撑',eq:['无器材','弹力带','哑铃','健身房全套'],muscle:['胸','三头'],diff:1,note:'核心收紧，身体一直线'},
],
shoulder:[
{n:'杠铃推举',eq:['健身房全套'],muscle:['前束','中束'],diff:2,note:'核心收紧，不要过度后仰'},
{n:'哑铃肩推',eq:['哑铃','健身房全套'],muscle:['前束','中束'],diff:1,note:'不耸肩，推到顶端不完全锁死'},
{n:'器械推举',eq:['健身房全套'],muscle:['前束','中束'],diff:1,note:'背部贴紧，手肘微靠前推起'},
{n:'史密斯肩推',eq:['健身房全套'],muscle:['前束','中束'],diff:1,note:'固定轨迹，适合大重量冲刺'},
{n:'侧平举',eq:['哑铃','健身房全套'],muscle:['中束'],diff:1,note:'小拇指略高于大拇指，肘微弯'},
{n:'坐姿侧平举机',eq:['健身房全套'],muscle:['中束'],diff:1,note:'小臂固定在挡板上，侧抬起'},
{n:'绳索侧平举',eq:['健身房全套'],muscle:['中束'],diff:1,note:'单臂交替，保持张力'},
{n:'哑铃前平举',eq:['哑铃','健身房全套'],muscle:['前束'],diff:1,note:'双手交替或同时向前平举'},
{n:'绳索前平举',eq:['健身房全套'],muscle:['前束'],diff:1,note:'背对绳索，从胯部向前拉起'},
{n:'杠铃直立划船',eq:['健身房全套'],muscle:['中束','斜方肌'],diff:2,note:'宽握，手肘向上提拉至胸口'},
{n:'俯身飞鸟',eq:['哑铃','健身房全套'],muscle:['后束'],diff:1,note:'俯身45°，挤压肩胛'},
{n:'反向飞鸟机',eq:['健身房全套'],muscle:['后束'],diff:1,note:'控制回放速度'},
{n:'面拉',eq:['健身房全套','弹力带'],muscle:['后束','外旋'],diff:1,note:'拉向面部两侧，外旋手臂'},
],
back:[
{n:'引体向上',eq:['健身房全套'],muscle:['背阔','二头'],diff:3,note:'全程控制，下放慢速2-3秒'},
{n:'助力引体向上机',eq:['健身房全套'],muscle:['背阔','二头'],diff:1,note:'调好配重（越重越轻），控制背部发力'},
{n:'高位下拉',eq:['健身房全套'],muscle:['背阔'],diff:1,note:'挺胸，拉至锁骨位置'},
{n:'坐姿划船',eq:['健身房全套','弹力带'],muscle:['中背','菱形'],diff:1,note:'肘贴身后拉，挤压肩胛骨'},
{n:'T把划船',eq:['健身房全套'],muscle:['中背','背阔'],diff:2,note:'双脚跨立，背部保持平直'},
{n:'杠铃斜板划船',eq:['健身房全套'],muscle:['中背'],diff:1,note:'胸贴上斜板，孤立背部发力'},
{n:'哑铃单臂划船',eq:['哑铃','健身房全套'],muscle:['背阔'],diff:1,note:'拉至腰部，感受背阔收缩'},
{n:'俯身划船',eq:['哑铃','健身房全套'],muscle:['中背'],diff:2,note:'背部平行地面，核心稳定'},
{n:'绳索直臂下压',eq:['健身房全套'],muscle:['背阔'],diff:1,note:'手臂微弯，感受背阔肌'},
{n:'直臂下压机',eq:['健身房全套'],muscle:['背阔'],diff:1,note:'手肘贴着靠垫向下压'},
{n:'山羊挺身',eq:['健身房全套'],muscle:['竖脊肌','臀'],diff:1,note:'罗马椅上，腰背平直起身'},
{n:'弹力带划船',eq:['弹力带'],muscle:['中背'],diff:1,note:'收紧肩胛骨'},
],
biceps:[
{n:'杠铃弯举',eq:['健身房全套'],muscle:['二头'],diff:1,note:'上臂贴身不动，只弯曲前臂'},
{n:'哑铃弯举',eq:['哑铃','健身房全套'],muscle:['二头'],diff:1,note:'交替进行，不借力'},
{n:'牧师椅杠铃弯举',eq:['健身房全套'],muscle:['二头'],diff:2,note:'腋窝卡住垫板，避免身体借力'},
{n:'器械弯举',eq:['健身房全套'],muscle:['二头'],diff:1,note:'孤立二头，手肘固定在垫子上'},
{n:'集中弯举',eq:['哑铃','健身房全套'],muscle:['二头肌峰'],diff:1,note:'坐姿，手肘抵在大腿内侧'},
{n:'斜板哑铃弯举',eq:['哑铃','健身房全套'],muscle:['二头长头'],diff:2,note:'上斜椅靠背，拉长二头肌收缩'},
{n:'锤式弯举',eq:['哑铃','健身房全套'],muscle:['肱肌','前臂'],diff:1,note:'中立握姿，感受外侧发力'},
{n:'绳索弯举',eq:['健身房全套'],muscle:['二头'],diff:1,note:'顶峰收缩停留1秒'},
{n:'绳索过头弯举',eq:['健身房全套'],muscle:['二头短头'],diff:1,note:'龙门架高位，像李小龙一样弯举'},
],
triceps:[
{n:'绳索下压',eq:['健身房全套'],muscle:['三头'],diff:1,note:'肘部贴身固定不动'},
{n:'器械三头下压',eq:['健身房全套'],muscle:['三头'],diff:1,note:'坐姿，双手握把向下推'},
{n:'绳索过头臂屈伸',eq:['健身房全套'],muscle:['三头长头'],diff:1,note:'背对龙门架，绳索从头后拉起'},
{n:'哑铃臂屈伸',eq:['哑铃','健身房全套'],muscle:['三头'],diff:1,note:'肘朝天花板，只动前臂'},
{n:'俯身单臂哑铃臂屈伸',eq:['哑铃','健身房全套'],muscle:['三头'],diff:1,note:'上臂贴紧躯干，向后伸直小臂'},
{n:'双杠臂屈伸',eq:['健身房全套'],muscle:['三头','胸'],diff:3,note:'身体直立偏重三头'},
{n:'助力双杠臂屈伸',eq:['健身房全套'],muscle:['三头'],diff:1,note:'利用辅助托板完成动作'},
{n:'窄距杠铃卧推',eq:['健身房全套'],muscle:['三头','胸'],diff:2,note:'握距与肩同宽，手肘贴紧身体'},
{n:'仰卧臂屈伸',eq:['哑铃','健身房全套'],muscle:['三头'],diff:1,note:'上臂垂直地面，只动前臂'},
],
quads:[
{n:'杠铃深蹲',eq:['健身房全套'],muscle:['股四头','臀'],diff:2,note:'膝盖对准脚尖，蹲至大腿平行地面'},
{n:'颈前杠铃深蹲',eq:['健身房全套'],muscle:['股四头'],diff:3,note:'杠铃放锁骨，背部保持直立'},
{n:'史密斯深蹲',eq:['健身房全套'],muscle:['股四头','臀'],diff:1,note:'脚可略前移，更安全'},
{n:'倒蹬机',eq:['健身房全套'],muscle:['股四头','臀'],diff:1,note:'靠背调至45度，双脚居中'},
{n:'钟摆深蹲',eq:['健身房全套'],muscle:['股四头'],diff:2,note:'机器轨迹类似深蹲，背部全程贴紧'},
{n:'哈克深蹲',eq:['健身房全套'],muscle:['股四头'],diff:2,note:'背部贴紧靠垫'},
{n:'腿屈伸',eq:['健身房全套'],muscle:['股四头'],diff:1,note:'顶端收缩停留1秒'},
{n:'保加利亚分腿蹲',eq:['哑铃','健身房全套'],muscle:['股四头','臀'],diff:2,note:'后脚搭在凳子上，重心在前方腿'},
{n:'哑铃弓步蹲',eq:['哑铃','健身房全套'],muscle:['股四头','臀'],diff:1,note:'步幅适中，前膝不超脚尖'},
{n:'高脚杯深蹲',eq:['哑铃','无器材'],muscle:['股四头','臀'],diff:1,note:'哑铃贴胸，挺胸下蹲'},
],
hamglutes:[
{n:'罗马尼亚硬拉',eq:['哑铃','健身房全套'],muscle:['腘绳','臀'],diff:2,note:'微屈膝，臀部后推，感受后侧拉伸'},
{n:'传统硬拉',eq:['健身房全套'],muscle:['后链全部'],diff:3,note:'背部中立，腿部推地发力'},
{n:'臀推',eq:['健身房全套','哑铃'],muscle:['臀'],diff:1,note:'顶端挤压臀部1-2秒'},
{n:'史密斯臀推',eq:['健身房全套'],muscle:['臀'],diff:1,note:'比杠铃更容易设置和控制'},
{n:'腿弯举',eq:['健身房全套'],muscle:['腘绳'],diff:1,note:'俯卧，控制回放'},
{n:'坐姿腿弯举',eq:['健身房全套'],muscle:['腘绳'],diff:1,note:'背贴靠垫，双腿用力向下压'},
{n:'站姿单腿弯举机',eq:['健身房全套'],muscle:['腘绳'],diff:1,note:'单腿轮流向后上方弯曲'},
{n:'绳索后踢腿',eq:['健身房全套'],muscle:['臀大肌'],diff:1,note:'脚套上把手，向后上方踢出'},
{n:'器械外展机',eq:['健身房全套'],muscle:['臀中肌'],diff:1,note:'坐姿向外打开双腿'},
{n:'臀桥',eq:['无器材','弹力带'],muscle:['臀'],diff:1,note:'顶端停留，感受臀部发力'},
{n:'弹力带蚌式开合',eq:['弹力带','无器材'],muscle:['臀中'],diff:1,note:'侧卧，膝盖打开'},
],
calves:[
{n:'站姿提踵',eq:['无器材','哑铃','健身房全套'],muscle:['小腿'],diff:1,note:'全幅度，顶端停顿1秒'},
{n:'史密斯提踵',eq:['健身房全套'],muscle:['小腿'],diff:1,note:'前脚掌踩铃片，借史密斯机稳定'},
{n:'腿举机提踵',eq:['健身房全套'],muscle:['小腿'],diff:1,note:'在腿举机上只用前脚掌推'},
{n:'坐姿提踵',eq:['健身房全套'],muscle:['比目鱼'],diff:1,note:'膝盖90°，控制速度'},
],
core:[
{n:'平板支撑',eq:['无器材','弹力带','哑铃','健身房全套'],muscle:['核心'],diff:1,note:'臀部不要过高或下塌',u:'秒'},
{n:'卷腹',eq:['无器材','健身房全套'],muscle:['腹直肌'],diff:1,note:'下背贴地，肩胛骨离地即可'},
{n:'坐姿卷腹机',eq:['健身房全套'],muscle:['腹直肌'],diff:1,note:'身体向前弯曲，双手抓住把手下拉'},
{n:'悬挂抬腿',eq:['健身房全套'],muscle:['下腹','髂腰'],diff:2,note:'控制下放，避免摇摆'},
{n:'罗马椅抬腿',eq:['健身房全套'],muscle:['下腹'],diff:1,note:'手肘撑在垫子上，下放避免腰部过度反弓'},
{n:'俄罗斯转体',eq:['无器材','哑铃','健身房全套'],muscle:['腹斜'],diff:1,note:'脚悬空增加难度'},
{n:'负重俄罗斯转体',eq:['健身房全套','哑铃'],muscle:['腹斜'],diff:1,note:'手持药球或哑铃片左右转动'},
{n:'绳索伐木',eq:['健身房全套'],muscle:['腹斜'],diff:1,note:'高位绳索拉至对侧膝盖外侧，如砍树'},
{n:'死虫式',eq:['无器材','健身房全套'],muscle:['核心稳定'],diff:1,note:'下背全程贴地'},
{n:'腹轮',eq:['健身房全套'],muscle:['核心'],diff:3,note:'初级跪姿，进阶站姿'},
{n:'侧平板支撑',eq:['无器材','健身房全套'],muscle:['腹斜'],diff:1,note:'每侧各做',u:'秒'},
],
cardio:[
{n:'跑步机慢跑',eq:['健身房全套'],muscle:['心肺'],diff:1,note:'心率维持最大心率65-75%',u:'分钟'},
{n:'弧形跑步机',eq:['健身房全套'],muscle:['心肺'],diff:2,note:'无电机，全靠自身发力，对核心要求更高',u:'分钟'},
{n:'划船机',eq:['健身房全套'],muscle:['心肺','全身'],diff:1,note:'腿蹬→身倾→手拉',u:'分钟'},
{n:'风阻划船机',eq:['健身房全套'],muscle:['心肺','全身'],diff:1,note:'用力越大阻力越大，适合HIIT',u:'分钟'},
{n:'椭圆机',eq:['健身房全套'],muscle:['心肺'],diff:1,note:'保持直立，手臂协同',u:'分钟'},
{n:'骑行机',eq:['健身房全套'],muscle:['心肺','腿'],diff:1,note:'座位高度：膝盖微弯',u:'分钟'},
{n:'动感单车',eq:['健身房全套'],muscle:['心肺','腿'],diff:2,note:'阻力大，可站立骑行',u:'分钟'},
{n:'攀爬机',eq:['健身房全套'],muscle:['心肺','腿臀'],diff:2,note:'踩楼梯机，对臀腿刺激更大',u:'分钟'},
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

// ══ Calendar helpers (local timezone) ═══════════════════
function _pad(n){return String(n).padStart(2,'0')}
function todayStr(){const d=new Date();return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`}
function dateStr(d){return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`}
function addDays(base,n){const d=new Date(base+'T12:00:00');d.setDate(d.getDate()+n);return dateStr(d)}
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
initTouchDrag();
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
const rpeStr=prompt('训练完成！请评价今天的训练强度 (1-10)：\n1-3 轻松  4-6 适中  7-8 吃力  9-10 极限','6');
const rpe=Math.max(1,Math.min(10,parseInt(rpeStr)||6));
const moods=['😴','😌','😌','🙂','🙂','💪','💪','🔥','🔥','😵'];
LOG.unshift({date,workout:day.workoutType,duration:day.duration,exerciseCount:day.exercises.length,rpe,
exercises:day.exercises.map((ex,i)=>({name:ex.name,sets:getAdj(date,i,'s',ex.sets),reps:getAdj(date,i,'r',ex.reps),unit:ex.unit})),mood:moods[rpe-1]||'💪',note:''});
ls(K.log,LOG);
showToast(`🎉 训练完成！RPE ${rpe}/10`);
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

// ══ Touch drag (mobile) ═════════════════════════════════
let _touchSrc=null,_touchEl=null;
function initTouchDrag(){
const grid=document.getElementById('cal-grid');if(!grid)return;
grid.addEventListener('touchstart',e=>{
const dc=e.target.closest('.dc[draggable]');if(!dc)return;
_touchSrc=dc.getAttribute('onclick')?.match(/selectDate\('([^']+)'\)/)?.[1]||null;
_touchEl=dc;dc.classList.add('dragging');
},{passive:true});
grid.addEventListener('touchend',e=>{
if(!_touchSrc){return}
const touch=e.changedTouches[0];
const target=document.elementFromPoint(touch.clientX,touch.clientY)?.closest('.dc');
if(target&&target!==_touchEl){
const tDate=target.getAttribute('onclick')?.match(/selectDate\('([^']+)'\)/)?.[1];
if(tDate)dragDrop({preventDefault(){}},tDate);
}
if(_touchEl)_touchEl.classList.remove('dragging');
_touchSrc=null;_touchEl=null;
},{passive:true});
}

// ══ Exercise Detail Modal ═══════════════════════════════
// Detail data inline - key exercises with full breakdown
const EX_DETAIL = {
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
    tips: ['30度最侧重上胸，角度过大容易代偿到肩膀'],
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
    mistakes: ['塌腰（最常见错误，损伤腰椎）', '臀部撅得太高']
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
    tips: ['器械轨迹固定，非常适合力竭组', '注意力集中在三角肌收缩上'],
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
    tips: ['这是改善圆肩驼背和维持肩部健康的最佳动作之一', '重量不需要很大，关键是外旋的动作'],
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
    tips: ['这是无法完成自重引体向上时的最佳退阶动作'],
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
    tips: ['这个动作能上很大重量，刺激背部厚度极佳', '可以选择宽把或窄把'],
    mistakes: ['弓背（极其危险）', '站得太直变成了耸肩']
  },
  '杠铃斜板划船': {
    muscles: ['中背', '菱形肌'],
    steps: ['将上斜板调至30-45度，胸口贴靠在板上', '双手持哑铃或杠铃', '向后上方拉起重量，挤压肩背', '控制回放'],
    tips: ['去除了下背部的压力和身体借力，是孤立训练背部的极佳动作'],
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
    tips: ['非常好的背部孤立动作，用来找背阔肌发力感或作为收尾充血'],
    mistakes: ['向下压的过程中弯曲手肘（变成了三头肌下压）', '身体上下起伏借力']
  },
  '直臂下压机': {
    muscles: ['背阔肌', '前锯肌'],
    steps: ['坐姿，手肘抵在器械的靠垫上', '利用背阔肌的力量将机器往下压至腹部', '缓慢回放'],
    tips: ['这是复刻经典的Nautilus Pullover器械，对背阔肌刺激无与伦比'],
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
    tips: ['居家练背的绝佳选择', '拉得越短，阻力越大'],
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
    tips: ['靠垫防止了手臂和身体的移动，是极好的孤立动作', '不要下放到关节完全锁死，保持一点张力'],
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
    tips: ['这被认为是塑造二头肌"山峰"的最佳动作', '专注在每一次顶峰收缩'],
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
    tips: ['三头肌长头在手臂抬高时被拉长，这个动作能提供最佳的长头刺激'],
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
    tips: ['非常好的新手退阶动作，可以专注于三头肌的发力'],
    mistakes: ['借着托板的弹力向上跳']
  },
  '窄距杠铃卧推': {
    muscles: ['肱三头肌', '胸大肌内侧'],
    steps: ['仰卧在卧推凳上，双手握距与肩同宽或略窄', '将杠铃下放至胸骨下部，大臂紧贴着身体两侧滑下', '用力推起至手臂伸直'],
    tips: ['这是增加三头肌块头的王牌动作，可以使用较大重量', '握距不要太窄（不要两手碰在一起），否则会伤手腕'],
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
    tips: ['这个变式对股四头肌和核心的刺激远大于传统深蹲', '背部不适者的绝佳替代动作'],
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
    mistakes: ['推到顶点时膝盖完全锁死反曲（极其危险，容易断腿）', '下落太深导致下背部离开靠背受压']
  },
  '钟摆深蹲': {
    muscles: ['股四头肌'],
    steps: ['背部紧贴机器靠板，肩膀顶住垫子', '缓慢下蹲，机器会带着你做一个向后下方的圆弧轨迹', '推起至初始位置'],
    tips: ['这台机器能提供极致的股四头肌孤立刺激，而且对腰椎极其友好', '可以蹲得非常深'],
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
    tips: ['孤立股四头肌雕刻线条的最佳动作，适合放在腿部训练最后', '脚尖向外侧重内侧头，脚尖向内侧重外侧头'],
    mistakes: ['重量过大导致身体从座位上弹起', '完全不用力回放，让配重片砸下']
  },
  '保加利亚分腿蹲': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['双手持哑铃，背对长凳站立，将一只脚的脚背搭在凳子上', '另一只脚向前迈出合适距离', '下蹲至前侧大腿与地面平行，后侧膝盖几乎触地', '前脚脚跟发力推起'],
    tips: ['上半身直立更侧重股四头肌；上半身稍微前倾更侧重臀大肌', '单腿动作能极好地改善左右不平衡'],
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
    tips: ['重量在身前会自动强迫你保持背部直立，是新手学习深蹲的最佳入门动作'],
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
    tips: ['这是目前公认发展臀部体积的最佳动作', '保持下巴微收看向前方，有助于防止腰椎超伸'],
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
    tips: ['单腿动作，能很好地感受到肌肉的收缩，适合改善两侧不平衡'],
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
    tips: ['这是一个极佳的新手动作和热身激活核心动作', '想增加难度可以单腿做，或者在髋部放哑铃'],
    mistakes: ['推得过高导致腰部过度反弓']
  },
  '弹力带蚌式开合': {
    muscles: ['臀中肌'],
    steps: ['将迷你弹力带套在膝盖上方，侧卧在垫子上，双膝微屈并拢', '双脚保持接触，像蚌壳一样打开上方的膝盖', '顶端停顿，缓慢闭合'],
    tips: ['深蹲硬拉前的绝佳热身动作，能激活臀部稳定肌群，防止膝盖内扣'],
    mistakes: ['打开膝盖时，骨盆跟着向后翻转（应保持骨盆垂直于地面不动）']
  },

  // === 小腿 (Calves) ===
  '站姿提踵': {
    muscles: ['腓肠肌（小腿肚）'],
    steps: ['前脚掌踩在台阶或提踵机踏板上，脚跟悬空', '最大幅度地下放脚跟，感受小腿后侧深度拉伸', '用力踮起脚尖到最高点，停顿1-2秒强烈收缩', '控制回放'],
    tips: ['小腿肌肉对全幅度（特别是拉伸感）非常敏感，一定要下放到最低点'],
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
    tips: ['非常安全的大重量小腿训练方法，腰部完全无压力'],
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
    tips: ['机器能让你方便地增加负重，是让腹肌块头变大的好工具', '保持背部微拱起，不要挺直背部压'],
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
    tips: ['这是一个极其安全的动作，非常适合康复和唤醒深层核心', '关键点：下背部绝不能离开地面哪怕一毫米'],
    mistakes: ['动作过快', '背部拱起离开地面']
  },
  '腹轮': {
    muscles: ['核心全身', '背阔肌'],
    steps: ['双膝跪在软垫上，双手握住健腹轮的把手', '收紧腹肌，稍微含胸（像一只生气的猫）', '缓慢向前推出滚轮，直至身体完全伸展但未触地', '利用腹肌的收缩将身体拉回初始跪姿'],
    tips: ['极具挑战性的动作！如果在极限位置拉不回来，可以直接向前趴下', '熟练后可以尝试站姿推腹轮（地狱难度）'],
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
    tips: ['可以设置1-2%的坡度，以弥补室内没有风阻的差异，更接近户外真实跑步体验', '心率保持在最大心率的65-75%为极佳的燃脂区间'],
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
    tips: ['这大概是健身房里效率最高、对关节冲击最小的全身有氧器械', '记住口诀："腿-背-手，手-背-腿"'],
    mistakes: ['顺序错乱（腿还没伸直手就拉了）', '弯腰驼背']
  },
  '风阻划船机': {
    muscles: ['心肺功能', '爆发力', '全身'],
    steps: ['动作与普通划船机一致', '主要区别在于：你拉得越快、用力越猛，风扇产生的阻力就越大'],
    tips: ['非常适合做HIIT（高强度间歇训练），例如：全力划30秒，慢划30秒，重复10组'],
    mistakes: ['阻力挡位设置过高（通常推荐调在3-5挡之间即可模拟真实划水感）']
  },
  '椭圆机': {
    muscles: ['心肺功能'],
    steps: ['站上脚踏板，双手握住移动把手', '开始同步协调手脚的推拉运动', '保持上半身直立，核心微收紧'],
    tips: ['这是一个"零冲击"的有氧运动，非常适合体重较大者或有膝盖伤病的人群保护关节', '可以尝试倒着踩，能更多刺激到臀部和腘绳肌'],
    mistakes: ['身体瘫软地趴在控制面板上', '阻力设为0，只是随着惯性空转']
  },
  '骑行机': {
    muscles: ['心肺功能', '股四头肌'],
    steps: ['调整座椅高度：当你的一侧脚踏踩到最低点时，该侧膝盖应该有极轻微的弯曲', '设置好阻力，开始平稳踩踏', '保持上半身稳定，不左右摇晃'],
    tips: ['坐姿骑行（有靠背的那种）对腰椎最友好，适合大体重人群'],
    mistakes: ['座椅调得太低，导致膝盖一直弯着受力（极其伤膝盖）']
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
    tips: ['又称"有氧之王"，燃脂效率极高，同时能很好地锻炼到臀腿肌肉', '尽量不要死死抓着扶手借力'],
    mistakes: ['上半身瘫倒在控制台上，踮着脚尖走']
  },
  '跳绳': {
    muscles: ['心肺功能', '小腿', '肩部耐力'],
    steps: ['双手握住手柄，绳子在脚后跟', '手腕发力转动绳子', '绳子从头上转过时，前脚掌轻轻弹跳跃过', '保持平稳的呼吸和节奏'],
    tips: ['跳跃的高度只需要刚好让绳子通过即可，切勿跳得太高', '是非常好的便携式高强度有氧运动'],
    mistakes: ['整个手臂大幅度抡圈（应该用手腕转）', '脚跟着地重重砸向地面']
  },
  '开合跳': {
    muscles: ['心肺功能', '全身协调性'],
    steps: ['站立，双脚并拢，双手自然下垂', '向上跳起，同时双脚向两侧张开，双手举过头顶击掌或靠近', '再次跳起，双脚并拢，双手放回体侧', '快速连续进行'],
    tips: ['膝盖始终保持微屈，起到缓冲作用', '这是绝佳的训练前热身动作，能快速升高心率和体温'],
    mistakes: ['跳跃落地时膝盖关节完全锁死笔直']
  },
  '波比跳': {
    muscles: ['心肺功能', '爆发力', '全身绝大部分肌群'],
    steps: ['站立姿势开始，下蹲，双手撑在地面上', '双腿向后跳，呈高位平板支撑姿势', '（可选）做一个标准的俯卧撑', '双腿向前跳回深蹲姿势', '向上用力跳起，双手在头顶击掌'],
    tips: ['公认的"地狱级"燃脂动作，能瞬间把心率拉爆', '如果是新手，可以去掉俯卧撑，以及把双腿"跳"向后改为"走"向后以降低难度'],
    mistakes: ['在平板支撑阶段腰部严重塌陷', '落地没有缓冲，脚砸地面']
  }
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

