-- Advisor remediation Phase A: zero-break locks
-- 1) Revoke client EXECUTE on trigger functions (triggers need no grant)
-- 2) Lock delivery.order_idempotency_keys (service-role only)
-- 3) Pin search_path on mutable functions from security advisor

-- ---------------------------------------------------------------------------
-- 1. Trigger function EXECUTE grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS func_name, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (
      p.proname LIKE 'trg_%'
      OR (n.nspname = 'platform' AND p.proname = 'enforce_identity_separation')
    )
    AND n.nspname IN (
      'public', 'platform', 'delivery', 'rides', 'ledger',
      'fleet', 'matching', 'freight', 'logistics', 'toll'
    )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.schema_name,
      r.func_name,
      pg_get_function_identity_arguments(r.oid)
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Idempotency keys: RLS on, no policies, no client grants
-- ---------------------------------------------------------------------------
ALTER TABLE delivery.order_idempotency_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE delivery.order_idempotency_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE delivery.order_idempotency_keys TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Pin search_path (always end with pg_temp)
-- ---------------------------------------------------------------------------
ALTER FUNCTION matching.update_updated_at()
  SET search_path = matching, pg_temp;

ALTER FUNCTION freight.sync_package_owner_org()
  SET search_path = freight, pg_temp;

ALTER FUNCTION delivery.sync_merchant_active_status()
  SET search_path = delivery, pg_temp;

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public, pg_temp;

ALTER FUNCTION ledger._infer_account_meta(text, uuid, text)
  SET search_path = ledger, pg_temp;

ALTER FUNCTION delivery.inventory_append_entry_tx(
  uuid, uuid, numeric, uuid, numeric, text, text, uuid, numeric, text, uuid
) SET search_path = delivery, pg_temp;

ALTER FUNCTION delivery.receive_purchase_order_tx(uuid, uuid, jsonb)
  SET search_path = delivery, pg_temp;

ALTER FUNCTION rides.audit_offer_accepted()
  SET search_path = rides, pg_temp;

ALTER FUNCTION delivery.refresh_inventory_balance()
  SET search_path = delivery, pg_temp;

ALTER FUNCTION public.toll_settlement_active_credits(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION delivery.deny_ledger_mutation()
  SET search_path = delivery, pg_temp;

ALTER FUNCTION delivery.inventory_variance_report(uuid, timestamptz, timestamptz)
  SET search_path = delivery, pg_temp;

ALTER FUNCTION fleet.set_updated_at()
  SET search_path = fleet, pg_temp;
