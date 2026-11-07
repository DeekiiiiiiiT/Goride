-- Phase 3a — Roomy brakes: per-car trust + trusted sources (RB-15, RB-16).
-- Idempotent guards: skips steps when prerequisites are missing (Phases 1–2 ordering).

-- ---------------------------------------------------------------------------
-- 1) trusted_source
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.vehicle_catalog') IS NULL THEN
    RAISE NOTICE 'roomy_brakes_phase3a_trust: skip — vehicle_catalog missing';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.trusted_source (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('car_maker', 'part_maker')),
    maker text NOT NULL,
    maker_norm text GENERATED ALWAYS AS (lower(btrim(maker))) STORED,
    domain text NOT NULL,
    added_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    added_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trusted_source_domain_nonempty CHECK (btrim(domain) <> ''),
    CONSTRAINT trusted_source_unique_triplet UNIQUE (kind, maker_norm, domain)
  );

  ALTER TABLE public.trusted_source ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS trusted_source_no_direct_access ON public.trusted_source;
  CREATE POLICY trusted_source_no_direct_access
    ON public.trusted_source FOR ALL TO authenticated, anon
    USING (false) WITH CHECK (false);

  GRANT ALL ON TABLE public.trusted_source TO service_role;
  REVOKE ALL ON TABLE public.trusted_source FROM PUBLIC, anon, authenticated;
END $$;

-- Seed (idempotent)
DO $$
BEGIN
  IF to_regclass('public.trusted_source') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.trusted_source (kind, maker, domain)
  VALUES
    ('car_maker', 'Toyota', 'amayama.com'),
    ('car_maker', 'Toyota', 'megazip.net'),
    ('car_maker', 'Toyota', 'partsouq.com'),
    ('car_maker', 'Daihatsu', 'amayama.com'),
    ('car_maker', 'Daihatsu', 'megazip.net'),
    ('car_maker', 'Daihatsu', 'partsouq.com'),
    ('car_maker', 'Lexus', 'amayama.com'),
    ('car_maker', 'Lexus', 'megazip.net'),
    ('part_maker', 'SB Nagamochi', 'sbparts.jp'),
    ('part_maker', 'NiBK', 'jnbk-brakes.com'),
    ('part_maker', 'Brembo', 'bremboparts.com')
  ON CONFLICT ON CONSTRAINT trusted_source_unique_triplet DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 2) source_domain, source_trust, helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.source_domain(p_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
  u text := btrim(coalesce(p_url, ''));
  host_part text;
BEGIN
  IF u = '' THEN
    RETURN NULL;
  END IF;
  IF position('://' IN u) > 0 THEN
    u := regexp_replace(u, '^[a-zA-Z][a-zA-Z0-9+.-]*://', '');
  END IF;
  host_part := split_part(split_part(u, '/', 1), '?', 1);
  host_part := split_part(host_part, ':', 1);
  host_part := lower(host_part);
  IF host_part LIKE 'www.%' THEN
    host_part := substring(host_part FROM 5);
  END IF;
  RETURN nullif(host_part, '');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.source_trust(p_url text, p_car_make text, p_part_makers text[])
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
  d text := public.source_domain(p_url);
  mk text := lower(btrim(coalesce(p_car_make, '')));
  pm text;
BEGIN
  IF d IS NULL OR d = '' THEN
    RETURN 'needs_checking';
  END IF;
  -- Rule 1: car maker trusted site
  IF mk <> '' AND EXISTS (
    SELECT 1 FROM public.trusted_source ts
    WHERE ts.kind = 'car_maker'
      AND ts.maker_norm = mk
      AND ts.domain = d
  ) THEN
    RETURN 'confirmed';
  END IF;
  -- Rule 2: part maker's own site for that manufacturer
  IF p_part_makers IS NOT NULL THEN
    FOREACH pm IN ARRAY p_part_makers LOOP
      IF lower(btrim(coalesce(pm, ''))) = '' THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.trusted_source ts
        WHERE ts.kind = 'part_maker'
          AND ts.maker_norm = lower(btrim(pm))
          AND ts.domain = d
      ) THEN
        RETURN 'confirmed';
      END IF;
    END LOOP;
  END IF;
  RETURN 'needs_checking';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.part_listing_interchange_part_makers(p_group_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
  SELECT coalesce(
    array_agg(DISTINCT btrim(pm.manufacturer)) FILTER (WHERE btrim(coalesce(pm.manufacturer, '')) <> ''),
    ARRAY[]::text[]
  )
  FROM public.part_master pm
  WHERE pm.interchange_group_id = p_group_id;
$fn$;

CREATE OR REPLACE FUNCTION public.compute_part_listing_auto_trust(
  p_evidence_url text,
  p_vehicle_catalog_id uuid,
  p_interchange_group_id uuid
)
RETURNS TABLE(trust text, trust_reason text)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
  d text := public.source_domain(p_evidence_url);
  mk text;
  pmakers text[];
  t text;
  car_hit text;
  pm_hit text;
BEGIN
  SELECT lower(btrim(vc.make)) INTO mk
  FROM public.vehicle_catalog vc
  WHERE vc.id = p_vehicle_catalog_id;

  pmakers := public.part_listing_interchange_part_makers(p_interchange_group_id);

  t := public.source_trust(p_evidence_url, mk, pmakers);

  IF t = 'confirmed' AND mk <> '' AND d IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trusted_source ts
    WHERE ts.kind = 'car_maker' AND ts.maker_norm = mk AND ts.domain = d
  ) THEN
    trust := 'confirmed';
    trust_reason := 'Car maker trusted site (' || d || ')';
    RETURN NEXT;
    RETURN;
  END IF;

  IF t = 'confirmed' AND d IS NOT NULL THEN
    SELECT ts.maker INTO pm_hit
    FROM public.trusted_source ts
    WHERE ts.kind = 'part_maker'
      AND ts.domain = d
      AND ts.maker_norm = ANY (SELECT lower(btrim(x)) FROM unnest(pmakers) AS x)
    LIMIT 1;
    IF pm_hit IS NOT NULL THEN
      trust := 'confirmed';
      trust_reason := 'Part maker trusted site (' || d || ')';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  trust := 'needs_checking';
  trust_reason := 'Source is not on the trusted list for this car or part maker';
  RETURN NEXT;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.compute_vehicle_oe_auto_trust(p_row public.vehicle_oe_number)
RETURNS TABLE(trust text, trust_reason text)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
  mk text;
  d1 text := public.source_domain(p_row.evidence_url);
  d2 text := public.source_domain(p_row.evidence_url_2);
  t1 text;
  t2 text;
  mk1 text;
  mk2 text;
