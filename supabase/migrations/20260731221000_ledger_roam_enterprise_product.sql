-- Add roam_enterprise to ledger product taxonomy (Path B Freight billing)
ALTER TABLE ledger.entries DROP CONSTRAINT IF EXISTS entries_product_check;

ALTER TABLE ledger.entries ADD CONSTRAINT entries_product_check CHECK (
  product IN (
    'roam_rides',
    'roam_driver',
    'roam_fleet',
    'roam_dash',
    'roam_partner',
    'roam_courier',
    'roam_enterprise',
    'platform',
    'rides',
    'fleet',
    'dash'
  )
);
