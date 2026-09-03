-- Org RLS policies for fuel reconciliation period tables (NEW-4).
-- Re-versioned with 20260902210000 (past 20260902120000 collision).
-- Edge/service-role bypasses RLS; authenticated JWT org_id scoped for PostgREST.

CREATE POLICY fuel_recon_period_org_select ON public.fuel_reconciliation_period
  FOR SELECT TO authenticated
  USING (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY fuel_recon_period_org_insert ON public.fuel_reconciliation_period
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY fuel_recon_period_org_update ON public.fuel_reconciliation_period
  FOR UPDATE TO authenticated
  USING (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  )
  WITH CHECK (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY fuel_period_audit_org_select ON public.fuel_period_audit
  FOR SELECT TO authenticated
  USING (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY fuel_period_audit_org_insert ON public.fuel_period_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY fuel_period_job_org_select ON public.fuel_period_job
  FOR SELECT TO authenticated
  USING (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY fuel_period_job_org_insert ON public.fuel_period_job
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY fuel_period_job_org_update ON public.fuel_period_job
  FOR UPDATE TO authenticated
  USING (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  )
  WITH CHECK (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

COMMENT ON POLICY fuel_recon_period_org_select ON public.fuel_reconciliation_period IS
  'Fleet org members read only their fuel reconciliation periods';
