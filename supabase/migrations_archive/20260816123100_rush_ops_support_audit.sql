-- Rush Ops: support case desk + structured admin audit event log.

CREATE TABLE IF NOT EXISTS delivery.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  customer_id uuid REFERENCES delivery.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES delivery.orders(id) ON DELETE SET NULL,
  contact_email text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_cases_status ON delivery.support_cases(status);
CREATE INDEX IF NOT EXISTS idx_support_cases_created ON delivery.support_cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_customer ON delivery.support_cases(customer_id);

CREATE TABLE IF NOT EXISTS delivery.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target_id text,
  target_email text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created ON delivery.admin_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_action ON delivery.admin_audit_events(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_actor ON delivery.admin_audit_events(actor_id);

ALTER TABLE delivery.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.admin_audit_events ENABLE ROW LEVEL SECURITY;

-- Edge functions access these with the service role only (admin-scoped data).
GRANT ALL ON delivery.support_cases TO service_role;
GRANT ALL ON delivery.admin_audit_events TO service_role;

COMMENT ON TABLE delivery.support_cases IS 'Rush Ops support desk cases (customer/order tickets).';
COMMENT ON TABLE delivery.admin_audit_events IS 'Structured mirror of admin audit trail (dual-written from writeKvAudit).';
