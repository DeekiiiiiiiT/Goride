-- Since 20261107213549 the part_listing unique index is
-- (interchange_group_id, vehicle_catalog_id, position, side, catalogue_number) NULLS NOT DISTINCT.
-- These four functions still named the old 4-column conflict target, so Postgres refused them
-- ("no unique or exclusion constraint matching the ON CONFLICT specification"):
-- Add a car / Add part dialog (save_guided_part), Keep on duplicate warnings, Keep on derived fits.
-- Only the ON CONFLICT column list changes; each body is otherwise the current one.
-- Rows without a catalogue number keep matching as before (NULLS NOT DISTINCT).

CREATE OR REPLACE FUNCTION public.save_guided_part(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_op text := upper(trim(coalesce(p_input->>'componentOpCode', '')));
  v_from integer := NULLIF(p_input->>'yearFrom', '')::integer;
  v_to integer := NULLIF(p_input->>'yearTo', '')::integer;
  v_ticked uuid[];
  v_raw_position text := NULLIF(trim(coalesce(p_input->>'position', '')), '');
  v_raw_side text := NULLIF(trim(coalesce(p_input->>'side', '')), '');
  v_position text;
  v_side text;
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_note text := NULLIF(btrim(coalesce(p_input->>'note', '')), '');
  v_actor uuid := NULLIF(p_input->>'verifiedBy', '')::uuid;
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_component uuid;
  v_category uuid;
  v_part jsonb;
  v_kind text;
  v_mfr text;
  v_number text;
  v_name text;
  v_part_id uuid;
  v_existing_group uuid;
  v_old uuid;
  v_scope text;
  v_listed uuid;
BEGIN
  SELECT n.norm_position, n.norm_side
  INTO v_position, v_side
  FROM public.part_norm_position(v_raw_position, v_raw_side) AS n;

  IF v_variant IS NULL THEN RAISE EXCEPTION 'Choose a vehicle'; END IF;
  IF v_evidence IS NULL THEN RAISE EXCEPTION 'A verified part needs a source link'; END IF;
  IF v_op <> '' THEN
    SELECT id INTO v_component FROM public.maintenance_service_categories WHERE op_code = v_op;
    IF v_component IS NULL THEN RAISE EXCEPTION 'That job is not in the catalog'; END IF;
  END IF;
  IF jsonb_typeof(p_input->'parts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'parts') = 0 THEN
    RAISE EXCEPTION 'Add at least one part number';
  END IF;
  IF p_input ? 'tickedVariantIds' AND jsonb_typeof(p_input->'tickedVariantIds') = 'array' THEN
    SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_ticked
    FROM jsonb_array_elements_text(p_input->'tickedVariantIds') AS value;
  END IF;

  v_category := NULLIF(p_input->>'categoryId', '')::uuid;
  IF v_category IS NULL AND v_op <> '' THEN
    v_category := public.guided_category_id(v_op);
  END IF;
  IF v_category IS NULL THEN RAISE EXCEPTION 'Choose a job or a category'; END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := NULLIF(btrim(coalesce(v_part->>'manufacturer', '')), '');
    v_number := NULLIF(btrim(coalesce(v_part->>'partNumber', '')), '');
    v_name := coalesce(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_mfr IS NULL OR v_number IS NULL THEN RAISE EXCEPTION 'Each part needs a brand and a part number'; END IF;
    IF upper(v_mfr) = 'OEM SPEC' THEN RAISE EXCEPTION 'OEM spec is not a brand. Enter a real brand and part number'; END IF;
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    IF v_kind NOT IN ('oem', 'oe_supplier', 'aftermarket') THEN RAISE EXCEPTION 'Choose factory, original supplier, or other brand'; END IF;
    SELECT pm.id, pm.interchange_group_id INTO v_part_id, v_existing_group
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = public.part_import_norm_number(v_number)
      AND pm.oem_part_number_norm <> '';
    IF v_existing_group IS NOT NULL AND v_group IS NOT NULL AND v_existing_group <> v_group THEN
      RAISE EXCEPTION 'Those part numbers are already saved under different fits. Edit each one.';
    END IF;
    IF v_group IS NULL AND v_existing_group IS NOT NULL THEN v_group := v_existing_group; END IF;
  END LOOP;

  IF v_group IS NULL THEN
    v_scope := CASE WHEN v_op <> '' AND public.is_engine_level_op(v_op) THEN 'powertrain' ELSE 'body' END;
    INSERT INTO public.part_interchange_group (code, label, fit_scope)
    VALUES (
      'GD-' || coalesce(NULLIF(v_op, ''), 'PART') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      coalesce(NULLIF(v_op, ''), 'PART'),
      v_scope
    )
    RETURNING id INTO v_group;
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := btrim(v_part->>'manufacturer');
    v_number := btrim(v_part->>'partNumber');
    v_name := coalesce(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    SELECT pm.id INTO v_part_id
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = public.part_import_norm_number(v_number);
    IF v_part_id IS NULL THEN
      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, evidence_url, verified_by, verified_at,
        catalog_decision, updated_at, oem_part_number_norm_version
      ) VALUES (
        v_category, v_name, v_number, v_mfr, v_kind,
        v_group, v_component, v_evidence, v_actor, now(),
        'confirmed', now(), public.part_import_norm_version()
      )
      RETURNING id INTO v_part_id;
    ELSE
      UPDATE public.part_master
      SET name = v_name,
          part_kind = v_kind,
          manufacturer = v_mfr,
          interchange_group_id = v_group,
          maintenance_component_id = coalesce(v_component, maintenance_component_id),
          category_id = v_category,
          evidence_url = v_evidence,
          verified_by = v_actor,
          verified_at = now(),
          catalog_decision = 'confirmed',
          updated_at = now()
      WHERE id = v_part_id;
    END IF;
    IF coalesce(btrim(v_part->>'supersedes'), '') <> '' THEN
      SELECT pm.id INTO v_old
      FROM public.part_master pm
      WHERE pm.oem_part_number_norm = public.part_import_norm_number(v_part->>'supersedes')
        AND pm.id <> v_part_id
      LIMIT 1;
      IF v_old IS NOT NULL THEN
        INSERT INTO public.part_supersession (old_part_id, new_part_id)
        VALUES (v_old, v_part_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, note, verified_by, origin
  ) VALUES (
    v_group, v_variant, v_position, v_side, v_from, v_to, v_evidence, v_note, v_actor, 'manual'
  )
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side, catalogue_number)
  DO UPDATE SET
    year_from = coalesce(EXCLUDED.year_from, public.part_listing.year_from),
    year_to = coalesce(EXCLUDED.year_to, public.part_listing.year_to),
    evidence_url = EXCLUDED.evidence_url,
    note = EXCLUDED.note,
    verified_by = EXCLUDED.verified_by,
    verified_at = now(),
    side = EXCLUDED.side,
    position = EXCLUDED.position;

  IF v_ticked IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_ticked) AS picked(id)
      JOIN public.vehicle_catalog other ON other.id = picked.id
      JOIN public.vehicle_catalog mine ON mine.id = v_variant
      WHERE lower(coalesce(other.make, '')) IS DISTINCT FROM lower(coalesce(mine.make, ''))
         OR lower(coalesce(other.model, '')) IS DISTINCT FROM lower(coalesce(mine.model, ''))
    ) THEN
      RAISE EXCEPTION 'Also listed for must be the same make and model';
    END IF;
    FOREACH v_listed IN ARRAY v_ticked
    LOOP
      IF v_listed IS DISTINCT FROM v_variant THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
          evidence_url, note, verified_by, origin
        ) VALUES (
          v_group, v_listed, v_position, v_side, v_from, v_to, v_evidence, v_note, v_actor, 'manual'
        )
        ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side, catalogue_number)
        DO UPDATE SET
          year_from = coalesce(EXCLUDED.year_from, public.part_listing.year_from),
          year_to = coalesce(EXCLUDED.year_to, public.part_listing.year_to),
          evidence_url = EXCLUDED.evidence_url,
          note = EXCLUDED.note,
          verified_by = EXCLUDED.verified_by,
          verified_at = now();
      END IF;
    END LOOP;
  END IF;

  IF NULLIF(p_input->>'groupId', '') IS NOT NULL AND v_ticked IS NOT NULL THEN
    DELETE FROM public.part_listing pl
    USING public.vehicle_catalog other, public.vehicle_catalog mine
    WHERE pl.interchange_group_id = v_group
      AND pl.vehicle_catalog_id = other.id
      AND mine.id = v_variant
      AND pl.vehicle_catalog_id IS DISTINCT FROM v_variant
      AND NOT (pl.vehicle_catalog_id = ANY (v_ticked))
      AND lower(coalesce(other.make, '')) = lower(coalesce(mine.make, ''))
      AND lower(coalesce(other.model, '')) = lower(coalesce(mine.model, ''));
  END IF;

  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'groupId', v_group);
