"""PHASE 1 — تحويل Cairo المحلي إلى WOFF2 مُجزَّأ + التحقق من تغطية المحارف (من الأصل المحلي فقط)."""
import os
import subprocess

FRONT = '/root/alwled/frontend'
SRC = FRONT + '/assets/fonts/Cairo-Regular.ttf'
OUT = FRONT + '/assets/fonts/Cairo-Regular.woff2'

# نطاقات عربية كاملة + أشكال العرض + لاتيني أساسي + ترقيم/عملات + رموز الواجهة
UNI = ('U+0020-007E,U+00A0-00FF,U+0600-06FF,U+0750-077F,U+08A0-08FF,'
       'U+FB50-FDFF,U+FE70-FEFF,U+2000-206F,U+20AA-20BF,U+2190-21FF,U+25A0-25FF,U+060C,U+061B,U+061F,U+0640')

cmd = ['pyftsubset', SRC, '--output-file=' + OUT, '--flavor=woff2', '--layout-features=*',
       '--unicodes=' + UNI, '--no-hinting', '--desubroutinize']
print('تشغيل:', ' '.join(cmd[:4]), '…')
r = subprocess.run(cmd, capture_output=True, text=True)
print('exit:', r.returncode, (r.stderr or '').strip()[:200])

from fontTools.ttLib import TTFont

t = TTFont(SRC)
w = TTFont(OUT)
tc, wc = set(t.getBestCmap()), set(w.getBestCmap())
print('\n=== تغطية المحارف ===')
print('TTF: %d محرفًا · WOFF2: %d محرفًا' % (len(tc), len(wc)))
ar_t = {c for c in tc if 0x0600 <= c <= 0x06FF}
ar_w = {c for c in wc if 0x0600 <= c <= 0x06FF}
print('عربي: TTF %d → WOFF2 %d (ناقص: %s)' % (len(ar_t), len(ar_w), sorted(ar_t - ar_w)[:6] or 'لا شيء ✓'))
pres_t = {c for c in tc if 0xFE70 <= c <= 0xFEFF or 0xFB50 <= c <= 0xFDFF}
pres_w = {c for c in wc if 0xFE70 <= c <= 0xFEFF or 0xFB50 <= c <= 0xFDFF}
print('أشكال العرض: TTF %d → WOFF2 %d (ناقص: %s)' % (len(pres_t), len(pres_w), sorted(pres_t - pres_w)[:6] or 'لا شيء ✓'))
lat = set(range(0x20, 0x7F))
print('لاتيني أساسي: ناقص =', sorted(lat - wc) or 'لا شيء ✓')
need = {ord(c) for c in '$%•‹›—–…«»0123456789٠١٢٣٤٥٦٧٨٩،؛؟'}
print('رموز الواجهة (عملة/ترقيم/فاصلة عربية): ناقص =', sorted(need - wc) or 'لا شيء ✓')
print('\n=== الأحجام ===')
for p in (SRC, OUT):
    print('%-46s %8.1f KB' % (os.path.basename(p), os.path.getsize(p) / 1024))
print('التوفير: −%.0f%%' % (100 - os.path.getsize(OUT) / os.path.getsize(SRC) * 100))
