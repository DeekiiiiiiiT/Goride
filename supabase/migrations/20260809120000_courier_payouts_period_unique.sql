-- Phase 0: prevent duplicate courier payout periods (money integrity).
-- Ensure notes column exists, remove duplicate non-terminal rows, then unique constraint.

ALTER TABLE payments.courier_payouts
  ADD COLUMN IF NOT EXISTS notes text;

-- Delete duplicate pending/void rows (keep earliest by created_at). Paid/processing kept + flagged.
WITH ranked AS (
  SELECT
    id,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY courier_id, period_start, period_end
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM payments.courier_payouts
  WHERE period_start IS NOT NULL
    AND period_end IS NOT NULL
)
DELETE FROM payments.courier_payouts cp
USING ranked r
WHERE cp.id = r.id
  AND r.rn > 1
  AND COALESCE(cp.status, '') NOT IN ('paid', 'processing');

WITH ranked_paid AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY courier_id, period_start, period_end
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM payments.courier_payouts
  WHERE period_start IS NOT NULL
    AND period_end IS NOT NULL
    AND status IN ('paid', 'processing')
)
UPDATE payments.courier_payouts cp
SET notes = COALESCE(cp.notes || ' ', '') || 'WARN: duplicate period row — ops review required.'
FROM ranked_paid r
WHERE cp.id = r.id
  AND r.rn > 1;

-- Exclude void so soft-void cleanup remains possible without colliding
CREATE UNIQUE INDEX IF NOT EXISTS courier_payouts_courier_period_uidx
  ON payments.courier_payouts (courier_id, period_start, period_end)
  WHERE period_start IS NOT NULL
    AND period_end IS NOT NULL
    AND COALESCE(status, '') IS DISTINCT FROM 'void';
