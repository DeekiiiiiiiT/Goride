-- Fleet inventory kit versions — D-1 + D-2 + D-3 + D-4 proof (made-up data only). Audit §5.1.
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/fleet_inventory_kit_versions_test.sql

BEGIN;

INSERT INTO fleet.inv_item (organization_id, sku, name)
VALUES
  ('TEST-KIT-ORG', 'ZZ-TEST-A', 'ZZ Test Item A'),
  ('TEST-KIT-ORG', 'ZZ-TEST-B', 'ZZ Test Item B')
ON CONFLICT (organization_id, (lower(sku))) DO NOTHING;

INSERT INTO fleet.kit_template (organization_id, code, name)
VALUES ('TEST-KIT-ORG', 'ZZ-TEST-KIT', 'ZZ Test Kit');

INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
SELECT 'TEST-KIT-ORG', kt.id, 1, 'draft'
FROM fleet.kit_template kt
WHERE kt.organization_id = 'TEST-KIT-ORG' AND kt.code = 'ZZ-TEST-KIT';

DO $$
DECLARE
  v_org text := 'TEST-KIT-ORG';
  v_version_id uuid;
  v_item_a uuid;
  v_item_b uuid;
BEGIN
  SELECT ktv.id INTO v_version_id
  FROM fleet.kit_template_version ktv
  JOIN fleet.kit_template kt ON kt.id = ktv.template_id
  WHERE kt.organization_id = v_org AND kt.code = 'ZZ-TEST-KIT'
  LIMIT 1;

  SELECT id INTO v_item_a FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-A';
  SELECT id INTO v_item_b FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-B';

  IF v_version_id IS NULL OR v_item_a IS NULL OR v_item_b IS NULL THEN
    RAISE EXCEPTION 'FAIL: test setup missing version or items';
  END IF;

  INSERT INTO fleet.kit_template_line (
    organization_id, version_id, line_type, item_id, qty_required, required, sort_order
  ) VALUES (v_org, v_version_id, 'item', v_item_a, 1, true, 1);

  BEGIN
    INSERT INTO fleet.kit_template_line (
      organization_id, version_id, line_type, item_id, qty_required, required, sort_order
    ) VALUES (v_org, v_version_id, 'item', v_item_b, 1, true, 1);
    RAISE EXCEPTION 'FAIL: duplicate kit line sort_order was allowed';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

DO $$
DECLARE
  v_org text := 'TEST-KIT-ORG';
  v_item_a uuid;
  v_item_b uuid;
  v_template_id uuid;
  v_prod_template_id uuid;
BEGIN
  SELECT id INTO v_item_a FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-A';
  SELECT id INTO v_item_b FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-B';

  INSERT INTO fleet.inv_asset (organization_id, asset_tag, item_id, serial_number)
  VALUES (v_org, 'ZZ-TEST-AST-1', v_item_a, 'ZZ-TEST-SN-1');

  BEGIN
    INSERT INTO fleet.inv_asset (organization_id, asset_tag, item_id, serial_number)
    VALUES (v_org, 'ZZ-TEST-AST-2', v_item_b, 'ZZ-TEST-SN-1');
    RAISE EXCEPTION 'FAIL: duplicate serial_number was allowed';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT kt.id INTO v_template_id
  FROM fleet.kit_template kt
  WHERE kt.organization_id = v_org AND kt.code = 'ZZ-TEST-KIT';

  BEGIN
    INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
    VALUES (v_org, v_template_id, 2, 'draft');
    RAISE EXCEPTION 'FAIL: second draft kit version was allowed';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO fleet.kit_template (organization_id, code, name)
  VALUES (v_org, 'ZZ-TEST-KIT-PROD', 'ZZ Test Kit Prod')
  RETURNING id INTO v_prod_template_id;

  INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
  VALUES (v_org, v_prod_template_id, 1, 'production');

  BEGIN
    INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
    VALUES (v_org, v_prod_template_id, 2, 'production');
    RAISE EXCEPTION 'FAIL: second production kit version was allowed';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

-- D-3: inv_save_kit_draft (made-up data only)
INSERT INTO fleet.inv_item (organization_id, sku, name)
VALUES ('TEST-KIT-ORG', 'ZZ-TEST-C', 'ZZ Test Item C');

