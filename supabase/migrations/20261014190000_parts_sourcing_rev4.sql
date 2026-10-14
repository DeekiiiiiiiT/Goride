-- Parts sourcing Rev 4. Does not edit earlier parts migrations (already applied).
-- Shelf reversals restore only what was actually taken and never invent a stock row.
-- Body-shaped parts leave engine rules. Coverage scores ten real parts.

ALTER TABLE public.maintenance_parts_usage
  ADD COLUMN IF NOT EXISTS stock_decremented numeric(12, 3) NOT NULL DEFAULT 0;

-- Return type changes. plpgsql callers are not dependency-tracked, so drop them
-- explicitly and recreate them in this same migration.
DROP FUNCTION IF EXISTS public.apply_parts_usage_for_work_order(uuid);
DROP FUNCTION IF EXISTS public.reverse_parts_usage_for_work_order(uuid);
DROP FUNCTION IF EXISTS public.adjust_org_part_stock(text, uuid, numeric);

-- NULL means this fleet has no shelf row (do not create one).
-- Otherwise returns the signed quantity actually applied. A take never exceeds the shelf.
CREATE FUNCTION public.adjust_org_part_stock(
  p_org text,
  p_part uuid,
  p_delta numeric
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_stock_id uuid;
  v_qty numeric;
  v_applied numeric;
BEGIN
  IF p_org IS NULL OR p_part IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN 0;
  END IF;
  SELECT s.id, s.qty INTO v_stock_id, v_qty
  FROM public.org_part_stock s
  WHERE s.organization_id = p_org AND s.part_id = p_part
  ORDER BY s.qty DESC
  LIMIT 1;
  IF v_stock_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_delta < 0 THEN
    v_applied := -LEAST(v_qty, -p_delta);
  ELSE
    v_applied := p_delta;
  END IF;
  UPDATE public.org_part_stock
  SET qty = qty + v_applied, updated_at = now()
  WHERE id = v_stock_id;
  RETURN v_applied;
END;
$$;

CREATE FUNCTION public.reverse_parts_usage_for_work_order(p_work_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_usage public.maintenance_parts_usage%ROWTYPE;
BEGIN
  FOR v_usage IN
    SELECT * FROM public.maintenance_parts_usage WHERE work_order_id = p_work_order_id
  LOOP
    IF COALESCE(v_usage.stock_decremented, 0) > 0 THEN
      PERFORM public.adjust_org_part_stock(v_usage.organization_id, v_usage.part_id, v_usage.stock_decremented);
    END IF;
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

CREATE FUNCTION public.apply_parts_usage_for_work_order(p_work_order_id uuid)
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
  prev_dec numeric;
  applied numeric;
  taken numeric;
  extra numeric;
  give_back numeric;
  part_name text;
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
        applied := public.adjust_org_part_stock(wo.organization_id, line.part_id, -need);
        IF applied IS NULL THEN
          taken := 0;
        ELSE
          taken := -applied;
          IF taken < need THEN
            SELECT pm.name INTO part_name FROM public.part_master pm WHERE pm.id = line.part_id;
            warnings := warnings || jsonb_build_array(jsonb_build_object(
              'partId', line.part_id,
              'partName', COALESCE(part_name, 'Part'),
              'shortBy', need - taken
            ));
          END IF;
        END IF;
        UPDATE public.maintenance_parts_usage
        SET stock_decremented = taken
        WHERE line_id = line.id;
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
        SELECT u.qty, u.part_id, u.stock_decremented INTO prev_qty, prev_usage_part, prev_dec
        FROM public.maintenance_parts_usage u
        WHERE u.line_id = line.id;
        IF prev_usage_part IS DISTINCT FROM line.part_id THEN
          IF COALESCE(prev_dec, 0) > 0 THEN
            PERFORM public.adjust_org_part_stock(wo.organization_id, prev_usage_part, prev_dec);
          END IF;
          applied := public.adjust_org_part_stock(wo.organization_id, line.part_id, -need);
          IF applied IS NULL THEN
            taken := 0;
          ELSE
            taken := -applied;
            IF taken < need THEN
              SELECT pm.name INTO part_name FROM public.part_master pm WHERE pm.id = line.part_id;
              warnings := warnings || jsonb_build_array(jsonb_build_object(
                'partId', line.part_id,
                'partName', COALESCE(part_name, 'Part'),
                'shortBy', need - taken
              ));
            END IF;
          END IF;
          UPDATE public.maintenance_parts_usage
          SET part_id = line.part_id, qty = need, unit_cost = line.unit_price, stock_decremented = taken
          WHERE line_id = line.id;
        ELSIF prev_qty IS DISTINCT FROM need THEN
          IF need > COALESCE(prev_qty, 0) THEN
            extra := need - COALESCE(prev_qty, 0);
            applied := public.adjust_org_part_stock(wo.organization_id, line.part_id, -extra);
            IF applied IS NULL THEN
              taken := 0;
            ELSE
              taken := -applied;
              IF taken < extra THEN
                SELECT pm.name INTO part_name FROM public.part_master pm WHERE pm.id = line.part_id;
                warnings := warnings || jsonb_build_array(jsonb_build_object(
                  'partId', line.part_id,
                  'partName', COALESCE(part_name, 'Part'),
                  'shortBy', extra - taken
                ));
              END IF;
            END IF;
            prev_dec := COALESCE(prev_dec, 0) + taken;
          ELSE
            give_back := LEAST(COALESCE(prev_dec, 0), COALESCE(prev_qty, 0) - need);
            IF give_back > 0 THEN
              PERFORM public.adjust_org_part_stock(wo.organization_id, line.part_id, give_back);
            END IF;
            prev_dec := COALESCE(prev_dec, 0) - give_back;
          END IF;
          UPDATE public.maintenance_parts_usage
          SET qty = need, unit_cost = line.unit_price, stock_decremented = prev_dec
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
    IF COALESCE(orphan.stock_decremented, 0) > 0 THEN
      PERFORM public.adjust_org_part_stock(orphan.organization_id, orphan.part_id, orphan.stock_decremented);
    END IF;
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

INSERT INTO public.maintenance_service_categories
  (code, name, icon_key, field_schema, quick_job_eligible, sort_order, kind, parent_id, op_code)
SELECT v.code, v.name, 'oil', '{"fields":[]}'::jsonb, true, v.sort_order, 'component',
       'b1000000-0000-4000-8000-000000000001'::uuid, v.op_code
FROM (VALUES
  ('brake_rotor', 'Brake rotor', 1094, 'BRK-ROTOR'),
  ('shock_absorber', 'Shock absorber', 1095, 'SUS-SHOCK')
) AS v(code, name, sort_order, op_code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_service_categories c WHERE c.op_code = v.op_code
);

-- Air filters, belts, oxygen sensors and water pumps are body-specific.
-- Drop engine rules so they stop claiming a factory fit across every chassis.
DELETE FROM public.interchange_fitment_rule r
WHERE r.interchange_group_id IN (
  SELECT pm.interchange_group_id
  FROM public.part_master pm
  JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
  WHERE c.op_code IN ('FILT-AIR', 'BELT-SERP', 'ENG-O2', 'ENG-WPUMP')
    AND pm.interchange_group_id IS NOT NULL
)
AND (
  r.target_kind = 'engine_family'
  OR r.import_batch_id = 'c3d4e5f6-a7b8-4c9d-8e0f-123456789abc'
);

UPDATE public.part_interchange_group g
SET fit_scope = 'chassis'
WHERE g.id IN (
  SELECT pm.interchange_group_id
  FROM public.part_master pm
  JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
  WHERE c.op_code IN ('FILT-AIR', 'BELT-SERP', 'ENG-O2', 'ENG-WPUMP')
    AND pm.interchange_group_id IS NOT NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM public.part_master other
  LEFT JOIN public.maintenance_service_categories oc ON oc.id = other.maintenance_component_id
  WHERE other.interchange_group_id = g.id
    AND (oc.op_code IS NULL OR oc.op_code NOT IN ('FILT-AIR', 'BELT-SERP', 'ENG-O2', 'ENG-WPUMP'))
);

-- A vehicle counts only when all 10 named parts have an OEM Tier 1–3 match.
-- Inspections and fluid services stay in maintenance; they are not on this list.
CREATE OR REPLACE FUNCTION public.parts_fleet_coverage(p_vehicles jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH req AS (
    SELECT unnest(ARRAY[
      'ENG-OIL', 'ENG-SPARK', 'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN',
      'BRK-PADS', 'BELT-SERP', 'LGT-WIPER', 'BRK-ROTOR', 'SUS-SHOCK'
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
  comp_score AS (
    SELECT
      r.op_code,
      COALESCE(MIN(c.name), r.op_code) AS name,
      (SELECT count(DISTINCT h.n)::int FROM hits h WHERE h.op_code = r.op_code) AS matched_vehicles
    FROM req r
    LEFT JOIN public.maintenance_service_categories c ON c.op_code = r.op_code
    GROUP BY r.op_code
  ),
  fleet_orgs AS (
    SELECT DISTINCT organization_id FROM vehicles WHERE organization_id IS NOT NULL
  ),
  org_gaps AS (
    SELECT o.organization_id, r.op_code
    FROM fleet_orgs o
    CROSS JOIN req r
    WHERE NOT EXISTS (
      SELECT 1
      FROM hits h
      JOIN vehicles hv ON hv.n = h.n
      WHERE hv.organization_id = o.organization_id
        AND h.op_code = r.op_code
    )
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
      'coveragePct', CASE WHEN vehicle_count = 0 THEN 0 ELSE round((covered_count::numeric / vehicle_count) * 100, 1) END,
      'missingOpCodes', missing_op_codes
    ) ORDER BY organization_id), '[]'::jsonb) AS items
    FROM (
      SELECT
        organization_id,
        count(*)::int AS vehicle_count,
        count(*) FILTER (WHERE matched = (SELECT n FROM needed))::int AS covered_count,
        (
          SELECT COALESCE(jsonb_agg(g.op_code ORDER BY g.op_code), '[]'::jsonb)
          FROM org_gaps g
          WHERE g.organization_id = scored.organization_id
        ) AS missing_op_codes
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
    'components', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'opCode', op_code,
        'name', name,
        'matchedVehicles', matched_vehicles
      ) ORDER BY op_code), '[]'::jsonb)
      FROM comp_score
    ),
    'missing', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'opCode', op_code,
        'name', name
      ) ORDER BY op_code), '[]'::jsonb)
      FROM comp_score
      WHERE matched_vehicles = 0
    ),
    'byOrg', b.items
  )
  FROM totals t
  CROSS JOIN by_org b;
