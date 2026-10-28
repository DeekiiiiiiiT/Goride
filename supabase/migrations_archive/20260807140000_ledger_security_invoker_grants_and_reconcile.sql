-- Unified ledger admin feed was empty: public.ledger_* views are security_invoker,
-- but service_role/authenticated lacked USAGE/SELECT on underlying ledger.* tables.

GRANT USAGE ON SCHEMA ledger TO service_role, authenticated;
GRANT SELECT ON ledger.accounts, ledger.entries, ledger.source_receipts TO service_role, authenticated;
GRANT SELECT ON ledger.financial_events TO service_role;

GRANT USAGE ON SCHEMA rides TO service_role;
GRANT SELECT ON rides.ledger_lines TO service_role;

-- Amount totals for Dominion Unified Ledger screen
CREATE OR REPLACE FUNCTION public.ledger_reconcile_amounts()
RETURNS TABLE (
  source_system text,
  entry_count bigint,
  total_amount_minor bigint,
  currency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ledger
AS $$
  SELECT
    sr.source_system::text,
    count(*)::bigint AS entry_count,
    coalesce(sum(e.amount_minor), 0)::bigint AS total_amount_minor,
    coalesce(min(e.currency), 'JMD')::text AS currency
  FROM ledger.source_receipts sr
  JOIN ledger.entries e ON e.id = sr.ledger_entry_id
  GROUP BY sr.source_system
  ORDER BY sr.source_system;
$$;

REVOKE ALL ON FUNCTION public.ledger_reconcile_amounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_reconcile_amounts() TO service_role;

-- Island reconciliation: unified receipts vs countable legacy sources
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
           (SELECT count(*)::bigint FROM ledger.financial_events) AS legacy_count
    UNION ALL
    SELECT 'kv_ledger_event',
           (SELECT count(*)::bigint FROM public.kv_store_37f42386 WHERE key LIKE 'ledger_event:%')
    UNION ALL
    SELECT 'kv_toll_ledger',
           (SELECT count(*)::bigint FROM public.kv_store_37f42386 WHERE key LIKE 'toll_ledger:%')
    UNION ALL
    SELECT 'rides_ledger_lines',
           (SELECT count(*)::bigint FROM rides.ledger_lines)
    UNION ALL
    SELECT 'rides_payment_journal', 0::bigint
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

REVOKE ALL ON FUNCTION public.ledger_reconcile_islands() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_reconcile_islands() TO service_role;

NOTIFY pgrst, 'reload schema';
