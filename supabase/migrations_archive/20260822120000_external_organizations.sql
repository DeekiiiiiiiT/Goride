-- Off-platform partners: placeholder orgs that can sit on warehouse_courier_links
-- but can never log in. created_by_org_id is the Roam customer that added them.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS created_by_org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS external_contact JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.organizations
  ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_external_owner_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_external_owner_check
  CHECK (
    (is_external = false AND owner_id IS NOT NULL)
    OR (is_external = true AND created_by_org_id IS NOT NULL AND owner_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_organizations_external_creator
  ON public.organizations (created_by_org_id)
  WHERE is_external = true;

COMMENT ON COLUMN public.organizations.is_external IS
  'Placeholder partner with no login. Visible only to the org that created it (and platform staff).';

DROP POLICY IF EXISTS "Creators can view their external organizations" ON public.organizations;
CREATE POLICY "Creators can view their external organizations"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    is_external = true
    AND created_by_org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organizations mine
      WHERE mine.id = organizations.created_by_org_id
        AND mine.owner_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
