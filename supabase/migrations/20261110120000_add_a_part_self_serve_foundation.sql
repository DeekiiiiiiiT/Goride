-- Add-a-part self-serve foundation (AS-01 through AS-07, AS-10)

ALTER TABLE public.engine_family
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS default_fit_mode text,
  ADD COLUMN IF NOT EXISTS trade_term text,
  ADD COLUMN IF NOT EXISTS editor_hint text,
  ADD COLUMN IF NOT EXISTS part_type_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS position_scheme text NOT NULL DEFAULT 'none';

ALTER TABLE public.maintenance_service_categories
  DROP CONSTRAINT IF EXISTS maintenance_service_categories_default_fit_mode_check;

ALTER TABLE public.maintenance_service_categories
  ADD CONSTRAINT maintenance_service_categories_default_fit_mode_check
  CHECK (default_fit_mode IS NULL OR default_fit_mode IN ('specific', 'engine', 'spec'));

ALTER TABLE public.maintenance_service_categories
  DROP CONSTRAINT IF EXISTS maintenance_service_categories_position_scheme_check;

ALTER TABLE public.maintenance_service_categories
  ADD CONSTRAINT maintenance_service_categories_position_scheme_check
  CHECK (position_scheme IN (
    'none', 'axle', 'four_corners', 'driver_passenger_rear', 'low_high_beam',
    'before_after_catalyst', 'front_rear_side', 'axle_left_right', 'axle_inner_outer'
  ));

ALTER TABLE public.maintenance_service_categories
  DROP CONSTRAINT IF EXISTS maintenance_service_categories_part_type_status_check;

ALTER TABLE public.maintenance_service_categories
  ADD CONSTRAINT maintenance_service_categories_part_type_status_check
  CHECK (part_type_status IN ('active', 'draft'));

ALTER TABLE public.part_master
  ADD COLUMN IF NOT EXISTS source_type text;

ALTER TABLE public.part_master
  DROP CONSTRAINT IF EXISTS part_master_source_type_check;

ALTER TABLE public.part_master
  ADD CONSTRAINT part_master_source_type_check
  CHECK (source_type IS NULL OR source_type IN ('car_maker_catalogue', 'part_maker_catalogue', 'other'));

CREATE TABLE IF NOT EXISTS public.part_type_spec_field (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_type_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE CASCADE,
  spec_key text NOT NULL REFERENCES public.spec_key (key) ON DELETE RESTRICT,
  label text NOT NULL,
  unit text,
  data_type text NOT NULL DEFAULT 'text' CHECK (data_type IN ('text', 'number', 'enum')),
  options jsonb,
  required boolean NOT NULL DEFAULT false,
  example text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (part_type_id, spec_key)
);

CREATE TABLE IF NOT EXISTS public.part_type_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  area text,
  example_number text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'draft')),
  requester_id uuid REFERENCES auth.users (id),
  decided_by uuid REFERENCES auth.users (id),
  decline_reason text,
  created_part_type_id uuid REFERENCES public.maintenance_service_categories (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS part_type_request_status_idx ON public.part_type_request (status, created_at DESC);

REVOKE ALL ON TABLE public.part_type_spec_field FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.part_type_request FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.part_type_spec_field TO service_role;
GRANT ALL ON TABLE public.part_type_request TO service_role;

ALTER TABLE public.part_import_batch
  ALTER COLUMN area_id DROP NOT NULL;

ALTER TABLE public.interchange_fitment_rule
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.part_import_batch (id) ON DELETE SET NULL;

-- AS-06: the wizard's engine fit and spec part must be undoable, so the change log accepts them
ALTER TABLE public.part_import_change DROP CONSTRAINT IF EXISTS part_import_change_table_name_check;
ALTER TABLE public.part_import_change ADD CONSTRAINT part_import_change_table_name_check CHECK (
  table_name IN (
    'part_master', 'part_listing', 'part_interchange_group', 'universal_part',
    'vehicle_oe_number', 'part_oe_reference', 'part_index_number', 'part_approval',
    'platform_component_link', 'interchange_group_merge_log', 'interchange_fitment_rule'
  )
);

-- AS-03: split fluids + fog light; ensure FLD-COOL exists for coolant_type spec
INSERT INTO public.maintenance_service_categories (
  id, code, name, plain_name, parent_id, icon_key, sort_order, is_part, op_code, position_aware, kind
)
SELECT
  'a1000001-0000-4000-8000-000000000101'::uuid,
  'engine_oil_part',
  'Engine oil',
  'Engine oil',
  p.id,
  'oil_barrel',
  40,
  true,
  'FLD-ENG-OIL',
  false,
  'component'
FROM public.maintenance_service_categories p
WHERE p.id = 'b1000000-0000-4000-8000-000000000005'::uuid AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'FLD-ENG-OIL')
ON CONFLICT DO NOTHING;

