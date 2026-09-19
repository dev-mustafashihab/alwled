"""فحص: المسار الرئيسي /alwled يهبط على متجر الزبون (زائر) ولا يُرسل إلى اللوحة."""
import sys
from playwright.sync_api import sync_playwright

ROOT = 'https://panel.fahd-car.cloud/alwled'
STORE = 'https://panel.fahd-car.cloud/alwled/shop/'
ADMIN = 'https://panel.fahd-car.cloud/alwled/admin/'
fails = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))

    # 1) الجذر → المتجر
    pg.goto(ROOT, wait_until='domcontentloaded')
    pg.wait_for_timeout(2500)
    final = pg.url
    if final.split('#')[0].rstrip('/') != STORE.rstrip('/'):
        fails.append('root did not land on store: ' + final)
    title = pg.title()
    if 'متجر' not in title:
        fails.append('store title missing: ' + title)
    if pg.locator('.shop-header, header').count() == 0:
        fails.append('store header not rendered')
    if pg.locator('a[href*="#/login"], #shop-auth, .shop-cta').count() == 0:
        fails.append('login/register CTA missing for guest')
    print('ROOT ->', final, '|', title)

    # 2) لا يذهب إلى اللوحة تلقائياً
    if '/alwled/admin' in final:
        fails.append('guest was sent to admin')

    # 3) اللوحة على مسارها الجديد تعرض شاشة الدخول للزائر
    pg.goto(ADMIN, wait_until='domcontentloaded')
    pg.wait_for_timeout(2000)
    if 'لوحة إدارة' not in pg.title():
        fails.append('admin title missing at ' + pg.url)
    body = pg.inner_text('body')[:400]
    if ('كلمة المرور' not in body) and ('تسجيل الدخول' not in body):
        fails.append('admin login form not visible for guest')
    print('ADMIN ->', pg.url, '|', pg.title())

    if errs:
        fails.append('console errors: ' + str(errs[:3]))
    b.close()

print('ROOT/STORE/ADMIN ROUTING:', 'PASS' if not fails else 'FAIL')
for f in fails:
    print('  ✗', f)
sys.exit(0 if not fails else 1)
