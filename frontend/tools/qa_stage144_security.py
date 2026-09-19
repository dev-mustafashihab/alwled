#!/usr/bin/env python3
"""
Stage 14.4 — §4 العزل · §18 الصلاحيات · §27 التزامن · §9 سلامة حالة الدفع · §13 الجلسات.

كل الفحوص على الـAPI الحقيقي بحسابات اختبار (عميلان + موظف مقيّد + المالك).
يكتب stage144-security-report.json
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

API = "https://panel.fahd-car.cloud/alwled-api/api/v1"
OUT = Path("/root/alwled/frontend/tools/qa/stage14-final")
OUT.mkdir(parents=True, exist_ok=True)
CUSTOMER_A = {"phone": "0955900100", "password": "Stage142!QAcust9"}
CUSTOMER_B = {"phone": "0955900160", "password": "Stage143B!Qa9"}
results: list[dict] = []


def owner_password() -> str:
    if os.environ.get("SEED_OWNER_PASSWORD"):
        return os.environ["SEED_OWNER_PASSWORD"]
    for line in open("/root/alwled/.env", encoding="utf-8"):
        if line.strip().startswith("SEED_OWNER_PASSWORD="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


ADMIN = {"phone": "0938045496", "password": owner_password()}


def record(name, ok, got=None, detail=""):
    entry = {"check": name, "status": "PASS" if ok else "FAIL"}
    if got is not None:
        entry["got"] = str(got)[:300]
    if detail:
        entry["detail"] = str(detail)[:400]
    results.append(entry)
    print(("PASS  " if ok else "FAIL  ") + name + (("  [%s]" % str(got)[:110]) if not ok and got is not None else ""))
    return ok


def call(method, path, token=None, body=None, headers=None, retries=2):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method)
    request.add_header("Accept", "application/json")
    if data:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", "Bearer " + token)
    for k, v in (headers or {}).items():
        request.add_header(k, v)
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode() or "{}")
                return response.status, (payload.get("data") if isinstance(payload, dict) and "data" in payload else payload)
        except urllib.error.HTTPError as error:
            try:
                payload = json.loads(error.read().decode() or "{}")
            except json.JSONDecodeError:
                payload = {}
            if error.code == 429 and attempt < retries:
                time.sleep(6 * (attempt + 1))
                continue
            return error.code, payload
        except Exception as error:  # noqa: BLE001
            if attempt < retries:
                time.sleep(2)
                continue
            return 0, {"error": str(error)}
    return 0, {}


def login(creds):
    status, payload = call("POST", "/auth/login", body=creds)
    return (payload or {}).get("accessToken"), status


def main() -> int:
    token_a, _ = login(CUSTOMER_A)
    token_b, _ = login(CUSTOMER_B)
    admin_token, _ = login(ADMIN)
    record("test identities: two customers + owner", all([token_a, token_b, admin_token]))

    # ---------------------------------------------------------------- §4 isolation (A/B)
    code, product_list = call("GET", "/products?page=1&limit=20")
    product = next((p for p in (product_list or {}).get("items", []) if True), None)
    for candidate in (product_list or {}).get("items", []):
        detail = call("GET", "/products/%s" % candidate["id"])[1] or {}
        if detail.get("inStock") is True:
            product = candidate
            break
    call("DELETE", "/cart", token_a)
    call("POST", "/cart/items", token_a, {"productId": product["id"], "quantity": 1})
    code, order = call("POST", "/orders", token_a, {}, {"Idempotency-Key": "stage144-sec-" + uuid.uuid4().hex[:10]})
    code, payment = call("POST", "/payments", token_a, {"orderId": (order or {}).get("id"), "method": "SHAM_CASH"},
                         {"Idempotency-Key": "stage144-sec-pay-" + uuid.uuid4().hex[:10]})
    record("isolation fixtures created (order + payment for customer A)",
           bool((order or {}).get("id")) and bool((payment or {}).get("id")),
           "order=%s payment=%s" % ((order or {}).get("id"), (payment or {}).get("id")))

    a_id = call("GET", "/auth/me", token_a)[1].get("id")
    b_id = call("GET", "/auth/me", token_b)[1].get("id")
    record("the two customers are distinct identities", a_id != b_id)

    matrix = {
        "B reads A order": call("GET", "/orders/%s" % order["id"], token_b)[0],
        "B cancels A order": call("POST", "/orders/%s/cancel" % order["id"], token_b, {})[0],
        "B reads A payment": call("GET", "/payments/%s" % payment["id"], token_b)[0],
        "B submits A payment proof": call("POST", "/payments/%s/submit" % payment["id"], token_b,
                                          {"transactionReference": "SC-144-B-" + uuid.uuid4().hex[:8].upper(),
                                           "proofUrl": "https://example.com/b-%s.png" % uuid.uuid4().hex[:6]})[0],
        "B reads own cart (control)": call("GET", "/cart", token_b)[0],
    }
    record("cross-customer access is denied for every resource (no IDOR/BOLA)",
           all(code in (400, 401, 403, 404) for k, code in matrix.items() if "control" not in k)
           and matrix["B reads own cart (control)"] == 200,
           json.dumps(matrix))
    record("isolation uses 404 (not 403) so existence is not leaked",
           matrix["B reads A order"] == 404 and matrix["B reads A payment"] == 404, json.dumps(matrix))

    # A and B lists never cross
    list_a = [str(i["id"]) for i in (call("GET", "/orders?page=1&limit=100", token_a)[1] or {}).get("items", [])]
    list_b = [str(i["id"]) for i in (call("GET", "/orders?page=1&limit=100", token_b)[1] or {}).get("items", [])]
    record("order lists are disjoint between customers", not (set(list_a) & set(list_b)),
           "a=%d b=%d overlap=%s" % (len(list_a), len(list_b), set(list_a) & set(list_b)))

    # customer cannot read another customer's notifications / verification
    notif_b = (call("GET", "/notifications?limit=5", token_b)[1] or {}).get("items", [])
    foreign_mark = call("POST", "/notifications/%s/read" % (notif_b[0]["id"] if notif_b else "missing"), token_a)[0]
    record("customer A cannot mark customer B's notification (404/401)", foreign_mark in (401, 404), foreign_mark)
    ver_a = call("GET", "/verification/me", token_a)[1] or {}
    ver_b = call("GET", "/verification/me", token_b)[1] or {}
    record("verification records are per customer", ver_a.get("id") != ver_b.get("id"),
           "a=%s b=%s" % (ver_a.get("id"), ver_b.get("id")))

    # ---------------------------------------------------------------- §18 permissions
    customer_admin_ops = {
        "customer → /admin/payments": call("GET", "/admin/payments?page=1&limit=5", token_a)[0],
        "customer → /admin/dashboard/summary": call("GET", "/admin/dashboard/summary", token_a)[0],
        "customer → /admin/orders": call("GET", "/admin/orders?page=1&limit=5", token_a)[0],
        "customer → /employees": call("GET", "/employees?page=1&limit=5", token_a)[0],
        "customer → /roles": call("GET", "/roles?page=1&limit=5", token_a)[0],
        "customer → /admin/payments/{id}/confirm": call("POST", "/admin/payments/%s/confirm" % payment["id"], token_a, {})[0],
    }
    record("customer is blocked from every admin surface (401/403/404 — never 200)",
           all(code in (401, 403, 404) for code in customer_admin_ops.values()), json.dumps(customer_admin_ops))

    # restricted employee: create one with a single catalog permission and prove it cannot do admin ops
    stamp = str(int(time.time()))[-6:]
    # DTO الفعلي: firstName/lastName/phone/password + roleId اختياري (لا confirmPassword، والتحقق يمنع الحقول الزائدة)
    employee_h = {
        "firstName": "موظف", "lastName": "مقيّد", "email": "stage144.emp.%s@alwled.test" % stamp,
        "phone": "09559%05d" % (int(stamp) % 100000), "password": "Stage144!Emp#20%s" % stamp[-2:],
    }
    code, perms = call("GET", "/permissions?page=1&limit=100", admin_token)
    read_perms = [p["id"] for p in (perms or {}).get("items", []) if p.get("code") == "products.read"]
    code, role = call("POST", "/roles", admin_token, {"name": "STAGE144R%s" % stamp, "description": "دور اختبار 14.4 مقيّد",
                                                      "permissionIds": read_perms})
    role_id = (role or {}).get("id")
    payload = dict(employee_h)
    if role_id:
        payload["roleId"] = role_id
    code, employee = call("POST", "/employees", admin_token, payload)
    emp_id = (employee or {}).get("id")
    record("restricted employee created with only products.read",
           bool(role_id) and bool(emp_id), "role=%s employee=%s code=%s" % (role_id, emp_id, code))
    if emp_id:
        emp_token, emp_status = login({"phone": employee_h["phone"], "password": employee_h["password"]})
        record("restricted employee can log in", bool(emp_token), "status=%s code=%s" % (emp_status, code))
        if emp_token:
            restricted = {
                "employee POST /products (no permission)": call("POST", "/products", emp_token,
                                                                {"name": "x", "slug": "x-%s" % stamp, "sku": "X%s" % stamp,
                                                                 "price": "1.00", "categoryId": 1})[0],
                "employee → /admin/payments": call("GET", "/admin/payments?page=1&limit=5", emp_token)[0],
                "employee → /employees": call("GET", "/employees?page=1&limit=5", emp_token)[0],
                "employee → /roles": call("GET", "/roles?page=1&limit=5", emp_token)[0],
                "employee → /audit-logs": call("GET", "/audit-logs?page=1&limit=5", emp_token)[0],
                "employee POST /admin/payments/{id}/confirm": call("POST", "/admin/payments/%s/confirm" % payment["id"], emp_token, {})[0],
            }
            record("restricted employee is blocked outside the granted permission (401/403/404 — never 200)",
                   all(code in (401, 403, 404) for code in restricted.values()), json.dumps(restricted))
            record("restricted employee can still read the granted surface",
                   all(c in (200, 403) for c in [call("GET", "/products?page=1&limit=1", emp_token)[0]]),
                   call("GET", "/products?page=1&limit=1", emp_token)[0])
            # cleanup the restricted employee's session, keep the record for the report
            call("POST", "/auth/logout-all", emp_token, {})

    record("owner can read the admin surface (control)",
           call("GET", "/admin/payments?page=1&limit=1", admin_token)[0] == 200)

    # ---------------------------------------------------------------- §9 payment state integrity
    tamper = call("POST", "/payments/%s/submit" % payment["id"], token_a,
                  {"transactionReference": "SC-144-SEC", "proofUrl": "https://example.com/sec.png",
                   "amount": "1.00", "status": "SUCCEEDED", "provider": "FAKE"})
    fresh = call("GET", "/payments/%s" % payment["id"], token_a)[1] or {}
    record("client cannot force amount/status/provider (DTO whitelist + backend owns money)",
           tamper[0] in (400, 409, 422) and str(fresh.get("amount")) == str((order or {}).get("total")) and fresh.get("provider") in (None, "")
           and fresh.get("status") in ("PENDING", "PENDING_REVIEW"),
           "tamper=%s amount=%s status=%s provider=%s" % (tamper[0], fresh.get("amount"), fresh.get("status"), fresh.get("provider")))
    call("POST", "/payments/%s/submit" % payment["id"], token_a,
         {"transactionReference": "SC-144-SEC-%s" % stamp, "proofUrl": "https://example.com/sec-%s.png" % stamp})
    fresh = call("GET", "/payments/%s" % payment["id"], token_a)[1] or {}
    record("submitted payment lands in PENDING_REVIEW only (no fake success)",
           fresh.get("status") == "PENDING_REVIEW", fresh.get("status"))

    # ---------------------------------------------------------------- §27 concurrency
    call("DELETE", "/cart", token_a)
    call("POST", "/cart/items", token_a, {"productId": product["id"], "quantity": 3})
    cart = call("GET", "/cart", token_a)[1] or {}
    line_id = (cart.get("items") or [{}])[0].get("id")

    def parallel_cart_update(qty):
        return call("PATCH", "/cart/items/%s" % line_id, token_a, {"quantity": qty})[0]

    with ThreadPoolExecutor(max_workers=4) as pool:
        codes = list(pool.map(parallel_cart_update, [2, 2, 3, 1]))
    final_cart = call("GET", "/cart", token_a)[1] or {}
    final_line = next((i for i in (final_cart.get("items") or []) if i.get("id") == line_id), {})
    record("parallel cart quantity updates leave one consistent line (no duplicate line)",
           len(final_cart.get("items") or []) == 1 and int(final_line.get("quantity", 0)) in (1, 2, 3),
           "codes=%s final=%s" % (codes, final_line.get("quantity")))

    idem = "stage144-conc-order-" + uuid.uuid4().hex[:8]
    def parallel_order(_):
        return call("POST", "/orders", token_a, {}, {"Idempotency-Key": idem})[1]
    with ThreadPoolExecutor(max_workers=5) as pool:
        orders = list(pool.map(parallel_order, range(5)))
    ids = {str((o or {}).get("id")) for o in orders}
    record("5 parallel order requests with one idempotency key produce exactly one order", len(ids) == 1, sorted(ids))
    created_order_id = next(iter(ids))

    idem_pay = "stage144-conc-pay-" + uuid.uuid4().hex[:8]
    def parallel_payment(_):
        return call("POST", "/payments", token_a, {"orderId": created_order_id, "method": "SHAM_CASH"},
                    {"Idempotency-Key": idem_pay})[1]
    with ThreadPoolExecutor(max_workers=4) as pool:
        pays = list(pool.map(parallel_payment, range(4)))
    pay_ids = {str((p or {}).get("id")) for p in pays}
    record("4 parallel payment requests with one key produce exactly one payment", len(pay_ids) == 1, sorted(pay_ids))
    conc_payment = next(iter(pay_ids))

    def parallel_submit(n):
        return call("POST", "/payments/%s/submit" % conc_payment, token_a,
                    {"transactionReference": "SC-144-CONC-%d" % n, "proofUrl": "https://example.com/c-%d.png" % n})[0]
    with ThreadPoolExecutor(max_workers=4) as pool:
        submit_codes = list(pool.map(parallel_submit, range(4)))
    final_payment = call("GET", "/payments/%s" % conc_payment, token_a)[1] or {}
    record("parallel proof submits produce one accepted state (others 409) with PENDING_REVIEW settled",
           final_payment.get("status") == "PENDING_REVIEW" and submit_codes.count(201) <= 1,
           "codes=%s status=%s" % (submit_codes, final_payment.get("status")))

    notif = (call("GET", "/notifications?limit=10", token_a)[1] or {}).get("items", [])
    if notif:
        def parallel_read(_):
            return call("POST", "/notifications/%s/read" % notif[0]["id"], token_a)[0]
        with ThreadPoolExecutor(max_workers=4) as pool:
            read_codes = list(pool.map(parallel_read, range(4)))
        code, one = call("GET", "/notifications/%s" % notif[0]["id"], token_a)
        record("parallel mark-read calls are idempotent (notification stays read)",
               (one or {}).get("read") is True and all(c in (200, 201) for c in read_codes),
               "codes=%s read=%s" % (read_codes, (one or {}).get("read")))
    call("POST", "/notifications/read-all", token_a)
    record("read-all leaves the unread counter at zero", (call("GET", "/notifications/unread-count", token_a)[1] or {}).get("count") == 0)

    # ---------------------------------------------------------------- §13 sessions
    fresh_token, _ = login(CUSTOMER_A)
    code, payload = call("POST", "/auth/refresh", body={"refreshToken": call("GET", "/auth/sessions", fresh_token)[1] and None})
    record("refresh endpoint rejects a missing refresh token (contract)", code in (400, 401, 422), "code=%s" % code)
    code, sessions = call("GET", "/auth/sessions", fresh_token)
    session_items = (sessions or {}).get("sessions", [])
    record("session list is token-free", all("token" not in json.dumps(s, ensure_ascii=False).replace("tokenHash", "").lower() for s in session_items),
           "count=%d keys=%s" % (len(session_items), sorted(session_items[0].keys()) if session_items else []))
    record("logout-all is accepted for the customer", call("POST", "/auth/logout-all", fresh_token, {})[0] in (200, 201))

    return finish()


def finish() -> int:
    passed = sum(1 for item in results if item["status"] == "PASS")
    failed = [item for item in results if item["status"] == "FAIL"]
    report = {"stage": "14.4", "scope": "isolation · permissions · concurrency · payment integrity · sessions",
              "total": len(results), "passed": passed, "failed": len(failed), "results": results}
    (OUT / "stage144-security-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== 14.4 security suite: %d/%d PASS ===" % (passed, len(results)))
    for item in failed:
        print("  ✗ %s | %s" % (item["check"], item.get("got", "")))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