BEGIN
  SELECT lower(btrim(vc.make)) INTO mk
  FROM public.vehicle_catalog vc
  WHERE vc.id = p_row.vehicle_catalog_id;

  t1 := public.source_trust(p_row.evidence_url, mk, NULL);
  IF p_row.evidence_url_2 IS NOT NULL AND btrim(p_row.evidence_url_2) <> '' THEN
    t2 := public.source_trust(p_row.evidence_url_2, mk, NULL);
  ELSE
    t2 := 'needs_checking';
  END IF;

  IF t1 = 'confirmed' OR t2 = 'confirmed' THEN
    trust := 'confirmed';
    IF t1 = 'confirmed' AND d1 IS NOT NULL THEN
      trust_reason := 'Car maker trusted site (' || d1 || ')';
    ELSIF t2 = 'confirmed' AND d2 IS NOT NULL THEN
      trust_reason := 'Car maker trusted site (' || d2 || ')';
    ELSE
      trust_reason := 'Car maker trusted site';
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Rule 3: two different part_maker trusted domains
  IF d1 IS NOT NULL AND d2 IS NOT NULL AND d1 <> d2 THEN
    SELECT ts.maker INTO mk1 FROM public.trusted_source ts WHERE ts.kind = 'part_maker' AND ts.domain = d1 LIMIT 1;
    SELECT ts.maker INTO mk2 FROM public.trusted_source ts WHERE ts.kind = 'part_maker' AND ts.domain = d2 LIMIT 1;
    IF mk1 IS NOT NULL AND mk2 IS NOT NULL AND mk1 IS DISTINCT FROM mk2 THEN
      trust := 'confirmed';
      trust_reason := mk1 || ' and ' || mk2 || ' catalogues agree';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  trust := 'needs_checking';
  trust_reason := 'Source is not confirmed for this factory number';
  RETURN NEXT;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3) Columns: part_listing, vehicle_oe_number
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.part_listing') IS NULL THEN
    RAISE NOTICE 'roomy_brakes_phase3a_trust: skip columns — part_listing missing';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'part_listing' AND column_name = 'trust'
  ) THEN
    ALTER TABLE public.part_listing
      ADD COLUMN trust text CHECK (trust IS NULL OR trust IN ('confirmed', 'needs_checking')),
      ADD COLUMN trust_reason text,
      ADD COLUMN trust_set_by text CHECK (trust_set_by IS NULL OR trust_set_by IN ('auto', 'owner')),
      ADD COLUMN trust_set_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.vehicle_oe_number') IS NULL THEN
    RAISE NOTICE 'roomy_brakes_phase3a_trust: skip columns — vehicle_oe_number missing';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_oe_number' AND column_name = 'evidence_url_2'
  ) THEN
    ALTER TABLE public.vehicle_oe_number
      ADD COLUMN evidence_url_2 text,
      ADD COLUMN trust text CHECK (trust IS NULL OR trust IN ('confirmed', 'needs_checking')),
      ADD COLUMN trust_reason text,
      ADD COLUMN trust_set_by text CHECK (trust_set_by IS NULL OR trust_set_by IN ('auto', 'owner')),
      ADD COLUMN trust_set_at timestamptz;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Triggers: auto trust for listings and OE rows
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_part_listing_auto_trust()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_trust text;
  v_reason text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.trust_set_by = 'owner' THEN
      NEW.trust_set_at := coalesce(NEW.trust_set_at, now());
      IF NEW.trust IS NULL OR btrim(coalesce(NEW.trust::text, '')) = '' THEN
        SELECT t.trust, t.trust_reason INTO v_trust, v_reason
        FROM public.compute_part_listing_auto_trust(NEW.evidence_url, NEW.vehicle_catalog_id, NEW.interchange_group_id) AS t;
        NEW.trust := v_trust;
        NEW.trust_reason := v_reason;
      END IF;
      RETURN NEW;
    END IF;
    SELECT t.trust, t.trust_reason INTO v_trust, v_reason
    FROM public.compute_part_listing_auto_trust(NEW.evidence_url, NEW.vehicle_catalog_id, NEW.interchange_group_id) AS t;
    NEW.trust := v_trust;
    NEW.trust_reason := v_reason;
    NEW.trust_set_by := 'auto';
    NEW.trust_set_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.trust_set_by = 'owner' THEN
      IF NEW.evidence_url IS DISTINCT FROM OLD.evidence_url
         OR NEW.vehicle_catalog_id IS DISTINCT FROM OLD.vehicle_catalog_id
         OR NEW.interchange_group_id IS DISTINCT FROM OLD.interchange_group_id
      THEN
        SELECT t.trust, t.trust_reason INTO v_trust, v_reason
        FROM public.compute_part_listing_auto_trust(NEW.evidence_url, NEW.vehicle_catalog_id, NEW.interchange_group_id) AS t;
        NEW.trust := v_trust;
        NEW.trust_reason := v_reason;
        NEW.trust_set_by := 'owner';
        NEW.trust_set_at := now();
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.evidence_url IS DISTINCT FROM OLD.evidence_url
       OR NEW.vehicle_catalog_id IS DISTINCT FROM OLD.vehicle_catalog_id
       OR NEW.interchange_group_id IS DISTINCT FROM OLD.interchange_group_id
       OR NEW.trust_set_by IS DISTINCT FROM OLD.trust_set_by
    THEN
      SELECT t.trust, t.trust_reason INTO v_trust, v_reason
      FROM public.compute_part_listing_auto_trust(NEW.evidence_url, NEW.vehicle_catalog_id, NEW.interchange_group_id) AS t;
      NEW.trust := v_trust;
      NEW.trust_reason := v_reason;
      NEW.trust_set_by := 'auto';
      NEW.trust_set_at := now();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS part_listing_auto_trust_biud ON public.part_listing;
