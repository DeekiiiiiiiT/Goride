-- Pending catalog automated research (Fleet Find parts audit Rev 37, Part B3).
-- Ship with catalog_research_settings.enabled = false until B5 passes.

CREATE EXTENSION IF NOT EXISTS pgmq;

DO $$
BEGIN
  PERFORM pgmq.create('catalog_research');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN
    IF SQLERRM NOT LIKE '%already exists%' THEN RAISE; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Intake columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.parts_sourcing_requests
  ADD COLUMN IF NOT EXISTS catalog_research_job_id uuid,
  ADD COLUMN IF NOT EXISTS old_part_number text,
  ADD COLUMN IF NOT EXISTS research_group_key text;

CREATE INDEX IF NOT EXISTS idx_parts_sourcing_research_group_open
  ON public.parts_sourcing_requests (organization_id, research_group_key, created_at DESC)
  WHERE kind = 'add_part_info' AND status IN ('open', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_parts_sourcing_org_created_day
  ON public.parts_sourcing_requests (organization_id, created_at)
  WHERE kind = 'add_part_info';

-- ---------------------------------------------------------------------------
-- Request draft (FP15 save for tomorrow)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fleet_parts_request_draft (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  user_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE public.fleet_parts_request_draft ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fleet_parts_request_draft_no_direct ON public.fleet_parts_request_draft;
CREATE POLICY fleet_parts_request_draft_no_direct ON public.fleet_parts_request_draft
  FOR ALL USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Research tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.catalog_research_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  shadow_mode boolean NOT NULL DEFAULT true,
  daily_job_limit integer NOT NULL DEFAULT 40,
  paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  shadow_approve_streak integer NOT NULL DEFAULT 0,
  last_run_ms integer,
  auto_resume_attempt integer NOT NULL DEFAULT 0,
  auto_resume_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.catalog_research_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.catalog_trusted_source (
  domain text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('oem_catalog', 'aftermarket_catalog')),
  active boolean NOT NULL DEFAULT true
);

INSERT INTO public.catalog_trusted_source (domain, kind) VALUES
  ('partsouq.com', 'oem_catalog'),
  ('amayama.com', 'oem_catalog'),
  ('megazip.net', 'oem_catalog'),
  ('7zap.com', 'oem_catalog'),
  ('rockauto.com', 'aftermarket_catalog')
ON CONFLICT (domain) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.catalog_research_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL DEFAULT 'part' CHECK (job_type IN ('part', 'vehicle')),
  group_key text NOT NULL,
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog (id) ON DELETE SET NULL,
  maintenance_component_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE SET NULL,
  fit_descriptor text,
  match_type text,
  fleet_count integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN (
      'queued', 'researching', 'checking', 'needs_review', 'auto_added',
      'added', 'not_found', 'failed'
    )),
  attempts integer NOT NULL DEFAULT 0,
  pgmq_msg_id bigint,
  pgmq_read_ct integer NOT NULL DEFAULT 0,
  last_error text,
  vehicle_proposal jsonb,
  market text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_research_job_open_group_key
  ON public.catalog_research_job (group_key)
  WHERE state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added');

CREATE INDEX IF NOT EXISTS idx_catalog_research_job_state_updated
  ON public.catalog_research_job (state, updated_at);

ALTER TABLE public.parts_sourcing_requests
  DROP CONSTRAINT IF EXISTS parts_sourcing_requests_catalog_research_job_id_fkey;
