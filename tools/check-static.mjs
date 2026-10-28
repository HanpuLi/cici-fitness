import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const tracked = new Set(
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
);

const forbiddenTracked = [
  '.DS_Store',
  'AGENTS.md',
  'skill.md',
  'setup.md',
  '护肤计划.html',
];
for (const item of forbiddenTracked) {
  if (tracked.has(item)) errors.push(`repository boundary: ${item} must not be tracked`);
}

for (const file of ['core.js', 'app.js', 'dev.js', 'sw.js']) {
  if (!tracked.has(file)) errors.push(`missing runtime file: ${file}`);
}

for (const file of ['manifest.json', 'firebase.json']) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${file}: invalid JSON: ${error.message}`);
  }
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (manifest.start_url !== './index.html') {
  errors.push(`manifest.json: start_url must be ./index.html, got ${JSON.stringify(manifest.start_url)}`);
}

const html = fs.readFileSync('index.html', 'utf8');
if (!/<meta\s+name=["']viewport["']/i.test(html)) errors.push('index.html: missing viewport meta');
if (!/<title[^>]*>[^<]+<\/title>/i.test(html)) errors.push('index.html: missing non-empty title');

function localPath(ref, sourceDir = '.') {
  if (!ref || ref.startsWith('#')) return null;
  if (/^(?:https?:|data:|mailto:|tel:|javascript:)/i.test(ref)) return null;
  const clean = decodeURIComponent(ref.split('#')[0].split('?')[0]);
  if (!clean) return null;
  return path.resolve(root, sourceDir, clean);
}

const attributeRe = /\b(?:href|src)=["']([^"']+)["']/gi;
let match;
while ((match = attributeRe.exec(html))) {
  const target = localPath(match[1]);
  if (target && !fs.existsSync(target)) errors.push(`index.html: missing local reference ${match[1]}`);
}

const sw = fs.readFileSync('sw.js', 'utf8');
for (const ref of sw.matchAll(/['"](\.\/[A-Za-z0-9_./@-]+)['"]/g)) {
  const target = localPath(ref[1]);
  if (target && !fs.existsSync(target)) errors.push(`sw.js: missing cached asset ${ref[1]}`);
}
if (/private\//.test(sw)) {
  errors.push('sw.js: must not reference the owner-only private/ bundle');
}

const rules = fs.readFileSync('firestore.rules', 'utf8');
for (const invariant of [
  'request.auth.uid == uid',
  'allowedReaders',
  'match /shared/{docId}',
]) {
  if (!rules.includes(invariant)) errors.push(`firestore.rules: missing security invariant ${invariant}`);
}

const app = fs.readFileSync('app.js', 'utf8');
if (!app.includes('allowedReaders: pu?[pu]:[]')) {
  errors.push('app.js: shared-profile reader whitelist invariant missing');
}
if (/status\.innerHTML\s*=\s*[`'"][^\n]*_partnerProfile/.test(app)) {
  errors.push('app.js: partner-controlled profile data must not be rendered through innerHTML');
}
if (!app.includes("nameEl.textContent=String(_partnerProfile.name||'搭子')")) {
  errors.push('app.js: partner display name must use textContent');
}

