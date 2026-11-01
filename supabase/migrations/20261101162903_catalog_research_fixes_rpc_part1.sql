-- part1: see supabase/migrations/20261102120000_catalog_research_fixes.sql lines 48-353
CREATE OR REPLACE FUNCTION public.catalog_research_priority_enqueue(p_job_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
DECLARE
  v_job record;
  v_msg_id bigint;
BEGIN
  SELECT * INTO v_job FROM public.catalog_research_job WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_not_found';
  END IF;
  IF v_job.pgmq_msg_id IS NOT NULL AND v_job.pgmq_queue IS NOT NULL THEN
    PERFORM pgmq.archive(v_job.pgmq_queue, v_job.pgmq_msg_id);
  ELSIF v_job.pgmq_msg_id IS NOT NULL THEN
    PERFORM pgmq.archive('catalog_research', v_job.pgmq_msg_id);
  END IF;
  SELECT pgmq.send('catalog_research_priority', jsonb_build_object('jobId', p_job_id)) INTO v_msg_id;
  UPDATE public.catalog_research_job SET state = 'queued', pgmq_msg_id = v_msg_id, pgmq_queue = 'catalog_research_priority', updated_at = now() WHERE id = p_job_id;
  RETURN v_msg_id;
END;
$$;
REVOKE ALL ON FUNCTION public.catalog_research_priority_enqueue(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_priority_enqueue(uuid) TO service_role;;
