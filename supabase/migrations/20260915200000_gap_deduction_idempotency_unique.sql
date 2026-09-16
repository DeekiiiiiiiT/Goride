-- R-6: concurrency backstop for stop-to-stop Gap_Deduction charges.
-- One Pending/posted gap charge per org + idempotency key (bucket-scoped).
CREATE UNIQUE INDEX IF NOT EXISTS fleet_transactions_gap_deduction_idempotency_uidx
ON fleet.transactions (
  organization_id,
  (payload_json -> 'metadata' ->> 'idempotencyKey')
)
WHERE (payload_json -> 'metadata' ->> 'transactionType') = 'Gap_Deduction'
  AND nullif(payload_json -> 'metadata' ->> 'idempotencyKey', '') IS NOT NULL;
