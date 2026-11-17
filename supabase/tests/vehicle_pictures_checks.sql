-- Vehicle pictures C1 checks (local test copy only). Each row: check_name, ok.
BEGIN;

CREATE TEMP TABLE _vehicle_pictures_checks (
  check_name text PRIMARY KEY,
  ok boolean NOT NULL
);

INSERT INTO _vehicle_pictures_checks (check_name, ok)
SELECT 'tables_exist_rls', (
  (SELECT count(*)::int FROM pg_tables t
   WHERE (t.schemaname, t.tablename) IN (
     ('public', 'vehicle_picture'),
     ('public', 'vehicle_picture_version'),
     ('public', 'vehicle_picture_worker_lock'),
     ('fleet', 'vehicle_document_check')
   )
   AND t.rowsecurity) = 4
);

INSERT INTO _vehicle_pictures_checks (check_name, ok)
SELECT 't23_no_anon_authenticated_grants', NOT EXISTS (
  SELECT 1
  FROM information_schema.role_table_grants g
  WHERE g.grantee IN ('anon', 'authenticated')
    AND (
      (g.table_schema = 'public' AND g.table_name IN (
        'vehicle_picture', 'vehicle_picture_version', 'vehicle_picture_worker_lock'
      ))
      OR (g.table_schema = 'fleet' AND g.table_name = 'vehicle_document_check')
    )
    AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
);

INSERT INTO _vehicle_pictures_checks (check_name, ok)
SELECT 'partial_unique_live_look_uidx', EXISTS (
  SELECT 1
  FROM pg_indexes i
  JOIN pg_class c ON c.relname = i.indexname
  JOIN pg_index ix ON ix.indexrelid = c.oid
  WHERE i.schemaname = 'public'
    AND i.tablename = 'vehicle_picture'
    AND i.indexname = 'vehicle_picture_live_look_uidx'
    AND ix.indisunique
    AND ix.indpred IS NOT NULL
);

INSERT INTO _vehicle_pictures_checks (check_name, ok)
SELECT 'worker_lock_single_row', (
  SELECT count(*) = 1 AND bool_and(id = 1)
  FROM public.vehicle_picture_worker_lock
);

INSERT INTO _vehicle_pictures_checks (check_name, ok)
SELECT 'cron_jobs_exist', (
  SELECT count(*) = 2
  FROM cron.job j
  WHERE j.jobname IN ('vehicle-picture-worker', 'vehicle-picture-fill')
);

INSERT INTO _vehicle_pictures_checks (check_name, ok)
SELECT 'fleet_vehicles_view_picture_columns', (
  SELECT count(*) = 2
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'fleet_vehicles'
    AND c.column_name IN ('color_standard', 'picture_id')
);

DO $$
DECLARE
  v_pic uuid;
  v_pic2 uuid;
  v_veh text := 'VPCHK999';
  v_org text := 'vp-check-org-0001';
  v_dup_blocked boolean := false;
  v_resurrect_ok boolean := false;
  v_restore_ok boolean := false;
  v_other_rejected boolean := false;
  v_grey_cap_rejected boolean := false;
  v_grey_ok boolean := false;
  v_null_ok boolean := false;
  v_cascade_ok boolean := false;
  v_chk uuid;
