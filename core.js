// ══ Firebase Config ══════════════════════════════════════
const firebaseConfig={apiKey:"AIzaSyB12HcJxsqqmWoih3wnfpyqu9LDzEE9nXs",authDomain:"cici-fitness.firebaseapp.com",projectId:"cici-fitness",storageBucket:"cici-fitness.firebasestorage.app",messagingSenderId:"375793627351",appId:"1:375793627351:web:f2dbfd8e107206417f4092",measurementId:"G-ZHCCRWZ57P"};

// ══ Storage Layer ════════════════════════════════════════
const K={settings:'fit_s1',plan:'fit_p1',prog:'fit_pr1',log:'fit_log1',adj:'fit_adj1',wh:'fit_wh1',pr:'fit_pr',swim_log:'fit_swim',gym_log:'fit_gym_ach'};
function currentUid(){ return (typeof firebase !== 'undefined' && firebase.auth().currentUser && firebase.auth().currentUser.uid) || 'anon'; }
function nsKey(k){ return currentUid() + '__' + k; }
function lg(k){try{const v=localStorage.getItem(nsKey(k));return v?JSON.parse(v):null}catch{return null}}
function ls(k,v){try{localStorage.setItem(nsKey(k),JSON.stringify(v));if(typeof schedulePush==='function')schedulePush()}catch{}}

// ══ State ════════════════════════════════════════════════
const S={goal:'女性薄肌',level:'初级',days:3,dur:60,equip:['健身房全套'],focus:['均衡全身'],limits:'',plan:null,selDate:null,prog:{},adj:{},weights:{},volumeMultiplier:1.0,restDur:45,swimLevel:'入门',periodMode:false};
let LOG=lg(K.log)||[];
let W_HIST=lg(K.wh)||{};
let PR_LIST=lg(K.pr)||[]; // {date,exercise,weight,prev}
let SWIM_LOG=lg(K.swim_log)||{count:0,milestones:[]};
let GYM_LOG=lg(K.gym_log)||{count:0,milestones:[]};
let _logShowAll=false;
let _calWeekOffset=0;

// ══ Goal Helper ═════════════════════════════════════════
// S.goal can be '女性薄肌', '臀腿塑形', or '女性薄肌+臀腿塑形'
function hasGoal(g){return S.goal&&S.goal.includes(g)}
function isCombinedGoal(){return hasGoal('女性薄肌')&&hasGoal('臀腿塑形')}

// ══ Limits ═══════════════════════════════════════════════
const LIMIT_RULES=[
{kw:['膝','膝盖','膝关节'],exclude:['杠铃深蹲','史密斯深蹲','腿举','哑铃弓步蹲','跳蹲','跳绳','开合跳','壶铃摆动']},
{kw:['肩','肩膀','肩关节'],exclude:['杠铃推举','哑铃肩推','侧平举','直立划船','双杠臂屈伸','自由泳划臂+侧头呼吸','自由泳完整配合']},
{kw:['腰','腰椎','腰背'],exclude:['传统硬拉','罗马尼亚硬拉','俯身划船','早安式体前屈','壶铃摆动']},
{kw:['颈','颈椎'],exclude:['高位下拉','杠铃推举']},
{kw:['斜方','脖子粗','脖子','肩颈','颈肩','圆肩'],exclude:['杠铃直立划船']},
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
{n:'绳索侧平举',eq:['健身房全套'],muscle:['中束'],diff:1,note:'单臂交替，保持张力',bi:true},
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
{n:'哑铃单臂划船',eq:['哑铃','健身房全套'],muscle:['背阔'],diff:1,note:'拉至腰部，感受背阔收缩',bi:true},
{n:'器械上背划船',eq:['健身房全套'],muscle:['上背','菱形'],diff:1,note:'挺胸，手肘向后拉，挤压肩胛骨中间'},
{n:'俯身划船',eq:['哑铃','健身房全套'],muscle:['中背'],diff:2,note:'背部平行地面，核心稳定'},
{n:'绳索直臂下压',eq:['健身房全套'],muscle:['背阔'],diff:1,note:'手臂微弯，感受背阔肌'},
{n:'直臂下压机',eq:['健身房全套'],muscle:['背阔'],diff:1,note:'手肘贴着靠垫向下压'},
{n:'山羊挺身',eq:['健身房全套'],muscle:['竖脊肌','臀'],diff:1,note:'罗马椅上，腰背平直起身'},
{n:'弹力带划船',eq:['弹力带'],muscle:['中背'],diff:1,note:'收紧肩胛骨'},
{n:'俯卧YTW',eq:['哑铃','无器材','健身房全套'],muscle:['下斜方','后束'],diff:1,note:'俯卧或俯身，手臂依次摆出Y-T-W三个形状，重点激活下斜方让肩胛下沉'},
{n:'靠墙天使',eq:['无器材'],muscle:['下斜方','姿势'],diff:1,note:'后背贴墙，手臂沿墙面上下滑动如雪天使，全程肩胛贴墙下沉',u:'次'},
],
biceps:[
{n:'杠铃弯举',eq:['健身房全套'],muscle:['二头'],diff:1,note:'上臂贴身不动，只弯曲前臂'},
{n:'哑铃弯举',eq:['哑铃','健身房全套'],muscle:['二头'],diff:1,note:'交替进行，不借力'},
{n:'牧师椅杠铃弯举',eq:['健身房全套'],muscle:['二头'],diff:2,note:'腋窝卡住垫板，避免身体借力'},
{n:'器械弯举',eq:['健身房全套'],muscle:['二头'],diff:1,note:'孤立二头，手肘固定在垫子上'},
{n:'集中弯举',eq:['哑铃','健身房全套'],muscle:['二头肌峰'],diff:1,note:'坐姿，手肘抵在大腿内侧',bi:true},
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
{n:'俯身单臂哑铃臂屈伸',eq:['哑铃','健身房全套'],muscle:['三头'],diff:1,note:'上臂贴紧躯干，向后伸直小臂',bi:true},
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
{n:'保加利亚分腿蹲',eq:['哑铃','健身房全套'],muscle:['股四头','臀'],diff:2,note:'后脚搭在凳子上，重心在前方腿',bi:true},
{n:'哑铃弓步蹲',eq:['哑铃','健身房全套'],muscle:['股四头','臀'],diff:1,note:'步幅适中，前膝不超脚尖',bi:true},
{n:'高脚杯深蹲',eq:['哑铃','无器材'],muscle:['股四头','臀'],diff:1,note:'哑铃贴胸，挺胸下蹲'},
{n:'壶铃高脚杯深蹲',eq:['壶铃','健身房全套'],muscle:['股四头','臀'],diff:1,note:'双手托壶铃贴胸，挺胸下蹲，动作更自然'},
],
glutemed:[
{n:'站姿绳索单腿外展',eq:['健身房全套'],muscle:['臀中肌'],diff:1,note:'踝部套绳，对侧手扶机架，单腿向侧方抬起，顶峰停留1秒。本馆主力外展动作（有龙门架）',bi:true},
{n:'弹力带螃蟹步',eq:['弹力带','无器材'],muscle:['臀中肌'],diff:1,note:'弹力带套膝上，半蹲姿向侧走15-20步/方向，全程保持张力，膝盖不内扣',bi:true},
{n:'侧卧抬腿',eq:['无器材','弹力带'],muscle:['臀中肌'],diff:1,note:'侧卧上腿伸直向侧上方抬约45°，顶峰停留1秒，骨盆不后倒',bi:true},
{n:'弹力带蚌式开合',eq:['弹力带','无器材'],muscle:['臀中肌'],diff:1,note:'侧卧屈膝，膝盖如蚌壳向上打开，骨盆不后翻',bi:true},
{n:'器械外展机',eq:['健身房全套'],muscle:['臀中肌'],diff:1,note:'身体前倾20-30°练上臀纤维。本馆若无此机，用站姿绳索单腿外展替代'},
],
hamglutes:[
{n:'罗马尼亚硬拉',eq:['哑铃','健身房全套'],muscle:['腘绳','臀'],diff:2,note:'微屈膝，臀部后推，感受后侧拉伸'},
{n:'传统硬拉',eq:['健身房全套'],muscle:['后链全部'],diff:3,note:'背部中立，腿部推地发力'},
{n:'臀推',eq:['健身房全套','哑铃'],muscle:['臀'],diff:1,note:'顶端挤压臀部1-2秒'},
{n:'史密斯臀推',eq:['健身房全套'],muscle:['臀'],diff:1,note:'比杠铃更容易设置和控制'},
{n:'腿弯举',eq:['健身房全套'],muscle:['腘绳'],diff:1,note:'俯卧，控制回放'},
{n:'坐姿腿弯举',eq:['健身房全套'],muscle:['腘绳'],diff:1,note:'背贴靠垫，双腿用力向下压'},
{n:'站姿单腿弯举机',eq:['健身房全套'],muscle:['腘绳'],diff:1,note:'单腿轮流向后上方弯曲',bi:true},
{n:'绳索后踢腿',eq:['健身房全套'],muscle:['臀大肌'],diff:1,note:'脚套上把手，向后上方踢出',bi:true},
{n:'器械内收机',eq:['健身房全套'],muscle:['内收肌'],diff:1,note:'坐姿向内夹拢双腿'},
{n:'壶铃摆动',eq:['壶铃','健身房全套'],muscle:['臀','腘绳','核心'],diff:1,note:'髋部爆发式前推，手臂只是挂钩'},
{n:'臀桥',eq:['无器材','弹力带'],muscle:['臀'],diff:1,note:'顶端停留，感受臀部发力'},
],
calves:[
{n:'站姿提踵',eq:['无器材','哑铃','健身房全套'],muscle:['小腿'],diff:1,note:'全幅度，顶端停顿1秒'},
{n:'史密斯提踵',eq:['健身房全套'],muscle:['小腿'],diff:1,note:'前脚掌踩铃片，借史密斯机稳定'},
{n:'腿举机提踵',eq:['健身房全套'],muscle:['小腿'],diff:1,note:'在腿举机上只用前脚掌推'},
{n:'坐姿提踵',eq:['健身房全套'],muscle:['比目鱼'],diff:1,note:'膝盖90°，控制速度'},
],
core:[
{n:'腹横肌真空吸',eq:['无器材','健身房全套'],muscle:['腹横肌'],diff:1,note:'呼气收腹，肚脐向脊柱方向吸紧，保持10-20秒。收紧不增厚腰围',u:'秒'},
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
{n:'侧平板支撑',eq:['无器材','健身房全套'],muscle:['腹斜'],diff:1,note:'每侧各做',u:'秒',bi:true},
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
{n:'上肢功率车',eq:['健身房全套'],muscle:['心肺','上肢'],diff:1,note:'用双臂驱动，对肩和手臂有额外刺激',u:'分钟'},
],
swimming:[
// ── 入门级 (diff:1) — 水性+蛙泳基础 ──
{n:'水中行走热身',eq:['泳池'],muscle:['全身'],diff:1,note:'沿池边行走，适应水温和浮力，活动四肢',u:'分钟',swimPhase:'warmup'},
{n:'水中呼吸练习',eq:['泳池'],muscle:['心肺'],diff:1,note:'站立吸气→脸入水用鼻子吐泡泡→抬头，循环节奏',u:'分钟',swimPhase:'tech'},
{n:'扶边蛙泳腿练习',eq:['泳池'],muscle:['下肢','心肺'],diff:1,note:'口诀：收翻蹬夹。扶池边专注腿部动作，脚踝外翻勾起是关键',u:'分钟',swimPhase:'tech'},
{n:'蹬壁滑行练习',eq:['泳池'],muscle:['核心','全身'],diff:1,note:'蹬壁出发，全身绷紧流线型，感受水流推动滑行',u:'分钟',swimPhase:'tech'},
{n:'蛙泳手部划水练习',eq:['泳池'],muscle:['上肢','心肺'],diff:1,note:'浅水站立，手臂向两侧外划→向内抱水→前伸，配合抬头吸气',u:'分钟',swimPhase:'tech'},
{n:'蛙泳完整配合',eq:['泳池'],muscle:['全身','心肺'],diff:1,note:'划手→抬头吸气→收腿→蹬夹滑行。先划手后蹬腿，不要同时动',u:'分钟',swimPhase:'main'},
{n:'水中漫步放松',eq:['泳池'],muscle:['全身'],diff:1,note:'慢速水中行走或缓慢踢水，让肌肉放松恢复',u:'分钟',swimPhase:'cooldown'},
// ── 进阶级 (diff:2) — 蛙泳巩固+耐力 ──
{n:'蛙泳连续游',eq:['泳池'],muscle:['全身','心肺'],diff:2,note:'25-50m连续游，关注节奏和蹬腿后的滑行感',u:'分钟',swimPhase:'main'},
{n:'蛙泳间歇训练',eq:['泳池'],muscle:['心肺','全身'],diff:2,note:'25m×4-6组，每组之间池边休息30-45秒',u:'分钟',swimPhase:'main'},
{n:'踩水练习',eq:['泳池'],muscle:['全身','核心'],diff:2,note:'深水区保持头部在水面以上，与蛙泳腿相通的自救基本功',u:'分钟',swimPhase:'tech'},
{n:'蹬壁转身练习',eq:['泳池'],muscle:['核心','全身'],diff:2,note:'游到池边后蹬壁掉头继续游，不停顿，练流畅性',u:'分钟',swimPhase:'tech'},
// ── 挑战级 (diff:3) — 自由泳入门 ──
{n:'自由泳打腿练习',eq:['泳池'],muscle:['下肢','核心'],diff:3,note:'扶边或蹬壁，髋部发力上下打水，膝盖微屈脚踝放松',u:'分钟',swimPhase:'tech'},
{n:'自由泳划臂+侧头呼吸',eq:['泳池'],muscle:['上肢','心肺'],diff:3,note:'浅水站立/行走中练习划臂和侧头换气的配合',u:'分钟',swimPhase:'tech'},
{n:'自由泳完整配合',eq:['泳池'],muscle:['全身','心肺'],diff:3,note:'短距离尝试完整自由泳，手脚交替+侧头呼吸',u:'分钟',swimPhase:'main'},
],
warmup:[
{n:'全身动态热身 (开合跳)',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['全身'],diff:1,note:'落地轻柔，保持呼吸节奏',u:'秒',warmupSec:45},
{n:'肩关节环绕',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['上肢'],diff:1,note:'直臂或屈臂，大幅度画圆，前后各30秒',u:'秒',warmupSec:60},
{n:'扩胸运动',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['上肢'],diff:1,note:'感受胸肌拉伸，动作连贯不憋气',u:'秒',warmupSec:30},
{n:'徒手深蹲激活',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['下肢','全身'],diff:1,note:'臀部后坐，膝盖不内扣',u:'秒',warmupSec:45},
{n:'弓步转体',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['下肢','核心'],diff:1,note:'下蹲时呼气，躯干向大腿方向扭转',u:'秒',warmupSec:45,bi:true},
{n:'高抬腿走',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['下肢','全身'],diff:1,note:'挺胸收腹，双手抱膝向上提拉',u:'秒',warmupSec:45},
{n:'登山者',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['核心','全身'],diff:2,note:'俯卧撑姿势，腹部收紧，交替提膝',u:'秒',warmupSec:30},
],
stretch:[
{n:'婴儿式背部拉伸',eq:['无器材','弹力带','哑铃','健身房全套'],muscle:['全身','核心'],diff:1,note:'臀部坐向脚后跟，双手前伸，深长呼吸',u:'秒'},
{n:'胸部静态拉伸',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['上肢'],diff:1,note:'找一面墙，单臂微屈抵住，身体向反方向转',u:'秒',bi:true},
{n:'肩后侧拉伸',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['上肢'],diff:1,note:'单臂水平伸直，另一只手将其压向胸口',u:'秒',bi:true},
{n:'三头肌拉伸',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['上肢'],diff:1,note:'手臂上举屈肘，另一手将其向后拉',u:'秒',bi:true},
{n:'股四头肌拉伸',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['下肢'],diff:1,note:'单腿站立，手抓脚踝拉向臀部',u:'秒',bi:true},
{n:'腘绳肌/体前屈',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['下肢'],diff:1,note:'坐姿或站姿，双腿伸直，身体慢慢下压',u:'秒'},
{n:'臀大肌拉伸',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['下肢'],diff:1,note:'仰卧，一腿架在另一腿膝盖上，双手抱腿拉向胸口',u:'秒',bi:true},
{n:'髂胫束拉伸',eq:['无器材','弹力带','哑铃','壶铃','健身房全套'],muscle:['下肢'],diff:1,note:'交叉腿站立，身体向后腿一侧侧倾',u:'秒',bi:true},
{n:'腹部拉伸 (眼镜蛇式)',eq:['无器材','弹力带','哑铃','健身房全套'],muscle:['核心'],diff:1,note:'俯卧撑起上半身，骨盆贴地',u:'秒'},
]
};

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

// ══ Glute-Leg Splits (臀腿塑形专用) ═══════════════════════
// 全部精力放在下半身：臀中肌改善腰胯比，臀大肌整体臀型，大腿前后侧让腿不显细。
// 不安排任何上肢宽度训练。
const GLUTE_SPLITS={
// 2天：两次都按全套来 — 臀腿综合
2:[
{type:'臀腿综合（髋铰链+深蹲）',groups:['hamglutes','quads','glutemed','calves','core'],pick:{hamglutes:2,quads:2,glutemed:1,calves:1,core:1}},
{type:'臀腿综合（深蹲+髋铰链）',groups:['quads','hamglutes','glutemed','calves','core'],pick:{quads:2,hamglutes:2,glutemed:1,calves:1,core:1}},
],
// 3天：股四日/臀腘日/综合日
3:[
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves','core'],pick:{quads:3,hamglutes:1,calves:1,core:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','quads','glutemed','core'],pick:{hamglutes:3,quads:1,glutemed:1,core:1}},
{type:'臀腿综合日',groups:['hamglutes','quads','glutemed','calves','core'],pick:{hamglutes:2,quads:1,glutemed:1,calves:1,core:1}},
],
// 4天：股四/臀腘/综合/臀中+小腿
4:[
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves','core'],pick:{quads:3,hamglutes:1,calves:1,core:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
{type:'臀腿综合日',groups:['hamglutes','quads','glutemed','calves','core'],pick:{hamglutes:2,quads:1,glutemed:1,calves:1,core:1}},
{type:'臀中肌+小腿强化',groups:['glutemed','hamglutes','calves','core'],pick:{glutemed:2,hamglutes:1,calves:2,core:1}},
],
// 5天：股四/臀腘/综合/股四进阶/臀中+小腿
5:[
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves','core'],pick:{quads:3,hamglutes:1,calves:1,core:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
{type:'臀腿综合日',groups:['hamglutes','quads','glutemed','calves','core'],pick:{hamglutes:2,quads:1,glutemed:1,calves:1,core:1}},
{type:'臀中肌+小腿强化',groups:['glutemed','hamglutes','calves','core'],pick:{glutemed:2,hamglutes:1,calves:2,core:1}},
{type:'轻量有氧+拉伸',groups:['cardio','core'],pick:{cardio:3,core:2}},
],
// 6天：全下肢高频轮转
6:[
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves','core'],pick:{quads:3,hamglutes:1,calves:1,core:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
{type:'臀腿综合日',groups:['hamglutes','quads','glutemed','calves','core'],pick:{hamglutes:2,quads:1,glutemed:1,calves:1,core:1}},
{type:'臀中肌+小腿强化',groups:['glutemed','hamglutes','calves','core'],pick:{glutemed:2,hamglutes:1,calves:2,core:1}},
{type:'轻量有氧+拉伸',groups:['cardio','core'],pick:{cardio:3,core:2}},
{type:'臀大肌泵感日',groups:['hamglutes','glutemed','core'],pick:{hamglutes:4,glutemed:1,core:1}},
],
// 7天：6天分化+活动恢复
7:[
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves','core'],pick:{quads:3,hamglutes:1,calves:1,core:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
{type:'臀腿综合日',groups:['hamglutes','quads','glutemed','calves','core'],pick:{hamglutes:2,quads:1,glutemed:1,calves:1,core:1}},
{type:'臀中肌+小腿强化',groups:['glutemed','hamglutes','calves','core'],pick:{glutemed:2,hamglutes:1,calves:2,core:1}},
{type:'轻量有氧+拉伸',groups:['cardio','core'],pick:{cardio:3,core:2}},
{type:'臀大肌泵感日',groups:['hamglutes','glutemed','core'],pick:{hamglutes:4,glutemed:1,core:1}},
{type:'活动休息日（纯拉伸/泡沫轴）',groups:['stretch'],pick:{stretch:5}},
],
};

