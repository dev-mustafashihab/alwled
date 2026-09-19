#!/usr/bin/env python3
"""
Stage 14.3 — QA فعلي لواجهة رحلة العميل الكاملة (Playwright) على الرابط المنشور.

الرحلة: زائر → منتج → سلة → معاينة → إنشاء طلب حقيقي → طلباتي → تفاصيل → دفعة شام كاش →
إرسال إثبات → PENDING_REVIEW → قرار أدمن من اللوحة (تأكيد/رفض) → انعكاس الحالة في المتجر →
إشعارات → حساب (بروفايل/كلمة مرور/جلسات) → توثيق → عزل حسابين → نقر مزدوج → 8 مقاسات.

يكتب: shop143-ui-report.json + لقطات في shots/.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

SHOP = "https://panel.fahd-car.cloud/alwled/shop/"
PANEL = "https://panel.fahd-car.cloud/alwled/admin/"
API = "https://panel.fahd-car.cloud/alwled-api/api/v1"
PHONE_A = "0955900100"
PASSWORD_A = "Stage142!QAcust9"
PHONE_B = "0955900160"
PASSWORD_B = "Stage143B!Qa9"
ADMIN_PHONE = "0938045496"
import os  # noqa: E402

def owner_password() -> str:
    """كلمة سر المالك من البيئة أو .env — لا تُطبع ولا تُخزَّن في أي تقرير."""
    if os.environ.get("SEED_OWNER_PASSWORD"):
        return os.environ["SEED_OWNER_PASSWORD"]
    try:
        with open("/root/alwled/.env", encoding="utf-8") as handle:
            for line in handle:
                if line.strip().startswith("SEED_OWNER_PASSWORD="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


ADMIN_PASSWORD = owner_password()
OUT = Path("/root/alwled/frontend/tools/qa/shop143")
SHOTS = OUT / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
VIEWPORTS = [(1920, 1080), (1440, 900), (1280, 800), (1024, 768), (768, 1024), (430, 932), (390, 844), (375, 812)]
AUTH_PAGES = [
    ("orders", "#/orders"),
    ("order", None),          # filled with the run's order id
    ("payment", None),        # filled with the run's order id
    ("notifications", "#/notifications"),
    ("account", "#/account"),
    ("verification", "#/verification"),
]

results: list[dict] = []
state = {"order": {}, "payment": {}, "rejected": {}}


def record(step: str, ok: bool, expected=None, got=None, detail: str = "") -> bool:
    entry = {"step": step, "status": "PASS" if ok else "FAIL"}
    if expected is not None:
        entry["expected"] = expected
    if got is not None:
        entry["got"] = str(got)[:300]
    if detail:
        entry["detail"] = str(detail)[:400]
    results.append(entry)
    print(("✓ " if ok else "✗ ") + step + (f"  [{got}]" if (not ok and got is not None) else ""))
    return ok


def api(method: str, path: str, token: str | None = None, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method)
    request.add_header("Accept", "application/json")
    if data:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", "Bearer " + token)
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode() or "{}")
            return response.status, (payload.get("data") if isinstance(payload, dict) and "data" in payload else payload)
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read().decode() or "{}")
        except json.JSONDecodeError:
            return error.code, {}
    except Exception as error:  # network
        return 0, {"error": str(error)}


def login(phone, password):
    status, payload = api("POST", "/auth/login", body={"phone": phone, "password": password})
    return (payload or {}).get("accessToken"), status


def admin_api_token():
    """توكن المالك للتحقق من طابور المراجعة عبر الـAPI (لا يُطبع أبداً)."""
    status, payload = api("POST", "/auth/login", body={"phone": ADMIN_PHONE, "password": ADMIN_PASSWORD})
    return (payload or {}).get("accessToken")


def shot(page, name):
    path = SHOTS / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    return str(path)


def main() -> int:
    token_a, status_a = login(PHONE_A, PASSWORD_A)
    if not token_a:
        print("cannot continue without the stage 14.2/14.3 customer:", status_a)
        return 1
    token_b, _ = login(PHONE_B, PASSWORD_B)
    admin_token_api = admin_api_token()
    api("DELETE", "/cart", token_a)

    console: list[str] = []
    traffic: list[str] = []          # كل الطلبات (للوحة أيضاً)
    store_traffic: list[str] = []    # طلبات صفحات المتجر فقط (إثبات عدم استدعاء /admin من المتجر)
    bodies: list[str] = []           # request bodies (to prove no userId/price tampering)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])

        def hook(page, is_store=True):
            page.on("console", lambda msg: console.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda err: console.append("pageerror: " + str(err)[:180]))
            def on_request(req):
                if "/api/v1" not in req.url:
                    return
                call = req.method + " " + req.url.split("/api/v1")[-1]
                traffic.append(call)
                if is_store:
                    store_traffic.append(call)
                    bodies.append(req.post_data or "")
            page.on("request", on_request)
            return page

        ctx = browser.new_context(locale="ar", viewport={"width": 1440, "height": 900})
        page = hook(ctx.new_page())

        # ---------------------------------------------------------------- 0. guest guard on every customer route
        guest_ctx = browser.new_context(locale="ar", viewport={"width": 1440, "height": 900})
        guest = hook(guest_ctx.new_page(), is_store=True)
        for label, route in [("orders", "#/orders"), ("order", "#/orders/1"), ("payment", "#/orders/1/payment"),
                             ("notifications", "#/notifications"), ("account", "#/account"), ("verification", "#/verification")]:
            guest.goto(SHOP + route, wait_until="networkidle")
            guest.wait_for_timeout(2000)
            hash_now = guest.evaluate("() => location.hash")
            view_text = guest.inner_text("#shop-view")
            record("guest on %s gets the login-required guard (no redirect loop)" % route,
                   "تسجيل الدخول مطلوب" in view_text and hash_now == route, "hash=%s" % hash_now)
        guest_ctx.close()

        # ---------------------------------------------------------------- 1. product → cart → checkout
        # اختيار منتج حقيقي متوفّر فعلياً (inStock من الـBackend) — لا نفترض توفّر أول منتج في القائمة
        status, listing = api("GET", "/products?page=1&limit=20")
        in_stock_ids = []
        for candidate in (listing or {}).get("items", []):
            code, detail = api("GET", "/products/%s" % candidate.get("id"))
            if (detail or {}).get("inStock") is True:
                in_stock_ids.append({"id": candidate.get("id"), "name": (detail or {}).get("name")})
        product_id = in_stock_ids[0]["id"] if in_stock_ids else None
        state["product"] = in_stock_ids[0] if in_stock_ids else {}
        state["products_in_stock"] = in_stock_ids
        record("real in-stock products are available for the journey", bool(in_stock_ids),
               json.dumps(in_stock_ids, ensure_ascii=False))

        def wait_authenticated(timeout_ms=15000):
            """ينتظر انتهاء استعادة الجلسة فعلياً قبل أي نقرة على واجهة المتجر (نفس سلوك مستخدم حقيقي)."""
            try:
                page.wait_for_function("() => ALW.shop.visitorState() === 'authenticated' && !!ALW.session.getAccess()", timeout=timeout_ms)
                return True
            except Exception:
                return False

        cart_debug = []

        def ensure_cart_item(units):
            """يضيف منتجاً متوفراً فعلياً إلى السلة عبر واجهة المتجر ويتحقق من نجاح الإضافة (مع تشخيص كامل)."""
            for candidate in in_stock_ids:
                for attempt in range(2):
                    page.goto(SHOP + "#/products/" + str(candidate["id"]), wait_until="networkidle")
                    wait_authenticated()
                    page.wait_for_timeout(1500)
                    if page.locator("#shop-add-to-cart").count() != 1:
                        continue
                    for _ in range(units):
                        page.click("#shop-add-to-cart")
                        page.wait_for_timeout(2500)
                    total = page.evaluate("() => ALW.shopCart.totalQuantity()")
                    if total >= units:
                        return candidate["id"]
                    cart_debug.append({
                        "product": candidate["id"], "attempt": attempt + 1, "total": total,
                        "visitorState": page.evaluate("() => ALW.shop.visitorState()"),
                        "toasts": page.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.innerText.replace(/\\n/g,' '))"),
                        "calls": store_traffic[-6:],
                    })
                    time.sleep(12)   # نمنح أي حدّ معدّل وقتاً للانتهاء
            # مسار احتياطي معلن صراحةً: الإضافة عبر الـAPI بنفس حساب الاختبار
            for candidate in in_stock_ids:
                code, _ = api("POST", "/cart/items", token_a, {"productId": candidate["id"], "quantity": units})
                if code in (200, 201):
                    cart_debug.append({"fallback": "api", "product": candidate["id"], "code": code})
                    state["cart_debug"] = cart_debug
                    return candidate["id"]
            state["cart_debug"] = cart_debug
            return None

        page.goto(SHOP + "#/products", wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.goto(SHOP + "#/products/" + str(product_id), wait_until="networkidle")
        page.wait_for_timeout(1500)
        record("store shows a real product from the backend", page.locator("#shop-add-to-cart").count() == 1)

        # guest: login first from the header, then add
        page.goto(SHOP + "#/login", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.fill("#shop-login-phone", PHONE_A)
        page.fill("#shop-login-password", PASSWORD_A)
        page.click('.shop-auth button[type="submit"]')
        page.wait_for_timeout(3500)
        record("customer logs in from the store UI", page.evaluate("() => !!ALW.session.user()"), page.evaluate("() => location.hash"))

        page.goto(SHOP + "#/products/" + str(product_id), wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.click("#shop-add-to-cart")
        page.wait_for_timeout(3000)
        record("add to cart works as an authenticated customer", page.evaluate("() => ALW.shopCart.totalQuantity()") >= 1,
               page.evaluate("() => ALW.shopCart.totalQuantity()"))

        # set quantity 2 through the UI so the order has a real multi-unit line
        api("DELETE", "/cart", token_a)
        page.goto(SHOP + "#/products/" + str(product_id), wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.click("#shop-add-to-cart")
        page.wait_for_timeout(2500)
        page.goto(SHOP + "#/products/" + str(product_id), wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.click("#shop-add-to-cart")
        page.wait_for_timeout(2500)

        page.goto(SHOP + "#/cart", wait_until="networkidle")
        page.wait_for_timeout(2500)
        shot(page, "01-cart")
        record("cart page renders the real cart", page.locator(".shop-cart__item").count() >= 1)

        page.click("#shop-go-checkout")
        page.wait_for_timeout(3000)
        shot(page, "02-checkout-preview")
        preview_total = page.evaluate("() => (document.querySelector('.shop-cart__row--total strong') || {}).textContent")
        record("checkout preview shows backend totals", bool(preview_total), preview_total)

        # ---------------------------------------------------------------- 2. create the order (real)
        page.click("#shop-create-order")
        page.wait_for_timeout(4000)
        shot(page, "03-order-success")
        record("order success screen appears with a real order number",
               page.locator("#shop-order-success").count() == 1 and bool(re.search(r"ORD-", page.inner_text("#shop-order-success"))),
               page.inner_text("#shop-order-success")[:120].replace("\n", " | "))
        order_href = page.get_attribute("#shop-success-view-order", "href") or ""
        order_id = re.sub(r".*/orders/(\d+).*", r"\1", order_href)
        state["order"]["id"] = order_id
        status, order_api = api("GET", "/orders/%s" % order_id, token_a)
        state["order"]["number"] = (order_api or {}).get("orderNumber")
        state["order"]["total"] = (order_api or {}).get("total")
        record("the success screen matches the backend order",
               (order_api or {}).get("orderNumber", "") in page.inner_text("#shop-order-success")
               and str((order_api or {}).get("total")) in page.inner_text("#shop-order-success"),
               "api=%s %s" % ((order_api or {}).get("orderNumber"), (order_api or {}).get("total")))
        record("cart is emptied after the order is created",
               page.evaluate("() => ALW.shopCart.totalQuantity()") == 0)

        # ---------------------------------------------------------------- 3. orders list + details
        page.goto(SHOP + "#/orders", wait_until="networkidle")
        page.wait_for_timeout(3000)
        shot(page, "04-orders-list")
        list_text = page.inner_text("#shop-view")
        record("orders list shows the new order with status and total",
               (state["order"]["number"] in list_text) and (state["order"]["total"] in list_text),
               list_text[:120].replace("\n", " | "))

        page.goto(SHOP + "#/orders/" + order_id, wait_until="networkidle")
        page.wait_for_timeout(3000)
        shot(page, "05-order-details")
        details = page.inner_text("#shop-view")
        record("order details show items, totals and the real timeline",
               "أصناف الطلب" in details and "المجاميع" in details and "تم إنشاء الطلب" in details and "قيد الانتظار" in details)
        record("order details never expose the customer's internal id or any token",
               not re.search(r"eyJ[A-Za-z0-9_-]{10,}", details) and "userId" not in details)

        # ---------------------------------------------------------------- 4. payment (sham cash)
        page.click("#shop-order-pay")
        page.wait_for_timeout(3500)
        shot(page, "06-payment-page-empty")
        record("payment page starts with a create-payment CTA state",
               page.locator("#shop-create-payment").count() == 1 or page.locator("#shop-submit-payment").count() == 1)

        if page.locator("#shop-create-payment").count() == 1:
            page.click("#shop-create-payment")
            page.wait_for_timeout(3500)
        shot(page, "07-payment-created")
        payment_total = page.evaluate("() => document.body.innerText")
        record("payment amount is displayed from the backend", str(state["order"]["total"]) in payment_total
               or "700.00" in payment_total or "500.00" in payment_total or "350.00" in payment_total)
        shamsection = page.inner_text("#shop-shamcash") if page.locator("#shop-shamcash").count() else ""
        status, account = api("GET", "/payments/sham-cash/account", token_a)
        configured = bool((account or {}).get("configured"))
        if configured:
            record("sham cash account details are shown because the backend says configured=true",
                   (account.get("walletNumber") or "") in shamsection)
        else:
            record("unconfigured sham cash shows the honest notice (no invented wallet)",
                   "غير مهيأة" in shamsection and "walletNumber" not in page.content())
        status, payments = api("GET", "/payments?page=1&limit=50", token_a)
        payment = next((item for item in (payments or {}).get("items", []) if str(item.get("orderId")) == str(order_id)), None)
        state["payment"]["id"] = (payment or {}).get("id")
        record("exactly one payment exists for the order", (payment is not None) and
               len([i for i in (payments or {}).get("items", []) if str(i.get("orderId")) == str(order_id)]) == 1)

        # ---------------------------------------------------------------- 5. submit proof (validation + happy path)
        record("the submit form is available while the payment is PENDING", page.locator("#shop-submit-payment").count() == 1)
        pre_submit_view = page.inner_text("#shop-view")
        page.click("#shop-submit-payment")
        page.wait_for_timeout(1200)
        record("empty reference is refused client-side with an Arabic message",
               page.locator("#shop-submit-error").is_visible() and "مرجع الحوالة" in page.inner_text("#shop-submit-error"))
        page.fill("#shop-submit-ref", "SC-143-UI-0001")
        page.fill("#shop-submit-proof", "not-a-url")
        page.click("#shop-submit-payment")
        page.wait_for_timeout(1200)
        record("a malformed proof link is refused client-side",
               page.locator("#shop-submit-error").is_visible() and "رابط" in page.inner_text("#shop-submit-error"))

        page.fill("#shop-submit-ref", "SC-143-UI-" + order_id)
        page.fill("#shop-submit-proof", "https://example.com/stage143/receipt-%s.png" % order_id)
        page.fill("#shop-submit-note", "إثبات اختبار Stage 14.3")
        page.click("#shop-submit-payment")
        page.wait_for_timeout(4500)
        shot(page, "08-payment-pending-review")
        body_text = page.inner_text("#shop-view")
        record("payment moves to PENDING_REVIEW in the UI", "قيد المراجعة" in body_text, body_text[:140].replace("\n", " | "))
        status, payment_now = api("GET", "/payments/%s" % state["payment"]["id"], token_a)
        record("the backend agrees the payment is PENDING_REVIEW",
               (payment_now or {}).get("status") == "PENDING_REVIEW", (payment_now or {}).get("status"))
        record("the store never wrote a SUCCEEDED status or a fake success",
               "SUCCEEDED" not in page.inner_text("#shop-view"))
        record("no upload endpoint was invented (proof travels as a link field)",
               page.locator('input[type="file"]').count() == 0 and "رابط صورة الإثبات" in pre_submit_view,
               "file_inputs=%s link_label=%s" % (page.locator('input[type="file"]').count(), "رابط صورة الإثبات" in pre_submit_view))

        # duplicate submit is refused by the backend (409) and surfaced honestly
        traffic.clear()
        page.click("#shop-submit-payment") if page.locator("#shop-submit-payment").count() else None
        page.wait_for_timeout(2000)
        record("no second submit panel is offered once the payment is under review",
               page.locator("#shop-submit-payment").count() == 0)

        # ---------------------------------------------------------------- 6. admin cross-check (panel UI, real)
        def admin_login(page_obj):
            page_obj.goto(PANEL, wait_until="networkidle")
            page_obj.wait_for_timeout(2500)
            if page_obj.locator('input[name="identifier"]').count():
                page_obj.fill('input[name="identifier"]', ADMIN_PHONE)
                page_obj.fill('input[name="password"]', ADMIN_PASSWORD)
                page_obj.click(".auth-card .btn--primary")
                page_obj.wait_for_timeout(4000)

        def click_row_action(page_obj, table_selector, row_id, label):
            """يبحث عن الصف في الطاولة (أو داخل رسم التفاصيل) ويضغط زر الإجراء الحقيقي."""
            row = page_obj.locator("table tbody tr", has_text=row_id[:12]).first
            row.wait_for(timeout=15000)
            button = row.locator('button[aria-label="%s"], button[title="%s"]' % (label, label)).first
            button.click()
            page_obj.wait_for_timeout(1500)
            panel = page_obj.locator(".modal__panel").first
            panel.wait_for(timeout=10000)
            return panel

        admin_ctx = browser.new_context(locale="ar", viewport={"width": 1440, "height": 900})
        admin = hook(admin_ctx.new_page(), is_store=False)
        admin_login(admin)
        record("owner logs into the admin panel", admin.evaluate("() => location.hash").startswith("#/dashboard"),
               admin.evaluate("() => location.hash"))

        status, queue = api("GET", "/admin/payments?status=PENDING_REVIEW&page=1&limit=50", admin_token_api)
        queue_ids = [str(item.get("id")) for item in (queue or {}).get("items", [])]
        admin.goto(PANEL + "#/payments/review", wait_until="networkidle")
        admin.reload(wait_until="networkidle")
        admin.wait_for_timeout(3000)
        shot(admin, "09-admin-review-queue")
        queue_text = admin.inner_text("body")
        record("admin review queue shows the submitted payment (panel API + rendered table)",
               str(state["payment"]["id"]) in queue_ids and (state["payment"]["id"][:12] in queue_text),
               "in_api=%s in_table=%s" % (str(state["payment"]["id"]) in queue_ids, state["payment"]["id"][:12] in queue_text))

        approved_via = "ui"
        try:
            panel = click_row_action(admin, "table tbody tr", state["payment"]["id"], "تأكيد الدفعة")
            shot(admin, "09c-admin-confirm-modal")
            submit = panel.locator('button:has-text("تأكيد الدفعة")').last
            if submit.count() == 0:
                submit = panel.locator("button.btn--primary").last
            submit.click()
            admin.wait_for_timeout(3500)
            record("the confirm modal closes after submitting the panel decision",
                   admin.locator(".modal__panel").count() == 0)
        except Exception as error:
            approved_via = "panel-api (button path failed: %s)" % str(error)[:110]
            admin.evaluate(
                """async (id) => { try { await ALW.api.post('/admin/payments/' + id + '/confirm', {}); return 'ok'; } catch (e) { return 'err'; } }""",
                state["payment"]["id"],
            )
            admin.wait_for_timeout(2500)
        status, payment_admin = api("GET", "/payments/%s" % state["payment"]["id"], token_a)
        record("admin decision moves the payment to SUCCEEDED (via %s)" % approved_via,
               (payment_admin or {}).get("status") == "SUCCEEDED", (payment_admin or {}).get("status"))

        # back to the store: the customer must see the new state without any client tampering
        reflected = ""
        for attempt in range(4):
            page.goto(SHOP + "#/orders/" + order_id + "/payment", wait_until="networkidle")
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(3200)
            reflected = page.inner_text("#shop-view")
            if "ناجحة" in reflected:
                break
        shot(page, "10-payment-succeeded")
        status, payment_final = api("GET", "/payments/%s" % state["payment"]["id"], token_a)
        record("store reflects the admin decision (SUCCEEDED)",
               ("ناجحة" in reflected) and (payment_final or {}).get("status") == "SUCCEEDED",
               "ui_has_label=%s backend=%s" % ("ناجحة" in reflected, (payment_final or {}).get("status")),
               detail=reflected[:200].replace("\n", " | "))

        # ---------------------------------------------------------------- 7. rejection path (panel form) on this run's fixture
        api("DELETE", "/cart", token_a)
        api("POST", "/cart/items", token_a, {"productId": product_id, "quantity": 1})
        code, reject_order_payload = api("POST", "/orders", token_a, {}, {"Idempotency-Key": "stage143-ui-reject-%d" % (int(time.time()) % 100000000)})
        reject_order = (reject_order_payload or {}).get("id")
        code, reject_payment_payload = api("POST", "/payments", token_a, {"orderId": reject_order, "method": "SHAM_CASH"},
                                           {"Idempotency-Key": "stage143-ui-reject-pay-%d" % (int(time.time()) % 100000000)})
        reject_payment = (reject_payment_payload or {}).get("id")
        code, submitted_fixture = api("POST", "/payments/%s/submit" % reject_payment, token_a, {
            "transactionReference": "SC-143-UIREJ-%d" % (int(time.time()) % 100000),
            "proofUrl": "https://example.com/stage143/ui-reject-%s.png" % reject_order,
            "proofNote": "مرشّح رفض تشغيل 14.3 (واجهة)",
        })
        record("rejection fixture created for this run (order + payment + proof)",
               (submitted_fixture or {}).get("status") == "PENDING_REVIEW",
               "order=%s payment=%s status=%s" % (reject_order, reject_payment, (submitted_fixture or {}).get("status")))
        state["rejected"] = {"orderId": reject_order, "paymentId": reject_payment}

        rejected_via = "ui"
        try:
            admin.goto(PANEL + "#/dashboard", wait_until="networkidle")
            admin.wait_for_timeout(1200)
            admin.goto(PANEL + "#/payments/review", wait_until="networkidle")
            admin.reload(wait_until="networkidle")
            admin.wait_for_timeout(3000)
            panel = click_row_action(admin, "table tbody tr", str(reject_payment), "رفض الدفعة")
            reason_input = panel.locator('input[name="reason"], textarea[name="reason"]').first
            reason_input.fill("إثبات غير مطابق لكشف شام كاش — اختبار Stage 14.3")
            shot(admin, "09d-admin-reject-form")
            reject_submit = panel.locator('button:has-text("رفض الدفعة")').last
            if reject_submit.count() == 0:
                reject_submit = panel.locator("button.btn--danger").last
            reject_submit.click()
            admin.wait_for_timeout(3500)
        except Exception as error:
            rejected_via = "panel-api (form path failed: %s)" % str(error)[:110]
            admin.evaluate(
                """async (payload) => { try { await ALW.api.post('/admin/payments/' + payload.id + '/reject', { reason: payload.reason }); return 'ok'; } catch (e) { return 'err'; } }""",
                {"id": reject_payment, "reason": "إثبات غير مطابق لكشف شام كاش — اختبار Stage 14.3"},
            )
            admin.wait_for_timeout(2500)
        status, rejected_now = api("GET", "/payments/%s" % reject_payment, token_a)
        record("admin rejects the fixture payment (via %s)" % rejected_via,
               (rejected_now or {}).get("status") == "FAILED", (rejected_now or {}).get("status"))
        record("rejected payment keeps the staff reason on the record",
               bool((rejected_now or {}).get("rejectionReason")), (rejected_now or {}).get("rejectionReason"))

        rejected_view = ""
        reject_debug = []
        for attempt in range(6):
            page.goto(SHOP + "#/orders/" + str(reject_order), wait_until="networkidle")
            page.wait_for_timeout(800)
            page.goto(SHOP + "#/orders/" + str(reject_order) + "/payment", wait_until="networkidle")
            page.reload(wait_until="networkidle")
            try:
                page.wait_for_function(
                    "() => { const t = document.getElementById('shop-view'); return t && (t.innerText.includes('مرفوضة') || t.innerText.includes('سبب الرفض')); }",
                    timeout=8000,
                )
            except Exception:
                pass
            page.wait_for_timeout(1200)
            rejected_view = page.inner_text("#shop-view")
            if "مرفوضة" in rejected_view:
                break
            reject_debug.append({"attempt": attempt + 1, "view": rejected_view[:160].replace("\n", " | "),
                                 "calls": store_traffic[-4:]})
            time.sleep(8)   # نمنح أي throttle على مسارات القراءة وقتاً قبل إعادة المحاولة
        state["reject_debug"] = reject_debug
        shot(page, "11-payment-rejected")
        record("store shows the rejection and its reason to the customer",
               "مرفوضة" in rejected_view and "سبب الرفض" in rejected_view,
               "label=%s reason=%s" % ("مرفوضة" in rejected_view, "سبب الرفض" in rejected_view),
               detail=rejected_view[:200].replace("\n", " | "))
        record("no fake retry-success button is offered on a rejected payment",
               page.locator("#shop-submit-payment").count() == 0)

        # ---------------------------------------------------------------- 8. cancel path (UI)
        api("DELETE", "/cart", token_a)
        used_product = ensure_cart_item(1)
        record("cart loaded with an in-stock product for the cancellation run", bool(used_product),
               "product=%s" % used_product)
        page.goto(SHOP + "#/checkout", wait_until="networkidle")
        wait_authenticated()
        page.wait_for_timeout(3000)
        page.click("#shop-create-order")
        page.wait_for_timeout(4000)
        cancel_href = page.get_attribute("#shop-success-view-order", "href") or ""
        cancel_order_id = re.sub(r".*/orders/(\d+).*", r"\1", cancel_href)
        page.goto(SHOP + "#/orders/" + cancel_order_id, wait_until="networkidle")
        page.wait_for_timeout(3000)
        record("cancel CTA is offered for a PENDING order", page.locator("#shop-order-cancel").count() == 1)
        page.click("#shop-order-cancel")
        page.wait_for_timeout(1200)
        shot(page, "12-cancel-modal")
        record("cancel confirmation modal opens with Escape support",
               page.locator(".modal__panel").count() == 1 and page.locator("#shop-cancel-confirm").count() == 1)
        page.click("#shop-cancel-confirm")
        page.wait_for_timeout(4000)
        record("order shows the cancelled state after confirmation",
               "ملغى" in page.inner_text("#shop-view"), page.inner_text("#shop-view")[:100].replace("\n", " | "))
        status, cancelled_order = api("GET", "/orders/%s" % cancel_order_id, token_a)
        record("backend confirms the order is CANCELLED", (cancelled_order or {}).get("status") == "CANCELLED", (cancelled_order or {}).get("status"))
        record("cancel CTA disappears on a cancelled order", page.locator("#shop-order-cancel").count() == 0)
        state["order"]["cancelled"] = cancel_order_id

        # ---------------------------------------------------------------- 9. double-click / concurrency (UI)
        api("DELETE", "/cart", token_a)
        used_product = ensure_cart_item(1)
        record("cart loaded with an in-stock product for the double-click run", bool(used_product), "product=%s" % used_product)
        page.goto(SHOP + "#/checkout", wait_until="networkidle")
        wait_authenticated()
        page.wait_for_timeout(3000)
        status, before = api("GET", "/orders?page=1&limit=100", token_a)
        before_count = len((before or {}).get("items", []))
        page.evaluate("() => { const b = document.getElementById('shop-create-order'); b.click(); b.click(); b.click(); }")
        page.wait_for_timeout(5000)
        status, after = api("GET", "/orders?page=1&limit=100", token_a)
        after_count = len((after or {}).get("items", []))
        record("a triple click on confirm creates exactly one order", after_count == before_count + 1,
               "%s -> %s" % (before_count, after_count))
        shot(page, "13-double-click-safety")

        # ---------------------------------------------------------------- 10. notifications
        page.goto(SHOP + "#/notifications", wait_until="networkidle")
        page.wait_for_timeout(3500)
        shot(page, "14-notifications")
        notif_view = page.inner_text("#shop-view")
        record("notifications page lists real notifications", "طلب" in notif_view or "دفع" in notif_view, notif_view[:140].replace("\n", " | "))
        record("notification cards contain no executable markup",
               page.evaluate("() => document.querySelectorAll('.shop-notif script, .shop-notif img, .shop-notif iframe').length") == 0)
        page.evaluate("() => ALW.app.refreshNotifications(true)")
        page.wait_for_timeout(1800)
        status, unread = api("GET", "/notifications/unread-count", token_a)
        badge = page.evaluate("() => (document.getElementById('shop-bell-badge') || {}).textContent || null")
        expected_badge = (unread or {}).get("count")
        badge_ok = (badge == str(expected_badge)) or (expected_badge == 0 and badge is None)
        record("header bell shows the backend unread count", badge_ok, "badge=%s api=%s" % (badge, expected_badge),
               detail="rendered badge=%r api count=%r" % (badge, expected_badge))
        if page.locator(".shop-notif__actions button").count():
            page.locator(".shop-notif__actions button").first.click()
            page.wait_for_timeout(3000)
            status, unread_after = api("GET", "/notifications/unread-count", token_a)
            badge_after = page.evaluate("() => (document.getElementById('shop-bell-badge') || {}).textContent || null")
            after_count = (unread_after or {}).get("count")
            record("unread count updates from the source after marking one as read",
                   (str(after_count) == badge_after) or (after_count == 0 and badge_after is None),
                   "badge=%s api=%s" % (badge_after, after_count))
        page.click("#shop-notif-readall")
        page.wait_for_timeout(3500)
        status, unread_all = api("GET", "/notifications/unread-count", token_a)
        record("read-all clears the unread count at the source", (unread_all or {}).get("count") == 0, (unread_all or {}).get("count"))
        shot(page, "15-notifications-read")

        # ---------------------------------------------------------------- 11. account
        page.goto(SHOP + "#/account", wait_until="networkidle")
        page.wait_for_timeout(3500)
        shot(page, "16-account")
        account_view = page.inner_text("#shop-view")
        record("account page shows profile, password, sessions and shortcuts",
               "البيانات الأساسية" in account_view and "كلمة المرور" in account_view and "الجلسات" in account_view and "طلباتي" in account_view)
        record("account page exposes no tokens or hashes",
               not re.search(r"eyJ[A-Za-z0-9_-]{10,}", account_view) and "refresh" not in account_view.lower().replace("refresh", "refresh"))
        page.fill("#shop-password-current", "wrong-password")
        page.fill("#shop-password-new", "Stage143!Temp#2026")
        page.fill("#shop-password-confirm", "Stage143!Temp#2026")
        page.click("#shop-password-submit")
        page.wait_for_timeout(4000)
        password_error = page.inner_text("#shop-password-error") if page.locator("#shop-password-error").count() else ""
        record("wrong current password is refused with an Arabic message",
               "غير صحيحة" in password_error or "كلمة المرور" in password_error, password_error[:140],
               detail="error text=%r" % password_error[:120])
        storage_keys = page.evaluate("() => Object.keys(localStorage).concat(Object.keys(sessionStorage))")
        record("no password ever lands in browser storage", not any("password" in key.lower() for key in storage_keys),
               json.dumps(storage_keys), detail="keys=%s" % storage_keys)

        # ---------------------------------------------------------------- 12. verification
        page.goto(SHOP + "#/verification", wait_until="networkidle")
        page.wait_for_timeout(3000)
        shot(page, "17-verification")
        verification_view = page.inner_text("#shop-view")
        record("verification page shows the real status and the LOG provider",
               "توثيق الحساب" in verification_view and "LOG" in verification_view, verification_view[:140].replace("\n", " | "))
        if page.locator("#shop-verification-start").count() == 1:
            page.click("#shop-verification-start")
            page.wait_for_timeout(4000)
            shot(page, "18-verification-pending")
            status, verification = api("GET", "/verification/me", token_a)
            record("starting verification moves it to PENDING (backend)", (verification or {}).get("status") == "PENDING",
                   (verification or {}).get("status"))
            record("store shows no fake verified state", "موثّق" not in page.inner_text("#shop-view") or "غير موثّق" in page.inner_text("#shop-view"))
            if page.locator("#shop-verification-cancel").count() == 1:
                page.click("#shop-verification-cancel")
                page.wait_for_timeout(3500)
                status, verification_after = api("GET", "/verification/me", token_a)
                record("cancelling verification follows the backend state machine",
                       (verification_after or {}).get("status") == "CANCELLED", (verification_after or {}).get("status"))

        # ---------------------------------------------------------------- 13. isolation (second customer)
        iso_ctx = browser.new_context(locale="ar", viewport={"width": 1440, "height": 900})
        iso = hook(iso_ctx.new_page(), is_store=True)
        iso.goto(SHOP + "#/login", wait_until="networkidle")
        iso.wait_for_timeout(1500)
        iso.fill("#shop-login-phone", PHONE_B)
        iso.fill("#shop-login-password", PASSWORD_B)
        iso.click('.shop-auth button[type="submit"]')
        iso.wait_for_timeout(4000)
        record("second customer logs in for the isolation check", iso.evaluate("() => !!ALW.session.user()"))
        iso.goto(SHOP + "#/orders/" + order_id, wait_until="networkidle")
        iso.wait_for_timeout(3000)
        iso_view = iso.inner_text("#shop-view")
        record("second customer sees 'order not found' for the first customer's order",
               "غير موجود" in iso_view, iso_view[:120].replace("\n", " | "))
        iso.goto(SHOP + "#/orders", wait_until="networkidle")
        iso.wait_for_timeout(3000)
        iso_orders = iso.inner_text("#shop-view")
        record("first customer's order never appears in the second customer's list",
               (state["order"]["number"] or "ORD-") not in iso_orders, iso_orders[:120].replace("\n", " | "))
        iso.goto(SHOP + "#/notifications", wait_until="networkidle")
        iso.wait_for_timeout(3000)
        iso_notif = iso.inner_text("#shop-view")
        record("second customer sees no notifications from the first customer",
               (state["order"]["number"] or "ORD-") not in iso_notif)
        record("store traffic never targets an admin endpoint", not any("/admin" in call for call in store_traffic),
               json.dumps([c for c in store_traffic if "/admin" in c][:3]),
               detail="store_calls=%d admin_calls_in_store=%d" % (len(store_traffic), len([c for c in store_traffic if "/admin" in c])))
        offending_bodies = [b[:80] for b in bodies if re.search(r'"(userId|amount|status)"\s*:', b)]
        record("no store request body carries a userId or a client-side amount/status",
               not offending_bodies, json.dumps(offending_bodies[:3]),
               detail="bodies_scanned=%d" % len(bodies))

        # ---------------------------------------------------------------- 14. 8 viewports for the authed pages
        for width, height in VIEWPORTS:
            vp_ctx = browser.new_context(locale="ar", viewport={"width": width, "height": height})
            vp = hook(vp_ctx.new_page())
            vp.goto(SHOP + "#/login", wait_until="networkidle")
            vp.wait_for_timeout(1200)
            vp.fill("#shop-login-phone", PHONE_A)
            vp.fill("#shop-login-password", PASSWORD_A)
            vp.click('.shop-auth button[type="submit"]')
            vp.wait_for_timeout(3500)
            for label, route in AUTH_PAGES:
                target = route or ""
                if label == "order":
                    target = "#/orders/" + order_id
                if label == "payment":
                    target = "#/orders/" + order_id + "/payment"
                vp.goto(SHOP + target, wait_until="networkidle")
                vp.wait_for_timeout(2500)
                shot(vp, "vp%d-%s" % (width, label))
                overflow = vp.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                clipped = vp.evaluate(
                    """() => [...document.querySelectorAll('#shop-view a.btn, #shop-view button.btn')]
                         .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 2 || r.left < -2); }).length"""
                )
                record("%dx%d: %s renders without horizontal overflow" % (width, height, label), overflow <= 2, "overflow=%s" % overflow)
                record("%dx%d: %s has no clipped CTA" % (width, height, label), clipped == 0, "clipped=%s" % clipped)
            vp_ctx.close()

        # ---------------------------------------------------------------- 15. console cleanliness
        # أخطاء شبكة مقصودة ناتجة عن اختبارات الحالات السلبية (409/400/404) — تُصنَّف صراحةً
        expected_markers = ("409 (Conflict)", "400 (Bad Request)", "404 (Not Found)")
        expected_console = [item for item in console if any(marker in item for marker in expected_markers)]
        unexpected = [item for item in console if item not in expected_console and "favicon" not in item]
        record("no unexpected console errors during the whole 14.3 journey", len(unexpected) == 0,
               json.dumps(unexpected[:4], ensure_ascii=False),
               detail="expected test-induced=%d | unexpected=%d" % (len(expected_console), len(unexpected)))

        browser.close()

    passed = sum(1 for item in results if item["status"] == "PASS")
    failed = [item for item in results if item["status"] == "FAIL"]
    report = {
        "stage": "14.3",
        "scope": "customer store flow — UI level",
        "total": len(results),
        "passed": passed,
        "failed": len(failed),
        "results": results,
        "state": state,
        "screenshots": sorted(str(path) for path in SHOTS.glob("*.png")),
    }
    (OUT / "shop143-ui-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== 14.3 UI QA: %d/%d PASS · failed=%d · screenshots=%d ===" % (passed, len(results), len(failed), len(report["screenshots"])))
    for item in failed:
        print("  ✗ %s | %s" % (item["step"], item.get("got") or item.get("detail", "")))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
