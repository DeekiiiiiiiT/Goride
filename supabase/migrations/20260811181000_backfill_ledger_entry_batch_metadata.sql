-- Stamp batchId/description/isReconciled/vehicleId from KV money backup onto ledger.entries.metadata
-- so batch audit/delete-preview work after ledger_event:* retirement.
UPDATE ledger.entries e
SET metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'batchId', nullif(b.value->>'batchId', ''),
  'description', nullif(b.value->>'description', ''),
  'vehicleId', nullif(b.value->>'vehicleId', ''),
  'isReconciled', CASE
    WHEN lower(coalesce(b.value->>'isReconciled', '')) IN ('true', 't', '1') THEN to_jsonb(true)
    WHEN lower(coalesce(b.value->>'isReconciled', '')) IN ('false', 'f', '0') THEN to_jsonb(false)
    ELSE NULL
  END
))
FROM ledger.source_receipts r
JOIN ledger.kv_money_backup_20260811 b
  ON b.key = 'ledger_event:' || r.source_id
WHERE r.ledger_entry_id = e.id
  AND r.source_system = 'kv_ledger_event';
