-- Fuel exception assignments (Full Tanks exception queue).
-- Org-visible notes keyed by cycle_id. Writes via edge/service role only.

CREATE TABLE IF NOT EXISTS public.fuel_exception_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    text NOT NULL,
  cycle_id           text NOT NULL,
  note               text NOT NULL DEFAULT '',
  assigned_to        text,
  assigned_by        text,
  assigned_at        timestamptz NOT NULL DEFAULT now(),
  status             text NOT NULL DEFAULT 'open',
  UNIQUE (organization_id, cycle_id)
);

CREATE INDEX IF NOT EXISTS fuel_exception_assignments_org_idx
  ON public.fuel_exception_assignments (organization_id);

CREATE INDEX IF NOT EXISTS fuel_exception_assignments_cycle_idx
  ON public.fuel_exception_assignments (cycle_id);

ALTER TABLE public.fuel_exception_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY fuel_exception_assignments_org_select ON public.fuel_exception_assignments
  FOR SELECT TO authenticated
  USING (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

COMMENT ON TABLE public.fuel_exception_assignments IS
  'Exception queue assignments for Full Tank cycles. SELECT: org JWT. INSERT/UPDATE: service role / edge only.';