ALTER TABLE public.parts_sourcing_requests
  ADD CONSTRAINT parts_sourcing_requests_catalog_research_job_id_fkey
  FOREIGN KEY (catalog_research_job_id) REFERENCES public.catalog_research_job (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.catalog_research_event (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.catalog_research_job (id) ON DELETE CASCADE,
  step text NOT NULL,
  outcome text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_research_event_job_at
  ON public.catalog_research_event (job_id, at);

CREATE TABLE IF NOT EXISTS public.catalog_part_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.catalog_research_job (id) ON DELETE CASCADE,
  brand text NOT NULL,
  part_number text NOT NULL,
  part_number_norm text NOT NULL,
  part_name text NOT NULL,
  match_type text,
  fits jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  route text NOT NULL DEFAULT 'review' CHECK (route IN ('auto', 'review')),
  promoted_part_id uuid REFERENCES public.part_master (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_part_proposal_job
  ON public.catalog_part_proposal (job_id);

CREATE UNIQUE INDEX IF NOT EXISTS part_fitment_part_vehicle_unique
  ON public.part_fitment (part_id, vehicle_catalog_id);

ALTER TABLE public.catalog_research_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_research_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_part_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_trusted_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_research_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_research_job_no_direct ON public.catalog_research_job;
CREATE POLICY catalog_research_job_no_direct ON public.catalog_research_job FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS catalog_research_event_no_direct ON public.catalog_research_event;
CREATE POLICY catalog_research_event_no_direct ON public.catalog_research_event FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS catalog_part_proposal_no_direct ON public.catalog_part_proposal;
CREATE POLICY catalog_part_proposal_no_direct ON public.catalog_part_proposal FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS catalog_trusted_source_no_direct ON public.catalog_trusted_source;
CREATE POLICY catalog_trusted_source_no_direct ON public.catalog_trusted_source FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS catalog_research_settings_no_direct ON public.catalog_research_settings;
CREATE POLICY catalog_research_settings_no_direct ON public.catalog_research_settings FOR ALL USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.catalog_research_log_event(
  p_job_id uuid,
  p_step text,
  p_outcome text,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_actor uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.catalog_research_event (job_id, step, outcome, detail, actor)
  VALUES (p_job_id, p_step, p_outcome, COALESCE(p_detail, '{}'::jsonb), p_actor);
  UPDATE public.catalog_research_job SET updated_at = now() WHERE id = p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_log_event(uuid, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_log_event(uuid, text, text, jsonb, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.parts_sourcing_research_group_key(
  p_vehicle_catalog_id uuid,
  p_component_id uuid,
  p_fit_descriptor text,
  p_install_side text,
  p_match_type text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT concat_ws(
    ':',
    coalesce(p_vehicle_catalog_id::text, ''),
    coalesce(p_component_id::text, ''),
    coalesce(nullif(trim(p_fit_descriptor), ''), coalesce(nullif(trim(p_install_side), ''), '')),
    coalesce(nullif(trim(p_match_type), ''), '')
  );
$$;

-- ---------------------------------------------------------------------------
-- Promote proposal (C1 — only path to resolved)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_part_proposal(
  p_proposal_id uuid,
  p_actor uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop record;
  v_job record;
  v_part_id uuid;
  v_decision text;
  v_org record;
  v_part_label text;
  v_car_label text;
BEGIN
  SELECT * INTO v_prop FROM public.catalog_part_proposal WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_not_found';
  END IF;

  SELECT * INTO v_job FROM public.catalog_research_job WHERE id = v_prop.job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_not_found';
  END IF;

  IF v_prop.promoted_part_id IS NOT NULL THEN
    RETURN jsonb_build_object('partId', v_prop.promoted_part_id, 'idempotent', true);
  END IF;

  v_decision := CASE WHEN p_actor IS NULL THEN 'auto_confirmed' ELSE 'confirmed' END;

  SELECT id INTO v_part_id FROM public.part_master
  WHERE upper(coalesce(manufacturer, '')) = upper(v_prop.brand)
    AND oem_part_number_norm = v_prop.part_number_norm
  LIMIT 1;

  IF v_part_id IS NULL THEN
    INSERT INTO public.part_master (
      category_id,
      name,
      oem_part_number,
      manufacturer,
      maintenance_component_id,
      evidence_url,
      metadata,
      catalog_decision,
      verified_by,
      verified_at,
      part_kind
    )
    SELECT
      coalesce(
        (SELECT pc.id FROM public.part_category pc WHERE pc.slug = 'general' LIMIT 1),
        (SELECT pc.id FROM public.part_category pc ORDER BY pc.sort_order, pc.label LIMIT 1)
      ),
      v_prop.part_name,
      v_prop.part_number,
      v_prop.brand,
      v_job.maintenance_component_id,
      coalesce((v_prop.sources->0->>'url'), ''),
      jsonb_build_object('sources', v_prop.sources, 'specs', coalesce(v_prop.checks->'specs', '{}'::jsonb)),
      v_decision,
      p_actor,
      CASE WHEN p_actor IS NULL THEN NULL ELSE now() END,
      'oem'
    RETURNING id INTO v_part_id;
  ELSE
    UPDATE public.part_master SET
      name = v_prop.part_name,
      maintenance_component_id = coalesce(maintenance_component_id, v_job.maintenance_component_id),
      evidence_url = coalesce(nullif(coalesce((v_prop.sources->0->>'url'), ''), ''), evidence_url),
      metadata = metadata || jsonb_build_object('sources', v_prop.sources, 'specs', coalesce(v_prop.checks->'specs', '{}'::jsonb)),
      catalog_decision = v_decision,
      verified_by = p_actor,
      verified_at = CASE WHEN p_actor IS NULL THEN verified_at ELSE now() END
    WHERE id = v_part_id;
  END IF;

  IF v_job.vehicle_catalog_id IS NOT NULL THEN
    INSERT INTO public.part_fitment (part_id, vehicle_catalog_id)
    VALUES (v_part_id, v_job.vehicle_catalog_id)
    ON CONFLICT (part_id, vehicle_catalog_id) DO NOTHING;
  END IF;

  UPDATE public.catalog_part_proposal SET promoted_part_id = v_part_id WHERE id = p_proposal_id;

  UPDATE public.parts_sourcing_requests r SET
    status = 'resolved',
    resolved_part_id = v_part_id,
    added_at = now(),
    resolution_note = coalesce(r.resolution_note, 'Added to catalog')
  WHERE r.catalog_research_job_id = v_job.id
    AND r.kind = 'add_part_info'
    AND r.status IN ('open', 'in_progress');

  SELECT coalesce(c.name, v_prop.part_name) INTO v_part_label
  FROM public.maintenance_service_categories c
  WHERE c.id = v_job.maintenance_component_id;

  SELECT concat_ws(' ', vc.make, vc.model, vc.production_start_year::text) INTO v_car_label
  FROM public.vehicle_catalog vc WHERE vc.id = v_job.vehicle_catalog_id;

  FOR v_org IN
    SELECT DISTINCT organization_id FROM public.parts_sourcing_requests
    WHERE catalog_research_job_id = v_job.id AND kind = 'add_part_info'
  LOOP
    INSERT INTO public.fleet_parts_notices (organization_id, kind, title, body)
    VALUES (
      v_org.organization_id,
      'catalog_added',
      'Part on file',
      format('%s for your %s is now on file.', coalesce(v_part_label, v_prop.part_name), coalesce(v_car_label, 'vehicle'))
    );
  END LOOP;

  UPDATE public.catalog_research_job SET
    state = 'added',
    updated_at = now()
  WHERE id = v_job.id;

  PERFORM public.catalog_research_log_event(
    v_job.id, 'promote', 'added',
    jsonb_build_object('proposalId', p_proposal_id, 'partId', v_part_id),
    p_actor
  );

  RETURN jsonb_build_object('partId', v_part_id, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_part_proposal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_part_proposal(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Queue claim (single worker)
-- ---------------------------------------------------------------------------

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
BEGIN
  v_locked := pg_try_advisory_lock(908871234);
  IF NOT v_locked THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'busy');
  END IF;

  SELECT * INTO v_settings FROM public.catalog_research_settings WHERE id = 1 FOR UPDATE;
  IF NOT v_settings.enabled THEN
    PERFORM pg_advisory_unlock(908871234);
    RETURN jsonb_build_object('claimed', false, 'reason', 'disabled');
  END IF;
  IF v_settings.paused AND (v_settings.auto_resume_at IS NULL OR v_settings.auto_resume_at > now()) THEN
    PERFORM pg_advisory_unlock(908871234);
    RETURN jsonb_build_object('claimed', false, 'reason', 'paused');
  END IF;
  IF v_settings.paused AND v_settings.auto_resume_at IS NOT NULL AND v_settings.auto_resume_at <= now() THEN
    UPDATE public.catalog_research_settings SET paused = false, paused_reason = NULL, auto_resume_at = NULL WHERE id = 1;
  END IF;

  SELECT count(*)::int INTO v_today
  FROM public.catalog_research_job
  WHERE created_at >= (timezone('America/Jamaica', now()))::date AT TIME ZONE 'America/Jamaica';

  IF v_today >= v_settings.daily_job_limit THEN
    PERFORM pg_advisory_unlock(908871234);
    RETURN jsonb_build_object('claimed', false, 'reason', 'daily_limit');
  END IF;

  SELECT r.msg_id, r.read_ct, r.message
  INTO v_msg_id, v_read_ct, v_message
  FROM pgmq.read('catalog_research', 600, 1) AS r(msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb)
  LIMIT 1;

  IF v_msg_id IS NULL THEN
    PERFORM pg_advisory_unlock(908871234);
    RETURN jsonb_build_object('claimed', false, 'reason', 'empty');
  END IF;

  v_job_id := (v_message->>'jobId')::uuid;
  IF v_job_id IS NULL THEN
    PERFORM pgmq.archive('catalog_research', v_msg_id);
    PERFORM pg_advisory_unlock(908871234);
    RETURN jsonb_build_object('claimed', false, 'reason', 'bad_message');
  END IF;

  IF v_read_ct >= 4 THEN
    UPDATE public.catalog_research_job SET state = 'failed', last_error = 'max_reads', pgmq_read_ct = v_read_ct, updated_at = now()
    WHERE id = v_job_id;
    PERFORM pgmq.archive('catalog_research', v_msg_id);
    PERFORM public.catalog_research_log_event(v_job_id, 'claim', 'failed_max_reads', jsonb_build_object('readCt', v_read_ct));
    PERFORM pg_advisory_unlock(908871234);
    RETURN jsonb_build_object('claimed', false, 'reason', 'failed', 'jobId', v_job_id);
  END IF;

  UPDATE public.catalog_research_job SET
    state = 'researching',
    attempts = attempts + 1,
    pgmq_msg_id = v_msg_id,
    pgmq_read_ct = v_read_ct,
    updated_at = now()
  WHERE id = v_job_id;

  PERFORM pg_advisory_unlock(908871234);
  RETURN jsonb_build_object(
    'claimed', true,
    'jobId', v_job_id,
    'msgId', v_msg_id,
    'readCt', v_read_ct
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_claim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_claim() TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_research_complete_msg(p_msg_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
BEGIN
  PERFORM pgmq.archive('catalog_research', p_msg_id);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_complete_msg(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_complete_msg(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_research_enqueue_job(p_job_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
DECLARE
  v_msg_id bigint;
BEGIN
  SELECT pgmq.send('catalog_research', jsonb_build_object('jobId', p_job_id)) INTO v_msg_id;
  RETURN v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_enqueue_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_enqueue_job(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Cron invoke + health
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.invoke_catalog_research()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, private
AS $$
DECLARE
  secret text;
  req_id bigint;
  v_settings record;
BEGIN
  SELECT * INTO v_settings FROM public.catalog_research_settings WHERE id = 1;
  IF NOT COALESCE(v_settings.enabled, false) THEN
    RETURN NULL;
  END IF;
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/catalog-research',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_catalog_research() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.invoke_catalog_research() TO postgres;

CREATE OR REPLACE FUNCTION public.catalog_research_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
DECLARE
  v_stuck integer;
  v_old_queued integer;
  v_old_review integer;
  v_depth integer := 0;
BEGIN
  UPDATE public.catalog_research_job SET state = 'queued', updated_at = now()
  WHERE state = 'researching' AND updated_at < now() - interval '30 minutes';
  GET DIAGNOSTICS v_stuck = ROW_COUNT;

  UPDATE public.catalog_research_job SET updated_at = now()
  WHERE state = 'queued' AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_old_queued = ROW_COUNT;

  SELECT count(*)::int INTO v_old_review
  FROM public.catalog_research_job
  WHERE state = 'needs_review' AND updated_at < now() - interval '7 days';

  BEGIN
    EXECUTE 'SELECT count(*)::int FROM pgmq.q_catalog_research' INTO v_depth;
  EXCEPTION WHEN undefined_table THEN
    v_depth := 0;
  END;

  RETURN jsonb_build_object(
    'stuckResearchingReset', v_stuck,
    'queuedOlderThan24h', v_old_queued,
    'reviewOlderThan7d', v_old_review,
    'queueDepth', v_depth
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_health() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'catalog-research-worker';
    PERFORM cron.schedule(
      'catalog-research-worker',
      '* * * * *',
      $cron$SELECT private.invoke_catalog_research();$cron$
    );

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'catalog-research-health-nightly';
    PERFORM cron.schedule(
      'catalog-research-health-nightly',
      '30 4 * * *',
      $cron$SELECT public.catalog_research_health();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped catalog-research cron jobs';
  END IF;
END $$;
