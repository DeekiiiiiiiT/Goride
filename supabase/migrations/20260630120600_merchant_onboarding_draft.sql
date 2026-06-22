-- Partner onboarding draft: server-side wizard progress on delivery.merchants
-- Backward-compatible: existing merchants backfilled as onboarding_status = 'submitted'

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'submitted'
    CHECK (onboarding_status IN ('draft', 'submitted')),
  ADD COLUMN IF NOT EXISTS wizard_step smallint NOT NULL DEFAULT 1
    CHECK (wizard_step BETWEEN 1 AND 6),
  ADD COLUMN IF NOT EXISTS wizard_step_key text,
  ADD COLUMN IF NOT EXISTS onboarding_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_onboarding_activity_at timestamptz;

-- Allow true draft rows (no restaurant name yet)
ALTER TABLE delivery.merchants
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN slug DROP NOT NULL,
  ALTER COLUMN address DROP NOT NULL;

ALTER TABLE delivery.merchants
  ALTER COLUMN submitted_at DROP NOT NULL,
  ALTER COLUMN submitted_at DROP DEFAULT;

-- Submitted merchants must have required fields
ALTER TABLE delivery.merchants
  DROP CONSTRAINT IF EXISTS merchants_onboarding_submitted_fields;

ALTER TABLE delivery.merchants
  ADD CONSTRAINT merchants_onboarding_submitted_fields CHECK (
    onboarding_status = 'draft'
    OR (name IS NOT NULL AND slug IS NOT NULL AND submitted_at IS NOT NULL)
  );

-- Backfill existing production merchants
UPDATE delivery.merchants
SET
  onboarding_status = 'submitted',
  wizard_step = 6,
  wizard_step_key = COALESCE(wizard_step_key, 'bank-details'),
  last_onboarding_activity_at = COALESCE(last_onboarding_activity_at, submitted_at, updated_at, created_at)
WHERE submitted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merchants_onboarding_status
  ON delivery.merchants (onboarding_status, last_onboarding_activity_at DESC NULLS LAST);

COMMENT ON COLUMN delivery.merchants.onboarding_status IS
  'draft = wizard in progress; submitted = application submitted for review';
COMMENT ON COLUMN delivery.merchants.onboarding_draft IS
  'Partial partner wizard form JSON (no file blobs); server source of truth during onboarding';
