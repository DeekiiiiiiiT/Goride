-- Jamaica map part 2: level table, draft checks, pin codes, import check, quality list.
-- Nightly quality refresh is concurrent. A publish refreshes inside its transaction, which cannot use CONCURRENTLY.

ALTER TABLE geo.boundary_versions ADD COLUMN IF NOT EXISTS checks jsonb;
ALTER TABLE geo.import_runs ADD COLUMN IF NOT EXISTS features jsonb;
ALTER TABLE geo.import_runs ADD COLUMN IF NOT EXISTS file_hash text;
ALTER TABLE geo.import_runs ADD COLUMN IF NOT EXISTS report jsonb;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'geo.boundary_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE geo.boundary_versions DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'geo.places'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE geo.places DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE geo.boundary_versions
  ADD CONSTRAINT boundary_versions_status_check
  CHECK (status IN ('draft', 'published', 'retired', 'discarded'));

ALTER TABLE geo.places
  ADD CONSTRAINT geo_places_kind_check
  CHECK (kind IN ('town_centre', 'landmark', 'poi', 'junction'));

CREATE TABLE IF NOT EXISTS geo.pin_change (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id uuid NOT NULL REFERENCES geo.places(id),
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  actor_id uuid,
  reason text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE geo.pin_change ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geo_pin_change_no_direct ON geo.pin_change;
CREATE POLICY geo_pin_change_no_direct ON geo.pin_change FOR ALL TO authenticated USING (false) WITH CHECK (false);
GRANT SELECT, INSERT ON geo.pin_change TO service_role;

CREATE OR REPLACE FUNCTION geo.list_boundaries_admin(p_level int, p_parent text DEFAULT NULL)
RETURNS TABLE (
  pcode text,
  admin_level smallint,
  parent_pcode text,
  name text,
  parent_name text,
  parish_pcode text,
  town_pcode text,
  area_sqkm numeric,
  vertex_count integer,
  children integer,
  version integer,
  published_at timestamptz,
  has_draft boolean,
  same_name_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = geo, public
AS $$
  SELECT
    b.pcode,
    b.admin_level,
    b.parent_pcode,
    b.name,
    CASE
      WHEN b.admin_level = 3 THEN COALESCE(town.name, '') || ' › ' || COALESCE(parish.name, '')
      WHEN b.admin_level = 2 THEN parish.name
      WHEN b.admin_level = 1 THEN 'Jamaica'
      ELSE NULL
    END,
    CASE
      WHEN b.admin_level = 1 THEN b.pcode
      WHEN b.admin_level = 2 THEN b.parent_pcode
      ELSE town.parent_pcode
    END,
    CASE WHEN b.admin_level = 3 THEN b.parent_pcode ELSE NULL END,
    ROUND(COALESCE(v.area_sqkm, ST_Area(v.geom::geography) / 1000000.0)::numeric, 2),
    COALESCE(ST_NPoints(v.geom), 0)::integer,
    (SELECT count(*)::integer FROM geo.boundaries c WHERE c.parent_pcode = b.pcode AND c.status = 'active'),
    v.version,
    v.created_at,
    EXISTS (SELECT 1 FROM geo.boundary_versions d WHERE d.pcode = b.pcode AND d.status = 'draft'),
    (SELECT count(*)::integer FROM geo.boundaries o WHERE o.admin_level = b.admin_level AND lower(o.name) = lower(b.name) AND o.status = 'active')
  FROM geo.boundaries b
  LEFT JOIN geo.boundaries town ON town.pcode = b.parent_pcode
  LEFT JOIN geo.boundaries parish ON parish.pcode = CASE
    WHEN b.admin_level = 2 THEN b.parent_pcode
    WHEN b.admin_level = 3 THEN town.parent_pcode
    ELSE NULL
  END
  LEFT JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.status = 'active'
    AND (p_level IS NULL OR b.admin_level = p_level)
    AND (
      p_parent IS NULL OR btrim(p_parent) = ''
      OR b.parent_pcode = p_parent
      OR (b.admin_level = 3 AND town.parent_pcode = p_parent)
    )
  ORDER BY b.name;
$$;

REVOKE ALL ON FUNCTION geo.list_boundaries_admin(int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.list_boundaries_admin(int, text) TO service_role;
