#!/usr/bin/env node
/**
 * alwled — فحص ثابت للواجهة الأمامية (لا يوجد build خطوة: الواجهة HTML/CSS/JS صِرفة).
 * يتحقق من:
 *   1) وجود كل ملف مُشار إليه في index.html
 *   2) صحة صياغة كل ملفات JS (parse عبر vm)
 *   3) عدم وجود أي مورد خارجي/CDN (استدعاء شبكي للطرف الثالث)
 *   4) عدم وجود أسرار أو رموز دخول مكتوبة في الواجهة
 *   5) الأساسيات: dir=rtl، lang=ar، ملفات تصميم موجودة
 * يُستخدم في npm run frontend:check (وفي CI إن أُضيف).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const problems = [];
const notes = [];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function walk(dir, filter, acc = []) {
  const full = path.join(ROOT, dir);
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(relative, filter, acc);
    else if (filter(relative)) acc.push(relative);
  }
  return acc;
}

/* 1) referenced assets exist ------------------------------------------------ */
const html = read('index.html');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (ref.startsWith('#')) continue; // in-page anchor
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) {
    problems.push(`external asset reference in index.html: ${ref}`);
    continue;
  }
  if (!fs.existsSync(path.join(ROOT, ref))) problems.push(`missing asset: ${ref}`);
}
notes.push(`index.html references ${refs.length} local assets`);

/* 2) JS parses -------------------------------------------------------------- */
const jsFiles = walk('assets/js', (file) => file.endsWith('.js'));
for (const file of jsFiles) {
  try {
    new vm.Script(read(file), { filename: file });
  } catch (error) {
    problems.push(`syntax error in ${file}: ${error.message}`);
  }
}
notes.push(`${jsFiles.length} JS files parsed`);

/* 3) no third-party runtime dependencies ----------------------------------- */
const externalPattern = /(?:fetch|src|href|url)\s*[=(]\s*['"`]https?:\/\/(?!127\.0\.0\.1|localhost)[^'"`]+/gi;
for (const file of jsFiles.concat(walk('assets/css', (f) => f.endsWith('.css')))) {
  const content = read(file);
  const matches = content.match(externalPattern);
  if (matches) problems.push(`external resource in ${file}: ${matches.join(', ')}`);
  if (/@import\s+url\(https?:/i.test(content)) problems.push(`CSS @import from the network in ${file}`);
}
if (html.includes('cdn.') || html.includes('unpkg') || html.includes('jsdelivr')) {
  problems.push('index.html references a CDN');
}
notes.push('no CDN / third-party runtime dependency found');

/* 4) no secrets or credentials in the frontend ----------------------------- */
const secretPatterns = [
  [/ghp_[A-Za-z0-9]{20,}/, 'github token'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'github fine-grained token'],
  [/AKIA[0-9A-Z]{16}/, 'aws key'],
  [/sk-[A-Za-z0-9]{20,}/, 'api key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/DATABASE_URL\s*[:=]\s*['"`]postgres/i, 'database url'],
  [/JWT_SECRET\s*[:=]\s*['"`][^'"`]+/i, 'jwt secret'],
];
const allFrontendFiles = walk('.', (file) => /\.(js|css|html|json|md)$/.test(file));
for (const file of allFrontendFiles) {
  const content = read(file);
  for (const [pattern, label] of secretPatterns) {
    if (pattern.test(content)) problems.push(`possible ${label} in ${file}`);
  }
}
notes.push(`scanned ${allFrontendFiles.length} files for secrets`);

/* 5) accessibility/RTL basics ---------------------------------------------- */
if (!/dir="rtl"/.test(html)) problems.push('index.html is missing dir="rtl"');
if (!/lang="ar"/.test(html)) problems.push('index.html is missing lang="ar"');
if (!/viewport-fit=cover/.test(html)) notes.push('viewport-fit=cover not set (minor, mobile safe areas)');
for (const required of ['assets/css/tokens.css', 'assets/css/base.css', 'assets/css/components.css', 'assets/css/layout.css']) {
  if (!refs.includes(required)) problems.push(`design system file not linked: ${required}`);
}

/* 6) debug leftovers -------------------------------------------------------- */
for (const file of jsFiles) {
  const content = read(file);
  const logs = content.match(/console\.(log|debug)\(/g);
  if (logs) problems.push(`console.${logs.length > 1 ? 'log/debug' : 'log'} left in ${file}`);
}

/* report ------------------------------------------------------------------- */
console.log('alwled frontend check');
console.log('='.repeat(52));
notes.forEach((note) => console.log(`· ${note}`));
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):`);
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}
console.log('\n✓ frontend check passed (static, offline, no secrets, RTL ready)');
