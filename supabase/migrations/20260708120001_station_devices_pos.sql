-- Allow POS register tablets in station device enrollment
ALTER TABLE delivery.merchant_station_devices
  DROP CONSTRAINT IF EXISTS merchant_station_devices_station_check;

ALTER TABLE delivery.merchant_station_devices
  ADD CONSTRAINT merchant_station_devices_station_check
  CHECK (station IN ('counter', 'kitchen', 'manager', 'pos'));
