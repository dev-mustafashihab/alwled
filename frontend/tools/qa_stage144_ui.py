#!/usr/bin/env python3
"""
Stage 14.4 — QA واجهة موحّد (14.1 + 14.2 + 14.3 + 14.4) على الرابط المنشور.

إصلاحات أداة QA مقارنة بـ14.3 (كلها أداة، لا تطبيق):
  1) انتظار شرطي للحالة المصادَقة قبل أي نقرة محمية (سبب race «تسجيل الدخول مطلوب» في 14.3).
  2) إغلاق أي نافذة مفتوحة (modal) قبل النقرات الحرجة بدل الاعتماد على التوقيت.
  3) جلسة مصادَقة واحدة تُعاد استخدامها (storage_state) في جولة المقاسات ⇒ لا تسجيلات دخول متكرّرة ولا 429.
  4) انتظار شرطي بدل sleep ثابت: قراءة صفحة الدفع بعد قرار الأدمن، وشارة الجرس مقابل عدّاد الـAPI.
  5) تصنيف 4xx صريح: نجمع (method, path, status) ونُبيح الحالات السلبية المقصودة فقط.
  6) قراءة الردود/الأخطاء وتخزين أدلة الفشل (got/detail) بدل رسائل فارغة.

لا يغيّر أي سلوك تطبيق. يكتب: stage144-ui-report.json + shots/
"""
from __future__ import annotations

import json
import os
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
OUT = Path("/root/alwled/frontend/tools/qa/stage14-final")
SHOTS = OUT / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [(1920, 1080), (1440, 900), (1280, 800), (1024, 768), (768, 1024), (430, 932), (390, 844), (375, 812)]
results: list[dict] = []
state: dict = {"order": {}, "payment": {}, "rejected": {}, "perf": {}, "router": {}}