INSERT INTO public.maintenance_service_categories (
  id, code, name, plain_name, parent_id, icon_key, sort_order, is_part, op_code, position_aware, kind
)
SELECT
  'a1000001-0000-4000-8000-000000000102'::uuid,
  'coolant_part',
  'Coolant',
  'Coolant',
  p.id,
  'water_drop',
  41,
  true,
  'FLD-COOL',
  false,
  'component'
FROM public.maintenance_service_categories p
WHERE p.id = 'b1000000-0000-4000-8000-000000000005'::uuid AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'FLD-COOL')
ON CONFLICT DO NOTHING;

INSERT INTO public.maintenance_service_categories (
  id, code, name, plain_name, parent_id, icon_key, sort_order, is_part, op_code, position_aware, kind
)
SELECT
  'a1000001-0000-4000-8000-000000000103'::uuid,
  'washer_fluid_part',
  'Washer fluid',
  'Washer fluid',
  p.id,
  'water_drop',
  42,
  true,
  'FLD-WASH',
  false,
  'component'
FROM public.maintenance_service_categories p
WHERE p.id = 'b1000000-0000-4000-8000-000000000005'::uuid AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'FLD-WASH')
ON CONFLICT DO NOTHING;

INSERT INTO public.maintenance_service_categories (
  id, code, name, plain_name, parent_id, icon_key, sort_order, is_part, op_code, position_aware, kind
)
SELECT
  'a1000001-0000-4000-8000-000000000104'::uuid,
  'fog_light_bulb',
  'Fog light bulb',
  'Fog light bulb',
  p.id,
  'lightbulb',
  55,
  true,
  'LGT-FOG',
  false,
  'component'
FROM public.maintenance_service_categories p
WHERE p.id = 'b1000000-0000-4000-8000-000000000007'::uuid AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'LGT-FOG')
ON CONFLICT DO NOTHING;

UPDATE public.spec_key sk SET component_id = c.id
FROM public.maintenance_service_categories c
WHERE sk.key = 'coolant_type' AND c.op_code = 'FLD-COOL'
  AND sk.component_id IS DISTINCT FROM c.id;

-- AS-04/05: backfill metadata by op_code (29 wizard types)
UPDATE public.maintenance_service_categories c SET
  default_fit_mode = v.mode,
  position_scheme = v.scheme,
  trade_term = v.term,
  editor_hint = v.hint,
  part_type_status = 'active'
