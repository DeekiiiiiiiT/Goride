-- Go-live step: paste ALL of this into the Supabase SQL editor (live project) and press Run.
-- Source: supabase/migrations/20261113171047_service_items_logging_core.sql

-- Service items Round D2 — line items, save/claim/finish RPCs, guard, records, ledger, integrity.

-- =============================================================================
-- (a) Line money + composite key for items FK
-- =============================================================================
ALTER TABLE public.maintenance_work_order_lines
  ADD COLUMN IF NOT EXISTS items_amount numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.maintenance_work_order_lines
  DROP CONSTRAINT IF EXISTS maintenance_work_order_lines_wo_id_key;

ALTER TABLE public.maintenance_work_order_lines
  ADD CONSTRAINT maintenance_work_order_lines_wo_id_key UNIQUE (work_order_id, id);

-- =============================================================================
-- (b) maintenance_work_order_line_item
-- =============================================================================
CREATE TABLE public.maintenance_work_order_line_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL,
  work_order_line_id uuid NOT NULL,
  source text NOT NULL,
  job_item_id uuid REFERENCES public.maintenance_job_item (id) ON DELETE RESTRICT,
  item_kind text NOT NULL,
  part_type_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE RESTRICT,
  supply_id uuid REFERENCES public.maintenance_supply (id) ON DELETE RESTRICT,
  part_id uuid REFERENCES public.part_master (id) ON DELETE RESTRICT,
  item_name text NOT NULL,
  unit_label text NOT NULL,
  brand text,
  part_number text,
  qty numeric(12, 3) NOT NULL,
  unit_cost numeric(12, 2),
  amount numeric(12, 2) GENERATED ALWAYS AS (round(qty * coalesce(unit_cost, 0), 2)) STORED,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_work_order_line_item_line_fkey
    FOREIGN KEY (work_order_id, work_order_line_id)
    REFERENCES public.maintenance_work_order_lines (work_order_id, id) ON DELETE CASCADE,
  CONSTRAINT maintenance_work_order_line_item_qty_check CHECK (qty > 0),
  CONSTRAINT maintenance_work_order_line_item_unit_cost_check
    CHECK (unit_cost IS NULL OR unit_cost >= 0),
  CONSTRAINT maintenance_work_order_line_item_source_check
    CHECK (source IN ('suggested', 'other')),
  CONSTRAINT maintenance_work_order_line_item_kind_check
    CHECK (item_kind IN ('part_type', 'supply', 'other')),
  CONSTRAINT maintenance_work_order_line_item_source_other_check
    CHECK ((source = 'other') = (item_kind = 'other')),
  CONSTRAINT maintenance_work_order_line_item_kind_ids_check CHECK (
    (
      item_kind = 'part_type'
      AND part_type_id IS NOT NULL
      AND supply_id IS NULL
    )
    OR (
      item_kind = 'supply'
      AND supply_id IS NOT NULL
      AND part_type_id IS NULL
    )
    OR (
      item_kind = 'other'
      AND part_type_id IS NULL
      AND supply_id IS NULL
    )
  ),
  CONSTRAINT maintenance_work_order_line_item_job_item_check
    CHECK ((job_item_id IS NOT NULL) = (source = 'suggested')),
  CONSTRAINT maintenance_work_order_line_item_part_id_kind_check
    CHECK (part_id IS NULL OR item_kind = 'part_type'),
  CONSTRAINT maintenance_work_order_line_item_part_number_kind_check
    CHECK (part_number IS NULL OR item_kind = 'part_type')
);

CREATE INDEX maintenance_work_order_line_item_work_order_id_idx
  ON public.maintenance_work_order_line_item (work_order_id);

CREATE INDEX maintenance_work_order_line_item_work_order_line_id_idx
  ON public.maintenance_work_order_line_item (work_order_line_id);

CREATE INDEX maintenance_work_order_line_item_job_item_id_idx
  ON public.maintenance_work_order_line_item (job_item_id)
  WHERE job_item_id IS NOT NULL;

CREATE INDEX maintenance_work_order_line_item_part_type_id_idx
  ON public.maintenance_work_order_line_item (part_type_id)
  WHERE part_type_id IS NOT NULL;

