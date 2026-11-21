-- Research engine — layer 1b (docs/research-engine-audit.md §4, RE-05 / RE-12 / RE-19). Ships together with layer 2.
--   1. CSV spec columns copied into catalog_spec_value as Needs checking (mapped columns only).
--   2. specs_for_variant returns trust; "sourced" = Confirmed; no more catalog_note rows built from columns.
--      universal_parts_for_variant (fits by size, parts_for_vehicle tier 3) already uses only sourced specs, so a
--      Needs-checking spec now feeds no part match.
--   3. (held back) variant_parts_readiness counting only Confirmed specs — see section 3.
--   4. save_self_serve_part_in_batch keeps an engine verdict: listing rows may carry trustSetBy = 'engine',
--      evidenceReadIds and trustRoute (only with evidence reads that exist).
--   5. promote_part_proposal saves through the Add-parts path (save_self_serve_part → batch, Undo works) and
--      returns the batch id. It no longer writes part_fitment, resolves requests or inserts notices: the caller
--      runs autoResolveFromBatch with the returned batch id (RE-12).

-- ---------------------------------------------------------------------------
-- 1. CSV spec backfill (RE-05)
-- ---------------------------------------------------------------------------
INSERT INTO public.catalog_spec_value (spec_key, scope, vehicle_catalog_id, value, evidence_url, trust, trust_set_by,
                                       source_note)
SELECT m.spec_key, 'variant', vc.id, btrim(v.val), NULL, 'needs_checking', 'import', 'CSV import'
FROM public.vehicle_catalog vc
CROSS JOIN LATERAL (VALUES
  ('tire_size', vc.tire_size::text),
  ('front_tire_size', vc.front_tire_size::text),
  ('rear_tire_size', vc.rear_tire_size::text),
  ('bolt_pattern', vc.bolt_pattern::text),
  ('front_brake_type', vc.front_brake_type::text),
  ('rear_brake_type', vc.rear_brake_type::text),
  ('engine_oil_capacity_l', trim_scale(vc.engine_oil_capacity_l::numeric)::text),
  ('coolant_capacity_l', trim_scale(vc.coolant_capacity_l::numeric)::text)
) AS v(col, val)
JOIN public.spec_column_key_map m ON m.column_name = v.col
WHERE nullif(btrim(v.val), '') IS NOT NULL
ON CONFLICT (spec_key, vehicle_catalog_id) WHERE scope = 'variant' DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. specs_for_variant with trust (RE-05)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.specs_for_variant(uuid, integer);
CREATE FUNCTION public.specs_for_variant(p_catalog_id uuid, p_vehicle_year integer DEFAULT NULL::integer)
RETURNS TABLE(spec_key text, label text, value text, unit text, scope text, evidence_url text, sourced boolean,
              trust text, source_note text)
LANGUAGE sql
STABLE
AS $function$
  WITH cat AS (
    SELECT * FROM public.vehicle_catalog WHERE id = p_catalog_id
  ),
  match_year AS (
    SELECT COALESCE(p_vehicle_year, cat.production_start_year) AS y FROM cat
  ),
  ranked AS (
    SELECT
      sv.spec_key,
      sk.label,
      sv.value,
      sk.unit,
      sv.scope,
      sv.evidence_url,
      sv.trust,
      sv.source_note,
      CASE sv.scope WHEN 'variant' THEN 1 WHEN 'platform' THEN 2 ELSE 3 END AS rank,
      CASE sv.trust WHEN 'confirmed' THEN 0 ELSE 1 END AS trust_rank
    FROM public.catalog_spec_value sv
    JOIN public.spec_key sk ON sk.key = sv.spec_key
    CROSS JOIN cat
    CROSS JOIN match_year
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE (
      (sv.scope = 'variant' AND sv.vehicle_catalog_id = cat.id)
      OR (sv.scope = 'platform' AND (sv.platform_id = cat.platform_id OR sv.platform_id = mine.parent_id))
      OR (sv.scope = 'engine_family' AND sv.engine_family_id = cat.engine_family_id)
    )
    AND (sv.year_from IS NULL OR match_year.y IS NULL OR match_year.y >= sv.year_from)
    AND (sv.year_to IS NULL OR match_year.y IS NULL OR match_year.y <= sv.year_to)
  ),
  won AS (
    -- A Confirmed value wins over a Needs-checking one; then the narrowest scope wins.
    SELECT DISTINCT ON (spec_key) *
    FROM ranked
    ORDER BY spec_key, trust_rank, rank
  )
  SELECT w.spec_key, w.label, w.value, w.unit, w.scope, w.evidence_url, (w.trust = 'confirmed') AS sourced,
         w.trust, w.source_note
  FROM won w;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Readiness counts only Confirmed specs (RE-05) — HELD BACK (21 Nov 2026)
