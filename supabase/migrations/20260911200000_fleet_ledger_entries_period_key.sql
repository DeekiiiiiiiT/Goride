-- Block E: populate period_key + currency coalesce; keep security_invoker on public wrappers

CREATE OR REPLACE VIEW fleet.ledger_entries AS
SELECT
  t.id AS entry_id,
  t.organization_id,
  'trip'::text AS entry_type,
  coalesce(t.platform, 'unknown') AS source_system,
  t.id AS source_id,
  (t.date::timestamp AT TIME ZONE 'UTC') AS occurred_at,
  t.created_at AS posted_at,
  to_char(date_trunc('week', t.date::timestamp), 'IYYY-"W"IW') AS period_key,
  t.driver_id,
  t.vehicle_id,
  t.batch_id,
  'inflow'::text AS direction,
  t.amount AS amount_gross,
  coalesce(
    t.net_to_driver,
    NULLIF(t.payload_json->>'indriveNetIncome', '')::numeric
  ) AS amount_net,
  coalesce(NULLIF(t.payload_json->>'currency', ''), 'USD')::char(3) AS currency,
  t.status,
  jsonb_build_object(
    'lines_match', t.payload_json->'paymentLineRollupMatch',
    'cash_collected', t.payload_json->'cashCollected'
  ) AS integrity_flags,
  t.payload_json
FROM fleet.trips t

UNION ALL

SELECT
  f.id AS entry_id,
  f.organization_id,
  'fuel'::text AS entry_type,
  coalesce(f.payment_source, 'fuel') AS source_system,
  f.id AS source_id,
  (f.date::timestamp AT TIME ZONE 'UTC') AS occurred_at,
  f.created_at AS posted_at,
  to_char(date_trunc('week', f.date::timestamp), 'IYYY-"W"IW') AS period_key,
  f.driver_id,
  f.vehicle_id,
  NULL::text AS batch_id,
  'outflow'::text AS direction,
  f.amount AS amount_gross,
  f.amount AS amount_net,
  coalesce(NULLIF(f.payload_json->>'currency', ''), 'USD')::char(3) AS currency,
  f.type AS status,
  '{}'::jsonb AS integrity_flags,
  f.payload_json
FROM fleet.fuel_entries f

UNION ALL

SELECT
  l.id AS entry_id,
  l.organization_id,
  'toll'::text AS entry_type,
  coalesce(l.payment_method, 'toll') AS source_system,
  l.id AS source_id,
  (l.date::timestamp AT TIME ZONE 'UTC') AS occurred_at,
  l.created_at AS posted_at,
  to_char(date_trunc('week', l.date::timestamp), 'IYYY-"W"IW') AS period_key,
  l.driver_id,
  l.vehicle_id,
  l.batch_id,
  'outflow'::text AS direction,
  abs(coalesce(l.amount, 0)) AS amount_gross,
  abs(coalesce(l.amount, 0)) AS amount_net,
  coalesce(NULLIF(l.payload_json->>'currency', ''), 'USD')::char(3) AS currency,
  l.status,
  jsonb_build_object(
    'is_reconciled', l.is_reconciled,
    'resolution', l.resolution,
    'trip_id', l.trip_id
  ) AS integrity_flags,
  l.payload_json
FROM fleet.toll_ledger l;

CREATE OR REPLACE VIEW public.fleet_ledger_entries
WITH (security_invoker = true) AS
SELECT * FROM fleet.ledger_entries;

REVOKE ALL ON TABLE public.fleet_ledger_entries FROM PUBLIC, anon;
