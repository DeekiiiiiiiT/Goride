-- Exclude KV money events with no UUID driver/org (dual-write cannot post without self-ref).
CREATE OR REPLACE FUNCTION public.ledger_reconcile_islands()
RETURNS TABLE (
  source_system text,
  legacy_count bigint,
  unified_count bigint,
  delta bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ledger, rides, payments
AS $$
  WITH unified AS (
    SELECT source_system::text AS source_system, count(*)::bigint AS unified_count
    FROM ledger.source_receipts
    GROUP BY source_system
  ),
  legacy AS (
    SELECT 'financial_event'::text AS source_system,
           (SELECT count(*)::bigint
            FROM ledger.financial_events
            WHERE abs(coalesce(amount_minor, 0)) > 0
              AND coalesce(direction, '') <> 'neutral') AS legacy_count
    UNION ALL
    SELECT 'kv_ledger_event',
           (SELECT count(DISTINCT coalesce(
                      nullif(value->>'idempotencyKey', ''),
                      value->>'id',
                      split_part(key, ':', 2)
                    ))::bigint
            FROM public.kv_store_37f42386
            WHERE key LIKE 'ledger_event:%'
              AND coalesce(value->>'direction', '') <> 'neutral'
              AND coalesce(
                    nullif(value->>'netAmount', '')::numeric,
                    nullif(value->>'amount', '')::numeric,
                    0
                  ) <> 0
              AND (
                    coalesce(value->>'driverId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    OR coalesce(value->>'organizationId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  ))
    UNION ALL
    SELECT 'kv_toll_ledger',
           (SELECT count(*)::bigint
            FROM public.kv_store_37f42386
            WHERE key LIKE 'toll_ledger:%'
              AND coalesce(abs(nullif(value->>'amount', '')::numeric), 0) > 0)
    UNION ALL
    SELECT 'rides_ledger_lines',
           (SELECT count(*)::bigint FROM rides.ledger_lines)
    UNION ALL
    SELECT 'rides_payment_journal',
           (SELECT count(*)::bigint
            FROM rides.payment_journal_entries
            WHERE abs(coalesce(amount_minor, 0)) > 0)
    UNION ALL
    SELECT 'dash_payments',
           (
             (SELECT count(*)::bigint
              FROM payments.transactions t
              WHERE coalesce(t.amount, 0) <> 0
                AND coalesce(t.status, '') NOT IN ('failed', 'canceled', 'cancelled'))
             +
             (SELECT count(*)::bigint
              FROM payments.merchant_payouts p
              WHERE coalesce(p.amount, 0) <> 0)
           )
  ),
  systems AS (
    SELECT source_system FROM legacy
    UNION
    SELECT source_system FROM unified
  )
  SELECT
    s.source_system,
    coalesce(l.legacy_count, 0)::bigint AS legacy_count,
    coalesce(u.unified_count, 0)::bigint AS unified_count,
    (coalesce(u.unified_count, 0) - coalesce(l.legacy_count, 0))::bigint AS delta
  FROM systems s
  LEFT JOIN legacy l USING (source_system)
  LEFT JOIN unified u USING (source_system)
  ORDER BY s.source_system;
$$;

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
  v_started text;
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

  v_started := current_setting('app.ledger_soak_started_at', true);

  RETURN jsonb_build_object(
    'checked_at', now(),
    'soak_started_at', nullif(v_started, ''),
    'money_islands_green', v_money_bad = 0,
    'money_anomaly_count', v_money_bad,
    'self_ref_entry_count', v_self_ref,
    'go_for_phase_b', v_money_bad = 0 AND v_self_ref = 0,
    'islands', v_islands,
    'instructions', jsonb_build_object(
      'watch_logs', 'grep unified_dual_write status=fail for 48h',
      'functions', jsonb_build_array('rides','make-server-37f42386','toll-brain','payments','delivery'),
      'allowed_skips', jsonb_build_array(
        'neutral','zero_amount','missing_organization_id','missing_counterparty',
        'self_ref_accounts','clearing_only_unknown_party'
      )
    )
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
