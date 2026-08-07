-- Align KV legacy island count with dual-write idempotency (logical money events).
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
SET search_path = public, ledger, rides
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
                  ) <> 0)
    UNION ALL
    SELECT 'kv_toll_ledger',
           (SELECT count(*)::bigint
            FROM public.kv_store_37f42386
            WHERE key LIKE 'toll_ledger:%'
              AND coalesce(
                    abs(nullif(value->>'amount', '')::numeric),
                    0
                  ) > 0)
    UNION ALL
    SELECT 'rides_ledger_lines',
           (SELECT count(*)::bigint FROM rides.ledger_lines)
    UNION ALL
    SELECT 'rides_payment_journal',
           (SELECT count(*)::bigint
            FROM rides.payment_journal_entries
            WHERE abs(coalesce(amount_minor, 0)) > 0)
    UNION ALL
    SELECT 'dash_payments', 0::bigint
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

NOTIFY pgrst, 'reload schema';
