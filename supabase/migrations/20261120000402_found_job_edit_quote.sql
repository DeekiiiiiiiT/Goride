-- LC-17 (docs/log-service-parts-gaps-audit.md): "Add quote" / "Edit quote" on a job that is still Not done yet.
-- Saved service lines stay locked; ONE more narrow change is allowed on an OPEN found job (recommended, not declined,
-- not closed): its quote (values_json.quote + values_json.quote_amount) and its note. Nothing else on the line, and
-- never on a done job. The quote is never spend (line_total stays 0).

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
      -- LC-17: an open found job's quote + note only.
      IF OLD.recommended = true AND OLD.declined = false AND OLD.closed_at IS NULL AND OLD.voided_at IS NULL
         AND (to_jsonb(NEW) - ARRAY['values_json', 'notes', 'updated_at', 'updated_by'])
           = (to_jsonb(OLD) - ARRAY['values_json', 'notes', 'updated_at', 'updated_by'])
         AND (coalesce(NEW.values_json, '{}'::jsonb) - ARRAY['quote', 'quote_amount'])
           = (coalesce(OLD.values_json, '{}'::jsonb) - ARRAY['quote', 'quote_amount']) THEN
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

CREATE OR REPLACE FUNCTION public.fleet_set_found_quote(
  p_organization_id text,
  p_actor_id uuid,
  p_line_id uuid,
  p_quote numeric,
  p_quote_detail jsonb,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_line record;
  v_quote numeric;
  v_values jsonb;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;

  SELECT l.id, l.values_json, l.notes
  INTO v_line
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  WHERE l.id = p_line_id
    AND wo.organization_id = p_organization_id
  FOR UPDATE OF l;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'found_line_not_found';
  END IF;
  IF NOT public.maintenance_found_line_is_open(p_line_id) THEN
    RAISE EXCEPTION 'found_line_not_open'
      USING HINT = 'This job is already done or closed.';
  END IF;

  IF p_quote IS NOT NULL AND (p_quote < 0 OR p_quote > 100000000) THEN
    RAISE EXCEPTION 'quote_invalid' USING HINT = 'The quote must be a price from 0 up.';
  END IF;
  IF p_quote_detail IS NOT NULL
     AND (jsonb_typeof(p_quote_detail) <> 'object' OR length(p_quote_detail::text) > 20000) THEN
    RAISE EXCEPTION 'quote_invalid' USING HINT = 'The quote details could not be read.';
  END IF;
  v_quote := CASE WHEN p_quote IS NULL OR p_quote = 0 THEN NULL ELSE round(p_quote, 2) END;

  v_values := (coalesce(v_line.values_json, '{}'::jsonb) - ARRAY['quote', 'quote_amount'])
    || CASE WHEN v_quote IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('quote_amount', v_quote) END
    || CASE WHEN p_quote_detail IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('quote', p_quote_detail) END;

  UPDATE public.maintenance_work_order_lines
  SET values_json = v_values,
      notes = CASE WHEN p_note IS NULL THEN notes ELSE nullif(left(trim(p_note), 500), '') END,
      updated_at = now(),
      updated_by = p_actor_id
  WHERE id = p_line_id;

  RETURN jsonb_build_object('lineId', p_line_id, 'quoteAmount', v_quote);
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_set_found_quote(text, uuid, uuid, numeric, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_set_found_quote(text, uuid, uuid, numeric, jsonb, text) TO service_role;

-- Self-check
DO $check$
BEGIN
  IF to_regprocedure('public.fleet_set_found_quote(text, uuid, uuid, numeric, jsonb, text)') IS NULL THEN
    RAISE EXCEPTION 'fleet_set_found_quote missing';
  END IF;
  IF has_function_privilege('authenticated', 'public.fleet_set_found_quote(text, uuid, uuid, numeric, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fleet_set_found_quote must not be callable by signed-in users directly';
  END IF;
  IF pg_get_functiondef('fleet.guard_completed_maintenance_wo_line()'::regprocedure) NOT LIKE '%LC-17%' THEN
    RAISE EXCEPTION 'line lock not updated';
  END IF;
END;
$check$;
