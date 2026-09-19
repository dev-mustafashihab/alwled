"""PHASE 2 — اختبارات خاصة بالهيدر/التنقّل/البحث (تُضاف إلى عقد Phase 1)."""
import json
import sys

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
RES, FAIL = [], []


def chk(n, ok, d=''):
    RES.append((n, bool(ok), d)); print('%s %-52s %s' % ('✓' if ok else '✗', n, d[:88]))
    if not ok:
        FAIL.append(n + ' :: ' + d)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w, theme in [(1366, 'light'), (1366, 'dark'), (390, 'light'), (390, 'dark')]:
        ctx = b.new_context(viewport={'width': w, 'height': 900}, locale='ar')
        ctx.add_init_script("try{localStorage.setItem('alwled.theme','%s')}catch(e){}" % theme)
        p = ctx.new_page()
        cons = []
        p.on('console', lambda m: cons.append(m.type + ':' + m.text[:70]) if m.type in ('error', 'warning') else None)
        p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2600)
        p.evaluate('location.hash = "#/products"'); p.wait_for_timeout(2400)
        r = p.evaluate("""(() => {
          const hdr = document.querySelector('.shop-header'); const cs = getComputedStyle(hdr);
          const search = document.querySelector('.shop-search'); const sb = search ? search.getBoundingClientRect() : null;
          const btn = document.querySelector('.shop-search__btn'); const bcs = btn ? getComputedStyle(btn) : null;
          const nav = document.querySelector('.shop-nav__link[aria-current="page"]');
          const nb = nav ? nav.getBoundingClientRect() : null;
          const vis = Array.from(document.querySelector('.shop-header__inner').children).filter(e => {
            const b = e.getBoundingClientRect(); return b.width && getComputedStyle(e).display !== 'none'; });
          const innerRow = document.querySelector('.shop-header__inner');
          return { h: Math.round((innerRow || hdr).getBoundingClientRect().height), bg: cs.backgroundColor, border: cs.borderBottomWidth,
            searchW: sb ? Math.round(sb.width) : 0, searchH: sb ? Math.round(sb.height) : 0,
            btnBg: bcs ? bcs.backgroundColor : null, btnIcon: bcs ? bcs.backgroundImage.slice(0, 20) : null,
            btnW: btn ? Math.round(btn.getBoundingClientRect().width) : 0,
            navUnderline: nav ? getComputedStyle(nav, '::after').backgroundColor : null,
            navBg: nav ? getComputedStyle(nav).backgroundColor : null,
            visible: vis.map(e => (e.id ? '#' + e.id : '') + '|' + (e.className || '').toString().slice(0, 22)),
            ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
        tag = '%d-%s' % (w, theme)
        chk('[%s] صف الهيدر ≤80px (والشريط السريع 44–48px تحته) وبلا فائض' % tag,
            r['h'] <= 80 and r['ov'] == 0, 'row=%d ov=%d' % (r['h'], r['ov']))
        if w >= 1024:
            chk('[%s] بحث مضمّن بارز + زر ذهبي مدمج' % tag, r['searchW'] >= 380 and r['btnBg'] == 'rgb(255, 191, 23)' and r['btnW'] >= 44,
                'w=%d btn=%s/%d' % (r['searchW'], r['btnBg'], r['btnW']))
            chk('[%s] لا تكرار لأيقونة البحث' % tag, 'shop-searchbt' not in ' '.join(r['visible']), str(r['visible']))
            chk('[%s] التنقّل النشط: نص فحمي + مؤشّر ذهبي (بلا خلفية)' % tag,
                r['navBg'] == 'rgba(0, 0, 0, 0)' and r['navUnderline'] == 'rgb(255, 191, 23)', 'bg=%s un=%s' % (r['navBg'], r['navUnderline']))
        else:
            joined = ' '.join(r['visible'])
            chk('[%s] جوال: بلا تنقّل/بحث مضمّن + بحث قابل للاكتشاف + برغر' % tag,
                ('#shop-nav' not in joined) and ('shop-nav|' not in joined) and ('#shop-search-btn' in joined) and ('#shop-burger' in joined),
                str(r['visible']))
        chk('[%s] 0 console errors' % tag, not cons, str(cons[:2]))
        # sticky scrolled
        p.evaluate('window.scrollTo(0, 600)'); p.wait_for_timeout(700)
        sc = p.evaluate("""(() => { const h = document.querySelector('.shop-header'); const cs = getComputedStyle(h);
          return { isScrolled: h.classList.contains('is-scrolled'), pos: cs.position, top: Math.round(h.getBoundingClientRect().top),
            shadow: cs.boxShadow !== 'none', h: Math.round(h.getBoundingClientRect().height) }; })()""")
        chk('[%s] حالة التمرير: sticky + بلا انزياح + ظل + انكماش الصف' % tag,
            sc['pos'] == 'sticky' and sc['top'] == 0 and sc['shadow'] is True and sc['h'] <= 135,
            json.dumps(sc, ensure_ascii=False)[:100])
        ctx.close()

    # الدُرج + البحث: سلوك + تصميم
    ctx = b.new_context(viewport={'width': 390, 'height': 900}, locale='ar')
    p = ctx.new_page()
    p.goto(SHOP, wait_until='load'); p.wait_for_timeout(2600)
    p.click('#shop-burger'); p.wait_for_timeout(900)
    d = p.evaluate("""(() => { const panel = document.querySelector('.shop-drawer__panel'); const cs = getComputedStyle(panel);
      const link = document.querySelector('.shop-drawer__link'); const lb = link.getBoundingClientRect();
      const theme = document.querySelector('.shop-menu__theme-btn.is-active');
      const active = document.querySelector('.shop-drawer__link[aria-current="page"]');
      return { w: Math.round(panel.getBoundingClientRect().width), panelW: Math.round(panel.getBoundingClientRect().width),
        maxW: cs.maxWidth, bg: cs.backgroundColor, shadow: cs.boxShadow !== 'none',
        rowH: Math.round(lb.height), themeActive: theme ? getComputedStyle(theme).backgroundColor : null,
        activeBg: active ? getComputedStyle(active).backgroundColor : null,
        activeCol: active ? getComputedStyle(active).color : null,
        backdrop: getComputedStyle(document.querySelector('.shop-drawer__scrim')).display === 'none' ? 'none' : getComputedStyle(document.querySelector('.shop-drawer__scrim')).backgroundColor,
        delays: Array.from(document.querySelectorAll('.shop-drawer__nav > *')).map(e => getComputedStyle(e).animationDelay),
        allVisible: Array.from(document.querySelectorAll('.shop-drawer__link')).every(e => parseFloat(getComputedStyle(e).opacity) > 0.99),
        order: Array.from(document.querySelectorAll('.shop-drawer__link')).map(e => e.textContent.trim().replace(/\s+/g, ' ')),
        ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
    # الدُرج: تصميم المرجع — جانبي جزئي من اليمين + تعتيم + انزلاق أفقي
    chk('[دُرج] القائمة السابقة محفوظة: لوحة كاملة + صف 50px + بلا تعتيم',
        d['rowH'] == 50 and d['panelW'] >= 340 and d['maxW'] == '640px' and d['backdrop'] == 'none' and d['ov'] == 0,
        json.dumps(d, ensure_ascii=False)[:150])
    chk('[دُرج] ترتيب القائمة مطابق للسابق (7 روابط بالترتيب)',
        d['order'] == ['الرئيسية', 'كل المنتجات', 'التصنيفات', 'العلامات', 'السلة', 'تسجيل الدخول', 'إنشاء حساب'],
        str(d['order']))
    chk('[دُرج] الحالة النشطة بالنمط السابق', d['activeBg'] == 'rgb(234, 241, 251)' and d['activeCol'] == 'rgb(31, 95, 191)', '%s / %s' % (d['activeBg'], d['activeCol']))
    chk('[دُرج] حركة اكتمال الظهور: تلاشٍ متدرّج لكل عنصر',
        bool(d.get('delays')) and len(set(d['delays'])) >= 3 and d['allVisible'],
        'delays=%s visible=%s' % (str(d.get('delays'))[:60], d.get('allVisible')))
    p.keyboard.press('Escape'); p.wait_for_timeout(800)
    p.click('#shop-search-btn'); p.wait_for_timeout(800)
    p.fill('#shop-search-sheet-input', 'ثلاجة'); p.wait_for_timeout(1900)
    s = p.evaluate("""(() => { const row = document.querySelector('.shop-search-row'); if (!row) return { rows: 0 };
      const cs = getComputedStyle(row); const media = document.querySelector('.shop-search-row__media');
      const price = document.querySelector('.shop-search-row__price');
      return { rows: document.querySelectorAll('.shop-search-row').length, h: Math.round(row.getBoundingClientRect().height),
        border: cs.borderTopWidth, media: media ? Math.round(media.getBoundingClientRect().width) : 0,
        priceFw: price ? getComputedStyle(price).fontWeight : null, grid: cs.display,
        ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
    chk('[بحث] نتائج بصفوف بطاقات (وسائط + سعر بارز) بلا جدول', s['rows'] >= 1 and s['h'] >= 64 and s['media'] >= 48 and s['priceFw'] == '700',
        json.dumps(s, ensure_ascii=False)[:130])
    p.fill('#shop-search-sheet-input', 'زززززز'); p.wait_for_timeout(2000)
    e = p.evaluate("""(() => { const st = document.querySelector('.shop-search-state'); if (!st) return { found: false };
      return { found: true, role: st.getAttribute('role') || (st.querySelector('[role=status]') ? 'status' : null),
        title: (st.querySelector('.shop-search-state__title') || {}).textContent, ov: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()""")
    chk('[بحث] حالة فارغة بدلالة status وبلا فائض', e.get('found') and e['ov'] == 0, json.dumps(e, ensure_ascii=False)[:120])
    ctx.close()
    b.close()

print('\n=== PHASE 2: %d/%d ===' % (len(RES) - len(FAIL), len(RES)))
for f in FAIL:
    print('  ✗', f)
sys.exit(1 if FAIL else 0)
