-- Paste into the Supabase SQL editor (project csfllzzastacofsvcdsc). One run. Safe to run again.

-- Approving a manual value for a catalogue COLUMN (engine oil capacity, coolant capacity, fuel tank) also
-- updates the same value where it is kept as a named spec on the version (catalog_spec_value), so the two
-- copies never disagree. Found 27 Nov on the Roomy owner's manual: the columns took 2.9 L / 4.4 L / 5 L, but a
-- CSV-import copy (3.2 L, 4.5 L, "needs checking") stayed beside them and the check screen's "Now" read it.
-- Only an existing copy is updated; no new copy is created.

CREATE OR REPLACE FUNCTION public.maintenance_manual_spec_approve(
  p_spec_id uuid,
  p_version_ids uuid[] DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS TABLE (written_version_id uuid, target_table text, old_value text, new_value text, changed boolean)LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.maintenance_manual_spec_row%ROWTYPE;
  m public.maintenance_manual%ROWTYPE;
  v_ids uuid[];
  v_id uuid;
  v_printed integer;
  v_text text;
  v_old text;
  v_target text;
  v_note text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT * INTO r FROM public.maintenance_manual_spec_row s WHERE s.id = p_spec_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'spec row % not found', p_spec_id;
  END IF;

  SELECT * INTO m FROM public.maintenance_manual mm WHERE mm.id = r.manual_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual % not found', r.manual_id;
  END IF;

  IF r.status <> 'draft' THEN
    RAISE EXCEPTION 'this value is already %', r.status
      USING HINT = 'Only a draft can be approved.';
  END IF;

  v_ids := COALESCE(NULLIF(p_version_ids, ARRAY[]::uuid[]), r.version_ids);
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'choose at least one version for this value'
      USING HINT = 'A value is written to catalogue versions, never to the whole model.';
  END IF;

  v_printed := r.evidence_page - COALESCE(m.page_offset, 0);
  v_note := format(
    'Read from %s (%s), printed page %s.',
    m.title,
    COALESCE(m.market, 'market unknown'),
    v_printed
  );

  FOREACH v_id IN ARRAY v_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.vehicle_catalog vc
      LEFT JOIN public.vehicle_platform p ON p.id = vc.platform_id
      WHERE vc.id = v_id
        AND (vc.platform_id = m.platform_id OR p.parent_id = m.platform_id)
    ) THEN
      RAISE EXCEPTION 'car % is not one of this manual''s model', v_id
        USING HINT = 'A value can only be written to a catalogue version of the manual''s own family.';
    END IF;

    v_old := NULL;
    v_target := NULL;
    v_before := NULL;
    v_after := NULL;

    -- --- a plain catalogue column: oil capacity, coolant capacity, fuel tank -------------------------
    IF r.kind IN ('fluid', 'fuel')
       AND r.key IN ('engine_oil_capacity_l', 'coolant_capacity_l', 'fuel_tank_capacity') THEN
      v_target := 'vehicle_catalog';
      v_text := btrim(COALESCE(r.value ->> 'value', ''));
      IF v_text = '' THEN
        RAISE EXCEPTION 'the value for % is empty', r.key;
      END IF;

      EXECUTE format('SELECT %I::text FROM public.vehicle_catalog WHERE id = $1', r.key)
        INTO v_old USING v_id;
      EXECUTE format('UPDATE public.vehicle_catalog SET %I = $1::numeric WHERE id = $2', r.key)
        USING v_text, v_id;

      v_before := jsonb_build_object('column', r.key, 'value', v_old);
      v_after := jsonb_build_object(
        'column', r.key, 'value', v_text, 'spec_key', r.key,
        'vehicle_catalog_id', v_id, 'manual_id', m.id, 'pdf_page', r.evidence_page,
        'printed_page', v_printed, 'spec_row_id', r.id
      );
      written_version_id := v_id;
      target_table := v_target;
      old_value := v_old;
      new_value := v_text;
      changed := v_old IS DISTINCT FROM v_text;
      PERFORM public.mm_spec_history(p_actor, v_target, v_id::text, v_before, v_after);

      -- The same value kept as a named spec on this version (an older import) takes the maker's number too.
      UPDATE public.catalog_spec_value s
      SET value = v_text,
          evidence_url = 'r2:private/' || m.file_key,
          verified_by = p_actor,
          verified_at = now(),
          trust = 'confirmed',
          trust_route = 'maker_document',
          source_note = v_note
      WHERE s.scope = 'variant' AND s.spec_key = r.key AND s.vehicle_catalog_id = v_id;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- --- tyres: one row per position and size -------------------------------------------------------
    IF r.kind = 'tyre' THEN
      v_target := 'vehicle_tyre';
      v_text := btrim(COALESCE(r.value ->> 'size', ''));
      IF v_text = '' OR r.key NOT IN ('front', 'rear', 'spare') THEN
        RAISE EXCEPTION 'a tyre value needs a position (front/rear/spare) and a size';
      END IF;

      SELECT concat_ws(' ', t.size, t.pressure_kpa || ' kPa')
        INTO v_old
      FROM public.vehicle_tyre t
      WHERE t.vehicle_catalog_id = v_id
        AND t.position = r.key
      ORDER BY (t.is_optional = COALESCE((r.value ->> 'is_optional')::boolean, false)) DESC, t.size
      LIMIT 1;

      INSERT INTO public.vehicle_tyre (
        vehicle_catalog_id, position, size, load_speed_index, wheel_size, pressure_kpa, is_optional,
        source_note, evidence_url, manual_id, evidence_page
      ) VALUES (
        v_id,
        r.key,
        v_text,
        NULLIF(btrim(COALESCE(r.value ->> 'load_speed_index', '')), ''),
        NULLIF(btrim(COALESCE(r.value ->> 'wheel_size', '')), ''),
        NULLIF(btrim(COALESCE(r.value ->> 'pressure_kpa', '')), '')::integer,
        COALESCE((r.value ->> 'is_optional')::boolean, false),
        v_note,
        'r2:private/' || m.file_key,
        m.id,
        r.evidence_page
      )
      ON CONFLICT (vehicle_catalog_id, position, size) DO UPDATE
      SET load_speed_index = EXCLUDED.load_speed_index,
          wheel_size = EXCLUDED.wheel_size,
          pressure_kpa = EXCLUDED.pressure_kpa,
          is_optional = EXCLUDED.is_optional,
          source_note = EXCLUDED.source_note,
          evidence_url = EXCLUDED.evidence_url,
          manual_id = EXCLUDED.manual_id,
          evidence_page = EXCLUDED.evidence_page,
          updated_at = now();

      v_after := jsonb_build_object(
        'position', r.key, 'size', v_text,
        'pressure_kpa', r.value ->> 'pressure_kpa',
        'is_optional', COALESCE((r.value ->> 'is_optional')::boolean, false),
        'vehicle_catalog_id', v_id, 'manual_id', m.id, 'pdf_page', r.evidence_page,
        'printed_page', v_printed, 'spec_row_id', r.id
      );
      written_version_id := v_id;
      target_table := v_target;
      old_value := v_old;
      new_value := concat_ws(' ', v_text, COALESCE(r.value ->> 'pressure_kpa', '') || ' kPa');
      changed := true;
      PERFORM public.mm_spec_history(p_actor, v_target, v_id::text,
        jsonb_build_object('position', r.key, 'value', v_old), v_after);
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- --- bulbs: one row per lamp position -----------------------------------------------------------
    IF r.kind = 'bulb' THEN
      v_target := 'vehicle_bulb';
      v_text := btrim(COALESCE(r.value ->> 'bulb_ref', ''));
      IF v_text = '' THEN
        RAISE EXCEPTION 'a bulb value needs the bulb the page prints';
      END IF;

      SELECT b.bulb_ref INTO v_old
      FROM public.vehicle_bulb b
      WHERE b.vehicle_catalog_id = v_id AND b.position = r.key;

      INSERT INTO public.vehicle_bulb (
        vehicle_catalog_id, position, bulb_ref, wattage_w, is_led, grade_note, source_note,
        evidence_url, manual_id, evidence_page
      ) VALUES (
        v_id,
        r.key,
        v_text,
        NULLIF(btrim(COALESCE(r.value ->> 'wattage_w', '')), ''),
        COALESCE((r.value ->> 'is_led')::boolean, false),
        NULLIF(btrim(COALESCE(r.value ->> 'grade_note', '')), ''),
        v_note,
        'r2:private/' || m.file_key,
        m.id,
        r.evidence_page
      )
      ON CONFLICT (vehicle_catalog_id, position) DO UPDATE
      SET bulb_ref = EXCLUDED.bulb_ref,
          wattage_w = EXCLUDED.wattage_w,
          is_led = EXCLUDED.is_led,
          grade_note = EXCLUDED.grade_note,
          source_note = EXCLUDED.source_note,
          evidence_url = EXCLUDED.evidence_url,
          manual_id = EXCLUDED.manual_id,
          evidence_page = EXCLUDED.evidence_page,
          updated_at = now();

      v_after := jsonb_build_object(
        'position', r.key, 'bulb_ref', v_text,
        'wattage_w', r.value ->> 'wattage_w',
        'vehicle_catalog_id', v_id, 'manual_id', m.id, 'pdf_page', r.evidence_page,
        'printed_page', v_printed, 'spec_row_id', r.id
      );
      written_version_id := v_id;
      target_table := v_target;
      old_value := v_old;
      new_value := v_text;
      changed := v_old IS DISTINCT FROM v_text;
      PERFORM public.mm_spec_history(p_actor, v_target, v_id::text,
        jsonb_build_object('position', r.key, 'value', v_old), v_after);
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- --- everything else is a named spec value on the version ---------------------------------------
    v_target := 'catalog_spec_value';
    v_text := btrim(COALESCE(r.value ->> 'value', ''));
    IF v_text = '' THEN
      RAISE EXCEPTION 'the value for % is empty', r.key;
    END IF;

    SELECT s.value INTO v_old
    FROM public.catalog_spec_value s
    WHERE s.scope = 'variant' AND s.spec_key = r.key AND s.vehicle_catalog_id = v_id;

    INSERT INTO public.catalog_spec_value (
      spec_key, scope, vehicle_catalog_id, value, evidence_url, verified_by, verified_at,
      trust, trust_route, source_note
    ) VALUES (
      r.key, 'variant', v_id, v_text, 'r2:private/' || m.file_key, p_actor, now(),
      'confirmed', 'maker_document',
      v_note || COALESCE(' ' || NULLIF(btrim(COALESCE(r.value ->> 'note', '')), ''), '')
    )
    ON CONFLICT (spec_key, vehicle_catalog_id) WHERE scope = 'variant' DO UPDATE
    SET value = EXCLUDED.value,
        evidence_url = EXCLUDED.evidence_url,
        verified_by = EXCLUDED.verified_by,
        verified_at = EXCLUDED.verified_at,
        trust = EXCLUDED.trust,
        trust_route = EXCLUDED.trust_route,
        source_note = EXCLUDED.source_note;

    v_after := jsonb_build_object(
      'spec_key', r.key, 'value', v_text,
      'vehicle_catalog_id', v_id, 'manual_id', m.id, 'pdf_page', r.evidence_page,
      'printed_page', v_printed, 'spec_row_id', r.id
    );
    written_version_id := v_id;
    target_table := v_target;
    old_value := v_old;
    new_value := v_text;
    changed := v_old IS DISTINCT FROM v_text;
    PERFORM public.mm_spec_history(p_actor, v_target, v_id::text,
      jsonb_build_object('spec_key', r.key, 'value', v_old), v_after);
    RETURN NEXT;
  END LOOP;

  UPDATE public.maintenance_manual_spec_row
  SET status = 'active',
      confidence = 'confirmed',
      version_ids = v_ids,
      verified_by = p_actor,
      verified_at = now(),
      updated_at = now()
  WHERE id = p_spec_id;
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_manual_spec_approve(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_spec_approve(uuid, uuid[], uuid) TO service_role;

-- Values approved before this change: the spec copy takes the column's value where a maker's manual set it.
UPDATE public.catalog_spec_value s
SET value = vc.col_value,
    trust = 'confirmed',
    trust_route = 'maker_document',
    evidence_url = 'r2:private/' || mm.file_key,
    verified_at = now(),
    source_note = format('Read from %s (%s), printed page %s.', mm.title, COALESCE(mm.market, 'market unknown'),
      sr.evidence_page - COALESCE(mm.page_offset, 0))
FROM public.maintenance_manual_spec_row sr
JOIN public.maintenance_manual mm ON mm.id = sr.manual_id
CROSS JOIN LATERAL unnest(sr.version_ids) AS vid(id)
JOIN LATERAL (
  SELECT CASE sr.key
    WHEN 'engine_oil_capacity_l' THEN c.engine_oil_capacity_l::text
    WHEN 'coolant_capacity_l' THEN c.coolant_capacity_l::text
    WHEN 'fuel_tank_capacity' THEN c.fuel_tank_capacity::text
  END AS col_value
  FROM public.vehicle_catalog c WHERE c.id = vid.id
) vc ON vc.col_value IS NOT NULL
WHERE sr.status = 'active'
  AND sr.key IN ('engine_oil_capacity_l', 'coolant_capacity_l', 'fuel_tank_capacity')
  AND s.scope = 'variant' AND s.spec_key = sr.key AND s.vehicle_catalog_id = vid.id
  AND s.value IS DISTINCT FROM vc.col_value;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127210227', 'mm_spec_approve_updates_spec_copy') ON CONFLICT (version) DO NOTHING;