BEGIN
  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status, next_attempt_at
  ) VALUES (
    'vp-check|toyota|roomy|1st gen|hatchback|standard|white',
    'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'white', 'queued', now()
  )
  RETURNING id INTO v_pic;

  BEGIN
    INSERT INTO public.vehicle_picture (
      look_key, make, model, generation, body_type, facelift_stage, color, status
    ) VALUES (
      'vp-check|toyota|roomy|1st gen|hatchback|standard|white',
      'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'white', 'queued'
    );
  EXCEPTION WHEN unique_violation THEN
    v_dup_blocked := true;
  END;

  UPDATE public.vehicle_picture SET deleted_at = now() WHERE id = v_pic;

  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status
  ) VALUES (
    'vp-check|toyota|roomy|1st gen|hatchback|standard|white',
    'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'white', 'queued'
  )
  RETURNING id INTO v_pic2;

  v_resurrect_ok := v_dup_blocked AND v_pic2 IS NOT NULL;

  UPDATE public.vehicle_picture
  SET source = 'restore', status = 'ready'
  WHERE id = v_pic2;
  v_restore_ok := (SELECT source = 'restore' FROM public.vehicle_picture WHERE id = v_pic2);

  INSERT INTO fleet.vehicles (
    id, organization_id, license_plate, legacy_kv_id, make, model, year, status
  ) VALUES (
    v_veh, v_org, v_veh, 'vp-check-legacy-kv', 'Toyota', 'Roomy', 2019, 'active'
  )
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id;

  BEGIN
    UPDATE fleet.vehicles SET color_standard = 'other' WHERE id = v_veh;
  EXCEPTION WHEN check_violation THEN
    v_other_rejected := true;
  END;

  BEGIN
    UPDATE fleet.vehicles SET color_standard = 'Grey' WHERE id = v_veh;
  EXCEPTION WHEN check_violation THEN
    v_grey_cap_rejected := true;
  END;

  UPDATE fleet.vehicles SET color_standard = 'grey' WHERE id = v_veh;
  v_grey_ok := (SELECT color_standard = 'grey' FROM fleet.vehicles WHERE id = v_veh);

  UPDATE fleet.vehicles SET color_standard = NULL WHERE id = v_veh;
  v_null_ok := (SELECT color_standard IS NULL FROM fleet.vehicles WHERE id = v_veh);

  INSERT INTO fleet.vehicle_document_check (
    organization_id, vehicle_id, doc_type, file_sha256, fields_json, reader_provider, reader_model
  ) VALUES (
    v_org, v_veh, 'fitness', repeat('a', 64), '{}'::jsonb, 'openai', 'gpt-4o'
  )
  RETURNING id INTO v_chk;

  DELETE FROM fleet.vehicles WHERE id = v_veh;
  v_cascade_ok := NOT EXISTS (
    SELECT 1 FROM fleet.vehicle_document_check WHERE id = v_chk
  );

  INSERT INTO _vehicle_pictures_checks (check_name, ok) VALUES
    ('look_key_live_unique', v_resurrect_ok),
    ('source_accepts_restore', v_restore_ok),
    ('color_standard_rejects_other', v_other_rejected),
    ('color_standard_rejects_grey_capital', v_grey_cap_rejected),
    ('color_standard_accepts_grey', v_grey_ok),
    ('color_standard_accepts_null', v_null_ok),
    ('vehicle_delete_cascades_document_check', v_cascade_ok);

  DELETE FROM public.vehicle_picture WHERE look_key LIKE 'vp-check|%';
END $$;

DO $$
DECLARE
  v_pic uuid;
  v_attempts int := 3;
  v_sweep_ok boolean := false;
  v_cleanup_ok boolean := false;
  v_url_ok boolean := false;
  v_base text := 'http://host.docker.internal:54321/functions/v1';
  v_path text := 'fleet-core/internal/vehicle-pictures/run';
  v_expected text;
  v_u uuid := '11111111-1111-4111-8111-111111111111';
  v_counts record;
  v_ready uuid;
  v_live uuid;
  v_removed uuid;
  v_cand_live int;
  v_cand_removed int;
  v_counts_ready bigint;
  v_counts_stale bigint;
  v_stale_a uuid;
  v_stale_b uuid;
