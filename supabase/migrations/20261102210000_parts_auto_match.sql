-- Parts auto-matching (audit Rev 7) — single migration
-- AM-18 runbook — engine rule change:
--   1. Bump public.part_match_engine_version() return value in a new migration.
--   2. Run SELECT public.part_match_recompute(NULL, NULL); (archives changed/removed rows first).
-- AM-18 runbook — normalizer change:
--   1. Bump norm version + re-normalize *_norm columns in one migration.
--   2. Supersede open conflicts on old engine_version; queue full recompute.

-- ---------------------------------------------------------------------------
-- Shared constants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.part_match_engine_version()
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 1;
$$;

CREATE OR REPLACE FUNCTION public.part_norm_position_version()
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 1;
$$;

CREATE OR REPLACE FUNCTION public.part_import_norm_version()
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 1;
$$;

CREATE OR REPLACE FUNCTION public.parts_auto_match_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT pf.enabled FROM public.platform_feature_flags pf WHERE pf.name = 'parts_auto_match_enabled'),
    false
  );
$$;

INSERT INTO public.platform_feature_flags (name, enabled)
VALUES ('parts_auto_match_enabled', false)
ON CONFLICT (name) DO NOTHING;

REVOKE ALL ON FUNCTION public.part_match_engine_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_norm_position_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_norm_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parts_auto_match_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_engine_version() TO service_role;
GRANT EXECUTE ON FUNCTION public.part_norm_position_version() TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_norm_version() TO service_role;
GRANT EXECUTE ON FUNCTION public.parts_auto_match_enabled() TO service_role;

-- ---------------------------------------------------------------------------
-- AM-14: part_norm_position, part_side_covers, backfill (6 steps)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.part_norm_position(
  p_position text,
  p_side text DEFAULT NULL
)
RETURNS TABLE (norm_position text, norm_side text)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_pos text := upper(btrim(coalesce(p_position, '')));
  v_side_in text := lower(btrim(coalesce(p_side, '')));
  v_out_pos text;
  v_out_side text;
BEGIN
  IF v_pos = '' THEN
    norm_position := NULL;
    norm_side := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_out_side := CASE WHEN v_side_in IN ('left', 'right', 'both') THEN v_side_in ELSE NULL END;

  IF v_pos IN ('FRONT', 'F') THEN
    v_out_pos := 'front';
  ELSIF v_pos = 'REAR' THEN
    v_out_pos := 'rear';
  ELSIF v_pos IN ('FL', 'FRONT LEFT', 'FRONTLEFT') THEN
    v_out_pos := 'front';
    v_out_side := coalesce(v_out_side, 'left');
  ELSIF v_pos IN ('FR', 'FRONT RIGHT', 'FRONTRIGHT') THEN
    v_out_pos := 'front';
    v_out_side := coalesce(v_out_side, 'right');
  ELSIF v_pos IN ('RL', 'REAR LEFT', 'REARLEFT') THEN
    v_out_pos := 'rear';
    v_out_side := coalesce(v_out_side, 'left');
  ELSIF v_pos IN ('RR', 'REAR RIGHT', 'REARRIGHT') THEN
    v_out_pos := 'rear';
    v_out_side := coalesce(v_out_side, 'right');
  ELSIF v_pos IN ('L', 'LEFT') THEN
    v_out_pos := NULL;
    v_out_side := coalesce(v_out_side, 'left');
  ELSIF v_pos IN ('R', 'RIGHT') THEN
    v_out_pos := NULL;
    v_out_side := coalesce(v_out_side, 'right');
  ELSIF v_pos IN ('FRONT BOTH', 'BOTH') OR (v_pos LIKE '%FRONT%' AND v_pos LIKE '%BOTH%') THEN
    v_out_pos := 'front';
    v_out_side := coalesce(v_out_side, 'both');
  ELSE
    v_out_pos := NULL;
    v_out_side := NULL;
  END IF;

  IF v_out_pos IS NULL THEN
    v_out_side := NULL;
  END IF;

  norm_position := v_out_pos;
  norm_side := v_out_side;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_norm_position(p_combined text)
RETURNS TABLE (norm_position text, norm_side text)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT n.norm_position, n.norm_side
  FROM public.part_norm_position(p_combined, NULL::text) AS n;
$$;

