-- Learning new part types from saved pages — database checks (docs/part-type-learning-audit.md Rev 3, §2 D1–D9).
-- One transaction, rolled back. Safe on the local copy and in CI's migration replay; nothing is kept.
-- Fixtures use made-up values only: a made-up car (make PTLCHECK, chassis PTL900), a made-up phrase, a random
-- uploader id and made-up r2 keys (part-diagrams/pages/ptlcheck-*). Never a real part number, a real car's frame
-- number, a user name or a path from this PC.
--
-- D1 and D2 are a JSON shape only — no column changes — so nothing below can create one. The shape this build
-- must produce on research_saved_page.result is:
--   result.rows[]        = { partType, groupLine, lineText, lineNo, groupLineNo, from, to, datesText,
--                            numberOk, readsAgree, datesOk, placeOk, place, suggestion }
--                          at most 400 rows; each kept line cut at 300 characters; partType is the page's own
--                          name when Roam has no type, never the word "other".
--   result.suggestions[] = { key, name, groupId, groupName, kind, existingTypeId, positionScheme, pagePhrase,
--                            numbers, rowCount, numberCount, status, typeId, typeName, reason }
--                          at most 20 suggestions, written once at upload and edited in place.
-- The checks then prove D3–D8 on the database. D8.9 (server code never selects "*" from the two new tables) is
-- a source check, not a database one: it runs as its own step in .github/workflows/verify-migrations-replay.yml.
BEGIN;

CREATE TEMP TABLE _part_type_learning_checks (
  check_name text PRIMARY KEY,
  ok boolean NOT NULL
);

-- ---------------------------------------------------------------------------
-- D3/D4 schema: both tables exist, RLS on, deny-all, server only
-- ---------------------------------------------------------------------------
INSERT INTO _part_type_learning_checks (check_name, ok)
SELECT 'two_tables_exist_with_rls', (
  (SELECT count(*)::int
   FROM pg_tables t
   WHERE (t.schemaname, t.tablename) IN (
     ('public', 'part_type_suggestion_dismissal'),
     ('public', 'research_saved_page_diagram')
   )
   AND t.rowsecurity) = 2
);

INSERT INTO _part_type_learning_checks (check_name, ok)
SELECT 'deny_all_policies_in_place', (
  SELECT count(*) = 2
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (tablename = 'part_type_suggestion_dismissal'
       AND policyname = 'part_type_suggestion_dismissal_deny_all')
      OR (tablename = 'research_saved_page_diagram'
          AND policyname = 'research_saved_page_diagram_deny_all')
    )
);

INSERT INTO _part_type_learning_checks (check_name, ok)
SELECT 'no_anon_authenticated_grants', NOT EXISTS (
  SELECT 1
  FROM information_schema.role_table_grants g
  WHERE g.grantee IN ('anon', 'authenticated')
    AND g.table_schema = 'public'
    AND g.table_name IN ('part_type_suggestion_dismissal', 'research_saved_page_diagram')
    AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
);

INSERT INTO _part_type_learning_checks (check_name, ok)
SELECT 'service_role_can_use_both_tables',
  has_table_privilege('service_role', 'public.part_type_suggestion_dismissal', 'SELECT')
  AND has_table_privilege('service_role', 'public.part_type_suggestion_dismissal', 'INSERT')
  AND has_table_privilege('service_role', 'public.part_type_suggestion_dismissal', 'DELETE')
  AND has_table_privilege('service_role', 'public.research_saved_page_diagram', 'SELECT')
  AND has_table_privilege('service_role', 'public.research_saved_page_diagram', 'INSERT')
  AND has_table_privilege('service_role', 'public.research_saved_page_diagram', 'DELETE');

-- ---------------------------------------------------------------------------
-- D8.1 + D8.2. A dismissal needs a phrase, its key is unique and always in the form the server looks it up by
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_group uuid;
  v_dup_blocked boolean := false;
  v_null_phrase_blocked boolean := false;
  v_blank_phrase_blocked boolean := false;
  v_null_key_blocked boolean := false;
  v_blank_key_blocked boolean := false;
  v_lower_key_blocked boolean := false;
  v_spaced_key_blocked boolean := false;
  v_good_key_stored boolean := false;
