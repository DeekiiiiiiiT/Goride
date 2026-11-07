-- Phase 2 — Roomy brakes part types (RB-07): brake_role, four row updates, seven new types.
-- Idempotent: safe to re-run. Guards skip steps when prerequisite columns are missing (migration order on some branches).

-- ---------------------------------------------------------------------------
-- brake_role column + CHECK (always)
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS brake_role text;

ALTER TABLE public.maintenance_service_categories
  DROP CONSTRAINT IF EXISTS maintenance_service_categories_brake_role_check;

ALTER TABLE public.maintenance_service_categories
  ADD CONSTRAINT maintenance_service_categories_brake_role_check
  CHECK (brake_role IS NULL OR brake_role IN ('disc', 'drum', 'rear_axle', 'system'));

-- ---------------------------------------------------------------------------
-- (b) Update four existing brake types (skipped when required columns missing)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_brakes uuid := 'b1000000-0000-4000-8000-000000000004'::uuid;
  v_need text[] := ARRAY[
    'plain_name', 'op_code', 'position_scheme', 'position_aware', 'editor_hint',
    'description', 'default_fit_mode', 'part_type_status', 'kind', 'is_part', 'status', 'name', 'parent_id', 'updated_at', 'brake_role'
  ];
  v_col text;
  v_ok boolean := true;
BEGIN
  FOREACH v_col IN ARRAY v_need LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'maintenance_service_categories'
        AND c.column_name = v_col
    ) THEN
      v_ok := false;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_ok THEN
    RAISE NOTICE 'roomy_brakes_phase2: skip UPDATE existing brake rows — missing column(s) on maintenance_service_categories';
    RETURN;
  END IF;

  -- Keep these four under the Brakes system area (needed for "component rows under Brakes" counts).
  UPDATE public.maintenance_service_categories
  SET parent_id = v_brakes, updated_at = now()
  WHERE id = 'a1000000-0000-4000-8000-00000000000a'::uuid
    AND op_code = 'BRK-PADS'
    AND parent_id IS DISTINCT FROM v_brakes;

  UPDATE public.maintenance_service_categories
  SET parent_id = v_brakes, updated_at = now()
  WHERE id = 'f5a10001-0000-4000-8000-000000000002'::uuid
    AND op_code = 'BRK-SHOES'
    AND parent_id IS DISTINCT FROM v_brakes;

  UPDATE public.maintenance_service_categories
  SET parent_id = v_brakes, updated_at = now()
  WHERE id = '79a131ec-f1db-480a-9e70-3f0400ae59b3'::uuid
    AND op_code = 'BRK-ROTOR'
    AND parent_id IS DISTINCT FROM v_brakes;

  UPDATE public.maintenance_service_categories
  SET parent_id = v_brakes, updated_at = now()
  WHERE id = 'a1000000-0000-4000-8000-00000000000c'::uuid
    AND op_code = 'BRK-FLUID'
    AND parent_id IS DISTINCT FROM v_brakes;

  -- Match catalog part-type shape (component + part) for these four rows.
  UPDATE public.maintenance_service_categories
  SET
    kind = 'component',
    is_part = true,
    status = 'active',
    part_type_status = 'active',
    updated_at = now()
  WHERE id IN (
    'a1000000-0000-4000-8000-00000000000a'::uuid,
    'f5a10001-0000-4000-8000-000000000002'::uuid,
    '79a131ec-f1db-480a-9e70-3f0400ae59b3'::uuid,
    'a1000000-0000-4000-8000-00000000000c'::uuid
  )
    AND (
      kind IS DISTINCT FROM 'component'
      OR is_part IS DISTINCT FROM true
      OR status IS DISTINCT FROM 'active'
      OR part_type_status IS DISTINCT FROM 'active'
    );

  -- Pads (BRK-PADS)
  UPDATE public.maintenance_service_categories
  SET
    brake_role = 'disc',
    description = 'The pads that squeeze the brake disc to slow the wheel.',
    updated_at = now()
  WHERE id = 'a1000000-0000-4000-8000-00000000000a'::uuid
    AND op_code = 'BRK-PADS';

  -- Shoes / drums → Brake shoes (BRK-SHOES)
  UPDATE public.maintenance_service_categories
  SET
    name = 'Brake shoes',
    plain_name = 'Brake shoes',
    brake_role = 'drum',
    editor_hint = 'Drum brake shoes — the drum itself is its own part type.',
    description = 'The curved linings inside a drum brake that press outward to slow the wheel.',
    updated_at = now()
  WHERE id = 'f5a10001-0000-4000-8000-000000000002'::uuid
    AND parent_id = v_brakes
    AND op_code = 'BRK-SHOES';

  -- Rotor (BRK-ROTOR)
  UPDATE public.maintenance_service_categories
  SET
    position_aware = true,
    position_scheme = 'axle',
    brake_role = 'disc',
    description = 'The metal disc that turns with the wheel; the pads squeeze it.',
    updated_at = now()
  WHERE id = '79a131ec-f1db-480a-9e70-3f0400ae59b3'::uuid
    AND op_code = 'BRK-ROTOR';

  -- Brake fluid (BRK-FLUID; stays under its existing parent / spec fit mode)
  UPDATE public.maintenance_service_categories
  SET
    brake_role = 'system',
    description = 'The fluid that carries the pedal''s pressure to every wheel. Match the DOT rating on the cap.',
    updated_at = now()
  WHERE id = 'a1000000-0000-4000-8000-00000000000c'::uuid
    AND op_code = 'BRK-FLUID';