CREATE INDEX maintenance_work_order_line_item_supply_id_idx
  ON public.maintenance_work_order_line_item (supply_id)
  WHERE supply_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fleet.trg_line_item_part_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_comp uuid;
BEGIN
  IF NEW.part_id IS NOT NULL THEN
    SELECT pm.maintenance_component_id INTO v_comp
    FROM public.part_master pm
    WHERE pm.id = NEW.part_id;
    IF v_comp IS DISTINCT FROM NEW.part_type_id THEN
      RAISE EXCEPTION 'line_item_part_mismatch'
        USING HINT = 'part_master.maintenance_component_id must equal part_type_id.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mwoli_part_mismatch
  BEFORE INSERT OR UPDATE ON public.maintenance_work_order_line_item
  FOR EACH ROW
  EXECUTE FUNCTION fleet.trg_line_item_part_mismatch();

ALTER TABLE public.maintenance_work_order_line_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mwoli_no_direct ON public.maintenance_work_order_line_item;
CREATE POLICY mwoli_no_direct
  ON public.maintenance_work_order_line_item
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.maintenance_work_order_line_item FROM anon, authenticated;
GRANT ALL ON public.maintenance_work_order_line_item TO service_role;

DROP TRIGGER IF EXISTS trg_mwoli_audit ON public.maintenance_work_order_line_item;
CREATE TRIGGER trg_mwoli_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_work_order_line_item
  FOR EACH ROW
  EXECUTE FUNCTION fleet.maintenance_audit_log_trigger_fn();

-- =============================================================================
-- (c) Work order version + completion claim + combined guard
-- =============================================================================
ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completing_since timestamptz;

