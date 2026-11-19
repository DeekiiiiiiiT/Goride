-- Rollback C6 (manual): UPDATE public.maintenance_service_categories SET position_scheme = 'none'
--   WHERE code IN ('tire_valve_stem', 'wheel_balancing') AND position_scheme = 'four_corners';

CREATE OR REPLACE FUNCTION public.maintenance_position_codes_allowed(
  p_job_code text,
  p_position_aware boolean,
  p_scheme text
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_code text := lower(btrim(coalesce(p_job_code, '')));
  v_scheme text := lower(btrim(coalesce(p_scheme, '')));
  v_result text[] := ARRAY[]::text[];
  v_wheel_schemes text[] := ARRAY[
    'axle', 'four_corners', 'axle_left_right', 'axle_inner_outer'
  ];
  v_known_schemes text[] := ARRAY[
    'none', 'axle', 'four_corners', 'driver_passenger_rear', 'low_high_beam',
    'before_after_catalyst', 'front_rear_side', 'axle_left_right',
    'axle_inner_outer', 'axle_numbered'
  ];
  v_has_scheme boolean;
BEGIN
  IF v_code = 'front_stabilizer_link' THEN
    RETURN ARRAY['LF', 'RF'];
  END IF;
  IF v_code = 'rear_stabilizer_link' THEN
    RETURN ARRAY['LR', 'RR'];
  END IF;
  IF p_position_aware IS TRUE THEN
    RETURN ARRAY['LF', 'RF', 'LR', 'RR'];
  END IF;

  v_has_scheme := v_scheme <> '' AND v_scheme <> 'none' AND v_scheme = ANY (v_known_schemes);
  IF NOT v_has_scheme THEN
    RETURN ARRAY[]::text[];
  END IF;

  IF v_scheme = ANY (v_wheel_schemes) THEN
    v_result := ARRAY['LF', 'RF', 'LR', 'RR'];
  ELSIF v_scheme = 'before_after_catalyst' THEN
    v_result := ARRAY['before_cat', 'after_cat'];
  ELSIF v_scheme = 'driver_passenger_rear' THEN
    v_result := ARRAY['driver', 'passenger', 'rear'];
  ELSIF v_scheme = 'low_high_beam' THEN
    v_result := ARRAY['low', 'high'];
  ELSIF v_scheme = 'front_rear_side' THEN
    v_result := ARRAY['front', 'rear', 'side'];
  ELSIF v_scheme = 'axle_numbered' THEN
    v_result := ARRAY['front', 'rear'];
  ELSE
    v_result := ARRAY[]::text[];
  END IF;

  IF p_position_aware IS NOT TRUE
     AND v_has_scheme
     AND v_code NOT IN ('front_stabilizer_link', 'rear_stabilizer_link') THEN
    v_result := v_result || ARRAY['unknown'];
  END IF;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.maintenance_position_codes_allowed(text, boolean, text) IS
  'Allowed Fleet position codes per job. Must stay in step with packages/types/src/partPositions.ts.';

REVOKE ALL ON FUNCTION public.maintenance_position_codes_allowed(text, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_position_codes_allowed(text, boolean, text)
  TO service_role;

UPDATE public.maintenance_service_categories
SET position_scheme = 'four_corners'
WHERE code IN ('tire_valve_stem', 'wheel_balancing')
  AND position_scheme = 'none';

ALTER TABLE public.parts_sourcing_requests
  ADD COLUMN IF NOT EXISTS position_scheme text NULL;

ALTER TABLE public.parts_sourcing_requests
  DROP CONSTRAINT IF EXISTS parts_sourcing_requests_position_scheme_check;

ALTER TABLE public.parts_sourcing_requests
  ADD CONSTRAINT parts_sourcing_requests_position_scheme_check
  CHECK (
    position_scheme IS NULL OR position_scheme IN (
      'none', 'axle', 'four_corners', 'driver_passenger_rear', 'low_high_beam',
      'before_after_catalyst', 'front_rear_side', 'axle_left_right',
      'axle_inner_outer', 'axle_numbered'
    )
  );

COMMENT ON COLUMN public.parts_sourcing_requests.position_scheme IS
  'Dominion position scheme copied from the logged job when a find-parts request is filed.';

ALTER TABLE public.parts_sourcing_requests
  ADD COLUMN IF NOT EXISTS position_codes text[] NULL;

ALTER TABLE public.parts_sourcing_requests
  DROP CONSTRAINT IF EXISTS parts_sourcing_requests_position_codes_requires_scheme;

ALTER TABLE public.parts_sourcing_requests
  ADD CONSTRAINT parts_sourcing_requests_position_codes_requires_scheme
  CHECK (position_codes IS NULL OR position_scheme IS NOT NULL);

COMMENT ON COLUMN public.parts_sourcing_requests.position_codes IS
  'Fleet position codes (e.g. before_cat, LF) selected when the request was filed.';

CREATE OR REPLACE FUNCTION public.fleet_save_work_order(
  p_organization_id text,
  p_actor_id uuid,
  p_status text,
  p_work_order jsonb,
  p_work_order_id uuid,
  p_expected_version integer,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_wo public.maintenance_work_orders%ROWTYPE;
  v_wo_id uuid;
  v_line jsonb;
  v_item jsonb;
  v_line_id uuid;
  v_incoming_ids uuid[] := ARRAY[]::uuid[];
  v_discount numeric;
  v_line_sum numeric;
  v_new_total numeric;
  v_items jsonb;
  v_declined boolean;
  v_expected_items numeric;
  v_actual_items numeric;
  v_now timestamptz := now();
  v_other_wo uuid;
  v_voided boolean;
  v_vehicle_catalog_id uuid;
  v_old_component uuid;
  v_recommended boolean;
  v_stored_positions text[];
  v_incoming_positions text[];
  v_check_positions boolean;
  v_final_component uuid;
  v_job_changed boolean;
  v_kept_positions text[];
  v_override_positions boolean;
  v_job_code text;
  v_job_aware boolean;
  v_job_scheme text;
  v_allowed text[];
  v_pos_code text;
  v_incoming_sorted text[];
  v_stored_sorted text[];
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_required' USING HINT = 'Saving user is required.';
  END IF;
  PERFORM set_config('app.actor_id', p_actor_id::text, true);

  IF p_status IS NULL OR p_status NOT IN ('draft', 'in_progress') THEN
    RAISE EXCEPTION 'status_invalid' USING HINT = 'Status must be draft or in_progress.';
  END IF;

  IF p_work_order_id IS NULL THEN
    IF p_expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'version_on_create' USING HINT = 'Do not send expected version when creating.';
    END IF;
    v_wo_id := coalesce(nullif(p_work_order ->> 'id', '')::uuid, gen_random_uuid());
    IF EXISTS (SELECT 1 FROM public.maintenance_work_orders w WHERE w.id = v_wo_id) THEN
      RAISE EXCEPTION 'work_order_id_taken' USING HINT = 'That work order id is already in use.';
    END IF;
    IF nullif(p_work_order ->> 'vehicle_id', '') IS NULL THEN
      RAISE EXCEPTION 'status_invalid' USING HINT = 'vehicle_id is required.';
    END IF;
    INSERT INTO public.maintenance_work_orders (
      id,
      organization_id,
      vehicle_id,
      status,
      log_mode,
      idempotency_key,
      log_number,
      performed_at_date,
      odometer,
      provider,
      currency,
      template_id,
      package_complete,
      notes,
      invoice_url,
      discount_amount,
      payload_json,
      updated_by,
      opened_at,
      total_cost,
      version
    ) VALUES (
      v_wo_id,
      p_organization_id,
      p_work_order ->> 'vehicle_id',
      p_status,
      coalesce(nullif(p_work_order ->> 'log_mode', ''), 'quick_job'),
      CASE WHEN p_work_order ? 'idempotency_key'
        THEN nullif(p_work_order ->> 'idempotency_key', '') END,
      CASE WHEN p_work_order ? 'log_number'
        THEN nullif(p_work_order ->> 'log_number', '') END,
      CASE WHEN p_work_order ? 'performed_at_date'
        THEN nullif(p_work_order ->> 'performed_at_date', '')::date END,
      CASE WHEN p_work_order ? 'odometer'
        THEN nullif(p_work_order ->> 'odometer', '')::integer END,
      CASE WHEN p_work_order ? 'provider'
        THEN nullif(p_work_order ->> 'provider', '') END,
      coalesce(nullif(p_work_order ->> 'currency', ''), 'JMD'),
      CASE WHEN p_work_order ? 'template_id'
        THEN nullif(p_work_order ->> 'template_id', '')::uuid END,
      coalesce((p_work_order ->> 'package_complete')::boolean, false),
      CASE WHEN p_work_order ? 'notes' THEN p_work_order ->> 'notes' END,
      CASE WHEN p_work_order ? 'invoice_url'
        THEN nullif(p_work_order ->> 'invoice_url', '') END,
      coalesce(nullif(p_work_order ->> 'discount_amount', '')::numeric, 0),
      CASE WHEN p_work_order ? 'payload_json' THEN
        CASE WHEN jsonb_typeof(p_work_order -> 'payload_json') = 'null' THEN NULL
        ELSE p_work_order -> 'payload_json' END
      ELSE '{}'::jsonb END,
      p_actor_id,
      v_now,
      0,
      1
    );
  ELSE
    IF p_expected_version IS NULL THEN
      RAISE EXCEPTION 'version_required' USING HINT = 'Send the work order version you loaded.';
    END IF;
    SELECT * INTO v_wo
    FROM public.maintenance_work_orders
    WHERE id = p_work_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'work_order_not_found' USING HINT = 'Work order not found.';
    END IF;
    IF v_wo.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'work_order_org_mismatch' USING HINT = 'Work order is not in this fleet.';
    END IF;
    IF v_wo.voided_at IS NOT NULL OR v_wo.status NOT IN ('draft', 'in_progress') THEN
      RAISE EXCEPTION 'immutable'
        USING HINT = 'This service is finished and can no longer be edited.';
    END IF;
    IF v_wo.completing_since IS NOT NULL
       AND v_wo.completing_since >= v_now - interval '10 minutes' THEN
      RAISE EXCEPTION 'completion_in_progress' USING HINT = 'This service is still finishing.';
    END IF;
    IF v_wo.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'stale_edit' USING HINT = 'Someone else saved this service first.';
    END IF;
    v_wo_id := v_wo.id;
    UPDATE public.maintenance_work_orders
    SET
      performed_at_date = CASE WHEN p_work_order ? 'performed_at_date'
        THEN nullif(p_work_order ->> 'performed_at_date', '')::date
        ELSE performed_at_date END,
      odometer = CASE WHEN p_work_order ? 'odometer'
        THEN nullif(p_work_order ->> 'odometer', '')::integer
        ELSE odometer END,
      provider = CASE WHEN p_work_order ? 'provider'
        THEN nullif(p_work_order ->> 'provider', '')
        ELSE provider END,
      currency = coalesce(nullif(p_work_order ->> 'currency', ''), currency),
      template_id = CASE WHEN p_work_order ? 'template_id'
        THEN nullif(p_work_order ->> 'template_id', '')::uuid
        ELSE template_id END,
      package_complete = coalesce(
        (p_work_order ->> 'package_complete')::boolean,
        package_complete
      ),
      notes = CASE WHEN p_work_order ? 'notes'
        THEN p_work_order ->> 'notes'
        ELSE notes END,
      invoice_url = CASE WHEN p_work_order ? 'invoice_url'
        THEN nullif(p_work_order ->> 'invoice_url', '')
        ELSE invoice_url END,
      discount_amount = coalesce(
        nullif(p_work_order ->> 'discount_amount', '')::numeric,
        discount_amount
      ),
      payload_json = CASE WHEN p_work_order ? 'payload_json' THEN
        CASE WHEN jsonb_typeof(p_work_order -> 'payload_json') = 'null' THEN NULL
        ELSE p_work_order -> 'payload_json' END
      ELSE payload_json END,
      status = p_status,
      updated_by = p_actor_id
    WHERE id = v_wo_id;
  END IF;

  -- A malformed link must never fail a save: it just means 'unknown'.
  SELECT CASE
    WHEN v.vehicle_catalog_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN v.vehicle_catalog_id::uuid
  END
  INTO v_vehicle_catalog_id
  FROM public.maintenance_work_orders wo
  JOIN fleet.vehicles v
    ON v.id = wo.vehicle_id
   AND v.organization_id::text = wo.organization_id
  WHERE wo.id = v_wo_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  LOOP
    v_voided := false;
    v_declined := coalesce((v_line ->> 'declined')::boolean, false);
    v_items := CASE
      WHEN NOT (v_line ? 'items') THEN '[]'::jsonb
      WHEN jsonb_typeof(v_line -> 'items') = 'null' THEN '[]'::jsonb
      WHEN jsonb_typeof(v_line -> 'items') = 'array' THEN v_line -> 'items'
      ELSE '[]'::jsonb
    END;
    IF v_declined AND jsonb_array_length(v_items) > 0 THEN
      RAISE EXCEPTION 'line_items_on_declined' USING HINT = 'Declined jobs cannot include items.';
    END IF;

    v_line_id := nullif(v_line ->> 'id', '')::uuid;
    IF v_line_id IS NOT NULL THEN
      SELECT coalesce(l.recommended, false) INTO v_recommended
      FROM public.maintenance_work_order_lines l
      WHERE l.id = v_line_id;
    ELSE
      v_recommended := false;
    END IF;
    IF v_line ? 'recommended' THEN
      v_recommended := coalesce((v_line ->> 'recommended')::boolean, false);
    END IF;
    IF v_recommended AND jsonb_array_length(v_items) > 0 THEN
      RAISE EXCEPTION 'line_items_on_found_job' USING HINT = 'Jobs not done yet cannot include items.';
    END IF;

    v_old_component := NULL;
    v_stored_positions := NULL;
    IF v_line_id IS NOT NULL THEN
      SELECT l.component_id, l.positions
      INTO v_old_component, v_stored_positions
      FROM public.maintenance_work_order_lines l
      WHERE l.id = v_line_id;
    END IF;

    v_final_component := CASE
      WHEN v_line ? 'component_id'
        THEN nullif(v_line ->> 'component_id', '')::uuid
      ELSE v_old_component
    END;
    -- A saved line moved to another job: its positions are checked against the new job (code review #2).
    v_job_changed := v_line_id IS NOT NULL AND v_final_component IS DISTINCT FROM v_old_component;
    v_override_positions := false;
    v_kept_positions := NULL;

    IF v_line ? 'positions' AND jsonb_typeof(v_line -> 'positions') = 'array' THEN
      v_incoming_positions := ARRAY(SELECT jsonb_array_elements_text(v_line -> 'positions'));
      SELECT coalesce(array_agg(DISTINCT e ORDER BY e), ARRAY[]::text[])
      INTO v_incoming_sorted
      FROM unnest(v_incoming_positions) e;
      IF v_line_id IS NULL OR v_job_changed THEN
        v_check_positions := true;
      ELSE
        SELECT coalesce(array_agg(DISTINCT e ORDER BY e), ARRAY[]::text[])
        INTO v_stored_sorted
        FROM unnest(coalesce(v_stored_positions, ARRAY[]::text[])) e;
        v_check_positions := v_incoming_sorted IS DISTINCT FROM v_stored_sorted;
      END IF;

      IF v_check_positions THEN
        IF v_final_component IS NOT NULL THEN
          SELECT c.code, c.position_aware, c.position_scheme
          INTO v_job_code, v_job_aware, v_job_scheme
          FROM public.maintenance_service_categories c
          WHERE c.id = v_final_component;
          IF FOUND THEN
            v_allowed := public.maintenance_position_codes_allowed(
              v_job_code, v_job_aware, v_job_scheme
            );
            IF coalesce(array_length(v_incoming_positions, 1), 0) > 0 THEN
              IF 'unknown' = ANY(v_incoming_sorted)
                 AND array_length(v_incoming_sorted, 1) > 1 THEN
                RAISE EXCEPTION 'position_invalid'
                  USING HINT = '"Not sure" can''t be picked together with a position.';
              END IF;
              FOREACH v_pos_code IN ARRAY v_incoming_positions LOOP
                IF NOT (v_pos_code = ANY(v_allowed)) THEN
                  RAISE EXCEPTION 'position_invalid'
                    USING HINT = 'That position doesn''t fit this job.';
                END IF;
              END LOOP;
            END IF;
          END IF;
        END IF;
      END IF;
    ELSIF NOT (v_line ? 'positions')
      AND v_job_changed
      AND coalesce(array_length(v_stored_positions, 1), 0) > 0 THEN
      -- No positions sent but the job changed: keep only the stored positions the new job allows (none for a job
      -- with no places), so the line never carries positions its job can't have.
      v_override_positions := true;
      v_allowed := ARRAY[]::text[];
      IF v_final_component IS NOT NULL THEN
        SELECT c.code, c.position_aware, c.position_scheme
        INTO v_job_code, v_job_aware, v_job_scheme
        FROM public.maintenance_service_categories c
        WHERE c.id = v_final_component;
        IF FOUND THEN
          v_allowed := public.maintenance_position_codes_allowed(v_job_code, v_job_aware, v_job_scheme);
        END IF;
      END IF;
      SELECT nullif(array_agg(p ORDER BY ord), ARRAY[]::text[])
      INTO v_kept_positions
      FROM unnest(v_stored_positions) WITH ORDINALITY AS s(p, ord)
      WHERE p = ANY(coalesce(v_allowed, ARRAY[]::text[]));
    END IF;

    IF v_line_id IS NOT NULL THEN
      UPDATE public.maintenance_work_order_lines
      SET
        sort_order = coalesce((v_line ->> 'sort_order')::integer, sort_order),
        system_id = CASE WHEN v_line ? 'system_id'
          THEN nullif(v_line ->> 'system_id', '')::uuid
          ELSE system_id END,
        component_id = CASE WHEN v_line ? 'component_id'
          THEN nullif(v_line ->> 'component_id', '')::uuid
          ELSE component_id END,
        system_code = CASE WHEN v_line ? 'system_code'
          THEN v_line ->> 'system_code'
          ELSE system_code END,
        system_name = CASE WHEN v_line ? 'system_name'
          THEN v_line ->> 'system_name'
          ELSE system_name END,
        component_code = CASE WHEN v_line ? 'component_code'
          THEN v_line ->> 'component_code'
          ELSE component_code END,
        component_name = CASE WHEN v_line ? 'component_name'
          THEN v_line ->> 'component_name'
          ELSE component_name END,
        action = coalesce(nullif(v_line ->> 'action', ''), action),
        qty = CASE WHEN v_line ? 'qty'
          THEN nullif(v_line ->> 'qty', '')::numeric
          ELSE qty END,
        labor_hours = CASE WHEN v_line ? 'labor_hours'
          THEN nullif(v_line ->> 'labor_hours', '')::numeric
          ELSE labor_hours END,
        condition = CASE WHEN v_line ? 'condition'
          THEN v_line ->> 'condition'
          ELSE condition END,
        positions = CASE
          WHEN v_override_positions THEN v_kept_positions
          WHEN v_line ? 'positions' THEN
            CASE WHEN jsonb_typeof(v_line -> 'positions') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(v_line -> 'positions'))
              ELSE NULL
            END
          ELSE positions
        END,
        brand = CASE WHEN v_line ? 'brand'
          THEN v_line ->> 'brand'
          ELSE brand END,
        part_number = CASE WHEN v_line ? 'part_number'
          THEN v_line ->> 'part_number'
          ELSE part_number END,
        warranty = coalesce((v_line ->> 'warranty')::boolean, warranty),
        complimentary = coalesce((v_line ->> 'complimentary')::boolean, complimentary),
        part_id = CASE WHEN v_line ? 'part_id'
          THEN nullif(v_line ->> 'part_id', '')::uuid
          ELSE part_id END,
        supplier_part_offer_id = CASE WHEN v_line ? 'supplier_part_offer_id'
          THEN nullif(v_line ->> 'supplier_part_offer_id', '')::uuid
          ELSE supplier_part_offer_id END,
        notes = CASE WHEN v_line ? 'notes'
          THEN v_line ->> 'notes'
          ELSE notes END,
        recommended = coalesce((v_line ->> 'recommended')::boolean, recommended),
        declined = v_declined,
        values_json = CASE WHEN v_line ? 'values_json' THEN
          CASE WHEN jsonb_typeof(v_line -> 'values_json') = 'null' THEN NULL
          ELSE v_line -> 'values_json' END
        ELSE values_json END,
        items_amount = coalesce(nullif(v_line ->> 'items_amount', '')::numeric, 0),
        fit_at_log = CASE
          WHEN v_line ? 'component_id'
            AND nullif(v_line ->> 'component_id', '')::uuid IS DISTINCT FROM v_old_component
            THEN fleet._line_fit_at_log(
              v_vehicle_catalog_id,
              nullif(v_line ->> 'component_id', '')::uuid
            )
          ELSE fit_at_log
        END,
        -- The server sends database-shaped keys (from_found_line_id); camelCase is accepted too.
        from_found_line_id = CASE
          WHEN v_line ? 'from_found_line_id'
            THEN nullif(v_line ->> 'from_found_line_id', '')::uuid
          WHEN v_line ? 'fromFoundLineId'
            THEN nullif(v_line ->> 'fromFoundLineId', '')::uuid
          ELSE from_found_line_id END,
        line_total = CASE
          WHEN v_recommended THEN 0
          WHEN v_line ? 'line_total'
            THEN nullif(v_line ->> 'line_total', '')::numeric
          ELSE line_total END,
        unit_price = CASE
          WHEN v_recommended THEN NULL
          WHEN v_line ? 'unit_price'
            THEN nullif(v_line ->> 'unit_price', '')::numeric
          ELSE unit_price END,
        material = CASE
          WHEN v_recommended THEN NULL
          WHEN v_line ? 'material'
            THEN nullif(v_line ->> 'material', '')::numeric
          ELSE material END,
        labor_amount = CASE
          WHEN v_recommended THEN NULL
          WHEN v_line ? 'labor_amount'
            THEN nullif(v_line ->> 'labor_amount', '')::numeric
          ELSE labor_amount END,
        labor_rate = CASE
          WHEN v_recommended THEN NULL
          WHEN v_line ? 'labor_rate'
            THEN nullif(v_line ->> 'labor_rate', '')::numeric
          ELSE labor_rate END,
        updated_by = p_actor_id,
        updated_at = v_now
      WHERE id = v_line_id
        AND work_order_id = v_wo_id
        AND voided_at IS NULL;

      IF NOT FOUND THEN
        SELECT l.work_order_id, l.voided_at IS NOT NULL
        INTO v_other_wo, v_voided
        FROM public.maintenance_work_order_lines l
        WHERE l.id = v_line_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'line_work_order_mismatch' USING HINT = 'Line id is not part of this work order.';
        ELSIF v_other_wo IS DISTINCT FROM v_wo_id THEN
          RAISE EXCEPTION 'line_work_order_mismatch' USING HINT = 'Line belongs to another work order.';
        ELSIF v_voided THEN
          v_incoming_ids := array_append(v_incoming_ids, v_line_id);
          CONTINUE;
        ELSE
          RAISE EXCEPTION 'line_work_order_mismatch' USING HINT = 'Line could not be updated.';
        END IF;
      END IF;
    ELSE
      v_line_id := gen_random_uuid();
      INSERT INTO public.maintenance_work_order_lines (
        id,
        work_order_id,
        sort_order,
        system_id,
        component_id,
        system_code,
        system_name,
        component_code,
        component_name,
        action,
        qty,
        unit_price,
        material,
        labor_amount,
        labor_hours,
        labor_rate,
        condition,
        positions,
        brand,
        part_number,
        warranty,
        complimentary,
        part_id,
        supplier_part_offer_id,
        notes,
        recommended,
        declined,
        values_json,
        line_total,
        items_amount,
        fit_at_log,
        from_found_line_id,
        updated_by,
        updated_at
      ) VALUES (
        v_line_id,
        v_wo_id,
        coalesce((v_line ->> 'sort_order')::integer, 0),
        CASE WHEN v_line ? 'system_id'
          THEN nullif(v_line ->> 'system_id', '')::uuid END,
        CASE WHEN v_line ? 'component_id'
          THEN nullif(v_line ->> 'component_id', '')::uuid END,
        CASE WHEN v_line ? 'system_code' THEN v_line ->> 'system_code' END,
        CASE WHEN v_line ? 'system_name' THEN v_line ->> 'system_name' END,
        CASE WHEN v_line ? 'component_code' THEN v_line ->> 'component_code' END,
        coalesce(v_line ->> 'component_name', ''),
        coalesce(nullif(v_line ->> 'action', ''), 'other'),
        CASE WHEN v_line ? 'qty' THEN nullif(v_line ->> 'qty', '')::numeric END,
        CASE WHEN v_recommended THEN NULL
          WHEN v_line ? 'unit_price' THEN nullif(v_line ->> 'unit_price', '')::numeric END,
        CASE WHEN v_recommended THEN NULL
          WHEN v_line ? 'material' THEN nullif(v_line ->> 'material', '')::numeric END,
        CASE WHEN v_recommended THEN NULL
          WHEN v_line ? 'labor_amount' THEN nullif(v_line ->> 'labor_amount', '')::numeric END,
        CASE WHEN v_line ? 'labor_hours'
          THEN nullif(v_line ->> 'labor_hours', '')::numeric END,
        CASE WHEN v_recommended THEN NULL
          WHEN v_line ? 'labor_rate' THEN nullif(v_line ->> 'labor_rate', '')::numeric END,
        CASE WHEN v_line ? 'condition' THEN v_line ->> 'condition' END,
        CASE
          WHEN v_line ? 'positions' THEN
            CASE WHEN jsonb_typeof(v_line -> 'positions') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(v_line -> 'positions'))
              ELSE NULL
            END
          ELSE NULL
        END,
        CASE WHEN v_line ? 'brand' THEN v_line ->> 'brand' END,
        CASE WHEN v_line ? 'part_number' THEN v_line ->> 'part_number' END,
        coalesce((v_line ->> 'warranty')::boolean, false),
        coalesce((v_line ->> 'complimentary')::boolean, false),
        CASE WHEN v_line ? 'part_id'
          THEN nullif(v_line ->> 'part_id', '')::uuid END,
        CASE WHEN v_line ? 'supplier_part_offer_id'
          THEN nullif(v_line ->> 'supplier_part_offer_id', '')::uuid END,
        CASE WHEN v_line ? 'notes' THEN v_line ->> 'notes' END,
        coalesce((v_line ->> 'recommended')::boolean, false),
        v_declined,
        CASE WHEN v_line ? 'values_json' THEN
          CASE WHEN jsonb_typeof(v_line -> 'values_json') = 'null' THEN NULL
          ELSE v_line -> 'values_json' END
        ELSE '{}'::jsonb END,
        CASE WHEN v_recommended THEN 0
          ELSE coalesce(nullif(v_line ->> 'line_total', '')::numeric, 0) END,
        coalesce(nullif(v_line ->> 'items_amount', '')::numeric, 0),
        fleet._line_fit_at_log(
          v_vehicle_catalog_id,
          CASE WHEN v_line ? 'component_id'
            THEN nullif(v_line ->> 'component_id', '')::uuid
          END
        ),
        nullif(coalesce(v_line ->> 'from_found_line_id', v_line ->> 'fromFoundLineId'), '')::uuid,
        p_actor_id,
        v_now
      );
    END IF;

    v_incoming_ids := array_append(v_incoming_ids, v_line_id);

    IF NOT fleet._mwoli_items_multiset_equal(v_line_id, v_items) THEN
      DELETE FROM public.maintenance_work_order_line_item
      WHERE work_order_line_id = v_line_id;

      FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
      LOOP
        INSERT INTO public.maintenance_work_order_line_item (
          work_order_id,
          work_order_line_id,
          source,
          job_item_id,
          item_kind,
          part_type_id,
          supply_id,
          part_id,
          item_name,
          unit_label,
          brand,
          part_number,
          part_source,
          qty,
          unit_cost,
          updated_by
        ) VALUES (
          v_wo_id,
          v_line_id,
          v_item ->> 'source',
          nullif(v_item ->> 'job_item_id', '')::uuid,
          v_item ->> 'item_kind',
          nullif(v_item ->> 'part_type_id', '')::uuid,
          nullif(v_item ->> 'supply_id', '')::uuid,
          nullif(v_item ->> 'part_id', '')::uuid,
          coalesce(v_item ->> 'item_name', ''),
          coalesce(v_item ->> 'unit_label', ''),
          nullif(v_item ->> 'brand', ''),
          nullif(v_item ->> 'part_number', ''),
          nullif(btrim(v_item ->> 'part_source'), ''),
          (v_item ->> 'qty')::numeric(12, 3),
          CASE
            WHEN v_item ? 'unit_cost'
              AND v_item ->> 'unit_cost' IS NOT NULL
              AND btrim(v_item ->> 'unit_cost') <> ''
              THEN (v_item ->> 'unit_cost')::numeric(12, 2)
            ELSE NULL
          END,
          p_actor_id
        );
      END LOOP;
    END IF;

    v_expected_items := coalesce(nullif(v_line ->> 'items_amount', '')::numeric, 0);
    SELECT coalesce(sum(i.amount), 0) INTO v_actual_items
    FROM public.maintenance_work_order_line_item i
    WHERE i.work_order_line_id = v_line_id;
    IF round(v_expected_items, 2) IS DISTINCT FROM round(v_actual_items, 2) THEN
      RAISE EXCEPTION 'line_items_amount_mismatch' USING HINT = 'items_amount does not match item rows.';
    END IF;

    UPDATE public.maintenance_work_order_lines
    SET items_amount = round(v_actual_items, 2)
    WHERE id = v_line_id;
  END LOOP;

  DELETE FROM public.maintenance_work_order_lines l
  WHERE l.work_order_id = v_wo_id
    AND l.voided_at IS NULL
    AND NOT (l.id = ANY (v_incoming_ids));

  SELECT coalesce(sum(l.line_total), 0)
  INTO v_line_sum
  FROM public.maintenance_work_order_lines l
  WHERE l.work_order_id = v_wo_id
    AND l.voided_at IS NULL
    AND coalesce(l.recommended, false) = false;

  SELECT w.discount_amount INTO v_discount
  FROM public.maintenance_work_orders w
  WHERE w.id = v_wo_id;

  v_new_total := round(v_line_sum - coalesce(v_discount, 0), 2);

  UPDATE public.maintenance_work_orders
  SET total_cost = v_new_total,
      updated_by = p_actor_id
  WHERE id = v_wo_id;

  RETURN jsonb_build_object(
    'work_order',
    (SELECT to_jsonb(w) FROM public.maintenance_work_orders w WHERE w.id = v_wo_id),
    'lines',
    (
      SELECT coalesce(jsonb_agg(
        to_jsonb(l) || jsonb_build_object(
          'items',
          coalesce((
            SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at, i.id)
            FROM public.maintenance_work_order_line_item i
            WHERE i.work_order_line_id = l.id
          ), '[]'::jsonb)
        )
        ORDER BY l.sort_order, l.created_at
      ), '[]'::jsonb)
      FROM public.maintenance_work_order_lines l
      WHERE l.work_order_id = v_wo_id
        AND l.voided_at IS NULL
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_save_work_order(
  text, uuid, text, jsonb, uuid, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_save_work_order(
  text, uuid, text, jsonb, uuid, integer, jsonb
) TO service_role;
