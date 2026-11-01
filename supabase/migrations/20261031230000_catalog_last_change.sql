-- Full database index line: when the catalog last changed.

CREATE OR REPLACE FUNCTION public.admin_parts_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'vehicles', (SELECT count(*) FROM public.vehicle_catalog),
    'partsOnFile', (SELECT count(*) FROM public.part_master WHERE catalog_decision IS DISTINCT FROM 'rejected'),
    'fitmentsOnFile', (SELECT count(*) FROM public.part_listing),
    'vehiclesWithParts', (
      SELECT count(DISTINCT vehicle_catalog_id) FROM public.part_listing
    ),
    'waiting', (
      (SELECT count(*) FROM public.part_master WHERE catalog_decision = 'pending')
      + (SELECT count(*) FROM public.vehicle_catalog_pending_requests WHERE status IN ('pending', 'needs_info'))
    ),
    'lastCatalogChangeAt', (
      SELECT max(ts) FROM (
        SELECT max(updated_at) AS ts FROM public.part_master
        UNION ALL
        SELECT max(verified_at) FROM public.part_listing
      ) times
    )
  );
$$;
