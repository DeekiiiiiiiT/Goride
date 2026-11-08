-- RB-25: Blue Print ADT34155 joins the Toyota rear shoe card (04495-B1310 / 04495-B2400, 2016–2019 builds).
-- Source: Blue Print's own catalogue, https://partsfinder.bilsteingroup.com/en/article/blueprint/ADT34155
--   "Comparison Number(s)": Daihatsu 04495-B2400 | 04495-B1310; Toyota ... 04495-B1310 ... 04495-B2400 ...
--   (04495-B2430, the 2019–2020 shoe kit, is NOT listed, so ADT34155 stays out of that card.)
-- What this does:
--   1. Trusted sources: partsfinder.bilsteingroup.com counts as Blue Print's own site.
--   2. ADT34155 moves into the Toyota shoe card, Confirmed from Blue Print's page,
--      and records that it replaces Toyota 04495-B1310 and 04495-B2400.
--   Its old card's fits are left in place (empty card), the same way "Merge same part" leaves them.
-- All-or-nothing. Safe to run twice.

BEGIN;

DO $$
DECLARE
  v_actor uuid := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_src text := 'https://partsfinder.bilsteingroup.com/en/article/blueprint/ADT34155';
  v_bp public.part_master%ROWTYPE;
  v_card uuid;
  v_num text;
BEGIN
  INSERT INTO public.trusted_source (kind, maker, domain, added_by)
  SELECT 'part_maker', 'Blue Print', 'partsfinder.bilsteingroup.com', v_actor
  WHERE NOT EXISTS (
    SELECT 1 FROM public.trusted_source
    WHERE kind = 'part_maker' AND maker_norm = 'blue print' AND domain = 'partsfinder.bilsteingroup.com'
  );

  SELECT interchange_group_id INTO v_card FROM public.part_master
  WHERE manufacturer = 'Toyota' AND oem_part_number = '04495-B1310' LIMIT 1;
  IF v_card IS NULL THEN RAISE EXCEPTION 'Toyota 04495-B1310 card not found (run the RB-24 script first). Nothing was changed.'; END IF;

  SELECT * INTO v_bp FROM public.part_master
  WHERE upper(manufacturer) = 'BLUE PRINT' AND oem_part_number_norm = public.part_import_norm_number('ADT34155') LIMIT 1;
  IF v_bp.id IS NULL THEN RAISE EXCEPTION 'Blue Print ADT34155 not found. Nothing was changed.'; END IF;

  UPDATE public.part_master
  SET interchange_group_id = v_card,
      catalog_decision = 'confirmed', source_type = 'part_maker_catalogue', evidence_url = v_src,
      verified_by = v_actor, verified_at = coalesce(verified_at, now()), updated_at = now()
  WHERE id = v_bp.id;

  FOREACH v_num IN ARRAY ARRAY['04495-B1310', '04495-B2400'] LOOP
    INSERT INTO public.part_oe_reference (part_id, reference_type, oe_brand, oe_number, oe_number_norm, evidence_url, created_by)
    SELECT v_bp.id, 'replaces', 'Toyota', v_num, public.part_import_norm_number(v_num), v_src, v_actor
    WHERE NOT EXISTS (
      SELECT 1 FROM public.part_oe_reference r
      WHERE r.part_id = v_bp.id AND r.oe_number_norm = public.part_import_norm_number(v_num)
    );
  END LOOP;

  PERFORM public.part_match_recompute(v_card, NULL);
  IF v_bp.interchange_group_id IS NOT NULL AND v_bp.interchange_group_id <> v_card THEN
    PERFORM public.part_match_recompute(v_bp.interchange_group_id, NULL);
  END IF;
END $$;

COMMIT;

-- Check (expect 3 parts in one card, all confirmed; Blue Print with 2 "replaces" numbers; the 2WD Roomy + Tank fits).
SELECT 'part' AS what, pm.manufacturer || ' ' || pm.oem_part_number AS item, pm.catalog_decision AS status, pm.interchange_group_id::text AS card
FROM public.part_master pm
WHERE pm.interchange_group_id = (SELECT interchange_group_id FROM public.part_master WHERE manufacturer = 'Toyota' AND oem_part_number = '04495-B1310' LIMIT 1)
UNION ALL
SELECT 'replaces', 'Blue Print ADT34155', r.oe_brand || ' ' || r.oe_number, NULL
FROM public.part_oe_reference r JOIN public.part_master pm ON pm.id = r.part_id
WHERE upper(pm.manufacturer) = 'BLUE PRINT' AND pm.oem_part_number_norm = public.part_import_norm_number('ADT34155')
UNION ALL
SELECT 'fit', c.model || ' ' || pl.year_from || '–' || pl.year_to, pl.trust::text, NULL
FROM public.part_listing pl JOIN public.vehicle_catalog c ON c.id = pl.vehicle_catalog_id
WHERE pl.interchange_group_id = (SELECT interchange_group_id FROM public.part_master WHERE manufacturer = 'Toyota' AND oem_part_number = '04495-B1310' LIMIT 1)
ORDER BY 1, 2;
