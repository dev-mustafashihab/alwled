from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
JS = """(() => {
  const pts = [];
  for (const y of [5, 20, 37, 60, 72, 100]) {
    for (const x of [20, 100, 195, 300, 370]) {
      const el = document.elementFromPoint(x, y);
      pts.push([x, y, el ? (el.tagName + '.' + String(el.className).slice(0, 28)) : 'null']);
    }
  }
  return pts;
})()"""
with sync_playwright() as pw:
    b=pw.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},locale='ar')
    p=ctx.new_page(); p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1800)
    p.evaluate('window.scrollTo(0,1200)'); p.wait_for_timeout(400)
    p.click('#shop-search-btn'); p.wait_for_timeout(800)
    print('== search open @1200 (BEFORE) ==')
    for r in p.evaluate(JS): print('  ', r)
    p.keyboard.press('Escape'); p.wait_for_timeout(600)
    p.evaluate('window.scrollTo(0,0)'); p.wait_for_timeout(300)
    p.click('#shop-search-btn'); p.wait_for_timeout(800)
    print('== search open @0 (BEFORE) ==')
    for r in p.evaluate(JS): print('  ', r)
    b.close()
