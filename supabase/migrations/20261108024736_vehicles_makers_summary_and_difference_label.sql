-- V-13: makers grid includes every maker on active vehicle_catalog (not only catalog_maker seed).
-- V-14: vehicle_version_difference_label uses array_append (array || scalar is invalid).

CREATE OR REPLACE FUNCTION public.list_catalog_makers_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(row ORDER BY row->>'make'),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'make', agg.make,
      'logo_storage_path', cm.logo_storage_path,
      'country', cm.country,
      'version_count', agg.version_count,
      'model_count', agg.model_count
    ) AS row
    FROM (
      SELECT
        btrim(make) AS make,
        count(*)::int AS version_count,
        count(DISTINCT model)::int AS model_count
      FROM public.vehicle_catalog
      WHERE coalesce(status, 'active') = 'active'
        AND btrim(coalesce(make, '')) <> ''
      GROUP BY btrim(make)
    ) agg
    LEFT JOIN public.catalog_maker cm ON lower(cm.make) = lower(agg.make)
  ) sub;
$$;

REVOKE ALL ON FUNCTION public.list_catalog_makers_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_catalog_makers_summary() TO service_role;

CREATE OR REPLACE FUNCTION public.vehicle_version_difference_label(p_row public.vehicle_catalog)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  bits text[] := ARRAY[]::text[];
  d text;
  ec text;
  disp text;
  ft text;
BEGIN
  d := lower(coalesce(p_row.drivetrain, ''));
  IF d LIKE '%4wd%' OR d LIKE '%awd%' THEN
    bits := array_append(bits, '4WD');
  ELSIF d LIKE '%2wd%' OR d LIKE '%fwd%' OR d <> '' THEN
    IF d LIKE '%2wd%' OR d LIKE '%fwd%' THEN
      bits := array_append(bits, '2WD');
    ELSIF d <> '' THEN
      bits := array_append(bits, replace(p_row.drivetrain, '_', ' '));
    END IF;
  END IF;

  ec := upper(coalesce(p_row.engine_code, ''));
  IF p_row.engine_displacement_l IS NOT NULL AND p_row.engine_displacement_l > 0 THEN
    disp := trim(to_char(round((p_row.engine_displacement_l::numeric), 1), 'FM9990.0'));
  END IF;

  ft := lower(coalesce(p_row.fuel_type, p_row.fuel_category, ''));
  IF ec LIKE '%VET%' OR ec LIKE '%TURBO%' OR lower(coalesce(p_row.engine_type, '')) LIKE '%turbo%' THEN
    IF disp IS NOT NULL THEN
      bits := array_append(bits, disp || ' turbo petrol');
    ELSE
      bits := array_append(bits, 'turbo petrol');
    END IF;
  ELSIF disp IS NOT NULL AND (ft LIKE '%petrol%' OR ft LIKE '%gas%' OR ft = '') THEN
    bits := array_append(bits, disp || ' petrol');
  ELSIF disp IS NOT NULL AND ft LIKE '%diesel%' THEN
    bits := array_append(bits, disp || ' diesel');
  ELSIF disp IS NOT NULL THEN
    bits := array_append(bits, disp);
  ELSIF ec LIKE '1KR%' THEN
    bits := array_append(bits, '1.0 petrol');
  ELSIF ec LIKE '2NR%' THEN
    bits := array_append(bits, '1.5 petrol');
  ELSIF ec <> '' THEN
    bits := array_append(bits, ec);
  ELSIF coalesce(p_row.trim_series, '') <> '' THEN
    bits := array_append(bits, p_row.trim_series);
  END IF;

  IF array_length(bits, 1) IS NULL THEN
    RETURN '';
  END IF;
  RETURN array_to_string(bits, ' · ');
END;
$fn$;

REVOKE ALL ON FUNCTION public.vehicle_version_difference_label(public.vehicle_catalog) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_version_difference_label(public.vehicle_catalog) TO service_role;
