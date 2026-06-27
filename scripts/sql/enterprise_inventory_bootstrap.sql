-- Idempotent bootstrap: one company + storefront node per merchant, migrate ingredients to item_master
-- Run manually after 20260801120000_enterprise_inventory_foundation.sql

DO $$
DECLARE
  m RECORD;
  co_id uuid;
  reg_id uuid;
  grp_id uuid;
  node_id uuid;
  uom_each uuid;
  ing RECORD;
BEGIN
  FOR m IN SELECT id, name, slug FROM delivery.merchants LOOP
    SELECT id INTO co_id FROM delivery.inventory_companies WHERE slug = 'co-' || m.slug;
    IF co_id IS NULL THEN
      INSERT INTO delivery.inventory_companies (name, slug)
      VALUES (m.name || ' Inventory', 'co-' || m.slug)
      RETURNING id INTO co_id;

      INSERT INTO delivery.inventory_regions (company_id, name, code)
      VALUES (co_id, 'Default Region', 'default')
      RETURNING id INTO reg_id;

      INSERT INTO delivery.inventory_groups (region_id, name, group_type)
      VALUES (reg_id, 'Corporate', 'corporate')
      RETURNING id INTO grp_id;

      INSERT INTO delivery.inventory_nodes (group_id, merchant_id, name, node_type)
      VALUES (grp_id, m.id, m.name, 'storefront')
      RETURNING id INTO node_id;

      INSERT INTO delivery.uom_definitions (company_id, code, name, dimension, is_base)
      VALUES (co_id, 'each', 'Each', 'count', true)
      RETURNING id INTO uom_each;

      INSERT INTO delivery.uom_definitions (company_id, code, name, dimension, is_base)
      VALUES
        (co_id, 'case', 'Case', 'count', false),
        (co_id, 'oz', 'Ounce', 'weight', false),
        (co_id, 'lb', 'Pound', 'weight', false);

      UPDATE delivery.merchants
      SET inventory_company_id = co_id
      WHERE id = m.id;
    ELSE
      SELECT n.id INTO node_id
      FROM delivery.inventory_nodes n
      WHERE n.merchant_id = m.id
      LIMIT 1;

      SELECT id INTO uom_each
      FROM delivery.uom_definitions
      WHERE company_id = co_id AND code = 'each'
      LIMIT 1;
    END IF;

    FOR ing IN
      SELECT * FROM delivery.ingredients WHERE merchant_id = m.id
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM delivery.item_master WHERE legacy_ingredient_id = ing.id
      ) THEN
        INSERT INTO delivery.item_master (
          company_id, legacy_ingredient_id, name, base_uom_id,
          purchase_uom_id, storage_uom_id, recipe_uom_id,
          reorder_level_base, is_active
        )
        VALUES (
          co_id, ing.id, ing.name, uom_each,
          uom_each, uom_each, uom_each,
          ing.reorder_level, true
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;