-- ---------------------------------------------------------------------------
-- Rebuilding variant_parts_readiness takes longer than live's 2-minute statement limit (the nightly
-- catalog-demand-readiness job has failed on it every night since at least 16 Nov), so it cannot run in this
-- migration. The CSV specs copied in section 1 have no evidence_url, so today's rule (evidence_url set) already
-- ignores them. The patch is in docs/research-engine-audit.md §6 — run it once the rebuild is fast.

-- ---------------------------------------------------------------------------
-- 4. Add-parts save keeps an engine verdict (RE-19)
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  d text;
  decl_old constant text := $q$v_list_trust text;$q$;
  decl_new constant text := $q$v_list_trust text;
  v_list_set_by text;
  v_list_reads uuid[];
  v_list_route text;$q$;
  assign_old constant text := $q$v_list_reason := nullif(btrim(v_row->>'reason'), '');$q$;
  assign_new constant text := $q$v_list_reason := nullif(btrim(v_row->>'reason'), '');
      v_list_reads := ARRAY(
        SELECT x::uuid FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(v_row->'evidenceReadIds') = 'array' THEN v_row->'evidenceReadIds' ELSE '[]'::jsonb END
        ) AS x
      );
      -- An engine verdict needs evidence reads that really exist (research_page_read); otherwise it is the owner's.
      v_list_set_by := CASE
        WHEN v_row->>'trustSetBy' = 'engine'
             AND cardinality(v_list_reads) > 0
             AND (SELECT count(*) FROM public.research_page_read r WHERE r.id = ANY (v_list_reads)) = cardinality(v_list_reads)
        THEN 'engine' ELSE 'owner' END;
      IF v_list_set_by <> 'engine' THEN
        v_list_reads := '{}'::uuid[];
      END IF;
      v_list_route := CASE WHEN v_row->>'trustRoute' IN ('a', 'b', 'c', 'owner_browser') THEN v_row->>'trustRoute' END;$q$;
  cols_old constant text := $q$trust, trust_reason, trust_set_by, trust_set_at$q$;
  cols_new constant text := $q$trust, trust_reason, trust_set_by, trust_set_at, evidence_read_ids, trust_route$q$;
  vals_old constant text := $q$v_list_trust, v_list_reason, 'owner', now()$q$;
  vals_new constant text := $q$v_list_trust, v_list_reason, v_list_set_by, now(), v_list_reads, v_list_route$q$;
BEGIN
  d := pg_get_functiondef('public.save_self_serve_part_in_batch(jsonb,uuid,integer,boolean)'::regprocedure);
  IF (length(d) - length(replace(d, decl_old, ''))) / length(decl_old) <> 1 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch: expected the v_list_trust declaration once — not patched';
  END IF;
  IF (length(d) - length(replace(d, assign_old, ''))) / length(assign_old) <> 1 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch: expected the reason line once — not patched';
  END IF;
  IF (length(d) - length(replace(d, cols_old, ''))) / length(cols_old) <> 1 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch: expected the trust column list once — not patched';
  END IF;
  IF (length(d) - length(replace(d, vals_old, ''))) / length(vals_old) <> 1 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch: expected the owner trust values once — not patched';
  END IF;
  d := replace(d, decl_old, decl_new);
  d := replace(d, assign_old, assign_new);
  d := replace(d, cols_old, cols_new);
  d := replace(d, vals_old, vals_new);
  EXECUTE d;
END
$patch$;

