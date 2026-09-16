-- Stage 9 cleanup — TARGETED deletion of confirmed Stage 9 test data only.
-- Single atomic DO block: every guard raises an exception => the whole block rolls back.
-- No TRUNCATE, no full-table DELETE, no schema/migration changes.
DO $$
DECLARE
  -- Confirmed Stage 9 test users (id + email must both match before deletion)
  u_ids  text[] := ARRAY[
    'cmu3pnj0a0006lwmpa40wdr0i',  -- live.a.9539566@alwled.test
    'cmu3pnjem000llwmpm6pyyfow',  -- live.b.9539566@alwled.test
    'cmu3pnjuc0018lwmpj4cli2g6',  -- live.c.9539566@alwled.test
    'cmu3pnkdi001xlwmplabo3irn',  -- live.np.9539566@alwled.test
    'cmu3pnksf002dlwmpa6p79k4b',  -- live.admin.9539566@alwled.test
    'cmu3p9ap300008xvsyfvztrmg',  -- ver.03218902341@alwled.test
    'cmu3p9ayr00098xvs9ef2jvln'   -- ver.03118902341@alwled.test
  ];
  u_emails text[] := ARRAY[
    'live.a.9539566@alwled.test', 'live.b.9539566@alwled.test',
    'live.c.9539566@alwled.test', 'live.np.9539566@alwled.test',
    'live.admin.9539566@alwled.test',
    'ver.03218902341@alwled.test', 'ver.03118902341@alwled.test'
  ];
  -- Confirmed Stage 9 verifications (full ids)
  v_ids text[] := ARRAY[
    'cmu3pnjmj0011lwmp8qziqanz',
    'cmu3pnk5f001olwmp8vs3pc95',
    'cmu3pnl2p002rlwmpsuunqb45'
  ];

  b_users int;     b_orders int;   b_payments int;  b_carts int;
  b_inv_qty numeric; b_inv_res numeric; b_inv_rows int;
  b_roles int;     b_perms int;    b_roleperms int; b_audit int;  b_ver int;
  del_users int;   del_ver int;    del_idem int;