CREATE OR REPLACE FUNCTION fleet.guard_maintenance_wo()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_active_total numeric;
BEGIN
  IF current_setting('fleet.legacy_repair', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'completed' THEN
    IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
      NEW.version := OLD.version + 1;
      NEW.updated_at := now();
      RETURN NEW;
    END IF;
    IF (NEW.total_cost IS DISTINCT FROM OLD.total_cost
        OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount)
       AND (to_jsonb(NEW) - ARRAY[
         'total_cost', 'discount_amount', 'updated_at', 'version', 'completing_since'
       ]) = (to_jsonb(OLD) - ARRAY[
         'total_cost', 'discount_amount', 'updated_at', 'version', 'completing_since'
       ]) THEN
      SELECT coalesce(sum(l.line_total), 0) INTO v_active_total
      FROM public.maintenance_work_order_lines l
      WHERE l.work_order_id = NEW.id AND l.voided_at IS NULL;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
         AND NEW.discount_amount > OLD.discount_amount THEN
        RAISE EXCEPTION 'completed work orders cannot be edited';
      END IF;
      IF round(coalesce(NEW.total_cost, 0), 2)
         = round(v_active_total - coalesce(NEW.discount_amount, 0), 2) THEN
        NEW.version := OLD.version + 1;
        NEW.updated_at := now();
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'completed work orders cannot be edited';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    RAISE EXCEPTION 'completed work orders cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_mwo_immutable ON public.maintenance_work_orders;
DROP TRIGGER IF EXISTS trg_mwo_guard ON public.maintenance_work_orders;
CREATE TRIGGER trg_mwo_guard
  BEFORE UPDATE OR DELETE ON public.maintenance_work_orders
  FOR EACH ROW
  EXECUTE FUNCTION fleet.guard_maintenance_wo();

-- =============================================================================
-- (d) Audit actor — app.actor_id first
-- =============================================================================
CREATE OR REPLACE FUNCTION fleet.maintenance_audit_log_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_actor uuid;
  v_reason text;
  v_row jsonb;
  v_org text;
BEGIN
  v_row := to_jsonb(coalesce(NEW, OLD));
  v_org := nullif(v_row ->> 'organization_id', '');
  IF v_org IS NULL AND nullif(v_row ->> 'work_order_id', '') IS NOT NULL THEN
    SELECT wo.organization_id INTO v_org
    FROM public.maintenance_work_orders wo
    WHERE wo.id = (v_row ->> 'work_order_id')::uuid;
  END IF;
  v_actor := coalesce(
    nullif(current_setting('app.actor_id', true), '')::uuid,
    nullif(v_row ->> 'updated_by', '')::uuid,
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
  v_reason := coalesce(
    v_row ->> 'cancel_reason',
    v_row ->> 'void_reason',
    TG_ARGV[0]
  );
  INSERT INTO fleet.maintenance_audit_log (
    organization_id,
    entity_type,
    entity_id,
    actor_id,
    reason,
    before_json,
    after_json
  ) VALUES (
    v_org,
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id)::text,
    v_actor,
    v_reason,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE '{}'::jsonb END
  );
  RETURN coalesce(NEW, OLD);
END;
$$;

-- =============================================================================
-- (e) maintenance_records.work_order_id + backfill
-- =============================================================================
ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS work_order_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_records_work_order_id_uidx
  ON public.maintenance_records (work_order_id)
  WHERE work_order_id IS NOT NULL;

DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT wo.id AS work_order_id, wo.maintenance_record_id AS record_id
    FROM public.maintenance_work_orders wo
    WHERE wo.maintenance_record_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.maintenance_records r
      WHERE r.work_order_id = v_row.work_order_id
        AND r.id IS DISTINCT FROM v_row.record_id
    ) OR EXISTS (
      SELECT 1
      FROM public.maintenance_work_orders wo2
      WHERE wo2.maintenance_record_id = v_row.record_id
        AND wo2.id IS DISTINCT FROM v_row.work_order_id
    ) THEN
      RAISE NOTICE 'records backfill conflict wo=% record=%', v_row.work_order_id, v_row.record_id;
      RAISE EXCEPTION 'records_backfill_conflict';
    END IF;
  END LOOP;

  UPDATE public.maintenance_records r
  SET work_order_id = wo.id,
      updated_at = now()
  FROM public.maintenance_work_orders wo
  WHERE wo.maintenance_record_id = r.id
    AND r.work_order_id IS NULL;

  FOR v_row IN
    SELECT r.id AS record_id, wo.id AS work_order_id
    FROM public.maintenance_records r
    JOIN public.maintenance_work_orders wo
      ON wo.id = (r.payload_json ->> 'workOrderId')::uuid
    WHERE r.work_order_id IS NULL
      AND nullif(r.payload_json ->> 'workOrderId', '') ~* '^[0-9a-f-]{36}$'
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.maintenance_records r2
      WHERE r2.work_order_id = v_row.work_order_id
        AND r2.id IS DISTINCT FROM v_row.record_id
    ) OR EXISTS (
      SELECT 1 FROM public.maintenance_work_orders wo2
      WHERE wo2.maintenance_record_id = v_row.record_id
        AND wo2.id IS DISTINCT FROM v_row.work_order_id
    ) THEN
      RAISE NOTICE 'records backfill conflict wo=% record=%', v_row.work_order_id, v_row.record_id;
      RAISE EXCEPTION 'records_backfill_conflict';
    END IF;
    UPDATE public.maintenance_records
    SET work_order_id = v_row.work_order_id,
        updated_at = now()
    WHERE id = v_row.record_id;
  END LOOP;
END;
$$;

-- Reverse direction: work orders missing maintenance_record_id while record has work_order_id
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT wo.id AS work_order_id, r.id AS record_id
    FROM public.maintenance_work_orders wo
    JOIN public.maintenance_records r ON r.work_order_id = wo.id
    WHERE wo.maintenance_record_id IS NULL
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.maintenance_work_orders wo2
      WHERE wo2.maintenance_record_id = v_row.record_id
        AND wo2.id IS DISTINCT FROM v_row.work_order_id
    ) THEN
      RAISE NOTICE 'record_link_conflict wo=% record=%', v_row.work_order_id, v_row.record_id;
      RAISE EXCEPTION 'record_link_conflict';
    END IF;
  END LOOP;

  PERFORM set_config('fleet.legacy_repair', 'on', true);
  UPDATE public.maintenance_work_orders wo
  SET maintenance_record_id = r.id,
      updated_at = now()
  FROM public.maintenance_records r
  WHERE r.work_order_id = wo.id
    AND wo.maintenance_record_id IS NULL;
  PERFORM set_config('fleet.legacy_repair', 'off', true);
