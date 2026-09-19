"""PHASE 4 · STEP 4A — حالات PDP + أداء/تنقل + انحدارات مقفلة + RTL (قراءة فقط)."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage4a'
R = {'console': [], 'failed': [], 'states': {}, 'perf': {}, 'regression': {}, 'rtl': {}, 'a11y2': {}}


def go(page, hash, wait=2300):
    page.evaluate('location.hash = "%s"' % hash)
    page.wait_for_timeout(wait)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ===== A) الحالات: تحميل / خطأ / غير موجود =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'states'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:150]}))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    # تحميل: تعليق الطلب
    page.route('**/api/v1/products/*', lambda r: None)
    page.evaluate('location.hash = "#/products/633"'); page.wait_for_timeout(1600)
    R['states']['loading'] = page.evaluate(r"""(() => { const s=document.querySelector('#shop-view > .shop-section'); const n=document.querySelector('#shop-view .shop-note');
      const sk=Array.from(document.querySelectorAll('.skeleton'));
      return { busy: s && s.getAttribute('aria-busy'), note: n && n.textContent.trim(), noteRole: n && n.getAttribute('role'),
        skeletons: sk.length, hidden: sk.every(x=>x.getAttribute('aria-hidden')==='true'), overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
    page.screenshot(path=os.path.join(OUT, 'pdp-loading-390.png'))
    print('loading:', R['states']['loading'])
    page.unroute('**/api/v1/products/*')
    # خطأ (abort)
    page.route('**/api/v1/products/*', lambda r: r.abort())
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(1500)
    page.evaluate('location.hash = "#/products/633"'); page.wait_for_timeout(2000)
    R['states']['error'] = page.evaluate(r"""(() => { const s=document.querySelector('#shop-view > .state'); const b=s&&s.querySelector('.btn');
      return { cls: s && s.className, role: s && s.getAttribute('role'), title: (s&&s.querySelector('.state__title')||{}).textContent,
        text: (s&&s.querySelector('.state__text')||{}).textContent, retry: b ? {text:b.textContent.trim(), name:b.getAttribute('aria-label')||b.textContent.trim(),
          box:(()=>{const r=b.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height);})()} : null,
        crumbs: Array.from(document.querySelectorAll('.shop-crumbs a, .shop-crumbs span')).map(c=>c.textContent.trim()) }; })()""")
    page.screenshot(path=os.path.join(OUT, 'pdp-error-390.png'))
    print('error:', R['states']['error'])
    page.unroute('**/api/v1/products/*')
    # غير موجود (404)
    page.evaluate('location.hash = "#/products/999999"'); page.wait_for_timeout(2200)
    R['states']['notfound'] = page.evaluate(r"""(() => { const s=document.querySelector('#shop-view > .state'); const a=s&&s.querySelector('a.btn');
      return { cls: s && s.className, role: s && s.getAttribute('role'), title: (s&&s.querySelector('.state__title')||{}).textContent,
        text: (s&&s.querySelector('.state__text')||{}).textContent, cta: a ? {text:a.textContent.trim(), href:a.getAttribute('href')} : null,
        crumbs: Array.from(document.querySelectorAll('.shop-crumbs a, .shop-crumbs span')).map(c=>c.textContent.trim()) }; })()""")
    page.screenshot(path=os.path.join(OUT, 'pdp-notfound-390.png'))
    print('notfound:', R['states']['notfound'])
    ctx.close()

    # ===== B) هرمية داخل الشاشة الأولى (fold) + ترتيب العناصر =====
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 844 if w == 390 else 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
        go(page, '#/products/632', 2400)
        R['states']['fold_%d' % w] = page.evaluate(r"""(() => {
          const q=s=>document.querySelector(s); const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect();
            return {y:Math.round(b.y), bottom:Math.round(b.bottom), w:Math.round(b.width), h:Math.round(b.height)}; };
          const vh = window.innerHeight;
          const items = { crumbs: q('.shop-crumbs'), stage: q('.shop-gallery__stage'), meta: q('.shop-buy .shop-card__meta'),
            title: q('.shop-buy__title'), price: q('.shop-buy__price'), facts: q('.shop-buy__facts'),
            actions: q('.shop-buy__actions'), note: q('.shop-buy .shop-note'), related: q('#shop-view > .shop-section') };
          const out = {}; Object.keys(items).forEach(k => { const bx = box(items[k]); out[k] = bx ? { y: bx.y, visibleInFold: bx.y < vh, fullyInFold: bx.bottom <= vh, h: bx.h } : null; });
          out.vh = vh; out.docH = Math.round(document.documentElement.scrollHeight);
          out.domOrder = Array.from(document.querySelector('.shop-product').children).map(c => String(c.className));
          out.buyOrder = Array.from(document.querySelector('.shop-buy').children).map(c => String(c.className).slice(0, 26));
          return out; })()""")
        f = R['states']['fold_%d' % w]
        print('\nfold %d (vh=%d):' % (w, f['vh']))
        for k in ['crumbs', 'stage', 'meta', 'title', 'price', 'facts', 'actions', 'note']:
            print('   %-9s y=%-5s fold=%s full=%s h=%s' % (k, f[k] and f[k]['y'], f[k] and f[k]['visibleInFold'], f[k] and f[k]['fullyInFold'], f[k] and f[k]['h']))
        print('   domOrder:', f['domOrder'], '\n   buyOrder:', f['buyOrder'])
        ctx.close()

    # ===== C) RTL =====
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    go(page, '#/products/632', 2400)
    R['rtl'] = page.evaluate(r"""(() => {
      const q=s=>document.querySelector(s); const x=el=>el?Math.round(el.getBoundingClientRect().x):null;
      const stage=q('.shop-gallery__stage'), buy=q('.shop-buy');
      const priceText=(q('.shop-buy__price .shop-price__now')||{}).textContent;
      const skuText=Array.from(document.querySelectorAll('.shop-fact')).map(f=>({l:(f.querySelector('.shop-fact__label')||{}).textContent,v:(f.querySelector('.shop-fact__value')||{}).textContent}));
      return { dir: getComputedStyle(document.documentElement).direction, textAlign: getComputedStyle(document.body).textAlign,
        stageX: x(stage), buyX: x(buy), galleryRightOfInfo: x(stage) > x(buy),
        crumbsOrder: Array.from(document.querySelectorAll('.shop-crumbs a, .shop-crumbs span')).map(c=>c.textContent.trim().slice(0,18)),
        priceText: priceText, priceDir: getComputedStyle(q('.shop-buy__price .shop-price__now')).direction,
        skuFacts: skuText, qtyOrder: Array.from(document.querySelectorAll('.shop-qty > *')).map(el=>el.tagName+':'+Math.round(el.getBoundingClientRect().x)),
        actionsOrder: Array.from(document.querySelector('.shop-buy__actions').children).map(el=>String(el.className).slice(0,18)+':'+Math.round(el.getBoundingClientRect().x)),
        physicalRules: (() => { const out=[]; const sheet=document.styleSheets; return 'CSS scan منفصل'; })(),
        overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
    print('\nRTL:', json.dumps(R['rtl'], ensure_ascii=False)[:700])
    ctx.close()

    # ===== D) أداء/تنقل + تصادم الرابط الممتد + hiddenTabbable الدقيق =====
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'perf'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:150]}))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1600)
    # منتج → منتجات → منتج (تكرار مستمعات؟)
    for step, h in [('p1', '#/products/632'), ('list', '#/products'), ('p2', '#/products/632'), ('other', '#/products/633'), ('back', '#/products/632')]:
        reqs.clear()
        go(page, h, 2400)
        st = page.evaluate("""(() => ({ filters: document.querySelectorAll('.shop-filters').length, grids: document.querySelectorAll('#shop-view > .shop-grid').length,
          prods: document.querySelectorAll('.shop-product').length, cards: document.querySelectorAll('.shop-card').length,
          qty: (document.getElementById('shop-qty')||{}).value, sections: document.querySelectorAll('#shop-view > .shop-section').length }))()""")
        R['perf'][step] = {'reqs': list(reqs), 'dom': st}
        print('%-6s reqs=%-2d %s | dom=%s' % (step, len(reqs), [r[:46] for r in reqs], st))
    # تصادم الرابط الممتد داخل «منتجات مشابهة» بعد تمرير
    page.evaluate("document.querySelector('#shop-view > .shop-section').scrollIntoView({block:'center'})"); page.wait_for_timeout(600)
    R['a11y2']['collision'] = page.evaluate(r"""(() => { const c=document.querySelector('#shop-view > .shop-section .shop-card');
      if(!c) return null; const add=c.querySelector('.shop-card__add'); const name=c.querySelector('.shop-card__name a');
      const rb=add.getBoundingClientRect(); const hit=document.elementFromPoint(rb.x+rb.width/2, rb.y+rb.height/2);
      const nb=name.getBoundingClientRect(); const hit2=document.elementFromPoint(nb.x+nb.width/2, nb.y+nb.height/2);
      return { addBox: Math.round(rb.width)+'x'+Math.round(rb.height), hitOnAdd: hit?hit.tagName+'.'+String(hit.className).slice(0,24):null, addReachable: hit===add,
        hitOnName: hit2?hit2.tagName+'.'+String(hit2.className).slice(0,24):null, nameReachable: !!(hit2&&hit2.closest('.shop-card__name a')),
        afterNode: getComputedStyle(name,'::after').position }; })()""")
    print('\ncollision:', R['a11y2']['collision'])
    # hiddenTabbable الدقيق (تفصيل العناصر)
    R['a11y2']['hidden'] = page.evaluate(r"""(() => {
      const TAB='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
      const out=[];
      Array.from(document.querySelectorAll(TAB)).forEach(el=>{ const b=el.getBoundingClientRect(); const cs=getComputedStyle(el);
        const own = cs.visibility==='hidden' || cs.display==='none';
        if (b.width===0 && b.height===0 && !own) out.push({ tag:el.tagName, cls:String(el.className).slice(0,30), id:el.id,
          parentCls:String(el.parentElement.className).slice(0,26), parentDisplay:getComputedStyle(el.parentElement).display,
          inDetails: !!el.closest('details') }); });
      return { count: out.length, sample: out.slice(0,8) }; })()""")
    print('hidden tabbable detail:', json.dumps(R['a11y2']['hidden'], ensure_ascii=False)[:600])
    ctx.close()

    # ===== E) انحدارات الصفحات المقفلة =====
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1600)
        R['regression']['home_%d' % w] = page.evaluate("""(() => { const q=s=>document.querySelector(s);
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); };
          return { headerH: Math.round(q('.shop-header').getBoundingClientRect().height), homeCard: box(q('#shop-home-products .shop-card')||q('.shop-home .shop-card')),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2000)
        R['regression']['listing_%d' % w] = page.evaluate("""(() => { const c=document.querySelector('#shop-view > .shop-grid .shop-card');
          const t=document.querySelector('#shop-view > .shop-taxonomy > .shop-taxonomy__item');
          const box=el=>{ if(!el) return null; const b=el.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); };
          return { card: box(c), headerH: Math.round(document.querySelector('.shop-header').getBoundingClientRect().height),
            overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        page.evaluate('location.hash = "#/products?view=categories"'); page.wait_for_timeout(2000)
        R['regression']['taxo_%d' % w] = page.evaluate("""(() => { const t=document.querySelector('#shop-view > .shop-taxonomy > .shop-taxonomy__item');
          const b=t.getBoundingClientRect(); return { taxo: Math.round(b.width)+'x'+Math.round(b.height), overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        if w == 390:
            page.evaluate('location.hash = "#/"'); page.wait_for_timeout(1800)
            page.click('#shop-search-btn'); page.wait_for_timeout(800)
            page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1600)
            R['regression']['search'] = page.evaluate("""(() => { const r=document.querySelector('.shop-search-row');
              return { rowH: r?Math.round(r.getBoundingClientRect().height):null, rows: document.querySelectorAll('.shop-search-row').length,
                overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth }; })()""")
        ctx.close()

    b.close()

with open(os.path.join(OUT, 'audit4a-states.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n== انحدارات ==', json.dumps(R['regression'], ensure_ascii=False))
print('console=%d failed=%d' % (len(R['console']), len(R['failed'])))
