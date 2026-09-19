
import json, sys
from playwright.sync_api import sync_playwright
MODE=sys.argv[1]
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for w in (390,1366):
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page()
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
        if w==390:
            p.click('#shop-search-btn'); p.wait_for_timeout(1200)
            p.fill('#shop-search-sheet-input','ثلاجة'); p.wait_for_timeout(2200)
            R['search_390']=p.evaluate("""(() => { const rows=Array.from(document.querySelectorAll('.shop-search-row'));
              const i=document.querySelector('.shop-search-row img'); const r=document.querySelector('.shop-search-row');
              return {rows:rows.length, rowH:r?Math.round(r.getBoundingClientRect().height):null,
                img:i?{w:Math.round(i.getBoundingClientRect().width),h:Math.round(i.getBoundingClientRect().height),fit:getComputedStyle(i).objectFit}:null,
                sheetTop:Math.round(document.getElementById('shop-search-sheet').getBoundingClientRect().top),
                cardLeak:document.querySelectorAll('#shop-search-sheet .shop-card').length,
                status:(document.querySelector('[role=status]')||{}).textContent}; })()""")
            p.screenshot(path='/root/alwled/frontend/tools/qa/stage3d/%s-search-390.png'%MODE)
        else:
            R['header_1366']=p.evaluate("""(() => ({headerH:Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
              overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}))()""")
        ctx.close()
    b.close()
print(json.dumps(R, ensure_ascii=False))
json.dump(R, open('/root/alwled/frontend/tools/qa/stage3d/search-%s.json'%MODE,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
