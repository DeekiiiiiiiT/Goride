-- Phase 0 soak clock + exposed elapsed hours for Dominion go/no-go.
CREATE TABLE IF NOT EXISTS ledger.cutover_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ledger.cutover_meta ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE ledger.cutover_meta FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE ledger.cutover_meta TO service_role;

INSERT INTO ledger.cutover_meta (key, value)
VALUES ('soak_started_at', now()::text)
ON CONFLICT (key) DO NOTHING;

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
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.source_system), '[]'::jsonb)
  INTO v_islands
  FROM public.ledger_reconcile_islands() r;

  SELECT count(*)::int INTO v_money_bad
  FROM public.ledger_reconcile_islands() i
  WHERE i.source_system <> 'rides_ledger_lines'
    AND i.delta <> 0;

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
    'islands', v_islands,
    'outcome_note', CASE
      WHEN v_passed THEN 'Soak passed ' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ' UTC'
      WHEN v_money_bad = 0 AND v_self_ref = 0 THEN 'Soak clock running — wait for 48h quiet dual-write logs'
      ELSE 'NO-GO — money islands not green or self-ref entries present'
    END,
    'instructions', jsonb_build_object(
      'watch_logs', 'grep unified_dual_write status=fail for 48h',
      'functions', jsonb_build_array('rides','make-server-37f42386','toll-brain','payments','delivery'),
      'allowed_skips', jsonb_build_array(
        'neutral','zero_amount','missing_organization_id','missing_counterparty',
        'self_ref_accounts','clearing_only_unknown_party'
      ),
      'product_read_flags', 'Keep LEDGER_READ_UNIFIED_RIDES|FLEET|TOLL|DASH OFF until shadow sign-off'
    )
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
