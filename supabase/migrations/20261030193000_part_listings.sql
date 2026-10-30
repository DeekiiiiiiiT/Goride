-- Parts are facts (a source lists a part for one vehicle). Match types are derived.
-- Dominion stays master data. No fleet stock in these tables.

ALTER TABLE public.interchange_fitment_rule
  DROP CONSTRAINT IF EXISTS interchange_fitment_rule_source_check;

ALTER TABLE public.interchange_fitment_rule
  ADD CONSTRAINT interchange_fitment_rule_source_check CHECK (
    source IN ('manual', 'oem_catalog', 'supplier', 'install_confirmed', 'import', 'listing')
  );

CREATE TABLE IF NOT EXISTS public.part_listing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interchange_group_id uuid NOT NULL REFERENCES public.part_interchange_group(id) ON DELETE CASCADE,
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  position text,
  year_from integer,
  year_to integer,
  evidence_url text NOT NULL,
  note text,
  verified_by uuid,
  verified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_listing_evidence_check CHECK (btrim(evidence_url) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS part_listing_variant_position
  ON public.part_listing (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''));

CREATE INDEX IF NOT EXISTS part_listing_variant_idx
  ON public.part_listing (vehicle_catalog_id);

CREATE TABLE IF NOT EXISTS public.part_listing_exclusion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interchange_group_id uuid NOT NULL REFERENCES public.part_interchange_group(id) ON DELETE CASCADE,
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  reason text NOT NULL,
  evidence_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_listing_exclusion_evidence_check CHECK (btrim(evidence_url) <> ''),
  UNIQUE (interchange_group_id, vehicle_catalog_id)
);

ALTER TABLE public.part_listing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_listing_exclusion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS part_listing_no_direct_access ON public.part_listing;
CREATE POLICY part_listing_no_direct_access ON public.part_listing USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS part_listing_exclusion_no_direct_access ON public.part_listing_exclusion;
CREATE POLICY part_listing_exclusion_no_direct_access ON public.part_listing_exclusion USING (false) WITH CHECK (false);

GRANT ALL ON TABLE public.part_listing TO service_role;
GRANT ALL ON TABLE public.part_listing_exclusion TO service_role;
REVOKE ALL ON TABLE public.part_listing FROM anon, authenticated;
REVOKE ALL ON TABLE public.part_listing_exclusion FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_part_listing_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.interchange_fitment_rule
    WHERE interchange_group_id = OLD.interchange_group_id
      AND target_kind = 'catalog_variant'
      AND vehicle_catalog_id = OLD.vehicle_catalog_id
      AND source = 'listing'
      AND COALESCE(position, '') = COALESCE(OLD.position, '');
    RETURN OLD;
  END IF;

  DELETE FROM public.interchange_fitment_rule
  WHERE interchange_group_id = NEW.interchange_group_id
    AND target_kind = 'catalog_variant'
    AND vehicle_catalog_id = NEW.vehicle_catalog_id
    AND source = 'listing'
    AND COALESCE(position, '') = COALESCE(NEW.position, '');

  INSERT INTO public.interchange_fitment_rule (
    interchange_group_id, target_kind, vehicle_catalog_id,
    year_from, year_to, position, source, verified_by, verified_at, notes
  ) VALUES (
    NEW.interchange_group_id, 'catalog_variant', NEW.vehicle_catalog_id,
    NEW.year_from, NEW.year_to, NEW.position, 'listing', NEW.verified_by, NEW.verified_at, NEW.note
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_part_listing_rule() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS part_listing_sync_rule ON public.part_listing;
CREATE TRIGGER part_listing_sync_rule
  AFTER INSERT OR UPDATE OR DELETE ON public.part_listing
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_part_listing_rule();

-- Platforms are unique per maker. Two makers on one row is a mistake unless split.
ALTER TABLE public.vehicle_platform
  ADD COLUMN IF NOT EXISTS maker text,
  ADD COLUMN IF NOT EXISTS family_evidence_url text;

UPDATE public.vehicle_platform vp
SET maker = sub.make
FROM (
  SELECT platform_id, min(make) AS make
  FROM public.vehicle_catalog
  WHERE platform_id IS NOT NULL AND coalesce(btrim(make), '') <> ''
  GROUP BY platform_id
) sub
WHERE vp.id = sub.platform_id
  AND coalesce(btrim(vp.maker), '') = '';

UPDATE public.vehicle_platform
SET maker = code
WHERE coalesce(btrim(maker), '') = '';

ALTER TABLE public.vehicle_platform
  DROP CONSTRAINT IF EXISTS vehicle_platform_code_key;

DO $$
DECLARE
  parent_row record;
  extra_make text;
  new_id uuid;
  kept text;
BEGIN
  FOR parent_row IN
    SELECT vp.id, vp.code, vp.label, vp.notes, vp.maker
    FROM public.vehicle_platform vp
    WHERE (
      SELECT count(DISTINCT vc.make)
      FROM public.vehicle_catalog vc
      WHERE vc.platform_id = vp.id
        AND coalesce(btrim(vc.make), '') <> ''
    ) > 1
  LOOP
    SELECT min(vc.make) INTO kept
    FROM public.vehicle_catalog vc
    WHERE vc.platform_id = parent_row.id;
    UPDATE public.vehicle_platform SET maker = kept WHERE id = parent_row.id;
    FOR extra_make IN
      SELECT DISTINCT vc.make
      FROM public.vehicle_catalog vc
      WHERE vc.platform_id = parent_row.id
        AND vc.make IS DISTINCT FROM kept
    LOOP
      INSERT INTO public.vehicle_platform (code, label, notes, maker)
      VALUES (parent_row.code, parent_row.label, parent_row.notes, extra_make)
      RETURNING id INTO new_id;
      UPDATE public.vehicle_catalog
      SET platform_id = new_id
      WHERE platform_id = parent_row.id AND make = extra_make;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.vehicle_platform
  ALTER COLUMN maker SET DEFAULT '',
  ALTER COLUMN maker SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vehicle_platform_maker_code_key
  ON public.vehicle_platform (maker, code);

ALTER TABLE public.vehicle_platform
  DROP CONSTRAINT IF EXISTS vehicle_platform_family_evidence_check;

ALTER TABLE public.vehicle_platform
  ADD CONSTRAINT vehicle_platform_family_evidence_check CHECK (
    parent_id IS NULL OR coalesce(btrim(family_evidence_url), '') <> ''
  );

CREATE OR REPLACE FUNCTION public.reject_mixed_maker_platform()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.platform_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.vehicle_catalog vc
    WHERE vc.platform_id = NEW.platform_id
      AND vc.id IS DISTINCT FROM NEW.id
      AND lower(coalesce(vc.make, '')) <> lower(coalesce(NEW.make, ''))
      AND coalesce(btrim(vc.make), '') <> ''
      AND coalesce(btrim(NEW.make), '') <> ''
  ) THEN
    RAISE EXCEPTION 'One body cannot hold two makers. Put each maker on its own body, then link the sister family.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_mixed_maker_platform() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vehicle_catalog_one_maker_per_platform ON public.vehicle_catalog;
