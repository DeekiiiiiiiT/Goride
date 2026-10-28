-- Schema audit Wave 2: merchant money FKs, amount/status CHECKs, taxonomy write lock

-- Merchant payout / bank FKs (orphans already verified = 0)
ALTER TABLE payments.merchant_payouts
  DROP CONSTRAINT IF EXISTS merchant_payouts_merchant_id_fkey;
ALTER TABLE payments.merchant_payouts
  ADD CONSTRAINT merchant_payouts_merchant_id_fkey
  FOREIGN KEY (merchant_id) REFERENCES delivery.merchants(id) ON DELETE RESTRICT;

ALTER TABLE payments.merchant_bank_accounts
  DROP CONSTRAINT IF EXISTS merchant_bank_accounts_merchant_id_fkey;
ALTER TABLE payments.merchant_bank_accounts
  ADD CONSTRAINT merchant_bank_accounts_merchant_id_fkey
  FOREIGN KEY (merchant_id) REFERENCES delivery.merchants(id) ON DELETE RESTRICT;

-- Non-negative money guards
ALTER TABLE delivery.orders
  DROP CONSTRAINT IF EXISTS orders_amounts_nonneg_check;
ALTER TABLE delivery.orders
  ADD CONSTRAINT orders_amounts_nonneg_check
  CHECK (
    COALESCE(subtotal, 0) >= 0
    AND COALESCE(delivery_fee, 0) >= 0
    AND COALESCE(platform_fee, 0) >= 0
    AND COALESCE(tax, 0) >= 0
    AND COALESCE(tip, 0) >= 0
    AND COALESCE(discount, 0) >= 0
    AND COALESCE(total, 0) >= 0
  );

ALTER TABLE payments.transactions
  DROP CONSTRAINT IF EXISTS transactions_amounts_nonneg_check;
ALTER TABLE payments.transactions
  ADD CONSTRAINT transactions_amounts_nonneg_check
  CHECK (
    COALESCE(amount, 0) >= 0
    AND COALESCE(fee, 0) >= 0
    AND COALESCE(net_amount, 0) >= 0
  );

ALTER TABLE payments.merchant_payouts
  DROP CONSTRAINT IF EXISTS merchant_payouts_amounts_nonneg_check;
ALTER TABLE payments.merchant_payouts
  ADD CONSTRAINT merchant_payouts_amounts_nonneg_check
  CHECK (
    COALESCE(amount, 0) >= 0
    AND COALESCE(fee, 0) >= 0
    AND COALESCE(net_amount, 0) >= 0
  );

ALTER TABLE delivery.merchants
  DROP CONSTRAINT IF EXISTS merchants_commission_rate_check;
ALTER TABLE delivery.merchants
  ADD CONSTRAINT merchants_commission_rate_check
  CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1));

-- Order status from app OrderStatus + legacy 'paid' seen in prod
ALTER TABLE delivery.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE delivery.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'placed', 'accepted', 'preparing', 'ready', 'picked_up',
    'in_transit', 'delivered', 'completed', 'cancelled', 'paid'
  ));

-- Taxonomy: RLS already SELECT-only (Wave RLS-0). Revoke direct DML from clients.
REVOKE INSERT, UPDATE, DELETE ON delivery.merchant_business_types FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON delivery.merchant_business_type_sections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON delivery.merchant_business_types TO anon, authenticated;
GRANT SELECT ON delivery.merchant_business_type_sections TO anon, authenticated;
GRANT ALL ON delivery.merchant_business_types TO service_role;
GRANT ALL ON delivery.merchant_business_type_sections TO service_role;
