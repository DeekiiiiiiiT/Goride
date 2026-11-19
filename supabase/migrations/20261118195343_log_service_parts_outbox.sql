-- Log service parts gaps Slice B — outbox, research key v2, intake columns (LS-09 … LS-18, LS-21 … LS-23).

-- ---------------------------------------------------------------------------
-- 1a. Other item can hold a part number (LS-09)
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_work_order_line_item
  DROP CONSTRAINT IF EXISTS maintenance_work_order_line_item_part_number_kind_check;

ALTER TABLE public.maintenance_work_order_line_item
  ADD CONSTRAINT maintenance_work_order_line_item_part_number_kind_check
  CHECK (part_number IS NULL OR item_kind IN ('part_type', 'other'));

ALTER TABLE public.maintenance_work_order_line_item
  DROP CONSTRAINT IF EXISTS maintenance_work_order_line_item_other_part_number_check;

ALTER TABLE public.maintenance_work_order_line_item
  ADD CONSTRAINT maintenance_work_order_line_item_other_part_number_check
  CHECK (
    item_kind <> 'other'
    OR part_number IS NULL
    OR part_number ~ '^[A-Za-z0-9-]{1,80}$'
  );

-- ---------------------------------------------------------------------------
-- 1b. Where a request came from
-- ---------------------------------------------------------------------------
ALTER TABLE public.parts_sourcing_requests
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'find_parts';

ALTER TABLE public.parts_sourcing_requests
  DROP CONSTRAINT IF EXISTS parts_sourcing_requests_origin_check;

ALTER TABLE public.parts_sourcing_requests
  ADD CONSTRAINT parts_sourcing_requests_origin_check
  CHECK (origin IN ('find_parts', 'service_log'));

COMMENT ON COLUMN public.parts_sourcing_requests.origin IS
  'find_parts = Dominion Find parts; service_log = unknown part from a completed service.';

-- ---------------------------------------------------------------------------
-- 1c. What was asked on the research job (LS-21)
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_research_job
  ADD COLUMN IF NOT EXISTS requested_name text,
  ADD COLUMN IF NOT EXISTS requested_part_number text;

COMMENT ON COLUMN public.catalog_research_job.requested_name IS
  'Set when the job is created; on a merge filled only where empty; the first request wins.';

COMMENT ON COLUMN public.catalog_research_job.requested_part_number IS
  'Set when the job is created; on a merge filled only where empty; the first request wins.';

