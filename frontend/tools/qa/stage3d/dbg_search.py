from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1600)
    print('btn visible:', p.evaluate("(() => { const b=document.getElementById('shop-search-btn'); const r=b.getBoundingClientRect(); return {w:r.width,h:r.height,display:getComputedStyle(b).display}; })()"))
    p.click('#shop-search-btn'); p.wait_for_timeout(1500)
    print(p.evaluate("""(() => { const s=document.getElementById('shop-search-sheet'); const i=document.getElementById('shop-search-input');
      const cs=getComputedStyle(i); const b=i.getBoundingClientRect();
      return {sheetOpen: s.className, sheetDisplay: getComputedStyle(s).display, sheetTop: Math.round(s.getBoundingClientRect().top),
        inputRect:{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)},
        inputCss:{display:cs.display,visibility:cs.visibility,opacity:cs.opacity,pointerEvents:cs.pointerEvents},
        active: document.activeElement ? document.activeElement.id : null}; })()"""))
    # محاولة كتابة عبر events
    p.evaluate("""(() => { const i=document.getElementById('shop-search-input'); i.focus(); i.value='ثلاجة'; i.dispatchEvent(new Event('input',{bubbles:true})); })()""")
    p.wait_for_timeout(2000)
    print(p.evaluate("""(() => { const rows=Array.from(document.querySelectorAll('.shop-search-row'));
      return {rows: rows.length, rowH: rows[0]?Math.round(rows[0].getBoundingClientRect().height):null,
        img: (()=>{const i=document.querySelector('.shop-search-row img'); return i?{w:Math.round(i.getBoundingClientRect().width),h:Math.round(i.getBoundingClientRect().height)}:null;})(),
        cardLeak: document.querySelectorAll('#shop-search-sheet .shop-card').length}; })()"""))
    p.screenshot(path='/root/alwled/frontend/tools/qa/stage3d/search-debug-390.png')
    b.close()
