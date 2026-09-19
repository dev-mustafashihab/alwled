from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for w in (390,1366):
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(3200)
        print('w=',w, p.evaluate("""(() => {
          const direct = Array.from(document.querySelectorAll('#shop-view > .shop-section')).map(s=>String(s.className));
          const cards = Array.from(document.querySelectorAll('#shop-view .shop-card'));
          const first = cards[0];
          const box = el => el ? (Math.round(el.getBoundingClientRect().width)+'x'+Math.round(el.getBoundingClientRect().height)) : null;
          return { directSections: direct, cards: cards.length, firstCard: box(first),
            firstMedia: first ? box(first.querySelector('.shop-card__media')) : null,
            firstMediaH: first ? getComputedStyle(first.querySelector('.shop-card__media')).height : null,
            firstParent: first ? String(first.parentElement.className) : null,
            firstGrand: first ? String(first.parentElement.parentElement.className) : null,
            homeCards: Array.from(document.querySelectorAll('#shop-home-products .shop-card')).map(c=>box(c)),
            details: first ? getComputedStyle(first.querySelector('.shop-card__details')).display : null,
            metaSpans: first && first.querySelector('.shop-card__meta') ? first.querySelector('.shop-card__meta').children.length : null }; })()"""))
        ctx.close()
    b.close()
