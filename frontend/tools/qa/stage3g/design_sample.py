"""STEP: document — عيّنة computed styles من الموقع الحيّ (قراءة فقط) لبناء DESIGN.md."""
import json

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3g/design-sample.json'
PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'borderColor',
         'borderWidth', 'borderStyle', 'borderRadius', 'padding', 'height', 'minHeight', 'gap',
         'boxShadow', 'outlineColor', 'outlineWidth', 'transition', 'letterSpacing', 'textTransform']

SAMPLE = r"""(() => {
  const props = %s;
  const pick = (sel, label) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const o = { label: label, sel: sel };
    props.forEach(p => { o[p] = cs[p]; });
    const b = el.getBoundingClientRect();
    o.box = Math.round(b.width) + 'x' + Math.round(b.height);
    return o;
  };
  return [
    pick('body', 'body'),
    pick('.shop-header__inner', 'header inner'),
    pick('.shop-brand__text', 'brand text'),
    pick('.shop-nav__link', 'nav link'),
    pick('.shop-iconbtn', 'icon button'),
    pick('.shop-cartbtn', 'cart button'),
    pick('.shop-crumbs a', 'breadcrumb link'),
    pick('.shop-section__title', 'section title'),
    pick('.shop-section__sub', 'section sub'),
    pick('.shop-container', 'container'),
    pick('.shop-filters__toggle', 'filter toggle'),
    pick('.shop-toolbar__count', 'result count'),
    pick('.shop-toolbar__label', 'toolbar label'),
    pick('.shop-filter-search, #shop-filter-search', 'search input'),
    pick('#shop-filter-category', 'select'),
    pick('.shop-check', 'checkbox row'),
    pick('.btn', 'button base'),
    pick('.btn--primary', 'button primary'),
    pick('.btn--ghost', 'button ghost'),
    pick('.shop-card', 'product card'),
    pick('.shop-card__media', 'card media'),
    pick('.shop-card__meta', 'card meta'),
    pick('.shop-card__name', 'card name'),
    pick('.shop-price__now', 'price now'),
    pick('.shop-price__was', 'price was'),
    pick('.shop-card__add', 'add to cart'),
    pick('.shop-card .badge', 'discount badge'),
    pick('#shop-view > .shop-taxonomy > .shop-taxonomy__item', 'taxonomy card'),
    pick('#shop-view > .shop-grid', 'product grid'),
    pick('.shop-footer', 'footer'),
    pick('.shop-search-sheet', 'search sheet'),
    pick('.shop-search-row', 'search row'),
    pick('.shop-drawer__panel', 'menu panel'),
  ].filter(Boolean);
})()""" % json.dumps(PROPS)

R = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme in ('light', 'dark'):
        ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1600)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(2000)
        R['products_' + theme] = page.evaluate(SAMPLE)
        if theme == 'light':
            page.evaluate('location.hash = "#/products?view=categories"')
            page.wait_for_timeout(1900)
            R['taxonomy_light'] = page.evaluate(SAMPLE)
            page.evaluate('location.hash = "#/products?minPrice=99999"')
            page.wait_for_timeout(1900)
            R['empty_light'] = page.evaluate("""(() => { const s=document.querySelector('#shop-view > .state'); const t=document.querySelector('.state__title'); const x=document.querySelector('.state__text');
              const pick=(el,label)=>{ if(!el) return null; const cs=getComputedStyle(el); return {label:label, fontSize:cs.fontSize, fontWeight:cs.fontWeight, color:cs.color, backgroundColor:cs.backgroundColor, padding:cs.padding, borderRadius:cs.borderRadius, box:Math.round(el.getBoundingClientRect().width)+'x'+Math.round(el.getBoundingClientRect().height)}; };
              return [pick(s,'state'), pick(t,'state title'), pick(x,'state text')].filter(Boolean); })()""")
            page.evaluate('location.hash = "#/products?view=brands"')
            page.wait_for_timeout(1900)
            R['brands_light'] = page.evaluate(SAMPLE)
        ctx.close()
    # mobile: sheet open + cards
    for theme in ('light', 'dark'):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1600)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(2000)
        R['m_products_' + theme] = page.evaluate(SAMPLE)
        page.evaluate("document.getElementById('shop-filters-toggle').click()")
        page.wait_for_timeout(900)
        R['m_sheet_' + theme] = page.evaluate(SAMPLE + """
""") if False else page.evaluate(r"""(() => {
          const pick = (sel, label) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el);
            const b = el.getBoundingClientRect(); return {label: label, backgroundColor: cs.backgroundColor, borderColor: cs.borderColor,
              borderRadius: cs.borderRadius, padding: cs.padding, boxShadow: cs.boxShadow, box: Math.round(b.width) + 'x' + Math.round(b.height), position: cs.position, zIndex: cs.zIndex}; };
          return [pick('.shop-filters__sheet', 'sheet'), pick('.shop-filters__sheet-head', 'sheet head'),
            pick('.shop-filters__scrim', 'scrim'), pick('.shop-filters__done', 'done btn'),
            pick('.shop-filters__sheet-close', 'close btn')].filter(Boolean); })()""")
        ctx.close()
    b.close()

json.dump(R, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k in R:
    print('==', k)
    for it in R[k]:
        print('   %-18s %-34s %-9s %-7s bg=%-22s r=%-6s border=%-20s pad=%-14s h=%s' % (
            it.get('label'), (it.get('fontFamily') or '')[:32], it.get('fontSize'), it.get('fontWeight'),
            it.get('backgroundColor'), it.get('borderRadius'), (it.get('borderColor') or '')[:20], it.get('padding'), it.get('box')))
