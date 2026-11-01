-- R32: persistent blocked_at for catalogue domains that refuse fetches (e.g. partsouq 403).

ALTER TABLE public.catalog_trusted_source
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz NULL;

UPDATE public.catalog_trusted_source
SET blocked_at = now()
WHERE domain = 'partsouq.com'
  AND blocked_at IS NULL;

CREATE OR REPLACE FUNCTION public.catalog_trusted_source_fetch_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_domain text;
  v_recent jsonb;
  v_blocked_at timestamptz;
BEGIN
  FOR v_domain IN SELECT t.domain FROM public.catalog_trusted_source t ORDER BY t.domain LOOP
    SELECT t.blocked_at INTO v_blocked_at
    FROM public.catalog_trusted_source t
    WHERE t.domain = v_domain;

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'at', s.fetched_at,
          'http_status', s.http_status,
          'byte_count', s.byte_count,
          'final_url', s.final_url,
          'reason', s.reason
        )
        ORDER BY s.fetched_at DESC
      ),
      '[]'::jsonb
    )
    INTO v_recent
    FROM (
      SELECT fetched_at, http_status, byte_count, final_url, reason
      FROM public.catalog_trusted_source_fetch
      WHERE domain = v_domain
      ORDER BY fetched_at DESC
      LIMIT 10
    ) s;

    v_result := v_result || jsonb_build_object(
      v_domain,
      jsonb_build_object(
        'recentFetches', v_recent,
        'blocked', v_blocked_at IS NOT NULL,
        'blocked_at', v_blocked_at
      )
    );
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_trusted_source_fetch_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_trusted_source_fetch_health() TO service_role;
