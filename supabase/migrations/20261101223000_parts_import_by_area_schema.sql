-- Parts import by area: ledger, staging, change log, templates, area contract (audit Rev 2)

ALTER TABLE public.part_category
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.maintenance_service_categories (id);

COMMENT ON COLUMN public.part_category.area_id IS 'Maps this PCdb-style category to a maintenance system (kind=system). Import derives category_id from part type area.';

-- Link existing categories to systems where slug/name align; insert missing area categories.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('brake', 'Brakes'),
      ('engine', 'Engine'),
      ('transmission', 'Transmission'),
      ('suspension', 'Suspension & steering'),
      ('electrical', 'Battery & electrical'),
      ('lighting', 'Lighting & visibility'),
      ('cooling', 'Engine'),
      ('body', 'Engine'),
      ('cabin', 'HVAC'),
      ('general', 'Engine')
    ) AS m(slug, system_name)
  LOOP
    UPDATE public.part_category pc
    SET area_id = sys.id
    FROM public.maintenance_service_categories sys
    WHERE pc.slug = r.slug
      AND sys.kind = 'system'
      AND coalesce(sys.plain_name, sys.name) = r.system_name;
  END LOOP;

  FOR r IN
    SELECT sys.id AS area_id, sys.plain_name, sys.name, sys.op_code
    FROM public.maintenance_service_categories sys
    WHERE sys.kind = 'system'
      AND NOT EXISTS (
        SELECT 1 FROM public.part_category pc WHERE pc.area_id = sys.id
      )
  LOOP
    INSERT INTO public.part_category (label, slug, sort_order, area_id)
    VALUES (
      coalesce(r.plain_name, r.name),
      lower(regexp_replace(coalesce(r.op_code, r.name), '[^a-zA-Z0-9]+', '-', 'g')),
      100,
      r.area_id
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.part_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  source_batch_id uuid REFERENCES public.part_import_batch (id),
  area_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id),
  template_version int NOT NULL DEFAULT 1,
  file_name text,
  file_sha256 text,
  file_bytes int,
  storage_path text,
  status text NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'checking', 'checked', 'promoting', 'imported', 'undone', 'failed', 'cancelled')
  ),
  rows_total int NOT NULL DEFAULT 0,
  rows_valid int NOT NULL DEFAULT 0,
  rows_labelled int NOT NULL DEFAULT 0,
  rows_error int NOT NULL DEFAULT 0,
  rows_duplicate int NOT NULL DEFAULT 0,
  rows_unchanged int NOT NULL DEFAULT 0,
  rows_checked int NOT NULL DEFAULT 0,
  parts_created int NOT NULL DEFAULT 0,
  parts_updated int NOT NULL DEFAULT 0,
  fits_created int NOT NULL DEFAULT 0,
  fits_updated int NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users (id),
  promoted_by uuid REFERENCES auth.users (id),
  undone_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  promoted_at timestamptz,
  undone_at timestamptz,
  failure_message text,
  refresh_warning text
);

