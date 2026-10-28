-- Wave 8–10 follow-ups: remaining security_invoker views + backup table RLS + key indexes

-- Security definer views still flagged by advisors
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname IN (
        'matching_policies',
        'matching_product_profiles',
        'fuel_product_profiles',
        'fuel_driving_sessions',
        'fuel_brain_policies',
        'fuel_unknown_reviews'
      )
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.name);
  END LOOP;
END $$;

-- Public backup table without RLS
DO $$
BEGIN
  IF to_regclass('public.kv_store_37f42386_toll_date_backup') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.kv_store_37f42386_toll_date_backup ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Indexes from RLS audit cleanup
CREATE INDEX IF NOT EXISTS idx_merchant_team_members_user_id
  ON delivery.merchant_team_members (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id
  ON public.organizations (owner_id);

DO $$
BEGIN
  IF to_regclass('ledger.financial_events') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_fin_events_org ON ledger.financial_events(organization_id) WHERE organization_id IS NOT NULL';
  END IF;
  IF to_regclass('ledger.financial_allocations') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_fin_alloc_org ON ledger.financial_allocations(organization_id) WHERE organization_id IS NOT NULL';
  END IF;
END $$;

-- Storage: ensure fleet vehicle bucket has a size limit
UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'make-37f42386-vehicles' AND file_size_limit IS NULL;

NOTIFY pgrst, 'reload schema';
