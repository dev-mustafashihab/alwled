"""PHASE 5 · STEP 5A — جرد ثابت (قراءة فقط): طباعة/مسافات/أنصاف/ظلال/ألوان في واجهة المتجر."""
import json
import os
import re
from collections import Counter, defaultdict

ROOT = '/root/alwled/frontend'
FILES = {
    'shared/tokens.css': ROOT + '/assets/css/tokens.css',
    'shared/base.css': ROOT + '/assets/css/base.css',
    'shared/components.css': ROOT + '/assets/css/components.css',
    'shared/layout.css': ROOT + '/assets/css/layout.css',
    'shop/shop.css': ROOT + '/shop/assets/css/shop.css',
    'shop/shop.home.css': ROOT + '/shop/assets/css/shop.home.css',
    'shop/shop.header.css': ROOT + '/shop/assets/css/shop.header.css',
    'shop/shop.search.css': ROOT + '/shop/assets/css/shop.search.css',
    'shop/shop.filters.css': ROOT + '/shop/assets/css/shop.filters.css',
}
# استخراج القواعد مع محددها (مبسّط: selector { body })
RULE = re.compile(r'([^{}]+)\{([^{}]*)\}', re.S)
PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
         'text-decoration', 'border-radius', 'box-shadow', 'gap', 'padding', 'margin', 'border', 'color',
         'background', 'min-height', 'height']
OUT = defaultdict(Counter)
SELECTORS = defaultdict(lambda: defaultdict(list))   # prop → value → [selectors]
HEX = Counter()
HEX_SEL = defaultdict(list)

for label, path in FILES.items():
    if not os.path.exists(path):
        print('MISSING', path); continue
    c = open(path, encoding='utf-8').read()
    for m in RULE.finditer(c):
        sel = ' '.join(m.group(1).split())
        if sel.startswith('@') or len(sel) > 90:
            continue
        body = m.group(2)
        for p in PROPS:
            for pm in re.finditer(r'(?:^|;)\s*' + p + r'\s*:\s*([^;]+)', body):
                val = ' '.join(pm.group(1).split())
                key = '%s|%s' % (p, val)
                OUT[label][key] += 1
                if len(SELECTORS[p][val]) < 6:
                    SELECTORS[p][val].append('%s [%s]' % (sel[:46], label.split('/')[-1]))
    for hm in re.finditer(r'#[0-9a-fA-F]{3,8}\b', c):
        HEX[hm.group(0).lower()] += 1
    for hm in re.finditer(r'([^\n{]*)\{[^{}]*?(#[0-9a-fA-F]{3,8})', c):
        if len(HEX_SEL[hm.group(2).lower()]) < 5:
            HEX_SEL[hm.group(2).lower()].append(' '.join(hm.group(1).split())[:44])


def top(label, prop, n=14):
    items = [(k.split('|', 1)[1], v) for k, v in OUT[label].items() if k.startswith(prop + '|')]
    items.sort(key=lambda x: -x[1])
    return items[:n]


print('=' * 100)
print('1) FONT-FAMILY (كل التعريفات)')
for label in FILES:
    fam = top(label, 'font-family', 8)
    if fam:
        print('  %-22s %s' % (label, fam))
print('\n2) FONT-SIZE — القيم الفريدة لكل ملف (الأكثر تكرارًا)')
allsizes = Counter()
for label in FILES:
    for v, n in top(label, 'font-size', 30):
        allsizes[(label, v)] += n
byfile = defaultdict(list)
for (label, v), n in allsizes.items():
    byfile[label].append((v, n))
for label in FILES:
    lst = sorted(byfile[label], key=lambda x: -x[1])[:18]
    print('  %-22s %s' % (label, ['%s×%d' % (v, n) for v, n in lst]))
def numkey(s):
    m = re.search(r'(\d+(?:\.\d+)?)', s)
    return (0 if 'var' in s else 1, float(m.group(1)) if m else 0)


uniq = sorted({v for (_, v) in allsizes}, key=numkey)
print('\n  إجمالي القيم الفريدة لـfont-size في المتجر:', len(uniq))
print('  القيم الصلبة (px/rem) فقط:', [u for u in uniq if 'var' not in u and u.endswith(('px', 'rem', 'em'))][:40])

print('\n3) FONT-WEIGHT')
for label in FILES:
    w = top(label, 'font-weight', 10)
    if w:
        print('  %-22s %s' % (label, w))

print('\n4) LINE-HEIGHT')
for label in FILES:
    w = top(label, 'line-height', 10)
    if w:
        print('  %-22s %s' % (label, w))

print('\n5) LETTER-SPACING (يجب أن تكون صفرية/غير مستخدمة في العربية)')
found = False
for label in FILES:
    w = top(label, 'letter-spacing', 10)
    if w:
        found = True
        print('  %-22s %s' % (label, w))
        for v, _ in w:
            print('        %s ⇒ %s' % (v, SELECTORS['letter-spacing'][v][:4]))
if not found:
    print('  لا letter-spacing في أي ملف ✓')

print('\n6) TEXT-TRANSFORM / TEXT-DECORATION')
for label in FILES:
    for p in ('text-transform', 'text-decoration'):
        w = top(label, p, 6)
        if w:
            print('  %-22s %-16s %s' % (label, p, w))

print('\n7) BORDER-RADIUS (قيم فريدة)')
rad = Counter()
for label in FILES:
    for v, n in top(label, 'border-radius', 20):
        rad[v] += n
print('  ', ['%s×%d' % (v, n) for v, n in rad.most_common(20)])

print('\n8) BOX-SHADOW (قيم فريدة)')
sh = Counter()
for label in FILES:
    for v, n in top(label, 'box-shadow', 20):
        sh[v] += n
for v, n in sh.most_common(14):
    print('  ×%-3d %s' % (n, v[:96]))

print('\n9) GAP/PADDING — القيم الأكثر تكرارًا')
for p in ('gap', 'padding'):
    vals = Counter()
    for label in FILES:
        for v, n in top(label, p, 40):
            vals[v] += n
    print('  %-8s %s' % (p, ['%s×%d' % (v, n) for v, n in vals.most_common(18)]))
    odd = [v for v in vals if 'var(' not in v and len(vals) > 0]
    print('           قيم صلبة (بلا توكنز):', sorted(set(odd))[:20])

print('\n10) HEX LITERALS (غير توكنز) — الأكثر تكرارًا')
for h, n in HEX.most_common(22):
    print('  %-9s ×%-3d  %s' % (h, n, HEX_SEL[h][:3]))

print('\n11) TEAL (بقايا legacy)')
TEAL = ['#14b8a6', '#0f766e', '#0d9488', '#115e59', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa', '#0a2420']
for t in TEAL:
    if HEX.get(t):
        print('  %-9s ×%-3d  %s' % (t, HEX[t], HEX_SEL[t][:5]))

json.dump({k: dict(v) for k, v in OUT.items()}, open('/root/alwled/frontend/tools/qa/stage5a/static-inventory.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('\nحُفظ: static-inventory.json')
