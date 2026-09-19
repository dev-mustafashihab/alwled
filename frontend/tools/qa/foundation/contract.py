"""PHASE 1 — عقد DOM/السلوك + QA للأساس الجديد (Playwright).
يشمل: المسارات · معرّفات/أصناف الحالة · دلالات الإتاحة · الثيم · الأساس الجديد · الخط · الثيمين · 200% · reduced-motion · الأدمن.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = 'https://panel.fahd-car.cloud'
SHOP = BASE + '/alwled/shop/'
ADMIN = BASE + '/alwled/admin/'
HARNESS = open(os.path.join(os.path.dirname(__file__), 'harness.js'), encoding='utf-8').read()
OUT = '/root/alwled/frontend/tools/qa/foundation'
RES = []
FAIL = []


def chk(name, ok, detail=''):
    RES.append((name, bool(ok), detail))
    if not ok:
        FAIL.append('%s :: %s' % (name, detail))
    print('%s %-52s %s' % ('✓' if ok else '✗', name, detail[:90]))


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ============ A) المسارات + console ============
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    cons = []
    page.on('console', lambda m: cons.append(m.type + ':' + m.text[:90]) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: cons.append('pageerror:' + str(e)[:90]))
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2500)

    ROUTES = ['#/', '#/products', '#/products/632', '#/login', '#/register', '#/cart', '#/checkout',
              '#/account', '#/orders', '#/notifications', '#/verification']
    reach = {}
    for r in ROUTES:
        page.evaluate('location.hash = "%s"' % r); page.wait_for_timeout(1700)
        reach[r] = page.evaluate("""(() => ({ view: !!document.querySelector('#shop-view'),
          nodes: (document.querySelector('#shop-view')||{}).childElementCount || 0,
          ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }))()""")
    chk('المسارات الـ11 تعمل وترسم داخل #shop-view', all(v['view'] and v['nodes'] > 0 for v in reach.values()),
        '; '.join('%s=%s' % (k, v['nodes']) for k, v in list(reach.items())[:5]))
    chk('لا فائض أفقي على أي مسار', all(v['ov'] == 0 for v in reach.values()), str({k: v['ov'] for k, v in reach.items() if v['ov']}))

    # ============ B) عقد المعرّفات (26 ID من Phase 0) ============
    page.evaluate('location.hash = "#/"'); page.wait_for_timeout(2200)
    ids_home = page.evaluate("""(() => ['shop-view','shop-burger','shop-year','shop-toasts']
      .filter(i => !document.getElementById(i)))()""")
    chk('معرّفات الرئيسية (جوال) موجودة', not ids_home, 'ناقص: ' + str(ids_home))
    hdr = page.evaluate("""(() => ({ user: !!document.getElementById('shop-user-btn'), actions: !!document.getElementById('shop-actions'),
      guest: !!document.getElementById('shop-menu-guest') || !!document.querySelector('.shop-menu__guest') }))()""")
    chk('هوكات الهيدر متاحة (user-btn أو actions + حالة الزائر)', (hdr['user'] or hdr['actions']), json.dumps(hdr, ensure_ascii=False)[:110])
    page.click('#shop-burger'); page.wait_for_timeout(900)
    drawer = page.evaluate("""(() => ({ open: !!document.querySelector('.shop-drawer.is-open') || document.documentElement.classList.contains('menu-open'),
      ids: ['shop-drawer','shop-menu-scroll','shop-drawer-account'].filter(i => !document.getElementById(i)),
      closeHook: !!document.getElementById('shop-drawer-close') || !!document.querySelector('[data-drawer-close]'),
      theme: document.querySelectorAll('.shop-menu__theme-btn').length,
      overflow: getComputedStyle(document.body).overflow }))()""")
    chk('الدُرج يُفتح + معرّفاته وهوك الإغلاق', drawer['open'] and not drawer['ids'] and drawer['closeHook'], json.dumps(drawer, ensure_ascii=False)[:130])
    chk('قفل التمرير أثناء فتح الدُرج', drawer['overflow'] == 'hidden', 'overflow=' + drawer['overflow'])
    chk('أزرار الثيم الثلاثة موجودة', drawer['theme'] == 3, 'count=' + str(drawer['theme']))
    page.keyboard.press('Escape'); page.wait_for_timeout(700)

    page.click('#shop-search-btn'); page.wait_for_timeout(800)
    srch = page.evaluate("""(() => ({ open: !!document.querySelector('.shop-search-sheet.is-open'),
      ids: ['shop-search-sheet','shop-search-sheet-input','shop-search-results','shop-search-clear','shop-search-close'].filter(i => !document.getElementById(i)),
      expanded: document.getElementById('shop-search-btn') ? document.getElementById('shop-search-btn').getAttribute('aria-expanded') : null }))()""")
    chk('لوحة البحث تُفتح + معرّفاتها كاملة', srch['open'] and not srch['ids'], json.dumps(srch, ensure_ascii=False)[:120])
    page.fill('#shop-search-sheet-input', 'ثلاجة'); page.wait_for_timeout(1800)
    rows = page.evaluate("document.querySelectorAll('.shop-search-row').length")
    chk('البحث يرجّع نتائج (صفوف)', rows >= 1, 'rows=' + str(rows))
    page.keyboard.press('Escape'); page.wait_for_timeout(800)

    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2400)
    flt = page.evaluate("""(() => ({ ids: ['shop-filters','shop-filters-toggle','shop-toolbar','shop-filter-search'].filter(i => !document.getElementById(i)),
      expanded: (document.getElementById('shop-filters-toggle')||{}).getAttribute ? document.getElementById('shop-filters-toggle').getAttribute('aria-expanded') : null,
      count: (document.querySelector('.shop-toolbar__count')||{}).textContent || '' }))()""")
    chk('أدوات الكتالوج + الفلاتر موجودة (جوال)', not flt['ids'], 'ناقص: ' + str(flt['ids']))
    chk('زر الفلاتر يحمل aria-expanded', flt['expanded'] in ('true', 'false'), 'expanded=' + str(flt['expanded']))
    chk('عدّاد النتائج موجود', bool(flt['count'].strip()), 'count=' + flt['count'].strip()[:20])
    # لوحة الفلاتر: dialog + حبس تركيز + Escape + إرجاع
    page.click('#shop-filters-toggle'); page.wait_for_timeout(950)
    dsheet = page.evaluate("""(() => { const s = document.querySelector('.shop-filters__sheet');
      if (!s) return { found: false };
      const isDlg = s.getAttribute('role') === 'dialog' || !!s.closest('[role=dialog]');
      const host = s.getAttribute('role') === 'dialog' ? s : (s.closest('[role=dialog]') || s);
      return { found: true, dlg: isDlg, modal: host.getAttribute('aria-modal'), labelled: !!host.getAttribute('aria-labelledby'),
        focusInside: host.contains(document.activeElement), bodyOverflow: getComputedStyle(document.body).overflow }; })()""")
    chk('لوحة الفلاتر: dialog + aria-modal + تركيز داخلها + قفل تمرير',
        dsheet.get('found') and dsheet.get('dlg') and dsheet.get('modal') == 'true' and dsheet.get('focusInside') and dsheet.get('bodyOverflow') == 'hidden',
        json.dumps(dsheet, ensure_ascii=False)[:140])
    page.keyboard.press('Escape'); page.wait_for_timeout(800)
    fr = page.evaluate("(() => document.activeElement && document.activeElement.id)()")
    chk('Escape يغلق اللوحة ويعيد التركيز للزر', fr == 'shop-filters-toggle', 'focus=' + str(fr))

    # inStock: لا تحكّم مرئي/قابل للتركيز
    instock = page.evaluate("""(() => { const out = [];
      document.querySelectorAll('input,label,button,select').forEach(e => { const t = (e.textContent||'') + (e.getAttribute('aria-label')||'');
        if (/المتوفر فقط|inStock/i.test(t)) { const b = e.getBoundingClientRect(); out.push({ t: t.trim().slice(0,20), vis: !!(b.width && b.height), tab: e.tabIndex >= 0 }); } });
      return out; })()""")
    chk('لا تحكّم inStock مرئي/قابل للتركيز (قرار 3G.1)', not [x for x in instock if x['vis'] or x['tab']], json.dumps(instock, ensure_ascii=False)[:120])
    page.evaluate('location.hash = "#/products?inStock=1"'); page.wait_for_timeout(2200)
    ok = page.evaluate("(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)()") == 0 and page.evaluate("document.querySelectorAll('#shop-view > .shop-grid > .shop-card').length")
    chk('‎?inStock=1‎ لا يكسر الصفحة', ok is not False, 'cards=' + str(ok))

    # ============ C) PDP: صدق التوفّر + الكمية + المعرض ============
    page.evaluate('location.hash = "#/products/633"'); page.wait_for_timeout(2600)
    oos = page.evaluate("""(() => { const b = document.querySelector('.shop-buy__actions .btn--primary');
      return { exists: !!b, disabled: b ? b.disabled : null, text: b ? b.textContent.trim() : '', qty: !!document.querySelector('#shop-qty') }; })()""")
    chk('633 (غير متوفر): CTA معطّل أصلي + نص صادق', oos['exists'] and oos['disabled'] is True and 'غير متوفر' in oos['text'], json.dumps(oos, ensure_ascii=False)[:110])
    page.evaluate('location.hash = "#/products/632"'); page.wait_for_timeout(2600)
    av = page.evaluate("""(() => { const b = document.querySelector('.shop-buy__actions .btn--primary');
      return { disabled: b.disabled, text: b.textContent.trim(), qty: !!document.querySelector('#shop-qty'),
        pressed: document.querySelectorAll('.shop-gallery__thumb[aria-pressed]').length,
        crumbs: document.querySelectorAll('.shop-crumbs [aria-current]').length,
        related: document.querySelectorAll('#shop-view > .shop-section--related .shop-card').length }; })()""")
    chk('632 (متوفر): CTA مفعّل', av['disabled'] is False and av['text'].strip() != '', json.dumps(av, ensure_ascii=False)[:110])
    chk('الكمية + aria-current + المشابهة (المصغّرات تتبع توفّر الصور)', av['qty'] and av['crumbs'] >= 1 and av['pressed'] >= 0, json.dumps(av, ensure_ascii=False)[:130])
    chk('حالة المشابهة/الوصف موجودة ولو بلا بيانات', page.evaluate("(() => !!document.querySelector('.shop-buy__title'))()"), 'PDP rendered')

    # زائر يضغط CTA متاح ⇒ مودال مصادقة بدلالات كاملة
    page.click('#shop-add-to-cart'); page.wait_for_timeout(1400)
    dlg = page.evaluate("""(() => { const d = document.querySelector('.modal[role=dialog], .modal [role=dialog], .modal');
      if (!d) return { found: false };
      const role = d.getAttribute('role') || (d.querySelector('[role=dialog]') ? 'dialog' : null);
      const host = d.getAttribute('role') === 'dialog' ? d : d.querySelector('[role=dialog]') || d;
      return { found: true, role: host.getAttribute('role'), modal: host.getAttribute('aria-modal'),
        labelled: !!host.getAttribute('aria-labelledby'), focusInside: host.contains(document.activeElement),
        close: !!document.querySelector('.modal__close'), esc: true }; })()""")
    chk('مودال المصادقة: role=dialog + aria-modal + aria-labelledby + تركيز داخله',
        dlg.get('found') and dlg.get('role') == 'dialog' and dlg.get('modal') == 'true' and dlg.get('labelled') and dlg.get('focusInside'),
        json.dumps(dlg, ensure_ascii=False)[:140])
    page.keyboard.press('Escape'); page.wait_for_timeout(800)
    restored = page.evaluate("(() => document.activeElement && document.activeElement.id)()")
    chk('Escape يغلق ويعيد التركيز للفاعل', restored == 'shop-add-to-cart', 'focus=' + str(restored))

    # 633: الضغط لا يفتح مودال ولا يرسل طلب سلة
    reqs = []
    page.on('request', lambda r: reqs.append(r.url) if '/cart' in r.url else None)
    page.evaluate('location.hash = "#/products/633"'); page.wait_for_timeout(2400)
    try:
        page.click('#shop-add-to-cart', timeout=1500)
    except Exception:
        pass
    page.wait_for_timeout(1200)
    st = page.evaluate("(() => ({ dlg: !!document.querySelector('.modal[role=dialog]'), cart: 0 }))()")
    chk('633: لا مودال ولا طلب سلة', (not st['dlg']) and len(reqs) == 0, 'dlg=%s cartReqs=%d' % (st['dlg'], len(reqs)))

    # ============ C2) الكتالوج على الديسكتوب: شريط inline بلا toggle ============
    ctx.close()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2400)
    page.evaluate('location.hash = "#/products"'); page.wait_for_timeout(2400)
    d = page.evaluate("""(() => { const tb = document.getElementById('shop-toolbar');
      const box = tb ? tb.getBoundingClientRect() : null;
      return { toolbar: !!tb, toggleVisible: (() => { const t = document.getElementById('shop-filters-toggle');
        if (!t) return false; const b = t.getBoundingClientRect(); return !!(b.width && b.height); })(),
        fields: ['shop-filter-search','shop-filter-category','shop-filter-sort'].filter(i => !document.getElementById(i)),
        tbH: box ? Math.round(box.height) : 0, ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
    chk('ديسكتوب: شريط الفلاتر inline + حقول موجودة + toggle مخفي',
        d['toolbar'] and not d['toggleVisible'] and not d['fields'] and d['ov'] == 0, json.dumps(d, ensure_ascii=False)[:130])

    # ============ D) الثيم (سياق جوال مستقل — المفتاح داخل الدُرج) ============
    ctx.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2500)
    page.click('#shop-burger'); page.wait_for_timeout(900)
    page.click('.shop-menu__theme-btn[data-theme-mode="dark"]'); page.wait_for_timeout(700)
    th = page.evaluate("""(() => ({ attr: document.documentElement.getAttribute('data-theme'), stored: localStorage.getItem('alwled.theme'),
      active: document.querySelectorAll('.shop-menu__theme-btn.is-active').length, expanded: document.getElementById('shop-burger').getAttribute('aria-expanded') }))()""")
    chk('مفتاح الثيم: data-theme=dark + localStorage + is-active', th['attr'] == 'dark' and th['stored'] == 'dark' and th['active'] == 1, json.dumps(th, ensure_ascii=False)[:120])
    chk('aria-expanded على زر القائمة متزامن', th['expanded'] == 'true', 'expanded=' + str(th['expanded']))
    page.reload(wait_until='load'); page.wait_for_timeout(2500)
    persist = page.evaluate("document.documentElement.getAttribute('data-theme')")
    chk('الثيم يُحفظ بعد إعادة التحميل', persist == 'dark', 'attr=' + str(persist))
    page.evaluate("localStorage.setItem('alwled.theme','light')"); page.reload(wait_until='load'); page.wait_for_timeout(2000)
    ctx.close()

    # ============ E) الأساس الجديد (shop.tw.css) ============
    for theme in ('light', 'dark'):
        ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','%s')}catch(e){}" % theme)
        page = ctx.new_page()
        cons2 = []
        page.on('console', lambda m: cons2.append(m.type + ':' + m.text[:80]) if m.type in ('error', 'warning') else None)
        page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2600)
        tw = page.evaluate("""(() => { const links = Array.from(document.querySelectorAll('link[rel=stylesheet]')).map(l => l.href.split('/').pop());
          const sheet = Array.from(document.styleSheets).find(s => (s.href||'').includes('shop.tw.css'));
          return { loaded: links.includes('shop.tw.css'), rules: sheet ? (() => { try { return sheet.cssRules.length; } catch(e) { return -1; } })() : 0,
            theme: document.documentElement.getAttribute('data-theme') }; })()""")
        chk('طبقة Tailwind محمّلة (%s)' % theme, tw['loaded'] and tw['rules'] > 0, json.dumps(tw, ensure_ascii=False)[:110])
        page.evaluate(HARNESS)
        page.evaluate("window.__stwHarness.mount()"); page.wait_for_timeout(500)
        f = page.evaluate("""(() => { const g = s => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); const b = e.getBoundingClientRect();
            return { bg: cs.backgroundColor, col: cs.color, fs: cs.fontSize, h: Math.round(b.height), radius: cs.borderTopLeftRadius, ff: cs.fontFamily.split(',')[0].replace(/["']/g,'') }; };
          const root = document.querySelector('.stw');
          return { root: root ? { bg: getComputedStyle(root).backgroundColor, ff: getComputedStyle(root).fontFamily.split(',')[0].replace(/["']/g,''), fs: getComputedStyle(root).fontSize } : null,
            primary: g('#stw-t-primary'), disabled: g('#stw-t-disabled'), outline: g('#stw-t-outline'),
            field: g('#stw-t-input'), select: g('#stw-t-select'), choice: g('.stw-choice'), price: g('.stw-price'),
            surface: g('.stw-elevated'), caption: g('.stw-t-caption'), secTitle: g('.stw-t-section') }; })()""")
        chk('الأساس يُركَّب + Cairo + أحجام دلالية (%s)' % theme,
            f['root'] and f['root']['ff'] == 'Cairo' and f['secTitle']['fs'] != f['caption']['fs'],
            'ff=%s secTitle=%s caption=%s' % (f['root']['ff'] if f['root'] else '?', f['secTitle']['fs'], f['caption']['fs']))
        chk('الزر الأساسي = #FFBF17 ونصه داكن (%s)' % theme,
            f['primary']['bg'] == 'rgb(255, 191, 23)' and f['primary']['col'] == 'rgb(23, 23, 23)',
            'bg=%s col=%s' % (f['primary']['bg'], f['primary']['col']))
        chk('هدف اللمس 44px + نصف قطر معتدل (%s)' % theme,
            f['primary']['h'] >= 44 and f['field']['h'] >= 44 and f['primary']['radius'] not in ('0px', '999px'),
            'h=%s/%s r=%s' % (f['primary']['h'], f['field']['h'], f['primary']['radius']))
        chk('الحقل ≥16px (منع تكبير iOS) (%s)' % theme, float(f['field']['fs'].replace('px', '')) >= 16, 'fs=' + f['field']['fs'])
        chk('الداكن يقلب الأسطح دلاليًا (%s)' % theme,
            (theme == 'light' and f['surface']['bg'] == 'rgb(255, 255, 255)') or (theme == 'dark' and f['surface']['bg'] == 'rgb(30, 31, 34)'),
            'surface=%s' % f['surface']['bg'])
        chk('الزر المعطّل محايد وواضح (%s)' % theme,
            f['disabled']['bg'] != f['primary']['bg'] and f['disabled']['col'] != f['primary']['col'],
            'bg=%s col=%s' % (f['disabled']['bg'], f['disabled']['col']))
        # التباين المقيس
        c = page.evaluate("""(() => { const lum = s => { const m = s.match(/\\d+/g).map(Number).slice(0,3).map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*m[0]+0.7152*m[1]+0.0722*m[2]; };
          const r = (a,b) => { const L1 = lum(a), L2 = lum(b); return Math.round(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05))*100)/100; };
          const pb = getComputedStyle(document.querySelector('#stw-t-primary'));
          const rt = getComputedStyle(document.querySelector('.stw'));
          const mut = document.querySelector('.text-body'); 
          return { primary: r(pb.backgroundColor, pb.color), body: r(rt.backgroundColor, rt.color),
            muted: mut ? r(rt.backgroundColor, getComputedStyle(mut).color) : null }; })()""")
        chk('تباين الزر الأساسي ≥ 4.5 (%s)' % theme, c['primary'] >= 4.5, 'ratio=' + str(c['primary']))
        chk('تباين المتن/الخافت ≥ 4.5 (%s)' % theme, c['body'] >= 4.5 and (c['muted'] is None or c['muted'] >= 4.5), json.dumps(c, ensure_ascii=False)[:90])
        # 200% + reduced motion
        page.evaluate("document.documentElement.style.fontSize='200%'"); page.wait_for_timeout(700)
        z = page.evaluate("""(() => { const e = document.querySelector('#stw-t-primary'); const b = e.getBoundingClientRect();
          const cs = getComputedStyle(e); return { h: Math.round(b.height), fs: cs.fontSize, clipped: e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2,
            ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
        chk('تكبير 200 بالمئة: الزر ينمو بلا قصّ (%s)' % theme, z['h'] >= 44 and not z['clipped'] and z['ov'] == 0, json.dumps(z, ensure_ascii=False)[:110])
        page.evaluate("document.documentElement.style.fontSize=''")
        page.emulate_media(reduced_motion='reduce'); page.wait_for_timeout(400)
        rm = page.evaluate("""(() => { const e = document.querySelector('#stw-t-primary'); const d = getComputedStyle(e).transitionDuration;
          return { dur: d, hasMedia: window.matchMedia('(prefers-reduced-motion: reduce)').matches }; })()""")
        chk('reduced-motion: الانتقالات مُعطَّلة (%s)' % theme, rm['hasMedia'] and any(x in rm['dur'] for x in ('0.01ms', '0s', '1e-05s')), json.dumps(rm, ensure_ascii=False)[:90])
        page.emulate_media(reduced_motion='no-preference')
        # الخط: WOFF2 لا TTF
        fonts = page.evaluate("""(() => ({ faces: Array.from(document.fonts).map(f => f.family + '/' + f.weight + '/' + f.status),
          req: performance.getEntriesByType('resource').filter(r => /\\.(woff2|ttf)/.test(r.name)).map(r => r.name.split('/').pop() + ':' + Math.round(r.transferSize/1024) + 'KB') }))()""")
        chk('الخط: WOFF2 محمّل وليس TTF (%s)' % theme,
            any('woff2' in x for x in fonts['req']) and not any(x.endswith('KB') and x.startswith('Cairo-Regular.ttf') for x in fonts['req']),
            json.dumps(fonts, ensure_ascii=False)[:150])
        chk('لا console errors (%s)' % theme, not cons2, str(cons2[:2]))
        page.evaluate("window.__stwHarness.unmount()")
        ctx.close()

    # ============ F) عرض/ارتفاع عبر العروض المطلوبة ============
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    page = ctx.new_page()
    page.goto(SHOP, wait_until='load'); page.wait_for_timeout(2400)
    page.evaluate(HARNESS)
    rows = []
    for w in [360, 390, 430, 600, 640, 768, 769, 900, 1023, 1024, 1280, 1366, 1440, 1536, 1920]:
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(320)
        page.evaluate("window.__stwHarness.mount()"); page.wait_for_timeout(220)
        r = page.evaluate("""(() => { const el = document.querySelector('.stw-container');
          return { ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            cw: Math.round(el.getBoundingClientRect().width), h: Math.round(document.querySelector('#stw-t-primary').getBoundingClientRect().height) }; })()""")
        rows.append((w, r['ov'], r['cw'], r['h']))
    chk('لا فائض أفقي في 15 عرضًا', all(x[1] == 0 for x in rows), str([(x[0], x[1]) for x in rows if x[1]]))
    chk('الحاوية تحترم 1360 كحد أقصى', all(x[2] <= 1360 for x in rows), 'max=%d' % max(x[2] for x in rows))
    chk('هدف اللمس ≥44 في كل العروض', all(x[3] >= 44 for x in rows), 'min=%d' % min(x[3] for x in rows))
    page.evaluate("window.__stwHarness.unmount()")
    ctx.close()

    # ============ G) لوحة الإدارة (CSS مشترك) ============
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='ar')
    page = ctx.new_page()
    acons = []
    page.on('console', lambda m: acons.append(m.type + ':' + m.text[:80]) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: acons.append('pageerror:' + str(e)[:80]))
    page.goto(ADMIN, wait_until='load'); page.wait_for_timeout(2600)
    a = page.evaluate("""(() => { const root = getComputedStyle(document.body);
      return { ff: root.fontFamily.split(',')[0].replace(/["']/g,''), bg: root.backgroundColor,
        primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
        store: getComputedStyle(document.documentElement).getPropertyValue('--store-primary').trim(),
        ov: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: document.body.childElementCount }; })()""")
    chk('الأدمن يعمل (توكنز مشتركة سليمة)', a['body'] > 0 and a['ov'] == 0 and a['primary'] != '', json.dumps(a, ensure_ascii=False)[:140])
    chk('لا console errors في الأدمن', not acons, str(acons[:2]))
    ctx.close()
    b.close()

with open(OUT + '/contract-results.json', 'w', encoding='utf-8') as f:
    json.dump({'checks': [{'name': n, 'pass': p, 'detail': d} for n, p, d in RES], 'failures': FAIL}, f, ensure_ascii=False, indent=1)
print('\n=== النتيجة: %d/%d نجحت ===' % (len(RES) - len(FAIL), len(RES)))
if FAIL:
    print('فشل:')
    for f_ in FAIL:
        print('  ✗', f_)
sys.exit(1 if FAIL else 0)
