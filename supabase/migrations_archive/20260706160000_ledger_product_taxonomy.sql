-- Phase 1: Enterprise Ledger Product Taxonomy
-- Aligns ledger products with actual business model:
--   Rideshare: roam_rides (passengers), roam_driver (earnings), roam_fleet (fleet ops)
--   Delivery: roam_dash (customer payments), roam_partner (merchant), roam_courier (courier)
--   System: platform (internal clearing)

-- Drop old constraint and add new one with all product values
ALTER TABLE ledger.entries DROP CONSTRAINT IF EXISTS entries_product_check;

ALTER TABLE ledger.entries ADD CONSTRAINT entries_product_check CHECK (
  product IN (
    -- Rideshare business line
    'roam_rides',      -- Passenger payments (card/cash settlement)
    'roam_driver',     -- Driver earnings (from any source: Roam rides, Uber, InDrive)
    'roam_fleet',      -- Fleet-level operations (tolls, fuel, org clearing)
    -- Delivery business line
    'roam_dash',       -- Customer order payments
    'roam_partner',    -- Merchant settlements and payouts
    'roam_courier',    -- Courier earnings and payouts
    -- System / internal
    'platform',        -- Cross-product platform operations
    -- Legacy values (for backward compatibility during migration)
    'rides',
    'fleet', 
    'dash'
  )
);

-- Remap existing entries to new taxonomy
-- Note: This is idempotent - safe to run multiple times

-- rides → roam_rides (passenger-side payments)
-- Entries with rider accounts stay as roam_rides
UPDATE ledger.entries e
SET product = 'roam_rides'
WHERE e.product = 'rides'
  AND EXISTS (
    SELECT 1 FROM ledger.accounts a 
    WHERE (a.id = e.debit_account_id OR a.id = e.credit_account_id)
      AND a.owner_role = 'rider'
  );

-- rides → roam_driver (driver earnings from Roam rides)
-- Entries with driver accounts and no rider accounts
UPDATE ledger.entries e
SET product = 'roam_driver'
WHERE e.product = 'rides'
  AND EXISTS (
    SELECT 1 FROM ledger.accounts a 
    WHERE (a.id = e.debit_account_id OR a.id = e.credit_account_id)
      AND a.owner_role = 'driver'
  )
  AND NOT EXISTS (
    SELECT 1 FROM ledger.accounts a 
    WHERE (a.id = e.debit_account_id OR a.id = e.credit_account_id)
      AND a.owner_role = 'rider'
  );

-- Any remaining 'rides' entries go to roam_rides (passenger-centric default)
UPDATE ledger.entries
SET product = 'roam_rides'
WHERE product = 'rides';

-- fleet → roam_driver (canonical driver earnings from Uber/InDrive imports)
-- Entries with driver accounts
UPDATE ledger.entries e
SET product = 'roam_driver'
WHERE e.product = 'fleet'
  AND EXISTS (
    SELECT 1 FROM ledger.accounts a 
    WHERE (a.id = e.debit_account_id OR a.id = e.credit_account_id)
      AND a.owner_role = 'driver'
  );

-- fleet → roam_fleet (org-level operations: tolls, org clearing)
-- Entries with org: account keys or no driver
UPDATE ledger.entries e
SET product = 'roam_fleet'
WHERE e.product = 'fleet'
  AND (
    EXISTS (
      SELECT 1 FROM ledger.accounts a 
      WHERE (a.id = e.debit_account_id OR a.id = e.credit_account_id)
        AND a.account_key LIKE 'org:%'
    )
    OR NOT EXISTS (
      SELECT 1 FROM ledger.accounts a 
      WHERE (a.id = e.debit_account_id OR a.id = e.credit_account_id)
        AND a.owner_role = 'driver'
    )
  );

-- Any remaining 'fleet' entries default to roam_fleet
UPDATE ledger.entries
SET product = 'roam_fleet'
WHERE product = 'fleet';

-- dash → roam_partner (merchant settlements)
-- Entries with merchant accounts
UPDATE ledger.entries e
SET product = 'roam_partner'
WHERE e.product = 'dash'
  AND EXISTS (
    SELECT 1 FROM ledger.accounts a 
    WHERE (a.id = e.debit_account_id OR a.id = e.credit_account_id)
      AND a.owner_role = 'merchant'
  );

-- dash → roam_courier (courier payouts)
-- Entries with courier accounts
UPDATE ledger.entries e
SET product = 'roam_courier'
WHERE e.product = 'dash'
  AND EXISTS (
    SELECT 1 FROM ledger.accounts a 
    WHERE (a.id = e.debit_account_id OR a.id = e.credit_account_id)
      AND a.owner_role = 'courier'
  );

-- Any remaining 'dash' entries go to roam_dash (customer payment default)
UPDATE ledger.entries
SET product = 'roam_dash'
WHERE product = 'dash';

-- Add index for product filtering (improves Dominion feed queries)
CREATE INDEX IF NOT EXISTS idx_ledger_entries_product 
  ON ledger.entries(product);

-- Add composite index for business line filtering
CREATE INDEX IF NOT EXISTS idx_ledger_entries_product_effective
  ON ledger.entries(product, effective_at DESC);

COMMENT ON COLUMN ledger.entries.product IS 
  'Business line: roam_rides (passengers), roam_driver (driver earnings), roam_fleet (fleet ops), roam_dash (customer orders), roam_partner (merchants), roam_courier (couriers), platform (internal)';

NOTIFY pgrst, 'reload schema';