INSERT INTO fleet.inv_item (organization_id, sku, name, archived_at)
VALUES ('TEST-KIT-ORG', 'ZZ-TEST-ARCH', 'ZZ Test Archived', now());

INSERT INTO fleet.inv_item (organization_id, sku, name)
VALUES ('OTHER-KIT-ORG', 'ZZ-TEST-OTHER', 'ZZ Other Fleet Item');

INSERT INTO fleet.kit_template (organization_id, code, name)
VALUES ('TEST-KIT-ORG', 'ZZ-TEST-KIT-DRAFT', 'ZZ Test Kit Draft Save');

INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
SELECT 'TEST-KIT-ORG', kt.id, 1, 'production'
FROM fleet.kit_template kt
WHERE kt.organization_id = 'TEST-KIT-ORG' AND kt.code = 'ZZ-TEST-KIT-DRAFT';

DO $$
DECLARE
  v_org text := 'TEST-KIT-ORG';
  v_template_id uuid;
  v_item_a uuid;
  v_item_b uuid;
  v_item_c uuid;
  v_other_item uuid;
  v_archived_item uuid;
  v_draft_id uuid;
  v_draft_count integer;
  v_line_count integer;
  v_lines_before integer;
  v_drafts_before integer;
  v_sorts integer[];
  v_item_ids uuid[];