FROM (VALUES
  ('BRK-PADS', 'specific', 'axle', 'pads', 'Disc brakes use pads; drum brakes use shoes.'),
  ('BRK-SHOES', 'specific', 'axle', 'shoes', 'Drum brake shoes — usually rear.'),
  ('BRK-ROTOR', 'specific', 'axle', 'rotor', 'Brake disc / rotor for this axle.'),
  ('BRK-FLUID', 'spec', 'none', 'DOT', 'Match the DOT rating on the cap.'),
  ('ENG-OIL', 'engine', 'none', 'oil filter', 'Fits every car with this engine code.'),
  ('ENG-SPARK', 'engine', 'none', 'spark plugs', 'One set per engine service.'),
  ('ENG-COIL', 'engine', 'none', 'coil', 'Ignition coil per cylinder bank.'),
  ('ENG-O2', 'engine', 'before_after_catalyst', 'O2 / lambda', 'Before or after the catalytic converter.'),
  ('ENG-THERM', 'engine', 'none', 'thermostat', 'Engine cooling thermostat.'),
  ('ENG-WPUMP', 'engine', 'none', 'water pump', 'Engine water pump.'),
  ('FILT-AIR', 'specific', 'none', 'air filter', 'Engine air filter element.'),
  ('FILT-FUELFILT', 'specific', 'none', 'fuel filter', 'Fuel filter for this car.'),
  ('HVAC-CABIN', 'specific', 'none', 'cabin filter', 'HVAC cabin filter.'),
  ('FLD-ENG-OIL', 'spec', 'none', 'grade', 'Engine oil viscosity grade.'),
  ('FLD-COOL', 'spec', 'none', 'coolant type', 'Coolant specification on the bottle.'),
  ('FLD-WASH', 'spec', 'none', 'washer', 'Windscreen washer fluid.'),
  ('TRN-FLUID', 'spec', 'none', 'ATF / CVT', 'Transmission fluid spec.'),
  ('BELT-SERP', 'engine', 'none', 'serpentine', 'Drive belt for this engine.'),
  ('ELEC-BATT', 'spec', 'none', 'JIS size', 'Battery JIS size code.'),
  ('ELEC-ALT', 'engine', 'none', 'alternator', 'Alternator for this engine.'),
  ('ELEC-START', 'engine', 'none', 'starter', 'Starter motor for this engine.'),
  ('LGT-HEAD', 'spec', 'low_high_beam', 'H4 / H11', 'Headlamp bulb size.'),
  ('LGT-TAIL', 'spec', 'none', 'W21/5W', 'Brake and tail bulb size.'),
  ('LGT-IND', 'spec', 'front_rear_side', 'WY21W', 'Indicator bulb position.'),
  ('LGT-FOG', 'spec', 'none', 'H16', 'Fog lamp bulb size.'),
  ('LGT-WIPER', 'spec', 'driver_passenger_rear', 'wiper mm', 'Blade length in mm plus connector.'),
  ('SUS-SHOCK', 'specific', 'four_corners', 'shock', 'One corner at a time.'),
  ('SUS-INSP', 'specific', 'front_rear_side', 'link / bush', 'Suspension arm or bush location.'),
  ('TIRE-REPL', 'spec', 'axle', 'size', 'Tire size plus load/speed index.')
) AS v(op, mode, scheme, term, hint)
WHERE c.is_part IS TRUE AND upper(coalesce(c.op_code, '')) = upper(v.op);

-- AS-05: spec fields for "by size or spec" types, linked to the spec keys that already exist
INSERT INTO public.part_type_spec_field (part_type_id, spec_key, label, unit, data_type, required, example, sort_order)
SELECT c.id, v.spec_key, v.label, v.unit, v.data_type, v.required, v.example, v.sort_order
FROM (VALUES
  ('BRK-FLUID', 'brake_fluid', 'DOT rating', NULL, 'text', true, 'DOT 3', 1),
  ('FLD-ENG-OIL', 'engine_oil_grade', 'Oil grade', NULL, 'text', true, '0W-20', 1),
  ('FLD-COOL', 'coolant_type', 'Coolant type', NULL, 'text', true, 'Super Long Life', 1),
  ('TRN-FLUID', 'transmission_fluid', 'Fluid spec', NULL, 'text', true, 'CVTF FE', 1),
  ('ELEC-BATT', 'battery_jis', 'JIS size', NULL, 'text', true, '46B24L', 1),
  ('LGT-HEAD', 'headlight_low_bulb', 'Low beam bulb', NULL, 'text', true, 'H4', 1),
  ('LGT-HEAD', 'headlight_high_bulb', 'High beam bulb', NULL, 'text', false, 'H4', 2),
  ('LGT-FOG', 'fog_bulb', 'Fog bulb', NULL, 'text', true, 'H16', 1),
  ('LGT-WIPER', 'wiper_driver_mm', 'Driver blade length', 'mm', 'number', true, '525', 1),
  ('LGT-WIPER', 'wiper_passenger_mm', 'Passenger blade length', 'mm', 'number', false, '350', 2),
  ('LGT-WIPER', 'wiper_rear_mm', 'Rear blade length', 'mm', 'number', false, '300', 3),
  ('LGT-WIPER', 'wiper_connector', 'Connector', NULL, 'text', false, 'U-hook', 4)
) AS v(op, spec_key, label, unit, data_type, required, example, sort_order)
JOIN public.maintenance_service_categories c ON c.op_code = v.op AND c.is_part IS TRUE
JOIN public.spec_key sk ON sk.key = v.spec_key
ON CONFLICT (part_type_id, spec_key) DO NOTHING;

-- AS-03: the old combined "Washer / Coolant" type is replaced by Coolant + Washer fluid; hide it from the wizard (existing parts keep it)
UPDATE public.maintenance_service_categories
SET part_type_status = 'draft'
WHERE op_code = 'FLD-TOPUP';

