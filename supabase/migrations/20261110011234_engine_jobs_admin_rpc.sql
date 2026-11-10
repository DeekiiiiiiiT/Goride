-- Layer 2 — transactional RPCs for Dominion job admin (service_role only).

CREATE OR REPLACE FUNCTION public.maintenance_job_retire_cascade(p_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sections int;
  v_links int;
  v_now timestamptz := now();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_service_categories c
    WHERE c.id = p_category_id AND c.kind = 'component'
  ) THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  DELETE FROM public.maintenance_job_section_members m
  WHERE m.category_id = p_category_id;
  GET DIAGNOSTICS v_sections = ROW_COUNT;

  DELETE FROM public.maintenance_job_relations r
  WHERE r.from_category_id = p_category_id OR r.to_category_id = p_category_id;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  UPDATE public.maintenance_service_categories
  SET status = 'retired', retired_at = v_now, updated_at = v_now
  WHERE id = p_category_id;

  RETURN jsonb_build_object(
    'removedFromSections', v_sections,
    'removedLinks', v_links
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_job_section_members_set(
  p_section_id uuid,
  p_job_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_system_id uuid;
  v_job_id uuid;
  v_ord int := 0;
BEGIN
  SELECT s.system_id INTO v_system_id
  FROM public.maintenance_job_sections s
  WHERE s.id = p_section_id;
  IF v_system_id IS NULL THEN
    RAISE EXCEPTION 'Section not found';
  END IF;

  DELETE FROM public.maintenance_job_section_members m
  WHERE m.section_id = p_section_id;

  IF p_job_ids IS NULL OR cardinality(p_job_ids) = 0 THEN
    RETURN;
  END IF;

  FOREACH v_job_id IN ARRAY p_job_ids LOOP
    v_ord := v_ord + 10;
    INSERT INTO public.maintenance_job_section_members (section_id, category_id, system_id, sort_order)
    VALUES (p_section_id, v_job_id, v_system_id, v_ord);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_mjsg_reorder(
  p_system_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_ord int := 0;
BEGIN
  IF p_ordered_ids IS NULL OR cardinality(p_ordered_ids) = 0 THEN
    RETURN;
  END IF;

  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    v_ord := v_ord + 10;
    UPDATE public.maintenance_job_section_groups g
    SET sort_order = v_ord, updated_at = now()
    WHERE g.id = v_id AND g.system_id = p_system_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_mjs_reorder(
  p_group_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_ord int := 0;
BEGIN
  IF p_ordered_ids IS NULL OR cardinality(p_ordered_ids) = 0 THEN
    RETURN;
  END IF;

  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    v_ord := v_ord + 10;
    UPDATE public.maintenance_job_sections s
    SET sort_order = v_ord, updated_at = now()
    WHERE s.id = v_id AND s.group_id = p_group_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_job_retire_cascade(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_job_section_members_set(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_mjsg_reorder(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_mjs_reorder(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.maintenance_job_retire_cascade(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_job_section_members_set(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_mjsg_reorder(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_mjs_reorder(uuid, uuid[]) TO service_role;
