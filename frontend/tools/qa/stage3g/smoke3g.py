from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar'); p=ctx.new_page()
    errs=[]; p.on('console', lambda m: errs.append(m.text[:120]) if m.type=='error' else None); p.on('pageerror', lambda e: errs.append('PE:'+str(e)[:120]))
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1900)
    st=lambda: p.evaluate("""(() => { const s=document.querySelector('.shop-filters__sheet'); const t=document.getElementById('shop-filters-toggle');
      return {open: !!document.querySelector('.shop-filters.is-open'), role: s&&s.getAttribute('role'), modal: s&&s.getAttribute('aria-modal'),
        labelledby: s&&s.getAttribute('aria-labelledby'), expanded: t&&t.getAttribute('aria-expanded'), haspopup: t&&t.getAttribute('aria-haspopup'),
        body: getComputedStyle(document.body).overflowY, html: getComputedStyle(document.documentElement).overflowY,
        focus: document.activeElement ? (document.activeElement.id || String(document.activeElement.className).slice(0,34)) : null,
        vis: s? getComputedStyle(s).visibility : null}; })()""")
    print('closed :', st())
    p.evaluate("document.getElementById('shop-filters-toggle').click()"); p.wait_for_timeout(700)
    print('opened :', st())
    # حبس التركيز: 14 Tab
    seq=[]
    for i in range(14):
        p.keyboard.press('Tab'); p.wait_for_timeout(60)
        seq.append(p.evaluate("""(() => { const a=document.activeElement; return (a.closest('.shop-filters__sheet')?'IN:':'OUT:')+(a.id||String(a.className).slice(0,22)); })()"""))
    print('tabs   :', seq)
    # Shift+Tab من أول عنصر
    p.keyboard.press('Shift+Tab'); p.wait_for_timeout(120)
    print('shift  :', p.evaluate("""(() => { const a=document.activeElement; return (a.closest('.shop-filters__sheet')?'IN:':'OUT:')+(a.id||String(a.className).slice(0,22)); })()"""))
    # Escape
    p.keyboard.press('Escape'); p.wait_for_timeout(700)
    print('escape :', st())
    # فتح ثم إغلاق بالـ✕
    p.evaluate("document.getElementById('shop-filters-toggle').click()"); p.wait_for_timeout(600)
    p.evaluate("document.querySelector('.shop-filters__sheet-close').click()"); p.wait_for_timeout(600)
    print('closeX :', st())
    # 768 → 769 واللوحة مفتوحة
    ctx2=b.new_context(viewport={'width':768,'height':900}, locale='ar'); p2=ctx2.new_page()
    p2.goto(SHOP, wait_until='load'); p2.wait_for_timeout(1500); p2.evaluate('location.hash = "#/products"'); p2.wait_for_timeout(1900)
    p2.evaluate("document.getElementById('shop-filters-toggle').click()"); p2.wait_for_timeout(700)
    print('768 op :', p2.evaluate("({open:!!document.querySelector('.shop-filters.is-open'), body:getComputedStyle(document.body).overflowY, modal:document.querySelector('.shop-filters__sheet').getAttribute('aria-modal')})"))
    p2.set_viewport_size({'width':769,'height':900}); p2.wait_for_timeout(900)
    print('769    :', p2.evaluate("""({open:!!document.querySelector('.shop-filters.is-open'), body:getComputedStyle(document.body).overflowY,
      html:getComputedStyle(document.documentElement).overflowY, modal:document.querySelector('.shop-filters__sheet').getAttribute('role'),
      expanded:document.getElementById('shop-filters-toggle').getAttribute('aria-expanded'), toolbarVisible: document.querySelector('.shop-toolbar').getBoundingClientRect().height>0})"""))
    p2.set_viewport_size({'width':390,'height':900}); p2.wait_for_timeout(900)
    print('back390:', p2.evaluate("({open:!!document.querySelector('.shop-filters.is-open'), body:getComputedStyle(document.body).overflowY})"))
    # حالة فارغة/خطأ
    p3=ctx.new_page(); p3.goto(SHOP, wait_until='load'); p3.wait_for_timeout(1400)
    p3.evaluate('location.hash = "#/products?minPrice=99999"'); p3.wait_for_timeout(1900)
    print('empty  :', p3.evaluate("""(() => { const s=document.querySelector('#shop-view > .state'); const i=document.querySelector('.state__icon');
      return {role:s&&s.getAttribute('role'), iconAria:i&&i.getAttribute('aria-hidden'), live:document.querySelectorAll('#shop-view [aria-live]').length,
        countRole:(()=>{const c=document.querySelector('.shop-toolbar__count'); return c?c.getAttribute('role')+'/'+c.getAttribute('aria-live'):null})()}; })()"""))
    print('console errors:', errs)
    b.close()
