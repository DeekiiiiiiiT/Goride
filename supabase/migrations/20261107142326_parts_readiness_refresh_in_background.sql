-- Car spec saves (and other catalog saves) timed out: each one rebuilt
-- variant_parts_readiness for every car inline. With 1,833 cars the rebuild
-- takes 25s+ and the API limit is 30s ("canceling statement due to statement timeout").
-- Now a save only marks the summary as out of date; a cron job rebuilds it
-- within 10 minutes, and only when something changed. The nightly job still
-- rebuilds it straight away.

CREATE TABLE IF NOT EXISTS private.variant_parts_readiness_dirty (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  marked_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.variant_parts_readiness_dirty FROM PUBLIC, anon, authenticated;

-- The real rebuild (was the body of refresh_variant_parts_readiness).
CREATE OR REPLACE FUNCTION public.refresh_variant_parts_readiness_now()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Not concurrent: a concurrent refresh cannot run inside this function.
  REFRESH MATERIALIZED VIEW public.variant_parts_readiness;
END;
$fn$;

-- Same name the 9 save functions already call: now it only marks "out of date".
CREATE OR REPLACE FUNCTION public.refresh_variant_parts_readiness()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO private.variant_parts_readiness_dirty (id, marked_at)
  VALUES (true, now())
  ON CONFLICT (id) DO UPDATE SET marked_at = excluded.marked_at;
END;
$fn$;

-- Cron: rebuild only when marked. A save made during the rebuild keeps its mark.
CREATE OR REPLACE FUNCTION public.refresh_variant_parts_readiness_if_dirty()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_marked timestamptz;
BEGIN
  SELECT d.marked_at INTO v_marked FROM private.variant_parts_readiness_dirty d WHERE d.id;
  IF v_marked IS NULL THEN
    RETURN false;
  END IF;
  PERFORM public.refresh_variant_parts_readiness_now();
  DELETE FROM private.variant_parts_readiness_dirty d WHERE d.id AND d.marked_at <= v_marked;
  RETURN true;
END;
$fn$;

-- Nightly job keeps rebuilding straight away.
CREATE OR REPLACE FUNCTION public.refresh_catalog_demand_and_readiness()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.refresh_catalog_variant_demand();
  PERFORM public.refresh_variant_parts_readiness_now();
  DELETE FROM private.variant_parts_readiness_dirty;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.refresh_variant_parts_readiness_now() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_variant_parts_readiness_if_dirty() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_variant_parts_readiness_now() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_variant_parts_readiness_if_dirty() TO service_role;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron missing; skipped parts-readiness-catch-up';
    RETURN;
  END IF;
  BEGIN
    PERFORM cron.unschedule('parts-readiness-catch-up');
  EXCEPTION WHEN others THEN
    NULL;
  END;
  PERFORM cron.schedule(
    'parts-readiness-catch-up', '*/10 * * * *',
    $cmd$SELECT public.refresh_variant_parts_readiness_if_dirty();$cmd$
  );
END;
$do$;
