-- Multi-country origin warehouses: miami_warehouse → warehouse,
-- received_miami → received_at_warehouse (backfill + CHECK updates).

-- Facilities type
ALTER TABLE freight.facilities DROP CONSTRAINT IF EXISTS facilities_facility_type_check;
UPDATE freight.facilities
SET facility_type = 'warehouse'
WHERE facility_type = 'miami_warehouse';
ALTER TABLE freight.facilities
  ADD CONSTRAINT facilities_facility_type_check
  CHECK (facility_type IN ('warehouse', 'ja_hub', 'branch'));

-- Package status (drop unknown constraint names safely)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'freight'
      AND t.relname = 'packages'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE freight.packages DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

UPDATE freight.packages
SET status = 'received_at_warehouse'
WHERE status = 'received_miami';

ALTER TABLE freight.packages
  ADD CONSTRAINT packages_status_check
  CHECK (status IN (
    'expected',
    'received_at_warehouse',
    'manifested',
    'in_transit_intl',
    'customs_hold',
    'customs_cleared',
    'received_hub',
    'ready_for_fulfillment',
    'out_for_delivery',
    'awaiting_pickup',
    'delivered',
    'collected',
    'exception'
  ));

-- Scan event types
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'freight'
      AND t.relname = 'package_scan_events'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE freight.package_scan_events DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

UPDATE freight.package_scan_events
SET event_type = 'received_at_warehouse'
WHERE event_type = 'received_miami';

ALTER TABLE freight.package_scan_events
  ADD CONSTRAINT package_scan_events_event_type_check
  CHECK (event_type IN (
    'pre_alert',
    'received_at_warehouse',
    'manifested',
    'shipped',
    'arrived_ja',
    'customs_hold',
    'customs_cleared',
    'hub_inbound',
    'sorted',
    'ready_fulfillment',
    'loaded_vehicle',
    'out_for_delivery',
    'delivered',
    'picked_up',
    'exception',
    'note'
  ));