-- AS-01: resolve engine family + platform from codes
CREATE OR REPLACE FUNCTION public.resolve_vehicle_catalog_links(
  p_make text,
  p_engine_code text,
  p_chassis_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_engine_code text := upper(btrim(coalesce(p_engine_code, '')));
  v_chassis text := upper(btrim(coalesce(p_chassis_code, '')));
  v_make text := btrim(coalesce(p_make, ''));
  v_engine_id uuid;
  v_platform_id uuid;
BEGIN
  IF v_engine_code <> '' THEN
    SELECT id INTO v_engine_id FROM public.engine_family WHERE upper(code) = v_engine_code LIMIT 1;
    IF v_engine_id IS NULL THEN
      INSERT INTO public.engine_family (code) VALUES (v_engine_code) RETURNING id INTO v_engine_id;
    END IF;
  END IF;

  IF v_chassis <> '' AND v_make <> '' THEN
    SELECT id INTO v_platform_id
    FROM public.vehicle_platform
    WHERE maker = v_make AND upper(code) = v_chassis
    LIMIT 1;
    IF v_platform_id IS NULL THEN
      INSERT INTO public.vehicle_platform (code, label, maker)
      VALUES (v_chassis, v_make || ' · ' || v_chassis, v_make)
      RETURNING id INTO v_platform_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'engine_family_id', v_engine_id,
    'platform_id', v_platform_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_vehicle_catalog_links(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_vehicle_catalog_links(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_vehicle_catalog_links(p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row record;
  v_links jsonb;
BEGIN
  SELECT make, engine_code, chassis_code, engine_family_id, platform_id
  INTO v_row
  FROM public.vehicle_catalog
  WHERE id = p_vehicle_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_links := public.resolve_vehicle_catalog_links(v_row.make, v_row.engine_code, v_row.chassis_code);

  UPDATE public.vehicle_catalog vc
  SET
    engine_family_id = coalesce(vc.engine_family_id, (v_links->>'engine_family_id')::uuid),
    platform_id = coalesce(vc.platform_id, (v_links->>'platform_id')::uuid),
    updated_at = now()
  WHERE vc.id = p_vehicle_id
    AND (
      (btrim(coalesce(vc.engine_code, '')) <> '' AND vc.engine_family_id IS NULL)
      OR (btrim(coalesce(vc.chassis_code, '')) <> '' AND vc.platform_id IS NULL)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_vehicle_catalog_links(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_vehicle_catalog_links(uuid) TO service_role;

-- Backfill unlinked cars
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.vehicle_catalog
    WHERE (btrim(coalesce(engine_code, '')) <> '' AND engine_family_id IS NULL)
       OR (btrim(coalesce(chassis_code, '')) <> '' AND platform_id IS NULL)
  LOOP
    PERFORM public.apply_vehicle_catalog_links(r.id);
  END LOOP;
END $$;

-- AS-02: car_specs import template (own system area row, like the car factory number templates)
INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, icon_key, sort_order, is_part)
VALUES ('d1000001-0000-4000-8000-000000000004', 'imp-car-specs', 'Car specs', 'system', 'IMP-SPEC', 'straighten', 9004, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.part_import_template (
  area_id, import_kind, version, columns, allowed_part_type_ids, example_rows, help_lines, active
)
SELECT
  'd1000001-0000-4000-8000-000000000004'::uuid,
  'car_specs',
  1,
  jsonb_build_array(
    jsonb_build_object('name', 'vehicle', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'spec_key', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'spec_value', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'year_from', 'required', false, 'type', 'integer'),
    jsonb_build_object('name', 'year_to', 'required', false, 'type', 'integer'),
    jsonb_build_object('name', 'source_url', 'required', true, 'type', 'url')
  ),
  '{}'::uuid[],
  jsonb_build_array(
    jsonb_build_object('vehicle', 'Toyota Roomy M900A 2019', 'spec_key', 'wiper_driver_mm', 'spec_value', '525', 'source_url', 'https://example.com/spec', 'note', 'EXAMPLE')
  ),
  ARRAY['# Car specs - one row per spec value on a car version.', '# source_url is stored as evidence_url.'],
  true
WHERE NOT EXISTS (SELECT 1 FROM public.part_import_template WHERE import_kind = 'car_specs' AND version = 1);

-- Trust mapping helper
CREATE OR REPLACE FUNCTION public.self_serve_catalog_decision(p_source_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_source_type IN ('car_maker_catalogue', 'part_maker_catalogue') THEN 'confirmed'
    ELSE 'pending'
  END;
$$;

REVOKE ALL ON FUNCTION public.self_serve_catalog_decision(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_catalog_decision(text) TO service_role;