CREATE OR REPLACE FUNCTION public.part_side_covers(
  p_data_position text,
  p_data_side text,
  p_query_position text,
  p_query_side text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    (p_data_position IS NULL OR p_data_position IS NOT DISTINCT FROM p_query_position)
    AND (
      p_data_side IS NULL
      OR p_data_side IS NOT DISTINCT FROM p_query_side
      OR (p_data_side = 'both' AND p_query_side IN ('left', 'right'))
    );
$$;

CREATE OR REPLACE FUNCTION public.part_listing_exclusion_blocks(
  p_group uuid,
  p_car uuid,
  p_position text,
  p_side text,
  p_match_year integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.part_listing_exclusion ex
    WHERE ex.interchange_group_id = p_group
      AND ex.vehicle_catalog_id = p_car
      AND public.part_side_covers(ex.position, ex.side, p_position, p_side)
      AND (ex.year_from IS NULL OR p_match_year IS NULL OR p_match_year >= ex.year_from)
      AND (ex.year_to IS NULL OR p_match_year IS NULL OR p_match_year <= ex.year_to)
  );
$$;

REVOKE ALL ON FUNCTION public.part_norm_position(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_norm_position(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_side_covers(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_listing_exclusion_blocks(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_norm_position(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_norm_position(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_side_covers(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_listing_exclusion_blocks(uuid, uuid, text, text, integer) TO service_role;

ALTER TABLE public.part_listing_exclusion
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS side text,
  ADD COLUMN IF NOT EXISTS year_from integer,
  ADD COLUMN IF NOT EXISTS year_to integer;

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.part_listing;
  RAISE NOTICE 'part_listing row count before AM-14 backfill: %', v_count;
  IF v_count > 100000 THEN
    RAISE EXCEPTION 'part_listing has % rows; build AM-14 indexes with CONCURRENTLY in a separate migration', v_count;
  END IF;
END $$;

CREATE TABLE public.part_norm_position_backfill_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL CHECK (table_name IN ('part_listing', 'part_listing_exclusion', 'part_import_row')),
  row_id uuid NOT NULL,
  original_position text,
  original_side text,
  reason text NOT NULL CHECK (reason IN ('unmapped', 'duplicate_after_normalization')),
  survivor_id uuid,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users (id),
  resolution_source text CHECK (resolution_source IS NULL OR resolution_source IN ('manual', 'listing_edit')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.part_norm_position_backfill_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY part_norm_position_backfill_report_deny ON public.part_norm_position_backfill_report
  USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.part_norm_position_backfill_report FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.part_norm_position_backfill_report TO service_role;

ALTER TABLE public.part_listing
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.part_listing pl
SET created_at = pl.verified_at
WHERE pl.created_at IS NULL;

ALTER TABLE public.part_listing
  ALTER COLUMN created_at SET DEFAULT now();

UPDATE public.part_listing pl
SET created_at = now()
WHERE pl.created_at IS NULL;

ALTER TABLE public.part_listing
  ALTER COLUMN created_at SET NOT NULL;

CREATE TEMP TABLE _am14_norm_listing ON COMMIT DROP AS
SELECT
  pl.id,
  pl.interchange_group_id,
  pl.vehicle_catalog_id,
  pl.position AS orig_position,
  pl.side AS orig_side,
  n.norm_position,
  n.norm_side
FROM public.part_listing pl
CROSS JOIN LATERAL public.part_norm_position(pl.position, pl.side) AS n;

INSERT INTO public.part_norm_position_backfill_report (
  table_name, row_id, original_position, original_side, reason
)
SELECT
  'part_listing',
  t.id,
  t.orig_position,
  t.orig_side,
  'unmapped'
FROM _am14_norm_listing t
WHERE btrim(coalesce(t.orig_position, '')) <> ''
  AND t.norm_position IS NULL
  AND t.norm_side IS NULL;

CREATE TEMP TABLE _am14_dup_listing ON COMMIT DROP AS
SELECT t.id AS drop_id, s.id AS survivor_id
FROM _am14_norm_listing t
JOIN LATERAL (
  SELECT x.id
  FROM _am14_norm_listing x
  JOIN public.part_listing pl ON pl.id = x.id
  WHERE x.interchange_group_id = t.interchange_group_id
    AND x.vehicle_catalog_id = t.vehicle_catalog_id
    AND x.norm_position IS NOT DISTINCT FROM t.norm_position
    AND x.norm_side IS NOT DISTINCT FROM t.norm_side
  ORDER BY pl.created_at NULLS FIRST, pl.id
  LIMIT 1
) s ON true
WHERE t.id <> s.id;

INSERT INTO public.part_norm_position_backfill_report (
  table_name, row_id, original_position, original_side, reason, survivor_id
)
SELECT
  'part_listing',
  d.drop_id,
  t.orig_position,
  t.orig_side,
  'duplicate_after_normalization',
  d.survivor_id
FROM _am14_dup_listing d
JOIN _am14_norm_listing t ON t.id = d.drop_id;

DELETE FROM public.part_listing pl
USING _am14_dup_listing d
WHERE pl.id = d.drop_id;

UPDATE public.part_listing pl
SET position = t.norm_position,
    side = t.norm_side
FROM _am14_norm_listing t
WHERE pl.id = t.id;

CREATE TEMP TABLE _am14_norm_excl ON COMMIT DROP AS
SELECT
  ex.id,
  ex.interchange_group_id,
  ex.vehicle_catalog_id,
  ex.year_from,
  ex.year_to,
  ex.position AS orig_position,
  ex.side AS orig_side,
  n.norm_position,
  n.norm_side
FROM public.part_listing_exclusion ex
CROSS JOIN LATERAL public.part_norm_position(ex.position, ex.side) AS n;

INSERT INTO public.part_norm_position_backfill_report (
  table_name, row_id, original_position, original_side, reason
)
SELECT
  'part_listing_exclusion',
  t.id,
  t.orig_position,
  t.orig_side,
  'unmapped'
FROM _am14_norm_excl t
WHERE btrim(coalesce(t.orig_position, '')) <> ''
  AND t.norm_position IS NULL
  AND t.norm_side IS NULL;

CREATE TEMP TABLE _am14_dup_excl ON COMMIT DROP AS
SELECT t.id AS drop_id, s.id AS survivor_id
FROM _am14_norm_excl t
JOIN LATERAL (
  SELECT x.id
  FROM _am14_norm_excl x
  JOIN public.part_listing_exclusion ex ON ex.id = x.id
  WHERE x.interchange_group_id = t.interchange_group_id
    AND x.vehicle_catalog_id = t.vehicle_catalog_id
    AND x.norm_position IS NOT DISTINCT FROM t.norm_position
    AND x.norm_side IS NOT DISTINCT FROM t.norm_side
    AND x.year_from IS NOT DISTINCT FROM t.year_from
    AND x.year_to IS NOT DISTINCT FROM t.year_to
  ORDER BY ex.created_at NULLS FIRST, x.id
  LIMIT 1
) s ON true
WHERE t.id <> s.id;

INSERT INTO public.part_norm_position_backfill_report (
  table_name, row_id, original_position, original_side, reason, survivor_id
)
SELECT
  'part_listing_exclusion',
  d.drop_id,
  t.orig_position,
  t.orig_side,
  'duplicate_after_normalization',
  d.survivor_id
FROM _am14_dup_excl d
JOIN _am14_norm_excl t ON t.id = d.drop_id;

DELETE FROM public.part_listing_exclusion ex
USING _am14_dup_excl d
WHERE ex.id = d.drop_id;

UPDATE public.part_listing_exclusion ex
SET position = t.norm_position,
    side = t.norm_side
FROM _am14_norm_excl t
WHERE ex.id = t.id;

CREATE TEMP TABLE _am14_norm_import ON COMMIT DROP AS
SELECT
  r.id,
  r.raw,
  r.normalized,
  n.norm_position,
  n.norm_side
FROM public.part_import_row r
CROSS JOIN LATERAL public.part_norm_position(
  r.raw->>'position',
  coalesce(r.raw->>'side', r.normalized->>'side')
) AS n;

INSERT INTO public.part_norm_position_backfill_report (
  table_name, row_id, original_position, original_side, reason
)
SELECT
  'part_import_row',
  t.id,
  t.raw->>'position',
  coalesce(t.raw->>'side', t.normalized->>'side'),
  'unmapped'
FROM _am14_norm_import t
WHERE btrim(coalesce(t.raw->>'position', '')) <> ''
  AND t.norm_position IS NULL
  AND t.norm_side IS NULL;

UPDATE public.part_import_row r
SET normalized = coalesce(r.normalized, '{}'::jsonb)
  || jsonb_build_object(
    'position', t.norm_position,
    'side', t.norm_side
  )
FROM _am14_norm_import t
WHERE r.id = t.id
  AND (
    t.norm_position IS DISTINCT FROM r.normalized->>'position'
    OR t.norm_side IS DISTINCT FROM r.normalized->>'side'
  );

DROP INDEX IF EXISTS public.part_listing_variant_position;

CREATE UNIQUE INDEX part_listing_group_car_position_side
  ON public.part_listing (interchange_group_id, vehicle_catalog_id, position, side)
  NULLS NOT DISTINCT;

ALTER TABLE public.part_listing DROP CONSTRAINT IF EXISTS part_listing_side_check;
ALTER TABLE public.part_listing DROP CONSTRAINT IF EXISTS part_listing_position_check;
ALTER TABLE public.part_listing DROP CONSTRAINT IF EXISTS part_listing_position_side_pair_check;

ALTER TABLE public.part_listing
  ADD CONSTRAINT part_listing_position_check
  CHECK (position IS NULL OR position IN ('front', 'rear')) NOT VALID;

ALTER TABLE public.part_listing
  ADD CONSTRAINT part_listing_side_check
  CHECK (side IS NULL OR side IN ('left', 'right', 'both')) NOT VALID;

ALTER TABLE public.part_listing
  ADD CONSTRAINT part_listing_position_side_pair_check
  CHECK (side IS NULL OR position IS NOT NULL) NOT VALID;

ALTER TABLE public.part_listing VALIDATE CONSTRAINT part_listing_position_check;
ALTER TABLE public.part_listing VALIDATE CONSTRAINT part_listing_side_check;
ALTER TABLE public.part_listing VALIDATE CONSTRAINT part_listing_position_side_pair_check;

-- ---------------------------------------------------------------------------
-- AM-01–04, AM-15: new master tables (Rule 8)
-- ---------------------------------------------------------------------------

CREATE TABLE public.vehicle_oe_number (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE,
  maintenance_component_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE RESTRICT,
  position text CHECK (position IS NULL OR position IN ('front', 'rear')),
  side text CHECK (side IS NULL OR side IN ('left', 'right', 'both')),
  year_from integer,
  year_to integer,
  oe_brand text NOT NULL,
  oe_number text NOT NULL,
  oe_number_norm text NOT NULL,
  norm_version integer NOT NULL DEFAULT 1,
  evidence_url text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_oe_number_side_needs_position CHECK (side IS NULL OR position IS NOT NULL),
  CONSTRAINT vehicle_oe_number_evidence_check CHECK (btrim(evidence_url) <> '')
);

CREATE UNIQUE INDEX vehicle_oe_number_natural_key
  ON public.vehicle_oe_number (
    vehicle_catalog_id,
    maintenance_component_id,
    position,
    side,
    oe_number_norm
  ) NULLS NOT DISTINCT;

CREATE INDEX vehicle_oe_number_norm_idx ON public.vehicle_oe_number (oe_number_norm);

CREATE TABLE public.part_oe_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  reference_type text NOT NULL CHECK (reference_type IN ('replaces', 'cross_ref')),
  oe_brand text NOT NULL,
  oe_number text NOT NULL,
  oe_number_norm text NOT NULL,
  norm_version integer NOT NULL DEFAULT 1,
  evidence_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL,
  CONSTRAINT part_oe_reference_evidence_check CHECK (btrim(evidence_url) <> '')
);

CREATE UNIQUE INDEX part_oe_reference_part_norm ON public.part_oe_reference (part_id, oe_number_norm);
CREATE INDEX part_oe_reference_norm_idx ON public.part_oe_reference (oe_number_norm);

CREATE TABLE public.part_index_number (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  index_type text NOT NULL CHECK (index_type IN ('wva', 'fmsi')),
  value text NOT NULL,
  value_norm text NOT NULL,
  wear_sensor text NOT NULL DEFAULT 'none' CHECK (wear_sensor IN ('none', 'integrated', 'separate')),
  evidence_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL,
  CONSTRAINT part_index_number_evidence_check CHECK (btrim(evidence_url) <> '')
);

CREATE UNIQUE INDEX part_index_number_part_type_norm
  ON public.part_index_number (part_id, index_type, value_norm);

CREATE TABLE public.part_approval (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  approval_type text NOT NULL CHECK (approval_type IN ('ece_r90')),
  value text NOT NULL,
  value_norm text NOT NULL,
  evidence_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL,
  CONSTRAINT part_approval_evidence_check CHECK (btrim(evidence_url) <> '')
);

CREATE UNIQUE INDEX part_approval_part_type_norm ON public.part_approval (part_id, approval_type, value_norm);
COMMENT ON TABLE public.part_approval IS 'Information only; never used by auto-match rules.';

CREATE TABLE public.oe_number_supersession (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oe_brand text NOT NULL,
  from_norm text NOT NULL,
  to_norm text NOT NULL,
  fully_interchangeable boolean NOT NULL DEFAULT false,
  evidence_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL,
  CONSTRAINT oe_number_supersession_distinct CHECK (from_norm <> to_norm)
);

CREATE UNIQUE INDEX oe_number_supersession_brand_from_to
  ON public.oe_number_supersession (oe_brand, from_norm, to_norm);

CREATE TABLE public.platform_component_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_a_id uuid NOT NULL REFERENCES public.vehicle_platform (id) ON DELETE CASCADE,
  platform_b_id uuid NOT NULL REFERENCES public.vehicle_platform (id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('component', 'system')),
  maintenance_component_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE RESTRICT,
  position text CHECK (position IS NULL OR position IN ('front', 'rear')),
  side text CHECK (side IS NULL OR side IN ('left', 'right', 'both')),
  platform_a_year_from integer,
  platform_a_year_to integer,
  platform_b_year_from integer,
  platform_b_year_to integer,
  evidence_url text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL,
  CONSTRAINT platform_component_link_distinct CHECK (platform_a_id <> platform_b_id),
  CONSTRAINT platform_component_link_side_needs_position CHECK (side IS NULL OR position IS NOT NULL),
  CONSTRAINT platform_component_link_evidence_check CHECK (btrim(evidence_url) <> '')
);

CREATE UNIQUE INDEX platform_component_link_natural
  ON public.platform_component_link (
    LEAST(platform_a_id, platform_b_id),
    GREATEST(platform_a_id, platform_b_id),
    scope,
    maintenance_component_id,
    position,
    side
  ) NULLS NOT DISTINCT;

ALTER TABLE public.part_master
  ADD COLUMN IF NOT EXISTS oem_part_number_norm_version integer NOT NULL DEFAULT 1;

UPDATE public.part_master
SET oem_part_number_norm_version = public.part_import_norm_version()
WHERE oem_part_number_norm_version IS DISTINCT FROM public.part_import_norm_version();

-- Rule 8 grants for AM-01..04, AM-15 tables
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'vehicle_oe_number',
    'part_oe_reference',
    'part_index_number',
    'part_approval',
    'oe_number_supersession',
    'platform_component_link'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('DROP POLICY IF EXISTS %I_deny ON public.%I', r, r);
    EXECUTE format(
      'CREATE POLICY %I_deny ON public.%I USING (false) WITH CHECK (false)',
      r, r
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', r);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- AM-10: conflicts, listing origin, extended exclusions
-- ---------------------------------------------------------------------------

ALTER TABLE public.part_listing
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS derived_fit_id uuid;

UPDATE public.part_listing
SET origin = CASE
  WHEN import_batch_id IS NOT NULL THEN 'import'
  ELSE 'manual'
END
WHERE origin IS NULL;

ALTER TABLE public.part_listing
  ALTER COLUMN origin SET DEFAULT 'manual';

ALTER TABLE public.part_listing DROP CONSTRAINT IF EXISTS part_listing_origin_check;
ALTER TABLE public.part_listing
  ADD CONSTRAINT part_listing_origin_check
  CHECK (origin IN ('manual', 'import', 'auto_match_kept'));

ALTER TABLE public.part_listing_exclusion
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id);

ALTER TABLE public.part_listing_exclusion DROP CONSTRAINT IF EXISTS part_listing_exclusion_source_check;
ALTER TABLE public.part_listing_exclusion
  ADD CONSTRAINT part_listing_exclusion_source_check
  CHECK (source IN ('manual', 'auto_match_removed'));

COMMENT ON TABLE public.part_listing_exclusion IS
  'Blocks listed and derived fits for a group on a car (position/side/year scoped; all null = whole car).';

ALTER TABLE public.part_listing_exclusion DROP CONSTRAINT IF EXISTS part_listing_exclusion_group_car_key;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'part_listing_exclusion'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ~ 'UNIQUE \(interchange_group_id, vehicle_catalog_id\)'
  LOOP
    EXECUTE format('ALTER TABLE public.part_listing_exclusion DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS public.part_listing_exclusion_interchange_group_id_vehicle_catalog_id_idx;

CREATE UNIQUE INDEX part_listing_exclusion_scoped_key
  ON public.part_listing_exclusion (
    interchange_group_id,
    vehicle_catalog_id,
    position,
    side,
    year_from,
    year_to
  ) NULLS NOT DISTINCT;

ALTER TABLE public.part_listing_exclusion DROP CONSTRAINT IF EXISTS part_listing_exclusion_evidence_check;
ALTER TABLE public.part_listing_exclusion
  ADD CONSTRAINT part_listing_exclusion_position_check
  CHECK (position IS NULL OR position IN ('front', 'rear')) NOT VALID;
ALTER TABLE public.part_listing_exclusion
  ADD CONSTRAINT part_listing_exclusion_side_check
  CHECK (side IS NULL OR side IN ('left', 'right', 'both')) NOT VALID;
ALTER TABLE public.part_listing_exclusion
  ADD CONSTRAINT part_listing_exclusion_position_side_pair_check
  CHECK (side IS NULL OR position IS NOT NULL) NOT VALID;
ALTER TABLE public.part_listing_exclusion
  ADD CONSTRAINT part_listing_exclusion_evidence_check
  CHECK (
    (source = 'auto_match_removed' AND btrim(coalesce(reason, '')) <> '')
    OR (source <> 'auto_match_removed' AND btrim(coalesce(evidence_url, '')) <> '')
  ) NOT VALID;
ALTER TABLE public.part_listing_exclusion VALIDATE CONSTRAINT part_listing_exclusion_position_check;
ALTER TABLE public.part_listing_exclusion VALIDATE CONSTRAINT part_listing_exclusion_side_check;
ALTER TABLE public.part_listing_exclusion VALIDATE CONSTRAINT part_listing_exclusion_position_side_pair_check;
ALTER TABLE public.part_listing_exclusion VALIDATE CONSTRAINT part_listing_exclusion_evidence_check;

CREATE SEQUENCE public.part_match_conflict_code_seq;

CREATE TABLE public.part_match_conflict (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL DEFAULT (
    'CNF-' || lpad(nextval('public.part_match_conflict_code_seq')::text, 6, '0')
  ),
  conflict_type text NOT NULL CHECK (conflict_type IN (
    'oe_ambiguous',
    'part_type_mismatch',
    'position_side_mismatch',
    'index_wear_sensor',
    'index_merge_proposed',
    'system_link'
  )),
  interchange_group_id uuid REFERENCES public.part_interchange_group (id) ON DELETE CASCADE,
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE,
  part_id uuid REFERENCES public.part_master (id) ON DELETE CASCADE,
  platform_component_link_id uuid REFERENCES public.platform_component_link (id) ON DELETE CASCADE,
  matched_key text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  vehicle_oe_number_id uuid REFERENCES public.vehicle_oe_number (id) ON DELETE SET NULL,
  part_listing_id uuid REFERENCES public.part_listing (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'kept', 'removed', 'superseded')),
  resolution_note text,
  resolved_by uuid REFERENCES auth.users (id),
  resolved_at timestamptz,
  engine_version integer NOT NULL DEFAULT 1,
  computed_at timestamptz NOT NULL DEFAULT now(),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id)
);

CREATE UNIQUE INDEX part_match_conflict_open_key
  ON public.part_match_conflict (
    conflict_type,
    interchange_group_id,
    vehicle_catalog_id,
    part_id,
    platform_component_link_id,
    matched_key
  ) NULLS NOT DISTINCT
  WHERE status = 'open';

ALTER TABLE public.part_match_conflict ENABLE ROW LEVEL SECURITY;
CREATE POLICY part_match_conflict_deny ON public.part_match_conflict USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.part_match_conflict FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.part_match_conflict TO service_role;

-- derived_fit_id FK added after part_fit_derived (AM-05)

-- ---------------------------------------------------------------------------
-- AM-05, AM-11, AM-12, AM-13, AM-18: engine storage
-- ---------------------------------------------------------------------------

CREATE TABLE public.part_fit_derived (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interchange_group_id uuid NOT NULL REFERENCES public.part_interchange_group (id) ON DELETE CASCADE,
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE,
  position text CHECK (position IS NULL OR position IN ('front', 'rear')),
  side text CHECK (side IS NULL OR side IN ('left', 'right', 'both')),
  year_from integer,
  year_to integer,
  rule text NOT NULL CHECK (rule IN ('oe_number')),
  matched_keys text[] NOT NULL DEFAULT '{}'::text[],
  vehicle_oe_number_id uuid REFERENCES public.vehicle_oe_number (id) ON DELETE CASCADE,
  part_oe_reference_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  reason_code text NOT NULL,
  reason_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('live', 'needs_checking', 'suppressed')),
  engine_version integer NOT NULL DEFAULT 1,
  computed_at timestamptz NOT NULL DEFAULT now(),
  checking_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL,
  CONSTRAINT part_fit_derived_side_needs_position CHECK (side IS NULL OR position IS NOT NULL)
);

CREATE UNIQUE INDEX part_fit_derived_natural_key
  ON public.part_fit_derived (
    interchange_group_id,
    vehicle_catalog_id,
    position,
    side,
    rule
  ) NULLS NOT DISTINCT;

CREATE TABLE public.part_fit_derived_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  derived_id uuid NOT NULL,
  interchange_group_id uuid NOT NULL,
  vehicle_catalog_id uuid NOT NULL,
  position text,
  side text,
  year_from integer,
  year_to integer,
  rule text NOT NULL,
  matched_keys text[] NOT NULL,
  vehicle_oe_number_id uuid,
  part_oe_reference_ids uuid[] NOT NULL,
  reason_code text NOT NULL,
  reason_params jsonb NOT NULL,
  status text NOT NULL,
  engine_version integer NOT NULL,
  computed_at timestamptz NOT NULL,
  checking_note text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archive_reason text NOT NULL CHECK (archive_reason IN ('changed', 'removed')),
  removal_cause text CHECK (
    removal_cause IS NULL OR removal_cause IN (
      'exclusion', 'source_deleted', 'car_deleted', 'keys_no_longer_match'
    )
  ),
  superseded_by_engine_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  import_batch_id uuid
);

CREATE TABLE public.part_match_recompute_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('scoped', 'nightly', 'checks')),
  scope_group_id uuid REFERENCES public.part_interchange_group (id) ON DELETE SET NULL,
  scope_vehicle_id uuid REFERENCES public.vehicle_catalog (id) ON DELETE SET NULL,
  rows_added integer NOT NULL DEFAULT 0,
  rows_changed integer NOT NULL DEFAULT 0,
  rows_removed integer NOT NULL DEFAULT 0,
  rows_scanned integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error text,
  engine_version integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL
);

CREATE TABLE public.part_match_recompute_checkpoint (
  run_id uuid PRIMARY KEY,
  last_group_id uuid REFERENCES public.part_interchange_group (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL
);

CREATE TABLE public.interchange_group_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  from_group uuid NOT NULL REFERENCES public.part_interchange_group (id) ON DELETE CASCADE,
  to_group uuid NOT NULL REFERENCES public.part_interchange_group (id) ON DELETE CASCADE,
  rule text NOT NULL,
  matched_key text NOT NULL,
  index_number_id uuid REFERENCES public.part_index_number (id) ON DELETE SET NULL,
  conflict_id uuid REFERENCES public.part_match_conflict (id) ON DELETE SET NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL,
  CONSTRAINT interchange_group_merge_log_distinct CHECK (from_group <> to_group)
);

ALTER TABLE public.part_listing
  ADD CONSTRAINT part_listing_derived_fit_fkey
  FOREIGN KEY (derived_fit_id) REFERENCES public.part_fit_derived (id) ON DELETE SET NULL;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'part_fit_derived',
    'part_fit_derived_archive',
    'part_match_recompute_log',
    'part_match_recompute_checkpoint',
    'interchange_group_merge_log'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('DROP POLICY IF EXISTS %I_deny ON public.%I', r, r);
    EXECUTE format(
      'CREATE POLICY %I_deny ON public.%I USING (false) WITH CHECK (false)',
      r, r
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', r);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r);
  END LOOP;
END $$;

-- Spliced into 20261102210000_parts_auto_match.sql (not a standalone migration)

CREATE OR REPLACE FUNCTION public.part_match_apply_suppression(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH upd AS (
    UPDATE public.part_fit_derived d
    SET status = 'suppressed'
    WHERE (p_group_id IS NULL OR d.interchange_group_id = p_group_id)
      AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id)
      AND d.status <> 'suppressed'
      AND EXISTS (
        SELECT 1
        FROM public.part_listing pl
        WHERE pl.interchange_group_id = d.interchange_group_id
          AND pl.vehicle_catalog_id = d.vehicle_catalog_id
          AND public.part_side_covers(pl.position, pl.side, d.position, d.side)
      )
    RETURNING 1
  )
  SELECT count(*)::integer FROM upd;
$$;

CREATE OR REPLACE FUNCTION public.part_match_index_rules(
  p_group_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  v_target uuid;
  v_empty boolean;
  v_other_empty boolean;
  v_open uuid;
BEGIN
  FOR r IN
    SELECT
      pin.id AS index_id,
      pin.part_id,
      pin.index_type,
      pin.value_norm,
      pin.wear_sensor,
      pm.interchange_group_id AS from_group,
      pm2.interchange_group_id AS to_group,
      pm2.id AS matched_part_id
    FROM public.part_index_number pin
    JOIN public.part_master pm ON pm.id = pin.part_id
    JOIN public.part_index_number pin2
      ON pin2.index_type = pin.index_type
     AND pin2.value_norm = pin.value_norm
     AND pin2.part_id <> pin.part_id
    JOIN public.part_master pm2 ON pm2.id = pin2.part_id
    WHERE (p_group_id IS NULL OR pm.interchange_group_id = p_group_id OR pm2.interchange_group_id = p_group_id)
      AND pm.interchange_group_id IS DISTINCT FROM pm2.interchange_group_id
  LOOP
    IF r.wear_sensor IS DISTINCT FROM (
      SELECT pin3.wear_sensor FROM public.part_index_number pin3
      WHERE pin3.part_id = r.matched_part_id AND pin3.index_type = r.index_type AND pin3.value_norm = r.value_norm
      LIMIT 1
    ) THEN
      INSERT INTO public.part_match_conflict (
        conflict_type, part_id, interchange_group_id, matched_key, detail, status, engine_version
      )
      VALUES (
        'index_wear_sensor',
        r.part_id,
        r.from_group,
        r.index_type || ':' || r.value_norm,
        jsonb_build_object(
          'index_type', r.index_type,
          'value', r.value_norm,
          'part_a_id', r.part_id,
          'sensor_a', r.wear_sensor,
          'part_b_id', r.matched_part_id,
          'sensor_b', (SELECT wear_sensor FROM public.part_index_number WHERE id = r.index_id)
        ),
        'open',
        public.part_match_engine_version()
      )
      ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'index_merge_proposed'
        AND c.part_id = r.part_id
        AND c.matched_key = r.index_type || ':' || r.value_norm
        AND c.status = 'removed'
    ) THEN
      CONTINUE;
    END IF;

    SELECT NOT EXISTS (
      SELECT 1 FROM public.part_listing pl
      JOIN public.part_master pmx ON pmx.interchange_group_id = pl.interchange_group_id
      WHERE pmx.interchange_group_id = r.from_group
    ) AND NOT EXISTS (
      SELECT 1 FROM public.part_fit_derived d WHERE d.interchange_group_id = r.from_group
    ) INTO v_empty;

    IF NOT v_empty THEN
      INSERT INTO public.part_match_conflict (
        conflict_type, part_id, interchange_group_id, matched_key, detail, status, engine_version
      )
      VALUES (
        'index_merge_proposed',
        r.part_id,
        r.from_group,
        r.index_type || ':' || r.value_norm,
        jsonb_build_object(
          'index_type', r.index_type,
          'value', r.value_norm,
          'moving_part_id', r.part_id,
          'source_group_id', r.from_group,
          'target_group_id', r.to_group
        ),
        'open',
        public.part_match_engine_version()
      )
      ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    SELECT ig.id INTO v_target
    FROM public.part_interchange_group ig
    WHERE ig.id IN (r.from_group, r.to_group)
    ORDER BY ig.created_at NULLS LAST, ig.id
    LIMIT 1;

    IF v_target IS NULL OR v_target = r.from_group THEN
      CONTINUE;
    END IF;

    UPDATE public.part_master SET interchange_group_id = v_target WHERE id = r.part_id;
    INSERT INTO public.interchange_group_merge_log (
      part_id, from_group, to_group, rule, matched_key, index_number_id
    ) VALUES (
      r.part_id, r.from_group, v_target, 'index', r.index_type || ':' || r.value_norm, r.index_id
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_sync_conflicts(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_engine integer := public.part_match_engine_version();
BEGIN
  UPDATE public.part_match_conflict c
  SET status = 'superseded',
      resolved_at = now(),
      resolution_note = coalesce(c.resolution_note, 'Auto-superseded by recompute')
  WHERE c.status = 'open'
    AND (p_vehicle_id IS NULL OR c.vehicle_catalog_id = p_vehicle_id)
    AND (p_group_id IS NULL OR c.interchange_group_id = p_group_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.part_listing pl
        WHERE pl.vehicle_catalog_id = c.vehicle_catalog_id
          AND pl.interchange_group_id = c.interchange_group_id
          AND pl.origin IN ('manual', 'import')
      )
      OR EXISTS (
        SELECT 1 FROM public.part_listing_exclusion ex
        WHERE ex.vehicle_catalog_id = c.vehicle_catalog_id
          AND ex.interchange_group_id = c.interchange_group_id
      )
    );

  WITH ambiguous AS (
    SELECT
      von.vehicle_catalog_id,
      von.id AS vehicle_oe_number_id,
      von.oe_number_norm,
      von.position,
      von.side,
      array_agg(DISTINCT gn.interchange_group_id ORDER BY gn.interchange_group_id) AS group_ids
    FROM public.vehicle_oe_number von
    JOIN LATERAL public.part_match_oe_chain(von.id) ch ON true
    JOIN LATERAL public.part_match_group_numbers(NULL) gn
      ON gn.norm = ch.norm AND gn.brand = ch.brand
    WHERE (p_vehicle_id IS NULL OR von.vehicle_catalog_id = p_vehicle_id)
    GROUP BY von.vehicle_catalog_id, von.id, von.oe_number_norm, von.position, von.side
    HAVING count(DISTINCT gn.interchange_group_id) > 1
  ),
  per_group AS (
    SELECT
      a.vehicle_catalog_id,
      a.vehicle_oe_number_id,
      a.oe_number_norm,
      a.position,
      a.side,
      a.group_ids,
      g.group_id AS interchange_group_id,
      jsonb_build_object(
        'vehicle_oe_number_id', a.vehicle_oe_number_id,
        'group_ids', to_jsonb(a.group_ids),
        'position', a.position,
        'side', a.side
      ) AS detail
    FROM ambiguous a
    CROSS JOIN LATERAL unnest(a.group_ids) AS g(group_id)
  )
  UPDATE public.part_match_conflict c
  SET status = 'open',
      resolved_at = NULL,
      resolved_by = NULL,
      resolution_note = NULL,
      engine_version = v_engine,
      detail = src.detail,
      computed_at = now()
  FROM per_group src
  WHERE c.status = 'superseded'
    AND c.conflict_type = 'oe_ambiguous'
    AND c.interchange_group_id = src.interchange_group_id
    AND c.vehicle_catalog_id = src.vehicle_catalog_id
    AND c.vehicle_oe_number_id = src.vehicle_oe_number_id
    AND c.matched_key IS NOT DISTINCT FROM src.oe_number_norm
    AND NOT EXISTS (
      SELECT 1 FROM public.part_listing pl
      WHERE pl.vehicle_catalog_id = src.vehicle_catalog_id
        AND pl.interchange_group_id = src.interchange_group_id
        AND pl.origin IN ('manual', 'import')
    );

  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id,
    matched_key, detail, status, engine_version
  )
  WITH ambiguous AS (
    SELECT
      von.vehicle_catalog_id,
      von.id AS vehicle_oe_number_id,
      von.oe_number_norm,
      von.position,
      von.side,
      array_agg(DISTINCT gn.interchange_group_id ORDER BY gn.interchange_group_id) AS group_ids
    FROM public.vehicle_oe_number von
    JOIN LATERAL public.part_match_oe_chain(von.id) ch ON true
    JOIN LATERAL public.part_match_group_numbers(NULL) gn
      ON gn.norm = ch.norm AND gn.brand = ch.brand
    WHERE (p_vehicle_id IS NULL OR von.vehicle_catalog_id = p_vehicle_id)
    GROUP BY von.vehicle_catalog_id, von.id, von.oe_number_norm, von.position, von.side
    HAVING count(DISTINCT gn.interchange_group_id) > 1
  ),
  per_group AS (
    SELECT
      a.vehicle_catalog_id,
      a.vehicle_oe_number_id,
      a.oe_number_norm,
      g.group_id AS interchange_group_id,
      jsonb_build_object(
        'vehicle_oe_number_id', a.vehicle_oe_number_id,
        'group_ids', to_jsonb(a.group_ids),
        'position', a.position,
        'side', a.side
      ) AS detail
    FROM ambiguous a
    CROSS JOIN LATERAL unnest(a.group_ids) AS g(group_id)
  )
  SELECT
    'oe_ambiguous',
    pg.interchange_group_id,
    pg.vehicle_catalog_id,
    pg.vehicle_oe_number_id,
    pg.oe_number_norm,
    pg.detail,
    'open',
    v_engine
  FROM per_group pg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.part_match_conflict c
    WHERE c.conflict_type = 'oe_ambiguous'
      AND c.interchange_group_id IS NOT DISTINCT FROM pg.interchange_group_id
      AND c.vehicle_catalog_id = pg.vehicle_catalog_id
      AND c.vehicle_oe_number_id = pg.vehicle_oe_number_id
      AND c.matched_key IS NOT DISTINCT FROM pg.oe_number_norm
  );

  INSERT INTO public.part_match_conflict (
    conflict_type, platform_component_link_id, matched_key, detail, status, engine_version
  )
  SELECT
    'system_link',
    pcl.id,
    pcl.scope || ':' || pcl.maintenance_component_id::text,
    jsonb_build_object(
      'platform_component_link_id', pcl.id,
      'scope', pcl.scope,
      'maintenance_component_id', pcl.maintenance_component_id,
      'position', pcl.position,
      'side', pcl.side
    ),
    'open',
    v_engine
  FROM public.platform_component_link pcl
  WHERE pcl.scope = 'system'
    AND NOT EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'system_link'
        AND c.platform_component_link_id = pcl.id
        AND c.matched_key IS NOT DISTINCT FROM (pcl.scope || ':' || pcl.maintenance_component_id::text)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_oe_chain(p_von_id uuid)
RETURNS TABLE (
  norm text,
  brand text,
  chain text[],
  superseded boolean
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH RECURSIVE walk AS (
    SELECT
      von.oe_number_norm AS norm,
      upper(von.oe_brand) AS brand,
      ARRAY[von.oe_number_norm]::text[] AS chain,
      0 AS depth,
      false AS superseded
    FROM public.vehicle_oe_number von
    WHERE von.id = p_von_id
    UNION ALL
    SELECT s.to_norm, upper(s.oe_brand), w.chain || s.to_norm, w.depth + 1, true
    FROM walk w
    JOIN public.oe_number_supersession s
      ON s.from_norm = w.norm AND upper(s.oe_brand) = w.brand
    WHERE w.depth < 5 AND NOT s.to_norm = ANY (w.chain)
    UNION ALL
    SELECT s.from_norm, upper(s.oe_brand), w.chain || s.from_norm, w.depth + 1, true
    FROM walk w
    JOIN public.oe_number_supersession s
      ON s.to_norm = w.norm AND upper(s.oe_brand) = w.brand AND s.fully_interchangeable
    WHERE w.depth < 5 AND NOT s.from_norm = ANY (w.chain)
  )
  SELECT DISTINCT walk.norm, walk.brand, walk.chain, walk.superseded OR walk.depth > 0
  FROM walk;
$$;

CREATE OR REPLACE FUNCTION public.part_match_group_numbers(p_group_id uuid)
RETURNS TABLE (
  interchange_group_id uuid,
  brand text,
  norm text,
  part_oe_reference_ids uuid[],
  maintenance_component_id uuid
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    pm.interchange_group_id,
    upper(pm.manufacturer),
    pm.oem_part_number_norm,
    ARRAY[]::uuid[],
    pm.maintenance_component_id
  FROM public.part_master pm
  WHERE pm.oem_part_number_norm IS NOT NULL AND pm.oem_part_number_norm <> ''
    AND (p_group_id IS NULL OR pm.interchange_group_id = p_group_id)
  UNION ALL
  SELECT
    pm.interchange_group_id,
    upper(por.oe_brand),
    por.oe_number_norm,
    ARRAY[por.id],
    pm.maintenance_component_id
  FROM public.part_oe_reference por
  JOIN public.part_master pm ON pm.id = por.part_id
  WHERE (p_group_id IS NULL OR pm.interchange_group_id = p_group_id);
$$;

CREATE OR REPLACE FUNCTION public.part_match_recompute_pairs(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  OUT rows_added integer,
  OUT rows_changed integer,
  OUT rows_removed integer,
  OUT rows_scanned integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_engine integer := public.part_match_engine_version();
BEGIN
  rows_added := 0;
  rows_changed := 0;
  rows_removed := 0;
  rows_scanned := 0;

  CREATE TEMP TABLE IF NOT EXISTS _pm_scope (group_id uuid NOT NULL, vehicle_id uuid NOT NULL, PRIMARY KEY (group_id, vehicle_id)) ON COMMIT DROP;
  TRUNCATE _pm_scope;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  IF EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1) THEN
    INSERT INTO _pm_scope SELECT bs.group_id, bs.vehicle_id FROM _pm_batch_scope bs;
  ELSIF p_group_id IS NOT NULL AND p_vehicle_id IS NOT NULL THEN
    INSERT INTO _pm_scope VALUES (p_group_id, p_vehicle_id);
  ELSIF p_group_id IS NOT NULL THEN
    INSERT INTO _pm_scope
    SELECT DISTINCT p_group_id, von.vehicle_catalog_id
    FROM public.vehicle_oe_number von
    JOIN public.part_match_oe_chain(von.id) ch ON true
    JOIN public.part_match_group_numbers(p_group_id) gn
      ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = p_group_id
    UNION
    SELECT p_group_id, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = p_group_id;
  ELSIF p_vehicle_id IS NOT NULL THEN
    INSERT INTO _pm_scope
    SELECT DISTINCT gn.interchange_group_id, p_vehicle_id
    FROM public.vehicle_oe_number von
    JOIN public.part_match_oe_chain(von.id) ch ON true
    JOIN public.part_match_group_numbers(NULL) gn ON gn.norm = ch.norm AND gn.brand = ch.brand
    WHERE von.vehicle_catalog_id = p_vehicle_id
    UNION
    SELECT d.interchange_group_id, p_vehicle_id
    FROM public.part_fit_derived d
    WHERE d.vehicle_catalog_id = p_vehicle_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _pm_desired (
    interchange_group_id uuid NOT NULL,
    vehicle_catalog_id uuid NOT NULL,
    position text,
    side text,
    year_from integer,
    year_to integer,
    vehicle_oe_number_id uuid NOT NULL,
    part_oe_reference_ids uuid[] NOT NULL,
    reason_code text NOT NULL,
    reason_params jsonb NOT NULL,
    status text NOT NULL,
    matched_keys text[] NOT NULL,
    rule text NOT NULL DEFAULT 'oe_number'
  ) ON COMMIT DROP;
  TRUNCATE _pm_desired;

  SELECT count(*)::integer INTO rows_scanned FROM _pm_scope;

  INSERT INTO _pm_desired
  SELECT DISTINCT ON (sp.group_id, sp.vehicle_id, von.position, von.side, 'oe_number')
    sp.group_id,
    sp.vehicle_id,
    von.position,
    von.side,
    CASE
      WHEN clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf > clip.yt THEN NULL
      ELSE clip.yf
    END,
    CASE
      WHEN clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf > clip.yt THEN NULL
      ELSE clip.yt
    END,
    von.id,
    gn.part_oe_reference_ids,
    CASE WHEN ch.superseded THEN 'oe_number_superseded' ELSE 'oe_number' END,
    jsonb_build_object(
      'oe_number', von.oe_number,
      'oe_brand', von.oe_brand,
      'vehicle_oe_number_id', von.id,
      'part_oe_reference_ids', gn.part_oe_reference_ids,
      'chain', ch.chain
    ),
    'live',
    ch.chain,
    'oe_number'
  FROM _pm_scope sp
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = sp.vehicle_id
  JOIN public.vehicle_catalog vc ON vc.id = sp.vehicle_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(sp.group_id) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN vc.production_start_year IS NOT NULL THEN
          greatest(coalesce(von.year_from, vc.production_start_year), vc.production_start_year)
        ELSE von.year_from
      END AS yf,
      CASE
        WHEN vc.production_end_year IS NOT NULL THEN
          least(coalesce(von.year_to, vc.production_end_year), vc.production_end_year)
        ELSE von.year_to
      END AS yt
  ) clip
  WHERE sp.group_id = gn.interchange_group_id
    AND von.maintenance_component_id = gn.maintenance_component_id
    AND NOT public.part_listing_exclusion_blocks(
      sp.group_id, sp.vehicle_id, von.position, von.side,
      coalesce(vc.production_start_year, von.year_from)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.part_listing pl
      WHERE pl.interchange_group_id = sp.group_id
        AND pl.vehicle_catalog_id = sp.vehicle_id
        AND NOT public.part_side_covers(pl.position, pl.side, von.position, von.side)
    )
    AND (
      (clip.yf IS NULL AND clip.yt IS NULL)
      OR (clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf <= clip.yt)
      OR (clip.yf IS NOT NULL AND clip.yt IS NULL)
      OR (clip.yf IS NULL AND clip.yt IS NOT NULL)
    )
  ORDER BY sp.group_id, sp.vehicle_id, von.position, von.side, von.id;

  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id, part_listing_id,
    matched_key, detail, status, engine_version
  )
  SELECT
    'part_type_mismatch',
    gn.interchange_group_id,
    sp.vehicle_id,
    von.id,
    NULL,
    von.oe_number_norm,
    jsonb_build_object(
      'vehicle_oe_number_id', von.id,
      'expected_part_type_id', von.maintenance_component_id,
      'actual_part_type_id', gn.maintenance_component_id
    ),
    'open',
    v_engine
  FROM _pm_scope sp
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = sp.vehicle_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(sp.group_id) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = sp.group_id
  WHERE von.maintenance_component_id IS DISTINCT FROM gn.maintenance_component_id
    AND NOT EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'part_type_mismatch'
        AND c.vehicle_oe_number_id = von.id
        AND c.interchange_group_id = gn.interchange_group_id
        AND c.vehicle_catalog_id = sp.vehicle_id
    );

  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id, part_listing_id,
    matched_key, detail, status, engine_version
  )
  SELECT
    'position_side_mismatch',
    pl.interchange_group_id,
    sp.vehicle_id,
    von.id,
    pl.id,
    von.oe_number_norm,
    jsonb_build_object(
      'vehicle_oe_number_id', von.id,
      'part_listing_id', pl.id,
      'expected', jsonb_build_object('position', von.position, 'side', von.side),
      'actual', jsonb_build_object('position', pl.position, 'side', pl.side)
    ),
    'open',
    v_engine
  FROM _pm_scope sp
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = sp.vehicle_id
  JOIN public.part_listing pl
    ON pl.interchange_group_id = sp.group_id AND pl.vehicle_catalog_id = sp.vehicle_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(sp.group_id) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = sp.group_id
  WHERE NOT public.part_side_covers(pl.position, pl.side, von.position, von.side)
    AND NOT EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'position_side_mismatch'
        AND c.part_listing_id = pl.id
        AND c.vehicle_oe_number_id = von.id
        AND c.interchange_group_id = pl.interchange_group_id
        AND c.vehicle_catalog_id = sp.vehicle_id
    );

  WITH ins AS (
    INSERT INTO public.part_fit_derived (
      interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to, rule,
      matched_keys, vehicle_oe_number_id, part_oe_reference_ids, reason_code, reason_params,
      status, engine_version, computed_at
    )
    SELECT
      d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to, 'oe_number',
      d.matched_keys, d.vehicle_oe_number_id, d.part_oe_reference_ids, d.reason_code, d.reason_params,
      d.status, v_engine, now()
    FROM _pm_desired d
    ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side, rule) DO UPDATE
    SET
      year_from = EXCLUDED.year_from,
      year_to = EXCLUDED.year_to,
      matched_keys = EXCLUDED.matched_keys,
      vehicle_oe_number_id = EXCLUDED.vehicle_oe_number_id,
      part_oe_reference_ids = EXCLUDED.part_oe_reference_ids,
      reason_code = EXCLUDED.reason_code,
      reason_params = EXCLUDED.reason_params,
      status = EXCLUDED.status,
      engine_version = EXCLUDED.engine_version,
      computed_at = EXCLUDED.computed_at
    WHERE public.part_fit_derived.engine_version IS DISTINCT FROM EXCLUDED.engine_version
       OR public.part_fit_derived.reason_code IS DISTINCT FROM EXCLUDED.reason_code
       OR public.part_fit_derived.matched_keys IS DISTINCT FROM EXCLUDED.matched_keys
    RETURNING (xmax = 0) AS inserted
  )
  SELECT
    count(*) FILTER (WHERE inserted)::integer,
    count(*) FILTER (WHERE NOT inserted)::integer
  INTO rows_added, rows_changed
  FROM ins;

  WITH del AS (
    DELETE FROM public.part_fit_derived d
    USING _pm_scope sp
    WHERE d.interchange_group_id = sp.group_id
      AND d.vehicle_catalog_id = sp.vehicle_id
      AND NOT EXISTS (
        SELECT 1 FROM _pm_desired x
        WHERE x.interchange_group_id = d.interchange_group_id
          AND x.vehicle_catalog_id = d.vehicle_catalog_id
          AND x.position IS NOT DISTINCT FROM d.position
          AND x.side IS NOT DISTINCT FROM d.side
      )
    RETURNING 1
  )
  SELECT count(*)::integer INTO rows_removed FROM del;

  IF p_group_id IS NULL AND p_vehicle_id IS NULL AND EXISTS (SELECT 1 FROM _pm_scope LIMIT 1) THEN
    UPDATE public.part_fit_derived d
    SET status = 'suppressed'
    FROM _pm_scope sp
    WHERE d.interchange_group_id = sp.group_id
      AND d.vehicle_catalog_id = sp.vehicle_id
      AND d.status <> 'suppressed'
      AND EXISTS (
        SELECT 1
        FROM public.part_listing pl
        WHERE pl.interchange_group_id = d.interchange_group_id
          AND pl.vehicle_catalog_id = d.vehicle_catalog_id
          AND public.part_side_covers(pl.position, pl.side, d.position, d.side)
      );
  ELSE
    PERFORM public.part_match_apply_suppression(p_group_id, p_vehicle_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_recompute(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_engine integer := public.part_match_engine_version();
  v_log_id uuid;
  v_started timestamptz := clock_timestamp();
  v_kind text := CASE WHEN p_group_id IS NULL AND p_vehicle_id IS NULL THEN 'nightly' ELSE 'scoped' END;
  lock_rec record;
  v_stats record;
  v_group uuid;
  v_last uuid;
  v_batch uuid[];
  v_checkpoint_run uuid;
BEGIN
  IF p_group_id IS NULL AND p_vehicle_id IS NULL THEN
    SELECT c.run_id, c.last_group_id INTO v_checkpoint_run, v_last
    FROM public.part_match_recompute_checkpoint c
    WHERE c.finished_at IS NULL
    ORDER BY c.started_at DESC
    LIMIT 1;

    IF v_checkpoint_run IS NULL THEN
      v_checkpoint_run := v_run_id;
      INSERT INTO public.part_match_recompute_checkpoint (run_id, started_at, updated_at)
      VALUES (v_checkpoint_run, v_started, v_started);
    ELSE
      v_run_id := v_checkpoint_run;
    END IF;

    SELECT array_agg(id ORDER BY id) INTO v_batch
    FROM (
      SELECT ig.id
      FROM public.part_interchange_group ig
      WHERE v_last IS NULL OR ig.id > v_last
      ORDER BY ig.id
      LIMIT 500
    ) q;

    IF v_batch IS NULL OR array_length(v_batch, 1) IS NULL THEN
      UPDATE public.part_match_recompute_checkpoint
      SET finished_at = now(), updated_at = now()
      WHERE run_id = v_checkpoint_run;
      INSERT INTO public.part_match_recompute_log (
        run_id, kind, engine_version, started_at, finished_at, duration_ms, rows_scanned
      )
      VALUES (
        v_run_id, v_kind, v_engine, v_started, clock_timestamp(),
        (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer, 0
      );
      RETURN;
    END IF;

    FOREACH v_group IN ARRAY v_batch LOOP
      PERFORM pg_advisory_xact_lock(hashtext('part_match:group:' || v_group::text));
      SELECT * INTO v_stats FROM public.part_match_recompute_pairs(v_group, NULL);
      PERFORM public.part_match_index_rules(v_group);
    END LOOP;

    UPDATE public.part_match_recompute_checkpoint
    SET last_group_id = v_batch[array_length(v_batch, 1)], updated_at = now()
    WHERE run_id = v_checkpoint_run;

    INSERT INTO public.part_match_recompute_log (
      run_id, kind, engine_version, started_at, finished_at, duration_ms, rows_scanned
    )
    VALUES (
      v_run_id, v_kind, v_engine, v_started, clock_timestamp(),
      (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
      coalesce(array_length(v_batch, 1), 0)
    );
    PERFORM public.part_match_sync_conflicts(NULL, NULL);
    RETURN;
  END IF;

  FOR lock_rec IN
    SELECT sp.group_id, sp.vehicle_id
    FROM (
      SELECT p_group_id AS group_id, p_vehicle_id AS vehicle_id
      WHERE p_group_id IS NOT NULL AND p_vehicle_id IS NOT NULL
      UNION ALL
      SELECT p_group_id, von.vehicle_catalog_id
      FROM public.vehicle_oe_number von
      WHERE p_group_id IS NOT NULL AND p_vehicle_id IS NULL
      UNION ALL
      SELECT gn.interchange_group_id, p_vehicle_id
      FROM public.vehicle_oe_number von
      JOIN public.part_match_oe_chain(von.id) ch ON true
      JOIN public.part_match_group_numbers(NULL) gn ON gn.norm = ch.norm AND gn.brand = ch.brand
      WHERE p_vehicle_id IS NOT NULL AND p_group_id IS NULL
    ) sp
    WHERE sp.group_id IS NOT NULL AND sp.vehicle_id IS NOT NULL
    ORDER BY sp.group_id, sp.vehicle_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('part_match:' || lock_rec.group_id::text || ':' || lock_rec.vehicle_id::text)
    );
  END LOOP;

  INSERT INTO public.part_match_recompute_log (
    run_id, kind, scope_group_id, scope_vehicle_id, engine_version, started_at
  )
  VALUES (v_run_id, v_kind, p_group_id, p_vehicle_id, v_engine, v_started)
  RETURNING id INTO v_log_id;

  BEGIN
    SELECT * INTO v_stats FROM public.part_match_recompute_pairs(p_group_id, p_vehicle_id);
    PERFORM public.part_match_index_rules(p_group_id);
    PERFORM public.part_match_sync_conflicts(p_group_id, p_vehicle_id);

    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
        rows_added = v_stats.rows_added,
        rows_changed = v_stats.rows_changed,
        rows_removed = v_stats.rows_removed,
        rows_scanned = v_stats.rows_scanned
    WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        error = SQLERRM,
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer
    WHERE id = v_log_id;
    RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_recompute_buffered()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_engine integer := public.part_match_engine_version();
  v_log_id uuid;
  v_started timestamptz := clock_timestamp();
  lock_rec record;
  v_stats record;
  v_group uuid;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;

  IF NOT EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1) THEN
    RETURN;
  END IF;

  FOR lock_rec IN
    SELECT bs.group_id, bs.vehicle_id
    FROM _pm_batch_scope bs
    ORDER BY bs.group_id, bs.vehicle_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('part_match:' || lock_rec.group_id::text || ':' || lock_rec.vehicle_id::text)
    );
  END LOOP;

  INSERT INTO public.part_match_recompute_log (
    run_id, kind, engine_version, started_at
  )
  VALUES (v_run_id, 'scoped', v_engine, v_started)
  RETURNING id INTO v_log_id;

  BEGIN
    SELECT * INTO v_stats FROM public.part_match_recompute_pairs(NULL, NULL);
    FOR v_group IN SELECT DISTINCT bs.group_id FROM _pm_batch_scope bs LOOP
      PERFORM public.part_match_index_rules(v_group);
    END LOOP;
    PERFORM public.part_match_sync_conflicts(NULL, NULL);

    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
        rows_added = v_stats.rows_added,
        rows_changed = v_stats.rows_changed,
        rows_removed = v_stats.rows_removed,
        rows_scanned = v_stats.rows_scanned
    WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.part_match_recompute_log
    SET finished_at = clock_timestamp(),
        error = SQLERRM,
        duration_ms = (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer
    WHERE id = v_log_id;
    RAISE;
  END;

  TRUNCATE _pm_batch_scope;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_archive_derived_changes(
  p_new_engine_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.part_fit_derived_archive (
    derived_id, interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    rule, matched_keys, vehicle_oe_number_id, part_oe_reference_ids, reason_code, reason_params,
    status, engine_version, computed_at, checking_note, archive_reason, superseded_by_engine_version
  )
  SELECT
    d.id, d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    d.rule, d.matched_keys, d.vehicle_oe_number_id, d.part_oe_reference_ids, d.reason_code, d.reason_params,
    d.status, d.engine_version, d.computed_at, d.checking_note, 'changed', p_new_engine_version
  FROM public.part_fit_derived d
  WHERE d.engine_version IS DISTINCT FROM p_new_engine_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_conflict_keep(
  p_conflict_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.part_match_conflict%ROWTYPE;
  v_derived uuid;
  v_other uuid;
  v_group uuid;
  v_manual boolean;
  v_kept_code text;
  v_other_code text;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN RAISE EXCEPTION 'Conflict not open'; END IF;

  IF c.conflict_type IN ('oe_ambiguous', 'index_merge_proposed', 'system_link')
     AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution note is required for this conflict type';
  END IF;

  IF c.conflict_type = 'index_merge_proposed' THEN
    UPDATE public.part_master pm
    SET interchange_group_id = (c.detail->>'target_group_id')::uuid
    WHERE pm.id = (c.detail->>'moving_part_id')::uuid;
    INSERT INTO public.interchange_group_merge_log (
      part_id, from_group, to_group, rule, matched_key, conflict_id, created_by
    ) VALUES (
      (c.detail->>'moving_part_id')::uuid,
      (c.detail->>'source_group_id')::uuid,
      (c.detail->>'target_group_id')::uuid,
      'index', c.matched_key, c.id, p_actor
    );
  ELSE
    v_group := c.interchange_group_id;
    SELECT ig.code INTO v_kept_code
    FROM public.part_interchange_group ig
    WHERE ig.id = v_group;
    SELECT d.id INTO v_derived
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = v_group
      AND d.vehicle_catalog_id = c.vehicle_catalog_id
    ORDER BY d.computed_at DESC
    LIMIT 1;
    IF v_derived IS NOT NULL THEN
      INSERT INTO public.part_listing (
        interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
        evidence_url, origin, derived_fit_id, verified_by
      )
      SELECT
        d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
        von.evidence_url,
        'auto_match_kept', d.id, p_actor
      FROM public.part_fit_derived d
      LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
      WHERE d.id = v_derived
      ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
      SET origin = 'auto_match_kept', derived_fit_id = EXCLUDED.derived_fit_id;
    END IF;

    IF c.conflict_type = 'oe_ambiguous' AND c.detail ? 'group_ids' THEN
      FOR v_other IN
        SELECT value::uuid FROM jsonb_array_elements_text(c.detail->'group_ids') AS value
      LOOP
        IF v_other = v_group THEN CONTINUE; END IF;
        SELECT EXISTS (
          SELECT 1 FROM public.part_listing pl
          WHERE pl.interchange_group_id = v_other
            AND pl.vehicle_catalog_id = c.vehicle_catalog_id
            AND pl.origin IN ('manual', 'import')
        ) INTO v_manual;
        SELECT ig.code INTO v_other_code
        FROM public.part_interchange_group ig
        WHERE ig.id = v_other;
        IF v_manual THEN
          UPDATE public.part_match_conflict oc
          SET status = 'superseded',
              resolution_note = format(
                'Manual fit exists on %s; both kept',
                coalesce(v_other_code, v_other::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        ELSE
          INSERT INTO public.part_listing_exclusion (
            interchange_group_id, vehicle_catalog_id, reason, evidence_url, source, created_by
          ) VALUES (
            v_other,
            c.vehicle_catalog_id,
            coalesce(p_note, format('Resolved by keeping %s', coalesce(v_kept_code, v_group::text))),
            '',
            'auto_match_removed',
            p_actor
          )
          ON CONFLICT DO NOTHING;
          UPDATE public.part_match_conflict oc
          SET status = 'removed',
              resolution_note = format(
                'Resolved by keeping %s',
                coalesce(v_kept_code, v_group::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.part_match_conflict
  SET status = 'kept', resolution_note = p_note, resolved_by = p_actor, resolved_at = now()
  WHERE id = p_conflict_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_conflict_remove(
  p_conflict_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.part_match_conflict%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN RAISE EXCEPTION 'Conflict not open'; END IF;

  IF c.conflict_type IN ('oe_ambiguous', 'index_merge_proposed', 'system_link')
     AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution note is required for this conflict type';
  END IF;

  INSERT INTO public.part_listing_exclusion (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    reason, evidence_url, source, created_by
  )
  SELECT
    d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    coalesce(p_note, 'Removed via conflict resolution'),
    '', 'auto_match_removed', p_actor
  FROM public.part_fit_derived d
  WHERE d.interchange_group_id = c.interchange_group_id
    AND d.vehicle_catalog_id = c.vehicle_catalog_id
  ON CONFLICT DO NOTHING;

  DELETE FROM public.part_fit_derived d
  WHERE d.interchange_group_id = c.interchange_group_id
    AND d.vehicle_catalog_id = c.vehicle_catalog_id;

  UPDATE public.part_match_conflict
  SET status = 'removed', resolution_note = p_note, resolved_by = p_actor, resolved_at = now()
  WHERE id = p_conflict_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_trg_vehicle_oe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT gn.interchange_group_id, x.vehicle_catalog_id
  FROM (
    SELECT n.vehicle_catalog_id FROM new_rows n
    UNION
    SELECT o.vehicle_catalog_id FROM old_rows o
  ) x
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = x.vehicle_catalog_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(NULL) gn ON gn.norm = ch.norm AND gn.brand = ch.brand
  WHERE x.vehicle_catalog_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.part_match_trg_oe_supersession()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT gn.interchange_group_id, von.vehicle_catalog_id
  FROM (
    SELECT upper(n.oe_brand) AS brand, n.from_norm AS norm FROM new_rows n
    UNION SELECT upper(n.oe_brand), n.to_norm FROM new_rows n
    UNION SELECT upper(o.oe_brand), o.from_norm FROM old_rows o
    UNION SELECT upper(o.oe_brand), o.to_norm FROM old_rows o
  ) ch
  JOIN public.part_match_group_numbers(NULL) gn ON gn.norm = ch.norm AND gn.brand = ch.brand
  JOIN public.vehicle_oe_number von ON von.oe_number_norm = ch.norm AND upper(von.oe_brand) = ch.brand
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.part_match_trg_part_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT g.gid, sp.vehicle_id
  FROM (
    SELECT pm.interchange_group_id AS gid
    FROM (
      SELECT n.part_id FROM new_rows n UNION SELECT o.part_id FROM old_rows o
    ) x
    JOIN public.part_master pm ON pm.id = x.part_id
    WHERE pm.interchange_group_id IS NOT NULL
  ) g
  CROSS JOIN LATERAL (
    SELECT DISTINCT von.vehicle_catalog_id AS vehicle_id
    FROM public.vehicle_oe_number von
    JOIN public.part_match_oe_chain(von.id) ch ON true
    JOIN public.part_match_group_numbers(g.gid) gn
      ON gn.interchange_group_id = g.gid AND gn.norm = ch.norm AND gn.brand = ch.brand
    UNION
    SELECT d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = g.gid
  ) sp
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.part_match_trg_group_from_part()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT g.gid, sp.vehicle_id
  FROM (
    SELECT x.gid
    FROM (
      SELECT n.interchange_group_id AS gid FROM new_rows n
      UNION SELECT o.interchange_group_id FROM old_rows o
    ) x
    WHERE x.gid IS NOT NULL
  ) g
  CROSS JOIN LATERAL (
    SELECT DISTINCT von.vehicle_catalog_id AS vehicle_id
    FROM public.vehicle_oe_number von
    JOIN public.part_match_oe_chain(von.id) ch ON true
    JOIN public.part_match_group_numbers(g.gid) gn
      ON gn.interchange_group_id = g.gid AND gn.norm = ch.norm AND gn.brand = ch.brand
    UNION
    SELECT d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = g.gid
  ) sp
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.part_match_trg_part_supersession()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT pm.interchange_group_id, d.vehicle_catalog_id
  FROM (
    SELECT n.old_part_id AS part_id FROM new_rows n
    UNION SELECT n.new_part_id FROM new_rows n
    UNION SELECT o.old_part_id FROM old_rows o
    UNION SELECT o.new_part_id FROM old_rows o
  ) x
  JOIN public.part_master pm ON pm.id = x.part_id
  JOIN public.part_fit_derived d ON d.interchange_group_id = pm.interchange_group_id
  WHERE pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.part_match_trg_listing_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT s.gid, s.vid
  FROM (
    SELECT n.interchange_group_id AS gid, n.vehicle_catalog_id AS vid FROM new_rows n
    UNION
    SELECT o.interchange_group_id, o.vehicle_catalog_id FROM old_rows o
  ) s
  WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.part_match_trg_catalog_years()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT gn.interchange_group_id, n.id
  FROM new_rows n
  JOIN old_rows o ON o.id = n.id
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = n.id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(NULL) gn ON gn.norm = ch.norm AND gn.brand = ch.brand
  WHERE n.production_start_year IS DISTINCT FROM o.production_start_year
     OR n.production_end_year IS DISTINCT FROM o.production_end_year
  ON CONFLICT DO NOTHING;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT d.interchange_group_id, n.id
  FROM new_rows n
  JOIN old_rows o ON o.id = n.id
  JOIN public.part_fit_derived d ON d.vehicle_catalog_id = n.id
  WHERE n.production_start_year IS DISTINCT FROM o.production_start_year
     OR n.production_end_year IS DISTINCT FROM o.production_end_year
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.part_match_trg_index_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT pm.interchange_group_id, d.vehicle_catalog_id
  FROM (
    SELECT n.part_id FROM new_rows n UNION SELECT o.part_id FROM old_rows o
  ) x
  JOIN public.part_master pm ON pm.id = x.part_id
  JOIN public.part_fit_derived d ON d.interchange_group_id = pm.interchange_group_id
  WHERE pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_part_master_oem_norm_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.oem_part_number_norm IS DISTINCT FROM OLD.oem_part_number_norm THEN
    NEW.oem_part_number_norm_version := public.part_import_norm_version();
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_vehicle_oe_number_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.vehicle_oe_number_revision (vehicle_oe_number_id, old_row, new_row, actor)
    VALUES (NEW.id, '{}'::jsonb, to_jsonb(NEW), NEW.created_by);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.vehicle_oe_number_revision (vehicle_oe_number_id, old_row, new_row, actor)
    VALUES (NEW.id, to_jsonb(OLD), to_jsonb(NEW), NEW.created_by);
  ELSE
    INSERT INTO public.vehicle_oe_number_revision (vehicle_oe_number_id, old_row, new_row, actor)
    VALUES (OLD.id, to_jsonb(OLD), '{}'::jsonb, OLD.created_by);
  END IF;
  RETURN coalesce(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.trg_platform_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_revision (entity_table, entity_id, old_row, new_row, actor)
    VALUES (TG_TABLE_NAME, NEW.id, '{}'::jsonb, to_jsonb(NEW), v_actor);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.platform_revision (entity_table, entity_id, old_row, new_row, actor)
    VALUES (TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW), v_actor);
  ELSE
    INSERT INTO public.platform_revision (entity_table, entity_id, old_row, new_row, actor)
    VALUES (TG_TABLE_NAME, OLD.id, to_jsonb(OLD), '{}'::jsonb, v_actor);
  END IF;
  RETURN coalesce(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.part_match_trg_group_from_part_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.interchange_group_id IS NOT NULL
     AND OLD.interchange_group_id IS DISTINCT FROM NEW.interchange_group_id THEN
    PERFORM public.part_match_recompute(OLD.interchange_group_id, NULL);
  END IF;
  IF NEW.interchange_group_id IS NOT NULL THEN
    PERFORM public.part_match_recompute(NEW.interchange_group_id, NULL);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_interchange_group_revision_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_group uuid;
BEGIN
  SELECT pm.interchange_group_id INTO v_group FROM public.part_master pm
  WHERE pm.id = coalesce(NEW.part_id, OLD.part_id);
  IF v_group IS NOT NULL THEN
    UPDATE public.part_interchange_group SET revision = revision + 1 WHERE id = v_group;
  END IF;
  RETURN coalesce(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS part_match_vehicle_oe ON public.vehicle_oe_number;
CREATE TRIGGER part_match_vehicle_oe AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_oe_number
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.part_match_trg_vehicle_oe();
DROP TRIGGER IF EXISTS part_match_part_oe_reference ON public.part_oe_reference;
CREATE TRIGGER part_match_part_oe_reference AFTER INSERT OR UPDATE OR DELETE ON public.part_oe_reference
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.part_match_trg_part_reference();
DROP TRIGGER IF EXISTS part_match_oe_supersession ON public.oe_number_supersession;
CREATE TRIGGER part_match_oe_supersession AFTER INSERT OR UPDATE OR DELETE ON public.oe_number_supersession
  FOR EACH STATEMENT EXECUTE FUNCTION public.part_match_trg_oe_supersession();
CREATE TRIGGER part_match_part_supersession AFTER INSERT OR UPDATE OR DELETE ON public.part_supersession
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.part_match_trg_part_supersession();
DROP TRIGGER IF EXISTS part_match_part_master ON public.part_master;
CREATE TRIGGER part_match_part_master_insdel
  AFTER INSERT OR DELETE ON public.part_master
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.part_match_trg_group_from_part();
CREATE TRIGGER part_match_part_master_upd
  AFTER UPDATE OF oem_part_number_norm, interchange_group_id ON public.part_master
  FOR EACH ROW EXECUTE FUNCTION public.part_match_trg_group_from_part_row();
DROP TRIGGER IF EXISTS part_match_part_listing ON public.part_listing;
CREATE TRIGGER part_match_part_listing AFTER INSERT OR UPDATE OR DELETE ON public.part_listing
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.part_match_trg_listing_scope();
DROP TRIGGER IF EXISTS part_match_part_listing_exclusion ON public.part_listing_exclusion;
CREATE TRIGGER part_match_part_listing_exclusion AFTER INSERT OR UPDATE OR DELETE ON public.part_listing_exclusion
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.part_match_trg_listing_scope();
DROP TRIGGER IF EXISTS part_match_vehicle_catalog_years ON public.vehicle_catalog;
CREATE TRIGGER part_match_vehicle_catalog_years
  AFTER UPDATE OF production_start_year, production_end_year ON public.vehicle_catalog
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.part_match_trg_catalog_years();
DROP TRIGGER IF EXISTS part_match_part_index_number ON public.part_index_number;
CREATE TRIGGER part_match_part_index_number
  AFTER INSERT OR UPDATE OR DELETE ON public.part_index_number
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.part_match_trg_index_number();
DROP TRIGGER IF EXISTS part_master_oem_norm_version ON public.part_master;
CREATE TRIGGER part_master_oem_norm_version
  BEFORE UPDATE OF oem_part_number_norm ON public.part_master
  FOR EACH ROW EXECUTE FUNCTION public.trg_part_master_oem_norm_version();
DROP TRIGGER IF EXISTS vehicle_oe_number_revision_trg ON public.vehicle_oe_number;
CREATE TRIGGER vehicle_oe_number_revision_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_oe_number
  FOR EACH ROW EXECUTE FUNCTION public.trg_vehicle_oe_number_revision();
DROP TRIGGER IF EXISTS platform_component_link_revision ON public.platform_component_link;
CREATE TRIGGER platform_component_link_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_component_link
  FOR EACH ROW EXECUTE FUNCTION public.trg_platform_revision();
DROP TRIGGER IF EXISTS vehicle_platform_revision ON public.vehicle_platform;
CREATE TRIGGER vehicle_platform_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_platform
  FOR EACH ROW EXECUTE FUNCTION public.trg_platform_revision();
DROP TRIGGER IF EXISTS part_oe_reference_revision ON public.part_oe_reference;
CREATE TRIGGER part_oe_reference_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.part_oe_reference
  FOR EACH ROW EXECUTE FUNCTION public.trg_interchange_group_revision_bump();
DROP TRIGGER IF EXISTS part_index_number_revision ON public.part_index_number;
CREATE TRIGGER part_index_number_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.part_index_number
  FOR EACH ROW EXECUTE FUNCTION public.trg_interchange_group_revision_bump();
DROP TRIGGER IF EXISTS part_approval_revision ON public.part_approval;
CREATE TRIGGER part_approval_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.part_approval
  FOR EACH ROW EXECUTE FUNCTION public.trg_interchange_group_revision_bump();

REVOKE ALL ON FUNCTION public.part_match_apply_suppression(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_index_rules(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_sync_conflicts(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_oe_chain(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_group_numbers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_recompute_pairs(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_apply_suppression(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_index_rules(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_sync_conflicts(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_oe_chain(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_group_numbers(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_recompute_pairs(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.part_match_recompute(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_recompute_buffered() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_archive_derived_changes(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_conflict_keep(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_conflict_remove(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_recompute(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_recompute_buffered() TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_archive_derived_changes(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_conflict_keep(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_conflict_remove(uuid, uuid, text) TO service_role;

-- Backend for the screens (section D)
-- ---------------------------------------------------------------------------

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS market text,
  ADD COLUMN IF NOT EXISTS platform_role text CHECK (platform_role IS NULL OR platform_role IN ('primary', 'badge_twin', 'oem_supply')),
  ADD COLUMN IF NOT EXISTS platform_role_note text;

ALTER TABLE public.part_master
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.universal_part
  ADD COLUMN IF NOT EXISTS tolerance_mm numeric;

ALTER TABLE public.part_interchange_group
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

CREATE TABLE public.vehicle_oe_number_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_oe_number_id uuid NOT NULL REFERENCES public.vehicle_oe_number (id) ON DELETE CASCADE,
  old_row jsonb NOT NULL,
  new_row jsonb NOT NULL,
  actor uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL
);

CREATE TABLE public.platform_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  old_row jsonb NOT NULL,
  new_row jsonb NOT NULL,
  actor uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL
);

CREATE TABLE public.catalog_validation_exception (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_ref text,
  source text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL
);

CREATE TABLE public.part_norm_position_backfill_summary (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  rows_normalized bigint NOT NULL DEFAULT 0,
  rows_unmapped bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL
);

INSERT INTO public.part_norm_position_backfill_summary (rows_normalized, rows_unmapped, updated_at)
SELECT
  (SELECT count(*) FROM public.part_listing),
  (SELECT count(*) FROM public.part_norm_position_backfill_report WHERE reason = 'unmapped'),
  now()
ON CONFLICT (id) DO UPDATE
SET rows_normalized = EXCLUDED.rows_normalized,
    rows_unmapped = EXCLUDED.rows_unmapped,
    updated_at = now();

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'vehicle_oe_number_revision',
    'platform_revision',
    'catalog_validation_exception',
    'part_norm_position_backfill_summary'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('DROP POLICY IF EXISTS %I_deny ON public.%I', r, r);
    EXECUTE format(
      'CREATE POLICY %I_deny ON public.%I USING (false) WITH CHECK (false)',
      r, r
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', r);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.part_norm_position_report_resolve(p_report_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.part_norm_position_backfill_report r
  SET resolved_at = now(),
      resolved_by = p_actor,
      resolution_source = 'manual'
  WHERE r.id = p_report_id AND r.resolved_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_norm_position_report_remap(
  p_report_id uuid,
  p_position text,
  p_side text,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.part_norm_position_backfill_report%ROWTYPE;
  v_norm record;
BEGIN
  SELECT * INTO v_row FROM public.part_norm_position_backfill_report WHERE id = p_report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report row not found'; END IF;
  SELECT * INTO v_norm FROM public.part_norm_position(p_position, p_side);

  IF v_row.table_name = 'part_listing' THEN
    UPDATE public.part_listing pl
    SET position = v_norm.norm_position, side = v_norm.norm_side
    WHERE pl.id = v_row.row_id;
  ELSIF v_row.table_name = 'part_listing_exclusion' THEN
    UPDATE public.part_listing_exclusion ex
    SET position = v_norm.norm_position, side = v_norm.norm_side
    WHERE ex.id = v_row.row_id;
  ELSE
    RAISE EXCEPTION 'Remap not supported for %', v_row.table_name;
  END IF;

  UPDATE public.part_norm_position_backfill_report r
  SET resolved_at = now(),
      resolved_by = p_actor,
      resolution_source = 'manual'
  WHERE r.id = p_report_id;
END;
$$;

DROP FUNCTION IF EXISTS public.part_match_schedule();

CREATE OR REPLACE FUNCTION public.part_match_schedule()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_schedule text;
  v_next timestamptz;
  v_today_3am timestamptz;
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    SELECT j.schedule INTO v_schedule
    FROM cron.job j
    WHERE j.jobname = 'part-match-nightly'
    LIMIT 1;
  END IF;

  v_schedule := coalesce(v_schedule, '0 3 * * *');
  v_today_3am := (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '3 hours') AT TIME ZONE 'UTC';
  IF now() >= v_today_3am THEN
    v_next := v_today_3am + interval '1 day';
  ELSE
    v_next := v_today_3am;
  END IF;

  RETURN jsonb_build_object(
    'nextRun', v_next,
    'cronSchedule', v_schedule,
    'jobName', 'part-match-nightly'
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'part-match-nightly';
    PERFORM cron.schedule(
      'part-match-nightly',
      '0 3 * * *',
      $cron$SELECT public.part_match_recompute(NULL, NULL)$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped part-match-nightly';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.part_match_health(p_vehicle_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'engineVersion', public.part_match_engine_version(),
    'normVersion', public.part_norm_position_version(),
    'enabled', public.parts_auto_match_enabled(),
    'derived', jsonb_build_object(
      'live', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'live' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id)),
      'needsChecking', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'needs_checking' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id)),
      'suppressed', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'suppressed' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id))
    ),
    'tierBreakdown', CASE
      WHEN p_vehicle_id IS NULL THEN '{}'::jsonb
      ELSE (
        SELECT coalesce(jsonb_object_agg(t.tier::text, t.cnt), '{}'::jsonb)
        FROM (
          SELECT p.tier, count(*) AS cnt
          FROM public.parts_for_vehicle(p_vehicle_id, NULL, NULL) p
          GROUP BY p.tier
        ) t
      )
    END,
    'openConflicts', (
      SELECT coalesce(jsonb_object_agg(conflict_type, cnt), '{}'::jsonb)
      FROM (
        SELECT c.conflict_type, count(*) AS cnt
        FROM public.part_match_conflict c
        WHERE c.status = 'open'
          AND (p_vehicle_id IS NULL OR c.vehicle_catalog_id = p_vehicle_id)
        GROUP BY c.conflict_type
      ) x
    ),
    'lastRun', (
      SELECT to_jsonb(l) FROM (
        SELECT run_id, kind, started_at, finished_at, error, duration_ms, rows_scanned
        FROM public.part_match_recompute_log
        ORDER BY started_at DESC
        LIMIT 1
      ) l
    ),
    'errorCount24h', (
      SELECT count(*) FROM public.part_match_recompute_log l
      WHERE l.error IS NOT NULL AND l.started_at > now() - interval '24 hours'
    ),
    'unresolvedPositionReports', (
      SELECT count(*) FROM public.part_norm_position_backfill_report r WHERE r.resolved_at IS NULL
    )
  );
$$;

REVOKE ALL ON FUNCTION public.part_norm_position_report_resolve(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_norm_position_report_remap(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_schedule() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_health(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_norm_position_report_resolve(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_norm_position_report_remap(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_schedule() TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_health(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- AM-06: parts_for_vehicle (legacy columns + match_* ; flag hides derived rows)
-- ---------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.variant_parts_readiness;

DROP FUNCTION IF EXISTS public.parts_for_vehicle(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.parts_for_vehicle(
  p_catalog_id uuid,
  p_component_id uuid DEFAULT NULL,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  tier integer,
  part_id uuid,
  part_name text,
  oem_part_number text,
  manufacturer text,
  part_kind text,
  fit_scope text,
  rule_source text,
  "position" text,
  interchange_group_id uuid,
  maintenance_component_id uuid,
  category_id uuid,
  sister_names text,
  source_make text,
  reference_oem text,
  reference_manufacturer text,
  also_known_as text[],
  confirmed_installs integer,
  description text,
  evidence_url text,
  match_reason_code text,
  match_reason_params jsonb,
  match_status text,
  fit_source text,
  via text,
  part_badge_code text,
  part_badge_params jsonb
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH cat AS (
    SELECT
      vc.id,
      vc.make,
      vc.model,
      vc.platform_id,
      vc.engine_family_id,
      vc.chassis_code,
      vc.engine_code,
      vc.production_start_year,
      vc.production_end_year,
      COALESCE(p_vehicle_year, vc.production_start_year) AS match_year
    FROM public.vehicle_catalog vc
    WHERE vc.id = p_catalog_id
  ),
  family AS (
    SELECT p.id
    FROM public.vehicle_platform p
    JOIN cat ON true
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE p.id = cat.platform_id
       OR p.id = mine.parent_id
       OR p.parent_id = cat.platform_id
       OR (mine.parent_id IS NOT NULL AND p.parent_id = mine.parent_id)
  ),
  sister AS (
    SELECT string_agg(DISTINCT (vc.make || ' ' || vc.model), ', ' ORDER BY (vc.make || ' ' || vc.model)) AS names
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.platform_id IN (SELECT id FROM family)
    WHERE lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  listings AS (
    SELECT
      pl.interchange_group_id AS group_id,
      pl.vehicle_catalog_id AS listed_id,
      pl.position,
      pl.side,
      pl.origin,
      pl.year_from,
      pl.year_to,
      g.fit_scope,
      lvc.make AS listed_make,
      lvc.model AS listed_model,
      lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine,
      lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label,
      pl.evidence_url,
      pl.id AS listing_id
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE NOT public.part_listing_exclusion_blocks(
      pl.interchange_group_id, cat.id, pl.position, pl.side, cat.match_year
    )
  ),
  scored AS (
    SELECT
      listings.*,
      CASE
        WHEN listings.listed_id = cat.id
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN lower(listings.listed_make) = lower(cat.make)
          AND lower(listings.listed_model) = lower(cat.model)
          AND upper(trim(coalesce(listings.listed_chassis, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN listings.listed_platform IN (SELECT id FROM family)
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 2
        WHEN listings.fit_scope = 'powertrain'
          AND listings.listed_engine IS NOT NULL
          AND listings.listed_engine = cat.engine_family_id
          AND (listings.listed_platform IS NULL OR listings.listed_platform NOT IN (SELECT id FROM family))
          THEN 3
        ELSE NULL
      END AS listing_tier
    FROM listings
    CROSS JOIN cat
  ),
  best_group AS (
    SELECT DISTINCT ON (group_id, position, side)
      group_id,
      listing_tier,
      position,
      side,
      origin,
      fit_scope,
      listed_label,
      evidence_url,
      listing_id
    FROM scored
    WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, side, listing_tier ASC, listed_id
  ),
  listing_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      bg.fit_scope,
      'listing'::text AS rule_source,
      bg.position,
      bg.group_id AS interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE
        WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
        ELSE bg.listing_tier
      END AS tier,
      bg.listed_label AS source_make,
      bg.evidence_url,
      CASE WHEN bg.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END AS fit_source,
      CASE bg.listing_tier
        WHEN 1 THEN 'direct'
        WHEN 2 THEN 'sister'
        WHEN 3 THEN 'engine'
        ELSE 'direct'
      END AS via,
      'live'::text AS match_status,
      'listed_direct'::text AS match_reason_code,
      jsonb_build_object('part_listing_id', bg.listing_id) AS match_reason_params
    FROM best_group bg
    JOIN public.part_master pm ON pm.interchange_group_id = bg.group_id
    WHERE pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        JOIN cat ON true
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  derived_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 1 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'direct'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params
    FROM public.part_fit_derived d
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    JOIN cat ON cat.id = d.vehicle_catalog_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
  ),
  tier1_fits AS (
    SELECT d.interchange_group_id, d.position, d.side, d.status AS match_status,
           d.reason_code, d.reason_params, 'derived'::text AS fit_source, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE public.parts_auto_match_enabled() AND d.status IN ('live', 'needs_checking')
    UNION ALL
    SELECT pl.interchange_group_id, pl.position, pl.side, 'live'::text,
           'listed_direct'::text, jsonb_build_object('part_listing_id', pl.id),
           CASE WHEN pl.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END,
           pl.vehicle_catalog_id
    FROM public.part_listing pl
    WHERE public.parts_auto_match_enabled()
  ),
  tier1_on_car AS (
    SELECT t.* FROM tier1_fits t JOIN cat ON cat.id = t.vehicle_catalog_id
  ),
  link_tier3_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      t1.position,
      t1.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 3 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      t1.fit_source,
      'platform_link'::text AS via,
      CASE
        WHEN l.scope = 'system' OR t1.match_status = 'needs_checking' THEN 'needs_checking'
        ELSE 'live'
      END AS match_status,
      'via_platform_link'::text AS match_reason_code,
      jsonb_build_object(
        'link_id', l.id,
        'platform_code', vp.code,
        'source_vehicle_id', src.id,
        'source_tier', 1
      ) AS match_reason_params
    FROM public.platform_component_link l
    JOIN cat ON true
    JOIN public.vehicle_catalog src
      ON src.platform_id = CASE
        WHEN cat.platform_id = l.platform_a_id THEN l.platform_b_id
        ELSE l.platform_a_id
      END
    JOIN public.vehicle_platform vp ON vp.id = src.platform_id
    JOIN tier1_fits t1 ON t1.vehicle_catalog_id = src.id
    JOIN public.part_master pm ON pm.interchange_group_id = t1.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND cat.platform_id IN (l.platform_a_id, l.platform_b_id)
      AND l.maintenance_component_id = pm.maintenance_component_id
      AND public.part_side_covers(l.position, l.side, t1.position, t1.side)
      AND NOT public.part_listing_exclusion_blocks(
        t1.interchange_group_id, cat.id, t1.position, t1.side, cat.match_year
      )
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
  ),
  hits AS (
    SELECT * FROM listing_hits
    UNION ALL
    SELECT * FROM derived_hits
    UNION ALL
    SELECT * FROM link_tier3_hits
  ),
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id)
      h.interchange_group_id,
      h.oem_part_number AS reference_oem,
      h.manufacturer AS reference_manufacturer
    FROM hits h
    WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
  ),
  badges AS (
    SELECT
      m.part_id,
      CASE WHEN m.rule = 'index' THEN 'index_badge' END AS part_badge_code,
      jsonb_build_object(
        'index_type', m.matched_key,
        'merge_log_id', m.id
      ) AS part_badge_params
    FROM public.interchange_group_merge_log m
    WHERE m.reversed_at IS NULL
  )
  SELECT
    h.tier,
    h.part_id,
    h.part_name,
    h.oem_part_number,
    h.manufacturer,
    h.part_kind,
    h.fit_scope,
    h.rule_source,
    h.position,
    h.interchange_group_id,
    h.maintenance_component_id,
    h.category_id,
    sister.names AS sister_names,
    h.source_make,
    COALESCE(oem_ref.reference_oem, h.oem_part_number) AS reference_oem,
    COALESCE(oem_ref.reference_manufacturer, h.manufacturer) AS reference_manufacturer,
    COALESCE((
      SELECT array_agg(old.oem_part_number)
      FROM public.part_supersession s
      JOIN public.part_master old ON old.id = s.old_part_id
      WHERE s.new_part_id = h.part_id AND old.oem_part_number IS NOT NULL
    ), ARRAY[]::text[]) AS also_known_as,
    COALESCE((
      SELECT count(*)::integer
      FROM public.part_fit_feedback f
      WHERE f.part_id = h.part_id AND f.outcome = 'fit'
    ), 0) AS confirmed_installs,
    h.description,
    h.evidence_url,
    h.match_reason_code,
    h.match_reason_params,
    h.match_status,
    h.fit_source,
    h.via,
    b.part_badge_code,
    b.part_badge_params
  FROM hits h
  LEFT JOIN sister ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id
  LEFT JOIN badges b ON b.part_id = h.part_id;
$$;

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) TO service_role;

CREATE MATERIALIZED VIEW public.variant_parts_readiness AS
 WITH core AS (
         SELECT v.op_code
           FROM ( VALUES ('ENG-OIL'::text), ('ENG-SPARK'::text), ('ENG-THERM'::text), ('FILT-AIR'::text), ('HVAC-CABIN'::text), ('BRK-PADS'::text), ('BELT-SERP'::text), ('LGT-WIPER'::text), ('BRK-ROTOR'::text), ('SUS-SHOCK'::text)) v(op_code)
        ), comp AS (
         SELECT c.id,
            c.op_code
           FROM public.maintenance_service_categories c
             JOIN core ON core.op_code = c.op_code
        ), na AS (
         SELECT DISTINCT ON (vc.id, comp.op_code) vc.id AS variant_id,
            comp.op_code,
            a.applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             JOIN public.catalog_component_applicability a ON a.component_id = comp.id
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE a.scope = 'variant'::text AND a.vehicle_catalog_id = vc.id OR a.scope = 'platform'::text AND (a.platform_id = vc.platform_id OR a.platform_id = mine.parent_id) OR a.scope = 'engine_family'::text AND a.engine_family_id = vc.engine_family_id
          ORDER BY vc.id, comp.op_code, (
                CASE a.scope
                    WHEN 'variant'::text THEN 1
                    WHEN 'platform'::text THEN 2
                    ELSE 3
                END)
        ), spec_hit AS (
         SELECT DISTINCT vc.id AS variant_id,
            c.op_code
           FROM public.vehicle_catalog vc
             JOIN public.catalog_spec_value sv ON true
             JOIN public.spec_key sk ON sk.key = sv.spec_key
             JOIN public.maintenance_service_categories c ON c.id = sk.component_id
             JOIN core ON core.op_code = c.op_code
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE COALESCE(btrim(sv.evidence_url), ''::text) <> ''::text AND COALESCE(btrim(sv.value), ''::text) <> ''::text AND (sv.scope = 'variant'::text AND sv.vehicle_catalog_id = vc.id OR sv.scope = 'platform'::text AND (sv.platform_id = vc.platform_id OR sv.platform_id = mine.parent_id) OR sv.scope = 'engine_family'::text AND sv.engine_family_id = vc.engine_family_id)
        ), hits AS (
         SELECT vc.id AS variant_id,
            comp.op_code,
            bool_or(pm.catalog_decision = 'confirmed'::text AND p.tier >= 1 AND p.tier <= 3) OR bool_or(sh.op_code IS NOT NULL) AS verified,
            bool_or(p.part_id IS NOT NULL AND pm.catalog_decision IS DISTINCT FROM 'rejected'::text AND p.tier >= 1 AND p.tier <= 3) AS any_part,
            bool_or(na.applicable = false) AS not_applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             LEFT JOIN LATERAL public.parts_for_vehicle(vc.id, comp.id, NULL::integer) p ON true
             LEFT JOIN public.part_master pm ON pm.id = p.part_id
             LEFT JOIN na ON na.variant_id = vc.id AND na.op_code = comp.op_code
             LEFT JOIN spec_hit sh ON sh.variant_id = vc.id AND sh.op_code = comp.op_code
          GROUP BY vc.id, comp.op_code
        ), rolled AS (
         SELECT hits.variant_id,
            count(*) FILTER (WHERE hits.verified OR hits.not_applicable)::integer AS components_ready,
            jsonb_object_agg(hits.op_code,
                CASE
                    WHEN hits.verified THEN 'verified'::text
                    WHEN hits.not_applicable THEN 'not_applicable'::text
                    WHEN hits.any_part THEN 'unverified'::text
                    ELSE 'missing'::text
                END) AS cells
           FROM hits
          GROUP BY hits.variant_id
        )
 SELECT variant_id,
    components_ready,
    components_ready = (( SELECT count(*) AS count
           FROM core)) AS ready,
    cells
   FROM rolled;

CREATE UNIQUE INDEX variant_parts_readiness_variant_id ON public.variant_parts_readiness USING btree (variant_id);
REVOKE ALL ON TABLE public.variant_parts_readiness FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.variant_parts_readiness TO service_role;

-- ---------------------------------------------------------------------------
-- Writers: part_import_promote + save_guided_part use part_norm_position
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_guided_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_op text := upper(trim(coalesce(p_input->>'componentOpCode', '')));
  v_from integer := NULLIF(p_input->>'yearFrom', '')::integer;
  v_to integer := NULLIF(p_input->>'yearTo', '')::integer;
  v_ticked uuid[];
  v_raw_position text := NULLIF(trim(coalesce(p_input->>'position', '')), '');
  v_raw_side text := NULLIF(trim(coalesce(p_input->>'side', '')), '');
  v_position text;
  v_side text;
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_note text := NULLIF(btrim(coalesce(p_input->>'note', '')), '');
  v_actor uuid := NULLIF(p_input->>'verifiedBy', '')::uuid;
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_component uuid;
  v_category uuid;
  v_part jsonb;
  v_kind text;
  v_mfr text;
  v_number text;
  v_name text;
  v_part_id uuid;
  v_existing_group uuid;
  v_old uuid;
  v_scope text;
  v_listed uuid;
BEGIN
  SELECT n.norm_position, n.norm_side
  INTO v_position, v_side
  FROM public.part_norm_position(v_raw_position, v_raw_side) AS n;

  IF v_variant IS NULL THEN RAISE EXCEPTION 'Choose a vehicle'; END IF;
  IF v_evidence IS NULL THEN RAISE EXCEPTION 'A verified part needs a source link'; END IF;
  IF v_op <> '' THEN
    SELECT id INTO v_component FROM public.maintenance_service_categories WHERE op_code = v_op;
    IF v_component IS NULL THEN RAISE EXCEPTION 'That job is not in the catalog'; END IF;
  END IF;
  IF jsonb_typeof(p_input->'parts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'parts') = 0 THEN
    RAISE EXCEPTION 'Add at least one part number';
  END IF;
  IF p_input ? 'tickedVariantIds' AND jsonb_typeof(p_input->'tickedVariantIds') = 'array' THEN
    SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_ticked
    FROM jsonb_array_elements_text(p_input->'tickedVariantIds') AS value;
  END IF;

  v_category := NULLIF(p_input->>'categoryId', '')::uuid;
  IF v_category IS NULL AND v_op <> '' THEN
    v_category := public.guided_category_id(v_op);
  END IF;
  IF v_category IS NULL THEN RAISE EXCEPTION 'Choose a job or a category'; END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := NULLIF(btrim(coalesce(v_part->>'manufacturer', '')), '');
    v_number := NULLIF(btrim(coalesce(v_part->>'partNumber', '')), '');
    v_name := coalesce(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_mfr IS NULL OR v_number IS NULL THEN RAISE EXCEPTION 'Each part needs a brand and a part number'; END IF;
    IF upper(v_mfr) = 'OEM SPEC' THEN RAISE EXCEPTION 'OEM spec is not a brand. Enter a real brand and part number'; END IF;
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    IF v_kind NOT IN ('oem', 'oe_supplier', 'aftermarket') THEN RAISE EXCEPTION 'Choose factory, original supplier, or other brand'; END IF;
    SELECT pm.id, pm.interchange_group_id INTO v_part_id, v_existing_group
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = public.part_import_norm_number(v_number)
      AND pm.oem_part_number_norm <> '';
    IF v_existing_group IS NOT NULL AND v_group IS NOT NULL AND v_existing_group <> v_group THEN
      RAISE EXCEPTION 'Those part numbers are already saved under different fits. Edit each one.';
    END IF;
    IF v_group IS NULL AND v_existing_group IS NOT NULL THEN v_group := v_existing_group; END IF;
  END LOOP;

  IF v_group IS NULL THEN
    v_scope := CASE WHEN v_op <> '' AND public.is_engine_level_op(v_op) THEN 'powertrain' ELSE 'body' END;
    INSERT INTO public.part_interchange_group (code, label, fit_scope)
    VALUES (
      'GD-' || coalesce(NULLIF(v_op, ''), 'PART') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      coalesce(NULLIF(v_op, ''), 'PART'),
      v_scope
    )
    RETURNING id INTO v_group;
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := btrim(v_part->>'manufacturer');
    v_number := btrim(v_part->>'partNumber');
    v_name := coalesce(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    SELECT pm.id INTO v_part_id
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = public.part_import_norm_number(v_number);
    IF v_part_id IS NULL THEN
      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, evidence_url, verified_by, verified_at,
        catalog_decision, updated_at, oem_part_number_norm_version
      ) VALUES (
        v_category, v_name, v_number, v_mfr, v_kind,
        v_group, v_component, v_evidence, v_actor, now(),
        'confirmed', now(), public.part_import_norm_version()
      )
      RETURNING id INTO v_part_id;
    ELSE
      UPDATE public.part_master
      SET name = v_name,
          part_kind = v_kind,
          manufacturer = v_mfr,
          interchange_group_id = v_group,
          maintenance_component_id = coalesce(v_component, maintenance_component_id),
          category_id = v_category,
          evidence_url = v_evidence,
          verified_by = v_actor,
          verified_at = now(),
          catalog_decision = 'confirmed',
          updated_at = now()
      WHERE id = v_part_id;
    END IF;
    IF coalesce(btrim(v_part->>'supersedes'), '') <> '' THEN
      SELECT pm.id INTO v_old
      FROM public.part_master pm
      WHERE pm.oem_part_number_norm = public.part_import_norm_number(v_part->>'supersedes')
        AND pm.id <> v_part_id
      LIMIT 1;
      IF v_old IS NOT NULL THEN
        INSERT INTO public.part_supersession (old_part_id, new_part_id)
        VALUES (v_old, v_part_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, note, verified_by, origin
  ) VALUES (
    v_group, v_variant, v_position, v_side, v_from, v_to, v_evidence, v_note, v_actor, 'manual'
  )
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side)
  DO UPDATE SET
    year_from = coalesce(EXCLUDED.year_from, public.part_listing.year_from),
    year_to = coalesce(EXCLUDED.year_to, public.part_listing.year_to),
    evidence_url = EXCLUDED.evidence_url,
    note = EXCLUDED.note,
    verified_by = EXCLUDED.verified_by,
    verified_at = now(),
    side = EXCLUDED.side,
    position = EXCLUDED.position;

  IF v_ticked IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_ticked) AS picked(id)
      JOIN public.vehicle_catalog other ON other.id = picked.id
      JOIN public.vehicle_catalog mine ON mine.id = v_variant
      WHERE lower(coalesce(other.make, '')) IS DISTINCT FROM lower(coalesce(mine.make, ''))
         OR lower(coalesce(other.model, '')) IS DISTINCT FROM lower(coalesce(mine.model, ''))
    ) THEN
      RAISE EXCEPTION 'Also listed for must be the same make and model';
    END IF;
    FOREACH v_listed IN ARRAY v_ticked
    LOOP
      IF v_listed IS DISTINCT FROM v_variant THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
          evidence_url, note, verified_by, origin
        ) VALUES (
          v_group, v_listed, v_position, v_side, v_from, v_to, v_evidence, v_note, v_actor, 'manual'
        )
        ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side)
        DO UPDATE SET
          year_from = coalesce(EXCLUDED.year_from, public.part_listing.year_from),
          year_to = coalesce(EXCLUDED.year_to, public.part_listing.year_to),
          evidence_url = EXCLUDED.evidence_url,
          note = EXCLUDED.note,
          verified_by = EXCLUDED.verified_by,
          verified_at = now();
      END IF;
    END LOOP;
  END IF;

  IF NULLIF(p_input->>'groupId', '') IS NOT NULL AND v_ticked IS NOT NULL THEN
    DELETE FROM public.part_listing pl
    USING public.vehicle_catalog other, public.vehicle_catalog mine
    WHERE pl.interchange_group_id = v_group
      AND pl.vehicle_catalog_id = other.id
      AND mine.id = v_variant
      AND pl.vehicle_catalog_id IS DISTINCT FROM v_variant
      AND NOT (pl.vehicle_catalog_id = ANY (v_ticked))
      AND lower(coalesce(other.make, '')) = lower(coalesce(mine.make, ''))
      AND lower(coalesce(other.model, '')) = lower(coalesce(mine.model, ''));
  END IF;

  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'groupId', v_group);
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_promote(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch record;
  v_lock int;
  r record;
  v_group uuid;
  v_part uuid;
  v_listing uuid;
  v_category uuid;
  v_before jsonb;
  v_created_parts int := 0;
  v_updated_parts int := 0;
  v_created_fits int := 0;
  v_updated_fits int := 0;
  v_refresh text;
  v_fit_scope text;
  v_specs jsonb;
  v_norm_pos text;
  v_norm_side text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS part_import_batch_parts (
    line_no int PRIMARY KEY,
    part_id uuid NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE part_import_batch_parts;

  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'checked' THEN RAISE EXCEPTION 'Batch must be checked before import'; END IF;

  v_lock := hashtext('part_import:' || v_batch.area_id::text);
  IF NOT pg_try_advisory_xact_lock(v_lock) THEN RAISE EXCEPTION 'Already importing this area'; END IF;

  v_fit_scope := coalesce(public.part_import_area_fit_scope(v_batch.area_id), 'body');
  UPDATE public.part_import_batch SET status = 'promoting' WHERE id = p_batch_id;
  SELECT pc.id INTO v_category FROM public.part_category pc WHERE pc.area_id = v_batch.area_id LIMIT 1;

  FOR r IN
    SELECT *
    FROM public.part_import_row
    WHERE batch_id = p_batch_id
      AND accepted IS TRUE
      AND status IN ('valid', 'labelled')
      AND action IN ('create_part', 'update_part', 'add_fit')
    ORDER BY line_no
  LOOP
    v_group := NULL;
    v_part := r.existing_part_id;
    v_specs := coalesce(r.normalized->'specs', public.part_import_row_specs(v_batch.area_id, r.raw));
    SELECT n.norm_position, n.norm_side INTO v_norm_pos, v_norm_side
    FROM public.part_norm_position(r.raw->>'position', coalesce(r.raw->>'side', r.normalized->>'side')) AS n;

    IF r.action = 'add_fit' THEN
      SELECT bpp.part_id INTO v_part FROM part_import_batch_parts bpp WHERE bpp.line_no = r.existing_line_no;
      IF v_part IS NULL THEN v_part := r.existing_part_id; END IF;
    END IF;

    IF r.replaces_part_id IS NOT NULL AND r.action = 'create_part' THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = r.replaces_part_id;
    END IF;

    IF r.action = 'create_part' THEN
      IF v_group IS NULL THEN
        INSERT INTO public.part_interchange_group (code, label, fit_scope, import_batch_id)
        VALUES (
          'IMP-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
          coalesce(r.raw->>'part_name', r.raw->>'part_number'),
          v_fit_scope,
          p_batch_id
        )
        RETURNING id INTO v_group;
      END IF;
      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, import_batch_id, evidence_url,
        catalog_decision, metadata, updated_at, oem_part_number_norm_version
      ) VALUES (
        v_category,
        coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), r.raw->>'part_number'),
        r.raw->>'part_number',
        coalesce(r.normalized->>'brand', r.raw->>'brand'),
        coalesce(r.normalized->>'match_type', 'oem'),
        v_group,
        r.part_type_id,
        p_batch_id,
        r.normalized->>'source_url',
        'pending',
        jsonb_build_object('import_labels', r.issues, 'specs', v_specs),
        now(),
        public.part_import_norm_version()
      )
      RETURNING id INTO v_part;
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_interchange_group', v_group, 'insert', NULL,
        public.part_import_row_snapshot('part_interchange_group', v_group)
      );
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_master', v_part, 'insert', NULL,
        public.part_import_row_snapshot('part_master', v_part)
      );
      INSERT INTO part_import_batch_parts (line_no, part_id) VALUES (r.line_no, v_part);
      v_created_parts := v_created_parts + 1;
    ELSIF r.action = 'update_part' AND v_part IS NOT NULL THEN
      v_before := public.part_import_row_snapshot('part_master', v_part);
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
      UPDATE public.part_master pm
      SET name = coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), pm.name),
          evidence_url = coalesce(r.normalized->>'source_url', pm.evidence_url),
          maintenance_component_id = coalesce(r.part_type_id, pm.maintenance_component_id),
          part_kind = coalesce(r.normalized->>'match_type', pm.part_kind),
          metadata = coalesce(pm.metadata, '{}'::jsonb) || jsonb_build_object('specs', v_specs, 'import_labels', r.issues),
          catalog_decision = 'pending',
          updated_at = now()
      WHERE id = v_part AND pm.catalog_decision IS DISTINCT FROM 'confirmed';
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_master', v_part, 'update', v_before,
        public.part_import_row_snapshot('part_master', v_part)
      );
      INSERT INTO part_import_batch_parts (line_no, part_id) VALUES (r.line_no, v_part)
      ON CONFLICT (line_no) DO UPDATE SET part_id = EXCLUDED.part_id;
      v_updated_parts := v_updated_parts + 1;
    ELSIF r.action = 'add_fit' AND v_part IS NOT NULL THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
      INSERT INTO part_import_batch_parts (line_no, part_id) VALUES (r.line_no, v_part)
      ON CONFLICT (line_no) DO UPDATE SET part_id = EXCLUDED.part_id;
    END IF;

    IF v_group IS NULL AND v_part IS NOT NULL THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
    END IF;

    IF v_group IS NOT NULL AND r.vehicle_catalog_id IS NOT NULL THEN
      SELECT pl.id INTO v_listing
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group
        AND pl.vehicle_catalog_id = r.vehicle_catalog_id
        AND pl.position IS NOT DISTINCT FROM v_norm_pos
        AND pl.side IS NOT DISTINCT FROM v_norm_side;

      IF v_listing IS NULL THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
          evidence_url, import_batch_id, origin
        ) VALUES (
          v_group,
          r.vehicle_catalog_id,
          v_norm_pos,
          v_norm_side,
          (r.normalized->>'year_from')::int,
          (r.normalized->>'year_to')::int,
          r.normalized->>'source_url',
          p_batch_id,
          'import'
        )
        RETURNING id INTO v_listing;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (
          p_batch_id, r.line_no, 'part_listing', v_listing, 'insert', NULL,
          public.part_import_row_snapshot('part_listing', v_listing)
        );
        v_created_fits := v_created_fits + 1;
      ELSE
        v_before := public.part_import_row_snapshot('part_listing', v_listing);
        UPDATE public.part_listing pl
        SET year_from = (r.normalized->>'year_from')::int,
            year_to = (r.normalized->>'year_to')::int,
            evidence_url = r.normalized->>'source_url',
            position = v_norm_pos,
            side = v_norm_side
        WHERE id = v_listing;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (
          p_batch_id, r.line_no, 'part_listing', v_listing, 'update', v_before,
          public.part_import_row_snapshot('part_listing', v_listing)
        );
        v_updated_fits := v_updated_fits + 1;
      END IF;
    END IF;
  END LOOP;

  BEGIN
    PERFORM public.refresh_variant_parts_readiness();
  EXCEPTION WHEN OTHERS THEN
    v_refresh := SQLERRM;
  END;

  UPDATE public.part_import_batch
  SET status = 'imported',
      promoted_at = now(),
      promoted_by = p_actor,
      parts_created = v_created_parts,
      parts_updated = v_updated_parts,
      fits_created = v_created_fits,
      fits_updated = v_updated_fits,
      refresh_warning = v_refresh
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'partsCreated', v_created_parts,
    'partsUpdated', v_updated_parts,
    'fitsCreated', v_created_fits,
    'fitsUpdated', v_updated_fits,
    'refreshWarning', v_refresh
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_guided_part(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_promote(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_guided_part(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_promote(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_match_derived_keep(
  p_derived_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d public.part_fit_derived%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.part_fit_derived WHERE id = p_derived_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Derived fit not found'; END IF;
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, derived_fit_id, verified_by
  )
  SELECT
    d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    coalesce(von.evidence_url, 'https://roamfleet.co/auto-match-kept'),
    'auto_match_kept', d.id, p_actor
  FROM public.part_fit_derived d
  LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
  WHERE d.id = p_derived_id
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
  SET origin = 'auto_match_kept', derived_fit_id = EXCLUDED.derived_fit_id;
  PERFORM public.part_match_recompute(d.interchange_group_id, d.vehicle_catalog_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_vehicle_oe_numbers(p_vehicle uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows jsonb;
  v_last public.part_match_recompute_log%ROWTYPE;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(von.*) ORDER BY von.maintenance_component_id, von.position, von.side), '[]'::jsonb)
  INTO v_rows
  FROM public.vehicle_oe_number von
  WHERE von.vehicle_catalog_id = p_vehicle;

  SELECT * INTO v_last
  FROM public.part_match_recompute_log l
  WHERE l.scope_vehicle_id = p_vehicle OR l.kind = 'nightly'
  ORDER BY l.started_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'lastRun', CASE WHEN v_last.id IS NULL THEN NULL ELSE to_jsonb(v_last) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_derived_keep(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_vehicle_oe_numbers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_derived_keep(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_vehicle_oe_numbers(uuid) TO service_role;
