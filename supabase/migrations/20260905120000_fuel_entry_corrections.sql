-- Fuel entry corrections ledger (Phase 2).
-- Locked/signed fuel entries may only be mutated through an explicit correction
-- with a reason. Each correction is an append-only audit row capturing the diff
-- and the signature rotation. Replaces the old client-supplied bypassSignatureCheck.

CREATE TABLE IF NOT EXISTS public.fuel_entry_corrections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    text,
  entry_id           text NOT NULL,
  actor_id           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  reason             text NOT NULL,
  field_diffs        jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_signature text,
  new_signature      text
);

CREATE INDEX IF NOT EXISTS fuel_entry_corrections_entry_idx
  ON public.fuel_entry_corrections (entry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fuel_entry_corrections_org_idx
  ON public.fuel_entry_corrections (organization_id);

ALTER TABLE public.fuel_entry_corrections ENABLE ROW LEVEL SECURITY;

-- Edge/service-role bypasses RLS; authenticated JWT org scoped for PostgREST reads.
CREATE POLICY fuel_entry_corrections_org_select ON public.fuel_entry_corrections
  FOR SELECT TO authenticated
  USING (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY fuel_entry_corrections_org_insert ON public.fuel_entry_corrections
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

COMMENT ON TABLE public.fuel_entry_corrections IS
  'Append-only audit of corrections to locked/signed fuel entries (reason + field diff + signature rotation).';
