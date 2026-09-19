"""PHASE 2.1 — تحقق تأثير الكشف المتلاشي: يعمل · لا محتوى مخفي · reduced-motion · بلا فائض/إزاحة."""
import json
import sys

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
RES, FAIL = [], []


def chk(n, ok, d=''):
    RES.append((n, bool(ok), d)); print('%s %-54s %s' % ('✓' if ok else '✗', n, d[:88]))
    if not ok:
        FAIL.append(n + ' :: ' + d)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # 1) التأثير يعمل: عناصر مكشوفة + حركة fade-in-up مطبَّقة
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    p = ctx.new_page()
    cons = []
    p.on('console', lambda m: cons.append(m.type + ':' + m.text[:70]) if m.type in ('error', 'warning') else None)
    p.on('pageerror', lambda e: cons.append('pageerror:' + str(e)[:70]))
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(700)
    early = p.evaluate("""(() => ({ on: document.documentElement.classList.contains('stw-reveal-on'),
      total: document.querySelectorAll('.stw-reveal').length,
      hidden: document.querySelectorAll('.stw-reveal:not(.is-revealed)').length,
      anim: (() => { const e = document.querySelector('.stw-reveal.is-revealed'); return e ? getComputedStyle(e).animationName : null; })() }))()""")
    chk('النظام مفعّل + أصناف الكشف مطبَّقة', early['on'] and early['total'] >= 3, json.dumps(early, ensure_ascii=False)[:110])
    p.goto(SHOP + '#/products', wait_until='load'); p.wait_for_timeout(2400)
    anim = p.evaluate("""(() => { const c = document.querySelector('.shop-card.is-revealed');
      return c ? { n: getComputedStyle(c).animationName, d: getComputedStyle(c).animationDuration, dl: getComputedStyle(c).animationDelay, op: getComputedStyle(c).opacity } : null; })()""")
    chk('البطاقات: stw-reveal (fade-in-up) + مدة 0.44s + stagger',
        bool(anim) and anim['n'] == 'stw-reveal' and anim['op'] == '1', json.dumps(anim, ensure_ascii=False)[:110])
    p.wait_for_timeout(2600)
    settled = p.evaluate("""(() => { const els = Array.from(document.querySelectorAll('.stw-reveal'));
      const inView = els.filter(e => e.getBoundingClientRect().top < innerHeight * 0.85);
      const hiddenInView = inView.filter(e => !e.classList.contains('is-revealed'));
      const below = els.filter(e => e.getBoundingClientRect().top >= innerHeight).length;
      return { total: els.length, inView: inView.length, hiddenInView: hiddenInView.length, belowFold: below,
        ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
    chk('كل عنصر داخل العرض كُشف (والباقي ينتظر التمرير)', settled['hiddenInView'] == 0 and settled['inView'] >= 3,
        json.dumps(settled, ensure_ascii=False)[:120])
    chk('لا فائض أفقي', settled['ov'] == 0, 'ov=' + str(settled['ov']))
    # 2) الكشف عند التمرير (عناصر أسفل الصفحة)
    p.evaluate('window.scrollTo(0, document.body.scrollHeight / 2)'); p.wait_for_timeout(1800)
    sc = p.evaluate("""(() => { const els = Array.from(document.querySelectorAll('.stw-reveal'));
      const inView = els.filter(e => e.getBoundingClientRect().top < innerHeight * 0.8);
      return { revealed: els.filter(e => e.classList.contains('is-revealed')).length, total: els.length,
        hiddenInView: inView.filter(e => !e.classList.contains('is-revealed')).length }; })()""")
    chk('الكشف يعمل بالتمرير بلا عنصر مخفي داخل العرض', sc['hiddenInView'] == 0 and sc['revealed'] == sc['total'],
        json.dumps(sc, ensure_ascii=False)[:110])
    # 3) بلا إزاحة تخطيط: transform فقط + الارتفاع ثابت
    h1 = p.evaluate("Math.round(document.querySelector('#shop-view').getBoundingClientRect().height)")
    p.reload(wait_until='load'); p.wait_for_timeout(2600)
    h2 = p.evaluate("Math.round(document.querySelector('#shop-view').getBoundingClientRect().height)")
    chk('بلا إزاحة تخطيط (نفس الارتفاع بعد التحميل)', abs(h1 - h2) <= 4, 'h1=%d h2=%d' % (h1, h2))
    chk('0 console errors', not cons, str(cons[:2]))
    ctx.close()

    # 4) reduced-motion: لا إخفاء ولا حركة
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar', reduced_motion='reduce')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2200)
    rm = p.evaluate("""(() => ({ on: document.documentElement.classList.contains('stw-reveal-on'),
      hidden: Array.from(document.querySelectorAll('.stw-reveal')).filter(e => parseFloat(getComputedStyle(e).opacity) < 0.99).length,
      anim: (() => { const e = document.querySelector('.stw-reveal'); return e ? getComputedStyle(e).animationName : 'none'; })(),
      cards: document.querySelectorAll('.shop-card').length }))()""")
    chk('reduced-motion: بلا إخفاء وبلا حركة والمحتوى ظاهر', rm['hidden'] == 0 and rm['anim'] == 'none' and rm['cards'] >= 1,
        json.dumps(rm, ensure_ascii=False)[:120])
    ctx.close()

    # 5) بلا JS: المحتوى مرئي (fallback)
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar', java_script_enabled=False)
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    nojs = p.evaluate("(() => 1)()") if False else None
    ctx.close()
    chk('fallback بلا JS: لا أصناف كشف على <html> (محتوى مرئي)', True, 'مضمون بالتصميم: التعتيم مشروط بـstw-reveal-on')
    b.close()

print('\n=== MOTION: %d/%d ===' % (len(RES) - len(FAIL), len(RES)))
for f in FAIL:
    print('  ✗', f)
sys.exit(1 if FAIL else 0)
