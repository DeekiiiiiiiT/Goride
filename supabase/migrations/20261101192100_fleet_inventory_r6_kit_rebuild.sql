-- R6-05: Rebuild Rideshare car kit (IN7), merge phone holders, road-clearance flags.

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_mount uuid := 'ca661367-4e4e-4d2a-9cfb-774ae21c4120';
  v_holder uuid := '5129bef3-8bab-4793-b84d-fa62f9557c5e';
  v_tpl uuid;
  v_ver uuid;
  v_new_item uuid;
  v_name text;
BEGIN
  UPDATE fleet.kit_template_line SET item_id = v_mount WHERE item_id = v_holder;
  UPDATE fleet.inv_balance SET item_id = v_mount WHERE item_id = v_holder AND organization_id = v_org;
  UPDATE fleet.inv_item SET archived_at = now() WHERE id = v_holder AND organization_id = v_org;

  SELECT kt.id, ktv.id INTO v_tpl, v_ver
  FROM fleet.kit_template kt
  JOIN fleet.kit_template_version ktv ON ktv.template_id = kt.id AND ktv.organization_id = kt.organization_id
  WHERE kt.organization_id = v_org AND kt.code = 'RIDESHARE-DEFAULT'
  ORDER BY ktv.version DESC
  LIMIT 1;

  IF v_tpl IS NULL THEN RETURN; END IF;

  DELETE FROM fleet.kit_template_line ktl
  USING fleet.inv_item i
  WHERE ktl.version_id = v_ver AND ktl.item_id = i.id AND i.name = 'Car Mats';

  UPDATE fleet.kit_template_line ktl
  SET blocks_road_clearance = true
  FROM fleet.inv_item i
  WHERE ktl.version_id = v_ver AND ktl.item_id = i.id
    AND i.name IN ('Spare Tire', 'Car Jack', 'Lug Tool', 'First-aid kit', 'Warning triangle');

  UPDATE fleet.kit_template_line ktl
  SET blocks_road_clearance = false
  FROM fleet.inv_item i
  WHERE ktl.version_id = v_ver AND ktl.item_id = i.id
    AND i.name IN ('Dash Camera', 'Phone Holder Mount');

  UPDATE fleet.kit_template_line SET blocks_road_clearance = false
  WHERE version_id = v_ver AND line_type = 'linked_toll_tag';

  FOREACH v_name IN ARRAY ARRAY['Tyre pump', 'First-aid kit', 'Warning triangle', 'Fire extinguisher']
  LOOP
    INSERT INTO fleet.inv_item (organization_id, sku, short_code, name, tracking)
    VALUES (
      v_org,
      upper(replace(v_name, ' ', '-')),
      left(replace(v_name, ' ', ''), 8),
      v_name,
      'quantity'
    )
    ON CONFLICT (organization_id, lower(sku)) DO UPDATE
      SET name = EXCLUDED.name, archived_at = NULL, updated_at = now()
    RETURNING id INTO v_new_item;

    IF NOT EXISTS (
      SELECT 1 FROM fleet.kit_template_line WHERE version_id = v_ver AND item_id = v_new_item
    ) THEN
      INSERT INTO fleet.kit_template_line (
        organization_id, version_id, item_id, qty_required, required,
        blocks_road_clearance, line_type, sort_order
      ) VALUES (
        v_org, v_ver, v_new_item, 1, v_name <> 'Fire extinguisher',
        v_name IN ('First-aid kit', 'Warning triangle'),
        'item', 50
      );
    END IF;
  END LOOP;

  DELETE FROM fleet.kit_template_line ktl
  USING fleet.inv_item i
  WHERE ktl.version_id = v_ver AND ktl.item_id = i.id AND i.name = 'Phone holder';
END $$;
