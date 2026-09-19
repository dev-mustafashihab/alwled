"""PHASE 4 · STEP 4A — تدقيق PDP: إتاحة/حالات/أداء/انحدارات/RTL (قراءة فقط)."""
import json
import os

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage4a'
os.makedirs(OUT, exist_ok=True)
R = {'console': [], 'failed': [], 'a11y': {}, 'states': {}, 'perf': {}, 'regression': {}, 'rtl': {}, 'gallery': {}, 'targets': {}}

# صور اختبار وقت-تشغيل فقط (data URI محلي — لا تُحفظ ولا تُنشر)
IMG = 'data:image/svg+xml;utf8,' + (
    "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='450'>"
    "<rect width='600' height='450' fill='%23e2e8f0'/><text x='300' y='230' font-size='40' text-anchor='middle' fill='%23475569'>TEST {n}</text></svg>")
IMGS = [IMG.replace('{n}', str(i)) for i in (1, 2, 3)]

MOCK = """(payload) => { const d = JSON.parse(payload); return JSON.stringify(d); }"""


def mock_product(page, mutate):
    """يعترض GET /products/:id ويعدّله وقت التشغيل فقط."""
    def handler(route):
        try:
            resp = route.fetch()
            data = resp.json()
            item = data.get('data', data)
            mutate(item)
            route.fulfill(status=200, content_type='application/json', body=json.dumps(data, ensure_ascii=False))
        except Exception:
            route.continue_()
    page.route('**/api/v1/products/*', handler)


def go(page, hash, wait=2300):
    page.evaluate('location.hash = "%s"' % hash)
    page.wait_for_timeout(wait)


