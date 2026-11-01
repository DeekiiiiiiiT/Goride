-- R10-02: Void duplicate legacy-import work orders on 5179KZ (audit Rev 10).

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_damage jsonb;
BEGIN
  UPDATE public.maintenance_work_orders
  SET
    voided_at = coalesce(voided_at, now()),
    void_reason = coalesce(void_reason, 'inventory migration duplicate'),
    notes = trim(both FROM coalesce(notes, '') || ' [void: inventory migration duplicate]')
  WHERE organization_id = v_org
    AND provider = 'Legacy equipment import'
    AND voided_at IS NULL
    AND (
      (total_cost = 0 AND performed_at_date = DATE '2026-11-01')
      OR id IN (
        '728b7b54-d8c1-4857-9e6d-0c2a575fb126'::uuid,
        '42e90b9f-cd93-42d9-893f-0db3af9fc973'::uuid
      )
    );

  SELECT coalesce(
    e.payload->'equipment'->'damageHistory',
    e.payload->'damage_history',
    '[]'::jsonb
  )
  INTO v_damage
  FROM fleet.maintenance_events e
  WHERE e.id = '4880dafb-ffd6-41c0-88cd-54b88657e1f2'::uuid;

  IF v_damage IS NOT NULL AND jsonb_typeof(v_damage) = 'array' AND jsonb_array_length(v_damage) > 0 THEN
    UPDATE public.maintenance_work_orders wo
    SET payload_json = jsonb_set(
      coalesce(wo.payload_json, '{}'::jsonb),
      '{damage_history}',
      v_damage,
      true
    )
    WHERE wo.organization_id = v_org
      AND wo.provider = 'Legacy equipment import'
      AND wo.voided_at IS NULL
      AND wo.notes ILIKE 'Tire (Front Left)%'
      AND wo.total_cost > 0
      AND coalesce(jsonb_array_length(wo.payload_json->'damage_history'), 0) = 0;
  END IF;
END $$;;
