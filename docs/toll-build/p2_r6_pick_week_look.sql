-- Toll rebuild P2-R6: which real week to test end to end. Read-only, changes NOTHING.
-- One row per week (last 20 weeks): tag crossings, top-ups and driver cash tolls in the old toll ledger,
-- Uber trips with a toll payback (card / cash), and whether the week has driver toll statements (closed in recon).
WITH wk AS (
  SELECT date_trunc('week', date)::date AS week_monday,
         count(*) FILTER (WHERE type = 'usage' AND payment_method ILIKE '%tag%') AS tag_crossings,
         count(*) FILTER (WHERE type ILIKE '%top%')                              AS topups,
         count(*) FILTER (WHERE payment_method ILIKE 'cash')                     AS driver_cash_tolls
  FROM fleet.toll_ledger
  WHERE coalesce(status, '') <> 'voided' AND date >= current_date - 140
  GROUP BY 1),
ub AS (
  SELECT date_trunc('week', date)::date AS week_monday,
         count(*)                                              AS uber_toll_trips,
         count(*) FILTER (WHERE payment_method ILIKE 'cash')   AS uber_cash_toll_trips
  FROM fleet.trips
  WHERE platform ILIKE 'uber'
    AND coalesce((payload_json ->> 'tollCharges')::numeric, 0) <> 0
  GROUP BY 1),
st AS (
  SELECT week_key AS week_monday, count(*) FILTER (WHERE status = 'closed') AS driver_toll_statements
  FROM ledger.week_statements
  WHERE kind = 'toll'
  GROUP BY 1)
SELECT wk.week_monday, wk.tag_crossings, wk.topups, wk.driver_cash_tolls,
       coalesce(ub.uber_toll_trips, 0)       AS uber_toll_trips,
       coalesce(ub.uber_cash_toll_trips, 0)  AS uber_cash_toll_trips,
       coalesce(st.driver_toll_statements, 0) AS driver_toll_statements
FROM wk
LEFT JOIN ub USING (week_monday)
LEFT JOIN st USING (week_monday)
ORDER BY wk.week_monday DESC;
