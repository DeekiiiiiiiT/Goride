-- Phase E soak status: don't fail green on intentionally retired KV islands.
CREATE OR REPLACE FUNCTION public.ledger_soak_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, ledger
AS $$
DECLARE
  v_islands jsonb;
  v_money_bad int;
  v_self_ref bigint;
  v_started timestamptz;
  v_hours numeric;
  v_passed boolean;
  v_phase_d boolean := false;
  v_phase_e boolean := false;
  v_retired text[];
BEGIN
  SELECT nullif(m.value, '') IS NOT NULL INTO v_phase_d
  FROM ledger.cutover_meta m WHERE m.key = 'phase_d_complete_at';
  SELECT nullif(m.value, '') IS NOT NULL INTO v_phase_e
  FROM ledger.cutover_meta m WHERE m.key = 'phase_e_kv_hard_retired_at';

  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.source_system), '[]'::jsonb)
  INTO v_islands
  FROM public.ledger_reconcile_islands() r;

  IF coalesce(v_phase_d, false) OR coalesce(v_phase_e, false) THEN
    v_retired := ARRAY['kv_ledger_event','kv_toll_ledger','rides_ledger_lines'];
    SELECT count(*)::int INTO v_money_bad
    FROM public.ledger_reconcile_islands() i
    WHERE i.source_system <> ALL (v_retired)
      AND i.delta <> 0;
  ELSE
    SELECT count(*)::int INTO v_money_bad
    FROM public.ledger_reconcile_islands() i
    WHERE i.source_system <> 'rides_ledger_lines'
      AND i.delta <> 0;
  END IF;

  SELECT count(*)::bigint INTO v_self_ref
  FROM ledger.entries e
  WHERE e.debit_account_id = e.credit_account_id;

  SELECT nullif(m.value, '')::timestamptz INTO v_started
  FROM ledger.cutover_meta m
  WHERE m.key = 'soak_started_at';

  IF v_started IS NOT NULL THEN
    v_hours := extract(epoch FROM (now() - v_started)) / 3600.0;
  ELSE
    v_hours := NULL;
  END IF;

  v_passed := v_money_bad = 0 AND v_self_ref = 0 AND coalesce(v_hours, 0) >= 48;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'soak_started_at', v_started,
    'soak_hours_elapsed', round(coalesce(v_hours, 0)::numeric, 2),
    'soak_passed_48h', v_passed,
    'money_islands_green', v_money_bad = 0,
    'money_anomaly_count', v_money_bad,
    'self_ref_entry_count', v_self_ref,
    'go_for_phase_b', v_money_bad = 0 AND v_self_ref = 0,
    'phase_d_complete', coalesce(v_phase_d, false),
    'phase_e_kv_retired', coalesce(v_phase_e, false),
    'islands', v_islands,
    'outcome_note', CASE
      WHEN coalesce(v_phase_e, false) THEN 'Phase E complete — money KV hard-retired; unified ledger is money SSOT (' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ' UTC)'
      WHEN coalesce(v_phase_d, false) THEN 'Phase D complete — legacy KV money writes stopped'
      WHEN v_passed THEN 'Soak passed ' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ' UTC'
      WHEN v_money_bad = 0 AND v_self_ref = 0 THEN 'Soak clock running'
      ELSE 'NO-GO — money islands not green or self-ref entries present'
    END,
    'instructions', jsonb_build_object(
      'rollback_disaster', 'Restore ledger.kv_money_backup_20260811 into kv_store + re-enable legacy/dual-write flags',
      'product_read_flags', 'LEDGER_READ_UNIFIED_RIDES|FLEET|TOLL|DASH should be ON',
      'legacy_kv', 'Hard-retired; reads from ledger.entries'
    )
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
