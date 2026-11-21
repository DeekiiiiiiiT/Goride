-- Research engine — layer 1a (docs/research-engine-audit.md §4, Rev 2.7).
-- Additive and safe for today's server code:
--   * new tables (trusted_site, research_lookup_recipe, research_page_read, dominion_system_notice,
--     dominion_audit_log, brand_alias, research_number_conflict, catalog_spec_proposal, spec_column_key_map)
--   * new columns on research / listing / spec tables, CHECKs widened (never narrowed)
--   * engine trust verdicts survive the phase-3a trust triggers (RE-19)
--   * vehicle research jobs no longer carry the organisation id (RE-07) and record origin (RE-28)
--   * health check split into read-only report + unstick + notices (RE-17)
-- Deliberately NOT here (layer 1b, ships with layer 2): spec backfill + trust gating in specs_for_variant /
-- parts_for_vehicle / readiness, promote_part_proposal rewrite, save function p_trust_set_by.
-- Deliberately NOT here (cleanup, after layer 2 deploys): drop catalog_trusted_source, part_fitment,
-- catalog_research_settings.daily_job_limit — today's worker and routes still read them.

-- ---------------------------------------------------------------------------
-- 1. trusted_site: one row per website, holds reading state (RE-01 / RE-11)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trusted_site (
  domain text PRIMARY KEY CHECK (domain = lower(btrim(domain)) AND domain <> ''),
  automated_read text NOT NULL DEFAULT 'not_checked'
    CHECK (automated_read IN ('allowed', 'blocked', 'not_checked')),
  automated_read_checked_at timestamptz,
  automated_read_note text,
  blocked_at timestamptz,
  backoff_until timestamptz,
  pages_confirmed integer NOT NULL DEFAULT 0 CHECK (pages_confirmed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed every domain from both old lists before trusted_source gets its FK.
INSERT INTO public.trusted_site (domain)
SELECT DISTINCT lower(btrim(domain)) FROM public.trusted_source
UNION
SELECT DISTINCT lower(btrim(domain)) FROM public.catalog_trusted_source
ON CONFLICT (domain) DO NOTHING;

-- Spike 0 (20 Nov 2026, audit §2a) verdicts.
INSERT INTO public.trusted_site (domain, automated_read, automated_read_checked_at, automated_read_note) VALUES
  ('sbparts.jp',      'allowed', '2026-11-20', 'robots: no rules for general bots; no terms page found'),
  ('jnbk-brakes.com', 'allowed', '2026-11-20', 'robots: empty file; no terms page found'),
  ('bremboparts.com', 'allowed', '2026-11-20', 'robots: Allow: /; no terms page found'),
  ('rockauto.com',    'allowed', '2026-11-20', 'robots: only /info/ and /cgi-bin/ disallowed; reference only'),
  ('masuma.parts',    'blocked', '2026-11-20', 'robots: Disallow /search, /find-parts/ (the by-car lookup)'),
  ('amayama.com',     'blocked', '2026-11-20', 'robots: Disallow /*/find; home page 403'),
  ('megazip.net',     'blocked', '2026-11-20', 'terms §13 forbid spidering, crawling or scraping'),
  ('partsouq.com',    'blocked', '2026-11-20', 'home page 403 to automated fetch'),
  ('7zap.com',        'blocked', '2026-11-20', 'home page 403; robots malformed')
ON CONFLICT (domain) DO UPDATE SET
  automated_read = EXCLUDED.automated_read,
  automated_read_checked_at = EXCLUDED.automated_read_checked_at,
  automated_read_note = EXCLUDED.automated_read_note,
  updated_at = now();

-- Carry the robot's counters across.
UPDATE public.trusted_site s
SET blocked_at = coalesce(s.blocked_at, c.blocked_at),
    pages_confirmed = greatest(s.pages_confirmed, c.pages_confirmed)
FROM public.catalog_trusted_source c
WHERE lower(btrim(c.domain)) = s.domain;

-- ---------------------------------------------------------------------------
-- 2. trusted_source: maker <-> site, kind adds 'reference', FK to trusted_site
-- ---------------------------------------------------------------------------
ALTER TABLE public.trusted_source DROP CONSTRAINT IF EXISTS trusted_source_kind_check;
ALTER TABLE public.trusted_source ADD CONSTRAINT trusted_source_kind_check
  CHECK (kind IN ('car_maker', 'part_maker', 'reference'));

UPDATE public.trusted_source SET domain = lower(btrim(domain)) WHERE domain <> lower(btrim(domain));

-- Robot-only sites get their maker rows (reference sites cover every maker).
INSERT INTO public.trusted_source (kind, maker, domain) VALUES
  ('part_maker', 'Masuma', 'masuma.parts'),
  ('reference', 'All makers', 'rockauto.com'),
  ('reference', 'All makers', '7zap.com')
ON CONFLICT ON CONSTRAINT trusted_source_unique_triplet DO NOTHING;

ALTER TABLE public.trusted_source DROP CONSTRAINT IF EXISTS trusted_source_domain_fk;
ALTER TABLE public.trusted_source ADD CONSTRAINT trusted_source_domain_fk
  FOREIGN KEY (domain) REFERENCES public.trusted_site (domain) ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Lookup recipes (RE-02). Seeded in layer 2 once each recipe is proven.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.research_lookup_recipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL REFERENCES public.trusted_site (domain) ON UPDATE CASCADE,
  maker_norm text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  kind text NOT NULL CHECK (kind IN ('by_part_number', 'search_then_page', 'browser_check_link')),
  search_url_template text,
  result_link_rule text,
  block_rule text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_lookup_recipe_domain ON public.research_lookup_recipe (domain) WHERE active;

-- ---------------------------------------------------------------------------
-- 4. research_page_read: append-only evidence (RE-01 / RE-03 / RE-20)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.research_page_read (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.catalog_research_job (id) ON DELETE SET NULL,
  purpose text NOT NULL DEFAULT 'job' CHECK (purpose IN ('job', 'recipe_test', 'recheck')),
  path text NOT NULL CHECK (path IN ('direct', 'owner_browser')),
  domain text,
  url text NOT NULL CHECK (btrim(url) <> ''),
  final_url text,
  http_status integer,
  recipe_id uuid REFERENCES public.research_lookup_recipe (id) ON DELETE SET NULL,
  block_text text,
  block_hash text,
  body_hash text,
  checked_by uuid,
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_page_read_owner_has_checker CHECK (path <> 'owner_browser' OR checked_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS research_page_read_job ON public.research_page_read (job_id);
CREATE INDEX IF NOT EXISTS research_page_read_recipe ON public.research_page_read (recipe_id, read_at DESC);
CREATE INDEX IF NOT EXISTS research_page_read_domain ON public.research_page_read (domain, read_at DESC);

CREATE OR REPLACE FUNCTION public.research_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_new jsonb;
  v_old jsonb;
BEGIN
  -- Allow only the FK cascades on research_page_read (job / recipe removed → reference set to NULL).
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'research_page_read' THEN
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
    IF (v_new - 'job_id' - 'recipe_id') = (v_old - 'job_id' - 'recipe_id')
       AND (v_new->>'job_id' IS NULL OR v_new->>'job_id' = v_old->>'job_id')
       AND (v_new->>'recipe_id' IS NULL OR v_new->>'recipe_id' = v_old->>'recipe_id') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS research_page_read_append_only ON public.research_page_read;
CREATE TRIGGER research_page_read_append_only
  BEFORE UPDATE OR DELETE ON public.research_page_read
  FOR EACH ROW EXECUTE FUNCTION public.research_append_only_guard();

-- ---------------------------------------------------------------------------
-- 5. Notices (RE-17), audit log (RE-21), brand aliases (RE-18)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dominion_system_notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('engine_paused', 'site_blocked', 'spend_cap', 'grounding_limit', 'evidence_changed')),
  subject text NOT NULL DEFAULT '',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS dominion_system_notice_one_open
  ON public.dominion_system_notice (kind, subject) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.dominion_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor uuid,
  action text NOT NULL,
  table_name text NOT NULL,
  row_id text,
  before jsonb,
  after jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dominion_audit_log_table_row ON public.dominion_audit_log (table_name, row_id, at DESC);

DROP TRIGGER IF EXISTS dominion_audit_log_append_only ON public.dominion_audit_log;
CREATE TRIGGER dominion_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.dominion_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.research_append_only_guard();

CREATE TABLE IF NOT EXISTS public.brand_alias (
  alias_norm text PRIMARY KEY CHECK (alias_norm = lower(btrim(alias_norm)) AND alias_norm <> ''),
  brand text NOT NULL CHECK (btrim(brand) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.brand_alias (alias_norm, brand) VALUES
  ('nsk', 'NSK'),
  ('jtekt', 'JTEKT'),
  ('koyo', 'JTEKT'),
  ('ntn', 'NTN'),
  ('nibk', 'NiBK'),
  ('sb', 'SB Nagamochi'),
  ('sb nagamochi', 'SB Nagamochi')
ON CONFLICT (alias_norm) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Research jobs: origin, browser-check flag, new job types (RE-06/07/08/10/22/28)
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_research_job
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS browser_check_allowed boolean,
  ADD COLUMN IF NOT EXISTS pending_request_id uuid,
  ADD COLUMN IF NOT EXISTS spec_key text,
  ADD COLUMN IF NOT EXISTS batch_key text,
  ADD COLUMN IF NOT EXISTS step_done integer NOT NULL DEFAULT 0;

UPDATE public.catalog_research_job SET origin = 'fleet' WHERE origin IS NULL;
UPDATE public.catalog_research_job SET browser_check_allowed = true WHERE browser_check_allowed IS NULL;

ALTER TABLE public.catalog_research_job
  ALTER COLUMN origin SET DEFAULT 'fleet',
  ALTER COLUMN origin SET NOT NULL,
  ALTER COLUMN browser_check_allowed SET DEFAULT true,
  ALTER COLUMN browser_check_allowed SET NOT NULL;

ALTER TABLE public.catalog_research_job DROP CONSTRAINT IF EXISTS catalog_research_job_origin_check;
ALTER TABLE public.catalog_research_job ADD CONSTRAINT catalog_research_job_origin_check
  CHECK (origin IN ('fleet', 'owner_fill', 'sweep'));

ALTER TABLE public.catalog_research_job DROP CONSTRAINT IF EXISTS catalog_research_job_job_type_check;
ALTER TABLE public.catalog_research_job ADD CONSTRAINT catalog_research_job_job_type_check
  CHECK (job_type IN ('part', 'vehicle', 'spec', 'vehicle_identity', 'vehicle_model'));

ALTER TABLE public.catalog_research_job DROP CONSTRAINT IF EXISTS catalog_research_job_state_check;
ALTER TABLE public.catalog_research_job ADD CONSTRAINT catalog_research_job_state_check
  CHECK (state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'added', 'not_found',
                   'failed', 'browser_check', 'browser_check_queued'));

ALTER TABLE public.catalog_research_job DROP CONSTRAINT IF EXISTS catalog_research_job_spec_key_fk;
ALTER TABLE public.catalog_research_job ADD CONSTRAINT catalog_research_job_spec_key_fk
  FOREIGN KEY (spec_key) REFERENCES public.spec_key (key);

ALTER TABLE public.catalog_research_job DROP CONSTRAINT IF EXISTS catalog_research_job_pending_request_fk;
ALTER TABLE public.catalog_research_job ADD CONSTRAINT catalog_research_job_pending_request_fk
  FOREIGN KEY (pending_request_id) REFERENCES public.vehicle_catalog_pending_requests (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS catalog_research_job_origin_state ON public.catalog_research_job (origin, state);

-- Vehicle jobs: key without the organisation id (RE-07). Strip the 5th segment from every existing key
-- (closed jobs too, because /jobs and export.csv return them). Open duplicates after re-keying are merged
-- into the oldest one.
WITH rekey AS (
  SELECT id,
         array_to_string((string_to_array(group_key, ':'))[1:4], ':') AS new_key
  FROM public.catalog_research_job
  WHERE job_type = 'vehicle' AND array_length(string_to_array(group_key, ':'), 1) >= 5
), ranked AS (
  SELECT r.id, r.new_key,
         -- The open job wins over closed ones, then the oldest (review: never close the only open job).
         row_number() OVER (PARTITION BY r.new_key
                            ORDER BY (j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')) DESC,
                                     j.created_at, j.id) AS rn,
         j.state
  FROM rekey r JOIN public.catalog_research_job j ON j.id = r.id
)
UPDATE public.catalog_research_job j
SET state = CASE WHEN ranked.rn > 1 AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
                 THEN 'failed' ELSE j.state END,
    last_error = CASE WHEN ranked.rn > 1 AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
                      THEN 'merged into the oldest job for this car (layer 1a re-key)' ELSE j.last_error END,
    group_key = ranked.new_key,
    updated_at = now()
FROM ranked
WHERE ranked.id = j.id;

-- One open job per key also while a browser check is open or waiting (review #2). Every ON CONFLICT / open-state
-- lookup below and in layer 2 uses this same list.
DROP INDEX IF EXISTS public.catalog_research_job_open_group_key;
CREATE UNIQUE INDEX catalog_research_job_open_group_key ON public.catalog_research_job (group_key)
  WHERE state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued');

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
    job_type, group_key, vehicle_catalog_id, maintenance_component_id, fit_descriptor, match_type, fleet_count, state,
    requested_name, requested_part_number
  ) VALUES (
    'part', p_group_key, p_vehicle_catalog_id, p_component_id, nullif(p_fit_descriptor, ''), nullif(p_match_type, ''), 1,
    'queued', v_name, v_pn
  )
  ON CONFLICT (group_key) WHERE state IN (
    'queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued'
  )
  DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NOT NULL THEN
    v_new_job := true;
    PERFORM public.catalog_research_enqueue_job(v_job_id);
    PERFORM public.catalog_research_log_event(v_job_id, 'enqueue', 'queued',
      jsonb_build_object('groupKey', p_group_key, 'origin', p_origin));
  ELSE
    SELECT j.id INTO v_job_id
    FROM public.catalog_research_job j
    WHERE j.group_key = p_group_key
      AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued')
    LIMIT 1;

    UPDATE public.catalog_research_job
    SET fleet_count = fleet_count + 1,
        requested_name = coalesce(nullif(requested_name, ''), v_name),
        requested_part_number = coalesce(nullif(requested_part_number, ''), v_pn),
        updated_at = now()
    WHERE id = v_job_id;
  END IF;

  RETURN jsonb_build_object('jobId', v_job_id, 'newJob', v_new_job);
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_research_enqueue_vehicle_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group_key text;
  v_job_id uuid;
BEGIN
  IF NEW.status NOT IN ('pending', 'needs_info') THEN
    RETURN NEW;
  END IF;

  -- One job per car; never the requesting organisation (RE-07). The table has proposed_year (the old body read
  -- a proposed_production_start_year column that does not exist, so every insert would have failed).
  v_group_key := concat_ws(
    ':',
    'vehicle',
    coalesce(NEW.proposed_make, ''),
    coalesce(NEW.proposed_model, ''),
    coalesce(NEW.proposed_year::text, '')
  );

  SELECT j.id INTO v_job_id
  FROM public.catalog_research_job j
  WHERE j.group_key = v_group_key
    AND j.job_type = 'vehicle'
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued')
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    UPDATE public.catalog_research_job
    SET fleet_count = fleet_count + 1, updated_at = now()
    WHERE id = v_job_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.catalog_research_job (
    job_type, group_key, fleet_count, state, market, origin, browser_check_allowed, pending_request_id
  ) VALUES (
    'vehicle', v_group_key, 1, 'queued', 'JM', 'fleet', true, NEW.id
  )
  RETURNING id INTO v_job_id;

  PERFORM public.catalog_research_enqueue_job(v_job_id);
  PERFORM public.catalog_research_log_event(v_job_id, 'enqueue', 'vehicle', '{}'::jsonb);

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Proposals: evidence links, match kind, idempotent keys (RE-13/20/22)
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_part_proposal
  ADD COLUMN IF NOT EXISTS match_kind text,
  ADD COLUMN IF NOT EXISTS position_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS evidence_read_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trust_route text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS rejected_reason text;

ALTER TABLE public.catalog_part_proposal DROP CONSTRAINT IF EXISTS catalog_part_proposal_match_kind_check;
ALTER TABLE public.catalog_part_proposal ADD CONSTRAINT catalog_part_proposal_match_kind_check
  CHECK (match_kind IS NULL OR match_kind IN ('oem', 'sister', 'engine', 'aftermarket', 'universal'));
ALTER TABLE public.catalog_part_proposal DROP CONSTRAINT IF EXISTS catalog_part_proposal_trust_route_check;
ALTER TABLE public.catalog_part_proposal ADD CONSTRAINT catalog_part_proposal_trust_route_check
  CHECK (trust_route IS NULL OR trust_route IN ('a', 'b', 'c', 'owner_browser'));
ALTER TABLE public.catalog_part_proposal DROP CONSTRAINT IF EXISTS catalog_part_proposal_status_check;
ALTER TABLE public.catalog_part_proposal ADD CONSTRAINT catalog_part_proposal_status_check
  CHECK (status IN ('open', 'promoted', 'rejected'));
UPDATE public.catalog_part_proposal SET status = 'promoted' WHERE promoted_part_id IS NOT NULL AND status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS catalog_part_proposal_job_number_position
  ON public.catalog_part_proposal (job_id, part_number_norm, position_key);

ALTER TABLE public.catalog_vehicle_proposal
  ADD COLUMN IF NOT EXISTS existing_vehicle_catalog_id uuid REFERENCES public.vehicle_catalog (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS chassis_serial_from text,
  ADD COLUMN IF NOT EXISTS chassis_serial_to text,
  ADD COLUMN IF NOT EXISTS evidence_read_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS rejected_reason text;

ALTER TABLE public.catalog_vehicle_proposal DROP CONSTRAINT IF EXISTS catalog_vehicle_proposal_action_check;
ALTER TABLE public.catalog_vehicle_proposal ADD CONSTRAINT catalog_vehicle_proposal_action_check
  CHECK (action IS NULL OR action IN ('new', 'update', 'same'));
ALTER TABLE public.catalog_vehicle_proposal DROP CONSTRAINT IF EXISTS catalog_vehicle_proposal_status_check;
ALTER TABLE public.catalog_vehicle_proposal ADD CONSTRAINT catalog_vehicle_proposal_status_check
  CHECK (status IN ('open', 'approved', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS catalog_vehicle_proposal_job_identity
  ON public.catalog_vehicle_proposal (job_id, chassis_code, engine_code, production_start_year) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS public.catalog_spec_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.catalog_research_job (id) ON DELETE CASCADE,
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE,
  spec_key text NOT NULL REFERENCES public.spec_key (key),
  value text NOT NULL CHECK (btrim(value) <> ''),
  unit text,
  value_type text,
  evidence_read_ids uuid[] NOT NULL DEFAULT '{}',
  trust_route text CHECK (trust_route IS NULL OR trust_route IN ('a', 'b', 'c', 'owner_browser')),
  route text NOT NULL DEFAULT 'review' CHECK (route IN ('auto', 'review')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'promoted', 'rejected')),
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, spec_key)
);

-- Two makers name different numbers for the same car + part type + position (RE-19).
CREATE TABLE IF NOT EXISTS public.research_number_conflict (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.catalog_research_job (id) ON DELETE CASCADE,
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE,
  platform_component_id uuid,
  position text NOT NULL DEFAULT '',
  proposal_ids uuid[] NOT NULL CHECK (cardinality(proposal_ids) >= 2),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  resolution text CHECK (resolution IS NULL OR resolution IN ('picked', 'both_wrong')),
  resolved_by uuid,
  CONSTRAINT research_number_conflict_closed_has_resolution
    CHECK ((closed_at IS NULL) = (resolution IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS research_number_conflict_one_open
  ON public.research_number_conflict (vehicle_catalog_id, platform_component_id, position)
  NULLS NOT DISTINCT WHERE closed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 8. Engine verdicts on listings and factory numbers (RE-19 / RE-20 / RE-29)
-- ---------------------------------------------------------------------------
ALTER TABLE public.part_listing
  ADD COLUMN IF NOT EXISTS evidence_read_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trust_route text;
ALTER TABLE public.part_listing DROP CONSTRAINT IF EXISTS part_listing_trust_route_check;
ALTER TABLE public.part_listing ADD CONSTRAINT part_listing_trust_route_check
  CHECK (trust_route IS NULL OR trust_route IN ('a', 'b', 'c', 'owner_browser'));
ALTER TABLE public.part_listing DROP CONSTRAINT IF EXISTS part_listing_trust_set_by_check;
ALTER TABLE public.part_listing ADD CONSTRAINT part_listing_trust_set_by_check
  CHECK (trust_set_by IS NULL OR trust_set_by IN ('auto', 'owner', 'engine'));

ALTER TABLE public.vehicle_oe_number
  ADD COLUMN IF NOT EXISTS evidence_read_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trust_route text;
ALTER TABLE public.vehicle_oe_number DROP CONSTRAINT IF EXISTS vehicle_oe_number_trust_route_check;
ALTER TABLE public.vehicle_oe_number ADD CONSTRAINT vehicle_oe_number_trust_route_check
  CHECK (trust_route IS NULL OR trust_route IN ('a', 'b', 'c', 'owner_browser'));
ALTER TABLE public.vehicle_oe_number DROP CONSTRAINT IF EXISTS vehicle_oe_number_trust_set_by_check;
ALTER TABLE public.vehicle_oe_number ADD CONSTRAINT vehicle_oe_number_trust_set_by_check
  CHECK (trust_set_by IS NULL OR trust_set_by IN ('auto', 'owner', 'engine'));

-- Trigger bodies: an engine verdict (trust_set_by = 'engine' with at least one evidence read) keeps its trust,
-- exactly like an owner verdict. Without evidence reads it falls back to the automatic rule.
CREATE OR REPLACE FUNCTION public.trg_part_listing_auto_trust()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_trust text;
  v_reason text;
  v_kept boolean;
BEGIN
  v_kept := NEW.trust_set_by = 'owner'
    OR (NEW.trust_set_by = 'engine' AND cardinality(coalesce(NEW.evidence_read_ids, '{}'::uuid[])) > 0);

  IF TG_OP = 'INSERT' THEN
    IF v_kept THEN
      NEW.trust_set_at := coalesce(NEW.trust_set_at, now());
      IF NEW.trust IS NULL OR btrim(coalesce(NEW.trust::text, '')) = '' THEN
        SELECT t.trust, t.trust_reason INTO v_trust, v_reason
        FROM public.compute_part_listing_auto_trust(NEW.evidence_url, NEW.vehicle_catalog_id, NEW.interchange_group_id) AS t;
        NEW.trust := v_trust;
        NEW.trust_reason := v_reason;
      END IF;
      RETURN NEW;
    END IF;
    SELECT t.trust, t.trust_reason INTO v_trust, v_reason
    FROM public.compute_part_listing_auto_trust(NEW.evidence_url, NEW.vehicle_catalog_id, NEW.interchange_group_id) AS t;
    NEW.trust := v_trust;
    NEW.trust_reason := v_reason;
    NEW.trust_set_by := 'auto';
    NEW.trust_set_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF v_kept THEN
      IF NEW.evidence_url IS DISTINCT FROM OLD.evidence_url
         OR NEW.vehicle_catalog_id IS DISTINCT FROM OLD.vehicle_catalog_id
         OR NEW.interchange_group_id IS DISTINCT FROM OLD.interchange_group_id
      THEN
        IF NEW.trust_set_by = 'engine' AND NEW.evidence_read_ids IS DISTINCT FROM OLD.evidence_read_ids THEN
          NEW.trust_set_at := now();
          RETURN NEW;
        END IF;
        SELECT t.trust, t.trust_reason INTO v_trust, v_reason
        FROM public.compute_part_listing_auto_trust(NEW.evidence_url, NEW.vehicle_catalog_id, NEW.interchange_group_id) AS t;
        NEW.trust := v_trust;
        NEW.trust_reason := v_reason;
        NEW.trust_set_at := now();
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.evidence_url IS DISTINCT FROM OLD.evidence_url
       OR NEW.vehicle_catalog_id IS DISTINCT FROM OLD.vehicle_catalog_id
       OR NEW.interchange_group_id IS DISTINCT FROM OLD.interchange_group_id
       OR NEW.trust_set_by IS DISTINCT FROM OLD.trust_set_by
    THEN
      SELECT t.trust, t.trust_reason INTO v_trust, v_reason
      FROM public.compute_part_listing_auto_trust(NEW.evidence_url, NEW.vehicle_catalog_id, NEW.interchange_group_id) AS t;
      NEW.trust := v_trust;
      NEW.trust_reason := v_reason;
      NEW.trust_set_by := 'auto';
      NEW.trust_set_at := now();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_vehicle_oe_number_auto_trust()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_trust text;
  v_reason text;
  v_kept boolean;
BEGIN
  v_kept := NEW.trust_set_by = 'owner'
    OR (NEW.trust_set_by = 'engine' AND cardinality(coalesce(NEW.evidence_read_ids, '{}'::uuid[])) > 0);

  IF TG_OP = 'INSERT' THEN
    IF v_kept THEN
      NEW.trust_set_at := coalesce(NEW.trust_set_at, now());
      IF NEW.trust IS NULL OR btrim(coalesce(NEW.trust::text, '')) = '' THEN
        SELECT t.trust, t.trust_reason INTO v_trust, v_reason
        FROM public.compute_vehicle_oe_auto_trust(NEW) AS t;
        NEW.trust := v_trust;
        NEW.trust_reason := v_reason;
      END IF;
      RETURN NEW;
    END IF;
    SELECT t.trust, t.trust_reason INTO v_trust, v_reason
    FROM public.compute_vehicle_oe_auto_trust(NEW) AS t;
    NEW.trust := v_trust;
    NEW.trust_reason := v_reason;
    NEW.trust_set_by := 'auto';
    NEW.trust_set_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF v_kept THEN
      IF NEW.evidence_url IS DISTINCT FROM OLD.evidence_url
         OR NEW.evidence_url_2 IS DISTINCT FROM OLD.evidence_url_2
         OR NEW.vehicle_catalog_id IS DISTINCT FROM OLD.vehicle_catalog_id
      THEN
        IF NEW.trust_set_by = 'engine' AND NEW.evidence_read_ids IS DISTINCT FROM OLD.evidence_read_ids THEN
          NEW.trust_set_at := now();
          RETURN NEW;
        END IF;
        SELECT t.trust, t.trust_reason INTO v_trust, v_reason
        FROM public.compute_vehicle_oe_auto_trust(NEW) AS t;
        NEW.trust := v_trust;
        NEW.trust_reason := v_reason;
        NEW.trust_set_at := now();
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.evidence_url IS DISTINCT FROM OLD.evidence_url
       OR NEW.evidence_url_2 IS DISTINCT FROM OLD.evidence_url_2
       OR NEW.vehicle_catalog_id IS DISTINCT FROM OLD.vehicle_catalog_id
       OR NEW.trust_set_by IS DISTINCT FROM OLD.trust_set_by
    THEN
      SELECT t.trust, t.trust_reason INTO v_trust, v_reason
      FROM public.compute_vehicle_oe_auto_trust(NEW) AS t;
      NEW.trust := v_trust;
      NEW.trust_reason := v_reason;
      NEW.trust_set_by := 'auto';
      NEW.trust_set_at := now();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Specs: trust columns (gating + CSV backfill ship in layer 1b) (RE-05)
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_spec_value
  ADD COLUMN IF NOT EXISTS trust text,
  ADD COLUMN IF NOT EXISTS trust_route text,
  ADD COLUMN IF NOT EXISTS trust_set_by text,
  ADD COLUMN IF NOT EXISTS evidence_read_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_note text;

UPDATE public.catalog_spec_value SET trust = 'confirmed' WHERE trust IS NULL;
UPDATE public.catalog_spec_value SET trust_set_by = 'owner' WHERE trust_set_by IS NULL;

ALTER TABLE public.catalog_spec_value
  ALTER COLUMN trust SET DEFAULT 'confirmed',
  ALTER COLUMN trust SET NOT NULL,
  ALTER COLUMN trust_set_by SET DEFAULT 'owner',
  ALTER COLUMN evidence_url DROP NOT NULL;

ALTER TABLE public.catalog_spec_value DROP CONSTRAINT IF EXISTS catalog_spec_value_trust_check;
ALTER TABLE public.catalog_spec_value ADD CONSTRAINT catalog_spec_value_trust_check
  CHECK (trust IN ('confirmed', 'needs_checking'));
ALTER TABLE public.catalog_spec_value DROP CONSTRAINT IF EXISTS catalog_spec_value_trust_route_check;
ALTER TABLE public.catalog_spec_value ADD CONSTRAINT catalog_spec_value_trust_route_check
  CHECK (trust_route IS NULL OR trust_route IN ('a', 'b', 'c', 'owner_browser'));
ALTER TABLE public.catalog_spec_value DROP CONSTRAINT IF EXISTS catalog_spec_value_trust_set_by_check;
ALTER TABLE public.catalog_spec_value ADD CONSTRAINT catalog_spec_value_trust_set_by_check
  CHECK (trust_set_by IS NULL OR trust_set_by IN ('auto', 'owner', 'engine', 'import'));
-- A source link is required unless the value is still Needs checking.
ALTER TABLE public.catalog_spec_value DROP CONSTRAINT IF EXISTS catalog_spec_value_evidence_needed;
ALTER TABLE public.catalog_spec_value ADD CONSTRAINT catalog_spec_value_evidence_needed
  CHECK (trust = 'needs_checking' OR btrim(coalesce(evidence_url, '')) <> '' OR cardinality(evidence_read_ids) > 0);

-- The 7 service-spec columns on vehicle_catalog that had no spec_key.
INSERT INTO public.spec_key (key, label, value_type, unit) VALUES
  ('front_brake_type', 'Front brakes', 'text', NULL),
  ('rear_brake_type', 'Rear brakes', 'text', NULL),
  ('bolt_pattern', 'Wheel bolt pattern', 'text', NULL),
  ('front_tire_size', 'Front tyre size', 'text', NULL),
  ('rear_tire_size', 'Rear tyre size', 'text', NULL),
  ('engine_oil_capacity_l', 'Engine oil capacity', 'number', 'L'),
  ('coolant_capacity_l', 'Coolant capacity', 'number', 'L')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.spec_column_key_map (
  column_name text PRIMARY KEY,
  spec_key text NOT NULL REFERENCES public.spec_key (key),
  unit text
);
-- Only service specs are mapped. Not mapped on purpose: wheel_offset_mm, brake_size_mm, wheel_size_front/rear,
-- wheelbase_mm, fuel_tank_capacity, seating_capacity, handbrake_type (dimensions / body facts, not service specs).
INSERT INTO public.spec_column_key_map (column_name, spec_key, unit) VALUES
  ('tire_size', 'tire_size', NULL),
  ('front_tire_size', 'front_tire_size', NULL),
  ('rear_tire_size', 'rear_tire_size', NULL),
  ('bolt_pattern', 'bolt_pattern', NULL),
  ('front_brake_type', 'front_brake_type', NULL),
  ('rear_brake_type', 'rear_brake_type', NULL),
  ('engine_oil_capacity_l', 'engine_oil_capacity_l', 'L'),
  ('coolant_capacity_l', 'coolant_capacity_l', 'L')
ON CONFLICT (column_name) DO NOTHING;

ALTER TABLE public.vehicle_catalog ADD COLUMN IF NOT EXISTS chassis_serial_to text;

-- ---------------------------------------------------------------------------
-- 10. Settings (RE-10 / RE-24 / RE-28) and the streak counter (RE-14)
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_research_settings
  ADD COLUMN IF NOT EXISTS daily_spend_usd numeric(10, 2) NOT NULL DEFAULT 1.35,
  ADD COLUMN IF NOT EXISTS fill_target_date date,
  ADD COLUMN IF NOT EXISTS claim_share_fleet numeric(3, 2) NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS max_open_browser_checks integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS fill_scope_cars integer NOT NULL DEFAULT 200;

ALTER TABLE public.catalog_research_settings DROP CONSTRAINT IF EXISTS catalog_research_settings_new_limits_check;
ALTER TABLE public.catalog_research_settings ADD CONSTRAINT catalog_research_settings_new_limits_check
  CHECK (daily_spend_usd >= 0 AND claim_share_fleet BETWEEN 0 AND 1
         AND max_open_browser_checks BETWEEN 0 AND 500 AND fill_scope_cars >= 0);

CREATE OR REPLACE FUNCTION public.catalog_research_streak_bump(p_would_auto boolean, p_outcome text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_streak integer;
BEGIN
  IF p_outcome NOT IN ('approved', 'rejected', 'edited') THEN
    RAISE EXCEPTION 'unknown outcome %', p_outcome USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Only proposals that would have been added automatically count (RE-14).
  IF NOT coalesce(p_would_auto, false) THEN
    SELECT shadow_approve_streak INTO v_streak FROM public.catalog_research_settings WHERE id = 1;
    RETURN v_streak;
  END IF;
  UPDATE public.catalog_research_settings
  SET shadow_approve_streak = CASE WHEN p_outcome = 'approved' THEN shadow_approve_streak + 1 ELSE 0 END,
      updated_at = now()
  WHERE id = 1
  RETURNING shadow_approve_streak INTO v_streak;
  RETURN v_streak;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Health: read-only report, separate unstick, notices (RE-17)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_research_unstick()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_stuck integer := 0;
  v_old_queued integer;
  v_id uuid;
BEGIN
  -- A run that died while researching or reading pages (review #8): back in the queue with a fresh message, because
  -- the old one may already have been archived.
  FOR v_id IN
    UPDATE public.catalog_research_job SET state = 'queued', updated_at = now()
    WHERE state IN ('researching', 'checking') AND updated_at < now() - interval '30 minutes'
    RETURNING id
  LOOP
    PERFORM public.catalog_research_enqueue_job(v_id);
    PERFORM public.catalog_research_log_event(v_id, 'unstick', 'requeued', '{}'::jsonb);
    v_stuck := v_stuck + 1;
  END LOOP;

  UPDATE public.catalog_research_job SET updated_at = now()
  WHERE state = 'queued' AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_old_queued = ROW_COUNT;

  RETURN jsonb_build_object('stuckResearchingReset', v_stuck, 'queuedOlderThan24h', v_old_queued);
END;
$$;

DROP FUNCTION IF EXISTS public.catalog_research_health();
CREATE FUNCTION public.catalog_research_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pgmq', 'public'
AS $$
DECLARE
  v_stuck integer;
  v_old_queued integer;
  v_old_review integer;
  v_depth integer := 0;
BEGIN
  SELECT count(*)::int INTO v_stuck FROM public.catalog_research_job
  WHERE state IN ('researching', 'checking') AND updated_at < now() - interval '30 minutes';

  SELECT count(*)::int INTO v_old_queued FROM public.catalog_research_job
  WHERE state = 'queued' AND created_at < now() - interval '24 hours';

  SELECT count(*)::int INTO v_old_review FROM public.catalog_research_job
  WHERE state = 'needs_review' AND updated_at < now() - interval '7 days';

  BEGIN
    EXECUTE 'SELECT count(*)::int FROM pgmq.q_catalog_research' INTO v_depth;
  EXCEPTION WHEN undefined_table THEN
    v_depth := 0;
  END;

  -- Same keys as before so today's Settings page keeps working; "Reset" now means "waiting for the 15-minute unstick".
  RETURN jsonb_build_object(
    'stuckResearchingReset', v_stuck,
    'queuedOlderThan24h', v_old_queued,
    'reviewOlderThan7d', v_old_review,
    'queueDepth', v_depth
  );
END;
$$;
REVOKE ALL ON FUNCTION public.catalog_research_health() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.catalog_research_raise_notices()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_settings public.catalog_research_settings%ROWTYPE;
  v_opened integer := 0;
  v_closed integer := 0;
  v_n integer;
BEGIN
  SELECT * INTO v_settings FROM public.catalog_research_settings WHERE id = 1;

  -- Engine paused for more than 30 minutes.
  IF v_settings.paused AND v_settings.updated_at < now() - interval '30 minutes' THEN
    INSERT INTO public.dominion_system_notice (kind, subject, detail)
    VALUES ('engine_paused', '', jsonb_build_object('reason', v_settings.paused_reason))
    ON CONFLICT (kind, subject) WHERE closed_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_opened := v_opened + v_n;
  ELSIF NOT v_settings.paused THEN
    UPDATE public.dominion_system_notice SET closed_at = now()
    WHERE kind = 'engine_paused' AND closed_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_closed := v_closed + v_n;
  END IF;

  -- One notice per blocked site; closed when the site is readable again.
  INSERT INTO public.dominion_system_notice (kind, subject, detail)
  SELECT 'site_blocked', s.domain, jsonb_build_object('blockedAt', s.blocked_at, 'note', s.automated_read_note)
  FROM public.trusted_site s
  WHERE s.blocked_at IS NOT NULL
  ON CONFLICT (kind, subject) WHERE closed_at IS NULL DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_opened := v_opened + v_n;

  UPDATE public.dominion_system_notice n SET closed_at = now()
  WHERE n.kind = 'site_blocked' AND n.closed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.trusted_site s WHERE s.domain = n.subject AND s.blocked_at IS NOT NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_closed := v_closed + v_n;

  RETURN jsonb_build_object('opened', v_opened, 'closed', v_closed);
END;
$$;

-- Nightly health becomes: unstick every 15 minutes + notices every 15 minutes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'catalog-research-health-nightly';
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('catalog-research-unstick', 'catalog-research-notices');
    PERFORM cron.schedule('catalog-research-unstick', '*/15 * * * *', 'SELECT public.catalog_research_unstick();');
    PERFORM cron.schedule('catalog-research-notices', '*/15 * * * *', 'SELECT public.catalog_research_raise_notices();');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Access: server (service role) only on every new table and function (RE-26)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trusted_site', 'research_lookup_recipe', 'research_page_read', 'dominion_system_notice',
    'dominion_audit_log', 'brand_alias', 'catalog_spec_proposal', 'research_number_conflict',
    'spec_column_key_map'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_direct', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (false) WITH CHECK (false)', t || '_no_direct', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.research_append_only_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_streak_bump(boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_unstick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_raise_notices() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_enqueue_vehicle_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_research_streak_bump(boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_research_unstick() TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_research_raise_notices() TO service_role;