DO $$
BEGIN
  IF to_regclass('public.part_listing') IS NOT NULL THEN
    CREATE TRIGGER part_listing_auto_trust_biud
      BEFORE INSERT OR UPDATE ON public.part_listing
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_part_listing_auto_trust();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_vehicle_oe_number_auto_trust()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_trust text;
  v_reason text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.trust_set_by = 'owner' THEN
      NEW.trust_set_at := coalesce(NEW.trust_set_at, now());
      IF NEW.trust IS NULL OR btrim(coalesce(NEW.trust::text, '')) = '' THEN
        SELECT t.trust, t.trust_reason INTO v_trust, v_reason
        FROM public.compute_vehicle_oe_auto_trust(NEW) AS t;
        NEW.trust := v_trust;
        NEW.trust_reason := v_reason;
      END IF;
      RETURN NEW;
    END IF;
    SELECT t.trust, t.trust_reason INTO v_trust, v_reason
    FROM public.compute_vehicle_oe_auto_trust(NEW) AS t;
    NEW.trust := v_trust;
    NEW.trust_reason := v_reason;
    NEW.trust_set_by := 'auto';
    NEW.trust_set_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.trust_set_by = 'owner' THEN
      IF NEW.evidence_url IS DISTINCT FROM OLD.evidence_url
         OR NEW.evidence_url_2 IS DISTINCT FROM OLD.evidence_url_2
         OR NEW.vehicle_catalog_id IS DISTINCT FROM OLD.vehicle_catalog_id
      THEN
        SELECT t.trust, t.trust_reason INTO v_trust, v_reason
        FROM public.compute_vehicle_oe_auto_trust(NEW) AS t;
        NEW.trust := v_trust;
        NEW.trust_reason := v_reason;
        NEW.trust_set_by := 'owner';
        NEW.trust_set_at := now();
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.evidence_url IS DISTINCT FROM OLD.evidence_url
       OR NEW.evidence_url_2 IS DISTINCT FROM OLD.evidence_url_2
       OR NEW.vehicle_catalog_id IS DISTINCT FROM OLD.vehicle_catalog_id
       OR NEW.trust_set_by IS DISTINCT FROM OLD.trust_set_by
    THEN
      SELECT t.trust, t.trust_reason INTO v_trust, v_reason
      FROM public.compute_vehicle_oe_auto_trust(NEW) AS t;
      NEW.trust := v_trust;
      NEW.trust_reason := v_reason;
      NEW.trust_set_by := 'auto';
      NEW.trust_set_at := now();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS vehicle_oe_number_auto_trust_biud ON public.vehicle_oe_number;
