-- R8-05: Kit template dedupe + fuel card link; kit compliance counts installed assets.
-- Bridge driver report tables for fleet-core PostgREST access.

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_ver uuid;
BEGIN
  SELECT ktv.id INTO v_ver
  FROM fleet.kit_template kt
  JOIN fleet.kit_template_version ktv ON ktv.template_id = kt.id AND ktv.organization_id = kt.organization_id
  WHERE kt.organization_id = v_org AND kt.code = 'RIDESHARE-DEFAULT'
  ORDER BY ktv.version DESC
  LIMIT 1;

  IF v_ver IS NOT NULL THEN
    DELETE FROM fleet.kit_template_line a
    USING fleet.kit_template_line b, fleet.inv_item i
    WHERE a.version_id = v_ver AND b.version_id = v_ver
      AND a.id > b.id
      AND a.item_id = b.item_id
      AND a.item_id = i.id
      AND i.organization_id = v_org
      AND i.name = 'Phone Holder Mount';

    IF NOT EXISTS (
      SELECT 1 FROM fleet.kit_template_line
      WHERE version_id = v_ver AND line_type = 'linked_fuel_card'
    ) THEN
      INSERT INTO fleet.kit_template_line (
        organization_id, version_id, item_id, qty_required, required,
        blocks_road_clearance, line_type, sort_order
      ) VALUES (
        v_org, v_ver, NULL, 1, true, false, 'linked_fuel_card', 5
      );
    END IF;
  END IF;
END $$;

CREATE OR REPLACE VIEW fleet.v_inv_kit_compliance
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    vk.organization_id,
    vk.vehicle_id,
    v.license_plate,
    kt.code AS kit_code,
    ktl.id AS kit_line_id,
    ktl.item_id,
    ktl.qty_required,
    ktl.blocks_road_clearance,
    ktl.line_type,
    CASE
      WHEN ktl.line_type IN ('linked_toll_tag', 'linked_fuel_card') THEN 'linked'
      WHEN ktl.item_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM fleet.inv_asset a
        JOIN fleet.inv_location vl2
          ON vl2.id = a.location_id AND vl2.organization_id = a.organization_id
        WHERE a.organization_id = vk.organization_id
          AND a.item_id = ktl.item_id
          AND a.status = 'installed'
          AND vl2.vehicle_id = vk.vehicle_id
      ) THEN 'ok'
      WHEN COALESCE(b.on_hand, 0) >= ktl.qty_required THEN 'ok'
      WHEN COALESCE(b.on_hand, 0) > 0 THEN 'short'
      ELSE 'missing'
    END AS line_status
  FROM fleet.vehicle_kit vk
  JOIN fleet.vehicles v ON v.id = vk.vehicle_id
  JOIN fleet.kit_template kt ON kt.id = vk.template_id
  JOIN fleet.kit_template_version ktv ON ktv.id = vk.version_id
  JOIN fleet.kit_template_line ktl ON ktl.version_id = ktv.id
  LEFT JOIN fleet.inv_location vl
    ON vl.organization_id = vk.organization_id AND vl.vehicle_id = vk.vehicle_id
  LEFT JOIN fleet.inv_balance b
    ON b.organization_id = vk.organization_id
   AND b.item_id = ktl.item_id
   AND b.location_id = vl.id
)
SELECT
  b.*,
  NOT EXISTS (
    SELECT 1
    FROM base b2
    WHERE b2.organization_id = b.organization_id
      AND b2.vehicle_id = b.vehicle_id
      AND b2.blocks_road_clearance
      AND b2.line_status IN ('missing', 'short')
  ) AS road_clear
FROM base b;

CREATE OR REPLACE VIEW public.fleet_inv_v_kit_compliance
WITH (security_invoker = true) AS
SELECT * FROM fleet.v_inv_kit_compliance;

REVOKE ALL ON public.fleet_inv_v_kit_compliance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_inv_v_kit_compliance TO service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inv_driver_report', 'inv_driver_report_update']
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW public.fleet_inv_%I WITH (security_invoker = true) AS SELECT * FROM fleet.%I',
      t,
      t
    );
    EXECUTE format('REVOKE ALL ON public.fleet_inv_%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_%I TO service_role',
      t
    );
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.fleet_inv_vehicle_kit
WITH (security_invoker = true) AS
SELECT * FROM fleet.vehicle_kit;

REVOKE ALL ON public.fleet_inv_vehicle_kit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_vehicle_kit TO service_role;
