from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1900)
    d=p.evaluate("""(() => { const t=document.getElementById('shop-filters-toggle'); const s=document.querySelector('.shop-filters__sheet');
      const sc=document.querySelector('.shop-filters__scrim'); const w=document.querySelector('.shop-filters');
      const tb=t.getBoundingClientRect();
      const hit=document.elementFromPoint(tb.x+tb.width/2, tb.y+tb.height/2);
      return {isOpen:w.classList.contains('is-open'), toggleRect:{x:Math.round(tb.x),y:Math.round(tb.y),w:Math.round(tb.width),h:Math.round(tb.height)},
        toggleDisplay:getComputedStyle(t).display, sheetTransform:getComputedStyle(s).transform, sheetDisplay:getComputedStyle(s).display,
        sheetRect:(()=>{const r=s.getBoundingClientRect(); return {y:Math.round(r.y),h:Math.round(r.height)};})(),
        scrimPE:getComputedStyle(sc).pointerEvents, scrimOpacity:getComputedStyle(sc).opacity,
        hit: hit ? (hit.tagName+'.'+String(hit.className).slice(0,30)) : null, scrollY:Math.round(window.scrollY)}; })()""")
    print('BEFORE CLICK:', d)
    try:
        p.click('#shop-filters-toggle', timeout=5000); print('click OK')
    except Exception as e:
        print('click FAIL:', str(e).split('\n')[0][:120])
    p.wait_for_timeout(700)
    print('AFTER:', p.evaluate("({open: !!document.querySelector('.shop-filters.is-open')})"))
    b.close()
