-- Merchant GCT registration flag + backfill active merchants charging tax today.
-- Ops should verify TRN before relying on backfill for edge cases.

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS gct_registered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN delivery.merchants.gct_registered IS
  'True when merchant is GCT-registered and may charge GCT on taxable food supplies.';

-- Merchants with TRN on file or active/approved status assumed registered (ops review recommended).
UPDATE delivery.merchants
SET gct_registered = true
WHERE gct_registered = false
  AND (
    (tax_id IS NOT NULL AND trim(tax_id) <> '')
    OR operational_status = 'active'
    OR verification_status = 'approved'
  );

-- POS merchants with zero rate but registered: default to statutory 16.5% until Dominion KV is read at runtime.
UPDATE delivery.merchants
SET pos_tax_rate_percent = 16.5
WHERE gct_registered = true
  AND pos_tax_rate_percent = 0
  AND capabilities @> ARRAY['in_store_operations']::text[];
