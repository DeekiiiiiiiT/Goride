-- §2.3 rule overlap → needs_checking + conflict row (never reject).

CREATE TABLE public.maintenance_rule_conflict (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.maintenance_service_categories (id),
  rule_id_a uuid NOT NULL REFERENCES public.maintenance_task_templates (id),
  rule_id_b uuid NOT NULL REFERENCES public.maintenance_task_templates (id),
  status text NOT NULL DEFAULT 'open',
  picked_rule_id uuid REFERENCES public.maintenance_task_templates (id),
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_rule_conflict_status_check
    CHECK (status IN ('open', 'resolved', 'superseded'))
);

CREATE INDEX IF NOT EXISTS idx_mrc_open_component
  ON public.maintenance_rule_conflict (component_id)
  WHERE status = 'open';

ALTER TABLE public.maintenance_rule_conflict ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_rule_conflict_deny ON public.maintenance_rule_conflict;
CREATE POLICY maintenance_rule_conflict_deny
  ON public.maintenance_rule_conflict
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.maintenance_rule_conflict FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.maintenance_rule_conflict TO service_role;

CREATE OR REPLACE FUNCTION public.mm_rule_target_key(
  p_scope text,
  p_catalog uuid,
  p_platform uuid,
  p_engine uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    p_catalog::text,
    p_platform::text,
    p_engine::text,
    'global'
  );
$$;

CREATE OR REPLACE FUNCTION public.mm_classes_overlap(a text[], b text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    cardinality(coalesce(a, ARRAY[]::text[])) = 0
    OR cardinality(coalesce(b, ARRAY[]::text[])) = 0
    OR a && b;
$$;

CREATE OR REPLACE FUNCTION public.trg_mtt_overlap_guard_before()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_other record;
  v_lock_key bigint;
  v_target text;
  v_years int4range;
BEGIN
  IF NEW.component_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('active', 'needs_checking') THEN
    RETURN NEW;
  END IF;

  v_target := public.mm_rule_target_key(
    NEW.template_scope,
    NEW.vehicle_catalog_id,
    NEW.platform_id,
    NEW.engine_family_id
  );

  v_lock_key := hashtext(NEW.component_id::text || NEW.template_scope || v_target);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_years := int4range(
    coalesce(NEW.year_from, 0),
    coalesce(NEW.year_to, 9999),
    '[]'
  );

  SELECT t.id
  INTO v_other
  FROM public.maintenance_task_templates t
  WHERE t.id IS DISTINCT FROM NEW.id
    AND t.component_id = NEW.component_id
    AND t.template_scope = NEW.template_scope
    AND t.status = 'active'
    AND public.mm_rule_target_key(
      t.template_scope, t.vehicle_catalog_id, t.platform_id, t.engine_family_id
    ) = v_target
    AND int4range(coalesce(t.year_from, 0), coalesce(t.year_to, 9999), '[]') && v_years
    AND public.mm_classes_overlap(t.applicable_vehicle_classes, NEW.applicable_vehicle_classes)
  LIMIT 1;

  IF FOUND AND NEW.status = 'active' THEN
    NEW.status := 'needs_checking';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_mtt_overlap_guard_after()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_other uuid;
  v_target text;
  v_years int4range;
BEGIN
  IF NEW.component_id IS NULL OR NEW.status <> 'needs_checking' THEN
    RETURN NEW;
  END IF;

  v_target := public.mm_rule_target_key(
    NEW.template_scope,
    NEW.vehicle_catalog_id,
    NEW.platform_id,
    NEW.engine_family_id
  );

  v_years := int4range(
    coalesce(NEW.year_from, 0),
    coalesce(NEW.year_to, 9999),
    '[]'
  );

  SELECT t.id
  INTO v_other
  FROM public.maintenance_task_templates t
  WHERE t.id IS DISTINCT FROM NEW.id
    AND t.component_id = NEW.component_id
    AND t.template_scope = NEW.template_scope
    AND t.status = 'active'
    AND public.mm_rule_target_key(
      t.template_scope, t.vehicle_catalog_id, t.platform_id, t.engine_family_id
    ) = v_target
    AND int4range(coalesce(t.year_from, 0), coalesce(t.year_to, 9999), '[]') && v_years
    AND public.mm_classes_overlap(t.applicable_vehicle_classes, NEW.applicable_vehicle_classes)
  LIMIT 1;

  IF FOUND
    AND NOT EXISTS (
      SELECT 1
      FROM public.maintenance_rule_conflict c
      WHERE c.status = 'open'
        AND c.component_id = NEW.component_id
        AND (
          (c.rule_id_a = v_other AND c.rule_id_b = NEW.id)
          OR (c.rule_id_a = NEW.id AND c.rule_id_b = v_other)
        )
    )
  THEN
    INSERT INTO public.maintenance_rule_conflict (
      component_id, rule_id_a, rule_id_b, status, detail
    )
    VALUES (
      NEW.component_id,
      v_other,
      NEW.id,
      'open',
      jsonb_build_object(
        'scope', NEW.template_scope,
        'target', v_target,
        'demoted_status', 'needs_checking'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_mtt_overlap_guard ON public.maintenance_task_templates;
DROP TRIGGER IF EXISTS mm_mtt_overlap_guard_before ON public.maintenance_task_templates;
DROP TRIGGER IF EXISTS mm_mtt_overlap_guard_after ON public.maintenance_task_templates;

CREATE TRIGGER mm_mtt_overlap_guard_before
  BEFORE INSERT OR UPDATE OF status, component_id, template_scope,
    vehicle_catalog_id, platform_id, engine_family_id,
    year_from, year_to, applicable_vehicle_classes
  ON public.maintenance_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_mtt_overlap_guard_before();

CREATE TRIGGER mm_mtt_overlap_guard_after
  AFTER INSERT OR UPDATE OF status, component_id, template_scope,
    vehicle_catalog_id, platform_id, engine_family_id,
    year_from, year_to, applicable_vehicle_classes
  ON public.maintenance_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_mtt_overlap_guard_after();

REVOKE ALL ON FUNCTION public.mm_rule_target_key(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_classes_overlap(text[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mtt_overlap_guard_before() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mtt_overlap_guard_after() FROM PUBLIC, anon, authenticated;
