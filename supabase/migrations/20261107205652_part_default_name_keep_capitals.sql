-- 5-14 follow-up: keep acronym capitals (ABS, O2, …) when prefixing position onto default part names.

CREATE OR REPLACE FUNCTION public.self_serve_default_part_name(
  p_plain_name text,
  p_position_scheme text,
  p_position text,
  p_side text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $helper$
DECLARE
  v_base text := btrim(coalesce(p_plain_name, ''));
  v_scheme text := lower(btrim(coalesce(p_position_scheme, 'none')));
  v_pos text := nullif(lower(btrim(coalesce(p_position, ''))), '');
  v_side text := nullif(lower(btrim(coalesce(p_side, ''))), '');
  v_phrase text;
  v_type_tail text;
  v_pos_label text;
BEGIN
  IF v_base = '' THEN
    v_base := 'Part';
  END IF;

  IF v_scheme = 'none' OR v_pos IS NULL THEN
    RETURN v_base;
  END IF;

  v_phrase := lower(v_base);
  IF length(v_base) >= 2 AND upper(substr(v_base, 2, 1)) = substr(v_base, 2, 1) THEN
    v_type_tail := v_base;
  ELSE
    v_type_tail := lower(substr(v_base, 1, 1)) || substr(v_base, 2);
  END IF;

  IF v_scheme IN ('axle', 'axle_inner_outer') AND v_pos IN ('front', 'rear') THEN
    IF v_phrase NOT LIKE v_pos || '%' THEN
      RETURN initcap(v_pos) || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_scheme IN ('four_corners', 'axle_left_right') AND v_pos IN ('front', 'rear') AND v_side IS NOT NULL THEN
    IF v_phrase NOT LIKE v_pos || '%' THEN
      RETURN initcap(v_pos) || ' ' || v_type_tail || ', ' || v_side;
    END IF;
    RETURN v_base || ', ' || v_side;
  END IF;

  IF v_scheme = 'before_after_catalyst' AND v_pos IN ('before_cat', 'after_cat') THEN
    v_pos_label := CASE v_pos WHEN 'before_cat' THEN 'Before cat' WHEN 'after_cat' THEN 'After cat' END;
    IF v_phrase NOT LIKE 'before cat%' AND v_phrase NOT LIKE 'after cat%' THEN
      RETURN v_pos_label || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_scheme = 'driver_passenger_rear' AND v_pos IN ('driver', 'passenger', 'rear') THEN
    v_pos_label := initcap(v_pos);
    IF v_phrase NOT LIKE v_pos || '%' THEN
      RETURN v_pos_label || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_scheme = 'low_high_beam' AND v_pos IN ('low', 'high') THEN
    v_pos_label := CASE v_pos WHEN 'low' THEN 'Low beam' WHEN 'high' THEN 'High beam' END;
    IF v_phrase NOT LIKE v_pos || '%' AND v_phrase NOT LIKE v_pos || ' beam%' THEN
      RETURN v_pos_label || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_scheme = 'front_rear_side' AND v_pos IN ('front', 'rear', 'side') THEN
    v_pos_label := initcap(v_pos);
    IF v_phrase NOT LIKE v_pos || '%' THEN
      RETURN v_pos_label || ' ' || v_type_tail;
    END IF;
    RETURN v_base;
  END IF;

  IF v_phrase NOT LIKE v_pos || '%' THEN
    RETURN initcap(v_pos) || ' ' || v_type_tail;
  END IF;
  RETURN v_base;
END;
$helper$;

REVOKE EXECUTE ON FUNCTION public.self_serve_default_part_name(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_default_part_name(text, text, text, text) TO service_role;

-- Fix live ABS sensor names that lost acronym capitals after 5-14.
DO $backfill$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_batch_code text := 'BF-514CAP-' || upper(substr(replace(v_batch_id::text, '-', ''), 1, 6));
  v_area uuid := 'b1000000-0000-4000-8000-000000000004'::uuid;
  v_line int := 0;
  v_cnt int := 0;
  v_rec record;
  v_before jsonb;
  v_after jsonb;
  v_new_name text;
  v_side text;
BEGIN
  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at, promoted_by
  ) VALUES (
    v_batch_id, v_batch_code, v_area, 1, '5-14-abs-name-capital-fix', v_batch_code, 'imported', 'self_serve_add', now(), NULL
  );

  FOR v_rec IN
    SELECT DISTINCT ON (pm.id)
      pm.id AS part_id, pm.name, pm.oem_part_number, pl.side AS listing_side
    FROM public.part_master pm
    JOIN public.part_listing pl ON pl.interchange_group_id = pm.interchange_group_id AND pl.side IS NOT NULL
    WHERE pm.oem_part_number_norm IN (
      public.part_import_norm_number('89542-B1040'),
      public.part_import_norm_number('89543-B1050')
    )
    AND btrim(pm.name) ILIKE '%abs wheel sensor%'
    ORDER BY pm.id, pl.side
  LOOP
    v_side := v_rec.listing_side;
    v_new_name := public.self_serve_default_part_name(
      'ABS wheel sensor',
      'axle_left_right',
      'front',
      v_side
    );
    IF v_new_name IS NULL OR btrim(v_new_name) = '' OR v_new_name = v_rec.name THEN
      CONTINUE;
    END IF;

    SELECT to_jsonb(pm.*) INTO v_before FROM public.part_master pm WHERE pm.id = v_rec.part_id;
    UPDATE public.part_master SET name = v_new_name, updated_at = now() WHERE id = v_rec.part_id;
    SELECT to_jsonb(pm.*) INTO v_after FROM public.part_master pm WHERE pm.id = v_rec.part_id;

    v_line := v_line + 1;
    INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
    VALUES (v_batch_id, v_line, 'part_master', v_rec.part_id, 'update', v_before, v_after);
    v_cnt := v_cnt + 1;
  END LOOP;

  UPDATE public.part_import_batch SET parts_created = 0, fits_created = 0, promoted_at = now() WHERE id = v_batch_id;
  IF v_cnt = 0 THEN
    DELETE FROM public.part_import_batch WHERE id = v_batch_id;
  END IF;
END;
$backfill$;
