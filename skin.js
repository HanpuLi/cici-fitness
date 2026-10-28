// ══ skin.js — 界面风格:纸墨 / 运动 ═══════════════════════════════════════
// 先于 ui.js 加载;函数只在调用时才读 S / uiCurrentTab 等全局。
//
// 存在哪:
//   · 账号设置 S.skin = 'paper' | 'sport',跟着 fit_s1 一起存、一起云同步(app.js saveState / loadState)。
//     老存档没有这个字段 = 一直在用纸墨,loadState 补成 'paper';新用户在新手设置第 0 步默认「运动」。
//   · 本机缓存 localStorage.fit_skin:给 index.html <head> 的开机脚本用,CSS 生效前就给 <html> 设 data-skin,
//     免得先闪一下纸墨。缓存只是开机用的影子,以账号设置为准。
//   · 深浅(fit_theme,只存本机)和风格互相独立。
//
// 样式:纸墨在 style.css(和 v155 一字不差);运动在 skin-sport.css,每条规则都以 html[data-skin="sport"] 开头。
// 运动风格换了 HTML 结构的块,模板在 skin-sport.js(SKIN_TPL.sport.*)。
//
// 模板接口(运动风格要换 HTML 结构时用):
//   渲染函数里把某一块写成  skinTpl('exRow', ctx, ctx => 纸墨原来的 HTML)
//   运动风格在 skin-sport.js 里 SKIN_TPL.sport.exRow = (ctx, paper) => 新 HTML 给出自己的版本(paper 是纸墨那版,可以复用)。
//   没注册的名字一律走纸墨原样,所以可以一块一块地换。换风格时 skinRerender() 会把当前页重画一遍。

const SKIN_TPL = { paper: {}, sport: {} };

function skinValid(k) { return k === 'sport' || k === 'paper'; }
function uiSkin() { return document.documentElement.getAttribute('data-skin') === 'sport' ? 'sport' : 'paper'; }
function skinHas(name) { const t = SKIN_TPL[uiSkin()]; return !!(t && t[name]); }
// 渲染完一页之后的钩子(运动风格的计时显示等要在 DOM 落地后接上);纸墨没注册,什么也不做
function skinAfterRender(page) { const f = SKIN_TPL[uiSkin()] && SKIN_TPL[uiSkin()]['after_' + page]; if (f) try { f(); } catch (e) { } }
function skinTpl(name, ctx, paperFn) {
  const f = SKIN_TPL[uiSkin()] && SKIN_TPL[uiSkin()][name];
  return f ? f(ctx, paperFn) : paperFn(ctx);
}

// 只把页面换成这套风格(不改账号设置):开机读到存档、云端同步下来、新手设置给默认值时用
function skinApply(k) {
  k = k === 'sport' ? 'sport' : 'paper';
  const d = document.documentElement;
  if (k === 'sport' && typeof cfSkinFonts === 'function') cfSkinFonts('sport');
  if (d.getAttribute('data-skin') !== k) d.setAttribute('data-skin', k);
  try { localStorage.setItem('fit_skin', k); } catch (e) { }
  if (typeof cfThemeColor === 'function') cfThemeColor();
  if (typeof skinMasthead === 'function') skinMasthead();
}
// 用户点了「我 → 外观」或新手设置里的风格:存账号设置(随云同步)+ 重画
function skinSet(k) {
  if (!skinValid(k)) return;
  const changed = k !== uiSkin() || S.skin !== k;
  S.skin = k;
  skinApply(k);
  if (!changed) return;
  if (typeof saveState === 'function') saveState();
  if (typeof flashSaved === 'function') flashSaved();
  skinRerender();
}
// 新手设置第一次自动弹出、账号里还没有风格:默认「运动」。不改已有用户的选择
function skinNewUserDefault() {
  if (typeof S === 'undefined' || skinValid(S.skin)) return;
  S.skin = 'sport';
  skinApply('sport');
}
// 当前页重画一遍(以后运动风格换了模板,纯 CSS 换不过来的部分靠这一步)。别的页签切过去时本来就会重画
function skinRerender() {
  if (typeof render === 'function') render();
  if (typeof showTab === 'function' && typeof uiCurrentTab !== 'undefined') showTab(uiCurrentTab);
  if (typeof _oobe !== 'undefined' && _oobe.open && typeof uiRenderOobe === 'function') uiRenderOobe();
}

