"""PHASE 5B — تحويل الطباعة: rem + أدوار دلالية + إزالة letter-spacing/uppercase/Qomra.
يقرأ/يكتب ملفات المتجر المسموحة فقط. يطبع سجل التغييرات."""
import os
import re
import sys

SHOP = '/root/alwled/frontend/shop/assets/css'
SHARED = '/root/alwled/frontend/assets/css'
FILES = ['shop.css', 'shop.home.css', 'shop.header.css', 'shop.search.css', 'shop.filters.css']

# --- 1) خريطة توكنز --fs-* القديمة (px) → أدوار rem ---
FS_MAP = {
    '--fs-2xs': 'var(--st-caption)', '--fs-xs': 'var(--st-meta)', '--fs-sm': 'var(--st-body-sm)',
    '--fs-base': 'var(--st-body)', '--fs-md': '0.9375rem', '--fs-lg': '1.0625rem',
    '--fs-xl': 'var(--st-title-section)', '--fs-2xl': '1.5rem', '--fs-3xl': '1.875rem',
}
# --- 2) أدوار حسب المحدّد (تُطبَّق على المحدّد الأساسي فقط) ---
ROLE = {
    '.shop-section__title': 'var(--st-title-section)', '.state__title': 'var(--st-title-page)',
    '.state__text': 'var(--st-body-sm)', '.shop-panel__title': 'var(--st-title-section)',
    '.shop-prose': 'var(--st-body)', '.shop-crumbs': 'var(--st-body-sm)',
    '.shop-toolbar__label': 'var(--st-meta)', '.shop-toolbar__count': 'var(--st-meta)',
    '.shop-taxonomy__count': 'var(--st-meta)', '.shop-taxonomy__name': 'var(--st-title-card)',
    '.shop-footer a': 'var(--st-body-sm)', '.shop-footer__sec summary': 'var(--st-title-card)',
}
ROLE_SUB = {
    '.shop-card__meta': 'var(--st-meta)', '.shop-card .badge': 'var(--st-caption)',
    '.shop-card__name': 'var(--st-title-card)', '.shop-price__was': 'var(--st-old-price)',
    '.shop-search-row__price': 'var(--st-price-m)',
}
PRICE_SEL = {'.shop-price__now', '.shop-buy__price .shop-price__now'}
# أسطح مقفلة: تحويل rem فقط (بلا تغيير مقاس)
LOCKED = ['.shop-header', '.shop-brand', '.shop-nav', '.shop-iconbtn', '.shop-cartbtn', '.shop-search__input',
          '.shop-drawer', '.shop-menu', '.shop-search-sheet', '.shop-search-row', '.shop-filters', '.shop-check',
          '.shop-card__add', '.shop-taxonomy__item', '.shop-qty', '.btn']

CHANGES = []


def px_to_rem(v):
    return ('%g' % (float(v) / 16)).rstrip('0').rstrip('.') + 'rem'


def conv_len(m):
    """Npx → rem داخل أي قيمة (بما فيها clamp)."""
    return px_to_rem(m.group(1))


