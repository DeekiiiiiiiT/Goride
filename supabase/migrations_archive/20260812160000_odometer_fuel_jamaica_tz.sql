-- Fleet Jamaica defaults: fuel ledger timestamps use America/Jamaica wall clock.
-- Multi-timezone / multi-currency unlock later (org profile); no FX API for clock sorting.
-- Applied live 2026-08-12; kept for repo history / re-runs.

UPDATE fleet.odometer_readings o
SET
  recorded_at = CASE
    WHEN COALESCE(f.payload_json->>'time', '') ~ '^[0-9]{1,2}:[0-9]{2}'
      AND COALESCE(f.payload_json->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      THEN (
        (
          left(f.payload_json->>'date', 10)
          || ' '
          || lpad(split_part(f.payload_json->>'time', ':', 1), 2, '0')
          || ':'
          || lpad(split_part(f.payload_json->>'time', ':', 2), 2, '0')
          || ':'
          || COALESCE(NULLIF(lpad(split_part(f.payload_json->>'time', ':', 3), 2, '0'), ''), '00')
        )::timestamp AT TIME ZONE 'America/Jamaica'
      )
    WHEN COALESCE(f.payload_json->>'date', '') ~ 'T[0-9]{1,2}:[0-9]{2}'
      AND COALESCE(f.payload_json->>'date', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
      THEN (
        replace(left(f.payload_json->>'date', 19), 'T', ' ')::timestamp
        AT TIME ZONE 'America/Jamaica'
      )
    WHEN COALESCE(f.payload_json->>'date', '') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
      THEN (f.payload_json->>'date')::timestamptz
    WHEN COALESCE(f.payload_json->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN ((left(f.payload_json->>'date', 10) || ' 12:00:00')::timestamp AT TIME ZONE 'America/Jamaica')
    ELSE o.recorded_at
  END,
  updated_at = now()
FROM fleet.fuel_entries f
WHERE o.source = 'fuel'
  AND o.reference_id = f.id
  AND o.is_voided = false;