// ── 风格选择器:「我 → 02 外观」、新手设置第 0 步 ──
// 两套风格各画各的:纸墨下是纸墨的纯文字分段(和「深浅」那排一样),运动下是运动的分段(带一行小字)。
// 不画跨风格的预览,也不在纸墨下加载运动字体 —— 纸墨里不出现任何运动的东西,反过来也一样。
function skinSegHtml(id = 'skin-seg', label = '风格') {
  const cur = uiSkin();
  const opts = cur === 'sport'
    ? [['sport', '运动', '无衬线 · 粗 · 荧光绿'], ['paper', '纸墨', '衬线 · 安静 · 绛红']]
    : [['paper', '纸墨'], ['sport', '运动']];
  return uiSeg(id, 'skin', opts, cur, { label });
}
function skinPickHtml() {
  const hint = uiSkin() === 'sport' ? '先挑个顺眼的样子 · 之后在「我 → 外观」能换' : '样子 · 之后在「我 → 外观」能换';
  return `<span class="sub-label" style="margin-top:4px">${hint}</span>` + skinSegHtml('ob-skin', '界面风格');
}

// ── 分享卡片(canvas)的字体跟着风格走 ──
// app.js 画卡片时 ctx = skinCanvas(canvas.getContext('2d')):之后照旧写纸墨的字体串,
// 运动风格下这里把字族换成运动的;另外记下画过的字和字体。调用方画完调 skinCanvasRedraw(重画函数):
// 字体都到位就什么也不做,否则等字体再画一遍(canvas 不会自己等网络字体,第一次画可能落到系统字体上)。
const SKIN_CANVAS_FONTS = {
  head: '"Noto Sans SC", "Barlow", system-ui, sans-serif',
  label: '"Barlow Condensed", "Noto Sans SC", system-ui, sans-serif',
  body: '"Barlow", "Noto Sans SC", system-ui, sans-serif',
  cjk: '"Noto Sans SC", system-ui, sans-serif'
};
function skinCanvasFont(paperFont) {
  if (uiSkin() !== 'sport') return paperFont;
  const m = String(paperFont).match(/^\s*((?:(?:normal|italic|oblique|bold|bolder|lighter|[1-9]00)\s+)*)(\d+(?:\.\d+)?px)\s+(.+)$/);
  if (!m) return paperFont;
  const bold = /\b(bold|[6-9]00)\b/.test(m[1]), size = m[2], fam = m[3];
  if (/ZCOOL/.test(fam)) return `900 ${size} ${SKIN_CANVAS_FONTS.head}`;
  if (/Courier/.test(fam)) return `${bold ? 700 : 600} ${size} ${SKIN_CANVAS_FONTS.label}`;
  if (/Garamond/.test(fam)) return `${bold ? 700 : 500} ${size} ${SKIN_CANVAS_FONTS.body}`;
  return `${bold ? 700 : 400} ${size} ${SKIN_CANVAS_FONTS.cjk}`;
}
let _skinCanvasLast = null;   // 最近一次 skinCanvas() 记下的 {字体: 画过的字}
function skinCanvas(ctx) {
  const used = _skinCanvasLast = new Map();
  const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
  if (desc && desc.set) Object.defineProperty(ctx, 'font', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, skinCanvasFont(v)); } });
  const fill = ctx.fillText;
  ctx.fillText = function (t, ...rest) { const f = this.font; used.set(f, (used.get(f) || '') + String(t)); return fill.call(this, t, ...rest); };
  return ctx;
}
// 画完调用:字体都已就绪就什么也不做;否则等字体(最多 3 秒)再执行 redraw(redraw 里画的那次不会再触发)
function skinCanvasRedraw(redraw) {
  const used = _skinCanvasLast; _skinCanvasLast = null;
  if (!used || !used.size || !document.fonts || !document.fonts.load) return;
  const need = [...used].filter(([f, t]) => { try { return !document.fonts.check(f, t); } catch (e) { return false; } });
  if (!need.length) return;
  Promise.race([
    Promise.all(need.map(([f, t]) => document.fonts.load(f, t).catch(() => null))),
    new Promise(r => setTimeout(r, 3000))
  ]).then(() => { try { redraw(); } catch (e) { } });
}
