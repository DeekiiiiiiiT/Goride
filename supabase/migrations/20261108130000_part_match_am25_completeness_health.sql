-- AM-25: catalog completeness spec-sheet saturation + health norm mode + last error in 24h.

CREATE OR REPLACE FUNCTION public.part_norm_position_mode()
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 'strict';
$$;

REVOKE ALL ON FUNCTION public.part_norm_position_mode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_norm_position_mode() TO service_role;

CREATE OR REPLACE FUNCTION public.part_match_catalog_completeness()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'vehicleCount', (SELECT count(*)::integer FROM public.vehicle_catalog),
    'vehiclesWithOeNumbers', (
      SELECT count(DISTINCT von.vehicle_catalog_id)::integer FROM public.vehicle_oe_number von
    ),
    'platformLinkCount', (SELECT count(*)::integer FROM public.platform_component_link),
    'groups', (SELECT count(*)::integer FROM public.part_interchange_group),
    'parts', (SELECT count(*)::integer FROM public.part_master),
    'partsWithSpecAttributes', (
      SELECT count(DISTINCT pm.id)::integer
      FROM public.part_master pm
      WHERE EXISTS (SELECT 1 FROM public.part_index_number pin WHERE pin.part_id = pm.id)
         OR EXISTS (SELECT 1 FROM public.part_approval pa WHERE pa.part_id = pm.id)
    ),
    'listings', (SELECT count(*)::integer FROM public.part_listing),
    'derived', (SELECT count(*)::integer FROM public.part_fit_derived),
    'openConflicts', (SELECT count(*)::integer FROM public.part_match_conflict WHERE status = 'open'),
    'unresolvedPositionReports', (
      SELECT count(*)::integer FROM public.part_norm_position_backfill_report WHERE resolved_at IS NULL
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.part_match_health(p_vehicle_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'engineVersion', public.part_match_engine_version(),
    'normVersion', public.part_norm_position_version(),
    'normMode', public.part_norm_position_mode(),
    'enabled', public.parts_auto_match_enabled(),
    'derived', jsonb_build_object(
      'live', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'live' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id)),
      'needsChecking', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'needs_checking' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id)),
      'suppressed', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'suppressed' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id))
    ),
    'tierBreakdown', (
      SELECT coalesce(jsonb_object_agg(t.tier::text, t.cnt), '{}'::jsonb)
      FROM (
        SELECT pf.tier, count(*) AS cnt
        FROM public.vehicle_catalog vc
        CROSS JOIN LATERAL public.parts_for_vehicle(vc.id, NULL, vc.production_start_year) pf
        WHERE p_vehicle_id IS NULL OR vc.id = p_vehicle_id
        GROUP BY pf.tier
      ) t
    ),
    'openConflicts', (
      SELECT coalesce(jsonb_object_agg(conflict_type, cnt), '{}'::jsonb)
      FROM (
        SELECT c.conflict_type, count(*) AS cnt
        FROM public.part_match_conflict c
        WHERE c.status = 'open'
          AND (p_vehicle_id IS NULL OR c.vehicle_catalog_id = p_vehicle_id)
        GROUP BY c.conflict_type
      ) x
    ),
    'lastRun', (
      SELECT to_jsonb(l) FROM (
        SELECT run_id, kind, started_at, finished_at, error, duration_ms, rows_scanned
        FROM public.part_match_recompute_log
        ORDER BY started_at DESC
        LIMIT 1
      ) l
    ),
    'errorCount24h', (
      SELECT count(*) FROM public.part_match_recompute_log l
      WHERE l.error IS NOT NULL AND l.started_at > now() - interval '24 hours'
    ),
    'lastError24h', (
      SELECT to_jsonb(e) FROM (
        SELECT run_id, kind, started_at, finished_at, error
        FROM public.part_match_recompute_log l
        WHERE l.error IS NOT NULL AND l.started_at > now() - interval '24 hours'
        ORDER BY l.started_at DESC
        LIMIT 1
      ) e
    ),
    'unresolvedPositionReports', (
      SELECT count(*) FROM public.part_norm_position_backfill_report r WHERE r.resolved_at IS NULL
    )
  );
$$;
