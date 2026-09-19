#!/usr/bin/env python3
"""Stage 14.1 — QA فعلي لمتجر الزوار عبر Playwright على الرابط المنشور.

يفحص: 8 مقاسات بصرية · حالات الزائر · البحث والفلاتر مقابل API حقيقي · تفاصيل منتج ·
دعوة التسجيل عند «أضف إلى السلة» (بلا أي طلب سلة) · drawer للجوال · a11y أساسي · أخطاء الكونسول.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
API = 'https://panel.fahd-car.cloud/alwled-api/api/v1'
OUT = Path('/root/alwled/frontend/tools/qa/shop')
OUT.mkdir(parents=True, exist_ok=True)
VIEWPORTS = [(1920, 1080), (1440, 900), (1280, 800), (1024, 768), (768, 1024), (430, 932), (390, 844), (375, 812)]
results: list[dict] = []


def api(path: str) -> dict:
    """نداء عام للـAPI للزائر: يعيد البيانات بعد فكّ غلاف {success,data}."""
    with urllib.request.urlopen(API + path, timeout=30) as response:
        payload = json.loads(response.read().decode())
    return payload.get('data', payload)


def record(step: str, ok: bool, expected=None, got=None, detail: str = '') -> bool:
    entry = {'step': step, 'status': 'PASS' if ok else 'FAIL'}
    if expected is not None:
        entry['expected'] = expected
    if got is not None:
        entry['got'] = got
    if detail:
        entry['detail'] = str(detail)[:300]
    results.append(entry)
    print(f"{'✓' if ok else '✗'} {step}" + (f'  [{got}]' if not ok and got is not None else ''))
    return ok


def main() -> int:
    products = api('/products?limit=48')
    items = products['items']
    meta = products['meta']
    first = items[0]
    detail_payload = api(f"/products/{first['id']}")
    categories = api('/categories?limit=48')['items']
    brands = api('/brands?limit=48')['items']

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        console_errors: list[str] = []
        ctx = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: console_errors.append('pageerror: ' + str(err)[:200]))

        # ---------- visitor home ----------
        page.goto(SHOP, wait_until='networkidle')
        page.wait_for_timeout(2000)
        home = page.evaluate("""() => ({
            hero: !!document.querySelector('.shop-hero__title'),
            cards: document.querySelectorAll('.shop-card').length,
            taxonomy: document.querySelectorAll('.shop-taxonomy__item').length,
            chips: document.querySelectorAll('.shop-chips .chip').length,
            adminSidebar: !!document.querySelector('.app-sidebar, .app-header, .nav-item'),
            navLinks: [...document.querySelectorAll('.shop-nav__link')].map((a) => a.textContent.trim()),
            actions: [...document.querySelectorAll('#shop-actions .btn')].map((a) => a.textContent.trim()),
            dir: document.documentElement.getAttribute('dir'),
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            session: localStorage.getItem('alwled.session'),
        })""")
        record('visitor: home renders the hero', home['hero'])
        record('visitor: real products from the API are shown', home['cards'] > 0 and home['cards'] <= 8, detail=f"cards={home['cards']}")
        record('visitor: no admin chrome inside the store', not home['adminSidebar'])
        record('visitor: header offers login + register', home['actions'] == ['تسجيل الدخول', 'إنشاء حساب'], detail=json.dumps(home['actions'], ensure_ascii=False))
        record('visitor: no session stored on a fresh visit', home['session'] is None)
        record('store is RTL', home['dir'] == 'rtl')
        record('home has no horizontal overflow', not home['overflow'])

        # ---------- products list, filters, search ----------
        page.goto(SHOP + '#/products', wait_until='networkidle')
        page.wait_for_timeout(2200)
        listing = page.evaluate("""() => ({
            cards: document.querySelectorAll('.shop-card').length,
            count: (document.querySelector('.shop-toolbar__count') || {}).textContent,
            filterLabels: [...document.querySelectorAll('.shop-toolbar [aria-label]')].map((n) => n.getAttribute('aria-label')),
            labelled: [...document.querySelectorAll('.shop-toolbar [aria-label]')].every((n) => !!n.getAttribute('aria-label')),
        })""")
        record('products: cards match the API page size', listing['cards'] == min(12, meta['total']), detail=f"cards={listing['cards']} apiTotal={meta['total']}")
        record('products: total count comes from the API', str(meta['total']) in (listing['count'] or ''), detail=listing['count'])
        record('products: filters are labelled for a11y', listing['labelled'] and len(listing['filterLabels']) >= 4, detail=json.dumps(listing['filterLabels'], ensure_ascii=False))

        page.goto(SHOP + '#/products?search=' + str(first['name']).split('—')[0].strip(), wait_until='networkidle')
        page.wait_for_timeout(2200)
        search_cards = page.evaluate("() => document.querySelectorAll('.shop-card').length")
        expected = len(api('/products?limit=48&search=' + urllib.parse.quote(str(first['name']).split('—')[0].strip()))['items'])
        record('search: results match the API for the same term', search_cards == expected, expected, search_cards)

        if categories:
            page.goto(f"{SHOP}#/products?categoryId={categories[0]['id']}", wait_until='networkidle')
            page.wait_for_timeout(2200)
            filtered = page.evaluate("() => document.querySelectorAll('.shop-card').length")
            expected_category = len(api(f"/products?limit=48&categoryId={categories[0]['id']}")['items'])
            record('category filter matches the API', filtered == expected_category, expected_category, filtered)

        if brands:
            page.goto(f"{SHOP}#/products?brandId={brands[0]['id']}", wait_until='networkidle')
            page.wait_for_timeout(2200)
            filtered_brand = page.evaluate("() => document.querySelectorAll('.shop-card').length")
            expected_brand = len(api(f"/products?limit=48&brandId={brands[0]['id']}")['items'])
            record('brand filter matches the API', filtered_brand == expected_brand, expected_brand, filtered_brand)

        # taxonomy views
        page.goto(SHOP + '#/products?view=categories', wait_until='networkidle')
        page.wait_for_timeout(2000)
        record('categories view renders the API categories', page.evaluate("() => document.querySelectorAll('.shop-taxonomy__item').length") == len(categories),
               len(categories), page.evaluate("() => document.querySelectorAll('.shop-taxonomy__item').length"))
        page.goto(SHOP + '#/products?view=brands', wait_until='networkidle')
        page.wait_for_timeout(2000)
        record('brands view renders the API brands', page.evaluate("() => document.querySelectorAll('.shop-taxonomy__item').length") == len(brands),
               len(brands), page.evaluate("() => document.querySelectorAll('.shop-taxonomy__item').length"))

        # ---------- product details + add to cart as visitor ----------
        page.goto(SHOP + '#/products/' + str(first['id']), wait_until='networkidle')
        page.wait_for_timeout(2200)
        shown = page.evaluate("""() => ({
            name: (document.querySelector('.shop-buy__title') || {}).textContent,
            price: (document.querySelector('.shop-buy__price .shop-price__now') || {}).textContent,
            sku: [...document.querySelectorAll('.shop-fact')].map((n) => n.textContent.trim()),
        })""")
        record('details: name matches the API', shown['name'] == detail_payload['name'], detail_payload['name'], shown['name'])
        record('details: price matches the API exactly', shown['price'] == f"{detail_payload['price']} $", f"{detail_payload['price']} $", shown['price'])
        record('details: sku shown from the API', any(detail_payload.get('sku', '') in part for part in shown['sku']))

        api_calls: list[str] = []
        page.on('request', lambda request: api_calls.append(request.method + ' ' + request.url.split('/api/v1')[-1]) if '/api/v1' in request.url else None)
        page.click('#shop-add-to-cart')
        page.wait_for_timeout(1200)
        prompt = page.evaluate("""() => {
            const dialog = document.querySelector('.modal[role="presentation"] .modal__panel');
            return {
                open: !!dialog,
                title: dialog ? dialog.querySelector('.modal__title').textContent : null,
                buttons: dialog ? [...dialog.querySelectorAll('.btn')].map((b) => b.textContent.trim()) : [],
                focusInside: dialog ? dialog.contains(document.activeElement) : false,
                bodyLocked: document.body.style.overflow === 'hidden',
            };
        }""")
        record('add-to-cart (visitor) opens the auth prompt', prompt['open'] and 'سجّل الدخول' in (prompt['title'] or ''), detail=json.dumps(prompt, ensure_ascii=False))
        record('auth prompt offers login / register / continue browsing',
               prompt['buttons'] == ['تسجيل الدخول', 'إنشاء حساب', 'متابعة التصفح'], detail=json.dumps(prompt['buttons'], ensure_ascii=False))
        record('auth prompt traps focus and locks the page', prompt['focusInside'] and prompt['bodyLocked'])
        record('visitor add-to-cart sends no cart request', not any('/cart' in call for call in api_calls), detail=json.dumps(api_calls))
        page.keyboard.press('Escape')
        page.wait_for_timeout(500)
        record('Escape closes the auth prompt', page.evaluate("() => !document.querySelector('.modal[role=\"presentation\"]')"))
        record('body scroll restored after closing', page.evaluate("() => document.body.style.overflow !== 'hidden'"))

        # ---------- unknown route ----------
        page.goto(SHOP + '#/nope-not-here', wait_until='networkidle')
        page.wait_for_timeout(1500)
        record('unknown route shows the not-found state', page.evaluate("() => !!document.querySelector('.state--empty') && document.body.textContent.includes('غير موجودة')"))

        # ---------- a11y smoke ----------
        page.goto(SHOP, wait_until='networkidle')
        page.wait_for_timeout(1800)
        a11y = page.evaluate("""() => ({
            h1: document.querySelectorAll('h1').length,
            skip: !!document.querySelector('.skip-link'),
            lang: document.documentElement.getAttribute('lang'),
            altOnImages: [...document.querySelectorAll('img')].every((i) => i.hasAttribute('alt')),
            buttonsNamed: [...document.querySelectorAll('button')].every((b) => (b.textContent || '').trim() || b.getAttribute('aria-label')),
        })""")
        record('a11y: exactly one h1 on home', a11y['h1'] == 1, 1, a11y['h1'])
        record('a11y: skip link + lang=ar + named controls + image alts',
               a11y['skip'] and a11y['lang'] == 'ar' and a11y['buttonsNamed'] and a11y['altOnImages'], detail=json.dumps(a11y, ensure_ascii=False))

        focus_visible = page.evaluate("""() => {
            const input = document.getElementById('shop-search-input');
            input.focus();
            const style = getComputedStyle(input);
            return { outline: style.outlineStyle, shadow: style.boxShadow !== 'none' };
        }""")
        record('a11y: focused controls show a visible focus style', focus_visible['outline'] != 'none' or focus_visible['shadow'], detail=json.dumps(focus_visible))

        ctx.close()

        # ---------- reduced motion ----------
        ctx_rm = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        page_rm = ctx_rm.new_page()
        page_rm.goto(SHOP, wait_until='networkidle')
        page_rm.wait_for_timeout(1500)
        duration = page_rm.evaluate("""() => {
            const card = document.querySelector('.shop-card');
            return card ? getComputedStyle(card).transitionDuration : 'none';
        }""")
        record('a11y: prefers-reduced-motion disables transitions', duration in ('0s', '0.00001s', 'none') or duration.startswith('0s'), detail=str(duration))
        ctx_rm.close()

        # ---------- mobile drawer ----------
        mobile_ctx = browser.new_context(locale='ar', viewport={'width': 390, 'height': 844})
        mpage = mobile_ctx.new_page()
        mpage.goto(SHOP, wait_until='networkidle')
        mpage.wait_for_timeout(1800)
        record('mobile: burger is visible and the desktop nav is hidden', mpage.evaluate("""() => {
            const burger = document.getElementById('shop-burger');
            return burger.offsetParent !== null && getComputedStyle(document.getElementById('shop-nav')).display === 'none';
        }"""))
        mpage.click('#shop-burger')
        mpage.wait_for_timeout(600)
        drawer = mpage.evaluate("""() => {
            const drawer = document.getElementById('shop-drawer');
            return { open: !drawer.hidden, expanded: document.getElementById('shop-burger').getAttribute('aria-expanded'),
                     links: [...drawer.querySelectorAll('.shop-drawer__link')].map((a) => a.textContent.trim()),
                     locked: document.body.style.overflow === 'hidden' };
        }""")
        record('mobile: drawer opens with the store links', drawer['open'] and drawer['expanded'] == 'true' and len(drawer['links']) >= 6,
               detail=json.dumps(drawer, ensure_ascii=False))
        mpage.keyboard.press('Escape')
        mpage.wait_for_timeout(500)
        record('mobile: Escape closes the drawer', mpage.evaluate("() => document.getElementById('shop-drawer').hidden"))
        mobile_ctx.close()

        # ---------- visual sweep across the 8 viewports ----------
        for width, height in VIEWPORTS:
            vctx = browser.new_context(locale='ar', viewport={'width': width, 'height': height})
            vpage = vctx.new_page()
            vpage.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
            problems: list[str] = []

            vpage.goto(SHOP, wait_until='networkidle')
            vpage.wait_for_timeout(1800)
            home_probe = vpage.evaluate("""() => ({
                overflow: document.documentElement.scrollWidth > window.innerWidth,
                hero: !!document.querySelector('.shop-hero'),
                cards: document.querySelectorAll('.shop-card').length,
                headerOverflow: (() => { const h = document.querySelector('.shop-header__inner'); return h.scrollWidth > h.clientWidth + 2; })(),
                clippedButtons: [...document.querySelectorAll('.shop-header .btn, .shop-card .btn')].filter((b) => b.offsetParent !== null && b.scrollWidth > b.clientWidth + 2).length,
            })""")
            if home_probe['overflow']:
                problems.append('home horizontal overflow')
            if not home_probe['hero'] or home_probe['cards'] == 0:
                problems.append('home missing hero/cards')
            if home_probe['headerOverflow']:
                problems.append('header overflow')
            if home_probe['clippedButtons']:
                problems.append(f"{home_probe['clippedButtons']} clipped button(s)")
            vpage.screenshot(path=str(OUT / f'{width}x{height}-home.png'), full_page=False)

            vpage.goto(SHOP + '#/products', wait_until='networkidle')
            vpage.wait_for_timeout(1800)
            list_probe = vpage.evaluate("""() => ({
                overflow: document.documentElement.scrollWidth > window.innerWidth,
                cards: document.querySelectorAll('.shop-card').length,
                gridColumns: getComputedStyle(document.querySelector('.shop-grid')).gridTemplateColumns.split(' ').length,
                cardOverflow: [...document.querySelectorAll('.shop-card')].filter((c) => c.scrollWidth > c.clientWidth + 2).length,
            })""")
            if list_probe['overflow']:
                problems.append('products horizontal overflow')
            if list_probe['cards'] == 0:
                problems.append('products missing cards')
            if list_probe['cardOverflow']:
                problems.append('product card content clipped')
            if width <= 640 and list_probe['gridColumns'] > 3:
                problems.append(f"mobile grid too wide ({list_probe['gridColumns']} columns)")
            vpage.screenshot(path=str(OUT / f'{width}x{height}-products.png'), full_page=False)

            vpage.goto(SHOP + '#/products/' + str(first['id']), wait_until='networkidle')
            vpage.wait_for_timeout(2000)
            detail_probe = vpage.evaluate("""() => ({
                overflow: document.documentElement.scrollWidth > window.innerWidth,
                title: !!document.querySelector('.shop-buy__title'),
                gallery: !!document.querySelector('.shop-gallery__stage'),
                cta: (() => { const b = document.getElementById('shop-add-to-cart'); if (!b) return null; const r = b.getBoundingClientRect(); return { width: Math.round(r.width), inViewport: r.left >= -1 && r.right <= window.innerWidth + 1 }; })(),
            })""")
            if detail_probe['overflow']:
                problems.append('details horizontal overflow')
            if not detail_probe['title'] or not detail_probe['gallery']:
                problems.append('details missing gallery/title')
            if not detail_probe['cta'] or not detail_probe['cta']['inViewport']:
                problems.append('add-to-cart CTA outside the viewport')
            vpage.screenshot(path=str(OUT / f'{width}x{height}-product.png'), full_page=False)

            record(f'{width}x{height}: no layout problems', not problems, detail='; '.join(problems) or 'clean',
                   got=None if not problems else '; '.join(problems))
            vctx.close()

        record('no console errors across the whole visitor sweep', not console_errors, detail=json.dumps(console_errors[:3]))
        browser.close()

    report = {
        'shop': SHOP,
        'api': API,
        'viewports': [f'{w}x{h}' for w, h in VIEWPORTS],
        'apiSnapshot': {'products': meta, 'categories': len(categories), 'brands': len(brands)},
        'results': results,
        'pass': sum(1 for r in results if r['status'] == 'PASS'),
        'fail': sum(1 for r in results if r['status'] == 'FAIL'),
        'screenshots': sorted(path.name for path in OUT.glob('*.png')),
    }
    (OUT / 'shop-qa-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\n=== shop QA: {report['pass']}/{len(results)} PASS · failed={report['fail']} · screenshots={len(report['screenshots'])} ===")
    for item in results:
        if item['status'] == 'FAIL':
            print('  ✗', item['step'], '|', item.get('got'), '|', item.get('detail', '')[:140])
    return 1 if report['fail'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
