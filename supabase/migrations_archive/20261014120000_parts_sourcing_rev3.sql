-- Parts sourcing Rev 3. Does not edit 20261013220000 (already applied).
-- Fixes ambiguous plpgsql names in the importer, makes stock and cores
-- move only when usage actually changes, and scores fleet coverage in one call.

INSERT INTO public.maintenance_service_categories
  (code, name, icon_key, field_schema, quick_job_eligible, sort_order, kind, parent_id, op_code)
SELECT v.code, v.name, 'oil', '{"fields":[]}'::jsonb, true, v.sort_order, 'component',
       'b1000000-0000-4000-8000-000000000001'::uuid, v.op_code
FROM (VALUES
  ('thermostat', 'Thermostat', 1091, 'ENG-THERM'),
  ('water_pump', 'Water pump', 1092, 'ENG-WPUMP'),
  ('ignition_coil', 'Ignition coil', 1093, 'ENG-COIL')
) AS v(code, name, sort_order, op_code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_service_categories c WHERE c.op_code = v.op_code
);

CREATE OR REPLACE FUNCTION public.adjust_org_part_stock(
  p_org text,
  p_part uuid,
  p_delta numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_stock_id uuid;
BEGIN
  IF p_org IS NULL OR p_part IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;
  SELECT s.id INTO v_stock_id
  FROM public.org_part_stock s
  WHERE s.organization_id = p_org AND s.part_id = p_part
  ORDER BY s.qty DESC
  LIMIT 1;
  IF v_stock_id IS NULL THEN
    IF p_delta > 0 THEN
      INSERT INTO public.org_part_stock (organization_id, part_id, qty)
      VALUES (p_org, p_part, p_delta);
    END IF;
    RETURN;
  END IF;
  UPDATE public.org_part_stock
  SET qty = GREATEST(qty + p_delta, 0), updated_at = now()
  WHERE id = v_stock_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_parts_usage_for_work_order(p_work_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_usage public.maintenance_parts_usage%ROWTYPE;
BEGIN
  FOR v_usage IN
    SELECT * FROM public.maintenance_parts_usage WHERE work_order_id = p_work_order_id
  LOOP
    PERFORM public.adjust_org_part_stock(v_usage.organization_id, v_usage.part_id, v_usage.qty);
    IF v_usage.line_id IS NOT NULL THEN
      DELETE FROM public.part_core_return WHERE work_order_line_id = v_usage.line_id;
    END IF;
    DELETE FROM public.maintenance_parts_usage WHERE id = v_usage.id;
  END LOOP;
  DELETE FROM public.part_core_return c
  USING public.maintenance_work_order_lines l
  WHERE l.id = c.work_order_line_id AND l.work_order_id = p_work_order_id;
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
  need numeric;
  prev_qty numeric;
  prev_usage_part uuid;
  inserted_usage boolean;
  prompts jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  orphan public.maintenance_parts_usage%ROWTYPE;
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
      ELSE
        INSERT INTO public.part_number_link_review (organization_id, work_order_line_id, part_number, candidate_count, status)
        VALUES (wo.organization_id, line.id, line.part_number, match_count, 'open')
        ON CONFLICT (work_order_line_id) DO NOTHING;
      END IF;
    END IF;

    IF line.part_id IS NOT NULL THEN
      need := COALESCE(line.qty, 1);
      INSERT INTO public.maintenance_parts_usage (
        organization_id, work_order_id, line_id, part_id, qty, unit_cost, currency, vehicle_id, used_at
      )
      VALUES (
        wo.organization_id, wo.id, line.id, line.part_id,
        need, line.unit_price, COALESCE(wo.currency, 'JMD'), wo.vehicle_id, now()
      )
      ON CONFLICT (line_id) WHERE line_id IS NOT NULL DO NOTHING;
      inserted_usage := FOUND;

      IF inserted_usage THEN
        PERFORM public.adjust_org_part_stock(wo.organization_id, line.part_id, -need);
        IF line.supplier_part_offer_id IS NOT NULL THEN
          SELECT * INTO offer FROM public.supplier_part_offer WHERE id = line.supplier_part_offer_id;
          IF offer.id IS NOT NULL AND offer.core_charge IS NOT NULL AND offer.core_charge > 0
             AND NOT EXISTS (SELECT 1 FROM public.part_core_return c WHERE c.work_order_line_id = line.id) THEN
            INSERT INTO public.part_core_return (
              organization_id, work_order_line_id, part_id, supplier_id, vehicle_id,
              core_charge, currency, status, due_by
            ) VALUES (
              wo.organization_id, line.id, line.part_id, offer.supplier_id, wo.vehicle_id,
              offer.core_charge, COALESCE(offer.currency, wo.currency, 'JMD'), 'pending',
              (now() + interval '30 days')::date
            );
          END IF;
        END IF;
      ELSE
        SELECT u.qty, u.part_id INTO prev_qty, prev_usage_part
        FROM public.maintenance_parts_usage u
        WHERE u.line_id = line.id;
        IF prev_usage_part IS DISTINCT FROM line.part_id THEN
          PERFORM public.adjust_org_part_stock(wo.organization_id, prev_usage_part, COALESCE(prev_qty, 0));
          PERFORM public.adjust_org_part_stock(wo.organization_id, line.part_id, -need);
          UPDATE public.maintenance_parts_usage
          SET part_id = line.part_id, qty = need, unit_cost = line.unit_price
          WHERE line_id = line.id;
        ELSIF prev_qty IS DISTINCT FROM need THEN
          PERFORM public.adjust_org_part_stock(wo.organization_id, line.part_id, -(need - COALESCE(prev_qty, 0)));
          UPDATE public.maintenance_parts_usage
          SET qty = need, unit_cost = line.unit_price
          WHERE line_id = line.id;
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

  FOR orphan IN
    SELECT u.*
    FROM public.maintenance_parts_usage u
    WHERE u.work_order_id = wo.id
      AND (
        u.line_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.maintenance_work_order_lines l
          WHERE l.id = u.line_id AND l.work_order_id = wo.id AND l.declined IS NOT TRUE
        )
      )
  LOOP
    PERFORM public.adjust_org_part_stock(orphan.organization_id, orphan.part_id, orphan.qty);
    IF orphan.line_id IS NOT NULL THEN
      DELETE FROM public.part_core_return WHERE work_order_line_id = orphan.line_id;
    END IF;
    DELETE FROM public.maintenance_parts_usage WHERE id = orphan.id;
  END LOOP;

  IF wo.status = 'completed' THEN
    PERFORM public.refresh_repeat_part_alerts(10000, 90, wo.vehicle_id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'warrantyPrompts', prompts, 'stockWarnings', warnings);
END;
$$;

-- Locals are prefixed so they cannot clash with column names under variable_conflict = error.
CREATE OR REPLACE FUNCTION public.import_parts_catalog_rows(p_rows jsonb, p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row jsonb;
  applied int := 0;
  errors jsonb := '[]'::jsonb;
  v_group_id uuid;
  v_part_id uuid;
  v_component_id uuid;
  v_category_id uuid;
  v_engine_id uuid;
  v_platform_id uuid;
  v_catalog_id uuid;
  v_old_part uuid;
  v_scope text;
  v_kind text;
  v_target text;
  inserted_new boolean;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    BEGIN
      v_scope := v_row->>'fitScope';
      v_kind := COALESCE(NULLIF(v_row->>'partKind', ''), 'oem');
      v_target := v_row->>'targetKind';
      IF v_target = 'engine_family' AND v_scope NOT IN ('powertrain', 'universal') THEN
        errors := errors || jsonb_build_array('Engine rule rejected for ' || COALESCE(v_row->>'partNumber', ''));
        CONTINUE;
      END IF;
      SELECT id INTO v_category_id FROM public.part_category WHERE slug = NULLIF(v_row->>'categorySlug', '') LIMIT 1;
      IF v_category_id IS NULL THEN
        errors := errors || jsonb_build_array('Missing parts category for ' || COALESCE(v_row->>'partNumber', ''));
        CONTINUE;
      END IF;
      INSERT INTO public.part_interchange_group (code, label, fit_scope, import_batch_id)
      VALUES (v_row->>'interchangeCode', COALESCE(NULLIF(v_row->>'label', ''), v_row->>'interchangeCode'), v_scope, p_batch_id)
      ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, fit_scope = EXCLUDED.fit_scope
      RETURNING id INTO v_group_id;

      SELECT id INTO v_component_id
      FROM public.maintenance_service_categories
      WHERE op_code = NULLIF(v_row->>'componentOpCode', '')
      LIMIT 1;

      inserted_new := false;
      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, import_batch_id, updated_at
      )
      SELECT
        v_category_id,
        COALESCE(NULLIF(v_row->>'partName', ''), v_row->>'partNumber'),
        v_row->>'partNumber',
        NULLIF(v_row->>'manufacturer', ''),
        v_kind,
        v_group_id,
        v_component_id,
        p_batch_id,
        now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.part_master pm
        WHERE upper(coalesce(pm.manufacturer, '')) = upper(coalesce(v_row->>'manufacturer', ''))
          AND pm.oem_part_number_norm = upper(regexp_replace(coalesce(v_row->>'partNumber', ''), '[^A-Za-z0-9]', '', 'g'))
          AND pm.oem_part_number_norm <> ''
      );
      IF FOUND THEN
        inserted_new := true;
      END IF;
      SELECT pm.id INTO v_part_id
      FROM public.part_master pm
      WHERE upper(coalesce(pm.manufacturer, '')) = upper(coalesce(v_row->>'manufacturer', ''))
        AND pm.oem_part_number_norm = upper(regexp_replace(coalesce(v_row->>'partNumber', ''), '[^A-Za-z0-9]', '', 'g'))
      LIMIT 1;
      IF v_part_id IS NULL THEN
        errors := errors || jsonb_build_array('Could not save part ' || COALESCE(v_row->>'partNumber', ''));
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
        WHERE pm.id = v_part_id
        ON CONFLICT (batch_id, part_id) DO NOTHING;
      END IF;
      UPDATE public.part_master pm
      SET category_id = v_category_id,
          interchange_group_id = v_group_id,
          maintenance_component_id = COALESCE(v_component_id, pm.maintenance_component_id),
          part_kind = v_kind
      WHERE pm.id = v_part_id;

      IF coalesce(trim(v_row->>'supersedes'), '') <> '' THEN
        SELECT pm.id INTO v_old_part
        FROM public.part_master pm
        WHERE pm.oem_part_number_norm = upper(regexp_replace(v_row->>'supersedes', '[^A-Za-z0-9]', '', 'g'))
          AND pm.id <> v_part_id
        LIMIT 1;
        IF v_old_part IS NOT NULL THEN
          INSERT INTO public.part_supersession (old_part_id, new_part_id)
          VALUES (v_old_part, v_part_id)
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;

      v_engine_id := NULL;
      v_platform_id := NULL;
      v_catalog_id := NULL;
      IF v_target = 'engine_family' THEN
        SELECT id INTO v_engine_id FROM public.engine_family WHERE code = upper(trim(v_row->>'targetCode'));
      ELSIF v_target = 'platform' THEN
        SELECT id INTO v_platform_id FROM public.vehicle_platform WHERE code = upper(trim(v_row->>'targetCode'));
      ELSIF v_target = 'catalog_variant' THEN
        v_catalog_id := NULLIF(v_row->>'targetCode', '')::uuid;
      END IF;
      IF (v_target = 'engine_family' AND v_engine_id IS NULL)
        OR (v_target = 'platform' AND v_platform_id IS NULL)
        OR (v_target = 'catalog_variant' AND v_catalog_id IS NULL) THEN
        errors := errors || jsonb_build_array('Unknown target ' || COALESCE(v_row->>'targetCode', ''));
        CONTINUE;
      END IF;

      INSERT INTO public.interchange_fitment_rule (
        interchange_group_id, target_kind, engine_family_id, platform_id, vehicle_catalog_id,
        year_from, year_to, "position", source, import_batch_id
      ) VALUES (
        v_group_id, v_target, v_engine_id, v_platform_id, v_catalog_id,
        NULLIF(v_row->>'yearFrom', '')::integer,
        NULLIF(v_row->>'yearTo', '')::integer,
        NULLIF(v_row->>'position', ''),
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

-- One call for active fleet vehicles. A vehicle counts only when all 10 named jobs have an OEM Tier 1–3 match.
CREATE OR REPLACE FUNCTION public.parts_fleet_coverage(p_vehicles jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH req AS (
    SELECT unnest(ARRAY[
      'ENG-OIL', 'ENG-SPARK', 'FILT-AIR', 'HVAC-CABIN', 'BRK-PADS',
      'BELT-SERP', 'LGT-WIPER', 'SUS-INSP', 'FLD-COOL', 'TRN-FLUID'
    ]) AS op_code
  ),
  needed AS (
    SELECT count(*)::int AS n FROM req
  ),
  vehicles AS (
    SELECT
      t.ordinality::int AS n,
      NULLIF(t.elem->>'organizationId', '') AS organization_id,
      CASE
        WHEN (t.elem->>'catalogId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (t.elem->>'catalogId')::uuid
        ELSE NULL
      END AS catalog_id,
      NULLIF(t.elem->>'year', '')::int AS vehicle_year
    FROM jsonb_array_elements(COALESCE(p_vehicles, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ordinality)
  ),
  cat AS (
    SELECT v.n, v.organization_id, v.vehicle_year, vc.id, vc.platform_id, vc.engine_family_id, vc.production_start_year
    FROM vehicles v
    JOIN public.vehicle_catalog vc ON vc.id = v.catalog_id
  ),
  hits AS (
    SELECT DISTINCT cat.n, c.op_code
    FROM cat
    JOIN public.maintenance_service_categories c ON c.op_code IN (SELECT op_code FROM req)
    JOIN public.part_master pm ON pm.maintenance_component_id = c.id AND pm.part_kind = 'oem'
    JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    JOIN public.interchange_fitment_rule r ON r.interchange_group_id = g.id
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE (
      (r.target_kind = 'catalog_variant' AND r.vehicle_catalog_id = cat.id)
      OR (r.target_kind = 'platform' AND (r.platform_id = cat.platform_id OR r.platform_id = mine.parent_id))
      OR (
        r.target_kind = 'engine_family'
        AND r.engine_family_id = cat.engine_family_id
        AND g.fit_scope IN ('powertrain', 'universal')
      )
    )
    AND (r.year_from IS NULL OR COALESCE(cat.vehicle_year, cat.production_start_year) IS NULL OR COALESCE(cat.vehicle_year, cat.production_start_year) >= r.year_from)
    AND (r.year_to IS NULL OR COALESCE(cat.vehicle_year, cat.production_start_year) IS NULL OR COALESCE(cat.vehicle_year, cat.production_start_year) <= r.year_to)
  ),
  scored AS (
    SELECT v.n, v.organization_id, count(DISTINCT h.op_code)::int AS matched
    FROM vehicles v
    LEFT JOIN hits h ON h.n = v.n
    GROUP BY v.n, v.organization_id
  ),
  totals AS (
    SELECT
      count(*)::int AS vehicle_count,
      count(*) FILTER (WHERE matched = (SELECT n FROM needed))::int AS covered_count
    FROM scored
  ),
  by_org AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'organizationId', organization_id,
      'vehicleCount', vehicle_count,
      'coveredCount', covered_count,
      'coveragePct', CASE WHEN vehicle_count = 0 THEN 0 ELSE round((covered_count::numeric / vehicle_count) * 100, 1) END
    ) ORDER BY organization_id), '[]'::jsonb) AS items
    FROM (
      SELECT
        organization_id,
        count(*)::int AS vehicle_count,
        count(*) FILTER (WHERE matched = (SELECT n FROM needed))::int AS covered_count
      FROM scored
      WHERE organization_id IS NOT NULL
      GROUP BY organization_id
    ) o
  )
  SELECT jsonb_build_object(
    'coveragePct', CASE WHEN t.vehicle_count = 0 THEN 0 ELSE round((t.covered_count::numeric / t.vehicle_count) * 100, 1) END,
    'vehicleCount', t.vehicle_count,
    'coveredCount', t.covered_count,
    'componentsRequired', (SELECT n FROM needed),
    'byOrg', b.items
  )
  FROM totals t
  CROSS JOIN by_org b;
