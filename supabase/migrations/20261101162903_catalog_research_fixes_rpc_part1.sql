CREATE OR REPLACE FUNCTION public.catalog_research_complete_msg(p_msg_id bigint, p_queue text DEFAULT NULL)
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