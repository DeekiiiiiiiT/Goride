-- Fuel price engine. Rolls back. Run after migrations.
BEGIN;

INSERT INTO fuel.petrojam_prices (price_date, gasolene_87, gasolene_90, auto_diesel, ulsd)
VALUES (date '2026-10-22', 201.81, 205.00, 190.00, 195.00)
ON CONFLICT (price_date) DO UPDATE
SET gasolene_87 = excluded.gasolene_87,
    gasolene_90 = excluded.gasolene_90,
    auto_diesel = excluded.auto_diesel,
    ulsd = excluded.ulsd;

INSERT INTO places.place (id, place_type, name, lat, lng, status, pin_state)
VALUES ('price-engine-station', 'gas_station', 'Engine check', 18.02, -76.80, 'verified', 'confirmed');

DO $$
BEGIN
  IF places.map_fuel_grade('Gasoline_87') <> 'e10_87' THEN
    RAISE EXCEPTION '87 did not map';
  END IF;
  IF places.map_fuel_grade('Diesel') <> 'diesel' THEN
    RAISE EXCEPTION 'diesel did not map';
  END IF;
  IF places.map_fuel_grade('Gasoline_91') <> 'e10_90' THEN
    RAISE EXCEPTION '90 did not map';
  END IF;
  IF places.map_fuel_grade('Electric') <> 'unknown' THEN
    RAISE EXCEPTION 'an unrecognized grade should stay unknown';
  END IF;
  IF places.map_fuel_grade(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'a blank grade should not invent one';
  END IF;
END $$;

INSERT INTO places.fleet_price_report (
  fuel_entry_id, organization_id, driver_id, place_id, grade, grade_source,
  litres, amount, station_state, reported_at
) VALUES
  ('price-engine-a', 'org-engine', 'driver-a', 'price-engine-station', 'e10_87', 'fill', 10, 2200, 'verified', now() - interval '3 days'),
  ('price-engine-b', 'org-engine', 'driver-b', 'price-engine-station', 'e10_87', 'fill', 10, 2210, 'verified', now() - interval '2 days'),
  ('price-engine-c', 'org-engine', 'driver-c', 'price-engine-station', 'e10_87', 'fill', 10, 2220, 'verified', now() - interval '1 day');

DO $$
DECLARE
  published numeric;
  confidence text;
  reports int;
BEGIN
  SELECT price_per_litre, confidence, report_count
    INTO published, confidence, reports
  FROM places.price_current
  WHERE place_id = 'price-engine-station' AND grade = 'e10_87';

  IF published IS NULL OR published < 219 OR published > 223 THEN
    RAISE EXCEPTION 'weighted median was %', published;
  END IF;
  IF confidence <> 'high' THEN
    RAISE EXCEPTION 'three close fleet prices should be high, got %', confidence;
  END IF;
  IF reports <> 3 THEN
    RAISE EXCEPTION 'expected 3 reports, got %', reports;
  END IF;

  IF EXISTS (
    SELECT 1 FROM places.price_report_check c
    JOIN places.fleet_price_report r ON r.id = c.report_id
    WHERE r.fuel_entry_id = 'price-engine-a' AND c.status <> 'accepted'
  ) THEN
    RAISE EXCEPTION 'an in-band fleet price was not accepted';
  END IF;
END $$;

INSERT INTO places.fleet_price_report (
  fuel_entry_id, organization_id, driver_id, place_id, grade, grade_source,
  litres, amount, station_state, reported_at
) VALUES (
  'price-engine-bad', 'org-engine', 'driver-a', 'price-engine-station', 'e10_87', 'fill',
  10, 390.7, 'verified', now()
);

DO $$
DECLARE
  status text;
  reasons text[];
  published numeric;
BEGIN
  SELECT c.status, c.reasons INTO status, reasons
  FROM places.price_report_check c
  JOIN places.fleet_price_report r ON r.id = c.report_id
  WHERE r.fuel_entry_id = 'price-engine-bad';

  IF status <> 'review' OR NOT ('OUT_OF_BOUNDS' = ANY (reasons)) THEN
    RAISE EXCEPTION 'J$39.07 should be in review, status % reasons %', status, reasons;
  END IF;

  SELECT price_per_litre INTO published
  FROM places.price_current
  WHERE place_id = 'price-engine-station' AND grade = 'e10_87';
  IF published IS NULL OR published < 219 THEN
    RAISE EXCEPTION 'a rejected-band price replaced the public price';
  END IF;
END $$;

INSERT INTO places.plug_price_report (
  fuel_log_id, reporter_hash, place_id, grade, grade_source,
  litres, amount, mock_location, station_match, reported_at
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'hash-one', 'price-engine-station', 'e10_87', 'vehicle_locked',
  10, 2300, false, 'auto', now() - interval '20 minutes'
), (
  '00000000-0000-4000-8000-000000000002', 'hash-one', 'price-engine-station', 'e10_87', 'vehicle_locked',
  10, 2300, false, 'auto', now() - interval '15 minutes'
);

DO $$
DECLARE
  status text;
BEGIN
  SELECT c.status INTO status
  FROM places.price_report_check c
  JOIN places.plug_price_report r ON r.id = c.report_id
  WHERE r.fuel_log_id = '00000000-0000-4000-8000-000000000002';
  IF status <> 'review' THEN
    RAISE EXCEPTION 'a duplicate plug price should wait for review, got %', status;
  END IF;
END $$;

DO $$
DECLARE
  queue int;
BEGIN
  SELECT review_count INTO queue FROM places.price_engine_health;
  IF queue < 1 THEN
    RAISE EXCEPTION 'health view lost the review queue';
  END IF;
END $$;

ROLLBACK;