END;
$$;

-- =============================================================================
-- (f) Service ledger dedupe
-- =============================================================================
ALTER TABLE public.maintenance_service_ledger
  DROP CONSTRAINT IF EXISTS maintenance_service_ledger_position_not_blank;

ALTER TABLE public.maintenance_service_ledger
  ADD CONSTRAINT maintenance_service_ledger_position_not_blank
  CHECK (position IS NULL OR position <> '');

DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
  SELECT work_order_line_id, coalesce(position, '') AS pos_key, count(*) AS n
    FROM public.maintenance_service_ledger
    WHERE work_order_line_id IS NOT NULL
      AND voided_at IS NULL
    GROUP BY work_order_line_id, coalesce(position, '')
    HAVING count(*) > 1
  LOOP
    RAISE NOTICE 'ledger duplicate line=% position=% count=%',
      v_row.work_order_line_id, v_row.pos_key, v_row.n;
    RAISE EXCEPTION 'ledger_duplicates_found';
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_service_ledger_line_position_live
  ON public.maintenance_service_ledger (work_order_line_id, coalesce(position, ''))
  WHERE work_order_line_id IS NOT NULL AND voided_at IS NULL;

-- =============================================================================
-- (g) Save / claim / finish / release
-- =============================================================================
CREATE OR REPLACE FUNCTION fleet._mwoli_items_multiset_equal(p_line_id uuid, p_items jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH wanted AS (
    SELECT
      nullif(btrim(elem ->> 'source'), '') AS source,
      nullif(elem ->> 'job_item_id', '')::uuid AS job_item_id,
      nullif(btrim(elem ->> 'item_kind'), '') AS item_kind,
      nullif(elem ->> 'part_type_id', '')::uuid AS part_type_id,
      nullif(elem ->> 'supply_id', '')::uuid AS supply_id,
      nullif(elem ->> 'part_id', '')::uuid AS part_id,
      coalesce(elem ->> 'item_name', '') AS item_name,
      coalesce(elem ->> 'unit_label', '') AS unit_label,
      nullif(elem ->> 'brand', '') AS brand,
      nullif(elem ->> 'part_number', '') AS part_number,
      (elem ->> 'qty')::numeric(12, 3) AS qty,
      CASE
        WHEN elem ? 'unit_cost' AND (elem ->> 'unit_cost') IS NOT NULL AND btrim(elem ->> 'unit_cost') <> ''
          THEN (elem ->> 'unit_cost')::numeric(12, 2)
        ELSE NULL::numeric(12, 2)
      END AS unit_cost
    FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) AS elem
  ),
  have AS (
    SELECT
      i.source,
      i.job_item_id,
      i.item_kind,
      i.part_type_id,
      i.supply_id,
      i.part_id,
      i.item_name,
      i.unit_label,
      i.brand,
      i.part_number,
      i.qty,
      i.unit_cost
    FROM public.maintenance_work_order_line_item i
    WHERE i.work_order_line_id = p_line_id
  ),
  diff AS (
    (SELECT * FROM wanted EXCEPT ALL SELECT * FROM have)
    UNION ALL
    (SELECT * FROM have EXCEPT ALL SELECT * FROM wanted)
  )
  SELECT NOT EXISTS (SELECT 1 FROM diff);
$$;

