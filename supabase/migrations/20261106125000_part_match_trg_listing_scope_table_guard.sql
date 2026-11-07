-- part_match_trg_listing_scope also fires on part_listing_exclusion, which has no verified_by column.
-- On UPDATE of an exclusion (e.g. admin_exclude_listing upsert) the backfill-report step failed with
-- 42703 "column n.verified_by does not exist". Run that step for part_listing only; rest unchanged.

CREATE OR REPLACE FUNCTION public.part_match_trg_listing_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'part_listing' THEN
    -- Statement-level trigger: OLD/NEW are NULL, so compare the transition tables.
    UPDATE public.part_norm_position_backfill_report r
    SET resolved_at = now(),
        resolved_by = n.verified_by,
        resolution_source = 'listing_edit'
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE r.resolved_at IS NULL
      AND r.table_name = 'part_listing'
      AND r.row_id = n.id
      AND (o.position IS DISTINCT FROM n.position OR o.side IS DISTINCT FROM n.side);
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT n.interchange_group_id AS gid, n.vehicle_catalog_id AS vid FROM new_rows n
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT o.interchange_group_id AS gid, o.vehicle_catalog_id AS vid FROM old_rows o
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $function$;
