"""اختبار حاسم: هل الرسائل تظهر بترتيب قراءتها الصحيح أم معكوسة؟ (عيّنة عند الحافة اليسرى للـviewport)."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(3000)
    p.evaluate('location.hash = "#/"'); p.wait_for_timeout(2600)
    src = p.evaluate("""Array.from(document.querySelectorAll('.shop-home-ticker__track .shop-home-ticker__item')).slice(0,4).map(e=>e.textContent.trim())""")
    print('ترتيب المصدر:', json.dumps(src, ensure_ascii=False))
    # عيّنة عند الحافة اليسرى (مدخل القراءة في RTL هو اليمين؛ نراقب أي نص يعبر الحافة اليسرى أولًا)
    samples = []
    for i in range(14):
        s = p.evaluate("""(() => { const vp = document.querySelector('.shop-home-ticker__viewport');
          const r = vp.getBoundingClientRect();
          const L = document.elementFromPoint(r.left + 3, r.top + r.height/2);
          const R = document.elementFromPoint(r.right - 3, r.top + r.height/2);
          const g = e => e && e.classList.contains('shop-home-ticker__item') ? e.textContent.trim().slice(0,18) : (e ? (e.className||e.tagName) : null);
          const it = document.querySelector('.shop-home-ticker__item');
          return { L: g(L), R: g(R), tf: getComputedStyle(document.querySelector('.shop-home-ticker__track')).transform }; })()""")
        samples.append(s)
        p.wait_for_timeout(1400)
    for s in samples:
        print('L=%-22s | R=%-22s | %s' % (s['L'], s['R'], s['tf'][:34]))
    ctx.close(); b.close()
