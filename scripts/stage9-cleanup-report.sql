-- Stage 9 cleanup — READ-ONLY pre-delete report (no writes)
\pset border 2
\echo '=== CANDIDATE USERS (Stage 9 test data) ==='
SELECT u.id,
       u.email,
       u.phone,
       u.status,
       to_char(u.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
       coalesce((SELECT string_agg(r.name, ',') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '-') AS roles
FROM users u
WHERE u.email LIKE 'live.%@alwled.test'
   OR u.email IN ('ver.03118902341@alwled.test', 'ver.03218902341@alwled.test')
ORDER BY u.created_at;

\echo '=== DEPENDENCIES PER CANDIDATE ==='
SELECT u.email,
       (SELECT count(*) FROM orders o WHERE o.user_id = u.id)               AS orders,
       (SELECT count(*) FROM payments p WHERE p.user_id = u.id)            AS payments,
       (SELECT count(*) FROM carts c WHERE c.user_id = u.id)               AS carts,
       (SELECT count(*) FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = u.id) AS cart_items,
       (SELECT count(*) FROM refresh_tokens rt WHERE rt.user_id = u.id)    AS refresh_tokens,
       (SELECT count(*) FROM audit_logs a WHERE a.actor_id = u.id)         AS audit_actor,
       (SELECT count(*) FROM customer_verifications v WHERE v.user_id = u.id)        AS verifications,
       (SELECT count(*) FROM customer_verifications v WHERE v.reviewed_by = u.id)    AS verifications_reviewed,
       (SELECT count(*) FROM payments p WHERE p.reviewed_by = u.id)        AS payments_reviewed,
       (SELECT count(*) FROM idempotency_keys k WHERE k.user_id = u.id)    AS idem_keys,
       (SELECT count(*) FROM password_reset_tokens t WHERE t.user_id = u.id) AS pw_reset,
       (SELECT count(*) FROM verification_tokens t WHERE t.user_id = u.id) AS acc_tokens,
       (SELECT count(*) FROM inventory_movements m WHERE m.created_by = u.id) AS inv_moves,
       (SELECT count(*) FROM user_roles ur WHERE ur.user_id = u.id)        AS user_roles
FROM users u
WHERE u.email LIKE 'live.%@alwled.test'
   OR u.email IN ('ver.03118902341@alwled.test', 'ver.03218902341@alwled.test')
ORDER BY u.email;

\echo '=== CANDIDATE VERIFICATIONS ==='
SELECT v.id,
       v.user_id,
       u.email AS owner_email,
       v.status,
       v.provider,
       v.provider_reference,
       v.attempt,
       to_char(v.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
FROM customer_verifications v
LEFT JOIN users u ON u.id = v.user_id
ORDER BY v.created_at;

\echo '=== BUSINESS DATA TOTALS (must stay unchanged) ==='
SELECT (SELECT count(*) FROM users)   AS users_total,
       (SELECT count(*) FROM orders)  AS orders_total,
       (SELECT count(*) FROM payments) AS payments_total,
       (SELECT count(*) FROM inventory) AS inventory_rows,
       (SELECT coalesce(sum(quantity), 0) FROM inventory)  AS inventory_qty,
       (SELECT coalesce(sum(reserved_quantity), 0) FROM inventory) AS inventory_reserved,
       (SELECT count(*) FROM roles)   AS roles_total,
       (SELECT count(*) FROM permissions) AS permissions_total,
       (SELECT count(*) FROM role_permissions) AS role_perm_rows,
       (SELECT count(*) FROM audit_logs) AS audit_total,
       (SELECT count(*) FROM customer_verifications) AS verifications_total;

\echo '=== AUDIT LOGS THAT WOULD SURVIVE (actor set to NULL on user delete) ==='
SELECT action, count(*) AS n
FROM audit_logs a
WHERE a.actor_id IN (SELECT id FROM users WHERE email LIKE 'live.%@alwled.test'
                     OR email IN ('ver.03118902341@alwled.test','ver.03218902341@alwled.test'))
GROUP BY action ORDER BY 2 DESC;