BEGIN
  SELECT kt.id INTO v_template_id
  FROM fleet.kit_template kt
  WHERE kt.organization_id = v_org AND kt.code = 'ZZ-TEST-KIT-DRAFT';

  SELECT id INTO v_item_a FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-A';
  SELECT id INTO v_item_b FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-B';
  SELECT id INTO v_item_c FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-C';
  SELECT id INTO v_other_item FROM fleet.inv_item WHERE organization_id = 'OTHER-KIT-ORG' AND sku = 'ZZ-TEST-OTHER';
  SELECT id INTO v_archived_item FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-ARCH';

  IF v_template_id IS NULL OR v_item_a IS NULL OR v_item_b IS NULL OR v_item_c IS NULL
     OR v_other_item IS NULL OR v_archived_item IS NULL THEN
    RAISE EXCEPTION 'FAIL: D-3 test setup missing template or items';
  END IF;

  PERFORM fleet.inv_save_kit_draft(
    v_org,
    v_template_id,
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_a, 'qty', 1),
      jsonb_build_object('item_id', v_item_b, 'qty', 2)
    ),
    'first save',
    NULL
  );

  PERFORM fleet.inv_save_kit_draft(
    v_org,
    v_template_id,
    jsonb_build_array(
      jsonb_build_object('item_id', v_item_a, 'qty', 1),
      jsonb_build_object('item_id', v_item_b, 'qty', 1),
      jsonb_build_object('item_id', v_item_c, 'qty', 3)
    ),
    'second save',
    NULL
  );

  SELECT count(*) INTO v_draft_count
  FROM fleet.kit_template_version
  WHERE template_id = v_template_id AND status = 'draft';

  IF v_draft_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: save twice expected one draft, got %', v_draft_count;
  END IF;

  SELECT id INTO v_draft_id
  FROM fleet.kit_template_version
  WHERE template_id = v_template_id AND status = 'draft';

  SELECT count(*) INTO v_line_count
  FROM fleet.kit_template_line
  WHERE version_id = v_draft_id;

  IF v_line_count <> 3 THEN
    RAISE EXCEPTION 'FAIL: second save expected 3 lines, got %', v_line_count;
  END IF;

  SELECT array_agg(sort_order ORDER BY sort_order),
         array_agg(item_id ORDER BY sort_order)
  INTO v_sorts, v_item_ids
  FROM fleet.kit_template_line
  WHERE version_id = v_draft_id;

  IF v_sorts IS DISTINCT FROM ARRAY[1, 2, 3]
     OR v_item_ids IS DISTINCT FROM ARRAY[v_item_a, v_item_b, v_item_c] THEN
    RAISE EXCEPTION 'FAIL: draft lines not saved as sort_order 1..n in payload order';
  END IF;

  SELECT count(*) INTO v_drafts_before
  FROM fleet.kit_template_version
  WHERE template_id = v_template_id AND status = 'draft';

  SELECT count(*) INTO v_lines_before
  FROM fleet.kit_template_line
  WHERE version_id = v_draft_id;

  BEGIN
    PERFORM fleet.inv_save_kit_draft(v_org, v_template_id, '[]'::jsonb, 'empty', NULL);
    RAISE EXCEPTION 'FAIL: empty kit draft lines was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%non-empty%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_draft_count
  FROM fleet.kit_template_version
  WHERE template_id = v_template_id AND status = 'draft';

  SELECT count(*) INTO v_line_count
  FROM fleet.kit_template_line
  WHERE version_id = v_draft_id;

  IF v_draft_count <> v_drafts_before OR v_line_count <> v_lines_before THEN
    RAISE EXCEPTION 'FAIL: empty list changed draft or lines';
  END IF;

  BEGIN
    PERFORM fleet.inv_save_kit_draft(
      v_org,
      v_template_id,
      jsonb_build_array(jsonb_build_object('line_type', 'bogus', 'qty', 1)),
      'bad type',
      NULL
    );
    RAISE EXCEPTION 'FAIL: invalid line type was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invalid kit line type%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_line_count FROM fleet.kit_template_line WHERE version_id = v_draft_id;
  IF v_line_count <> v_lines_before THEN
    RAISE EXCEPTION 'FAIL: invalid line type changed lines';
  END IF;

  BEGIN
    PERFORM fleet.inv_save_kit_draft(
      v_org,
      v_template_id,
      jsonb_build_array(jsonb_build_object('item_id', v_other_item, 'qty', 1)),
      'wrong org item',
      NULL
    );
    RAISE EXCEPTION 'FAIL: item from another fleet was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%another fleet%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_line_count FROM fleet.kit_template_line WHERE version_id = v_draft_id;
  IF v_line_count <> v_lines_before THEN
    RAISE EXCEPTION 'FAIL: wrong-org item changed lines';
  END IF;

  BEGIN
    PERFORM fleet.inv_save_kit_draft(
      v_org,
      v_template_id,
      jsonb_build_array(jsonb_build_object('item_id', v_archived_item, 'qty', 1)),
      'archived item',
      NULL
    );
    RAISE EXCEPTION 'FAIL: archived item was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%archived item%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_line_count FROM fleet.kit_template_line WHERE version_id = v_draft_id;
  IF v_line_count <> v_lines_before THEN
    RAISE EXCEPTION 'FAIL: archived item changed lines';
  END IF;

  BEGIN
    PERFORM fleet.inv_save_kit_draft(
      v_org,
      v_template_id,
      jsonb_build_array(
        jsonb_build_object('line_type', 'linked_toll_tag', 'item_id', v_item_a, 'qty', 1)
      ),
      'linked with item',
      NULL
    );
    RAISE EXCEPTION 'FAIL: linked line with item_id was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%linked kit line must not include item_id%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_line_count FROM fleet.kit_template_line WHERE version_id = v_draft_id;
  IF v_line_count <> v_lines_before THEN
    RAISE EXCEPTION 'FAIL: linked line with item_id changed lines';
  END IF;

  BEGIN
    PERFORM fleet.inv_save_kit_draft(
      v_org,
      v_template_id,
      jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 0)),
      'zero qty',
      NULL
    );
    RAISE EXCEPTION 'FAIL: zero qty was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%qty must be positive%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_line_count FROM fleet.kit_template_line WHERE version_id = v_draft_id;
  IF v_line_count <> v_lines_before THEN
    RAISE EXCEPTION 'FAIL: zero qty changed lines';
  END IF;

  BEGIN
    PERFORM fleet.inv_save_kit_draft(
      v_org,
      v_template_id,
      jsonb_build_array(
        jsonb_build_object('item_id', v_item_a, 'qty', 1),
        jsonb_build_object('item_id', v_item_a, 'qty', 2)
      ),
      'duplicate item',
      NULL
    );
    RAISE EXCEPTION 'FAIL: duplicate item_id was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%duplicate item%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_line_count FROM fleet.kit_template_line WHERE version_id = v_draft_id;
  IF v_line_count <> v_lines_before THEN
    RAISE EXCEPTION 'FAIL: duplicate item changed lines';
  END IF;
