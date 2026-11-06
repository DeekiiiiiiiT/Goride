-- Done-test 17: org exists but no stock movements/balances (first-time setup).
BEGIN;
DELETE FROM fleet.inv_driver_report_update
WHERE report_id IN (SELECT id FROM fleet.inv_driver_report WHERE organization_id = 'f6010000-0000-4000-8000-000000000099');
DELETE FROM fleet.inv_driver_report WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_ledger WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_movement WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_balance WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_cost_layer WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_asset_event WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_asset WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_approval WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
DELETE FROM fleet.inv_chain_check WHERE organization_id = 'f6010000-0000-4000-8000-000000000099';
COMMIT;
