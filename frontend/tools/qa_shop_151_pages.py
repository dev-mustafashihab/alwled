"""Stage 15.1 — فحص صفحات العميل المسجّل + الوضع الليلي (تجاوز أفقي، لقطات). لا عمليات كتابة."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage15.1'
os.makedirs(OUT, exist_ok=True)
ROUTES = ['#/orders', '#/notifications', '#/account', '#/verification', '#/orders', '#/account']
WIDTHS = [390, 1440]

report = {'pages': [], 'failures': []}


def rec(route, width, data, shot):
    report['pages'].append({'route': route, 'width': width, **data, 'shot': shot})
    if data.get('overflow', 0) > 0:
        report['failures'].append('%s @%d overflow=%s' % (route, width, data['overflow']))
    print('  %-22s @%-5d overflow=%s items=%s %s' % (route, width, data.get('overflow'), data.get('count'), data.get('note', '')))


with sync_playwright() as pw:
    b = pw.chromium.launch()
    for width in WIDTHS:
        ctx = b.new_context(viewport={'width': width, 'height': 900}, locale='ar', device_scale_factor=2 if width < 768 else 1)
        page = ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1200)
        page.evaluate("""async () => {
          const res = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
          window.ALW.session.start(res);
        }""")
        page.wait_for_timeout(600)

        seen = set()
        for route in ROUTES:
            if route in seen:
                continue
            seen.add(route)
            page.goto(SHOP + route, wait_until='load')
            page.wait_for_timeout(2600)
            data = page.evaluate("""(() => {
              const v = document.getElementById('shop-view');
              const nodes = Array.from(v.querySelectorAll('.shop-panel, .shop-notif, .shop-order-row, .shop-session, .state'));
              return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                count: nodes.length,
                buttons: Array.from(v.querySelectorAll('button, a.btn')).filter(n => { const r = n.getBoundingClientRect(); return r.height > 0 && r.height < 42; }).length,
                text: v.innerText.slice(0, 70).replace(/\\n/g, ' | ')
              };
            })()""")
            shot = os.path.join(OUT, '%s-%d.png' % (route.strip('#/').replace('/', '-'), width))
            page.screenshot(path=shot, full_page=(width < 768))
            rec(route, width, data, shot)

        # الوضع الليلي
        page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1500)
        page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
        page.wait_for_timeout(800)
        dark = page.evaluate("""(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          bg: getComputedStyle(document.body).backgroundColor,
          card: (() => { const c = document.querySelector('.shop-card'); return c ? getComputedStyle(c).backgroundColor : null; })()
        }))()""")
        shot = os.path.join(OUT, 'dark-%d.png' % width)
        page.screenshot(path=shot, full_page=(width < 768))
        rec('dark-home', width, dark, shot)

        # صفحة الطلب/الدفع إن وُجد طلب
        page.goto(SHOP + '#/orders', wait_until='load')
        page.wait_for_timeout(2600)
        href = page.evaluate("""(() => {
          const a = document.querySelector("a[href*='#/orders/']");
          return a ? a.getAttribute('href') : null;
        })()""")
        if href:
            page.goto(SHOP + href, wait_until='load')
            page.wait_for_timeout(2600)
            data = page.evaluate("""(() => ({
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              count: document.querySelectorAll('.shop-panel, .shop-timeline__item').length,
              text: document.getElementById('shop-view').innerText.slice(0, 80).replace(/\\n/g, ' | ')
            }))()""")
            shot = os.path.join(OUT, 'order-detail-%d.png' % width)
            page.screenshot(path=shot, full_page=(width < 768))
            rec(href, width, data, shot)

        report['console_errors_%d' % width] = errs[:4]
        ctx.close()

    b.close()

with open(os.path.join(OUT, 'shop-151-pages-report.json'), 'w', encoding='utf-8') as fh:
    json.dump(report, fh, ensure_ascii=False, indent=2)

print('\npages checked: %d | failures: %d' % (len(report['pages']), len(report['failures'])))
for f in report['failures']:
    print('  ✗', f)
