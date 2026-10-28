-- One-line fleet fallback must not reuse org (that source means tag top-up).
ALTER TABLE fleet.toll_ledger DROP CONSTRAINT IF EXISTS fleet_toll_ledger_service_line_source_chk;

ALTER TABLE fleet.toll_ledger
  ADD CONSTRAINT fleet_toll_ledger_service_line_source_chk
  CHECK (
    service_line_source IS NULL
    OR service_line_source IN (
      'program', 'explicit', 'trip', 'vehicle', 'driver', 'unattributed', 'org', 'org_default'
    )
  );

COMMENT ON COLUMN fleet.toll_ledger.service_line_source IS
  'How service_line was resolved: program|explicit|trip|vehicle|driver|unattributed|org (tag top-ups)|org_default (single-line fleet fallback). explicit is sticky.';

-- Kenny Sep 11 personal toll: typed source was org, payload still said unattributed.
-- Amount, claim, and charge stay as they are.
UPDATE fleet.toll_ledger
SET
  service_line_source = 'org_default',
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line', 'rideshare',
    'serviceLine', 'rideshare',
    'service_line_source', 'org_default',
    'serviceLineSource', 'org_default'
  )
WHERE id = '090bd599-309f-4949-aab5-f83dc214aedf'
  AND service_line = 'rideshare'
  AND service_line_source = 'org';

-- Sep 12 is already explicit on the column. Align the stale payload so the
-- rideshare screen does not still read unattributed.
UPDATE fleet.toll_ledger
SET
  payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object(
    'service_line', service_line,
    'serviceLine', service_line,
    'service_line_source', service_line_source,
    'serviceLineSource', service_line_source
  )
WHERE id = 'ea0380fb-bc98-47fd-b597-e1d1ca0a0027'
  AND service_line = 'rideshare'
  AND service_line_source = 'explicit';
