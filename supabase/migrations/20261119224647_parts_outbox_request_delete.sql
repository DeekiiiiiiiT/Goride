-- Code review 19 Nov #2 (docs/log-service-parts-gaps-audit.md): parts_sourcing_outbox.request_id is ON DELETE SET NULL,
-- but the check required sent/merged <=> request_id NOT NULL, so deleting a parts_sourcing_requests row that a sent
-- outbox row points at was refused. Keep the rule one way: a request link still means sent/merged, but a sent/merged
-- row may lose its link when its request is deleted (the send itself did happen). Safe to run twice.

ALTER TABLE public.parts_sourcing_outbox
  DROP CONSTRAINT IF EXISTS parts_sourcing_outbox_sent_req_check;

ALTER TABLE public.parts_sourcing_outbox
  ADD CONSTRAINT parts_sourcing_outbox_sent_req_check
  CHECK (request_id IS NULL OR state IN ('sent', 'merged'));

-- Self-check
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parts_sourcing_outbox_sent_req_check'
      AND pg_get_constraintdef(oid) LIKE '%request_id IS NULL%'
  ) THEN
    RAISE EXCEPTION 'parts_sourcing_outbox_sent_req_check not replaced';
  END IF;
END;
$check$;
