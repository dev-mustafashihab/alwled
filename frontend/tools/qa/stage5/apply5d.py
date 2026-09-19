"""PHASE 5D — البطاقات/الأسطح/الإيقاع: هجرة teal→أزرق المتجر + توكنزة المسافات الدخيلة."""
import re

SHOP = '/root/alwled/frontend/shop/assets/css'
FILES = ['shop.css', 'shop.home.css', 'shop.header.css', 'shop.search.css', 'shop.filters.css']
LOG = []

# 1) خريطة teal (--brand-*) → أزرق المتجر الدلالي
CMAP = [
    ('--brand-50', 'var(--store-primary-soft)'), ('--brand-100', 'var(--store-primary-soft)'),
    ('--brand-200', 'var(--store-primary-soft)'), ('--brand-300', 'var(--store-primary)'),
    ('--brand-400', 'var(--store-primary)'), ('--brand-500', 'var(--store-primary)'),
    ('--brand-600', 'var(--store-primary)'), ('--brand-700', 'var(--store-primary)'),
    ('--brand-800', 'var(--store-primary)'), ('--brand-900', 'var(--store-primary-active)'),
    ('--accent-500, var(--brand-400)', 'var(--store-primary)'),
]
# 2) توكنزة المسافات الدخيلة (قيم متطابقة — بلا تغيير بصري)
SMAP = [('2px', 'var(--st-space-2)'), ('6px', 'var(--st-space-6)'), ('10px', 'var(--st-space-10)'),
        ('14px', 'var(--st-space-14)'), ('18px', 'var(--st-space-18)')]

for f in FILES:
    p = '%s/%s' % (SHOP, f)
    s = open(p, encoding='utf-8').read()
    orig = s
    n_brand = 0
    for a, b in CMAP:
        c = s.count(a)
        if c:
            s = s.replace(a, b)
            n_brand += c
    # توكنزة المسافات داخل gap/padding/margin فقط
    def sp(m):
        prop, val = m.group(1), m.group(2)
        for a, b in SMAP:
            val = re.sub(r'(?<![\w.])%s(?![\w])' % re.escape(a), b, val)
        return '%s: %s;' % (prop, val)
    s = re.sub(r'\b(gap|padding|margin|row-gap|column-gap|padding-inline|padding-block):\s*([^;]+);', sp, s)
    if s != orig:
        open(p, 'w', encoding='utf-8').write(s)
    LOG.append('%s: teal→blue %d | مسافات: %s' % (f, n_brand, 'نعم' if s != orig else 'لا'))

# 3) سعر PDP: توكن دلالي
p = SHOP + '/shop.css'
s = open(p, encoding='utf-8').read()
s = s.replace('font-size: clamp(1.5rem, 1.2rem + 1.2vw, 2rem);', 'font-size: var(--st-price-xl);')
open(p, 'w', encoding='utf-8').write(s)

print('\n'.join(LOG))
tot = 0
for f in FILES:
    tot += len(re.findall(r'--brand-[0-9]', open('%s/%s' % (SHOP, f), encoding='utf-8').read()))
print('متبقٍ --brand-* في CSS المتجر:', tot)
for f in FILES:
    s = open('%s/%s' % (SHOP, f), encoding='utf-8').read()
    print('%-18s st-space=%d st-price-xl=%d' % (f, s.count('--st-space-'), s.count('--st-price-xl')))
