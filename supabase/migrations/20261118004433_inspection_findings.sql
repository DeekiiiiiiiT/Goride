-- Inspection findings D1 (IF-1, IF-4..IF-10)

ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS records_findings boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.maintenance_service_categories.records_findings IS
  'Job is an inspection: Log service shows ''What the inspection found''.';

UPDATE public.maintenance_service_categories
SET records_findings = true
WHERE code IN (
  'inspection_diagnostic_fee',
  'leak_inspection',
  'exhaust_inspection',
  'hv_insulation_inspection',
  'ev_charging_port_cleaning'
);

ALTER TABLE public.maintenance_work_order_lines
  ADD COLUMN IF NOT EXISTS from_found_line_id uuid REFERENCES public.maintenance_work_order_lines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS closed_by uuid;

COMMENT ON COLUMN public.maintenance_work_order_lines.from_found_line_id IS
  'On a job that was done, points to the found job it closes.';
COMMENT ON COLUMN public.maintenance_work_order_lines.closed_at IS
  'When a found job was closed (not needed or service deleted).';
COMMENT ON COLUMN public.maintenance_work_order_lines.closed_reason IS
  'not_needed or service_deleted.';
COMMENT ON COLUMN public.maintenance_work_order_lines.closed_by IS
  'User who marked not needed.';

ALTER TABLE public.maintenance_work_order_lines
  DROP CONSTRAINT IF EXISTS maintenance_work_order_lines_closed_reason_check,
  DROP CONSTRAINT IF EXISTS maintenance_work_order_lines_closed_at_recommended_check,
  DROP CONSTRAINT IF EXISTS maintenance_work_order_lines_closed_pair_check,
  DROP CONSTRAINT IF EXISTS maintenance_work_order_lines_from_found_recommended_check,
  DROP CONSTRAINT IF EXISTS maintenance_work_order_lines_from_found_not_self_check;

ALTER TABLE public.maintenance_work_order_lines
  ADD CONSTRAINT maintenance_work_order_lines_closed_reason_check
    CHECK (closed_reason IS NULL OR closed_reason IN ('not_needed', 'service_deleted')),
  ADD CONSTRAINT maintenance_work_order_lines_closed_at_recommended_check
    CHECK (closed_at IS NULL OR recommended = true),
  ADD CONSTRAINT maintenance_work_order_lines_closed_pair_check
    CHECK ((closed_at IS NULL) = (closed_reason IS NULL)),
  ADD CONSTRAINT maintenance_work_order_lines_from_found_recommended_check
    CHECK (from_found_line_id IS NULL OR recommended = false),
  ADD CONSTRAINT maintenance_work_order_lines_from_found_not_self_check
    CHECK (from_found_line_id IS DISTINCT FROM id);

DROP INDEX IF EXISTS idx_mwol_from_found_line_live;

-- IF-18: not unique (a line on a voided service may still point at the found job); the link guard
-- enforces "one live child". This index keeps that check and the open/done lookups from scanning all lines.
CREATE INDEX IF NOT EXISTS idx_mwol_from_found_line
  ON public.maintenance_work_order_lines (from_found_line_id)
  WHERE from_found_line_id IS NOT NULL AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mwol_work_order_recommended_live
  ON public.maintenance_work_order_lines (work_order_id)
  WHERE recommended = true AND voided_at IS NULL;

