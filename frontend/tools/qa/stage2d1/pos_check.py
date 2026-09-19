import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
JS="""(() => { const h=document.querySelector('.shop-header').getBoundingClientRect();
  const d=document.getElementById('shop-drawer').getBoundingClientRect();
  return {scrollY: Math.round(window.scrollY), headerTop: Math.round(h.top), headerBottom: Math.round(h.bottom),
          drawerTop: Math.round(d.top), gap: Math.round(d.top - h.bottom), drawerH: Math.round(d.height)}; })()"""
out={}
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},locale='ar')
    p=ctx.new_page(); p.goto(SHOP,wait_until='load'); p.wait_for_timeout(1700)
    out['top_open']=p.evaluate("""(() => { const h=document.querySelector('.shop-header').getBoundingClientRect();
      return {scrollY: 0, headerTop: Math.round(h.top), headerBottom: Math.round(h.bottom)}; })()""")
    p.click('#shop-burger'); p.wait_for_timeout(700)
    out['menu_open_top']=p.evaluate(JS)
    p.keyboard.press('Escape'); p.wait_for_timeout(600)
    p.evaluate('window.scrollTo(0,1200)'); p.wait_for_timeout(500)
    p.click('#shop-burger'); p.wait_for_timeout(700)
    out['menu_open_scroll1200']=p.evaluate(JS)
    p.keyboard.press('Escape'); p.wait_for_timeout(500)
    p.evaluate('window.scrollTo(0,1200)'); p.wait_for_timeout(400)
    out['sticky_scroll1200']=p.evaluate("""(() => { const h=document.querySelector('.shop-header').getBoundingClientRect();
      return {scrollY: Math.round(window.scrollY), headerTop: Math.round(h.top), headerBottom: Math.round(h.bottom)}; })()""")
    b.close()
print(json.dumps(out,ensure_ascii=False,indent=1))
json.dump(out,open('pos-after.json','w'),ensure_ascii=False,indent=1)
