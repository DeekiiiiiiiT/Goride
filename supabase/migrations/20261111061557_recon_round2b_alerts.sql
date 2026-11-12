-- Week Reconciliation Round 2b-3 (WRA-31): alerts.
-- One OPEN alert per (org, dedupe_key). The calculator raises and resolves them;
-- an approver acknowledges them; unacknowledged alerts escalate by SMS
-- (fleet managers at 24 h, the owner as well at 48 h).

CREATE TABLE IF NOT EXISTS recon.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'calculator_paused',
    'unit_pending',
    'unit_failed',
    'enqueue_failed',
    'week_overdue',
    'close_failed',
    'approval_waiting',
    'correction_unsigned',
    'shadow_mismatch'
  )),
  dedupe_key text NOT NULL,
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  raised_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by text,
  sms_manager_at timestamptz,
  sms_owner_at timestamptz,
  sms_status text,
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS recon_alerts_open_uidx
  ON recon.alerts (organization_id, dedupe_key)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS recon_alerts_org_open_idx
  ON recon.alerts (organization_id, raised_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE recon.alerts IS
  'WRA-31: Week Reconciliation alerts (bell + SMS escalation). Read and written by the server only.';

ALTER TABLE recon.alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recon.alerts FROM PUBLIC, anon, authenticated;
GRANT ALL ON recon.alerts TO service_role;

-- Health: unsigned correction drafts older than 24 h, per org (WRA-30 / WRA-31).
CREATE OR REPLACE VIEW recon.unsigned_corrections
WITH (security_invoker = true)
AS
SELECT
  ws.organization_id::text AS organization_id,
  count(*)::bigint AS drafts_over_24h,
  min(ws.created_at) AS oldest_draft_at
FROM ledger.week_statements ws
WHERE ws.status = 'draft'
  AND ws.close_reason ILIKE '%restatement%'
  AND ws.created_at < now() - interval '24 hours'
GROUP BY ws.organization_id;

REVOKE ALL ON recon.unsigned_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON recon.unsigned_corrections TO service_role;

NOTIFY pgrst, 'reload schema';
