-- AS4-05: LIMIT 200 must apply to the vehicle list before jsonb_agg, not to the outer query row.

CREATE OR REPLACE FUNCTION public.self_serve_engine_family_detail(p_engine_family_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', ef.id,
    'code', ef.code,
    'notes', ef.notes,
    'variantCount', (
      SELECT count(*)::int FROM public.vehicle_catalog vc WHERE vc.engine_family_id = ef.id
    ),
    'makeCounts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('make', sub.make, 'count', sub.cnt) ORDER BY sub.make)
      FROM (
        SELECT vc.make, count(*)::int AS cnt
        FROM public.vehicle_catalog vc
        WHERE vc.engine_family_id = ef.id
        GROUP BY vc.make
      ) sub
    ), '[]'::jsonb),
    'vehicles', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sub.id,
          'make', sub.make,
          'model', sub.model,
          'chassisCode', sub.chassis_code,
          'year', sub.production_start_year,
          'engineCode', sub.engine_code,
          'fuelType', sub.fuel_type,
          'displacementCc', sub.engine_displacement_cc
        ) ORDER BY sub.make, sub.model, sub.production_start_year
      )
      FROM (
        SELECT vc.id, vc.make, vc.model, vc.chassis_code, vc.production_start_year,
          vc.engine_code, vc.fuel_type, vc.engine_displacement_cc
        FROM public.vehicle_catalog vc
        WHERE vc.engine_family_id = ef.id
        ORDER BY vc.make, vc.model, vc.production_start_year
        LIMIT 200
      ) sub
    ), '[]'::jsonb)
  )
  FROM public.engine_family ef
  WHERE ef.id = p_engine_family_id;
$$;

REVOKE ALL ON FUNCTION public.self_serve_engine_family_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_engine_family_detail(uuid) TO service_role;
