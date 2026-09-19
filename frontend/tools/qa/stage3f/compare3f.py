"""PHASE 3 · STEP 3F — مقارنة قبل/بعد (تباين + هندسة) من JSON."""
import json
import os

OUT = '/root/alwled/frontend/tools/qa/stage3f'
B = json.load(open(os.path.join(OUT, 'probe3f-before.json'), encoding='utf-8'))
A = json.load(open(os.path.join(OUT, 'probe3f-after.json'), encoding='utf-8'))

KEYS = ['toolbar', 'toolbarLabel', 'count', 'input', 'select', 'priceMin', 'check', 'crumbsLink', 'cardName',
        'cardBadge', 'cardFootBadge', 'cardAdd', 'cardDetails', 'cardMeta', 'cardPrice', 'taxo', 'taxoName',
        'taxoCount', 'toggle', 'sheet', 'sheetHead', 'sheetFoot', 'sheetDone', 'sheetClear', 'scrim',
        'state', 'stateIcon', 'stateTitle', 'stateText', 'stateBtn']


def show(view, tag):
    for k in ['products_390_light', 'products_390_dark', 'products_1366_light', 'products_1366_dark',
              'sheet_390_light', 'sheet_390_dark', 'categories_1366_light', 'categories_1366_dark',
              'state_empty_light', 'state_empty_dark', 'state_error_light', 'state_error_dark']:
        b = B.get(view, {}).get(k)
        a = A.get(view, {}).get(k)
        if not b or not a:
            continue
        print('\n=== %s / %s ===' % (tag, k))
        for key in KEYS:
            bi, ai = (b['items'] or {}).get(key), (a['items'] or {}).get(key)
            if not bi and not ai:
                continue
            def fmt(i):
                if not i:
                    return '—'
                return '%-22s ratio=%-6s bg=%-20s color=%-20s' % (i.get('bgColor') or '', i.get('ratio'), i.get('bgColor'), i.get('color'))
            print('  %-14s | B %s' % (key, fmt(bi)))
            print('  %-14s | A %s' % ('', fmt(ai)))


show('B', 'BEFORE')
show('A', 'AFTER')

print('\n\n=== الهندسة قبل/بعد ===')
for k in ['products_390_light', 'products_390_dark', 'products_769_light', 'products_1024_light', 'products_1366_light', 'products_1366_dark', 'products_1920_light']:
    b = B.get(k, {}).get('geom') or {}
    a = A.get(k, {}).get('geom') or {}
    print('%-22s | B %s' % (k, json.dumps(b, ensure_ascii=False)))
    print('%-22s | A %s' % ('', json.dumps(a, ensure_ascii=False)))
print()
for k in ['categories_390_light', 'categories_1366_light', 'brands_390_light', 'brands_1366_light']:
    b = B.get(k, {}).get('geom') or {}
    a = A.get(k, {}).get('geom') or {}
    print('%-24s | B taxo=%s | A taxo=%s' % (k, b.get('taxo'), a.get('taxo')))
print()
for k in ['state_empty_light', 'state_empty_dark', 'state_error_light', 'state_error_dark']:
    b = B.get(k, {}).get('geom') or {}
    a = A.get(k, {}).get('geom') or {}
    print('%-20s | B state=%s | A state=%s' % (k, b.get('state'), a.get('state')))

print('\n=== التركيز (focus) ===')
for k in ['products_1366_light', 'products_1366_dark', 'categories_1366_light']:
    print('%-24s B=%s' % (k, json.dumps(B.get(k, {}).get('focus'), ensure_ascii=False)))
    print('%-24s A=%s' % ('', json.dumps(A.get(k, {}).get('focus'), ensure_ascii=False)))

print('\n=== checked (شريحة الاختيار) ===')
for k in ['products_1366_light', 'products_1366_dark', 'products_390_dark']:
    print('%-24s B=%s | A=%s' % (k, json.dumps(B.get(k + '_checked'), ensure_ascii=False), json.dumps(A.get(k + '_checked'), ensure_ascii=False)))

print('\n=== الفائض ===')
b, a = B.get('overflow') or {}, A.get('overflow') or {}
print(' before max=%s | after max=%s | كل القيم متطابقة=%s' % (max(b.values()) if b else None, max(a.values()) if a else None, b == a))

print('\n=== انحدار 3C ===')
print(' before:', json.dumps(B.get('reg3c'), ensure_ascii=False))
print(' after :', json.dumps(A.get('reg3c'), ensure_ascii=False))
print('\n=== انحدار 390 ===')
print(' before:', json.dumps(B.get('reg390'), ensure_ascii=False))
print(' after :', json.dumps(A.get('reg390'), ensure_ascii=False))
print('\n=== console/failed ===')
print(' before:', len(B['console']), len(B['failed']), '| after:', len(A['console']), len(A['failed']))
print(' after console:', A['console'][:4])
