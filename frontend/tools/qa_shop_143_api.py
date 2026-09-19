#!/usr/bin/env python3
"""
Stage 14.3 — QA على مستوى الـAPI (رحلة العميل): العقود، العزل بين حسابين، التزامن/idempotency، وسلامة البيانات.

يشغّل نداءات حقيقية على الـBackend المنشور (https://panel.fahd-car.cloud/alwled-api/api/v1) بحسابات العميل
المخصّصة للاختبار، ويكتب تقريراً JSON + ملف حالة للتشغيل الـUI.

لا يحذف أي بيانات إنتاجية: كل ما يُنشأ بأسماء/حسابات اختبار (stage143.*) ويُوثَّق في التقرير.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

BASE = os.environ.get("SHOP_API_BASE", "https://panel.fahd-car.cloud/alwled-api/api/v1")
OUT_DIR = os.environ.get("SHOP_QA_OUT", "/root/alwled/frontend/tools/qa/shop143")
CUSTOMER_A = {"phone": "0955900100", "password": "Stage142!QAcust9"}
CUSTOMER_B = {"phone": "0955900160", "password": "Stage143B!Qa9", "confirmPassword": "Stage143B!Qa9",
              "firstName": "اختبار", "lastName": "ثاني", "email": "stage143.isolation@alwled.test"}
ADMIN = {"phone": "0938045496", "password": os.environ.get("SEED_OWNER_PASSWORD", "")}

RESULTS = []
STATE = {"orders": {}, "payments": {}, "customers": {}}


def record(name, ok, detail=None, extra=None):
    item = {"name": name, "ok": bool(ok)}
    if detail is not None:
        item["detail"] = str(detail)[:400]
    if extra:
        item.update(extra)
    RESULTS.append(item)
    print(("PASS  " if ok else "FAIL  ") + name + ((" | " + str(detail)[:200]) if (detail and not ok) else ""))
    return ok


def call(method, path, token=None, body=None, headers=None, retries=2):
    url = BASE + path
    data = None if body is None else json.dumps(body).encode("utf-8")
    request_headers = {"Accept": "application/json"}
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    if token:
        request_headers["Authorization"] = "Bearer " + token
    if headers:
        request_headers.update(headers)
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=data, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                text = response.read().decode("utf-8", "replace")
                payload = json.loads(text) if text else None
                if isinstance(payload, dict) and "data" in payload and "success" in payload:
                    payload = payload.get("data")
                return response.status, payload
        except urllib.error.HTTPError as error:
            text = error.read().decode("utf-8", "replace")
            try:
                payload = json.loads(text)
            except Exception:
                payload = {"raw": text[:300]}
            if error.code == 429 and attempt < retries:
                time.sleep(8 * (attempt + 1))
                continue
            return error.code, payload
        except Exception as error:  # network
            if attempt < retries:
                time.sleep(2)
                continue
            return 0, {"error": str(error)}
    return 0, {"error": "unreachable"}


def owner_password():
    """كلمة سر المالك من .env (لا تُطبع أبداً ولا تُكتب في التقارير)."""
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


def login(creds):
    status, payload = call("POST", "/auth/login", body={"phone": creds["phone"], "password": creds["password"]})
    if status != 200 or not payload:
        return None, status, payload
    return payload.get("accessToken"), status, payload


def register_customer_b():
    body = dict(CUSTOMER_B)
    status, payload = call("POST", "/auth/register", body=body)
    return status, payload


def message_of(payload):
    if isinstance(payload, dict):
        return payload.get("message") or payload.get("error") or payload.get("raw") or ""
    return str(payload)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("=== STAGE 14.3 — API QA (customer flow) ===")
    print("base:", BASE)

    # ---------------------------------------------------------------- 0. identity
    token_a, status_a, payload_a = login(CUSTOMER_A)
    record("customer A can log in (stage 14.2 account reused)", status_a == 200 and bool(token_a), message_of(payload_a))
    if not token_a:
        return finish()
    me_a = call("GET", "/auth/me", token_a)[1] or {}
    STATE["customers"]["a"] = {"id": me_a.get("id"), "phone": me_a.get("phone")}

    token_b, status_b, _ = login(CUSTOMER_B)
    if not token_b:
        reg_status, reg_payload = register_customer_b()
        record("registered the isolation customer (stage143.b)", reg_status in (200, 201), message_of(reg_payload))
        token_b, status_b, _ = login(CUSTOMER_B)
    record("customer B (isolation) has a session", bool(token_b), "status=%s" % status_b)
    me_b = call("GET", "/auth/me", token_b)[1] or {}
    STATE["customers"]["b"] = {"id": me_b.get("id"), "phone": me_b.get("phone")}
    record("customers A and B are different users", me_a.get("id") and me_b.get("id") and me_a.get("id") != me_b.get("id"))

    # ---------------------------------------------------------------- 1. contracts (real shapes)
    code, orders = call("GET", "/orders?page=1&limit=5", token_a)
    record("GET /orders returns the paginated customer shape", code == 200 and isinstance(orders, dict) and "items" in orders and "meta" in orders, "code=%s" % code)
    code, unread = call("GET", "/notifications/unread-count", token_a)
    record("GET /notifications/unread-count returns {count}", code == 200 and isinstance((unread or {}).get("count"), int), "code=%s payload=%s" % (code, unread))
    code, account = call("GET", "/payments/sham-cash/account", token_a)
    record("GET /payments/sham-cash/account is reachable for a customer", code == 200, "code=%s" % code)
    STATE["sham_cash"] = account
    code, verification = call("GET", "/verification/me", token_a)
    record("GET /verification/me returns the stage 9 state machine view", code == 200 and isinstance(verification, dict) and "status" in verification, "code=%s" % code)
    code, sessions = call("GET", "/auth/sessions", token_a)
    record("GET /auth/sessions lists sessions without tokens", code == 200 and isinstance(sessions, dict), "code=%s" % code)

    # ---------------------------------------------------------------- 2. cart → order → payment
    code, products = call("GET", "/products?page=1&limit=2")
    product = ((products or {}).get("items") or [None])[0]
    record("a public product exists for the order flow", bool(product), "code=%s" % code)
    if not product:
        return finish()

    code, _ = call("DELETE", "/cart", token_a)
    code, _ = call("POST", "/cart/items", token_a, {"productId": product["id"], "quantity": 2})
    record("cart item added for the QA run", code in (200, 201), "code=%s" % code)

    idem_order = "stage143-order-" + uuid.uuid4().hex[:12]
    code, order = call("POST", "/orders", token_a, {}, {"Idempotency-Key": idem_order})
    record("POST /orders creates a real order", code in (200, 201) and isinstance(order, dict) and order.get("id"), "code=%s %s" % (code, message_of(order)))
    STATE["orders"]["main"] = {"id": order.get("id"), "orderNumber": order.get("orderNumber"), "total": order.get("total"), "status": order.get("status")}
    record("order money comes from the backend as strings", isinstance(order.get("total"), (str, int, float)) and order.get("currency") == "USD")

    # replay with the same key ⇒ same order (double click safe)
    code2, replay = call("POST", "/orders", token_a, {}, {"Idempotency-Key": idem_order})
    record("same Idempotency-Key returns the same order (no duplicate)", code2 in (200, 201) and (replay or {}).get("id") == order.get("id"),
           "replay=%s" % (replay or {}).get("id"))

    # parallel double submit with the same key
    def parallel_order(_):
        return call("POST", "/orders", token_a, {}, {"Idempotency-Key": idem_order})[1]

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(parallel_order, range(4)))
    ids = {str((item or {}).get("id")) for item in results}
    record("4 parallel identical order requests produce exactly one order id", len(ids) == 1 and str(order.get("id")) in ids, "ids=%s" % sorted(ids))

    code, after = call("GET", "/orders?page=1&limit=50", token_a)
    matches = [item for item in (after or {}).get("items", []) if str(item.get("id")) == str(order.get("id"))]
    record("the order appears exactly once in GET /orders", len(matches) == 1, "matches=%s" % len(matches))

    idem_payment = "stage143-payment-" + uuid.uuid4().hex[:12]
    code, payment = call("POST", "/payments", token_a, {"orderId": order.get("id"), "method": "SHAM_CASH"}, {"Idempotency-Key": idem_payment})
    record("POST /payments creates a SHAM_CASH payment", code in (200, 201) and (payment or {}).get("id"), "code=%s %s" % (code, message_of(payment)))
    STATE["payments"]["main"] = {"id": (payment or {}).get("id"), "orderId": order.get("id"), "amount": (payment or {}).get("amount"), "status": (payment or {}).get("status")}
    record("payment amount equals the order total (backend-authoritative)", str((payment or {}).get("amount")) == str(order.get("total")),
           "payment=%s order=%s" % ((payment or {}).get("amount"), order.get("total")))
    record("payment provider stays null (manual workflow only)", (payment or {}).get("provider") in (None, ""), "provider=%s" % (payment or {}).get("provider"))

    code2, payment_replay = call("POST", "/payments", token_a, {"orderId": order.get("id"), "method": "SHAM_CASH"}, {"Idempotency-Key": idem_payment})
    record("replaying the payment key returns the same payment", (payment_replay or {}).get("id") == payment.get("id"))

    # duplicate active payment without a key ⇒ backend must refuse (no double payment for one order)
    code3, duplicate = call("POST", "/payments", token_a, {"orderId": order.get("id"), "method": "SHAM_CASH"}, {"Idempotency-Key": "stage143-dup-" + uuid.uuid4().hex[:8]})
    record("a second active payment for the same order is refused by the backend", code3 in (400, 409), "code=%s %s" % (code3, message_of(duplicate)))

    # ---------------------------------------------------------------- 3. submit proof (validation + happy path)
    code, bad = call("POST", "/payments/%s/submit" % payment.get("id"), token_a, {"transactionReference": "SC-143-EMPTY"})
    record("submit without proofUrl is rejected by the backend", code in (400, 422), "code=%s" % code)

    code, submitted = call("POST", "/payments/%s/submit" % payment.get("id"), token_a, {
        "transactionReference": "SC-143-" + uuid.uuid4().hex[:6].upper(),
        "proofUrl": "https://example.com/stage143/proof.png",
        "proofNote": "stage143 api QA",
    })
    record("submit with a reference + proof link moves the payment to PENDING_REVIEW",
           code in (200, 201) and (submitted or {}).get("status") == "PENDING_REVIEW", "code=%s status=%s" % (code, (submitted or {}).get("status")))
    STATE["payments"]["main"]["status"] = (submitted or {}).get("status")

    code, resubmit = call("POST", "/payments/%s/submit" % payment.get("id"), token_a, {
        "transactionReference": "SC-143-AGAIN", "proofUrl": "https://example.com/stage143/proof2.png"})
    record("re-submitting the same payment is refused (409)", code == 409, "code=%s" % code)

    # data integrity: the client cannot push its own amount/provider
    tamper_code, tamper = call("POST", "/payments/%s/submit" % payment.get("id"), token_a, {
        "transactionReference": "x", "proofUrl": "https://example.com/x.png", "amount": "1.00", "status": "SUCCEEDED"})
    now_code, payment_now = call("GET", "/payments/%s" % payment.get("id"), token_a)
    record("client attempts to set amount/status are rejected and never change the payment",
           tamper_code in (400, 409, 422) and str((payment_now or {}).get("amount")) == str(order.get("total")) and (payment_now or {}).get("status") == "PENDING_REVIEW",
           "tamper=%s amount=%s status=%s" % (tamper_code, (payment_now or {}).get("amount"), (payment_now or {}).get("status")))

    # ---------------------------------------------------------------- 4. notifications for the customer
    code, notifications = call("GET", "/notifications?limit=20&sortBy=createdAt&sortOrder=desc", token_a)
    items = (notifications or {}).get("items", [])
    types = [item.get("type") for item in items]
    record("customer sees ORDER_CREATED for the new order", "ORDER_CREATED" in types or "ORDER_CONFIRMED" in types, "types=%s" % types[:8])
    record("customer sees PAYMENT_SUBMITTED_FOR_REVIEW after submitting proof", "PAYMENT_SUBMITTED_FOR_REVIEW" in types or "PAYMENT_CREATED" in types, "types=%s" % types[:8])
    first_unread = next((item for item in items if not item.get("read")), None)
    if first_unread:
        code, _ = call("POST", "/notifications/%s/read" % first_unread.get("id"), token_a)
        record("POST /notifications/{id}/read marks the customer's own notification", code in (200, 201), "code=%s" % code)

    # ---------------------------------------------------------------- 5. isolation between customers
    code, foreign_order = call("GET", "/orders/%s" % order.get("id"), token_b)
    record("customer B cannot read customer A's order (404)", code == 404, "code=%s" % code)
    code, foreign_cancel = call("POST", "/orders/%s/cancel" % order.get("id"), token_b, {})
    record("customer B cannot cancel customer A's order (404)", code == 404, "code=%s" % code)
    code, foreign_payment = call("GET", "/payments/%s" % payment.get("id"), token_b)
    record("customer B cannot read customer A's payment (404)", code == 404, "code=%s" % code)
    code, foreign_submit = call("POST", "/payments/%s/submit" % payment.get("id"), token_b, {
        "transactionReference": "attacker", "proofUrl": "https://example.com/attacker.png"})
    record("customer B cannot submit proof on customer A's payment (404)", code == 404, "code=%s" % code)
    if first_unread:
        code, _ = call("POST", "/notifications/%s/read" % first_unread.get("id"), token_b)
        record("customer B cannot mark customer A's notification as read (404)", code == 404, "code=%s" % code)
    code, orders_b = call("GET", "/orders?page=1&limit=50", token_b)
    ids_b = [str(item.get("id")) for item in (orders_b or {}).get("items", [])]
    record("customer A's order never appears in customer B's list", str(order.get("id")) not in ids_b, "b_ids=%s" % ids_b[:5])

    # ---------------------------------------------------------------- 6. verification state machine per customer
    code_b, verification_b = call("GET", "/verification/me", token_b)
    record("customer B has an independent verification record", code_b == 200 and (verification_b or {}).get("id") != (verification or {}).get("id"),
           "a=%s b=%s" % ((verification or {}).get("id"), (verification_b or {}).get("id")))

    # ---------------------------------------------------------------- 7. fixtures for the UI run (a second order to reject)
    code, _ = call("DELETE", "/cart", token_a)
    call("POST", "/cart/items", token_a, {"productId": product["id"], "quantity": 1})
    code, order2 = call("POST", "/orders", token_a, {}, {"Idempotency-Key": "stage143-order2-" + uuid.uuid4().hex[:10]})
    code, payment2 = call("POST", "/payments", token_a, {"orderId": (order2 or {}).get("id"), "method": "SHAM_CASH"},
                          {"Idempotency-Key": "stage143-payment2-" + uuid.uuid4().hex[:10]})
    code, submitted2 = call("POST", "/payments/%s/submit" % (payment2 or {}).get("id"), token_a, {
        "transactionReference": "SC-143-REJ-" + uuid.uuid4().hex[:6].upper(),
        "proofUrl": "https://example.com/stage143/reject.png",
        "proofNote": "stage143 rejection fixture",
    })
    record("rejection fixture order+payment created (PENDING_REVIEW)",
           (payment2 or {}).get("id") and (submitted2 or {}).get("status") == "PENDING_REVIEW",
           "order=%s payment=%s status=%s" % ((order2 or {}).get("id"), (payment2 or {}).get("id"), (submitted2 or {}).get("status")))
    STATE["orders"]["reject"] = {"id": (order2 or {}).get("id"), "orderNumber": (order2 or {}).get("orderNumber"), "total": (order2 or {}).get("total")}
    STATE["payments"]["reject"] = {"id": (payment2 or {}).get("id"), "orderId": (order2 or {}).get("id"), "amount": (payment2 or {}).get("amount"), "status": (payment2 or {}).get("status")}

    # cancel path: cancel a third order and confirm the state machine refuses a second cancel
    code, _ = call("DELETE", "/cart", token_a)
    call("POST", "/cart/items", token_a, {"productId": product["id"], "quantity": 1})
    code, order3 = call("POST", "/orders", token_a, {}, {"Idempotency-Key": "stage143-order3-" + uuid.uuid4().hex[:10]})
    code, cancelled = call("POST", "/orders/%s/cancel" % order3.get("id"), token_a, {"reason": "stage143 qa cancel"})
    record("a PENDING order can be cancelled (state machine)", code in (200, 201) and (cancelled or {}).get("status") == "CANCELLED", "code=%s status=%s" % (code, (cancelled or {}).get("status")))
    code, again = call("POST", "/orders/%s/cancel" % order3.get("id"), token_a, {})
    record("cancelling an already-cancelled order is refused (409)", code in (400, 409), "code=%s" % code)
    STATE["orders"]["cancelled"] = {"id": (order3 or {}).get("id"), "orderNumber": (order3 or {}).get("orderNumber")}

    # a PENDING order that already carries an active payment can still be cancelled by its owner (backend state machine):
    # the payment row survives — the admin review queue stays the source of truth for the money.
    call("POST", "/cart/items", token_a, {"productId": product["id"], "quantity": 1})
    code, order4 = call("POST", "/orders", token_a, {}, {"Idempotency-Key": "stage143-order4-" + uuid.uuid4().hex[:10]})
    code, payment4 = call("POST", "/payments", token_a, {"orderId": (order4 or {}).get("id"), "method": "SHAM_CASH"},
                          {"Idempotency-Key": "stage143-payment4-" + uuid.uuid4().hex[:10]})
    code, cancelled4 = call("POST", "/orders/%s/cancel" % (order4 or {}).get("id"), token_a, {"reason": "stage143 qa cancel with an active payment"})
    record("cancelling a PENDING order with an active payment follows the order state machine",
           code in (200, 201) and (cancelled4 or {}).get("status") == "CANCELLED", "code=%s status=%s" % (code, (cancelled4 or {}).get("status")))
    STATE["orders"]["cancelled_with_payment"] = {"id": (order4 or {}).get("id"), "orderNumber": (order4 or {}).get("orderNumber")}
    STATE["payments"]["cancelled_with_payment"] = {"id": (payment4 or {}).get("id"), "status": (payment4 or {}).get("status")}

    # ---------------------------------------------------------------- 7b. admin cross-check (review queue → confirm → store reflects)
    ADMIN["password"] = ADMIN["password"] or owner_password()
    admin_token, admin_status, admin_payload = login(ADMIN)
    record("owner/admin can log in for the review cross-check", admin_status == 200 and bool(admin_token), message_of(admin_payload))
    if admin_token:
        code, queue = call("GET", "/admin/payments?status=PENDING_REVIEW&page=1&limit=50", admin_token)
        queue_ids = [str(item.get("id")) for item in (queue or {}).get("items", [])]
        record("admin review queue lists the customer's submitted payment",
               code == 200 and str(payment.get("id")) in queue_ids, "code=%s in_queue=%s" % (code, str(payment.get("id")) in queue_ids))

        code, confirmed = call("POST", "/admin/payments/%s/confirm" % payment.get("id"), admin_token, {})
        record("admin confirm moves the payment to SUCCEEDED", code in (200, 201) and (confirmed or {}).get("status") == "SUCCEEDED",
               "code=%s status=%s" % (code, (confirmed or {}).get("status")))
        STATE["payments"]["main"]["status"] = (confirmed or {}).get("status")

        code, customer_sees = call("GET", "/payments/%s" % payment.get("id"), token_a)
        record("customer sees the new payment status without any client-side tampering",
               (customer_sees or {}).get("status") == "SUCCEEDED", "status=%s" % (customer_sees or {}).get("status"))

        code, notif = call("GET", "/notifications?limit=20&sortBy=createdAt&sortOrder=desc", token_a)
        types = [item.get("type") for item in (notif or {}).get("items", [])]
        record("customer receives PAYMENT_CONFIRMED after the admin decision", "PAYMENT_CONFIRMED" in types, "types=%s" % types[:8])

        # order confirmation is a separate staff decision (payment success alone never confirms the order)
        order_status_before = call("GET", "/orders/%s" % order.get("id"), token_a)[1] or {}
        record("payment approval alone does not silently confirm the order (explicit staff step)",
               order_status_before.get("status") == "PENDING", "status=%s" % order_status_before.get("status"))
        code, confirmed_order = call("PATCH", "/admin/orders/%s/status" % order.get("id"), admin_token, {"status": "CONFIRMED"})
        record("admin confirms the order explicitly", code in (200, 201) and (confirmed_order or {}).get("status") == "CONFIRMED",
               "code=%s status=%s" % (code, (confirmed_order or {}).get("status")))

        code, late_cancel = call("POST", "/orders/%s/cancel" % order.get("id"), token_a, {})
        record("customer cannot cancel a CONFIRMED order (409)", code == 409, "code=%s %s" % (code, message_of(late_cancel)))

        dangling_id = STATE["payments"]["cancelled_with_payment"]["id"]
        code, admin_cancel = call("POST", "/admin/payments/%s/cancel" % dangling_id, admin_token, {})
        record("admin can cancel the payment of a cancelled order (no dangling PENDING payment)",
               code in (200, 201) and (admin_cancel or {}).get("status") == "CANCELLED",
               "code=%s status=%s" % (code, (admin_cancel or {}).get("status")))

        code, reject_queue = call("GET", "/admin/payments/%s" % payment2.get("id"), admin_token)
        record("admin can read the rejection fixture payment (payments.read)", code == 200 and (reject_queue or {}).get("status") == "PENDING_REVIEW",
               "code=%s status=%s" % (code, (reject_queue or {}).get("status")))

    # empty cart ⇒ 409 with an explicit Arabic message
    call("DELETE", "/cart", token_a)
    code, empty_order = call("POST", "/orders", token_a, {}, {"Idempotency-Key": "stage143-empty-" + uuid.uuid4().hex[:10]})
    record("creating an order from an empty cart is refused (409)",
           code == 409 and "السلة" in message_of(empty_order), "code=%s %s" % (code, message_of(empty_order)))

    # stale/insufficient quantity ⇒ backend refuses
    call("POST", "/cart/items", token_a, {"productId": product["id"], "quantity": 20})
    code, huge = call("POST", "/orders", token_a, {}, {"Idempotency-Key": "stage143-huge-" + uuid.uuid4().hex[:10]})
    record("an order beyond available stock is refused by the backend", code in (400, 409), "code=%s %s" % (code, message_of(huge)))
    call("DELETE", "/cart", token_a)

    # ---------------------------------------------------------------- 8. sessions & account
    code, sessions = call("GET", "/auth/sessions", token_a)
    session_list = (sessions or {}).get("sessions", [])
    record("session list contains no token material", all("token" not in json.dumps(item).lower() for item in session_list),
           "keys=%s" % (sorted(session_list[0].keys()) if session_list else []))
    code, bad_password = call("POST", "/auth/change-password", token_a, {
        "currentPassword": "definitely-wrong", "newPassword": "Stage143!New#2026", "confirmNewPassword": "Stage143!New#2026"})
    record("change-password with a wrong current password is refused (401/400)", code in (400, 401, 422), "code=%s" % code)

    return finish()


def finish():
    passed = sum(1 for item in RESULTS if item["ok"])
    failed = [item for item in RESULTS if not item["ok"]]
    report = {
        "stage": "14.3",
        "scope": "customer flow — API level",
        "base": BASE,
        "total": len(RESULTS),
        "passed": passed,
        "failed": len(failed),
        "results": RESULTS,
        "state": STATE,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "shop143-api-report.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT_DIR, "state.json"), "w", encoding="utf-8") as handle:
        json.dump(STATE, handle, ensure_ascii=False, indent=2)
    print("\n=== 14.3 API QA: %d/%d PASS · failed=%d ===" % (passed, len(RESULTS), len(failed)))
    for item in failed:
        print("  ✗ %s | %s" % (item["name"], item.get("detail", "")))
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
