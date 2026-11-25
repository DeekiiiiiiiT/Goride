-- Add parts from a catalogue page: the maker the person picks decides trust; the save returns the names it
-- wrote, refuses the same part number twice in one page, and refuses an "another brand" part with no brand.
--
-- Nothing else changes, and no existing data is touched:
--   * self_serve_link_hints keeps its old answer when p_maker is null (byte-for-byte the same keys), and only
--     adds 'trustMaker' when a maker was given.
--   * save_self_serve_catalog_page keeps every check and write it had, and adds the three rules from the plan
--     (docs/add-parts-catalogue-redesign-plan.md §6, §7, F-01, F-07, F-09, F-10).
--
-- Both functions stay service_role-only; the route in catalog_routes.ts is the only caller.

-- 1) Link hints: an optional maker re-checks trust for the maker picked on screen. ------------------------
-- The one-argument form is dropped first: PostgreSQL prefers an exact arity match, so leaving it in place
-- would keep answering the old URL-only check. The new form keeps a default, so old calls still work.
DROP FUNCTION IF EXISTS public.self_serve_link_hints(text);

CREATE OR REPLACE FUNCTION public.self_serve_link_hints(p_url text, p_maker text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  u text := btrim(coalesce(p_url, ''));
  d text;
  frames text[];
  path_lower text;
  catalog_maker text;
  picked_maker text := nullif(btrim(coalesce(p_maker, '')), '');
  trust_maker text;
  trust text;
  trusted_site boolean := false;
BEGIN
  IF u = '' OR u !~* '^https?://' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_url');
  END IF;
  d := public.source_domain(u);
  frames := public.self_serve_link_frame_codes(u);
  path_lower := lower(u);
  IF path_lower ~ '/toyota(-[a-z]+)?/' THEN catalog_maker := 'Toyota';
  ELSIF path_lower ~ '/lexus(-[a-z]+)?/' THEN catalog_maker := 'Lexus';
  ELSIF path_lower ~ '/daihatsu(-[a-z]+)?/' THEN catalog_maker := 'Daihatsu';
  ELSIF path_lower ~ '/subaru(-[a-z]+)?/' THEN catalog_maker := 'Subaru';
  ELSIF path_lower ~ '/suzuki(-[a-z]+)?/' THEN catalog_maker := 'Suzuki';
  END IF;
  -- The maker the person picked on screen wins for trust. With no maker this is exactly the old URL-only
  -- check (source_trust with the maker read from the link, or empty).
  trust_maker := coalesce(picked_maker, catalog_maker);
  trust := public.source_trust(u, lower(coalesce(trust_maker, '')), ARRAY[]::text[]);
  trusted_site := trust = 'confirmed';
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'host', d,
    'trustedSite', trusted_site,
    'catalogMaker', catalog_maker,
    'frameCodes', to_jsonb(frames),
    'sourceTrust', trust,
    -- Only present when the caller asked about a maker; keeps the no-maker answer identical to today.
    'trustMaker', picked_maker
  ));
END;
$function$;