END $$;

-- D-4: inv_save_kit_draft carry-over fixes
DO $$
DECLARE
  v_org text := 'TEST-KIT-ORG';
  v_template_id uuid;
  v_item_a uuid;
  v_draft_id uuid;
  v_lines_before integer;
  v_line_count integer;
  v_result jsonb;
  v_version_from_json integer;
  v_version_from_row integer;
  v_install text;
  v_note text;
BEGIN
  SELECT kt.id INTO v_template_id
  FROM fleet.kit_template kt
  WHERE kt.organization_id = v_org AND kt.code = 'ZZ-TEST-KIT-DRAFT';

  SELECT id INTO v_item_a FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-A';

  SELECT id INTO v_draft_id
  FROM fleet.kit_template_version
  WHERE template_id = v_template_id AND status = 'draft';

  SELECT count(*) INTO v_lines_before FROM fleet.kit_template_line WHERE version_id = v_draft_id;

  BEGIN
    PERFORM fleet.inv_save_kit_draft(
      v_org,
      v_template_id,
      jsonb_build_array(
        jsonb_build_object('line_type', 'linked_toll_tag', 'qty', 1),
        jsonb_build_object('line_type', 'linked_toll_tag', 'qty', 1)
      ),
      'dup linked',
      NULL
    );
    RAISE EXCEPTION 'FAIL: duplicate linked line type was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%duplicate line%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_line_count FROM fleet.kit_template_line WHERE version_id = v_draft_id;
  IF v_line_count <> v_lines_before THEN
    RAISE EXCEPTION 'FAIL: duplicate linked line changed lines';
  END IF;

  v_result := fleet.inv_save_kit_draft(
    v_org,
    v_template_id,
    jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item_a,
        'qty', 1,
        'install_position', 'dash',
        'variant_note', 'wide mount'
      )
    ),
    'position note save',
    NULL
  );

  SELECT id INTO v_draft_id
  FROM fleet.kit_template_version
  WHERE template_id = v_template_id AND status = 'draft';

  SELECT install_position, variant_note
  INTO v_install, v_note
  FROM fleet.kit_template_line
  WHERE version_id = v_draft_id
  LIMIT 1;

  IF v_install IS DISTINCT FROM 'dash' OR v_note IS DISTINCT FROM 'wide mount' THEN
    RAISE EXCEPTION 'FAIL: install_position or variant_note not saved (%, %)', v_install, v_note;
  END IF;

  v_version_from_json := (v_result->>'version')::integer;

  SELECT version INTO v_version_from_row
  FROM fleet.kit_template_version
  WHERE id = (v_result->>'version_id')::uuid;

  IF v_version_from_json IS NULL OR v_version_from_row IS NULL
     OR v_version_from_json <> v_version_from_row THEN
    RAISE EXCEPTION 'FAIL: save draft did not return version number (json %, row %)',
      v_version_from_json, v_version_from_row;
  END IF;
END $$;

-- D-4: inv_publish_kit_version (made-up data only)
INSERT INTO fleet.kit_template (organization_id, code, name)
VALUES ('TEST-KIT-ORG', 'ZZ-TEST-KIT-PUBLISH-NOMOVE', 'ZZ Publish No Move');

INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
SELECT 'TEST-KIT-ORG', kt.id, 1, 'production'
FROM fleet.kit_template kt
WHERE kt.organization_id = 'TEST-KIT-ORG' AND kt.code = 'ZZ-TEST-KIT-PUBLISH-NOMOVE';

DO $$
DECLARE
  v_org text := 'TEST-KIT-ORG';
  v_template_id uuid;
  v_prod_version_id uuid;
  v_draft_version_id uuid;
  v_item_a uuid;
  v_result jsonb;
  v_vk_old uuid;
  v_vk_new uuid;
  v_old_status text;
  v_check integer;
