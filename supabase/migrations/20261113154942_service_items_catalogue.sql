-- Service items Round D1 — units, supplies, May-need links (audit 3a–3c, 3f steps 1–4).

-- =============================================================================
-- 3a — maintenance_unit
-- =============================================================================
CREATE TABLE public.maintenance_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label_one text NOT NULL,
  label_many text NOT NULL,
  sort_order integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_unit_code_key UNIQUE (code),
  CONSTRAINT maintenance_unit_status_check CHECK (status IN ('active', 'retired'))
);

INSERT INTO public.maintenance_unit (code, label_one, label_many, sort_order)
VALUES
  ('can', 'can', 'cans', 10),
  ('bottle', 'bottle', 'bottles', 20),
  ('tube', 'tube', 'tubes', 30),
  ('litre', 'litre', 'litres', 40),
  ('pack', 'pack', 'packs', 50),
  ('piece', 'piece', 'pieces', 60),
  ('kit', 'kit', 'kits', 70),
  ('roll', 'roll', 'rolls', 80)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 3b — maintenance_supply
-- =============================================================================
CREATE SEQUENCE public.maintenance_supply_code_seq;

CREATE TABLE public.maintenance_supply (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT (
    'SUP-' || lpad(nextval('public.maintenance_supply_code_seq')::text, 5, '0')
  ),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon_key text NOT NULL DEFAULT 'wrench',
  unit_id uuid NOT NULL REFERENCES public.maintenance_unit (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_supply_name_check CHECK (
    char_length(name) BETWEEN 1 AND 120
    AND name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
  ),
  CONSTRAINT maintenance_supply_status_check CHECK (status IN ('active', 'retired'))
);

CREATE UNIQUE INDEX maintenance_supply_active_name_lower
  ON public.maintenance_supply (lower(name))
  WHERE status = 'active';

COMMENT ON COLUMN public.maintenance_supply.created_by IS 'NULL = added by a migration';
COMMENT ON COLUMN public.maintenance_supply.updated_by IS 'NULL = added by a migration';

CREATE OR REPLACE FUNCTION public.trg_maintenance_supply_name_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF EXISTS (
      SELECT 1
      FROM public.maintenance_supply s
      WHERE s.status = 'active'
        AND lower(s.name) = lower(NEW.name)
        AND s.id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'supply_name_taken'
        USING HINT = 'An active supply already uses this name.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_maintenance_supply_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_supply_name_guard ON public.maintenance_supply;
CREATE TRIGGER maintenance_supply_name_guard
  BEFORE INSERT OR UPDATE ON public.maintenance_supply
  FOR EACH ROW EXECUTE FUNCTION public.trg_maintenance_supply_name_guard();

DROP TRIGGER IF EXISTS maintenance_supply_touch ON public.maintenance_supply;
CREATE TRIGGER maintenance_supply_touch
  BEFORE UPDATE ON public.maintenance_supply
  FOR EACH ROW EXECUTE FUNCTION public.trg_maintenance_supply_touch();

-- =============================================================================
-- 3c — maintenance_job_item
-- =============================================================================
CREATE TABLE public.maintenance_job_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id) ON DELETE RESTRICT,
  part_type_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE RESTRICT,
  supply_id uuid REFERENCES public.maintenance_supply (id) ON DELETE RESTRICT,
  need text NOT NULL,
  qty_hint numeric(12, 3),
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  removed_at timestamptz,
  removed_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_job_item_item_xor CHECK (
    (part_type_id IS NOT NULL) <> (supply_id IS NOT NULL)
  ),
  CONSTRAINT maintenance_job_item_not_self CHECK (part_type_id IS DISTINCT FROM job_id),
  CONSTRAINT maintenance_job_item_need_check CHECK (need IN ('usually', 'sometimes')),
  CONSTRAINT maintenance_job_item_qty_hint_check CHECK (qty_hint IS NULL OR qty_hint > 0)
);

CREATE UNIQUE INDEX maintenance_job_item_active_part
  ON public.maintenance_job_item (job_id, part_type_id)
  WHERE removed_at IS NULL AND part_type_id IS NOT NULL;

CREATE UNIQUE INDEX maintenance_job_item_active_supply
  ON public.maintenance_job_item (job_id, supply_id)
  WHERE removed_at IS NULL AND supply_id IS NOT NULL;

CREATE INDEX idx_mji_job_sort ON public.maintenance_job_item (job_id, sort_order)
  WHERE removed_at IS NULL;

