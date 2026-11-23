-- D5b (F-07 / F-16 check 4): no fill counted twice (rolled back).
-- A scanned card fill + its marked statement row (the normal pair, as on production) → passes.
-- The same pair where the statement row lacks the marker → fails.
-- Two counted rows with one transaction id → fails.

BEGIN;

DO $$
DECLARE
  v_org text := 'f5b11111-1111-4111-8111-111111111101';
  v_org_uuid uuid := 'f5b11111-1111-4111-8111-111111111101';
  v_week date := '2026-11-16';
  v_failed int;
BEGIN
  INSERT INTO public.fuel_reconciliation_period (
    id, org_id, week_start, week_end, status, locked_at,
    total_spend, company_share, driver_share
  ) VALUES (
    'period-d5b', v_org_uuid, v_week, v_week + 6, 'locked', now() - interval '1 hour',
    5000, 4000, 1000
  );
  INSERT INTO public.fuel_week_snapshot (
    org_id, period_id, week_start, version, inputs_hash, money, provenance, created_at
  ) VALUES (
    v_org, 'period-d5b', v_week, 1, 'hash-d5b',
    jsonb_build_object('reports', '[]'::jsonb, 'totalSpend', 5000),
    jsonb_build_object('engineVersion', 'fuel-chain-v3.0'),
    now() - interval '2 hours'
  );

  -- The normal pair: scan + statement row marked jaa_raw (Card Inventory ledger).
  INSERT INTO fleet.fuel_entries (
    id, organization_id, date, vehicle_id, amount, liters, type, legacy_kv_id, payload_json, odometer, transaction_id
  ) VALUES
    ('d5b-scan', v_org, v_week + 2, 'v1', 5000, 22, 'Manual_Entry', 'd5b-scan',
     jsonb_build_object('metadata', jsonb_build_object('jaaMatchedStatementId', 'd5b-stmt')), 197500, 'tx-scan'),
    ('d5b-stmt', v_org, v_week + 2, 'v1', 5000, 22, 'Card_Transaction', 'd5b-stmt',
     jsonb_build_object('entrySource', 'fuel-card',
       'metadata', jsonb_build_object('importSource', 'jaa_raw', 'jaaRowKind', 'fuel', 'jaaMatchedDriverEntryId', 'd5b-scan')),
     197500, 'tx-stmt');

  SELECT count(*) INTO v_failed
  FROM fuel_system.nightly_checks(v_org)
  WHERE NOT ok AND name = 'v3_no_duplicate_card_fill';
  IF v_failed <> 0 THEN
    RAISE EXCEPTION 'a scan + its marked statement row is one fill; check 4 must pass';
  END IF;

  -- The statement row loses its marker: the engine would count J$5,000 twice.
  UPDATE fleet.fuel_entries SET payload_json = '{}'::jsonb WHERE id = 'd5b-stmt';
  SELECT count(*) INTO v_failed
  FROM fuel_system.nightly_checks(v_org)
  WHERE NOT ok AND name = 'v3_no_duplicate_card_fill';
  IF v_failed <> 1 THEN
    RAISE EXCEPTION 'an unmarked card row with a scanned twin must fail check 4';
  END IF;
  DELETE FROM fleet.fuel_entries WHERE id = 'd5b-stmt';

  -- Two counted rows share a transaction id.
  INSERT INTO fleet.fuel_entries (
    id, organization_id, date, vehicle_id, amount, liters, type, legacy_kv_id, payload_json, odometer, transaction_id
  ) VALUES
    ('d5b-cash', v_org, v_week + 3, 'v1', 3000, 13, 'Reimbursement', 'd5b-cash', '{}'::jsonb, 197700, 'tx-scan');
  SELECT count(*) INTO v_failed
  FROM fuel_system.nightly_checks(v_org)
  WHERE NOT ok AND name = 'v3_no_duplicate_card_fill';
  IF v_failed <> 1 THEN
    RAISE EXCEPTION 'two counted rows with one transaction id must fail check 4';
  END IF;
END;
$$;

ROLLBACK;
