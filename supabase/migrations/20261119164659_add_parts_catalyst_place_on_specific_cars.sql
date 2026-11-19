-- Add parts: an oxygen sensor (place scheme before_after_catalyst) can be saved on specific cars, with its place.
--
-- Found 19 Nov 2026 adding the Roomy sensors from Toyota's catalogue (LS-20): the catalogue-page save refused with
-- "This part type is added by engine or by size, not by specific cars", and even past that check the place would have
-- been lost, because part_norm_position() turned before_cat / after_cat into NULL. Toyota lists these numbers per car
-- (M900/M910), so a specific-car fit is the right record; part_listing already allows before_cat / after_cat and Log
-- service / Find parts already read them.
--
-- 1. part_norm_position(text, text): keeps before_cat / after_cat (side always NULL). Nothing else changes.
-- 2. save_self_serve_part_in_batch: the specific-cars check accepts before_after_catalyst with before_cat / after_cat.
--    Patched in place from the live definition (only that one check), and refuses to run if the line isn't found.
-- 3. self_serve_default_part_name: names them "Front oxygen sensor" / "Rear oxygen sensor", not "Before cat …".
--    Same in-place patch.

CREATE OR REPLACE FUNCTION public.part_norm_position(p_position text, p_side text DEFAULT NULL::text)
 RETURNS TABLE(norm_position text, norm_side text)
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
DECLARE
  v_pos text := upper(btrim(coalesce(p_position, '')));
  v_side_in text := lower(btrim(coalesce(p_side, '')));
  v_out_pos text;
  v_out_side text;
BEGIN
  IF v_pos = '' THEN
    norm_position := NULL;
    norm_side := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_out_side := CASE
    WHEN v_side_in IN ('left', 'right', 'both') THEN v_side_in
    WHEN v_side_in = 'l' THEN 'left'
    WHEN v_side_in = 'r' THEN 'right'
    ELSE NULL
  END;

  IF v_pos IN ('FRONT', 'F') THEN
    v_out_pos := 'front';
  ELSIF v_pos IN ('REAR', 'R') THEN
    v_out_pos := 'rear';
  ELSIF v_pos IN ('FL', 'FRONT LEFT', 'FRONTLEFT') THEN
    v_out_pos := 'front';
    v_out_side := coalesce(v_out_side, 'left');
  ELSIF v_pos IN ('FR', 'FRONT RIGHT', 'FRONTRIGHT') THEN
    v_out_pos := 'front';
    v_out_side := coalesce(v_out_side, 'right');
  ELSIF v_pos IN ('RL', 'REAR LEFT', 'REARLEFT') THEN
    v_out_pos := 'rear';
    v_out_side := coalesce(v_out_side, 'left');
  ELSIF v_pos IN ('RR', 'REAR RIGHT', 'REARRIGHT') THEN
    v_out_pos := 'rear';
    v_out_side := coalesce(v_out_side, 'right');
  ELSIF v_pos IN ('L', 'LEFT') THEN
    v_out_pos := NULL;
    v_out_side := coalesce(v_out_side, 'left');
  ELSIF v_pos IN ('RIGHT') THEN
    v_out_pos := NULL;
    v_out_side := coalesce(v_out_side, 'right');
  ELSIF v_pos IN ('BEFORE_CAT', 'BEFORE CAT') THEN
    v_out_pos := 'before_cat';
    v_out_side := NULL;
  ELSIF v_pos IN ('AFTER_CAT', 'AFTER CAT') THEN
    v_out_pos := 'after_cat';
    v_out_side := NULL;
  ELSIF v_pos = 'BOTH' THEN
    v_out_pos := NULL;
    v_out_side := NULL;
  ELSIF v_pos IN ('FRONT BOTH') OR (v_pos LIKE '%FRONT%' AND v_pos LIKE '%BOTH%') THEN
    v_out_pos := 'front';
    v_out_side := coalesce(v_out_side, 'both');
  ELSE
    v_out_pos := NULL;
    v_out_side := NULL;
  END IF;

  norm_position := v_out_pos;
  norm_side := v_out_side;
  RETURN NEXT;
END;
$function$;

DO $patch$
DECLARE
  d text;
  old_check constant text :=
    $q$ELSIF v_type.position_scheme NOT IN ('none', 'axle', 'axle_inner_outer', 'four_corners', 'axle_left_right', 'axle_numbered') THEN$q$;
  new_check constant text :=
    $q$ELSIF v_type.position_scheme = 'before_after_catalyst' AND (v_pos IS NULL OR v_pos NOT IN ('before_cat', 'after_cat') OR v_side IS NOT NULL) THEN
        RAISE EXCEPTION 'Choose front (before the converter) or rear (after the converter)';
      ELSIF v_type.position_scheme NOT IN ('none', 'axle', 'axle_inner_outer', 'four_corners', 'axle_left_right', 'axle_numbered', 'before_after_catalyst') THEN$q$;
  old_label constant text :=
    $q$v_pos_label := CASE v_pos WHEN 'before_cat' THEN 'Before cat' WHEN 'after_cat' THEN 'After cat' END;$q$;
  new_label constant text :=
    $q$v_pos_label := CASE v_pos WHEN 'before_cat' THEN 'Front' WHEN 'after_cat' THEN 'Rear' END;$q$;
BEGIN
  -- 2. catalogue-page save
  d := pg_get_functiondef('public.save_self_serve_part_in_batch(jsonb,uuid,integer,boolean)'::regprocedure);
  IF (length(d) - length(replace(d, old_check, ''))) / length(old_check) <> 1 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch: expected the position check exactly once — not patched';
  END IF;
  EXECUTE replace(d, old_check, new_check);

  -- 3. default name
  d := pg_get_functiondef('public.self_serve_default_part_name(text,text,text,text,smallint)'::regprocedure);
  IF (length(d) - length(replace(d, old_label, ''))) / length(old_label) <> 1 THEN
    RAISE EXCEPTION 'self_serve_default_part_name: expected the catalyst label exactly once — not patched';
  END IF;
  EXECUTE replace(d, old_label, new_label);
END
$patch$;

-- Checks (rolled into this same run: it fails, and nothing above sticks, if any is wrong).
DO $check$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.part_norm_position('before_cat', NULL);
  IF r.norm_position IS DISTINCT FROM 'before_cat' OR r.norm_side IS NOT NULL THEN RAISE EXCEPTION 'check: before_cat kept'; END IF;
  SELECT * INTO r FROM public.part_norm_position('after_cat', 'left');
  IF r.norm_position IS DISTINCT FROM 'after_cat' OR r.norm_side IS NOT NULL THEN RAISE EXCEPTION 'check: after_cat kept, no side'; END IF;
  SELECT * INTO r FROM public.part_norm_position('FL', NULL);
  IF r.norm_position IS DISTINCT FROM 'front' OR r.norm_side IS DISTINCT FROM 'left' THEN RAISE EXCEPTION 'check: FL unchanged'; END IF;
  IF public.self_serve_default_part_name('Oxygen sensor', 'before_after_catalyst', 'before_cat', NULL, NULL::smallint) <> 'Front oxygen sensor'
     OR public.self_serve_default_part_name('Oxygen sensor', 'before_after_catalyst', 'after_cat', NULL, NULL::smallint) <> 'Rear oxygen sensor' THEN
    RAISE EXCEPTION 'check: Front / Rear oxygen sensor names';
  END IF;
  IF position('''before_after_catalyst'') THEN' in pg_get_functiondef('public.save_self_serve_part_in_batch(jsonb,uuid,integer,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'check: catalogue-page save accepts before_after_catalyst';
  END IF;
END
$check$;
