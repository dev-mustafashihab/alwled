"""PHASE 3 · STEP 3B — مقارنة قبل/بعد + تحققات (قراءة JSON فقط)."""
import json
import os

OUT = '/root/alwled/frontend/tools/qa/stage3b'
B = json.load(open(os.path.join(OUT, 'probe-before.json'), encoding='utf-8'))
A = json.load(open(os.path.join(OUT, 'probe-after.json'), encoding='utf-8'))
W = [360, 390, 430, 600, 640, 641, 700, 768, 769, 800, 900, 1023, 1024, 1280, 1366, 1440, 1920]


def g(d, w, path, default=None):
    cur = d.get('w%d' % w) or {}
    for p in path.split('.'):
        if cur is None:
            return default
        cur = cur.get(p) if isinstance(cur, dict) else None
    return default if cur is None else cur


print('=== جدول قبل/بعد ===')
hdr = 'w     | tb.vis B/A | tb.h B/A      | rows B/A | toggle B/A | sheet B/A        | ctrls B/A | count B/A | gridTop B/A   | pageH B/A    | ov B/A'
print(hdr)
for w in W:
    print('%-5d | %-10s | %-13s | %-8s | %-10s | %-16s | %-9s | %-9s | %-13s | %-12s | %s' % (
        w,
        '%s/%s' % (g(B, w, 'toolbar.visible'), g(A, w, 'toolbar.visible')),
        '%s/%s' % (round(g(B, w, 'toolbar.rect.h', 0)), round(g(A, w, 'toolbar.rect.h', 0))),
        '%s/%s' % (g(B, w, 'toolbarRows'), g(A, w, 'toolbarRows')),
        '%s/%s' % (g(B, w, 'toggle.visible'), g(A, w, 'toggle.visible')),
        '%s/%s' % (g(B, w, 'sheet.display'), g(A, w, 'sheet.display')),
        '%s/%s' % (g(B, w, 'controlsVisible'), g(A, w, 'controlsVisible')),
        '%s/%s' % (g(B, w, 'count.visible'), g(A, w, 'count.visible')),
        '%s/%s' % (g(B, w, 'gridTop'), g(A, w, 'gridTop')),
        '%s/%s' % (g(B, w, 'pageH'), g(A, w, 'pageH')),
        '%s/%s' % (g(B, w, 'docOverflow'), g(A, w, 'docOverflow'))))

print()
print('=== أطوال عناصر التحكم (بعد) ===')
for w in [768, 769, 1024, 1366]:
    ctrls = (A.get('w%d' % w) or {}).get('controls') or []
    print(w, [(c['id'].replace('shop-filter-', ''), round(c['h']), c['visible']) for c in ctrls])
print()
print('=== duplicate IDs (بعد) ===')
for w in [390, 768, 1024, 1366]:
    print(w, (A.get('w%d' % w) or {}).get('dupIds'))
print('  (قبل 1024):', (B.get('w1024') or {}).get('dupIds'))
print()
print('=== فتح اللوحة على الجوال (بعد) ===')
for w in [390, 768]:
    d = A.get('open%d' % w) or {}
    print(w, 'clicked=', d.get('opened'), '| sheet h=', (d.get('sheet') or {}).get('rect', {}).get('h'),
          '| sheet top=', (d.get('sheet') or {}).get('rect', {}).get('top'), '| controls=', d.get('controlsVisible'),
          '| head/foot=', (d.get('sheet') or {}).get('headVisible'), (d.get('sheet') or {}).get('footVisible'))
    b = B.get('open%d' % w) or {}
    print('   قبل: clicked=', b.get('opened'), '| sheet h=', (b.get('sheet') or {}).get('rect', {}).get('h'))
print()
print('=== رحلة الديسكتوب (بعد) ===')
for w in [1024, 1366]:
    for k, v in (A.get('journey%d' % w) or {}).items():
        print(' %-6d %-10s changed=%-5s reqs=%s cards=%s count=%s' % (w, k, v.get('changed'), v.get('requests'), v.get('cards'), v.get('count')))
    print('  قبل:', {k: (v.get('error', 'TIMEOUT') if 'error' in v else v.get('changed')) for k, v in (B.get('journey%d' % w) or {}).items()})
print()
print('=== انحدار ===')
print(' بعد 390:', json.dumps(A.get('reg390'), ensure_ascii=False))
print(' قبل 390:', json.dumps(B.get('reg390'), ensure_ascii=False))
print(' بعد 1366:', A.get('reg1366'))
print()
print('=== ثيم داكن (بعد) ===')
d = A.get('dark1366') or {}
print(' toolbar:', d.get('toolbar', {}).get('visible'), d.get('toolbar', {}).get('css'))
print(' controls:', [(c['id'].replace('shop-filter-', ''), c['visible']) for c in (d.get('controls') or [])])
print(' count:', d.get('count'))
print()
print('=== نتائج تصنيف/علامة 1024 (بعد) ===')
for k in ['category-result-1024', 'brand-result-1024']:
    d = A.get(k) or {}
    print(' ', k, '| toolbar=', (d.get('toolbar') or {}).get('visible'), '| ctrls=', d.get('controlsVisible'), '| count=', (d.get('count') or {}).get('text'),
          '| cards=', d.get('cardCount'), '| ov=', d.get('docOverflow'))
print()
print('=== console/failed ===')
print(' before:', len(B['console']), len(B['failed']), '| after:', len(A['console']), len(A['failed']))
print(' after console:', A['console'][:5])
print(' after failed:', A['failed'][:5])
print()
print('=== اللقطات ===')
print(' after:', len(A['shots']))
