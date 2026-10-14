-- Run on a Supabase branch, not production. The whole script rolls back.
BEGIN;

INSERT INTO public.engine_family (id, code) VALUES
  ('11111111-1111-4111-8111-111111111111', 'REV2-1NZ-FE')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.vehicle_platform (id, code) VALUES
  ('22222222-2222-4222-8222-222222222222', 'REV2-ZRR80G')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.vehicle_catalog (id, make, model, chassis_code, engine_code, production_start_year, production_end_year, platform_id, engine_family_id)
SELECT
  '33333333-3333-4333-8333-333333333333', 'Toyota', 'Noah', 'REV2-ZRR80G', 'REV2-1NZ-FE', 2012, 2019,
  (SELECT id FROM public.vehicle_platform WHERE code = 'REV2-ZRR80G'),
  (SELECT id FROM public.engine_family WHERE code = 'REV2-1NZ-FE')
WHERE NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = '33333333-3333-4333-8333-333333333333');

INSERT INTO public.part_category (id, slug, label, sort_order)
SELECT '44444444-4444-4444-8444-444444444444', 'rev2-engine', 'Rev2 engine', 1
WHERE NOT EXISTS (SELECT 1 FROM public.part_category WHERE slug = 'rev2-engine');

INSERT INTO public.part_interchange_group (id, code, fit_scope)
VALUES ('55555555-5555-4555-8555-555555555555', 'REV2-OIL', 'powertrain')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.part_master (id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id)
SELECT
  '66666666-6666-4666-8666-666666666666',
  (SELECT id FROM public.part_category WHERE slug = 'rev2-engine'),
  'Rev2 oil filter', 'REV2-OIL-1', 'Toyota', 'oem',
  (SELECT id FROM public.part_interchange_group WHERE code = 'REV2-OIL')
WHERE NOT EXISTS (SELECT 1 FROM public.part_master WHERE id = '66666666-6666-4666-8666-666666666666');

INSERT INTO public.interchange_fitment_rule (
  interchange_group_id, target_kind, engine_family_id, year_from, year_to, source
)
SELECT
  (SELECT id FROM public.part_interchange_group WHERE code = 'REV2-OIL'),
  'engine_family',
  (SELECT id FROM public.engine_family WHERE code = 'REV2-1NZ-FE'),
  2015, NULL, 'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM public.interchange_fitment_rule
  WHERE interchange_group_id = (SELECT id FROM public.part_interchange_group WHERE code = 'REV2-OIL')
);

DO $$
DECLARE
  tier_2017 int;
  tier_2012 int;
BEGIN
  SELECT p.tier INTO tier_2017
  FROM public.parts_for_vehicle('33333333-3333-4333-8333-333333333333', NULL, 2017) p
  LIMIT 1;
  IF tier_2017 IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Expected Tier 1 for a 2017 Toyota own-make engine part, got %', tier_2017;
  END IF;

  SELECT p.tier INTO tier_2012
  FROM public.parts_for_vehicle('33333333-3333-4333-8333-333333333333', NULL, 2012) p
  LIMIT 1;
  IF tier_2012 IS NOT NULL THEN
    RAISE EXCEPTION 'A 2015 facelift rule must stay hidden from a 2012 car';
  END IF;
END $$;

DO $$
BEGIN
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('REV2-BODY', 'body');
  BEGIN
    INSERT INTO public.interchange_fitment_rule (interchange_group_id, target_kind, engine_family_id, source)
    SELECT id, 'engine_family', '11111111-1111-4111-8111-111111111111', 'manual'
    FROM public.part_interchange_group WHERE code = 'REV2-BODY';
    RAISE EXCEPTION 'Engine rule on a body group should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%powertrain%' AND SQLERRM NOT ILIKE '%engine-family%' THEN
      RAISE;
    END IF;
  END;
END $$;

ROLLBACK;
