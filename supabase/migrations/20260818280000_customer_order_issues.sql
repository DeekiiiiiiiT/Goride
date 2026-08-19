-- Customer order issues (support intake). Mirrors courier_delivery_issues.
CREATE TABLE IF NOT EXISTS delivery.customer_order_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES delivery.customers(id) ON DELETE CASCADE,
  issue_type text NOT NULL,
  notes text,
  photo_url text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_customer_order_issues_order
  ON delivery.customer_order_issues(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_order_issues_customer
  ON delivery.customer_order_issues(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_order_issues_status
  ON delivery.customer_order_issues(status);

ALTER TABLE delivery.customer_order_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_order_issues_select_own ON delivery.customer_order_issues;
CREATE POLICY customer_order_issues_select_own ON delivery.customer_order_issues
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.customers c
      WHERE c.id = customer_order_issues.customer_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON delivery.customer_order_issues TO authenticated;
GRANT ALL ON delivery.customer_order_issues TO service_role;

COMMENT ON TABLE delivery.customer_order_issues IS
  'Customer-submitted order problems (missing item, quality, etc). Written by delivery edge function.';
