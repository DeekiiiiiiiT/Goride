-- Research engine — layer 2 database helpers (docs/research-engine-audit.md §5). Ships with the layer-2 server code.

-- RE-24: grounding queries already run this calendar month (UTC), across every Gemini 3+ grounding call in Roam.
-- The logger uses it to apply Google's free monthly allowance before pricing a call.
CREATE OR REPLACE FUNCTION public.api_grounding_queries_this_month()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private', 'public', 'pg_temp'
AS $$
  SELECT coalesce(sum(e.requests), 0)::bigint
  FROM private.api_usage_events e
  WHERE e.provider = 'gemini'
    AND e.service = 'grounding'
    AND e.occurred_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
$$;

REVOKE ALL ON FUNCTION public.api_grounding_queries_this_month() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_grounding_queries_this_month() TO service_role;

-- RE-11: pages confirmed per site, counted atomically.
CREATE OR REPLACE FUNCTION public.trusted_site_bump_pages_confirmed(p_domain text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.trusted_site
  SET pages_confirmed = pages_confirmed + 1, updated_at = now()
  WHERE domain = lower(btrim(p_domain))
  RETURNING pages_confirmed;
$$;

REVOKE ALL ON FUNCTION public.trusted_site_bump_pages_confirmed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_site_bump_pages_confirmed(text) TO service_role;

-- ---------------------------------------------------------------------------
-- RE-10 / RE-28: claim — fleet jobs and fill jobs take turns; the daily limit is spend, not a job count;
-- single-flight per job (pgmq hides a message while it is worked), not one job for the whole engine.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq')
     AND NOT EXISTS (SELECT 1 FROM pgmq.list_queues() q WHERE q.queue_name = 'catalog_research_fill') THEN
    PERFORM pgmq.create('catalog_research_fill');
  END IF;
END;
$$;

ALTER TABLE public.catalog_research_settings
  ADD COLUMN IF NOT EXISTS last_claim_side text;
ALTER TABLE public.catalog_research_settings DROP CONSTRAINT IF EXISTS catalog_research_settings_last_claim_side_check;
ALTER TABLE public.catalog_research_settings ADD CONSTRAINT catalog_research_settings_last_claim_side_check
  CHECK (last_claim_side IS NULL OR last_claim_side IN ('fleet', 'fill'));

-- Fleet requests → catalog_research; owner fill + nightly sweep → catalog_research_fill.
CREATE OR REPLACE FUNCTION public.catalog_research_enqueue_job(p_job_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pgmq', 'public'
AS $$
DECLARE
  v_msg_id bigint;
  v_queue text;
BEGIN
  SELECT CASE WHEN j.origin = 'fleet' THEN 'catalog_research' ELSE 'catalog_research_fill' END
  INTO v_queue
  FROM public.catalog_research_job j WHERE j.id = p_job_id;
  v_queue := coalesce(v_queue, 'catalog_research');
  SELECT pgmq.send(v_queue, jsonb_build_object('jobId', p_job_id)) INTO v_msg_id;
  UPDATE public.catalog_research_job SET pgmq_msg_id = v_msg_id, pgmq_queue = v_queue WHERE id = p_job_id;
  RETURN v_msg_id;
END;
$$;

-- Research spend today (UTC): every logged line on a catalog_research route, tokens and grounding.
CREATE OR REPLACE FUNCTION public.catalog_research_spend_today()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private', 'public', 'pg_temp'
AS $$
  SELECT coalesce(sum(e.cost_usd), 0)::numeric
  FROM private.api_usage_events e
  WHERE e.route LIKE 'catalog_research/%'
    AND e.occurred_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
$$;

CREATE OR REPLACE FUNCTION public.catalog_research_claim()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pgmq', 'public'
AS $function$
DECLARE
  v_settings record;
  v_msg_id bigint;
  v_read_ct integer;
  v_message jsonb;
  v_job_id uuid;
  v_job_state text;
  v_queue text;
  v_first text;
  v_second text;
  v_side text;
  v_spend numeric;
BEGIN
  IF NOT pg_try_advisory_xact_lock(908871235) THEN
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

  -- The daily limit is research spend (RE-10); the logger's guard is the hard stop, this avoids starting a job.
  v_spend := public.catalog_research_spend_today();
  IF v_settings.daily_spend_usd > 0 AND v_spend >= v_settings.daily_spend_usd THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'spend_cap', 'spendToday', v_spend);
  END IF;

  -- "Research next" first, then fleet and fill take turns (RE-28); an empty side gives its turn away.
  SELECT r.msg_id, r.read_ct, r.message INTO v_msg_id, v_read_ct, v_message
  FROM pgmq.read('catalog_research_priority', 600, 1) r LIMIT 1;
  IF v_msg_id IS NOT NULL THEN
    v_queue := 'catalog_research_priority';
  ELSE
    IF v_settings.claim_share_fleet >= 1 THEN
      v_first := 'catalog_research'; v_second := 'catalog_research_fill';
    ELSIF v_settings.claim_share_fleet <= 0 THEN
      v_first := 'catalog_research_fill'; v_second := 'catalog_research';
    ELSIF v_settings.last_claim_side = 'fleet' THEN
      v_first := 'catalog_research_fill'; v_second := 'catalog_research';
    ELSE
      v_first := 'catalog_research'; v_second := 'catalog_research_fill';
    END IF;

    SELECT r.msg_id, r.read_ct, r.message INTO v_msg_id, v_read_ct, v_message
    FROM pgmq.read(v_first, 600, 1) r LIMIT 1;
    v_queue := v_first;
    IF v_msg_id IS NULL THEN
      SELECT r.msg_id, r.read_ct, r.message INTO v_msg_id, v_read_ct, v_message
      FROM pgmq.read(v_second, 600, 1) r LIMIT 1;
      v_queue := v_second;
    END IF;
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
    PERFORM public.catalog_research_log_event(v_job_id, 'claim', 'stale_job',
      jsonb_build_object('readCt', v_read_ct, 'state', v_job_state));
    RETURN jsonb_build_object('claimed', false, 'reason', 'stale_job', 'jobId', v_job_id, 'state', v_job_state);
  END IF;

  -- Single flight per job (review #1): a job already running under another message is never started twice. Only the
  -- running message itself (redelivered after a crash) or a run left for 30 minutes may take it over.
  IF v_job_state = 'researching' AND EXISTS (
    SELECT 1 FROM public.catalog_research_job j
    WHERE j.id = v_job_id
      AND (j.pgmq_msg_id IS DISTINCT FROM v_msg_id OR j.pgmq_queue IS DISTINCT FROM v_queue)
      AND j.updated_at > now() - interval '30 minutes'
  ) THEN
    PERFORM pgmq.archive(v_queue, v_msg_id);
    PERFORM public.catalog_research_log_event(v_job_id, 'claim', 'duplicate_running', jsonb_build_object('readCt', v_read_ct));
    RETURN jsonb_build_object('claimed', false, 'reason', 'duplicate_running', 'jobId', v_job_id);
  END IF;

  IF v_read_ct >= 4 THEN
    UPDATE public.catalog_research_job SET state = 'failed', last_error = 'max_reads', pgmq_read_ct = v_read_ct,
      updated_at = now()
    WHERE id = v_job_id AND state IN ('queued', 'researching', 'checking');
    PERFORM pgmq.archive(v_queue, v_msg_id);
    PERFORM public.catalog_research_log_event(v_job_id, 'claim', 'failed_max_reads', jsonb_build_object('readCt', v_read_ct));
    RETURN jsonb_build_object('claimed', false, 'reason', 'failed', 'jobId', v_job_id);
  END IF;

  v_side := CASE v_queue WHEN 'catalog_research' THEN 'fleet' WHEN 'catalog_research_fill' THEN 'fill' END;
  IF v_side IS NOT NULL THEN
    UPDATE public.catalog_research_settings SET last_claim_side = v_side WHERE id = 1;
  END IF;

  UPDATE public.catalog_research_job SET
    state = 'researching',
    attempts = attempts + 1,
    pgmq_msg_id = v_msg_id,
    pgmq_read_ct = v_read_ct,
    pgmq_queue = v_queue,
    updated_at = now()
  WHERE id = v_job_id;

  RETURN jsonb_build_object('claimed', true, 'jobId', v_job_id, 'msgId', v_msg_id, 'readCt', v_read_ct,
                            'queue', v_queue, 'side', coalesce(v_side, 'priority'));
END;
$function$;

REVOKE ALL ON FUNCTION public.catalog_research_enqueue_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_spend_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_claim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_enqueue_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_research_spend_today() TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_research_claim() TO service_role;

-- ---------------------------------------------------------------------------
-- RE-04 / RE-08 / RE-09: queue research for one item, a whole car, a model, a car's identity.
-- Owner work is origin 'owner_fill' and may open browser checks; it never duplicates an open job for the same
-- car + part/spec + place, whoever queued it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_research_queue_item(
  p_vehicle_catalog_id uuid,
  p_component_id uuid,
  p_spec_key text,
  p_fit_descriptor text,
  p_origin text DEFAULT 'owner_fill'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_job uuid;
  v_type text := CASE WHEN p_spec_key IS NOT NULL THEN 'spec' ELSE 'part' END;
  v_fit text := nullif(lower(btrim(coalesce(p_fit_descriptor, ''))), '');
  v_key text;
BEGIN
  IF p_vehicle_catalog_id IS NULL OR (p_component_id IS NULL AND p_spec_key IS NULL) THEN
    RAISE EXCEPTION 'car and part type or spec required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_origin NOT IN ('fleet', 'owner_fill', 'sweep') THEN
    RAISE EXCEPTION 'unknown origin %', p_origin USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT j.id INTO v_job
  FROM public.catalog_research_job j
  WHERE j.vehicle_catalog_id = p_vehicle_catalog_id
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'browser_check', 'browser_check_queued')
    AND ((v_type = 'spec' AND j.job_type = 'spec' AND j.spec_key = p_spec_key)
      OR (v_type = 'part' AND j.job_type = 'part' AND j.maintenance_component_id = p_component_id
          AND coalesce(lower(j.fit_descriptor), '') = coalesce(v_fit, '')))
  LIMIT 1;
  IF v_job IS NOT NULL THEN
    -- Owner asking for something a sweep queued: it may now open a browser check.
    UPDATE public.catalog_research_job SET browser_check_allowed = true
    WHERE id = v_job AND p_origin <> 'sweep' AND NOT browser_check_allowed;
    RETURN jsonb_build_object('jobId', v_job, 'newJob', false);
  END IF;

  v_key := CASE v_type
    WHEN 'spec' THEN concat_ws(':', 'spec', p_vehicle_catalog_id::text, p_spec_key)
    ELSE concat_ws(':', 'fill', p_vehicle_catalog_id::text, p_component_id::text, coalesce(v_fit, ''))
  END;

  INSERT INTO public.catalog_research_job (job_type, group_key, vehicle_catalog_id, maintenance_component_id, spec_key,
                                           fit_descriptor, fleet_count, state, origin, browser_check_allowed)
  VALUES (v_type, v_key, p_vehicle_catalog_id, p_component_id, p_spec_key, v_fit, 0, 'queued', p_origin,
          p_origin <> 'sweep')
  ON CONFLICT (group_key) WHERE state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued') DO NOTHING
  RETURNING id INTO v_job;
  IF v_job IS NULL THEN
    SELECT id INTO v_job FROM public.catalog_research_job WHERE group_key = v_key ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('jobId', v_job, 'newJob', false);
  END IF;
  PERFORM public.catalog_research_enqueue_job(v_job);
  PERFORM public.catalog_research_log_event(v_job, 'enqueue', 'queued', jsonb_build_object('origin', p_origin));
  RETURN jsonb_build_object('jobId', v_job, 'newJob', true);
END;
$$;

-- The core items a car needs (readiness's 10 part types + the core spec keys, RE-09).
CREATE OR REPLACE FUNCTION public.catalog_research_core_spec_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['battery_jis', 'battery_type', 'engine_oil_grade', 'engine_oil_capacity_with_filter_l',
               'wiper_driver_mm', 'wiper_passenger_mm', 'headlight_low_bulb', 'tire_size', 'brake_fluid',
               'coolant_type'];
$$;

CREATE OR REPLACE FUNCTION public.catalog_research_fill_car(p_vehicle_catalog_id uuid, p_origin text DEFAULT 'owner_fill')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_car public.vehicle_catalog%ROWTYPE;
  v_cells jsonb;
  v_comp record;
  v_key text;
  v_r jsonb;
  v_new integer := 0;
  v_joined integer := 0;
BEGIN
  SELECT * INTO v_car FROM public.vehicle_catalog WHERE id = p_vehicle_catalog_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'car_not_found'; END IF;

  -- RE-04: no frame code → find the identity first; parts and specs wait for it.
  IF nullif(btrim(coalesce(v_car.chassis_code, '')), '') IS NULL THEN
    v_r := public.catalog_research_queue_identity(p_vehicle_catalog_id);
    RETURN jsonb_build_object('identityFirst', true, 'identityJobId', v_r->>'jobId', 'newJobs', 0, 'joined', 0);
  END IF;

  SELECT r.cells INTO v_cells FROM public.variant_parts_readiness r WHERE r.variant_id = p_vehicle_catalog_id;

  FOR v_comp IN
    SELECT c.id, c.op_code
    FROM public.maintenance_service_categories c
    WHERE c.kind = 'component'
      AND c.op_code IN ('ENG-OIL', 'ENG-SPARK', 'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN', 'BRK-PADS', 'BELT-SERP',
                        'LGT-WIPER', 'BRK-ROTOR', 'SUS-SHOCK')
  LOOP
    IF coalesce(v_cells->>v_comp.op_code, 'missing') IN ('verified', 'not_applicable') THEN CONTINUE; END IF;
    v_r := public.catalog_research_queue_item(p_vehicle_catalog_id, v_comp.id, NULL, NULL, p_origin);
    IF (v_r->>'newJob')::boolean THEN v_new := v_new + 1; ELSE v_joined := v_joined + 1; END IF;
  END LOOP;

  FOREACH v_key IN ARRAY public.catalog_research_core_spec_keys() LOOP
    IF EXISTS (SELECT 1 FROM public.specs_for_variant(p_vehicle_catalog_id) s WHERE s.spec_key = v_key AND s.sourced) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.spec_key k WHERE k.key = v_key) THEN CONTINUE; END IF;
    v_r := public.catalog_research_queue_item(p_vehicle_catalog_id, NULL, v_key, NULL, p_origin);
    IF (v_r->>'newJob')::boolean THEN v_new := v_new + 1; ELSE v_joined := v_joined + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('identityFirst', false, 'newJobs', v_new, 'joined', v_joined);
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_research_queue_identity(p_vehicle_catalog_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_job uuid;
  v_key text := 'identity:' || p_vehicle_catalog_id::text;
BEGIN
  INSERT INTO public.catalog_research_job (job_type, group_key, vehicle_catalog_id, fleet_count, state, origin)
  VALUES ('vehicle_identity', v_key, p_vehicle_catalog_id, 0, 'queued', 'owner_fill')
  ON CONFLICT (group_key) WHERE state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued') DO NOTHING
  RETURNING id INTO v_job;
  IF v_job IS NULL THEN
    SELECT id INTO v_job FROM public.catalog_research_job WHERE group_key = v_key ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('jobId', v_job, 'newJob', false);
  END IF;
  PERFORM public.catalog_research_enqueue_job(v_job);
  RETURN jsonb_build_object('jobId', v_job, 'newJob', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_research_queue_model(p_make text, p_model text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_job uuid;
  v_key text := concat_ws(':', 'model', btrim(p_make), btrim(p_model));
BEGIN
  IF nullif(btrim(coalesce(p_make, '')), '') IS NULL OR nullif(btrim(coalesce(p_model, '')), '') IS NULL THEN
    RAISE EXCEPTION 'make and model required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  INSERT INTO public.catalog_research_job (job_type, group_key, fleet_count, state, origin)
  VALUES ('vehicle_model', v_key, 0, 'queued', 'owner_fill')
  ON CONFLICT (group_key) WHERE state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued') DO NOTHING
  RETURNING id INTO v_job;
  IF v_job IS NULL THEN
    SELECT id INTO v_job FROM public.catalog_research_job WHERE group_key = v_key ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('jobId', v_job, 'newJob', false);
  END IF;
  PERFORM public.catalog_research_enqueue_job(v_job);
  RETURN jsonb_build_object('jobId', v_job, 'newJob', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_research_fill_model(p_make text, p_model text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_r jsonb;
  v_cars integer := 0;
  v_new integer := 0;
  v_identity integer := 0;
BEGIN
  FOR v_id IN
    SELECT vc.id FROM public.vehicle_catalog vc
    WHERE lower(vc.make) = lower(btrim(p_make)) AND lower(vc.model) = lower(btrim(p_model)) AND vc.retired_at IS NULL
  LOOP
    v_r := public.catalog_research_fill_car(v_id, 'owner_fill');
    v_cars := v_cars + 1;
    v_new := v_new + coalesce((v_r->>'newJobs')::int, 0);
    IF (v_r->>'identityFirst')::boolean THEN v_identity := v_identity + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('cars', v_cars, 'newJobs', v_new, 'identityFirst', v_identity);
END;
$$;

-- ---------------------------------------------------------------------------
-- RE-28 / RE-29: a browser check left 30 days closes as Couldn't find and frees its slot for the next one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_research_expire_browser_checks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_expired integer;
  v_opened integer;
  v_max integer;
  v_open integer;
BEGIN
  UPDATE public.catalog_research_job
  SET state = 'not_found', last_error = 'browser check not answered in 30 days', updated_at = now()
  WHERE state = 'browser_check' AND updated_at < now() - interval '30 days';
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  SELECT max_open_browser_checks INTO v_max FROM public.catalog_research_settings WHERE id = 1;
  SELECT count(*) INTO v_open FROM public.catalog_research_job WHERE state = 'browser_check';
  -- Oldest waiting first; the server-side order never reaches Dominion.
  WITH nxt AS (
    SELECT id FROM public.catalog_research_job
    WHERE state = 'browser_check_queued'
    ORDER BY fleet_count DESC, updated_at
    LIMIT greatest(coalesce(v_max, 25) - v_open, 0)
  )
  UPDATE public.catalog_research_job j SET state = 'browser_check', updated_at = now()
  FROM nxt WHERE j.id = nxt.id;
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  RETURN jsonb_build_object('expired', v_expired, 'opened', v_opened);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'catalog-research-browser-checks';
    PERFORM cron.schedule('catalog-research-browser-checks', '20 * * * *', 'SELECT public.catalog_research_expire_browser_checks();');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RE-06: an approved spec proposal becomes a Confirmed spec with its evidence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_spec_proposal(p_proposal_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_p public.catalog_spec_proposal%ROWTYPE;
  v_url text;
  v_id uuid;
BEGIN
  SELECT * INTO v_p FROM public.catalog_spec_proposal WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_p.status = 'promoted' THEN RETURN jsonb_build_object('idempotent', true); END IF;
  IF v_p.status = 'rejected' THEN RAISE EXCEPTION 'proposal_rejected'; END IF;
  IF cardinality(v_p.evidence_read_ids) = 0 THEN RAISE EXCEPTION 'proposal_has_no_evidence'; END IF;

  SELECT coalesce(r.final_url, r.url) INTO v_url FROM public.research_page_read r WHERE r.id = v_p.evidence_read_ids[1];

  INSERT INTO public.catalog_spec_value (spec_key, scope, vehicle_catalog_id, value, evidence_url, verified_by, trust,
                                         trust_route, trust_set_by, evidence_read_ids, source_note)
  VALUES (v_p.spec_key, 'variant', v_p.vehicle_catalog_id, v_p.value, v_url, p_actor, 'confirmed',
          v_p.trust_route, 'engine', v_p.evidence_read_ids, NULL)
  ON CONFLICT (spec_key, vehicle_catalog_id) WHERE scope = 'variant' DO UPDATE SET
    value = EXCLUDED.value, evidence_url = EXCLUDED.evidence_url, verified_by = EXCLUDED.verified_by,
    verified_at = now(), trust = 'confirmed', trust_route = EXCLUDED.trust_route, trust_set_by = EXCLUDED.trust_set_by,
    evidence_read_ids = EXCLUDED.evidence_read_ids, source_note = NULL
  RETURNING id INTO v_id;

  UPDATE public.catalog_spec_proposal SET status = 'promoted' WHERE id = p_proposal_id;
  UPDATE public.catalog_research_job SET state = CASE WHEN p_actor IS NULL THEN 'auto_added' ELSE 'added' END,
    updated_at = now() WHERE id = v_p.job_id;
  PERFORM public.catalog_research_log_event(v_p.job_id, 'promote', 'spec', jsonb_build_object('specValueId', v_id), p_actor);
  RETURN jsonb_build_object('specValueId', v_id, 'idempotent', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- RE-07 / RE-08: approve a vehicle proposal — update an existing version or add a new one, never a duplicate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_vehicle_proposal(p_proposal_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_p public.catalog_vehicle_proposal%ROWTYPE;
  v_job public.catalog_research_job%ROWTYPE;
  v_target uuid;
  v_action text;
BEGIN
  SELECT * INTO v_p FROM public.catalog_vehicle_proposal WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_p.status = 'approved' THEN RETURN jsonb_build_object('vehicleCatalogId', v_p.existing_vehicle_catalog_id, 'idempotent', true); END IF;
  IF v_p.status = 'rejected' THEN RAISE EXCEPTION 'proposal_rejected'; END IF;
  SELECT * INTO v_job FROM public.catalog_research_job WHERE id = v_p.job_id;

  v_target := coalesce(v_p.existing_vehicle_catalog_id, CASE WHEN v_job.job_type = 'vehicle_identity' THEN v_job.vehicle_catalog_id END);
  IF v_target IS NULL THEN
    -- Duplicate check: same make + model + frame code + engine with overlapping years.
    SELECT vc.id INTO v_target FROM public.vehicle_catalog vc
    WHERE lower(vc.make) = lower(v_p.make) AND lower(vc.model) = lower(v_p.model)
      AND coalesce(upper(vc.chassis_code), '') = coalesce(upper(v_p.chassis_code), '')
      AND coalesce(upper(vc.engine_code), '') = coalesce(upper(v_p.engine_code), '')
      AND coalesce(vc.production_start_year, 0) <= coalesce(v_p.production_end_year, 9999)
      AND coalesce(vc.production_end_year, 9999) >= coalesce(v_p.production_start_year, 0)
      AND vc.retired_at IS NULL
    LIMIT 1;
  END IF;

  IF v_target IS NOT NULL THEN
    -- Fill only what is missing; never overwrite a value already on file.
    UPDATE public.vehicle_catalog SET
      chassis_code = coalesce(nullif(btrim(chassis_code), ''), v_p.chassis_code),
      engine_code = coalesce(nullif(btrim(engine_code), ''), v_p.engine_code),
      drivetrain = coalesce(nullif(btrim(drivetrain), ''), v_p.drivetrain),
      transmission = coalesce(nullif(btrim(transmission), ''), v_p.transmission),
      chassis_serial_from = coalesce(nullif(btrim(chassis_serial_from), ''), v_p.chassis_serial_from),
      chassis_serial_to = coalesce(nullif(btrim(chassis_serial_to), ''), v_p.chassis_serial_to),
      trim_series = coalesce(nullif(btrim(trim_series), ''), v_p.grade)
    WHERE id = v_target;
    v_action := 'update';
  ELSE
    INSERT INTO public.vehicle_catalog (make, model, production_start_year, production_end_year, chassis_code,
                                        engine_code, drivetrain, transmission, chassis_serial_from, chassis_serial_to,
                                        trim_series, market, powertrain_status, source)
    VALUES (v_p.make, v_p.model, v_p.production_start_year, v_p.production_end_year, v_p.chassis_code,
            v_p.engine_code, v_p.drivetrain, v_p.transmission, v_p.chassis_serial_from, v_p.chassis_serial_to,
            v_p.grade, v_p.market, 'needs_check', 'pending_approve')
    RETURNING id INTO v_target;
    v_action := 'new';
  END IF;

  UPDATE public.catalog_vehicle_proposal SET status = 'approved', existing_vehicle_catalog_id = v_target, action = v_action
  WHERE id = p_proposal_id;
  UPDATE public.catalog_research_job SET state = 'added', updated_at = now() WHERE id = v_p.job_id;
  IF v_job.pending_request_id IS NOT NULL THEN
    UPDATE public.vehicle_catalog_pending_requests
    SET status = 'approved', resolved_vehicle_catalog_id = v_target, resolved_by = p_actor, resolved_at = now()
    WHERE id = v_job.pending_request_id AND status IN ('pending', 'needs_info');
  END IF;
  PERFORM public.catalog_research_log_event(v_p.job_id, 'approve', v_action, jsonb_build_object('vehicleCatalogId', v_target), p_actor);
  RETURN jsonb_build_object('vehicleCatalogId', v_target, 'action', v_action, 'idempotent', false);
END;
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'catalog_research_queue_item(uuid, uuid, text, text, text)',
    'catalog_research_core_spec_keys()',
    'catalog_research_fill_car(uuid, text)',
    'catalog_research_queue_identity(uuid)',
    'catalog_research_queue_model(text, text)',
    'catalog_research_fill_model(text, text)',
    'catalog_research_expire_browser_checks()',
    'promote_spec_proposal(uuid, uuid)',
    'approve_vehicle_proposal(uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END;
$$;