CREATE OR REPLACE FUNCTION public.maintenance_found_line_is_open(p_line_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((
    SELECT
      l.recommended = true
      AND l.declined = false
      AND l.closed_at IS NULL
      AND l.voided_at IS NULL
      AND wo.status = 'completed'
      AND wo.voided_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.maintenance_work_order_lines cl
        JOIN public.maintenance_work_orders cwo ON cwo.id = cl.work_order_id
        WHERE cl.from_found_line_id = p_line_id
          AND cl.voided_at IS NULL
          AND cwo.voided_at IS NULL
          AND cwo.status = 'completed'
      )
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE l.id = p_line_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.maintenance_found_line_is_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_found_line_is_open(uuid) TO service_role;

CREATE OR REPLACE FUNCTION fleet.trg_found_line_link_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_new_org text;
  v_new_vehicle text;
  v_found_org text;
  v_found_vehicle text;
BEGIN
  IF NEW.from_found_line_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.from_found_line_id IS NOT DISTINCT FROM OLD.from_found_line_id THEN
    RETURN NEW;
  END IF;
  PERFORM 1
  FROM public.maintenance_work_order_lines
  WHERE id = NEW.from_found_line_id
  FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM public.maintenance_work_order_lines cl
    JOIN public.maintenance_work_orders cwo ON cwo.id = cl.work_order_id
    WHERE cl.from_found_line_id = NEW.from_found_line_id
      AND cl.voided_at IS NULL
      AND cwo.voided_at IS NULL
      AND cl.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'found_line_not_open'
      USING HINT = 'This found job is already closed or no longer exists.';
  END IF;
  IF NOT coalesce(public.maintenance_found_line_is_open(NEW.from_found_line_id), false) THEN
    RAISE EXCEPTION 'found_line_not_open'
      USING HINT = 'This found job is already closed or no longer exists.';
  END IF;
  SELECT wo.organization_id, wo.vehicle_id
  INTO v_new_org, v_new_vehicle
  FROM public.maintenance_work_orders wo
  WHERE wo.id = NEW.work_order_id;
  SELECT wo.organization_id, wo.vehicle_id
  INTO v_found_org, v_found_vehicle
  FROM public.maintenance_work_order_lines fl
  JOIN public.maintenance_work_orders wo ON wo.id = fl.work_order_id
  WHERE fl.id = NEW.from_found_line_id;
  IF v_new_org IS DISTINCT FROM v_found_org OR v_new_vehicle IS DISTINCT FROM v_found_vehicle THEN
    RAISE EXCEPTION 'found_line_wrong_car'
      USING HINT = 'That found job belongs to a different car.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_found_line_link_guard ON public.maintenance_work_order_lines;
CREATE TRIGGER trg_found_line_link_guard
  BEFORE INSERT OR UPDATE OF from_found_line_id ON public.maintenance_work_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION fleet.trg_found_line_link_guard();


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
    IF v_line_id IS NOT NULL THEN
      SELECT l.component_id INTO v_old_component
      FROM public.maintenance_work_order_lines l
      WHERE l.id = v_line_id;

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


CREATE OR REPLACE FUNCTION fleet.guard_completed_maintenance_wo_line()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status text;
  v_voided timestamptz;
BEGIN
  IF current_setting('fleet.legacy_repair', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT status, voided_at INTO v_status, v_voided
  FROM public.maintenance_work_orders
  WHERE id = COALESCE(NEW.work_order_id, OLD.work_order_id);

  IF v_status = 'completed' AND v_voided IS NULL THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
         AND (to_jsonb(NEW) - ARRAY['voided_at', 'void_reason', 'updated_at', 'updated_by'])
           = (to_jsonb(OLD) - ARRAY['voided_at', 'void_reason', 'updated_at', 'updated_by']) THEN
        RETURN NEW;
      END IF;
      IF OLD.recommended = true
         AND OLD.declined = false AND NEW.declined = true
         AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND NEW.closed_reason IS NOT NULL
         AND (to_jsonb(NEW) - ARRAY['declined', 'closed_at', 'closed_reason', 'closed_by', 'updated_at', 'updated_by'])
           = (to_jsonb(OLD) - ARRAY['declined', 'closed_at', 'closed_reason', 'closed_by', 'updated_at', 'updated_by']) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'completed work order lines cannot be edited';
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'completed work order lines cannot be deleted';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION fleet.trg_close_found_on_service_void()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    UPDATE public.maintenance_work_order_lines l
    SET
      closed_at = now(),
      closed_reason = 'service_deleted',
      declined = true,
      updated_at = now()
    WHERE l.work_order_id = NEW.id
      AND l.recommended = true
      AND l.declined = false
      AND l.closed_at IS NULL
      AND l.voided_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_close_found_on_service_void ON public.maintenance_work_orders;
CREATE TRIGGER trg_close_found_on_service_void
  AFTER UPDATE OF voided_at ON public.maintenance_work_orders
  FOR EACH ROW
  EXECUTE FUNCTION fleet.trg_close_found_on_service_void();


CREATE OR REPLACE FUNCTION public.fleet_open_found_work(
  p_organization_id text,
  p_vehicle_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x."foundDate", x."lineId"), '[]'::jsonb)
  FROM (
    SELECT
      l.id AS "lineId",
      wo.id AS "workOrderId",
      wo.vehicle_id AS "vehicleId",
      l.component_id AS "jobId",
      l.component_name AS "jobName",
      l.system_name AS "systemName",
      l.notes AS "note",
      coalesce(
        wo.performed_at_date,
        (wo.opened_at AT TIME ZONE 'UTC')::date
      ) AS "foundDate",
      greatest(
        0,
        (current_date - coalesce(
          wo.performed_at_date,
          (wo.opened_at AT TIME ZONE 'UTC')::date
        ))
      )::integer AS "daysWaiting",
      wo.provider AS "garage",
      (
        SELECT il.component_name
        FROM public.maintenance_work_order_lines il
        JOIN public.maintenance_service_categories c ON c.id = il.component_id
        WHERE il.work_order_id = wo.id
          AND il.voided_at IS NULL
          AND c.records_findings = true
        ORDER BY il.sort_order, il.created_at, il.id
        LIMIT 1
      ) AS "inspectionJobName"
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE wo.organization_id = p_organization_id
      AND (p_vehicle_id IS NULL OR wo.vehicle_id = p_vehicle_id)
      -- Cheap filter first (uses idx_mwol_work_order_recommended_live), then the full open check.
      AND l.recommended = true
      AND l.voided_at IS NULL
      AND public.maintenance_found_line_is_open(l.id)
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.fleet_found_work_counts(p_organization_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH open_lines AS (
    SELECT
      l.id,
      wo.vehicle_id,
      greatest(
        0,
        (current_date - coalesce(
          wo.performed_at_date,
          (wo.opened_at AT TIME ZONE 'UTC')::date
        ))
      )::integer AS days_waiting
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE wo.organization_id = p_organization_id
      AND l.recommended = true
      AND l.voided_at IS NULL
      AND public.maintenance_found_line_is_open(l.id)
  ),
  by_vehicle AS (
    SELECT vehicle_id, count(*)::integer AS n
    FROM open_lines
    GROUP BY vehicle_id
  )
  SELECT jsonb_build_object(
    'total', coalesce((SELECT count(*)::integer FROM open_lines), 0),
    'cars', coalesce((SELECT count(DISTINCT vehicle_id)::integer FROM open_lines), 0),
    'oldestDays', (SELECT max(days_waiting) FROM open_lines),
    'byVehicle', coalesce(
      (SELECT jsonb_object_agg(vehicle_id, n) FROM by_vehicle),
      '{}'::jsonb
    ),
    'oldestVehicleId', (
      SELECT ol.vehicle_id
      FROM open_lines ol
      ORDER BY ol.days_waiting DESC, ol.vehicle_id
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.fleet_close_found_work(
  p_organization_id text,
  p_actor_id uuid,
  p_line_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_line public.maintenance_work_order_lines%ROWTYPE;
  v_wo public.maintenance_work_orders%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;

  SELECT * INTO v_line
  FROM public.maintenance_work_order_lines
  WHERE id = p_line_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'found_line_not_found';
  END IF;

  SELECT * INTO v_wo
  FROM public.maintenance_work_orders
  WHERE id = v_line.work_order_id;

  IF v_wo.organization_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'found_line_not_found';
  END IF;

  IF NOT public.maintenance_found_line_is_open(p_line_id) THEN
    RAISE EXCEPTION 'found_line_not_open'
      USING HINT = 'Someone else already closed this job.';
  END IF;

  UPDATE public.maintenance_work_order_lines
  SET
    declined = true,
    closed_at = v_now,
    closed_reason = 'not_needed',
    closed_by = p_actor_id,
    updated_at = v_now
  WHERE id = p_line_id;

  RETURN jsonb_build_object(
    'lineId', p_line_id,
    'workOrderId', v_wo.id,
    'vehicleId', v_wo.vehicle_id,
    'closedAt', v_now
  );
END;
$function$;

-- IF-11: skip found (recommended) lines like declined lines
CREATE OR REPLACE FUNCTION "public"."apply_parts_usage_for_work_order"("p_work_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
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
    WHERE work_order_id = p_work_order_id AND declined IS NOT TRUE AND recommended IS NOT TRUE
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
          AND prev.recommended IS NOT TRUE
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
          WHERE l.id = u.line_id AND l.work_order_id = wo.id AND l.declined IS NOT TRUE AND l.recommended IS NOT TRUE
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

REVOKE ALL ON FUNCTION "public"."apply_parts_usage_for_work_order"("p_work_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_parts_usage_for_work_order"("p_work_order_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."backfill_work_order_part_links"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
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
      AND l.recommended IS NOT TRUE
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

REVOKE ALL ON FUNCTION "public"."backfill_work_order_part_links"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backfill_work_order_part_links"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."refresh_repeat_part_alerts"("p_km" integer DEFAULT 10000, "p_days" integer DEFAULT 90, "p_vehicle_id" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql"
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
      AND l.recommended IS NOT TRUE
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

REVOKE ALL ON FUNCTION "public"."refresh_repeat_part_alerts"("p_km" integer, "p_days" integer, "p_vehicle_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_repeat_part_alerts"("p_km" integer, "p_days" integer, "p_vehicle_id" "text") TO "service_role";

REVOKE ALL ON FUNCTION public.fleet_open_found_work(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_open_found_work(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.fleet_found_work_counts(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_found_work_counts(text) TO service_role;

REVOKE ALL ON FUNCTION public.fleet_close_found_work(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_close_found_work(text, uuid, uuid) TO service_role;

-- IF-16: Service history lists only work that was done. Found ("not done yet") lines are J$ 0 and
-- show in the service's "What the inspection found" section instead (gate 1: never in history).
-- Same columns as 20261115222336_powertrain_job_fit_schedules.sql; only the WHERE changes.
CREATE OR REPLACE VIEW fleet.maintenance_service_history_v AS
 SELECT l.id AS line_id,
    wo.organization_id,
    wo.vehicle_id,
    wo.id AS work_order_id,
    wo.log_number,
    wo.performed_at_date,
    wo.odometer AS performed_at_miles,
    wo.provider,
    wo.currency,
    wo.invoice_url,
    wo.voided_at,
    l.component_id AS category_id,
    l.component_code AS category_code,
    l.component_name AS category_name,
    l.action,
    l.positions,
    l.part_number,
    l.brand,
    l.material,
    l.line_total,
    l.values_json,
    wo.closed_at AS completed_at,
    wo.discount_amount,
    l.fit_at_log,
    j.is_high_voltage
   FROM public.maintenance_work_order_lines l
     JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
     LEFT JOIN public.maintenance_service_categories j ON j.id = l.component_id
  WHERE wo.status = 'completed'::text AND wo.voided_at IS NULL AND l.voided_at IS NULL
    AND l.recommended IS NOT TRUE;

NOTIFY pgrst, 'reload schema';