BEGIN
  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status,
    attempts, lease_until
  ) VALUES (
    'vp-check-sweep|toyota|roomy|1st gen|hatchback|standard|white',
    'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'white', 'generating',
    v_attempts, now() - interval '5 minutes'
  )
  RETURNING id INTO v_pic;

  PERFORM private.vehicle_picture_sweep_stuck();

  v_sweep_ok := (
    SELECT status = 'queued' AND attempts = v_attempts
    FROM public.vehicle_picture
    WHERE id = v_pic
  );

  INSERT INTO public.kv_store_37f42386 (key, value)
  VALUES ('vehicle_pictures:settings', '{"vehicle_picture_retention_days": 0}'::jsonb)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status
  ) VALUES (
    'vp-check-cleanup|toyota|roomy|1st gen|hatchback|standard|blue',
    'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'blue', 'ready'
  )
  RETURNING id INTO v_pic;

  INSERT INTO public.vehicle_picture_version (
    picture_id, version, r2_key, source, retired_at
  ) VALUES (
    v_pic, 1, 'catalogue/images/test/v1.png', 'ai', now() - interval '1 day'
  );

  v_cleanup_ok := private.vehicle_picture_cleanup_due();

  INSERT INTO private.fleet_ops_secrets (name, value)
  VALUES ('functions_base_url', v_base)
  ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  v_expected := rtrim(v_base, '/') || '/' || ltrim(v_path, '/');
  v_url_ok := private.vehicle_picture_functions_url(v_path) = v_expected;

  INSERT INTO _vehicle_pictures_checks (check_name, ok) VALUES
    ('sweep_stuck_requeues_generating', v_sweep_ok),
    ('cleanup_due_retention_zero', v_cleanup_ok),
    ('functions_url_uses_base_secret', v_url_ok);

  IF to_regclass('fleet.vehicle_document_read_log') IS NOT NULL
     AND to_regprocedure('fleet.vehicle_document_read_counts(uuid,text)') IS NOT NULL THEN
    DELETE FROM fleet.vehicle_document_read_log WHERE organization_id = 'vp-readcount-org';
    INSERT INTO fleet.vehicle_document_read_log (organization_id, user_id, read_at)
    VALUES
      ('vp-readcount-org', v_u, timestamptz '2026-11-16 04:30:00+00'),
      ('vp-readcount-org', v_u, now() - interval '30 minutes');
    SELECT * INTO v_counts FROM fleet.vehicle_document_read_counts(v_u, 'vp-readcount-org');
    INSERT INTO _vehicle_pictures_checks (check_name, ok)
    VALUES
      ('read_counts_user_hour', v_counts.user_hour_count >= 1),
      ('read_counts_org_day', v_counts.org_day_count >= 1);
    DELETE FROM fleet.vehicle_document_read_log WHERE organization_id = 'vp-readcount-org';
  END IF;

  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status, version
  ) VALUES (
    'vp-check-ready|toyota|roomy|1st gen|hatchback|standard|white',
    'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'white', 'generating', 1
   )
  RETURNING id INTO v_ready;

  PERFORM public.vehicle_picture_become_ready(
    v_ready,
    1,
    'catalogue/images/' || v_ready::text || '/v1.png',
    0.04,
    'gemini',
    'gemini-3.1-flash-image',
    1,
    'test prompt',
    'ai'
  );

  INSERT INTO _vehicle_pictures_checks (check_name, ok)
  SELECT 'become_ready_writes_version', EXISTS (
    SELECT 1 FROM public.vehicle_picture_version vv
    WHERE vv.picture_id = v_ready AND vv.version = 1 AND vv.retired_at IS NULL
  );

  INSERT INTO _vehicle_pictures_checks (check_name, ok)
  SELECT 'become_ready_picture_ready', (
    SELECT status = 'ready' AND r2_key IS NOT NULL FROM public.vehicle_picture WHERE id = v_ready
  );

  INSERT INTO auth.users (id, email)
  SELECT v_u, 'vp-check-made-by@example.test'
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_u);

  PERFORM public.vehicle_picture_become_ready(
    v_ready,
    2,
    'catalogue/images/' || v_ready::text || '/v2.png',
    0.04,
    'staff',
    'upload',
    1,
    'staff prompt',
    'staff_upload',
    v_u
  );

  INSERT INTO _vehicle_pictures_checks (check_name, ok)
  SELECT 'become_ready_sets_made_by', (
    SELECT made_by = v_u FROM public.vehicle_picture WHERE id = v_ready
  );

  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status, version
  ) VALUES (
    'vp-check-giveback|toyota|roomy|1st gen|hatchback|standard|silver',
    'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'silver', 'queued', 1
  )
  RETURNING id INTO v_pic;

  UPDATE public.vehicle_picture SET attempts = 0 WHERE id = v_pic;
  PERFORM public.vehicle_picture_requeue_give_back_attempt(v_pic, now() + interval '1 hour');
  PERFORM public.vehicle_picture_requeue_give_back_attempt(v_pic, now() + interval '1 hour');

  INSERT INTO _vehicle_pictures_checks (check_name, ok)
  SELECT 'requeue_give_back_never_below_zero', (
    SELECT attempts = 0 FROM public.vehicle_picture WHERE id = v_pic
  );

  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status, version
  ) VALUES (
    'vp-check-cand-live|toyota|roomy|1st gen|hatchback|standard|black',
    'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'black', 'ready', 4
  )
  RETURNING id INTO v_live;

  INSERT INTO public.vehicle_picture_version (picture_id, version, r2_key, source, retired_at)
  VALUES
    (v_live, 1, 'catalogue/images/cand/v1.png', 'ai', now() - interval '40 days'),
    (v_live, 2, 'catalogue/images/cand/v2.png', 'ai', now() - interval '35 days'),
    (v_live, 3, 'catalogue/images/cand/v3.png', 'ai', now() - interval '5 days'),
    (v_live, 4, 'catalogue/images/cand/v4.png', 'ai', NULL);

  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status, version, deleted_at
  ) VALUES (
    'vp-check-cand-removed|toyota|roomy|1st gen|hatchback|standard|red',
    'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'red', 'failed', 2,
    now() - interval '40 days'
  )
  RETURNING id INTO v_removed;

  INSERT INTO public.vehicle_picture_version (picture_id, version, r2_key, source)
  VALUES
    (v_removed, 1, 'catalogue/images/removed/v1.png', 'ai'),
    (v_removed, 2, 'catalogue/images/removed/v2.png', 'ai');

  SELECT count(*)::int INTO v_cand_live
  FROM public.vehicle_picture_cleanup_candidates(30, 100) c
  WHERE c.picture_id = v_live AND c.version IN (1, 2);

  SELECT count(*)::int INTO v_cand_removed
  FROM public.vehicle_picture_cleanup_candidates(30, 100) c
  WHERE c.picture_id = v_removed;

  INSERT INTO _vehicle_pictures_checks (check_name, ok)
  SELECT 'stale_column_exists', EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'vehicle_picture'
      AND c.column_name = 'stale'
  );

  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status, stale
  ) VALUES
    (
      'vp-check-count|toyota|roomy|1st gen|hatchback|standard|white',
      'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'white', 'ready', false
    ),
    (
      'vp-check-count|toyota|roomy|1st gen|hatchback|standard|black',
      'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'black', 'queued', false
    ),
    (
      'vp-check-count|toyota|roomy|1st gen|hatchback|standard|red',
      'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'red', 'failed', true
    );

  SELECT c.ready, c.stale INTO v_counts_ready, v_counts_stale
  FROM public.vehicle_picture_admin_counts() c
  LIMIT 1;

  INSERT INTO _vehicle_pictures_checks (check_name, ok) VALUES
    ('admin_counts_ready_includes_check_row', v_counts_ready >= 1),
    ('admin_counts_stale_includes_check_row', v_counts_stale >= 1);

  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status, stale
  ) VALUES (
    'vp-check-stale|toyota|roomy|1st gen|hatchback|standard|blue',
    'toyota', 'roomy', '1st gen', 'hatchback', 'standard', 'blue', 'ready', false
  )
  RETURNING id INTO v_stale_a;

  INSERT INTO public.vehicle_picture (
    look_key, make, model, generation, body_type, facelift_stage, color, status, stale
  ) VALUES (
    'vp-check-stale|honda|civic|10th gen|sedan|standard|silver',
    'honda', 'civic', '10th gen', 'sedan', 'standard', 'silver', 'ready', false
  )
  RETURNING id INTO v_stale_b;

  PERFORM public.vehicle_picture_set_stale(ARRAY[v_stale_b]);

  INSERT INTO _vehicle_pictures_checks (check_name, ok) VALUES
    ('set_stale_marks_target', (SELECT stale FROM public.vehicle_picture WHERE id = v_stale_b)),
    ('set_stale_clears_others', NOT (SELECT stale FROM public.vehicle_picture WHERE id = v_stale_a));

  INSERT INTO _vehicle_pictures_checks (check_name, ok) VALUES
    ('cleanup_candidates_live_old_versions', v_cand_live = 2),
    ('cleanup_candidates_removed_all_versions', v_cand_removed = 2),
    ('cleanup_candidates_keeps_current_and_newest_retired', NOT EXISTS (
      SELECT 1 FROM public.vehicle_picture_cleanup_candidates(30, 100) c
      WHERE c.picture_id = v_live AND c.version IN (3, 4)
    ));

  DELETE FROM public.vehicle_picture WHERE look_key LIKE 'vp-check-%';
  DELETE FROM public.kv_store_37f42386 WHERE key = 'vehicle_pictures:settings';
END $$;

DO $$
DECLARE
  v_holder uuid := gen_random_uuid();
  v_first boolean;
  v_second boolean;
BEGIN
  UPDATE public.vehicle_picture_worker_lock
  SET holder = NULL, held_until = NULL
  WHERE id = 1;

  v_first := public.vehicle_picture_try_worker_lease(v_holder, now() + interval '3 minutes');
  v_second := public.vehicle_picture_try_worker_lease(gen_random_uuid(), now() + interval '3 minutes');

  INSERT INTO _vehicle_pictures_checks (check_name, ok) VALUES
    ('try_worker_lease_first_true', v_first),
    ('try_worker_lease_second_false', NOT v_second);
END $$;

SELECT check_name, ok FROM _vehicle_pictures_checks ORDER BY check_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _vehicle_pictures_checks WHERE NOT ok) THEN
    RAISE EXCEPTION 'vehicle_pictures_checks failed: %',
      (SELECT string_agg(check_name, ', ' ORDER BY check_name)
       FROM _vehicle_pictures_checks WHERE NOT ok);
  END IF;
END $$;

ROLLBACK;