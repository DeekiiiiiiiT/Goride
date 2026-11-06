-- M-13 alert lifecycle columns + migration helper + supersede on recompute.

ALTER TABLE fleet.maintenance_alerts
  ADD COLUMN IF NOT EXISTS component_schedule_id uuid
    REFERENCES public.vehicle_component_schedule (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_km numeric,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_reason text;

ALTER TABLE fleet.maintenance_alerts
  DROP CONSTRAINT IF EXISTS fleet_maintenance_alerts_status_check;

ALTER TABLE fleet.maintenance_alerts
  ADD CONSTRAINT fleet_maintenance_alerts_status_check
  CHECK (
    status IS NULL
    OR status IN ('open', 'resolved', 'superseded')
  );

ALTER TABLE fleet.maintenance_alerts
  DROP CONSTRAINT IF EXISTS fleet_maintenance_alerts_resolution_reason_check;

ALTER TABLE fleet.maintenance_alerts
  ADD CONSTRAINT fleet_maintenance_alerts_resolution_reason_check
  CHECK (
    resolution_reason IS NULL
    OR resolution_reason IN (
      'performed',
      'rule_changed',
      'schedule_retired',
      'migrated_daily_row',
      'manual'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_maint_alert_open_part
  ON fleet.maintenance_alerts (
    organization_id,
    vehicle_id,
    category_id,
    coalesce(position, '-')
  )
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.maintenance_alerts_supersede_open(
  p_schedule_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE fleet.maintenance_alerts a
  SET
    status = 'superseded',
    resolution_reason = coalesce(p_reason, 'rule_changed'),
    resolved_at = now()
  WHERE a.component_schedule_id = p_schedule_id
    AND a.status = 'open';
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_alerts_migrate_daily_rows()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_groups int := 0;
  v_open int := 0;
  v_super int := 0;
BEGIN
  WITH ranked AS (
    SELECT
      a.id,
      a.organization_id,
      a.vehicle_id,
      a.category_id,
      a.position,
      row_number() OVER (
        PARTITION BY a.organization_id, a.vehicle_id, a.category_id, coalesce(a.position, '-')
        ORDER BY a.created_at DESC, a.id DESC
      ) AS rn
    FROM fleet.maintenance_alerts a
    WHERE a.status IS NULL
  ),
  winners AS (
    SELECT id FROM ranked WHERE rn = 1
  )
  UPDATE fleet.maintenance_alerts a
  SET status = 'open'
  FROM ranked r
  WHERE a.id = r.id
    AND r.rn = 1
    AND a.status IS NULL;

  GET DIAGNOSTICS v_open = ROW_COUNT;

  UPDATE fleet.maintenance_alerts a
  SET
    status = 'superseded',
    resolution_reason = 'migrated_daily_row',
    resolved_at = now()
  WHERE a.status IS NULL;

  GET DIAGNOSTICS v_super = ROW_COUNT;

  UPDATE fleet.maintenance_alerts a
  SET component_schedule_id = vcs.id
  FROM public.vehicle_component_schedule vcs
  WHERE a.status = 'open'
    AND a.component_schedule_id IS NULL
    AND vcs.organization_id = a.organization_id
    AND vcs.vehicle_id = a.vehicle_id
    AND vcs.category_id = a.category_id
    AND vcs.position IS NOT DISTINCT FROM a.position;

  SELECT count(DISTINCT (
    a.organization_id, a.vehicle_id, a.category_id, coalesce(a.position, '-')
  ))::int
  INTO v_groups
  FROM fleet.maintenance_alerts a
  WHERE a.status IS NOT NULL;

  RETURN jsonb_build_object(
    'groups', v_groups,
    'opened', v_open,
    'superseded', v_super
  );
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_alerts_supersede_open(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_alerts_migrate_daily_rows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_alerts_migrate_daily_rows() TO service_role;