// ══ Athletic Splits (倒三角矫正 - Cait专属) ══════════════
const ATHLETIC_SPLITS={
  2:[
    {type:'臀中肌宽度+臀大肌',groups:['glutemed','hamglutes','quads','core'],pick:{glutemed:3,hamglutes:1,quads:1,core:1}},
    {type:'臀大肌爆发+腿',groups:['hamglutes','quads','glutemed','core'],pick:{hamglutes:2,quads:1,glutemed:1,core:1}},
  ],
  3:[
    {type:'臀中肌宽度日（外展为主）',groups:['glutemed','hamglutes','core'],pick:{glutemed:3,hamglutes:1,core:1}},
    {type:'臀大肌爆发日（臀推为主）',groups:['hamglutes','quads','glutemed','core'],pick:{hamglutes:2,quads:1,glutemed:1,core:1}},
    {type:'腿部体积+综合日',groups:['quads','hamglutes','glutemed','calves'],pick:{quads:2,hamglutes:1,glutemed:1,calves:1}},
  ],
  4:[
    {type:'臀中肌宽度（重）',groups:['glutemed','core'],pick:{glutemed:4,core:1}},
    {type:'臀大肌爆发',groups:['hamglutes','quads','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
    {type:'股四+腘绳',groups:['quads','hamglutes','calves'],pick:{quads:3,hamglutes:1,calves:1}},
    {type:'臀中+泵感综合',groups:['glutemed','hamglutes'],pick:{glutemed:3,hamglutes:2}},
  ],
  5:[
    {type:'臀中肌宽度',groups:['glutemed','core'],pick:{glutemed:4,core:1}},
    {type:'臀大肌爆发',groups:['hamglutes','quads','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
    {type:'股四头肌日',groups:['quads','calves'],pick:{quads:4,calves:1}},
    {type:'臀中+臀大泵感',groups:['glutemed','hamglutes'],pick:{glutemed:3,hamglutes:2}},
    {type:'腘绳+综合+核心',groups:['hamglutes','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
  ],
  6:[
    {type:'臀中肌宽度',groups:['glutemed','core'],pick:{glutemed:4,core:1}},
    {type:'臀大肌爆发',groups:['hamglutes','quads','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
    {type:'股四头肌日',groups:['quads','calves'],pick:{quads:4,calves:1}},
    {type:'臀中+臀大泵感',groups:['glutemed','hamglutes'],pick:{glutemed:3,hamglutes:2}},
    {type:'腘绳+综合+核心',groups:['hamglutes','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
    {type:'臀中强化',groups:['glutemed','calves'],pick:{glutemed:3,calves:2}},
  ],
  7:[
    {type:'臀中肌宽度',groups:['glutemed','core'],pick:{glutemed:4,core:1}},
    {type:'臀大肌爆发',groups:['hamglutes','quads','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
    {type:'股四头肌日',groups:['quads','calves'],pick:{quads:4,calves:1}},
    {type:'臀中+臀大泵感',groups:['glutemed','hamglutes'],pick:{glutemed:3,hamglutes:2}},
    {type:'腘绳+综合+核心',groups:['hamglutes','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
    {type:'臀中强化',groups:['glutemed','calves'],pick:{glutemed:3,calves:2}},
    {type:'轻量有氧+拉伸',groups:['cardio','stretch'],pick:{cardio:2,stretch:3}},
  ],
};

// ══ Glute Back Splits (翘臀美背 - Cici专属) ══════════════
const GLUTE_BACK_SPLITS={
  2:[
    {type:'臀+腿日',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
    {type:'美背+臀+核心',groups:['back','hamglutes','core'],pick:{back:3,hamglutes:1,core:1}},
  ],
  3:[
    {type:'臀大肌日（臀峰）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
    {type:'美背+体态日',groups:['back','core'],pick:{back:4,core:2}},
    {type:'臀腿+核心综合',groups:['hamglutes','quads','glutemed','core'],pick:{hamglutes:2,quads:1,glutemed:1,core:1}},
  ],
  4:[
    {type:'臀大肌（臀峰）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
    {type:'美背+体态',groups:['back','core'],pick:{back:4,core:2}},
    {type:'股四+臀腿',groups:['quads','hamglutes','core'],pick:{quads:3,hamglutes:1,core:1}},
    {type:'臀中+美背收尾',groups:['glutemed','back','core'],pick:{glutemed:2,back:2,core:1}},
  ],
  5:[
    {type:'臀大肌（臀峰）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
    {type:'美背+体态',groups:['back','core'],pick:{back:4,core:2}},
    {type:'股四头肌',groups:['quads','calves','core'],pick:{quads:3,calves:1,core:1}},
    {type:'臀腿综合',groups:['hamglutes','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
    {type:'美背+核心收腰',groups:['back','core'],pick:{back:3,core:2}},
  ],
  6:[
    {type:'臀大肌（臀峰）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
    {type:'美背+体态',groups:['back','core'],pick:{back:4,core:2}},
    {type:'股四头肌',groups:['quads','calves','core'],pick:{quads:3,calves:1,core:1}},
    {type:'臀腿综合',groups:['hamglutes','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
    {type:'美背+核心收腰',groups:['back','core'],pick:{back:3,core:2}},
    {type:'臀大肌泵感日',groups:['hamglutes','core'],pick:{hamglutes:4,core:1}},
  ],
  7:[
    {type:'臀大肌（臀峰）',groups:['hamglutes','quads','core'],pick:{hamglutes:3,quads:1,core:1}},
    {type:'美背+体态',groups:['back','core'],pick:{back:4,core:2}},
    {type:'股四头肌',groups:['quads','calves','core'],pick:{quads:3,calves:1,core:1}},
    {type:'臀腿综合',groups:['hamglutes','glutemed','core'],pick:{hamglutes:3,glutemed:1,core:1}},
    {type:'美背+核心收腰',groups:['back','core'],pick:{back:3,core:2}},
    {type:'臀大肌泵感日',groups:['hamglutes','core'],pick:{hamglutes:4,core:1}},
    {type:'轻量有氧+拉伸',groups:['cardio','stretch'],pick:{cardio:3,stretch:2}},
  ],
};

// ══ Combined Splits (两者结合: 臀腿为主 + 上肢维持) ════════
const COMBINED_SPLITS={
2:[
{type:'上肢维持（推+拉）',groups:['chest','back','shoulder','core'],pick:{chest:1,back:2,shoulder:1,core:1}},
{type:'臀腿综合（髋铰链+深蹲）',groups:['hamglutes','quads','calves','core'],pick:{hamglutes:3,quads:2,calves:1,core:1}},
],
3:[
{type:'上肢维持（推+拉）',groups:['chest','back','shoulder','core'],pick:{chest:1,back:2,shoulder:1,core:1}},
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves','core'],pick:{quads:3,hamglutes:1,calves:1,core:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','quads','core'],pick:{hamglutes:4,quads:1,core:1}},
],
4:[
{type:'上肢维持（推+拉）',groups:['chest','back','shoulder','core'],pick:{chest:1,back:2,shoulder:1,core:1}},
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves','core'],pick:{quads:3,hamglutes:1,calves:1,core:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','quads','core'],pick:{hamglutes:4,quads:1,core:1}},
{type:'臀腿综合日',groups:['hamglutes','quads','calves','core'],pick:{hamglutes:2,quads:2,calves:1,core:1}},
],
5:[
{type:'上肢维持·推（胸+肩+三头）',groups:['chest','shoulder','triceps','core'],pick:{chest:2,shoulder:1,triceps:1,core:1}},
{type:'上肢维持·拉（背+二头）',groups:['back','biceps','core'],pick:{back:2,biceps:1,core:1}},
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves'],pick:{quads:3,hamglutes:1,calves:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','quads','core'],pick:{hamglutes:4,quads:1,core:1}},
{type:'臀腿综合日',groups:['hamglutes','quads','calves','core'],pick:{hamglutes:2,quads:2,calves:1,core:1}},
],
6:[
{type:'上肢维持·推（胸+肩+三头）',groups:['chest','shoulder','triceps','core'],pick:{chest:2,shoulder:1,triceps:1,core:1}},
{type:'上肢维持·拉（背+二头）',groups:['back','biceps','core'],pick:{back:2,biceps:1,core:1}},
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves'],pick:{quads:4,hamglutes:1,calves:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','core'],pick:{hamglutes:5,core:1}},
{type:'臀腿综合日',groups:['hamglutes','quads','calves','core'],pick:{hamglutes:2,quads:2,calves:1,core:1}},
{type:'臀中肌+小腿强化',groups:['hamglutes','calves','core'],pick:{hamglutes:3,calves:2,core:1}},
],
7:[
{type:'上肢维持·推（胸+肩+三头）',groups:['chest','shoulder','triceps','core'],pick:{chest:2,shoulder:1,triceps:1,core:1}},
{type:'上肢维持·拉（背+二头）',groups:['back','biceps','core'],pick:{back:2,biceps:1,core:1}},
{type:'股四头肌日（深蹲为主）',groups:['quads','hamglutes','calves'],pick:{quads:4,hamglutes:1,calves:1}},
{type:'臀+腘绳肌日（髋铰链为主）',groups:['hamglutes','core'],pick:{hamglutes:5,core:1}},
{type:'臀腿综合日',groups:['hamglutes','quads','calves','core'],pick:{hamglutes:2,quads:2,calves:1,core:1}},
{type:'臀中肌+小腿强化',groups:['hamglutes','calves','core'],pick:{hamglutes:3,calves:2,core:1}},
{type:'轻量有氧+拉伸',groups:['cardio','core'],pick:{cardio:3,core:2}},
],
};

// focusMap: 用户选择的重点→对应肌群组，上肢包括背部
const FOCUS_MAP={'均衡全身':['chest','shoulder','back','biceps','triceps','quads','hamglutes','calves','core','cardio'],'上肢':['chest','shoulder','back','biceps','triceps'],'下肢':['quads','hamglutes','calves'],'核心':['core'],'有氧':['cardio'],'游泳':['swimming','core','back']};

const SCHEMES={
'女性薄肌':{
  sets:{初级:3,中级:4,高级:4},reps:{初级:15,中级:15,高级:20},
  rest:'45-60秒',cardioMin:15,timePerSet:105,
  intensityNote:{初级:'轻重量高次数，感受发力',中级:'控制离心，避免肌肉过度代偿',高级:'全程紧绷，不追求极限重量'},
  weightGuide:{初级:'约为最大力量的40-50%',中级:'约为最大力量的50-60%',高级:'约为最大力量的55-65%'}
},
'臀腿塑形':{
  sets:{初级:3,中级:4,高级:4},reps:{初级:12,中级:10,高级:8},
  rest:'60-90秒',cardioMin:10,timePerSet:120,
  intensityNote:{初级:'注重动作规范，激活臀肌',中级:'增加负重，强调向心爆发与离心控制',高级:'向力竭挑战，强化臀腿泵感'},
  weightGuide:{初级:'约为最大力量的50-60%',中级:'约为最大力量的65-75%',高级:'约为最大力量的75-85%'}
},
'女性薄肌+臀腿塑形':{
  sets:{初级:3,中级:4,高级:4},reps:{初级:12,中级:10,高级:8},
  rest:'60-90秒',cardioMin:10,timePerSet:115,
  intensityNote:{初级:'下肢渐进超负荷，上肢轻量维持',中级:'下肢向心爆发+离心控制，上肢控制性训练',高级:'下肢向力竭挑战，上肢维持不增量'},
  weightGuide:{初级:'下肢50-60% · 上肢40-50%',中级:'下肢65-75% · 上肢50-60%',高级:'下肢75-85% · 上肢55-65%'}
},
'倒三角矫正':{
  sets:{初级:3,中级:4,高级:4}, reps:{初级:15,中级:12,高级:10},
  rest:'60-90秒', cardioMin:10, timePerSet:120,
  intensityNote:{
    初级:'先学会激活臀中肌，外展类动作做到酸胀',
    中级:'外展类加阻力但保持15-20次，臀推强调顶端2秒挤压',
    高级:'外展向力竭，臀推冲个人纪录，臀中肌每次都练'
  },
  weightGuide:{
    初级:'臀推约max的60-70%；外展类用能完成15-20次的阻力',
    中级:'臀推约max的75-85%；外展类15-20次仍吃力的阻力',
    高级:'臀推约max的85-95%；外展类力竭区间'
  }
},
'翘臀美背':{
  sets:{初级:3,中级:4,高级:4}, reps:{初级:12,中级:12,高级:10},
  rest:'60-90秒', cardioMin:10, timePerSet:110,
  intensityNote:{
    初级:'臀推顶端挤压，背部动作专注肩胛后收下沉',
    中级:'臀推加重强调臀峰，划船/下拉控制离心',
    高级:'臀推突破，美背日加量，核心真空吸收紧腰腹'
  },
  weightGuide:{
    初级:'臀推约max的60-70%，背部约50-60%',
    中级:'臀推约max的75-85%，背部约60-70%',
    高级:'臀推约max的85-95%，背部约70-80%'
  }
}
};
const TIPS={
'女性薄肌':'组间休息45-60秒保持心率。训练后必做拉伸避免肌肉结块。重点强化臀腿和核心线条。',
'臀腿塑形':'全部精力放在下半身，把视觉重心拉下来。臀推是最优先的动作，直接针对臀大肌。臀中肌侧向训练是改善腰胯比的关键，别跳过。重量选最后两次比较吃力的程度，每周尽量加一点点。蛋白质每公斤体重每天1.6-2克，热量吃够才能长肌肉。',
'女性薄肌+臀腿塑形':'以臀腿为主战场，上肢仅做维持性训练。下半身每周2-3次，髋铰链和深蹲交替。上肢每周1-2次轻量推拉即可，不追求上肢增量。蛋白质每公斤体重每天1.6-2克，热量吃够才能长肌肉。',
'倒三角矫正':'臀中肌外展是改善倒三角的关键，每次训练都做，不能跳。上肢宽度类（背阔、侧肩、斜方）只维持不主动练。核心只做真空吸、死虫、平板，避免负重转体/侧屈增厚腰侧。骨架肩宽改不了，把训练量全压到臀腿，视觉重心拉下来。蛋白每公斤1.6-2g，热量盈余200-300kcal才长得出肌肉。',
'翘臀美背':'臀推是提臀峰第一动作，顶端挤压1-2秒。你可以也应该练背，背阔分离感和肩胛下沉能让背显挺、视觉收腰。斜方"厚"多半是圆肩体态：停掉直立划船和耸肩，多做面拉、YTW、靠墙天使，把肩膀沉下去。收腰靠真空吸和卷腹收紧腹横肌，不是减脂。'
};
const SWIM_TIPS={
'入门':'蛙泳腿口诀：收翻蹬夹。每次蹬腿后享受2-3秒滑行，不要急着做下一个动作。扶池边是你最好的练习伙伴。',
'进阶':'好的蛙泳70%时间在滑行。关注节奏而非速度，累了就加长滑行而不是加快频率。',
'挑战':'自由泳呼吸的秘诀：不是转头，而是转动整个身体。先用蛙泳热身，再切换到自由泳练习。'
};
const DN=['周一','周二','周三','周四','周五','周六','周日'];

// ══ Swim Milestones ════════════════════════════════════════
const SWIM_MILESTONES=[
{count:1,icon:'',title:'初次下水',desc:'完成第一次游泳训练！'},
{count:3,icon:'',title:'水性初具',desc:'已完成 3 次游泳训练'},
{count:5,icon:'',title:'小鱼儿',desc:'已完成 5 次游泳训练'},
{count:10,icon:'',title:'水中小达人',desc:'已完成 10 次游泳训练！'},
{count:20,icon:'',title:'泳池常客',desc:'已完成 20 次游泳训练'},
{count:30,icon:'',title:'乘风破浪',desc:'已完成 30 次游泳训练！'},
{count:50,icon:'',title:'美人鱼',desc:'已完成 50 次游泳训练！！'},
];
SWIM_LOG=lg('fit_swim')||{count:0,milestones:[]};
function checkSwimMilestone(){
SWIM_LOG.count=(SWIM_LOG.count||0)+1;
const m=SWIM_MILESTONES.find(ms=>ms.count===SWIM_LOG.count);
if(m){
SWIM_LOG.milestones.push({...m,date:todayStr()});
setTimeout(()=>showToast(`游泳成就解锁：${m.title}！`),500);
}
ls('fit_swim',SWIM_LOG);
}

const GYM_MILESTONES=[
{count:1,icon:'',title:'力量萌新',desc:'完成第一次力量训练！'},
{count:3,icon:'',title:'渐入佳境',desc:'已完成 3 次力量训练'},
{count:5,icon:'',title:'习惯养成',desc:'已完成 5 次力量训练'},
{count:10,icon:'',title:'铁骨铜筋',desc:'已完成 10 次力量训练！'},
{count:20,icon:'',title:'训练狂人',desc:'已完成 20 次力量训练'},
{count:30,icon:'',title:'钢铁之魂',desc:'已完成 30 次力量训练！'},
{count:50,icon:'',title:'终极雕刻家',desc:'已完成 50 次力量训练！！'},
];
GYM_LOG=lg('fit_gym_ach')||{count:0,milestones:[]};
function checkGymMilestone(){
GYM_LOG.count=(GYM_LOG.count||0)+1;
const m=GYM_MILESTONES.find(ms=>ms.count===GYM_LOG.count);
if(m){
GYM_LOG.milestones.push({...m,date:todayStr()});
setTimeout(()=>showToast(`力量成就解锁：${m.title}！`),500);
}
ls('fit_gym_ach',GYM_LOG);
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
    const gymLogs = LOG.filter(l => !l.isSwimDay);
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
function calcTotalExercises(){
const sch=SCHEMES[S.goal]||SCHEMES['女性薄肌'];
const warmup=5,cooldown=10;
const available=S.dur-warmup-cooldown;
const exTime=sch.timePerSet*(sch.sets[S.level]||3)/60; // minutes per exercise
let baseTarget = Math.max(2,Math.min(10,Math.floor(available/exTime)));
if (S.volumeMultiplier) baseTarget = Math.round(baseTarget * S.volumeMultiplier);
return Math.max(1, baseTarget);
}

function pickExercises(split,excluded){
const result=[],used=new Set();
const sch=SCHEMES[S.goal]||SCHEMES['女性薄肌'];
const sets=sch.sets[S.level],reps=sch.reps[S.level];
const focusMap=FOCUS_MAP;
const totalTarget=calcTotalExercises();
// Budget: distribute exercises across groups proportionally, focus groups get +1
const favGroups=S.focus.length?S.focus.flatMap(f=>focusMap[f]||[]):[];
const groupBudget={};
const baseTotal=Object.values(split.pick).reduce((a,b)=>a+b,0);

// Add smart warmups based on split groups
const upperGroups = ['chest','back','shoulder','biceps','triceps'];
const lowerGroups = ['quads','hamglutes','glutemed','calves'];
const hasUpper = split.groups.some(g=>upperGroups.includes(g));
const hasLower = split.groups.some(g=>lowerGroups.includes(g));
const hasCore = split.groups.includes('core');

const wPool=(DB.warmup||[]).filter(ex=>!used.has(ex.n));
const wGlobal = wPool.filter(e=>e.muscle.includes('全身'));
const wSpecific = wPool.filter(e=>{
    if(hasUpper && e.muscle.includes('上肢')) return true;
    if(hasLower && e.muscle.includes('下肢')) return true;
    if(hasCore && e.muscle.includes('核心')) return true;
    return false;
});
[...(wGlobal.slice(0,2)), ...(wSpecific.slice(0,2))].forEach(ex=>{
    if(used.has(ex.n))return; used.add(ex.n);
    result.push({name:ex.n,sets:1,reps:ex.warmupSec||45,unit:'秒',note:ex.note,group:'warmup',diff:ex.diff,isWarmup:true,bi:!!ex.bi,muscle:ex.muscle});
});

split.groups.forEach(g=>{
let cnt=split.pick[g]||1;
// Scale by duration ratio
cnt=Math.round(cnt*(totalTarget/baseTotal));
cnt=Math.max(1,cnt);
// Focus groups get one extra exercise
if(favGroups.includes(g))cnt=Math.min(cnt+1,cnt+1);
groupBudget[g]=cnt;
});

split.groups.forEach(grp=>{
const count=groupBudget[grp]||0;
if(!count)return;
let pool=(DB[grp]||[]).filter(ex=>ex.eq.some(e=>S.equip.includes(e))&&!used.has(ex.n)&&!excluded.has(ex.n));
if(S.periodMode){
  const skipKeywords = ['深蹲', '硬拉', '臀推', '悬挂', '腹轮', '倒蹬', '哈克', '波比', '转体', '卷腹', '抬腿', '伐木'];
  const filtered = pool.filter(ex => !skipKeywords.some(k => ex.n.includes(k)));
  if(filtered.length > 0) pool = filtered;
}
// 臀腿塑形 & 倒三角矫正: core = 收紧不增厚, 排除增厚腰侧的动作
if((hasGoal('臀腿塑形') || hasGoal('倒三角矫正')) && grp==='core'){
  const waistThicken = ['俄罗斯转体', '负重俄罗斯转体', '绳索伐木', '腹轮'];
  const thinCore = pool.filter(ex => !waistThicken.some(k => ex.n.includes(k)));
  if(thinCore.length > 0) pool = thinCore;
}
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
const coaching = (S.periodMode ? '经期温和模式 | ' : '') + `${ex.note} — ${sch.intensityNote[S.level]}（${sch.weightGuide[S.level]}）`;
result.push({name:ex.n,sets:exSets,reps:exReps,unit:isCardio?'分钟':(isTime?'秒':'次'),note:coaching,group:grp,diff:ex.diff,bi:!!ex.bi,muscle:ex.muscle});
});
});

// Always append cardio finisher if not a pure cardio day
if(!split.groups.includes('cardio') && S.dur >= 45) {
    let cPool = DB.cardio.filter(ex=>ex.eq.some(e=>S.equip.includes(e)));
    if(S.periodMode){
        cPool = cPool.filter(ex => !ex.n.includes('跳') && !ex.n.includes('波比') && !ex.n.includes('攀爬') && !ex.n.includes('单车'));
    }
    if(hasGoal('臀腿塑形') || hasGoal('倒三角矫正') || hasGoal('翘臀美背')){
        const legCardio = cPool.filter(ex => ex.n.includes('攀爬') || ex.n.includes('骑行') || ex.n.includes('单车') || ex.n.includes('椭圆'));
        cPool = legCardio.length ? legCardio : cPool.filter(ex => !ex.n.includes('上肢功率'));
    }
    if(cPool.length) {
        const cEx = cPool[Math.floor(Math.random()*cPool.length)];
        const cardioNote = (hasGoal('臀腿塑形') || hasGoal('倒三角矫正') || hasGoal('翘臀美背')) ? '臀腿有氧收尾 — 优先攀爬机/骑行机，保持对下肢的刺激' : '薄肌有氧收尾 — 保持心率120-140，帮助肌肉拉长';
        result.push({name:cEx.n,sets:1,reps:15,unit:'分钟',note:cardioNote,group:'cardio',diff:cEx.diff,muscle:cEx.muscle});
    }
}

// Add smart stretches
const sPool=(DB.stretch||[]).filter(ex=>!used.has(ex.n));
const sGlobal = sPool.filter(e=>e.muscle.includes('全身'));
const sSpecific = sPool.filter(e=>{
    if(hasUpper && e.muscle.includes('上肢')) return true;
    if(hasLower && e.muscle.includes('下肢')) return true;
    if(hasCore && e.muscle.includes('核心')) return true;
    return false;
});
[...(sGlobal.slice(0,2)), ...(sSpecific.slice(0,3))].forEach(ex=>{
    if(used.has(ex.n))return; used.add(ex.n);
    result.push({name:ex.n,sets:1,reps:30,unit:'秒',note:ex.note,group:'stretch',diff:ex.diff,isStretch:true,bi:!!ex.bi,muscle:ex.muscle});
});

return result;
}

// ══ Calendar helpers (local timezone) ═══════════════════
function _pad(n){return String(n).padStart(2,'0')}
let _mockDate = sessionStorage.getItem('__dev_mock_date__') || null;
function todayStr(){const d=_mockDate?new Date(_mockDate):new Date();return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`}
function dateStr(d){return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`}
function addDays(base,n){const d=new Date(base+'T12:00:00');d.setDate(d.getDate()+n);return dateStr(d)}
function dayDiff(a,b){const da=new Date(a+'T12:00:00');const db=new Date(b+'T12:00:00');return Math.round((db-da)/(24*60*60*1000))}
function fmtDate(ds){const d=new Date(ds+'T12:00:00');return['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]+'·'+(d.getMonth()+1)+'/'+(d.getDate())}

// ══ Lock check ══════════════════════════════════════════
function isLocked(day){
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
function getWeight(date,ei){
if(!S.weights) S.weights={};
return S.weights[date+'-'+ei]||null;
}
function setWeight(date,ei,val){
if(!S.weights) S.weights={};
S.weights[date+'-'+ei]=val;
// PR check
if(val>0){
const sel=S.plan?.days?.find(d=>d.date===date);
if(sel&&sel.exercises[ei]){
const exName=sel.exercises[ei].name;
const hist=W_HIST[exName];
if(hist&&hist.length>0){
const maxPrev=Math.max(...hist.map(h=>h.weight));
if(val>maxPrev){
showToast(`${exName} 新纪录！${val}kg`);
PR_LIST.unshift({date,exercise:exName,weight:val,prev:maxPrev});
if(PR_LIST.length>50)PR_LIST=PR_LIST.slice(0,50);
ls(K.pr,PR_LIST);
}}}}
saveState();
}
function getLastWeight(exName, excludePeriod = false){
const hist=W_HIST[exName];
if(!hist||!hist.length)return null;
if(excludePeriod){
    for(let i=hist.length-1;i>=0;i--){
        if(!hist[i].period) return hist[i];
    }
}
return hist[hist.length-1];
}

// ══ Weight Rounding by Equipment Type ═══════════════════
function _isDumbbell(n){return n.includes('哑铃')||n.includes('壶铃')}
function _isBarbell(n){return n.includes('杠铃')||n.includes('硬拉')||n.includes('史密斯')}
function roundWeight(w, exName){
    if(_isBarbell(exName)) return Math.round(w/2.5)*2.5; // 杠铃: 2.5kg倍数
    return Math.round(w); // 哑铃/壶铃/器械/绳索: 整数kg
}
function getWeightStep(exName){
    if(_isBarbell(exName)) return 2.5;
    return 1;
}

// Default weight recommendation based on exercise type + difficulty level
function getDefaultWeight(exName){
const n=exName;

// ── Equipment detection (name + DB fallback) ──
const isBarbell=_isBarbell(n);
const _dbEx=(()=>{for(const exs of Object.values(DB)){const f=exs.find(e=>e.n===n);if(f)return f}return null})();
const isDumbbell=n.includes('哑铃')||n.includes('壶铃')||n.includes('高脚杯')||(_dbEx&&_dbEx.eq.some(e=>e==='哑铃'||e==='壶铃'));
const isCable=n.includes('绳索')||n.includes('缆绳');

// ── Movement category detection ──
// 下肢复合 (Squat/Deadlift/Leg Press/Hip Thrust)
const isLegCompound=n.includes('深蹲')||n.includes('硬拉')||n.includes('臀推')||n.includes('腿举')||n.includes('提踵');
// 上肢推 (Bench Press — 卧推类)
const isUpperPush=n.includes('卧推');
// 过头推 (Overhead Press — 推举/肩推, 比卧推轻)
const isOverhead=n.includes('推举')||n.includes('肩推');
// 上肢拉 (Row/Pulldown)
const isUpperPull=n.includes('划船')||n.includes('引体')||n.includes('下拉')||n.includes('直立划船');
// 小肌群孤立 (Curl/Extension/Lateral Raise)
const isIsolation=n.includes('弯举')||n.includes('臂屈伸')||n.includes('侧平举')||n.includes('前平举')||n.includes('飞鸟')||n.includes('夹胸');
// 其他腿部/臀部
const isLeg=isLegCompound||n.includes('腿')||n.includes('臀')||n.includes('股')||n.includes('弓步');

// ── 杠铃/史密斯: 按动作类型 × 等级 ──
if(isBarbell){
  // 基础值: 标准杠=20kg空杆, EZ杆/短杆=10kg
  const bases={
    legCompound: {初级:15,中级:25,高级:35},  // 深蹲/硬拉/臀推: 15kg起 (可用女子杆/固定杠铃)
    upperPush:   {初级:12.5,中级:20,高级:30},  // 卧推: 12.5kg起 (可用轻量固定杠铃)
    overhead:    {初级:7.5,中级:12.5,高级:20},  // 推举/肩推: 7.5kg起 (可用曲柄杆/轻量固定杠铃)
    upperPull:   {初级:10,中级:15,高级:25},  // 划船/直立划船: 10kg起
    isolation:   {初级:5,中级:10,高级:15},  // 弯举: EZ杆/轻固定杆5kg起
    other:       {初级:10,中级:15,高级:25}   // 兜底
  };
  let cat='other';
  if(isLegCompound)cat='legCompound';
  else if(isUpperPush)cat='upperPush';
  else if(isOverhead)cat='overhead';
  else if(isUpperPull)cat='upperPull';
  else if(isIsolation)cat='isolation';
  return roundWeight(bases[cat][S.level]||bases[cat]['初级'], n);
}

// ── 哑铃/壶铃: 整数kg, 按肌群大小微调 ──
if(isDumbbell){
  const dbases={初级:2,中级:5,高级:8};
  let w=dbases[S.level]||2;
  if(isLeg)w=Math.round(w*1.5);
  else if(isIsolation)w=Math.max(1,Math.round(w*0.6));
  return roundWeight(w, n);
}

// ── 绳索: 整数kg ──
if(isCable){
  const cbases={初级:5,中级:10,高级:15};
  let w=cbases[S.level]||5;
  if(isLeg)w=Math.round(w*1.5);
  else if(isIsolation)w=Math.max(2,Math.round(w*0.7));
  return roundWeight(w, n);
}

// ── 器械 (坐姿推胸机/腿屈伸/etc): 整数kg ──
const mbases={初级:5,中级:10,高级:15};
let w=mbases[S.level]||5;
if(isLeg)w=Math.round(w*1.5);
else if(isIsolation)w=Math.max(2,Math.round(w*0.7));
return roundWeight(w, n);
}

function suggestWeight(exName){
let target;
const last=getLastWeight(exName, true); // Get last non-period weight
if(!last) {
  const fallbackLast = getLastWeight(exName, false);
  if (!fallbackLast) {
    target = getDefaultWeight(exName);
  } else {
    const w=fallbackLast.weight, rpe=fallbackLast.rpe||6;
    const step=getWeightStep(exName);
    if(rpe<=4) target = roundWeight(w+step*2, exName);
    else if(rpe<=6) target = roundWeight(w+step, exName);
    else if(rpe<=8) target = w;
    else target = Math.max(step, roundWeight(w-step, exName));
  }
} else {
  const w=last.weight, rpe=last.rpe||6;
  const step=getWeightStep(exName);
  // RPE-based progression
  if(rpe<=4) target = roundWeight(w+step*2, exName); // Too easy → +2 steps
  else if(rpe<=6) target = roundWeight(w+step, exName);   // Moderate → +1 step
  else if(rpe<=8) target = w;                              // Good → same weight
  else target = Math.max(step, roundWeight(w-step, exName)); // Hard/max → -1 step
}
if(S.periodMode){
  const step=getWeightStep(exName);
  target = Math.max(step, roundWeight(target * 0.75, exName));
}
return target;
}
// ══ Swimming Plan Generator ═════════════════════════════
function pickSwimExercises(){
const level=S.swimLevel||'入门';
const excluded=getExcluded();
const maxDiff=level==='入门'?1:level==='进阶'?2:3;
const pool=(DB.swimming||[]).filter(ex=>ex.diff<=maxDiff&&!excluded.has(ex.n));
const result=[];
// Phase order: warmup → tech → main → cooldown
const phases=['warmup','tech','main','cooldown'];
const phaseTimes={warmup:5,tech:level==='入门'?25:level==='进阶'?20:20,main:level==='入门'?15:level==='进阶'?20:20,cooldown:5};
phases.forEach(phase=>{
const pExs=pool.filter(ex=>ex.swimPhase===phase);
// Shuffle within phase for variety
for(let i=pExs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pExs[i],pExs[j]]=[pExs[j],pExs[i]]}
// Pick exercises: warmup/cooldown = 1, tech = up to 3-4, main = up to 2
const pick=phase==='warmup'?1:phase==='cooldown'?1:phase==='tech'?Math.min(pExs.length,level==='入门'?4:3):Math.min(pExs.length,2);
const totalTime=phaseTimes[phase];
pExs.slice(0,pick).forEach((ex,i)=>{
const mins=Math.max(3,Math.round(totalTime/pick));
result.push({name:ex.n,sets:1,reps:mins,unit:'分钟',note:ex.note,group:'swimming',diff:ex.diff,isWarmup:phase==='warmup',isStretch:phase==='cooldown',bi:false,swimPhase:phase});
});
});
return result;
}

// ══ Plan Generator (calendar) ═══════════════════════════

// Scientific ratio: strength-primary + swim cross-training
// (strength is always >= swim, because user's goal is 女性薄肌)
const SWIM_SPLIT={
2:{gym:1,swim:1},
3:{gym:2,swim:1},
4:{gym:3,swim:1},
5:{gym:3,swim:2},
6:{gym:4,swim:2},
7:{gym:4,swim:3},
};

// Weekly patterns: G=gym, S=swim, R=rest
// Principles: alternate gym/swim when possible, avoid swim right after upper body day
const COMBO_PATTERNS={
'1+1':['G','R','R','S','R','R','R'],
'2+1':['G','R','S','R','G','R','R'],
'3+1':['G','S','R','G','R','G','R'],
'2+2':['G','S','R','G','S','R','R'],
'3+2':['G','S','G','R','G','S','R'],
'4+2':['G','G','S','G','G','S','R'],
'4+3':['G','S','G','S','G','S','G'],
};

// ── Period mode: gentle land-based alternative to swim ──
function pickPeriodAlternative(){
  const excluded = getExcluded();
  const corePool = (DB.core||[]).filter(ex => ex.diff <= 1 && !excluded.has(ex.n) && !ex.n.includes('转体') && !ex.n.includes('卷腹') && !ex.n.includes('抬腿') && !ex.n.includes('伐木'));
  const cardioPool = (DB.cardio||[]).filter(ex => ex.diff <= 1 && !excluded.has(ex.n) && !ex.n.includes('跳') && !ex.n.includes('波比'));
  const exercises = [];
  // 1. Warm-up: light cardio 10min
  const warmup = cardioPool.find(ex => ex.n.includes('椭圆') || ex.n.includes('骑行') || ex.n.includes('慢跑')) || cardioPool[0];
  if (warmup) exercises.push({name:warmup.n,sets:1,reps:10,unit:'分钟',note:warmup.note+' — 保持轻松心率',group:'cardio',diff:1,isWarmup:true,bi:false});
  // 2. Core: 2-3 gentle core exercises
  for(let i=corePool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[corePool[i],corePool[j]]=[corePool[j],corePool[i]];}
  corePool.slice(0, 3).forEach(ex => {
    exercises.push({name:ex.n,sets:3,reps:ex.u==='秒'?30:12,unit:ex.u||'次',note:ex.note,group:'core',diff:1,isWarmup:false,bi:ex.bi||false});
  });
  // 3. Cool-down stretch 5min
  exercises.push({name:'全身拉伸放松',sets:1,reps:5,unit:'分钟',note:'针对下背、髋屈肌和腿后侧进行缓慢拉伸',group:'cardio',diff:1,isStretch:true,bi:false});
  return exercises;
}

function genPlan(isRecalibrate = false){
_skipAutoRegen=false; // Reset so future auto-regen can trigger
const hasPool=S.equip.includes('泳池');
const excluded=getExcluded();
const today=todayStr();

// Determine gym vs swim day counts
let gymPerWeek=S.days, swimPerWeek=0;
if(hasPool){
const sp=SWIM_SPLIT[S.days]||{gym:Math.max(2,S.days-1),swim:1};
gymPerWeek=sp.gym; swimPerWeek=sp.swim;
}

// Select the correct split template based on GYM days (not total)
// 臀腿塑形 uses dedicated lower-body-only splits
const splits = hasGoal('倒三角矫正')?(ATHLETIC_SPLITS[gymPerWeek]||ATHLETIC_SPLITS[3]):
               hasGoal('翘臀美背')?(GLUTE_BACK_SPLITS[gymPerWeek]||GLUTE_BACK_SPLITS[3]):
               isCombinedGoal()?(COMBINED_SPLITS[gymPerWeek]||COMBINED_SPLITS[3]):
               (hasGoal('臀腿塑形')?(GLUTE_SPLITS[gymPerWeek]||GLUTE_SPLITS[3]):(SPLITS[gymPerWeek]||SPLITS[3]));

// Build weekly pattern
let pattern;
if(hasPool){
const key=gymPerWeek+'+'+swimPerWeek;
pattern=(COMBO_PATTERNS[key]||COMBO_PATTERNS['3+2']).map(c=>c==='G'?1:c==='S'?2:0);
}else{
const gymPatterns = {
2: [1,0,0,1,0,0,0],
3: [1,0,1,0,1,0,0],
4: [1,1,0,1,1,0,0],
5: [1,1,1,0,1,1,0],
6: [1,1,1,1,1,1,0],
7: [1,1,1,1,1,1,1]
};
pattern = gymPatterns[S.days] || gymPatterns[3];
}

// If recalibrating, keep the original start date to preserve the calendar view.
// Otherwise, start a fresh 14-day cycle from today.
const startDate = (isRecalibrate && S.plan && S.plan.days.length > 0) ? S.plan.days[0].date : today;

const days=[];

// Determine which days to preserve exactly as they were
const preserve = {};
if (S.plan) {
    for (let d of S.plan.days) {
        const hasProgress = (d.date === today && Object.values(S.prog[today] || {}).some(Boolean));
        if (!isRecalibrate) {
            if (isLocked(d)) preserve[d.date] = d;
        } else {
            if (d.date < today || hasProgress || isLocked(d)) preserve[d.date] = d;
        }
    }
}

// Determine start split index based on the last workout done or preserved
let startSplitIdx = 0;
let lastGymWorkoutType = null;

if (isRecalibrate && S.plan) {
    const sortedPreserved = Object.values(preserve).sort((a,b) => a.date.localeCompare(b.date));
    for (let j = sortedPreserved.length - 1; j >= 0; j--) {
        const d = sortedPreserved[j];
        if (!d.isRest && !d.isSwimDay && d.workoutType !== '轻量替代' && isDone(d)) {
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

for(let i=0;i<14;i++){
const ds=addDays(startDate,i);
if(preserve[ds]){
days.push(preserve[ds]);
continue;
}

const dObj = new Date(ds+'T12:00:00');
const dow = (dObj.getDay() + 6) % 7; // 0=Mon, 6=Sun
const dayType = pattern[dow]; // 0=rest, 1=gym, 2=swim

if(dayType===1){
// Gym day
const split=splits[(startSplitIdx + generatedGymCount) % splits.length];
generatedGymCount++;
days.push({date:ds,isRest:false,workoutType:split.type,duration:S.dur,exercises:pickExercises(split,excluded)});
}else if(dayType===2){
// Swim day (or period alternative)
if(S.periodMode){
days.push({date:ds,isRest:false,isSwimDay:false,workoutType:'轻量替代',duration:40,exercises:pickPeriodAlternative()});
}else{
days.push({date:ds,isRest:false,isSwimDay:true,workoutType:'游泳训练',duration:50,exercises:pickSwimExercises()});
}
}else{
days.push({date:ds,isRest:true,workoutType:'休息',duration:0,exercises:[]});
}
}

const sch=SCHEMES[S.goal]||SCHEMES['女性薄肌'];
const isSwimPlan=hasPool&&swimPerWeek>0;
let tipText=TIPS[S.goal]||TIPS['女性薄肌'];
if(isSwimPlan){
tipText+=`\n游泳水平：${SWIM_TIPS[S.swimLevel||'入门']}\n本周安排：${gymPerWeek}天力量 + ${swimPerWeek}天游泳`;
}
S.plan={days,tip:tipText,rest:sch.rest,excludedCount:excluded.size};
// Reset calendar view offset and select today
_calWeekOffset=0;
const todayDay=days.find(d=>d.date===today);
S.selDate=todayDay?today:(days.find(d=>!d.isRest)?.date||today);
saveState();
if (typeof applySettingsToUI === 'function') applySettingsToUI();
render();
showTab('today',document.querySelector('.tab'));
}

function assessPlanIntensity(){
    // Sort a copy of LOG by date descending to always evaluate the 3 most recent entries
    const sortedLogs = [...LOG].sort((a, b) => b.date.localeCompare(a.date));
    const gymLogs = sortedLogs.filter(l => !l.isSwimDay && l.workout !== '休息' && l.workout !== '游泳训练' && l.workout !== '轻量替代').slice(0, 3);
    if (!gymLogs.length) {
        return {
            status: '评估中',
            desc: '打卡 1 天后开始自动评估强度',
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
        totalExPlanned += (l.exercises ? l.exercises.length : (l.exerciseCount || 6));
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

function recalibratePlan() {
    if (!S.plan) return;
    genPlan(true);
    showToast('已保留历史记录，重排本周剩余天数');
}

function autoAlignPlan() {
    if (!S.plan || !S.plan.days || !S.plan.days.length) return;
    const today = todayStr();
    
    // Determine splits
    const hasPool = S.equip.includes('泳池');
    let gymPerWeek = S.days;
    if (hasPool) {
        const sp = SWIM_SPLIT[S.days] || {gym: Math.max(2, S.days - 1), swim: 1};
        gymPerWeek = sp.gym;
    }
    const splits = hasGoal('倒三角矫正')?(ATHLETIC_SPLITS[gymPerWeek]||ATHLETIC_SPLITS[3]):
                   hasGoal('翘臀美背')?(GLUTE_BACK_SPLITS[gymPerWeek]||GLUTE_BACK_SPLITS[3]):
                   isCombinedGoal()?(COMBINED_SPLITS[gymPerWeek]||COMBINED_SPLITS[3]):
                   (hasGoal('臀腿塑形')?(GLUTE_SPLITS[gymPerWeek]||GLUTE_SPLITS[3]):(SPLITS[gymPerWeek]||SPLITS[3]));
    
    // 1. Find last completed gym workout type
    let lastCompletedType = null;
    
    const pastDays = S.plan.days.filter(d => d.date < today);
    const sortedPast = pastDays.sort((a,b) => a.date.localeCompare(b.date));
    for (let j = sortedPast.length - 1; j >= 0; j--) {
        const d = sortedPast[j];
        if (!d.isRest && !d.isSwimDay && d.workoutType !== '轻量替代' && isDone(d)) {
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
    const firstFutureGymDay = S.plan.days.find(d => d.date >= today && !d.isRest && !d.isSwimDay && d.workoutType !== '轻量替代');
    
    if (firstFutureGymDay) {
        const scheduledType = firstFutureGymDay.workoutType;
        const match = (scheduledType === expectedType || scheduledType.includes(expectedType) || expectedType.includes(scheduledType.slice(0, 4)));
        if (!match) {
            console.log(`[Auto-Align] Missed workouts detected. Scheduled today: ${scheduledType}, Expected: ${expectedType}. Recalibrating...`);
            if (!window._isAutoAligning) {
                window._isAutoAligning = true;
                try {
                    genPlan(true);
                } finally {
                    window._isAutoAligning = false;
                }
            }
        }
    }
}

// ══ Render ══════════════════════════════════════════════
function isDone(day){
if(!day||!day.exercises.length)return false;
if(LOG.some(l => l.date === day.date))return true;
const p=S.prog[day.date]||{};
return day.exercises.every((_,i)=>p[i]);
}
function getAdj(date,ei,f,base){return S.adj[date+'-'+ei+'-'+f]??base}

let _dragSrc=null;
let _skipAutoRegen=false;

function renderOnboarding(){
    const mainEl = document.getElementById('main');
    if (!mainEl) return;
    
    // Ensure defensive defaults for all settings
    if (!S.goal) S.goal = '女性薄肌';
    if (!S.level) S.level = '初级';
    if (!S.days) S.days = 3;
    if (!S.equip || !Array.isArray(S.equip)) S.equip = ['健身房全套'];
    if (!S.swimLevel) S.swimLevel = '入门';
    
    const hasPool = S.equip.includes('泳池');
    
    let html = `
    <div class="onboard-wrap">
        <div class="onboard-hero">
            <svg class="onboard-logo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="40" stroke="var(--border)" stroke-width="1.5"/>
                <path d="M50 10V90" stroke="var(--border)" stroke-dasharray="2 2" stroke-width="1"/>
                <path d="M30 45C30 45 42 35 50 50C58 65 70 55 70 55" stroke="var(--terra)" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="50" cy="50" r="4" fill="var(--ink)"/>
            </svg>
            <h1 class="onboard-title">CICI FITNESS</h1>
            <p class="onboard-subtitle">慢节奏 · 静力量</p>
            <div style="width: 24px; height: 1px; background: var(--border); margin: 12px auto;"></div>
            <p style="font-size: 12px; color: var(--ink2); max-width: 340px; margin: 0 auto; line-height: 1.6;">
                为您定制轻量、科学的力量训练与游泳计划。在专注与平稳的呼吸中，感知肌肉的深度收缩。
            </p>
        </div>

        <div class="onboard-section-title">I. 选择训练重心 <span style="font-size:11px;color:var(--ink3);font-weight:400">（可多选）</span></div>
        <div class="onboard-goal-grid">
            <div class="onboard-goal-card ${hasGoal('女性薄肌') ? 'on' : ''}" onclick="selectOnboardGoal('女性薄肌')">
                <h3 class="onboard-goal-name">女性薄肌</h3>
                <p class="onboard-goal-desc">全身比例均衡，低负重高次数，激活深层肌群，改善身体形态与挺拔度。</p>
                <div class="onboard-goal-tags">
                    <span class="onboard-goal-tag">全身均衡</span>
                    <span class="onboard-goal-tag">低负重</span>
                    <span class="onboard-goal-tag">修长线条</span>
                </div>
            </div>
            <div class="onboard-goal-card ${hasGoal('臀腿塑形') ? 'on' : ''}" onclick="selectOnboardGoal('臀腿塑形')">
                <h3 class="onboard-goal-name">臀腿塑形</h3>
                <p class="onboard-goal-desc">全部精力放在下半身。臀中肌改善腰胯比，大腿前后侧让腿更饱满。</p>
                <div class="onboard-goal-tags">
                    <span class="onboard-goal-tag">纯下半身</span>
                    <span class="onboard-goal-tag">改善腰胯比</span>
                    <span class="onboard-goal-tag">渐进超负荷</span>
                </div>
            </div>
            <div class="onboard-goal-card ${hasGoal('倒三角矫正') ? 'on' : ''}" onclick="selectOnboardGoal('倒三角矫正')">
                <h3 class="onboard-goal-name">倒三角矫正</h3>
                <p class="onboard-goal-desc">专注拉低视觉重心。臀中肌外展必练，核心只做真空吸/死虫。下肢自动启用。</p>
                <div class="onboard-goal-tags">
                    <span class="onboard-goal-tag">纯下半身</span>
                    <span class="onboard-goal-tag">禁止上肢</span>
                    <span class="onboard-goal-tag">核心收腰</span>
                </div>
            </div>
            <div class="onboard-goal-card ${hasGoal('翘臀美背') ? 'on' : ''}" onclick="selectOnboardGoal('翘臀美背')">
                <h3 class="onboard-goal-name">翘臀美背</h3>
                <p class="onboard-goal-desc">强化臀峰与背阔。多做面拉/YTW改善圆肩，避免斜方肌与腰部增厚。</p>
                <div class="onboard-goal-tags">
                    <span class="onboard-goal-tag">臀峰强化</span>
                    <span class="onboard-goal-tag">背阔分离</span>
                    <span class="onboard-goal-tag">体态改善</span>
                </div>
            </div>
        </div>

        <div class="onboard-section-title">II. 个性化参数设定</div>
        <div class="onboard-form-grid">
            <div class="onboard-form-row">
                <label class="onboard-form-label">每周训练天数 <span class="val-hint" id="onboard-days-val">${S.days} 天</span></label>
                <div class="onboard-chips">
                    ${[2, 3, 4, 5, 6].map(d => `
                        <div class="onboard-chip ${S.days === d ? 'on' : ''}" onclick="setOnboardDays(${d})">${d} 天</div>
                    `).join('')}
                </div>
            </div>

            <div class="onboard-form-row">
                <label class="onboard-form-label">当前训练级别 <span class="val-hint" id="onboard-level-val">${S.level}</span></label>
                <div class="onboard-chips">
                    ${['初级', '中级', '高级'].map(l => `
                        <div class="onboard-chip ${S.level === l ? 'on' : ''}" onclick="setOnboardLevel('${l}')">${l}</div>
                    `).join('')}
                </div>
            </div>

            <div class="onboard-form-row">
                <label class="onboard-form-label">可支配训练设备 <span style="font-size: 11px; font-weight: normal; color: var(--ink3);">(多选)</span></label>
                <div class="onboard-chips">
                    ${['徒手', '哑铃', '弹力带', '健身房全套'].map(eq => `
                        <div class="onboard-chip ${S.equip.includes(eq) ? 'on' : ''}" onclick="toggleOnboardEquip('${eq}')">${eq === '健身房全套' ? '健身房器械' : eq}</div>
                    `).join('')}
                    <div class="onboard-chip swim-chip ${S.equip.includes('泳池') ? 'on' : ''}" onclick="toggleOnboardEquip('泳池')">游泳池</div>
                </div>
            </div>

            <div class="onboard-form-row" id="onboard-swim-level-row" style="display: ${hasPool ? 'flex' : 'none'}">
                <label class="onboard-form-label">游泳技术级别 <span class="val-hint" id="onboard-swim-level-val">${S.swimLevel || '入门'}</span></label>
                <div class="onboard-chips">
                    ${['入门', '进阶'].map(sl => `
                        <div class="onboard-chip ${S.swimLevel === sl ? 'on' : ''}" onclick="setOnboardSwimLevel('${sl}')">${sl === '入门' ? '入门' : '进阶'}</div>
                    `).join('')}
                </div>
            </div>
        </div>

        <button class="onboard-btn-generate" onclick="generateFirstPlan()">
            生成我的定制训练计划
        </button>
        <p style="text-align: center; margin-top: 16px; font-size: 11px; color: var(--ink3);">
            已拥有账号？ <a href="#" onclick="event.preventDefault(); if(typeof signInGoogle==='function')signInGoogle();" style="color: var(--terra); text-decoration: underline; font-weight: 500; cursor: pointer;">登录并恢复云端数据</a>
        </p>
    </div>
    `;
    mainEl.innerHTML = html;
}

globalThis.selectOnboardGoal = function(goal) {
    let goals = S.goal ? S.goal.split('+') : [];
    if(goals.includes(goal)){
        goals = goals.filter(g => g !== goal);
    } else {
        goals.push(goal);
    }
    if(goals.length === 0) goals.push('女性薄肌');
    S.goal = goals.join('+');

    if(hasGoal('倒三角矫正') || hasGoal('臀腿塑形') || hasGoal('翘臀美背')){
        S.focus = ['下肢'];
        if (!S.equip.includes('健身房全套')) S.equip.push('健身房全套');
    } else {
        S.focus = ['均衡全身'];
    }
    if (typeof saveState === 'function') saveState();
    if (typeof applySettingsToUI === 'function') applySettingsToUI();
    renderOnboarding();
};

globalThis.setOnboardDays = function(days) {
    S.days = days;
    if (typeof saveState === 'function') saveState();
    if (typeof applySettingsToUI === 'function') applySettingsToUI();
    renderOnboarding();
};

globalThis.setOnboardLevel = function(level) {
    S.level = level;
    if (typeof saveState === 'function') saveState();
    if (typeof applySettingsToUI === 'function') applySettingsToUI();
    renderOnboarding();
};

globalThis.toggleOnboardEquip = function(equip) {
    const idx = S.equip.indexOf(equip);
    if (idx !== -1) {
        if (S.equip.length > 1) S.equip.splice(idx, 1);
    } else {
        S.equip.push(equip);
    }
    if (typeof saveState === 'function') saveState();
    if (typeof applySettingsToUI === 'function') applySettingsToUI();
    renderOnboarding();
};

globalThis.setOnboardSwimLevel = function(swimLevel) {
    S.swimLevel = swimLevel;
    if (typeof saveState === 'function') saveState();
    if (typeof applySettingsToUI === 'function') applySettingsToUI();
    renderOnboarding();
};

globalThis.generateFirstPlan = function() {
    if (typeof saveState === 'function') saveState();
    if (typeof genPlan === 'function') genPlan(false);
    if (typeof render === 'function') render();
    showToast('专属定制计划已成功生成');
};

function render(){
if(!S.plan){
    renderOnboarding();
    return;
}
const{days:planDays,tip,rest,excludedCount}=S.plan;
const today=todayStr();
const workoutDays=planDays.filter(d=>!d.isRest);
const doneDays=workoutDays.filter(d=>isDone(d));

const planStart=planDays[0]?.date||today;
const planEnd=planDays[planDays.length-1]?.date||today;
// Auto-regenerate if plan has expired (today is past the last plan day)
if(today>planEnd && !_skipAutoRegen){
  _skipAutoRegen=true; // prevent infinite loop during this render cycle
  genPlan(false); // fresh plan from today (recalibrate would reuse old expired startDate)
  return;
}
const viewStart=addDays(planStart,_calWeekOffset*7);
const viewEnd=addDays(viewStart,13);
const visibleDays=[];
for(let i=0;i<14;i++){
  const ds=addDays(viewStart,i);
  const planDay=planDays.find(d=>d.date===ds);
  if(planDay){visibleDays.push({...planDay,_src:'plan'})}
  else{
    const logE=LOG.find(l=>l.date===ds);
    if(logE){visibleDays.push({date:ds,isRest:false,_src:'log',workoutType:logE.workout,duration:logE.duration,exercises:(logE.exercises||[]).map(e=>({name:e.name,sets:e.sets,reps:e.reps,unit:e.unit,weight:e.weight,note:''})),_logEntry:logE})}
    else{visibleDays.push({date:ds,isRest:true,_src:'empty',workoutType:'\u2014',exercises:[]})}
  }
}
let sel=visibleDays.find(d=>d.date===S.selDate);
if(!sel)sel=visibleDays.find(d=>d.date===today)||visibleDays.find(d=>!d.isRest)||visibleDays[0];
// Check if today is in the current view
const todayInView=visibleDays.some(d=>d.date===today);
const isCurrentView=todayInView;

let h=`<div class="plan-header"><p class="panel-title" style="margin:0">\u8bad\u7ec3\u8ba1\u5212${excludedCount?`<span class="warn-tag">\u5df2\u8fc7\u6ee4${excludedCount}\u4e2a\u53d7\u9650\u52a8\u4f5c</span>`:''}</p><button class="regen-btn" onclick="genPlan()">\u91cd\u65b0\u751f\u6210</button></div>
<div class="stats">
<div class="stat"><div class="stat-val">${workoutDays.length}</div><div class="stat-lbl">\u8ba1\u5212\u5929</div></div>
<div class="stat"><div class="stat-val">${doneDays.length}/${workoutDays.length}</div><div class="stat-lbl">\u5df2\u5b8c\u6210</div></div>
<div class="stat"><div class="stat-val">${workoutDays.reduce((s,d)=>s+d.exercises.length,0)}</div><div class="stat-lbl">\u603b\u52a8\u4f5c</div></div>
</div>`;

const intensityInfo = assessPlanIntensity();
h += `<div class="intensity-card ${intensityInfo.cls}">
  <span class="intensity-title">${intensityInfo.icon} ${intensityInfo.status}</span>
  <span class="intensity-desc">${intensityInfo.desc}</span>
</div>`;

const vsFmt=viewStart.slice(5).replace('-','/');
const veFmt=viewEnd.slice(5).replace('-','/');
h+=`<div class="cal-nav">
<button class="cal-nav-btn" onclick="calPrev()"><i class="ti ti-chevron-left" style="font-size:12px"></i> \u4e0a\u4e24\u5468</button>
${!isCurrentView?`<button class="cal-nav-btn today-btn" onclick="calGoToday()">\u56de\u5230\u4eca\u5929</button>`:''}
<span class="cal-nav-label">${vsFmt} \u2014 ${veFmt}</span>
<button class="cal-nav-btn" onclick="calNext()" ${isCurrentView?'disabled':''}> \u4e0b\u4e24\u5468 <i class="ti ti-chevron-right" style="font-size:12px"></i></button>
</div>`;

h+=`<div class="cal-scroll"><div class="daygrid" id="cal-grid">`;
visibleDays.forEach(d=>{
const isPlan=d._src==='plan',isLog=d._src==='log',isNone=d._src==='empty';
const locked=isPlan&&isLocked(d);
const done=isPlan?isDone(d):isLog;
const isSel=d.date===(sel?.date);
const isToday=d.date===today;
let cls='dc';
if(isNone)cls+=' no-data';
else if(isLog&&!isPlan)cls+=' historical';
else if(d.isRest&&isPlan)cls+=' rest';
else if(done&&isPlan)cls+=' done';
if(isToday)cls+=' today';
if(locked&&!d.isRest)cls+=' locked';
if(d.isSwimDay)cls+=' swim-day';
if(isSel&&!isNone&&!(d.isRest&&isPlan))cls+=' sel';
const drag=(isPlan&&!d.isRest&&!locked)?`draggable="true" ondragstart="dragStart(event,'${d.date}')" ondragover="dragOver(event)" ondrop="dragDrop(event,'${d.date}')" ondragend="dragEnd()"`:
(isPlan&&!d.isRest&&locked?`ondragover="dragOver(event)" ondrop="dragDrop(event,'${d.date}')"`:'' );
const click=isNone?'':`onclick="selectDate('${d.date}')"`;
h+=`<div class="${cls}" ${drag} ${click}>
<div class="dn">${fmtDate(d.date)}</div>
<div class="dt">${d.isRest?(isPlan?'\u4f11\u606f':'\u2014'):d.workoutType}</div>
${done&&isPlan?'<i class="ti ti-check" style="font-size:10px;color:#3e7d52"></i>':''}
${isLog&&!isPlan?'<i class="ti ti-check" style="font-size:10px;color:var(--blue)"></i>':''}
${locked&&!d.isRest?'<i class="ti ti-lock" style="font-size:9px;color:var(--ink3)"></i>':''}
</div>`;
});
h+=`</div></div>`;

if(sel&&!sel.isRest){
  const lg = LOG.find(l => l.date === sel.date);
  if(sel._src==='log'&&!planDays.find(dd=>dd.date===sel.date)){
    const lg=sel._logEntry;
    h+=`<div class="wh"><span class="wh-title">${fmtDate(sel.date)} \u00b7 ${sel.workoutType}</span><span class="badge">${sel.duration||'?'}\u5206\u949f</span><span class="warn-tag" style="background:var(--blue-bg);color:var(--blue);border-color:rgba(75,107,138,.25)">\u5386\u53f2\u8bb0\u5f55</span></div>`;
    if(lg&&lg.exercises&&lg.exercises.length){
      h+=`<div class="hist-detail-meta">`;
      if(lg.rpe)h+=`<span class="hist-detail-chip rpe">RPE ${lg.rpe}/10</span>`;
      if(lg.mood)h+=`<span class="hist-detail-chip mood">${lg.mood}</span>`;
      h+=`<span class="hist-detail-chip dur">${lg.exerciseCount||lg.exercises.length}\u4e2a\u52a8\u4f5c</span></div>`;
      h+=`<div class="hist-detail-exercises">`;
      lg.exercises.forEach(ex=>{
        const isExDone = ex.done !== false;
        h+=`<div class="hist-ex-row${!isExDone?' hist-ex-undone':''}"><span class="hist-ex-name" onclick="showExDetail('${ex.name}')" style="cursor:pointer; ${!isExDone?'text-decoration:line-through;opacity:.6':''}">${ex.name} <i class="ti ti-info-circle" style="font-size:11px;opacity:.4"></i></span><span class="hist-ex-detail"><span>${ex.sets||'?'}\u00d7${ex.reps||'?'}${ex.unit||'\u6b21'}</span>${ex.weight?`<span class="hist-ex-weight">${ex.weight}kg</span>`:''}</span></div>`;
      });
      h+=`</div>`;
    }else{h+=`<div class="hist-empty">\u8be5\u65e5\u8bad\u7ec3\u8be6\u60c5\u4e0d\u53ef\u7528</div>`}
    if(lg&&lg.note)h+=`<div class="hist-note">"${lg.note}"</div>`;
  }else{
    const locked=isLocked(sel);
    const _isSwimDay=!!sel.isSwimDay;
    
    if(locked && lg) {
      h+=`<div class="wh">
<span class="wh-title">${fmtDate(sel.date)} \u00b7 ${lg.workout}</span>
<span class="badge">${lg.duration || sel.duration}\u5206\u949f</span>
${lg.isSwimDay?`<span class="badge" style="background:rgba(59,130,246,.12);color:#3b82f6">${S.swimLevel||'\u5165\u95e8'}</span>`:''}
<span class="warn-tag" style="background:rgba(76,175,80,.12);color:#4caf50;border-color:rgba(76,175,80,.25)">\u5df2\u6253\u5365</span>
<span class="warn-tag">\u5df2\u9501\u5b9a</span>
<button class="regen-btn" style="margin-left:8px;font-size:10px;padding:2px 8px" onclick="unlockDate('${sel.date}')">解除锁定</button>
<button class="regen-btn" style="margin-left:6px;font-size:10px;padding:2px 8px;background:var(--sage-bg);color:var(--sage);border-color:var(--sage-br)" onclick="shareWorkout('${sel.date}')">分享卡片</button>
</div>`;

      h+=`<div class="hist-detail-meta" style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">`;
      if(lg.rpe)h+=`<span class="hist-detail-chip rpe" style="background:rgba(224,117,94,.12);color:var(--terra);padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600">RPE ${lg.rpe}/10</span>`;
      if(lg.mood)h+=`<span class="hist-detail-chip mood" style="background:var(--surface2);padding:4px 10px;border-radius:20px;font-size:11px">${lg.mood}</span>`;
      h+=`<span class="hist-detail-chip dur" style="background:var(--surface2);padding:4px 10px;border-radius:20px;font-size:11px">${lg.exerciseCount||(lg.exercises||[]).length}\u4e2a\u52a8\u4f5c</span></div>`;

      if(lg.exercises&&lg.exercises.length){
        h+=`<div class="exlist">`;
        lg.exercises.forEach(ex=>{
          const done=ex.done!==false;
          h+=`<div class="exrow${done?' done-ex':''}">
<div style="flex:1;min-width:0">
<div class="exname" onclick="showExDetail('${ex.name}')" style="cursor:pointer; ${!done?'text-decoration:line-through;opacity:.6':''}">${ex.name} <i class="ti ti-info-circle" style="font-size:11px;opacity:.4;vertical-align:middle"></i></div>
${ex.weight?`<div class="wt-hint" style="margin-top:2px;display:block">${ex.weight}kg</div>`:''}
</div>
<span class="av" style="opacity:.5;margin-right:12px">${ex.sets||'?'}\u00d7${ex.reps||'?'}${ex.unit||'\u6b21'}</span>
<button class="cb${done?' ck':''}" style="cursor:default;pointer-events:none;opacity:${done?1:0.15}"><i class="ti ti-check"></i></button>
</div>`;
        });
        h+=`</div>`;
      }else{h+=`<div class="hist-empty">\u8be5\u65e5\u8bad\u7ec3\u8be6\u60c5\u4e0d\u53ef\u7528</div>`}
      if(lg.note)h+=`<div class="hist-note" style="margin-top:12px;padding:10px 14px;background:var(--surface2);border-radius:8px;font-size:12px;font-style:italic;color:var(--ink2)">"${lg.note}"</div>`;
    }else{
      const pd=S.prog[sel.date]||{};
      const locked=isLocked(sel);
      const _isSwimDay=!!sel.isSwimDay;

      // ── Pool Mode: swim-day-specific UI with large touch targets ──
      if(_isSwimDay && !locked){
        const PHASE_LABELS={warmup:'热身',tech:'技术练习',main:'主练',cooldown:'放松'};
        const PHASE_ICONS={warmup:'🔥',tech:'🎯',main:'🏊',cooldown:'🧘'};
        h+=`<div class="pool-mode">`;
        h+=`<div class="wh">
<span class="wh-title">${fmtDate(sel.date)} \u00b7 ${sel.workoutType}</span>
<span class="badge" style="background:rgba(59,130,246,.12);color:#3b82f6">${S.swimLevel||'\u5165\u95e8'}</span>
<span class="badge">${sel.duration}\u5206\u949f</span>
</div>`;
        // Group exercises by swim phase
        let lastPhase='';
        h+=`<div class="exlist">`;
        sel.exercises.forEach((ex,i)=>{
          const done=pd[i];
          const reps=getAdj(sel.date,i,'r',ex.reps);
          const phase=ex.swimPhase||'main';
          // Phase separator
          if(phase!==lastPhase){
            lastPhase=phase;
            h+=`<div style="padding:4px 0 2px"><span class="pool-phase-tag ${phase}">${PHASE_ICONS[phase]||''} ${PHASE_LABELS[phase]||phase}</span></div>`;
          }
          h+=`<div class="exrow${done?' done-ex':''}" onclick="tog('${sel.date}',${i})">
<div style="flex:1;min-width:0">
<div class="exname">${ex.name} <i class="ti ti-info-circle" style="font-size:12px;opacity:.4;vertical-align:middle" onclick="event.stopPropagation();showExDetail('${ex.name}')"></i></div>
<div class="exnote">${ex.note}</div>
<span class="pool-reps">${reps}\u5206\u949f</span>
${!done?`<button class="act-play-btn" onclick="event.stopPropagation();startTimer(${reps*60}, '${ex.name}')">\u25b6 \u5f00\u59cb\u8ba1\u65f6 ${reps}\u5206\u949f</button>`:''}
</div>
<button class="cb${done?' ck':''}" onclick="event.stopPropagation();tog('${sel.date}',${i})"><i class="ti ti-check"></i></button>
</div>`;
        });
        h+=`</div>`;
        // Fixed bottom complete button
        const alreadyLogged = LOG.some(l=>l.date===sel.date&&l.workout===sel.workoutType);
        if(!alreadyLogged){
          const checkedCount = Object.keys(pd).filter(k=>pd[k]).length;
          const btnText = checkedCount === sel.exercises.length ? '\u5b8c\u6210\u6e38\u6cf3\u8bad\u7ec3' : '\u7ed3\u675f\u8bad\u7ec3\u5e76\u6253\u5361';
          const btnCls = checkedCount === sel.exercises.length ? 'btn-complete-workout' : 'btn-end-workout-early';
          h+=`<div class="pool-mode-bottom-bar">
<button class="${btnCls}" onclick="endWorkoutEarly('${sel.date}')">
<i class="ti ti-swimming" style="margin-right:8px"></i>${btnText}
</button>
</div>`;
        }
        h+=`</div>`; // close pool-mode

      // ── Standard gym day render (unchanged) ──
      }else{
      h+=`<div class="wh">
<span class="wh-title">${fmtDate(sel.date)} \u00b7 ${sel.workoutType}</span>
<span class="badge">${sel.duration}\u5206\u949f</span>
${_isSwimDay?`<span class="badge" style="background:rgba(59,130,246,.12);color:#3b82f6">${S.swimLevel||'\u5165\u95e8'}</span>`:''}
${!locked&&!_isSwimDay?`<button class="regen-btn" style="margin-left:auto;font-size:10px;padding:2px 8px" onclick="startTimer(45, '\u7ec4\u95f4\u4f11\u606f')">45s</button><button class="regen-btn" style="margin-left:4px;font-size:10px;padding:2px 8px" onclick="startTimer(60, '\u7ec4\u95f4\u4f11\u606f')">60s</button>`:''}
${locked?`<span class="warn-tag" style="background:var(--surface3);color:var(--ink3);border-color:var(--border)">\u672a\u6253\u5365</span><span class="warn-tag">\u5df2\u9501\u5b9a</span><button class="regen-btn" style="margin-left:8px;font-size:10px;padding:2px 8px" onclick="unlockDate('${sel.date}')">\u89e3\u9664\u9501\u5b9a</button>`:''}
</div>
<div class="exlist">${sel.exercises.map((ex,i)=>{
const done=pd[i];
const sets=getAdj(sel.date,i,'s',ex.sets);
const reps=getAdj(sel.date,i,'r',ex.reps);
const needsWt=ex.unit==='\u6b21'&&!ex.isWarmup&&!ex.isStretch;
const curW=getWeight(sel.date,i);
const lastW=needsWt?getLastWeight(ex.name):null;
const sugW=needsWt?suggestWeight(ex.name):null;
const dispW=curW!==null?curW:(sugW??'');
return`<div class="exrow${done?' done-ex':''}"><div style="flex:1;min-width:0">
<div class="exname" onclick="showExDetail('${ex.name}')" style="cursor:pointer">${ex.name}${needsWt&&W_HIST[ex.name]&&W_HIST[ex.name].length>0&&(curW||0)>=Math.max(...W_HIST[ex.name].map(h=>h.weight))?` <span title="个人纪录" style="font-size:9px;color:var(--terra);border:1px solid var(--terra);border-radius:2px;padding:0 2px;margin-left:4px;font-weight:600">纪录</span>`:''} <i class="ti ti-info-circle" style="font-size:11px;opacity:.4;vertical-align:middle"></i>${!locked&&!ex.isWarmup&&!ex.isStretch?` <span class="swap-btn" onclick="event.stopPropagation();swapExercise('${sel.date}',${i})" title="替换动作" style="border:1px solid var(--sage);color:var(--sage);border-radius:2px;padding:0 4px;font-size:10px;margin-left:4px">替换</span>`:''}</div>
<div class="exnote">${(ex.muscle||[]).map(m=>`<span style="font-size:9px;background:var(--surface2);color:var(--ink2);padding:1px 4px;border-radius:2px;margin-right:4px;display:inline-block">${m}</span>`).join('')}${ex.note}${ex.bi?' (左右各做一遍算1组)':''}</div>
${needsWt&&!locked?`<div class="wt-row">
<input type="number" class="wt-input" value="${dispW||''}" placeholder="${sugW||''}" onchange="setWeight('${sel.date}',${i},+this.value)" step="${getWeightStep(ex.name)}" min="0">
<span class="wt-unit">kg</span>
${lastW?`<span class="wt-hint">\u4e0a\u6b21 ${lastW.weight}kg</span>`:`<span class="wt-sug">\u5efa\u8bae ${sugW||'?'}kg</span>`}
${sugW&&lastW&&sugW!==lastW.weight?`<span class="wt-sug">\u2192 ${sugW}kg</span>`:''}
</div>`:''}
${needsWt&&locked&&lastW?`<span class="wt-hint" style="margin-top:2px;display:block">${curW||lastW.weight}kg</span>`:''}
${(ex.unit==='\u79d2'||ex.unit==='\u5206\u949f') && !locked ? `<button class="act-play-btn" onclick="startTimer(${ex.unit==='\u5206\u949f'?reps*60:reps}, '${ex.name}')">\u8ba1\u65f6</button>` : ''}
</div>
${!locked?`
<div class="adjg"><button class="ab" onclick="adj('${sel.date}',${i},'s',-1)">-</button><span class="av">${sets}\u7ec4</span><button class="ab" onclick="adj('${sel.date}',${i},'s',1)">+</button></div>
<div class="adjg"><button class="ab" onclick="adj('${sel.date}',${i},'r',-1)">-</button><span class="av">${reps}${ex.unit}${ex.bi?'/每侧':''}</span><button class="ab" onclick="adj('${sel.date}',${i},'r',1)">+</button></div>
<button class="cb${done?' ck':''}" onclick="tog('${sel.date}',${i})"><i class="ti ti-check"></i></button>
`:`<span class="av" style="opacity:.5;margin-right:12px">${sets}\u00d7${reps}${ex.unit}${ex.bi?'/每侧':''}</span>
<button class="cb${done?' ck':''}" style="cursor:default;pointer-events:none;opacity:${done?1:0.15}"><i class="ti ti-check"></i></button>
`}
</div>`;}).join('')}</div>`;
      
      const alreadyLogged = LOG.some(l=>l.date===sel.date&&l.workout===sel.workoutType);
      if (!locked && !sel.isRest && !alreadyLogged) {
          const checkedCount = Object.keys(pd).filter(k=>pd[k]).length;
          const btnText = checkedCount === sel.exercises.length ? '完成训练并打卡' : '结束训练并打卡';
          const btnCls = checkedCount === sel.exercises.length ? 'btn-complete-workout' : 'btn-end-workout-early';
          h += `<div class="workout-action-bar" style="margin-top:16px;display:flex;justify-content:center;width:100%">
              <button class="${btnCls}" onclick="endWorkoutEarly('${sel.date}')">
                  <i class="ti ti-checklist" style="margin-right:6px"></i>${btnText}
              </button>
          </div>`;
      }
      } // end gym-day else
    }
  }
}else if(sel&&sel.isRest){
h+=`<div class="tip" style="text-align:center;padding:2rem">\u4f11\u606f\u65e5 \u2014 \u597d\u597d\u6062\u590d\uff0c\u660e\u5929\u7ee7\u7eed</div>`;
}
h+=`<div class="tip">${tip}</div>`;
document.getElementById('main').innerHTML=h;
initTouchDrag();

if ('setAppBadge' in navigator) {
    const todayStrVal = todayStr();
    const todayPlan = S.plan?.days.find(d => d.date === todayStrVal);
    if (todayPlan && !todayPlan.isRest && !LOG.some(l => l.date === todayStrVal && l.workout === todayPlan.workoutType)) {
        navigator.setAppBadge(1).catch(()=>{});
    } else {
        navigator.clearAppBadge().catch(()=>{});
    }
}

const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
const isStandalone = ('standalone' in window.navigator) && window.navigator.standalone;
let promptEl = document.getElementById('ios-install-prompt');
if (isIos && !isStandalone && !localStorage.getItem('hideInstallPrompt')) {
    if (!promptEl) {
        promptEl = document.createElement('div');
        promptEl.id = 'ios-install-prompt';
        promptEl.innerHTML = `
            <div style="flex:1; font-size:12px; line-height:1.4;">
                <strong style="display:block; font-size:13px; margin-bottom:2px">获取完美体验 🚀</strong>
                点击底部的 <i class="ti ti-share" style="font-size:14px; vertical-align:middle; margin:0 2px"></i> ，然后选择<strong>“添加到主屏幕”</strong>
            </div>
            <button onclick="document.getElementById('ios-install-prompt').remove(); localStorage.setItem('hideInstallPrompt', '1')" style="background:none; border:none; color:var(--ink2); font-size:20px; padding:0 0 0 10px; cursor:pointer">&times;</button>
        `;
        promptEl.style.cssText = 'position:fixed; bottom:max(env(safe-area-inset-bottom, 20px), 20px); left:50%; transform:translateX(-50%); width:90%; max-width:400px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:12px 16px; display:flex; align-items:center; box-shadow:0 8px 24px rgba(0,0,0,0.12); z-index:9999; animation:paneFadeIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);';
        document.body.appendChild(promptEl);
    }
}
}

// ══ Interactions ════════════════════════════════════════
function selectDate(ds){
    S.selDate=ds;
    if(S.plan && S.plan.days && S.plan.days.length) {
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
let _timerInterval=null;
let _audioCtx=null;

function _getAudioCtx() {
    if(!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
}

function unlockAudio() {
    try {
        const ctx = _getAudioCtx();
        if(ctx.state === 'suspended') ctx.resume();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
    } catch(e){}
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

// Sound 1: Rest timer ended — gentle singing bowl
// Uses noise excitation → bandpass resonance to model a struck metal bowl
function playDing() {
    try {
        const ctx = _getAudioCtx();
        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.3, now);
        
        const reverb = _makeReverb(ctx, 2.5, 2.5);
        const dryGain = ctx.createGain();
        dryGain.gain.value = 0.6;
        const wetGain = ctx.createGain();
        wetGain.gain.value = 0.4;
        
        masterGain.connect(dryGain);
        dryGain.connect(ctx.destination);
        masterGain.connect(reverb);
        reverb.connect(wetGain);
        wetGain.connect(ctx.destination);
        
        // Bowl resonant frequencies (D4 and inharmonic partials)
        const freqs = [293.66, 440, 587.33, 880];
        const qVals = [200, 150, 120, 80];
        const levels = [1.0, 0.5, 0.3, 0.15];
        
        freqs.forEach((f, i) => {
            const exciter = _noiseExcite(ctx, 0.02);
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = f;
            bp.Q.value = qVals[i];
            
            const env = ctx.createGain();
            env.gain.setValueAtTime(levels[i], now);
            env.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
            
            exciter.connect(bp);
            bp.connect(env);
            env.connect(masterGain);
            exciter.start(now);
        });
    } catch(e) { console.warn('Audio:', e); }
}

// Sound 2: Rest timer starts — soft wind chime tinkle
function playRestStartSound() {
    try {
        const ctx = _getAudioCtx();
        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.2, now);
        
        const reverb = _makeReverb(ctx, 3, 1.5);
        const dryGain = ctx.createGain();
        dryGain.gain.value = 0.5;
        const wetGain = ctx.createGain();
        wetGain.gain.value = 0.5;
        
        masterGain.connect(dryGain);
        dryGain.connect(ctx.destination);
        masterGain.connect(reverb);
        reverb.connect(wetGain);
        wetGain.connect(ctx.destination);
        
        // Two gentle chime notes staggered
        const chimes = [
            { freq: 1318.5, delay: 0, q: 300, vol: 0.6, decay: 0.9 },
            { freq: 1760,   delay: 0.08, q: 250, vol: 0.35, decay: 0.7 },
        ];
        
        chimes.forEach(c => {
            const exciter = _noiseExcite(ctx, 0.008);
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = c.freq;
            bp.Q.value = c.q;
            
            const env = ctx.createGain();
            env.gain.setValueAtTime(0, now);
            env.gain.setValueAtTime(c.vol, now + c.delay);
            env.gain.exponentialRampToValueAtTime(0.001, now + c.delay + c.decay);
            
            exciter.connect(bp);
            bp.connect(env);
            env.connect(masterGain);
            exciter.start(now + c.delay);
        });
    } catch(e) { console.warn('Audio:', e); }
}

// Sound 3: Exercise checked off — soft marimba tap
function playExerciseDoneSound() {
    try {
        const ctx = _getAudioCtx();
        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.25, now);
        
        const reverb = _makeReverb(ctx, 4, 0.6);
        const dryGain = ctx.createGain();
        dryGain.gain.value = 0.65;
        const wetGain = ctx.createGain();
        wetGain.gain.value = 0.35;
        
        masterGain.connect(dryGain);
        dryGain.connect(ctx.destination);
        masterGain.connect(reverb);
        reverb.connect(wetGain);
        wetGain.connect(ctx.destination);
        
        // Marimba: noise excitation → narrow resonance at G5
        const exciter = _noiseExcite(ctx, 0.012);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 784;
        bp.Q.value = 250;
        
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.8, now);
        env.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        
        exciter.connect(bp);
        bp.connect(env);
        env.connect(masterGain);
        exciter.start(now);
    } catch(e) { console.warn('Audio:', e); }
}

// Sound 4: Workout complete — ascending kalimba arpeggio with shimmer
function playWorkoutCompleteSound() {
    try {
        const ctx = _getAudioCtx();
        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.22, now);
        
        const reverb = _makeReverb(ctx, 2, 2.5);
        const dryGain = ctx.createGain();
        dryGain.gain.value = 0.45;
        const wetGain = ctx.createGain();
        wetGain.gain.value = 0.55;
        
        masterGain.connect(dryGain);
        dryGain.connect(ctx.destination);
        masterGain.connect(reverb);
        reverb.connect(wetGain);
        wetGain.connect(ctx.destination);
        
        // Pentatonic scale: C5, D5, E5, G5, A5, C6
        const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
        
        notes.forEach((freq, i) => {
            const t = now + i * 0.14;
            const exciter = _noiseExcite(ctx, 0.01);
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = freq;
            bp.Q.value = 280;
            
            const env = ctx.createGain();
            env.gain.setValueAtTime(0, now);
            env.gain.setValueAtTime(0.7, t);
            env.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
            
            exciter.connect(bp);
            bp.connect(env);
            env.connect(masterGain);
            exciter.start(t);
        });
    } catch(e) { console.warn('Audio:', e); }
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
        _wakeLock.release().catch(()=>{});
        _wakeLock = null;
    }
}

function startTimer(seconds, label="休息中") {
    clearInterval(_timerInterval);
    _releaseWakeLock();
    _requestWakeLock();
    
    const bar = document.getElementById('universal-timer');
    const timeEl = document.getElementById('timer-time');
    const lblEl = document.getElementById('timer-label');
    const prog = document.getElementById('timer-progress');
    if(!bar) return;
    
    lblEl.innerText = label;
    bar.classList.add('show');
    unlockAudio();
    playRestStartSound();
    
    const total = seconds;
    const endTime = Date.now() + seconds * 1000;
    
    function update() {
        const remain = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        const m = Math.floor(remain / 60);
        const s = remain % 60;
        timeEl.innerText = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
        prog.style.width = ((total - remain) / total * 100) + '%';
        
        if (remain <= 0) {
            clearInterval(_timerInterval);
            _releaseWakeLock();
            playDing();
            setTimeout(() => { bar.classList.remove('show'); }, 3000);
        }
    }
    
    update();
    _timerInterval = setInterval(update, 200);
}

function stopTimer() {
    clearInterval(_timerInterval);
    _releaseWakeLock();
    const bar = document.getElementById('universal-timer');
    if(bar) bar.classList.remove('show');
}

let _pendingRpeDate = null;
let _pendingRpeDay = null;
let _editingLogIdx = null;

function closeRpeModal(){
    document.getElementById('rpe-modal').classList.remove('open');
    _pendingRpeDate = null;
    _pendingRpeDay = null;
    _editingLogIdx = null;
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
    if(noteEl) noteEl.value = l.note || '';
    
    document.getElementById('rpe-modal').classList.add('open');
}

function submitRPE(rpe, isSkip=false) {
    if(!_pendingRpeDate) {
        closeRpeModal();
        return;
    }
    const noteEl = document.getElementById('rpe-note');
    const note = noteEl ? noteEl.value.trim() : '';
    const actualRpe = isSkip ? 6 : rpe;
    const moods=['疲惫','偏累','一般','舒适','饱满','充沛','火热','极佳','突破','力竭'];
    
    if (_editingLogIdx !== null) {
        // Edit mode
        LOG[_editingLogIdx].rpe = actualRpe;
        LOG[_editingLogIdx].mood = moods[actualRpe-1]||'一般';
        LOG[_editingLogIdx].note = note;
        ls(K.log,LOG);
        showToast('已更新记录');
    } else if (_pendingRpeDay) {
        // New log mode
        const day = _pendingRpeDay;
        const date = _pendingRpeDate;
        const _dayIsSwim = !!day.isSwimDay;
        const checkedCount = Object.keys(S.prog[date] || {}).filter(k=>S.prog[date][k]).length;
        const totalEx = day.exercises.length;
        
        LOG.unshift({
            date: date,
            workout: day.workoutType,
            duration: day.duration,
            exerciseCount: checkedCount,
            rpe: actualRpe,
            exercises: day.exercises.map((ex,i)=>({
                name:ex.name,
                sets:getAdj(date,i,'s',ex.sets),
                reps:getAdj(date,i,'r',ex.reps),
                unit:ex.unit,
                weight:getWeight(date,i)||null,
                done: !!(S.prog[date] && S.prog[date][i])
            })),
            mood: moods[actualRpe-1]||'一般',
            note: note,
            isSwimDay: _dayIsSwim
        });
        ls(K.log,LOG);
        
        if (!_dayIsSwim) {
            // Assess intensity and auto-volume adjustment
            const assessment = assessPlanIntensity();
            let toastMsg = '';
            if (assessment.cls === 'intensity-over') {
                S.volumeMultiplier = Math.max(0.5, (S.volumeMultiplier || 1.0) * 0.9);
                toastMsg = `强度超标：后续训练量已自动下调 10%`;
            } else if (assessment.cls === 'intensity-under') {
                S.volumeMultiplier = Math.min(1.5, (S.volumeMultiplier || 1.0) * 1.05);
                toastMsg = `强度低于能力：已自动上调后续训练量 5%`;
            } else {
                if ((S.volumeMultiplier || 1.0) > 1.0) S.volumeMultiplier = Math.max(1.0, S.volumeMultiplier - 0.05);
                if ((S.volumeMultiplier || 1.0) < 1.0) S.volumeMultiplier = Math.min(1.0, S.volumeMultiplier + 0.05);
                toastMsg = `强度适中：完美契合您的体能！`;
            }
            showToast(toastMsg);
            
            // Auto recalibrate remaining days of the plan
            setTimeout(() => {
                genPlan(true);
            }, 100);
            
            checkGymMilestone();
        } else {
            showToast(isSkip ? `游泳训练完成！` : `游泳完成。RPE ${actualRpe}/10`);
            checkSwimMilestone();
        }
        
        // Save weight history per exercise
        day.exercises.forEach((ex,i)=>{
            const w=getWeight(date,i);
            if(w&&w>0&&!ex.isWarmup&&!ex.isStretch&&ex.unit==='次'){
                if(!W_HIST[ex.name])W_HIST[ex.name]=[];
                W_HIST[ex.name].push({date,weight:w,rpe:actualRpe,period:S.periodMode});
                if(W_HIST[ex.name].length>50)W_HIST[ex.name]=W_HIST[ex.name].slice(-50);
            }
        });
        ls(K.wh,W_HIST);
        
        // Re-lock: remove from unlockedDates if it was previously unlocked
        if(S.unlockedDates && S.unlockedDates.includes(date)){
            S.unlockedDates = S.unlockedDates.filter(d => d !== date);
        }
        playWorkoutCompleteSound();
    }
    
    if(noteEl) noteEl.value = '';
    
    // Reset modal text back to default for next time
    document.getElementById('rpe-modal-title').innerText = '今日疲劳度评估';
    document.getElementById('rpe-modal-desc').innerText = '选择最接近你今天训练感受的分数';
    
    closeRpeModal();
    saveState();render();
    if(typeof renderStats === 'function') renderStats(); // Refresh stats view
    if(typeof renderLog === 'function') renderLog(); // Refresh log view
}

function endWorkoutEarly(date){
    const day = S.plan.days.find(d=>d.date===date);
    if(!day) return;
    const checkedCount = Object.keys(S.prog[date] || {}).filter(k=>S.prog[date][k]).length;
    const totalEx = day.exercises.length;
    
    let confirmMsg = '确定结束今日训练并打卡记录吗？';
    if (checkedCount < totalEx) {
        confirmMsg = `您完成了 ${checkedCount}/${totalEx} 个动作。确定要提前结束训练并打卡记录吗？\n（未完成的动作将不会被勾选，系统将记录实际完成情况）`;
    }
    if(confirm(confirmMsg)){
        _pendingRpeDate = date;
        _pendingRpeDay = day;
        document.getElementById('rpe-modal-title').innerText = checkedCount < totalEx ? '训练提前结束打卡' : '训练完成打卡';
        document.getElementById('rpe-modal-desc').innerText = `已完成 ${checkedCount}/${totalEx} 个动作，请评估今日的疲劳度：`;
        document.getElementById('rpe-modal').classList.add('open');
    }
}

function tog(date,ei){
    // If date is locked, do nothing (safety guard)
    const dayCheck = S.plan.days.find(d=>d.date===date);
    if(dayCheck && isLocked(dayCheck)) return;
    
    if(!S.prog[date])S.prog[date]={};
    S.prog[date][ei]=!S.prog[date][ei];
    
    if (S.prog[date][ei]) {
        playExerciseDoneSound();
    }
    
    saveState();render();
    
    // Auto rest timer when checking off an exercise (not unchecking)
    // Skip auto timer for swim days (swimming is continuous, not set-based)
    const day=S.plan.days.find(d=>d.date===date);
    if(S.prog[date][ei] && !isDone(day) && (S.restDur||45) > 0 && !day.isSwimDay){
        startTimer(S.restDur||45, '组间休息');
    }
    
    if(day&&isDone(day)){
        const exists=LOG.find(l=>l.date===date&&l.workout===day.workoutType);
        if(!exists){
            _pendingRpeDate = date;
            _pendingRpeDay = day;
            // Customize RPE modal for swim days
            if(day.isSwimDay){
                document.getElementById('rpe-modal-title').innerText = '游泳训练完成！';
                document.getElementById('rpe-modal-desc').innerText = '评估今天游泳的累计程度';
            }
            setTimeout(() => {
                document.getElementById('rpe-modal').classList.add('open');
            }, 100);
        }
    }
}

// ══ Exercise Swap ════════════════════════════════════════
function swapExercise(date,ei){
const sel=S.plan.days.find(d=>d.date===date);
if(!sel)return;
const ex=sel.exercises[ei];
if(ex.isWarmup||ex.isStretch){showToast('热身/拉伸不支持替换');return}
// Swimming exercises: only swap within same phase
const isSwimEx=ex.group==='swimming'||ex.swimPhase;
if(isSwimEx){
const phase=ex.swimPhase;
const maxDiff=S.swimLevel==='入门'?1:S.swimLevel==='进阶'?2:3;
const excluded=getExcluded();
const used=sel.exercises.map(e=>e.name);
const alts=(DB.swimming||[]).filter(e=>e.swimPhase===phase&&e.n!==ex.name&&!used.includes(e.n)&&!excluded.has(e.n)&&e.diff<=maxDiff);
if(!alts.length){showToast('该阶段没有更多替代动作');return}
window._swapAlts=alts;
const diffLabel=['','★','★★','★★★'];
let modal=document.getElementById('swap-modal');
if(!modal){modal=document.createElement('div');modal.id='swap-modal';modal.className='ex-modal-overlay';modal.onclick=e=>{if(e.target===modal){modal.classList.remove('open')}};document.body.appendChild(modal)}
modal.innerHTML=`<div class="ex-modal-card" onclick="event.stopPropagation()"><div class="ex-modal-hdr"><span class="ex-modal-title">替换动作</span><button class="ex-modal-close" onclick="document.getElementById('swap-modal').classList.remove('open')">✕</button></div><p style="font-size:12px;color:var(--ink3);margin-bottom:12px">当前: ${ex.name} → 选择替代</p><div style="display:flex;flex-direction:column;gap:6px">${alts.map((alt,idx)=>`<button class="swap-option" onclick="doSwap('${date}',${ei},${idx})"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:600;font-size:13px">${alt.n}</span><span style="font-size:10px;color:var(--amber)">${diffLabel[alt.diff||1]}</span></div><div style="font-size:11px;color:var(--ink3);text-align:left;margin-top:2px">${alt.note||''}</div></button>`).join('')}</div></div>`;
modal.classList.add('open');return;
}
let group=null;
for(const[g,exs]of Object.entries(DB)){if(exs.find(e=>e.n===ex.name)){group=g;break}}
if(!group){showToast('找不到替代动作');return}
const used=sel.exercises.map(e=>e.name);
const excluded=getExcluded();
const alts=DB[group].filter(e=>e.n!==ex.name&&!used.includes(e.n)&&!excluded.has(e.n)&&S.equip.some(eq=>!e.eq||e.eq.includes(eq)));
if(!alts.length){showToast('没有更多替代动作');return}
// Show choice modal
const diffLabel=['','★','★★','★★★'];
let modal=document.getElementById('swap-modal');
if(!modal){
modal=document.createElement('div');
modal.id='swap-modal';
modal.className='ex-modal-overlay';
modal.onclick=e=>{if(e.target===modal){modal.classList.remove('open')}};
document.body.appendChild(modal);
}
modal.innerHTML=`<div class="ex-modal-card" onclick="event.stopPropagation()">
<div class="ex-modal-hdr">
<span class="ex-modal-title">替换动作</span>
<button class="ex-modal-close" onclick="document.getElementById('swap-modal').classList.remove('open')">✕</button>
</div>
<p style="font-size:12px;color:var(--ink3);margin-bottom:12px">当前: ${ex.name} → 选择替代</p>
<div style="display:flex;flex-direction:column;gap:6px">
${alts.map((alt,idx)=>`<button class="swap-option" onclick="doSwap('${date}',${ei},${idx})">
<div style="display:flex;justify-content:space-between;align-items:center">
<span style="font-weight:600;font-size:13px">${alt.n}</span>
<span style="font-size:10px;color:var(--amber)">${diffLabel[alt.diff||1]}</span>
</div>
<div style="font-size:11px;color:var(--ink3);text-align:left;margin-top:2px">${alt.note||''}</div>
${W_HIST[alt.n]?`<div style="font-size:10px;color:var(--sage);margin-top:2px">上次 ${W_HIST[alt.n][W_HIST[alt.n].length-1].weight}kg</div>`:''}
</button>`).join('')}
</div>
</div>`;
modal.classList.add('open');
// Store alts for doSwap
window._swapAlts=alts;
}

function doSwap(date,ei,altIdx){
const alt=window._swapAlts[altIdx];
const sel=S.plan.days.find(d=>d.date===date);
const ex=sel.exercises[ei];
sel.exercises[ei]={name:alt.n,note:alt.note||'',sets:ex.sets,reps:alt.u==='秒'?30:(alt.u==='分钟'?1:ex.reps),unit:alt.u||'次',isWarmup:false,isStretch:false,bi:!!alt.bi};
document.getElementById('swap-modal').classList.remove('open');
saveState();render();
showToast(`已替换为 ${alt.n}`);
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
if(confirm('确定要解除锁定吗？\n您的动作勾选记录将被保留，但此日将变为可编辑状态。')){
    if(!S.unlockedDates) S.unlockedDates = [];
    if(!S.unlockedDates.includes(date)) S.unlockedDates.push(date);
    saveState();render();
    if(typeof renderStats === 'function') renderStats();
    showToast('已解锁 ' + fmtDate(date));
}
}

function shareWorkout(date){
    const lg = LOG.find(l => l.date === date);
    if(lg){
        if(typeof openShareModal === 'function') openShareModal(lg);
    }else{
        alert('未找到打卡记录');
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
let _touchSrc=null,_touchEl=null,_touchClone=null;
let _dragStartPt={x:0,y:0};
function initTouchDrag(){
    const grid=document.getElementById('cal-grid');if(!grid)return;
    grid.addEventListener('touchstart',e=>{
        const dc=e.target.closest('.dc[draggable]');if(!dc)return;
        if(dc.classList.contains('locked')) return;
        _touchSrc=dc.getAttribute('onclick')?.match(/selectDate\('([^']+)'\)/)?.[1]||null;
        _touchEl=dc;dc.classList.add('dragging');
        const touch = e.touches[0];
        _dragStartPt = {x: touch.clientX, y: touch.clientY};
        
        const rect = dc.getBoundingClientRect();
        _touchClone = dc.cloneNode(true);
        _touchClone.classList.add('touch-clone');
        _touchClone.style.width = rect.width + 'px';
        _touchClone.style.height = rect.height + 'px';
        _touchClone.style.left = rect.left + 'px';
        _touchClone.style.top = rect.top + 'px';
        document.body.appendChild(_touchClone);
    },{passive:false});
    
    grid.addEventListener('touchmove',e=>{
        if(!_touchClone) return;
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - _dragStartPt.x;
        const dy = touch.clientY - _dragStartPt.y;
        const rect = _touchEl.getBoundingClientRect();
        _touchClone.style.left = (rect.left + dx) + 'px';
        _touchClone.style.top = (rect.top + dy) + 'px';
    },{passive:false});
    
    grid.addEventListener('touchend',e=>{
        if(!_touchSrc){return}
        if(_touchClone) _touchClone.style.display = 'none';
        const touch=e.changedTouches[0];
        const target=document.elementFromPoint(touch.clientX,touch.clientY)?.closest('.dc');
        if(target&&target!==_touchEl){
            const tDate=target.getAttribute('onclick')?.match(/selectDate\('([^']+)'\)/)?.[1];
            if(tDate)dragDrop({preventDefault(){}},tDate);
        }
        if(_touchEl)_touchEl.classList.remove('dragging');
        if(_touchClone) _touchClone.remove();
        _touchSrc=null;_touchEl=null;_touchClone=null;
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
    tips: ['30度主要侧重上胸，角度过大容易代偿到肩膀'],
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
    mistakes: ['塌腰（常见错误，损伤腰椎）', '臀部撅得太高']
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
    tips: ['器械轨迹固定，适合力竭组', '注意力集中在三角肌收缩上'],
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
    tips: ['这是改善圆肩驼背和维持肩部健康的优秀动作之一', '重量不需要很大，关键是外旋的动作'],
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
    tips: ['这是无法完成自重引体向上时的优秀退阶动作'],
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
    tips: ['这个动作能上很大重量，刺激背部厚度理想', '可以选择宽把或窄把'],
    mistakes: ['弓背（存在安全隐患）', '站得太直变成了耸肩']
  },
  '杠铃斜板划船': {
    muscles: ['中背', '菱形肌'],
    steps: ['将上斜板调至30-45度，胸口贴靠在板上', '双手持哑铃或杠铃', '向后上方拉起重量，挤压肩背', '控制回放'],
    tips: ['去除了下背部的压力和身体借力，是孤立训练背部的理想动作'],
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
    tips: ['好的背部孤立动作，用来找背阔肌发力感或作为收尾充血'],
    mistakes: ['向下压的过程中弯曲手肘（变成了三头肌下压）', '身体上下起伏借力']
  },
  '直臂下压机': {
    muscles: ['背阔肌', '前锯肌'],
    steps: ['坐姿，手肘抵在器械的靠垫上', '利用背阔肌的力量将机器往下压至腹部', '缓慢回放'],
    tips: ['这是复刻经典的Nautilus Pullover器械，对背阔肌刺激显著'],
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
    tips: ['居家练背的优秀选择', '拉得越短，阻力越大'],
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
    tips: ['靠垫防止了手臂和身体的移动，是优秀的孤立动作', '不要下放到关节完全锁死，保持一点张力'],
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
    tips: ['这被认为是塑造二头肌"山峰"的优秀动作', '专注在每一次顶峰收缩'],
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
    tips: ['三头肌长头在手臂抬高时被拉长，这个动作能提供优秀的长头刺激'],
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
    tips: ['好的新手退阶动作，可以专注于三头肌的发力'],
    mistakes: ['借着托板的弹力向上跳']
  },
  '窄距杠铃卧推': {
    muscles: ['肱三头肌', '胸大肌内侧'],
    steps: ['仰卧在卧推凳上，双手握距与肩同宽或略窄', '将杠铃下放至胸骨下部，大臂紧贴着身体两侧滑下', '用力推起至手臂伸直'],
    tips: ['这是增加三头肌维度的经典动作，可以使用较大重量', '握距不要太窄（不要两手碰在一起），否则会伤手腕'],
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
    tips: ['这个变式对股四头肌和核心的刺激远大于传统深蹲', '背部不适者的优秀替代动作'],
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
    mistakes: ['推到顶点时膝盖完全锁死反曲（存在安全隐患）', '下落太深导致下背部离开靠背受压']
  },
  '钟摆深蹲': {
    muscles: ['股四头肌'],
    steps: ['背部紧贴机器靠板，肩膀顶住垫子', '缓慢下蹲，机器会带着你做一个向后下方的圆弧轨迹', '推起至初始位置'],
    tips: ['这台机器能提供充分的股四头肌孤立刺激，而且对腰椎友好', '可以蹲得深'],
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
    tips: ['孤立股四头肌雕刻线条的优秀动作，适合放在腿部训练最后', '脚尖向外侧重内侧头，脚尖向内侧重外侧头'],
    mistakes: ['重量过大导致身体从座位上弹起', '完全不用力回放，让配重片砸下']
  },
  '保加利亚分腿蹲': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['双手持哑铃，背对长凳站立，将一只脚的脚背搭在凳子上', '另一只脚向前迈出合适距离', '下蹲至前侧大腿与地面平行，后侧膝盖几乎触地', '前脚脚跟发力推起'],
    tips: ['上半身直立更侧重股四头肌；上半身稍微前倾更侧重臀大肌', '单腿动作能有效地改善左右不平衡'],
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
    tips: ['重量在身前会自动强迫你保持背部直立，是新手学习深蹲的优秀入门动作'],
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
    tips: ['这是目前公认发展臀部体积的优秀动作', '保持下巴微收看向前方，有助于防止腰椎超伸'],
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
    tips: ['单腿动作，能有效地感受到肌肉的收缩，适合改善两侧不平衡'],
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
    tips: ['这是一个理想的新手动作和热身激活核心动作', '想增加难度可以单腿做，或者在髋部放哑铃'],
    mistakes: ['推得过高导致腰部过度反弓']
  },
  '弹力带蚌式开合': {
    muscles: ['臀中肌'],
    steps: ['将迷你弹力带套在膝盖上方，侧卧在垫子上，双膝微屈并拢', '双脚保持接触，像蚌壳一样打开上方的膝盖', '顶端停顿，缓慢闭合'],
    tips: ['深蹲硬拉前的优秀热身动作，能激活臀部稳定肌群，防止膝盖内扣'],
    mistakes: ['打开膝盖时，骨盆跟着向后翻转（应保持骨盆垂直于地面不动）']
  },

  // === 小腿 (Calves) ===
  '站姿提踵': {
    muscles: ['腓肠肌（小腿肚）'],
    steps: ['前脚掌踩在台阶或提踵机踏板上，脚跟悬空', '最大幅度地下放脚跟，感受小腿后侧深度拉伸', '用力踮起脚尖到最高点，停顿1-2秒强烈收缩', '控制回放'],
    tips: ['小腿肌肉对全幅度（特别是拉伸感）敏感，一定要下放到最低点'],
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
    tips: ['安全的大重量小腿训练方法，腰部完全无压力'],
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
    tips: ['机器能让你方便地增加负重，是让腹肌维度变大的好工具', '保持背部微拱起，不要挺直背部压'],
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
    tips: ['这是一个安全的动作，适合康复和唤醒深层核心', '关键点：下背部绝不能离开地面哪怕一毫米'],
    mistakes: ['动作过快', '背部拱起离开地面']
  },
  '腹轮': {
    muscles: ['核心全身', '背阔肌'],
    steps: ['双膝跪在软垫上，双手握住健腹轮的把手', '收紧腹肌，稍微含胸（像一只生气的猫）', '缓慢向前推出滚轮，直至身体完全伸展但未触地', '利用腹肌的收缩将身体拉回初始跪姿'],
    tips: ['挑战性较高，注意安全。', '熟练后可以尝试站姿推腹轮（高难度）'],
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
    tips: ['可以设置1-2%的坡度，以弥补室内没有风阻的差异，更接近户外真实跑步体验', '心率保持在最大心率的65-75%为理想的燃脂区间'],
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
    tips: ['这是健身房里效率最高、对关节冲击最小的全身有氧器械', '记住口诀："腿-背-手，手-背-腿"'],
    mistakes: ['顺序错乱（腿还没伸直手就拉了）', '弯腰驼背']
  },
  '风阻划船机': {
    muscles: ['心肺功能', '爆发力', '全身'],
    steps: ['动作与普通划船机一致', '主要区别在于：你拉得越快、用力越猛，风扇产生的阻力就越大'],
    tips: ['适合做HIIT（高强度间歇训练），例如：全力划30秒，慢划30秒，重复10组'],
    mistakes: ['阻力挡位设置过高（通常推荐调在3-5挡之间即可模拟真实划水感）']
  },
  '椭圆机': {
    muscles: ['心肺功能'],
    steps: ['站上脚踏板，双手握住移动把手', '开始同步协调手脚的推拉运动', '保持上半身直立，核心微收紧'],
    tips: ['这是一个"零冲击"的有氧运动，适合体重较大者或有膝盖伤病的人群保护关节', '可以尝试倒着踩，能更多刺激到臀部和腘绳肌'],
    mistakes: ['身体瘫软地趴在控制面板上', '阻力设为0，只是随着惯性空转']
  },
  '骑行机': {
    muscles: ['心肺功能', '股四头肌'],
    steps: ['调整座椅高度：当你的一侧脚踏踩到最低点时，该侧膝盖应该有轻微的弯曲', '设置好阻力，开始平稳踩踏', '保持上半身稳定，不左右摇晃'],
    tips: ['坐姿骑行（有靠背的那种）对腰椎最友好，适合大体重人群'],
    mistakes: ['座椅调得太低，导致膝盖一直弯着受力（容易损伤膝盖）']
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
    tips: ['又称"有氧之王"，燃脂效率较高，同时能有效地锻炼到臀腿肌肉', '尽量不要死死抓着扶手借力'],
    mistakes: ['上半身瘫倒在控制台上，踮着脚尖走']
  },
  '跳绳': {
    muscles: ['心肺功能', '小腿', '肩部耐力'],
    steps: ['双手握住手柄，绳子在脚后跟', '手腕发力转动绳子', '绳子从头上转过时，前脚掌轻轻弹跳跃过', '保持平稳的呼吸和节奏'],
    tips: ['跳跃的高度只需要刚好让绳子通过即可，切勿跳得太高', '是好的便携式高强度有氧运动'],
    mistakes: ['整个手臂大幅度抡圈（应该用手腕转）', '脚跟着地重重砸向地面']
  },
  '开合跳': {
    muscles: ['心肺功能', '全身协调性'],
    steps: ['站立，双脚并拢，双手自然下垂', '向上跳起，同时双脚向两侧张开，双手举过头顶击掌或靠近', '再次跳起，双脚并拢，双手放回体侧', '快速连续进行'],
    tips: ['膝盖始终保持微屈，起到缓冲作用', '这是优秀的训练前热身动作，能快速升高心率和体温'],
    mistakes: ['跳跃落地时膝盖关节完全锁死笔直']
  },
  '波比跳': {
    muscles: ['心肺功能', '爆发力', '全身绝大部分肌群'],
    steps: ['站立姿势开始，下蹲，双手撑在地面上', '双腿向后跳，呈高位平板支撑姿势', '（可选）做一个标准的俯卧撑', '双腿向前跳回深蹲姿势', '向上用力跳起，双手在头顶击掌'],
    tips: ['公认的"高强度"燃脂动作，能快速提升心率', '如果是新手，可以去掉俯卧撑，以及把双腿"跳"向后改为"走"向后以降低难度'],
    mistakes: ['在平板支撑阶段腰部严重塌陷', '落地没有缓冲，脚砸地面']
  },
  '全身动态热身 (开合跳)': {
    muscles: ['全身'],
    steps: ['双脚并拢站立，双手自然下垂', '跳起时双脚向外张开，同时双手从身体两侧上举并在头顶击掌', '再次跳起，双脚合拢，双手收回身体两侧', '保持轻快的节奏，均匀呼吸'],
    tips: ['落地时保持膝盖微屈，前脚掌先着地，起到缓冲作用', '核心收紧，保持上半身挺直'],
    mistakes: ['全脚掌或脚跟重重砸地', '动作过于僵硬，憋气']
  },
  '肩关节环绕': {
    muscles: ['三角肌', '肩袖肌群'],
    steps: ['站立，双臂自然下垂或微微抬起', '以肩关节为轴，缓慢向前画大圆环绕约30秒', '随后反方向向后画大圆环绕约30秒'],
    tips: ['动作要连贯、缓慢，感受肩胛骨的活动', '幅度可以由小到大逐渐增加'],
    mistakes: ['速度过快导致肩关节弹响', '耸肩借力']
  },
  '扩胸运动': {
    muscles: ['胸大肌', '三角肌前束'],
    steps: ['站立，双臂曲肘平抬至胸前', '随着吸气，将双臂用力向后振，扩张胸部', '呼气，收回双臂至胸前', '可以结合上下交替振臂动作'],
    tips: ['向后振时能明显感觉到胸肌的拉伸感', '背部肩胛骨有相向挤压的感觉'],
    mistakes: ['腰部过度反折代偿', '用力过猛拉伤韧带']
  },
  '徒手深蹲激活': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['双脚与肩同宽，脚尖微向外八', '臀部向后下方坐下，像要坐在一张椅子上', '下蹲至大腿与地面平行或略低，背部保持平直', '脚后跟发力站起，恢复站立姿势'],
    tips: ['下蹲时膝盖的朝向要与脚尖一致', '重心应保持在脚掌偏后跟的位置'],
    mistakes: ['膝盖严重内扣', '弯腰驼背']
  },
  '弓步转体': {
    muscles: ['股四头肌', '臀大肌', '腹外斜肌'],
    steps: ['双脚并拢站立，单脚向前迈出一大步', '下蹲至前侧大腿平行地面，后侧膝盖微触地或悬空', '双手合十伸向前方，躯干向迈出腿的一侧旋转', '转回正前方，前脚蹬地退回起始位置，换腿重复'],
    tips: ['旋转时目光跟随双手移动，增加脊柱旋转幅度', '动作要稳定、缓慢'],
    mistakes: ['前膝超过脚尖过多导致脚跟抬起', '身体摇晃失去平衡']
  },
  '高抬腿走': {
    muscles: ['髂腰肌', '臀大肌', '下肢肌群'],
    steps: ['保持直立，双手可以叉腰或在身前', '抬起一侧膝盖，尽量贴近胸部', '双手可抱住膝盖向上拉伸一秒，然后放下', '交替另一侧腿，可以原地进行或行进间进行'],
    tips: ['核心收紧，支撑腿保持伸直', '抬腿时呼气，放下时吸气'],
    mistakes: ['上半身过度后仰去迎合膝盖']
  },
  '登山者': {
    muscles: ['核心肌群', '髋屈肌'],
    steps: ['呈标准俯卧撑姿势起始，双手略宽于肩，身体呈一条直线', '收紧腹部，将一侧膝盖迅速提至胸下', '快速将腿收回原位，同时另一侧膝盖提至胸下', '左右交替，保持较快的节奏连续进行'],
    tips: ['想象你在原地水平爬山，尽量保持臀部高度不变', '目光看向双手前方一点的地面，保持颈部自然'],
    mistakes: ['臀部撅得过高', '腰部严重塌陷受力']
  },
  '婴儿式背部拉伸': {
    muscles: ['背阔肌', '竖脊肌'],
    steps: ['双膝跪地，臀部向后坐在脚后跟上', '上半身向前趴下，额头触地', '双臂向前尽力伸展，手掌贴地', '保持姿势，深长地呼吸，每次呼气时感受背部放松'],
    tips: ['如果额头碰不到地，可以垫一个瑜伽砖或毛巾', '想象手指在向前爬行，拉长整个背部'],
    mistakes: ['臀部抬起离开了脚后跟过多']
  },
  '胸部静态拉伸': {
    muscles: ['胸大肌', '三角肌前束'],
    steps: ['找一面墙或门框，侧身站立', '将一侧小臂和手掌平贴在墙面上，大臂与地面平行（呈90度）', '身体缓慢向反方向（向外）旋转，直到胸部有明显的拉伸感', '保持30秒，然后换另一侧'],
    tips: ['可以通过调整手肘的高度（偏高或偏低）来拉伸胸大肌的不同纤维', '保持均匀呼吸，不要过度疼痛'],
    mistakes: ['身体过度前倾而不是旋转', '耸肩']
  },
  '肩后侧拉伸': {
    muscles: ['三角肌后束', '菱形肌'],
    steps: ['站立或坐姿，抬起一侧手臂使其横过胸前，与地面平行', '用另一只手钩住该手臂的手肘后侧', '轻轻向胸口方向施加压力，感受肩膀后侧的拉伸', '保持30秒后换边'],
    tips: ['被拉伸的手臂尽量保持伸直但不要死锁关节', '拉伸时保持肩膀下沉，不要耸起'],
    mistakes: ['身体跟着手臂一起旋转，失去了相对拉伸力']
  },
  '三头肌拉伸': {
    muscles: ['肱三头肌'],
    steps: ['站立或坐立，挺胸收腹', '将一侧手臂向上举起，贴近耳朵，然后弯曲手肘，手掌去触摸后背肩胛骨中间', '用另一只手握住弯曲的手肘，向后、向内轻轻按压', '感受大臂后侧的拉伸，保持30秒后换边'],
    tips: ['头不要低，可以微微向后靠在手臂上，增加拉伸感'],
    mistakes: ['过度弓背', '低头驼背']
  },
  '股四头肌拉伸': {
    muscles: ['股四头肌', '髂腰肌'],
    steps: ['单腿站立，可以单手扶墙保持平衡', '另一只手抓住同侧脚的脚踝，向臀部方向拉', '将脚跟贴近臀部，同时微微将髋部向前顶', '保持30秒后换腿'],
    tips: ['拉伸腿的膝盖应尽量与支撑腿靠拢，不要向外打开', '身体直立，不要为了拉脚踝而过度弯腰'],
    mistakes: ['腰椎过度前凸（骨盆前倾）去代偿伸髋']
  },
  '腘绳肌/体前屈': {
    muscles: ['腘绳肌', '小腿三头肌'],
    steps: ['站立，双脚并拢或与髋同宽', '保持双腿伸直（膝盖不锁死），从髋部开始折叠上半身', '双手顺着双腿慢慢向下滑，尽量去触摸脚趾或地面', '在最底端放松头部和颈椎，保持自然呼吸30秒'],
    tips: ['重点是骨盆的翻转（屁股向天空翻），而不是背部弯曲', '感觉大腿后侧有强烈拉伸感即可，不要求必须摸到地'],
    mistakes: ['膝盖完全锁死反曲', '强行弯腰低头去够地面']
  },
  '臀大肌拉伸': {
    muscles: ['臀大肌', '梨状肌'],
    steps: ['仰卧在瑜伽垫上，双膝弯曲，脚踩地', '将一侧脚踝架在另一侧腿的膝盖正下方（呈阿拉伯数字4的形状）', '双手抱住支撑腿的大腿后侧，缓慢向胸口方向拉', '感受架起腿一侧的臀部深层拉伸，保持30秒换边'],
    tips: ['尽量让肩膀和头部放松贴在地面上', '如果抱不到大腿，可以用毛巾套住大腿借力'],
    mistakes: ['过度抬头导致脖子酸痛']
  },
  '髂胫束拉伸': {
    muscles: ['髂胫束', '阔筋膜张肌'],
    steps: ['站立姿势，将要拉伸的一侧腿从另一条腿的后方交叉过去', '保持双脚踩实地面', '将一侧手臂上举，身体向没有拉伸腿的那一侧侧倾', '感受大腿外侧到腰部的拉伸感，保持30秒换边'],
    tips: ['重心尽量放在后方那条腿的脚外侧', '可以通过扶墙增加稳定性'],
    mistakes: ['身体前倾，失去了侧面的拉伸力']
  },
  '腹部拉伸 (眼镜蛇式)': {
    muscles: ['腹直肌'],
    steps: ['俯卧在垫子上，双腿并拢伸直，脚背贴地', '双手放在胸部两侧的地板上，手指朝前', '吸气，双臂慢慢用力推起上半身，直到双臂伸直或微屈', '头微仰看向天花板，骨盆尽量保持贴在地面'],
    tips: ['收紧臀部可以有效保护下背部', '如果腰椎感觉压迫，可以将手肘撑地（人面狮身式）代替'],
    mistakes: ['耸肩把头缩在肩膀里', '骨盆过度离开地面']
  },
  '器械内收机': {
    muscles: ['内收肌群', '大腿内侧'],
    steps: ['坐在器械上，背部贴紧靠背，双腿分开放在挡板外侧', '双手握住两侧扶手，收紧核心', '用大腿内侧力量向内夹拢双腿，顺端收缩停留 1-2 秒', '缓慢控制向外打开，不要完全放松'],
    tips: ['与器械外展机配对使用，平衡内外侧肌肉发展', '对应 Tecnogym Adductor 器械'],
    mistakes: ['用惯性夹合而不是肌肉发力', '配重片碘碰产生擞击']
  },
  '器械上背划船': {
    muscles: ['上背', '菱形肌', '中旜形肌'],
    steps: ['坐在器械上，胸部贴紧前方靠垂，双手握住把手', '手肘向后上方拉起，挤压肩胛骨中间', '顾峰收缩停留 1 秒', '缓慢控制回放至手臂伸直'],
    tips: ['与高位下拉、坐姿划船不同，这个动作主要孤立上背和菱形肌', '对应 Tecnogym Upper Back 器械'],
    mistakes: ['身体后仰借力', '仅用手臂拉而不是背部发力']
  },
  '壶铃摆动': {
    muscles: ['臀大肌', '腘绳肌', '核心肌群'],
    steps: ['双脚略宽于肩，脚尖微向外，双手握住壶铃把手', '髋部后推，让壶铃从胯间向后摆动', '臀部爆发式向前推，将壶铃用惯性摆至胸口高度', '用臀部和核心控制下落，重复'],
    tips: ['壶铃摆动是髋部铰链动作，手臂只是“挂钩”不主动发力', '对臀部和后侧链激活效果极佳'],
    mistakes: ['用手臂抑或肩膀向前拉壶铃', '弯腰驼背而不是髋部后推', '膝盖过度前推变成了深蹲']
  },
  '壶铃高脚杯深蹲': {
    muscles: ['股四头肌', '臀大肌'],
    steps: ['双手托住壶铃的球部，贴在胸前', '双脚略宽于肩，脚尖微外八', '保持挺胸，臀部向后下方坐下，类似坐在一张不存在的椅子上', '下蹲至大腿平行地面或更低，用脚后跟发力站起'],
    tips: ['壶铃的球部形状让双手托住更自然舒适，比哑铃版本更容易上手', '适合初学者和热身激活'],
    mistakes: ['胡盖内扣', '重心前移到脚掌前部']
  },
  '上肢功率车': {
    muscles: ['心肺功能', '三角肌', '胱二头肌', '胸大肌'],
    steps: ['坐在器械上，调整座椅高度，使手把在胸口高度', '双手交替採踏手把，类似爬楼梯但用手臂驱动', '保持稳定的节奏，核心收紧', '可调节阻力和转速'],
    tips: ['对应 Tecnogym Excite Top 器械', '上肢为主的有氧训练，适合下肢受伤时替代'],
    mistakes: ['只用手掊不用手臂发力', '坐姿弯腰驼背']
  },

  // === 游泳 (Swimming) ===
  '水中行走热身': {
    muscles: ['全身肌群', '心肺适应'],
    steps: ['下水后先在浅水区沿池边慢走', '双臂在水中自然前后摆动，感受水的阻力', '逐渐加快步伐，可以加入抬膝走或侧步走', '持续3-5分钟，让身体适应水温和浮力'],
    tips: ['不要急着游，让身体充分适应水温能防止抽筋', '水中行走本身就是很好的全身热身，水的阻力会让心率自然上升'],
    mistakes: ['直接跳入水中开始游（容易抽筋）', '在深水区行走（初学者应在浅水区）']
  },
  '水中呼吸练习': {
    muscles: ['呼吸肌群', '心肺功能'],
    steps: ['站在浅水区，水深到胸部', '用嘴深吸一口气，然后将脸部没入水中', '在水中通过鼻子缓慢持续地吐出气泡，直到完全吐完', '抬头出水面，用嘴迅速吸气，重复循环'],
    tips: ['口诀：嘴吸鼻吐。这是所有泳姿的呼吸基础', '吐气要缓慢持续，不要一下子全吐完', '节奏感很重要：水中吐3秒，出水吸1秒'],
    mistakes: ['在水中憋气不吐（导致下一次换气来不及）', '用嘴在水中吐气（容易呛水）', '抬头太高太急']
  },
  '扶边蛙泳腿练习': {
    muscles: ['股四头肌', '腘绳肌', '小腿', '臀大肌'],
    steps: ['双手扶住池边，身体俯卧浮在水面上', '收腿：小腿向臀部方向折叠，脚跟靠近臀部', '翻脚：脚踝向外翻，脚尖向外侧勾起（"锄头脚"）——这是获得推力的关键！', '蹬夹：向后斜下方圆弧形蹬出，然后双腿快速并拢，脚尖绷直', '感受蹬夹后身体被推动向前滑行的感觉'],
    tips: ['四字口诀：收、翻、蹬、夹', '脚踝外翻（勾脚）是最关键的一步，很多初学者忘记翻脚导致蹬不动水', '可以先在岸上趴在长凳边缘反复练习，感受勾脚动作', '蹬出后要有一个滑行停顿，不要连续不停地收蹬'],
    mistakes: ['忘记翻脚（脚尖不勾起，像自由泳一样蹬，完全没有推力）', '收腿时膝盖向外打开太多（应该是小腿折叠，膝盖基本不动）', '蹬完后没有滑行，马上又开始收腿']
  },
  '蹬壁滑行练习': {
    muscles: ['核心肌群', '全身流线型控制'],
    steps: ['面朝泳池方向，一只脚踩在池壁上', '双手合十向前伸直，夹住头部两侧', '深吸气，身体绷紧呈流线型', '用脚用力蹬离池壁，像一支箭一样向前滑行', '保持姿态不动，感受水流推动身体，直到自然停下'],
    tips: ['全身要像一根"棍子"一样笔直绷紧，这就是游泳中最重要的"流线型"', '头部不要抬起看前方，夹在两臂之间，看池底', '蹬得越用力+身体越绷紧=滑得越远'],
    mistakes: ['蹬壁后身体松垮（像一团面条，滑不动）', '头抬起看前方（破坏流线型，增加阻力）', '双腿分开']
  },
  '蛙泳手部划水练习': {
    muscles: ['三角肌', '胸大肌', '背阔肌'],
    steps: ['站在浅水区，弯腰使肩膀入水，双手前伸合拢', '双手向两侧外划，掌心向外，不要超过肩宽', '手掌转向内，向内"抱水"，同时抬头出水面迅速吸气', '双手快速向前并拢伸直，头入水，恢复初始位置'],
    tips: ['手的划水范围不要太大，向两侧打开到肩宽即可', '抱水（向内收）和抬头吸气是同时进行的', '手向前伸直的动作要快，这样可以减少阻力'],
    mistakes: ['手划得太大（超过肩宽很多，像在扒水）', '手向后划（应该是向两侧再向内，不是向后拉）', '抬头太高（只需要嘴巴出水面就够了）']
  },
  '蛙泳完整配合': {
    muscles: ['全身肌群', '心肺耐力'],
    steps: ['从蹬壁滑行姿势开始', '双手开始向外划水，同时抬头换气', '在手向内抱水的同时，开始收腿（小腿向臀部折叠）', '手向前伸直入水的瞬间，用力蹬夹腿', '蹬腿后保持流线型滑行2-3秒，再进入下一个循环'],
    tips: ['核心口诀：划手→抬头吸气→收腿→蹬夹滑行', '最重要的原则：先划手，后蹬腿。手脚不能同时动！', '每次蹬腿后要享受滑行，不要像踩水一样不停动', '初学者可以"划一次手，蹬一次腿，滑行数两秒"来控制节奏'],
    mistakes: ['手脚同时动（互相抵消推力，游不动）', '不滑行就连续做动作（迅速耗尽体力）', '把头抬得很高（增加下半身下沉的阻力）']
  },
  '水中漫步放松': {
    muscles: ['全身', '心肺恢复'],
    steps: ['在浅水区慢速行走或轻柔踢水', '双臂在水中缓慢划动，不需要用力', '调整呼吸，深长呼气让心率逐渐恢复', '可以配合简单的水中拉伸动作'],
    tips: ['这是训练结束的重要环节，帮助肌肉放松和排乳酸', '可以做一些水中的肩部和腿部拉伸'],
    mistakes: ['训练完直接上岸不做放松']
  },
  '蛙泳连续游': {
    muscles: ['全身肌群', '心肺耐力'],
    steps: ['从蹬壁出发，进入完整蛙泳配合', '保持稳定的划手-蹬腿-滑行节奏', '每次蹬腿后充分利用滑行，节省体力', '游到对面池边后蹬壁转身继续'],
    tips: ['连续游的关键是节奏而不是速度，保持从容的节奏', '关注滑行时间：好的蛙泳70%的时间都在滑行', '如果觉得累，加长滑行时间而不是加快动作频率'],
    mistakes: ['为了快而加速手脚频率（反而更累更慢）', '不敢把头放入水中导致始终仰头游']
  },
  '蛙泳间歇训练': {
    muscles: ['心肺功能', '无氧耐力', '全身'],
    steps: ['从池边出发，以较快速度游完25米', '到达对面池边后停下休息30-45秒', '再次出发游25米', '重复4-6组'],
    tips: ['间歇训练能高效提升心肺能力和游泳专项体能', '休息时不要上岸，扶着池边做几次深呼吸即可', '随着能力提升，可以缩短休息时间或增加距离到50米'],
    mistakes: ['休息时间太长（失去间歇效果）', '每一趟都用全力冲刺（应保持7-8成力即可）']
  },
  '踩水练习': {
    muscles: ['核心肌群', '腿部耐力'],
    steps: ['在深水区（确保旁边有池边可扶），身体直立', '双腿做类似蛙泳腿的动作：交替向外蹬水', '双手在水面附近轻轻划水辅助保持平衡', '保持头部在水面以上，正常呼吸'],
    tips: ['踩水和蛙泳腿非常相似，学会蛙泳腿后踩水就容易了', '这是游泳中最重要的自救技能', '不要紧张，身体越放松越容易浮起来', '刚开始练习时请确保旁边有池边可以随时抓住'],
    mistakes: ['身体过度紧张导致下沉', '动作幅度太大消耗过多体力', '在没有安全保障的深水区独自练习']
  },
  '蹬壁转身练习': {
    muscles: ['核心', '腿部爆发力'],
    steps: ['游到池边时，一只手先触壁', '身体紧贴池壁蜷缩，双脚踩上池壁', '转身面向游来的方向，蹬壁出发', '进入流线型滑行后开始正常游进'],
    tips: ['开放式转身（非翻滚转身），适合初学者', '触壁后动作要紧凑，尽量减少停留时间', '蹬壁力度要大，利用好这段"免费加速"'],
    mistakes: ['在池边停留太久再出发', '蹬壁后身体不绷紧，浪费了惯性']
  },
  '自由泳打腿练习': {
    muscles: ['臀大肌', '股四头肌', '核心'],
    steps: ['双手扶住池边，身体俯卧浮在水面', '双腿伸直，从髋部发力上下交替打水', '膝盖保持微屈，不要大幅度弯曲', '脚踝放松，像鞭子的末端一样自然摆动', '打水幅度控制在30-40厘米'],
    tips: ['打腿的力量来自髋部（大腿根部），不是膝盖', '脚踝越放松，打水越有效率', '水花不应该太大，高效的打腿水花很小'],
    mistakes: ['膝盖大幅度弯曲（像蹬自行车一样踢水）', '脚踝僵硬（水阻极大，打不动水）', '只在水面以上打水（应该是水下为主）']
  },
  '自由泳划臂+侧头呼吸': {
    muscles: ['背阔肌', '三角肌', '核心旋转'],
    steps: ['站在浅水区，弯腰使肩膀入水', '单臂向前伸直，另一只手在体侧', '前伸的手向下向后划水，同时身体向划水手一侧微微转动', '划水手到体侧时，身体随之旋转，将嘴巴转到水面以上换气', '换完气后手举过头顶向前入水，开始另一侧'],
    tips: ['呼吸的秘诀：不是转头，而是转动整个身体（身体旋转带动头部）', '嘴巴只需要一半露出水面就能吸气', '先在站立状态下反复练习划臂+转头呼吸的配合'],
    mistakes: ['抬头呼吸（应该是侧头/转体呼吸）', '只转头不转身（容易脖子酸）', '划水时手臂越过中线（应该是直线向后划）']
  },
  '自由泳完整配合': {
    muscles: ['全身肌群', '心肺耐力'],
    steps: ['蹬壁出发，进入流线型滑行', '开始交替划臂，配合连续打腿', '每划2-3次手臂换一次气（侧头呼吸）', '保持身体水平，核心收紧'],
    tips: ['初学者建议先游短距离（10-15米），不要急于游全程', '呼吸是自由泳最大的挑战，不要着急，慢慢来', '如果觉得呛水，可以回到蛙泳调整后再尝试'],
    mistakes: ['头一直抬在水面上（应该大部分时间脸在水中）', '手脚动作不协调（先专注于放松地划水，不要用蛮力）', '因为紧张而加快频率（越快越乱，应该放慢节奏）']
  }
};

function showExDetail(name){
const info=EX_DETAIL[name];
// Find from DB for muscles
let dbEx=null;
for(const exs of Object.values(DB)){const f=exs.find(e=>e.n===name);if(f){dbEx=f;break}}
const muscles=info?.muscles||(dbEx?.muscle?.map(m=>m)||['—']);
const steps=info?.steps||[dbEx?.note || '暂无详细步骤'];
const tips=info?.tips||[];
const mistakes=info?.mistakes||[];

document.getElementById('ex-modal-title').textContent=name;
document.getElementById('ex-modal-muscles').innerHTML=muscles.map(m=>`<span class="jchip">${m}</span>`).join('');
document.getElementById('ex-modal-steps').innerHTML=steps.map((s,i)=>`<div class="ex-step"><span class="ex-step-n">${i+1}</span><span>${s}</span></div>`).join('');
document.getElementById('ex-modal-tips').innerHTML=tips.length?tips.map(t=>`<div class="ex-tip">${t}</div>`).join(''):'';
document.getElementById('ex-modal-mistakes').innerHTML=mistakes.length?`<p style="font-size:11px;font-weight:600;color:var(--terra);margin:8px 0 4px">常见错误</p>`+mistakes.map(m=>`<div class="ex-tip" style="border-color:var(--terra-br);color:var(--terra)">${m}</div>`).join(''):'';
document.getElementById('ex-modal').classList.add('open');
}
function closeExDetail(){document.getElementById('ex-modal').classList.remove('open');}

function calPrev(){_calWeekOffset-=2;render()}
function calNext(){if(_calWeekOffset<0){_calWeekOffset=Math.min(0,_calWeekOffset+2);render()}}
function calGoToday(){_calWeekOffset=0;S.selDate=todayStr();saveState();render()}

function showHistoryDetail(dateStr){
const entries=LOG.filter(l=>l.date===dateStr);
const modal=document.getElementById('hist-modal');
const content=document.getElementById('hist-modal-content');
if(!modal||!content)return;
const d=new Date(dateStr+'T12:00:00');
const dayName=['\u5468\u65e5','\u5468\u4e00','\u5468\u4e8c','\u5468\u4e09','\u5468\u56db','\u5468\u4e94','\u5468\u516d'][d.getDay()];
const dateFmt=`${d.getFullYear()}\u5e74${d.getMonth()+1}\u6708${d.getDate()}\u65e5 ${dayName}`;
if(!entries.length){content.innerHTML=`<div class="hist-detail-header"><span class="hist-detail-date">${dateFmt}</span><button class="ex-modal-close" onclick="closeHistModal()">\u2715</button></div><div class="hist-empty">\u8be5\u65e5\u6682\u65e0\u8bad\u7ec3\u8bb0\u5f55</div>`;modal.classList.add('open');return}
let html=`<div class="hist-detail-header"><span class="hist-detail-date">${dateFmt}</span><button class="ex-modal-close" onclick="closeHistModal()">\u2715</button></div>`;
entries.forEach(entry=>{
html+=`<div class="hist-detail-meta"><span class="hist-detail-chip type">${entry.workout||'\u8bad\u7ec3'}</span><span class="hist-detail-chip dur">${entry.duration||'?'}\u5206\u949f</span>${entry.rpe?`<span class="hist-detail-chip rpe">RPE ${entry.rpe}/10</span>`:''}${entry.mood?`<span class="hist-detail-chip mood">${entry.mood}</span>`:''}</div>`;
if(entry.exercises&&entry.exercises.length){
html+=`<div class="hist-detail-exercises">`;
entry.exercises.forEach(ex=>{html+=`<div class="hist-ex-row"><span class="hist-ex-name" onclick="showExDetail('${ex.name}')" style="cursor:pointer">${ex.name} <i class="ti ti-info-circle" style="font-size:11px;opacity:.4"></i></span><span class="hist-ex-detail"><span>${ex.sets||'?'}\u00d7${ex.reps||'?'}${ex.unit||'\u6b21'}</span>${ex.weight?`<span class="hist-ex-weight">${ex.weight}kg</span>`:''}</span></div>`});
html+=`</div>`}
if(entry.note)html+=`<div class="hist-note">"${entry.note}"</div>`;
});
content.innerHTML=html;modal.classList.add('open');
}
function closeHistModal(){document.getElementById('hist-modal').classList.remove('open')}