END;
$function$;

CREATE OR REPLACE FUNCTION public.part_match_conflict_keep(p_conflict_id uuid, p_actor uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c public.part_match_conflict%ROWTYPE;
  v_derived uuid;
  v_other uuid;
  v_group uuid;
  v_manual boolean;
  v_kept_code text;
  v_other_code text;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN RAISE EXCEPTION 'Conflict not open'; END IF;

  IF c.conflict_type IN ('oe_ambiguous', 'index_merge_proposed', 'system_link')
     AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution note is required for this conflict type';
  END IF;

  IF c.conflict_type = 'index_merge_proposed' THEN
    UPDATE public.part_master pm
    SET interchange_group_id = (c.detail->>'target_group_id')::uuid
    WHERE pm.id = (c.detail->>'moving_part_id')::uuid;
    INSERT INTO public.interchange_group_merge_log (
      part_id, from_group, to_group, rule, matched_key, conflict_id, created_by
    ) VALUES (
      (c.detail->>'moving_part_id')::uuid,
      (c.detail->>'source_group_id')::uuid,
      (c.detail->>'target_group_id')::uuid,
      'index', c.matched_key, c.id, p_actor
    );
  ELSE
    v_group := c.interchange_group_id;
    SELECT ig.code INTO v_kept_code
    FROM public.part_interchange_group ig
    WHERE ig.id = v_group;
    SELECT d.id INTO v_derived
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = v_group
      AND d.vehicle_catalog_id = c.vehicle_catalog_id
    ORDER BY d.computed_at DESC
    LIMIT 1;
    IF v_derived IS NOT NULL THEN
      INSERT INTO public.part_listing (
        interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
        evidence_url, origin, derived_fit_id, verified_by
      )
      SELECT
        d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
        von.evidence_url,
        'auto_match_kept', d.id, p_actor
      FROM public.part_fit_derived d
      LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
      WHERE d.id = v_derived
      ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side, catalogue_number) DO UPDATE
        SET origin = EXCLUDED.origin,
            derived_fit_id = EXCLUDED.derived_fit_id
        WHERE public.part_listing.origin IS DISTINCT FROM 'manual'
          AND public.part_listing.origin IS DISTINCT FROM 'import';
    END IF;

    DELETE FROM public.part_listing_exclusion ex
    WHERE ex.interchange_group_id = v_group
      AND ex.vehicle_catalog_id = c.vehicle_catalog_id
      AND ex.source = 'auto_match_removed';

    IF c.conflict_type = 'oe_ambiguous' AND c.detail ? 'group_ids' THEN
      FOR v_other IN
        SELECT value::uuid FROM jsonb_array_elements_text(c.detail->'group_ids') AS value
      LOOP
        IF v_other = v_group THEN CONTINUE; END IF;
        SELECT EXISTS (
          SELECT 1 FROM public.part_listing pl
          WHERE pl.interchange_group_id = v_other
            AND pl.vehicle_catalog_id = c.vehicle_catalog_id
            AND pl.origin IN ('manual', 'import', 'auto_match_kept')
        ) INTO v_manual;
        SELECT ig.code INTO v_other_code
        FROM public.part_interchange_group ig
        WHERE ig.id = v_other;
        IF v_manual THEN
          UPDATE public.part_match_conflict oc
          SET status = 'superseded',
              resolution_note = format(
                'Manual fit exists on %s; both kept',
                coalesce(v_other_code, v_other::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        ELSE
          INSERT INTO public.part_listing_exclusion (
            interchange_group_id, vehicle_catalog_id, reason, evidence_url, source, created_by
          ) VALUES (
            v_other,
            c.vehicle_catalog_id,
            coalesce(p_note, format('Resolved by keeping %s', coalesce(v_kept_code, v_group::text))),
            NULL,
            'auto_match_removed',
            p_actor
          )
          ON CONFLICT DO NOTHING;
          UPDATE public.part_match_conflict oc
          SET status = 'removed',
              resolution_note = format(
                'Resolved by keeping %s',
                coalesce(v_kept_code, v_group::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.part_match_conflict
  SET status = 'kept', resolution_note = p_note, resolved_by = p_actor, resolved_at = now()
  WHERE id = p_conflict_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.part_match_derived_keep(p_derived_id uuid, p_actor uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  d public.part_fit_derived%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.part_fit_derived WHERE id = p_derived_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Derived fit not found'; END IF;
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, derived_fit_id, verified_by
  )
  SELECT
    pfd.interchange_group_id, pfd.vehicle_catalog_id, pfd.position, pfd.side, pfd.year_from, pfd.year_to,
    von.evidence_url,
    'auto_match_kept', pfd.id, p_actor
  FROM public.part_fit_derived pfd
  LEFT JOIN public.vehicle_oe_number von ON von.id = pfd.vehicle_oe_number_id
  WHERE pfd.id = p_derived_id
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side, catalogue_number) DO UPDATE
    SET origin = EXCLUDED.origin,
        derived_fit_id = EXCLUDED.derived_fit_id
    WHERE public.part_listing.origin IS DISTINCT FROM 'manual'
      AND public.part_listing.origin IS DISTINCT FROM 'import';
  PERFORM public.part_match_recompute(d.interchange_group_id, d.vehicle_catalog_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.part_match_derived_keep_batch(p_derived_ids uuid[], p_actor uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_found integer;
  v_prev_busy text;
BEGIN
  IF p_derived_ids IS NULL OR array_length(p_derived_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pick at least one fit.';
  END IF;
  SELECT count(*) INTO v_found
  FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids);
  IF v_found <> array_length(p_derived_ids, 1) THEN
    RAISE EXCEPTION 'Unknown derived fit';
  END IF;

  -- Hold the listing trigger off: this function scopes and recomputes once below.
  v_prev_busy := coalesce(current_setting('part_match.busy', true), 'off');
  PERFORM set_config('part_match.busy', 'on', true);
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, derived_fit_id, verified_by
  )
  SELECT
    d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    von.evidence_url,
    'auto_match_kept', d.id, p_actor
  FROM public.part_fit_derived d
  LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
  WHERE d.id = ANY (p_derived_ids)
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side, catalogue_number) DO UPDATE
    SET origin = EXCLUDED.origin,
        derived_fit_id = EXCLUDED.derived_fit_id
    WHERE public.part_listing.origin IS DISTINCT FROM 'manual'
      AND public.part_listing.origin IS DISTINCT FROM 'import';
  PERFORM set_config('part_match.busy', v_prev_busy, true);

  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  DELETE FROM _pm_batch_scope WHERE true;
  INSERT INTO _pm_batch_scope (group_id, vehicle_id)
  SELECT DISTINCT d.interchange_group_id, d.vehicle_catalog_id
  FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids)
  ON CONFLICT DO NOTHING;

  PERFORM public.part_match_recompute_buffered();
END;
$function$;

REVOKE ALL ON FUNCTION public.save_guided_part(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_conflict_keep(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_derived_keep(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_derived_keep_batch(uuid[],uuid,text) FROM PUBLIC, anon, authenticated;
