-- Merchant payout hold support: notes column + held status documentation
ALTER TABLE payments.merchant_payouts
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE payments.courier_payouts
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN payments.merchant_payouts.notes IS 'Admin hold/release reason or settlement notes';
COMMENT ON COLUMN payments.courier_payouts.notes IS 'Admin hold/release reason or settlement notes';
