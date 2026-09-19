#!/usr/bin/env python3
"""Stage 14 — بصمة قاعدة البيانات + فحوص السلامة. للقراءة فقط (ما عدا الفحوص)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path('/root/alwled')
ENV = dict(
    line.split('=', 1)
    for line in (ROOT / '.env').read_text().splitlines()
    if line and not line.startswith('#') and '=' in line
)
URL = ENV['DATABASE_URL'].split('?')[0]

TABLES = ['users', 'roles', 'permissions', 'products', 'categories', 'brands', 'specifications',
          'inventory', 'inventory_movements', 'product_images', 'carts', 'cart_items', 'orders',
          'order_items', 'payments', 'idempotency_keys', 'customer_verifications', 'notifications',
          'notification_outbox', 'audit_logs', 'refresh_tokens', 'user_roles', 'role_permissions']


def sql(query: str) -> str:
    result = subprocess.run(['psql', URL, '-tAc', query], capture_output=True, text=True)
    if result.returncode != 0:
        return f"ERROR: {result.stderr.strip()[:120]}"
    return result.stdout.strip()


def fingerprint() -> dict:
    out = {}
    for table in TABLES:
        out[table] = sql(f'select count(*) from {table}')
    return out


def integrity() -> dict:
    return {
        'bad_order_totals': sql("select count(*) from orders where total < 0 or subtotal < 0"),
        'order_total_mismatch': sql("""select count(*) from orders o where exists (
            select 1 from (select order_id, sum(unit_price * quantity) s from order_items group by order_id) i
            where i.order_id = o.id and abs(i.s - o.subtotal) > 0.01)"""),
        'bad_payment_amounts': sql("select count(*) from payments where amount <= 0"),
        'payment_amount_mismatch': sql("""select count(*) from payments p join orders o on o.id = p.order_id
            where abs(p.amount - o.total) > 0.01"""),
        'orphan_order_items': sql("select count(*) from order_items oi left join orders o on o.id = oi.order_id where o.id is null"),
        'orphan_notifications': sql("select count(*) from notifications n left join users u on u.id = n.user_id where u.id is null"),
        'duplicate_notifications': sql("select coalesce(sum(c - 1), 0) from (select count(*) c from notifications where event_key is not null group by user_id, event_key having count(*) > 1) t"),
        'duplicate_outbox': sql("select coalesce(sum(c - 1), 0) from (select count(*) c from notification_outbox group by event_type, aggregate_type, aggregate_id having count(*) > 1) t"),
        'duplicate_order_numbers': sql("select coalesce(sum(c - 1), 0) from (select count(*) c from orders group by order_number having count(*) > 1) t"),
        'inventory_violations': sql("select count(*) from inventory where quantity < 0 or reserved < 0 or reserved > quantity"),
        'shamcash_provider_leak': sql("select count(*) from payments where provider is not null or provider_reference is not null"),
        'fake_success': sql("select count(*) from payments where status = 'SUCCEEDED' and (reviewed_by is null or reviewed_at is null)"),
        'orphan_verifications': sql("select count(*) from customer_verifications v left join users u on u.id = v.user_id where u.id is null"),
        'users_without_password_hash': sql("select count(*) from users where password_hash is null or password_hash = ''"),
        'stage14_leftovers': sql("select count(*) from users where phone like 'stage14%' or email like '%stage14%' or name like '%stage14%' or name like '%Stage14%'"),
    }


def audit_secret_leaks() -> dict:
    return {
        'password_in_audit': sql("select count(*) from audit_logs where metadata::text ilike '%password%' and metadata::text not ilike '%passwordChanged%'"),
        'token_in_audit': sql("select count(*) from audit_logs where metadata::text ilike '%token%' or metadata::text ilike '%authorization%'"),
        'hash_in_audit': sql("select count(*) from audit_logs where metadata::text ilike '%hash%'"),
        'proof_leak_in_audit': sql("select count(*) from audit_logs where metadata::text ilike '%proofurl%'"),
    }


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else 'snapshot'
    payload = {'mode': mode, 'fingerprint': fingerprint(), 'integrity': integrity(), 'audit': audit_secret_leaks()}
    target = Path(f'/tmp/stage14-fingerprint-{mode}.json')
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    print('written:', target)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
