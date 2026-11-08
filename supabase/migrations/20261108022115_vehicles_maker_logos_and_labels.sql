-- D1 maker logos, D2 version difference label, V6 bulk spec save, V8 revision list for Vehicles stitch port.

CREATE TABLE IF NOT EXISTS public.catalog_maker (
  make text PRIMARY KEY,
  logo_storage_path text,
  country text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.catalog_maker FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_maker TO service_role;

INSERT INTO public.catalog_maker (make)
SELECT DISTINCT btrim(vc.make)
FROM public.vehicle_catalog vc
WHERE btrim(coalesce(vc.make, '')) <> ''
ON CONFLICT (make) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-maker-logos',
  'catalog-maker-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

DROP POLICY IF EXISTS catalog_maker_logos_service ON storage.objects;
CREATE POLICY catalog_maker_logos_service ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'catalog-maker-logos')
  WITH CHECK (bucket_id = 'catalog-maker-logos');

DROP POLICY IF EXISTS catalog_maker_logos_public_read ON storage.objects;
CREATE POLICY catalog_maker_logos_public_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'catalog-maker-logos');

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
      'make', cm.make,
      'logo_storage_path', cm.logo_storage_path,
      'country', cm.country,
      'version_count', coalesce(vc.version_count, 0),
      'model_count', coalesce(vc.model_count, 0)
    ) AS row
    FROM public.catalog_maker cm
    LEFT JOIN (
      SELECT
        make,
        count(*)::int AS version_count,
        count(DISTINCT model)::int AS model_count
      FROM public.vehicle_catalog
      WHERE coalesce(status, 'active') = 'active'
      GROUP BY make
    ) vc ON lower(vc.make) = lower(cm.make)
  ) sub;
$$;

REVOKE ALL ON FUNCTION public.list_catalog_makers_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_catalog_makers_summary() TO service_role;

-- Keep in sync with packages/vehicle-catalog-core/src/versionDifferenceLabel.ts
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
    bits := bits || '4WD';
  ELSIF d LIKE '%2wd%' OR d LIKE '%fwd%' OR d <> '' THEN
    IF d LIKE '%2wd%' OR d LIKE '%fwd%' THEN
      bits := bits || '2WD';
    ELSIF d <> '' THEN
      bits := bits || replace(p_row.drivetrain, '_', ' ');
    END IF;
  END IF;

  ec := upper(coalesce(p_row.engine_code, ''));
  IF p_row.engine_displacement_l IS NOT NULL AND p_row.engine_displacement_l > 0 THEN
    disp := trim(to_char(p_row.engine_displacement_l, 'FM9990.0'));
    IF right(disp, 2) = '.0' THEN
      disp := left(disp, length(disp) - 2);
    END IF;
  END IF;

  ft := lower(coalesce(p_row.fuel_type, p_row.fuel_category, ''));
  IF ec LIKE '%VET%' OR ec LIKE '%TURBO%' OR lower(coalesce(p_row.engine_type, '')) LIKE '%turbo%' THEN
    IF disp IS NOT NULL THEN
      bits := bits || (disp || ' turbo petrol');
    ELSE
      bits := bits || 'turbo petrol';
    END IF;
  ELSIF disp IS NOT NULL AND (ft LIKE '%petrol%' OR ft LIKE '%gas%' OR ft = '') THEN
    bits := bits || (disp || ' petrol');
  ELSIF disp IS NOT NULL AND ft LIKE '%diesel%' THEN
    bits := bits || (disp || ' diesel');
  ELSIF disp IS NOT NULL THEN
    bits := bits || disp;
  ELSIF ec LIKE '1KR%' THEN
    bits := bits || '1.0 petrol';
  ELSIF ec LIKE '2NR%' THEN
    bits := bits || '1.5 petrol';
  ELSIF ec <> '' THEN
    bits := bits || ec;
  ELSIF coalesce(p_row.trim_series, '') <> '' THEN
    bits := bits || p_row.trim_series;
  END IF;

  IF array_length(bits, 1) IS NULL THEN
    RETURN '';
  END IF;
  RETURN array_to_string(bits, ' · ');
END;
$fn$;

REVOKE ALL ON FUNCTION public.vehicle_version_difference_label(public.vehicle_catalog) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_version_difference_label(public.vehicle_catalog) TO service_role;

CREATE OR REPLACE FUNCTION public.save_catalog_specs_bulk(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $bulk$
DECLARE
  v_key text := NULLIF(btrim(coalesce(p_input->>'specKey', '')), '');
  v_value text := NULLIF(btrim(coalesce(p_input->>'value', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_verified_by uuid := NULLIF(p_input->>'verifiedBy', '')::uuid;
  v_vid uuid;
  v_saved int := 0;
BEGIN
  IF v_key IS NULL OR v_value IS NULL THEN
    RAISE EXCEPTION 'Enter the spec and its value';
  END IF;
  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'A verified spec needs a source link';
  END IF;
  IF p_input->'vehicleIds' IS NULL OR jsonb_array_length(p_input->'vehicleIds') = 0 THEN
    RAISE EXCEPTION 'Pick at least one car';
  END IF;

  FOR v_vid IN
    SELECT (jsonb_array_elements_text(p_input->'vehicleIds'))::uuid
  LOOP
    PERFORM public.save_catalog_spec(jsonb_build_object(
      'variantId', v_vid::text,
      'specKey', v_key,
      'value', v_value,
      'scope', 'variant',
      'evidenceUrl', v_evidence,
      'verifiedBy', v_verified_by::text
    ));
    v_saved := v_saved + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'savedCount', v_saved);
END;
$bulk$;

REVOKE ALL ON FUNCTION public.save_catalog_specs_bulk(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_catalog_specs_bulk(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.list_vehicle_catalog_revisions(p_variant_id uuid, p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(row ORDER BY row->>'createdAt' DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'id', pr.id,
      'createdAt', pr.created_at,
      'actor', pr.actor,
      'oldRow', pr.old_row,
      'newRow', pr.new_row
    ) AS row
    FROM public.platform_revision pr
    WHERE pr.entity_table = 'vehicle_catalog'
      AND pr.entity_id = p_variant_id
    ORDER BY pr.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  ) sub;
$$;

REVOKE ALL ON FUNCTION public.list_vehicle_catalog_revisions(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_vehicle_catalog_revisions(uuid, int) TO service_role;
