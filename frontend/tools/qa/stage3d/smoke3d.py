from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for w in (360,390,430,600,768,769,900,1024,1366,1920):
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page(); errs=[]
        p.on('console', lambda m: errs.append(m.text[:80]) if m.type=='error' else None)
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1300)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1800)
        d=p.evaluate("""(() => { const cs=Array.from(document.querySelectorAll('#shop-view > .shop-grid .shop-card'));
          const c=cs[0]; const R=el=>{const b=el.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height)];};
          return {cols:getComputedStyle(document.querySelector('#shop-view > .shop-grid')).gridTemplateColumns.split(' ').length,
            card:R(c), media:Math.round(c.querySelector('.shop-card__media').getBoundingClientRect().height),
            meta:Math.round(c.querySelector('.shop-card__meta').getBoundingClientRect().height),
            nameLines:(()=>{const n=c.querySelector('.shop-card__name'); const lh=parseFloat(getComputedStyle(n).lineHeight); return Math.round(n.getBoundingClientRect().height/lh);})(),
            add:Math.round(c.querySelector('.shop-card__add').getBoundingClientRect().height),
            details:getComputedStyle(c.querySelector('.shop-card__details')).display,
            ov:document.documentElement.scrollWidth-document.documentElement.clientWidth,
            homeCard:(()=>{const h=document.querySelector('#shop-home-categories'); return null;})()}; })()""")
        print('%-5d cols=%s card=%s media=%s meta=%s nameLines=%s add=%s details=%s ov=%s errs=%s' % (w,d['cols'],d['card'],d['media'],d['meta'],d['nameLines'],d['add'],d['details'],d['ov'],errs))
        ctx.close()
    # انحدار Home 390
    ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1900)
    print('home:', p.evaluate("""(() => { const c=document.querySelector('#shop-view .shop-card');
      const R=el=>el?[Math.round(el.getBoundingClientRect().width),Math.round(el.getBoundingClientRect().height)]:null;
      return {card:R(c), media:R(c.querySelector('.shop-card__media')), add:getComputedStyle(c.querySelector('.shop-card__add')).display,
        details:getComputedStyle(c.querySelector('.shop-card__details')).display, desc:getComputedStyle(c.querySelector('.shop-card__desc')).display}; })()"""))
    b.close()
