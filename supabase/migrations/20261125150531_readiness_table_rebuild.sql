-- Parts readiness: stop the nightly timeout and stop locking readers (research audit §3 item 6, 25 Nov 2026).
--
-- Why: `catalog-demand-readiness` (03:30) has failed every night since at least 16 Nov. REFRESH MATERIALIZED VIEW
-- public.variant_parts_readiness runs parts_for_vehicle for every variant × 10 core parts (~18k calls, ~2.5 min) and
-- the database's statement limit is 2 min. A non-concurrent refresh also locks out every reader (Fleet find parts,
-- Dominion coverage) while it runs.
--
-- Fix:
--   1. The same rows, computed by private.variant_parts_readiness_rows(); only Confirmed specs count (RE-05: was
--      "evidence_url set"; on 25 Nov both rules give the same answer — 0 rows differ).
--   2. variant_parts_readiness becomes a plain table (same name and columns, service_role only, RLS on, no policies).
--   3. refresh_variant_parts_readiness_now() computes into a temp table, then deletes / upserts only rows that changed:
--      readers keep reading the old rows meanwhile (no lock) and unchanged rows aren't rewritten (low disk IO).
--   4. Both cron jobs get a 10-minute limit for their own session.
-- Readers, callers and the dirty flag are unchanged.

SET statement_timeout = '10min';