CREATE TRIGGER vehicle_catalog_one_maker_per_platform
  BEFORE INSERT OR UPDATE OF platform_id, make ON public.vehicle_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_mixed_maker_platform();

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
  description text
)
LANGUAGE sql
STABLE
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
      pl.year_from,
      pl.year_to,
      g.fit_scope,
      lvc.make AS listed_make,
      lvc.model AS listed_model,
      lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine,
      lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE (pl.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= pl.year_from)
      AND (pl.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= pl.year_to)
      AND NOT EXISTS (
        SELECT 1
        FROM public.part_listing_exclusion ex
        WHERE ex.interchange_group_id = pl.interchange_group_id
          AND ex.vehicle_catalog_id = cat.id
      )
  ),
  scored AS (
    SELECT
      listings.*,
      CASE
        WHEN listings.listed_id = cat.id THEN 1
        WHEN lower(listings.listed_make) = lower(cat.make)
          AND lower(listings.listed_model) = lower(cat.model)
          AND upper(trim(coalesce(listings.listed_chassis, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          ) THEN 1
        WHEN listings.listed_platform IN (SELECT id FROM family)
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          ) THEN 2
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
    SELECT DISTINCT ON (group_id, position)
      group_id,
      listing_tier,
      position,
      fit_scope,
      listed_label
    FROM scored
    WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, listing_tier ASC, listed_id
  ),
  hits AS (
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
      bg.listed_label AS source_make
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
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id)
      h.interchange_group_id,
      h.oem_part_number AS reference_oem,
      h.manufacturer AS reference_manufacturer
    FROM hits h
    WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
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
    h.description
  FROM hits h
  LEFT JOIN sister ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id;
$$;

DROP FUNCTION IF EXISTS public.seed_in_use_engine_parts();

REVOKE INSERT, UPDATE, DELETE ON TABLE public.part_fitment FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_parts_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'vehicles', (SELECT count(*) FROM public.vehicle_catalog),
    'partsOnFile', (SELECT count(*) FROM public.part_master WHERE catalog_decision IS DISTINCT FROM 'rejected'),
    'vehiclesWithParts', (
      SELECT count(DISTINCT vehicle_catalog_id) FROM public.part_listing
    ),
    'waiting', (
      (SELECT count(*) FROM public.part_master WHERE catalog_decision = 'pending')
      + (SELECT count(*) FROM public.vehicle_catalog_pending_requests WHERE status IN ('pending', 'needs_info'))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_body_families()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'families', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', parent.id,
        'code', parent.code,
        'label', COALESCE(parent.label, parent.code),
        'maker', parent.maker,
        'evidenceUrl', parent.family_evidence_url,
        'members', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', child.id,
            'code', child.code,
            'maker', child.maker,
            'label', child.label
          ) ORDER BY child.maker, child.code), '[]'::jsonb)
          FROM public.vehicle_platform child
          WHERE child.parent_id = parent.id
        )
      ) ORDER BY parent.label)
      FROM public.vehicle_platform parent
      WHERE parent.parent_id IS NULL
        AND EXISTS (SELECT 1 FROM public.vehicle_platform c WHERE c.parent_id = parent.id)
    ), '[]'::jsonb),
    'unassigned', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vp.id,
        'code', vp.code,
        'maker', vp.maker,
        'label', vp.label,
        'cars', (
          SELECT count(*) FROM public.vehicle_catalog vc WHERE vc.platform_id = vp.id
        )
      ) ORDER BY vp.maker, vp.code)
      FROM public.vehicle_platform vp
      WHERE vp.parent_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.vehicle_platform c WHERE c.parent_id = vp.id)
    ), '[]'::jsonb),
    'engines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ef.id,
        'code', ef.code,
        'displacementCc', ef.displacement_cc,
        'fuel', ef.fuel_type,
        'cars', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', vc.id,
            'make', vc.make,
            'model', vc.model,
            'chassis', vc.chassis_code
          ) ORDER BY vc.make, vc.model), '[]'::jsonb)
          FROM public.vehicle_catalog vc
          WHERE vc.engine_family_id = ef.id
        )
      ) ORDER BY ef.code)
      FROM public.engine_family ef
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_save_body_family(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := NULLIF(btrim(coalesce(p_input->>'label', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_reason text := NULLIF(btrim(coalesce(p_input->>'reason', '')), '');
  v_family uuid := NULLIF(p_input->>'familyId', '')::uuid;
  v_action text := COALESCE(NULLIF(lower(btrim(coalesce(p_input->>'action', ''))), ''), 'add');
  v_dry boolean := COALESCE((p_input->>'dryRun')::boolean, false);
  v_move boolean := COALESCE((p_input->>'move')::boolean, false);
  v_platform uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'A sister family needs a source link';
  END IF;
  IF v_action NOT IN ('add', 'remove') THEN
    RAISE EXCEPTION 'Choose add or remove';
  END IF;
  IF v_label IS NULL AND v_family IS NULL AND v_action = 'add' THEN
    RAISE EXCEPTION 'Name the sister family';
  END IF;
  IF v_family IS NULL AND v_action = 'remove' THEN
    RAISE EXCEPTION 'Choose the sister family';
  END IF;

  SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
  INTO v_ids
  FROM jsonb_array_elements_text(COALESCE(p_input->'platformIds', '[]'::jsonb)) AS value;

  IF EXISTS (
    SELECT 1
    FROM public.vehicle_platform vp
    WHERE vp.id = ANY(v_ids)
      AND (
        vp.maker = 'family'
        OR EXISTS (SELECT 1 FROM public.vehicle_platform child WHERE child.parent_id = vp.id)
      )
  ) THEN
    RAISE EXCEPTION 'A family cannot be a member of a family';
  END IF;

  IF v_action = 'add' AND NOT v_move AND EXISTS (
    SELECT 1
    FROM public.vehicle_platform vp
    WHERE vp.id = ANY(v_ids)
      AND vp.parent_id IS NOT NULL
      AND (v_family IS NULL OR vp.parent_id IS DISTINCT FROM v_family)
  ) THEN
    RAISE EXCEPTION 'That body is already in another family';
  END IF;

  IF v_family IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code
    ) ORDER BY vc.make, vc.model, vc.chassis_code), '[]'::jsonb)
    INTO v_before
    FROM public.vehicle_catalog vc
    JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
    WHERE vp.id = v_family OR vp.parent_id = v_family;
  ELSE
    v_before := '[]'::jsonb;
  END IF;

  IF v_dry THEN
    IF v_action = 'remove' THEN
      SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'make', row_data->>'model', row_data->>'chassis'), '[]'::jsonb)
      INTO v_after
      FROM (
        SELECT jsonb_build_object('make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code) AS row_data
        FROM public.vehicle_catalog vc
        JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
        WHERE (vp.id = v_family OR vp.parent_id = v_family)
          AND NOT (vp.id = ANY(v_ids))
      ) listed;
    ELSE
      SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'make', row_data->>'model', row_data->>'chassis'), '[]'::jsonb)
      INTO v_after
      FROM (
        SELECT DISTINCT jsonb_build_object('make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code) AS row_data
        FROM public.vehicle_catalog vc
        JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
        WHERE vp.parent_id = v_family
           OR vp.id = ANY(v_ids)
           OR (v_family IS NOT NULL AND vp.id = v_family)
      ) listed;
    END IF;
    RETURN jsonb_build_object(
      'familyId', v_family,
      'dryRun', true,
      'before', jsonb_array_length(v_before),
      'after', jsonb_array_length(v_after),
      'beforeCars', v_before,
      'afterCars', v_after
    );
  END IF;

  IF v_family IS NULL THEN
    INSERT INTO public.vehicle_platform (code, label, maker, notes, family_evidence_url)
    VALUES (
      left(regexp_replace(upper(v_label), '[^A-Z0-9]+', '-', 'g'), 40) || '-FAMILY',
      v_label,
      'family',
      COALESCE(v_reason, 'Sister family'),
      v_evidence
    )
    RETURNING id INTO v_family;
  ELSIF v_reason IS NOT NULL THEN
    UPDATE public.vehicle_platform SET notes = v_reason WHERE id = v_family;
  END IF;

  FOREACH v_platform IN ARRAY v_ids
  LOOP
    IF v_action = 'remove' THEN
      UPDATE public.vehicle_platform
      SET parent_id = NULL,
          family_evidence_url = NULL
      WHERE id = v_platform
        AND parent_id = v_family;
    ELSE
      UPDATE public.vehicle_platform
      SET parent_id = v_family,
          family_evidence_url = v_evidence
      WHERE id = v_platform
        AND id <> v_family;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code
  ) ORDER BY vc.make, vc.model, vc.chassis_code), '[]'::jsonb)
  INTO v_after
  FROM public.vehicle_catalog vc
  JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
  WHERE vp.id = v_family OR vp.parent_id = v_family;

  RETURN jsonb_build_object(
    'familyId', v_family,
    'dryRun', false,
    'before', jsonb_array_length(v_before),
    'after', jsonb_array_length(v_after),
    'beforeCars', v_before,
    'afterCars', v_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_exclude_listing(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_reason text := NULLIF(btrim(coalesce(p_input->>'reason', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
BEGIN
  IF v_group IS NULL OR v_variant IS NULL OR v_reason IS NULL OR v_evidence IS NULL THEN
    RAISE EXCEPTION 'An exclusion needs the part, the vehicle, a reason, and a source link';
  END IF;
  INSERT INTO public.part_listing_exclusion (interchange_group_id, vehicle_catalog_id, reason, evidence_url)
  VALUES (v_group, v_variant, v_reason, v_evidence)
  ON CONFLICT (interchange_group_id, vehicle_catalog_id)
  DO UPDATE SET reason = EXCLUDED.reason, evidence_url = EXCLUDED.evidence_url;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_parts_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_body_families() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_save_body_family(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_exclude_listing(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_parts_overview() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_body_families() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_body_family(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_exclude_listing(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.save_guided_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_op text := upper(trim(coalesce(p_input->>'componentOpCode', '')));
  v_from integer := NULLIF(p_input->>'yearFrom', '')::integer;
  v_to integer := NULLIF(p_input->>'yearTo', '')::integer;
  v_ticked uuid[];
  v_position text := NULLIF(trim(coalesce(p_input->>'position', '')), '');
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
  IF v_variant IS NULL THEN
    RAISE EXCEPTION 'Choose a vehicle';
  END IF;
  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'A verified part needs a source link';
  END IF;
  IF v_op <> '' THEN
    SELECT id INTO v_component FROM public.maintenance_service_categories WHERE op_code = v_op;
    IF v_component IS NULL THEN
      RAISE EXCEPTION 'That job is not in the catalog';
    END IF;
  END IF;
  IF jsonb_typeof(p_input->'parts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'parts') = 0 THEN
    RAISE EXCEPTION 'Add at least one part number';
  END IF;
  IF p_input ? 'tickedVariantIds' AND jsonb_typeof(p_input->'tickedVariantIds') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_ticked
    FROM jsonb_array_elements_text(p_input->'tickedVariantIds') AS value;
  END IF;

  v_category := NULLIF(p_input->>'categoryId', '')::uuid;
  IF v_category IS NULL AND v_op <> '' THEN
    v_category := public.guided_category_id(v_op);
  END IF;
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Choose a job or a category';
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := NULLIF(btrim(coalesce(v_part->>'manufacturer', '')), '');
    v_number := NULLIF(btrim(coalesce(v_part->>'partNumber', '')), '');
    v_name := COALESCE(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_mfr IS NULL OR v_number IS NULL THEN
      RAISE EXCEPTION 'Each part needs a brand and a part number';
    END IF;
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    IF v_kind NOT IN ('oem', 'oe_supplier', 'aftermarket') THEN
      RAISE EXCEPTION 'Choose factory, original supplier, or other brand';
    END IF;
    SELECT pm.id, pm.interchange_group_id
    INTO v_part_id, v_existing_group
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g'))
      AND pm.oem_part_number_norm <> '';
    IF v_existing_group IS NOT NULL AND v_group IS NOT NULL AND v_existing_group <> v_group THEN
      RAISE EXCEPTION 'Those part numbers are already saved under different fits. Edit each one.';
    END IF;
    IF v_group IS NULL AND v_existing_group IS NOT NULL THEN
      v_group := v_existing_group;
    END IF;
  END LOOP;

  IF v_group IS NULL THEN
    v_scope := CASE WHEN v_op <> '' AND public.is_engine_level_op(v_op) THEN 'powertrain' ELSE 'body' END;
    INSERT INTO public.part_interchange_group (code, label, fit_scope)
    VALUES (
      'GD-' || COALESCE(NULLIF(v_op, ''), 'PART') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      COALESCE(NULLIF(v_op, ''), 'PART'),
      v_scope
    )
    RETURNING id INTO v_group;
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := btrim(v_part->>'manufacturer');
    v_number := btrim(v_part->>'partNumber');
    v_name := COALESCE(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    SELECT pm.id INTO v_part_id
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g'));
    IF v_part_id IS NULL THEN
      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, evidence_url, verified_by, verified_at,
        catalog_decision, updated_at
      ) VALUES (
        v_category, v_name, v_number, v_mfr, v_kind,
        v_group, v_component, v_evidence, v_actor, now(),
        'confirmed', now()
      )
      RETURNING id INTO v_part_id;
    ELSE
      UPDATE public.part_master
      SET name = v_name,
          part_kind = v_kind,
          manufacturer = v_mfr,
          interchange_group_id = v_group,
          maintenance_component_id = COALESCE(v_component, maintenance_component_id),
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
      WHERE pm.oem_part_number_norm = upper(regexp_replace(v_part->>'supersedes', '[^A-Za-z0-9]', '', 'g'))
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
    interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, note, verified_by
  ) VALUES (
    v_group, v_variant, v_position, v_from, v_to, v_evidence, v_note, v_actor
  )
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''))
  DO UPDATE SET
    year_from = EXCLUDED.year_from,
    year_to = EXCLUDED.year_to,
    evidence_url = EXCLUDED.evidence_url,
    note = EXCLUDED.note,
    verified_by = EXCLUDED.verified_by,
    verified_at = now();

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
          interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, note, verified_by
        ) VALUES (
          v_group, v_listed, v_position, v_from, v_to, v_evidence, v_note, v_actor
        )
        ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''))
        DO UPDATE SET
          year_from = EXCLUDED.year_from,
          year_to = EXCLUDED.year_to,
          evidence_url = EXCLUDED.evidence_url,
          note = EXCLUDED.note,
          verified_by = EXCLUDED.verified_by,
          verified_at = now();
      END IF;
    END LOOP;
  END IF;

  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'groupId', v_group);
END;
$$;

ALTER TABLE public.part_listing
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

DROP TABLE IF EXISTS public.platform_family_review;

DROP FUNCTION IF EXISTS public.write_guided_rules(uuid, uuid, text, integer, integer, uuid[], text, text, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.remove_guided_variant(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_left integer;
BEGIN
  IF v_group IS NULL OR v_variant IS NULL THEN
    RAISE EXCEPTION 'Choose the part and the vehicle';
  END IF;
  DELETE FROM public.part_listing
  WHERE interchange_group_id = v_group
    AND vehicle_catalog_id = v_variant;
  SELECT count(*) INTO v_left
  FROM public.part_listing
  WHERE interchange_group_id = v_group;
  IF v_left = 0 THEN
    DELETE FROM public.part_master WHERE interchange_group_id = v_group;
    DELETE FROM public.part_interchange_group WHERE id = v_group;
  END IF;
  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'listingsLeft', v_left, 'deletedPart', v_left = 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_parts_catalog_rows(p_rows jsonb, p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  applied int := 0;
  errors jsonb := '[]'::jsonb;
  v_group_id uuid;
  v_part_id uuid;
  v_component_id uuid;
  v_category_id uuid;
  v_catalog_id uuid;
  v_kind text;
  v_position text;
  v_evidence text;
  v_number text;
  v_name text;
  v_mfr text;
BEGIN
  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS value
  LOOP
    BEGIN
      v_catalog_id := NULLIF(COALESCE(v_row->>'vehicle', v_row->>'vehicleId', v_row->>'vehicle_catalog_id'), '')::uuid;
      v_mfr := NULLIF(btrim(coalesce(v_row->>'manufacturer', '')), '');
      v_number := NULLIF(btrim(coalesce(v_row->>'part_number', v_row->>'partNumber', '')), '');
      v_name := COALESCE(NULLIF(btrim(coalesce(v_row->>'part_name', v_row->>'partName', '')), ''), v_number);
      v_kind := lower(COALESCE(NULLIF(v_row->>'part_kind', ''), NULLIF(v_row->>'partKind', ''), 'oem'));
      v_position := NULLIF(btrim(coalesce(v_row->>'position', '')), '');
      v_evidence := NULLIF(btrim(coalesce(v_row->>'evidence_url', v_row->>'evidenceUrl', '')), '');
      IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
      IF v_catalog_id IS NULL OR v_mfr IS NULL OR v_number IS NULL OR v_evidence IS NULL THEN
        errors := errors || jsonb_build_array('Each row needs a vehicle, brand, part number, and source');
        CONTINUE;
      END IF;
      SELECT id INTO v_category_id
      FROM public.part_category
      WHERE slug = NULLIF(COALESCE(v_row->>'category_slug', v_row->>'categorySlug'), '')
      LIMIT 1;
      IF v_category_id IS NULL THEN
        errors := errors || jsonb_build_array('Missing parts category for ' || v_number);
        CONTINUE;
      END IF;
      SELECT id INTO v_component_id
      FROM public.maintenance_service_categories
      WHERE op_code = NULLIF(upper(COALESCE(v_row->>'job', v_row->>'componentOpCode', '')), '')
      LIMIT 1;
      SELECT pm.id, pm.interchange_group_id INTO v_part_id, v_group_id
      FROM public.part_master pm
      WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
        AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g'))
      LIMIT 1;
      IF v_group_id IS NULL THEN
        INSERT INTO public.part_interchange_group (code, label, fit_scope, import_batch_id)
        VALUES (
          'IMP-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
          v_name,
          CASE WHEN v_component_id IS NOT NULL AND public.is_engine_level_op(upper(COALESCE(v_row->>'job', v_row->>'componentOpCode', ''))) THEN 'powertrain' ELSE 'body' END,
          p_batch_id
        )
        RETURNING id INTO v_group_id;
      END IF;
      IF v_part_id IS NULL THEN
        INSERT INTO public.part_master (
          category_id, name, oem_part_number, manufacturer, part_kind,
          interchange_group_id, maintenance_component_id, import_batch_id, evidence_url,
          catalog_decision, updated_at
        ) VALUES (
          v_category_id, v_name, v_number, v_mfr, v_kind,
          v_group_id, v_component_id, p_batch_id, v_evidence,
          'pending', now()
        )
        RETURNING id INTO v_part_id;
      ELSE
        INSERT INTO public.part_import_restore (batch_id, part_id, previous)
        SELECT p_batch_id, pm.id, jsonb_build_object(
          'category_id', pm.category_id,
          'interchange_group_id', pm.interchange_group_id,
          'maintenance_component_id', pm.maintenance_component_id,
          'part_kind', pm.part_kind
        )
        FROM public.part_master pm
        WHERE pm.id = v_part_id
        ON CONFLICT (batch_id, part_id) DO NOTHING;
        UPDATE public.part_master
        SET category_id = v_category_id,
            name = v_name,
            part_kind = v_kind,
            interchange_group_id = v_group_id,
            maintenance_component_id = COALESCE(v_component_id, maintenance_component_id),
            evidence_url = v_evidence,
            catalog_decision = 'pending',
            updated_at = now()
        WHERE id = v_part_id;
      END IF;
      INSERT INTO public.part_listing (
        interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, import_batch_id
      ) VALUES (
        v_group_id,
        v_catalog_id,
        v_position,
        NULLIF(COALESCE(v_row->>'year_from', v_row->>'yearFrom'), '')::integer,
        NULLIF(COALESCE(v_row->>'year_to', v_row->>'yearTo'), '')::integer,
        v_evidence,
        p_batch_id
      )
      ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''))
      DO UPDATE SET
        year_from = EXCLUDED.year_from,
        year_to = EXCLUDED.year_to,
        evidence_url = EXCLUDED.evidence_url,
        import_batch_id = EXCLUDED.import_batch_id;
      applied := applied + 1;
    EXCEPTION WHEN OTHERS THEN
      errors := errors || jsonb_build_array(SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('applied', applied, 'errors', errors, 'batchId', p_batch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_parts_catalog_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  listings int;
  parts int;
  restored int;
BEGIN
  DELETE FROM public.part_listing WHERE import_batch_id = p_batch_id;
  GET DIAGNOSTICS listings = ROW_COUNT;
  UPDATE public.part_master pm
  SET category_id = COALESCE((r.previous->>'category_id')::uuid, pm.category_id),
      interchange_group_id = NULLIF(r.previous->>'interchange_group_id', '')::uuid,
      maintenance_component_id = NULLIF(r.previous->>'maintenance_component_id', '')::uuid,
      part_kind = COALESCE(NULLIF(r.previous->>'part_kind', ''), pm.part_kind)
  FROM public.part_import_restore r
  WHERE r.batch_id = p_batch_id AND r.part_id = pm.id;
  GET DIAGNOSTICS restored = ROW_COUNT;
  DELETE FROM public.part_import_restore WHERE batch_id = p_batch_id;
  DELETE FROM public.part_master pm
  WHERE pm.import_batch_id = p_batch_id
    AND NOT EXISTS (SELECT 1 FROM public.part_listing pl WHERE pl.interchange_group_id = pm.interchange_group_id)
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_parts_usage u WHERE u.part_id = pm.id);
  GET DIAGNOSTICS parts = ROW_COUNT;
  DELETE FROM public.part_interchange_group g
  WHERE g.import_batch_id = p_batch_id
    AND NOT EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = g.id);
  RETURN jsonb_build_object('listingsRemoved', listings, 'partsRemoved', parts, 'partsRestored', restored);
END;
$$;

CREATE OR REPLACE FUNCTION public.variant_parts_checklist(p_catalog_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs jsonb;
  v_specs jsonb;
  v_supplies jsonb;
  v_vehicle jsonb;
  v_other jsonb;
  v_reach jsonb;
BEGIN
  WITH hits AS (
    SELECT * FROM public.parts_for_vehicle(p_catalog_id, NULL, NULL)
  ),
  na AS (
    SELECT DISTINCT ON (c.op_code)
      c.op_code, a.applicable, a.reason
    FROM public.catalog_component_applicability a
    JOIN public.maintenance_service_categories c ON c.id = a.component_id
    JOIN public.vehicle_catalog vc ON vc.id = p_catalog_id
    WHERE (
      (a.scope = 'variant' AND a.vehicle_catalog_id = vc.id)
      OR (a.scope = 'platform' AND a.platform_id = vc.platform_id)
      OR (a.scope = 'platform' AND a.platform_id = (SELECT parent_id FROM public.vehicle_platform WHERE id = vc.platform_id))
      OR (a.scope = 'engine_family' AND a.engine_family_id = vc.engine_family_id)
    )
    ORDER BY c.op_code, CASE a.scope WHEN 'variant' THEN 1 WHEN 'platform' THEN 2 ELSE 3 END
  ),
  job_hits AS (
    SELECT j.section, j.op_code, j.label, j."position", j.sort_order,
      h.tier, h.part_id, h.part_name, h.oem_part_number, h.manufacturer, h.part_kind,
      h.interchange_group_id, pm.catalog_decision, pm.evidence_url
    FROM public.guided_part_jobs() j
    LEFT JOIN public.maintenance_service_categories c ON c.op_code = j.op_code
    LEFT JOIN hits h ON h.maintenance_component_id = c.id
      AND (j."position" IS NULL OR h."position" IS NULL OR lower(h."position") = lower(j."position"))
    LEFT JOIN public.part_master pm ON pm.id = h.part_id
  ),
  rolled AS (
    SELECT section, op_code, label, "position", sort_order,
      CASE
        WHEN bool_or(catalog_decision = 'confirmed' AND tier BETWEEN 1 AND 3) THEN 'verified'
        WHEN (SELECT na.applicable FROM na WHERE na.op_code = job_hits.op_code) = false
          AND EXISTS (SELECT 1 FROM na WHERE na.op_code = job_hits.op_code) THEN 'not_applicable'
        WHEN bool_or(part_id IS NOT NULL AND catalog_decision IS DISTINCT FROM 'rejected') THEN 'unverified'
        ELSE 'missing'
      END AS status,
      (SELECT na.reason FROM na WHERE na.op_code = job_hits.op_code) AS na_reason,
      (ARRAY_AGG(interchange_group_id ORDER BY tier NULLS LAST))[1] AS group_id,
      (ARRAY_AGG(evidence_url ORDER BY tier NULLS LAST) FILTER (WHERE evidence_url IS NOT NULL))[1] AS evidence_url,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'id', part_id, 'manufacturer', manufacturer, 'partNumber', oem_part_number, 'name', part_name, 'kind', part_kind
      )) FILTER (WHERE part_id IS NOT NULL), '[]'::jsonb) AS parts
    FROM job_hits
    GROUP BY section, op_code, label, "position", sort_order
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'section', section, 'opCode', op_code, 'label', label, 'position', "position",
    'status', status, 'reason', na_reason, 'groupId', group_id, 'evidenceUrl', evidence_url, 'parts', parts
  ) ORDER BY sort_order), '[]'::jsonb)
  INTO v_jobs
  FROM rolled;

  SELECT jsonb_build_object(
    'make', vc.make,
    'model', vc.model,
    'chassis', vc.chassis_code,
    'engine', ef.code,
    'engineCode', vc.engine_code,
    'years', trim(both ' ' FROM concat_ws('–', vc.production_start_year::text, vc.production_end_year::text)),
    'drive', vc.drivetrain,
    'sisterNames', (
      SELECT COALESCE(jsonb_agg(DISTINCT (sib.make || ' ' || sib.model)), '[]'::jsonb)
      FROM public.vehicle_catalog sib
      JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
      JOIN public.vehicle_platform sib_plat ON sib_plat.id = sib.platform_id
      WHERE sib.id <> vc.id
        AND mine.parent_id IS NOT NULL
        AND sib_plat.parent_id = mine.parent_id
    )
  )
  INTO v_vehicle
  FROM public.vehicle_catalog vc
  LEFT JOIN public.engine_family ef ON ef.id = vc.engine_family_id
  WHERE vc.id = p_catalog_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category', category, 'parts', parts
  ) ORDER BY category), '[]'::jsonb)
  INTO v_other
  FROM (
    SELECT pc.label AS category,
      jsonb_agg(jsonb_build_object(
        'partId', pm.id,
        'name', pm.name,
        'manufacturer', pm.manufacturer,
        'partNumber', pm.oem_part_number,
        'position', pl.position,
        'groupId', pl.interchange_group_id,
        'source', pl.evidence_url
      ) ORDER BY pm.name) AS parts
    FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    JOIN public.part_category pc ON pc.id = pm.category_id
    WHERE pl.vehicle_catalog_id = p_catalog_id
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (
        pm.maintenance_component_id IS NULL
        OR pm.maintenance_component_id NOT IN (
          SELECT c.id FROM public.maintenance_service_categories c
          WHERE c.op_code IN (SELECT op_code FROM public.guided_part_jobs())
        )
      )
    GROUP BY pc.label
  ) grouped;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'specKey', sk.key,
    'label', sk.label,
    'unit', sk.unit,
    'value', spec.value,
    'reach', spec.scope,
    'source', spec.evidence_url
  ) ORDER BY sk.label), '[]'::jsonb)
  INTO v_specs
  FROM public.spec_key sk
  LEFT JOIN LATERAL (
    SELECT s.value, s.scope, s.evidence_url
    FROM public.specs_for_variant(p_catalog_id, NULL) s
    WHERE s.spec_key = sk.key
    LIMIT 1
  ) spec ON true;

  SELECT jsonb_build_object(
    'sisters', COALESCE(v_vehicle->'sisterNames', '[]'::jsonb),
    'engineCars', COALESCE((
      SELECT jsonb_agg(DISTINCT (other.make || ' ' || other.model || ' ' || coalesce(other.chassis_code, '')))
      FROM public.part_listing mine
      JOIN public.part_interchange_group g ON g.id = mine.interchange_group_id
      JOIN public.part_listing other_listing ON other_listing.interchange_group_id = mine.interchange_group_id
      JOIN public.vehicle_catalog other ON other.id = other_listing.vehicle_catalog_id
      JOIN public.vehicle_catalog vc ON vc.id = p_catalog_id
      WHERE mine.vehicle_catalog_id = p_catalog_id
        AND g.fit_scope = 'powertrain'
        AND other.engine_family_id = vc.engine_family_id
        AND other.id <> vc.id
    ), '[]'::jsonb)
  )
  INTO v_reach;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'opCode', c.op_code, 'name', s.supply_name, 'note', s.note
  ) ORDER BY c.op_code, s.supply_name), '[]'::jsonb)
  INTO v_supplies
  FROM public.component_related_supply s
  JOIN public.maintenance_service_categories c ON c.id = s.component_id;

  RETURN jsonb_build_object(
    'jobs', v_jobs,
    'specs', COALESCE(v_specs, '[]'::jsonb),
    'supplies', COALESCE(v_supplies, '[]'::jsonb),
    'vehicle', COALESCE(v_vehicle, '{}'::jsonb),
    'otherParts', COALESCE(v_other, '[]'::jsonb),
    'reach', COALESCE(v_reach, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_guided_variant(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_parts_catalog_rows(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_parts_catalog_batch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.variant_parts_checklist(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_guided_variant(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_parts_catalog_rows(jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_parts_catalog_batch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.variant_parts_checklist(uuid) TO service_role;
