"""PHASE 0 — تصنيف قواعد CSS المتجر: A عرضية · B استجابة · C سلوك/حالة · D إتاحة · F ميتة."""
import os
import re
from collections import Counter, defaultdict

FRONT = '/root/alwled/frontend'
SHOP_CSS = ['shop.css', 'shop.header.css', 'shop.home.css', 'shop.search.css', 'shop.filters.css']
SHARED = ['tokens.css', 'base.css', 'components.css', 'layout.css']

# كل النصوص التي قد تشير إلى صنف (JS + HTML)
corpus = ''
for root in [FRONT + '/shop/assets/js', FRONT + '/assets/js']:
    for f in os.listdir(root):
        if f.endswith('.js'):
            corpus += open(os.path.join(root, f), encoding='utf-8').read()
for f in [FRONT + '/shop/index.html', FRONT + '/index.html']:
    corpus += open(f, encoding='utf-8').read()

STATE = ['is-open', 'is-opening', 'is-closing', 'is-active', 'is-filters-open', 'is-scrolled', 'btn--busy',
         'toast--leaving', 'shop-notif--unread', 'shop-cart__item--busy', 'is-invalid', 'is-loading']
BEHAV = re.compile(r'(display\s*:|visibility\s*:|position\s*:|overflow|z-index|pointer-events|opacity\s*:|transform|transition|animation)')
A11Y = re.compile(r'(:focus|visually-hidden|\[aria-|prefers-reduced-motion|sr-only|skip-link)')

def rules(path):
    """يُرجع [(selector, body, in_media)] مع تتبّع @media."""
    src = open(path, encoding='utf-8').read()
    out, i, media = [], 0, None
    while i < len(src):
        j = src.find('{', i)
        if j == -1:
            break
        k = src.find('}', j)
        if k == -1:
            break
        head = src[i:j].strip()
        body = src[j + 1:k]
        if head.startswith('@media'):
            media = head
            i = j + 1
            continue
        if head.startswith('@'):
            i = k + 1
            continue
        if '}' in head:
            head = head.split('}')[-1].strip()
        out.append((head, body, media))
        i = k + 1
    return out

def classes_of(sel):
    return [c for c in re.findall(r'\.([A-Za-z][A-Za-z0-9_-]*)', sel)]

total = Counter()
dead = []
must = []
state_c = []
per_file = {}
for f in SHOP_CSS:
    path = FRONT + '/shop/assets/css/' + f
    rs = rules(path)
    cat = Counter()
    for sel, body, media in rs:
        cls = classes_of(sel)
        # F: كل الأصناف غير موجودة في أي JS/HTML ⇒ مرشّحة للموت
        if cls and all(c not in corpus for c in cls):
            cat['F'] += 1
            dead.append((f, sel[:70]))
            continue
        if any(s in sel for s in STATE):
            cat['C'] += 1
            state_c.append((f, sel[:60]))
            continue
        if A11Y.search(sel):
            cat['D'] += 1
            continue
        if BEHAV.search(body) and ('position: fixed' in body or 'overflow' in body or 'visibility' in body or 'z-index' in body):
            cat['C'] += 1
            state_c.append((f, sel[:60] + ' [سلوك]'))
            continue
        if media:
            cat['B'] += 1
        else:
            cat['A'] += 1
    per_file[f] = cat
    total.update(cat)

print('=== تصنيف قواعد CSS المتجر (%d قاعدة) ===' % sum(total.values()))
print('   A عرضية            : %d' % total['A'])
print('   B استجابة (@media) : %d' % total['B'])
print('   C سلوك/حالة        : %d' % total['C'])
print('   D إتاحة            : %d' % total['D'])
print('   F مرشّحة للموت     : %d  ← أصنافها لا تظهر في أي JS/HTML' % total['F'])
print()
for f, c in per_file.items():
    print('   %-18s A=%-3d B=%-3d C=%-3d D=%-2d F=%-3d (من %d)' % (f, c['A'], c['B'], c['C'], c['D'], c['F'], sum(c.values())))
print('\n=== عيّنة من المرشّحة للموت (أول 18) ===')
for f, s in dead[:18]:
    print('   %-18s %s' % (f, s))
print('\n=== عيّنة من قواعد السلوك/الحالة الحرجة (أول 16) ===')
for f, s in state_c[:16]:
    print('   %-18s %s' % (f, s))
print('\n=== الملفات المشتركة (خارج نطاق المتجر) ===')
for f in SHARED:
    p = FRONT + '/assets/css/' + f
    rs = rules(p)
    print('   %-18s %d قاعدة · %d B' % (f, len(rs), os.path.getsize(p)))