$$;

CREATE OR REPLACE FUNCTION public.backfill_work_order_part_links()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  linked int := 0;
  queued int := 0;
  rec record;
  match_count int;
  match_id uuid;
  norm text;
BEGIN
  FOR rec IN
    SELECT l.id AS line_id, l.part_number, wo.organization_id
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE l.part_id IS NULL
      AND l.declined IS NOT TRUE
      AND coalesce(trim(l.part_number), '') <> ''
      AND wo.status = 'completed'
  LOOP
    norm := upper(regexp_replace(rec.part_number, '[^A-Za-z0-9]', '', 'g'));
    SELECT count(*)::int, (array_agg(id))[1]
    INTO match_count, match_id
    FROM public.part_master
    WHERE oem_part_number_norm = norm AND oem_part_number_norm <> '';
    IF match_count = 1 THEN
      UPDATE public.maintenance_work_order_lines
      SET part_id = match_id, updated_at = now()
      WHERE id = rec.line_id AND part_id IS NULL;
      linked := linked + 1;
    ELSE
      INSERT INTO public.part_number_link_review (organization_id, work_order_line_id, part_number, candidate_count, status)
      VALUES (rec.organization_id, rec.line_id, rec.part_number, match_count, 'open')
      ON CONFLICT (work_order_line_id) DO NOTHING;
      IF FOUND THEN
        queued := queued + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('linked', linked, 'queued', queued);
