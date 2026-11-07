-- Phase 2 read-only checks: roomy brakes part types (RB-07).
-- One row per check: check_name, pass, detail

WITH
  brakes_area AS (
    SELECT 'b1000000-0000-4000-8000-000000000004'::uuid AS id
  ),
  brake_role_column AS (
    SELECT
      'brake_role_column'::text AS check_name,
      EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_schema = tc.constraint_schema
         AND ccu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'maintenance_service_categories'
          AND tc.constraint_type = 'CHECK'
          AND ccu.column_name = 'brake_role'
      )
      AND EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'maintenance_service_categories'
          AND c.conname = 'maintenance_service_categories_brake_role_check'
      ) AS pass,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'maintenance_service_categories'
            AND column_name = 'brake_role'
        )
        THEN 'Column brake_role exists; CHECK maintenance_service_categories_brake_role_check expected.'
        ELSE 'Column brake_role missing on maintenance_service_categories.'
      END AS detail
  ),
  eleven_brake_types AS (
    SELECT
      'eleven_brake_types'::text AS check_name,
      (
        SELECT COUNT(*) = 11
        FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id
          AND c.kind = 'component'
          AND c.is_part IS TRUE
          AND COALESCE(c.status, 'active') = 'active'
      ) AS pass,
      (
        SELECT COALESCE(
          string_agg(c.code, ', ' ORDER BY c.sort_order, c.code),
          '(no rows)'
        )
        FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id
          AND c.kind = 'component'
          AND c.is_part IS TRUE
          AND COALESCE(c.status, 'active') = 'active'
      ) AS detail
  ),
  roles_set AS (
    SELECT
      'roles_set'::text AS check_name,
      NOT EXISTS (
        SELECT 1
        FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id
          AND c.kind = 'component'
          AND c.is_part IS TRUE
          AND COALESCE(c.status, 'active') = 'active'
          AND c.brake_role IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id
          AND c.is_part IS TRUE
          AND c.op_code = 'BRK-PADS'
          AND c.brake_role IS DISTINCT FROM 'disc'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-ROTOR' AND c.brake_role IS DISTINCT FROM 'disc'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-CALIPER' AND c.brake_role IS DISTINCT FROM 'disc'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-SHOES' AND c.brake_role IS DISTINCT FROM 'drum'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-DRUM' AND c.brake_role IS DISTINCT FROM 'drum'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-WCYL' AND c.brake_role IS DISTINCT FROM 'drum'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-HBCABLE' AND c.brake_role IS DISTINCT FROM 'rear_axle'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-FLUID' AND c.brake_role IS DISTINCT FROM 'system'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-MCYL' AND c.brake_role IS DISTINCT FROM 'system'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-HOSE' AND c.brake_role IS DISTINCT FROM 'system'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id AND c.is_part IS TRUE AND c.op_code = 'BRK-ABS' AND c.brake_role IS DISTINCT FROM 'system'
      ) AS pass,
      'Expected brake_role: pads/rotor/caliper=disc; shoes/drum/wheel cylinder=drum; handbrake cable=rear_axle; fluid/master cylinder/hose/ABS=system.' AS detail
  ),
  rotor_positions AS (
    SELECT
      'rotor_positions'::text AS check_name,
      EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        WHERE c.id = '79a131ec-f1db-480a-9e70-3f0400ae59b3'::uuid
          AND c.position_aware IS TRUE
      ) AS pass,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.maintenance_service_categories c
          WHERE c.id = '79a131ec-f1db-480a-9e70-3f0400ae59b3'::uuid
        )
        THEN 'brake_rotor position_aware must be true.'
        ELSE 'Row 79a131ec… (brake_rotor) not found.'
      END AS detail
  ),
  shoes_renamed AS (
    SELECT
      'shoes_renamed'::text AS check_name,
      EXISTS (
        SELECT 1 FROM public.maintenance_service_categories c
        WHERE c.id = 'f5a10001-0000-4000-8000-000000000002'::uuid
          AND c.name = 'Brake shoes'
          AND c.plain_name = 'Brake shoes'
      ) AS pass,
      'f5a10001… name and plain_name must be Brake shoes.' AS detail
  ),
  left_right_types AS (
    SELECT
      'left_right_types'::text AS check_name,
      (
        SELECT COUNT(*) = 5
        FROM public.maintenance_service_categories c
        CROSS JOIN brakes_area b
        WHERE c.parent_id = b.id
          AND c.is_part IS TRUE
          AND c.op_code IN ('BRK-CALIPER', 'BRK-WCYL', 'BRK-HOSE', 'BRK-HBCABLE', 'BRK-ABS')
          AND c.position_scheme = 'axle_left_right'
      ) AS pass,
      'CALIPER, WCYL, HOSE, HBCABLE, ABS must use position_scheme axle_left_right.' AS detail
  ),
  op_codes_unique AS (
    SELECT
      'op_codes_unique'::text AS check_name,
      NOT EXISTS (
        SELECT 1
        FROM (
          SELECT upper(btrim(op_code)) AS k
          FROM public.maintenance_service_categories
          WHERE op_code IS NOT NULL AND btrim(op_code) <> ''
          GROUP BY upper(btrim(op_code))
          HAVING COUNT(*) > 1
        ) dup_op
      )
      AND NOT EXISTS (
        SELECT 1
        FROM (
          SELECT code AS k
          FROM public.maintenance_service_categories
          GROUP BY code
          HAVING COUNT(*) > 1
        ) dup_code
      ) AS pass,
      'code and op_code must be unique across maintenance_service_categories (case-insensitive op_code).'::text AS detail
  ),
  existing_parts_untouched AS (
    SELECT
      'existing_parts_untouched'::text AS check_name,
      (
        to_regclass('public.part_master') IS NOT NULL
        AND (SELECT COUNT(*) FROM public.part_master WHERE maintenance_component_id = 'a1000000-0000-4000-8000-00000000000a'::uuid) = 7
        AND (SELECT COUNT(*) FROM public.part_master WHERE maintenance_component_id = 'f5a10001-0000-4000-8000-000000000002'::uuid) = 2
        AND COALESCE(
          (
            SELECT COUNT(*)::bigint FROM public.part_master pm
            JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
            WHERE c.op_code = 'ENG-OIL' AND c.kind = 'component' AND c.is_part IS TRUE
          ),
          0
        ) = 2
      ) AS pass,
      'part_master: 7 rows on pads type (…00000a / BRK-PADS), 2 on shoes (…00002 / BRK-SHOES), 2 on ENG-OIL oil filter component type.'::text AS detail
  )
SELECT check_name, pass, detail FROM brake_role_column
UNION ALL SELECT check_name, pass, detail FROM eleven_brake_types
UNION ALL SELECT check_name, pass, detail FROM roles_set
UNION ALL SELECT check_name, pass, detail FROM rotor_positions
UNION ALL SELECT check_name, pass, detail FROM shoes_renamed
UNION ALL SELECT check_name, pass, detail FROM left_right_types
UNION ALL SELECT check_name, pass, detail FROM op_codes_unique
UNION ALL SELECT check_name, pass, detail FROM existing_parts_untouched
ORDER BY check_name;
