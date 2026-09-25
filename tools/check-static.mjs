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
if (!fs.existsSync('training-model.js')) errors.push('missing runtime file: training-model.js');

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
if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?/i.test(html)) errors.push('index.html: viewport must allow user zoom');
if (!html.includes('<form id="login-form"')) errors.push('index.html: login inputs must live in a form');
if (!html.includes('role="dialog"') || !html.includes('aria-modal="true"') || !html.includes('aria-hidden="true"')) errors.push('index.html: modal accessibility semantics missing');
const tmPos=html.indexOf('src="training-model.js"'), corePos=html.indexOf('src="core.js"');
if (tmPos < 0 || corePos < 0 || tmPos > corePos) errors.push('index.html: training-model.js must load before core.js');

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
if (!sw.includes("'./assets/obfuscated_v2.json'")) {
  errors.push('sw.js: runtime data asset is not pre-cached');
}
if (!sw.includes("'./training-model.js'")) errors.push('sw.js: training-model.js is not pre-cached');
const fontHref=(html.match(/href=["'](https:\/\/fonts\.googleapis\.com\/css2\?[^"']+)["']/)||[])[1];
if (!fontHref || !sw.includes(`'${fontHref}'`)) errors.push('sw.js: Google Fonts CSS URL must match index.html');
if (!sw.includes('lxgw-wenkai-webfont@1.7.0/style.css')) errors.push('sw.js: LXGW font CSS should be best-effort cached');

const rules = fs.readFileSync('firestore.rules', 'utf8');
for (const invariant of [
  'request.auth.uid == uid',
  'allowedReaders',
  'match /shared/{docId}',
]) {
  if (!rules.includes(invariant)) errors.push(`firestore.rules: missing security invariant ${invariant}`);
}

const app = fs.readFileSync('app.js', 'utf8');
if (!app.includes("fetch('assets/obfuscated_v2.json')")) {
  errors.push('app.js: runtime data path does not use assets/obfuscated_v2.json');
}
if (!app.includes('allowedReaders: pu?[pu]:[]')) {
  errors.push('app.js: shared-profile reader whitelist invariant missing');
}
if (/status\.innerHTML\s*=\s*[`'"][^\n]*_partnerProfile/.test(app)) {
  errors.push('app.js: partner-controlled profile data must not be rendered through innerHTML');
}
if (!app.includes("nameEl.textContent=String(_partnerProfile.name||'搭子')")) {
  errors.push('app.js: partner display name must use textContent');
}

const core = fs.readFileSync('core.js', 'utf8');
const copySurface = [html, app, core].join('\n');
for (const phrase of ['避免肌肉结块', '帮助肌肉拉长', '低负重高次数', '我的的计划']) {
  if (copySurface.includes(phrase)) errors.push(`misleading/regressed UI copy found: ${phrase}`);
}
if (!core.includes("const APP_VERSION = 'v2.2.0'")) errors.push('core.js: APP_VERSION must be v2.2.0');
if (!core.includes('const APP_BUILD = 150')) errors.push('core.js: APP_BUILD must be 150');
if (!core.includes("const APP_BUILD_DATE = '2026-09-21'")) errors.push('core.js: build date drift');
if (!sw.includes("const CACHE = 'cici-fitness-v150'")) errors.push('sw.js: cache version must match build 150');
if (!html.includes('v2.2.0 (build 150)')) errors.push('index.html: displayed version must match build');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`static check: ${tracked.size} tracked files; entrypoint, assets, JSON and Firestore invariants OK`);
