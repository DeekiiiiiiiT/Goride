-- Part pictures D7 checks (docs/part-pictures-audit.md §2 D7). Local test copy only; nothing is kept.
--
-- Every check writes one row: check_name, ok. The file ends by raising if any row is false, so a failing
-- check turns the CI replay red. Fixtures use made-up numbers (99999-Z000*) and codes (PPCHK-*), never a
-- real part number.
BEGIN;

CREATE TEMP TABLE _part_pictures_checks (
  check_name text PRIMARY KEY,
  ok boolean NOT NULL
);

-- ---------------------------------------------------------------------------
-- Schema, grants and seed
-- ---------------------------------------------------------------------------
INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'four_tables_exist_rls', (
  (SELECT count(*)::int FROM pg_tables t
   WHERE (t.schemaname, t.tablename) IN (
     ('public', 'part_picture'),
     ('public', 'part_picture_version'),
     ('public', 'part_picture_diagram'),
     ('public', 'part_picture_template')
   )
   AND t.rowsecurity) = 4
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'worker_lock_has_rls', (
  SELECT t.rowsecurity FROM pg_tables t
  WHERE t.schemaname = 'public' AND t.tablename = 'part_picture_worker_lock'
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'worker_lock_single_row', (
  SELECT count(*) = 1 AND bool_and(id = 1)
  FROM public.part_picture_worker_lock
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'no_anon_authenticated_grants', NOT EXISTS (
  SELECT 1
  FROM information_schema.role_table_grants g
  WHERE g.grantee IN ('anon', 'authenticated')
    AND g.table_schema = 'public'
    AND g.table_name IN (
      'part_picture', 'part_picture_version', 'part_picture_diagram',
      'part_picture_template', 'part_picture_worker_lock'
    )
    AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'group_unique_constraint_exists', EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'part_picture'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) = 'UNIQUE (interchange_group_id)'
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'template_seed_covers_every_part_group', (
  SELECT count(*) FROM public.part_picture_template
) = (
  SELECT count(*)
  FROM public.maintenance_service_categories g
  WHERE g.kind = 'system'
    AND g.parent_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_service_categories c
      WHERE c.parent_id = g.id
        AND c.is_part
        AND c.part_type_status = 'active'
    )
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'template_covers_only_part_groups', NOT EXISTS (
  SELECT 1
  FROM public.part_picture_template t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.maintenance_service_categories c
    WHERE c.parent_id = t.catalog_group_id
      AND c.is_part
      AND c.part_type_status = 'active'
  )
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'template_fluids_and_tyres_off', (
  SELECT count(*) = 2
  FROM public.part_picture_template t
  JOIN public.maintenance_service_categories g ON g.id = t.catalog_group_id
  WHERE g.name IN ('Fluids', 'Tires & wheels')
    AND t.enabled = false
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'template_other_groups_on_with_materials', (
  SELECT count(*)
  FROM public.part_picture_template t
  JOIN public.maintenance_service_categories g ON g.id = t.catalog_group_id
  WHERE g.name NOT IN ('Fluids', 'Tires & wheels')
    AND t.enabled = true
    AND length(btrim(t.materials)) > 0
) = (
  SELECT count(*)
  FROM public.part_picture_template t
  JOIN public.maintenance_service_categories g ON g.id = t.catalog_group_id
  WHERE g.name NOT IN ('Fluids', 'Tires & wheels')
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'settings_row_defaults', (
  SELECT
    (value ->> 'ai_part_pictures')::boolean IS FALSE
    AND value ->> 'part_picture_model' = 'gemini-3.1-flash-image'
    AND (value ->> 'max_attempts')::int = 3
    AND (value ->> 'daily_max')::int = 50
    AND (value ->> 'retention_days')::int = 30
  FROM public.kv_store_37f42386
  WHERE key = 'part_pictures:settings'
);

INSERT INTO _part_pictures_checks (check_name, ok)
SELECT 'settings_row_single', (
  SELECT count(*) = 1
  FROM public.kv_store_37f42386
  WHERE key = 'part_pictures:settings'
);

-- ---------------------------------------------------------------------------
-- D1 table rules, becomes-ready, claim, sweep, requeue, cleanup, part_master untouched
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cat uuid;
  v_grp uuid;
  v_grp2 uuid;
  v_grp3 uuid;
  v_grp4 uuid;
  v_grp5 uuid;
  v_grp6 uuid;
  v_grp7 uuid;
  v_grp8 uuid;
  v_grp9 uuid;
  v_pic uuid;
  v_pic_leased uuid;
  v_pic_due uuid;
  v_pic2 uuid;
  v_dup_blocked boolean := false;
  v_ready_no_file_blocked boolean := false;
  v_bad_status_blocked boolean := false;
  v_missing_picture_blocked boolean := false;
  v_version_dup_blocked boolean := false;
  v_one_current boolean := false;
  v_two_current boolean := false;
  v_after_v2_one_current boolean := false;
  v_claim_skipped_leased boolean := false;
  v_claim_took_due boolean := false;
  v_claim_left_leased boolean := false;
  v_sweep_ok boolean := false;
  v_give_back_ok boolean := false;
  v_cand_old_versions int := 0;
  v_cand_kept int := 0;
  v_cand_stale_diagram int := 0;
  v_cand_fresh_diagram int := 0;
  v_cand_deleted_diagram int := 0;
  v_part_master_untouched boolean := false;
  v_cascade_ok boolean := false;
  v_current int;
BEGIN
  INSERT INTO public.part_category (slug, label)
  VALUES ('pp-check-category', 'PP check category')
  RETURNING id INTO v_cat;

  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('PPCHK-0001', 'universal') RETURNING id INTO v_grp;
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('PPCHK-0002', 'universal') RETURNING id INTO v_grp2;
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('PPCHK-0003', 'universal') RETURNING id INTO v_grp3;
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('PPCHK-0004', 'universal') RETURNING id INTO v_grp4;
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('PPCHK-0005', 'universal') RETURNING id INTO v_grp5;
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('PPCHK-0006', 'universal') RETURNING id INTO v_grp6;
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('PPCHK-0007', 'universal') RETURNING id INTO v_grp7;
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('PPCHK-0008', 'universal') RETURNING id INTO v_grp8;
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('PPCHK-0009', 'universal') RETURNING id INTO v_grp9;

  -- A real part row for the group, so "a picture never touches part_master" can be proved on a real row.
  INSERT INTO public.part_master (
    category_id, name, oem_part_number, manufacturer, interchange_group_id
  ) VALUES (
    v_cat, 'PP check part', '99999-Z0001', 'PPCHK', v_grp
  );

  -- Unique interchange group: the first row is accepted, the second must be refused.
  INSERT INTO public.part_picture (interchange_group_id, manufacturer, part_number, part_name, status)
  VALUES (v_grp, 'PPCHK', '99999-Z0001', 'PP check part', 'queued')
  RETURNING id INTO v_pic;

  BEGIN
    INSERT INTO public.part_picture (interchange_group_id, manufacturer, part_number, part_name, status)
    VALUES (v_grp, 'PPCHK', '99999-Z0002', 'PP check part two', 'queued');
  EXCEPTION WHEN unique_violation THEN
    v_dup_blocked := true;
  END;

  INSERT INTO _part_pictures_checks (check_name, ok) VALUES ('interchange_group_unique', v_dup_blocked);

  -- ready needs a file and a made time.
  BEGIN
    INSERT INTO public.part_picture (interchange_group_id, manufacturer, part_number, part_name, status)
    VALUES (v_grp2, 'PPCHK', '99999-Z0003', 'PP check ready no file', 'ready');
  EXCEPTION WHEN check_violation THEN
    v_ready_no_file_blocked := true;
  END;

  INSERT INTO _part_pictures_checks (check_name, ok) VALUES ('ready_requires_file', v_ready_no_file_blocked);

  -- Unknown status refused.
  BEGIN
    INSERT INTO public.part_picture (interchange_group_id, manufacturer, part_number, part_name, status)
    VALUES (v_grp3, 'PPCHK', '99999-Z0004', 'PP check bad status', 'done');
  EXCEPTION WHEN check_violation THEN
    v_bad_status_blocked := true;
  END;

  INSERT INTO _part_pictures_checks (check_name, ok) VALUES ('status_rejects_unknown', v_bad_status_blocked);

  -- becomes ready: one current version, and the picture carries the file.
  PERFORM public.part_picture_become_ready(
    v_pic, 1, 'catalogue/parts/' || v_pic::text || '/v1.jpg', 0.04, 'gemini-3.1-flash-image', 1, 'pp check prompt'
  );

  SELECT count(*)::int INTO v_current
  FROM public.part_picture_version
  WHERE picture_id = v_pic AND retired_at IS NULL;

  v_one_current := v_current = 1 AND (
    SELECT status = 'ready' AND r2_key IS NOT NULL AND made_at IS NOT NULL AND version = 1
    FROM public.part_picture WHERE id = v_pic
  );

  INSERT INTO _part_pictures_checks (check_name, ok) VALUES ('become_ready_one_current_version', v_one_current);

  -- A second version retires the first: still exactly one current version.
  PERFORM public.part_picture_become_ready(
    v_pic, 2, 'catalogue/parts/' || v_pic::text || '/v2.jpg', 0.04, 'gemini-3.1-flash-image', 1, 'pp check prompt 2'
  );

  SELECT count(*)::int INTO v_current
  FROM public.part_picture_version
  WHERE picture_id = v_pic AND retired_at IS NULL;

  v_after_v2_one_current := v_current = 1 AND (
    SELECT version = 2 FROM public.part_picture WHERE id = v_pic
  ) AND EXISTS (
    SELECT 1 FROM public.part_picture_version
    WHERE picture_id = v_pic AND version = 1 AND retired_at IS NOT NULL
  );

  INSERT INTO _part_pictures_checks (check_name, ok)
  VALUES ('become_ready_retires_previous', v_after_v2_one_current);

  -- Becomes ready on a picture that isn't there must raise, not silently do nothing.
  BEGIN
    PERFORM public.part_picture_become_ready(
      gen_random_uuid(), 1, 'catalogue/parts/missing/v1.jpg', 0.04, 'gemini-3.1-flash-image', 1, 'x'
    );
  EXCEPTION WHEN raise_exception THEN
    v_missing_picture_blocked := true;
  END;

  INSERT INTO _part_pictures_checks (check_name, ok)
  VALUES ('become_ready_missing_picture_raises', v_missing_picture_blocked);

  -- part_master.image_url and photo_verified stay empty after a picture is made (PP-07).
  v_part_master_untouched := (
    SELECT pm.image_url IS NULL AND pm.photo_verified IS FALSE
    FROM public.part_master pm
    WHERE pm.interchange_group_id = v_grp AND pm.oem_part_number = '99999-Z0001'
  );

  INSERT INTO _part_pictures_checks (check_name, ok)
  VALUES ('part_master_image_columns_stay_empty', coalesce(v_part_master_untouched, false));

  -- Claim: a queued row still leased by a live run is skipped; a due row is taken and becomes 'making'.
  INSERT INTO public.part_picture (
    interchange_group_id, manufacturer, part_number, part_name, status, next_attempt_at, lease_until
  ) VALUES (
    v_grp4, 'PPCHK', '99999-Z0005', 'PP check leased', 'queued', now() - interval '1 minute', now() + interval '10 minutes'
  ) RETURNING id INTO v_pic_leased;

  INSERT INTO public.part_picture (
    interchange_group_id, manufacturer, part_number, part_name, status, next_attempt_at
  ) VALUES (
    v_grp5, 'PPCHK', '99999-Z0006', 'PP check due', 'queued', now() - interval '1 minute'
  ) RETURNING id INTO v_pic_due;

  SELECT count(*)::int INTO v_current
  FROM public.part_picture_claim(50) c
  WHERE c.id = v_pic_leased;

  v_claim_skipped_leased := v_current = 0;

  v_claim_took_due := (
    SELECT status = 'making' AND lease_until > now()
    FROM public.part_picture WHERE id = v_pic_due
  );

  v_claim_left_leased := (
    SELECT status = 'queued' AND lease_until > now()
    FROM public.part_picture WHERE id = v_pic_leased
  );

  INSERT INTO _part_pictures_checks (check_name, ok) VALUES
    ('claim_skips_leased_row', v_claim_skipped_leased),
    ('claim_takes_due_row', coalesce(v_claim_took_due, false)),
    ('claim_leaves_leased_row_queued', coalesce(v_claim_left_leased, false));

  -- Sweep: a 'making' row whose lease died goes back to 'queued' and keeps its attempts.
  INSERT INTO public.part_picture (
    interchange_group_id, manufacturer, part_number, part_name, status, attempts, lease_until
  ) VALUES (
    v_grp6, 'PPCHK', '99999-Z0007', 'PP check stuck', 'making', 2, now() - interval '5 minutes'
  ) RETURNING id INTO v_pic;

  PERFORM public.part_picture_sweep_stuck();

  v_sweep_ok := (
    SELECT status = 'queued' AND attempts = 2
    FROM public.part_picture WHERE id = v_pic
  );

  INSERT INTO _part_pictures_checks (check_name, ok) VALUES ('sweep_stuck_requeues_making', v_sweep_ok);

  -- Requeue giving back an attempt never goes below zero.
  INSERT INTO public.part_picture (
    interchange_group_id, manufacturer, part_number, part_name, status, attempts
  ) VALUES (
    v_grp7, 'PPCHK', '99999-Z0008', 'PP check give back', 'making', 0
  ) RETURNING id INTO v_pic;

  PERFORM public.part_picture_requeue_give_back_attempt(v_pic, now() + interval '1 hour');
  PERFORM public.part_picture_requeue_give_back_attempt(v_pic, now() + interval '1 hour');

  v_give_back_ok := (
    SELECT attempts = 0 AND status = 'queued'
    FROM public.part_picture WHERE id = v_pic
  );

  INSERT INTO _part_pictures_checks (check_name, ok)
  VALUES ('requeue_give_back_never_below_zero', v_give_back_ok);

  -- Cleanup keeps the current version and the newest retired one; old versions and stale diagrams are reported.
  INSERT INTO public.part_picture (
    interchange_group_id, manufacturer, part_number, part_name, status, version, r2_key, made_at
  ) VALUES (
    v_grp8, 'PPCHK', '99999-Z0009', 'PP check cleanup', 'ready', 4,
    'catalogue/parts/pp-check/v4.jpg', now()
  ) RETURNING id INTO v_pic2;

  INSERT INTO public.part_picture_version (picture_id, version, r2_key, retired_at) VALUES
    (v_pic2, 1, 'catalogue/parts/pp-check/v1.jpg', now() - interval '40 days'),
    (v_pic2, 2, 'catalogue/parts/pp-check/v2.jpg', now() - interval '35 days'),
    (v_pic2, 3, 'catalogue/parts/pp-check/v3.jpg', now() - interval '5 days'),
    (v_pic2, 4, 'catalogue/parts/pp-check/v4.jpg', NULL);

  BEGIN
    INSERT INTO public.part_picture_version (picture_id, version, r2_key)
    VALUES (v_pic2, 4, 'catalogue/parts/pp-check/v4-again.jpg');
  EXCEPTION WHEN unique_violation THEN
    v_version_dup_blocked := true;
  END;

  SELECT count(*)::int INTO v_cand_old_versions
  FROM public.part_picture_cleanup_candidates(30, 100) c
  WHERE c.picture_id = v_pic2 AND c.kind = 'version' AND c.version IN (1, 2);

  SELECT count(*)::int INTO v_cand_kept
  FROM public.part_picture_cleanup_candidates(30, 100) c
  WHERE c.picture_id = v_pic2 AND c.version IN (3, 4);

  INSERT INTO public.part_picture_diagram (picture_id, r2_key, delete_after)
  VALUES
    (v_pic2, 'part-diagrams/pp-check/stale.jpg', now() - interval '1 day'),
    (v_pic2, 'part-diagrams/pp-check/fresh.jpg', now() + interval '29 days'),
    (v_pic2, 'part-diagrams/pp-check/gone.jpg', now() - interval '1 day');

  UPDATE public.part_picture_diagram
  SET deleted_at = now()
  WHERE r2_key = 'part-diagrams/pp-check/gone.jpg';

  SELECT count(*)::int INTO v_cand_stale_diagram
  FROM public.part_picture_cleanup_candidates(30, 100) c
  WHERE c.picture_id = v_pic2 AND c.kind = 'diagram' AND c.r2_key = 'part-diagrams/pp-check/stale.jpg';

  SELECT count(*)::int INTO v_cand_fresh_diagram
  FROM public.part_picture_cleanup_candidates(30, 100) c
  WHERE c.picture_id = v_pic2 AND c.kind = 'diagram' AND c.r2_key = 'part-diagrams/pp-check/fresh.jpg';

  SELECT count(*)::int INTO v_cand_deleted_diagram
  FROM public.part_picture_cleanup_candidates(30, 100) c
  WHERE c.picture_id = v_pic2 AND c.kind = 'diagram' AND c.r2_key = 'part-diagrams/pp-check/gone.jpg';

  INSERT INTO _part_pictures_checks (check_name, ok) VALUES
    ('version_unique_per_picture', v_version_dup_blocked),
    ('cleanup_keeps_current_and_newest_retired', v_cand_old_versions = 2 AND v_cand_kept = 0),
    ('cleanup_reports_stale_diagram', v_cand_stale_diagram = 1),
    ('cleanup_skips_fresh_diagram', v_cand_fresh_diagram = 0),
    ('cleanup_skips_deleted_diagram', v_cand_deleted_diagram = 0);

  -- A part picture belongs to its group: deleting the group (an undone import) takes the picture with it.
  INSERT INTO public.part_picture (interchange_group_id, manufacturer, part_number, part_name, status)
  VALUES (v_grp9, 'PPCHK', '99999-Z0010', 'PP check cascade', 'queued')
  RETURNING id INTO v_pic;

  DELETE FROM public.part_interchange_group WHERE id = v_grp9;

  v_cascade_ok := NOT EXISTS (SELECT 1 FROM public.part_picture WHERE id = v_pic);

  INSERT INTO _part_pictures_checks (check_name, ok)
  VALUES ('group_delete_cascades_picture', v_cascade_ok);
END $$;

-- ---------------------------------------------------------------------------
-- Server-only access: the service role can read; anon and authenticated cannot
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_service_ok boolean := false;
  v_anon_denied boolean := false;
  v_auth_denied boolean := false;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM 1 FROM public.part_picture LIMIT 1;
    v_service_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_service_ok := false;
  END;
  RESET ROLE;

  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM 1 FROM public.part_picture LIMIT 1;
    v_anon_denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    v_anon_denied := true;
  END;
  RESET ROLE;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM 1 FROM public.part_picture LIMIT 1;
    v_auth_denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    v_auth_denied := true;
  END;
  RESET ROLE;

  INSERT INTO _part_pictures_checks (check_name, ok) VALUES
    ('service_role_can_read', v_service_ok),
    ('anon_cannot_read', v_anon_denied),
    ('authenticated_cannot_read', v_auth_denied);
END $$;

SELECT check_name, ok FROM _part_pictures_checks ORDER BY check_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _part_pictures_checks WHERE NOT ok) THEN
    RAISE EXCEPTION 'part_pictures_checks failed: %',
      (SELECT string_agg(check_name, ', ' ORDER BY check_name)
       FROM _part_pictures_checks WHERE NOT ok);
  END IF;
END $$;

ROLLBACK;