CREATE INDEX idx_mji_part_type ON public.maintenance_job_item (part_type_id)
  WHERE part_type_id IS NOT NULL;

CREATE INDEX idx_mji_supply ON public.maintenance_job_item (supply_id)
  WHERE supply_id IS NOT NULL;

COMMENT ON COLUMN public.maintenance_job_item.created_by IS 'NULL = added by a migration';
COMMENT ON COLUMN public.maintenance_job_item.updated_by IS 'NULL = added by a migration';

CREATE OR REPLACE FUNCTION public.maintenance_job_item_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.job_id IS DISTINCT FROM NEW.job_id
       OR OLD.part_type_id IS DISTINCT FROM NEW.part_type_id
       OR OLD.supply_id IS DISTINCT FROM NEW.supply_id THEN
      RAISE EXCEPTION 'job_item_identity_locked'
        USING HINT = 'This link cannot change which job or item it points to.';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_service_categories c
    WHERE c.id = NEW.job_id AND c.kind = 'component'
  ) THEN
    RAISE EXCEPTION 'job_item_job_invalid'
      USING HINT = 'May-need links must belong to a component job.';
  END IF;

  IF NEW.part_type_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.maintenance_service_categories c
      WHERE c.id = NEW.part_type_id AND c.kind = 'component' AND c.is_part = true
    ) THEN
      RAISE EXCEPTION 'job_item_part_type_invalid'
        USING HINT = 'A part-type link must point to a catalogue part type.';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_job_item_guard ON public.maintenance_job_item;
CREATE TRIGGER maintenance_job_item_guard
  BEFORE INSERT OR UPDATE ON public.maintenance_job_item
  FOR EACH ROW EXECUTE FUNCTION public.maintenance_job_item_guard();

