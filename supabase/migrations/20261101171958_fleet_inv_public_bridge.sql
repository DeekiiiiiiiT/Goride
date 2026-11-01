-- Public PostgREST bridge for fleet inventory (audit R6-01). service_role only — do not grant to authenticated.

-- ---------------------------------------------------------------------------
-- Table mirrors (updatable single-table views)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inv_item',
    'inv_balance',
    'inv_location',
    'inv_movement',
    'inv_ledger',
    'inv_chain_check',
    'inv_asset',
    'inv_asset_event',
    'inv_document',
    'inv_purchase_order',
    'inv_vendor',
    'inv_count_session',
    'inv_count_line',
    'inv_approval',
    'inv_alert',
    'inv_scan_device',
    'inv_requisition',
    'inv_reorder_policy',
    'kit_template',
    'kit_template_version',
    'kit_template_line',
    'inventory'
  ]
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

-- Read-only analytics views
CREATE OR REPLACE VIEW public.fleet_inv_v_stock
WITH (security_invoker = true) AS
SELECT * FROM fleet.v_inv_stock;

CREATE OR REPLACE VIEW public.fleet_inv_v_stock_kpis
WITH (security_invoker = true) AS
SELECT * FROM fleet.v_inv_stock_kpis;

CREATE OR REPLACE VIEW public.fleet_inv_v_kit_compliance
WITH (security_invoker = true) AS
SELECT * FROM fleet.v_inv_kit_compliance;

CREATE OR REPLACE VIEW public.fleet_inv_v_alerts_tiles
WITH (security_invoker = true) AS
SELECT * FROM fleet.v_inv_alerts_tiles;

REVOKE ALL ON public.fleet_inv_v_stock, public.fleet_inv_v_stock_kpis,
  public.fleet_inv_v_kit_compliance, public.fleet_inv_v_alerts_tiles
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_inv_v_stock, public.fleet_inv_v_stock_kpis,
  public.fleet_inv_v_kit_compliance, public.fleet_inv_v_alerts_tiles
  TO service_role;

-- ---------------------------------------------------------------------------
-- RPC wrappers (SECURITY DEFINER → fleet schema)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_inv_verify_chain(p_org_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_verify_chain(p_org_id); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_opening_balance(
  p_org_id text,
  p_lines jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_opening_balance(p_org_id, p_lines, p_idempotency_key); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_receive(
  p_org_id text,
  p_receipt jsonb,
  p_lines jsonb,
  p_costs jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_receive(p_org_id, p_receipt, p_lines, p_costs, p_idempotency_key); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_issue_to_vehicles(
  p_org_id text,
  p_source_location_id uuid,
  p_lines jsonb,
  p_vehicle_ids text[],
  p_issue_available_only boolean,
  p_dry_run boolean,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_issue_to_vehicles(
  p_org_id, p_source_location_id, p_lines, p_vehicle_ids,
  p_issue_available_only, p_dry_run, p_idempotency_key
); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_transfer(
  p_org_id text,
  p_item_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_bin_from uuid,
  p_bin_to uuid,
  p_qty numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_transfer(
  p_org_id, p_item_id, p_from_location_id, p_to_location_id,
  p_bin_from, p_bin_to, p_qty, p_idempotency_key
); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_adjust(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_bin_id uuid,
  p_qty_delta numeric,
  p_unit_cost numeric,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_adjust(
  p_org_id, p_item_id, p_location_id, p_bin_id,
  p_qty_delta, p_unit_cost, p_reason, p_idempotency_key
); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_reverse(
  p_org_id text,
  p_movement_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_reverse(p_org_id, p_movement_id, p_reason, p_idempotency_key); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_write_off(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_asset_id uuid,
  p_qty numeric,
  p_reason text,
  p_memo text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_write_off(
  p_org_id, p_item_id, p_location_id, p_asset_id,
  p_qty, p_reason, p_memo, p_idempotency_key
); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_import_items(p_org_id text, p_file jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_import_items(p_org_id, p_file); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_return_from_vehicle(
  p_org_id text,
  p_item_id uuid,
  p_vehicle_id text,
  p_to_location_id uuid,
  p_qty numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_return_from_vehicle(
  p_org_id, p_item_id, p_vehicle_id, p_to_location_id, p_qty, p_idempotency_key
); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_recompute_reorder(p_org_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_recompute_reorder(p_org_id); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_publish_kit_version(
  p_org_id text,
  p_template_id uuid,
  p_version_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_publish_kit_version(
  p_org_id, p_template_id, p_version_id, p_idempotency_key
); $$;

CREATE OR REPLACE FUNCTION public.fleet_inv_pair_scanner(
  p_org_id text,
  p_pairing_code text,
  p_device_label text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_pair_scanner(p_org_id, p_pairing_code, p_device_label); $$;

CREATE OR REPLACE FUNCTION public.fleet_legacy_inventory_draw(
  p_inventory_id text,
  p_org_id text,
  p_draw numeric,
  p_expected_qty numeric
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.legacy_inventory_draw(p_inventory_id, p_org_id, p_draw, p_expected_qty); $$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'fleet_inv_verify_chain(text)',
    'fleet_inv_opening_balance(text,jsonb,text)',
    'fleet_inv_receive(text,jsonb,jsonb,jsonb,text)',
    'fleet_inv_issue_to_vehicles(text,uuid,jsonb,text[],boolean,boolean,text)',
    'fleet_inv_transfer(text,uuid,uuid,uuid,uuid,uuid,numeric,text)',
    'fleet_inv_adjust(text,uuid,uuid,uuid,numeric,numeric,text,text)',
    'fleet_inv_reverse(text,uuid,text,text)',
    'fleet_inv_write_off(text,uuid,uuid,uuid,numeric,text,text,text)',
    'fleet_inv_import_items(text,jsonb)',
    'fleet_inv_return_from_vehicle(text,uuid,text,uuid,numeric,text)',
    'fleet_inv_recompute_reorder(text)',
    'fleet_inv_publish_kit_version(text,uuid,uuid,text)',
    'fleet_inv_pair_scanner(text,text,text)',
    'fleet_legacy_inventory_draw(text,text,numeric,numeric)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;
