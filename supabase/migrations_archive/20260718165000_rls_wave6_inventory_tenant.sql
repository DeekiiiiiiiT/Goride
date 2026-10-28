-- RLS Wave 6: enterprise inventory tenant RLS
-- SELECT for merchant team; writes remain service_role (no authenticated write policies)

CREATE OR REPLACE FUNCTION delivery.current_user_inventory_merchant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
  UNION
  SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION delivery.current_user_inventory_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT m.inventory_company_id
  FROM delivery.merchants m
  WHERE m.inventory_company_id IS NOT NULL
    AND m.id IN (SELECT delivery.current_user_inventory_merchant_ids())
  UNION
  SELECT g.company_id
  FROM delivery.inventory_nodes n
  JOIN delivery.inventory_groups grp ON grp.id = n.group_id
  JOIN delivery.inventory_regions g ON g.id = grp.region_id
  WHERE n.merchant_id IN (SELECT delivery.current_user_inventory_merchant_ids());
$$;

CREATE OR REPLACE FUNCTION delivery.current_user_inventory_node_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  SELECT id FROM delivery.inventory_nodes
  WHERE merchant_id IN (SELECT delivery.current_user_inventory_merchant_ids());
$$;

REVOKE ALL ON FUNCTION delivery.current_user_inventory_merchant_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION delivery.current_user_inventory_company_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION delivery.current_user_inventory_node_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delivery.current_user_inventory_merchant_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delivery.current_user_inventory_company_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delivery.current_user_inventory_node_ids() TO authenticated, service_role;

-- Companies
DROP POLICY IF EXISTS inv_companies_select ON delivery.inventory_companies;
CREATE POLICY inv_companies_select ON delivery.inventory_companies
  FOR SELECT TO authenticated
  USING (id IN (SELECT delivery.current_user_inventory_company_ids()));

-- Regions
DROP POLICY IF EXISTS inv_regions_select ON delivery.inventory_regions;
CREATE POLICY inv_regions_select ON delivery.inventory_regions
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT delivery.current_user_inventory_company_ids()));

-- Groups
DROP POLICY IF EXISTS inv_groups_select ON delivery.inventory_groups;
CREATE POLICY inv_groups_select ON delivery.inventory_groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.inventory_regions r
      WHERE r.id = region_id
        AND r.company_id IN (SELECT delivery.current_user_inventory_company_ids())
    )
  );

-- Nodes (keep existing policy name if present; replace with helper-based)
DROP POLICY IF EXISTS "Merchant team read inventory nodes" ON delivery.inventory_nodes;
DROP POLICY IF EXISTS inv_nodes_select ON delivery.inventory_nodes;
CREATE POLICY inv_nodes_select ON delivery.inventory_nodes
  FOR SELECT TO authenticated
  USING (
    merchant_id IN (SELECT delivery.current_user_inventory_merchant_ids())
    OR id IN (SELECT delivery.current_user_inventory_node_ids())
  );

-- UOM + items
DROP POLICY IF EXISTS inv_uom_select ON delivery.uom_definitions;
CREATE POLICY inv_uom_select ON delivery.uom_definitions
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT delivery.current_user_inventory_company_ids()));

DROP POLICY IF EXISTS inv_item_master_select ON delivery.item_master;
CREATE POLICY inv_item_master_select ON delivery.item_master
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT delivery.current_user_inventory_company_ids()));

DROP POLICY IF EXISTS inv_uom_conversions_select ON delivery.uom_conversions;
CREATE POLICY inv_uom_conversions_select ON delivery.uom_conversions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.item_master im
      WHERE im.id = item_id
        AND im.company_id IN (SELECT delivery.current_user_inventory_company_ids())
    )
  );

DROP POLICY IF EXISTS inv_item_node_settings_select ON delivery.item_node_settings;
CREATE POLICY inv_item_node_settings_select ON delivery.item_node_settings
  FOR SELECT TO authenticated
  USING (node_id IN (SELECT delivery.current_user_inventory_node_ids()));

-- Vendors
DROP POLICY IF EXISTS inv_vendors_select ON delivery.vendors;
CREATE POLICY inv_vendors_select ON delivery.vendors
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT delivery.current_user_inventory_company_ids()));

DROP POLICY IF EXISTS inv_vendor_catalogs_select ON delivery.vendor_catalogs;
CREATE POLICY inv_vendor_catalogs_select ON delivery.vendor_catalogs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.vendors v
      WHERE v.id = vendor_id
        AND v.company_id IN (SELECT delivery.current_user_inventory_company_ids())
    )
  );

