-- C3d fix: persist stale flag on vehicle_picture; SQL counts and bulk stale update

ALTER TABLE public.vehicle_picture
  ADD COLUMN IF NOT EXISTS stale boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS vehicle_picture_stale_idx
  ON public.vehicle_picture (stale)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.vehicle_picture_admin_counts()
RETURNS TABLE(
  ready bigint,
  being_made bigint,
  failed bigint,
  stale bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    count(*) FILTER (WHERE status = 'ready')::bigint AS ready,
    count(*) FILTER (WHERE status IN ('queued', 'generating'))::bigint AS being_made,
    count(*) FILTER (WHERE status = 'failed')::bigint AS failed,
    count(*) FILTER (WHERE stale)::bigint AS stale
  FROM public.vehicle_picture
  WHERE deleted_at IS NULL;
$$;

ALTER FUNCTION public.vehicle_picture_admin_counts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_admin_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_admin_counts() TO service_role;

CREATE OR REPLACE FUNCTION public.vehicle_picture_set_stale(p_stale_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.vehicle_picture
  SET stale = (id = ANY (p_stale_ids))
  WHERE deleted_at IS NULL
    AND stale IS DISTINCT FROM (id = ANY (p_stale_ids));
$$;

ALTER FUNCTION public.vehicle_picture_set_stale(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_set_stale(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_set_stale(uuid[]) TO service_role;