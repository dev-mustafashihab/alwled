"""PHASE 3 · STEP 3G — تدقيق إتاحة + QA نهائي (قراءة فقط، بلا تعديل).

الاستخدام: python3 audit3g.py before | after
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'before'
SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = '/root/alwled/frontend/tools/qa/stage3g'
os.makedirs(OUT, exist_ok=True)
R = {'mode': MODE, 'console': [], 'failed': [], 'shots': []}

# ---------- JS helpers ----------
A11Y = r"""(() => {
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const name = el => {
    if (!el) return null;
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = document.getElementById(lb); if (t) return (t.textContent || '').trim(); }
    if (el.id) { const l = document.querySelector('label[for="' + el.id + '"]'); if (l) return (l.textContent || '').trim(); }
    const wrap = el.closest('label'); if (wrap) return (wrap.textContent || '').trim();
    const txt = (el.textContent || '').trim(); if (txt) return txt.slice(0, 40);
    return el.getAttribute('placeholder') ? 'placeholder:' + el.getAttribute('placeholder') : null;
  };
  const sheet = q('.shop-filters__sheet');
  const toggle = q('#shop-filters-toggle');
  const wrap = q('.shop-filters');
  const scrim = q('.shop-filters__scrim');
  const toolbar = q('#shop-toolbar');
  const controls = qa('#shop-toolbar input, #shop-toolbar select');
  return {
    vw: window.innerWidth, hash: location.hash,
    sheet: sheet ? {role: sheet.getAttribute('role'), modal: sheet.getAttribute('aria-modal'),
      labelledby: sheet.getAttribute('aria-labelledby'), label: sheet.getAttribute('aria-label'),
      hidden: sheet.getAttribute('hidden'), ariaHidden: sheet.getAttribute('aria-hidden'),
      display: getComputedStyle(sheet).display, visibility: getComputedStyle(sheet).visibility,
      transform: getComputedStyle(sheet).transform, tabindex: sheet.getAttribute('tabindex'),
      open: wrap ? wrap.classList.contains('is-open') : null} : null,
    scrim: scrim ? {ariaHidden: scrim.getAttribute('aria-hidden'), display: getComputedStyle(scrim).display,
      pointerEvents: getComputedStyle(scrim).pointerEvents, opacity: getComputedStyle(scrim).opacity} : null,
    toggle: toggle ? {expanded: toggle.getAttribute('aria-expanded'), controls: toggle.getAttribute('aria-controls'),
      controlsExists: !!(toggle.getAttribute('aria-controls') && document.getElementById(toggle.getAttribute('aria-controls'))),
      name: name(toggle), h: Math.round(toggle.getBoundingClientRect().height), visible: toggle.getBoundingClientRect().height > 0} : null,
    toolbarRole: toolbar ? toolbar.getAttribute('role') : null,
    labels: controls.map(c => ({id: c.id, tag: c.tagName, type: c.getAttribute('type'),
      ariaLabel: c.getAttribute('aria-label'), hasLabelFor: !!document.querySelector('label[for="' + c.id + '"]'),
      wrappedInLabel: !!c.closest('label'), accessibleName: name(c),
      placeholder: c.getAttribute('placeholder'), required: c.getAttribute('required'),
      inputmode: c.getAttribute('inputmode'), min: c.getAttribute('min'), step: c.getAttribute('step'),
      h: Math.round(c.getBoundingClientRect().height), visible: c.getBoundingClientRect().height > 0})),
    checkbox: (() => { const i = q('#shop-filter-offers'); if (!i) return null; const l = i.closest('label');
      return {id: i.id, type: i.getAttribute('type'), inLabel: !!l, labelText: l ? (l.textContent || '').trim() : null,
        ariaLabel: i.getAttribute('aria-label'), checked: i.checked,
        labelH: l ? Math.round(l.getBoundingClientRect().height) : null,
        inputW: Math.round(i.getBoundingClientRect().width), inputH: Math.round(i.getBoundingClientRect().height)}; })(),
    bodyOverflow: {body: getComputedStyle(document.body).overflowY, html: getComputedStyle(document.documentElement).overflowY,
      scrollY: Math.round(window.scrollY)},
    activeElement: document.activeElement ? {tag: document.activeElement.tagName, id: document.activeElement.id,
      cls: document.activeElement.className, name: name(document.activeElement)} : null,
    live: qa('[aria-live]').map(e => ({cls: e.className, id: e.id, live: e.getAttribute('aria-live'),
      atomic: e.getAttribute('aria-atomic'), role: e.getAttribute('role'), text: (e.textContent || '').trim().slice(0, 40)})),
    busy: qa('[aria-busy]').map(e => ({cls: e.className, busy: e.getAttribute('aria-busy')})),
    count: (() => { const c = q('.shop-toolbar__count'); return c ? {text: (c.textContent || '').trim(), role: c.getAttribute('role'),
      live: c.getAttribute('aria-live'), atomic: c.getAttribute('aria-atomic')} : null; })(),
    skeletons: qa('.skeleton').length,
    skeletonInfo: qa('.skeleton').slice(0, 2).map(s => ({cls: s.className, role: s.getAttribute('role'), ariaHidden: s.getAttribute('aria-hidden'),
      ariaLabel: s.getAttribute('aria-label'), text: (s.textContent || '').trim().slice(0, 20), h: Math.round(s.getBoundingClientRect().height)})),
    state: (() => { const s = q('#shop-view > .state'); if (!s) return null;
      return {cls: s.className, role: s.getAttribute('role'), live: s.getAttribute('aria-live'),
        title: (s.querySelector('.state__title') || {}).textContent, titleTag: s.querySelector('.state__title') ? s.querySelector('.state__title').tagName : null,
        text: (s.querySelector('.state__text') || {}).textContent,
        icon: (s.querySelector('.state__icon') || {}).textContent, iconAria: s.querySelector('.state__icon') ? s.querySelector('.state__icon').getAttribute('aria-hidden') : null,
        btn: (() => { const b = s.querySelector('.btn'); return b ? {text: (b.textContent || '').trim(), name: name(b),
          h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width), tabbable: b.tabIndex >= 0} : null; })()}; })(),
    taxonomy: qa('#shop-view > .shop-taxonomy > .shop-taxonomy__item').map(a => ({tag: a.tagName, href: a.getAttribute('href'),
      name: name(a), tabbable: a.tabIndex >= 0, h: Math.round(a.getBoundingClientRect().height)})),
    cards: qa('#shop-view > .shop-grid .shop-card').map(c => ({
      id: c.getAttribute('data-product-id'),
      details: (() => { const d = c.querySelector('.shop-card__details'); return d ? {display: getComputedStyle(d).display, tabbable: d.tabIndex >= 0, visible: d.getBoundingClientRect().height > 0} : null; })(),
      media: (() => { const m = c.querySelector('.shop-card__media'); return m ? {tabbable: m.tabIndex >= 0, name: name(m), h: Math.round(m.getBoundingClientRect().height)} : null; })(),
      nameLink: (() => { const n = c.querySelector('.shop-card__name a'); return n ? {tabbable: n.tabIndex >= 0, text: (n.textContent || '').trim().slice(0, 30), h: Math.round(n.getBoundingClientRect().height)} : null; })(),
      add: (() => { const b = c.querySelector('.shop-card__add'); return b ? {name: name(b), text: (b.textContent || '').trim(),
        h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width), tabbable: b.tabIndex >= 0,
        disabled: b.hasAttribute('disabled'), zIndex: getComputedStyle(b).zIndex} : null; })(),
      actionsZ: getComputedStyle(c.querySelector('.shop-card__actions')).zIndex,
      cardZ: getComputedStyle(c).position
    })),
    dir: getComputedStyle(document.documentElement).direction,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    headerH: q('.shop-header') ? Math.round(q('.shop-header').getBoundingClientRect().height) : null
  };
})()"""

TABBABLE = r"""(() => {
  const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(document.querySelectorAll(sel)).filter(el => {
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
  }).map(el => ({tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 44),
    text: (el.textContent || '').trim().slice(0, 24), x: Math.round(el.getBoundingClientRect().x),
    inSheet: !!el.closest('.shop-filters__sheet'), inView: !!el.closest('#shop-view')}));
})()"""


def shoot(page, name):
    p = os.path.join(OUT, '%s-%s.png' % (MODE, name))
    page.screenshot(path=p)
    R['shots'].append(p)


def ensure_open(page):
    if not page.evaluate("!!document.querySelector('.shop-filters.is-open')"):
        page.evaluate("document.getElementById('shop-filters-toggle').click()")
        page.wait_for_timeout(600)


def ensure_closed(page):
    if page.evaluate("!!document.querySelector('.shop-filters.is-open')"):
        try:
            page.click('.shop-filters__sheet-close', timeout=3000)
        except Exception:
            page.evaluate("(() => { const b = document.querySelector('.shop-filters__sheet-close'); if (b) b.click(); })()")
        page.wait_for_timeout(600)


def tab_stops(page, n=14):
    stops = []
    for _ in range(n):
        page.keyboard.press('Tab')
        page.wait_for_timeout(70)
        stops.append(page.evaluate("""(() => { const a=document.activeElement; if(!a) return null;
          const b=a.getBoundingClientRect(); const cs=getComputedStyle(a);
          return {tag:a.tagName, id:a.id, cls:String(a.className).slice(0,40), text:(a.textContent||'').trim().slice(0,20),
            x:Math.round(b.x), inSheet:!!a.closest('.shop-filters__sheet'),
            outline: cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor, shadow: cs.boxShadow.slice(0,40),
            bg: (()=>{ let cur=a; while(cur){ const c=getComputedStyle(cur).backgroundColor; const m=String(c).match(/rgba?\\(([^)]+)\\)/);
              if(m){ const p=m[1].split(',').map(Number); if((p.length<4||p[3]>0.95)) return c; } cur=cur.parentElement; } return 'rgb(255,255,255)'; })()}; })()"""))
    return stops


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ============ A) لوحة الفلاتر على الجوال: الحالة المغلقة/المفتوحة ============
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: R['console'].append({'t': m.type, 'x': m.text[:150], 'k': 'sheet'}) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: R['console'].append({'t': 'pageerror', 'x': str(e)[:150]}))
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    R['closed_390'] = page.evaluate(A11Y)
    R['closed_tabbables'] = page.evaluate(TABBABLE)
    shoot(page, 'closed-390')
    # فتح
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(800)
    R['open_390'] = page.evaluate(A11Y)
    R['open_tabbables'] = page.evaluate(TABBABLE)
    shoot(page, 'filters-open-390')
    # تركيز داخل اللوحة؟ (Tab من الأعلى)
    page.evaluate("document.getElementById('shop-filters-toggle').focus()")
    page.keyboard.press('Tab')
    page.wait_for_timeout(150)
    R['tab_after_open'] = page.evaluate("""(() => { const a=document.activeElement; return {tag:a.tagName,id:a.id,cls:String(a.className).slice(0,40),
      inSheet:!!a.closest('.shop-filters__sheet')}; })()""")
    # اختبار حبس التركيز: 20 Tab
    R['trap_tabs'] = tab_stops(page, 20)
    # Shift+Tab wrap
    R['trap_shift'] = []
    for _ in range(6):
        page.keyboard.press('Shift+Tab')
        page.wait_for_timeout(70)
        R['trap_shift'].append(page.evaluate("""(() => { const a=document.activeElement; return {tag:a.tagName,id:a.id,cls:String(a.className).slice(0,36),
          inSheet:!!a.closest('.shop-filters__sheet')}; })()"""))
    # Escape
    before_esc = page.evaluate("({open: !!document.querySelector('.shop-filters.is-open'), focus: document.activeElement ? (document.activeElement.id||document.activeElement.className) : null, body: getComputedStyle(document.body).overflowY, expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded')})")
    page.keyboard.press('Escape')
    page.wait_for_timeout(700)
    after_esc = page.evaluate("({open: !!document.querySelector('.shop-filters.is-open'), focus: document.activeElement ? (document.activeElement.id||document.activeElement.className) : null, body: getComputedStyle(document.body).overflowY, expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded')})")
    R['escape'] = {'before': before_esc, 'after': after_esc}
    # زر الإغلاق
    ensure_open(page)
    try:
        page.click('.shop-filters__sheet-close', timeout=4000)
    except Exception as exc:
        R['close_btn_error'] = str(exc).split('\n')[0][:90]
    page.wait_for_timeout(700)
    R['close_btn'] = page.evaluate("({open: !!document.querySelector('.shop-filters.is-open'), focus: document.activeElement ? (document.activeElement.id||document.activeElement.className) : null, expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded'), body: getComputedStyle(document.body).overflowY})")
    # زر «عرض النتائج»
    ensure_open(page)
    try:
        page.click('.shop-filters__done', timeout=4000)
    except Exception as exc:
        R['close_done_error'] = str(exc).split('\n')[0][:90]
    page.wait_for_timeout(700)
    R['close_done'] = page.evaluate("({open: !!document.querySelector('.shop-filters.is-open'), focus: document.activeElement ? (document.activeElement.id||document.activeElement.className) : null, expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded'), body: getComputedStyle(document.body).overflowY})")
    # النقر على الـscrim (أعلى الشاشة)
    ensure_open(page)
    page.mouse.click(195, 25)
    page.wait_for_timeout(700)
    R['close_scrim'] = page.evaluate("({open: !!document.querySelector('.shop-filters.is-open'), focus: document.activeElement ? (document.activeElement.id||document.activeElement.className) : null, expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded'), body: getComputedStyle(document.body).overflowY})")
    # التحقق من صحة الـcheckbox: نقر على النص/الصف + مسافة
    ensure_open(page)
    cb1 = page.evaluate("document.getElementById('shop-filter-offers').checked")
    page.evaluate("(() => { const s = document.querySelector('.shop-check'); if (s) s.scrollIntoView({block: 'center'}); })()")
    page.wait_for_timeout(300)
    try:
        page.click('.shop-check span', timeout=4000)   # النقر على النص داخل الشريحة الأولى
    except Exception as exc:
        R['check_click_error'] = str(exc).split('\n')[0][:90]
    page.wait_for_timeout(400)
    cb2 = page.evaluate("document.getElementById('shop-filter-instock').checked")
    page.evaluate("document.getElementById('shop-filter-offers').focus()")
    page.keyboard.press('Space')
    page.wait_for_timeout(400)
    cb3 = page.evaluate("document.getElementById('shop-filter-offers').checked")
    R['checkbox'] = {'offers_initial': cb1, 'after_label_click_instock': cb2, 'after_space_offers': cb3}
    R['textzoom_note'] = 'zoom يتم في قسم منفصل'
    ctx.close()

    # ============ B) 768 → 769 انتقال ============
    ctx = b.new_context(viewport={'width': 768, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    page.click('#shop-filters-toggle')
    page.wait_for_timeout(800)
    R['t768_open'] = page.evaluate(A11Y)
    page.set_viewport_size({'width': 769, 'height': 900})
    page.wait_for_timeout(900)
    R['t769_after_resize'] = page.evaluate(A11Y)
    R['t769_tabbables'] = page.evaluate(TABBABLE)
    shoot(page, 'resize-769')
    page.set_viewport_size({'width': 768, 'height': 900})
    page.wait_for_timeout(900)
    R['t768_back'] = page.evaluate(A11Y)
    ctx.close()

    # ============ C) تصادم الطبقات (قائمة/بحث/فلاتر) ============
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    col = {}
    def state():
        return page.evaluate("""(() => ({menu: !!document.querySelector('.shop-drawer.is-open'), search: !!document.querySelector('.shop-search-sheet.is-open'),
          filters: !!document.querySelector('.shop-filters.is-open'), body: getComputedStyle(document.body).overflowY,
          expanded: document.getElementById('shop-filters-toggle').getAttribute('aria-expanded'),
          focus: document.activeElement ? (document.activeElement.id || String(document.activeElement.className).slice(0,30)) : null}))()""")
    ensure_closed(page)
    page.click('#shop-burger'); page.wait_for_timeout(800); col['menu_open'] = state()
    page.keyboard.press('Escape'); page.wait_for_timeout(800); col['menu_closed'] = state()
    ensure_closed(page)
    page.click('#shop-filters-toggle'); page.wait_for_timeout(800); col['filters_open'] = state()
    page.keyboard.press('Escape'); page.wait_for_timeout(800); col['filters_closed'] = state()
    ensure_closed(page)
    page.click('#shop-search-btn'); page.wait_for_timeout(900); col['search_open'] = state()
    page.keyboard.press('Escape'); page.wait_for_timeout(800); col['search_closed'] = state()
    ensure_closed(page)
    page.click('#shop-filters-toggle'); page.wait_for_timeout(700)
    # الفلاتر مفتوحة: الـscrim يغطّي الهيدر ⇒ نجرّب فتح البحث برمجيًا لاختبار الحالة العالقة
    try:
        page.click('#shop-search-btn', timeout=3500)
        R['search_click_while_filters'] = 'clickable'
    except Exception as exc:
        R['search_click_while_filters'] = 'blocked-by-scrim'
        page.evaluate("document.getElementById('shop-search-btn').click()")
    page.wait_for_timeout(900)
    col['filters_then_search'] = state()
    page.keyboard.press('Escape'); page.wait_for_timeout(800); col['after_both_escape'] = state()
    R['collisions'] = col
    # تغيير المسار واللوحة مفتوحة
    ensure_closed(page)
    page.click('#shop-filters-toggle'); page.wait_for_timeout(700)
    page.evaluate('location.hash = "#/products?categoryId=293"')
    page.wait_for_timeout(1900)
    R['route_change'] = state()
    ctx.close()

    # ============ D) التركيز: تباين + أهداف اللمس (فاتح/داكن × 390/1366) ============
    for w in (390, 1366):
        for theme in ('light', 'dark'):
            ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
            if theme == 'dark':
                ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
            page = ctx.new_page()
            page.goto(SHOP, wait_until='load')
            page.wait_for_timeout(1400)
            page.evaluate('location.hash = "#/products"')
            page.wait_for_timeout(1800)
            key = 'focus_%d_%s' % (w, theme)
            # عناصر مرشّحة للتركيز
            R[key] = page.evaluate(r"""(() => {
              const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
                const p = m[1].split(',').map(parseFloat); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
              const effBg = el => { let cur=el, st=[]; while(cur){ const c=parse(getComputedStyle(cur).backgroundColor);
                if(c&&c.a>0) st.push(c); if(c&&c.a>=1) break; cur=cur.parentElement; }
                let base={r:255,g:255,b:255}; for(let i=st.length-1;i>=0;i--){ const s=st[i];
                  base={r:s.r*s.a+base.r*(1-s.a), g:s.g*s.a+base.g*(1-s.a), b:s.b*s.a+base.b*(1-s.a)}; } return base; };
              const lum = c => { const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);};
                return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
              const ratio = (fg,bg) => { const a=lum(fg),b=lum(bg),hi=Math.max(a,b),lo=Math.min(a,b); return Math.round(((hi+0.05)/(lo+0.05))*100)/100; };
              const probe = (sel, label) => { const el = document.querySelector(sel); if (!el) return null;
                el.focus(); const cs = getComputedStyle(el); const bg = effBg(el);
                const oc = parse(cs.outlineColor) || {r:0,g:0,b:0,a:1};
                const ocSolid = oc.a<1 ? {r:oc.r*oc.a+bg.r*(1-oc.a), g:oc.g*oc.a+bg.g*(1-oc.a), b:oc.b*oc.a+bg.b*(1-oc.a)} : oc;
                return {label:label, outline: cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor, offset: cs.outlineOffset,
                  shadow: cs.boxShadow.slice(0,50), bg: 'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')',
                  ratio: ratio(ocSolid, bg)}; };
              const out = {};
              out.toggle = probe('#shop-filters-toggle', 'زر الفلاتر');
              out.search = probe('#shop-filter-search', 'حقل البحث');
              out.select = probe('#shop-filter-category', 'قائمة التصنيف');
              out.check = probe('#shop-filter-offers', 'checkbox');
              out.cardLink = probe('.shop-card__media', 'رابط صورة المنتج');
              out.cardName = probe('.shop-card__name a', 'رابط اسم المنتج');
              out.cardAdd = probe('.shop-card__add', 'زر السلة');
              document.activeElement && document.activeElement.blur();
              return out; })()""")
            # أهداف اللمس
            R['targets_%d_%s' % (w, theme)] = page.evaluate(r"""(() => {
              const out = [];
              Array.from(document.querySelectorAll('#shop-view a, #shop-view button, #shop-view input, #shop-view select, #shop-view label')).forEach(el => {
                const b = el.getBoundingClientRect(); if (!b.width || !b.height) return;
                const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
                if (b.width < 44 || b.height < 44) out.push({tag: el.tagName, cls: String(el.className).slice(0,40), id: el.id,
                  text: (el.textContent||'').trim().slice(0,22), w: Math.round(b.width), h: Math.round(b.height)});
              });
              return out; })()""")
            print('%-16s toggle=%s ratio=%s | cardLink=%s | add=%s' % (key, R[key]['toggle'] and R[key]['toggle']['outline'],
                  R[key]['toggle'] and R[key]['toggle']['ratio'], R[key]['cardLink'] and R[key]['cardLink']['ratio'], R[key]['cardAdd'] and R[key]['cardAdd']['ratio']))
            ctx.close()

    # ============ E) ترتيب Tab على صفحة المنتجات والتصنيفات ============
    for w, label in [(390, 'products'), (1366, 'products'), (1366, 'taxonomy')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "%s"' % ('#/products?view=categories' if label == 'taxonomy' else '#/products'))
        page.wait_for_timeout(1800)
        page.evaluate('document.body.focus()')
        stops = tab_stops(page, 16)
        R['taborder_%s_%d' % (label, w)] = stops
        print('taborder %s %d: %s' % (label, w, [(s['tag'], s['cls'][:18] or s['id']) for s in stops[:10]]))
        ctx.close()

    # ============ F) الحالات: تحميل/فارغ/خطأ (390 + 1366) ============
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.route('**/products?*', lambda route: None)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1500)
    R['loading_390'] = page.evaluate(A11Y)
    R['loading_tabbables'] = page.evaluate(TABBABLE)
    shoot(page, 'loading-390')
    ctx.close()
    for theme in ('light', 'dark'):
        ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
        if theme == 'dark':
            ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products?minPrice=99999"')
        page.wait_for_timeout(1900)
        R['empty_%s' % theme] = page.evaluate(A11Y)
        shoot(page, 'empty-%s' % theme)
        ctx.close()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    ctx.add_init_script("try{localStorage.setItem('alwled.theme','dark')}catch(e){}")
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.route('**/products?*', lambda r: r.abort())
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(2100)
    R['error_dark'] = page.evaluate(A11Y)
    shoot(page, 'error-dark')
    ctx.close()

    # ============ G) التقليل من الحركة ============
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar', reduced_motion='reduce')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load')
    page.wait_for_timeout(1400)
    page.evaluate('location.hash = "#/products"')
    page.wait_for_timeout(1800)
    R['reduced_motion'] = page.evaluate("""(() => { const s=document.querySelector('.shop-filters__sheet');
      const c=document.querySelector('.shop-card'); const sk=document.querySelector('.skeleton');
      return {sheetTransition: getComputedStyle(s).transitionDuration, cardTransition: getComputedStyle(c).transitionDuration,
        skeletonAnim: sk ? getComputedStyle(sk).animationName : 'n/a', taxoTransition: getComputedStyle(document.querySelector('.shop-taxonomy__item')||document.body).transitionDuration}; })()""")
    try:
        page.click('#shop-filters-toggle', timeout=4000)
    except Exception:
        page.evaluate("document.getElementById('shop-filters-toggle').click()")
    page.wait_for_timeout(600)
    R['reduced_motion']['sheetOpen'] = page.evaluate("!!document.querySelector('.shop-filters.is-open')")
    ctx.close()

    # ============ H) تكبير النص (تقريب text-only zoom) + تكبير المتصفح ============
    for w in (390, 1366):
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        page = ctx.new_page()
        page.goto(SHOP, wait_until='load')
        page.wait_for_timeout(1400)
        page.evaluate('location.hash = "#/products"')
        page.wait_for_timeout(1800)
        R['zoom100_%d' % w] = page.evaluate("({ov: document.documentElement.scrollWidth - document.documentElement.clientWidth, docH: Math.round(document.documentElement.scrollHeight)})")
        # تقريب تكبير النص 200% (جذر 200%)
        page.evaluate("document.documentElement.style.fontSize = '200%'")
        page.wait_for_timeout(600)
        R['zoom200text_%d' % w] = page.evaluate("""(() => ({ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          cardH: (() => { const c=document.querySelector('#shop-view > .shop-grid .shop-card'); return c?Math.round(c.getBoundingClientRect().height):null; })(),
          addH: (() => { const b=document.querySelector('.shop-card__add'); return b?Math.round(b.getBoundingClientRect().height):null; })(),
          clipped: Array.from(document.querySelectorAll('#shop-view .shop-card__name, #shop-view .shop-card__meta, .shop-toolbar__label, .shop-card__add')).filter(el => el.scrollWidth > el.clientWidth + 2).map(el => String(el.className).slice(0,30))}))()""")
        shoot(page, 'textzoom200-%d' % w)
        page.evaluate("document.documentElement.style.fontSize = ''")
        # تكبير المتصفح 200% ⇒ 780px فعلي يعمل كـ390 CSS (نحاكيه بعرض CSS 390)
        R['browserzoom_note_%d' % w] = 'zoom 200% = CSS viewport نصف العرض ⇒ مغطّى بقياس 390/683'
        ctx.close()

    b.close()

with open(os.path.join(OUT, 'audit3g-%s.json' % MODE), 'w', encoding='utf-8') as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print('\n%s: console=%d failed=%d shots=%d' % (MODE, len(R['console']), len(R['failed']), len(R['shots'])))
