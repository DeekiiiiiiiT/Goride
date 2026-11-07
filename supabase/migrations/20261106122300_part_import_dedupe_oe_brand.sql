-- Part cross-references: one reference per brand + number, not per number.
-- "NiBK PN5562 -> Toyota 04465-B1190" and "-> Daihatsu 04465-B1190" were treated as one row (second skipped as
-- "Duplicate row in file"), and the table only allowed one row per (part, number). Matching keys on brand + number,
-- so Daihatsu-OE cars (Thor, Justy) never got the aftermarket pads. Three changes, nothing else:
--   1. unique key part_oe_reference (part_id, upper(oe_brand), oe_number_norm)
--   2. import duplicate check for part_cross_ref includes oe_brand
--   3. import promote looks up the existing reference by brand + number

DROP INDEX IF EXISTS public.part_oe_reference_part_norm;
CREATE UNIQUE INDEX part_oe_reference_part_brand_norm
  ON public.part_oe_reference (part_id, upper(coalesce(oe_brand, '')), oe_number_norm);

CREATE OR REPLACE FUNCTION public.part_import_validate_auto_match_postprocess(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT import_kind INTO v_kind FROM public.part_import_batch WHERE id = p_batch_id;
  IF coalesce(v_kind, 'area') = 'area' THEN
    RETURN;
  END IF;

  IF v_kind = 'vehicle_oe' THEN
    WITH d AS (
      SELECT r.line_no,
        row_number() OVER (
          PARTITION BY r.vehicle_catalog_id, r.part_type_id,
            coalesce(r.normalized->>'position', ''), coalesce(r.normalized->>'side', ''),
            coalesce(r.normalized->>'oe_number_norm', '')
          ORDER BY r.line_no
        ) AS rn
      FROM public.part_import_row r
      WHERE r.batch_id = p_batch_id
    )
    UPDATE public.part_import_row r
    SET status = 'duplicate', action = 'skip',
      issues = coalesce(r.issues, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'code', 'OE_DUPLICATE', 'column', 'oe_number', 'message', 'Duplicate row in file', 'severity', 'duplicate'))
    FROM d
    WHERE r.batch_id = p_batch_id AND r.line_no = d.line_no AND d.rn > 1;
  ELSIF v_kind = 'part_cross_ref' THEN
    WITH d AS (
      SELECT r.line_no,
        row_number() OVER (
          PARTITION BY upper(btrim(coalesce(r.raw->>'brand', ''))),
            public.part_import_norm_number(coalesce(r.raw->>'part_number', '')),
            upper(btrim(coalesce(r.raw->>'oe_brand', ''))), coalesce(r.raw->>'oe_number', ''), coalesce(r.raw->>'index_type', ''), coalesce(r.raw->>'index_number', '')
          ORDER BY r.line_no
        ) AS rn
      FROM public.part_import_row r
      WHERE r.batch_id = p_batch_id
    )
    UPDATE public.part_import_row r
    SET status = 'duplicate', action = 'skip',
      issues = coalesce(r.issues, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'code', 'OE_DUPLICATE', 'column', 'part_number', 'message', 'Duplicate row in file', 'severity', 'duplicate'))
    FROM d
    WHERE r.batch_id = p_batch_id AND r.line_no = d.line_no AND d.rn > 1;
  END IF;
END;
$$;

DO $$
DECLARE
  v_def text;
  v_old text := 'por.oe_number_norm = r.normalized->>''oe_number_norm''';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'part_import_promote_auto_match';
  IF v_def IS NULL OR position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'part_import_promote_auto_match: expected reference lookup not found';
  END IF;
  EXECUTE replace(v_def, v_old,
    v_old || ' AND upper(coalesce(por.oe_brand, '''')) = upper(btrim(coalesce(r.raw->>''oe_brand'', '''')))');
END;
$$;