DO $$
BEGIN
  IF to_regclass('public.vehicle_oe_number') IS NOT NULL THEN
    CREATE TRIGGER vehicle_oe_number_auto_trust_biud
      BEFORE INSERT OR UPDATE ON public.vehicle_oe_number
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_vehicle_oe_number_auto_trust();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) trust_recompute_auto
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trust_recompute_auto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  -- Avoid part_match_trg_listing_scope row-level reference to r.listing_id during bulk trust updates.
  PERFORM set_config('part_match.busy', 'on', true);

  UPDATE public.part_listing pl
  SET trust = s.trust,
      trust_reason = s.trust_reason,
      trust_set_by = 'auto',
      trust_set_at = now()
  FROM (
    SELECT
      pl2.id,
      c.trust,
      c.trust_reason
    FROM public.part_listing pl2
    CROSS JOIN LATERAL public.compute_part_listing_auto_trust(
      pl2.evidence_url,
      pl2.vehicle_catalog_id,
      pl2.interchange_group_id
    ) AS c
    WHERE pl2.trust_set_by = 'auto' OR (pl2.trust_set_by IS NULL AND pl2.trust IS NULL)
  ) s
  WHERE pl.id = s.id;

  UPDATE public.vehicle_oe_number von
  SET trust = s.trust,
      trust_reason = s.trust_reason,
      trust_set_by = 'auto',
      trust_set_at = now()
  FROM (
    SELECT von2.id, c.trust, c.trust_reason
    FROM public.vehicle_oe_number von2
    CROSS JOIN LATERAL public.compute_vehicle_oe_auto_trust(von2) AS c
    WHERE von2.trust_set_by = 'auto' OR (von2.trust_set_by IS NULL AND von2.trust IS NULL)
  ) s
  WHERE von.id = s.id;

  PERFORM set_config('part_match.busy', 'off', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('part_match.busy', 'off', true);
  RAISE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.trust_recompute_auto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trust_recompute_auto() TO service_role;

REVOKE ALL ON FUNCTION public.source_domain(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.source_domain(text) TO service_role;

REVOKE ALL ON FUNCTION public.source_trust(text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.source_trust(text, text, text[]) TO service_role;

-- Fix rev12 part_match_trg_listing_scope (r.listing_id) before any bulk UPDATE on part_listing.
CREATE OR REPLACE FUNCTION public.part_match_trg_listing_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'part_listing' THEN
    UPDATE public.part_norm_position_backfill_report r
    SET resolved_at = now(),
        resolved_by = n.verified_by,
        resolution_source = 'listing_edit'
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE r.resolved_at IS NULL
      AND r.table_name = 'part_listing'
      AND r.row_id = n.id
      AND (o.position IS DISTINCT FROM n.position OR o.side IS DISTINCT FROM n.side);
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT n.interchange_group_id AS gid, n.vehicle_catalog_id AS vid FROM new_rows n
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT o.interchange_group_id AS gid, o.vehicle_catalog_id AS vid FROM old_rows o
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Backfill + Phase 1 OE data fix (SB + NiBK)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.part_listing') IS NULL THEN
    RAISE NOTICE 'roomy_brakes_phase3a_trust: skip backfill — part_listing missing';
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'part_listing' AND column_name = 'trust'
  ) THEN
    UPDATE public.part_listing pl
    SET trust_set_by = 'auto'
    WHERE pl.trust IS NULL;

    PERFORM public.trust_recompute_auto();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.vehicle_oe_number') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_oe_number' AND column_name = 'evidence_url_2'
  ) THEN
    UPDATE public.vehicle_oe_number von
    SET
      evidence_url_2 = 'https://jnbk-brakes.com/catalogue/cars/brake/723409/PN5562',
      note = 'SB and NiBK catalogues both list this factory number for this car.'
    WHERE von.evidence_url = 'https://www.sbparts.jp/catalogue/723410'
      AND von.oe_number_norm = '04465B1190'
      AND von.evidence_url_2 IS NULL;

    UPDATE public.vehicle_oe_number von
    SET trust_set_by = 'auto'
    WHERE von.trust IS NULL;

    PERFORM public.trust_recompute_auto();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7) admin_catalog_master_part — fits + factory OE rows on cars
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_catalog_master_part(p_part_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_group uuid;
  v_part jsonb;
  v_fits jsonb;
  v_factory jsonb;
  v_wva text;
  v_pos text;
  v_side text;
  v_fit_count integer;
  v_members jsonb;
  v_hash text;
BEGIN
  SELECT jsonb_build_object(
    'partId', pm.id,
    'groupId', pm.interchange_group_id,
    'name', coalesce(pm.name, ''),
    'number', coalesce(pm.oem_part_number, ''),
    'brand', coalesce(pm.manufacturer, ''),
    'partType', coalesce(mc.plain_name, mc.name, ''),
    'tier', CASE
      WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
      WHEN coalesce(g.fit_scope, '') = 'powertrain'
        AND NOT EXISTS (
          SELECT 1 FROM public.part_listing listed
          WHERE listed.interchange_group_id = pm.interchange_group_id
        ) THEN 3
      ELSE 1
    END,
    'status', CASE WHEN pm.catalog_decision = 'confirmed' THEN 'verified' ELSE 'needs_checking' END,
    'evidenceUrl', coalesce(pm.evidence_url, (
      SELECT pl.evidence_url FROM public.part_listing pl
      WHERE pl.interchange_group_id = pm.interchange_group_id
      ORDER BY pl.verified_at DESC NULLS LAST
      LIMIT 1
    )),
    'note', coalesce(pm.description, (
      SELECT pl.note FROM public.part_listing pl
      WHERE pl.interchange_group_id = pm.interchange_group_id AND coalesce(pl.note, '') <> ''
      LIMIT 1
    ), '')
  ), pm.interchange_group_id
  INTO v_part, v_group
  FROM public.part_master pm
  LEFT JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
  LEFT JOIN public.maintenance_service_categories mc ON mc.id = pm.maintenance_component_id
  WHERE pm.id = p_part_id
    AND pm.catalog_decision IS DISTINCT FROM 'rejected';

  IF v_part IS NULL THEN
    RETURN jsonb_build_object('error', 'Part not on file');
  END IF;

  SELECT pin.value INTO v_wva
  FROM public.part_index_number pin
  WHERE pin.part_id = p_part_id AND pin.index_type = 'wva'
  ORDER BY pin.created_at DESC
  LIMIT 1;

  SELECT pl.position, pl.side INTO v_pos, v_side
  FROM public.part_listing pl
  WHERE pl.interchange_group_id = v_group
  ORDER BY pl.verified_at DESC NULLS LAST, pl.created_at DESC
  LIMIT 1;

  SELECT count(DISTINCT pl.vehicle_catalog_id)::integer INTO v_fit_count
  FROM public.part_listing pl
  WHERE pl.interchange_group_id = v_group;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'partId', pm2.id,
      'number', pm2.oem_part_number,
      'brand', pm2.manufacturer,
      'name', pm2.name
    ) ORDER BY pm2.oem_part_number
  ), '[]'::jsonb)
  INTO v_members
  FROM public.part_master pm2
  WHERE pm2.interchange_group_id = v_group;

  SELECT left(md5(
    coalesce((SELECT oem_part_number_norm FROM public.part_master WHERE id = p_part_id), '')
    || '|' || coalesce(v_group::text, '')
    || '|' || coalesce((SELECT revision::text FROM public.part_interchange_group WHERE id = v_group), '0')
  ), 8)
  INTO v_hash;

  SELECT coalesce(jsonb_agg(fit ORDER BY fit->>'linkType', fit->>'make', fit->>'model'), '[]'::jsonb)
  INTO v_fits
  FROM (
    SELECT jsonb_build_object(
      'listingId', pl.id,
      'variantId', vc.id,
      'make', vc.make,
      'model', vc.model,
      'chassis', coalesce(vc.chassis_code, ''),
      'years', CASE
        WHEN pl.year_from IS NULL AND pl.year_to IS NULL THEN trim(both FROM
          coalesce(vc.production_start_year::text, '') ||
          CASE WHEN vc.production_end_year IS NULL THEN '–present' ELSE '–' || vc.production_end_year::text END
        )
        ELSE coalesce(pl.year_from::text, '') || '–' || coalesce(pl.year_to::text, 'present')
      END,
      'yearFrom', pl.year_from,
      'yearTo', pl.year_to,
      'position', coalesce(pl.position, ''),
      'side', coalesce(pl.side, ''),
      'linkType', 'DIRECT',
      'evidenceUrl', pl.evidence_url,
      'trust', pl.trust,
      'trustReason', pl.trust_reason,
      'trustSetBy', pl.trust_set_by
    ) AS fit
    FROM public.part_listing pl
    JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
    WHERE pl.interchange_group_id = v_group
    LIMIT 80
  ) direct;

  SELECT coalesce(jsonb_agg(obj ORDER BY obj->>'make', obj->>'model', obj->>'oeNumber'), '[]'::jsonb)
  INTO v_factory
  FROM (
    SELECT DISTINCT ON (von.id)
      jsonb_build_object(
        'oeId', von.id,
        'variantId', von.vehicle_catalog_id,
        'make', vc.make,
        'model', vc.model,
        'oeNumber', von.oe_number,
        'oeBrand', von.oe_brand,
        'evidenceUrl', von.evidence_url,
        'evidenceUrl2', von.evidence_url_2,
        'trust', von.trust,
        'trustReason', von.trust_reason,
        'trustSetBy', von.trust_set_by
      ) AS obj
    FROM public.part_fit_derived d
    JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
    JOIN public.vehicle_catalog vc ON vc.id = von.vehicle_catalog_id
    WHERE d.interchange_group_id = v_group
      AND d.vehicle_oe_number_id IS NOT NULL
    ORDER BY von.id
    LIMIT 200
  ) oe;

  RETURN v_part
    || jsonb_build_object(
      'wva', v_wva,
      'position', coalesce(v_pos, ''),
      'side', coalesce(v_side, ''),
      'fitCount', coalesce(v_fit_count, 0),
      'groupRevision', (SELECT ig.revision FROM public.part_interchange_group ig WHERE ig.id = v_group),
      'groupCode', (SELECT ig.code FROM public.part_interchange_group ig WHERE ig.id = v_group),
      'groupMembers', coalesce(v_members, '[]'::jsonb),
      'provenanceHash', v_hash,
      'hash', v_hash,
      'fits', coalesce(v_fits, '[]'::jsonb),
      'factoryOeOnCars', coalesce(v_factory, '[]'::jsonb)
    );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 8) admin_patch_part_listing_trust / years (for Edge)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_part_listing_patch_trust(p_listing_id uuid, p_trust text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_old record;
  v_new record;
  v_trust text;
  v_reason text;
BEGIN
  IF p_listing_id IS NULL THEN
    RAISE EXCEPTION 'Invalid listing';
  END IF;
  SELECT pl.id, pl.trust, pl.trust_reason, pl.trust_set_by
  INTO v_old
  FROM public.part_listing pl
  WHERE pl.id = p_listing_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF p_trust = 'auto' THEN
    SELECT c.trust, c.trust_reason INTO v_trust, v_reason
    FROM public.part_listing pl
    CROSS JOIN LATERAL public.compute_part_listing_auto_trust(
      pl.evidence_url, pl.vehicle_catalog_id, pl.interchange_group_id
    ) c
    WHERE pl.id = p_listing_id;

    UPDATE public.part_listing pl
    SET trust = v_trust,
        trust_reason = v_reason,
        trust_set_by = 'auto',
        trust_set_at = now()
    WHERE pl.id = p_listing_id;
  ELSIF p_trust IN ('confirmed', 'needs_checking') THEN
    UPDATE public.part_listing pl
    SET trust = p_trust,
        trust_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        trust_set_by = 'owner',
        trust_set_at = now()
    WHERE pl.id = p_listing_id;
  ELSE
    RAISE EXCEPTION 'Invalid trust value';
  END IF;

  SELECT pl.trust, pl.trust_reason, pl.trust_set_by INTO v_new
  FROM public.part_listing pl WHERE pl.id = p_listing_id;

  RETURN jsonb_build_object(
    'previous', jsonb_build_object(
      'trust', v_old.trust,
      'reason', v_old.trust_reason,
      'setBy', v_old.trust_set_by
    ),
    'current', jsonb_build_object(
      'trust', v_new.trust,
      'reason', v_new.trust_reason,
      'setBy', v_new.trust_set_by
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_part_listing_patch_years(
  p_listing_id uuid,
  p_year_from integer,
  p_year_to integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_yf_old integer;
  v_yt_old integer;
  v_yf_new integer;
  v_yt_new integer;
BEGIN
  IF p_listing_id IS NULL THEN
    RAISE EXCEPTION 'Invalid listing';
  END IF;
  IF p_year_from IS NOT NULL AND p_year_to IS NOT NULL AND p_year_from > p_year_to THEN
    RAISE EXCEPTION 'yearFrom must be <= yearTo';
  END IF;

  SELECT pl.year_from, pl.year_to INTO v_yf_old, v_yt_old
  FROM public.part_listing pl WHERE pl.id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  UPDATE public.part_listing pl
  SET year_from = p_year_from,
      year_to = p_year_to
  WHERE pl.id = p_listing_id;

  SELECT pl.year_from, pl.year_to INTO v_yf_new, v_yt_new FROM public.part_listing pl WHERE pl.id = p_listing_id;

  RETURN jsonb_build_object(
    'previous', jsonb_build_object('yearFrom', v_yf_old, 'yearTo', v_yt_old),
    'current', jsonb_build_object('yearFrom', v_yf_new, 'yearTo', v_yt_new)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_part_listing_patch_trust(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_part_listing_patch_trust(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_part_listing_patch_years(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_part_listing_patch_years(uuid, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 9) REPLACE save_self_serve_part — body from main 20261106132500 (engine-level
--    restore) + Phase 3a per-listing trust / reason / years on specific fits
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_self_serve_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_batch_code text;
  v_actor uuid := nullif(p_input->>'actorId', '')::uuid;
  v_type_id uuid := nullif(p_input->>'partTypeId', '')::uuid;
  v_brand text := btrim(coalesce(p_input->>'brand', ''));
  v_number text := btrim(coalesce(p_input->>'partNumber', ''));
  v_name text := coalesce(nullif(btrim(p_input->>'name'), ''), btrim(coalesce(p_input->>'partNumber', '')));
  v_source_type text := coalesce(nullif(p_input->>'sourceType', ''), 'other');
  v_evidence text := nullif(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_fit_mode text := lower(coalesce(p_input->>'fitMode', 'specific'));
  v_part_id uuid := nullif(p_input->>'existingPartId', '')::uuid;
  v_type record;
  v_category uuid;
  v_group uuid;
  v_decision text;
  v_row_id uuid;
  v_before jsonb;
  v_row jsonb;
  v_vid uuid;
  v_pos text;
  v_side text;
  v_line int := 0;
  v_engine uuid := nullif(p_input->>'engineFamilyId', '')::uuid;
  v_engine_pos text := nullif(lower(btrim(coalesce(p_input->>'position', ''))), '');
  v_spec_key text := nullif(btrim(p_input->>'specKey'), '');
  v_spec_value text := nullif(btrim(p_input->>'specValue'), '');
  v_oe_brand text;
  v_oe_norm text;
  v_fits int := 0;
  v_norm text;
  v_list_trust text;
  v_list_reason text;
  v_yf int;
  v_yt int;
BEGIN
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'Choose a part type'; END IF;
  IF v_brand = '' OR v_number = '' THEN RAISE EXCEPTION 'Brand and part number are required'; END IF;
  IF v_evidence IS NULL THEN RAISE EXCEPTION 'A source link is required'; END IF;
  IF v_source_type NOT IN ('car_maker_catalogue', 'part_maker_catalogue', 'other') THEN
    RAISE EXCEPTION 'Choose where you saw the part';
  END IF;
  IF v_fit_mode NOT IN ('specific', 'engine', 'spec') THEN RAISE EXCEPTION 'Choose how the part fits'; END IF;

  SELECT c.id, c.op_code, c.parent_id, c.position_scheme INTO v_type
  FROM public.maintenance_service_categories c
  WHERE c.id = v_type_id AND c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active';
  IF v_type.id IS NULL THEN RAISE EXCEPTION 'Invalid part type'; END IF;

  -- part_master.category_id points at part_category (one per area), not at the part type
  SELECT pc.id INTO v_category FROM public.part_category pc WHERE pc.area_id = v_type.parent_id LIMIT 1;
  IF v_category IS NULL THEN RAISE EXCEPTION 'This part type has no catalogue area yet'; END IF;

  -- AS-04: every fit's position must belong to the part type's scheme
  IF v_fit_mode = 'specific' AND jsonb_typeof(p_input->'listings') = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_input->'listings') AS value LOOP
      SELECT n.norm_position, n.norm_side INTO v_pos, v_side
      FROM public.part_norm_position(v_row->>'position', v_row->>'side') AS n;
      IF v_type.position_scheme = 'none' AND (v_pos IS NOT NULL OR v_side IS NOT NULL) THEN
        RAISE EXCEPTION 'This part type has no position';
      ELSIF v_type.position_scheme IN ('axle', 'axle_inner_outer') AND (v_pos IS NULL OR v_side IS NOT NULL) THEN
        RAISE EXCEPTION 'Choose Front or Rear';
      ELSIF v_type.position_scheme IN ('four_corners', 'axle_left_right') AND (v_pos IS NULL OR v_side IS NULL) THEN
        RAISE EXCEPTION 'Choose the corner (front/rear and left/right)';
      ELSIF v_type.position_scheme NOT IN ('none', 'axle', 'axle_inner_outer', 'four_corners', 'axle_left_right') THEN
        RAISE EXCEPTION 'This part type is added by engine or by size, not by specific cars';
      END IF;
    END LOOP;
  END IF;
  IF v_fit_mode = 'engine' THEN
    IF v_engine IS NULL THEN RAISE EXCEPTION 'Choose an engine'; END IF;
    IF v_type.position_scheme = 'before_after_catalyst' THEN
      IF v_engine_pos IS NULL OR v_engine_pos NOT IN ('before_cat', 'after_cat') THEN
        RAISE EXCEPTION 'Choose before or after the catalytic converter';
      END IF;
    ELSIF v_engine_pos IS NOT NULL THEN
      RAISE EXCEPTION 'This part type has no position';
    END IF;
  END IF;
  IF v_fit_mode = 'spec' AND (v_spec_key IS NULL OR v_spec_value IS NULL) THEN
    RAISE EXCEPTION 'Enter the size or spec';
  END IF;
  IF v_fit_mode = 'spec' THEN
    IF v_type.position_scheme = 'driver_passenger_rear' AND (v_engine_pos IS NULL OR v_engine_pos NOT IN ('driver', 'passenger', 'rear')) THEN
      RAISE EXCEPTION 'Choose driver, passenger, or rear';
    ELSIF v_type.position_scheme = 'low_high_beam' AND (v_engine_pos IS NULL OR v_engine_pos NOT IN ('low', 'high')) THEN
      RAISE EXCEPTION 'Choose low or high beam';
    ELSIF v_type.position_scheme = 'front_rear_side' AND (v_engine_pos IS NULL OR v_engine_pos NOT IN ('front', 'rear', 'side')) THEN
      RAISE EXCEPTION 'Choose front, rear, or side';
    ELSIF v_type.position_scheme = 'none' AND v_engine_pos IS NOT NULL THEN
      RAISE EXCEPTION 'This part type has no position';
    END IF;
  END IF;

  v_decision := public.self_serve_catalog_decision(v_source_type);
  v_norm := public.part_import_norm_number(v_number);
  v_batch_code := 'AP-' || upper(substr(replace(v_batch_id::text, '-', ''), 1, 8));

  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at, promoted_by, uploaded_by
  ) VALUES (
    v_batch_id, v_batch_code, v_type.parent_id, 1, 'self-serve', v_batch_code, 'imported', 'self_serve_add', now(), v_actor, v_actor
  );

  IF v_part_id IS NULL THEN
    SELECT pm.id INTO v_part_id
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_brand)
      AND pm.oem_part_number_norm = v_norm
    LIMIT 1;
  END IF;

  IF v_part_id IS NOT NULL THEN
    -- existing part: log it so Recently added shows this save; undo restores the same values
    SELECT pm.interchange_group_id, to_jsonb(pm.*) INTO v_group, v_before FROM public.part_master pm WHERE pm.id = v_part_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'That part no longer exists'; END IF;
    v_line := v_line + 1;
    INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
    VALUES (v_batch_id, v_line, 'part_master', v_part_id, 'update', v_before, v_before);
  END IF;

  IF v_group IS NULL THEN
    INSERT INTO public.part_interchange_group (code, label, fit_scope)
    VALUES ('SS-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), v_name, CASE WHEN v_fit_mode = 'engine' OR public.is_engine_level_op(v_type.op_code) THEN 'powertrain' WHEN v_fit_mode = 'spec' THEN 'universal' ELSE 'body' END)
    RETURNING id INTO v_group;
    v_line := v_line + 1;
    INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
    SELECT v_batch_id, v_line, 'part_interchange_group', v_group, 'insert', to_jsonb(g.*)
    FROM public.part_interchange_group g WHERE g.id = v_group;
    IF v_part_id IS NOT NULL THEN
      UPDATE public.part_master SET interchange_group_id = v_group WHERE id = v_part_id;
    END IF;
  END IF;

  IF v_part_id IS NULL THEN
    INSERT INTO public.part_master (
      category_id, name, oem_part_number, manufacturer, part_kind,
      interchange_group_id, maintenance_component_id, evidence_url,
      catalog_decision, source_type, verified_by, verified_at,
      updated_at, import_batch_id
    ) VALUES (
      v_category, v_name, v_number, v_brand, 'aftermarket',
      v_group, v_type_id, v_evidence,
      v_decision, v_source_type, v_actor, CASE WHEN v_decision = 'confirmed' THEN now() ELSE NULL END,
      now(), v_batch_id
    )
    RETURNING id INTO v_part_id;
    v_line := v_line + 1;
    INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
    SELECT v_batch_id, v_line, 'part_master', v_part_id, 'insert', to_jsonb(pm.*)
    FROM public.part_master pm WHERE pm.id = v_part_id;
  END IF;

  IF v_fit_mode = 'specific' AND jsonb_typeof(p_input->'listings') = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_input->'listings') AS value
    LOOP
      v_vid := nullif(v_row->>'vehicleId', '')::uuid;
      IF v_vid IS NULL THEN CONTINUE; END IF;
      SELECT n.norm_position, n.norm_side INTO v_pos, v_side
      FROM public.part_norm_position(v_row->>'position', v_row->>'side') AS n;
      v_row_id := NULL;
      SELECT pl.id INTO v_row_id
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group AND pl.vehicle_catalog_id = v_vid
        AND pl.position IS NOT DISTINCT FROM v_pos AND pl.side IS NOT DISTINCT FROM v_side;
      v_yf := nullif(v_row->>'yearFrom', '')::int;
      v_yt := nullif(v_row->>'yearTo', '')::int;
      v_list_trust := nullif(lower(btrim(v_row->>'trust')), '');
      IF v_list_trust IS NOT NULL AND v_list_trust NOT IN ('confirmed', 'needs_checking') THEN
        v_list_trust := NULL;
      END IF;
      v_list_reason := nullif(btrim(v_row->>'reason'), '');

      IF v_row_id IS NULL THEN
        IF v_list_trust IS NOT NULL THEN
          INSERT INTO public.part_listing (
            interchange_group_id, vehicle_catalog_id, position, side,
            year_from, year_to, evidence_url, origin, import_batch_id,
            trust, trust_reason, trust_set_by, trust_set_at
          ) VALUES (
            v_group, v_vid, v_pos, v_side,
            v_yf, v_yt,
            v_evidence, 'manual', v_batch_id,
            v_list_trust, v_list_reason, 'owner', now()
          )
          RETURNING id INTO v_row_id;
        ELSE
          INSERT INTO public.part_listing (
            interchange_group_id, vehicle_catalog_id, position, side,
            year_from, year_to, evidence_url, origin, import_batch_id
          ) VALUES (
            v_group, v_vid, v_pos, v_side,
            v_yf, v_yt,
            v_evidence, 'manual', v_batch_id
          )
          RETURNING id INTO v_row_id;
        END IF;
        v_line := v_line + 1;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
        SELECT v_batch_id, v_line, 'part_listing', v_row_id, 'insert', to_jsonb(pl.*)
        FROM public.part_listing pl WHERE pl.id = v_row_id;
        v_fits := v_fits + 1;
      END IF;
    END LOOP;
  ELSIF v_fit_mode = 'engine' THEN
    UPDATE public.part_interchange_group g SET fit_scope = 'powertrain'
    WHERE g.id = v_group AND g.fit_scope = 'body' AND public.is_engine_level_op(v_type.op_code);
    v_row_id := NULL;
    SELECT r.id INTO v_row_id FROM public.interchange_fitment_rule r
    WHERE r.interchange_group_id = v_group AND r.target_kind = 'engine_family'
      AND r.engine_family_id = v_engine AND r.position IS NOT DISTINCT FROM v_engine_pos;
    IF v_row_id IS NULL THEN
      INSERT INTO public.interchange_fitment_rule (
        interchange_group_id, target_kind, engine_family_id, position, source, notes, verified_by, verified_at, import_batch_id
      ) VALUES (
        v_group, 'engine_family', v_engine, v_engine_pos, 'manual', v_name,
        v_actor, CASE WHEN v_decision = 'confirmed' THEN now() ELSE NULL END, v_batch_id
      )
      RETURNING id INTO v_row_id;
      v_line := v_line + 1;
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
      SELECT v_batch_id, v_line, 'interchange_fitment_rule', v_row_id, 'insert', to_jsonb(r.*)
      FROM public.interchange_fitment_rule r WHERE r.id = v_row_id;
    END IF;
    FOR v_vid IN
      SELECT vc.id
      FROM public.vehicle_catalog vc
      WHERE vc.engine_family_id = v_engine
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(p_input->'excludedVehicleIds', '[]'::jsonb)) AS ex(id_txt)
          WHERE btrim(ex.id_txt) <> '' AND ex.id_txt::uuid = vc.id
        )
    LOOP
      v_row_id := NULL;
      SELECT pl.id INTO v_row_id
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group AND pl.vehicle_catalog_id = v_vid
        AND pl.position IS NOT DISTINCT FROM v_engine_pos AND pl.side IS NULL;
      IF v_row_id IS NULL THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side,
          evidence_url, origin, import_batch_id
        ) VALUES (
          v_group, v_vid, v_engine_pos, NULL,
          v_evidence, 'manual', v_batch_id
        )
        RETURNING id INTO v_row_id;
        v_line := v_line + 1;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
        SELECT v_batch_id, v_line, 'part_listing', v_row_id, 'insert', to_jsonb(pl.*)
        FROM public.part_listing pl WHERE pl.id = v_row_id;
        v_fits := v_fits + 1;
      END IF;
    END LOOP;
    -- AS4-01: cars the user excluded on the engine step must not get the part
    IF jsonb_typeof(p_input->'excludedVehicleIds') = 'array' THEN
      FOR v_vid IN
        SELECT DISTINCT x::uuid
        FROM jsonb_array_elements_text(p_input->'excludedVehicleIds') AS x
        JOIN public.vehicle_catalog vc ON vc.id = x::uuid AND vc.engine_family_id = v_engine
        WHERE x <> ''
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.part_listing_exclusion e
          WHERE e.interchange_group_id = v_group AND e.vehicle_catalog_id = v_vid
        ) THEN
          INSERT INTO public.part_listing_exclusion (interchange_group_id, vehicle_catalog_id, reason, evidence_url, source, created_by)
          VALUES (v_group, v_vid, 'Excluded when added by engine', v_evidence, 'manual', v_actor)
          RETURNING id INTO v_row_id;
          v_line := v_line + 1;
          INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
          SELECT v_batch_id, v_line, 'part_listing_exclusion', v_row_id, 'insert', to_jsonb(e.*)
          FROM public.part_listing_exclusion e WHERE e.id = v_row_id;
        END IF;
      END LOOP;
    END IF;
  ELSIF v_fit_mode = 'spec' THEN
    v_row_id := NULL;
    v_before := NULL;
    SELECT up.id, to_jsonb(up.*) INTO v_row_id, v_before
    FROM public.universal_part up WHERE up.manufacturer = v_brand AND up.part_number = v_number;
    v_row := public.save_universal_part(jsonb_build_object(
      'specKey', v_spec_key,
      'specValue', v_spec_value,
      'manufacturer', v_brand,
      'partNumber', v_number,
      'name', v_name,
      'evidenceUrl', v_evidence,
      'extra', jsonb_build_object('partId', v_part_id, 'partTypeOpCode', v_type.op_code)
    ));
    v_line := v_line + 1;
    IF v_row_id IS NULL THEN
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
      VALUES (v_batch_id, v_line, 'universal_part', (v_row->>'id')::uuid, 'insert', v_row);
    ELSE
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (v_batch_id, v_line, 'universal_part', v_row_id, 'update', v_before, v_row);
    END IF;
    v_fits := v_fits + 1;
  END IF;

  IF jsonb_typeof(p_input->'factoryNumbers') = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_input->'factoryNumbers') AS value
    LOOP
      IF btrim(coalesce(v_row->>'number', '')) = '' THEN CONTINUE; END IF;
      v_oe_brand := coalesce(nullif(btrim(v_row->>'brand'), ''), 'OEM');
      v_oe_norm := public.part_import_norm_number(v_row->>'number');
      v_row_id := NULL;
      SELECT r.id INTO v_row_id FROM public.part_oe_reference r
      WHERE r.part_id = v_part_id AND upper(coalesce(r.oe_brand, '')) = upper(v_oe_brand) AND r.oe_number_norm = v_oe_norm;
      IF v_row_id IS NULL THEN
        INSERT INTO public.part_oe_reference (
          part_id, reference_type, oe_brand, oe_number, oe_number_norm, evidence_url, created_by, import_batch_id
        ) VALUES (
          v_part_id, 'replaces', v_oe_brand, btrim(v_row->>'number'), v_oe_norm, v_evidence, v_actor, v_batch_id
        )
        RETURNING id INTO v_row_id;
        v_line := v_line + 1;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
        SELECT v_batch_id, v_line, 'part_oe_reference', v_row_id, 'insert', to_jsonb(r.*)
        FROM public.part_oe_reference r WHERE r.id = v_row_id;
        v_fits := v_fits + 1;
      END IF;
    END LOOP;
  END IF;

  IF v_fits = 0 AND NOT EXISTS (
    SELECT 1 FROM public.part_import_change WHERE batch_id = v_batch_id AND op = 'insert'
  ) THEN
    RAISE EXCEPTION 'Nothing new to save - this part already has these fits';
  END IF;

  UPDATE public.part_import_batch SET
    parts_created = (SELECT count(*) FROM public.part_import_change WHERE batch_id = v_batch_id AND table_name = 'part_master' AND op = 'insert'),
    fits_created = v_fits
  WHERE id = v_batch_id;

  PERFORM public.part_match_recompute(v_group, NULL);

  UPDATE public.part_import_change pic
  SET after = public.part_import_row_snapshot(pic.table_name, pic.row_id)
  WHERE pic.batch_id = v_batch_id
    AND pic.op = 'insert'
    AND public.part_import_row_snapshot(pic.table_name, pic.row_id) IS NOT NULL;

  RETURN jsonb_build_object(
    'batchId', v_batch_id,
    'batchCode', v_batch_code,
    'partId', v_part_id,
    'groupId', v_group,
    'catalogDecision', v_decision,
    'trustLabel', CASE v_source_type
      WHEN 'car_maker_catalogue' THEN 'Verified · car maker''s catalogue'
      WHEN 'part_maker_catalogue' THEN 'Verified · part maker''s catalogue'
      ELSE 'Needs checking · other source'
    END,
    'preview', public.self_serve_part_add_preview(p_input)
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.save_self_serve_part(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_self_serve_part(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 10) self_serve_part_add_preview — add listingTrustPreview per car
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.self_serve_part_add_preview(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_mode text := lower(coalesce(p_input->>'fitMode', ''));
  v_engine uuid := nullif(p_input->>'engineFamilyId', '')::uuid;
  v_spec_key text := nullif(btrim(p_input->>'specKey'), '');
  v_spec_value text := nullif(btrim(p_input->>'specValue'), '');
  v_evidence text := nullif(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_brand text := btrim(coalesce(p_input->>'brand', ''));
  v_part_id uuid := nullif(p_input->>'existingPartId', '')::uuid;
  v_group uuid;
  v_oe_norm text;
  v_car_count int := 0;
  v_oe_extra int := 0;
  v_excluded int := 0;
  v_base jsonb;
  v_plain jsonb;
  v_preview_input jsonb;
  v_trust_lines jsonb := '[]'::jsonb;
  v_row jsonb;
  v_vid uuid;
  v_mk text;
  v_pm text[];
  t_trust text;
  t_reason text;
BEGIN
  IF v_mode = 'engine' AND v_engine IS NOT NULL THEN
    SELECT count(*)::int INTO v_car_count FROM public.vehicle_catalog vc WHERE vc.engine_family_id = v_engine;
    IF jsonb_typeof(p_input->'excludedVehicleIds') = 'array' THEN
      SELECT count(DISTINCT vid)::int INTO v_excluded
      FROM jsonb_array_elements_text(p_input->'excludedVehicleIds') AS vid
      JOIN public.vehicle_catalog vc ON vc.id = vid::uuid
      WHERE vid <> '' AND vc.engine_family_id = v_engine;
      v_car_count := greatest(0, v_car_count - v_excluded);
    END IF;
  ELSIF v_mode = 'spec' AND v_spec_key IS NOT NULL AND v_spec_value IS NOT NULL THEN
    SELECT count(DISTINCT sv.vehicle_catalog_id)::int INTO v_car_count
    FROM public.catalog_spec_value sv
    WHERE sv.spec_key = v_spec_key AND btrim(sv.value) = v_spec_value;
  ELSIF v_mode = 'specific' AND jsonb_typeof(p_input->'vehicleIds') = 'array' THEN
    SELECT count(DISTINCT vid)::int INTO v_car_count
    FROM jsonb_array_elements_text(p_input->'vehicleIds') AS vid
    WHERE vid <> '';
  ELSIF v_mode = 'specific' AND jsonb_typeof(p_input->'listings') = 'array' THEN
    SELECT count(DISTINCT l->>'vehicleId')::int INTO v_car_count
    FROM jsonb_array_elements(p_input->'listings') AS l
    WHERE coalesce(l->>'vehicleId', '') <> '';
  END IF;

  IF jsonb_typeof(p_input->'factoryNumbers') = 'array' THEN
    FOR v_oe_norm IN
      SELECT public.part_import_norm_number(elem->>'number')
      FROM jsonb_array_elements(p_input->'factoryNumbers') AS elem
      WHERE coalesce(elem->>'number', '') <> ''
    LOOP
      IF v_oe_norm IS NOT NULL AND v_oe_norm <> '' THEN
        SELECT v_oe_extra + count(DISTINCT von.vehicle_catalog_id)::int INTO v_oe_extra
        FROM public.vehicle_oe_number von
        WHERE von.oe_number_norm = v_oe_norm;
      END IF;
    END LOOP;
  END IF;

  -- Preview auto trust per listed car (specific mode)
  IF v_mode = 'specific' AND jsonb_typeof(p_input->'listings') = 'array' AND v_evidence IS NOT NULL THEN
    v_group := NULL;
    IF v_part_id IS NOT NULL THEN
      SELECT pm.interchange_group_id INTO v_group FROM public.part_master pm WHERE pm.id = v_part_id;
    END IF;
    IF v_group IS NOT NULL THEN
      v_pm := public.part_listing_interchange_part_makers(v_group);
    ELSE
      v_pm := ARRAY[v_brand];
    END IF;
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_input->'listings') AS value LOOP
      v_vid := nullif(v_row->>'vehicleId', '')::uuid;
      IF v_vid IS NULL THEN CONTINUE; END IF;
      SELECT lower(btrim(vc.make)) INTO v_mk FROM public.vehicle_catalog vc WHERE vc.id = v_vid;
      t_trust := public.source_trust(v_evidence, v_mk, v_pm);
      IF t_trust = 'confirmed' AND public.source_domain(v_evidence) IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.trusted_source ts
        WHERE ts.kind = 'car_maker' AND ts.maker_norm = v_mk AND ts.domain = public.source_domain(v_evidence)
      ) THEN
        t_reason := 'Car maker trusted site (' || public.source_domain(v_evidence) || ')';
      ELSIF t_trust = 'confirmed' THEN
        t_reason := 'Part maker trusted site (' || coalesce(public.source_domain(v_evidence), '') || ')';
      ELSE
        t_reason := 'Source is not on the trusted list for this car or part maker';
      END IF;
      v_trust_lines := v_trust_lines || jsonb_build_array(
        jsonb_build_object(
          'vehicleId', v_vid,
          'trust', t_trust,
          'trustReason', t_reason
        )
      );
    END LOOP;
  END IF;

  v_base := jsonb_build_object(
    'carCount', coalesce(v_car_count, 0),
    'oeExtraCarCount', coalesce(v_oe_extra, 0),
    'totalReach', coalesce(v_car_count, 0) + coalesce(v_oe_extra, 0),
    'excludedCount', coalesce(v_excluded, 0),
    'listingTrustPreview', coalesce(v_trust_lines, '[]'::jsonb)
  );

  v_preview_input := p_input || jsonb_build_object(
    'carCount', coalesce(v_car_count, 0),
    'totalReach', coalesce(v_car_count, 0) + coalesce(v_oe_extra, 0)
  );
  v_plain := public.self_serve_plain_words(v_preview_input);

  RETURN v_base || coalesce(v_plain, '{}'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.self_serve_part_add_preview(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_part_add_preview(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.part_listing_interchange_part_makers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_listing_interchange_part_makers(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.compute_part_listing_auto_trust(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_part_listing_auto_trust(text, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.compute_vehicle_oe_auto_trust(public.vehicle_oe_number) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_vehicle_oe_auto_trust(public.vehicle_oe_number) TO service_role;