// ══ 公开文件不得夹带 owner 专属扩展内容 ══════════════════════════
// private/ 只在本机 / 后端,不进公开仓库;这里扫的是「会被发布的」文件:git 跟踪的 + 未忽略的新文件。
// 私有源仓库(HanpuLi/cici-fitness-src)本来就跟踪 private/xp.js;公开发布仓库里一个都不能有。
const isSourceRepo = process.env.GITHUB_REPOSITORY === 'HanpuLi/cici-fitness-src' || (() => {
  try { return /cici-fitness-src/.test(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' })); } catch { return false; }
})();
for (const f of tracked) {
  if (f.startsWith('private/') && !isSourceRepo) errors.push(`repository boundary: ${f} (private/) must not be tracked`);
}
const untracked = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);
const PUBLIC_EXT = /\.(?:js|mjs|cjs|html|css|json|md|svg|txt|yml|yaml)$/i;
const publicFiles = [...new Set([...tracked, ...untracked])]
  .filter(f => PUBLIC_EXT.test(f) && !f.startsWith('private/') && !f.includes('node_modules/') && fs.existsSync(f));
const publicText = new Map(publicFiles.map(f => [f, fs.readFileSync(f, 'utf8')]));

// 1) 长 base64 串(≥80):编码过的内容同样算内容。npm lockfile 的 integrity 哈希除外。
for (const [f, text] of publicText) {
  for (const m of text.matchAll(/[A-Za-z0-9+/]{80,}={0,2}/g)) {
    if (/sha(?:1|256|384|512)-$/.test(text.slice(Math.max(0, m.index - 7), m.index))) continue;
    const line = text.slice(0, m.index).split('\n').length;
    errors.push(`${f}:${line}: base64-like run of ${m[0].length} chars (encoded content must live in private/)`);
  }
}

// 2) 不得在公开代码里给 XP 赋内容字面量(XP 只能由 private/xp.js 填)
for (const [f, text] of publicText) {
  if (/\bwindow\.XP\s*=\s*\{|\bXP\s*=\s*\{/.test(text)) errors.push(`${f}: assigns an XP content literal outside private/`);
}

// 3) 敏感词:只存长度 + 滚动哈希 + sha256 前缀,词本身不进公开仓库。匹配不区分大小写。
//    覆盖:英文性质词 4 个 + 原问卷/提示/写作台/动作别名里有代表性的中文片段 14 个。
const SENSITIVE = [[4,222044192,'9ddcab3ac3610db0'],[5,1893274466,'e531352262538e0c'],[8,1445884230,'52a8d2c2c0b772ff'],[10,593653214,'293f1d2ee206a7cb'],
  [2,2846581,'52a35a7186820e99'],[2,5200355,'42b6c096f3fc492f'],[2,2653394,'5c553fb16d588ec8'],[4,1040462956,'9061936a8add4c20'],[4,2070840863,'a210ffa2acadbf46'],
  [4,1675308907,'e3c7963d270641ca'],[7,44955491,'757f99c195a2f627'],[4,404339239,'0a5cbd8f9793d218'],[4,492679605,'bee9adb3a6427f65'],[5,1958510493,'fbce6bc1acd1e405'],
  [4,863571141,'99a4735626d62449'],[4,1810874920,'8d5f99a846a515d5'],[6,1610722281,'05086372a623d41a'],[4,54722824,'b513a450ccf9eb85']];
{
  const { createHash } = await import('node:crypto');
  const B = 131, M = 2147483647;
  const byLen = new Map();
  for (const [len, rk, sha] of SENSITIVE) { if (!byLen.has(len)) byLen.set(len, new Map()); byLen.get(len).set(rk, sha); }
  for (const [f, raw] of publicText) {
    const text = raw.toLowerCase();
    for (const [len, table] of byLen) {
      if (text.length < len) continue;
      let pw = 1; for (let i = 1; i < len; i++) pw = (pw * B) % M;
      let h = 0; for (let i = 0; i < len; i++) h = (h * B + text.charCodeAt(i)) % M;
      for (let i = 0; ; i++) {
        const sha = table.get(h);
        if (sha && createHash('sha256').update(text.slice(i, i + len)).digest('hex').slice(0, 16) === sha) {
          errors.push(`${f}:${text.slice(0, i).split('\n').length}: sensitive term (length ${len}) in a public file`);
        }
        if (i + len >= text.length) break;
        h = (h - (text.charCodeAt(i) * pw) % M + M) % M;
        h = (h * B + text.charCodeAt(i + len)) % M;
      }
    }
  }
}

// 4) 拿得到扩展包时(本仓库的 private/xp.js,或发布脚本用 XP_BUNDLE 指过来的源仓库那份):
//    它里面的每段文本(解码后)都不得出现在公开文件里。只报位置不报内容。
const XP_PATH = process.env.XP_BUNDLE || 'private/xp.js';
if (fs.existsSync(XP_PATH)) {
  const vm = await import('node:vm');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  try { vm.runInNewContext(fs.readFileSync(XP_PATH, 'utf8'), sandbox, { timeout: 5000 }); } catch {}
  const X = sandbox.window.XP;
  if (!X) errors.push('private/xp.js: did not set window.XP');
  else {
    const dbNames = new Set();
    for (const f of ['core.js']) for (const m of (publicText.get(f) || '').matchAll(/\bn:\s*'([^']+)'/g)) dbNames.add(m[1]);
    const dec = s => { if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length % 4) return null; try { return decodeURIComponent(Buffer.from(s, 'base64').toString('latin1')); } catch { return null; } };
    const needles = new Map();   // 文本 → 来源键路径
    const add = (t, where) => {
      for (const piece of String(t).split(/<[^>]*>|\n/)) { const p = piece.trim(); if (p.length >= 4) needles.set(p, where); }
    };
    const walk = (v, path) => {
      if (typeof v === 'string') { const d = dec(v); if (d) add(d, path); if (v.length >= 16) add(v, path + '(raw)'); else if (!d) add(v, path); return; }
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[' + i + ']')); return; }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path + '.' + k);
    };
    for (const k of ['exDesc', 'db', 'danmakuExtra', 'curveTipHtml', 'labels', 'noteOverrides']) walk(X[k], k);
    for (const k of Object.keys(X.renames || {})) add(k, 'renames(key)');
    for (const k of [...Object.keys(X.exDesc || {}), ...Object.keys(X.db?.danmaku?.specific || {})]) if (!dbNames.has(k)) add(k, 'key');
    for (const [f, text] of publicText) {
      for (const [n, where] of needles) if (text.includes(n)) errors.push(`${f}: contains text from private/xp.js ${where} (${n.length} chars)`);
    }
    console.log(`private bundle check: ${needles.size} private text pieces vs ${publicText.size} public files`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`static check: ${errors.length} problem(s)`);
  process.exitCode = 1;   // 不用 process.exit():输出很长时会截断管道里的 stderr
} else {
  console.log(`static check: ${tracked.size} tracked files, ${publicText.size} public files scanned; entrypoint, assets, JSON, Firestore and private-content boundary OK`);
}
