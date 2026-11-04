-- Keep on "Same number, two parts" (oe_ambiguous) could leave a car with a pad that is both kept and blocked.
-- Live 4 Nov: Thor/Justy/Tank kept 6 front-pad groups, but 4 were also excluded (source auto_match_removed),
-- so Find parts showed 3. Two engine gaps in part_match_conflict_keep:
--   1. Keep(A) excluded group B even when B was already kept on that car (only manual/import listings were protected).
--   2. Keep(A) never removed an earlier auto_match_removed exclusion on A itself.
-- Fix both by editing the live function body in place, then repair rows already in that contradictory state.

DO $$
DECLARE
  v_def text;
  v_old_guard text := 'AND pl.origin IN (''manual'', ''import'')';
  v_old_branch text := 'IF c.conflict_type = ''oe_ambiguous'' AND c.detail ? ''group_ids'' THEN';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'part_match_conflict_keep';

  IF v_def IS NULL
     OR position(v_old_guard IN v_def) = 0
     OR position(v_old_branch IN v_def) = 0 THEN
    RAISE EXCEPTION 'part_match_conflict_keep: expected text not found; not changed';
  END IF;

  -- 1. An earlier Keep counts as a decision: supersede, don't exclude.
  v_def := replace(v_def, v_old_guard, 'AND pl.origin IN (''manual'', ''import'', ''auto_match_kept'')');

  -- 2. Keeping a group lifts any earlier auto-match removal of that group on this car.
  v_def := replace(v_def, v_old_branch,
    'DELETE FROM public.part_listing_exclusion ex
    WHERE ex.interchange_group_id = v_group
      AND ex.vehicle_catalog_id = c.vehicle_catalog_id
      AND ex.source = ''auto_match_removed'';

    ' || v_old_branch);

  EXECUTE v_def;
END;
$$;

-- Repair: an auto-match removal that contradicts a Keep on the same car and group is void.
DELETE FROM public.part_listing_exclusion ex
WHERE ex.source = 'auto_match_removed'
  AND EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.interchange_group_id = ex.interchange_group_id
      AND pl.vehicle_catalog_id = ex.vehicle_catalog_id
      AND pl.origin = 'auto_match_kept'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.part_listing_exclusion ex
    JOIN public.part_listing pl
      ON pl.interchange_group_id = ex.interchange_group_id
     AND pl.vehicle_catalog_id = ex.vehicle_catalog_id
     AND pl.origin = 'auto_match_kept'
    WHERE ex.source = 'auto_match_removed'
  ) THEN
    RAISE EXCEPTION 'kept-and-removed contradictions remain';
  END IF;
END;
$$;
