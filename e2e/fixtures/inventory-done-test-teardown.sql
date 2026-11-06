-- Remove all inventory done-test data (org f6010000-0000-4000-8000-000000000099).
BEGIN;

DELETE FROM fleet.inv_driver_report_update
WHERE report_id IN (
  SELECT id FROM fleet.inv_driver_report
  WHERE organization_id = 'f6010000-0000-4000-8000-000000000099'
);
DELETE FROM fleet.inv_driver_report WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_ledger WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_movement WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_cost_layer WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_reservation WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_receipt WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_requisition_line WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_requisition WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_audit_log WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_kit_compliance_daily WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_balance WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_asset_event WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_asset WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_approval WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_count_line WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_count_session WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_purchase_order_line WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_purchase_order WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_alert WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_alert_rule WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_asset_diagnostic WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_document WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.kit_template_line WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.vehicle_kit WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.kit_template_version WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.kit_template WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_item WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_location WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_vendor WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_settings WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_chain_check WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';

DELETE FROM delivery.courier_offers WHERE order_id = 'b6010009-0000-4000-8000-000000000902'::uuid;
DELETE FROM delivery.orders WHERE id = 'b6010009-0000-4000-8000-000000000902'::uuid;
DELETE FROM delivery.merchants WHERE id = 'b6010009-0000-4000-8000-000000000903'::uuid;
DELETE FROM delivery.courier_availability WHERE driver_id = 'a6010004-0000-4000-8000-000000000004'::uuid;
DELETE FROM delivery.courier_profiles WHERE user_id = 'a6010004-0000-4000-8000-000000000004'::uuid;
DELETE FROM fleet.drivers WHERE id = 'inv-done-driver-fleet-row';

DELETE FROM fleet.vehicles WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM public.kv_store_37f42386 WHERE key LIKE '%f6010000-0000-4000-8000-000000000099%';

DELETE FROM platform.user_roles
WHERE scope_type = 'organization'
  AND scope_id = 'f6010000-0000-4000-8000-000000000099'::uuid
  AND user_id IN (
    'a6010001-0000-4000-8000-000000000001'::uuid,
    'a6010002-0000-4000-8000-000000000002'::uuid,
    'a6010003-0000-4000-8000-000000000003'::uuid,
    'a6010004-0000-4000-8000-000000000004'::uuid
  );

DELETE FROM public.organizations WHERE id = 'f6010000-0000-4000-8000-000000000099'::uuid;

DELETE FROM auth.identities WHERE user_id IN (
  'a6010001-0000-4000-8000-000000000001'::uuid,
  'a6010002-0000-4000-8000-000000000002'::uuid,
  'a6010003-0000-4000-8000-000000000003'::uuid,
  'a6010004-0000-4000-8000-000000000004'::uuid
);
DELETE FROM auth.users WHERE id IN (
  'a6010001-0000-4000-8000-000000000001'::uuid,
  'a6010002-0000-4000-8000-000000000002'::uuid,
  'a6010003-0000-4000-8000-000000000003'::uuid,
  'a6010004-0000-4000-8000-000000000004'::uuid
);

COMMIT;
