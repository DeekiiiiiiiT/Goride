-- part_match_derived_keep: disambiguate part_fit_derived alias in listing INSERT (pfd vs row variable d)
-- Depends on 20261107140000_part_match_trg_listing_scope_backfill.sql

CREATE OR REPLACE FUNCTION public.part_match_derived_keep(
  p_derived_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d public.part_fit_derived%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.part_fit_derived WHERE id = p_derived_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Derived fit not found'; END IF;
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, derived_fit_id, verified_by
  )
  SELECT
    pfd.interchange_group_id, pfd.vehicle_catalog_id, pfd.position, pfd.side, pfd.year_from, pfd.year_to,
    von.evidence_url,
    'auto_match_kept', pfd.id, p_actor
  FROM public.part_fit_derived pfd
  LEFT JOIN public.vehicle_oe_number von ON von.id = pfd.vehicle_oe_number_id
  WHERE pfd.id = p_derived_id
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
    SET origin = EXCLUDED.origin,
        derived_fit_id = EXCLUDED.derived_fit_id
    WHERE public.part_listing.origin IS DISTINCT FROM 'manual';
  PERFORM public.part_match_recompute(d.interchange_group_id, d.vehicle_catalog_id);
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_derived_keep(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_derived_keep(uuid, uuid, text) TO service_role;
