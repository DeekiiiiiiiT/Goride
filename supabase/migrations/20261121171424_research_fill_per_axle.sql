-- Research engine Rev 5.8 (docs/research-engine-audit.md §22, RE-69): parts that come in positions are filled per axle.
--
-- Dominion marks part types with a position scheme (shock absorber = four_corners, brake rotor = axle, caliper =
-- axle_left_right…). "Fill this car" queued one job per part type with no position, so a shock absorber check could only
-- save one number for every corner. Now those part types get one job for the front and one for the rear; the browser
-- check then asks left/right where the scheme has sides. Same body as layer 2 otherwise.

CREATE OR REPLACE FUNCTION public.catalog_research_fill_car(p_vehicle_catalog_id uuid, p_origin text DEFAULT 'owner_fill')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_car public.vehicle_catalog%ROWTYPE;
  v_cells jsonb;
  v_comp record;
  v_key text;
  v_axle text;
  v_r jsonb;
  v_new integer := 0;
  v_joined integer := 0;
BEGIN
  SELECT * INTO v_car FROM public.vehicle_catalog WHERE id = p_vehicle_catalog_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'car_not_found'; END IF;

  -- RE-04: no frame code → find the identity first; parts and specs wait for it.
  IF nullif(btrim(coalesce(v_car.chassis_code, '')), '') IS NULL THEN
    v_r := public.catalog_research_queue_identity(p_vehicle_catalog_id);
    RETURN jsonb_build_object('identityFirst', true, 'identityJobId', v_r->>'jobId', 'newJobs', 0, 'joined', 0);
  END IF;

  SELECT r.cells INTO v_cells FROM public.variant_parts_readiness r WHERE r.variant_id = p_vehicle_catalog_id;

  FOR v_comp IN
    SELECT c.id, c.op_code, c.position_scheme
    FROM public.maintenance_service_categories c
    WHERE c.kind = 'component'
      AND c.op_code IN ('ENG-OIL', 'ENG-SPARK', 'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN', 'BRK-PADS', 'BELT-SERP',
                        'LGT-WIPER', 'BRK-ROTOR', 'SUS-SHOCK')
  LOOP
    IF coalesce(v_cells->>v_comp.op_code, 'missing') = 'not_applicable' THEN CONTINUE; END IF;
    IF v_comp.position_scheme IN ('axle', 'four_corners', 'axle_left_right', 'axle_inner_outer') THEN
      -- An open job from before per-axle filling (no position) already covers both axles: join it, don't duplicate.
      IF EXISTS (
        SELECT 1 FROM public.catalog_research_job j
        WHERE j.vehicle_catalog_id = p_vehicle_catalog_id AND j.maintenance_component_id = v_comp.id
          AND nullif(btrim(coalesce(j.fit_descriptor, '')), '') IS NULL
          AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'browser_check', 'browser_check_queued')
      ) THEN
        v_joined := v_joined + 1;
        CONTINUE;
      END IF;
      -- RE-69: one job per axle, skipping an axle that already has a confirmed part on this car.
      FOREACH v_axle IN ARRAY ARRAY['front', 'rear'] LOOP
        IF EXISTS (
          SELECT 1
          FROM public.parts_for_vehicle(p_vehicle_catalog_id, v_comp.id, NULL) p
          JOIN public.part_listing pl
            ON pl.vehicle_catalog_id = p_vehicle_catalog_id AND pl.interchange_group_id = p.interchange_group_id
          WHERE pl.trust = 'confirmed' AND lower(coalesce(pl.position, '')) = v_axle
        ) THEN
          CONTINUE;
        END IF;
        v_r := public.catalog_research_queue_item(p_vehicle_catalog_id, v_comp.id, NULL, v_axle, p_origin);
        IF (v_r->>'newJob')::boolean THEN v_new := v_new + 1; ELSE v_joined := v_joined + 1; END IF;
      END LOOP;
    ELSE
      IF coalesce(v_cells->>v_comp.op_code, 'missing') = 'verified' THEN CONTINUE; END IF;
      v_r := public.catalog_research_queue_item(p_vehicle_catalog_id, v_comp.id, NULL, NULL, p_origin);
      IF (v_r->>'newJob')::boolean THEN v_new := v_new + 1; ELSE v_joined := v_joined + 1; END IF;
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY public.catalog_research_core_spec_keys() LOOP
    IF EXISTS (SELECT 1 FROM public.specs_for_variant(p_vehicle_catalog_id) s WHERE s.spec_key = v_key AND s.sourced) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.spec_key k WHERE k.key = v_key) THEN CONTINUE; END IF;
    v_r := public.catalog_research_queue_item(p_vehicle_catalog_id, NULL, v_key, NULL, p_origin);
    IF (v_r->>'newJob')::boolean THEN v_new := v_new + 1; ELSE v_joined := v_joined + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('identityFirst', false, 'newJobs', v_new, 'joined', v_joined);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_fill_car(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_research_fill_car(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_research_fill_car(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_fill_car(uuid, text) TO service_role;
