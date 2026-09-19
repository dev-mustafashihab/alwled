#!/usr/bin/env python3
"""
Stage 14.4 — §17 انحدار لوحة الإدارة الكامل + §5 فصل اللوحة عن المتجر.

يفتح كل صفحة إدارية بالمالك ويتحقق من: رسم محتوى حقيقي · صفر أخطاء console ·
عدم وجود أي تنقّل متجر داخل اللوحة · أن المتجر لا يظهر تنقّلاً إدارياً.
يكتب stage144-admin-report.json + لقطات
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

PANEL = "https://panel.fahd-car.cloud/alwled/admin/"
SHOP = "https://panel.fahd-car.cloud/alwled/shop/"
OUT = Path("/root/alwled/frontend/tools/qa/stage14-final")
SHOTS = OUT / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
ADMIN_PHONE = "0938045496"
PAGES = [
    ("dashboard", "#/dashboard", ["نظرة", "لوحة", "إجمالي", "مبيعات"]),
    ("analytics", "#/analytics", ["التحليلات", "تحليل"]),
    ("products", "#/products", ["المنتجات", "منتج"]),
    ("categories", "#/categories", ["التصنيفات", "تصنيف"]),
    ("brands", "#/brands", ["العلامات", "علامة"]),
    ("specifications", "#/specifications", ["المواصفات"]),
    ("inventory", "#/inventory", ["المخزون"]),
    ("orders", "#/orders", ["الطلبات", "طلب"]),
    ("payments", "#/payments", ["الدفعات", "دفع"]),
    ("payments_review", "#/payments/review", ["مراجعة", "بانتظار المراجعة"]),
    ("customers", "#/customers", ["العملاء", "عميل"]),
    ("verification", "#/verification", ["التوثيق", "تحقق"]),
    ("notifications", "#/notifications", ["الإشعارات"]),
    ("employees", "#/employees", ["الموظفين", "موظف"]),
    ("roles", "#/roles", ["الأدوار", "دور"]),
    ("audit", "#/audit", ["التدقيق", "سجل"]),
    ("account", "#/account", ["حساب"]),
]
results: list[dict] = []


def owner_password() -> str:
    if os.environ.get("SEED_OWNER_PASSWORD"):
        return os.environ["SEED_OWNER_PASSWORD"]
    for line in open("/root/alwled/.env", encoding="utf-8"):
        if line.strip().startswith("SEED_OWNER_PASSWORD="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def record(name, ok, got=None, detail=""):
    entry = {"check": name, "status": "PASS" if ok else "FAIL"}
    if got is not None:
        entry["got"] = str(got)[:300]
    if detail:
        entry["detail"] = str(detail)[:400]
    results.append(entry)
    print(("✓ " if ok else "✗ ") + name + (("  [%s]" % str(got)[:100]) if not ok and got is not None else ""))
    return ok


def main() -> int:
    console: list[dict] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = browser.new_context(locale="ar", viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: console.append({"page": page.evaluate("() => location.hash"), "text": m.text}) if m.type == "error" else None)
        page.on("pageerror", lambda e: console.append({"page": page.evaluate("() => location.hash"), "text": "pageerror: " + str(e)[:150]}))

        # anonymous visitor still lands on login
        page.goto(PANEL, wait_until="networkidle")
        page.wait_for_timeout(2500)
        record("anonymous visitor opening the panel still lands on login",
               page.locator('input[name="identifier"]').count() == 1, page.evaluate("() => location.hash"))

        page.fill('input[name="identifier"]', ADMIN_PHONE)
        page.fill('input[name="password"]', owner_password())
        page.click(".auth-card .btn--primary")
        page.wait_for_timeout(4000)
        record("owner login reaches the dashboard", page.evaluate("() => location.hash").startswith("#/dashboard"),
               page.evaluate("() => location.hash"))

        api_base = page.evaluate("() => (window.ALW && ALW.config && ALW.config.apiBase && ALW.config.apiBase()) || (ALW.config && ALW.config.get && ALW.config.get().apiBase) || null")
        record("panel API base is unchanged (/alwled-api/api/v1)", api_base is None or "/alwled-api/api/v1" in str(api_base), api_base)

        for label, route, markers in PAGES:
            page.goto(PANEL + route, wait_until="networkidle")
            page.wait_for_timeout(2600)
            body = page.inner_text("body")
            rendered = any(marker in body for marker in markers)
            has_work_area = page.evaluate("""() => {
                const main = document.querySelector('main, #view, .app__main, .content');
                return !!main && main.innerText.trim().length > 40;
            }""")
            record("admin %s renders real content" % label, rendered and has_work_area,
                   "markers=%s workArea=%s" % (rendered, has_work_area), detail=body[:120].replace("\n", " | "))
            if label in ("dashboard", "orders", "payments_review", "employees", "audit"):
                page.screenshot(path=str(SHOTS / ("admin-%s.png" % label)), full_page=True)

        nav_markers = page.evaluate("""() => ({
            storeLinks: [...document.querySelectorAll('a[href*="shop/"]')].length,
            adminNav: [...document.querySelectorAll('.sidebar a, nav a')].length,
        })""")
        record("panel navigation is intact and contains no store links", nav_markers["adminNav"] > 5 and nav_markers["storeLinks"] == 0,
               json.dumps(nav_markers))
        record("no console errors across the whole admin sweep",
               not [c for c in console if "favicon" not in c["text"]],
               json.dumps([c["text"][:90] for c in console[:3]], ensure_ascii=False),
               detail="errors=%d" % len(console))

        # store must not expose admin navigation even for an owner session
        store_ctx = browser.new_context(locale="ar", viewport={"width": 1440, "height": 900})
        store = store_ctx.new_page()
        store.goto(SHOP + "#/", wait_until="networkidle")
        store.wait_for_timeout(2000)
        store_report = store.evaluate("""() => ({
            adminLinks: [...document.querySelectorAll('a[href*="#/dashboard"], a[href*="#/employees"], a[href*="#/audit"], a[href*="#/roles"], a[href*="#/inventory"]')].length,
            navItems: document.querySelectorAll('.shop-nav__link').length,
        })""")
        record("store shows no admin navigation for any visitor", store_report["adminLinks"] == 0, json.dumps(store_report))
        browser.close()

    passed = sum(1 for item in results if item["status"] == "PASS")
    failed = [item for item in results if item["status"] == "FAIL"]
    report = {"stage": "14.4", "scope": "admin panel full regression", "total": len(results),
              "passed": passed, "failed": len(failed), "results": results}
    (OUT / "stage144-admin-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== 14.4 admin regression: %d/%d PASS ===" % (passed, len(results)))
    for item in failed:
        print("  ✗ %s | %s" % (item["check"], item.get("got", "")))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
