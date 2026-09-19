#!/usr/bin/env python3
"""Stage 14.2 — QA فعلي للمصادقة والسلة ومعاينة الطلب (Playwright) على الرابط المنشور.

يشمل: زيارة الزائر · دعوة المصادقة · تسجيل الدخول · إتمام نيّة الإضافة · السلة (كمية/حذف/تفريغ) ·
معاينة الطلب · فحوص الأخطاء (409/404/401 + refresh تلقائي) · عدم وجود أي إنشاء طلب/دفع · لقطات 8 مقاسات.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

SHOP = 'https://panel.fahd-car.cloud/alwled/shop/'
API = 'https://panel.fahd-car.cloud/alwled-api/api/v1'
PHONE = '0955900100'
PASSWORD = 'Stage142!QAcust9'
OUT = Path('/root/alwled/frontend/tools/qa/shop-cart')
OUT.mkdir(parents=True, exist_ok=True)
VIEWPORTS = [(1920, 1080), (1440, 900), (1280, 800), (1024, 768), (768, 1024), (430, 932), (390, 844), (375, 812)]
results: list[dict] = []


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


def api(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method)
    request.add_header('Accept', 'application/json')
    if data:
        request.add_header('Content-Type', 'application/json')
    if token:
        request.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read().decode() or '{}')
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read().decode() or '{}')
        except json.JSONDecodeError:
            return error.code, {}


def wait_authenticated(page, timeout=15000) -> bool:
    """ينتظر اكتمال استعادة الجلسة قبل التفاعل (كانت نقرة سريعة تفتح نافذة الدخول وتحجب ما بعدها)."""
    try:
        page.wait_for_function("() => window.ALW && ALW.shop && ALW.shop.visitorState() === 'authenticated'", timeout=timeout)
        return True
    except Exception:
        return False


def dismiss_modal(page) -> None:
    try:
        if page.locator(".modal").count():
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
    except Exception:
        pass


def main() -> int:
    status, login_payload = api('POST', '/auth/login', body={'phone': PHONE, 'password': PASSWORD})
    token = (login_payload.get('data') or {}).get('accessToken')
    if status != 200 or not token:
        print('cannot continue without the Stage 14.2 test customer:', status)
        return 1
    api('DELETE', '/cart', token)  # نظافة أولية

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        console_errors: list[str] = []
        api_calls: list[str] = []
        ctx = browser.new_context(locale='ar', viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: console_errors.append('pageerror: ' + str(err)[:180]))
        page.on('request', lambda req: api_calls.append(req.method + ' ' + req.url.split('/api/v1')[-1]) if '/api/v1' in req.url else None)

        # ---------- guest: product → add to cart → prompt → no cart call ----------
        page.goto(SHOP + '#/products', wait_until='networkidle')
        page.wait_for_timeout(2000)
        first_id = page.evaluate("() => document.querySelector('.shop-card').dataset.productId")
        page.goto(SHOP + '#/products/' + str(first_id), wait_until='networkidle')
        page.wait_for_timeout(2000)
        record('guest sees the add-to-cart CTA', page.locator('#shop-add-to-cart').count() == 1)
        api_calls.clear()
        page.click('#shop-add-to-cart')
        page.wait_for_timeout(1000)
        record('guest add-to-cart opens the auth prompt', page.evaluate("() => !!document.querySelector('.modal[role=\"presentation\"]')"))
        record('guest add-to-cart sends no cart request', not any('/cart' in call for call in api_calls), detail=json.dumps(api_calls))
        record('guest intent stored without secrets',
               page.evaluate("() => { const raw = sessionStorage.getItem('alwled.shop.pendingAdd'); return !!raw && Object.keys(JSON.parse(raw)).sort().join(',') === 'productId,quantity'; }"))

        # ---------- login from the prompt → cart gets the pending item ----------
        page.click('.modal[role="presentation"] a.btn--primary')
        page.wait_for_timeout(1200)
        page.fill('#shop-login-phone', PHONE)
        page.fill('#shop-login-password', PASSWORD)
        page.click('.shop-auth button[type="submit"]')
        page.wait_for_timeout(4500)
        wait_authenticated(page)
        dismiss_modal(page)
        record('login lands on the cart with the pending product', page.evaluate("() => location.hash") == '#/cart')
        # شرط مسبق صريح: عنصر واحد على الأقل في السلة قبل فحوص الكمية (وإلا نُضيفه عبر الـAPI بنفس الحساب ونسجّل ذلك)
        if page.locator('.shop-cart__item').count() == 0:
            first_id = page.evaluate("() => { const c = document.querySelector('.shop-card'); return c ? c.dataset.productId : null; }")
            if first_id:
                api('POST', '/cart/items', token, {'productId': int(first_id), 'quantity': 1})
                page.reload(wait_until='networkidle')
                wait_authenticated(page)
                page.wait_for_timeout(2500)
                state_note = 'fallback: cart item added via the API for the 14.2 regression preconditions'
                print('note:', state_note)
        record('cart precondition satisfied (≥1 item)', page.locator('.shop-cart__item').count() >= 1,
               page.locator('.shop-cart__item').count())
        cart_calls = [call for call in api_calls if call.startswith('POST /cart/items')]
        record('exactly one add-to-cart request was sent after login', len(cart_calls) == 1, 1, len(cart_calls))
        record('cart page shows the item with the backend price',
               page.locator('.shop-cart__item').count() == 1 and '350.00' in page.inner_text('#shop-cart-list'))
        record('header badge reflects the backend quantity',
               page.evaluate("() => (document.getElementById('shop-cart-badge') || {}).textContent") == '1')
        record('authenticated header shows account + logout',
               page.evaluate("() => !!document.querySelector('.shop-user') && [...document.querySelectorAll('#shop-actions button')].some((b) => b.textContent.includes('خروج'))"))

        # ---------- quantity update ----------
        page.locator('.shop-cart__item .shop-qty__btn').nth(1).click()
        page.wait_for_timeout(3000)
        ui_total = page.evaluate("() => document.querySelector('.shop-cart__row--total strong').textContent")
        status, server_cart = api('GET', '/cart', token)
        server_subtotal = (server_cart.get('data') or {}).get('subtotal')
        record('cart total matches the backend after a quantity change',
               ui_total.replace(' $', '') == str(server_subtotal), server_subtotal, ui_total)

        # ---------- quantity beyond the limit is clamped client-side ----------
        page.fill('.shop-cart__item input[type="number"]', '99')
        page.locator('.shop-cart__item input[type="number"]').press('Enter')
        page.wait_for_timeout(3000)
        clamped = page.evaluate("() => document.querySelector('.shop-cart__item input[type=number]').value")
        record('quantity above the allowed max is clamped (never sent invalid)', int(clamped) <= 20, '<=20', clamped)

        # ---------- checkout preview ----------
        page.goto(SHOP + '#/checkout', wait_until='networkidle')
        page.wait_for_timeout(3000)
        preview_ui = page.evaluate("""() => ({
            rows: document.querySelectorAll('.shop-checkout__row').length,
            total: (document.querySelector('.shop-cart__row--total strong') || {}).textContent,
            currency: (document.body.textContent.match(/العملة: (\\w+)/) || [])[1] || null,
            hasContinue: !!document.getElementById('shop-checkout-continue'),
        })""")
        status, preview_api = api('POST', '/checkout/preview', token)
        payload = preview_api.get('data') or {}
        record('checkout preview renders backend items', preview_ui['rows'] == len(payload.get('items') or []), len(payload.get('items') or []), preview_ui['rows'])
        record('checkout total matches the backend exactly',
               str(preview_ui['total']).replace(' $', '') == str(payload.get('total')), payload.get('total'), preview_ui['total'])
        record('checkout shows the backend currency', preview_ui['currency'] == payload.get('currency'), payload.get('currency'), preview_ui['currency'])
        record('preview declares no order/payment/inventory side effects',
               payload.get('createsOrder') is False and payload.get('createsPayment') is False and payload.get('reservesInventory') is False,
               detail=json.dumps({k: payload.get(k) for k in ('createsOrder', 'createsPayment', 'reservesInventory')}))
        before = len(api_calls)
        page.click('#shop-checkout-continue')
        page.wait_for_timeout(1500)
        after_calls = api_calls[before:]
        record('«متابعة» creates no order and no payment',
               not any(('/orders' in call or '/payments' in call) for call in after_calls), detail=json.dumps(after_calls))
        record('«متابعة» explains the next step honestly', page.evaluate("() => !!document.getElementById('shop-checkout-note')"))

        # ---------- session refresh: an expired access token is refreshed transparently ----------
        refresh_token = page.evaluate("() => window.ALW.session.getRefresh()")
        page.evaluate("(token) => window.ALW.session.start({ accessToken: 'expired.invalid.token', refreshToken: token })", refresh_token)
        probe = page.evaluate("""async () => {
            try { const cart = await window.ALW.shop.api.cart(); return { ok: true, items: (cart.items || []).length }; }
            catch (error) { return { ok: false, status: error && error.status, code: error && error.code }; }
        }""")
        record('an expired access token is refreshed once and the request succeeds', probe.get('ok') is True, detail=json.dumps(probe))

        # ---------- error handling ----------
        toast_text = page.evaluate("""async () => {
            try { await window.ALW.shop.api.cartAdd(999999, 1); return 'no-error'; }
            catch (error) { const info = window.ALW.shop.cartErrorInfo(error); return info.kind + '|' + info.message; }
        }""")
        record('unknown/deleted product surfaces a clear Arabic message', toast_text.startswith('missing|'), detail=toast_text)
        conflict = page.evaluate("""async () => {
            try { await window.ALW.shop.api.cartAdd(parseInt(document.querySelector('.shop-cart__item') ? '633' : '633', 10), 999); return 'no-error'; }
            catch (error) { const info = window.ALW.shop.cartErrorInfo(error); return info.kind + '|' + info.message; }
        }""")
        record('quantity over the backend limit surfaces the server conflict', conflict.startswith('conflict|') and '20' in conflict, detail=conflict)

        # empty-cart preview → blocked state
        api('DELETE', '/cart', token)
        page.goto(SHOP + '#/', wait_until='networkidle')
        page.wait_for_timeout(800)
        page.goto(SHOP + '#/checkout', wait_until='networkidle')
        page.wait_for_timeout(5000)
        empty_state = page.evaluate("() => ({ blocked: !!document.querySelector('.state--error'), text: (document.getElementById('shop-view').textContent || '').replace(/\\s+/g, ' ').slice(0, 120) })")
        record('empty cart shows a blocked checkout state (no crash)',
               empty_state['blocked'] and 'السلة فارغة' in empty_state['text'], detail=json.dumps(empty_state, ensure_ascii=False))

        # remove + clear on a fresh item
        page.evaluate("async () => { await window.ALW.shop.api.cartAdd(633, 2); }")
        page.goto(SHOP + '#/cart', wait_until='networkidle')
        page.wait_for_timeout(2500)
        record('cart renders the item again', page.locator('.shop-cart__item').count() == 1)
        page.locator('.shop-cart__item button.btn--ghost').first.click()
        page.wait_for_timeout(400)
        page.locator('.shop-cart__item button.btn--ghost').first.click()
        page.wait_for_timeout(3000)
        record('remove empties the cart and shows the empty state',
               page.locator('.shop-cart__item').count() == 0 and page.evaluate("() => !!document.querySelector('.state--empty')"))

        # ---------- register validation (no account is created) ----------
        page.goto(SHOP + '#/register', wait_until='networkidle')
        page.wait_for_timeout(1800)
        page.fill('#shop-reg-first', 'Stage142')
        page.fill('#shop-reg-last', 'QA')
        page.fill('#shop-reg-phone', '0955900199')
        page.fill('#shop-reg-password', 'secret123')
        page.fill('#shop-reg-confirm', 'secret999')
        before = len(api_calls)
        page.click('.shop-auth button[type="submit"]')
        page.wait_for_timeout(1500)
        record('register blocks mismatched passwords client-side',
               page.evaluate("() => document.body.textContent.includes('غير متطابقتين')") and not any('/auth/register' in call for call in api_calls[before:]))
        page.fill('#shop-reg-confirm', 'secret123')
        page.fill('#shop-reg-phone', PHONE)  # phone already used → server 409
        before = len(api_calls)
        page.click('.shop-auth button[type="submit"]')
        page.wait_for_timeout(2500)
        record('register surfaces the server conflict in Arabic',
               page.evaluate("() => !!document.querySelector('.alert--danger:not([hidden])')"),
               detail=page.evaluate("() => (document.querySelector('.shop-auth__error-text') || {}).textContent"))
        record('register did not navigate away on failure (no fake success)', page.evaluate("() => location.hash") == '#/register')

        # ---------- logout ----------
        page.goto(SHOP + '#/cart', wait_until='networkidle')
        page.wait_for_timeout(2500)
        page.evaluate("() => window.ALW.app.logout()")
        page.wait_for_timeout(1500)
        record('logout returns the store to the guest state',
               page.evaluate("() => !document.querySelector('.shop-user') && !!document.querySelector('#shop-actions a[href=\"#/login\"]')"))
        record('logout clears the cart badge', page.evaluate("() => !document.getElementById('shop-cart-badge')"))

        expected_console = ('status of 400', 'status of 401', 'status of 404', 'status of 409', 'ERR_INTERNET_DISCONNECTED')
        unexpected_console = [e for e in console_errors if not any(marker in e for marker in expected_console)]
        record('no unexpected console errors during the whole 14.2 journey', not unexpected_console,
               detail=json.dumps(unexpected_console[:3], ensure_ascii=False) + f' (expected test-induced: {len(console_errors) - len(unexpected_console)})')
        record('no order/payment/admin call during the entire journey',
               not any(any(token in call for token in ('/orders', '/payments', '/admin', '/verification')) for call in api_calls),
               detail=json.dumps(sorted(set(api_calls))))
        ctx.close()

        # ---------- visual sweep: auth + cart + checkout at 8 viewports ----------
        # جلسة واحدة تُعاد استخدامها بإعادة تحجيم النافذة (بلا تسجيلات دخول متكرّرة ⇒ بلا حدّ معدّل)
        guest_ctx = browser.new_context(locale='ar', viewport={'width': VIEWPORTS[0][0], 'height': VIEWPORTS[0][1]})
        gpage = guest_ctx.new_page()
        sweep_ctx = browser.new_context(locale='ar', viewport={'width': VIEWPORTS[0][0], 'height': VIEWPORTS[0][1]})
        vpage = sweep_ctx.new_page()
        vpage.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        vpage.goto(SHOP, wait_until='networkidle')
        vpage.wait_for_timeout(1200)
        vpage.evaluate("""async () => {
            const login = await window.ALW.shop.api.login('0955900100', 'Stage142!QAcust9');
            window.ALW.session.start(login);
            window.ALW.session.setUser(await window.ALW.shop.api.me());
        }""")

        for width, height in VIEWPORTS:
            vpage.set_viewport_size({'width': width, 'height': height})
            gpage.set_viewport_size({'width': width, 'height': height})
            vpage.wait_for_timeout(400)
            gpage.wait_for_timeout(300)
            problems: list[str] = []

            # login page — يُفحص في سياق الزائر (نموذج الدخول يجب أن يظهر)
            gpage.goto(SHOP + '#/login', wait_until='networkidle')
            gpage.wait_for_timeout(1500)
            probe = gpage.evaluate("""() => ({
                overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
                cta: (() => { const b = document.querySelector('.shop-auth button[type="submit"]'); if (!b) return null; const r = b.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; })(),
                labelled: !!document.querySelector('label[for="shop-login-phone"]') && !!document.querySelector('label[for="shop-login-password"]'),
            })""")
            if probe['overflow']:
                problems.append('login overflow')
            if not probe['cta']:
                problems.append('login CTA clipped')
            if not probe['labelled']:
                problems.append('login labels missing')
            gpage.screenshot(path=str(OUT / f'{width}x{height}-login.png'))

            # cart (authenticated session reused): ensure exactly one line exists
            vpage.evaluate("""async () => {
                const cart = await window.ALW.shop.api.cart();
                if (!cart.items || cart.items.length === 0) await window.ALW.shop.api.cartAdd(633, 2);
            }""")
            vpage.goto(SHOP + '#/cart', wait_until='networkidle')
            vpage.wait_for_timeout(2500)
            cart_probe = vpage.evaluate("""() => ({
                overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
                items: document.querySelectorAll('.shop-cart__item').length,
                cta: (() => { const b = document.getElementById('shop-go-checkout'); if (!b) return null; const r = b.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; })(),
                headerOverflow: (() => { const h = document.querySelector('.shop-header__inner'); return h.scrollWidth > h.clientWidth + 2; })(),
            })""")
            if cart_probe['overflow']:
                problems.append('cart overflow')
            if cart_probe['items'] != 1:
                problems.append('cart item missing')
            if not cart_probe['cta']:
                problems.append('cart CTA clipped')
            if cart_probe['headerOverflow']:
                problems.append('header overflow')
            vpage.screenshot(path=str(OUT / f'{width}x{height}-cart.png'))

            # checkout preview
            vpage.goto(SHOP + '#/', wait_until='networkidle')
            vpage.wait_for_timeout(600)
            vpage.goto(SHOP + '#/checkout', wait_until='networkidle')
            vpage.wait_for_timeout(4000)
            checkout_probe = vpage.evaluate("""() => ({
                overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
                rows: document.querySelectorAll('.shop-checkout__row').length,
                total: !!document.querySelector('.shop-cart__row--total strong'),
                text: (document.getElementById('shop-view').textContent || '').replace(/\s+/g, ' ').slice(0, 90),
            })""")
            if not checkout_probe['rows']:
                vpage.reload(wait_until='networkidle')
                vpage.wait_for_timeout(4000)
                checkout_probe = vpage.evaluate("""() => ({
                    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
                    rows: document.querySelectorAll('.shop-checkout__row').length,
                    total: !!document.querySelector('.shop-cart__row--total strong'),
                    text: (document.getElementById('shop-view').textContent || '').replace(/\s+/g, ' ').slice(0, 90),
                })""")
            if checkout_probe['overflow']:
                problems.append('checkout overflow')
            if not checkout_probe['rows'] or not checkout_probe['total']:
                problems.append('checkout summary missing: ' + str(checkout_probe.get('text')))
            vpage.screenshot(path=str(OUT / f'{width}x{height}-checkout.png'))

            # register page — في سياق الزائر أيضًا
            gpage.goto(SHOP + '#/register', wait_until='networkidle')
            gpage.wait_for_timeout(1500)
            reg_probe = gpage.evaluate("""() => ({
                overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
                fields: document.querySelectorAll('.shop-auth input').length,
                labelled: !!document.querySelector('label[for="shop-reg-password"]'),
            })""")
            if reg_probe['overflow']:
                problems.append('register overflow')
            if reg_probe['fields'] < 6 or not reg_probe['labelled']:
                problems.append('register fields/labels')
            gpage.screenshot(path=str(OUT / f'{width}x{height}-register.png'))

            record(f'{width}x{height}: auth/cart/checkout layout clean', not problems, detail='; '.join(problems) or 'clean',
                   got=None if not problems else '; '.join(problems))

        sweep_ctx.close()
        guest_ctx.close()
        browser.close()

    # نظافة نهائية عبر الـAPI (بلا أي حذف بيانات آخر)
    api('DELETE', '/cart', token)

    report = {
        'shop': SHOP, 'api': API, 'customer': PHONE,
        'viewports': [f'{w}x{h}' for w, h in VIEWPORTS],
        'apiCalls': sorted(set(api_calls)),
        'results': results,
        'pass': sum(1 for r in results if r['status'] == 'PASS'),
        'fail': sum(1 for r in results if r['status'] == 'FAIL'),
        'screenshots': sorted(path.name for path in OUT.glob('*.png')),
    }
    (OUT / 'shop-cart-qa-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\n=== 14.2 QA: {report['pass']}/{len(results)} PASS · failed={report['fail']} · screenshots={len(report['screenshots'])} ===")
    for item in results:
        if item['status'] == 'FAIL':
            print('  ✗', item['step'], '|', item.get('got'), '|', item.get('detail', '')[:150])
    return 1 if report['fail'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
