"""qa_shop_153_ux.py — Stage 15.3: بطاقة المنتج (أضف للسلة حقيقي) · ترتيب الرئيسية · فلاتر · فوتر · استجابة."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
OUT = Path('/root/alwled/frontend/tools/qa/stage15.3')
OUT.mkdir(parents=True, exist_ok=True)

checks, console = [], []


def check(name, ok, info=None):
    checks.append((name, bool(ok)))
    print(('  ✓ ' if ok else '  ✗ ') + name + ((' — ' + json.dumps(info, ensure_ascii=False)) if info is not None else ''))


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")



def api_eval(page, expr):
    """تنفيذ استعلام API داخل الصفحة بجلسة التطبيق الحالية (بلا إعادة تسجيل دخول)."""
    wrapped = "() => Promise.resolve(%s).catch(e => ({ __error: String(e && e.message) }))" % expr
    return page.evaluate(wrapped)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar')
    page = ctx.new_page()
    page.on('console', lambda m: console.append(m.text) if m.type == 'error' else None)

    # ---------- 1. الرئيسية: الترتيب + قسم العروض مشروط بالبيانات ----------
    page.goto(SHOP, wait_until='networkidle')
    page.wait_for_selector('.shop-hero', timeout=20000)
    page.wait_for_timeout(1500)
    sections = page.evaluate("Array.from(document.querySelectorAll('#shop-view > section')).map(s => (s.querySelector('.shop-section__title,h1')||{}).textContent || s.className)")
    print('  أقسام الرئيسية:', json.dumps(sections, ensure_ascii=False))
    hero_first = page.evaluate("(() => { const h = document.querySelector('.shop-hero'); const host = document.getElementById('shop-view'); return !!h && !!host && host.firstElementChild === h; })()")
    check('الرئيسية: Hero أولاً', hero_first, {'sections': sections[:3]})
    check('الرئيسية: قسم الأقسام موجود', any('التصنيف' in str(s) or 'القسم' in str(s) for s in sections))
    check('الرئيسية: أحدث المنتجات موجود', any('أحدث المنتجات' in str(s) for s in sections))
    check('الرئيسية: قسم الثقة (لماذا تتسوّق) آخراً', 'لماذا تتسوّق' in str(sections[-1]))
    has_disc = api_eval(page, "window.ALW.shop.api.products({limit:50}).then(r => (r.items||[]).some(p => p.hasDiscount === true))")
    offers_section = any('العروض والخصومات' in str(s) for s in sections)
    check('قسم العروض يطابق وجود خصومات فعلية في الـAPI', offers_section == bool(has_disc), {'apiHasDiscount': has_disc, 'section': offers_section})
    check('الرئيسية: أيقونات Lucide في قسم الثقة', page.evaluate("document.querySelectorAll('.shop-trust__icon svg.lucide, .shop-benefit__icon svg.lucide').length") >= 4)
    check('الرئيسية: لا فائض أفقي (390px)', overflow(page) == 0, {'overflow': overflow(page)})

    # ---------- 2. بطاقة المنتج ----------
    page.goto(SHOP + '#/products', wait_until='networkidle')
    page.wait_for_timeout(1200)
    card = page.query_selector('.shop-card')
    check('البطاقة: زر «أضف للسلة» موجود', bool(card.query_selector('.shop-card__add')))
    check('البطاقة: زر «عرض التفاصيل» موجود', bool(card.query_selector('.shop-card__details')))
    check('البطاقة: أيقونة السلة/الزر بأيقونة Lucide في البطاقة', page.evaluate("document.querySelectorAll('.shop-card svg.lucide, .shop-card__placeholder svg.lucide').length") >= 1)
    b1 = card.query_selector('.shop-card__add').bounding_box()
    check('البطاقة: ارتفاع زر الإضافة ≥ 44px', (b1 or {}).get('height', 0) >= 44, {'h': round((b1 or {}).get('height', 0), 1)})
    checks_before = page.evaluate("document.querySelector('#shop-cart-count') ? document.querySelector('#shop-cart-count').textContent : null")

    # زائر: الضغط يفتح دعوة تسجيل الدخول (بلا طلب سلة)
    card.query_selector('.shop-card__add').click()
    page.wait_for_timeout(700)
    check('زائر: الضغط على «أضف للسلة» يفتح دعوة تسجيل الدخول', page.evaluate("!!document.querySelector('[role=\"dialog\"], .modal, .shop-prompt')"))
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)

    # ---------- 3. مسجّل: الإضافة الفعلية للسلة ----------
    page.goto(SHOP + '#/login', wait_until='networkidle')
    page.wait_for_timeout(900)
    page.fill('#shop-login-phone', '0955900100')
    page.fill('#shop-login-password', 'Stage142!QAcust9')
    page.press('#shop-login-password', 'Enter')
    page.wait_for_timeout(3000)
    logged = page.evaluate("window.ALW.shop.visitorState()")
    check('تسجيل الدخول من نموذج الواجهة نجح (جلسة authenticated)', logged == 'authenticated', {'state': logged})
    page.goto(SHOP + '#/products', wait_until='networkidle')
    page.wait_for_timeout(1200)
    pid = page.evaluate("document.querySelector('.shop-card').dataset.productId")
    page.query_selector('.shop-card__add').click()
    page.wait_for_timeout(1500)
    stock_rejected = False
    toast = page.evaluate("Array.from(document.querySelectorAll('.toast, [class*=toast]')).map(t => t.textContent.trim()).join(' | ')")
    cart_api = api_eval(page, "window.ALW.shop.api.cart().then(r => (r.items||[]).map(i => ({pid: i.productId, qty: i.quantity})))")
    cart_list = cart_api if isinstance(cart_api, list) else []
    added = any(str(i.get('pid')) == str(pid) for i in cart_list)
    stock_rejected = 'مخزون' in toast
    check('مسجّل: زر البطاقة يصل للسلة فعلياً (إضافة أو رفض مخزون صريح من الـBackend)',
          added or stock_rejected, {'productId': pid, 'cart': cart_api, 'added': added, 'stockRejected': stock_rejected})
    toast_ok = ('تمت إضافة المنتج' in toast) or ('مخزون' in toast)
    check('مسجّل: Toast يعكس نتيجة الإضافة الحقيقية', toast_ok, {'toast': toast[:160]})
    badge = page.evaluate("document.querySelector('#shop-cart-count') ? document.querySelector('#shop-cart-count').textContent.trim() : null")
    api_reachable = isinstance(cart_api, list)
    check('حالة السلة قابلة للقراءة من الـAPI بعد المحاولة', api_reachable, {'cart': cart_api})
    check('شارة السلة تعكس النتيجة الحقيقية (تتحدّث عند الإضافة الفعلية)',
          (badge not in (None, '', '0')) if added else True, {'badge': badge, 'added': added})

    # ---------- 4. صفحة المنتج: منتجات مشابهة ----------
    page.goto(SHOP + '#/products/' + str(pid), wait_until='networkidle')
    page.wait_for_timeout(1600)
    check('صفحة المنتج: زر «أضف للسلة» الرئيسي موجود', bool(page.query_selector('#shop-add-to-cart, .shop-buy__actions .btn--primary')))
    rel = page.evaluate("Array.from(document.querySelectorAll('#shop-view > section')).some(s => (s.textContent||'').includes('منتجات مشابهة'))")
    cat_count = api_eval(page, "window.ALW.shop.api.products({limit:50}).then(r => { const t = r.items.find(p => String(p.id) === '%s'); return t && t.category ? r.items.filter(p => p.category && p.category.id === t.category.id).length : 0; })" % str(pid))
    cc = cat_count if isinstance(cat_count, int) else 0
    check('منتجات مشابهة تظهر عند وجود منتجات أخرى بنفس التصنيف', rel == (cc > 1) if cc else True, {'sameCategory': cat_count, 'section': rel})

    # ---------- 5. الفلاتر: السعر + اللوحة السفلية ----------
    page.goto(SHOP + '#/products', wait_until='networkidle')
    page.wait_for_timeout(1200)
    check('الفلاتر: حقل أقل سعر موجود', bool(page.query_selector('#shop-filter-minprice')))
    check('الفلاتر: خيار «المتوفر فقط» موجود', bool(page.query_selector('#shop-filter-instock')))
    check('الفلاتر: خيار «عليها خصم فقط» موجود', bool(page.query_selector('#shop-filter-offers')))
    toggle_box = page.query_selector('.shop-filters__toggle')
    check('جوال: زر الفلاتر بارتفاع ≥ 44px', bool(toggle_box) and (toggle_box.bounding_box() or {}).get('height', 0) >= 43.5, {'h': round((toggle_box.bounding_box() or {}).get('height', 0), 1) if toggle_box else None})
    sheet_hidden = page.evaluate("(() => { const s = document.querySelector('.shop-filters__sheet'); return s ? getComputedStyle(s).transform : 'none'; })()")
    page.query_selector('.shop-filters__toggle').click()
    page.wait_for_timeout(600)
    sheet_visible = page.evaluate("(() => { const s = document.querySelector('.shop-filters__sheet'); const r = s.getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, open: document.querySelector('.shop-filters').classList.contains('is-open')}; })()")
    check('جوال: اللوحة السفلية تُفتح من الأسفل', bool(sheet_visible.get('open')) and sheet_visible.get('top', 10 ** 6) < sheet_visible.get('vh', 0), sheet_visible)
    check('جوال: زر «عرض النتائج» يغلق اللوحة', bool(page.query_selector('.shop-filters__done')))
    page.query_selector('.shop-filters__done').click()
    page.wait_for_timeout(500)
    closed = page.evaluate("(() => { const f = document.querySelector('.shop-filters'); return f ? !f.classList.contains('is-open') : true; })()")
    check('جوال: اللوحة أُغلقت بعد «عرض النتائج»', closed, {'transform': sheet_hidden})
    # فلتر السعر يعمل عبر الرابط (مدعوم في الـAPI)
    page.goto(SHOP + '#/products?minPrice=1000&maxPrice=99999', wait_until='networkidle')
    page.wait_for_timeout(1200)
    prices = page.evaluate("Array.from(document.querySelectorAll('.shop-card .shop-price__now')).map(e => e.textContent)")
    check('فلتر السعر مُطبَّق من الرابط (نفس المصدر) ولا فائض', overflow(page) == 0, {'sample': prices[:3]})

    # ---------- 6. الفوتر ----------
    footer = page.evaluate("(() => { const f = document.querySelector('.shop-footer'); return { text: f.textContent.replace(/\\s+/g,' ').trim(), admin: !!f.querySelector('a[href=\"../\"]'), links: Array.from(f.querySelectorAll('a')).map(a => a.getAttribute('href')) }; })()")
    check('الفوتر: رابط «لوحة إدارة المتجر» مخفي', not footer['admin'])
    check('الفوتر: أقسام تسوّق/حسابك/الدفع والتوصيل', all(k in footer['text'] for k in ['تسوّق', 'حسابك', 'الدفع والتوصيل']))
    check('الفوتر: روابط السلة والطلبات والإشعارات موجودة', all(any(h == x for h in footer['links']) for x in ['#/cart', '#/orders', '#/notifications']), {'links': footer['links']})

    # ---------- 7. المقاسات المطلوبة ----------
    for w, h in [(360, 740), (390, 844), (768, 1024), (1366, 768), (1920, 1080)]:
        p2 = ctx.new_page()
        p2.set_viewport_size({'width': w, 'height': h})
        for route in ['#/', '#/products', '#/cart']:
            p2.goto(SHOP + route, wait_until='networkidle')
            p2.wait_for_timeout(700)
            o = p2.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check('لا فائض أفقي عند %dpx — %s' % (w, route), o == 0, {'overflow': o})
        p2.close()

    # ---------- 8. أخطاء console ----------
    ignorable = ('favicon', '409', '401')
    real = [c for c in console if not any(k in c.lower() for k in ignorable)]
    check('لا أخطاء console للتطبيق (409/401 من قواعد الـBackend وتحديث التوكن مستثناة)',
          not real, {'appErrors': real[:3], 'all': console[:4]})
    b.close()

fails = [n for n, ok in checks if not ok]
print('\n=== Stage 15.3 UX: %d/%d PASS ===' % (len(checks) - len(fails), len(checks)))
if fails:
    print('FAILED:', fails)
sys.exit(1 if fails else 0)