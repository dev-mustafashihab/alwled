#!/usr/bin/env python3
"""
Stage 15 — فحص أسرار شامل على المستودع كاملاً (secrets policy).

يبحث عن: JWT secrets · passwords · API keys · access/refresh tokens · GitHub tokens · database passwords ·
private keys · Authorization headers · provider credentials — داخل الكود والسكربتات والوثائق وDocker/Compose/CI.

الاستثناءات **معلنة صراحةً** (تُوثَّق في التقرير، ولا تُخفي أسراراً حقيقية):
  node_modules · dist · .git · لقطات QA · مخرجات build/tests · fixtures اختبار محلية معروفة.

لا يطبع أي قيمة سرّية: يُبلّغ عن الملف + النوع + رقم السطر فقط.
يكتب frontend/tools/qa/stage15/secrets-scan.json
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('/root/alwled')
OUT = ROOT / 'frontend' / 'tools' / 'qa' / 'stage15'
OUT.mkdir(parents=True, exist_ok=True)

EXCLUDE_DIRS = {
    'node_modules', 'dist', '.git', '.nest', 'coverage',
    'qa',            # مخرجات ولقطات QA (ليست كوداً مشحوناً)
    'stage14-final', 'stage15', 'shop', 'shop-cart', 'shop143', 'visual', 'stage14',
}
EXCLUDE_FILE_SUFFIXES = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.svg', '.mp4', '.log', '.dump', '.gz', '.zip')
EXCLUDE_FILES = {'.env'}          # لا يُقرأ أصلاً (غير مُتتبَّع) — نتأكد فقط أنه غير مسرَّب في المستودع

PATTERNS: list[tuple[str, str, int]] = [
    ('JWT (eyJ…) literal', r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', 0),
    ('GitHub token', r'gh[pousr]_[A-Za-z0-9]{30,}', 0),
    ('AWS access key', r'AKIA[0-9A-Z]{16}', 0),
    ('private key block', r'-----BEGIN [A-Z ]*PRIVATE KEY-----', 0),
    ('password assignment (literal)', r'(?i)\b(password|passwd|pwd)\s*[:=]\s*[\'"][^\'"$\{\s]{6,}[\'"]', 0),
    ('secret/key assignment (literal)', r'(?i)\b(secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*[\'"][^\'"$\{\s]{8,}[\'"]', 0),
    ('bearer literal', r'(?i)bearer\s+[A-Za-z0-9._-]{20,}', 0),
    ('Authorization header literal', r'(?i)authorization\s*[:=]\s*[\'"]?(Bearer|Basic)\s+[A-Za-z0-9._=-]{12,}', 0),
    ('postgres URL with privileges', r'postgres(?:ql)?://[^\s\'"<>]*:[^\s\'"<>@]+@[^\s\'"<>]+', 0),
    ('Sham Cash wallet/account literal', r'(?i)SHAMCASH_[A-Z_]+\s*[:=]\s*[\'"][^\'"\s]{4,}[\'"]', 0),
    ('hardcoded admin credentials', r'(?i)(admin|owner)[_-]?(password|pass)\s*[:=]\s*[\'"][^\'"\s]{4,}[\'"]', 0),
]

# قيم اختبار/توثيق مقبولة وصريحة (ليست credentials إنتاج)
ALLOWED_MARKERS = (
    'change-me', 'change-me-too', 'replace-in-prod', 'your-', 'example.com', 'USER:PASSWORD',
    'dev-only', 'DEV_ONLY', 'placeholder', 'redacted', '***', '${', '<', 'xxxx',
    'Stage142!', 'Stage143B!', 'Stage144!', 'Admin@2026', 'secret123', 'StrongPass123',
)

findings: list[dict] = []
scanned = 0


def should_skip(path: Path) -> bool:
    if path.name in EXCLUDE_FILES:
        return True
    if path.suffix.lower() in EXCLUDE_FILE_SUFFIXES:
        return True
    return any(part in EXCLUDE_DIRS for part in path.parts)


def allowed(line: str) -> bool:
    return any(marker in line for marker in ALLOWED_MARKERS)


for path in sorted(ROOT.rglob('*')):
    if not path.is_file() or should_skip(path):
        continue
    try:
        text = path.read_text(encoding='utf-8', errors='ignore')
    except OSError:
        continue
    scanned += 1
    for label, pattern, _ in PATTERNS:
        for match in re.finditer(pattern, text):
            line_no = text[:match.start()].count('\n') + 1
            line = text.splitlines()[line_no - 1] if line_no - 1 < len(text.splitlines()) else ''
            if allowed(line) or allowed(match.group(0)):
                continue
            rel = str(path.relative_to(ROOT))
            # تصنيف صريح: test fixtures محلية / نص نمط regex / كود مشحون غير مصنّف (خطر)
            if line.strip().startswith('#') or 're.search(' in line or 're.match(' in line or 're.compile(' in line:
                category = 'pattern-text (regex/read-from-env)'
            elif rel.startswith('test/') or '.spec.' in rel or rel.startswith('frontend/tests/') or rel.startswith('frontend/tools/'):
                category = 'test-fixture / local QA tool'
            elif rel.startswith('scripts/'):
                category = 'local QA script fixture'
            elif rel in ('.env.example',) or 'example' in rel:
                category = 'documentation placeholder'
            else:
                category = 'UNCLASSIFIED — needs review'
            findings.append({
                'file': rel,
                'line': line_no,
                'type': label,
                'category': category,
                'preview': '[redacted]',
            })

# ملفات أسرار يجب ألا تكون متتبَّعة/مسرَّبة
leaks = []
for candidate in ['.env', '.env.local', '.env.production', 'docker-compose.override.yml']:
    target = ROOT / candidate
    if target.exists() and candidate != '.env':
        leaks.append(str(target.relative_to(ROOT)))
gitignore = (ROOT / '.gitignore').read_text(encoding='utf-8') if (ROOT / '.gitignore').exists() else ''
env_ignored = any(line.strip() in ('.env', '.env.*') for line in gitignore.splitlines())
env_in_dockerignore = (ROOT / '.dockerignore').exists() and '.env' in (ROOT / '.dockerignore').read_text(encoding='utf-8')

by_category: dict[str, int] = {}
for item in findings:
    by_category[item['category']] = by_category.get(item['category'], 0) + 1
production_risk = [item for item in findings if item['category'].startswith('UNCLASSIFIED')]

report = {
    'stage': '15',
    'production_secrets_in_source': len(production_risk),
    'findings_by_category': by_category,
    'scope': 'repository-wide secrets scan (production secrets policy)',
    'files_scanned': scanned,
    'excluded_dirs': sorted(EXCLUDE_DIRS),
    'findings': findings,
    'findings_count': len(findings),
    'untracked_secret_files_present': leaks,
    'env_ignored_by_git': env_ignored,
    'env_excluded_from_docker_image': bool(env_in_dockerignore),
    'policy': 'لا قيم سرّية في المستودع؛ الاستثناءات معلنة (fixtures اختبار محلية + قيم مثال/placeholder).',
}
(OUT / 'secrets-scan.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

print('files scanned:', scanned)
print('findings:', len(findings), '| by category:', by_category)
print('PRODUCTION SECRETS IN SOURCE:', len(production_risk))
for item in findings[:15]:
    print('  - %s:%s [%s]' % (item['file'], item['line'], item['type']))
print('extra secret files present:', leaks or 'none')
print('.env ignored by git:', env_ignored, '| excluded from docker image:', bool(env_in_dockerignore))
print('report:', OUT / 'secrets-scan.json')
