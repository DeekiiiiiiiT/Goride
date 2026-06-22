-- Order disputes and merchant payout adjustments

CREATE TABLE IF NOT EXISTS delivery.order_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  raised_by text NOT NULL DEFAULT 'customer'
    CHECK (raised_by IN ('customer', 'merchant', 'courier', 'admin')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'refunded', 'denied')),
  resolution_notes text,
  refund_amount numeric,
  handled_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_disputes_order ON delivery.order_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_status ON delivery.order_disputes(status);

ALTER TABLE delivery.order_disputes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS payments.merchant_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  payout_id uuid REFERENCES payments.merchant_payouts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_adjustments_merchant
  ON payments.merchant_adjustments(merchant_id);

ALTER TABLE payments.merchant_adjustments ENABLE ROW LEVEL SECURITY;

ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS review_hidden boolean NOT NULL DEFAULT false;
