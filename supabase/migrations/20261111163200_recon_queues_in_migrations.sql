-- Week Reconciliation (audit Rev 23): the calculator's two queues exist live but were never
-- created by a migration, so any copy rebuilt from migrations (test copy, CI, disaster
-- recovery) failed every week change with: relation "pgmq.q_recon_recompute" does not exist.
-- Creates each queue only when it is missing; live already has both, so nothing changes there.

CREATE EXTENSION IF NOT EXISTS pgmq;

DO $$
DECLARE
  q text;
BEGIN
  FOREACH q IN ARRAY ARRAY['recon_recompute', 'recon_close'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pgmq.meta m WHERE m.queue_name = q) THEN
      PERFORM pgmq.create(q);
    END IF;
  END LOOP;
END $$;
