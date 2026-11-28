-- Maintenance rebuild step 6b — the values an owner's manual prints, as draft SPEC ROWS (DOC-06, DOC-10, DOC-12).
--
-- The interval reader already has its home (maintenance_task_templates). A car's fluids, tyres, battery and
-- bulbs do not: they belong to catalogue versions, and a manual is read once per model while the numbers differ
-- per version (2WD 36 L / 4WD 38 L, turbo coolant 5.0 L). So a read produces SPEC ROWS, the owner ticks the
-- versions each row applies to, and approving writes the value to those versions only — with a history line
-- saying who changed what, from which manual and which printed page.
--
-- 1. `maintenance_manual_spec_row` — one row per value read from a page.
-- 2. `maintenance_manual_replace_page_specs` — re-reading a page replaces that page's DRAFT rows only.
-- 3. `maintenance_manual_spec_approve` — writes the value to the ticked versions, and logs every change.
-- 4. `maintenance_manual_spec_reject` — closes a row with a reason.
-- 5. `maintenance_manual_spec_current` — the catalogue's current value per version, for "Now -> Manual".
--
-- Server only, like the manual itself. Nothing here is readable by anon or authenticated.

-- ---------------------------------------------------------------------------
-- 1. The spec row
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_manual_spec_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES public.maintenance_manual (id) ON DELETE CASCADE,
  -- The PDF page the value was read on. Screens show printed_page (this - manual.page_offset).
  evidence_page integer NOT NULL,
  kind text NOT NULL,
  -- What the value is: a spec_key for fluids/battery/fuel, the tyre position, or the lamp position.
  key text NOT NULL,
  -- The value as printed, with its unit and any second figure: {"value":2.9,"unit":"L"}.
  value jsonb NOT NULL,
  -- The page's own remark: "2WD", "4WD", "Turbo", "with the electric parking brake". Null when none.
  applies_to text,
  -- The catalogue versions the owner ticked; pre-ticked from applies_to when the reader could place it.
  version_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  status text NOT NULL DEFAULT 'draft',
  confidence text NOT NULL DEFAULT 'likely',
  draft_note text,
  reject_reason text,
  verified_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_manual_spec_row_kind_check
    CHECK (kind IN ('fluid', 'tyre', 'battery', 'bulb', 'fuel')),
  CONSTRAINT maintenance_manual_spec_row_status_check
    CHECK (status IN ('draft', 'active', 'rejected')),
  CONSTRAINT maintenance_manual_spec_row_confidence_check
    CHECK (confidence IN ('likely', 'uncertain', 'confirmed')),
  CONSTRAINT maintenance_manual_spec_row_key_check CHECK (length(btrim(key)) >= 1),
  CONSTRAINT maintenance_manual_spec_row_page_check CHECK (evidence_page >= 1),
  CONSTRAINT maintenance_manual_spec_row_reject_reason_check
    CHECK (status <> 'rejected' OR length(btrim(coalesce(reject_reason, ''))) >= 10)
);

COMMENT ON TABLE public.maintenance_manual_spec_row IS
  'One value read from one page of an owner''s manual, before and after the owner approves it (step 6b, DOC-06/10/12). Server only.';
COMMENT ON COLUMN public.maintenance_manual_spec_row.key IS
  'Fluid/battery/fuel: a spec_key. Tyre: front/rear/spare. Bulb: the maker''s lamp position.';
COMMENT ON COLUMN public.maintenance_manual_spec_row.applies_to IS
  'The page''s remark that decides which versions the value fits ("4WD", "Turbo", "with the electric parking brake").';
COMMENT ON COLUMN public.maintenance_manual_spec_row.version_ids IS
  'The catalogue versions the value is written to on approval. Pre-ticked from applies_to; the owner can change it.';

CREATE INDEX IF NOT EXISTS maintenance_manual_spec_row_manual_idx
  ON public.maintenance_manual_spec_row (manual_id, status, evidence_page);

