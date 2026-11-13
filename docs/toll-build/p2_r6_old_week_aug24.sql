-- Toll rebuild P2-R6: what the OLD system closed for the week of 24 Aug 2026. Read-only, changes NOTHING.
-- One result row. Claude compares it to the new system's answer for the same week's files.
SELECT jsonb_pretty(jsonb_build_object(
  -- the closed driver toll statement(s) for the week (latest version per driver)
  'toll_statements', (SELECT coalesce(jsonb_agg(jsonb_build_object('driver', driver_id, 'version', version, 'status', status,
                                                                  'amounts_minor', amounts_minor) ORDER BY driver_id), '[]'::jsonb)
                      FROM (SELECT DISTINCT ON (organization_id, driver_id) *
                            FROM ledger.week_statements
                            WHERE kind = 'toll' AND week_key = '2026-08-24'
                            ORDER BY organization_id, driver_id, version DESC) s),
  -- every old toll ledger row in the week
  'toll_ledger_rows', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', date, 'type', type, 'payment', payment_method,
                                                                    'amount', amount, 'status', status, 'plaza', plaza,
                                                                    'trip', left(coalesce(trip_id, ''), 8)) ORDER BY date), '[]'::jsonb)
                       FROM fleet.toll_ledger
                       WHERE date >= '2026-08-24' AND date < '2026-08-31' AND coalesce(status, '') <> 'voided'),
  -- Uber trips in the week with a toll, as the old import saw them
  'uber_toll_trips', (SELECT coalesce(jsonb_agg(jsonb_build_object('trip', left(coalesce(payload_json ->> 'tripId', payload_json ->> 'id', ''), 8),
                                                                   'date', date, 'payment', payment_method,
                                                                   'toll', payload_json ->> 'tollCharges') ORDER BY date), '[]'::jsonb)
                      FROM fleet.trips
                      WHERE platform ILIKE 'uber' AND date >= '2026-08-24' AND date < '2026-08-31'
                        AND coalesce((payload_json ->> 'tollCharges')::numeric, 0) <> 0)
)) AS old_week_aug24;
