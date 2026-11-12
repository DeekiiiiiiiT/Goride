# Cursor prompt — Toll R1b: make every link carry the company

Edit **the existing file** `supabase/migrations/20261112183806_toll_v2_foundations.sql` in place (it is not live or committed yet; do not create a new migration).

## Why
Today `toll.allocations.charge_id` (and every other link) points at `toll.charges(id)` alone, so the database would accept an allocation of company A pointing at a toll of company B. Every link must include the company, so a cross-company link is impossible in the database itself.

## Changes
1. On each table that other tables point at, add `UNIQUE (organization_id, id)`: `charges`, `paybacks`, `decisions`, `carried_facts`, `tag_accounts`, `suggestions`.
2. Replace every single-column foreign key between toll tables with a two-column one, `(organization_id, <col>) REFERENCES toll.<table> (organization_id, id)`. The full list:
   - `charges.duplicate_of`, `charges.adjusts_charge_id` → charges
   - `charge_changes.charge_id` → charges; `charge_changes.decision_id` → decisions
   - `paybacks.reversal_of` → paybacks
   - `tag_topups.tag_account_id` → tag_accounts
   - `carried_facts.decision_id` → decisions
   - `allocations.charge_id` → charges; `allocations.payback_id` → paybacks; `allocations.decision_id` → decisions
   - `payback_unlinked_decisions.payback_id` → paybacks; `.carried_fact_id` → carried_facts; `.decision_id` → decisions
   - `duplicate_reviews.charge_a`, `.charge_b` → charges; `.decision_id` → decisions
   - `suggestions.charge_id` → charges; `.payback_id` → paybacks; `.superseded_by` → suggestions

   Keep the default `MATCH SIMPLE`, so a NULL link is still allowed where the column is nullable.
3. `paybacks.updated_at` → `timestamptz NOT NULL DEFAULT now()` (same as the other tables).

## Test (add to `supabase/tests/toll_v2_schema_checks.sql` as check 9)
Inside the rolled-back transaction, as `postgres`:
- insert a decision and a charge for company A, and a decision for company B;
- an allocation for **company B** pointing at company A's charge must **fail** (foreign key violation);
- the same allocation for company A, with company A's decision, must succeed.

Also add a check that **no** foreign key on the 17 new toll tables is single-column (query `pg_constraint` where `contype = 'f'` and `conrelid` is one of the tables: every one must have 2 columns, the first being `organization_id`).

## Run locally (once)
`npx supabase db reset`, `node scripts/validate-migration-sql.mjs`, then run the test with `docker cp` + `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql`. If it fails, report the error and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents or full SQL — I'll read the files. Do not commit, branch or push. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
