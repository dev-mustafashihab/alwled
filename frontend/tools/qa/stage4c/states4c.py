import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    # خطأ
    ctx=b.new_context(viewport={'width':390,'height':900}, locale='ar'); p=ctx.new_page()
    errs=[]; p.on('console', lambda m: errs.append(m.text[:80]) if m.type=='error' else None)
    p.route('**/api/v1/products/*', lambda r: r.abort())
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(2500)
    R['error']=p.evaluate("""(() => { const s=document.querySelector('#shop-view > .state'); const b=s&&s.querySelector('.btn');
      return { role:s&&s.getAttribute('role'), title:(s&&s.querySelector('.state__title')||{}).textContent,
        retry: b?{text:b.textContent.trim(), box:(()=>{const r=b.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height);})()}:null,
        overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
    ctx.close()
    # غير موجود
    ctx=b.new_context(viewport={'width':390,'height':900}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.evaluate('location.hash = "#/products/999999"'); p.wait_for_timeout(2500)
    R['notfound']=p.evaluate("""(() => { const s=document.querySelector('#shop-view > .state'); const a=s&&s.querySelector('a.btn');
      return { role:s&&s.getAttribute('role'), title:(s&&s.querySelector('.state__title')||{}).textContent,
        cta: a?{text:a.textContent.trim(), href:a.getAttribute('href')}:null,
        overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
    ctx.close(); b.close()
print(json.dumps(R, ensure_ascii=False))
json.dump(R, open('/root/alwled/frontend/tools/qa/stage4c/states4c.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
