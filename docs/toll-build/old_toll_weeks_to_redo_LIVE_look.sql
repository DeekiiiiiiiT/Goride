-- Old toll removal, round D0 (read-only, changes nothing).
-- Lists every driver week that has tolls in the OLD system but is NOT closed yet.
-- Those weeks now take their tolls from the new system, so their toll files must be uploaded again in
-- Week Reconciliation (step 1) and the week sealed (step 3). Closed weeks are frozen and are not listed.
WITH old_tolls AS (
  SELECT t.driver_id, date_trunc('week', t.date)::date AS week_start, count(*) AS old_toll_rows, sum(t.amount) AS old_amount
  FROM fleet.toll_ledger t
  WHERE t.organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823' AND t.date IS NOT NULL AND t.driver_id IS NOT NULL
  GROUP BY 1, 2
)
SELECT o.week_start, coalesce(d.name, o.driver_id) AS driver, o.old_toll_rows, round(o.old_amount, 2) AS old_amount,
       coalesce(p.status, 'no driver week yet') AS driver_week_status
FROM old_tolls o
LEFT JOIN ledger.driver_financial_periods p
  ON p.organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823' AND p.driver_id = o.driver_id AND p.period_anchor = o.week_start
LEFT JOIN fleet.drivers d
  ON d.organization_id::text = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823' AND (d.id::text = o.driver_id OR d.legacy_kv_id = o.driver_id)
WHERE NOT (p.closed_at IS NOT NULL
           OR lower(coalesce(p.status, '')) = 'closed'
           OR coalesce((p.metadata ->> 'periodFrozen')::boolean, false)
           OR coalesce((p.metadata ->> 'signedWeek')::boolean, false))
   OR p.driver_id IS NULL
ORDER BY o.week_start, driver;