BEGIN
  SELECT kt.id INTO v_template_id
  FROM fleet.kit_template kt
  WHERE kt.organization_id = v_org AND kt.code = 'ZZ-TEST-KIT-PUBLISH-NOMOVE';

  SELECT id INTO v_item_a FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-A';

  SELECT ktv.id INTO v_prod_version_id
  FROM fleet.kit_template_version ktv
  WHERE ktv.template_id = v_template_id AND ktv.status = 'production';

  INSERT INTO fleet.kit_template_line (
    organization_id, version_id, line_type, item_id, qty_required, required, sort_order
  ) VALUES (v_org, v_prod_version_id, 'item', v_item_a, 1, true, 1);

  INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id)
  VALUES
    ('TEST-001', v_org, 'TEST-001', 'zz-test-kit-vk-001'),
    ('TEST-002', v_org, 'TEST-002', 'zz-test-kit-vk-002')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO fleet.vehicle_kit (organization_id, vehicle_id, template_id, version_id)
  VALUES
    (v_org, 'TEST-001', v_template_id, v_prod_version_id),
    (v_org, 'TEST-002', v_template_id, v_prod_version_id)
  ON CONFLICT (organization_id, vehicle_id) DO UPDATE
  SET template_id = EXCLUDED.template_id,
      version_id = EXCLUDED.version_id,
      updated_at = now();

  v_result := fleet.inv_save_kit_draft(
    v_org,
    v_template_id,
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1)),
    'draft for publish',
    NULL
  );

  v_draft_version_id := (v_result->>'version_id')::uuid;
  v_vk_old := v_prod_version_id;

  v_result := fleet.inv_publish_kit_version(
    v_org, v_template_id, v_draft_version_id, false, NULL
  );

  IF (v_result->>'vehicles_moved')::integer <> 0
     OR (v_result->>'vehicles_on_template')::integer <> 2 THEN
    RAISE EXCEPTION 'FAIL: publish no-move counts (moved %, on %)',
      v_result->>'vehicles_moved', v_result->>'vehicles_on_template';
  END IF;

  SELECT status INTO v_old_status
  FROM fleet.kit_template_version
  WHERE id = v_vk_old;

  IF v_old_status <> 'archived' THEN
    RAISE EXCEPTION 'FAIL: old production not archived (status %)', v_old_status;
  END IF;

  SELECT count(*) INTO v_check
  FROM fleet.kit_template_version
  WHERE id = v_draft_version_id AND status = 'production' AND published_at IS NOT NULL;

  IF v_check <> 1 THEN
    RAISE EXCEPTION 'FAIL: draft not promoted to production with published_at';
  END IF;

  SELECT version_id INTO v_vk_new FROM fleet.vehicle_kit
  WHERE organization_id = v_org AND vehicle_id = 'TEST-001';

  IF v_vk_new IS DISTINCT FROM v_vk_old THEN
    RAISE EXCEPTION 'FAIL: vehicles moved when p_move_vehicles false';
  END IF;

  BEGIN
    PERFORM fleet.inv_publish_kit_version(v_org, v_template_id, v_draft_version_id, false, NULL);
    RAISE EXCEPTION 'FAIL: publish production version was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%version is not a draft%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM fleet.inv_publish_kit_version(v_org, v_template_id, v_vk_old, false, NULL);
    RAISE EXCEPTION 'FAIL: publish archived version was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%version is not a draft%' THEN
      RAISE;
    END IF;
  END;
END $$;

INSERT INTO fleet.kit_template (organization_id, code, name)
VALUES ('TEST-KIT-ORG', 'ZZ-TEST-KIT-PUBLISH-MOVE', 'ZZ Publish Move');

INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
SELECT 'TEST-KIT-ORG', kt.id, 1, 'production'
FROM fleet.kit_template kt
WHERE kt.organization_id = 'TEST-KIT-ORG' AND kt.code = 'ZZ-TEST-KIT-PUBLISH-MOVE';

DO $$
DECLARE
  v_org text := 'TEST-KIT-ORG';
  v_template_id uuid;
  v_prod_version_id uuid;
  v_draft_version_id uuid;
  v_item_b uuid;
  v_result jsonb;
  v_vk1 uuid;
  v_vk2 uuid;
