import json, sys, os
from playwright.sync_api import sync_playwright
MODE=sys.argv[1]
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3b'
R={}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for w in (1024, 1366):
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page()
        reqs=[]
        p.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1300)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1800)
        J={}
        def step(label, fn):
            reqs.clear(); h0=p.evaluate('location.hash')
            try: fn()
            except Exception as exc:
                J[label]={'error': str(exc).split('\n')[0][:90], 'visible': p.evaluate("""(() => { const e=document.querySelector('.shop-toolbar');
                  return e ? e.getBoundingClientRect().height : null; })()""")}
                print('  %-9s ERROR %s' % (label, J[label]['error'])); return
            p.wait_for_timeout(1700)
            h1=p.evaluate('location.hash')
            J[label]={'changed': h0!=h1, 'requests': list(reqs), 'cards': p.evaluate("document.querySelectorAll('.shop-card').length"),
                      'count': p.evaluate("(document.querySelector('.shop-toolbar__count')||{}).textContent")}
            print('  %-9s changed=%-5s reqs=%s cards=%s' % (label, J[label]['changed'], J[label]['requests'], J[label]['cards']))
        print('== %d ==' % w)
        step('search', lambda: (p.fill('#shop-filter-search','ثلاجة', timeout=6000), p.keyboard.press('Enter')))
        step('category', lambda: p.select_option('#shop-filter-category','293', timeout=6000))
        step('brand', lambda: p.select_option('#shop-filter-brand','254', timeout=6000))
        step('sort', lambda: p.select_option('#shop-filter-sort','price:asc', timeout=6000))
        step('price', lambda: (p.fill('#shop-filter-minprice','400', timeout=6000), p.dispatch_event('#shop-filter-minprice','change')))
        step('instock', lambda: p.check('#shop-filter-instock', timeout=6000))
        step('offers', lambda: p.check('#shop-filter-offers', timeout=6000))
        step('reset', lambda: p.evaluate("(() => { const b=document.querySelector('.shop-section__head .btn'); if (b) b.click(); })()"))
        R['w%d'%w]=J
        ctx.close()
    b.close()
json.dump(R, open(OUT+'/journey-%s.json'%MODE,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
