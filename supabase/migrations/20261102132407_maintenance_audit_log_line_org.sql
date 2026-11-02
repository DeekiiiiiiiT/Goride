-- Work order lines have no organization_id; resolve from parent work order for audit log.

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
