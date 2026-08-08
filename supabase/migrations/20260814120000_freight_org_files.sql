-- Enterprise org Files registry — catalog for uploaded docs/photos (POD, invoices, etc.)
-- Writes via Edge service_role only; authenticated SELECT for org owners (same as freight.documents).

CREATE TABLE IF NOT EXISTS freight.org_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bucket_id TEXT NOT NULL DEFAULT 'enterprise-freight-docs',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  byte_size BIGINT,
  kind TEXT NOT NULL CHECK (
    kind IN ('pod', 'invoice', 'bol', 'customs', 'packing_list', 'other')
  ),
  source_type TEXT,
  source_id UUID,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_freight_org_files_org_created
  ON freight.org_files (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_freight_org_files_org_kind
  ON freight.org_files (organization_id, kind)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_freight_org_files_bucket_path_active
  ON freight.org_files (bucket_id, storage_path)
  WHERE deleted_at IS NULL;

ALTER TABLE freight.org_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS freight_org_files_select ON freight.org_files;
CREATE POLICY freight_org_files_select ON freight.org_files
  FOR SELECT TO authenticated
  USING (freight.user_owns_org(organization_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS freight_org_files_no_direct_write ON freight.org_files;
CREATE POLICY freight_org_files_no_direct_write ON freight.org_files
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS freight_org_files_no_update ON freight.org_files;
CREATE POLICY freight_org_files_no_update ON freight.org_files
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS freight_org_files_no_delete ON freight.org_files;
CREATE POLICY freight_org_files_no_delete ON freight.org_files
  FOR DELETE TO authenticated USING (false);

GRANT SELECT ON freight.org_files TO authenticated;
GRANT ALL ON freight.org_files TO service_role;

-- Keep bucket private; ensure image/PDF MIME set (incl. heic already present)
UPDATE storage.buckets
SET
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]
WHERE id = 'enterprise-freight-docs';
