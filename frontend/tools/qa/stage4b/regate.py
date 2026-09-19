import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
R={'console':[],'failed':[],'home':{},'related':{},'listing':{},'states':{}}
with sync_playwright() as pw:
    b=pw.chromium.launch()
    # الرئيسية (يجب أن تعود للأساس المقفل) + الكتالوج
    for w in (390,768,1366):
        ctx=b.new_context(viewport={'width':w,'height':900}, locale='ar'); p=ctx.new_page()
        p.on('console', lambda m: R['console'].append({'t':m.type,'x':m.text[:120]}) if m.type in ('error','warning') else None)
        p.on('pageerror', lambda e: R['console'].append({'t':'pageerror','x':str(e)[:120]}))
        p.on('requestfailed', lambda r: R['failed'].append(r.url[-50:]))
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(3200)
        R['home'][str(w)]=p.evaluate("""(() => { const c=document.querySelector('#shop-view .shop-card');
          const box=el=>el?(Math.round(el.getBoundingClientRect().width)+'x'+Math.round(el.getBoundingClientRect().height)):null;
          return { card: box(c), media: box(c.querySelector('.shop-card__media')), mediaH: getComputedStyle(c.querySelector('.shop-card__media')).height,
            details: getComputedStyle(c.querySelector('.shop-card__details')).display, metaSpans: c.querySelector('.shop-card__meta').children.length,
            headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(2200)
        R['listing'][str(w)]=p.evaluate("""(() => { const c=document.querySelector('#shop-view > .shop-grid .shop-card');
          const box=el=>el?(Math.round(el.getBoundingClientRect().width)+'x'+Math.round(el.getBoundingClientRect().height)):null;
          return { card: box(c), media: box(c.querySelector('.shop-card__media')), overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        # المشابهة على PDP
        p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(2600)
        R['related'][str(w)]=p.evaluate("""(() => { const c=document.querySelector('#shop-view > .shop-section--related .shop-card');
          const box=el=>el?(Math.round(el.getBoundingClientRect().width)+'x'+Math.round(el.getBoundingClientRect().height)):null;
          return { card: box(c), media: box(c?c.querySelector('.shop-card__media'):null), details: c?getComputedStyle(c.querySelector('.shop-card__details')).display:null,
            desc: c?getComputedStyle(c.querySelector('.shop-card__desc')).display:null, metaSpans: c?c.querySelector('.shop-card__meta').children.length:null,
            marker: !!document.querySelector('#shop-view > .shop-section--related'),
            add: box(c?c.querySelector('.shop-card__add'):null), overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        print('w=%-5d home=%s media=%s | listing=%s | related=%s media=%s details=%s desc=%s meta=%s ov=%s' % (
            w, R['home'][str(w)]['card'], R['home'][str(w)]['mediaH'], R['listing'][str(w)]['card'],
            R['related'][str(w)]['card'], R['related'][str(w)]['media'], R['related'][str(w)]['details'],
            R['related'][str(w)]['desc'], R['related'][str(w)]['metaSpans'], R['related'][str(w)]['overflow']))
        ctx.close()
    # حالات: تحميل/خطأ (نظيفة)
    ctx=b.new_context(viewport={'width':390,'height':900}, locale='ar'); p=ctx.new_page()
    p.on('console', lambda m: R['console'].append({'t':m.type,'x':m.text[:120],'k':'states'}) if m.type in ('error','warning') else None)
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    p.route('**/api/v1/products*', lambda r: None)
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1000)
    p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(1600)
    R['states']['loading']=p.evaluate("""(() => { const s=document.querySelector('#shop-view > .shop-section'); const n=document.querySelector('#shop-view .shop-note');
      return { busy: s&&s.getAttribute('aria-busy'), note: n&&n.textContent.trim(), role: n&&n.getAttribute('role'),
        skelHidden: Array.from(document.querySelectorAll('.skeleton')).every(x=>x.getAttribute('aria-hidden')==='true'),
        overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
    p.unroute('**/api/v1/products*')
    p.route('**/api/v1/products*', lambda r: r.abort())
    p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(1000)
    p.evaluate('location.hash = "#/products/632"'); p.wait_for_timeout(2200)
    R['states']['error']=p.evaluate("""(() => { const s=document.querySelector('#shop-view > .state'); const b=s&&s.querySelector('.btn');
      return { role: s&&s.getAttribute('role'), title: (s&&s.querySelector('.state__title')||{}).textContent,
        retry: b?{text:b.textContent.trim(), box:(()=>{const r=b.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height);})()}:null }; })()""")
    print('loading:', R['states']['loading'], '\nerror:', R['states']['error'])
    ctx.close(); b.close()
json.dump(R, open('/root/alwled/frontend/tools/qa/stage4b/regate.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('console=%d failed=%d' % (len(R['console']), len(R['failed'])))
