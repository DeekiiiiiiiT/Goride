-- Ephemeral scan evidence registry (14-day retention after approve/reject)

CREATE TABLE IF NOT EXISTS public.evidence_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'fuel_receipt', 'toll_receipt', 'odometer_proof', 'maintenance_invoice'
  )),
  retention_class text NOT NULL DEFAULT 'ephemeral'
    CHECK (retention_class IN ('ephemeral', 'permanent')),
  source_type text NOT NULL,
  source_id text NOT NULL,
  org_id text,
  public_url text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  delete_after timestamptz,
  deleted_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_hold', 'scheduled', 'deleted', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_evidence_files_delete_after
  ON public.evidence_files (delete_after)
  WHERE status = 'scheduled' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_files_source
  ON public.evidence_files (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_evidence_files_org
  ON public.evidence_files (org_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.evidence_files IS
  'Tracks ephemeral scan evidence with scheduled deletion after parent record resolution.';

ALTER TABLE public.evidence_files ENABLE ROW LEVEL SECURITY;

-- Service role handles writes; authenticated fleet users read org-scoped rows
CREATE POLICY evidence_files_service_all ON public.evidence_files
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY evidence_files_authenticated_read ON public.evidence_files
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ephemeral-evidence',
  'ephemeral-evidence',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;