TAB = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ===== A) معرض متعدد الصور (fixture وقت تشغيل) =====
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'gallery'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:150]}))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    mock_product(page, lambda it: it.update({'images': [{'url': IMGS[0]}, {'url': IMGS[1]}, {'url': IMGS[2]}], 'primaryImage': {'url': IMGS[0]}}))
    go(page, '#/products/633', 2600)
    R['gallery']['multi'] = page.evaluate(r"""(() => {
      const qa = s => Array.from(document.querySelectorAll(s));
      const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
      const thumbs = qa('.shop-gallery__thumb');
      const stageImg = document.querySelector('.shop-gallery__stage img');
      return { thumbs: thumbs.length,
        stage: { src: String(stageImg && stageImg.getAttribute('src')).slice(0, 34), alt: stageImg && stageImg.getAttribute('alt'),
          fit: cs(stageImg, 'objectFit'), box: (() => { const b = stageImg.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height)}; })() },
        thumbInfo: thumbs.map(t => ({ pressed: t.getAttribute('aria-pressed'), label: t.getAttribute('aria-label'),
          alt: (t.querySelector('img') || {}).alt, box: (() => { const b = t.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height)}; })(),
          border: cs(t, 'borderColor'), shadow: cs(t, 'boxShadow').slice(0, 34), fit: cs(t.querySelector('img'), 'objectFit') })),
        thumbsRow: (() => { const r = document.querySelector('.shop-gallery__thumbs'); const b = r.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height)}; })(),
        order: thumbs.map(t => Math.round(t.getBoundingClientRect().x)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
    g = R['gallery']['multi']
    print('== معرض (3 صور) ==\n  thumbs=%d stage=%s alt=%s fit=%s\n  thumbs: %s\n  x-order: %s' % (
        g['thumbs'], g['stage']['src'], g['stage']['alt'], g['stage']['fit'], g['thumbInfo'], g['order']))
    # تبديل صورة + لوحة المفاتيح
    page.evaluate("document.querySelectorAll('.shop-gallery__thumb')[1].click()"); page.wait_for_timeout(600)
    R['gallery']['after_click_2'] = page.evaluate("""(() => ({ src: String((document.querySelector('.shop-gallery__stage img')||{}).src||'').slice(0,34),
      pressed: Array.from(document.querySelectorAll('.shop-gallery__thumb')).map(t=>t.getAttribute('aria-pressed')) }))()""")
    page.evaluate("document.querySelectorAll('.shop-gallery__thumb')[1].focus()"); page.wait_for_timeout(200)
    kb = page.evaluate("""(() => { const a=document.activeElement; const cs=getComputedStyle(a);
      return { tag:a.tagName, cls:String(a.className).slice(0,26), outline: cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor,
        border: cs.borderColor, shadow: cs.boxShadow.slice(0,40) }; })()""")
    page.keyboard.press('Enter'); page.wait_for_timeout(500)
    kb2 = page.evaluate("String((document.querySelector('.shop-gallery__stage img')||{}).src||'').slice(0,34)")
    R['gallery']['keyboard'] = {'focus_style': kb, 'after_enter_src': kb2}
    print('  after click#2:', R['gallery']['after_click_2'], '\n  focus style:', kb, '\n  after Enter src:', kb2)
    # صورة مكسورة
    page.unroute('**/api/v1/products/*')
    mock_product(page, lambda it: it.update({'images': [{'url': 'https://panel.fahd-car.cloud/alwled/shop/assets/icons/does-not-exist.png'}], 'primaryImage': None}))
    go(page, '#/products/633', 2600)
    R['gallery']['broken'] = page.evaluate("""(() => { const i=document.querySelector('.shop-gallery__stage img'); const p=document.querySelector('.shop-gallery__stage .shop-card__placeholder');
      return { hasImg: !!i, naturalW: i?i.naturalWidth:null, alt: i?i.getAttribute('alt'):null, placeholder: !!p,
        stageH: Math.round(document.querySelector('.shop-gallery__stage').getBoundingClientRect().height) }; })()""")
    print('  broken image:', R['gallery']['broken'])
    ctx.close()

    # ===== B) إتاحة PDP =====
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'a11y'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:150]}))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(1500)
    go(page, '#/products/632', 2600)
    R['a11y']['390'] = page.evaluate(r"""(() => {
      const qa = s => Array.from(document.querySelectorAll(s));
      const vis = el => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      const name = el => el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 30) || (el.querySelector('img') || {}).alt || null;
      const ids = qa('[id]').map(e => e.id); const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
      const TAB = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
      const add = document.querySelector('#shop-add-to-cart');
      const addBox = add.getBoundingClientRect();
      // تصادم الرابط الممتد في بطاقات «منتجات مشابهة»
      const rel = qa('#shop-view > .shop-section .shop-card__add')[0];
      let collision = null;
      if (rel) { const rb = rel.getBoundingClientRect(); const hit = document.elementFromPoint(rb.x + rb.width / 2, rb.y + rb.height / 2);
        collision = { hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 26) : null, isAdd: hit === rel }; }
      return {
        headings: qa('h1,h2,h3').map(h => ({ tag: h.tagName, text: h.textContent.trim().slice(0, 30), vis: vis(h) })),
        crumbNav: (() => { const n = document.querySelector('.shop-crumbs'); return n ? { tag: n.tagName, role: n.getAttribute('role'),
          label: n.getAttribute('aria-label'), ariaCurrent: qa('.shop-crumbs [aria-current]').length } : null; })(),
        dupIds: dup,
        hiddenTabbable: qa(TAB).filter(el => !vis(el)).length,
        addName: add ? (add.getAttribute('aria-label') || add.textContent.trim()) : null,
        addBox: { w: Math.round(addBox.width), h: Math.round(addBox.height) },
        qtyNames: qa('.shop-qty__btn, #shop-qty').map(el => ({ tag: el.tagName, label: el.getAttribute('aria-label'), box: (() => { const b = el.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); })() })),
        smallTargets: qa('#shop-view a, #shop-view button, #shop-view input, #shop-view select').filter(el => { const b = el.getBoundingClientRect();
          return vis(el) && (b.width < 44 || b.height < 44); }).map(el => ({ tag: el.tagName, cls: String(el.className).slice(0, 26),
            text: (el.textContent || '').trim().slice(0, 18), box: (() => { const b = el.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); })() })),
        imgAlts: qa('#shop-view img').map(i => ({ alt: i.getAttribute('alt'), src: String(i.getAttribute('src')).slice(0, 26) })),
        stretched: (() => { const c = document.querySelector('#shop-view > .shop-section .shop-card'); if (!c) return null;
          const n = c.querySelector('.shop-card__name a'); return n ? getComputedStyle(n, '::after').position : null; })(),
        collision: collision,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      }; })()""")
    a = R['a11y']['390']
    print('\n== إتاحة 390 ==\n  headings:', a['headings'], '\n  crumbs:', a['crumbNav'], '| dupIds:', a['dupIds'], '| hiddenTabbable:', a['hiddenTabbable'])
    print('  add:', a['addName'], a['addBox'], '\n  qty:', a['qtyNames'], '\n  small targets:', a['smallTargets'], '\n  imgs:', a['imgAlts'])
    print('  stretched-link in related:', a['stretched'], '| collision:', a['collision'])
    # ترتيب التركيز
    page.evaluate('document.body.focus()')
    stops = []
    for _ in range(16):
        page.keyboard.press('Tab'); page.wait_for_timeout(70)
        stops.append(page.evaluate("""(() => { const a=document.activeElement; if(!a) return null; const b=a.getBoundingClientRect();
          return { tag:a.tagName, cls:String(a.className).slice(0,24), id:a.id, y:Math.round(b.y), inPdp:!!a.closest('.shop-product'),
            outline: getComputedStyle(a).outlineWidth+' '+getComputedStyle(a).outlineColor }; })()"""))
    R['a11y']['taborder_390'] = stops
    print('  taborder:', [(s['tag'], s['cls'][:16] or s['id'], s['inPdp']) for s in stops])
    # تفاعل: كمية + إضافة للسلة (زائر)
    page.evaluate("document.querySelector('.shop-qty__btn:nth-of-type(1)')")
    before = page.evaluate("document.getElementById('shop-qty').value")
    page.evaluate("document.querySelectorAll('.shop-qty__btn')[1].click()"); page.wait_for_timeout(200)
    after1 = page.evaluate("document.getElementById('shop-qty').value")
    page.evaluate("document.querySelectorAll('.shop-qty__btn')[1].click()"); page.wait_for_timeout(200)
    after2 = page.evaluate("document.getElementById('shop-qty').value")
    R['a11y']['qty_clicks'] = {'start': before, 'after1': after1, 'after2': after2}
    print('  qty clicks:', R['a11y']['qty_clicks'], '(ازدياد مفرد = لا مستمعات مكرّرة)')
    reqs = []
    page.on('request', lambda r: reqs.append(r.url.split('/api/v1/')[-1]) if '/api/v1/' in r.url else None)
    addState = page.evaluate("(() => { const b=document.getElementById('shop-add-to-cart'); return {disabled:b.disabled}; })()")
    if not addState['disabled']:
        page.click('#shop-add-to-cart'); page.wait_for_timeout(900)
        R['a11y']['guest_add'] = page.evaluate("""(() => ({ prompt: !!document.querySelector('.shop-prompt, .modal, [role=dialog]'),
          text: (document.body.innerText.match(/تسجيل|دخول/) || [''])[0], body: getComputedStyle(document.body).overflowY }))()""")
        R['a11y']['guest_add_reqs'] = list(reqs)
        print('  guest add:', R['a11y']['guest_add'], 'reqs:', R['a11y']['guest_add_reqs'])
        page.keyboard.press('Escape'); page.wait_for_timeout(600)
    else:
        R['a11y']['guest_add'] = 'CTA معطّل (inStock=false)'
        print('  guest add: CTA معطّل — لا يمكن اختبار الإضافة')
    ctx.close()

    b.close()

with open(os.path.join(OUT, 'audit4a-a11y.json'), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\nconsole=%d failed=%d' % (len(R['console']), len(R['failed'])))
