-- MOI-1: Match-on-Ingest foundations (indexes only — no data/behavior change).
--
-- toll_ledger:* and trip:* records live as JSONB blobs inside the generic
-- kv_store_37f42386 table (key TEXT PK, value JSONB), keyed only by an exact
-- key or key-prefix lookup today. GET /unreconciled therefore loads every
-- toll_ledger/trip row into memory on every request and filters/matches in
-- JS, which is why it's slow and why an unbounded auto-match scan already hit
-- Supabase's edge CPU limit (HTTP 546) once.
--
-- These are pure additive expression indexes, partial-scoped to the relevant
-- key prefix (kv_store_37f42386.key is already indexed, so the "WHERE key
-- LIKE 'prefix:%'" partial-index condition is cheap to evaluate). An index
-- cannot change what a query returns — only how fast a matching query runs —
-- so this migration changes zero existing behavior on its own. Nothing reads
-- via these indexes yet; that starts in a later step, gated behind the
-- separate `matchOnIngestEnabled` feature flag.

CREATE INDEX IF NOT EXISTS idx_kv_toll_ledger_driver_date
  ON kv_store_37f42386 ((value->>'driverId'), (value->>'date'))
  WHERE key LIKE 'toll_ledger:%';

CREATE INDEX IF NOT EXISTS idx_kv_toll_ledger_vehicle_date
  ON kv_store_37f42386 ((value->>'vehicleId'), (value->>'date'))
  WHERE key LIKE 'toll_ledger:%';

CREATE INDEX IF NOT EXISTS idx_kv_trip_driver_date
  ON kv_store_37f42386 ((value->>'driverId'), (value->>'date'))
  WHERE key LIKE 'trip:%';

CREATE INDEX IF NOT EXISTS idx_kv_trip_vehicle_date
  ON kv_store_37f42386 ((value->>'vehicleId'), (value->>'date'))
  WHERE key LIKE 'trip:%';

-- Needed by the later trip-delete/trip-edit invalidation lookup (find every
-- toll currently pointing at a given trip id).
CREATE INDEX IF NOT EXISTS idx_kv_toll_ledger_matched_trip_id
  ON kv_store_37f42386 ((value->>'matchedTripId'))
  WHERE key LIKE 'toll_ledger:%';

-- Needed by the reverse (trip-side) re-match lookup — restricts the scan to
-- tolls that are still just a suggestion (never formally resolved), so an
-- already-resolved toll is never silently touched.
CREATE INDEX IF NOT EXISTS idx_kv_toll_ledger_match_status
  ON kv_store_37f42386 ((value->>'matchStatus'))
  WHERE key LIKE 'toll_ledger:%';
