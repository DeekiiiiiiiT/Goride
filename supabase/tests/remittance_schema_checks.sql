-- Courier cash (Layer A′) schema drift check. Read-only: safe on production.
-- Every column below is read or written by supabase/functions/delivery/remittance/
-- or the Remittance Desk routes. If a migration adding one is never applied,
-- this raises before a courier or the desk finds out.
-- Run: supabase db query --linked -f supabase/tests/remittance_schema_checks.sql
-- When remittance code starts using a new column, add it here in the same commit.

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(r.tbl || '.' || r.col, ', ' ORDER BY r.tbl, r.col)
  INTO missing
  FROM (VALUES
    ('courier_remittance_accounts', 'courier_id'),
    ('courier_remittance_accounts', 'balance_minor'),
    ('courier_remittance_accounts', 'pause_threshold_minor'),
    ('courier_remittance_accounts', 'threshold_source'),
    ('courier_remittance_accounts', 'is_paused'),
    ('courier_remittance_accounts', 'paused_since'),
    ('courier_remittance_accounts', 'lifetime_collected_minor'),
    ('courier_remittance_accounts', 'lifetime_settled_minor'),
    ('courier_remittance_accounts', 'updated_at'),
    ('courier_remittance_exceptions', 'id'),
    ('courier_remittance_exceptions', 'order_id'),
    ('courier_remittance_exceptions', 'courier_id'),
    ('courier_remittance_exceptions', 'courier_fleet_id'),
    ('courier_remittance_exceptions', 'reason'),
    ('courier_remittance_exceptions', 'detail'),
    ('courier_remittance_exceptions', 'attempts'),
    ('courier_remittance_exceptions', 'resolved_at'),
    ('courier_remittance_exceptions', 'resolved_by'),
    ('courier_remittance_events', 'id'),
    ('courier_remittance_events', 'courier_id'),
    ('courier_remittance_events', 'idempotency_key'),
    ('courier_remittance_events', 'event_type'),
    ('courier_remittance_events', 'order_id'),
    ('courier_remittance_events', 'settlement_id'),
    ('courier_remittance_events', 'balance_before_minor'),
    ('courier_remittance_events', 'balance_after_minor'),
    ('courier_remittance_settlements', 'id'),
    ('courier_remittance_settlements', 'reference'),
    ('courier_remittance_settlements', 'courier_id'),
    ('courier_remittance_settlements', 'amount_minor'),
    ('courier_remittance_settlements', 'method'),
    ('courier_remittance_settlements', 'status'),
    ('courier_remittance_settlements', 'balance_before_minor'),
    ('courier_remittance_settlements', 'notes'),
    ('courier_remittance_settlements', 'external_ref'),
    ('courier_remittance_settlements', 'recorded_by')
  ) AS r(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'delivery'
      AND c.table_name = r.tbl
      AND c.column_name = r.col
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'remittance schema drift: missing delivery.%', missing;
  END IF;

  -- apply_remittance_event must stamp provenance on new accounts.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'delivery'
      AND p.proname = 'apply_remittance_event'
      AND pg_get_functiondef(p.oid) LIKE '%threshold_source%'
  ) THEN
    RAISE EXCEPTION 'remittance schema drift: apply_remittance_event does not set threshold_source';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courier_remittance_accounts_threshold_source_check'
  ) THEN
    RAISE EXCEPTION 'remittance schema drift: threshold_source CHECK constraint missing';
  END IF;

  RAISE NOTICE 'remittance schema check passed';
END $$;
