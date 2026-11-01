-- Idempotent: second spare supplier offset (also applied during R10 cutover).
DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_supplier uuid;
  v_mov record;
  v_leg record;
BEGIN
  v_supplier := fleet._inv_virtual_location_id(v_org, 'V-SUPPLIER', 'Supplier (virtual)');
  FOR v_mov IN
    SELECT id FROM fleet.inv_movement
    WHERE organization_id = v_org AND idempotency_key = 'r8-04-second-spare'
  LOOP
    FOR v_leg IN
      SELECT l.*
      FROM fleet.inv_ledger l
      JOIN fleet.inv_location loc ON loc.id = l.location_id AND loc.organization_id = l.organization_id
      WHERE l.organization_id = v_org
        AND l.movement_id = v_mov.id
        AND l.qty_delta > 0
        AND loc.kind <> 'virtual'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM fleet.inv_ledger o
        WHERE o.organization_id = v_org
          AND o.movement_id = v_mov.id
          AND o.item_id = v_leg.item_id
          AND o.location_id = v_supplier
          AND o.qty_delta = -v_leg.qty_delta
      ) THEN
        PERFORM fleet._inv_append_ledger_leg(
          v_org, v_mov.id, v_leg.item_id, v_supplier, NULL, NULL,
          -v_leg.qty_delta, v_leg.unit_cost
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;;
