-- Per-lane week seal ledger (ADR-0019). Distinct from ledger.week_close_runs (close-run idempotency).

CREATE TABLE IF NOT EXISTS ledger.week_seal_log (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('fuel', 'toll', 'earnings')),
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'in_progress', 'succeeded', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  correlation_id TEXT,
  request_hash TEXT,
  result_json JSONB,
  last_error TEXT,
  sealed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, week_key, lane),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_week_seal_log_org_week
  ON ledger.week_seal_log (organization_id, week_key);

COMMENT ON TABLE ledger.week_seal_log IS
  'ADR-0019: durable per-lane seal state for week_close coordination across edge functions.';

CREATE OR REPLACE VIEW public.week_seal_log
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.week_seal_log;

GRANT SELECT, INSERT, UPDATE ON public.week_seal_log TO service_role;
GRANT SELECT ON public.week_seal_log TO authenticated;