REVOKE ALL ON FUNCTION public.self_serve_link_hints(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_link_hints(text, text) TO service_role;

-- 2) Catalog-page save: return the names written; refuse a duplicate number and a nameless another brand. ---
CREATE OR REPLACE FUNCTION public.save_self_serve_catalog_page(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $cp$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_batch_code text;
  v_actor uuid := nullif(p_input->>'actorId', '')::uuid;
  v_evidence text := nullif(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_source_type text := coalesce(nullif(p_input->>'sourceType', ''), 'other');
  v_part_kind text := CASE WHEN p_input->>'partKind' IN ('oem', 'aftermarket') THEN p_input->>'partKind' ELSE 'aftermarket' END;
  v_car_mk text := nullif(btrim(coalesce(p_input->>'catalogCarMaker', '')), '');
  v_area uuid;
  v_part jsonb;
  v_one jsonb;
  v_listings jsonb := '[]'::jsonb;
  v_car jsonb;
  v_line int := 0;
  v_total_fits int := 0;
  v_part_ids uuid[] := ARRAY[]::uuid[];
  v_saved_names jsonb := '[]'::jsonb;
  v_saved_name text;
  v_type_id uuid;
  v_inner jsonb;
  v_first_type uuid;
  v_row_no int := 0;
  v_first_row int;
  v_norm_number text;
  v_seen_numbers text[] := ARRAY[]::text[];
BEGIN
  IF v_evidence IS NULL THEN RAISE EXCEPTION 'A source link is required'; END IF;
  IF jsonb_typeof(p_input->'vehicleListings') <> 'array' OR jsonb_array_length(p_input->'vehicleListings') = 0 THEN
    RAISE EXCEPTION 'Pick at least one car';
  END IF;
  IF jsonb_typeof(p_input->'parts') <> 'array' OR jsonb_array_length(p_input->'parts') = 0 THEN
    RAISE EXCEPTION 'Add at least one part';
  END IF;

  -- F-09: another brand must name its brand. The car maker's name is never used for an aftermarket part.
  IF v_part_kind = 'aftermarket' THEN
    FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
    LOOP
      IF nullif(btrim(coalesce(v_part->>'brand', p_input->>'brand', '')), '') IS NULL THEN
        RAISE EXCEPTION 'Which brand made these parts? Type or pick the brand, then save.';
      END IF;
    END LOOP;
  END IF;

  -- F-10: the same part number twice on one page is refused, naming both rows. Nothing is written.
  -- Numbers are compared the way the catalogue import compares them (case, spaces and dashes ignored).
  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_row_no := v_row_no + 1;
    v_norm_number := public.part_import_norm_number(v_part->>'partNumber');
    CONTINUE WHEN v_norm_number IS NULL OR v_norm_number = '';
    v_first_row := array_position(v_seen_numbers, v_norm_number);
    IF v_first_row IS NOT NULL THEN
      RAISE EXCEPTION 'Part % has the same number as part % (%). Change one, or remove it.',
        v_row_no, v_first_row, btrim(coalesce(v_part->>'partNumber', ''));
    END IF;
    v_seen_numbers := array_append(v_seen_numbers, v_norm_number);
  END LOOP;

  v_first_type := nullif(p_input->'parts'->0->>'partTypeId', '')::uuid;
  IF v_first_type IS NULL THEN RAISE EXCEPTION 'Choose a part type on each row'; END IF;
  SELECT c.parent_id INTO v_area
  FROM public.maintenance_service_categories c
  WHERE c.id = v_first_type AND c.is_part IS TRUE AND c.kind = 'component' AND c.part_type_status = 'active';
  IF v_area IS NULL THEN RAISE EXCEPTION 'Invalid part type'; END IF;

  v_batch_code := 'AP-' || upper(substr(replace(v_batch_id::text, '-', ''), 1, 8));
  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at, promoted_by, uploaded_by
  ) VALUES (
    v_batch_id, v_batch_code, v_area, 1, 'self-serve-catalog', v_batch_code, 'imported', 'self_serve_add', now(), v_actor, v_actor
  );

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_type_id := nullif(v_part->>'partTypeId', '')::uuid;
    IF v_type_id IS NULL THEN RAISE EXCEPTION 'Choose a part type on each row'; END IF;
    v_listings := '[]'::jsonb;
    FOR v_car IN SELECT value FROM jsonb_array_elements(p_input->'vehicleListings') AS value
    LOOP
      v_listings := v_listings || jsonb_build_array(
        jsonb_build_object(
          'vehicleId', v_car->>'vehicleId',
          'position', coalesce(v_part->>'position', v_car->>'position'),
          'side', coalesce(v_part->>'side', v_car->>'side'),
          'catalogueNumber', coalesce(v_part->'catalogueNumber', v_car->'catalogueNumber'),
          'yearFrom', v_car->'yearFrom',
          'yearTo', v_car->'yearTo',
          'trust', v_car->>'trust',
          'reason', v_car->>'reason'
        )
      );
    END LOOP;
    v_one := jsonb_build_object(
      'actorId', p_input->>'actorId',
      'partTypeId', v_type_id,
      'brand', coalesce(v_part->>'brand', p_input->>'brand'),
      'partNumber', v_part->>'partNumber',
      'name', v_part->>'name',
      'sourceType', v_source_type,
      'partKind', v_part_kind,
      'evidenceUrl', v_evidence,
      'catalogCarMaker', v_car_mk,
      'fitMode', 'specific',
      'listings', v_listings,
      'existingPartId', v_part->>'existingPartId',
      'factoryNumbers', coalesce(v_part->'factoryNumbers', '[]'::jsonb)
    );
    v_inner := public.save_self_serve_part_in_batch(v_one, v_batch_id, v_line, true);
    v_line := coalesce((v_inner->>'lineNext')::int, v_line);
    v_total_fits := v_total_fits + coalesce((v_inner->>'fits')::int, 0);
    v_part_ids := array_append(v_part_ids, (v_inner->>'partId')::uuid);
    -- F-07: the name actually stored, in input order. A part already on file keeps its own name.
    v_saved_name := NULL;
    SELECT pm.name INTO v_saved_name
    FROM public.part_master pm
    WHERE pm.id = (v_inner->>'partId')::uuid;
    v_saved_names := v_saved_names || jsonb_build_array(coalesce(v_saved_name, v_inner->>'name', ''));
  END LOOP;

  IF v_total_fits = 0 AND NOT EXISTS (
    SELECT 1 FROM public.part_import_change WHERE batch_id = v_batch_id AND op = 'insert'
  ) THEN
    RAISE EXCEPTION 'Nothing was saved — every part already had these fits';
  END IF;

  UPDATE public.part_import_batch SET
    parts_created = (SELECT count(*) FROM public.part_import_change WHERE batch_id = v_batch_id AND table_name = 'part_master' AND op = 'insert'),
    fits_created = v_total_fits
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'batchId', v_batch_id,
    'batchCode', v_batch_code,
    'partIds', to_jsonb(v_part_ids),
    'partCount', coalesce(array_length(v_part_ids, 1), 0),
    'carCount', jsonb_array_length(p_input->'vehicleListings'),
    'fitCount', v_total_fits,
    'savedNames', v_saved_names
  );
END;
$cp$;

REVOKE EXECUTE ON FUNCTION public.save_self_serve_catalog_page(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_self_serve_catalog_page(jsonb) TO service_role;

-- The link-hints signature changed; tell PostgREST to reload its function cache.
NOTIFY pgrst, 'reload schema';
