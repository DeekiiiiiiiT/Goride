-- Fuel logs must look up by expense id on a real column.
-- Silent JSON-path filters after the fleet-table cutover linked new
-- approvals to an unrelated oldest fuel_entry (legacy_kv_id ASC).

ALTER TABLE fleet.fuel_entries
  ADD COLUMN IF NOT EXISTS transaction_id text;

UPDATE fleet.fuel_entries
SET transaction_id = COALESCE(
  NULLIF(transaction_id, ''),
  NULLIF(payload_json->>'transactionId', ''),
  NULLIF(payload_json->'metadata'->>'originalTransactionId', ''),
  NULLIF(payload_json->'metadata'->>'sourceId', '')
)
WHERE transaction_id IS NULL
   OR transaction_id = '';

CREATE INDEX IF NOT EXISTS fleet_fuel_entries_transaction_id_idx
  ON fleet.fuel_entries (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- Refresh PostgREST view so the new column is exposed
CREATE OR REPLACE VIEW public.fleet_fuel_entries AS SELECT * FROM fleet.fuel_entries;
GRANT SELECT ON public.fleet_fuel_entries TO authenticated;
GRANT ALL ON public.fleet_fuel_entries TO service_role;
