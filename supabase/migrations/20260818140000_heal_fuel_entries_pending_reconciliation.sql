-- Office/admin fuel logs with null reconciliationStatus were skipped at Finalize (Pending-only filter).
UPDATE fleet.fuel_entries fe
SET
  payload_json = jsonb_set(
    COALESCE(fe.payload_json, '{}'::jsonb),
    '{reconciliationStatus}',
    '"Pending"'::jsonb
  ),
  updated_at = now()
WHERE COALESCE(fe.payload_json->>'reconciliationStatus', '') = ''
  AND fe.payload_json->'metadata'->>'finalizedByReport' IS NULL
  AND COALESCE(fe.payload_json->>'reconciliationStatus', '') NOT IN ('Verified', 'Archived');
