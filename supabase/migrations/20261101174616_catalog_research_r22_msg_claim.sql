-- R22: single complete_msg signature (queue-aware archive) + claim stale-job guard.

DROP FUNCTION IF EXISTS public.catalog_research_complete_msg(bigint);

CREATE OR REPLACE FUNCTION public.catalog_research_complete_msg(
  p_msg_id bigint,
  p_queue text DEFAULT 'catalog_research'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
DECLARE
  v_queue text;
BEGIN
  IF p_queue IS NOT NULL AND length(trim(p_queue)) > 0 THEN
    v_queue := p_queue;
  ELSE
    SELECT coalesce(j.pgmq_queue, 'catalog_research') INTO v_queue
    FROM public.catalog_research_job j
    WHERE j.pgmq_msg_id = p_msg_id
    LIMIT 1;
    v_queue := coalesce(v_queue, 'catalog_research');
  END IF;
  PERFORM pgmq.archive(v_queue, p_msg_id);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_complete_msg(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_complete_msg(bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_research_claim()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
DECLARE
  v_settings record;
  v_today integer;
  v_locked boolean;
  v_msg_id bigint;
  v_read_ct integer;
  v_message jsonb;
  v_job_id uuid;
  v_job_state text;
  v_queue text := 'catalog_research';
  v_busy integer;
  v_jamaica_midnight timestamptz;
BEGIN
  v_locked := pg_try_advisory_xact_lock(908871235);
  IF NOT v_locked THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'busy');
  END IF;

  SELECT count(*)::int INTO v_busy
  FROM public.catalog_research_job
  WHERE state IN ('researching', 'checking')
    AND updated_at >= now() - interval '10 minutes';
  IF v_busy > 0 THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'busy');
  END IF;

  SELECT * INTO v_settings FROM public.catalog_research_settings WHERE id = 1 FOR UPDATE;
  IF NOT v_settings.enabled THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'disabled');
  END IF;
  IF v_settings.paused AND (v_settings.auto_resume_at IS NULL OR v_settings.auto_resume_at > now()) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'paused');
  END IF;
  IF v_settings.paused AND v_settings.auto_resume_at IS NOT NULL AND v_settings.auto_resume_at <= now() THEN
    UPDATE public.catalog_research_settings SET paused = false, paused_reason = NULL, auto_resume_at = NULL WHERE id = 1;
  END IF;

  v_jamaica_midnight := (timezone('America/Jamaica', now()))::date AT TIME ZONE 'America/Jamaica';

  SELECT count(*)::int INTO v_today
  FROM public.catalog_research_event e
  WHERE e.step = 'research'
    AND e.at >= v_jamaica_midnight;

  IF v_today >= v_settings.daily_job_limit THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'daily_limit');
  END IF;

  SELECT r.msg_id, r.read_ct, r.message
  INTO v_msg_id, v_read_ct, v_message
  FROM pgmq.read('catalog_research_priority', 600, 1) r
  LIMIT 1;

  IF v_msg_id IS NOT NULL THEN
    v_queue := 'catalog_research_priority';
  ELSE
    SELECT r.msg_id, r.read_ct, r.message
    INTO v_msg_id, v_read_ct, v_message
    FROM pgmq.read('catalog_research', 600, 1) r
    LIMIT 1;
    v_queue := 'catalog_research';
  END IF;

  IF v_msg_id IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'empty');
  END IF;

  v_job_id := (v_message->>'jobId')::uuid;
  IF v_job_id IS NULL THEN
    PERFORM pgmq.archive(v_queue, v_msg_id);
    RETURN jsonb_build_object('claimed', false, 'reason', 'bad_message');
  END IF;

  SELECT state INTO v_job_state FROM public.catalog_research_job WHERE id = v_job_id;
  IF v_job_state IS NULL THEN
    PERFORM pgmq.archive(v_queue, v_msg_id);
    RETURN jsonb_build_object('claimed', false, 'reason', 'missing_job', 'jobId', v_job_id);
  END IF;

  IF v_job_state NOT IN ('queued', 'researching') THEN
    PERFORM pgmq.archive(v_queue, v_msg_id);
    PERFORM public.catalog_research_log_event(
      v_job_id,
      'claim',
      'stale_job',
      jsonb_build_object('readCt', v_read_ct, 'state', v_job_state)
    );
    RETURN jsonb_build_object('claimed', false, 'reason', 'stale_job', 'jobId', v_job_id, 'state', v_job_state);
  END IF;

  IF v_read_ct >= 4 THEN
    UPDATE public.catalog_research_job SET
      state = 'failed',
      last_error = 'max_reads',
      pgmq_read_ct = v_read_ct,
      updated_at = now()
    WHERE id = v_job_id AND state IN ('queued', 'researching', 'checking');
    PERFORM pgmq.archive(v_queue, v_msg_id);
    PERFORM public.catalog_research_log_event(v_job_id, 'claim', 'failed_max_reads', jsonb_build_object('readCt', v_read_ct));
    RETURN jsonb_build_object('claimed', false, 'reason', 'failed', 'jobId', v_job_id);
  END IF;

  UPDATE public.catalog_research_job SET
    state = 'researching',
    attempts = attempts + 1,
    pgmq_msg_id = v_msg_id,
    pgmq_read_ct = v_read_ct,
    pgmq_queue = v_queue,
    updated_at = now()
  WHERE id = v_job_id;

  RETURN jsonb_build_object(
    'claimed', true,
    'jobId', v_job_id,
    'msgId', v_msg_id,
    'readCt', v_read_ct,
    'queue', v_queue
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_claim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_claim() TO service_role;
