#!/usr/bin/env python3
"""
Stage 14.4 — §29 جرد بيانات QA الخاصة بـStage 14 (قراءة فقط، بلا حذف).

يحدّد بدقّة كل ما أنشأته اختبارات Stage 14 (14.1/14.2/14.3/14.4) عبر مُعرّفات حتمية:
أرقام هواتف حسابات الاختبار · مفاتيح idempotency بأسماء stage14* · مراجع حوالة SC-143/SC-144 ·
أدوار/موظفو اختبار · إشعارات وطلبات ودفعات تخصّ هؤلاء الحسابات.

ويُنتج: before (عدد السجلات لكل فئة) + قائمة الحذف المقترح (صلب حتمي، غير منفّذ) + المحفوظ صراحةً.
يكتب stage144-cleanup-inventory.json
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path("/root/alwled")
OUT = ROOT / "frontend" / "tools" / "qa" / "stage14-final"
OUT.mkdir(parents=True, exist_ok=True)
ENV = dict(line.split("=", 1) for line in (ROOT / ".env").read_text().splitlines()
           if line and not line.startswith("#") and "=" in line)
URL = ENV["DATABASE_URL"].split("?")[0]

QA_PHONES = ["0955900100", "0955900160", "0955900199"]
QA_EMAIL_LIKE = ["stage143.%", "stage144.%", "stage142.%", "stage14.%"]
QA_ROLE_LIKE = ["STAGE14%", "STAGE143%", "STAGE144%", "SMOKE_%"]
QA_REF_LIKE = ["SC-143-%", "SC-144-%"]
QA_IDEM_LIKE = ["stage143-%", "stage144-%", "stage14-%"]


def sql(query: str) -> str:
    result = subprocess.run(["psql", URL, "-tAc", query], capture_output=True, text=True)
    if result.returncode != 0:
        return "ERROR: " + result.stderr.strip().splitlines()[0][:110]
    return result.stdout.strip()


def scalar(query: str) -> str:
    return sql(query)


def main() -> int:
    inventory: dict = {}

    # ---- identities
    inventory["qa_customers"] = sql(
        "select count(*) from users where phone in (%s)" % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_customers_detail"] = sql(
        "select string_agg(phone || '=' || status, ', ') from users where phone in (%s)" % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_emails"] = sql(
        "select count(*) from users where %s" % " or ".join("email like '%s'" % e for e in QA_EMAIL_LIKE))
    inventory["qa_employees"] = sql("select count(*) from employees e join users u on u.id = e.user_id where u.phone like '09559%'")
    inventory["qa_roles"] = sql(
        "select count(*) from roles where %s" % " or ".join("name like '%s'" % r for r in QA_ROLE_LIKE))
    inventory["qa_role_names"] = sql(
        "select string_agg(name, ', ') from roles where %s" % " or ".join("name like '%s'" % r for r in QA_ROLE_LIKE))

    # ---- transactional data created by the QA runs
    inventory["qa_orders"] = sql(
        """select count(*) from orders o join users u on u.id = o.user_id where u.phone in (%s)"""
        % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_orders_by_status"] = sql(
        """select string_agg(s || ':' || c, ', ') from (select o.status::text s, count(*) c from orders o
           join users u on u.id = o.user_id where u.phone in (%s) group by 1 order by 1) t"""
        % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_payments"] = sql(
        """select count(*) from payments p join users u on u.id = p.user_id where u.phone in (%s)"""
        % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_payment_refs"] = sql(
        "select count(*) from payments where %s" % " or ".join("transaction_reference like '%s'" % r for r in QA_REF_LIKE))
    inventory["qa_idempotency_keys"] = sql(
        "select count(*) from idempotency_keys where %s" % " or ".join("key like '%s'" % k for k in QA_IDEM_LIKE))
    inventory["qa_notifications"] = sql(
        """select count(*) from notifications n join users u on u.id = n.user_id where u.phone in (%s)"""
        % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_verifications"] = sql(
        """select count(*) from customer_verifications v join users u on u.id = v.user_id where u.phone in (%s)"""
        % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_carts"] = sql(
        """select count(*) from carts c join users u on u.id = c.user_id where u.phone in (%s)"""
        % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_refresh_tokens"] = sql(
        """select count(*) from refresh_tokens t join users u on u.id = t.user_id where u.phone in (%s)"""
        % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_audit_entries"] = sql(
        """select count(*) from audit_logs a join users u on u.id = a.actor_id where u.phone in (%s)"""
        % ", ".join("'%s'" % p for p in QA_PHONES))
    inventory["qa_inventory_movements"] = sql(
        "select count(*) from inventory_movements where reason ilike '%STOCK_RECEIVED%' and reason ilike '%14.3%'")

    # ---- what must be preserved (never touched by a cleanup)
    preserved = {
        "owner_account": scalar("select count(*) from users where phone = '0938045496'"),
        "system_roles": scalar("select count(*) from roles where is_system = true"),
        "permissions": scalar("select count(*) from permissions"),
        "demo_products": scalar("select count(*) from products where sku like 'DEMO-%'"),
        "catalog_seed_categories": scalar("select count(*) from categories"),
        "catalog_seed_brands": scalar("select count(*) from brands"),
        "specification_definitions": scalar("select count(*) from specification_definitions"),
        "inventory_rows": scalar("select count(*) from inventory"),
        "demo_account_0966112233": scalar("select count(*) from users where phone = '0966112233'"),
    }

    # ---- totals for the before/after frame
    totals = {t: scalar("select count(*) from %s" % t) for t in
              ["users", "roles", "orders", "payments", "notifications", "customer_verifications",
               "idempotency_keys", "refresh_tokens", "audit_logs", "carts", "cart_items", "inventory_movements"]}

    # ---- proposed (NOT executed) deterministic cleanup order
    proposal = [
        "-- مقترح تنظيف حتمي (غير منفَّذ في Stage 14.4). يُنفَّذ داخل transaction ويُتحقق قبل/بعد.",
        "-- 1) مراجع الحوالة الخاصة بالاختبارات:",
        "DELETE FROM notifications WHERE aggregate_id IN (SELECT id::text FROM payments WHERE %s);" % " OR ".join("transaction_reference LIKE '%s'" % r for r in QA_REF_LIKE),
        "DELETE FROM payments WHERE %s;" % " OR ".join("transaction_reference LIKE '%s'" % r for r in QA_REF_LIKE),
        "-- 2) مفاتيح idempotency للاختبارات:",
        "DELETE FROM idempotency_keys WHERE %s;" % " OR ".join("key LIKE '%s'" % k for k in QA_IDEM_LIKE),
        "-- 3) طلبات حسابات الاختبار (المخزون المحجوز يجب أن يُعاد قبل الحذف):",
        "DELETE FROM order_items WHERE order_id IN (SELECT o.id FROM orders o JOIN users u ON u.id = o.user_id WHERE u.phone IN (%s));" % ", ".join("'%s'" % p for p in QA_PHONES),
        "DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE phone IN (%s));" % ", ".join("'%s'" % p for p in QA_PHONES),
        "-- 4) موظفو/أدوار الاختبار (بعد فك التعيينات):",
        "DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE %s);" % " OR ".join("name LIKE '%s'" % r for r in QA_ROLE_LIKE),
        "DELETE FROM employees WHERE user_id IN (SELECT id FROM users WHERE phone LIKE '09559%');",
        "DELETE FROM roles WHERE %s;" % " OR ".join("name LIKE '%s'" % r for r in QA_ROLE_LIKE),
        "-- 5) حسابات الاختبار نفسها (بعد كل ما سبق):",
        "DELETE FROM users WHERE phone IN (%s);" % ", ".join("'%s'" % p for p in QA_PHONES),
        "-- 6) الإبقاء على: المالك · الأدوار النظامية · الصلاحيات · منتجات/تصنيفات/علامات العرض · صفوف المخزون · حساب 0966112233.",
    ]

    payload = {"stage": "14.4", "scope": "stage 14 QA data inventory (read-only)",
               "database": URL.split("@")[-1], "qa_inventory": inventory, "preserved": preserved,
               "totals_before": totals, "cleanup_proposal_not_executed": proposal,
               "deleted_in_stage_14_4": 0, "policy": "لا حذف أي بيانات في Stage 14.4؛ الجرد يحدد فقط، والقرار للمستخدم."}
    (OUT / "stage144-cleanup-inventory.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== Stage 14 QA data inventory (read-only) ===")
    for key, value in inventory.items():
        print("  %-28s %s" % (key, value))
    print("--- preserved ---")
    for key, value in preserved.items():
        print("  %-28s %s" % (key, value))
    print("--- totals (before) ---")
    print("  " + json.dumps(totals, ensure_ascii=False))
    print("\nwritten:", OUT / "stage144-cleanup-inventory.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
