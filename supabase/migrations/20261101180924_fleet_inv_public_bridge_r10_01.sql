-- R10-01: PostgREST bridge names must be fleet_inv_<suffix>, not fleet_inv_inv_* (audit Rev 10).

DO $$
DECLARE
  t text;
  v_suffix text;
  v_public text;
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS view_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname LIKE 'fleet_inv_inv_%'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.view_name);
  END LOOP;

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
    'inv_driver_report',
    'inv_driver_report_update'
  ]
  LOOP
    v_suffix := CASE WHEN t ~ '^inv_' THEN substring(t FROM 5) ELSE t END;
    v_public := 'fleet_inv_' || v_suffix;

    EXECUTE format(
      'CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS SELECT * FROM fleet.%I',
      v_public,
      t
    );
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_public);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',
      v_public
    );
  END LOOP;
END $$;;
