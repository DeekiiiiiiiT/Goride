-- TR audit closeout: authenticated SELECT-only on fuel + toll period tables.
-- Mutations go through edge/service-role; JWT clients must not PATCH state.

-- Toll period
DROP POLICY IF EXISTS toll_recon_period_org_insert ON public.toll_reconciliation_period;
DROP POLICY IF EXISTS toll_recon_period_org_update ON public.toll_reconciliation_period;
DROP POLICY IF EXISTS toll_period_audit_org_insert ON public.toll_period_audit;

-- Fuel period (same exposure pattern)
DROP POLICY IF EXISTS fuel_recon_period_org_insert ON public.fuel_reconciliation_period;
DROP POLICY IF EXISTS fuel_recon_period_org_update ON public.fuel_reconciliation_period;
DROP POLICY IF EXISTS fuel_period_audit_org_insert ON public.fuel_period_audit;
DROP POLICY IF EXISTS fuel_period_job_org_insert ON public.fuel_period_job;
DROP POLICY IF EXISTS fuel_period_job_org_update ON public.fuel_period_job;

COMMENT ON TABLE public.toll_reconciliation_period IS
  'Toll recon period SoT. Writes: service role only. Authenticated: SELECT (org-scoped).';
COMMENT ON TABLE public.fuel_reconciliation_period IS
  'Fuel recon period SoT. Writes: service role only. Authenticated: SELECT (org-scoped).';