DROP POLICY IF EXISTS inv_vendor_price_history_select ON delivery.vendor_price_history;
CREATE POLICY inv_vendor_price_history_select ON delivery.vendor_price_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.vendor_catalogs vc
      JOIN delivery.vendors v ON v.id = vc.vendor_id
      WHERE vc.id = catalog_id
        AND v.company_id IN (SELECT delivery.current_user_inventory_company_ids())
    )
  );

-- POs / receiving
DROP POLICY IF EXISTS inv_po_select ON delivery.purchase_orders;
CREATE POLICY inv_po_select ON delivery.purchase_orders
  FOR SELECT TO authenticated
  USING (node_id IN (SELECT delivery.current_user_inventory_node_ids()));

DROP POLICY IF EXISTS inv_po_lines_select ON delivery.purchase_order_lines;
CREATE POLICY inv_po_lines_select ON delivery.purchase_order_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.purchase_orders po
      WHERE po.id = po_id
        AND po.node_id IN (SELECT delivery.current_user_inventory_node_ids())
    )
  );

DROP POLICY IF EXISTS inv_receiving_select ON delivery.receiving_events;
CREATE POLICY inv_receiving_select ON delivery.receiving_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.purchase_orders po
      WHERE po.id = po_id
        AND po.node_id IN (SELECT delivery.current_user_inventory_node_ids())
    )
  );

DROP POLICY IF EXISTS inv_receiving_variances_select ON delivery.receiving_variances;
CREATE POLICY inv_receiving_variances_select ON delivery.receiving_variances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.receiving_events re
      JOIN delivery.purchase_orders po ON po.id = re.po_id
      WHERE re.id = receiving_id
        AND po.node_id IN (SELECT delivery.current_user_inventory_node_ids())
    )
  );

-- Recipes
DROP POLICY IF EXISTS inv_recipes_select ON delivery.recipes;
CREATE POLICY inv_recipes_select ON delivery.recipes
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT delivery.current_user_inventory_company_ids()));

DROP POLICY IF EXISTS inv_recipe_ingredients_select ON delivery.recipe_ingredients;
CREATE POLICY inv_recipe_ingredients_select ON delivery.recipe_ingredients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.recipes r
      WHERE r.id = recipe_id
        AND r.company_id IN (SELECT delivery.current_user_inventory_company_ids())
    )
  );

-- Ledger / balances / cost / transfers / counts
DROP POLICY IF EXISTS inv_ledger_select ON delivery.inventory_ledger;
CREATE POLICY inv_ledger_select ON delivery.inventory_ledger
  FOR SELECT TO authenticated
  USING (node_id IN (SELECT delivery.current_user_inventory_node_ids()));

DROP POLICY IF EXISTS inv_balances_select ON delivery.inventory_balances;
CREATE POLICY inv_balances_select ON delivery.inventory_balances
  FOR SELECT TO authenticated
  USING (node_id IN (SELECT delivery.current_user_inventory_node_ids()));

DROP POLICY IF EXISTS inv_cost_layers_select ON delivery.inventory_cost_layers;
CREATE POLICY inv_cost_layers_select ON delivery.inventory_cost_layers
  FOR SELECT TO authenticated
  USING (node_id IN (SELECT delivery.current_user_inventory_node_ids()));

DROP POLICY IF EXISTS inv_transfers_select ON delivery.inventory_transfers;
CREATE POLICY inv_transfers_select ON delivery.inventory_transfers
  FOR SELECT TO authenticated
  USING (
    from_node_id IN (SELECT delivery.current_user_inventory_node_ids())
    OR to_node_id IN (SELECT delivery.current_user_inventory_node_ids())
  );

DROP POLICY IF EXISTS inv_transfer_lines_select ON delivery.inventory_transfer_lines;
CREATE POLICY inv_transfer_lines_select ON delivery.inventory_transfer_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.inventory_transfers t
      WHERE t.id = transfer_id
        AND (
          t.from_node_id IN (SELECT delivery.current_user_inventory_node_ids())
          OR t.to_node_id IN (SELECT delivery.current_user_inventory_node_ids())
        )
    )
  );

DROP POLICY IF EXISTS inv_physical_counts_select ON delivery.physical_counts;
CREATE POLICY inv_physical_counts_select ON delivery.physical_counts
  FOR SELECT TO authenticated
  USING (node_id IN (SELECT delivery.current_user_inventory_node_ids()));

DROP POLICY IF EXISTS inv_physical_count_items_select ON delivery.physical_count_items;
CREATE POLICY inv_physical_count_items_select ON delivery.physical_count_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.physical_counts pc
      WHERE pc.id = count_id
        AND pc.node_id IN (SELECT delivery.current_user_inventory_node_ids())
    )
  );

-- Harden inventory RPCs with company/node ownership when called as service_role
-- (still service_role-only EXECUTE from Wave 0; optional defense in depth left for edge layer)

NOTIFY pgrst, 'reload schema';