-- 1. The rows (the live view's query; spec_hit counts Confirmed specs only).
CREATE OR REPLACE FUNCTION private.variant_parts_readiness_rows()
RETURNS TABLE (variant_id uuid, components_ready integer, ready boolean, cells jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH core AS (
    SELECT v.op_code
    FROM (VALUES ('ENG-OIL'::text), ('ENG-SPARK'::text), ('ENG-THERM'::text), ('FILT-AIR'::text), ('HVAC-CABIN'::text),
                 ('BRK-PADS'::text), ('BELT-SERP'::text), ('LGT-WIPER'::text), ('BRK-ROTOR'::text), ('SUS-SHOCK'::text)) v(op_code)
  ), comp AS (
    SELECT c.id, c.op_code
    FROM maintenance_service_categories c
    JOIN core ON core.op_code = c.op_code
  ), na AS (
    SELECT DISTINCT ON (vc.id, comp.op_code) vc.id AS variant_id, comp.op_code, a.applicable
    FROM vehicle_catalog vc
    CROSS JOIN comp
    JOIN catalog_component_applicability a ON a.component_id = comp.id
    LEFT JOIN vehicle_platform mine ON mine.id = vc.platform_id
    WHERE (a.scope = 'variant'::text AND a.vehicle_catalog_id = vc.id)
       OR (a.scope = 'platform'::text AND (a.platform_id = vc.platform_id OR a.platform_id = mine.parent_id))
       OR (a.scope = 'engine_family'::text AND a.engine_family_id = vc.engine_family_id)
    ORDER BY vc.id, comp.op_code, CASE a.scope WHEN 'variant'::text THEN 1 WHEN 'platform'::text THEN 2 ELSE 3 END
  ), spec_hit AS (
    SELECT DISTINCT vc.id AS variant_id, c.op_code
    FROM vehicle_catalog vc
    JOIN catalog_spec_value sv ON true
    JOIN spec_key sk ON sk.key = sv.spec_key
    JOIN maintenance_service_categories c ON c.id = sk.component_id
    JOIN core ON core.op_code = c.op_code
    LEFT JOIN vehicle_platform mine ON mine.id = vc.platform_id
    WHERE sv.trust = 'confirmed'::text
      AND COALESCE(btrim(sv.value), ''::text) <> ''::text
      AND ((sv.scope = 'variant'::text AND sv.vehicle_catalog_id = vc.id)
        OR (sv.scope = 'platform'::text AND (sv.platform_id = vc.platform_id OR sv.platform_id = mine.parent_id))
        OR (sv.scope = 'engine_family'::text AND sv.engine_family_id = vc.engine_family_id))
  ), hits AS (
    SELECT vc.id AS variant_id,
           comp.op_code,
           (bool_or(p.tier >= 1 AND p.tier <= 3 AND (pm.catalog_decision = 'confirmed'::text OR EXISTS (
              SELECT 1 FROM part_listing pl
              WHERE pl.vehicle_catalog_id = vc.id AND pl.interchange_group_id = pm.interchange_group_id AND pl.trust = 'confirmed'::text)))
            OR bool_or(sh.op_code IS NOT NULL)) AS verified,
           bool_or(p.part_id IS NOT NULL AND pm.catalog_decision IS DISTINCT FROM 'rejected'::text AND p.tier >= 1 AND p.tier <= 3) AS any_part,
           bool_or(na.applicable = false) AS not_applicable
    FROM vehicle_catalog vc
    CROSS JOIN comp
    LEFT JOIN LATERAL parts_for_vehicle(vc.id, comp.id, NULL::integer) p(tier, part_id, part_name, oem_part_number, manufacturer,
      part_kind, fit_scope, rule_source, "position", interchange_group_id, maintenance_component_id, category_id, sister_names,
      source_make, reference_oem, reference_manufacturer, also_known_as, confirmed_installs, description, evidence_url,
      match_reason_code, match_reason_params, match_status, fit_source, via, part_badge_code, part_badge_params, derived_id,
      side, wva, checking_note, catalogue_number) ON true
    LEFT JOIN part_master pm ON pm.id = p.part_id
    LEFT JOIN na ON na.variant_id = vc.id AND na.op_code = comp.op_code
    LEFT JOIN spec_hit sh ON sh.variant_id = vc.id AND sh.op_code = comp.op_code
    GROUP BY vc.id, comp.op_code
  ), rolled AS (
    SELECT hits.variant_id,
           (count(*) FILTER (WHERE hits.verified OR hits.not_applicable))::integer AS components_ready,
           jsonb_object_agg(hits.op_code, CASE
             WHEN hits.verified THEN 'verified'::text
             WHEN hits.not_applicable THEN 'not_applicable'::text
             WHEN hits.any_part THEN 'unverified'::text
             ELSE 'missing'::text
           END) AS cells
    FROM hits
    GROUP BY hits.variant_id
  )
  SELECT variant_id, components_ready, components_ready = (SELECT count(*) FROM core) AS ready, cells
  FROM rolled;
$fn$;

REVOKE ALL ON FUNCTION private.variant_parts_readiness_rows() FROM PUBLIC, anon, authenticated;

-- 2. The table, filled once, then swapped in for the materialized view.
CREATE TABLE public.variant_parts_readiness_next (
  variant_id uuid PRIMARY KEY,
  components_ready integer,
  ready boolean,
  cells jsonb
);
INSERT INTO public.variant_parts_readiness_next (variant_id, components_ready, ready, cells)
SELECT r.variant_id, r.components_ready, r.ready, r.cells FROM private.variant_parts_readiness_rows() r;

DROP MATERIALIZED VIEW public.variant_parts_readiness;
ALTER TABLE public.variant_parts_readiness_next RENAME TO variant_parts_readiness;
ALTER INDEX public.variant_parts_readiness_next_pkey RENAME TO variant_parts_readiness_pkey;
ALTER TABLE public.variant_parts_readiness ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.variant_parts_readiness FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.variant_parts_readiness TO service_role;
COMMENT ON TABLE public.variant_parts_readiness IS
  'Parts readiness per variant (10 core parts). Rebuilt by refresh_variant_parts_readiness_now() from private.variant_parts_readiness_rows(): only changed rows are written; readers are never locked out.';

-- 3. The rebuild: compute first (no locks on the table), then write only what changed.
CREATE OR REPLACE FUNCTION public.refresh_variant_parts_readiness_now()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _vpr_rows (variant_id uuid PRIMARY KEY, components_ready integer, ready boolean, cells jsonb)
    ON COMMIT DROP;
  TRUNCATE _vpr_rows;
  INSERT INTO _vpr_rows SELECT r.variant_id, r.components_ready, r.ready, r.cells FROM private.variant_parts_readiness_rows() r;

  DELETE FROM public.variant_parts_readiness t
  WHERE NOT EXISTS (SELECT 1 FROM _vpr_rows n WHERE n.variant_id = t.variant_id);

  INSERT INTO public.variant_parts_readiness AS t (variant_id, components_ready, ready, cells)
  SELECT n.variant_id, n.components_ready, n.ready, n.cells FROM _vpr_rows n
  ON CONFLICT (variant_id) DO UPDATE
    SET components_ready = excluded.components_ready, ready = excluded.ready, cells = excluded.cells
    WHERE (t.components_ready, t.ready, t.cells) IS DISTINCT FROM (excluded.components_ready, excluded.ready, excluded.cells);
END;
$fn$;

-- 4. Both jobs get 10 minutes for their own session (the database default stays 2 minutes).
SELECT cron.schedule('catalog-demand-readiness', '30 3 * * *',
  $cmd$SET statement_timeout = '10min'; SELECT public.refresh_catalog_demand_and_readiness();$cmd$);
SELECT cron.schedule('parts-readiness-catch-up', '*/10 * * * *',
  $cmd$SET statement_timeout = '10min'; SELECT public.refresh_variant_parts_readiness_if_dirty();$cmd$);

RESET statement_timeout;
