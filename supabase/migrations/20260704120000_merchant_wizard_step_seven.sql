-- Partner wizard is 7 steps (bank/payouts removed from signup).
-- Previous constraint only allowed wizard_step 1–6.

ALTER TABLE delivery.merchants
  DROP CONSTRAINT IF EXISTS merchants_wizard_step_check;

ALTER TABLE delivery.merchants
  ADD CONSTRAINT merchants_wizard_step_check CHECK (wizard_step BETWEEN 1 AND 7);

COMMENT ON COLUMN delivery.merchants.wizard_step IS
  'Partner onboarding wizard progress (1–7). Final step is verification.';
