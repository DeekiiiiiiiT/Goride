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
  SELECT price_per_litre, price_current.confidence, report_count
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
  weight numeric;
BEGIN
  SELECT c.status, c.weight INTO status, weight
  FROM places.price_report_check c
  JOIN places.plug_price_report r ON r.id = c.report_id
  WHERE r.fuel_log_id = '00000000-0000-4000-8000-000000000001';
  IF status <> 'accepted' THEN
    RAISE EXCEPTION 'the earlier plug price should count once, got %', status;
  END IF;

  SELECT c.status, c.weight INTO status, weight
  FROM places.price_report_check c
  JOIN places.plug_price_report r ON r.id = c.report_id
  WHERE r.fuel_log_id = '00000000-0000-4000-8000-000000000002';
  -- Later same-reporter plug prices must not count again (weight 0), whether tagged duplicate or review.
  IF weight IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'a later duplicate should be kept at weight 0, got % weight %', status, weight;
  END IF;
  IF status NOT IN ('duplicate', 'review') THEN
    RAISE EXCEPTION 'a later duplicate should stay out of the median, got %', status;
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

INSERT INTO places.fleet_price_report (
  fuel_entry_id, organization_id, driver_id, place_id, grade, grade_source,
  litres, amount, station_state, reported_at
) VALUES (
  'price-engine-nograde', 'org-engine', 'driver-a', 'price-engine-station', 'unknown', 'unknown',
  10, 2300, 'verified', now()
);

DO $$
DECLARE
  status text;
  reasons text[];
  report_id uuid;
BEGIN
  SELECT c.status, c.reasons, r.id INTO status, reasons, report_id
  FROM places.price_report_check c
  JOIN places.fleet_price_report r ON r.id = c.report_id
  WHERE r.fuel_entry_id = 'price-engine-nograde';

  IF status <> 'review' OR NOT ('GRADE_UNKNOWN' = ANY (reasons)) OR ('OUT_OF_BOUNDS' = ANY (reasons)) THEN
    RAISE EXCEPTION 'unknown grade should only be grade unknown, status % reasons %', status, reasons;
  END IF;

  BEGIN
    PERFORM places.price_engine_review('fleet', report_id, 'approved', null, null);
    RAISE EXCEPTION 'approve on an unknown grade should be refused';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Set the grade first%' THEN
        RAISE;
      END IF;
  END;
END $$;

INSERT INTO places.place (id, place_type, name, lat, lng, status, pin_state)
VALUES ('price-engine-other', 'gas_station', 'Engine other', 18.01, -76.79, 'verified', 'confirmed');

UPDATE places.fleet_price_report
SET place_id = 'price-engine-other'
WHERE fuel_entry_id = 'price-engine-c';

DO $$
DECLARE
  moved int;
BEGIN
  SELECT count(*) INTO moved
  FROM places.price_current
  WHERE place_id = 'price-engine-other' AND grade = 'e10_87' AND price_per_litre > 0;
  IF moved <> 1 THEN
    RAISE EXCEPTION 'moving a report should publish the new station';
  END IF;
END $$;

-- Station analytics. Isolated by brand so live stations do not change the median.
INSERT INTO places.brand (slug, name)
VALUES ('station-analytics-check', 'Analytics Check');

INSERT INTO places.place (id, place_type, name, lat, lng, status, pin_state, pcode, parish, brand_id)
SELECT 'analytics-a', 'gas_station', 'Analytics Andrew', 18.02, -76.80, 'pending', 'unchecked', 'JM06', 'Kingston', id
FROM places.brand WHERE slug = 'station-analytics-check';

INSERT INTO places.place (id, place_type, name, lat, lng, status, pin_state, pcode, parish, brand_id)
SELECT 'analytics-b', 'gas_station', 'Analytics Clarendon', 18.00, -77.20, 'verified', 'unchecked', 'JM01', 'Clarendon', id
FROM places.brand WHERE slug = 'station-analytics-check';

