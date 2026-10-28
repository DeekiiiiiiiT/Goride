-- Backfill service_line on cost rows from linked trips where possible.
-- toll_ledger has trip_id; fuel_entries and expense_journal use transaction_id / payload_json.

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

-- Fuel: match trip via transaction_id column or payload_json trip refs.
UPDATE fleet.fuel_entries fe
SET service_line = CASE
  WHEN t.service_line IN ('rideshare', 'rush_delivery') THEN t.service_line
  WHEN t.platform = 'Roam Rush' THEN 'rush_delivery'
  ELSE 'rideshare'
END
FROM fleet.trips t
WHERE fe.service_line IS NULL
  AND (
    fe.transaction_id IS NOT NULL AND fe.transaction_id = t.id
    OR (fe.payload_json->>'tripId') = t.id
    OR (fe.payload_json->'metadata'->>'tripId') = t.id
    OR (fe.payload_json->'metadata'->>'originalTransactionId') = t.id
  );

-- Expense journal: match via payload_json trip/document refs when present.
UPDATE fleet.expense_journal ej
SET service_line = CASE
  WHEN t.service_line IN ('rideshare', 'rush_delivery') THEN t.service_line
  WHEN t.platform = 'Roam Rush' THEN 'rush_delivery'
  ELSE 'rideshare'
END
FROM fleet.trips t
WHERE ej.service_line IS NULL
  AND (
    (ej.payload_json->>'tripId') = t.id
    OR (ej.payload_json->'metadata'->>'tripId') = t.id
  );
