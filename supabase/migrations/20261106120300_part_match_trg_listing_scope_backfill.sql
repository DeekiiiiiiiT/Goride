-- part_match_trg_listing_scope: resolve norm backfill reports by table_name/row_id on listing edit
-- Depends on 20261107130000_part_match_archive_removal_cause.sql

CREATE OR REPLACE FUNCTION public.part_match_trg_listing_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.part_norm_position_backfill_report r
    SET resolved_at = now(), resolved_by = NEW.verified_by, resolution_source = 'listing_edit'
    WHERE r.resolved_at IS NULL
      AND r.table_name = 'part_listing'
      AND r.row_id = NEW.id
      AND (OLD.position IS DISTINCT FROM NEW.position OR OLD.side IS DISTINCT FROM NEW.side);
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
END; $$;

REVOKE ALL ON FUNCTION public.part_match_trg_listing_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_trg_listing_scope() TO service_role;
