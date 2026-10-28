-- Schedule daily evidence cleanup at 03:00 UTC (calls edge function when pg_net available).
-- Fallback: run supabase/scripts/schedule_evidence_cleanup.sql manually.

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('fleet-evidence-cleanup-daily');
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$cron$;

-- Documented manual trigger: internal route on make-server-37f42386
COMMENT ON TABLE public.evidence_files IS
  'Tracks ephemeral scan evidence. Daily purge via evidence-cleanup edge function or POST /internal/evidence-cleanup.';

NOTIFY pgrst, 'reload schema';
