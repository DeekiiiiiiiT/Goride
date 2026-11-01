-- Prod sync R6-06 (R5 data pass A): default warehouse + vehicle stock locations for Roam fleet org.

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_veh record;
  v_loc uuid;
BEGIN
  INSERT INTO fleet.inv_settings (organization_id) VALUES (v_org)
  ON CONFLICT (organization_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM fleet.inv_location WHERE organization_id = v_org AND is_default = true
  ) THEN
    INSERT INTO fleet.inv_location (
      organization_id, code, name, kind, is_default, is_active
    ) VALUES (
      v_org, 'JM-KIN-ST01', 'Main store — Kingston', 'warehouse', true, true
    );
  END IF;

  FOR v_veh IN
    SELECT id, license_plate FROM fleet.vehicles WHERE organization_id = v_org
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM fleet.inv_location
      WHERE organization_id = v_org AND kind = 'vehicle' AND vehicle_id = v_veh.id
    ) THEN
      INSERT INTO fleet.inv_location (
        organization_id, code, name, kind, vehicle_id, is_active
      ) VALUES (
        v_org,
        'VEH-' || upper(replace(coalesce(v_veh.license_plate, v_veh.id), ' ', '')),
        coalesce(v_veh.license_plate, v_veh.id),
        'vehicle',
        v_veh.id,
        true
      );
    END IF;
  END LOOP;
END $$;
