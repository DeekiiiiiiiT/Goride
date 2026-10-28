-- Merchant read access to payout and bank account records (partner app)

CREATE POLICY "Merchants view own payouts"
  ON payments.merchant_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM delivery.merchants m
      WHERE m.id = merchant_payouts.merchant_id
        AND m.owner_id = auth.uid()
    )
  );

CREATE POLICY "Merchants view own bank accounts"
  ON payments.merchant_bank_accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM delivery.merchants m
      WHERE m.id = merchant_bank_accounts.merchant_id
        AND m.owner_id = auth.uid()
    )
  );