END;
$$;

-- Published OEM consumables only. Rows whose engine is not in the catalog are skipped.
DO $seed$
DECLARE
  v_batch uuid := 'c3d4e5f6-a7b8-4c9d-8e0f-123456789abc';
  v_rows jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.part_master WHERE import_batch_id = v_batch) THEN
  SELECT COALESCE(jsonb_agg(doc), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT doc
    FROM (VALUES
      ('{"interchangeCode":"IC-OIL-1NZ-FE","label":"1NZ-FE oil filter","manufacturer":"Toyota","partNumber":"90915-YZZD2","partName":"Oil filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FE","componentOpCode":"ENG-OIL","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-OIL-1NZ-FE","label":"1NZ-FE oil filter","manufacturer":"Denso","partNumber":"1501004","partName":"Oil filter","partKind":"oe_supplier","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FE","componentOpCode":"ENG-OIL","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-AIR-1NZ-FE","label":"1NZ-FE air filter","manufacturer":"Toyota","partNumber":"17801-21050","partName":"Air filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FE","componentOpCode":"FILT-AIR","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PLUG-1NZ-FE","label":"1NZ-FE spark plug","manufacturer":"Toyota","partNumber":"90919-01210","partName":"Spark plug","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FE","componentOpCode":"ENG-SPARK","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-BELT-1NZ-FE","label":"1NZ-FE drive belt","manufacturer":"Toyota","partNumber":"90916-02664","partName":"Drive belt","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FE","componentOpCode":"BELT-SERP","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-THERM-1NZ-FE","label":"1NZ-FE thermostat","manufacturer":"Toyota","partNumber":"90916-03100","partName":"Thermostat","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FE","componentOpCode":"ENG-THERM","categorySlug":"cooling"}'::jsonb),
      ('{"interchangeCode":"IC-PUMP-1NZ-FE","label":"1NZ-FE water pump","manufacturer":"Toyota","partNumber":"16100-29085","partName":"Water pump","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FE","componentOpCode":"ENG-WPUMP","categorySlug":"cooling"}'::jsonb),
      ('{"interchangeCode":"IC-O2-1NZ-FE","label":"1NZ-FE oxygen sensor","manufacturer":"Toyota","partNumber":"89465-02380","partName":"Oxygen sensor","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FE","componentOpCode":"ENG-O2","categorySlug":"electrical-computers"}'::jsonb),
      ('{"interchangeCode":"IC-COIL-1NZ-FE","label":"1NZ-FE ignition coil","manufacturer":"Toyota","partNumber":"90919-02248","partName":"Ignition coil","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FE","componentOpCode":"ENG-COIL","categorySlug":"electrical-computers"}'::jsonb),
      ('{"interchangeCode":"IC-OIL-2ZR-FXE","label":"2ZR-FXE oil filter","manufacturer":"Toyota","partNumber":"04152-YZZA1","partName":"Oil filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2ZR-FXE","componentOpCode":"ENG-OIL","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-AIR-2ZR-FXE","label":"2ZR-FXE air filter","manufacturer":"Toyota","partNumber":"17801-0T020","partName":"Air filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2ZR-FXE","componentOpCode":"FILT-AIR","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PLUG-2ZR-FXE","label":"2ZR-FXE spark plug","manufacturer":"Toyota","partNumber":"90919-01247","partName":"Spark plug","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2ZR-FXE","componentOpCode":"ENG-SPARK","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-THERM-2ZR-FXE","label":"2ZR-FXE thermostat","manufacturer":"Toyota","partNumber":"90916-03129","partName":"Thermostat","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2ZR-FXE","componentOpCode":"ENG-THERM","categorySlug":"cooling"}'::jsonb),
      ('{"interchangeCode":"IC-PUMP-2ZR-FXE","label":"2ZR-FXE water pump","manufacturer":"Toyota","partNumber":"16100-39465","partName":"Water pump","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2ZR-FXE","componentOpCode":"ENG-WPUMP","categorySlug":"cooling"}'::jsonb),
      ('{"interchangeCode":"IC-COIL-2ZR-FXE","label":"2ZR-FXE ignition coil","manufacturer":"Toyota","partNumber":"90919-02259","partName":"Ignition coil","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2ZR-FXE","componentOpCode":"ENG-COIL","categorySlug":"electrical-computers"}'::jsonb),
      ('{"interchangeCode":"IC-OIL-1KR-FE","label":"1KR-FE oil filter","manufacturer":"Toyota","partNumber":"90915-10003","partName":"Oil filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1KR-FE","componentOpCode":"ENG-OIL","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-AIR-1KR-FE","label":"1KR-FE air filter","manufacturer":"Toyota","partNumber":"17801-0H050","partName":"Air filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1KR-FE","componentOpCode":"FILT-AIR","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PLUG-1KR-FE","label":"1KR-FE spark plug","manufacturer":"Toyota","partNumber":"90919-01235","partName":"Spark plug","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1KR-FE","componentOpCode":"ENG-SPARK","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PUMP-1KR-FE","label":"1KR-FE water pump","manufacturer":"Toyota","partNumber":"16100-BZ040","partName":"Water pump","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1KR-FE","componentOpCode":"ENG-WPUMP","categorySlug":"cooling"}'::jsonb),
      ('{"interchangeCode":"IC-OIL-2AZ-FE","label":"2AZ-FE oil filter","manufacturer":"Toyota","partNumber":"90915-YZZD1","partName":"Oil filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2AZ-FE","componentOpCode":"ENG-OIL","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-AIR-2AZ-FE","label":"2AZ-FE air filter","manufacturer":"Toyota","partNumber":"17801-28030","partName":"Air filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2AZ-FE","componentOpCode":"FILT-AIR","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PLUG-2AZ-FE","label":"2AZ-FE spark plug","manufacturer":"Toyota","partNumber":"90919-01191","partName":"Spark plug","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2AZ-FE","componentOpCode":"ENG-SPARK","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PUMP-2AZ-FE","label":"2AZ-FE water pump","manufacturer":"Toyota","partNumber":"16100-29415","partName":"Water pump","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2AZ-FE","componentOpCode":"ENG-WPUMP","categorySlug":"cooling"}'::jsonb),
      ('{"interchangeCode":"IC-COIL-2AZ-FE","label":"2AZ-FE ignition coil","manufacturer":"Toyota","partNumber":"90919-02239","partName":"Ignition coil","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"2AZ-FE","componentOpCode":"ENG-COIL","categorySlug":"electrical-computers"}'::jsonb),
      ('{"interchangeCode":"IC-OIL-1NZ-FXE","label":"1NZ-FXE oil filter","manufacturer":"Toyota","partNumber":"90915-YZZD4","partName":"Oil filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FXE","componentOpCode":"ENG-OIL","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-AIR-1NZ-FXE","label":"1NZ-FXE air filter","manufacturer":"Toyota","partNumber":"17801-21040","partName":"Air filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FXE","componentOpCode":"FILT-AIR","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PLUG-1NZ-FXE","label":"1NZ-FXE spark plug","manufacturer":"Toyota","partNumber":"90919-01164","partName":"Spark plug","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"1NZ-FXE","componentOpCode":"ENG-SPARK","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-OIL-HR15DE","label":"HR15DE oil filter","manufacturer":"Nissan","partNumber":"15208-65F0E","partName":"Oil filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"HR15DE","componentOpCode":"ENG-OIL","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-AIR-HR15DE","label":"HR15DE air filter","manufacturer":"Nissan","partNumber":"16546-ED000","partName":"Air filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"HR15DE","componentOpCode":"FILT-AIR","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PLUG-HR15DE","label":"HR15DE spark plug","manufacturer":"Nissan","partNumber":"22401-CK81A","partName":"Spark plug","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"HR15DE","componentOpCode":"ENG-SPARK","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-OIL-L15B","label":"L15B oil filter","manufacturer":"Honda","partNumber":"15400-PLM-A02","partName":"Oil filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"L15B","componentOpCode":"ENG-OIL","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-AIR-L15B","label":"L15B air filter","manufacturer":"Honda","partNumber":"17220-5R0-A00","partName":"Air filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"L15B","componentOpCode":"FILT-AIR","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PLUG-L15B","label":"L15B spark plug","manufacturer":"Honda","partNumber":"12290-5R0-003","partName":"Spark plug","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"L15B","componentOpCode":"ENG-SPARK","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-OIL-R06A","label":"R06A oil filter","manufacturer":"Suzuki","partNumber":"16510-82703","partName":"Oil filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"R06A","componentOpCode":"ENG-OIL","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-AIR-R06A","label":"R06A air filter","manufacturer":"Suzuki","partNumber":"13780-68K00","partName":"Air filter","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"R06A","componentOpCode":"FILT-AIR","categorySlug":"engine-components"}'::jsonb),
      ('{"interchangeCode":"IC-PLUG-R06A","label":"R06A spark plug","manufacturer":"Suzuki","partNumber":"09482-00615","partName":"Spark plug","partKind":"oem","fitScope":"powertrain","targetKind":"engine_family","targetCode":"R06A","componentOpCode":"ENG-SPARK","categorySlug":"engine-components"}'::jsonb)
    ) AS raw(doc)
  ) s
  WHERE EXISTS (
    SELECT 1 FROM public.engine_family e
    WHERE e.code = upper(s.doc->>'targetCode')
  );
  IF v_rows IS NOT NULL AND jsonb_array_length(v_rows) > 0 THEN
    PERFORM public.import_parts_catalog_rows(v_rows, v_batch);
  END IF;
  END IF;
  PERFORM public.backfill_work_order_part_links();
END;
$seed$;

REVOKE ALL ON FUNCTION public.adjust_org_part_stock(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_parts_usage_for_work_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parts_fleet_coverage(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backfill_work_order_part_links() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_org_part_stock(text, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_parts_usage_for_work_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.parts_fleet_coverage(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_work_order_part_links() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_parts_usage_for_work_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_parts_catalog_rows(jsonb, uuid) TO service_role;
