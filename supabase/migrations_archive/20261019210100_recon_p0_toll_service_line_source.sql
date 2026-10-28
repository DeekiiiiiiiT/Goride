-- Week Reconciliation P0: toll service_line provenance (mirror fuel Phase 0).
-- See WEEK_RECONCILIATION_WIZARD_AUDIT.md §WR-C2 / FUEL_SERVICE_LINE_SPLIT_DECISIONS.md.

ALTER TABLE fleet.toll_ledger
  ADD COLUMN IF NOT EXISTS service_line_source text,
  ADD COLUMN IF NOT EXISTS service_line_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_line_set_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fleet_toll_ledger_service_line_source_chk'
  ) THEN
    ALTER TABLE fleet.toll_ledger
      ADD CONSTRAINT fleet_toll_ledger_service_line_source_chk
      CHECK (
        service_line_source IS NULL
        OR service_line_source IN (
          'program', 'explicit', 'trip', 'vehicle', 'driver', 'unattributed', 'org'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN fleet.toll_ledger.service_line_source IS
  'How service_line was resolved: program|explicit|trip|vehicle|driver|unattributed|org (tag top-ups). explicit is sticky.';
COMMENT ON COLUMN fleet.toll_ledger.service_line_set_at IS
  'Set only when service_line_source = explicit.';
COMMENT ON COLUMN fleet.toll_ledger.service_line_set_by IS
  'Actor uuid when service_line_source = explicit.';

CREATE INDEX IF NOT EXISTS fleet_toll_ledger_org_service_line_date_idx
  ON fleet.toll_ledger (organization_id, service_line, date DESC);

-- Legacy trip-stamped rows (service_line set, source missing) → source trip.
UPDATE fleet.toll_ledger
SET
  service_line_source = 'trip',
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line', service_line,
    'serviceLine', service_line,
    'service_line_source', 'trip',
    'serviceLineSource', 'trip'
  )
WHERE service_line IN ('rideshare', 'rush_delivery')
  AND service_line_source IS NULL
  AND lower(coalesce(type, '')) NOT IN ('top_up', 'top-up', 'topup', 'toll top-up');

-- Trip link (fills null lines; skips tag top-ups).
UPDATE fleet.toll_ledger tl
SET
  service_line = CASE
    WHEN t.service_line IN ('rideshare', 'rush_delivery') THEN t.service_line
    WHEN t.platform = 'Roam Rush' THEN 'rush_delivery'
    ELSE 'rideshare'
  END,
  service_line_source = 'trip',
  payload_json = COALESCE(tl.payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line', CASE
      WHEN t.service_line IN ('rideshare', 'rush_delivery') THEN t.service_line
      WHEN t.platform = 'Roam Rush' THEN 'rush_delivery'
      ELSE 'rideshare'
    END,
    'serviceLine', CASE
      WHEN t.service_line IN ('rideshare', 'rush_delivery') THEN t.service_line
      WHEN t.platform = 'Roam Rush' THEN 'rush_delivery'
      ELSE 'rideshare'
    END,
    'service_line_source', 'trip',
    'serviceLineSource', 'trip'
  )
FROM fleet.trips t
WHERE tl.trip_id IS NOT NULL
  AND tl.trip_id = t.id
  AND tl.service_line IS NULL
  AND COALESCE(tl.service_line_source, '') IS DISTINCT FROM 'explicit'
  AND lower(coalesce(tl.type, '')) NOT IN ('top_up', 'top-up', 'topup', 'toll top-up');

-- T3: exactly one vehicle service_line → attribute.
UPDATE fleet.toll_ledger tl
SET
  service_line = v.service_lines[1],
  service_line_source = 'vehicle',
  payload_json = COALESCE(tl.payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line', v.service_lines[1],
    'serviceLine', v.service_lines[1],
    'service_line_source', 'vehicle',
    'serviceLineSource', 'vehicle'
  )
FROM fleet.vehicles v
WHERE tl.vehicle_id IS NOT NULL
  AND tl.vehicle_id = v.id
  AND tl.service_line IS NULL
  AND COALESCE(tl.service_line_source, '') IS DISTINCT FROM 'explicit'
  AND cardinality(v.service_lines) = 1
  AND v.service_lines[1] IN ('rideshare', 'rush_delivery')
  AND lower(coalesce(tl.type, '')) NOT IN ('top_up', 'top-up', 'topup', 'toll top-up');

-- Tag account top-ups: org-scoped, no service line (not rideshare/delivery spend).
UPDATE fleet.toll_ledger
SET
  service_line = NULL,
  service_line_source = 'org',
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line_source', 'org',
    'serviceLineSource', 'org'
  )
WHERE lower(coalesce(type, '')) IN ('top_up', 'top-up', 'topup', 'toll top-up')
  AND COALESCE(service_line_source, '') IS DISTINCT FROM 'explicit';

-- Remaining null lines → unattributed (visible bucket).
UPDATE fleet.toll_ledger
SET
  service_line_source = 'unattributed',
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line_source', 'unattributed',
    'serviceLineSource', 'unattributed'
  )
WHERE service_line IS NULL
  AND COALESCE(service_line_source, '') IS DISTINCT FROM 'explicit'
  AND COALESCE(service_line_source, '') IS DISTINCT FROM 'org'
  AND (service_line_source IS NULL OR service_line_source <> 'unattributed');

CREATE OR REPLACE VIEW public.fleet_toll_ledger
WITH (security_invoker = true) AS
  SELECT * FROM fleet.toll_ledger;

GRANT SELECT ON public.fleet_toll_ledger TO authenticated;
GRANT ALL ON public.fleet_toll_ledger TO service_role;

NOTIFY pgrst, 'reload schema';
