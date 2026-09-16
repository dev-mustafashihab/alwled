-- Stage 11 live-check artifact cleanup (targeted: only what the live script created).
BEGIN;

-- 1) notifications + preferences of the live test users
DELETE FROM notifications
 WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'live.ntf%');
-- inventory alerts raised for the live products (staff fan-out rows included)
DELETE FROM notifications
 WHERE type IN ('LOW_STOCK', 'OUT_OF_STOCK')
   AND split_part(event_key, ':', 3) IN (SELECT id::text FROM products WHERE sku LIKE 'NTFLIVE-%');
DELETE FROM notification_preferences WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'live.ntf%');

-- 2) business rows of the live users
DELETE FROM idempotency_keys WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'live.ntf%');
DELETE FROM payments WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'live.ntf%');
DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'live.ntf%');
DELETE FROM customer_verifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'live.ntf%');

-- 3) outbox rows whose aggregate belongs to the live artifacts
DELETE FROM notification_outbox
 WHERE aggregate_type = 'inventory'
   AND split_part(aggregate_id, ':', 1) IN (SELECT id::text FROM products WHERE sku LIKE 'NTFLIVE-%')
    OR aggregate_id LIKE 'NTFLIVE-%';

-- 4) catalog created by the live script
DELETE FROM inventory WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'NTFLIVE-%');
DELETE FROM products WHERE sku LIKE 'NTFLIVE-%';
DELETE FROM categories WHERE slug LIKE 'ntf-live-cat-%';
DELETE FROM brands WHERE slug LIKE 'ntf-live-brand-%';

-- 5) the live users themselves
DELETE FROM users WHERE email LIKE 'live.ntf%';

SELECT 'cleaned. users=' || (SELECT COUNT(*) FROM users)
    || ' products=' || (SELECT COUNT(*) FROM products)
    || ' inventory=' || (SELECT COUNT(*) FROM inventory)
    || ' categories=' || (SELECT COUNT(*) FROM categories)
    || ' brands=' || (SELECT COUNT(*) FROM brands)
    || ' orders=' || (SELECT COUNT(*) FROM orders)
    || ' payments=' || (SELECT COUNT(*) FROM payments)
    || ' notifications=' || (SELECT COUNT(*) FROM notifications)
    || ' outbox=' || (SELECT COUNT(*) FROM notification_outbox) AS state;

COMMIT;