BEGIN
  SELECT kt.id INTO v_template_id
  FROM fleet.kit_template kt
  WHERE kt.organization_id = v_org AND kt.code = 'ZZ-TEST-KIT-PUBLISH-MOVE';

  SELECT id INTO v_item_b FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-B';

  SELECT ktv.id INTO v_prod_version_id
  FROM fleet.kit_template_version ktv
  WHERE ktv.template_id = v_template_id AND ktv.status = 'production';

  INSERT INTO fleet.kit_template_line (
    organization_id, version_id, line_type, item_id, qty_required, required, sort_order
  ) VALUES (v_org, v_prod_version_id, 'item', v_item_b, 1, true, 1);

  INSERT INTO fleet.vehicle_kit (organization_id, vehicle_id, template_id, version_id)
  VALUES
    (v_org, 'TEST-001', v_template_id, v_prod_version_id),
    (v_org, 'TEST-002', v_template_id, v_prod_version_id)
  ON CONFLICT (organization_id, vehicle_id) DO UPDATE
  SET template_id = EXCLUDED.template_id,
      version_id = EXCLUDED.version_id,
      updated_at = now();

  v_result := fleet.inv_save_kit_draft(
    v_org,
    v_template_id,
    jsonb_build_array(jsonb_build_object('item_id', v_item_b, 'qty', 2)),
    'draft move test',
    NULL
  );

  v_draft_version_id := (v_result->>'version_id')::uuid;

  v_result := fleet.inv_publish_kit_version(
    v_org, v_template_id, v_draft_version_id, true, NULL
  );

  IF (v_result->>'vehicles_moved')::integer <> 2 THEN
    RAISE EXCEPTION 'FAIL: publish move expected 2 vehicles_moved, got %', v_result->>'vehicles_moved';
  END IF;

  SELECT version_id INTO v_vk1 FROM fleet.vehicle_kit
  WHERE organization_id = v_org AND vehicle_id = 'TEST-001';
  SELECT version_id INTO v_vk2 FROM fleet.vehicle_kit
  WHERE organization_id = v_org AND vehicle_id = 'TEST-002';

  IF v_vk1 IS DISTINCT FROM v_draft_version_id OR v_vk2 IS DISTINCT FROM v_draft_version_id THEN
    RAISE EXCEPTION 'FAIL: vehicles not moved to new production version';
  END IF;
END $$;

INSERT INTO fleet.kit_template (organization_id, code, name)
VALUES ('TEST-KIT-ORG', 'ZZ-TEST-KIT-PUBLISH-EMPTY', 'ZZ Publish Empty Draft');

INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
SELECT 'TEST-KIT-ORG', kt.id, 1, 'production'
FROM fleet.kit_template kt
WHERE kt.organization_id = 'TEST-KIT-ORG' AND kt.code = 'ZZ-TEST-KIT-PUBLISH-EMPTY';

DO $$
DECLARE
  v_org text := 'TEST-KIT-ORG';
  v_template_id uuid;
  v_prod_version_id uuid;
  v_draft_version_id uuid;
  v_item_a uuid;
  v_result jsonb;
BEGIN
  SELECT kt.id INTO v_template_id
  FROM fleet.kit_template kt
  WHERE kt.organization_id = v_org AND kt.code = 'ZZ-TEST-KIT-PUBLISH-EMPTY';

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: empty draft publish setup missing template';
  END IF;

  SELECT id INTO v_item_a FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-A';

  SELECT ktv.id INTO v_prod_version_id
  FROM fleet.kit_template_version ktv
  WHERE ktv.template_id = v_template_id AND ktv.status = 'production';

  INSERT INTO fleet.kit_template_line (
    organization_id, version_id, line_type, item_id, qty_required, required, sort_order
  ) VALUES (v_org, v_prod_version_id, 'item', v_item_a, 1, true, 1);

  v_result := fleet.inv_save_kit_draft(
    v_org,
    v_template_id,
    jsonb_build_array(jsonb_build_object('item_id', v_item_a, 'qty', 1)),
    'will empty',
    NULL
  );

  v_draft_version_id := (v_result->>'version_id')::uuid;

  DELETE FROM fleet.kit_template_line WHERE version_id = v_draft_version_id;

  BEGIN
    PERFORM fleet.inv_publish_kit_version(v_org, v_template_id, v_draft_version_id, false, NULL);
    RAISE EXCEPTION 'FAIL: publish empty draft was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%version is not a draft%' THEN
      RAISE;
    END IF;
  END;
END $$;

SELECT 'fleet_inventory_kit_versions_test' AS test_id, 'ok' AS status;

ROLLBACK;