END $$;;

-- ---------------------------------------------------------------------------
-- (c) Seven new part types under Brakes (skipped when required columns missing)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_brakes uuid := 'b1000000-0000-4000-8000-000000000004'::uuid;
  v_shoes  uuid := 'f5a10001-0000-4000-8000-000000000002'::uuid;
  v_field jsonb;
  v_base integer;
  v_need text[] := ARRAY[
    'code', 'name', 'plain_name', 'parent_id', 'icon_key', 'sort_order', 'op_code', 'position_aware', 'kind',
    'is_part', 'default_fit_mode', 'position_scheme', 'trade_term', 'editor_hint', 'part_type_status',
    'field_schema', 'quick_job_eligible', 'status', 'description', 'brake_role', 'created_at', 'updated_at'
  ];
  v_col text;
  v_ok boolean := true;
BEGIN
  FOREACH v_col IN ARRAY v_need LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'maintenance_service_categories'
        AND c.column_name = v_col
    ) THEN
      v_ok := false;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_ok THEN
    RAISE NOTICE 'roomy_brakes_phase2: skip INSERT new brake part types — missing column(s) on maintenance_service_categories';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = v_brakes) THEN
    RAISE NOTICE 'roomy_brakes_phase2: skip INSERT — Brakes system row % missing', v_brakes;
    RETURN;
  END IF;

  SELECT c.field_schema INTO v_field
  FROM public.maintenance_service_categories c
  WHERE c.id = v_shoes;

  IF v_field IS NULL THEN
    RAISE NOTICE 'roomy_brakes_phase2: skip INSERT — shoes row % missing (cannot copy field_schema)', v_shoes;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(c.sort_order), 0) INTO v_base
  FROM public.maintenance_service_categories c
  WHERE c.parent_id = v_brakes
    AND c.kind = 'component'
    AND c.is_part IS TRUE;

  -- 1. brake_caliper
  INSERT INTO public.maintenance_service_categories (
    id, code, op_code, name, plain_name, parent_id, kind, is_part,
    status, part_type_status, default_fit_mode, position_scheme, position_aware,
    trade_term, description, editor_hint, icon_key, sort_order,
    field_schema, quick_job_eligible, brake_role, created_at, updated_at
  )
  SELECT
    'c1000002-0000-4000-8000-000000000001'::uuid,
    'brake_caliper',
    'BRK-CALIPER',
    'Brake caliper',
    'Brake caliper',
    v_brakes,
    'component',
    true,
    'active',
    'active',
    'specific',
    'axle_left_right',
    true,
    'caliper',
    'The clamp that holds the pads and presses them onto the disc.',
    NULL,
    'disc_full',
    v_base + 1,
    v_field,
    false,
    'disc',
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = 'c1000002-0000-4000-8000-000000000001'::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE code = 'brake_caliper')
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'BRK-CALIPER');

  -- 2. brake_drum
  INSERT INTO public.maintenance_service_categories (
    id, code, op_code, name, plain_name, parent_id, kind, is_part,
    status, part_type_status, default_fit_mode, position_scheme, position_aware,
    trade_term, description, editor_hint, icon_key, sort_order,
    field_schema, quick_job_eligible, brake_role, created_at, updated_at
  )
  SELECT
    'c1000002-0000-4000-8000-000000000002'::uuid,
    'brake_drum',
    'BRK-DRUM',
    'Brake drum',
    'Brake drum',
    v_brakes,
    'component',
    true,
    'active',
    'active',
    'specific',
    'axle',
    true,
    'drum',
    'The round metal drum that turns with the wheel; the shoes press against its inside.',
    NULL,
    'disc_full',
    v_base + 2,
    v_field,
    false,
    'drum',
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = 'c1000002-0000-4000-8000-000000000002'::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE code = 'brake_drum')
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'BRK-DRUM');

  -- 3. brake_wheel_cylinder
  INSERT INTO public.maintenance_service_categories (
    id, code, op_code, name, plain_name, parent_id, kind, is_part,
    status, part_type_status, default_fit_mode, position_scheme, position_aware,
    trade_term, description, editor_hint, icon_key, sort_order,
    field_schema, quick_job_eligible, brake_role, created_at, updated_at
  )
  SELECT
    'c1000002-0000-4000-8000-000000000003'::uuid,
    'brake_wheel_cylinder',
    'BRK-WCYL',
    'Wheel cylinder',
    'Wheel cylinder',
    v_brakes,
    'component',
    true,
    'active',
    'active',
    'specific',
    'axle_left_right',
    true,
    'wheel cylinder',
    'The small piston inside a drum brake that pushes the shoes outward.',
    NULL,
    'disc_full',
    v_base + 3,
    v_field,
    false,
    'drum',
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = 'c1000002-0000-4000-8000-000000000003'::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE code = 'brake_wheel_cylinder')
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'BRK-WCYL');

  -- 4. brake_hose
  INSERT INTO public.maintenance_service_categories (
    id, code, op_code, name, plain_name, parent_id, kind, is_part,
    status, part_type_status, default_fit_mode, position_scheme, position_aware,
    trade_term, description, editor_hint, icon_key, sort_order,
    field_schema, quick_job_eligible, brake_role, created_at, updated_at
  )
  SELECT
    'c1000002-0000-4000-8000-000000000004'::uuid,
    'brake_hose',
    'BRK-HOSE',
    'Brake hose',
    'Brake hose',
    v_brakes,
    'component',
    true,
    'active',
    'active',
    'specific',
    'axle_left_right',
    true,
    'brake hose',
    'The flexible hose that carries brake fluid to each wheel.',
    NULL,
    'straighten',
    v_base + 4,
    v_field,
    false,
    'system',
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = 'c1000002-0000-4000-8000-000000000004'::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE code = 'brake_hose')
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'BRK-HOSE');

  -- 5. brake_master_cylinder
  INSERT INTO public.maintenance_service_categories (
    id, code, op_code, name, plain_name, parent_id, kind, is_part,
    status, part_type_status, default_fit_mode, position_scheme, position_aware,
    trade_term, description, editor_hint, icon_key, sort_order,
    field_schema, quick_job_eligible, brake_role, created_at, updated_at
  )
  SELECT
    'c1000002-0000-4000-8000-000000000005'::uuid,
    'brake_master_cylinder',
    'BRK-MCYL',
    'Master cylinder',
    'Master cylinder',
    v_brakes,
    'component',
    true,
    'active',
    'active',
    'specific',
    'none',
    false,
    'master cylinder',
    'The pump the brake pedal pushes; it sends fluid to all four wheels.',
    NULL,
    'droplet',
    v_base + 5,
    v_field,
    false,
    'system',
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = 'c1000002-0000-4000-8000-000000000005'::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE code = 'brake_master_cylinder')
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'BRK-MCYL');

  -- 6. handbrake_cable
  INSERT INTO public.maintenance_service_categories (
    id, code, op_code, name, plain_name, parent_id, kind, is_part,
    status, part_type_status, default_fit_mode, position_scheme, position_aware,
    trade_term, description, editor_hint, icon_key, sort_order,
    field_schema, quick_job_eligible, brake_role, created_at, updated_at
  )
  SELECT
    'c1000002-0000-4000-8000-000000000006'::uuid,
    'handbrake_cable',
    'BRK-HBCABLE',
    'Handbrake cable',
    'Handbrake cable',
    v_brakes,
    'component',
    true,
    'active',
    'active',
    'specific',
    'axle_left_right',
    true,
    'handbrake cable',
    'The cable from the handbrake lever to the rear brakes.',
    NULL,
    'belt',
    v_base + 6,
    v_field,
    false,
    'rear_axle',
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = 'c1000002-0000-4000-8000-000000000006'::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE code = 'handbrake_cable')
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'BRK-HBCABLE');

  -- 7. abs_wheel_sensor
  INSERT INTO public.maintenance_service_categories (
    id, code, op_code, name, plain_name, parent_id, kind, is_part,
    status, part_type_status, default_fit_mode, position_scheme, position_aware,
    trade_term, description, editor_hint, icon_key, sort_order,
    field_schema, quick_job_eligible, brake_role, created_at, updated_at
  )
  SELECT
    'c1000002-0000-4000-8000-000000000007'::uuid,
    'abs_wheel_sensor',
    'BRK-ABS',
    'ABS wheel sensor',
    'ABS wheel sensor',
    v_brakes,
    'component',
    true,
    'active',
    'active',
    'specific',
    'axle_left_right',
    true,
    'wheel speed sensor',
    'The sensor at each wheel that tells the ABS how fast the wheel is turning.',
    NULL,
    'bolt',
    v_base + 7,
    v_field,
    false,
    'system',
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = 'c1000002-0000-4000-8000-000000000007'::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE code = 'abs_wheel_sensor')
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'BRK-ABS');
END $$;;
