-- Parts sourcing Rev 2. Additive. Does not edit 20261013200000.

ALTER TABLE public.vehicle_platform
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.vehicle_platform (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_platform_parent ON public.vehicle_platform (parent_id);

ALTER TABLE public.maintenance_work_order_lines
  ADD COLUMN IF NOT EXISTS supplier_part_offer_id uuid REFERENCES public.supplier_part_offer (id) ON DELETE SET NULL;

ALTER TABLE public.part_repeat_alert
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.part_import_restore (
  batch_id uuid NOT NULL,
  part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  previous jsonb NOT NULL,
  PRIMARY KEY (batch_id, part_id)
);

CREATE TABLE IF NOT EXISTS public.part_rule_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  part_id uuid REFERENCES public.part_master (id) ON DELETE SET NULL,
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog (id) ON DELETE SET NULL,
  work_order_line_id uuid REFERENCES public.maintenance_work_order_lines (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_rule_review_status_check CHECK (status IN ('open', 'resolved'))
);

CREATE TABLE IF NOT EXISTS public.part_rule_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  target_kind text NOT NULL,
  platform_id uuid REFERENCES public.vehicle_platform (id) ON DELETE CASCADE,
  engine_family_id uuid REFERENCES public.engine_family (id) ON DELETE CASCADE,
  fit_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_rule_proposal_status_check CHECK (status IN ('proposed', 'approved', 'rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS part_rule_proposal_open
  ON public.part_rule_proposal (part_id, COALESCE(platform_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(engine_family_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'proposed';

INSERT INTO public.maintenance_service_categories
  (code, name, icon_key, field_schema, quick_job_eligible, sort_order, kind, parent_id, op_code)
SELECT
  'oxygen_sensor', 'Oxygen sensor', 'oil', '{"fields":[]}'::jsonb, true, 1090, 'component',
  'b1000000-0000-4000-8000-000000000001'::uuid, 'ENG-O2'
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'ENG-O2'
);

UPDATE public.part_term_synonym s
SET maintenance_component_id = c.id
FROM public.maintenance_service_categories c
WHERE c.op_code = 'ENG-O2'
  AND s.canonical = 'Oxygen sensor'
  AND s.maintenance_component_id IS NULL;

-- ---------------------------------------------------------------------------
-- Tiered search: vehicle year, own-make engine = tier 1, sister models, parent platform
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.parts_catalog_coverage();
DROP FUNCTION IF EXISTS public.parts_for_vehicle(uuid, uuid);

CREATE FUNCTION public.parts_for_vehicle(
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
      vc.production_start_year AS catalog_year,
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
    SELECT string_agg(DISTINCT (vc.make || ' ' || vc.model), ' / ' ORDER BY (vc.make || ' ' || vc.model)) AS names
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.platform_id IN (SELECT id FROM family)
    WHERE lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  engine_source AS (
    SELECT min(vc.make || ' ' || vc.model) AS make
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.engine_family_id = cat.engine_family_id
    WHERE vc.engine_family_id IS NOT NULL
      AND lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  rules AS (
    SELECT r.target_kind, r.source, r."position", r.year_from, r.year_to,
           g.fit_scope, g.id AS group_id
    FROM public.interchange_fitment_rule r
    JOIN public.part_interchange_group g ON g.id = r.interchange_group_id
    CROSS JOIN cat
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE (
      (r.target_kind = 'catalog_variant' AND r.vehicle_catalog_id = cat.id)
      OR (
        r.target_kind = 'platform'
        AND (r.platform_id = cat.platform_id OR r.platform_id = mine.parent_id)
      )
      OR (
        r.target_kind = 'engine_family'
        AND r.engine_family_id = cat.engine_family_id
        AND g.fit_scope IN ('powertrain', 'universal')
      )
    )
    AND (r.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= r.year_from)
    AND (r.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= r.year_to)
  ),
  hits AS (
    SELECT pm.id AS part_id, rules.target_kind, rules.source, rules."position", rules.fit_scope, rules.group_id
    FROM rules
    JOIN public.part_master pm ON pm.interchange_group_id = rules.group_id
    UNION ALL
    SELECT pm.id, 'catalog_variant', 'legacy_fitment', NULL::text,
           COALESCE(g.fit_scope, 'chassis'), pm.interchange_group_id
    FROM public.part_fitment pf
    JOIN public.part_master pm ON pm.id = pf.part_id
    LEFT JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    CROSS JOIN cat
    WHERE pf.vehicle_catalog_id = cat.id
      AND (pf.chassis_code IS NULL OR upper(trim(pf.chassis_code)) = upper(trim(cat.chassis_code)))
      AND (pf.engine_code IS NULL OR upper(trim(pf.engine_code)) = upper(trim(cat.engine_code)))
      AND (pf.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= pf.year_from)
      AND (pf.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= pf.year_to)
  ),
  classified AS (
    SELECT
      h.part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      h.fit_scope,
      h.source AS rule_source,
      h."position",
      COALESCE(h.group_id, pm.interchange_group_id) AS interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE
        WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
        WHEN pm.part_kind = 'oem' AND (
          h.target_kind = 'catalog_variant'
          OR (
            h.target_kind IN ('platform', 'engine_family')
            AND lower(coalesce(pm.manufacturer, '')) = lower(cat.make)
          )
        ) THEN 1
        WHEN h.target_kind = 'platform' THEN 2
        WHEN h.target_kind = 'engine_family' THEN 3
        ELSE 2
      END AS tier
    FROM hits h
    JOIN public.part_master pm ON pm.id = h.part_id
    CROSS JOIN cat
    WHERE p_component_id IS NULL OR pm.maintenance_component_id = p_component_id
  ),
  best AS (
    SELECT DISTINCT ON (part_id) *
    FROM classified
    ORDER BY part_id, tier ASC
  ),
  oem_ref AS (
    SELECT DISTINCT ON (b.interchange_group_id)
      b.interchange_group_id,
      b.oem_part_number AS reference_oem,
      b.manufacturer AS reference_manufacturer
    FROM best b
    WHERE b.part_kind = 'oem' AND b.interchange_group_id IS NOT NULL
    ORDER BY b.interchange_group_id, b.tier ASC
  )
  SELECT
    b.tier,
    b.part_id,
    b.part_name,
    b.oem_part_number,
    b.manufacturer,
    b.part_kind,
    b.fit_scope,
    b.rule_source,
    b."position",
    b.interchange_group_id,
    b.maintenance_component_id,
    b.category_id,
    sister.names AS sister_names,
    engine_source.make AS source_make,
    COALESCE(oem_ref.reference_oem, b.oem_part_number) AS reference_oem,
    COALESCE(oem_ref.reference_manufacturer, b.manufacturer) AS reference_manufacturer,
    COALESCE((
      SELECT array_agg(old.oem_part_number)
      FROM public.part_supersession s
      JOIN public.part_master old ON old.id = s.old_part_id
      WHERE s.new_part_id = b.part_id AND old.oem_part_number IS NOT NULL
    ), ARRAY[]::text[]) AS also_known_as,
    COALESCE((
      SELECT count(*)::integer
      FROM public.part_fit_feedback f
      JOIN public.vehicle_catalog fv ON fv.id = f.vehicle_catalog_id
      WHERE f.part_id = b.part_id
        AND f.outcome = 'fit'
        AND (
          f.vehicle_catalog_id = cat.id
          OR (
            b.fit_scope IN ('powertrain', 'universal')
            AND fv.engine_family_id IS NOT NULL
            AND fv.engine_family_id = cat.engine_family_id
          )
          OR (
            COALESCE(b.fit_scope, '') NOT IN ('powertrain', 'universal')
            AND fv.platform_id IS NOT NULL
            AND fv.platform_id = cat.platform_id
          )
        )
    ), 0) AS confirmed_installs,
    b.description
  FROM best b
  CROSS JOIN cat
  LEFT JOIN sister ON true
  LEFT JOIN engine_source ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = b.interchange_group_id;
$$;

-- ---------------------------------------------------------------------------
-- Repeat alerts: consecutive pairs, dismiss sticks, supplier batch only from repeats
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.refresh_repeat_part_alerts(integer, integer);

CREATE FUNCTION public.refresh_repeat_part_alerts(
  p_km integer DEFAULT 10000,
  p_days integer DEFAULT 90,
  p_vehicle_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  inserted int := 0;
  n int;
BEGIN
  INSERT INTO public.part_repeat_alert (organization_id, vehicle_id, component_id, kind, status, detail)
  SELECT DISTINCT p.organization_id, p.vehicle_id, p.component_id, 'component', 'open',
         'Same component replaced twice in a row inside the km or day window'
  FROM (
    SELECT
      wo.organization_id,
      wo.vehicle_id,
      l.component_id,
      wo.odometer,
      wo.closed_at,
      lag(wo.odometer) OVER (PARTITION BY wo.vehicle_id, l.component_id ORDER BY wo.closed_at) AS prev_odo,
      lag(wo.closed_at) OVER (PARTITION BY wo.vehicle_id, l.component_id ORDER BY wo.closed_at) AS prev_at
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE l.action = 'replace'
      AND l.declined IS NOT TRUE
      AND l.component_id IS NOT NULL
      AND wo.status = 'completed'
      AND (p_vehicle_id IS NULL OR wo.vehicle_id = p_vehicle_id)
  ) p
  WHERE p.prev_at IS NOT NULL
    AND (
      (p.odometer IS NOT NULL AND p.prev_odo IS NOT NULL AND p.odometer >= p.prev_odo AND p.odometer - p.prev_odo <= p_km)
      OR (p.closed_at - p.prev_at <= (p_days || ' days')::interval)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.part_repeat_alert d
      WHERE d.kind = 'component'
        AND d.status = 'dismissed'
        AND d.vehicle_id = p.vehicle_id
        AND d.component_id = p.component_id
        AND d.dismissed_at IS NOT NULL
        AND d.dismissed_at >= p.closed_at
    )
  ON CONFLICT (vehicle_id, component_id) WHERE status = 'open' AND kind = 'component' AND component_id IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  inserted := inserted + n;

  INSERT INTO public.part_repeat_alert (part_number, brand, kind, status, detail)
  SELECT upper(trim(l.part_number)), max(l.brand), 'supplier_batch', 'open',
         'This part number failed again on several vehicles'
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  JOIN public.part_repeat_alert a
    ON a.kind = 'component'
   AND a.vehicle_id = wo.vehicle_id
   AND a.component_id = l.component_id
  WHERE l.action = 'replace'
    AND coalesce(trim(l.part_number), '') <> ''
    AND wo.status = 'completed'
    AND l.component_id IS NOT NULL
    AND (p_vehicle_id IS NULL OR wo.vehicle_id = p_vehicle_id)
    AND (
      (wo.odometer IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.maintenance_work_orders earlier
        JOIN public.maintenance_work_order_lines el ON el.work_order_id = earlier.id
        WHERE earlier.vehicle_id = wo.vehicle_id
          AND el.component_id = l.component_id
          AND earlier.id <> wo.id
          AND earlier.status = 'completed'
          AND earlier.odometer IS NOT NULL
          AND wo.odometer >= earlier.odometer
          AND wo.odometer - earlier.odometer <= p_km
      ))
      OR (wo.closed_at IS NOT NULL AND wo.closed_at >= now() - (p_days || ' days')::interval)
    )
  GROUP BY upper(trim(l.part_number))
  HAVING count(DISTINCT wo.vehicle_id) >= 3
  ON CONFLICT (part_number) WHERE status = 'open' AND kind = 'supplier_batch' AND part_number IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  inserted := inserted + n;
  RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_parts_usage_for_work_order(p_work_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  wo public.maintenance_work_orders%ROWTYPE;
  line public.maintenance_work_order_lines%ROWTYPE;
  match_count int;
  match_id uuid;
  norm text;
  offer public.supplier_part_offer%ROWTYPE;
  prev_odo integer;
  prev_at timestamptz;
  prev_part uuid;
  prev_offer uuid;
  stock_id uuid;
  stock_qty numeric;
  need numeric;
  prompts jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO wo FROM public.maintenance_work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work order not found';
  END IF;

  FOR line IN
    SELECT * FROM public.maintenance_work_order_lines
    WHERE work_order_id = p_work_order_id AND declined IS NOT TRUE
  LOOP
    IF line.part_id IS NULL AND coalesce(trim(line.part_number), '') <> '' THEN
      norm := upper(regexp_replace(line.part_number, '[^A-Za-z0-9]', '', 'g'));
      SELECT count(*)::int, (array_agg(id))[1]
      INTO match_count, match_id
      FROM public.part_master
      WHERE oem_part_number_norm = norm AND oem_part_number_norm <> '';
      IF match_count = 1 THEN
        UPDATE public.maintenance_work_order_lines
        SET part_id = match_id, updated_at = now()
        WHERE id = line.id;
        line.part_id := match_id;
      ELSIF match_count > 1 THEN
        INSERT INTO public.part_number_link_review (organization_id, work_order_line_id, part_number, candidate_count, status)
        VALUES (wo.organization_id, line.id, line.part_number, match_count, 'open')
        ON CONFLICT (work_order_line_id) DO NOTHING;
      END IF;
    END IF;

    IF line.part_id IS NOT NULL THEN
      INSERT INTO public.maintenance_parts_usage (
        organization_id, work_order_id, line_id, part_id, qty, unit_cost, currency, vehicle_id, used_at
      )
      VALUES (
        wo.organization_id, wo.id, line.id, line.part_id,
        COALESCE(line.qty, 1), line.unit_price, COALESCE(wo.currency, 'JMD'), wo.vehicle_id, now()
      )
      ON CONFLICT (line_id) WHERE line_id IS NOT NULL DO NOTHING;

      IF line.supplier_part_offer_id IS NOT NULL THEN
        SELECT * INTO offer FROM public.supplier_part_offer WHERE id = line.supplier_part_offer_id;
      ELSE
        offer := NULL;
      END IF;
      IF line.supplier_part_offer_id IS NOT NULL AND offer.core_charge IS NOT NULL AND offer.core_charge > 0 AND NOT EXISTS (
        SELECT 1 FROM public.part_core_return c WHERE c.work_order_line_id = line.id
      ) THEN
        INSERT INTO public.part_core_return (
          organization_id, work_order_line_id, part_id, supplier_id, vehicle_id,
          core_charge, currency, status, due_by
        ) VALUES (
          wo.organization_id, line.id, line.part_id, offer.supplier_id, wo.vehicle_id,
          offer.core_charge, COALESCE(offer.currency, wo.currency, 'JMD'), 'pending',
          (now() + interval '30 days')::date
        );
      END IF;

      need := COALESCE(line.qty, 1);
      SELECT s.id, s.qty INTO stock_id, stock_qty
      FROM public.org_part_stock s
      WHERE s.organization_id = wo.organization_id AND s.part_id = line.part_id
      ORDER BY s.qty DESC
      LIMIT 1;
      IF stock_id IS NOT NULL THEN
        UPDATE public.org_part_stock
        SET qty = GREATEST(qty - need, 0), updated_at = now()
        WHERE id = stock_id;
        IF stock_qty < need THEN
          warnings := warnings || jsonb_build_array(jsonb_build_object(
            'partId', line.part_id, 'shortBy', need - stock_qty
          ));
        END IF;
      END IF;

      IF line.action = 'replace' AND line.component_id IS NOT NULL THEN
        SELECT pwo.odometer, pwo.closed_at, prev.part_id, prev.supplier_part_offer_id
        INTO prev_odo, prev_at, prev_part, prev_offer
        FROM public.maintenance_work_order_lines prev
        JOIN public.maintenance_work_orders pwo ON pwo.id = prev.work_order_id
        WHERE prev.component_id = line.component_id
          AND pwo.vehicle_id = wo.vehicle_id
          AND pwo.id <> wo.id
          AND pwo.status = 'completed'
          AND prev.action = 'replace'
          AND prev.declined IS NOT TRUE
          AND prev.supplier_part_offer_id IS NOT NULL
        ORDER BY pwo.closed_at DESC NULLS LAST
        LIMIT 1;
        IF prev_offer IS NOT NULL THEN
          SELECT * INTO offer FROM public.supplier_part_offer WHERE id = prev_offer;
          IF offer.id IS NOT NULL AND (
            (offer.warranty_months IS NOT NULL AND prev_at IS NOT NULL AND prev_at + (offer.warranty_months || ' months')::interval > now())
            OR (offer.warranty_km IS NOT NULL AND prev_odo IS NOT NULL AND wo.odometer IS NOT NULL AND wo.odometer - prev_odo <= offer.warranty_km)
          ) THEN
            prompts := prompts || jsonb_build_array(jsonb_build_object(
              'partId', prev_part,
              'supplierId', offer.supplier_id,
              'componentId', line.component_id,
              'vehicleId', wo.vehicle_id,
              'workOrderLineId', line.id
            ));
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  PERFORM public.refresh_repeat_part_alerts(10000, 90, wo.vehicle_id);
  RETURN jsonb_build_object('ok', true, 'warrantyPrompts', prompts, 'stockWarnings', warnings);
END;
$$;

-- Category comes from the sheet. Existing parts keep a snapshot so undo can restore them.
CREATE OR REPLACE FUNCTION public.import_parts_catalog_rows(p_rows jsonb, p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  row jsonb;
  applied int := 0;
  errors jsonb := '[]'::jsonb;
  group_id uuid;
  part_id uuid;
  component_id uuid;
  category_id uuid;
  engine_id uuid;
  platform_id uuid;
  catalog_id uuid;
  old_part uuid;
  scope text;
  kind text;
  target text;
  inserted_new boolean;
BEGIN
  FOR row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    BEGIN
      scope := row->>'fitScope';
      kind := COALESCE(NULLIF(row->>'partKind', ''), 'oem');
      target := row->>'targetKind';
      IF target = 'engine_family' AND scope NOT IN ('powertrain', 'universal') THEN
        errors := errors || jsonb_build_array('Engine rule rejected for ' || COALESCE(row->>'partNumber', ''));
        CONTINUE;
      END IF;
      SELECT id INTO category_id FROM public.part_category WHERE slug = NULLIF(row->>'categorySlug', '') LIMIT 1;
      IF category_id IS NULL THEN
        errors := errors || jsonb_build_array('Missing parts category for ' || COALESCE(row->>'partNumber', ''));
        CONTINUE;
      END IF;
      INSERT INTO public.part_interchange_group (code, label, fit_scope, import_batch_id)
      VALUES (row->>'interchangeCode', COALESCE(NULLIF(row->>'label', ''), row->>'interchangeCode'), scope, p_batch_id)
      ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, fit_scope = EXCLUDED.fit_scope
      RETURNING id INTO group_id;

      SELECT id INTO component_id
      FROM public.maintenance_service_categories
      WHERE op_code = NULLIF(row->>'componentOpCode', '')
      LIMIT 1;

      inserted_new := false;
      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, import_batch_id, updated_at
      )
      SELECT
        category_id,
        COALESCE(NULLIF(row->>'partName', ''), row->>'partNumber'),
        row->>'partNumber',
        NULLIF(row->>'manufacturer', ''),
        kind,
        group_id,
        component_id,
        p_batch_id,
        now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.part_master pm
        WHERE upper(coalesce(pm.manufacturer, '')) = upper(coalesce(row->>'manufacturer', ''))
          AND pm.oem_part_number_norm = upper(regexp_replace(coalesce(row->>'partNumber', ''), '[^A-Za-z0-9]', '', 'g'))
          AND pm.oem_part_number_norm <> ''
      );
      IF FOUND THEN
        inserted_new := true;
      END IF;
      SELECT id INTO part_id
      FROM public.part_master
      WHERE upper(coalesce(manufacturer, '')) = upper(coalesce(row->>'manufacturer', ''))
        AND oem_part_number_norm = upper(regexp_replace(coalesce(row->>'partNumber', ''), '[^A-Za-z0-9]', '', 'g'))
      LIMIT 1;
      IF part_id IS NULL THEN
        errors := errors || jsonb_build_array('Could not save part ' || COALESCE(row->>'partNumber', ''));
        CONTINUE;
      END IF;
      IF NOT inserted_new THEN
        INSERT INTO public.part_import_restore (batch_id, part_id, previous)
        SELECT p_batch_id, pm.id, jsonb_build_object(
          'category_id', pm.category_id,
          'interchange_group_id', pm.interchange_group_id,
          'maintenance_component_id', pm.maintenance_component_id,
          'part_kind', pm.part_kind
        )
        FROM public.part_master pm
        WHERE pm.id = part_id
        ON CONFLICT (batch_id, part_id) DO NOTHING;
      END IF;
      UPDATE public.part_master
      SET category_id = category_id,
          interchange_group_id = group_id,
          maintenance_component_id = COALESCE(component_id, maintenance_component_id),
          part_kind = kind
      WHERE id = part_id;

      IF coalesce(trim(row->>'supersedes'), '') <> '' THEN
        SELECT id INTO old_part
        FROM public.part_master
        WHERE oem_part_number_norm = upper(regexp_replace(row->>'supersedes', '[^A-Za-z0-9]', '', 'g'))
          AND id <> part_id
        LIMIT 1;
        IF old_part IS NOT NULL THEN
          INSERT INTO public.part_supersession (old_part_id, new_part_id)
          VALUES (old_part, part_id)
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;

      engine_id := NULL;
      platform_id := NULL;
      catalog_id := NULL;
      IF target = 'engine_family' THEN
        SELECT id INTO engine_id FROM public.engine_family WHERE code = upper(trim(row->>'targetCode'));
      ELSIF target = 'platform' THEN
        SELECT id INTO platform_id FROM public.vehicle_platform WHERE code = upper(trim(row->>'targetCode'));
      ELSIF target = 'catalog_variant' THEN
        catalog_id := NULLIF(row->>'targetCode', '')::uuid;
      END IF;
      IF (target = 'engine_family' AND engine_id IS NULL)
        OR (target = 'platform' AND platform_id IS NULL)
        OR (target = 'catalog_variant' AND catalog_id IS NULL) THEN
        errors := errors || jsonb_build_array('Unknown target ' || COALESCE(row->>'targetCode', ''));
        CONTINUE;
      END IF;

      INSERT INTO public.interchange_fitment_rule (
        interchange_group_id, target_kind, engine_family_id, platform_id, vehicle_catalog_id,
        year_from, year_to, "position", source, import_batch_id
      ) VALUES (
        group_id, target, engine_id, platform_id, catalog_id,
        NULLIF(row->>'yearFrom', '')::integer,
        NULLIF(row->>'yearTo', '')::integer,
        NULLIF(row->>'position', ''),
        'import',
        p_batch_id
      );
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
AS $$
DECLARE
  rules int;
  parts int;
  restored int;
BEGIN
  DELETE FROM public.interchange_fitment_rule WHERE import_batch_id = p_batch_id;
  GET DIAGNOSTICS rules = ROW_COUNT;
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
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_parts_usage u WHERE u.part_id = pm.id);
  GET DIAGNOSTICS parts = ROW_COUNT;
  DELETE FROM public.part_interchange_group g
  WHERE g.import_batch_id = p_batch_id
    AND NOT EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = g.id);
  RETURN jsonb_build_object('rulesRemoved', rules, 'partsRemoved', parts, 'partsRestored', restored);
END;
$$;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('parts-repeat-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule(
      'parts-repeat-alerts',
      '15 6 * * *',
      $job$SELECT public.refresh_repeat_part_alerts(10000, 90, NULL);$job$
    );
  END IF;
END;
$cron$;

ALTER TABLE public.part_import_restore ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_rule_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_rule_proposal ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['part_import_restore', 'part_rule_review', 'part_rule_proposal']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_direct', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
      t || '_no_direct', t
    );
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_parts_usage_for_work_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_repeat_part_alerts(integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_parts_catalog_rows(jsonb, uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.parts_term_search(p_query text)
RETURNS TABLE (
  part_id uuid,
  name text,
  oem_part_number text,
  manufacturer text,
  maintenance_component_id uuid
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT lower(trim(p_query)) AS term,
           upper(regexp_replace(coalesce(p_query, ''), '[^A-Za-z0-9]', '', 'g')) AS norm
  ),
  syn AS (
    SELECT s.maintenance_component_id
    FROM public.part_term_synonym s
    CROSS JOIN q
    WHERE lower(s.term) = q.term OR lower(s.canonical) = q.term
    LIMIT 1
  )
  SELECT pm.id, pm.name, pm.oem_part_number, pm.manufacturer, pm.maintenance_component_id
  FROM public.part_master pm
  CROSS JOIN q
  WHERE (
    EXISTS (
      SELECT 1 FROM syn
      WHERE syn.maintenance_component_id IS NOT NULL
        AND pm.maintenance_component_id = syn.maintenance_component_id
    )
    OR (q.norm <> '' AND pm.oem_part_number_norm = q.norm)
    OR (length(q.term) >= 2 AND pm.name ILIKE '%' || replace(replace(q.term, '%', ''), '_', '') || '%')
    OR (q.norm <> '' AND pm.oem_part_number_norm % q.norm)
  )
  LIMIT 30;
$$;

REVOKE ALL ON FUNCTION public.parts_term_search(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_term_search(text) TO service_role;

REVOKE ALL ON FUNCTION public.undo_parts_catalog_batch(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) TO service_role;
CREATE OR REPLACE FUNCTION public.parts_catalog_coverage()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'coveragePct', 0,
    'vehicleCount', (SELECT count(*) FROM public.vehicle_catalog WHERE nullif(trim(chassis_code), '') IS NOT NULL),
    'note', 'Active fleet coverage is calculated when Dominion opens Vehicles'
  );
$$;

REVOKE ALL ON FUNCTION public.parts_catalog_coverage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_catalog_coverage() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_parts_usage_for_work_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_repeat_part_alerts(integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_parts_catalog_rows(jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_parts_catalog_batch(uuid) TO service_role;
