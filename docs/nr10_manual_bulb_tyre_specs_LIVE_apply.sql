-- NR-10 (27 Nov, Roomy headlight check): the owner's manual already says "Headlamp, halogen: H4 60/55W" and
-- "165/65R14", approved for the 2020-on Roomys, but those land in vehicle_bulb / vehicle_tyre. Research checks only
-- look at catalog_spec_value (specs_for_variant), so the bulb and tyre checks stayed open and sent the owner to Google.
--
-- Fix: a value read from a car maker's manual in vehicle_bulb / vehicle_tyre is also written as the car's spec:
--   * headlight_low_bulb + headlight_high_bulb from the manual's headlamp bulb (one dual-filament bulb, e.g. H4, gives
--     both; a row that says "low beam" or "high beam" gives only that one). LED headlamps and "Unknown" give nothing;
--   * tire_size from the manual's standard front tyre (not an optional size), only when there is exactly one.
-- Written as Confirmed / maker_document with the manual as evidence. A value the owner or an import already Confirmed
-- by another route is never replaced. Then RE-75's catalog_research_close_covered_jobs() closes the checks it covers
-- (the 10-minute cron does the same for later manuals).

CREATE OR REPLACE FUNCTION public.mm_manual_bulb_tyre_to_specs(p_vehicle_catalog_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_written integer := 0;
  b record;
  v_keys text[];
  v_key text;
  v_tyre record;
  v_tyres integer;
  v_value text;
  v_note text;
BEGIN
  IF p_vehicle_catalog_id IS NULL THEN RETURN 0; END IF;

  -- Headlamp bulbs read from a manual.
  FOR b IN
    SELECT vb.*
    FROM public.vehicle_bulb vb
    WHERE vb.vehicle_catalog_id = p_vehicle_catalog_id
      AND vb.manual_id IS NOT NULL
      AND NOT vb.is_led
      AND vb.position ~* '^\s*head\s*(lamp|light)'
      AND btrim(vb.bulb_ref) <> ''
      AND vb.bulb_ref !~* '^\s*(unknown|led|n/?a|-)\s*$'
    ORDER BY vb.position
  LOOP
    v_keys := CASE
      WHEN b.position ~* 'low\s*beam' AND b.position !~* 'high\s*beam' THEN ARRAY['headlight_low_bulb']
      WHEN b.position ~* 'high\s*beam' AND b.position !~* 'low\s*beam' THEN ARRAY['headlight_high_bulb']
      ELSE ARRAY['headlight_low_bulb', 'headlight_high_bulb']
    END;
    v_value := btrim(b.bulb_ref);
    v_note := concat_ws(' · ', 'Owner''s manual', 'page ' || b.evidence_page, b.position,
                        CASE WHEN b.wattage_w IS NOT NULL THEN b.wattage_w || ' W' END);
    FOREACH v_key IN ARRAY v_keys LOOP
      INSERT INTO public.catalog_spec_value (
        spec_key, scope, vehicle_catalog_id, value, evidence_url, verified_at, trust, trust_route, trust_set_by,
        evidence_read_ids, source_note
      ) VALUES (
        v_key, 'variant', p_vehicle_catalog_id, v_value, b.evidence_url, now(), 'confirmed', 'maker_document', 'auto',
        '{}', v_note
      )
      ON CONFLICT (spec_key, vehicle_catalog_id) WHERE scope = 'variant' DO UPDATE
      SET value = EXCLUDED.value,
          evidence_url = EXCLUDED.evidence_url,
          verified_at = now(),
          trust = 'confirmed',
          trust_route = 'maker_document',
          trust_set_by = 'auto',
          source_note = EXCLUDED.source_note
      WHERE public.catalog_spec_value.trust <> 'confirmed'
         OR public.catalog_spec_value.trust_route = 'maker_document';
      v_written := v_written + 1;
    END LOOP;
  END LOOP;

  -- The standard front tyre read from a manual (exactly one size, optional sizes left out).
  SELECT count(DISTINCT upper(btrim(t.size))) INTO v_tyres
  FROM public.vehicle_tyre t
  WHERE t.vehicle_catalog_id = p_vehicle_catalog_id AND t.manual_id IS NOT NULL
    AND t.position = 'front' AND NOT t.is_optional;
  IF v_tyres = 1 THEN
    SELECT t.* INTO v_tyre
    FROM public.vehicle_tyre t
    WHERE t.vehicle_catalog_id = p_vehicle_catalog_id AND t.manual_id IS NOT NULL
      AND t.position = 'front' AND NOT t.is_optional
    ORDER BY t.updated_at DESC
    LIMIT 1;
    INSERT INTO public.catalog_spec_value (
      spec_key, scope, vehicle_catalog_id, value, evidence_url, verified_at, trust, trust_route, trust_set_by,
      evidence_read_ids, source_note
    ) VALUES (
      'tire_size', 'variant', p_vehicle_catalog_id, btrim(v_tyre.size), v_tyre.evidence_url, now(), 'confirmed',
      'maker_document', 'auto', '{}',
      concat_ws(' · ', 'Owner''s manual', 'page ' || v_tyre.evidence_page, 'standard front tyre')
    )
    ON CONFLICT (spec_key, vehicle_catalog_id) WHERE scope = 'variant' DO UPDATE
    SET value = EXCLUDED.value,
        evidence_url = EXCLUDED.evidence_url,
        verified_at = now(),
        trust = 'confirmed',
        trust_route = 'maker_document',
        trust_set_by = 'auto',
        source_note = EXCLUDED.source_note
    WHERE public.catalog_spec_value.trust <> 'confirmed'
       OR public.catalog_spec_value.trust_route = 'maker_document';
    v_written := v_written + 1;
  END IF;

  RETURN v_written;
END;
$$;

COMMENT ON FUNCTION public.mm_manual_bulb_tyre_to_specs(uuid) IS
  'NR-10: copies a manual''s headlamp bulb and standard front tyre (vehicle_bulb / vehicle_tyre) into the car''s '
  'headlight_low_bulb / headlight_high_bulb / tire_size specs (Confirmed, maker_document), so research checks see them.';

REVOKE ALL ON FUNCTION public.mm_manual_bulb_tyre_to_specs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_manual_bulb_tyre_to_specs(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_mm_manual_bulb_tyre_to_specs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.manual_id IS NOT NULL THEN
    PERFORM public.mm_manual_bulb_tyre_to_specs(NEW.vehicle_catalog_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_mm_manual_bulb_tyre_to_specs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vehicle_bulb_to_specs ON public.vehicle_bulb;
CREATE TRIGGER vehicle_bulb_to_specs
  AFTER INSERT OR UPDATE ON public.vehicle_bulb
  FOR EACH ROW EXECUTE FUNCTION public.trg_mm_manual_bulb_tyre_to_specs();

DROP TRIGGER IF EXISTS vehicle_tyre_to_specs ON public.vehicle_tyre;
CREATE TRIGGER vehicle_tyre_to_specs
  AFTER INSERT OR UPDATE ON public.vehicle_tyre
  FOR EACH ROW EXECUTE FUNCTION public.trg_mm_manual_bulb_tyre_to_specs();

-- Once now for every car a manual already filled, then close the checks that are now answered.
DO $$
DECLARE
  v_car uuid;
BEGIN
  FOR v_car IN
    SELECT vehicle_catalog_id FROM public.vehicle_bulb WHERE manual_id IS NOT NULL
    UNION
    SELECT vehicle_catalog_id FROM public.vehicle_tyre WHERE manual_id IS NOT NULL
  LOOP
    PERFORM public.mm_manual_bulb_tyre_to_specs(v_car);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.catalog_research_close_covered_jobs()') IS NOT NULL THEN
    PERFORM public.catalog_research_close_covered_jobs();
  END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261128010228', 'mm_manual_bulb_tyre_specs') ON CONFLICT (version) DO NOTHING;
