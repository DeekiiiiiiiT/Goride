-- C3c fix: single-query cleanup delete candidates (replaces N+1 listVersions loop)

CREATE OR REPLACE FUNCTION public.vehicle_picture_cleanup_candidates(
  p_retention_days int,
  p_limit int
)
RETURNS TABLE(picture_id uuid, version int, r2_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH retention_cutoff AS (
    SELECT now() - make_interval(days => p_retention_days) AS cutoff
  ),
  removed_candidates AS (
    SELECT
      vv.picture_id,
      vv.version,
      vv.r2_key,
      vp.deleted_at AS sort_at
    FROM public.vehicle_picture_version vv
    INNER JOIN public.vehicle_picture vp ON vp.id = vv.picture_id
    CROSS JOIN retention_cutoff c
    WHERE vp.deleted_at IS NOT NULL
      AND vp.deleted_at < c.cutoff
      AND vv.file_deleted_at IS NULL
  ),
  live_retired AS (
    SELECT
      vv.picture_id,
      vv.version,
      vv.r2_key,
      vv.retired_at,
      vp.version AS current_version,
      row_number() OVER (PARTITION BY vv.picture_id ORDER BY vv.version DESC) AS rn
    FROM public.vehicle_picture_version vv
    INNER JOIN public.vehicle_picture vp ON vp.id = vv.picture_id
    WHERE vp.deleted_at IS NULL
      AND vv.retired_at IS NOT NULL
      AND vv.file_deleted_at IS NULL
  ),
  live_candidates AS (
    SELECT
      lr.picture_id,
      lr.version,
      lr.r2_key,
      lr.retired_at AS sort_at
    FROM live_retired lr
    CROSS JOIN retention_cutoff c
    WHERE lr.retired_at < c.cutoff
      AND lr.version <> lr.current_version
      AND lr.rn > 1
  ),
  combined AS (
    SELECT picture_id, version, r2_key, sort_at FROM removed_candidates
    UNION ALL
    SELECT picture_id, version, r2_key, sort_at FROM live_candidates
  )
  SELECT c.picture_id, c.version, c.r2_key
  FROM combined c
  ORDER BY c.sort_at ASC
  LIMIT p_limit;
$$;

ALTER FUNCTION public.vehicle_picture_cleanup_candidates(int, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_cleanup_candidates(int, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_cleanup_candidates(int, int) TO service_role;