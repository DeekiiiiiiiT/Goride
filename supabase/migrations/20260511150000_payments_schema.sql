-- Payments schema for Roam Dash
-- Created: 2026-05-11
-- Supports WiPay and PayPal for Jamaica market

CREATE SCHEMA IF NOT EXISTS payments;

-- Payment intents (pre-transaction records)
CREATE TABLE payments.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES delivery.orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES delivery.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text DEFAULT 'JMD',
  status text DEFAULT 'pending',
  provider text,
  provider_intent_id text,
  provider_data jsonb DEFAULT '{}',
  client_secret text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Payment transactions (completed payments)
CREATE TABLE payments.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid REFERENCES payments.payment_intents(id),
  order_id uuid REFERENCES delivery.orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES delivery.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  fee numeric DEFAULT 0,
  net_amount numeric NOT NULL,
  currency text DEFAULT 'JMD',
  status text NOT NULL,
  provider text NOT NULL,
  provider_transaction_id text,
  provider_data jsonb DEFAULT '{}',
  payment_method text,
  failure_reason text,
  refund_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Refunds
CREATE TABLE payments.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES payments.transactions(id) ON DELETE CASCADE,
  order_id uuid REFERENCES delivery.orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text DEFAULT 'JMD',
  reason text,
  status text DEFAULT 'pending',
  provider_refund_id text,
  initiated_by text,
  initiated_by_id uuid,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Merchant payouts (settlements)
CREATE TABLE payments.merchant_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  amount numeric NOT NULL,
  fee numeric DEFAULT 0,
  net_amount numeric NOT NULL,
  currency text DEFAULT 'JMD',
  status text DEFAULT 'pending',
  provider text,
  provider_payout_id text,
  bank_account_last4 text,
  period_start date,
  period_end date,
  order_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Courier payouts
CREATE TABLE payments.courier_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL,
  amount numeric NOT NULL,
  currency text DEFAULT 'JMD',
  status text DEFAULT 'pending',
  provider text,
  provider_payout_id text,
  period_start date,
  period_end date,
  delivery_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Payment methods stored for customers
CREATE TABLE payments.customer_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES delivery.customers(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_method_id text,
  type text NOT NULL,
  last4 text,
  brand text,
  exp_month integer,
  exp_year integer,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Merchant bank accounts for payouts
CREATE TABLE payments.merchant_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  provider text,
  provider_account_id text,
  bank_name text,
  account_holder_name text,
  account_last4 text,
  account_type text,
  routing_number_last4 text,
  currency text DEFAULT 'JMD',
  is_default boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_payment_intents_order ON payments.payment_intents(order_id);
CREATE INDEX idx_payment_intents_customer ON payments.payment_intents(customer_id);
CREATE INDEX idx_payment_intents_status ON payments.payment_intents(status);
CREATE INDEX idx_transactions_order ON payments.transactions(order_id);
CREATE INDEX idx_transactions_customer ON payments.transactions(customer_id);
CREATE INDEX idx_merchant_payouts_merchant ON payments.merchant_payouts(merchant_id);
CREATE INDEX idx_merchant_payouts_status ON payments.merchant_payouts(status);
CREATE INDEX idx_courier_payouts_courier ON payments.courier_payouts(courier_id);

-- RLS
ALTER TABLE payments.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.merchant_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.courier_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.customer_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.merchant_bank_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customers viewing their own payment data
CREATE POLICY "Customers view own payment intents" ON payments.payment_intents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery.customers 
      WHERE id = payment_intents.customer_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Customers view own transactions" ON payments.transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery.customers 
      WHERE id = transactions.customer_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Customers manage own payment methods" ON payments.customer_payment_methods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM delivery.customers 
      WHERE id = customer_payment_methods.customer_id AND user_id = auth.uid()
    )
  );

-- Update trigger for transactions
CREATE TRIGGER trigger_transactions_updated_at
  BEFORE UPDATE ON payments.transactions
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

COMMENT ON SCHEMA payments IS 'Payment processing for Roam Dash';
COMMENT ON TABLE payments.payment_intents IS 'Pre-authorization payment records';
COMMENT ON TABLE payments.transactions IS 'Completed payment transactions';
COMMENT ON TABLE payments.merchant_payouts IS 'Settlement payouts to merchants';
COMMENT ON TABLE payments.courier_payouts IS 'Delivery fee payouts to couriers';