CREATE UNIQUE INDEX IF NOT EXISTS part_import_batch_area_sha_imported
  ON public.part_import_batch (area_id, file_sha256)
  WHERE status = 'imported' AND file_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.part_import_row (
  batch_id uuid NOT NULL REFERENCES public.part_import_batch (id) ON DELETE CASCADE,
  line_no int NOT NULL,
  raw jsonb NOT NULL,
  normalized jsonb,
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog (id),
  part_type_id uuid REFERENCES public.maintenance_service_categories (id),
  existing_part_id uuid REFERENCES public.part_master (id),
  existing_group_id uuid,
  replaces_part_id uuid REFERENCES public.part_master (id),
  action text CHECK (action IN ('create_part', 'update_part', 'add_fit', 'update_fit', 'unchanged', 'skip')),
  status text CHECK (status IN ('valid', 'labelled', 'error', 'duplicate', 'unchanged')),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepted boolean NOT NULL DEFAULT true,
  existing_line_no int,
  PRIMARY KEY (batch_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.part_import_change (
  id bigserial PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.part_import_batch (id),
  line_no int,
  table_name text NOT NULL CHECK (table_name IN ('part_master', 'part_listing', 'part_interchange_group', 'universal_part')),
  row_id uuid NOT NULL,
  op text NOT NULL CHECK (op IN ('insert', 'update')),
  before jsonb,
  after jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS part_import_change_batch_idx ON public.part_import_change (batch_id);

CREATE TABLE IF NOT EXISTS public.part_import_template (
  area_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id),
  version int NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_part_type_ids uuid[] NOT NULL DEFAULT '{}',
  example_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  help_lines text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (area_id, version)
);

ALTER TABLE public.part_import_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_import_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_import_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_import_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS part_import_batch_no_direct ON public.part_import_batch;
CREATE POLICY part_import_batch_no_direct ON public.part_import_batch FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS part_import_row_no_direct ON public.part_import_row;
CREATE POLICY part_import_row_no_direct ON public.part_import_row FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS part_import_change_no_direct ON public.part_import_change;
CREATE POLICY part_import_change_no_direct ON public.part_import_change FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS part_import_template_no_direct ON public.part_import_template;
CREATE POLICY part_import_template_no_direct ON public.part_import_template FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.part_import_batch FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.part_import_row FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.part_import_change FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.part_import_template FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_import_batch TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_import_row TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_import_change TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_import_template TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.part_import_change_id_seq TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('parts-imports', 'parts-imports', false, 5242880)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 5242880, public = false;

DROP POLICY IF EXISTS parts_imports_service ON storage.objects;
CREATE POLICY parts_imports_service ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'parts-imports')
  WITH CHECK (bucket_id = 'parts-imports');

-- Back-fill the single legacy import batch (Oct 2025) into the ledger as Brakes when fits exist.
INSERT INTO public.part_import_batch (
  id,
  code,
  area_id,
  template_version,
  file_name,
  status,
  rows_total,
  rows_valid,
  parts_created,
  fits_created,
  promoted_at,
  created_at
)
SELECT
  pl.import_batch_id,
  'IMP-LEGACY-BRK-' || substr(replace(pl.import_batch_id::text, '-', ''), 1, 8),
  (SELECT id FROM public.maintenance_service_categories WHERE id = 'b1000000-0000-4000-8000-000000000004'::uuid),
  1,
  'legacy-import.csv',
  'imported',
  count(*)::int,
  count(*)::int,
  count(DISTINCT pm.id)::int,
  count(*)::int,
  min(pl.verified_at),
  min(pl.verified_at)
FROM public.part_listing pl
JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
WHERE pl.import_batch_id IS NOT NULL
GROUP BY pl.import_batch_id
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE VIEW public.part_import_ledger_by_area AS
SELECT
  b.id,
  b.code,
  b.area_id,
  coalesce(sys.plain_name, sys.name) AS area_name,
  b.file_name,
  b.file_sha256,
  b.status,
  b.rows_total,
  b.rows_valid,
  b.rows_labelled,
  b.rows_error,
  b.rows_duplicate,
  b.rows_unchanged,
  b.parts_created,
  b.parts_updated,
  b.fits_created,
  b.fits_updated,
  b.uploaded_by,
  b.promoted_by,
  b.undone_by,
  b.created_at,
  b.checked_at,
  b.promoted_at,
  b.undone_at,
  b.refresh_warning,
  b.source_batch_id,
  (
    b.status = 'imported'
    AND b.promoted_at IS NOT NULL
    AND b.promoted_at > now() - interval '72 hours'
  ) AS can_undo
FROM public.part_import_batch b
JOIN public.maintenance_service_categories sys ON sys.id = b.area_id;

REVOKE ALL ON public.part_import_ledger_by_area FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.part_import_ledger_by_area TO service_role;
