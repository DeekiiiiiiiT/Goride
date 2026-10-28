-- Verification ops: checklist and document review metadata

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS verification_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN delivery.merchants.verification_checklist IS
  'Admin checklist keys: id_verified, business_proof_verified, bank_verified, hours_verified, menu_preview_verified';

-- merchant_documents already has status, verified_at, verified_by, rejection_reason
