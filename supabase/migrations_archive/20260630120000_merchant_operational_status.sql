-- Merchant operational lifecycle (post-approval suspend/deactivate)

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS operational_status text NOT NULL DEFAULT 'active'
    CHECK (operational_status IN ('active', 'suspended', 'deactivated')),
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_reason text,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS admin_assigned_to uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS admin_internal_notes text;

CREATE INDEX IF NOT EXISTS idx_merchants_operational_status
  ON delivery.merchants(operational_status);

-- Approved merchants default to active operational status
UPDATE delivery.merchants
SET operational_status = 'active'
WHERE verification_status = 'approved' AND operational_status IS DISTINCT FROM 'active';

-- is_active = approved verification AND active operational status
CREATE OR REPLACE FUNCTION delivery.sync_merchant_active_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.verification_status = 'approved' AND NEW.operational_status = 'active' THEN
    NEW.is_active := true;
    NEW.is_verified := true;
    IF NEW.verified_at IS NULL THEN
      NEW.verified_at := now();
    END IF;
  ELSE
    NEW.is_active := false;
    IF NEW.verification_status <> 'approved' THEN
      NEW.is_verified := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_merchant_active_status ON delivery.merchants;
CREATE TRIGGER trigger_sync_merchant_active_status
  BEFORE INSERT OR UPDATE OF verification_status, operational_status ON delivery.merchants
  FOR EACH ROW
  EXECUTE FUNCTION delivery.sync_merchant_active_status();

-- Re-sync existing rows
UPDATE delivery.merchants
SET operational_status = operational_status;