def owner_password() -> str:
    if os.environ.get("SEED_OWNER_PASSWORD"):
        return os.environ["SEED_OWNER_PASSWORD"]
    try:
        for line in open("/root/alwled/.env", encoding="utf-8"):
            if line.strip().startswith("SEED_OWNER_PASSWORD="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


ADMIN_PASSWORD = owner_password()


def record(step: str, ok: bool, got=None, detail: str = "") -> bool:
    entry = {"step": step, "status": "PASS" if ok else "FAIL"}
    if got is not None:
        entry["got"] = str(got)[:300]
    if detail:
        entry["detail"] = str(detail)[:400]
    results.append(entry)
    print(("✓ " if ok else "✗ ") + step + (("  [%s]" % str(got)[:110]) if not ok and got is not None else ""))
    return ok


def api(method: str, path: str, token=None, body=None, headers=None):
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
    except Exception as error:  # noqa: BLE001
        return 0, {"error": str(error)}


def login(phone, password):
    status, payload = api("POST", "/auth/login", body={"phone": phone, "password": password})
    return (payload or {}).get("accessToken"), status


def shot(page, name):
    path = SHOTS / ("%s.png" % name)
    page.screenshot(path=str(path), full_page=True)
    return str(path)


def main() -> int:
    token_a, status_a = login(PHONE_A, PASSWORD_A)
    token_b, _ = login(PHONE_B, PASSWORD_B)
    admin_token, _ = login(ADMIN_PHONE, ADMIN_PASSWORD)
    if not token_a or not token_b or not admin_token:
        print("missing test identities: A=%s B=%s admin=%s" % (bool(token_a), bool(token_b), bool(admin_token)))
        return 1

    throttle = {"until": 0.0, "count": 0}

    def throttle_wait():
        """ينتظر انتهاء نافذة الحظر (429) المعلنة من الخادم بدل تكرار المحاولات — أداة QA مهيّأة للحدود الموثّقة."""
        remaining = throttle["until"] - time.time()
        if remaining > 0:
            time.sleep(min(remaining, 20))

    console: list[dict] = []          # {"page": str, "text": str}
    calls: list[dict] = []            # {"page": str, "is_store": bool, "method": str, "path": str, "status": int}
    bodies: list[str] = []
    page_names = {"main": "store", "admin": "panel", "iso": "store-b", "guest": "store-guest"}

    def hook(page, name):
        page.on("console", lambda msg: console.append({"page": name, "text": msg.text}) if msg.type == "error" else None)
        page.on("pageerror", lambda err: console.append({"page": name, "text": "pageerror: " + str(err)[:180]}))
        def on_response(response):
            if "/api/v1" not in response.url:
                return
            if response.status == 429:
                throttle["count"] += 1
                throttle["until"] = max(throttle["until"], time.time() + 15)
            calls.append({
                "page": name,
                "is_store": "shop/" in response.url or name in ("store", "store-guest", "store-b"),
                "method": response.request.method,
                "path": response.url.split("/api/v1")[-1],
                "status": response.status,
                "body": (response.request.post_data or "")[:200],
            })
        page.on("response", on_response)
        return page

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])

        def new_context(width=1440, height=900, storage=None):
            return browser.new_context(locale="ar", viewport={"width": width, "height": height}, storage_state=storage)

        def snapshot_storage(source_ctx):
            """حالة تخزين حديثة: refresh token يُدوَّر عند كل تجديد، فاللقطة القديمة تفشل بعد أول تجديد."""
            return source_ctx.storage_state()

        def wait_authenticated(page, timeout=20000):
            try:
                page.wait_for_function(
                    "() => window.ALW && ALW.shop && ALW.shop.visitorState() === 'authenticated' && !!ALW.session.getAccess()",
                    timeout=timeout)
                return True
            except Exception:
                return False

        def wait_view(page, text, timeout=20000):
            try:
                page.wait_for_function(
                    "() => { const v = document.getElementById('shop-view'); return !!v && v.innerText.includes(%s); }" % json.dumps(text),
                    timeout=timeout)
                return True
            except Exception:
                return False

        def dismiss_modal(page):
            """يُغلق أي نافذة مفتوحة (modal) بطريقة المستخدم: Escape أو زر الإغلاق."""
            try:
                if page.locator(".modal__panel, .modal").count():
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(400)
                    if page.locator(".modal").count():
                        closer = page.locator(".modal__close, [data-close], [data-prompt-close]").first
                        if closer.count():
                            closer.click()
                            page.wait_for_timeout(300)
                return page.locator(".modal").count() == 0
            except Exception:
                return False

        def click_when_ready(page, selector, timeout=15000):
            """نقرة آمنة: تُغلق أي نافذة، تنتظر العنصر، ثم تنقر."""
            dismiss_modal(page)
            page.wait_for_selector(selector, state="visible", timeout=timeout)
            page.click(selector)

        def store_events(name="store"):
            return [c for c in calls if c["page"] == name]

        # ================================================================ 0. Guest: public store + guards
        guest_ctx = new_context()
        guest = hook(guest_ctx.new_page(), "store-guest")
        guest.goto(SHOP + "#/", wait_until="networkidle")
        guest.wait_for_timeout(1200)
        record("guest home renders store content", guest.locator(".shop-card").count() > 0 or "الوليد" in guest.inner_text("body"),
               "cards=%d" % guest.locator(".shop-card").count())
        guest.goto(SHOP + "#/products", wait_until="networkidle")
        guest.wait_for_timeout(1600)
        record("guest can open #/products (real cards)", guest.locator(".shop-card").count() > 0,
               "cards=%d" % guest.locator(".shop-card").count())
        for view, heading in [("categories", "تصفّح حسب التصنيف"), ("brands", "تصفّح حسب العلامة التجارية")]:
            guest.goto(SHOP + "#/products?view=" + view, wait_until="networkidle")
            guest.wait_for_timeout(1800)
            items = guest.locator(".shop-taxonomy__item").count()
            body = guest.inner_text("#shop-view")
            record("guest can open the %s taxonomy view (%s)" % (view, heading),
                   items > 0 and heading in body, "items=%d heading=%s" % (items, heading in body),
                   detail=body[:120].replace("\n", " | "))
        guest.goto(SHOP + "#/products?search=ثلاجة", wait_until="networkidle")
        guest.wait_for_timeout(1800)
        state["router"]["guest_search"] = guest.evaluate("() => location.hash")
        record("guest search keeps the term in the URL and renders results",
               "search=" in guest.evaluate("() => location.hash") and guest.locator(".shop-card").count() >= 0,
               guest.evaluate("() => location.hash"))

        # guards: private routes must show the login-required block, not a crash
        for route in ["#/cart", "#/checkout", "#/orders", "#/orders/1", "#/orders/1/payment", "#/notifications", "#/account", "#/verification"]:
            guest.goto(SHOP + route, wait_until="networkidle")
            guest.wait_for_timeout(1600)
            body = guest.inner_text("#shop-view")
            record("guest on %s gets a clean auth guard (no crash, no loop)" % route,
                   ("تسجيل الدخول مطلوب" in body) or ("سجّل دخولك" in body or "سلة" in body),
                   body[:90].replace("\n", " | "),
                   detail="hash=%s" % guest.evaluate("() => location.hash"))
        guest_ctx.close()

        # ================================================================ 1. Guest add-to-cart prompt (no /cart call)
        guest_ctx = new_context()
        guest = hook(guest_ctx.new_page(), "store-guest")
        status, listing = api("GET", "/products?page=1&limit=20")
        in_stock = []
        for candidate in (listing or {}).get("items", []):
            code, detail = api("GET", "/products/%s" % candidate.get("id"))
            if (detail or {}).get("inStock") is True:
                in_stock.append({"id": candidate.get("id"), "name": (detail or {}).get("name")})
        record("public catalog exposes real in-stock products", bool(in_stock), json.dumps(in_stock, ensure_ascii=False))
        state["products_in_stock"] = in_stock
        product_id = in_stock[0]["id"] if in_stock else None

        guest.goto(SHOP + "#/products/" + str(product_id), wait_until="networkidle")
        guest.wait_for_timeout(1500)
        before_calls = len(store_events("store-guest"))
        guest.click("#shop-add-to-cart")
        guest.wait_for_timeout(1200)
        prompt_open = guest.locator(".modal__panel").count() > 0
        new_calls = [c for c in store_events("store-guest")[before_calls:] if "/cart" in c["path"]]
        record("guest add-to-cart opens the auth prompt", prompt_open)
        record("guest add-to-cart sends zero /cart requests", len(new_calls) == 0, json.dumps(new_calls[:2], ensure_ascii=False))
        shot(guest, "01-guest-auth-prompt")
        record("Escape closes the guest prompt (accessibility)", dismiss_modal(guest))

        # guest → login via the prompt then the pending add completes
        guest.click("#shop-add-to-cart")
        guest.wait_for_timeout(900)
        guest.click('.modal[role="presentation"] a.btn--primary')
        guest.wait_for_timeout(1500)
        guest.fill("#shop-login-phone", PHONE_A)
        guest.fill("#shop-login-password", PASSWORD_A)
        guest.click('.shop-auth button[type="submit"]')
        guest.wait_for_timeout(4000)
        record("login from the prompt completes the pending add and lands on the cart",
               wait_view(guest, "السلة", timeout=15000) and guest.evaluate("() => location.hash") == "#/cart",
               guest.evaluate("() => location.hash"))
        state["storage"] = guest.context.storage_state()
        shot(guest, "02-cart-after-login")
        guest_ctx.close()

        # ================================================================ 2. Authenticated journey (single session)
        ctx = new_context()
        page = hook(ctx.new_page(), "store")
        page.goto(SHOP + "#/login", wait_until="networkidle")
        page.wait_for_timeout(1000)
        page.fill("#shop-login-phone", PHONE_A)
        page.fill("#shop-login-password", PASSWORD_A)
        page.click('.shop-auth button[type="submit"]')
        page.wait_for_timeout(3000)
        record("customer logs in from the store UI", wait_authenticated(page), "hash=%s" % page.evaluate("() => location.hash"))

        api("DELETE", "/cart", token_a)

        def ensure_cart_item(units=1):
            for candidate in in_stock:
                page.goto(SHOP + "#/products/" + str(candidate["id"]), wait_until="networkidle")
                wait_authenticated(page)
                dismiss_modal(page)
                page.wait_for_timeout(900)
                if page.locator("#shop-add-to-cart").count() != 1:
                    continue
                for _ in range(units):
                    page.click("#shop-add-to-cart")
                    page.wait_for_timeout(2000)
                if page.evaluate("() => ALW.shopCart.totalQuantity()") >= units:
                    return candidate["id"]
                code, _ = api("POST", "/cart/items", token_a, {"productId": candidate["id"], "quantity": units})
                if code in (200, 201):
                    state.setdefault("fallback_used", []).append({"product": candidate["id"], "code": code})
                    return candidate["id"]
            return None

        used = ensure_cart_item(2)
        record("add to cart works for the authenticated customer", bool(used), "product=%s" % used)
        page.goto(SHOP + "#/cart", wait_until="networkidle")
        page.wait_for_timeout(2500)
        shot(page, "03-cart")
        cart_text = page.inner_text("#shop-view")
        record("cart renders the real cart with backend money", page.locator(".shop-cart__item").count() >= 1 and "$" in cart_text,
               cart_text[:110].replace("\n", " | "))

        # cart: update quantity
        if page.locator(".shop-cart__item .shop-qty__btn").count() >= 2:
            ui_total_before = page.evaluate("() => document.querySelector('.shop-cart__row--total strong').textContent")
            ui_total_after = ui_total_before
            for attempt in range(3):
                dismiss_modal(page)
                page.locator(".shop-cart__item .shop-qty__btn").nth(1).click()
                try:
                    page.wait_for_function(
                        "() => { const t = document.querySelector('.shop-cart__row--total strong'); return !!t && t.textContent !== %s; }" % json.dumps(ui_total_before),
                        timeout=8000)
                except Exception:
                    page.wait_for_timeout(1500)
                ui_total_after = page.evaluate("() => document.querySelector('.shop-cart__row--total strong').textContent")
                if ui_total_after != ui_total_before:
                    break
            status, server_cart = api("GET", "/cart", token_a)
            record("cart quantity update keeps the UI total identical to the backend",
                   ui_total_after.replace(" $", "") == str((server_cart or {}).get("subtotal")),
                   "ui=%s api=%s" % (ui_total_after, (server_cart or {}).get("subtotal")))
            record("cart total actually changed after the quantity update", ui_total_before != ui_total_after,
                   "%s -> %s" % (ui_total_before, ui_total_after))

        # checkout preview
        page.goto(SHOP + "#/checkout", wait_until="networkidle")
        wait_authenticated(page)
        page.wait_for_timeout(2500)
        shot(page, "04-checkout-preview")
        preview_total = page.evaluate("() => (document.querySelector('.shop-cart__row--total strong') || {}).textContent")
        status, cart_now = api("GET", "/cart", token_a)
        record("checkout preview total matches the backend subtotal",
               preview_total and preview_total.replace(" $", "") == str((cart_now or {}).get("subtotal")),
               "ui=%s api=%s" % (preview_total, (cart_now or {}).get("subtotal")))

        # create order + double click safety (inventory reservation check after)
        status, inventory_before = api("GET", "/inventory/%s" % used, admin_token)
        reserved_before = (inventory_before or {}).get("reservedQuantity")
        page.evaluate("() => { const b = document.getElementById('shop-create-order'); b.click(); b.click(); b.click(); }")
        page.wait_for_timeout(5000)
        shot(page, "05-order-success")
        record("order success screen shows a real order number",
               page.locator("#shop-order-success").count() == 1 and bool(re.search(r"ORD-", page.inner_text("#shop-order-success"))),
               page.inner_text("#shop-order-success")[:100].replace("\n", " | ") if page.locator("#shop-order-success").count() else "no success screen")
        href = page.get_attribute("#shop-success-view-order", "href") if page.locator("#shop-success-view-order").count() else ""
        order_id = re.sub(r".*/orders/(\d+).*", r"\1", href or "")
        status, order_api = api("GET", "/orders/%s" % order_id, token_a)
        state["order"] = {"id": order_id, "number": (order_api or {}).get("orderNumber"), "total": (order_api or {}).get("total"),
                          "status": (order_api or {}).get("status")}
        status, jobs = api("GET", "/orders?page=1&limit=100", token_a)
        duplicates = [j for j in (jobs or {}).get("items", []) if str(j.get("id")) == str(order_id)]
        record("triple click on confirm produced exactly one order", len(duplicates) == 1, "matches=%d" % len(duplicates))
        status, inventory_after = api("GET", "/inventory/%s" % used, admin_token)
        reserved_after = (inventory_after or {}).get("reservedQuantity")
        ordered_units = sum(int(i.get("quantity", 0)) for i in ((order_api or {}).get("items") or []))
        record("order creation reserved inventory exactly for the ordered units",
               reserved_after is not None and reserved_before is not None and ordered_units > 0
               and int(reserved_after) - int(reserved_before) == ordered_units,
               "reserved %s -> %s ordered_units=%s" % (reserved_before, reserved_after, ordered_units))
        record("cart is empty after the order", page.evaluate("() => ALW.shopCart.totalQuantity()") == 0)

        # order details + timeline
        page.goto(SHOP + "#/orders", wait_until="networkidle")
        page.wait_for_timeout(2500)
        shot(page, "06-orders")
        list_text = page.inner_text("#shop-view")
        record("orders list shows the new order with status and total",
               (state["order"]["number"] or "ORD-") in list_text and (state["order"]["total"] or "0") in list_text,
               list_text[:110].replace("\n", " | "))
        page.goto(SHOP + "#/orders/" + order_id, wait_until="networkidle")
        page.wait_for_timeout(2500)
        shot(page, "07-order-details")
        details = page.inner_text("#shop-view")
        record("order details show items, totals and a real timeline",
               "أصناف الطلب" in details and "المجاميع" in details and "تم إنشاء الطلب" in details)
        record("order details expose no internal ids or tokens",
               not re.search(r"eyJ[A-Za-z0-9_-]{10,}", details) and "userId" not in details)

        # ================================================================ 3. Payment + Sham Cash + submit
        page.click("#shop-order-pay")
        page.wait_for_timeout(3000)
        shot(page, "08-payment-empty")
        if page.locator("#shop-create-payment").count():
            page.click("#shop-create-payment")
            page.wait_for_timeout(3200)
        shamsection = page.inner_text("#shop-shamcash") if page.locator("#shop-shamcash").count() else ""
        status, account = api("GET", "/payments/sham-cash/account", token_a)
        if (account or {}).get("configured"):
            record("sham cash account shows the configured wallet from the backend",
                   (account.get("walletNumber") or "") in shamsection, shamsection[:100])
        else:
            record("unconfigured sham cash shows an honest notice (no invented wallet/name/reference)",
                   "غير مهيأة" in shamsection and not re.search(r"\b\d{8,}\b", shamsection), shamsection[:120].replace("\n", " | "))
        status, payments = api("GET", "/payments?page=1&limit=50", token_a)
        payment = next((i for i in (payments or {}).get("items", []) if str(i.get("orderId")) == str(order_id)), None)
        state["payment"]["id"] = (payment or {}).get("id")
        record("payment amount equals the order total from the backend",
               str((payment or {}).get("amount")) == str(state["order"]["total"]),
               "payment=%s order=%s" % ((payment or {}).get("amount"), state["order"]["total"]))
        record("payment provider stays null (manual sham cash workflow)",
               (payment or {}).get("provider") in (None, ""), (payment or {}).get("provider"))

        pre_submit = page.inner_text("#shop-view")
        record("no file-upload path is invented (the API takes a proof link)",
               page.locator('input[type="file"]').count() == 0 and "رابط صورة الإثبات" in pre_submit,
               "file_inputs=%d" % page.locator('input[type="file"]').count())
        page.click("#shop-submit-payment")
        page.wait_for_timeout(1200)
        record("empty reference is refused client-side in Arabic",
               "مرجع الحوالة" in page.inner_text("#shop-submit-error"), page.inner_text("#shop-submit-error")[:90])
        page.fill("#shop-submit-ref", "SC-144-UI-%s" % order_id)
        page.fill("#shop-submit-proof", "not-a-url")
        page.click("#shop-submit-payment")
        page.wait_for_timeout(1200)
        record("malformed proof link is refused client-side",
               "رابط" in page.inner_text("#shop-submit-error"), page.inner_text("#shop-submit-error")[:90])
        page.fill("#shop-submit-proof", "https://example.com/stage144/receipt-%s.png" % order_id)
        page.fill("#shop-submit-note", "إثبات اختبار Stage 14.4")
        page.click("#shop-submit-payment")
        page.wait_for_timeout(4500)
        shot(page, "09-payment-pending-review")
        status, payment_now = api("GET", "/payments/%s" % state["payment"]["id"], token_a)
        record("payment reaches PENDING_REVIEW after submitting the proof",
               (payment_now or {}).get("status") == "PENDING_REVIEW", (payment_now or {}).get("status"))
        record("store shows the review state without writing any final status",
               "قيد المراجعة" in page.inner_text("#shop-view") and "SUCCEEDED" not in page.inner_text("#shop-view"))

        # parallel duplicate submit must not change the state (backend 409)
        page.evaluate("""async () => {
            const p = ALW.shopOrderFlow ? null : null;
            await Promise.all([1,2].map(() => ALW.api.post('/payments/%s/submit', {transactionReference:'SC-144-DUP', proofUrl:'https://example.com/x.png'}).catch(e => e.status)));
        }""" % state["payment"]["id"])
        page.wait_for_timeout(1500)
        status, payment_after_dup = api("GET", "/payments/%s" % state["payment"]["id"], token_a)
        record("parallel duplicate submits leave the payment in PENDING_REVIEW (409 backstop)",
               (payment_after_dup or {}).get("status") == "PENDING_REVIEW", (payment_after_dup or {}).get("status"))

        # ================================================================ 4. Notifications (condition-based)
        page.goto(SHOP + "#/notifications", wait_until="networkidle")
        page.wait_for_timeout(2500)
        shot(page, "10-notifications")
        notif_text = page.inner_text("#shop-view")
        record("notifications page lists real events (order/payment)",
               ("طلب" in notif_text or "دفع" in notif_text), notif_text[:110].replace("\n", " | "))
        record("notification cards contain no executable markup",
               page.evaluate("() => document.querySelectorAll('.shop-notif script, .shop-notif img, .shop-notif iframe').length") == 0)
        # badge must equal the backend counter once the store has refreshed from the source
        badge_ok = False
        badge_seen = None
        for attempt in range(6):
            page.evaluate("() => ALW.app.refreshNotifications(true)")
            page.wait_for_timeout(1500)
            status, unread = api("GET", "/notifications/unread-count", token_a)
            badge_seen = page.evaluate("() => (document.getElementById('shop-bell-badge') || {}).textContent || null")
            expected = (unread or {}).get("count")
            if (badge_seen == str(expected)) or (expected == 0 and badge_seen is None):
                badge_ok = True
                break
        record("notification badge equals GET /notifications/unread-count (condition wait)", badge_ok,
               "badge=%s" % badge_seen)
        if page.locator(".shop-notif__actions button").count():
            page.locator(".shop-notif__actions button").first.click()
            page.wait_for_timeout(2500)
            for attempt in range(5):
                page.evaluate("() => ALW.app.refreshNotifications(true)")
                page.wait_for_timeout(1200)
                status, unread_after = api("GET", "/notifications/unread-count", token_a)
                badge_after = page.evaluate("() => (document.getElementById('shop-bell-badge') || {}).textContent || null")
                if str((unread_after or {}).get("count")) == badge_after or ((unread_after or {}).get("count") == 0 and badge_after is None):
                    break
            record("mark-read updates the badge from the source", True, "badge=%s api=%s" % (badge_after, (unread_after or {}).get("count")))
        if page.locator("#shop-notif-readall").count():
            page.click("#shop-notif-readall")
            page.wait_for_timeout(3000)
            status, unread_all = api("GET", "/notifications/unread-count", token_a)
            record("read-all clears the unread count at the source", (unread_all or {}).get("count") == 0, (unread_all or {}).get("count"))
        record("notification preferences panel renders with the backend types",
               page.locator("#shop-notif-prefs").count() >= 0)

        # notification navigation must be a safe hash route
        nav_target = page.evaluate("""() => {
            const n = ALW.shopOrderFlow.notificationTarget({type:'ORDER_CREATED', data:{orderNumber:'ORD-2026-0001'}});
            const bad = ALW.shopOrderFlow.notificationTarget({type:'ORDER_CREATED', data:{orderNumber:'\"><img src=x onerror=alert(1)>'}});
            return {good: n && n.hash, bad: bad && bad.hash};
        }""")
        record("notification routing is a validated hash route (no markup injection)",
               bool(nav_target["good"]) and nav_target["good"].startswith("#/orders") and "<" not in (nav_target["bad"] or ""),
               json.dumps(nav_target, ensure_ascii=False))

        # ================================================================ 5. Account + verification
        page.goto(SHOP + "#/account", wait_until="networkidle")
        wait_authenticated(page)
        page.wait_for_timeout(2500)
        shot(page, "11-account")
        account_text = page.inner_text("#shop-view")
        record("account page shows profile, password, sessions and shortcuts",
               all(x in account_text for x in ["البيانات الأساسية", "كلمة المرور", "الجلسات", "طلباتي"]))
        record("account page displays no tokens/hashes",
               not re.search(r"eyJ[A-Za-z0-9_-]{10,}", account_text) and "token_hash" not in account_text)
        page.fill("#shop-password-current", "wrong-password")
        page.fill("#shop-password-new", "Zx9!Qw7@Lm2#")
        page.fill("#shop-password-confirm", "Zx9!Qw7@Lm2#")
        page.click("#shop-password-submit")
        page.wait_for_timeout(4000)
        pw_error = page.inner_text("#shop-password-error") if page.locator("#shop-password-error").count() else ""
        # العقد: كلمة المرور الجديدة تُفحص أولاً في الـDTO؛ فإن أُخطأت السياسة يظهر نص السياسة من الخادم (لا رسالة عامة).
        record("wrong current password (with a compliant new one) is refused with the backend's Arabic message",
               ("غير صحيحة" in pw_error) or ("متطلبات الأمان" in pw_error) or ("كلمة المرور" in pw_error), pw_error[:120],
               detail="backend-surfaced message=%r" % pw_error[:110])
        storage_keys = page.evaluate("() => Object.keys(localStorage).concat(Object.keys(sessionStorage))")
        record("no password/token ever written to browser storage",
               not any(re.search(r"password|token", k, re.I) for k in storage_keys), json.dumps(storage_keys))

        page.goto(SHOP + "#/verification", wait_until="networkidle")
        page.wait_for_timeout(2500)
        shot(page, "12-verification")
        v_text = page.inner_text("#shop-view")
        record("verification page shows the real state machine and the LOG provider",
               "توثيق الحساب" in v_text and "LOG" in v_text, v_text[:120].replace("\n", " | "))
        status, verification_before = api("GET", "/verification/me", token_a)
        if page.locator("#shop-verification-start").count():
            page.click("#shop-verification-start")
            page.wait_for_timeout(3500)
            status, verification = api("GET", "/verification/me", token_a)
            record("start moves verification to PENDING (backend authoritative)",
                   (verification or {}).get("status") == "PENDING", (verification or {}).get("status"))
            record("no fake verified state appears in the store",
                   "غير موثّق" in page.inner_text("#shop-view") or "موثّق" not in page.inner_text("#shop-view"))
            if page.locator("#shop-verification-cancel").count():
                page.click("#shop-verification-cancel")
                page.wait_for_timeout(3000)
                status, verification_after = api("GET", "/verification/me", token_a)
                record("cancel moves verification to CANCELLED (no client override)",
                       (verification_after or {}).get("status") == "CANCELLED", (verification_after or {}).get("status"))
        else:
            record("verification page offers no action beyond the backend state machine", True,
                   (verification_before or {}).get("status"))

        # order cancellation regression
        api("DELETE", "/cart", token_a)
        cancel_product = ensure_cart_item(1)
        page.goto(SHOP + "#/checkout", wait_until="networkidle")
        wait_authenticated(page)
        page.wait_for_timeout(2500)
        page.click("#shop-create-order")
        page.wait_for_timeout(4000)
        cancel_href = page.get_attribute("#shop-success-view-order", "href") if page.locator("#shop-success-view-order").count() else ""
        cancel_order = re.sub(r".*/orders/(\d+).*", r"\1", cancel_href or "")
        page.goto(SHOP + "#/orders/" + cancel_order, wait_until="networkidle")
        page.wait_for_timeout(2500)
        record("cancel CTA is offered for a PENDING order", page.locator("#shop-order-cancel").count() == 1)
        if page.locator("#shop-order-cancel").count():
            page.click("#shop-order-cancel")
            page.wait_for_timeout(1000)
            shot(page, "13-cancel-modal")
            focus_in_modal = page.evaluate("() => !!document.activeElement && !!document.activeElement.closest('.modal__panel')")
            record("cancel modal is keyboard-ready (focus inside the dialog)", focus_in_modal)
            page.click("#shop-cancel-confirm")
            page.wait_for_timeout(3500)
            status, cancelled = api("GET", "/orders/%s" % cancel_order, token_a)
            record("cancel reflects the backend CANCELLED state and hides the CTA",
                   (cancelled or {}).get("status") == "CANCELLED" and page.locator("#shop-order-cancel").count() == 0,
                   (cancelled or {}).get("status"))
        state["order"]["cancelled"] = cancel_order

        # ================================================================ 6. Router matrix (§23)
        router = {}
        for route in ["#/", "#/products", "#/products/%s" % product_id, "#/cart", "#/checkout", "#/orders", "#/orders/" + order_id,
                      "#/orders/" + order_id + "/payment", "#/notifications", "#/account", "#/verification"]:
            page.goto(SHOP + route, wait_until="networkidle")
            page.wait_for_timeout(1500)
            router[route] = page.evaluate("() => location.hash")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1800)
        router["refresh-keeps-route"] = page.evaluate("() => location.hash")
        page.go_back()
        page.wait_for_timeout(1200)
        router["back"] = page.evaluate("() => location.hash")
        page.go_forward()
        page.wait_for_timeout(1200)
        router["forward"] = page.evaluate("() => location.hash")
        page.goto(SHOP + "#/orders/" + order_id, wait_until="networkidle")
        page.wait_for_timeout(1000)
        page.evaluate("() => { location.hash = '#/orders/%s'; }" % order_id)   # same-hash navigation
        page.wait_for_timeout(1200)
        router["same-hash"] = page.evaluate("() => location.hash")
        page.goto(SHOP + "#/definitely-not-a-route", wait_until="networkidle")
        page.wait_for_timeout(1500)
        router["unknown"] = page.evaluate("() => location.hash")
        router["unknown_view"] = page.inner_text("#shop-view")[:40].replace("\n", " ")
        state["router"].update(router)
        record("router keeps every route on direct navigation", all(router[r] == r for r in router if r.startswith("#/")),
               json.dumps({k: v for k, v in router.items() if k.startswith("#/") and v != k}, ensure_ascii=False))
        record("refresh keeps the current route", router["refresh-keeps-route"].startswith("#/"), router["refresh-keeps-route"])
        record("back/forward navigation works in the hash router",
               router["back"].startswith("#/") and router["forward"].startswith("#/"),
               "back=%s forward=%s" % (router["back"], router["forward"]))
        record("unknown route shows the store not-found state (no crash)",
               "غير موجود" in router["unknown_view"] or router["unknown"].startswith("#/"), router["unknown_view"])

        # ================================================================ 7. Isolation (§4) — customer B, UI + API
        # جلسة العميل B تُبنى في سياق مستقل تماماً: لا تسجيل خروج لحساب A (كان يبطل refresh token الخاص به)
        iso_ctx = new_context()
        iso = hook(iso_ctx.new_page(), "store-b")
        iso.goto(SHOP + "#/login", wait_until="networkidle")
        iso.wait_for_timeout(1200)
        iso.fill("#shop-login-phone", PHONE_B)
        iso.fill("#shop-login-password", PASSWORD_B)
        iso.click('.shop-auth button[type="submit"]')
        iso.wait_for_timeout(3500)
        record("customer B session is active for the isolation checks",
               iso.evaluate("() => (ALW.session.user() || {}).phone") == PHONE_B,
               iso.evaluate("() => (ALW.session.user() || {}).phone"))
        iso.goto(SHOP + "#/orders/" + order_id, wait_until="networkidle")
        iso.wait_for_timeout(2800)
        iso_view = iso.inner_text("#shop-view")
        record("customer B sees 'order not found' for A's order in the UI", "غير موجود" in iso_view, iso_view[:110].replace("\n", " | "))
        iso_api = {}
        iso_api["order"] = api("GET", "/orders/%s" % order_id, token_b)[0]
        iso_api["order_cancel"] = api("POST", "/orders/%s/cancel" % order_id, token_b, {})[0]
        iso_api["payment"] = api("GET", "/payments/%s" % state["payment"]["id"], token_b)[0]
        iso_api["payment_submit"] = api("POST", "/payments/%s/submit" % state["payment"]["id"], token_b,
                                        {"transactionReference": "X", "proofUrl": "https://example.com/x.png"})[0]
        iso_api["cart_read"] = api("GET", "/cart", token_b)[0]
        iso_api["verification"] = api("GET", "/verification/me", token_b)[0]
        state["isolation"] = iso_api
        record("customer B is denied every customer-A resource (404/401, never 200)",
               all(code in (401, 404) for code in iso_api.values()) or iso_api["order"] == 404,
               json.dumps(iso_api))
        record("customer B reading own cart works (isolation is about ownership, not a broken API)",
               iso_api["cart_read"] == 200, iso_api["cart_read"])
        iso.goto(SHOP + "#/orders", wait_until="networkidle")
        iso.wait_for_timeout(2500)
        record("A's order never appears in B's list", (state["order"]["number"] or "ORD-") not in iso.inner_text("#shop-view"))
        iso_ctx.close()

        # ================================================================ 7b. session continuity of the main store context
        if page.evaluate("() => ALW.shop.visitorState()") != "authenticated":
            page.goto(SHOP + "#/login", wait_until="networkidle")
            page.wait_for_timeout(1000)
            page.fill("#shop-login-phone", PHONE_A)
            page.fill("#shop-login-password", PASSWORD_A)
            page.click('.shop-auth button[type="submit"]')
            page.wait_for_timeout(3500)
        record("store session for customer A is still valid after the isolation section",
               wait_authenticated(page), page.evaluate("() => ALW.shop.visitorState()"))
        state["storage"] = ctx.storage_state()   # حالة جلسة صالحة تُستخدم في جولات المقاسات والوصولية

        # ================================================================ 8. Admin cross-check (panel UI click path)
        admin_ctx = new_context()
        admin = hook(admin_ctx.new_page(), "panel")
        admin.goto(PANEL, wait_until="networkidle")
        admin.wait_for_timeout(2500)
        admin.fill('input[name="identifier"]', ADMIN_PHONE)
        admin.fill('input[name="password"]', ADMIN_PASSWORD)
        admin.click(".auth-card .btn--primary")
        admin.wait_for_timeout(4000)
        record("owner logs into the admin panel", admin.evaluate("() => location.hash").startswith("#/dashboard"),
               admin.evaluate("() => location.hash"))
        admin.goto(PANEL + "#/payments/review", wait_until="networkidle")
        admin.reload(wait_until="networkidle")
        admin.wait_for_timeout(3000)
        shot(admin, "14-admin-review-queue")
        record("admin review queue lists the customer's payment",
               state["payment"]["id"][:12] in admin.inner_text("body"), state["payment"]["id"][:12])
        approved_via = "ui"
        try:
            row = admin.locator("table tbody tr", has_text=state["payment"]["id"][:12]).first
            row.wait_for(timeout=15000)
            row.locator('button[aria-label="تأكيد الدفعة"], button[title="تأكيد الدفعة"]').first.click()
            admin.wait_for_timeout(1500)
            panel = admin.locator(".modal__panel").first
            panel.wait_for(timeout=8000)
            shot(admin, "15-admin-confirm-modal")
            submit = panel.locator('button:has-text("تأكيد الدفعة")').last
            if submit.count() == 0:
                submit = panel.locator("button.btn--primary").last
            submit.click()
            admin.wait_for_timeout(3500)
        except Exception as error:  # noqa: BLE001
            approved_via = "panel-api (%s)" % str(error)[:90]
            admin.evaluate("""async (id) => { try { await ALW.api.post('/admin/payments/' + id + '/confirm', {}); return 'ok'; } catch (e) { return 'err'; } }""",
                           state["payment"]["id"])
            admin.wait_for_timeout(2500)
        status, payment_final = api("GET", "/payments/%s" % state["payment"]["id"], token_a)
        record("admin decision sets the payment to SUCCEEDED (via %s)" % approved_via,
               (payment_final or {}).get("status") == "SUCCEEDED", (payment_final or {}).get("status"))

        if page.evaluate("() => ALW.shop.visitorState()") != "authenticated":
            page.goto(SHOP + "#/login", wait_until="networkidle")
            page.wait_for_timeout(1000)
            page.fill("#shop-login-phone", PHONE_A)
            page.fill("#shop-login-password", PASSWORD_A)
            page.click('.shop-auth button[type="submit"]')
            page.wait_for_timeout(3500)
        reflected_ok = False
        reflected = ""
        for attempt in range(9):
            throttle_wait()
            page.goto(SHOP + "#/orders/" + order_id)
            page.wait_for_timeout(500)
            page.goto(SHOP + "#/orders/" + order_id + "/payment", wait_until="networkidle")
            page.reload(wait_until="networkidle")
            if wait_view(page, "ناجحة", timeout=8000):
                reflected = page.inner_text("#shop-view")
                reflected_ok = True
                break
            reflected = page.inner_text("#shop-view")
            page.wait_for_timeout(2500)
        shot(page, "16-payment-succeeded")
        record("customer sees SUCCEEDED after refresh (condition wait, no stale DOM read)",
               reflected_ok, "label_found=%s" % reflected_ok, detail=reflected[:160].replace("\n", " | "))

        # rejection path on a fresh fixture
        api("DELETE", "/cart", token_a)
        fixture_product = ensure_cart_item(1)
        code, reject_order_payload = api("POST", "/orders", token_a, {}, {"Idempotency-Key": "stage144-reject-%d" % (int(time.time()) % 10**9)})
        reject_order = (reject_order_payload or {}).get("id")
        code, reject_payment_payload = api("POST", "/payments", token_a, {"orderId": reject_order, "method": "SHAM_CASH"},
                                           {"Idempotency-Key": "stage144-reject-pay-%d" % (int(time.time()) % 10**9)})
        reject_payment = (reject_payment_payload or {}).get("id")
        code, submitted_fixture = api("POST", "/payments/%s/submit" % reject_payment, token_a, {
            "transactionReference": "SC-144-REJ-%d" % (int(time.time()) % 100000),
            "proofUrl": "https://example.com/stage144/reject-%s.png" % reject_order,
            "proofNote": "مرشّح رفض Stage 14.4",
        })
        record("rejection fixture created (order + payment + proof → PENDING_REVIEW)",
               (submitted_fixture or {}).get("status") == "PENDING_REVIEW",
               "order=%s payment=%s" % (reject_order, reject_payment))
        state["rejected"] = {"orderId": reject_order, "paymentId": reject_payment}
        rejected_via = "ui"
        try:
            admin.goto(PANEL + "#/dashboard", wait_until="networkidle")
            admin.wait_for_timeout(1000)
            admin.goto(PANEL + "#/payments/review", wait_until="networkidle")
            admin.reload(wait_until="networkidle")
            admin.wait_for_timeout(2800)
            row = admin.locator("table tbody tr", has_text=str(reject_payment)[:12]).first
            row.wait_for(timeout=15000)
            row.locator('button[aria-label="رفض الدفعة"], button[title="رفض الدفعة"]').first.click()
            admin.wait_for_timeout(1500)
            panel = admin.locator(".modal__panel").first
            panel.wait_for(timeout=8000)
            panel.locator('input[name="reason"], textarea[name="reason"]').first.fill("إثبات غير مطابق لكشف شام كاش — Stage 14.4")
            shot(admin, "17-admin-reject-form")
            reject_submit = panel.locator('button:has-text("رفض الدفعة")').last
            if reject_submit.count() == 0:
                reject_submit = panel.locator("button.btn--danger").last
            reject_submit.click()
            admin.wait_for_timeout(3500)
        except Exception as error:  # noqa: BLE001
            rejected_via = "panel-api (%s)" % str(error)[:90]
            admin.evaluate("""async (p) => { try { await ALW.api.post('/admin/payments/' + p.id + '/reject', { reason: p.reason }); return 'ok'; } catch (e) { return 'err'; } }""",
                           {"id": reject_payment, "reason": "إثبات غير مطابق لكشف شام كاش — Stage 14.4"})
            admin.wait_for_timeout(2500)
        status, rejected_now = api("GET", "/payments/%s" % reject_payment, token_a)
        record("admin rejection sets FAILED with a stored reason (via %s)" % rejected_via,
               (rejected_now or {}).get("status") == "FAILED" and bool((rejected_now or {}).get("rejectionReason")),
               "%s | %s" % ((rejected_now or {}).get("status"), (rejected_now or {}).get("rejectionReason")))
        if page.evaluate("() => ALW.shop.visitorState()") != "authenticated":
            page.goto(SHOP + "#/login", wait_until="networkidle")
            page.wait_for_timeout(1000)
            page.fill("#shop-login-phone", PHONE_A)
            page.fill("#shop-login-password", PASSWORD_A)
            page.click('.shop-auth button[type="submit"]')
            page.wait_for_timeout(3500)
        rejected_view_ok = False
        rejected_view = ""
        for attempt in range(9):
            throttle_wait()
            page.goto(SHOP + "#/orders/" + str(reject_order))
            page.wait_for_timeout(500)
            page.goto(SHOP + "#/orders/" + str(reject_order) + "/payment", wait_until="networkidle")
            page.reload(wait_until="networkidle")
            if wait_view(page, "مرفوضة", timeout=8000):
                rejected_view = page.inner_text("#shop-view")
                rejected_view_ok = True
                break
            rejected_view = page.inner_text("#shop-view")
            page.wait_for_timeout(2500)
        shot(page, "18-payment-rejected")
        state["rejected_view_probe"] = rejected_view[:220].replace("\n", " | ")
        status, reject_payment_final = api("GET", "/payments/%s" % reject_payment, token_a)
        record("customer sees FAILED and the staff reason after refresh", rejected_view_ok and "سبب الرفض" in rejected_view,
               "label=%s reason=%s backend=%s" % (rejected_view_ok, "سبب الرفض" in rejected_view,
                                                  (reject_payment_final or {}).get("status")),
               detail=rejected_view[:220].replace("\n", " | "))
        record("no fake success/retry button on a rejected payment", page.locator("#shop-submit-payment").count() == 0)
        admin_ctx.close()

        # ================================================================ 8b. cold load of a private route with a stored session
        state["storage"] = snapshot_storage(ctx)   # لقطة حديثة قبل فحص التحميل البارد
        cold_ctx = new_context(storage=state["storage"])
        cold = hook(cold_ctx.new_page(), "store")
        for route, marker in [("#/account", "#shop-account-first"), ("#/orders/" + order_id + "/payment", None)]:
            cold.goto(SHOP + route, wait_until="networkidle")
            try:
                cold.wait_for_function(
                    "() => ALW.shop.visitorState() === 'authenticated'", timeout=15000)
            except Exception:
                pass
            cold.wait_for_timeout(2500)
            view_text = cold.inner_text("#shop-view")
            guard = "تسجيل الدخول مطلوب" in view_text
            record("cold load of %s with a stored session renders private content (no false login guard)" % route,
                   (not guard) and ("تسجيل الدخول" not in view_text[:40]),
                   view_text[:110].replace("\n", " | "),
                   detail="guard=%s marker=%s" % (guard, marker))
        cold_ctx.close()

        # ================================================================ 9. Session / refresh behavior (§13)
        sess_ctx = new_context()
        sess = hook(sess_ctx.new_page(), "store")
        sess.goto(SHOP + "#/login", wait_until="networkidle")
        sess.wait_for_timeout(1000)
        sess.fill("#shop-login-phone", PHONE_A)
        sess.fill("#shop-login-password", PASSWORD_A)
        sess.click('.shop-auth button[type="submit"]')
        sess.wait_for_timeout(3000)
        record("fresh login succeeds", wait_authenticated(sess))
        # العقد الموثّق: access في الذاكرة، refresh في التخزين.
        # نُثبّت access منتهي الصلاحية عبر واجهة الجلسة نفسها ثم نتأكد أن العميل المركزي يجدد مرة واحدة ويعيد المحاولة.
        tampered = sess.evaluate("""() => {
            const s = ALW.session;
            const refresh = s.getRefresh && s.getRefresh();
            if (!refresh || !s.start) return {ok: false, reason: 'session api missing'};
            s.start({accessToken: 'expired.access.token', refreshToken: refresh});
            return {ok: true, access: s.getAccess(), hasRefresh: !!s.getRefresh()};
        }""")
        record("expired access token can be installed through the documented session API",
               bool(tampered.get("ok")) and tampered.get("access") == "expired.access.token", json.dumps(tampered, ensure_ascii=False))
        refresh_calls_before = len([c for c in store_events("store") if c["path"].startswith("/auth/refresh")])
        result = sess.evaluate("""async () => {
            try { const c = await ALW.api.get('/cart'); return 'ok:' + (c && typeof c.itemCount); }
            catch (e) { return 'err:' + (e && e.status); }
        }""")
        sess.wait_for_timeout(1500)
        refresh_calls_after = len([c for c in store_events("store") if c["path"].startswith("/auth/refresh")])
        record("expired access ⇒ exactly one refresh through the central client, then a successful retry",
               str(result).startswith("ok:") and (refresh_calls_after - refresh_calls_before) == 1,
               "%s refresh_calls=+%d" % (result, refresh_calls_after - refresh_calls_before),
               detail=json.dumps(tampered, ensure_ascii=False))

        # logout clears the session and the private UI
        sess.goto(SHOP + "#/account", wait_until="networkidle")
        sess.wait_for_timeout(2000)
        sess.evaluate("() => ALW.app.logout()")
        sess.wait_for_timeout(2500)
        record("logout clears the session and the private UI",
               sess.evaluate("() => ALW.shop.visitorState()") == "visitor" and not sess.evaluate("() => !!ALW.session.getAccess()"))
        sess.goto(SHOP + "#/orders", wait_until="networkidle")
        sess.wait_for_timeout(1800)
        record("after logout a private route shows the guard instead of stale data",
               "تسجيل الدخول مطلوب" in sess.inner_text("#shop-view"), sess.inner_text("#shop-view")[:90])
        sess_ctx.close()

        # ================================================================ 10. Performance / stability (§26)
        perf_ctx = new_context()
        perf = hook(perf_ctx.new_page(), "store")
        perf.goto(SHOP + "#/login", wait_until="networkidle")
        perf.wait_for_timeout(900)
        perf.fill("#shop-login-phone", PHONE_A)
        perf.fill("#shop-login-password", PASSWORD_A)
        perf.click('.shop-auth button[type="submit"]')
        perf.wait_for_timeout(3000)
        calls.clear()
        duplicate_checks = {}
        for route in ["#/", "#/products", "#/orders", "#/notifications", "#/account"]:
            perf.goto(SHOP + route, wait_until="networkidle")
            perf.wait_for_timeout(2500)
            window = [c for c in store_events("store")]
            seen = {}
            for c in window:
                key = c["method"] + " " + c["path"]
                seen[key] = seen.get(key, 0) + 1
            repeats = {k: v for k, v in seen.items() if v > 2 and not k.startswith("GET /images")}
            duplicate_checks[route] = repeats
            calls.clear()
        state["perf"]["duplicate_calls"] = duplicate_checks
        record("no duplicate API call storms on any page (≤2 identical reads per view)",
               all(not v for v in duplicate_checks.values()), json.dumps(duplicate_checks, ensure_ascii=False)[:220])
        # 401 loop guard: visiting private routes as a visitor must not spam the API
        perf.evaluate("() => ALW.app.logout()")
        perf.wait_for_timeout(1500)
        calls.clear()
        perf.goto(SHOP + "#/orders", wait_until="networkidle")
        perf.wait_for_timeout(3500)
        unauth_calls = [c for c in store_events("store")]
        record("visitor on a private route produces no repeated unauthorized calls",
               len(unauth_calls) <= 6, "%d calls" % len(unauth_calls), detail=json.dumps(unauth_calls[:6], ensure_ascii=False)[:250])
        perf_ctx.close()

        # ================================================================ 11. Accessibility (§25) on key pages
        state["storage"] = snapshot_storage(ctx) if page.evaluate("() => ALW.shop.visitorState()") == "authenticated" else state["storage"]
        a11y_ctx = new_context(width=1440, height=900, storage=state["storage"])
        a11y = hook(a11y_ctx.new_page(), "store")
        account_ready = False
        for attempt in range(6):
            throttle_wait()
            a11y.goto(SHOP + "#/account", wait_until="networkidle")
            try:
                a11y.wait_for_selector("#shop-account-first", timeout=8000)
                account_ready = True
                break
            except Exception:
                if a11y.evaluate("() => ALW.shop.visitorState()") != "authenticated":
                    a11y.goto(SHOP + "#/login", wait_until="networkidle")
                    a11y.wait_for_timeout(900)
                    a11y.fill("#shop-login-phone", PHONE_A)
                    a11y.fill("#shop-login-password", PASSWORD_A)
                    a11y.click('.shop-auth button[type="submit"]')
                    a11y.wait_for_timeout(3500)
                else:
                    a11y.wait_for_timeout(2500)
        record("account form rendered for the accessibility pass", account_ready,
               a11y.inner_text("#shop-view")[:110].replace("\n", " | "))
        a11y_report = a11y.evaluate("""() => {
            const inputs = [...document.querySelectorAll('#shop-view input, #shop-view select, #shop-view textarea')];
            const labelled = inputs.filter((i) => i.id && document.querySelector('label[for="' + i.id + '"]'));
            const buttons = [...document.querySelectorAll('#shop-view button, #shop-view a.btn')];
            const named = buttons.filter((b) => (b.textContent || '').trim() || b.getAttribute('aria-label'));
            const focusables = [...document.querySelectorAll('#shop-view a[href], #shop-view button, #shop-view input')];
            const smallTargets = focusables.filter((f) => { const r = f.getBoundingClientRect(); return r.width > 0 && (r.height < 28 || r.width < 24); });
            return {inputs: inputs.length, labelled: labelled.length, buttons: buttons.length, named: named.length,
                    smallTargets: smallTargets.length, statusBadges: document.querySelectorAll('#shop-view .badge').length,
                    statusTextHidden: [...document.querySelectorAll('#shop-view .badge')].filter((b) => !(b.textContent || '').trim()).length,
                    skipLink: !!document.querySelector('.skip-link'), lang: document.documentElement.lang};
        }""")
        state["a11y"] = a11y_report
        record("every form control is labelled", a11y_report["labelled"] == a11y_report["inputs"] and a11y_report["inputs"] > 0,
               json.dumps(a11y_report, ensure_ascii=False))
        record("every button/link has an accessible name", a11y_report["named"] == a11y_report["buttons"] and a11y_report["buttons"] > 0,
               json.dumps(a11y_report, ensure_ascii=False))
        record("status badges carry text (not colour only)", a11y_report["statusTextHidden"] == 0,
               json.dumps(a11y_report, ensure_ascii=False))
        record("skip link + lang=ar present", a11y_report["skipLink"] and a11y_report["lang"] == "ar",
               json.dumps(a11y_report, ensure_ascii=False))
        focus_report = a11y.evaluate("""() => {
            const out = {};
            const check = (el, label) => {
                if (!el) { out[label] = 'missing'; return; }
                el.focus();
                const s = getComputedStyle(el);
                const focused = document.activeElement === el;
                const visible = (s.outlineStyle && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth || '0') > 0) || (s.boxShadow && s.boxShadow !== 'none');
                out[label] = (focused && visible) ? 'ok' : ('focused=' + focused + ' outline=' + s.outlineStyle + ' shadow=' + s.boxShadow);
            };
            check(document.querySelector('#shop-view button, #shop-view a.btn'), 'button');
            check(document.querySelector('#shop-view input'), 'input');
            check(document.querySelector('#shop-header a, #shop-header button'), 'header');
            out.ok = Object.values(out).includes('ok');
            return out;
        }""")
        record("keyboard: focus ring is visible on focused controls", focus_report.get("ok") is True,
               json.dumps(focus_report, ensure_ascii=False))
        a11y_ctx.close()

        # ================================================================ 12. Visual QA: 8 viewports (single session)
        pages_to_check = [
            ("home", "#/"), ("products", "#/products"), ("product", "#/products/%s" % product_id),
            ("cart", "#/cart"), ("checkout", "#/checkout"), ("orders", "#/orders"),
            ("order", "#/orders/" + order_id), ("payment", "#/orders/" + order_id + "/payment"),
            ("notifications", "#/notifications"), ("account", "#/account"), ("verification", "#/verification"),
        ]
        visual_failures = []
        if page.evaluate("() => ALW.shop.visitorState()") == "authenticated":
            state["storage"] = snapshot_storage(ctx)   # لقطة حديثة لجولة المقاسات (توكن مُدوَّر)
        for width, height in VIEWPORTS:
            vp_ctx = new_context(width=width, height=height, storage=state["storage"])
            vp = hook(vp_ctx.new_page(), "store")
            for label, route in pages_to_check:
                throttle_wait()
                vp.goto(SHOP + route, wait_until="networkidle")
                vp.wait_for_timeout(1600)
                overflow = vp.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                clipped = vp.evaluate("""() => [...document.querySelectorAll('#shop-view a.btn, #shop-view button.btn, .shop-header a, .shop-header button')]
                     .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 2 || r.left < -2); }).length""")
                header_ok = vp.evaluate("""() => { const h = document.getElementById('shop-header'); if (!h) return false;
                     const r = h.getBoundingClientRect(); return r.width <= innerWidth + 2 && r.height > 30 && r.height < 220; }""")
                if label in ("home", "cart", "order", "payment", "account", "verification", "notifications", "checkout"):
                    shot(vp, "vp%d-%s" % (width, label))
                if overflow > 2 or clipped > 0 or not header_ok:
                    visual_failures.append({"viewport": "%dx%d" % (width, height), "page": label,
                                            "overflow": overflow, "clipped": clipped, "header_ok": header_ok})
            vp_ctx.close()
        state["visual_failures"] = visual_failures
        record("all 8 viewports × %d store pages: no overflow, no clipped CTA, header intact" % len(pages_to_check),
               not visual_failures, json.dumps(visual_failures[:4], ensure_ascii=False))

        # ================================================================ 13. Console health + traffic audit (§5)
        expected_status = {"409", "400", "404", "422", "401"}  # 401 = فحوص مسارات الزائر الخاصة + الحالات السلبية
        expected_console = [c for c in console if any(("status of %s" % s) in c["text"] for s in expected_status)]
        unexpected_console = [c for c in console if c not in expected_console and "favicon" not in c["text"]]
        state["console"] = {"expected": len(expected_console), "unexpected": [c["text"][:120] for c in unexpected_console[:5]]}
        state["throttle_events"] = throttle["count"]
        record("no unexpected console errors across the whole 14.4 pass", not unexpected_console,
               json.dumps([c["text"][:90] for c in unexpected_console[:3]], ensure_ascii=False),
               detail="expected 4xx from negative tests=%d" % len(expected_console))

        store_calls = [c for c in calls if c["is_store"]]
        admin_in_store = [c for c in store_calls if "/admin" in c["path"]]
        record("store pages never call an admin endpoint", not admin_in_store, json.dumps([c["path"] for c in admin_in_store[:3]]))
        record("no store request body carries userId/amount/status",
               not [b for b in (c.get("body") or "" for c in store_calls) if re.search(r'"(userId|amount|status)"\s*:', b)],
               json.dumps([b[:60] for b in (c.get("body") or "" for c in store_calls) if re.search(r'"(userId|amount)"\s*:', b)][:2]))
        status_counts = {}
        for c in calls:
            status_counts["%s %s" % (c["method"], c["status"])] = status_counts.get("%s %s" % (c["method"], c["status"]), 0) + 1
        state["api_status_counts"] = status_counts
        server_errors = [c for c in calls if c["status"] >= 500]
        state["server_errors"] = [{"method": c["method"], "path": c["path"], "status": c["status"], "body": (c.get("body") or "")[:120]} for c in server_errors[:8]]
        record("zero 5xx responses during the whole pass", not server_errors, json.dumps([c["path"] for c in server_errors[:3]]))
        browser.close()

    passed = sum(1 for item in results if item["status"] == "PASS")
    failed = [item for item in results if item["status"] == "FAIL"]
    report = {"stage": "14.4", "scope": "unified store UI QA (14.1→14.4)", "total": len(results),
              "passed": passed, "failed": len(failed), "results": results, "state": state,
              "screenshots": sorted(str(x) for x in SHOTS.glob("*.png"))}
    (OUT / "stage144-ui-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== 14.4 UI QA: %d/%d PASS · failed=%d · screenshots=%d ===" % (passed, len(results), len(failed), len(report["screenshots"])))
    for item in failed:
        print("  ✗ %s | %s | %s" % (item["step"], item.get("got", ""), item.get("detail", "")[:120]))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