REVOKE ALL ON FUNCTION fleet._mwoli_items_multiset_equal(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet._mwoli_items_multiset_equal(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION fleet.trg_line_item_part_mismatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.trg_line_item_part_mismatch() TO service_role;

REVOKE ALL ON FUNCTION fleet.guard_maintenance_wo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.guard_maintenance_wo() TO service_role;

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
        unit_price = CASE WHEN v_line ? 'unit_price'
          THEN nullif(v_line ->> 'unit_price', '')::numeric
          ELSE unit_price END,
        material = CASE WHEN v_line ? 'material'
          THEN nullif(v_line ->> 'material', '')::numeric
          ELSE material END,
        labor_amount = CASE WHEN v_line ? 'labor_amount'
          THEN nullif(v_line ->> 'labor_amount', '')::numeric
          ELSE labor_amount END,
        labor_hours = CASE WHEN v_line ? 'labor_hours'
          THEN nullif(v_line ->> 'labor_hours', '')::numeric
          ELSE labor_hours END,
        labor_rate = CASE WHEN v_line ? 'labor_rate'
          THEN nullif(v_line ->> 'labor_rate', '')::numeric
          ELSE labor_rate END,
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
        line_total = CASE WHEN v_line ? 'line_total'
          THEN nullif(v_line ->> 'line_total', '')::numeric
          ELSE line_total END,
        items_amount = coalesce(nullif(v_line ->> 'items_amount', '')::numeric, 0),
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
        CASE WHEN v_line ? 'unit_price'
          THEN nullif(v_line ->> 'unit_price', '')::numeric END,
        CASE WHEN v_line ? 'material'
          THEN nullif(v_line ->> 'material', '')::numeric END,
        CASE WHEN v_line ? 'labor_amount'
          THEN nullif(v_line ->> 'labor_amount', '')::numeric END,
        CASE WHEN v_line ? 'labor_hours'
          THEN nullif(v_line ->> 'labor_hours', '')::numeric END,
        CASE WHEN v_line ? 'labor_rate'
          THEN nullif(v_line ->> 'labor_rate', '')::numeric END,
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
        coalesce(nullif(v_line ->> 'line_total', '')::numeric, 0),
        coalesce(nullif(v_line ->> 'items_amount', '')::numeric, 0),
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
    AND l.voided_at IS NULL;

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

CREATE OR REPLACE FUNCTION public.fleet_claim_completion(
  p_organization_id text,
  p_work_order_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row public.maintenance_work_orders%ROWTYPE;
BEGIN
  IF p_actor_id IS NOT NULL THEN
    PERFORM set_config('app.actor_id', p_actor_id::text, true);
  END IF;

  UPDATE public.maintenance_work_orders
  SET
    completing_since = now(),
    updated_by = coalesce(p_actor_id, updated_by)
  WHERE id = p_work_order_id
    AND organization_id = p_organization_id
    AND status = 'in_progress'
    AND (
      completing_since IS NULL
      OR completing_since < now() - interval '10 minutes'
    )
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object('claimed', true, 'version', v_row.version);
  END IF;

  SELECT * INTO v_row
  FROM public.maintenance_work_orders
  WHERE id = p_work_order_id;

  IF NOT FOUND OR v_row.organization_id IS DISTINCT FROM p_organization_id THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  IF v_row.status = 'completed' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'completed');
  END IF;

  IF v_row.status = 'in_progress'
     AND v_row.completing_since IS NOT NULL
     AND v_row.completing_since >= now() - interval '10 minutes' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'in_progress_elsewhere');
  END IF;

  RETURN jsonb_build_object('claimed', false, 'reason', 'not_claimable', 'status', v_row.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_claim_completion(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_claim_completion(text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fleet_finish_completion(
  p_organization_id text,
  p_work_order_id uuid,
  p_actor_id uuid,
  p_record_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row public.maintenance_work_orders%ROWTYPE;
  v_line_sum numeric;
  v_discount numeric;
  v_total numeric;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_required' USING HINT = 'Actor is required.';
  END IF;
  PERFORM set_config('app.actor_id', p_actor_id::text, true);

  SELECT coalesce(sum(l.line_total), 0)
  INTO v_line_sum
  FROM public.maintenance_work_order_lines l
  WHERE l.work_order_id = p_work_order_id
    AND l.voided_at IS NULL;

  SELECT discount_amount INTO v_discount
  FROM public.maintenance_work_orders
  WHERE id = p_work_order_id;

  v_total := round(v_line_sum - coalesce(v_discount, 0), 2);

  UPDATE public.maintenance_work_orders
  SET
    status = 'completed',
    closed_at = now(),
    total_cost = v_total,
    maintenance_record_id = p_record_id,
    updated_by = p_actor_id,
    completing_since = NULL
  WHERE id = p_work_order_id
    AND organization_id = p_organization_id
    AND status = 'in_progress'
    AND completing_since IS NOT NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'completion_not_claimed' USING HINT = 'Claim the service before finishing.';
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_finish_completion(text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_finish_completion(text, uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fleet_release_completion(
  p_organization_id text,
  p_work_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.maintenance_work_orders
  SET completing_since = NULL
  WHERE id = p_work_order_id
    AND organization_id = p_organization_id
    AND status = 'in_progress';
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_release_completion(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_release_completion(text, uuid) TO service_role;

-- =============================================================================
-- (h) Integrity report — new arms
-- =============================================================================
CREATE OR REPLACE FUNCTION fleet.maintenance_integrity_report(p_organization_id text DEFAULT NULL)
RETURNS TABLE (check_name text, detail jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT 'orphan_in_progress_log_path'::text,
    jsonb_build_object('work_order_id', wo.id, 'vehicle_id', wo.vehicle_id, 'opened_at', wo.opened_at)
  FROM public.maintenance_work_orders wo
  WHERE wo.status = 'in_progress'
    AND wo.opened_at < now() - interval '1 day'
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'missing_nightly_run_today',
    jsonb_build_object('today', current_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM fleet.maintenance_job_runs r
    WHERE r.success = true
      AND r.started_at::date = current_date
      AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
  )
  UNION ALL
  SELECT 'schedule_drift',
    jsonb_build_object('run_id', r.id, 'drift_rows', r.drift_rows, 'started_at', r.started_at)
  FROM fleet.maintenance_job_runs r
  WHERE r.job_name = 'nightly_check'
    AND r.success = true
    AND r.drift_rows > 0
    AND r.started_at > now() - interval '2 days'
    AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
  UNION ALL
  SELECT 'event_unprocessed_1h',
    jsonb_build_object('event_id', e.id, 'type', e.type, 'occurred_at', e.occurred_at, 'vehicle_id', e.vehicle_id)
  FROM fleet.maintenance_events e
  WHERE e.processed_at IS NULL
    AND e.occurred_at < now() - interval '1 hour'
    AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
  UNION ALL
  SELECT 'completed_wo_cost_no_finance',
    jsonb_build_object('work_order_id', wo.id, 'total_cost', wo.total_cost, 'vehicle_id', wo.vehicle_id)
  FROM public.maintenance_work_orders wo
  WHERE wo.status = 'completed'
    AND wo.voided_at IS NULL
    AND coalesce(wo.total_cost, 0) > 0
    AND wo.maintenance_record_id IS NULL
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'completion_odo_below_previous',
    jsonb_build_object('work_order_id', wo.id, 'odometer', wo.odometer, 'vehicle_id', wo.vehicle_id)
  FROM public.maintenance_work_orders wo
  JOIN LATERAL (
    SELECT r.reading
    FROM fleet.odometer_readings r
    WHERE r.vehicle_id = wo.vehicle_id
      AND r.organization_id = wo.organization_id
      AND r.is_voided IS NOT TRUE
      AND r.recorded_at < coalesce(wo.closed_at, wo.opened_at)
    ORDER BY r.recorded_at DESC
    LIMIT 1
  ) prev ON true
  WHERE wo.status = 'completed'
    AND wo.odometer IS NOT NULL
    AND wo.odometer < prev.reading
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'no_odometer_7d',
    jsonb_build_object('vehicle_id', v.id, 'license_plate', v.license_plate)
  FROM fleet.vehicles v
  WHERE NOT EXISTS (
    SELECT 1 FROM fleet.odometer_readings r
    WHERE r.vehicle_id = v.id
      AND r.is_voided IS NOT TRUE
      AND r.recorded_at > now() - interval '7 days'
  )
    AND (p_organization_id IS NULL OR v.organization_id = p_organization_id)
  UNION ALL
  SELECT 'wo_open_over_14d',
    jsonb_build_object('work_order_id', wo.id, 'status', wo.status, 'opened_at', wo.opened_at)
  FROM public.maintenance_work_orders wo
  WHERE wo.status IN ('draft', 'open', 'scheduled', 'in_shop', 'awaiting_parts', 'in_progress')
    AND wo.opened_at < now() - interval '14 days'
    AND wo.voided_at IS NULL
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'completion_stuck',
    jsonb_build_object(
      'work_order_id', wo.id,
      'vehicle_id', wo.vehicle_id,
      'completing_since', wo.completing_since
    )
  FROM public.maintenance_work_orders wo
  WHERE wo.status = 'in_progress'
    AND wo.completing_since IS NOT NULL
    AND wo.completing_since < now() - interval '10 minutes'
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'completion_never_started',
    jsonb_build_object(
      'work_order_id', wo.id,
      'vehicle_id', wo.vehicle_id,
      'completing_since', wo.completing_since,
      'closed_at', wo.closed_at
    )
  FROM public.maintenance_work_orders wo
  WHERE wo.status = 'completed'
    AND wo.voided_at IS NULL
    AND wo.completing_since IS NOT NULL
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'completed_without_record',
    jsonb_build_object(
      'work_order_id', wo.id,
      'vehicle_id', wo.vehicle_id,
      'closed_at', wo.closed_at
    )
  FROM public.maintenance_work_orders wo
  WHERE wo.status = 'completed'
    AND wo.voided_at IS NULL
    AND wo.maintenance_record_id IS NULL
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'completed_missing_service_ledger',
    jsonb_build_object(
      'work_order_id', wo.id,
      'vehicle_id', wo.vehicle_id,
      'work_order_line_id', l.id
    )
  FROM public.maintenance_work_orders wo
  JOIN public.maintenance_work_order_lines l
    ON l.work_order_id = wo.id
  WHERE wo.status = 'completed'
    AND wo.voided_at IS NULL
    AND l.voided_at IS NULL
    AND NOT l.declined
    AND l.component_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.maintenance_service_ledger sl
      WHERE sl.work_order_line_id = l.id
        AND sl.voided_at IS NULL
    )
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'completed_missing_finance_entry',
    jsonb_build_object(
      'work_order_id', wo.id,
      'vehicle_id', wo.vehicle_id,
      'maintenance_record_id', r.id,
      'cost', r.cost
    )
  FROM public.maintenance_work_orders wo
  JOIN public.maintenance_records r ON r.id = wo.maintenance_record_id
  WHERE wo.status = 'completed'
    AND wo.voided_at IS NULL
    AND coalesce(r.cost, 0) > 0
    AND coalesce(r.status, 'completed') = 'completed'
    AND NOT EXISTS (
      SELECT 1
      FROM ledger.financial_events fe
      WHERE fe.idempotency_key = 'maintenance_record:' || r.id::text || '|maintenance'
        AND fe.reverses_event_id IS NULL
    )
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'line_items_amount_drift',
    jsonb_build_object(
      'work_order_id', l.work_order_id,
      'vehicle_id', wo.vehicle_id,
      'work_order_line_id', l.id,
      'items_amount', l.items_amount,
      'items_sum', s.sum_amount
    )
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  JOIN LATERAL (
    SELECT coalesce(sum(i.amount), 0) AS sum_amount
    FROM public.maintenance_work_order_line_item i
    WHERE i.work_order_line_id = l.id
  ) s ON true
  WHERE round(coalesce(l.items_amount, 0), 2) IS DISTINCT FROM round(s.sum_amount, 2)
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'total_cost_drift',
    jsonb_build_object(
      'work_order_id', wo.id,
      'vehicle_id', wo.vehicle_id,
      'total_cost', wo.total_cost,
      'expected_total', t.expected_total,
      'discount_amount', wo.discount_amount
    )
  FROM public.maintenance_work_orders wo
  JOIN LATERAL (
    SELECT round(
      coalesce(sum(l.line_total), 0) - coalesce(wo.discount_amount, 0),
      2
    ) AS expected_total
    FROM public.maintenance_work_order_lines l
    WHERE l.work_order_id = wo.id
      AND l.voided_at IS NULL
  ) t ON true
  WHERE wo.voided_at IS NULL
    AND round(coalesce(wo.total_cost, 0), 2) IS DISTINCT FROM t.expected_total
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id);
$$;

NOTIFY pgrst, 'reload schema';

-- Logbook line (keeps CI's migration list in step with live):
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113171047', 'service_items_logging_core') ON CONFLICT (version) DO NOTHING;