-- ---------------------------------------------------------------------------
-- 5. promote_part_proposal through the Add-parts path (RE-12)
-- ---------------------------------------------------------------------------
-- Proposal fits (written by the layer-2 worker):
--   { "listings": [ { "vehicleId", "position", "side", "yearFrom", "yearTo" } ], "factoryNumbers": [ { "brand", "number" } ] }
-- Older proposals without fits.listings fall back to the job's car and (front/rear) fit descriptor.
CREATE OR REPLACE FUNCTION public.promote_part_proposal(p_proposal_id uuid, p_actor uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prop public.catalog_part_proposal%ROWTYPE;
  v_job public.catalog_research_job%ROWTYPE;
  v_job_state text;
  v_engine boolean;
  v_evidence text;
  v_listings jsonb;
  v_input jsonb;
  v_saved jsonb;
  v_part_id uuid;
BEGIN
  SELECT * INTO v_prop FROM public.catalog_part_proposal WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  SELECT * INTO v_job FROM public.catalog_research_job WHERE id = v_prop.job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found'; END IF;

  IF v_prop.status = 'promoted' OR v_prop.promoted_part_id IS NOT NULL THEN
    RETURN jsonb_build_object('partId', v_prop.promoted_part_id, 'idempotent', true);
  END IF;
  IF v_prop.status = 'rejected' THEN
    RAISE EXCEPTION 'proposal_rejected';
  END IF;
  IF v_job.maintenance_component_id IS NULL THEN
    RAISE EXCEPTION 'job_has_no_part_type';
  END IF;

  v_job_state := CASE WHEN p_actor IS NULL THEN 'auto_added' ELSE 'added' END;
  v_engine := v_prop.trust_route IS NOT NULL AND cardinality(v_prop.evidence_read_ids) > 0;

  -- Source link: the first saved page read, else the first source the proposal names.
  SELECT coalesce(r.final_url, r.url) INTO v_evidence
  FROM public.research_page_read r
  WHERE r.id = v_prop.evidence_read_ids[1];
  v_evidence := coalesce(nullif(btrim(v_evidence), ''), nullif(btrim(v_prop.sources->0->>'url'), ''));
  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'proposal_has_no_source';
  END IF;

  IF jsonb_typeof(v_prop.fits->'listings') = 'array' AND jsonb_array_length(v_prop.fits->'listings') > 0 THEN
    v_listings := v_prop.fits->'listings';
  ELSIF v_job.vehicle_catalog_id IS NOT NULL THEN
    v_listings := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'vehicleId', v_job.vehicle_catalog_id,
      'position', CASE WHEN lower(v_job.fit_descriptor) IN ('front', 'rear') THEN lower(v_job.fit_descriptor) END
    )));
  ELSE
    RAISE EXCEPTION 'proposal_has_no_car';
  END IF;

  -- Engine verdict on every listing row (the save keeps it only with real evidence reads).
  IF v_engine THEN
    SELECT jsonb_agg(l || jsonb_build_object(
      'trust', 'confirmed',
      'trustSetBy', 'engine',
      'trustRoute', v_prop.trust_route,
      'evidenceReadIds', to_jsonb(v_prop.evidence_read_ids)
    ))
    INTO v_listings
    FROM jsonb_array_elements(v_listings) AS l;
  END IF;

  v_input := jsonb_strip_nulls(jsonb_build_object(
    'actorId', p_actor,
    'partTypeId', v_job.maintenance_component_id,
    'brand', v_prop.brand,
    'partNumber', v_prop.part_number,
    'name', v_prop.part_name,
    'partKind', CASE WHEN v_prop.match_kind = 'oem' THEN 'oem' ELSE 'aftermarket' END,
    'sourceType', CASE WHEN v_prop.trust_route IN ('a', 'owner_browser') THEN 'car_maker_catalogue'
                      WHEN v_prop.trust_route IN ('b', 'c') THEN 'part_maker_catalogue'
                      ELSE 'other' END,
    'fitMode', 'specific',
    'evidenceUrl', v_evidence,
    'listings', v_listings,
    'factoryNumbers', CASE WHEN jsonb_typeof(v_prop.fits->'factoryNumbers') = 'array' THEN v_prop.fits->'factoryNumbers' END
  ));

  v_saved := public.save_self_serve_part(v_input);
  v_part_id := nullif(coalesce(v_saved->>'partId', v_saved->>'part_id'), '')::uuid;

  UPDATE public.catalog_part_proposal
  SET status = 'promoted', promoted_part_id = v_part_id
  WHERE id = p_proposal_id;

  UPDATE public.catalog_research_job SET state = v_job_state, updated_at = now() WHERE id = v_job.id;
  PERFORM public.catalog_research_log_event(
    v_job.id, 'promote', v_job_state,
    jsonb_build_object('proposalId', p_proposal_id, 'partId', v_part_id, 'batchId', v_saved->>'batchId'),
    p_actor
  );

  RETURN jsonb_build_object(
    'partId', v_part_id,
    'batchId', v_saved->>'batchId',
    'batchCode', v_saved->>'batchCode',
    'idempotent', false,
    'jobState', v_job_state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_part_proposal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_part_proposal(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.specs_for_variant(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.specs_for_variant(uuid, integer) TO service_role;
