-- Merchant payout gate: admin-verified payout_ready + test-merchant bypass for seeds/dev.

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS payout_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_test_merchant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_ready_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN delivery.merchants.payout_ready IS
  'Admin-verified: merchant may go live and accept paid orders.';
COMMENT ON COLUMN delivery.merchants.is_test_merchant IS
  'Seed/dev store: bypasses payout gate for E2E and internal testing.';

-- Soft-launch seed merchants — full test bypass without manual admin flip.
UPDATE delivery.merchants
SET is_test_merchant = true
WHERE slug IN ('island-grill', 'marios-pizza', 'burger-spot', 'green-life');

-- Freeze admin-only payout columns on owner UPDATE (same pattern as commission_rate).
DROP POLICY IF EXISTS "Merchants update own editable fields" ON delivery.merchants;

CREATE POLICY "Merchants update own editable fields"
  ON delivery.merchants
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND verification_status IS NOT DISTINCT FROM (SELECT m2.verification_status FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND operational_status IS NOT DISTINCT FROM (SELECT m2.operational_status FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND commission_rate IS NOT DISTINCT FROM (SELECT m2.commission_rate FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND suspended_at IS NOT DISTINCT FROM (SELECT m2.suspended_at FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND payout_ready IS NOT DISTINCT FROM (SELECT m2.payout_ready FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND is_test_merchant IS NOT DISTINCT FROM (SELECT m2.is_test_merchant FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND payout_ready_at IS NOT DISTINCT FROM (SELECT m2.payout_ready_at FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND payout_ready_by IS NOT DISTINCT FROM (SELECT m2.payout_ready_by FROM delivery.merchants m2 WHERE m2.id = merchants.id)
  );
