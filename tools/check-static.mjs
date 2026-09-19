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
if (!sw.includes("'./assets/obfuscated_v2.json'")) {
  errors.push('sw.js: runtime data asset is not pre-cached');
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
if (!app.includes("fetch('assets/obfuscated_v2.json')")) {
  errors.push('app.js: runtime data path does not use assets/obfuscated_v2.json');
}
if (!app.includes('allowedReaders: pu?[pu]:[]')) {
  errors.push('app.js: shared-profile reader whitelist invariant missing');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`static check: ${tracked.size} tracked files; entrypoint, assets, JSON and Firestore invariants OK`);