BEGIN
  /* ------------------------- 1) snapshots + guards ------------------------- */
  SELECT count(*) INTO b_users  FROM users;
  SELECT count(*) INTO b_orders FROM orders;
  SELECT count(*) INTO b_payments FROM payments;
  SELECT count(*) INTO b_carts FROM carts;
  SELECT count(*), coalesce(sum(quantity),0), coalesce(sum(reserved_quantity),0)
    INTO b_inv_rows, b_inv_qty, b_inv_res
    FROM inventory;
  SELECT count(*) INTO b_roles FROM roles;
  SELECT count(*) INTO b_perms FROM permissions;
  SELECT count(*) INTO b_roleperms FROM role_permissions;
  SELECT count(*) INTO b_audit FROM audit_logs;
  SELECT count(*) INTO b_ver FROM customer_verifications;

  -- every user id must exist AND match its recorded email (id+email, never a prefix match)
  IF (SELECT count(*) FROM users WHERE id = ANY(u_ids) AND email = ANY(u_emails)) <> array_length(u_ids, 1) THEN
    RAISE EXCEPTION 'guard: candidate users do not all match id+email (found %, expected %)',
      (SELECT count(*) FROM users WHERE id = ANY(u_ids) AND email = ANY(u_emails)), array_length(u_ids, 1);
  END IF;

  -- no business data may be attached to any candidate
  IF EXISTS (SELECT 1 FROM orders WHERE user_id = ANY(u_ids)) THEN
    RAISE EXCEPTION 'guard: candidate user owns orders — refusing to delete';
  END IF;
  IF EXISTS (SELECT 1 FROM payments WHERE user_id = ANY(u_ids)) THEN
    RAISE EXCEPTION 'guard: candidate user owns payments — refusing to delete';
  END IF;
  IF EXISTS (SELECT 1 FROM payments WHERE reviewed_by = ANY(u_ids)) THEN
    RAISE EXCEPTION 'guard: candidate reviewed a real payment — refusing to delete';
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_movements WHERE created_by = ANY(u_ids)) THEN
    RAISE EXCEPTION 'guard: candidate created inventory movements — refusing to delete';
  END IF;
  IF EXISTS (SELECT 1 FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = ANY(u_ids)) THEN
    RAISE EXCEPTION 'guard: candidate cart has items — refusing to delete';
  END IF;

  -- the verifications must belong to the candidates, and be exactly the Stage 9 set
  IF (SELECT count(*) FROM customer_verifications WHERE id = ANY(v_ids)) <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'guard: not all Stage 9 verification ids found';
  END IF;
  IF EXISTS (SELECT 1 FROM customer_verifications WHERE id = ANY(v_ids) AND user_id <> ALL(u_ids)) THEN
    RAISE EXCEPTION 'guard: a Stage 9 verification belongs to a NON test user — refusing';
  END IF;
  IF EXISTS (SELECT 1 FROM customer_verifications WHERE id = ANY(v_ids) AND coalesce(provider,'') <> 'LOG') THEN
    RAISE EXCEPTION 'guard: a target verification was not produced by the LOG provider';
  END IF;
  IF b_ver <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'guard: % verifications exist but only % are confirmed Stage 9 test records',
      b_ver, array_length(v_ids, 1);
  END IF;

  /* ------------------------------- 2) deletes ------------------------------ */
  DELETE FROM idempotency_keys
   WHERE user_id = ANY(u_ids) OR verification_id = ANY(v_ids);
  GET DIAGNOSTICS del_idem = ROW_COUNT;

  DELETE FROM customer_verifications
   WHERE id = ANY(v_ids) AND user_id = ANY(u_ids);
  GET DIAGNOSTICS del_ver = ROW_COUNT;
  IF del_ver <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'guard: expected % verifications deleted, got %', array_length(v_ids, 1), del_ver;
  END IF;

  -- cascades remove refresh_tokens, verification_tokens, user_roles, carts, idem keys
  DELETE FROM users
   WHERE id = ANY(u_ids) AND email = ANY(u_emails);
  GET DIAGNOSTICS del_users = ROW_COUNT;
  IF del_users <> array_length(u_ids, 1) THEN
    RAISE EXCEPTION 'guard: expected % users deleted, got %', array_length(u_ids, 1), del_users;
  END IF;

  /* --------------------------- 3) post-conditions -------------------------- */
  IF (SELECT count(*) FROM customer_verifications) <> 0 THEN
    RAISE EXCEPTION 'guard: verifications remain after cleanup';
  END IF;
  IF (SELECT count(*) FROM users) <> b_users - del_users THEN
    RAISE EXCEPTION 'guard: user count mismatch after cleanup';
  END IF;
  IF (SELECT count(*) FROM orders) <> b_orders THEN
    RAISE EXCEPTION 'guard: orders changed';
  END IF;
  IF (SELECT count(*) FROM payments) <> b_payments THEN
    RAISE EXCEPTION 'guard: payments changed';
  END IF;
  IF (SELECT count(*) FROM carts) <> b_carts THEN
    RAISE EXCEPTION 'guard: carts changed';
  END IF;
  IF (SELECT count(*) FROM roles) <> b_roles OR (SELECT count(*) FROM permissions) <> b_perms
     OR (SELECT count(*) FROM role_permissions) <> b_roleperms THEN
    RAISE EXCEPTION 'guard: roles/permissions changed';
  END IF;
  IF (SELECT count(*) FROM audit_logs) <> b_audit THEN
    RAISE EXCEPTION 'guard: audit rows were deleted (% -> %)', b_audit, (SELECT count(*) FROM audit_logs);
  END IF;
  IF (SELECT count(*) FROM inventory) <> b_inv_rows
     OR (SELECT coalesce(sum(quantity),0) FROM inventory) <> b_inv_qty
     OR (SELECT coalesce(sum(reserved_quantity),0) FROM inventory) <> b_inv_res THEN
    RAISE EXCEPTION 'guard: inventory changed';
  END IF;

  RAISE NOTICE 'Stage 9 cleanup OK — users deleted=%, verifications deleted=%, idempotency keys deleted=%',
    del_users, del_ver, del_idem;
  RAISE NOTICE 'preserved: orders=%, payments=%, carts=%, roles=%, permissions=%, audit=%',
    b_orders, b_payments, b_carts, b_roles, b_perms, b_audit;
END $$;
