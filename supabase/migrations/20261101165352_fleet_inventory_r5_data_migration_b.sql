-- Prod sync R6-06 (R5 data pass B): vehicle_kit rows for active fleet cars (idempotent).

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_tpl uuid;
  v_ver uuid;
  v_veh record;
BEGIN
  SELECT kt.id, ktv.id INTO v_tpl, v_ver
  FROM fleet.kit_template kt
  JOIN fleet.kit_template_version ktv ON ktv.template_id = kt.id AND ktv.organization_id = kt.organization_id
  WHERE kt.organization_id = v_org
    AND kt.code IN ('rideshare-car-kit', 'RIDESHARE-DEFAULT')
    AND ktv.status = 'published'
  ORDER BY ktv.version DESC
  LIMIT 1;

  IF v_tpl IS NULL OR v_ver IS NULL THEN
    RETURN;
  END IF;

  FOR v_veh IN SELECT id FROM fleet.vehicles WHERE organization_id = v_org
  LOOP
    INSERT INTO fleet.vehicle_kit (organization_id, vehicle_id, template_id, version_id)
    VALUES (v_org, v_veh.id, v_tpl, v_ver)
    ON CONFLICT (organization_id, vehicle_id) DO UPDATE
      SET template_id = EXCLUDED.template_id,
          version_id = EXCLUDED.version_id,
          updated_at = now();
  END LOOP;
END $$;
