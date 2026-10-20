#!/usr/bin/env node
/**
 * Week Reconciliation P0 — READ-ONLY retro report helper.
 *
 * Does not connect to the database or write anything. Prints human instructions
 * and copy-paste SQL to find closed org-weeks that may lack toll usage / fuel
 * statement coverage (pre–import-batch toll/fuel sources).
 *
 * Run after applying 20261019210200_recon_p0_import_batches_coverage.sql.
 *
 * Usage:
 *   node scripts/recon-closed-week-source-retro.mjs
 *
 * Optional env (informational only — this script never uses credentials):
 *   SUPABASE_PROJECT_REF — defaults to csfllzzastacofsvcdsc
 */

const projectRef = process.env.SUPABASE_PROJECT_REF || "csfllzzastacofsvcdsc";

const sql = `-- Week Reconciliation P0 retro: closed weeks possibly missing toll/fuel inputs
-- READ ONLY. Run in Supabase SQL editor or psql against project ${projectRef}.
-- Interpretation: rows flagged here closed (fuel locked and/or earnings week-close lock)
-- but show zero toll usage rows and/or zero gas-card fuel rows in that Mon–Sun week.
-- Toll/fuel CSV imports did not write import_batches before P2; absence of batch rows
-- for toll_usage / fuel_card is expected until P2 — row counts are the signal.

WITH closed_weeks AS (
  SELECT DISTINCT
    f.org_id::text AS organization_id,
    f.week_start::date AS week_key
  FROM public.fuel_reconciliation_period f
  WHERE f.status = 'locked'

  UNION

  SELECT DISTINCT
    w.organization_id::text,
    w.week_key::date
  FROM ledger.week_close_locks w
),
week_span AS (
  SELECT
    c.organization_id,
    c.week_key,
    c.week_key AS week_start,
    (c.week_key + interval '6 days')::date AS week_end
  FROM closed_weeks c
  WHERE extract(isodow FROM c.week_key) = 1
),
org_has_tag AS (
  SELECT organization_id, true AS has_tag
  FROM fleet.toll_tags
  WHERE organization_id IS NOT NULL
  GROUP BY organization_id
),
uber_batch AS (
  SELECT
    w.organization_id,
    w.week_key,
    coalesce(
      bool_or(
        ib.source_id = 'uber_bundle'
        AND ib.status IN ('completed', 'committed')
        AND w.week_key = ANY (ib.week_keys)
      ),
      false
    ) AS has_uber_batch
  FROM week_span w
  LEFT JOIN fleet.import_batches ib
    ON ib.organization_id = w.organization_id
  GROUP BY w.organization_id, w.week_key
),
toll_usage AS (
  SELECT
    w.organization_id,
    w.week_key,
    count(*) FILTER (
      WHERE lower(coalesce(tl.type, '')) NOT IN ('top_up', 'top-up', 'topup', 'toll top-up')
        AND coalesce(tl.status, '') NOT ILIKE 'void%'
    ) AS usage_rows
  FROM week_span w
  LEFT JOIN fleet.toll_ledger tl
    ON tl.organization_id = w.organization_id
   AND tl.date >= w.week_start
   AND tl.date <= w.week_end
  GROUP BY w.organization_id, w.week_key
),
fuel_card AS (
  SELECT
    w.organization_id,
    w.week_key,
    count(*) FILTER (
      WHERE coalesce(fe.payment_method, fe.payload_json->>'paymentMethod', '') ILIKE '%card%'
    ) AS card_fuel_rows
  FROM week_span w
  LEFT JOIN fleet.fuel_entries fe
    ON fe.organization_id = w.organization_id
   AND fe.date >= w.week_start
   AND fe.date <= w.week_end
  GROUP BY w.organization_id, w.week_key
)
SELECT
  w.organization_id,
  w.week_key,
  w.week_start,
  w.week_end,
  coalesce(u.has_uber_batch, false) AS has_uber_import_batch,
  coalesce(t.usage_rows, 0) AS toll_usage_rows,
  coalesce(f.card_fuel_rows, 0) AS fuel_card_rows,
  coalesce(o.has_tag, false) AS org_has_toll_tag,
  CASE
    WHEN coalesce(o.has_tag, false) AND coalesce(t.usage_rows, 0) = 0 THEN 'possible_missing_toll_usage'
    ELSE NULL
  END AS toll_flag,
  CASE
    WHEN coalesce(f.card_fuel_rows, 0) = 0 THEN 'possible_missing_fuel_statement'
    ELSE NULL
  END AS fuel_flag
FROM week_span w
LEFT JOIN uber_batch u USING (organization_id, week_key)
LEFT JOIN toll_usage t USING (organization_id, week_key)
LEFT JOIN fuel_card f USING (organization_id, week_key)
LEFT JOIN org_has_tag o ON o.organization_id = w.organization_id
WHERE (
  (coalesce(o.has_tag, false) AND coalesce(t.usage_rows, 0) = 0)
  OR coalesce(f.card_fuel_rows, 0) = 0
)
ORDER BY w.week_key DESC, w.organization_id;
`;

console.log(`
Week Reconciliation — closed-week source retro (READ ONLY)
==========================================================

This script does not query Supabase. Copy the SQL below into the Supabase SQL
editor for project: ${projectRef}

Goal: list org-weeks that were closed while toll usage and/or fuel card activity
may never have been imported. Review manually; do not auto-reopen weeks.

Steps:
  1. Open Supabase Dashboard → SQL → New query
  2. Paste the SQL block below
  3. Export results and hand to the product owner

--- SQL START ---
`);
console.log(sql.trim());
console.log(`
--- SQL END ---
`);