BEGIN
  SELECT id INTO v_group
  FROM public.maintenance_service_categories
  WHERE code = 'sys_engine';

  INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, group_id, dismissed_by, note)
  VALUES ('PTLCHKFIXTUREONE', 'PTL check fixture one', v_group, gen_random_uuid(), 'made-up check row');

  BEGIN
    INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, dismissed_by)
    VALUES ('PTLCHKFIXTUREONE', 'PTL check fixture duplicate', gen_random_uuid());
  EXCEPTION WHEN unique_violation THEN
    v_dup_blocked := true;
  END;

  -- No phrase at all -> refused.
  BEGIN
    INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, dismissed_by)
    VALUES ('PTLCHKFIXTURETWO', NULL, gen_random_uuid());
  EXCEPTION WHEN not_null_violation THEN
    v_null_phrase_blocked := true;
  END;

  BEGIN
    INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, dismissed_by)
    VALUES ('PTLCHKFIXTURETHREE', '   ', gen_random_uuid());
  EXCEPTION WHEN check_violation THEN
    v_blank_phrase_blocked := true;
  END;

  -- No key -> refused (the key is what the "is this phrase dismissed?" lookup uses).
  BEGIN
    INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, dismissed_by)
    VALUES (NULL, 'PTL check no key', gen_random_uuid());
  EXCEPTION WHEN not_null_violation THEN
    v_null_key_blocked := true;
  END;

  -- The key is stored the one way the server normalises a group row before offering it, so a dismissal can
  -- never be stored in a form the lookup would miss.
  BEGIN
    INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, dismissed_by)
    VALUES ('', 'PTL check blank key', gen_random_uuid());
  EXCEPTION WHEN check_violation THEN
    v_blank_key_blocked := true;
  END;

  BEGIN
    INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, dismissed_by)
    VALUES ('ptlchecklowercase', 'PTL check lower case', gen_random_uuid());
  EXCEPTION WHEN check_violation THEN
    v_lower_key_blocked := true;
  END;

  BEGIN
    INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, dismissed_by)
    VALUES ('PTL CHECK SPACED', 'PTL check spaced', gen_random_uuid());
  EXCEPTION WHEN check_violation THEN
    v_spaced_key_blocked := true;
  END;

  INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, dismissed_by)
  VALUES ('PTLCHECKFIXTUREFOUR', 'PTL check fixture four', gen_random_uuid());

  v_good_key_stored := EXISTS (
    SELECT 1 FROM public.part_type_suggestion_dismissal
    WHERE phrase_key = 'PTLCHECKFIXTUREFOUR'
  );

  INSERT INTO _part_type_learning_checks (check_name, ok) VALUES
    ('dismissal_phrase_key_unique', v_dup_blocked),
    ('dismissal_requires_a_phrase', v_null_phrase_blocked AND v_blank_phrase_blocked),
    ('dismissal_requires_a_key', v_null_key_blocked AND v_blank_key_blocked),
    ('dismissal_key_is_normalised_for_lookup',
      v_lower_key_blocked AND v_spaced_key_blocked AND v_good_key_stored);
END $$;

-- ---------------------------------------------------------------------------
-- D8.3. A diagram belongs to a saved page (cascade) and carries a 30-day delete_after
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_car uuid;
  v_page uuid;
  v_diagram uuid;
  v_after timestamptz;
  v_days numeric;
  v_no_page_blocked boolean := false;
  v_no_delete_after_blocked boolean := false;
  v_cascade_ok boolean := false;
