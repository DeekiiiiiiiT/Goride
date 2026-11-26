-- Roam sorts unknown parts by itself — database checks (docs/part-type-auto-sort-audit.md Rev 3, §4 D1).
-- One transaction, rolled back. Safe on the local copy and in CI's migration replay; nothing is kept.
-- Fixtures use made-up values only: the phrase "EXAMPLE PART, NO.1", a made-up part type ("Example check part")
-- and a made-up synonym word. Never a real part number, a car frame number, a user name or a path from this PC.
BEGIN;

CREATE TEMP TABLE _part_type_auto_sort_checks (
  check_name text PRIMARY KEY,
  ok boolean NOT NULL
);

-- ---------------------------------------------------------------------------
-- D1 schema: part_term_synonym's four columns and their defaults
-- ---------------------------------------------------------------------------
INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'synonym_phrase_key_is_nullable_text', (
  SELECT count(*) = 1
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'part_term_synonym'
    AND column_name = 'phrase_key' AND data_type = 'text' AND is_nullable = 'YES'
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'synonym_added_by_is_owner_not_null', (
  SELECT count(*) = 1
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'part_term_synonym'
    AND column_name = 'added_by' AND data_type = 'text' AND is_nullable = 'NO'
    AND position('owner' IN coalesce(column_default, '')) > 0
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'synonym_added_at_defaults_to_now_not_null', (
  SELECT count(*) = 1
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'part_term_synonym'
    AND column_name = 'added_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO'
    AND position('now()' IN coalesce(column_default, '')) > 0
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'synonym_reason_is_nullable_text', (
  SELECT count(*) = 1
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'part_term_synonym'
    AND column_name = 'reason' AND data_type = 'text' AND is_nullable = 'YES'
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'synonym_added_by_check_values', EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND t.relname = 'part_term_synonym' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%added_by%'
    AND pg_get_constraintdef(c.oid) LIKE '%seed%'
    AND pg_get_constraintdef(c.oid) LIKE '%owner%'
    AND pg_get_constraintdef(c.oid) LIKE '%roam%'
);

-- ---------------------------------------------------------------------------
-- D1 schema: part_type_suggestion_dismissal's set_by and nullable dismissed_by
-- ---------------------------------------------------------------------------
INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'dismissal_set_by_is_owner_not_null', (
  SELECT count(*) = 1
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'part_type_suggestion_dismissal'
    AND column_name = 'set_by' AND data_type = 'text' AND is_nullable = 'NO'
    AND position('owner' IN coalesce(column_default, '')) > 0
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'dismissal_set_by_check_values', EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND t.relname = 'part_type_suggestion_dismissal' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%set_by%'
    AND pg_get_constraintdef(c.oid) LIKE '%owner%'
    AND pg_get_constraintdef(c.oid) LIKE '%roam%'
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'dismissal_dismissed_by_is_nullable', (
  SELECT count(*) = 1
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'part_type_suggestion_dismissal'
    AND column_name = 'dismissed_by' AND is_nullable = 'YES'
);

-- ---------------------------------------------------------------------------
-- D1 index: a partial unique phrase key (NULL keys are not constrained) and the GIN row index
-- ---------------------------------------------------------------------------
INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'phrase_key_partial_unique_index', EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'part_term_synonym'
    AND indexname = 'part_term_synonym_phrase_key_uidx'
    AND indexdef LIKE 'CREATE UNIQUE INDEX%'
    AND indexdef LIKE '%WHERE (phrase_key IS NOT NULL)%'
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'saved_page_rows_gin_index', EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'research_saved_page'
    AND indexname = 'research_saved_page_result_rows_gin'
    AND indexdef LIKE '%USING gin%'
    AND indexdef LIKE '%rows%'
);

-- ---------------------------------------------------------------------------
-- D1 seed rows: the existing synonyms are marked seed, keep no phrase key, and still point at their types
-- ---------------------------------------------------------------------------
INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'seed_rows_backfilled_and_unkeyed', (
  EXISTS (SELECT 1 FROM public.part_term_synonym WHERE added_by = 'seed')
  AND NOT EXISTS (
    SELECT 1 FROM public.part_term_synonym WHERE added_by = 'seed' AND phrase_key IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.part_term_synonym WHERE phrase_key IS NULL AND added_by <> 'seed'
  )
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'seeded_synonyms_untouched', (
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
-- D1 behaviour: defaults, the two check constraints, and the partial unique index
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_type uuid;
  v_group uuid;
  v_added_by text;
  v_phrase_key text;
  v_added_at timestamptz;
  v_set_by text;
  v_dismissed_by uuid;
  v_bad_added_by_blocked boolean := false;
  v_bad_set_by_blocked boolean := false;
  v_dup_blocked boolean := false;
  v_null_keys_ok boolean := false;
BEGIN
  SELECT id INTO v_group
  FROM public.maintenance_service_categories
  WHERE code = 'sys_engine' AND kind = 'system';

  INSERT INTO public.maintenance_service_categories
    (code, name, plain_name, parent_id, kind, op_code, is_part, part_type_status,
     default_action, position_scheme, sort_order)
  VALUES
    ('autocheck_example_type', 'Example check part', 'Example check part', v_group, 'component',
     'AUTOCHECK-EXAMPLE', true, 'active', 'replace', 'none', 900)
  RETURNING id INTO v_type;

  -- A synonym written without added_by takes the post-migration default, 'owner', and gets a time and no key.
  INSERT INTO public.part_term_synonym (term, canonical, maintenance_component_id)
  VALUES ('autocheck default owner word', 'Example check part', v_type)
  RETURNING added_by, phrase_key, added_at INTO v_added_by, v_phrase_key, v_added_at;

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('synonym_defaults_are_owner_now_and_no_key',
    v_added_by = 'owner' AND v_phrase_key IS NULL AND v_added_at IS NOT NULL);

  BEGIN
    INSERT INTO public.part_term_synonym (term, canonical, added_by)
    VALUES ('autocheck bad added_by word', 'Example check part', 'bogus');
  EXCEPTION WHEN check_violation THEN
    v_bad_added_by_blocked := true;
  END;

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('added_by_check_refuses_other_values', v_bad_added_by_blocked);

  -- A dismissal written without set_by or dismissed_by: owner, and no user (proves dismissed_by is nullable).
  INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase)
  VALUES ('AUTOCHECKDEFAULTSETBY', 'Autocheck default set_by')
  RETURNING set_by, dismissed_by INTO v_set_by, v_dismissed_by;

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('dismissal_defaults_owner_and_no_user', v_set_by = 'owner' AND v_dismissed_by IS NULL);

  BEGIN
    INSERT INTO public.part_type_suggestion_dismissal (phrase_key, phrase, set_by)
    VALUES ('AUTOCHECKBADSETBY', 'Autocheck bad set_by', 'bogus');
  EXCEPTION WHEN check_violation THEN
    v_bad_set_by_blocked := true;
  END;

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('set_by_check_refuses_other_values', v_bad_set_by_blocked);

  -- One key, one row.
  INSERT INTO public.part_term_synonym (term, canonical, phrase_key, added_by)
  VALUES ('autocheck phrase one', 'Example check part', 'AUTOCHECKPHRASEONE', 'roam');

  BEGIN
    INSERT INTO public.part_term_synonym (term, canonical, phrase_key, added_by)
    VALUES ('autocheck phrase one again', 'Example check part', 'AUTOCHECKPHRASEONE', 'roam');
  EXCEPTION WHEN unique_violation THEN
    v_dup_blocked := true;
  END;

  -- Many NULL keys stay allowed (the seed rows and these made-up ones).
  INSERT INTO public.part_term_synonym (term, canonical, phrase_key, added_by)
  VALUES
    ('autocheck seed one', 'Example check part', NULL, 'seed'),
    ('autocheck seed two', 'Example check part', NULL, 'seed');

  v_null_keys_ok := (
    SELECT count(*) = 2
    FROM public.part_term_synonym
    WHERE term IN ('autocheck seed one', 'autocheck seed two')
  );

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('phrase_key_unique_where_present', v_dup_blocked);

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('phrase_key_null_is_not_constrained', v_null_keys_ok);
END $$;

-- ---------------------------------------------------------------------------
-- D1 function: track, skip, and G7 (an owner answer is never overwritten by Roam)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_type uuid;
  v_result jsonb;
  v_term text;
  v_canonical text;
  v_component uuid;
  v_added_by text;
  v_reason text;
  v_phrase text;
  v_set_by text;
  v_note text;
  v_dismissed_by uuid;
  v_actor uuid := '00000000-0000-4000-8000-000000000001';
  v_seed_key text;
  v_seed_added_by text;
  v_seed_component uuid;
  v_seed_canonical text;
  v_seed_reason text;
  v_owner_synonym_kept boolean := false;
  v_owner_dismissal_kept boolean := false;
BEGIN
  SELECT id INTO v_type
  FROM public.maintenance_service_categories
  WHERE code = 'autocheck_example_type';

  -- track as Roam
  v_result := public.part_name_answer_set(
    'EXAMPLEPARTNO1', 'Example part no.1', 'track', v_type, 'roam', 'Made up reason', NULL);

  SELECT t.term, t.canonical, t.maintenance_component_id, t.added_by, t.reason
  INTO v_term, v_canonical, v_component, v_added_by, v_reason
  FROM public.part_term_synonym t
  WHERE t.phrase_key = 'EXAMPLEPARTNO1';

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('track_writes_synonym_and_clears_dismissal',
    v_result->>'set' = 'track'
    AND v_term = 'example part no.1'
    AND v_canonical = 'Example check part'
    AND v_component = v_type
    AND v_added_by = 'roam'
    AND v_reason = 'Made up reason'
    AND NOT EXISTS (
      SELECT 1 FROM public.part_type_suggestion_dismissal WHERE phrase_key = 'EXAMPLEPARTNO1'
    ));

  -- skip as Roam: the synonym goes, the dismissal arrives with no user
  v_result := public.part_name_answer_set(
    'EXAMPLEPARTNO1', 'EXAMPLE PART, NO.1', 'skip', NULL, 'roam', 'Made up skip reason', NULL);

  SELECT d.phrase, d.set_by, d.note, d.dismissed_by
  INTO v_phrase, v_set_by, v_note, v_dismissed_by
  FROM public.part_type_suggestion_dismissal d
  WHERE d.phrase_key = 'EXAMPLEPARTNO1';

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('skip_writes_dismissal_and_clears_synonym',
    v_result->>'set' = 'skip'
    AND v_phrase = 'EXAMPLE PART, NO.1'
    AND v_set_by = 'roam'
    AND v_note = 'Made up skip reason'
    AND v_dismissed_by IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.part_term_synonym WHERE phrase_key = 'EXAMPLEPARTNO1'
    ));

  -- the owner tracks (a flip): an owner answer replaces Roam's skip
  v_result := public.part_name_answer_set(
    'EXAMPLEPARTNO1', 'Example part no.1', 'track', v_type, 'owner', 'Owner reason', NULL);

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('owner_track_replaces_roam_skip',
    v_result->>'set' = 'track'
    AND EXISTS (
      SELECT 1 FROM public.part_term_synonym
      WHERE phrase_key = 'EXAMPLEPARTNO1' AND added_by = 'owner'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.part_type_suggestion_dismissal WHERE phrase_key = 'EXAMPLEPARTNO1'
    ));

  -- G7: Roam may not skip an owner's synonym
  v_result := public.part_name_answer_set(
    'EXAMPLEPARTNO1', 'EXAMPLE PART, NO.1', 'skip', NULL, 'roam', 'Roam try', NULL);

  v_owner_synonym_kept := v_result->>'set' = 'owner_wins'
    AND EXISTS (
      SELECT 1 FROM public.part_term_synonym
      WHERE phrase_key = 'EXAMPLEPARTNO1' AND added_by = 'owner'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.part_type_suggestion_dismissal WHERE phrase_key = 'EXAMPLEPARTNO1'
    );

  -- G7: Roam may not track an owner's dismissal
  v_result := public.part_name_answer_set(
    'EXAMPLEPARTNO2', 'EXAMPLE PART, NO.2', 'skip', NULL, 'owner', 'Owner skip', v_actor);
  v_result := public.part_name_answer_set(
    'EXAMPLEPARTNO2', 'Example part no.2', 'track', v_type, 'roam', 'Roam try', NULL);

  v_owner_dismissal_kept := v_result->>'set' = 'owner_wins'
    AND EXISTS (
      SELECT 1 FROM public.part_type_suggestion_dismissal
      WHERE phrase_key = 'EXAMPLEPARTNO2' AND set_by = 'owner'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.part_term_synonym WHERE phrase_key = 'EXAMPLEPARTNO2'
    );

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('owner_synonym_not_overwritten_by_roam', v_owner_synonym_kept);

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('owner_dismissal_not_overwritten_by_roam', v_owner_dismissal_kept);

  -- A starter search word is never lost: track adopts it, skip gives the key back and keeps the word.
  INSERT INTO public.part_term_synonym (term, canonical, maintenance_component_id, added_by)
  VALUES ('autocheck seed word', 'Example check part', v_type, 'seed');

  v_result := public.part_name_answer_set(
    'AUTOCHECKSEEDWORD', 'autocheck seed word', 'track', v_type, 'roam', 'Adopted seed', NULL);

  SELECT t.phrase_key, t.added_by, t.maintenance_component_id, t.canonical, t.reason
  INTO v_seed_key, v_seed_added_by, v_seed_component, v_seed_canonical, v_seed_reason
  FROM public.part_term_synonym t
  WHERE t.term = 'autocheck seed word';

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('track_adopts_a_seed_word_without_relabelling_it',
    v_result->>'set' = 'track'
    AND v_seed_key = 'AUTOCHECKSEEDWORD'
    AND v_seed_added_by = 'seed'
    AND v_seed_component = v_type
    AND v_seed_canonical = 'Example check part'
    AND v_seed_reason = 'Adopted seed');

  v_result := public.part_name_answer_set(
    'AUTOCHECKSEEDWORD', 'AUTOCHECK SEED WORD', 'skip', NULL, 'roam', 'Skip the adopted seed', NULL);

  SELECT t.phrase_key, t.added_by, t.maintenance_component_id, t.reason
  INTO v_seed_key, v_seed_added_by, v_seed_component, v_seed_reason
  FROM public.part_term_synonym t
  WHERE t.term = 'autocheck seed word';

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('skip_keeps_the_seed_word_and_clears_its_key',
    v_result->>'set' = 'skip'
    AND v_seed_key IS NULL
    AND v_seed_added_by = 'seed'
    AND v_seed_component = v_type
    AND v_seed_reason IS NULL);

  -- The owner's skip keeps who set it; a Roam skip never does.
  v_result := public.part_name_answer_set(
    'EXAMPLEPARTNO3', 'EXAMPLE PART, NO.3', 'skip', NULL, 'owner', 'Owner with actor', v_actor);

  SELECT d.set_by, d.dismissed_by
  INTO v_set_by, v_dismissed_by
  FROM public.part_type_suggestion_dismissal d
  WHERE d.phrase_key = 'EXAMPLEPARTNO3';

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('owner_skip_keeps_the_actor',
    v_result->>'set' = 'skip'
    AND v_set_by = 'owner'
    AND v_dismissed_by = v_actor);

  v_result := public.part_name_answer_set(
    'EXAMPLEPARTNO4', 'EXAMPLE PART, NO.4', 'skip', NULL, 'roam', 'Roam with actor', v_actor);

  SELECT d.set_by, d.dismissed_by
  INTO v_set_by, v_dismissed_by
  FROM public.part_type_suggestion_dismissal d
  WHERE d.phrase_key = 'EXAMPLEPARTNO4';

  INSERT INTO _part_type_auto_sort_checks (check_name, ok)
  VALUES ('roam_skip_has_no_actor',
    v_result->>'set' = 'skip'
    AND v_set_by = 'roam'
    AND v_dismissed_by IS NULL);
END $$;

-- The function's properties: SECURITY DEFINER, a pinned search_path, and the service role only.
INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'function_is_security_definer', EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'part_name_answer_set' AND p.prosecdef
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'function_search_path_pinned', EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'part_name_answer_set'
    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg(item) WHERE cfg.item LIKE 'search_path=%')
);

INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'function_service_role_only',
  has_function_privilege('service_role',
    'public.part_name_answer_set(text,text,text,uuid,text,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.part_name_answer_set(text,text,text,uuid,text,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.part_name_answer_set(text,text,text,uuid,text,text,uuid)', 'EXECUTE');

-- ---------------------------------------------------------------------------
-- D1 + G8: no phrase is both a synonym and a dismissal
-- ---------------------------------------------------------------------------
INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'no_phrase_is_both', NOT EXISTS (
  SELECT 1
  FROM public.part_term_synonym s
  JOIN public.part_type_suggestion_dismissal d ON d.phrase_key = s.phrase_key
  WHERE s.phrase_key IS NOT NULL
);

-- ---------------------------------------------------------------------------
-- G4: every part group has a catalogue area (tolerant of a replay that has fewer than 13 groups)
-- ---------------------------------------------------------------------------
INSERT INTO _part_type_auto_sort_checks (check_name, ok)
SELECT 'every_part_group_has_catalogue_area', NOT EXISTS (
  SELECT 1
  FROM public.maintenance_service_categories g
  WHERE g.kind = 'system'
    AND g.is_part
    AND g.parent_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.part_category pc WHERE pc.area_id = g.id
    )
);

-- ---------------------------------------------------------------------------
-- Result
-- ---------------------------------------------------------------------------
SELECT check_name, ok FROM _part_type_auto_sort_checks ORDER BY check_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _part_type_auto_sort_checks WHERE NOT ok) THEN
    RAISE EXCEPTION 'part_type_auto_sort_checks failed: %',
      (SELECT string_agg(check_name, ', ' ORDER BY check_name)
       FROM _part_type_auto_sort_checks WHERE NOT ok);
  END IF;
END $$;

ROLLBACK;
