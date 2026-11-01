-- R25: trusted catalogue fetch telemetry for research verification + S10h health.

ALTER TABLE public.catalog_trusted_source
  ADD COLUMN IF NOT EXISTS pages_confirmed integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.catalog_trusted_source_fetch (
  id bigserial PRIMARY KEY,
  domain text NOT NULL REFERENCES public.catalog_trusted_source (domain) ON DELETE CASCADE,
  job_id uuid REFERENCES public.catalog_research_job (id) ON DELETE SET NULL,
  requested_url text NOT NULL,
  final_url text NOT NULL,
  http_status integer NOT NULL DEFAULT 0,
  byte_count integer NOT NULL DEFAULT 0,
  reason text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_trusted_source_fetch_domain_at
  ON public.catalog_trusted_source_fetch (domain, fetched_at DESC);

ALTER TABLE public.catalog_trusted_source_fetch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_trusted_source_fetch_no_direct ON public.catalog_trusted_source_fetch;
CREATE POLICY catalog_trusted_source_fetch_no_direct ON public.catalog_trusted_source_fetch
  FOR ALL USING (false) WITH CHECK (false);

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
  v_blocked boolean;
  v_last5_count integer;
BEGIN
  FOR v_domain IN SELECT t.domain FROM public.catalog_trusted_source t ORDER BY t.domain LOOP
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

    SELECT count(*)::int,
      bool_and(s.http_status IN (403, 429, 503) OR s.byte_count = 0)
    INTO v_last5_count, v_blocked
    FROM (
      SELECT http_status, byte_count
      FROM public.catalog_trusted_source_fetch
      WHERE domain = v_domain
      ORDER BY fetched_at DESC
      LIMIT 5
    ) s;

    IF v_last5_count < 5 THEN
      v_blocked := false;
    ELSE
      v_blocked := coalesce(v_blocked, false);
    END IF;

    v_result := v_result || jsonb_build_object(
      v_domain,
      jsonb_build_object('recentFetches', v_recent, 'blocked', v_blocked)
    );
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_trusted_source_fetch_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_trusted_source_fetch_health() TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_trusted_source_fetch_trim(p_domain text, p_keep integer DEFAULT 50)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.catalog_trusted_source_fetch f
  WHERE f.domain = p_domain
    AND f.id NOT IN (
      SELECT id FROM public.catalog_trusted_source_fetch
      WHERE domain = p_domain
      ORDER BY fetched_at DESC
      LIMIT p_keep
    );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_trusted_source_fetch_trim(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_trusted_source_fetch_trim(text, integer) TO service_role;
