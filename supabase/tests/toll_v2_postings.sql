-- Toll v2 R2: posting rules, toll_system.post, ledger guard (rolled back).

BEGIN;

INSERT INTO auth.users (id, email)
SELECT 'c0111111-1111-4111-8111-111111111111'::uuid, 'toll-v2-postings@example.com'
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = 'c0111111-1111-4111-8111-111111111111'::uuid
);

DO $$
DECLARE
  v_owner   uuid := 'c0111111-1111-4111-8111-111111111111';
  v_org_a   uuid := 'c1111111-1111-4111-8111-111111111101';
  v_org_b   uuid := 'c2222222-2222-4222-8222-222222222202';
  v_effective timestamptz := '2026-03-10 15:00:00+00';
  v_week    date;
  v_next_week timestamptz := '2026-03-17 15:00:00+00';
  v_amount  bigint := 1000;

  v_decision_id uuid;
  v_charge_tag uuid;
  v_charge_cash uuid;
  v_charge_legacy uuid;
  v_payback_fleet uuid;
  v_payback_driver uuid;
  v_tag_account uuid;
  v_tag_topup uuid;
  v_carried_id uuid;

  r         toll.posting_rules%ROWTYPE;
  v_line    int := 0;
  v_refs    jsonb;
  v_ref     text;
  v_charge_pick uuid;
  v_entry   uuid;
  v_debit_key text;
  v_credit_key text;
  v_debit_before bigint;
  v_credit_before bigint;
  v_debit_after bigint;
  v_credit_after bigint;
  v_row     record;
  v_sum     bigint;
  v_caught  boolean;
  v_msg     text;
  v_replay_entry uuid;
  v_entry_check record;
  v_acct record;
  v_bal_before bigint;
  v_bal_after bigint;
  v_p6_debit_before bigint;
  v_p6_credit_before bigint;
  v_fn_post regprocedure := 'toll_system.post(uuid,text,bigint,timestamptz,text,integer,jsonb,boolean,text)'::regprocedure;
  v_fn_ensure regprocedure := 'toll_system.ensure_accounts(uuid,text)'::regprocedure;
  v_fn_sealed regprocedure := 'toll_system.week_is_sealed(uuid,date)'::regprocedure;
  v_debit_acct uuid;
  v_credit_acct uuid;
  v_direct_entry uuid;
  v_nontoll_d uuid;
  v_nontoll_c uuid;