DROP TRIGGER IF EXISTS maintenance_manual_spec_row_updated_at ON public.maintenance_manual_spec_row;
CREATE TRIGGER maintenance_manual_spec_row_updated_at
  BEFORE UPDATE ON public.maintenance_manual_spec_row
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.maintenance_manual_spec_row ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_manual_spec_row_no_direct ON public.maintenance_manual_spec_row;
CREATE POLICY maintenance_manual_spec_row_no_direct
  ON public.maintenance_manual_spec_row
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.maintenance_manual_spec_row FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.maintenance_manual_spec_row TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Re-reading a page replaces that page's drafts only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintenance_manual_replace_page_specs(
  p_manual_id uuid,
  p_page_no integer,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manual public.maintenance_manual%ROWTYPE;
  v_inserted integer := 0;
BEGIN
  SELECT * INTO v_manual FROM public.maintenance_manual WHERE id = p_manual_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual % not found', p_manual_id;
  END IF;

  IF NOT (p_page_no = ANY (v_manual.pages)) THEN
    RAISE EXCEPTION 'page % outside %', p_page_no, array_to_string(v_manual.pages, ',');
  END IF;

  -- An approved spec row is a catalogue value now: it is never deleted by a re-read.
  DELETE FROM public.maintenance_manual_spec_row s
  WHERE s.manual_id = p_manual_id
    AND s.evidence_page = p_page_no
    AND s.status = 'draft';

  WITH input AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS x(
      kind text,
      key text,
      value jsonb,
      applies_to text,
      version_ids uuid[],
      confidence text,
      draft_note text
    )
  ), inserted AS (
    INSERT INTO public.maintenance_manual_spec_row (
      manual_id, evidence_page, kind, key, value, applies_to, version_ids, status, confidence, draft_note
    )
    SELECT
      p_manual_id,
      p_page_no,
      lower(btrim(i.kind)),
      btrim(i.key),
      COALESCE(i.value, '{}'::jsonb),
      NULLIF(btrim(i.applies_to), ''),
      COALESCE(i.version_ids, ARRAY[]::uuid[]),
      'draft',
      CASE WHEN i.confidence IN ('likely', 'uncertain', 'confirmed') THEN i.confidence ELSE 'uncertain' END,
      NULLIF(btrim(i.draft_note), '')
    FROM input i
    WHERE i.kind IN ('fluid', 'tyre', 'battery', 'bulb', 'fuel')
      AND btrim(coalesce(i.key, '')) <> ''
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Approving: the value reaches the ticked versions, and the change is recorded
-- ---------------------------------------------------------------------------
-- One history line per version per target, in the existing catalogue audit table. `before`/`after` carry the
-- old and new value, the manual and the printed page, so a screen or a person can answer "why is this 2.9?".
CREATE OR REPLACE FUNCTION public.mm_spec_history(
  p_actor uuid,
  p_table text,
  p_row_id text,
  p_before jsonb,
  p_after jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.dominion_audit_log (actor, action, table_name, row_id, before, after)
  VALUES (p_actor, 'spec_approve', p_table, p_row_id, p_before, p_after);
$$;

COMMENT ON FUNCTION public.mm_spec_history(uuid, text, text, jsonb, jsonb) IS
  'Appends one catalogue history line for an approved spec value (DOC-12). Append-only table.';

-- Dropped first because its result columns are named after what was written; a re-run must match.
DROP FUNCTION IF EXISTS public.maintenance_manual_spec_approve(uuid, uuid[], uuid);

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

COMMENT ON FUNCTION public.maintenance_manual_spec_approve(uuid, uuid[], uuid) IS
  'Writes one approved spec row to the ticked catalogue versions only, and logs each change (DOC-10, DOC-12).';

CREATE OR REPLACE FUNCTION public.maintenance_manual_spec_reject(
  p_spec_id uuid,
  p_reason text,
  p_actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_manual_spec_row s WHERE s.id = p_spec_id) THEN
    RAISE EXCEPTION 'spec row % not found', p_spec_id;
  END IF;

  IF length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required to reject a value.';
  END IF;

  UPDATE public.maintenance_manual_spec_row
  SET status = 'rejected',
      reject_reason = v_reason,
      verified_by = p_actor,
      verified_at = now(),
      updated_at = now()
  WHERE id = p_spec_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this value is no longer a draft, so it cannot be rejected';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. What the catalogue holds today, per version, for "Now -> Manual"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintenance_manual_spec_current(p_manual_id uuid)
RETURNS TABLE (kind text, spec_key text, vehicle_catalog_id uuid, now_value text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m public.maintenance_manual%ROWTYPE;
  v_versions uuid[];
  v_id uuid;
  r record;
  v_now text;
BEGIN
  SELECT * INTO m FROM public.maintenance_manual mm WHERE mm.id = p_manual_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT array_agg(vc.id) INTO v_versions
  FROM public.vehicle_catalog vc
  LEFT JOIN public.vehicle_platform p ON p.id = vc.platform_id
  WHERE vc.platform_id = m.platform_id OR p.parent_id = m.platform_id;

  IF v_versions IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT DISTINCT s.kind, s.key
    FROM public.maintenance_manual_spec_row s
    WHERE s.manual_id = p_manual_id
      AND s.status IN ('draft', 'active')
    ORDER BY s.kind, s.key
  LOOP
    FOREACH v_id IN ARRAY v_versions LOOP
      v_now := NULL;

      IF r.key = 'engine_oil_capacity_l' THEN
        SELECT vc.engine_oil_capacity_l::text INTO v_now FROM public.vehicle_catalog vc WHERE vc.id = v_id;
      ELSIF r.key = 'coolant_capacity_l' THEN
        SELECT vc.coolant_capacity_l::text INTO v_now FROM public.vehicle_catalog vc WHERE vc.id = v_id;
      ELSIF r.key = 'fuel_tank_capacity' THEN
        SELECT vc.fuel_tank_capacity::text INTO v_now FROM public.vehicle_catalog vc WHERE vc.id = v_id;
      ELSIF r.kind = 'tyre' AND r.key IN ('front', 'rear', 'spare') THEN
        SELECT concat_ws(' ', t.size, t.pressure_kpa || ' kPa') INTO v_now
        FROM public.vehicle_tyre t
        WHERE t.vehicle_catalog_id = v_id AND t.position = r.key
        ORDER BY t.is_optional, t.size
        LIMIT 1;
      ELSIF r.kind = 'bulb' THEN
        SELECT concat_ws(' ', b.bulb_ref, b.wattage_w) INTO v_now
        FROM public.vehicle_bulb b
        WHERE b.vehicle_catalog_id = v_id AND b.position = r.key
        LIMIT 1;
      ELSE
        SELECT s.value INTO v_now
        FROM public.catalog_spec_value s
        WHERE s.scope = 'variant' AND s.spec_key = r.key AND s.vehicle_catalog_id = v_id;
      END IF;

      IF v_now IS NOT NULL AND btrim(v_now) <> '' THEN
        kind := r.kind;
        spec_key := r.key;
        vehicle_catalog_id := v_id;
        now_value := v_now;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.maintenance_manual_spec_current(uuid) IS
  'The catalogue''s current value for every spec the manual lists, per version: the "Now" in "Now -> Manual" (DOC-12).';

-- ---------------------------------------------------------------------------
-- 5. Grants: server only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.maintenance_manual_replace_page_specs(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_spec_history(uuid, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_spec_approve(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_spec_reject(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_manual_spec_current(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.maintenance_manual_replace_page_specs(uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mm_spec_history(uuid, text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_spec_approve(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_spec_reject(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_manual_spec_current(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
