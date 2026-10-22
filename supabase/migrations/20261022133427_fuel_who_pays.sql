-- Fuel who-pays: week leftover override, implausible-fill acceptance, Jamaica trip dates.
-- Dry-run the date move first:
--   select id, date, (payload_json->>'date') as stored
--   from fleet.trips
--   where (payload_json->>'date') ~ 'Z$'
--     and date is distinct from (((payload_json->>'date')::timestamptz at time zone 'America/Jamaica')::date);

alter table public.fuel_reconciliation_period
  add column if not exists leftover_split_override jsonb,
  add column if not exists implausible_fills_reviewed_at timestamptz,
  add column if not exists implausible_fills_review_note text;

-- Move only trips whose stored instant is UTC and whose Jamaica calendar day differs.
update fleet.trips
set date = ((payload_json->>'date')::timestamptz at time zone 'America/Jamaica')::date
where (payload_json->>'date') ~ 'Z$'
  and date is distinct from (((payload_json->>'date')::timestamptz at time zone 'America/Jamaica')::date);
