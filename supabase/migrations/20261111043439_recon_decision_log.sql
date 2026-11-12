-- Week Reconciliation Round 1: decision log columns + append-only (WRA-28, WRA-30, WRA-38).
-- kind stays the event type column (live edge uses kind); calculator_publish via kind.

ALTER TABLE recon.run_events
  ADD COLUMN IF NOT EXISTS line text,
  ADD COLUMN IF NOT EXISTS week_key date,
  ADD COLUMN IF NOT EXISTS step text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS before jsonb,
  ADD COLUMN IF NOT EXISTS after jsonb,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS supersedes uuid,
  ADD COLUMN IF NOT EXISTS restatement_id uuid,
  ADD COLUMN IF NOT EXISTS prepared_by text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS version_at_send int;

ALTER TABLE recon.run_events
  DROP CONSTRAINT IF EXISTS run_events_status_check;

ALTER TABLE recon.run_events
  ADD CONSTRAINT run_events_status_check
  CHECK (
    status IN (
      'applied',
      'pending_approval',
      'approved',
      'rejected',
      'withdrawn',
      'stale'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS run_events_run_idempotency_uidx
  ON recon.run_events (run_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE VIEW recon.self_approvals
WITH (security_invoker = true)
AS
  SELECT *
  FROM recon.run_events
  WHERE self_approved = true
    AND status = 'approved';

COMMENT ON VIEW recon.self_approvals IS
  'Self-approved decision-log rows for monthly review (WRA-32).';

GRANT SELECT ON recon.self_approvals TO authenticated;

CREATE OR REPLACE FUNCTION recon.tg_run_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed_transition boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'recon.run_events is append-only: delete not allowed';
  END IF;

  IF TG_OP = 'UPDATE' THEN
  IF to_jsonb(NEW) - 'status' - 'approved_by'
    IS DISTINCT FROM to_jsonb(OLD) - 'status' - 'approved_by' THEN
      RAISE EXCEPTION 'recon.run_events: only status and approved_by may be updated';
    END IF;

    IF OLD.status = 'pending_approval'
      AND NEW.status IN ('approved', 'rejected', 'withdrawn', 'stale') THEN
      allowed_transition := true;
    ELSIF OLD.status = 'stale' AND NEW.status = 'withdrawn' THEN
      allowed_transition := true;
    END IF;

    IF NOT allowed_transition THEN
      RAISE EXCEPTION
        'recon.run_events: disallowed status transition % -> %',
        OLD.status,
        NEW.status;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS run_events_append_only ON recon.run_events;

CREATE TRIGGER run_events_append_only
  BEFORE UPDATE OR DELETE ON recon.run_events
  FOR EACH ROW
  EXECUTE FUNCTION recon.tg_run_events_append_only();

REVOKE UPDATE, DELETE ON recon.run_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON recon.run_events FROM authenticated;
REVOKE DELETE ON recon.run_events FROM service_role;

GRANT SELECT, INSERT, UPDATE ON recon.run_events TO service_role;
GRANT SELECT ON recon.run_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE recon.run_events_id_seq TO service_role;

NOTIFY pgrst, 'reload schema';
