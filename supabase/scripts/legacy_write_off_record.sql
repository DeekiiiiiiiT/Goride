-- Legacy write-off record for Kenny Gregory Rattray.
-- Rebuilt from the rows inserted 2026-10-25 22:34:11 UTC.
-- Dec 29 and Jan 12 store only the forgiven or dropped half.
-- The kept halves are the legacy-balance rows on 2026-10-19 and are not in this file.
-- Safe to re-run. A row that already has the amount and sentence below is left as-is.
-- A row that still has the full week keeps that old amount and sentence in metadata.

INSERT INTO ledger.settlement_movements (
  organization_id,
  driver_id,
  period_anchor,
  kind,
  amount_minor,
  reason,
  idempotency_key,
  approval_state,
  status,
  metadata,
  created_at
)
SELECT
  '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'::uuid,
  '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
  v.period_anchor::date,
  'write_off',
  v.amount_minor,
  v.reason,
  v.idempotency_key,
  'none',
  'posted',
  jsonb_build_object(
    'bucket', v.bucket,
    'sourceWeek', v.period_anchor,
    'legacyAudit', true
  ),
  TIMESTAMPTZ '2026-10-25 22:34:11.233592+00'
FROM (
  VALUES
    (
      'legacy-write-off:73e5b1dc-01b4-45ee-a34a-25a3256b9841:2025-12-08',
      '2025-12-08',
      558673::bigint,
      'dropped',
      'Week of 2025-12-08: the company owed Kenny Gregory Rattray $5586.73. That amount was dropped.'
    ),
    (
      'legacy-write-off:73e5b1dc-01b4-45ee-a34a-25a3256b9841:2025-12-15',
      '2025-12-15',
      -1362348::bigint,
      'forgiven',
      'Week of 2025-12-15: Kenny Gregory Rattray owed $13623.48. That debt was forgiven.'
    ),
    (
      'legacy-write-off:73e5b1dc-01b4-45ee-a34a-25a3256b9841:2025-12-22',
      '2025-12-22',
      -2422101::bigint,
      'forgiven',
      'Week of 2025-12-22: Kenny Gregory Rattray owed $24221.01. That debt was forgiven.'
    ),
    (
      'legacy-write-off:73e5b1dc-01b4-45ee-a34a-25a3256b9841:2025-12-29',
      '2025-12-29',
      -1171474::bigint,
      'forgiven',
      'Week of 2025-12-29: Kenny Gregory Rattray owed $11714.74. That debt was forgiven.'
    ),
    (
      'legacy-write-off:73e5b1dc-01b4-45ee-a34a-25a3256b9841:2026-01-05',
      '2026-01-05',
      -1616256::bigint,
      'forgiven',
      'Week of 2026-01-05: Kenny Gregory Rattray owed $16162.56. That debt was forgiven.'
    ),
    (
      'legacy-write-off:73e5b1dc-01b4-45ee-a34a-25a3256b9841:2026-01-12',
      '2026-01-12',
      260161::bigint,
      'dropped',
      'Week of 2026-01-12: the company owed Kenny Gregory Rattray $2601.61. That amount was dropped.'
    )
) AS v(idempotency_key, period_anchor, amount_minor, bucket, reason)
ON CONFLICT (organization_id, idempotency_key) DO UPDATE
SET
  amount_minor = EXCLUDED.amount_minor,
  reason = EXCLUDED.reason,
  metadata = ledger.settlement_movements.metadata || jsonb_build_object(
    'priorAmountMinor', COALESCE(
      (ledger.settlement_movements.metadata->>'priorAmountMinor')::bigint,
      ledger.settlement_movements.amount_minor
    ),
    'priorReason', COALESCE(
      ledger.settlement_movements.metadata->>'priorReason',
      ledger.settlement_movements.reason
    )
  )
WHERE ledger.settlement_movements.amount_minor IS DISTINCT FROM EXCLUDED.amount_minor
   OR ledger.settlement_movements.reason IS DISTINCT FROM EXCLUDED.reason;