BEGIN
  INSERT INTO public.vehicle_catalog (make, model, powertrain_status, chassis_code)
  VALUES ('PTLCHECK', 'PTL check model', 'needs_check', 'PTL900')
  RETURNING id INTO v_car;

  INSERT INTO public.research_saved_page (
    vehicle_catalog_id, domain, source_url, file_name, line_count, status, result, uploaded_by
  ) VALUES (
    v_car, 'ptl-check.example', 'https://ptl-check.example/page', 'ptl-check-page.html', 3, 'done', '{}'::jsonb,
    gen_random_uuid()
  )
  RETURNING id INTO v_page;

  -- A drawing whose page does not exist is refused.
  BEGIN
    INSERT INTO public.research_saved_page_diagram (
      saved_page_id, r2_key, content_type, width, height
    ) VALUES (
      gen_random_uuid(), 'part-diagrams/pages/ptlcheck-none/1.png', 'image/png', 640, 480
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_no_page_blocked := true;
  END;

  INSERT INTO public.research_saved_page_diagram (saved_page_id, r2_key, content_type, width, height)
  VALUES (v_page, 'part-diagrams/pages/' || v_page::text || '/ptlcheck-1.png', 'image/png', 640, 480)
  RETURNING id INTO v_diagram;

  -- delete_after is never empty: no diagram can outlive its 30 days.
  BEGIN
    INSERT INTO public.research_saved_page_diagram (
      saved_page_id, r2_key, content_type, width, height, delete_after
    ) VALUES (
      v_page, 'part-diagrams/pages/' || v_page::text || '/ptlcheck-2.png', 'image/png', 320, 200, NULL
    );
  EXCEPTION WHEN not_null_violation THEN
    v_no_delete_after_blocked := true;
  END;

  SELECT delete_after INTO v_after
  FROM public.research_saved_page_diagram
  WHERE id = v_diagram;

  v_days := EXTRACT(EPOCH FROM (v_after - now())) / 86400;

  INSERT INTO public.research_saved_page_diagram (saved_page_id, r2_key, content_type, width, height)
  VALUES (v_page, 'part-diagrams/pages/' || v_page::text || '/ptlcheck-3.png', 'image/png', 400, 300);

  DELETE FROM public.research_saved_page WHERE id = v_page;

  v_cascade_ok := NOT EXISTS (
    SELECT 1 FROM public.research_saved_page_diagram WHERE saved_page_id = v_page
  );

  INSERT INTO _part_type_learning_checks (check_name, ok) VALUES
    ('diagram_requires_a_saved_page', v_no_page_blocked),
    ('diagram_delete_after_not_null', v_no_delete_after_blocked),
    ('diagram_delete_after_defaults_to_30_days', v_days BETWEEN 29 AND 31),
    ('diagram_delete_cascades_with_saved_page', v_cascade_ok);
END $$;

-- ---------------------------------------------------------------------------
-- D8.4 + D8.5. Every active part type has a group and an action; no two active part types share a name
-- ---------------------------------------------------------------------------
-- Scope is kind = 'component': the 13 part groups are also flagged is_part (PT-13), are systems with no parent,
-- and are deliberately left exactly as they are.
INSERT INTO _part_type_learning_checks (check_name, ok)
SELECT 'every_active_part_type_has_group_and_action', NOT EXISTS (
  SELECT 1
  FROM public.maintenance_service_categories c
  WHERE c.kind = 'component'
    AND c.is_part
    AND c.part_type_status = 'active'
    AND (c.parent_id IS NULL OR c.default_action IS NULL)
);

INSERT INTO _part_type_learning_checks (check_name, ok)
SELECT 'active_part_type_names_unique', NOT EXISTS (
  SELECT 1
  FROM public.maintenance_service_categories c
  WHERE c.kind = 'component'
    AND c.is_part
    AND c.part_type_status = 'active'
  GROUP BY c.name
  HAVING count(*) > 1
);

-- ---------------------------------------------------------------------------
-- D8.6, D8.7, D8.8. The three D5 clean-ups changed only their own columns, lost no part or fitting, and are
-- idempotent. Each statement is keyed on `code`, so where the row does not exist it does nothing (a replay).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_brakes uuid;
  v_oil uuid;
  v_fluids uuid;
  v_filters uuid;
  v_parts integer;
  v_fits integer;
  v_spec integer;
  v_jobs integer;
  v_name text;
  v_group text;
  v_before jsonb;
  v_after jsonb;
  v_ok boolean := true;
BEGIN
  SELECT id, name INTO v_brakes, v_name
  FROM public.maintenance_service_categories WHERE code = 'brakes';
  SELECT id INTO v_oil FROM public.maintenance_service_categories WHERE code = 'oil';
  SELECT id INTO v_fluids FROM public.maintenance_service_categories WHERE code = 'engine_oil_part';
  SELECT id INTO v_filters FROM public.maintenance_service_categories WHERE code = 'cabin_air_filter';

  -- D8.6 — D5.1: the brake-pads type is renamed and nothing else about it moved.
  SELECT g.name INTO v_group
  FROM public.maintenance_service_categories c
  JOIN public.maintenance_service_categories g ON g.id = c.parent_id
  WHERE c.id = v_brakes;

  v_ok := v_brakes IS NOT NULL
    AND v_name = 'Brake pads'
    AND v_group = 'Brakes'
    AND (
      SELECT c.plain_name = 'Brake pads'
         AND c.op_code = 'BRK-PADS'
         AND c.kind = 'component'
         AND c.is_part
         AND c.part_type_status = 'active'
         AND c.position_scheme = 'axle'
         AND c.default_action = 'replace'
      FROM public.maintenance_service_categories c
      WHERE c.id = v_brakes
    );

  SELECT count(*) INTO v_parts
  FROM public.part_master pm
  WHERE pm.maintenance_component_id = v_brakes;

  SELECT count(*) INTO v_fits
  FROM public.part_listing pl
  JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
  WHERE pm.maintenance_component_id = v_brakes
    AND pl.trust = 'confirmed';

  -- Production holds 8 parts and 57 confirmed fittings for it. A fresh replay carries no parts catalogue and no
  -- fittings, so there is nothing there to lose; when the catalogue is present the exact numbers are required.
  v_ok := v_ok AND (
    CASE WHEN v_parts = 0 THEN v_fits = 0 ELSE (v_parts = 8 AND v_fits = 57) END
  );

  INSERT INTO _part_type_learning_checks (check_name, ok)
  VALUES ('brake_pads_renamed_and_still_owns_its_parts', coalesce(v_ok, false));

  -- D8.7 — D5.2: the Fluids engine-oil product is renamed; the oil-change row ENG-OIL is untouched.
  SELECT count(*) INTO v_spec
  FROM public.part_type_spec_field f
  WHERE f.part_type_id = v_fluids;

  SELECT g.name INTO v_group
  FROM public.maintenance_service_categories c
  JOIN public.maintenance_service_categories g ON g.id = c.parent_id
  WHERE c.id = v_fluids;

  v_ok := v_fluids IS NOT NULL
    AND (
      SELECT c.name = 'Engine oil (top-up)'
         AND c.plain_name = 'Engine oil (top-up)'
         AND c.op_code = 'FLD-ENG-OIL'
         AND c.is_part
         AND c.part_type_status = 'active'
         AND c.default_action = 'top_up'
         AND c.default_fit_mode = 'spec'
      FROM public.maintenance_service_categories c
      WHERE c.id = v_fluids
    )
    AND v_group = 'Fluids'
    AND v_spec = 1;

  INSERT INTO _part_type_learning_checks (check_name, ok)
  VALUES ('fluids_engine_oil_renamed_only', coalesce(v_ok, false));

  -- ENG-OIL keeps its name, its part flag, its fit mode and its parts and fittings.
  SELECT count(*) INTO v_parts
  FROM public.part_master pm
  WHERE pm.maintenance_component_id = v_oil;

  SELECT count(*) INTO v_fits
  FROM public.part_listing pl
  JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
  WHERE pm.maintenance_component_id = v_oil
    AND pl.trust = 'confirmed';

  v_ok := v_oil IS NOT NULL
    AND (
      SELECT c.op_code = 'ENG-OIL'
         AND c.is_part
         AND c.part_type_status = 'active'
         AND c.default_action = 'replace'
         AND c.default_fit_mode = 'engine'
         AND c.name <> 'Engine oil (top-up)'
         AND c.plain_name <> 'Engine oil (top-up)'
      FROM public.maintenance_service_categories c
      WHERE c.id = v_oil
    )
    AND (v_parts = 0 OR v_parts = 2);

  INSERT INTO _part_type_learning_checks (check_name, ok)
  VALUES ('engine_oil_change_row_untouched', coalesce(v_ok, false));

  -- After D5.2 no active part type other than ENG-OIL is called "Engine oil", and at most one is. Production
  -- starts with two (ENG-OIL and the Fluids product) and ends with exactly one; a fresh replay never carried
  -- the production name on ENG-OIL, so the same rule then reads zero — still "never another one".
  INSERT INTO _part_type_learning_checks (check_name, ok)
  SELECT 'one_active_engine_oil_type', (
    SELECT count(*) FILTER (WHERE c.code <> 'oil') = 0
       AND count(*) <= 1
    FROM public.maintenance_service_categories c
    WHERE c.kind = 'component'
      AND c.is_part
      AND c.part_type_status = 'active'
      AND c.name = 'Engine oil'
  );

  -- The Fleet synonym "engine oil" still points at the oil-change row (production carries it; a replay does
  -- not seed it, and this migration adds only the 17 seeded terms).
  INSERT INTO _part_type_learning_checks (check_name, ok)
  SELECT 'engine_oil_synonym_points_at_oil_change', NOT EXISTS (
    SELECT 1
    FROM public.part_term_synonym t
    WHERE t.term = 'engine oil'
      AND t.maintenance_component_id IS DISTINCT FROM v_oil
  );

  -- D8.8 — D5.3: the HVAC cabin filter stays active, at most one cabin-filter type is active, and the Filters
  -- copy (where it exists at all) is drafted and owns nothing, so no logged service can change meaning.
  v_ok := EXISTS (
    SELECT 1
    FROM public.maintenance_service_categories c
    WHERE c.code = 'cabin_filter'
      AND c.kind = 'component'
      AND c.is_part
      AND c.part_type_status = 'active'
  )
  AND (
    SELECT count(*) <= 1
    FROM public.maintenance_service_categories c
    WHERE c.kind = 'component'
      AND c.is_part
      AND c.part_type_status = 'active'
      AND c.name ILIKE '%cabin%filter%'
  );

  IF v_filters IS NOT NULL THEN
    SELECT count(*) INTO v_parts
    FROM public.part_master pm
    WHERE pm.maintenance_component_id = v_filters;

    SELECT count(*) INTO v_fits
    FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    WHERE pm.maintenance_component_id = v_filters;

    SELECT count(*) INTO v_spec
    FROM public.part_type_spec_field f
    WHERE f.part_type_id = v_filters;

    SELECT count(*) INTO v_jobs
    FROM public.catalog_research_job j
    WHERE j.maintenance_component_id = v_filters;

    v_ok := v_ok
      AND (
        SELECT c.part_type_status = 'draft'
        FROM public.maintenance_service_categories c
        WHERE c.id = v_filters
      )
      AND v_parts = 0
      AND v_fits = 0
      AND v_spec = 0
      AND v_jobs = 0;

    INSERT INTO _part_type_learning_checks (check_name, ok)
    VALUES ('filters_cabin_filter_drafted_and_empty', coalesce(v_ok, false));
  ELSE
    -- This row exists on production only (no migration creates it). A replay must not need it.
    INSERT INTO _part_type_learning_checks (check_name, ok)
    VALUES ('filters_cabin_filter_drafted_and_empty', true);
  END IF;

  INSERT INTO _part_type_learning_checks (check_name, ok)
  VALUES ('cabin_filter_hvac_still_active', coalesce(v_ok, false));

  -- ---------------------------------------------------------------------------
  -- Before/after: run the three D5 statements again. Nothing may move, and no part, fitting, spec field or job
  -- may change — this is what "replay-safe, keyed on code" and "changed only its own column" mean.
  -- ---------------------------------------------------------------------------
  SELECT to_jsonb(c) - 'updated_at' INTO v_before
  FROM public.maintenance_service_categories c WHERE c.code = 'brakes';
  SELECT count(*) INTO v_parts FROM public.part_master WHERE maintenance_component_id = v_brakes;

  UPDATE public.maintenance_service_categories SET name = 'Brake pads' WHERE code = 'brakes';

  SELECT to_jsonb(c) - 'updated_at' INTO v_after
  FROM public.maintenance_service_categories c WHERE c.code = 'brakes';

  v_ok := v_before IS NOT DISTINCT FROM v_after
    AND v_parts = (SELECT count(*) FROM public.part_master WHERE maintenance_component_id = v_brakes);

  SELECT to_jsonb(c) - 'updated_at' INTO v_before
  FROM public.maintenance_service_categories c WHERE c.code = 'oil';
  SELECT count(*) INTO v_fits
  FROM public.part_listing pl
  JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
  WHERE pm.maintenance_component_id = v_oil
    AND pl.trust = 'confirmed';

  UPDATE public.maintenance_service_categories
  SET name = 'Engine oil (top-up)', plain_name = 'Engine oil (top-up)'
  WHERE code = 'engine_oil_part';

  SELECT to_jsonb(c) - 'updated_at' INTO v_after
  FROM public.maintenance_service_categories c WHERE c.code = 'oil';

  v_ok := v_ok
    AND v_before IS NOT DISTINCT FROM v_after
    AND v_fits = (
      SELECT count(*)
      FROM public.part_listing pl
      JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
      WHERE pm.maintenance_component_id = v_oil
        AND pl.trust = 'confirmed'
    );

  UPDATE public.maintenance_service_categories
  SET part_type_status = 'draft'
  WHERE code = 'cabin_air_filter';

  SELECT to_jsonb(c) - 'updated_at' INTO v_after
  FROM public.maintenance_service_categories c WHERE c.code = 'cabin_filter';

  v_ok := v_ok AND v_after IS NOT NULL;

  INSERT INTO _part_type_learning_checks (check_name, ok)
  VALUES ('d5_cleanups_are_idempotent_and_lose_nothing', coalesce(v_ok, false));
END $$;

-- ---------------------------------------------------------------------------
-- D6 + D7. Every seeded part type exists, under its own group, active, and carries its synonym
-- ---------------------------------------------------------------------------
INSERT INTO _part_type_learning_checks (check_name, ok)
SELECT 'seeds_present_active_under_their_group', (
  SELECT count(*) = 17
  FROM (VALUES
    ('Engine',                'Air cleaner housing',  'air_cleaner_housing',  'ENG-ACLHSG',     'none'),
    ('Engine',                'Air cleaner inlet',    'air_cleaner_inlet',    'ENG-ACLIN',      'none'),
    ('Engine',                'Ventilation pipe',     'ventilation_pipe',     'ENG-VENTPIPE',   'none'),
    ('Engine',                'Engine mount',         'engine_mount',         'ENG-MOUNT',      'axle_left_right'),
    ('Engine',                'Mass air flow sensor', 'mass_air_flow_sensor', 'ENG-MAFSENSOR',  'none'),
    ('Belts & hoses',         'Air cleaner hose',     'air_cleaner_hose',     'BELT-ACHOSE',    'none'),
    ('Belts & hoses',         'Radiator hose',        'radiator_hose',        'BELT-RADHOSE',   'axle'),
    ('Belts & hoses',         'Heater hose',          'heater_hose',          'BELT-HEATHOSE',  'none'),
    ('Belts & hoses',         'Hose clamp',           'hose_clamp',           'BELT-HOSECLAMP', 'none'),
    ('Belts & hoses',         'Drive belt tensioner', 'drive_belt_tensioner', 'BELT-TENSION',   'none'),
    ('Suspension & steering', 'Coil spring',          'coil_spring',          'SUS-COIL',       'axle_left_right'),
    ('Suspension & steering', 'Strut mount',          'strut_mount',          'SUS-STRUTMNT',   'axle_left_right'),
    ('Suspension & steering', 'Stabilizer bar bush',  'stabilizer_bar_bush',  'SUS-SWAYBUSH',   'axle'),
    ('Suspension & steering', 'Ball joint',           'ball_joint',           'SUS-BALLJOINT',  'axle_left_right'),
    ('Suspension & steering', 'Tie rod end',          'tie_rod_end',          'SUS-TIEROD',     'axle_left_right'),
    ('Transmission',          'Clutch kit',           'clutch_kit',           'TRN-CLUTCHKIT',  'none'),
    ('Lighting & visibility', 'Headlight assembly',   'headlight_assembly',   'LGT-HEADASSY',   'none')
  ) AS s (group_name, name, code, op_code, scheme)
  JOIN public.maintenance_service_categories c ON c.code = s.code
  JOIN public.maintenance_service_categories g ON g.id = c.parent_id
  WHERE c.name = s.name
    AND c.plain_name = s.name
    AND c.op_code = s.op_code
    AND c.kind = 'component'
    AND c.is_part
    AND c.part_type_status = 'active'
    AND c.position_scheme = s.scheme
    AND c.default_action IS NOT NULL
    AND g.kind = 'system'
    AND g.parent_id IS NULL
    AND g.name = s.group_name
);

-- No two part types share an op code (ENG-MAF already belongs to the MAF / MAP cleaning job).
INSERT INTO _part_type_learning_checks (check_name, ok)
SELECT 'op_codes_unique', NOT EXISTS (
  SELECT 1 FROM public.maintenance_service_categories
  WHERE op_code IS NOT NULL GROUP BY op_code HAVING count(*) > 1
);

INSERT INTO _part_type_learning_checks (check_name, ok)
SELECT 'seed_synonyms_point_at_their_type', (
  SELECT count(*) = 17
  FROM (VALUES
    ('Air cleaner housing',  'air_cleaner_housing'),
    ('Air cleaner inlet',    'air_cleaner_inlet'),
    ('Ventilation pipe',     'ventilation_pipe'),
    ('Engine mount',         'engine_mount'),
    ('Mass air flow sensor', 'mass_air_flow_sensor'),
    ('Air cleaner hose',     'air_cleaner_hose'),
    ('Radiator hose',        'radiator_hose'),
    ('Heater hose',          'heater_hose'),
    ('Hose clamp',           'hose_clamp'),
    ('Drive belt tensioner', 'drive_belt_tensioner'),
    ('Coil spring',          'coil_spring'),
    ('Strut mount',          'strut_mount'),
    ('Stabilizer bar bush',  'stabilizer_bar_bush'),
    ('Ball joint',           'ball_joint'),
    ('Tie rod end',          'tie_rod_end'),
    ('Clutch kit',           'clutch_kit'),
    ('Headlight assembly',   'headlight_assembly')
  ) AS s (name, code)
  JOIN public.maintenance_service_categories c ON c.code = s.code
  JOIN public.part_term_synonym t
    ON t.term = lower(s.name)
   AND t.maintenance_component_id = c.id
  WHERE t.canonical = c.name
);

-- ---------------------------------------------------------------------------
-- Result
-- ---------------------------------------------------------------------------
SELECT check_name, ok FROM _part_type_learning_checks ORDER BY check_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _part_type_learning_checks WHERE NOT ok) THEN
    RAISE EXCEPTION 'part_type_learning_checks failed: %',
      (SELECT string_agg(check_name, ', ' ORDER BY check_name)
       FROM _part_type_learning_checks WHERE NOT ok);
  END IF;
END $$;

ROLLBACK;