$$;

-- Lock the suggestion, then insert the rule and close it in one step.
CREATE OR REPLACE FUNCTION public.decide_part_rule_proposal(p_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_prop public.part_rule_proposal%ROWTYPE;
  v_group uuid;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Choose approve or reject.';
  END IF;
  SELECT * INTO v_prop
  FROM public.part_rule_proposal
  WHERE id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion not found';
  END IF;
  IF v_prop.status <> 'proposed' THEN
    RAISE EXCEPTION 'This suggestion is already closed.';
  END IF;
  IF p_status = 'approved' THEN
    SELECT pm.interchange_group_id INTO v_group
    FROM public.part_master pm
    WHERE pm.id = v_prop.part_id;
    IF v_group IS NULL THEN
      RAISE EXCEPTION 'This part has no interchange group yet.';
    END IF;
    INSERT INTO public.interchange_fitment_rule (
      interchange_group_id, target_kind, platform_id, engine_family_id, source
    ) VALUES (
      v_group, v_prop.target_kind, v_prop.platform_id, v_prop.engine_family_id, 'install_confirmed'
    );
  END IF;
  UPDATE public.part_rule_proposal
  SET status = p_status
  WHERE id = p_id
  RETURNING * INTO v_prop;
  RETURN to_jsonb(v_prop);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_org_part_stock(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_parts_usage_for_work_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_parts_usage_for_work_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parts_fleet_coverage(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_part_rule_proposal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_org_part_stock(text, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_parts_usage_for_work_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_parts_usage_for_work_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.parts_fleet_coverage(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_part_rule_proposal(uuid, text) TO service_role;
