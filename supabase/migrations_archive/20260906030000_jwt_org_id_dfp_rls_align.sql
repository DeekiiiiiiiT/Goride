-- N-2: Shared JWT org claim helper + align DFP RLS with settlement_movements.
-- N-3 note: fleet edge money paths use service_role (bypasses RLS); org filters
-- on handlers remain the live control. This policy is defence-in-depth for
-- direct PostgREST access with a user JWT.

CREATE OR REPLACE FUNCTION public.jwt_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    TRIM(
      COALESCE(
        auth.jwt() ->> 'organization_id',
        auth.jwt() -> 'app_metadata' ->> 'organizationId',
        auth.jwt() -> 'app_metadata' ->> 'organization_id',
        auth.jwt() -> 'user_metadata' ->> 'organizationId',
        auth.jwt() -> 'user_metadata' ->> 'organization_id'
      )
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.jwt_org_id() IS
  'Normalized org id from JWT (camelCase + snake_case app/user metadata). Used by settlement RLS.';

DROP POLICY IF EXISTS dfp_org_select ON ledger.driver_financial_periods;
CREATE POLICY dfp_org_select ON ledger.driver_financial_periods
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND (
      public.rbac_is_platform_user(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = organization_id AND o.owner_id = auth.uid()
      )
      OR organization_id::text = public.jwt_org_id()
    )
  );

-- Prefer shared helper on settlement movement policies too (same claim set).
DROP POLICY IF EXISTS settlement_movements_org_select ON ledger.settlement_movements;
CREATE POLICY settlement_movements_org_select ON ledger.settlement_movements
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id AND o.owner_id = auth.uid()
    )
    OR organization_id::text = public.jwt_org_id()
  );

DROP POLICY IF EXISTS settlement_runs_org_select ON ledger.settlement_runs;
CREATE POLICY settlement_runs_org_select ON ledger.settlement_runs
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id AND o.owner_id = auth.uid()
    )
    OR organization_id::text = public.jwt_org_id()
  );

DROP POLICY IF EXISTS settlement_run_rows_org_select ON ledger.settlement_run_rows;
CREATE POLICY settlement_run_rows_org_select ON ledger.settlement_run_rows
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledger.settlement_runs r
      WHERE r.id = run_id
        AND (
          public.rbac_is_platform_user(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = r.organization_id AND o.owner_id = auth.uid()
          )
          OR r.organization_id::text = public.jwt_org_id()
        )
    )
  );

NOTIFY pgrst, 'reload schema';
