
import json
from playwright.sync_api import sync_playwright
SHOP='https://panel.fahd-car.cloud/alwled/shop/'
OUT='/root/alwled/frontend/tools/qa/stage3a'
R={}
tests = [
 ('base', '#/products'),
 ('minPrice_99999 (فوق كل الأسعار)', '#/products?minPrice=99999'),
 ('maxPrice_1 (تحت كل الأسعار)', '#/products?maxPrice=1'),
 ('minPrice_400', '#/products?minPrice=400'),
 ('inStock_1', '#/products?inStock=1'),
 ('offers_1', '#/products?offers=1'),
 ('isFeatured_1', '#/products?isFeatured=1'),
 ('search_ثلاجة', '#/products?search=%D8%AB%D9%84%D8%A7%D8%AC%D8%A9'),
 ('search_zzz', '#/products?search=zzzznothing'),
 ('categoryId_292 (فارغ)', '#/products?categoryId=292'),
 ('categoryId_99999 (غير موجود)', '#/products?categoryId=99999'),
 ('page_2', '#/products?page=2'),
 ('limit_48', '#/products?limit=48'),
]
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={'width':1366,'height':900}, locale='ar'); p=ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(1500)
    for label, h in tests:
        p.evaluate('location.hash = "%s"' % h)
        p.wait_for_timeout(1800)
        d = p.evaluate("""(() => ({hash: location.hash, cards: document.querySelectorAll('.shop-card').length,
          names: Array.from(document.querySelectorAll('.shop-card__name')).map(n => (n.textContent||'').trim()),
          prices: Array.from(document.querySelectorAll('.shop-price__now')).map(n => (n.textContent||'').trim()),
          count: (document.querySelector('.shop-toolbar__count')||{}).textContent,
          empty: !!document.querySelector('.state--empty'), stateTitle: (document.querySelector('.state__title')||{}).textContent,
          pagination: !!document.querySelector('.pagination'), h1: (document.querySelector('#shop-view h1')||{}).textContent}))()""")
        R[label]=d
        print('%-34s cards=%s count=%-9s empty=%-5s names=%s' % (label, d['cards'], d['count'], d['empty'], d['names']))
    b.close()
json.dump(R, open(OUT+'/filter-effects.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