INSERT INTO places.place (id, place_type, name, lat, lng, status, pin_state, pcode, parish, brand_id)
SELECT 'analytics-c', 'gas_station', 'Analytics Unpriced', 18.01, -77.21, 'pending', 'unchecked', 'JM01', NULL, id
FROM places.brand WHERE slug = 'station-analytics-check';

INSERT INTO fuel.petrojam_prices (price_date, gasolene_87, gasolene_90, auto_diesel, ulsd)
VALUES (date '2026-10-15', 206.31, 210.00, 190.00, 195.00)
ON CONFLICT (price_date) DO UPDATE
SET gasolene_87 = excluded.gasolene_87;

INSERT INTO places.fleet_price_report (
  fuel_entry_id, organization_id, driver_id, place_id, grade, grade_source,
  litres, amount, station_state, reported_at
)
SELECT * FROM (VALUES
  ('analytics-a1', 'org-analytics', 'driver-a', 'analytics-a', 'e10_87', 'fill', 10::numeric, 2200::numeric, 'verified', now()),
  ('analytics-a2', 'org-analytics', 'driver-a', 'analytics-a', 'e10_87', 'fill', 10::numeric, 2240::numeric, 'verified', now()),
  ('analytics-b1', 'org-analytics', 'driver-b', 'analytics-b', 'e10_87', 'fill', 10::numeric, 2400::numeric, 'verified', now()),
  ('analytics-b2', 'org-analytics', 'driver-b', 'analytics-b', 'e10_87', 'fill', 10::numeric, 2440::numeric, 'verified', now()),
  ('analytics-dup', 'org-analytics', 'driver-a', 'analytics-a', 'e10_87', 'fill', 10::numeric, 2210::numeric, 'verified', now()),
  ('analytics-rej', 'org-analytics', 'driver-a', 'analytics-a', 'e10_87', 'fill', 10::numeric, 2230::numeric, 'verified', now()),
  ('analytics-prev', 'org-analytics', 'driver-b', 'analytics-b', 'e10_87', 'fill', 10::numeric, 2100::numeric, 'verified',
    (SELECT max(price_date) FROM fuel.petrojam_prices WHERE price_date < places.latest_petrojam_date()) + interval '1 day')
) AS v(fuel_entry_id, organization_id, driver_id, place_id, grade, grade_source, litres, amount, station_state, reported_at);

UPDATE places.price_report_check c
SET status = 'accepted', weight = 1
FROM places.fleet_price_report r
WHERE c.source = 'fleet' AND c.report_id = r.id
  AND r.fuel_entry_id IN ('analytics-a1', 'analytics-a2', 'analytics-b1', 'analytics-b2', 'analytics-prev');

UPDATE places.price_report_check c
SET status = 'duplicate', weight = 0
FROM places.fleet_price_report r
WHERE c.source = 'fleet' AND c.report_id = r.id
  AND r.fuel_entry_id = 'analytics-dup';

UPDATE places.price_report_check c
SET status = 'rejected', weight = 0
FROM places.fleet_price_report r
WHERE c.source = 'fleet' AND c.report_id = r.id
  AND r.fuel_entry_id = 'analytics-rej';

SELECT places.price_engine_publish('analytics-a', 'e10_87');
SELECT places.price_engine_publish('analytics-b', 'e10_87');

DO $$
DECLARE
  brand uuid;
  week date;
  payload jsonb;
  point jsonb;
  station_a jsonb;
  station_c jsonb;
  parish_name text;
  petrojam numeric;
  pump numeric;
  n_reports int;
  scope_n int;
  priced_n int;
  parish_n int;
  score int;
  failing int;
  expected_fail int;
  total int;