-- ---------------------------------------------------------------------------
-- 1d. Key v2 (LS-14)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_research_research_group_key_v2(
  p_vehicle_catalog_id uuid,
  p_component_id uuid,
  p_fit_descriptor text,
  p_install_side text,
  p_match_type text,
  p_position_scheme text,
  p_position_codes text[],
  p_part_number text,
  p_name text
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH stripped AS (
    SELECT
      coalesce(p_vehicle_catalog_id::text, '') AS cat_id,
      coalesce(p_component_id::text, '') AS comp_id,
      replace(coalesce(p_fit_descriptor, ''), '|', '') AS fit_raw,
      replace(coalesce(p_install_side, ''), '|', '') AS side_raw,
      replace(coalesce(p_match_type, ''), '|', '') AS match_raw,
      replace(coalesce(p_position_scheme, ''), '|', '') AS scheme_raw,
      p_position_codes AS codes_in,
      replace(coalesce(p_part_number, ''), '|', '') AS pn_raw,
      replace(coalesce(p_name, ''), '|', '') AS name_raw
  ),
  codes AS (
    SELECT coalesce(
      (
        SELECT string_agg(x, ',' ORDER BY x)
        FROM (
          SELECT DISTINCT btrim(replace(c, '|', '')) AS x
          FROM unnest((SELECT codes_in FROM stripped)) AS c
          WHERE c IS NOT NULL AND btrim(replace(c, '|', '')) <> ''
        ) s
      ),
      ''
    ) AS codes_csv
    FROM stripped
  ),
  body AS (
    SELECT
      s.cat_id,
      s.comp_id,
      coalesce(nullif(btrim(s.fit_raw), ''), nullif(btrim(s.side_raw), ''), '') AS fit_or_side,
      coalesce(nullif(btrim(s.match_raw), ''), '') AS match_t,
      CASE
        WHEN c.codes_csv = '' THEN ''
        ELSE coalesce(nullif(btrim(s.scheme_raw), ''), '')
      END AS scheme_out,
      c.codes_csv,
      upper(left(regexp_replace(s.pn_raw, '[^A-Za-z0-9-]', '', 'g'), 80)) AS pn_clean,
      lower(btrim(regexp_replace(s.name_raw, '\s+', ' ', 'g'))) AS name_norm
    FROM stripped s
    CROSS JOIN codes c
  ),
  identity AS (
    SELECT
      b.*,
      CASE
        WHEN b.pn_clean <> '' THEN 'pn:' || b.pn_clean
        WHEN b.name_norm <> '' THEN 'nm:' || md5(b.name_norm)
        ELSE ''
      END AS id_seg
    FROM body b
  )
  SELECT concat_ws(
    '|',
    'v2',
    cat_id,
    comp_id,
    fit_or_side,
    match_t,
    scheme_out,
    codes_csv,
    id_seg
  )
  FROM identity;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_research_group_key_v2(
  uuid, uuid, text, text, text, text, text[], text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_research_group_key_v2(
  uuid, uuid, text, text, text, text, text[], text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 1e. Rewrite open keys to v2 (LS-15)
-- ---------------------------------------------------------------------------
-- A job's key takes side, position and part number from its first open request, exactly what a new Find parts request
-- for the same part builds (no name), so repeat requests after the deploy join the job instead of opening a second one.
UPDATE public.catalog_research_job j
SET
  group_key = public.catalog_research_research_group_key_v2(
    j.vehicle_catalog_id,
    j.maintenance_component_id,
    j.fit_descriptor,
    first_req.install_side,
    j.match_type,
    first_req.position_scheme,
    first_req.position_codes,
    first_req.old_part_number,
    NULL
  ),
  updated_at = now()
FROM public.catalog_research_job j2
LEFT JOIN LATERAL (
  SELECT r.install_side, r.position_scheme, r.position_codes, r.old_part_number
  FROM public.parts_sourcing_requests r
  WHERE r.catalog_research_job_id = j2.id
    AND r.status IN ('open', 'in_progress')
  ORDER BY r.created_at ASC
  LIMIT 1
) first_req ON true
WHERE j2.id = j.id
  AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
  AND j.group_key NOT LIKE 'v2|%';

UPDATE public.parts_sourcing_requests r
SET research_group_key = j.group_key
FROM public.catalog_research_job j
WHERE r.catalog_research_job_id = j.id
  AND r.kind = 'add_part_info'
  AND r.status IN ('open', 'in_progress')
  AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added');

UPDATE public.parts_sourcing_requests r
SET research_group_key = public.catalog_research_research_group_key_v2(
  r.vehicle_catalog_id,
  r.maintenance_component_id,
  r.fit_descriptor,
  r.install_side,
  r.match_type,
  r.position_scheme,
  r.position_codes,
  r.old_part_number,
  NULL
)
WHERE r.kind = 'add_part_info'
  AND r.status IN ('open', 'in_progress')
  AND (
    r.catalog_research_job_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.catalog_research_job j
      WHERE j.id = r.catalog_research_job_id
        AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
    )
  )
  AND coalesce(r.research_group_key, '') NOT LIKE 'v2|%';

DO $$
DECLARE
  v_bad_jobs bigint;
  v_bad_req bigint;
  v_mismatch bigint;
BEGIN
  SELECT count(*) INTO v_bad_jobs
  FROM public.catalog_research_job j
  WHERE j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
    AND j.group_key NOT LIKE 'v2|%';

  SELECT count(*) INTO v_bad_req
  FROM public.parts_sourcing_requests r
  WHERE r.kind = 'add_part_info'
    AND r.status IN ('open', 'in_progress')
    AND coalesce(r.research_group_key, '') NOT LIKE 'v2|%';

  SELECT count(*) INTO v_mismatch
  FROM public.parts_sourcing_requests r
  JOIN public.catalog_research_job j ON j.id = r.catalog_research_job_id
  WHERE r.kind = 'add_part_info'
    AND r.status IN ('open', 'in_progress')
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
    AND r.research_group_key IS DISTINCT FROM j.group_key;

  IF v_bad_jobs > 0 OR v_bad_req > 0 OR v_mismatch > 0 THEN
    RAISE EXCEPTION 'v2 key rewrite failed jobs=% requests=% mismatch=%', v_bad_jobs, v_bad_req, v_mismatch;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1f. Outbox table (LS-12)
-- ---------------------------------------------------------------------------
CREATE TABLE public.parts_sourcing_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  work_order_id uuid NOT NULL REFERENCES public.maintenance_work_orders (id) ON DELETE CASCADE,
  line_item_id uuid NOT NULL UNIQUE REFERENCES public.maintenance_work_order_line_item (id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'sent', 'merged', 'not_sent', 'cancelled')),
  reason_code text NULL
    CHECK (reason_code IS NULL OR reason_code IN ('car_not_linked', 'daily_limit', 'error')),
  tries integer NOT NULL DEFAULT 0,
  next_try_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz NULL,
  request_id uuid NULL REFERENCES public.parts_sourcing_requests (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parts_sourcing_outbox_sent_req_check
    CHECK ((state IN ('sent', 'merged')) = (request_id IS NOT NULL))
);

CREATE INDEX parts_sourcing_outbox_state_next_idx
  ON public.parts_sourcing_outbox (state, next_try_at);

COMMENT ON TABLE public.parts_sourcing_outbox IS
  'Queue of unknown service-line items to send to Dominion; one row per eligible line item.';

COMMENT ON COLUMN public.parts_sourcing_outbox.state IS
  'pending | sent | merged | not_sent | cancelled';

COMMENT ON COLUMN public.parts_sourcing_outbox.reason_code IS
  'car_not_linked | daily_limit | error when pending retries or not_sent final.';

ALTER TABLE public.parts_sourcing_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.parts_sourcing_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.parts_sourcing_outbox TO service_role;

-- ---------------------------------------------------------------------------
-- 1g. Queue eligible items
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parts_sourcing_outbox_queue(p_work_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cnt integer;
BEGIN
  WITH ins AS (
    INSERT INTO public.parts_sourcing_outbox (
      organization_id,
      work_order_id,
      line_item_id
    )
    SELECT
      wo.organization_id,
      wo.id,
      i.id
    FROM public.maintenance_work_order_line_item i
    JOIN public.maintenance_work_order_lines l
      ON l.id = i.work_order_line_id
     AND l.work_order_id = i.work_order_id
    JOIN public.maintenance_work_orders wo ON wo.id = i.work_order_id
    WHERE wo.id = p_work_order_id
      AND (
        i.item_kind = 'other'
        OR (i.item_kind = 'part_type' AND i.part_id IS NULL)
      )
      AND i.item_kind <> 'supply'
      AND coalesce(l.recommended, false) = false
      AND coalesce(l.declined, false) = false
      AND l.voided_at IS NULL
      AND wo.voided_at IS NULL
    ON CONFLICT (line_item_id) DO UPDATE SET
      state = 'pending',
      reason_code = NULL,
      next_try_at = now(),
      claimed_at = NULL,
      updated_at = now()
    WHERE public.parts_sourcing_outbox.state = 'cancelled'
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_cnt FROM ins;

  RETURN coalesce(v_cnt, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1h. Claim due rows
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parts_sourcing_outbox_claim(p_limit integer DEFAULT 25)
RETURNS SETOF public.parts_sourcing_outbox
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH picked AS (
    SELECT o.id
    FROM public.parts_sourcing_outbox o
    WHERE o.state = 'pending'
      AND o.next_try_at <= now()
      AND (
        o.claimed_at IS NULL
        OR o.claimed_at < now() - interval '10 minutes'
      )
    ORDER BY o.next_try_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.parts_sourcing_outbox o
  SET
    claimed_at = now(),
    updated_at = now()
  FROM picked p
  WHERE o.id = p.id
  RETURNING o.*;
$$;

-- ---------------------------------------------------------------------------
-- 1j. Retry later (defined before send; send calls it for car_not_linked)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parts_sourcing_outbox_retry(p_outbox_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.parts_sourcing_outbox%ROWTYPE;
  v_next timestamptz;
  v_tries integer;
BEGIN
  SELECT * INTO v_row
  FROM public.parts_sourcing_outbox
  WHERE id = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbox_not_found';
  END IF;

  IF v_row.state <> 'pending' THEN
    RETURN jsonb_build_object(
      'state', v_row.state,
      'reason', v_row.reason_code,
      'nextTryAt', v_row.next_try_at
    );
  END IF;

  v_next := v_row.next_try_at;
  v_tries := v_row.tries;

  IF p_reason = 'car_not_linked' THEN
    IF v_row.created_at < now() - interval '30 days' THEN
      UPDATE public.parts_sourcing_outbox
      SET
        state = 'not_sent',
        reason_code = 'car_not_linked',
        claimed_at = NULL,
        updated_at = now()
      WHERE id = p_outbox_id;
      RETURN jsonb_build_object('state', 'not_sent', 'reason', 'car_not_linked');
    END IF;
    v_next := now() + interval '24 hours';
    UPDATE public.parts_sourcing_outbox
    SET
      state = 'pending',
      reason_code = 'car_not_linked',
      next_try_at = v_next,
      claimed_at = NULL,
      updated_at = now()
    WHERE id = p_outbox_id;
    RETURN jsonb_build_object('state', 'pending', 'reason', 'car_not_linked', 'nextTryAt', v_next);

  ELSIF p_reason = 'error' THEN
    v_tries := v_tries + 1;
    IF v_tries >= 5 THEN
      UPDATE public.parts_sourcing_outbox
      SET
        state = 'not_sent',
        reason_code = 'error',
        tries = v_tries,
        claimed_at = NULL,
        updated_at = now()
      WHERE id = p_outbox_id;
      RETURN jsonb_build_object('state', 'not_sent', 'reason', 'error', 'tries', v_tries);
    END IF;
    v_next := CASE v_tries
      WHEN 1 THEN now() + interval '1 minute'
      WHEN 2 THEN now() + interval '5 minutes'
      WHEN 3 THEN now() + interval '30 minutes'
      ELSE now() + interval '120 minutes'
    END;
    UPDATE public.parts_sourcing_outbox
    SET
      state = 'pending',
      reason_code = 'error',
      tries = v_tries,
      next_try_at = v_next,
      claimed_at = NULL,
      updated_at = now()
    WHERE id = p_outbox_id;
    RETURN jsonb_build_object('state', 'pending', 'reason', 'error', 'nextTryAt', v_next, 'tries', v_tries);

  ELSE
    RAISE EXCEPTION 'retry_reason_invalid';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1h2. Join or create catalog research job (Find parts + service drain)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_research_join_or_create_job(
  p_group_key text,
  p_vehicle_catalog_id uuid,
  p_component_id uuid,
  p_fit_descriptor text,
  p_match_type text,
  p_requested_name text,
  p_requested_part_number text,
  p_origin text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
  v_new_job boolean := false;
  v_name text;
  v_pn text;
BEGIN
  v_name := nullif(btrim(p_requested_name), '');
  v_pn := nullif(upper(left(regexp_replace(coalesce(p_requested_part_number, ''), '[^A-Za-z0-9-]', '', 'g'), 80)), '');

  INSERT INTO public.catalog_research_job (
    job_type,
    group_key,
    vehicle_catalog_id,
    maintenance_component_id,
    fit_descriptor,
    match_type,
    fleet_count,
    state,
    requested_name,
    requested_part_number
  ) VALUES (
    'part',
    p_group_key,
    p_vehicle_catalog_id,
    p_component_id,
    nullif(p_fit_descriptor, ''),
    nullif(p_match_type, ''),
    1,
    'queued',
    v_name,
    v_pn
  )
  ON CONFLICT (group_key) WHERE state IN (
    'queued', 'researching', 'checking', 'needs_review', 'auto_added'
  )
  DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NOT NULL THEN
    v_new_job := true;
    PERFORM public.catalog_research_enqueue_job(v_job_id);
    PERFORM public.catalog_research_log_event(
      v_job_id,
      'enqueue',
      'queued',
      jsonb_build_object('groupKey', p_group_key, 'origin', p_origin)
    );
  ELSE
    SELECT j.id INTO v_job_id
    FROM public.catalog_research_job j
    WHERE j.group_key = p_group_key
      AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
    LIMIT 1;

    UPDATE public.catalog_research_job
    SET
      fleet_count = fleet_count + 1,
      requested_name = coalesce(nullif(requested_name, ''), v_name),
      requested_part_number = coalesce(nullif(requested_part_number, ''), v_pn),
      updated_at = now()
    WHERE id = v_job_id;
  END IF;

  RETURN jsonb_build_object('jobId', v_job_id, 'newJob', v_new_job);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1i. Send one claimed row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parts_sourcing_outbox_send(p_outbox_id uuid, p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ob public.parts_sourcing_outbox%ROWTYPE;
  v_item public.maintenance_work_order_line_item%ROWTYPE;
  v_line public.maintenance_work_order_lines%ROWTYPE;
  v_wo public.maintenance_work_orders%ROWTYPE;
  v_key text;
  v_pn_clean text;
  v_item_name text;
  v_codes text[];
  v_scheme text;
  v_dup_id uuid;
  v_day_start timestamptz;
  v_day_cnt bigint;
  v_next_day timestamptz;
  v_job_id uuid;
  v_new_job boolean := false;
  v_request_id uuid;
  v_retry jsonb;
  v_job_rpc jsonb;
BEGIN
  SELECT * INTO v_ob
  FROM public.parts_sourcing_outbox
  WHERE id = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbox_not_found';
  END IF;

  IF v_ob.state IN ('sent', 'merged') THEN
    RETURN jsonb_build_object(
      'result', v_ob.state,
      'requestId', v_ob.request_id
    );
  END IF;

  IF v_ob.state IN ('not_sent', 'cancelled') THEN
    RETURN jsonb_build_object('result', v_ob.state);
  END IF;

  IF v_ob.state = 'pending' AND v_ob.claimed_at IS NULL THEN
    RAISE EXCEPTION 'outbox_not_claimed';
  END IF;

  SELECT * INTO v_item
  FROM public.maintenance_work_order_line_item i
  WHERE i.id = v_ob.line_item_id;

  IF NOT FOUND THEN
    UPDATE public.parts_sourcing_outbox
    SET state = 'cancelled', claimed_at = NULL, updated_at = now()
    WHERE id = p_outbox_id;
    RETURN jsonb_build_object('result', 'cancelled');
  END IF;

  SELECT * INTO v_line
  FROM public.maintenance_work_order_lines l
  WHERE l.id = v_item.work_order_line_id
    AND l.work_order_id = v_item.work_order_id;
  IF NOT FOUND THEN
    UPDATE public.parts_sourcing_outbox
    SET state = 'cancelled', claimed_at = NULL, updated_at = now()
    WHERE id = p_outbox_id;
    RETURN jsonb_build_object('result', 'cancelled');
  END IF;

  SELECT * INTO v_wo
  FROM public.maintenance_work_orders wo
  WHERE wo.id = v_item.work_order_id;
  IF NOT FOUND
    OR v_line.voided_at IS NOT NULL
    OR v_wo.voided_at IS NOT NULL THEN
    UPDATE public.parts_sourcing_outbox
    SET state = 'cancelled', claimed_at = NULL, updated_at = now()
    WHERE id = p_outbox_id;
    RETURN jsonb_build_object('result', 'cancelled');
  END IF;

  IF v_wo.status <> 'completed' THEN
    IF v_ob.created_at < now() - interval '7 days' THEN
      UPDATE public.parts_sourcing_outbox
      SET state = 'cancelled', claimed_at = NULL, updated_at = now()
      WHERE id = p_outbox_id;
      RETURN jsonb_build_object('result', 'cancelled');
    END IF;
    UPDATE public.parts_sourcing_outbox
    SET
      claimed_at = NULL,
      next_try_at = now() + interval '5 minutes',
      updated_at = now()
    WHERE id = p_outbox_id;
    RETURN jsonb_build_object('result', 'not_completed');
  END IF;

  IF coalesce(p_row ->> 'organization_id', '') <> v_ob.organization_id THEN
    RAISE EXCEPTION 'outbox_org_mismatch';
  END IF;

  IF coalesce(btrim(p_row ->> 'vehicle_catalog_id'), '') = '' THEN
    v_retry := public.parts_sourcing_outbox_retry(p_outbox_id, 'car_not_linked');
    RETURN v_retry || jsonb_build_object('result', 'car_not_linked');
  END IF;

  v_item_name := coalesce(p_row ->> 'item_name', v_item.item_name, '');

  SELECT coalesce(
    array_agg(elem ORDER BY elem),
    ARRAY[]::text[]
  )
  INTO v_codes
  FROM jsonb_array_elements_text(
    CASE
      WHEN p_row ? 'position_codes' AND jsonb_typeof(p_row -> 'position_codes') = 'array'
        THEN p_row -> 'position_codes'
      ELSE '[]'::jsonb
    END
  ) AS elem;

  IF cardinality(v_codes) = 0 THEN
    v_scheme := NULL;
    v_codes := NULL;
  ELSE
    v_scheme := nullif(btrim(p_row ->> 'position_scheme'), '');
  END IF;

  v_pn_clean := upper(
    left(regexp_replace(coalesce(p_row ->> 'old_part_number', v_item.part_number, ''), '[^A-Za-z0-9-]', '', 'g'), 80)
  );
  IF v_pn_clean = '' THEN
    v_pn_clean := NULL;
  END IF;

  v_key := public.catalog_research_research_group_key_v2(
    nullif(p_row ->> 'vehicle_catalog_id', '')::uuid,
    nullif(p_row ->> 'maintenance_component_id', '')::uuid,
    nullif(p_row ->> 'fit_descriptor', ''),
    nullif(p_row ->> 'install_side', ''),
    nullif(p_row ->> 'match_type', ''),
    v_scheme,
    v_codes,
    coalesce(p_row ->> 'old_part_number', v_item.part_number),
    v_item_name
  );

  -- Two sends for the same company and part at the same moment must not both miss each other and file two
  -- requests (or both slip under the daily limit): one company's sends wait for each other from here on.
  PERFORM pg_advisory_xact_lock(hashtextextended('parts_sourcing_outbox_send|' || v_ob.organization_id, 0));

  SELECT r.id INTO v_dup_id
  FROM public.parts_sourcing_requests r
  WHERE r.organization_id = v_ob.organization_id
    AND r.kind = 'add_part_info'
    AND r.research_group_key = v_key
    AND r.status IN ('open', 'in_progress')
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_dup_id IS NOT NULL THEN
    UPDATE public.parts_sourcing_outbox
    SET
      state = 'merged',
      request_id = v_dup_id,
      reason_code = NULL,
      claimed_at = NULL,
      updated_at = now()
    WHERE id = p_outbox_id;
    RETURN jsonb_build_object('result', 'merged', 'requestId', v_dup_id);
  END IF;

  v_day_start := (date_trunc('day', now() AT TIME ZONE 'America/Jamaica')) AT TIME ZONE 'America/Jamaica';
  SELECT count(*) INTO v_day_cnt
  FROM public.parts_sourcing_requests r
  WHERE r.organization_id = v_ob.organization_id
    AND r.kind = 'add_part_info'
    AND r.created_at >= v_day_start;

  IF v_day_cnt >= 30 THEN
    v_next_day := (
      date_trunc('day', now() AT TIME ZONE 'America/Jamaica') + interval '1 day 5 minutes')
      AT TIME ZONE 'America/Jamaica';
    UPDATE public.parts_sourcing_outbox
    SET
      state = 'pending',
      reason_code = 'daily_limit',
      next_try_at = v_next_day,
      claimed_at = NULL,
      updated_at = now()
    WHERE id = p_outbox_id;
    RETURN jsonb_build_object('result', 'daily_limit', 'nextTryAt', v_next_day);
  END IF;

  v_job_rpc := public.catalog_research_join_or_create_job(
    v_key,
    nullif(p_row ->> 'vehicle_catalog_id', '')::uuid,
    nullif(p_row ->> 'maintenance_component_id', '')::uuid,
    nullif(p_row ->> 'fit_descriptor', ''),
    nullif(p_row ->> 'match_type', ''),
    v_item_name,
    coalesce(p_row ->> 'old_part_number', v_item.part_number),
    'service_log'
  );
  v_job_id := nullif(v_job_rpc ->> 'jobId', '')::uuid;
  v_new_job := coalesce((v_job_rpc ->> 'newJob')::boolean, false);

  INSERT INTO public.parts_sourcing_requests (
    organization_id,
    vehicle_id,
    need_text,
    created_by,
    maintenance_component_id,
    vehicle_catalog_id,
    platform_id,
    engine_family_id,
    urgency,
    reply_due_at,
    qty,
    photo_url,
    install_side,
    install_position,
    fit_descriptor,
    match_type,
    sent_at,
    old_part_number,
    position_scheme,
    position_codes,
    status,
    kind,
    origin,
    research_group_key,
    catalog_research_job_id
  ) VALUES (
    p_row ->> 'organization_id',
    p_row ->> 'vehicle_id',
    coalesce(p_row ->> 'need_text', left(v_item_name, 2000)),
    nullif(p_row ->> 'created_by', '')::uuid,
    nullif(p_row ->> 'maintenance_component_id', '')::uuid,
    nullif(p_row ->> 'vehicle_catalog_id', '')::uuid,
    nullif(p_row ->> 'platform_id', '')::uuid,
    nullif(p_row ->> 'engine_family_id', '')::uuid,
    nullif(p_row ->> 'urgency', ''),
    nullif(p_row ->> 'reply_due_at', '')::timestamptz,
    nullif(p_row ->> 'qty', '')::numeric,
    nullif(p_row ->> 'photo_url', ''),
    nullif(p_row ->> 'install_side', ''),
    nullif(p_row ->> 'install_position', ''),
    nullif(p_row ->> 'fit_descriptor', ''),
    nullif(p_row ->> 'match_type', ''),
    nullif(p_row ->> 'sent_at', '')::timestamptz,
    v_pn_clean,
    v_scheme,
    v_codes,
    'open',
    'add_part_info',
    'service_log',
    v_key,
    v_job_id
  )
  RETURNING id INTO v_request_id;

  UPDATE public.parts_sourcing_outbox
  SET
    state = 'sent',
    request_id = v_request_id,
    reason_code = NULL,
    claimed_at = NULL,
    updated_at = now()
  WHERE id = p_outbox_id;

  RETURN jsonb_build_object(
    'result', 'sent',
    'requestId', v_request_id,
    'jobId', v_job_id,
    'newJob', v_new_job
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 1k. Grants for public RPCs
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.parts_sourcing_outbox_queue(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_sourcing_outbox_queue(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.parts_sourcing_outbox_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_sourcing_outbox_claim(integer) TO service_role;

REVOKE ALL ON FUNCTION public.parts_sourcing_outbox_send(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_sourcing_outbox_send(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.parts_sourcing_outbox_retry(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_sourcing_outbox_retry(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.catalog_research_join_or_create_job(
  text, uuid, uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_join_or_create_job(
  text, uuid, uuid, text, text, text, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 1l. Cron relay (never behind catalog_research_claim)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.invoke_parts_sourcing_drain()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
  v_due bigint;
BEGIN
  SELECT count(*) INTO v_due
  FROM public.parts_sourcing_outbox o
  WHERE o.state = 'pending'
    AND o.next_try_at <= now();

  IF v_due = 0 THEN
    RETURN NULL;
  END IF;

  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'parts_sourcing_drain_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE NOTICE 'parts_sourcing_drain_secret missing';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := private.vehicle_picture_functions_url('parts-sourcing-drain'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Parts-Sourcing-Drain-Secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO req_id;

  RETURN req_id;
END;
$$;

ALTER FUNCTION private.invoke_parts_sourcing_drain() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_parts_sourcing_drain() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.invoke_parts_sourcing_drain() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'parts-sourcing-outbox-drain';

    PERFORM cron.schedule(
      'parts-sourcing-outbox-drain',
      '* * * * *',
      $cron$SELECT private.invoke_parts_sourcing_drain();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped parts-sourcing-outbox-drain';
  END IF;
END $$;