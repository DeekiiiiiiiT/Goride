-- Stamp platform/driverId/direction/etc from KV money backup onto ledger.entries.metadata
-- so BF reads work without live ledger_event:* rows after Phase E.
UPDATE ledger.entries e
SET metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'platform', nullif(b.value->>'platform', ''),
  'driverId', nullif(b.value->>'driverId', ''),
  'direction', nullif(b.value->>'direction', ''),
  'paymentMethod', nullif(b.value->>'paymentMethod', ''),
  'periodStart', nullif(b.value->>'periodStart', ''),
  'periodEnd', nullif(b.value->>'periodEnd', ''),
  'category', nullif(b.value->>'category', ''),
  'grossAmount', CASE
    WHEN nullif(b.value->>'grossAmount', '') IS NULL THEN NULL
    WHEN (b.value->>'grossAmount') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (b.value->>'grossAmount')::numeric
    ELSE NULL
  END
))
FROM ledger.source_receipts r
JOIN ledger.kv_money_backup_20260811 b
  ON b.key = 'ledger_event:' || r.source_id
WHERE r.ledger_entry_id = e.id
  AND r.source_system = 'kv_ledger_event';
