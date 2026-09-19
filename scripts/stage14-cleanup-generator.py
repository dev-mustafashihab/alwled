#!/usr/bin/env python3
"""Stage 14 — مولّد سكربت التنظيف (مرحّل ومحدَّد بالمعرّفات، بلا TRUNCATE وبلا DELETE واسع).

يقرأ /tmp/stage14-state.json + علامات stage14 في قاعدة البيانات، ويُنتج:
  - /tmp/stage14-cleanup-preview.txt  (كل الصفوف المرشّحة للحذف — للمراجعة)
  - scripts/stage14-cleanup.sql       (سكربت الحذف داخل transaction واحد)
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path('/root/alwled')
ENV = dict(line.split('=', 1) for line in (ROOT / '.env').read_text().splitlines() if line and not line.startswith('#') and '=' in line)
DB = ENV['DATABASE_URL'].split('?')[0]
state = json.loads(Path('/tmp/stage14-state.json').read_text()) if Path('/tmp/stage14-state.json').exists() else {}


def sql(query: str) -> list[str]:
    result = subprocess.run(['psql', DB, '-tAc', query], capture_output=True, text=True)
    if result.returncode != 0:
        return [f'ERROR: {result.stderr.strip()[:200]}']
    return [line for line in result.stdout.strip().splitlines() if line]


def ids(query: str) -> list[str]:
    return [row for row in sql(query) if row and row != 'ERROR']


def q(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def in_list(values: list[str]) -> str:
    return ', '.join(q(v) for v in values) if values else "''"


# ------------------------------------------------------------------ discover stage14 rows by marker
customers = [r for r in sql("select id || '|' || phone || '|' || first_name from users where first_name ilike 'Stage14%' or email ilike '%stage14%'")]
user_ids = [row.split('|')[0] for row in customers]
employee_ids = [row.split('|')[0] for row in customers if 'Emp' in row.split('|')[2]]
customer_ids = [uid for uid in user_ids if uid not in employee_ids]

products = sql("select id || '|' || name from products where slug ilike '%stage14%' or name ilike '%Stage14%'")
product_ids = [row.split('|')[0] for row in products]
categories = sql("select id || '|' || name from categories where name ilike '%Stage14%'")
category_ids = [row.split('|')[0] for row in categories]
brands = sql("select id || '|' || name from brands where name ilike '%Stage14%'")
brand_ids = [row.split('|')[0] for row in brands]
specs = sql("select id || '|' || name from specification_definitions where name ilike '%Stage14%'")
spec_ids = [row.split('|')[0] for row in specs]
roles = sql("select id || '|' || name from roles where name ilike 'STAGE14%'")
role_ids = [row.split('|')[0] for row in roles]

orders = ids(f"select id from orders where user_id in ({in_list(user_ids)})")
order_ids = orders
payments = ids(f"select id from payments where user_id in ({in_list(user_ids)})")
carts = ids(f"select id from carts where user_id in ({in_list(user_ids)})") if user_ids else []
cart_items = ids(f"select id from cart_items where cart_id in ({in_list(carts)})") if carts else []
verifications = ids(f"select id from customer_verifications where user_id in ({in_list(user_ids)})") if user_ids else []
notifications = ids(f"select id from notifications where user_id in ({in_list(user_ids)})") if user_ids else []
outbox = ids(f"""select id from notification_outbox where aggregate_id in ({in_list(order_ids + payments + verifications)})
                 or id in (select id from notification_outbox where payload::text ilike '%stage14%')""") if (order_ids or payments or verifications) else []
inventory_rows = ids(f"select id from inventory where product_id in ({in_list(product_ids)})") if product_ids else []
movements = ids(f"""select m.id from inventory_movements m join inventory i on i.id = m.inventory_id
                    where i.product_id in ({in_list(product_ids)})""") if product_ids else []
images = ids(f"select id from product_images where product_id in ({in_list(product_ids)})") if product_ids else []
product_specs = ids(f"select id from product_specifications where product_id in ({in_list(product_ids)})") if product_ids else []
refresh_tokens = ids(f"select id from refresh_tokens where user_id in ({in_list(user_ids)})") if user_ids else []
idempotency = ids("select id from idempotency_keys where key ilike 'stage14-%'")
user_roles = ids(f"select user_id || '|' || role_id from user_roles where user_id in ({in_list(user_ids)})") if user_ids else []
reset_tokens = ids(f"select id from password_reset_tokens where user_id in ({in_list(user_ids)})") if user_ids else []
verify_tokens = ids(f"select id from verification_tokens where user_id in ({in_list(user_ids)})") if user_ids else []

preview = {
    'runId': state.get('runId'),
    'users (customers)': customers,
    'products': products, 'categories': categories, 'brands': brands, 'specificationDefinitions': specs, 'roles': roles,
    'counts': {
        'orders': len(order_ids), 'payments': len(payments), 'carts': len(carts), 'cart_items': len(cart_items),
        'verifications': len(verifications), 'notifications': len(notifications), 'outbox': len(outbox),
        'inventory': len(inventory_rows), 'inventory_movements': len(movements), 'product_images': len(images),
        'product_specifications': len(product_specs), 'refresh_tokens': len(refresh_tokens),
        'idempotency_keys': len(idempotency), 'user_roles': len(user_roles),
    },
}
Path('/tmp/stage14-cleanup-preview.txt').write_text(json.dumps(preview, ensure_ascii=False, indent=2))

# ------------------------------------------------------------------ sql (ordered for FKs, inside one transaction)
statements: list[str] = []
def add(sql_text: str, why: str) -> None:
    statements.append(f'-- {why}\n{sql_text}')

if notifications:
    add(f"DELETE FROM notifications WHERE id IN ({in_list(notifications)});", f"{len(notifications)} Stage14 notifications (by user_id)")
if outbox:
    add(f"DELETE FROM notification_outbox WHERE id IN ({in_list(outbox)});", f"{len(outbox)} outbox rows for Stage14 aggregates")
if reset_tokens:
    add(f"DELETE FROM password_reset_tokens WHERE id IN ({in_list(reset_tokens)});", 'reset tokens of Stage14 users')
if verify_tokens:
    add(f"DELETE FROM verification_tokens WHERE id IN ({in_list(verify_tokens)});", 'verification tokens of Stage14 users')
if refresh_tokens:
    add(f"DELETE FROM refresh_tokens WHERE id IN ({in_list(refresh_tokens)});", f"{len(refresh_tokens)} refresh tokens of Stage14 users")
if idempotency:
    add(f"DELETE FROM idempotency_keys WHERE id IN ({in_list(idempotency)});", f"{len(idempotency)} idempotency keys used by Stage14")
if movements:
    add(f"DELETE FROM inventory_movements WHERE id IN ({in_list(movements)});", f"{len(movements)} movements of Stage14 products")
if inventory_rows:
    add(f"DELETE FROM inventory WHERE id IN ({in_list(inventory_rows)});", 'inventory rows of Stage14 products')
if product_specs:
    add(f"DELETE FROM product_specifications WHERE id IN ({in_list(product_specs)});", 'product specifications of Stage14 products')
if images:
    add(f"DELETE FROM product_images WHERE id IN ({in_list(images)});", 'images of Stage14 products')
if payments:
    add(f"DELETE FROM payments WHERE id IN ({in_list(payments)});", f"{len(payments)} Stage14 payments")
if order_ids:
    add(f"DELETE FROM order_items WHERE order_id IN ({in_list(order_ids)});", 'order items of Stage14 orders')
    add(f"DELETE FROM orders WHERE id IN ({in_list(order_ids)});", f"{len(order_ids)} Stage14 orders")
if verifications:
    add(f"DELETE FROM customer_verifications WHERE id IN ({in_list(verifications)});", f"{len(verifications)} Stage14 verifications")
if cart_items:
    add(f"DELETE FROM cart_items WHERE id IN ({in_list(cart_items)});", 'cart items of Stage14 carts')
if carts:
    add(f"DELETE FROM carts WHERE id IN ({in_list(carts)});", f"{len(carts)} Stage14 carts")
if product_ids:
    add(f"DELETE FROM products WHERE id IN ({in_list(product_ids)});", f"{len(product_ids)} Stage14 products")
if spec_ids:
    add(f"DELETE FROM specification_definitions WHERE id IN ({in_list(spec_ids)});", 'Stage14 specification definitions')
if category_ids:
    add(f"DELETE FROM categories WHERE id IN ({in_list(category_ids)});", 'Stage14 categories')
if brand_ids:
    add(f"DELETE FROM brands WHERE id IN ({in_list(brand_ids)});", 'Stage14 brands')
if user_ids:
    add(f"DELETE FROM user_roles WHERE user_id IN ({in_list(user_ids)});", f"{len(user_roles)} role assignments of Stage14 users")
if role_ids:
    add(f"DELETE FROM role_permissions WHERE role_id IN ({in_list(role_ids)});", 'permissions of the Stage14 role')
    add(f"DELETE FROM roles WHERE id IN ({in_list(role_ids)});", 'Stage14 role')
if user_ids:
    add(f"DELETE FROM users WHERE id IN ({in_list(user_ids)});", f"{len(user_ids)} Stage14 users (customers + employee)")

body = "\n".join(statements) if statements else "-- nothing to clean (no stage14 records found)\n"
script = f"""-- Stage 14 cleanup — targeted by ids collected during the integration run ({state.get('runId')})
-- no TRUNCATE, no DELETE without a WHERE clause, no touching of pre-existing data.
-- audit_logs are intentionally preserved (append-only history); their actor_id becomes NULL by FK rule.
BEGIN;
{body}
-- verification queries (each must return 0)
SELECT 'users_left' AS check_name, count(*) AS rows FROM users WHERE first_name ILIKE 'Stage14%' OR email ILIKE '%stage14%'
UNION ALL SELECT 'products_left', count(*) FROM products WHERE slug ILIKE '%stage14%' OR name ILIKE '%Stage14%'
UNION ALL SELECT 'categories_left', count(*) FROM categories WHERE name ILIKE '%Stage14%'
UNION ALL SELECT 'brands_left', count(*) FROM brands WHERE name ILIKE '%Stage14%'
UNION ALL SELECT 'roles_left', count(*) FROM roles WHERE name ILIKE 'STAGE14%'
UNION ALL SELECT 'orders_left', count(*) FROM orders o JOIN users u ON u.id = o.user_id WHERE u.first_name ILIKE 'Stage14%'
UNION ALL SELECT 'payments_left', count(*) FROM payments p JOIN users u ON u.id = p.user_id WHERE u.first_name ILIKE 'Stage14%';
COMMIT;
"""
Path('/root/alwled/scripts/stage14-cleanup.sql').write_text(script)
print(json.dumps(preview['counts'], ensure_ascii=False))
print('users:', customers)
print('products:', products)
print('written: /tmp/stage14-cleanup-preview.txt and scripts/stage14-cleanup.sql')
