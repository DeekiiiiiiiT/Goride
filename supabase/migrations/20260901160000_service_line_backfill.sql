-- Backfill service_line on cost rows from linked trips where possible.
UPDATE fleet.toll_ledger tl
SET service_line = CASE
  WHEN t.service_line IN ('rideshare', 'rush_delivery') THEN t.service_line
  WHEN t.platform = 'Roam Rush' THEN 'rush_delivery'
  ELSE 'rideshare'
END
FROM fleet.trips t
WHERE tl.trip_id IS NOT NULL
  AND tl.trip_id = t.id
  AND tl.service_line IS NULL;

UPDATE fleet.fuel_entries fe
SET service_line = CASE
  WHEN t.service_line IN ('rideshare', 'rush_delivery') THEN t.service_line
  WHEN t.platform = 'Roam Rush' THEN 'rush_delivery'
  ELSE 'rideshare'
END
FROM fleet.trips t
WHERE fe.trip_id IS NOT NULL
  AND fe.trip_id = t.id
  AND fe.service_line IS NULL;

UPDATE fleet.expense_journal ej
SET service_line = CASE
  WHEN t.service_line IN ('rideshare', 'rush_delivery') THEN t.service_line
  WHEN t.platform = 'Roam Rush' THEN 'rush_delivery'
  ELSE 'rideshare'
END
FROM fleet.trips t
WHERE ej.trip_id IS NOT NULL
  AND ej.trip_id = t.id
  AND ej.service_line IS NULL;