BEGIN
  SELECT id INTO brand FROM places.brand WHERE slug = 'station-analytics-check';
  week := places.latest_petrojam_date();
  petrojam := places.wholesale_on('e10_87', week);
  payload := places.station_analytics('e10_87', week, NULL, brand, false);

  pump := (payload #>> '{kpis,pumpMedian}')::numeric;
  n_reports := (payload #>> '{kpis,nReports}')::int;
  scope_n := (payload #>> '{kpis,stationsInScope}')::int;
  priced_n := (payload #>> '{kpis,stationsPriced}')::int;
  IF pump IS NULL OR abs(pump - 232) > 0.05 THEN
    RAISE EXCEPTION 'pump median expected 232, got %', pump;
  END IF;
  IF n_reports <> 4 THEN
    RAISE EXCEPTION 'expected 4 counted reports, got %', n_reports;
  END IF;
  IF scope_n <> 3 OR priced_n <> 2 THEN
    RAISE EXCEPTION 'scope % priced %', scope_n, priced_n;
  END IF;
  IF petrojam IS NULL OR abs(((payload #>> '{meta,petrojam}')::numeric) - petrojam) > 0.001 THEN
    RAISE EXCEPTION 'petrojam on the page does not match wholesale_on';
  END IF;
  IF week = date '2026-10-22' AND abs(petrojam - 201.81) > 0.02 THEN
    RAISE EXCEPTION '22 Oct E10-87 should be 201.81, got %', petrojam;
  END IF;
  IF abs((pump - petrojam) - ((payload #>> '{kpis,pumpMedian}')::numeric - (payload #>> '{meta,petrojam}')::numeric)) > 0.001 THEN
    RAISE EXCEPTION 'gap inputs drifted';
  END IF;

  SELECT elem INTO point
  FROM jsonb_array_elements(payload->'trend') elem
  WHERE elem->>'week' = week::text;
  IF point IS NULL OR (point->>'reports')::int <> 4 OR (point->>'stations')::int <> 2 THEN
    RAISE EXCEPTION 'trend should count 4 accepted reports at 2 stations, got %', point;
  END IF;
  IF abs((point->>'pumpMedian')::numeric - 232) > 0.05 THEN
    RAISE EXCEPTION 'trend median expected 232, got %', point->>'pumpMedian';
  END IF;

  parish_n := jsonb_array_length(payload->'parishes');
  IF parish_n <> 14 THEN
    RAISE EXCEPTION 'expected 14 parishes, got %', parish_n;
  END IF;

  SELECT name INTO parish_name FROM geo.boundaries WHERE admin_level = 1 AND pcode = 'JM06';
  IF parish_name IS NULL THEN
    RAISE EXCEPTION 'JM06 boundary missing';
  END IF;
  SELECT elem INTO station_a
  FROM jsonb_array_elements(payload->'stations') elem
  WHERE elem->>'placeId' = 'analytics-a';
  IF station_a->>'parish' <> parish_name OR station_a->>'parish' = 'Kingston' THEN
    RAISE EXCEPTION 'Kingston text with JM06 should be %, got %', parish_name, station_a->>'parish';
  END IF;
  IF station_a->>'parishTextMismatch' <> 'true' THEN
    RAISE EXCEPTION 'parish text mismatch was not flagged';
  END IF;

  SELECT elem INTO station_c
  FROM jsonb_array_elements(payload->'stations') elem
  WHERE elem->>'placeId' = 'analytics-c';
  IF station_c IS NULL OR jsonb_typeof(station_c->'price') <> 'null' THEN
    RAISE EXCEPTION 'unpriced station should stay in the list with a null price';
  END IF;

  PERFORM fleet.score_master_data();
  SELECT q.score, q.failing INTO score, failing
  FROM fleet.dataset_quality q
  WHERE q.dataset = 'stations';
  SELECT count(*) INTO total FROM fleet.stations;
  SELECT count(*) INTO expected_fail FROM fleet.station_quality WHERE NOT coalesce(complete, false);
  IF failing IS DISTINCT FROM expected_fail THEN
    RAISE EXCEPTION 'failing % does not match incomplete stations %', failing, expected_fail;
  END IF;
  IF expected_fail > 0 AND score >= 100 THEN
    RAISE EXCEPTION 'station score stayed at 100 with % incomplete', expected_fail;
  END IF;
  IF total > 0 AND score IS DISTINCT FROM ((total - expected_fail) * 100) / total THEN
    RAISE EXCEPTION 'score % is not the incomplete share of %', score, total;
  END IF;
END $$;

ROLLBACK;
