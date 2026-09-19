#!/usr/bin/env python3
"""
Stage 14.4 — إثبات انعكاس حالة الدفع على العميل في بيئة نظيفة (بعد إعادة تشغيل الـAPI، بلا حدود معدّل).

يأخذ آخر دفعة SUCCEEDED وآخر دفعة FAILED لحساب الاختبار، ويفتح صفحة الدفع لكل منهما في المتجر،
ويتحقق أن الحالة المعروضة مطابقة للـBackend حرفياً. لا يكتب أي حالة.
يكتب stage144-status-reflection.json
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

SHOP = "https://panel.fahd-car.cloud/alwled/shop/"
API = "https://panel.fahd-car.cloud/alwled-api/api/v1"
PHONE = "0955900100"
PASSWORD = "Stage142!QAcust9"
OUT = Path("/root/alwled/frontend/tools/qa/stage14-final")
SHOTS = OUT / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
results: list[dict] = []


def record(name, ok, got=None, detail=""):
    entry = {"step": name, "status": "PASS" if ok else "FAIL"}
    if got is not None:
        entry["got"] = str(got)[:300]
    if detail:
        entry["detail"] = str(detail)[:400]
    results.append(entry)
    print(("✓ " if ok else "✗ ") + name + (("  [%s]" % str(got)[:120]) if not ok and got is not None else ""))
    return ok


def api(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method)
    request.add_header("Accept", "application/json")
    if data:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode() or "{}")
            return response.status, (payload.get("data") if isinstance(payload, dict) and "data" in payload else payload)
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read().decode() or "{}")
        except json.JSONDecodeError:
            return error.code, {}


def main() -> int:
    status, payload = api("POST", "/auth/login", body={"phone": PHONE, "password": PASSWORD})
    token = (payload or {}).get("accessToken")
    if not token:
        print("login failed", status)
        return 1
    status, payments = api("GET", "/payments?page=1&limit=50&sortBy=createdAt&sortOrder=desc", token)
    items = (payments or {}).get("items", [])
    succeeded = next((p for p in items if p.get("status") == "SUCCEEDED"), None)
    failed = next((p for p in items if p.get("status") == "FAILED" and p.get("rejectionReason")), None)
    record("backend has a SUCCEEDED payment to reflect", bool(succeeded), (succeeded or {}).get("status"))
    record("backend has a FAILED payment with a stored reason", bool(failed), (failed or {}).get("rejectionReason"))

    expectations = [
        ("SUCCEEDED", succeeded, ["ناجحة", "تم تأكيد الدفع"], "10-status-succeeded"),
        ("FAILED", failed, ["مرفوضة", "سبب الرفض"], "11-status-failed"),
    ]
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = browser.new_context(locale="ar", viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:140]))
        page.goto(SHOP + "#/login", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.fill("#shop-login-phone", PHONE)
        page.fill("#shop-login-password", PASSWORD)
        page.click('.shop-auth button[type="submit"]')
        page.wait_for_timeout(3500)

        for label, payment, markers, shot_name in expectations:
            if not payment:
                continue
            order_id = payment.get("orderId")
            page.goto(SHOP + "#/orders/%s/payment" % order_id, wait_until="networkidle")
            page.reload(wait_until="networkidle")
            try:
                page.wait_for_function(
                    "() => { const v = document.getElementById('shop-view'); return !!v && (%s); }" % " || ".join(
                        "v.innerText.includes(%s)" % json.dumps(m) for m in markers),
                    timeout=15000)
            except Exception:
                pass
            text = page.inner_text("#shop-view")
            rendered = any(marker in text for marker in markers)
            page.screenshot(path=str(SHOTS / (shot_name + ".png")), full_page=True)
            backend_amount = payment.get("amount")
            record("store reflects the backend %s payment state (order %s)" % (label, order_id),
                   rendered and str(backend_amount) in text,
                   "rendered=%s amount_shown=%s" % (rendered, str(backend_amount) in text),
                   detail=text[:200].replace("\n", " | "))
            if label == "FAILED":
                record("store shows the staff rejection reason to the customer",
                       bool(payment.get("rejectionReason")) and str(payment.get("rejectionReason"))[:20] in text,
                       "reason_shown=%s" % (str(payment.get("rejectionReason"))[:20] in text))
                record("no fake success/retry control on a rejected payment",
                       page.locator("#shop-submit-payment").count() == 0)
        # 401 أثناء الإقلاع/التجديد الشفّاف سلوك موثّق للعميل المركزي (استعلام ثم تجديد ثم إعادة محاولة)
        expected = [e for e in errors if '401 (Unauthorized)' in e]
        meaningful = [e for e in errors if e not in expected and 'favicon' not in e]
        record("no unexpected console errors during the status reflection checks", not meaningful, json.dumps(meaningful[:3], ensure_ascii=False))
        browser.close()

    passed = sum(1 for item in results if item["status"] == "PASS")
    failed_items = [item for item in results if item["status"] == "FAIL"]
    report = {"stage": "14.4", "scope": "customer-visible payment status reflection (clean environment)",
              "total": len(results), "passed": passed, "failed": len(failed_items), "results": results}
    (OUT / "stage144-status-reflection.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== 14.4 status reflection: %d/%d PASS ===" % (passed, len(results)))
    return 0 if not failed_items else 1


if __name__ == "__main__":
    raise SystemExit(main())