def transform_block(sel, body, fname):
    orig = body
    # (أ) إزالة letter-spacing غير الصفري
    if re.search(r'letter-spacing:\s*(?!normal|0\b|0;|0\s)', body):
        body = re.sub(r'letter-spacing:\s*[^;]+;', 'letter-spacing: normal;', body)
    # (ب) uppercase
    if 'text-transform: uppercase' in body:
        body = body.replace('text-transform: uppercase', 'text-transform: none')
    # (ج) توكنز --fs-* → أدوار
    for k, v in FS_MAP.items():
        body = re.sub(r'var\(\s*%s\s*(?:,\s*[^)]*)?\)' % re.escape(k), v, body)
    # (د) دور حسب المحدّد
    s = sel.strip()
    if s in ROLE or (s.split(',')[0].strip() in ROLE):
        key = s if s in ROLE else s.split(',')[0].strip()
        body = re.sub(r'(font-size:\s*)[^;]+;', lambda m: m.group(1) + ROLE[key] + ';', body, count=1)
        CHANGES.append('%s | %s | font-size → %s' % (fname, key, ROLE[key]))
    elif s in ROLE_SUB:
        body = re.sub(r'(font-size:\s*)[^;]+;', lambda m: m.group(1) + ROLE_SUB[s] + ';', body, count=1)
        CHANGES.append('%s | %s | font-size → %s' % (fname, s, ROLE_SUB[s]))
    elif s in PRICE_SEL and 'clamp(' not in body:
        body = re.sub(r'(font-size:\s*)[^;]+;', lambda m: m.group(1) + 'var(--st-price-l);', body, count=1)
        CHANGES.append('%s | %s | font-size → var(--st-price-l)' % (fname, s))
    # (هـ) أي font-size بالـpx → rem
    def fs_rem(m):
        val = m.group(1)
        if 'var(' in val:
            return m.group(0)
        new = re.sub(r'(\d+(?:\.\d+)?)px', conv_len, val)
        if new != val:
            CHANGES.append('%s | %s | font-size %s → %s' % (fname, s.strip()[:44], val.strip(), new.strip()))
        return 'font-size: ' + new + ';'
    body = re.sub(r'font-size:\s*([^;]+);', fs_rem, body)
    # (و) line-height بالـpx → rem
    def lh_rem(m):
        val = m.group(1).strip()
        if not re.fullmatch(r'\d+(?:\.\d+)?px', val):
            return m.group(0)
        new = px_to_rem(val[:-2])
        CHANGES.append('%s | %s | line-height %s → %s' % (fname, s.strip()[:44], val, new))
        return 'line-height: ' + new + ';'
    body = re.sub(r'line-height:\s*([^;]+);', lh_rem, body)
    return body


def process(path, fname):
    src = open(path, encoding='utf-8').read()
    out = []
    i = 0
    stack = []
    while i < len(src):
        j = src.find('{', i)
        if j == -1:
            out.append(src[i:])
            break
        k = src.find('}', j)
        if k == -1:
            out.append(src[i:])
            break
        head = src[i:j]
        body = src[j + 1:k]
        if head.strip().startswith('@media') or head.strip().startswith('@supports'):
            out.append(head + '{')
            stack.append(head.strip())
            i = j + 1
            continue
        if head.strip().startswith('@font-face') or head.strip().startswith('@keyframes'):
            out.append(head + '{' + body + '}')
            i = k + 1
            continue
        out.append(head + '{' + transform_block(head, body, fname) + '}')
        i = k + 1
    new = ''.join(out)
    if new != src:
        open(path, 'w', encoding='utf-8').write(new)
    return new != src


for f in FILES:
    p = os.path.join(SHOP, f)
    changed = process(p, f)
    print('%-18s %s' % (f, 'معدّل' if changed else 'بلا تغيير'))

# --- Qomra: حذف @font-face + التوكن + استبدال الاستخدامات ---
hp = os.path.join(SHOP, 'shop.header.css')
s = open(hp, encoding='utf-8').read()
before_q = s.count('Qomra') + s.count('--shop-menu-font')
s = re.sub(r"@font-face\s*\{[^}]*Qomra[^}]*\}\s*", '', s)
s = re.sub(r"\.shop-body\s*\{\s*--shop-menu-font:[^}]*\}\s*", '', s)
s = s.replace('var(--shop-menu-font)', 'var(--st-font)')
open(hp, 'w', encoding='utf-8').write(s)
print('Qomra/--shop-menu-font: %d → %d' % (before_q, s.count('Qomra') + s.count('--shop-menu-font')))

# --- --shop-fs-* القديمة → rem ---
sp = os.path.join(SHOP, 'shop.css')
s = open(sp, encoding='utf-8').read()
leg = {'--shop-fs-body: 15px': '--shop-fs-body: 0.9375rem', '--shop-fs-small: 13.5px': '--shop-fs-small: 0.8125rem',
       '--shop-fs-tiny: 12.5px': '--shop-fs-tiny: 0.75rem', '--shop-fs-title: 19px': '--shop-fs-title: 1.25rem',
       '--shop-fs-price: 18px': '--shop-fs-price: 1.125rem'}
for a, b in leg.items():
    if a in s:
        s = s.replace(a, b)
        CHANGES.append('shop.css | legacy token | %s → %s' % (a, b))
open(sp, 'w', encoding='utf-8').write(s)

print('\nعدد التغييرات: %d' % len(CHANGES))
for c in CHANGES[:70]:
    print('  ', c)