BEGIN
  v_week := ledger.jamaica_week_start(v_effective);

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES
    (v_org_a, v_owner, 'Toll Postings Org A', 'toll-postings-a', 'fleet', 'active'),
    (v_org_b, v_owner, 'Toll Postings Org B', 'toll-postings-b', 'fleet', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_a, 'toll-postings-fixture-dec', 'fixture', 'user')
  RETURNING id INTO v_decision_id;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref
  ) VALUES (
    v_org_a, v_effective, v_week, 'exact', v_amount,
    'tag', 'manual', 'toll-postings-tag-charge'
  ) RETURNING id INTO v_charge_tag;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref
  ) VALUES (
    v_org_a, v_effective, v_week, 'exact', v_amount,
    'cash', 'driver_cash', 'toll-postings-cash-charge'
  ) RETURNING id INTO v_charge_cash;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref, is_legacy
  ) VALUES (
    v_org_a, v_effective, v_week, 'exact', v_amount,
    'tag', 'legacy', 'toll-postings-legacy-charge', true
  ) RETURNING id INTO v_charge_legacy;

  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key,
    amount_minor, received_by
  ) VALUES (
    v_org_a, 'uber', 'trip_line', 'toll-postings-fleet-pb', v_week, v_week,
    v_amount, 'fleet'
  ) RETURNING id INTO v_payback_fleet;

  INSERT INTO toll.paybacks (
    organization_id, platform, kind, reference, paid_on, week_key,
    amount_minor, received_by
  ) VALUES (
    v_org_a, 'indrive', 'trip_line', 'toll-postings-driver-pb', v_week, v_week,
    v_amount, 'driver'
  ) RETURNING id INTO v_payback_driver;

  INSERT INTO toll.tag_accounts (organization_id, provider, account_ref)
  VALUES (v_org_a, 'test', 'toll-postings-tag-acct')
  RETURNING id INTO v_tag_account;

  INSERT INTO toll.tag_topups (
    organization_id, tag_account_id, amount_minor, topped_up_on, week_key, source_ref
  ) VALUES (
    v_org_a, v_tag_account, v_amount, v_week, v_week, 'toll-postings-topup'
  ) RETURNING id INTO v_tag_topup;

  INSERT INTO toll.carried_facts (
    organization_id, kind, original_id, from_week, to_week, amount_minor, decision_id
  ) VALUES (
    v_org_a, 'charge', v_charge_tag, v_week - 7, v_week, v_amount, v_decision_id
  ) RETURNING id INTO v_carried_id;

  PERFORM toll_system.ensure_accounts(v_org_a);

  -- 13. Account types
  FOR v_acct IN
    SELECT suffix, expected FROM (VALUES
      ('toll:payback_unallocated', 'liability'),
      ('toll:payable_driver', 'liability'),
      ('toll:expense', 'expense'),
      ('toll:tag_prepaid', 'asset'),
      ('toll:suspense', 'asset'),
      ('toll:receivable_platform', 'asset'),
      ('toll:recovered_in_driver_cash', 'asset'),
      ('toll:receivable_driver', 'asset'),
      ('toll:platform_payout_clearing', 'asset'),
      ('bank', 'asset')
    ) AS t(suffix, expected)
  LOOP
    IF (
      SELECT account_class FROM ledger.accounts
      WHERE account_key = 'org:' || v_org_a::text || ':' || v_acct.suffix AND currency = 'JMD'
    ) IS DISTINCT FROM v_acct.expected THEN
      RAISE EXCEPTION 'account % expected class %', v_acct.suffix, v_acct.expected;
    END IF;
  END LOOP;

  -- 14. Grants
  IF has_function_privilege('authenticated', v_fn_post, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_post, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated/anon must not EXECUTE toll_system.post';
  END IF;
  IF has_function_privilege('authenticated', v_fn_ensure, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_ensure, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated/anon must not EXECUTE toll_system.ensure_accounts';
  END IF;
  IF has_function_privilege('authenticated', v_fn_sealed, 'EXECUTE')
    OR has_function_privilege('anon', v_fn_sealed, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated/anon must not EXECUTE toll_system.week_is_sealed';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn_post, 'EXECUTE')
    OR NOT has_function_privilege('service_role', v_fn_ensure, 'EXECUTE')
    OR NOT has_function_privilege('service_role', v_fn_sealed, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must EXECUTE all toll_system functions';
  END IF;

  -- 6. Missing reference
  v_caught := false;
  BEGIN
    PERFORM toll_system.post(
      v_org_a, 'P6_allocate_platform', v_amount, v_effective,
      'toll-postings-missing-ref', 1,
      jsonb_build_object('charge_id', v_charge_tag::text)
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%TOLL_REF_REQUIRED%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'P6 without payback_id must raise TOLL_REF_REQUIRED';
  END IF;

  -- 7. Other company record
  v_caught := false;
  BEGIN
    PERFORM toll_system.post(
      v_org_b, 'P2_tag_crossing', v_amount, v_effective,
      'toll-postings-cross-co', 1,
      jsonb_build_object('charge_id', v_charge_tag::text)
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%TOLL_REF_NOT_FOUND%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'company B with company A charge must raise TOLL_REF_NOT_FOUND';
  END IF;

  -- 8. Legacy record
  v_caught := false;
  BEGIN
    PERFORM toll_system.post(
      v_org_a, 'P2_tag_crossing', v_amount, v_effective,
      'toll-postings-legacy', 1,
      jsonb_build_object('charge_id', v_charge_legacy::text)
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%TOLL_REF_NOT_FOUND%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'legacy charge must raise TOLL_REF_NOT_FOUND';
  END IF;

  -- 1. Every posting rule
  FOR r IN SELECT * FROM toll.posting_rules ORDER BY code
  LOOP
    v_line := v_line + 1;
    v_refs := '{}'::jsonb;
    FOREACH v_ref IN ARRAY r.required_refs
    LOOP
      CASE v_ref
        WHEN 'charge_id' THEN
          IF r.code LIKE '%\_cash%' ESCAPE '\' OR r.code IN (
            'P3_cash_verified', 'P7_allocate_driver', 'P8_allocate_fleet'
          ) THEN
            v_charge_pick := v_charge_cash;
          ELSE
            v_charge_pick := v_charge_tag;
          END IF;
          v_refs := v_refs || jsonb_build_object('charge_id', v_charge_pick::text);
        WHEN 'payback_id' THEN
          IF r.code = 'P5_payback_driver' THEN
            v_refs := v_refs || jsonb_build_object('payback_id', v_payback_driver::text);
          ELSE
            v_refs := v_refs || jsonb_build_object('payback_id', v_payback_fleet::text);
          END IF;
        WHEN 'tag_topup_id' THEN
          v_refs := v_refs || jsonb_build_object('tag_topup_id', v_tag_topup::text);
        WHEN 'carried_fact_id' THEN
          v_refs := v_refs || jsonb_build_object('carried_fact_id', v_carried_id::text);
        WHEN 'payout_ref' THEN
          v_refs := v_refs || jsonb_build_object('payout_ref', 'toll-postings-payout');
        WHEN 'settlement_ref' THEN
          v_refs := v_refs || jsonb_build_object('settlement_ref', 'toll-postings-settlement');
        ELSE
          RAISE EXCEPTION 'unknown required_ref % for rule %', v_ref, r.code;
      END CASE;
    END LOOP;

    v_debit_key := 'org:' || v_org_a::text || ':' || r.debit_suffix;
    v_credit_key := 'org:' || v_org_a::text || ':' || r.credit_suffix;

    DROP TABLE IF EXISTS toll_posting_bal_snap;
    CREATE TEMP TABLE toll_posting_bal_snap ON COMMIT DROP AS
    SELECT account_key, balance_minor
    FROM ledger.accounts
    WHERE organization_id = v_org_a
      AND (
        account_key LIKE 'org:' || v_org_a::text || ':toll:%'
        OR account_key = 'org:' || v_org_a::text || ':bank'
      );

    SELECT balance_minor INTO v_debit_before FROM toll_posting_bal_snap WHERE account_key = v_debit_key;
    SELECT balance_minor INTO v_credit_before FROM toll_posting_bal_snap WHERE account_key = v_credit_key;
    IF v_debit_before IS NULL OR v_credit_before IS NULL THEN
      RAISE EXCEPTION 'rule % missing debit or credit account (%, %)', r.code, v_debit_key, v_credit_key;
    END IF;

    v_entry := toll_system.post(
      v_org_a, r.code, v_amount, v_effective,
      'toll-v2-postings-all-rules', v_line,
      v_refs
    );

    SELECT balance_minor INTO v_debit_after FROM ledger.accounts WHERE account_key = v_debit_key;
    SELECT balance_minor INTO v_credit_after FROM ledger.accounts WHERE account_key = v_credit_key;

    IF v_debit_after <> v_debit_before - v_amount THEN
      RAISE EXCEPTION 'rule % debit balance: expected % got %', r.code, v_debit_before - v_amount, v_debit_after;
    END IF;
    IF v_credit_after <> v_credit_before + v_amount THEN
      RAISE EXCEPTION 'rule % credit balance: expected % got %', r.code, v_credit_before + v_amount, v_credit_after;
    END IF;

    FOR v_row IN
      SELECT s.account_key, s.balance_minor AS before_bal, a.balance_minor AS after_bal
      FROM toll_posting_bal_snap s
      JOIN ledger.accounts a ON a.account_key = s.account_key
      WHERE s.account_key NOT IN (v_debit_key, v_credit_key)
    LOOP
      IF v_row.before_bal IS DISTINCT FROM v_row.after_bal THEN
        RAISE EXCEPTION 'rule % changed other account %', r.code, v_row.account_key;
      END IF;
    END LOOP;

    SELECT e.reference_type, e.product, e.metadata->>'toll_rule' AS toll_rule
    INTO v_entry_check
    FROM ledger.entries e
    WHERE e.id = v_entry;

    IF v_entry_check.reference_type <> 'toll'
      OR v_entry_check.product <> 'roam_fleet'
      OR v_entry_check.toll_rule IS DISTINCT FROM r.code THEN
      RAISE EXCEPTION 'rule % ledger row metadata wrong', r.code;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM toll.posting_rules) <> 30 THEN
    RAISE EXCEPTION 'expected 30 posting rules, got %', (SELECT count(*) FROM toll.posting_rules);
  END IF;

  -- 2. Reversal
  v_debit_key := 'org:' || v_org_a::text || ':toll:payback_unallocated';
  v_credit_key := 'org:' || v_org_a::text || ':toll:suspense';
  SELECT balance_minor INTO v_p6_debit_before FROM ledger.accounts WHERE account_key = v_debit_key;
  SELECT balance_minor INTO v_p6_credit_before FROM ledger.accounts WHERE account_key = v_credit_key;

  v_refs := jsonb_build_object(
    'charge_id', v_charge_tag::text,
    'payback_id', v_payback_fleet::text
  );
  PERFORM toll_system.post(
    v_org_a, 'P6_allocate_platform', v_amount, v_effective,
    'toll-postings-reversal-fwd', 1, v_refs
  );
  PERFORM toll_system.post(
    v_org_a, 'P6_allocate_platform', v_amount, v_effective,
    'toll-postings-reversal-rev', 1, v_refs, true
  );

  IF (SELECT balance_minor FROM ledger.accounts WHERE account_key = v_debit_key) IS DISTINCT FROM v_p6_debit_before THEN
    RAISE EXCEPTION 'reversal: payback_unallocated balance not restored';
  END IF;
  IF (SELECT balance_minor FROM ledger.accounts WHERE account_key = v_credit_key) IS DISTINCT FROM v_p6_credit_before THEN
    RAISE EXCEPTION 'reversal: suspense balance not restored';
  END IF;

  -- 3. Trial balance
  SELECT coalesce(sum(balance_minor), 0) INTO v_sum
  FROM ledger.accounts
  WHERE organization_id = v_org_a
    AND (
      account_key LIKE 'org:' || v_org_a::text || ':toll:%'
      OR account_key = 'org:' || v_org_a::text || ':bank'
    );
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'trial balance must be 0, got %', v_sum;
  END IF;

  -- 4. Replay
  v_refs := jsonb_build_object('payout_ref', 'toll-postings-replay');
  v_replay_entry := toll_system.post(
    v_org_a, 'P10_payout_confirmed', v_amount, v_effective,
    'toll-postings-replay', 1, v_refs
  );
  SELECT coalesce(sum(balance_minor), 0) INTO v_bal_before
  FROM ledger.accounts
  WHERE organization_id = v_org_a
    AND (
      account_key LIKE 'org:' || v_org_a::text || ':toll:%'
      OR account_key = 'org:' || v_org_a::text || ':bank'
    );

  v_entry := toll_system.post(
    v_org_a, 'P10_payout_confirmed', v_amount, v_effective,
    'toll-postings-replay', 1, v_refs
  );
  IF v_entry IS DISTINCT FROM v_replay_entry THEN
    RAISE EXCEPTION 'replay must return same entry id';
  END IF;
  SELECT coalesce(sum(balance_minor), 0) INTO v_bal_after
  FROM ledger.accounts
  WHERE organization_id = v_org_a
    AND (
      account_key LIKE 'org:' || v_org_a::text || ':toll:%'
      OR account_key = 'org:' || v_org_a::text || ':bank'
    );
  IF v_bal_after <> v_bal_before THEN
    RAISE EXCEPTION 'replay must move balances only once (before % after %)', v_bal_before, v_bal_after;
  END IF;

  -- 5. Conflict
  v_caught := false;
  BEGIN
    PERFORM toll_system.post(
      v_org_a, 'P10_payout_confirmed', v_amount + 1, v_effective,
      'toll-postings-replay', 1,
      jsonb_build_object('payout_ref', 'toll-postings-replay')
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%TOLL_POST_CONFLICT%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'same command id with different amount must raise TOLL_POST_CONFLICT';
  END IF;

  -- 9. Sealed week
  INSERT INTO ledger.week_statements (
    kind, organization_id, driver_id, week_key, version, status
  ) VALUES (
    'toll_week', v_org_a, '*', v_week, 1, 'closed'
  );

  v_caught := false;
  BEGIN
    PERFORM toll_system.post(
      v_org_a, 'P10_payout_confirmed', v_amount, v_effective,
      'toll-postings-sealed', 1,
      jsonb_build_object('payout_ref', 'sealed-blocked')
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%WEEK_SEALED%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'post into sealed week must raise WEEK_SEALED';
  END IF;

  PERFORM toll_system.post(
    v_org_a, 'P10_payout_confirmed', v_amount, v_next_week,
    'toll-postings-next-week', 1,
    jsonb_build_object('payout_ref', 'next-week-ok')
  );

  INSERT INTO ledger.week_statements (
    kind, organization_id, driver_id, week_key, version, status
  ) VALUES (
    'toll_week', v_org_a, '*', v_week, 2, 'draft'
  );

  PERFORM toll_system.post(
    v_org_a, 'P10_payout_confirmed', v_amount, v_effective,
    'toll-postings-reopened', 1,
    jsonb_build_object('payout_ref', 'reopened-ok')
  );

  -- 10. Writer only
  SELECT id INTO v_debit_acct FROM ledger.accounts
  WHERE account_key = 'org:' || v_org_a::text || ':toll:suspense' AND currency = 'JMD';
  SELECT id INTO v_credit_acct FROM ledger.accounts
  WHERE account_key = 'org:' || v_org_a::text || ':toll:tag_prepaid' AND currency = 'JMD';

  v_caught := false;
  BEGIN
    INSERT INTO ledger.entries (
      organization_id, idempotency_key, entry_type, product,
      debit_account_id, credit_account_id, amount_minor, currency, effective_at
    ) VALUES (
      v_org_a, 'toll-postings-direct-insert-' || gen_random_uuid()::text, 'test',
      'roam_fleet', v_debit_acct, v_credit_acct, v_amount, 'JMD', v_effective
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%TOLL_WRITER_ONLY%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'direct insert on toll accounts must raise TOLL_WRITER_ONLY';
  END IF;

  -- 11. Permanent
  v_direct_entry := toll_system.post(
    v_org_a, 'P10_payout_confirmed', v_amount, v_next_week,
    'toll-postings-delete-me', 1,
    jsonb_build_object('payout_ref', 'delete-test')
  );
  v_caught := false;
  BEGIN
    DELETE FROM ledger.entries WHERE id = v_direct_entry;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE '%TOLL_ROWS_PERMANENT%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'delete toll ledger row must raise TOLL_ROWS_PERMANENT';
  END IF;

  -- 12. No side effects on non-toll post_entry
  v_nontoll_d := ledger._resolve_account_id('org:' || v_org_a::text || ':fixture:debit', 'JMD');
  v_nontoll_c := ledger._resolve_account_id('org:' || v_org_a::text || ':fixture:credit', 'JMD');
  SELECT balance_minor INTO v_debit_before FROM ledger.accounts WHERE id = v_nontoll_d;
  SELECT balance_minor INTO v_credit_before FROM ledger.accounts WHERE id = v_nontoll_c;

  PERFORM ledger.post_entry(
    'toll-postings-nontoll-' || gen_random_uuid()::text,
    'fixture:test',
    'org:' || v_org_a::text || ':fixture:debit',
    'org:' || v_org_a::text || ':fixture:credit',
    100,
    'JMD',
    NULL,
    v_org_a,
    'roam_fleet',
    v_effective
  );

  IF (SELECT balance_minor FROM ledger.accounts WHERE id = v_nontoll_d) <> v_debit_before - 100 THEN
    RAISE EXCEPTION 'non-toll post_entry must debit fixture account';
  END IF;
  IF (SELECT balance_minor FROM ledger.accounts WHERE id = v_nontoll_c) <> v_credit_before + 100 THEN
    RAISE EXCEPTION 'non-toll post_entry must credit fixture account';
  END IF;

  RAISE NOTICE 'toll_v2_postings: ok';
END;
$$;

ROLLBACK;
