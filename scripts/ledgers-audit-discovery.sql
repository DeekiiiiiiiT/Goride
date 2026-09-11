-- Ledgers audit §13 discovery queries (read-only).
-- Run against production/staging before enabling STRICT_ORG_FILTER.

-- Q1: feature flag
-- SELECT * FROM feature_flags WHERE key ILIKE '%strict_org%';

-- Q2: row counts
SELECT 'trips' AS domain, count(*) FROM fleet.trips
UNION ALL
SELECT 'fuel_entries', count(*) FROM fleet.fuel_entries
UNION ALL
SELECT 'toll_ledger', count(*) FROM fleet.toll_ledger;

-- Q3: missing netToDriver by platform
SELECT platform,
       count(*) AS total,
       count(*) FILTER (WHERE payload_json->>'netToDriver' IS NULL) AS missing_net
FROM fleet.trips
GROUP BY platform
ORDER BY 2 DESC;

-- Q4: org buckets (tenancy leak surface)
SELECT coalesce(organization_id, '(null)') AS organization_id, count(*)
FROM fleet.trips
GROUP BY 1
ORDER BY 2 DESC;

-- Q5: amount mirror drift
SELECT count(*) AS drifted_amount_rows
FROM fleet.trips
WHERE amount IS DISTINCT FROM (payload_json->>'amount')::numeric;
