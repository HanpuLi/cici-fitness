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

const viewport = html.match(/<meta\s+name=["']viewport["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] || '';
if (/maximum-scale\s*=|user-scalable\s*=\s*no/i.test(viewport)) {
  errors.push('index.html: viewport must allow pinch zoom');
}
if (!fs.existsSync('training-model.js')) errors.push('missing runtime file: training-model.js');
const trainingScript = html.indexOf('<script src="training-model.js"></script>');
const coreScript = html.indexOf('<script src="core.js"></script>');
if (trainingScript < 0 || coreScript < 0 || trainingScript > coreScript) {
  errors.push('index.html: training-model.js must load before core.js');
}
if (!/<form\b[^>]*id=["']login-form["'][^>]*>/i.test(html) ||
    !/<button\b[^>]*type=["']submit["'][^>]*>登录<\/button>/i.test(html)) {
  errors.push('index.html: email login must use a real form with a submit button');
}
for (const id of ['login-modal','rpe-modal','ex-modal','workout-modal','hist-modal','share-modal','achievement-modal']) {
  const tag = html.match(new RegExp(`<div[^>]*id=["']${id}["'][^>]*>`, 'i'))?.[0] || '';
  if (!/role=["']dialog["']/i.test(tag) || !/aria-modal=["']true["']/i.test(tag) ||
      !/aria-hidden=["']true["']/i.test(tag) || !/\shidden(?:\s|>|=)/i.test(tag)) {
    errors.push(`index.html: ${id} must start hidden with dialog/aria-modal/aria-hidden semantics`);
  }
}

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
if (!sw.includes("'./training-model.js'")) {
  errors.push('sw.js: training-model.js is not pre-cached');
}
const googleFontUrl = html.match(/href=["'](https:\/\/fonts\.googleapis\.com\/css2\?[^"']+)["']/i)?.[1];
if (!googleFontUrl) errors.push('index.html: main Google Fonts stylesheet URL not found');
else if (!sw.includes(`'${googleFontUrl}'`)) errors.push('sw.js: Google Fonts precache URL must exactly match index.html');
const lxgwUrl = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css';
if (html.includes(lxgwUrl) && !sw.includes(`'${lxgwUrl}'`)) {
  errors.push('sw.js: LXGW stylesheet must be included in best-effort CDN caching');
}
for (const authHost of ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firestore.googleapis.com']) {
  if (!sw.includes(authHost)) errors.push(`sw.js: auth/database bypass host missing: ${authHost}`);
}
if (!sw.includes("url.pathname.startsWith('/__/auth')") || !sw.includes("url.pathname.startsWith('/__/firebase')")) {
  errors.push('sw.js: Firebase auth path bypass invariant missing');
}

const rules = fs.readFileSync('firestore.rules', 'utf8');
for (const invariant of [
  'request.auth.uid == uid',
  'allowedReaders',
  'match /shared/{docId}',
]) {
  if (!rules.includes(invariant)) errors.push(`firestore.rules: missing security invariant ${invariant}`);
}
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
if (!/firestore-rules:\s*[\s\S]*npm run test:rules/.test(ci)) {
  errors.push('CI: Firestore rules emulator job must remain present');
}

const app = fs.readFileSync('app.js', 'utf8');
const core = fs.readFileSync('core.js', 'utf8');
const trainingModel = fs.readFileSync('training-model.js', 'utf8');
if (!core.includes('TrainingModel.createSessionBudget') || !core.includes('TrainingModel.fitExercisesToBudget')) {
  errors.push('core.js: training-model.js is not wired into plan generation');
}
if (!core.includes("let _mockDate = sessionStorage.getItem('__dev_mock_date__') || null;")) {
  errors.push('core.js: _mockDate development time override invariant missing');
}
if (!trainingModel.includes('createSessionBudget') || !trainingModel.includes('fitExercisesToBudget')) {
  errors.push('training-model.js: expected pure budget API missing');
}
if (!app.includes("fetch('assets/obfuscated_v2.json')")) {
  errors.push('app.js: runtime data path does not use assets/obfuscated_v2.json');
}
if (!app.includes('allowedReaders: pu?[pu]:[]')) {
  errors.push('app.js: shared-profile reader whitelist invariant missing');
}
if (/status\.innerHTML\s*=\s*[`'"][^\n]*_partnerProfile/.test(app) ||
    /\.innerHTML\s*=[^\n]*_partnerProfile/.test(app)) {
  errors.push('app.js: partner-controlled profile data must not be rendered through innerHTML');
}
if (!app.includes("nameEl.textContent=String(_partnerProfile.name||'搭子')")) {
  errors.push('app.js: partner display name must use textContent');
}

const combinedCopy = [html, core, app].join('\n');
for (const phrase of ['避免肌肉结块', '帮助肌肉拉长', '我的的计划']) {
  if (combinedCopy.includes(phrase)) errors.push(`misleading/regressed copy is forbidden: ${phrase}`);
}
if (!core.includes("const APP_VERSION = 'v2.2.0';") ||
    !core.includes('const APP_BUILD = 150;') ||
    !core.includes("const APP_BUILD_DATE = '2026-09-21';") ||
    !sw.includes("const CACHE = 'cici-fitness-v150';") ||
    !html.includes('Cici健身计划 v2.2.0 (build 150)')) {
  errors.push('version/build/cache identifiers are not synchronized at v2.2.0 build 150');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`static check: ${tracked.size} tracked files; entrypoint, assets, JSON and Firestore invariants OK`);
