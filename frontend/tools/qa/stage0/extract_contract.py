"""PHASE 0 — استخراج عقد DOM/JS: كل ما يعتمد عليه الجافاسكربت (قراءة فقط)."""
import os
import re
from collections import Counter, defaultdict

JS_DIR = '/root/alwled/frontend/shop/assets/js'
CORE = '/root/alwled/frontend/assets/js/core'
FILES = [os.path.join(JS_DIR, f) for f in sorted(os.listdir(JS_DIR)) if f.endswith('.js')]
FILES += [os.path.join(CORE, f) for f in sorted(os.listdir(CORE)) if f.endswith('.js')]

ids = Counter()
sels = Counter()
closest = Counter()
dataattrs = Counter()
ariaattrs = Counter()
bodyclasses = Counter()
per_file = defaultdict(set)

PAT = {
    'ids': re.compile(r"getElementById\(\s*'([^']+)'"),
    'sels': re.compile(r"querySelector(?:All)?\(\s*'([^']+)'"),
    'closest': re.compile(r"closest\(\s*'([^']+)'"),
    'matches': re.compile(r"matches\(\s*'([^']+)'"),
    'data': re.compile(r"(?:getAttribute|dataset\.|setAttribute)\(\s*'?(data-[a-z-]+|[a-zA-Z-]+)'?"),
    'aria': re.compile(r"'?(aria-[a-z-]+)'?"),
    'bodycls': re.compile(r"(?:classList\.(?:add|remove|toggle|contains)\(\s*'([^']+)'|body\.classList[^)]*'([^']+)')"),
}

for path in FILES:
    src = open(path, encoding='utf-8').read()
    name = os.path.basename(path)
    for m in PAT['ids'].finditer(src):
        ids[m.group(1)] += 1; per_file[name].add('#' + m.group(1))
    for m in PAT['sels'].finditer(src):
        sels[m.group(1)] += 1; per_file[name].add(m.group(1))
    for m in PAT['closest'].finditer(src):
        closest[m.group(1)] += 1
    for m in PAT['data'].finditer(src):
        v = m.group(1)
        if v.startswith('data-'):
            dataattrs[v] += 1
    for m in PAT['aria'].finditer(src):
        ariaattrs[m.group(1)] += 1
    for m in PAT['bodycls'].finditer(src):
        v = m.group(1) or m.group(2)
        if v:
            bodyclasses[v] += 1

print('=== IDs يعتمد عليها JS (%d) ===' % len(ids))
for k, v in ids.most_common():
    print('   #%-34s ×%d' % (k, v))
print('\n=== محددات CSS يستخدمها JS (%d) ===' % len(sels))
for k, v in sels.most_common(40):
    print('   %-44s ×%d' % (k, v))
print('\n=== closest() (%d) ===' % len(closest))
for k, v in closest.most_common():
    print('   %-30s ×%d' % (k, v))
print('\n=== data-* (%d) ===' % len(dataattrs))
print('   ' + ' · '.join('%s×%d' % (k, v) for k, v in dataattrs.most_common()))
print('\n=== aria-* (%d) ===' % len(ariaattrs))
print('   ' + ' · '.join('%s×%d' % (k, v) for k, v in ariaattrs.most_common()))
print('\n=== أصناف body/classList (%d) ===' % len(bodyclasses))
print('   ' + ' · '.join('%s×%d' % (k, v) for k, v in bodyclasses.most_common()))
print('\n=== توزيع IDs حسب الملف ===')
for f, s in sorted(per_file.items()):
    ids_only = sorted(x for x in s if x.startswith('#'))
    if ids_only:
        print('   %-32s %s' % (f, ' '.join(ids_only[:8])))
