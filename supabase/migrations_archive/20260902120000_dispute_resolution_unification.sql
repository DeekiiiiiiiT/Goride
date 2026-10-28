-- Dispute resolution unification: link intake → cases → disputes, wait events, performance snapshots.

-- Link customer/courier issues to support cases and disputes
ALTER TABLE delivery.customer_order_issues
  ADD COLUMN IF NOT EXISTS support_case_id uuid REFERENCES delivery.support_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispute_id uuid REFERENCES delivery.order_disputes(id) ON DELETE SET NULL;

ALTER TABLE delivery.courier_delivery_issues
  ADD COLUMN IF NOT EXISTS support_case_id uuid REFERENCES delivery.support_cases(id) ON DELETE SET NULL;

ALTER TABLE delivery.support_cases
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS fault_attribution text
    CHECK (fault_attribution IS NULL OR fault_attribution IN (
      'merchant_fault', 'courier_fault', 'platform_fault', 'customer_fault', 'shared_fault', 'undetermined'
    )),
  ADD COLUMN IF NOT EXISTS resolution_action text,
  ADD COLUMN IF NOT EXISTS auto_resolved boolean NOT NULL DEFAULT false;

ALTER TABLE delivery.order_disputes
  ADD COLUMN IF NOT EXISTS support_case_id uuid REFERENCES delivery.support_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fault_attribution text
    CHECK (fault_attribution IS NULL OR fault_attribution IN (
      'merchant_fault', 'courier_fault', 'platform_fault', 'customer_fault', 'shared_fault', 'undetermined'
    )),
  ADD COLUMN IF NOT EXISTS customer_issue_id uuid REFERENCES delivery.customer_order_issues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS courier_issue_id uuid REFERENCES delivery.courier_delivery_issues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_order_issues_case ON delivery.customer_order_issues(support_case_id);
CREATE INDEX IF NOT EXISTS idx_courier_delivery_issues_case ON delivery.courier_delivery_issues(support_case_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_case ON delivery.order_disputes(support_case_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_source ON delivery.support_cases(source, source_id);

-- Structured courier wait evidence
CREATE TABLE IF NOT EXISTS delivery.courier_wait_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  courier_user_id uuid NOT NULL,
  arrived_at timestamptz,
  wait_minutes int NOT NULL CHECK (wait_minutes > 0),
  issue_id uuid REFERENCES delivery.courier_delivery_issues(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_wait_events_order ON delivery.courier_wait_events(order_id);

ALTER TABLE delivery.courier_wait_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courier_wait_events_select_own ON delivery.courier_wait_events;
CREATE POLICY courier_wait_events_select_own ON delivery.courier_wait_events
  FOR SELECT TO authenticated
  USING (courier_user_id = (SELECT auth.uid()));

GRANT SELECT ON delivery.courier_wait_events TO authenticated;
GRANT ALL ON delivery.courier_wait_events TO service_role;

-- Idempotency for auto-resolution rules
CREATE TABLE IF NOT EXISTS delivery.dispute_resolution_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, rule_id)
);

ALTER TABLE delivery.dispute_resolution_actions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.dispute_resolution_actions TO service_role;

-- Merchant accountability snapshots (rolling weekly)
CREATE TABLE IF NOT EXISTS delivery.merchant_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  forgotten_order_count int NOT NULL DEFAULT 0,
  avg_prep_delay_minutes numeric,
  item_accuracy_rate numeric,
  cancellation_fault_rate numeric,
  chargeback_balance numeric NOT NULL DEFAULT 0,
  visibility_penalty_tier text NOT NULL DEFAULT 'none'
    CHECK (visibility_penalty_tier IN ('none', 'warning', 'reduced', 'suspended')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_merchant_perf_merchant ON delivery.merchant_performance_snapshots(merchant_id);

ALTER TABLE delivery.merchant_performance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_perf_select_owner ON delivery.merchant_performance_snapshots;
CREATE POLICY merchant_perf_select_owner ON delivery.merchant_performance_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_performance_snapshots.merchant_id
        AND m.owner_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON delivery.merchant_performance_snapshots TO authenticated;
GRANT ALL ON delivery.merchant_performance_snapshots TO service_role;

-- Merchant contest on fault attribution
ALTER TABLE delivery.support_cases
  ADD COLUMN IF NOT EXISTS merchant_contested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merchant_contest_notes text;

-- Customer / merchant visibility on support cases
DROP POLICY IF EXISTS support_cases_select_customer ON delivery.support_cases;
CREATE POLICY support_cases_select_customer ON delivery.support_cases
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT c.id FROM delivery.customers c WHERE c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS support_cases_select_merchant ON delivery.support_cases;
CREATE POLICY support_cases_select_merchant ON delivery.support_cases
  FOR SELECT TO authenticated
  USING (
    order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM delivery.orders o
      JOIN delivery.merchants m ON m.id = o.merchant_id
      WHERE o.id = support_cases.order_id
        AND m.owner_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON delivery.support_cases TO authenticated;

COMMENT ON TABLE delivery.courier_wait_events IS 'Structured courier wait-at-store evidence for dispute resolution.';
COMMENT ON TABLE delivery.dispute_resolution_actions IS 'Idempotency log for automated dispute rules.';
COMMENT ON TABLE delivery.merchant_performance_snapshots IS 'Rolling merchant accountability metrics for visibility penalties.';