-- =============================================================================
-- Also-do clash (shared check + triggers)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.maintenance_assert_no_also_do_clash(
  p_job uuid,
  p_part_type uuid,
  p_require_relation boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.maintenance_job_item i
    WHERE i.job_id = p_job
      AND i.part_type_id = p_part_type
      AND i.removed_at IS NULL
  ) THEN
    RETURN;
  END IF;

  IF p_require_relation
     AND NOT EXISTS (
       SELECT 1
       FROM public.maintenance_job_relations r
       WHERE r.from_category_id = p_job
         AND r.to_category_id = p_part_type
     ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'job_item_also_do_clash'
    USING HINT = 'A part type cannot be both May need and Also do on the same job.';
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_maintenance_job_item_also_do_clash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.part_type_id IS NOT NULL THEN
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL) THEN
      PERFORM public.maintenance_assert_no_also_do_clash(NEW.job_id, NEW.part_type_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_job_item_also_do_clash ON public.maintenance_job_item;
CREATE TRIGGER maintenance_job_item_also_do_clash
  AFTER INSERT OR UPDATE ON public.maintenance_job_item
  FOR EACH ROW EXECUTE FUNCTION public.trg_maintenance_job_item_also_do_clash();

CREATE OR REPLACE FUNCTION public.trg_maintenance_job_relations_also_do_clash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.maintenance_assert_no_also_do_clash(
    NEW.from_category_id, NEW.to_category_id, false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_job_relations_also_do_clash ON public.maintenance_job_relations;
CREATE TRIGGER maintenance_job_relations_also_do_clash
  BEFORE INSERT ON public.maintenance_job_relations
  FOR EACH ROW EXECUTE FUNCTION public.trg_maintenance_job_relations_also_do_clash();

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE public.maintenance_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_supply ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_job_item ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.maintenance_unit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.maintenance_supply FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.maintenance_job_item FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.maintenance_unit TO service_role;
GRANT ALL ON TABLE public.maintenance_supply TO service_role;
GRANT ALL ON TABLE public.maintenance_job_item TO service_role;

GRANT SELECT ON TABLE public.maintenance_unit TO authenticated;
GRANT SELECT ON TABLE public.maintenance_supply TO authenticated;
GRANT SELECT ON TABLE public.maintenance_job_item TO authenticated;

CREATE POLICY maintenance_unit_authenticated_read
  ON public.maintenance_unit FOR SELECT TO authenticated USING (true);

CREATE POLICY maintenance_supply_authenticated_read
  ON public.maintenance_supply FOR SELECT TO authenticated USING (true);

CREATE POLICY maintenance_job_item_authenticated_read
  ON public.maintenance_job_item FOR SELECT TO authenticated USING (true);

REVOKE ALL ON SEQUENCE public.maintenance_supply_code_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.maintenance_supply_code_seq TO service_role;

-- =============================================================================
-- 3f steps 1–3 — Throttle body cleaner seed + field_schema
-- =============================================================================
DO $$
DECLARE
  v_unit uuid;
  v_supply uuid;
  v_job uuid;
BEGIN
  SELECT id INTO v_unit FROM public.maintenance_unit WHERE code = 'can';
  SELECT id INTO v_job FROM public.maintenance_service_categories WHERE code = 'throttle_body_cleaning';

  IF v_unit IS NOT NULL THEN
    SELECT id INTO v_supply
    FROM public.maintenance_supply
    WHERE status = 'active' AND lower(name) = lower('Throttle body cleaner');

    IF v_supply IS NULL THEN
      INSERT INTO public.maintenance_supply (name, description, icon_key, unit_id)
      VALUES (
        'Throttle body cleaner',
        'An aerosol spray that dissolves carbon and grime inside the throttle body.',
        'wrench',
        v_unit
      )
      RETURNING id INTO v_supply;
    END IF;

    IF v_job IS NOT NULL AND v_supply IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.maintenance_job_item
        WHERE job_id = v_job AND supply_id = v_supply AND removed_at IS NULL
      ) THEN
        INSERT INTO public.maintenance_job_item (job_id, supply_id, need, qty_hint, note, sort_order)
        VALUES (
          v_job, v_supply, 'usually', 1,
          'Spray, then wipe with a clean rag.', 10
        );
      END IF;
    END IF;
  END IF;

  IF v_job IS NOT NULL THEN
    UPDATE public.maintenance_service_categories
    SET field_schema = '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb
    WHERE id = v_job;
  END IF;
END $$;

-- =============================================================================
-- 3f step 4 — fold in component_related_supply
-- =============================================================================
DO $$
DECLARE
  v_row public.component_related_supply%ROWTYPE;
  v_job public.maintenance_service_categories%ROWTYPE;
  v_name text;
  v_unit_piece uuid;
  v_supply uuid;
  v_desc text;
BEGIN
  SELECT id INTO v_unit_piece FROM public.maintenance_unit WHERE code = 'piece';

  FOR v_row IN
    SELECT * FROM public.component_related_supply ORDER BY id
  LOOP
    SELECT * INTO v_job FROM public.maintenance_service_categories WHERE id = v_row.component_id;

    IF v_job.id IS NULL OR v_job.kind <> 'component' THEN
      RAISE NOTICE 'service_items fold-in skip: component % is not a component job', v_row.component_id;
      CONTINUE;
    END IF;

    v_name := btrim(regexp_replace(coalesce(v_row.supply_name, ''), '\s+', ' ', 'g'));

    IF v_name = '' THEN
      RAISE NOTICE 'service_items fold-in skip: blank supply name for component %', v_row.component_id;
      CONTINUE;
    END IF;

    IF char_length(v_name) > 120 THEN
      RAISE NOTICE 'service_items fold-in skip: supply name too long for component %', v_row.component_id;
      CONTINUE;
    END IF;

    SELECT id INTO v_supply
    FROM public.maintenance_supply
    WHERE status = 'active' AND lower(name) = lower(v_name);

    IF v_supply IS NULL THEN
      SELECT coalesce(
        (
          SELECT crs.note
          FROM public.component_related_supply crs
          WHERE btrim(regexp_replace(coalesce(crs.supply_name, ''), '\s+', ' ', 'g')) <> ''
            AND lower(btrim(regexp_replace(crs.supply_name, '\s+', ' ', 'g'))) = lower(v_name)
            AND crs.note IS NOT NULL AND btrim(crs.note) <> ''
          ORDER BY crs.id
          LIMIT 1
        ),
        'Shop supply used on this job.'
      ) INTO v_desc;

      INSERT INTO public.maintenance_supply (name, description, icon_key, unit_id)
      VALUES (v_name, v_desc, 'wrench', v_unit_piece)
      RETURNING id INTO v_supply;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.maintenance_job_item
      WHERE job_id = v_row.component_id AND supply_id = v_supply AND removed_at IS NULL
    ) THEN
      INSERT INTO public.maintenance_job_item (job_id, supply_id, need, note, sort_order)
      VALUES (v_row.component_id, v_supply, 'sometimes', v_row.note, 0);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.maintenance_assert_no_also_do_clash(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_job_item_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_maintenance_job_item_also_do_clash()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_maintenance_job_relations_also_do_clash()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_maintenance_supply_name_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_maintenance_supply_touch()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
