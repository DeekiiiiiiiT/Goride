# Cursor prompt — Toll rebuild Phase 0, R1: data layer

Design: `docs/toll-architecture.md` (Part B2, B7; tracker Part F). Build **only** what is below. No edge code, no screens, no changes to existing toll tables or functions.

## Rules
- Create the migration with `npx supabase migration new toll_v2_foundations` (real current UTC time; never pick a date by hand).
- The `toll` schema already exists and holds `toll.brain_policies`, `toll.settlement_allocations`, `toll.mirror_settlement_from_public`. **Do not touch them.** Add new objects beside them.
- Every money amount is `bigint` minor units with `CHECK (amount_minor > 0)`. Every id is `uuid DEFAULT gen_random_uuid()`. Every table has `created_at timestamptz NOT NULL DEFAULT now()`.
- Every table except `toll.plaza_rules` and `toll.audit_log` has `organization_id uuid NOT NULL`, and **every unique key / unique index starts with `organization_id`**.
- Do not git commit, branch or push. Do not touch production.

## 1. Schemas and the company helper
```sql
CREATE SCHEMA IF NOT EXISTS toll_read;
CREATE SCHEMA IF NOT EXISTS toll_write;
CREATE SCHEMA IF NOT EXISTS toll_system;
REVOKE ALL ON SCHEMA toll_read, toll_write, toll_system FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA toll_read, toll_write TO authenticated;
GRANT USAGE ON SCHEMA toll_system TO service_role;
```
`toll_read.current_company()`: `LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''`. It returns
`coalesce(nullif(auth.jwt()->'app_metadata'->>'organizationId',''), nullif(auth.jwt()->'app_metadata'->>'organization_id',''))::uuid`.
**Never read `user_metadata`.** It returns NULL when there is no company. `GRANT EXECUTE` to authenticated only (`REVOKE` from PUBLIC, anon).

## 2. Tables (all in schema `toll`)
| Table | Columns (besides id, organization_id, created_at) | Keys / checks |
|---|---|---|
| `charges` | `vehicle_id text`, `driver_id text`, `plaza_id text`, `occurred_at timestamptz NOT NULL`, `week_key date NOT NULL`, `time_precision text NOT NULL` ('exact','minute','date_only'), `amount_minor`, `currency text NOT NULL DEFAULT 'JMD'`, `paid_by text NOT NULL` ('tag','cash'), `source text NOT NULL` ('tag_statement','driver_cash','roam_ride','manual','legacy'), `source_ref text NOT NULL`, `evidence_status text NOT NULL DEFAULT 'verified'` ('unverified','verified','rejected'), `duplicate_of uuid` → charges, `awaiting_cash boolean NOT NULL DEFAULT false`, `native_ride_id text`, `after_seal boolean NOT NULL DEFAULT false`, `adjusts_charge_id uuid` → charges, `is_legacy boolean NOT NULL DEFAULT false`, `version bigint NOT NULL DEFAULT 1`, `updated_at timestamptz NOT NULL DEFAULT now()` | UNIQUE (organization_id, source, source_ref) |
| `charge_changes` | `charge_id uuid NOT NULL` → charges, `field text NOT NULL` ('amount_minor','week_key'), `old_value text`, `new_value text`, `pending boolean NOT NULL DEFAULT false`, `decision_id uuid` | |
| `platform_trips` | `platform text NOT NULL`, `platform_trip_id text NOT NULL`, `driver_id text`, `vehicle_id text`, `request_at`, `pickup_at`, `dropoff_at` (timestamptz), `time_precision text NOT NULL` (same 3), `payment_method text NOT NULL` ('card','cash','in_app','unknown'), `is_legacy boolean NOT NULL DEFAULT false` | UNIQUE (organization_id, platform, platform_trip_id) |
| `paybacks` | `platform text NOT NULL`, `kind text NOT NULL` ('trip_line','adjustment','native'), `platform_trip_id text`, `reference text NOT NULL`, `driver_id text`, `paid_on date NOT NULL`, `week_key date NOT NULL`, `amount_minor`, `currency text NOT NULL DEFAULT 'JMD'`, `reversal_of uuid` → paybacks, `received_by text NOT NULL` ('fleet','driver'), `after_seal boolean NOT NULL DEFAULT false`, `is_legacy boolean NOT NULL DEFAULT false`, `version bigint NOT NULL DEFAULT 1`, `updated_at` | UNIQUE (organization_id, platform, reference) |
| `allocations` | `charge_id uuid NOT NULL` → charges, `bearer text NOT NULL` ('platform','driver','fleet'), `amount_minor`, `payback_id uuid` → paybacks, `reason text`, `provisional boolean NOT NULL DEFAULT false`, `decision_id uuid NOT NULL`, `reversed_by uuid` | CHECK ((bearer = 'platform') = (payback_id IS NOT NULL)) |
| `carried_facts` | `kind text NOT NULL` ('charge','payback','take_back','correction_up','correction_down','cash_recovered'), `original_id uuid NOT NULL`, `from_week date NOT NULL`, `to_week date NOT NULL`, `amount_minor`, `bearer text` ('fleet','driver' or NULL), `version bigint NOT NULL DEFAULT 1`, `decision_id uuid NOT NULL` | CHECK (to_week > from_week) |
| `payback_unlinked_decisions` | `payback_id uuid` → paybacks, `carried_fact_id uuid` → carried_facts, `amount_minor`, `reason text NOT NULL`, `decision_id uuid NOT NULL`, `reversed_by uuid` | CHECK (exactly one of payback_id, carried_fact_id is set) |
| `duplicate_reviews` | `charge_a uuid NOT NULL`, `charge_b uuid NOT NULL` (both → charges), `status text NOT NULL DEFAULT 'open'` ('open','confirmed','released'), `decision_id uuid`, `updated_at` | CHECK (charge_a < charge_b); UNIQUE (organization_id, charge_a, charge_b) |
| `decisions` | `command_id text NOT NULL`, `intent text NOT NULL`, `actor text NOT NULL` ('user','system','staff'), `actor_user_id uuid`, `actor_job text`, `acting_company uuid`, `reason_code text`, `note text`, `targets jsonb NOT NULL DEFAULT '{}'`, `versions jsonb NOT NULL DEFAULT '{}'`, `engine_version text`, `response jsonb`, `response_truncated boolean NOT NULL DEFAULT false` | UNIQUE (organization_id, command_id); CHECK (actor <> 'system' OR actor_job IS NOT NULL); CHECK (response IS NULL OR octet_length(response::text) <= 65536) |
| `suggestions` | `charge_id uuid NOT NULL`, `payback_id uuid NOT NULL`, `score_parts jsonb NOT NULL`, `rules_fired text[] NOT NULL`, `engine_version text NOT NULL`, `inputs jsonb NOT NULL`, `inputs_hash text NOT NULL`, `superseded_by uuid` | |
| `tag_accounts` | `provider text NOT NULL`, `account_ref text NOT NULL`, `vehicle_id text`, `currency text NOT NULL DEFAULT 'JMD'` | UNIQUE (organization_id, provider, account_ref) |
| `tag_topups` | `tag_account_id uuid NOT NULL` → tag_accounts, `amount_minor`, `topped_up_on date NOT NULL`, `week_key date NOT NULL`, `source_ref text NOT NULL` | UNIQUE (organization_id, source_ref) |
| `platform_settings` | `platform text NOT NULL`, `pays_tolls_back boolean NOT NULL DEFAULT true`, `payback_mode text NOT NULL` ('per_trip','adjustments','none','native'), `matching_window_seconds int NOT NULL DEFAULT 600`, `auto_apply boolean NOT NULL DEFAULT false`, `adapter_version text`, `updated_at` | PRIMARY KEY (organization_id, platform) — no separate id |
| `plaza_rules` | **no organization_id** (national reference data, set only by a platform owner): `plaza_id text PRIMARY KEY`, `auto_duplicate_window_minutes int NOT NULL DEFAULT 10`, `review_duplicate_window text NOT NULL DEFAULT 'same_day'`, `changed_by uuid`, `changed_at timestamptz` | no id column |
| `staff_company_access` | `staff_user_id uuid NOT NULL`, `granted_by uuid NOT NULL`, `granted_at timestamptz NOT NULL DEFAULT now()`, `revoked_by uuid`, `revoked_at timestamptz` | UNIQUE INDEX on (organization_id, staff_user_id) WHERE revoked_at IS NULL |
| `switch_state` | `tolls_v2 boolean NOT NULL DEFAULT false`, `changed_by uuid`, `changed_at timestamptz` | PRIMARY KEY (organization_id) — no separate id |
| `audit_log` | `organization_id uuid` (nullable: plaza rules have none), `table_name text NOT NULL`, `row_key text NOT NULL`, `action text NOT NULL`, `old_row jsonb`, `new_row jsonb`, `actor_user_id uuid` | |

Indexes: `charges (organization_id, week_key)`, `paybacks (organization_id, week_key)`, `allocations (organization_id, charge_id)`, `allocations (organization_id, payback_id)`, `carried_facts (organization_id, to_week)`.

## 3. Append-only
Copy the pattern of `recon.tg_run_events_append_only` (`supabase/migrations/20261111043439_recon_decision_log.sql:54`) into `toll.tg_append_only()`:
- `decisions` and `audit_log`: no UPDATE, no DELETE at all.
- `suggestions`: no DELETE; UPDATE allowed only when the only change is `superseded_by` going from NULL to a value.

## 4. Grants and row security (every new table)
```sql
REVOKE ALL ON toll.<table> FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON toll.<table> TO authenticated;
ALTER TABLE toll.<table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_company_read ON toll.<table> FOR SELECT TO authenticated
  USING (organization_id = toll_read.current_company());
```
Exceptions: `plaza_rules` gets `USING (true)` (national data, read only). `audit_log` has **no** SELECT grant for authenticated. Nobody but the table owner can write any of them (writes come later through SECURITY DEFINER functions).

## 5. `ledger.week_statements` (org-level toll seal row)
- Replace `week_statements_kind_check` so `kind` also allows `'toll_week'`.
- Add `CHECK ((kind = 'toll_week') = (driver_id = '*'))`: a `toll_week` row is always org-level (`driver_id = '*'`), and `'*'` is used by nothing else.
- Change nothing else on that table.

End the migration with `NOTIFY pgrst, 'reload schema';`.

## 6. Test: `supabase/tests/toll_v2_schema_checks.sql`
Plain `BEGIN; DO $$ … RAISE EXCEPTION '…' on failure … $$; ROLLBACK;` style (like `supabase/tests/maintenance_discount_db_test.sql`). Check:
1. All 17 tables exist in `toll`.
2. Each has `organization_id` `NOT NULL`, except `plaza_rules` (none) and `audit_log` (nullable).
3. Row security is on for each (`pg_class.relrowsecurity`).
4. `anon` and `service_role` have **no** privilege on any of them (`has_table_privilege(...,'SELECT,INSERT,UPDATE,DELETE')` false); `authenticated` has SELECT only (none on `audit_log`).
5. Every unique index / primary key on those tables (except `plaza_rules`) has `organization_id` as its first column.
6. With no JWT claims set, `toll_read.current_company()` returns NULL. With `set_config('request.jwt.claims', '{"app_metadata":{"organizationId":"<uuid>"}}', true)` it returns that uuid. With the company only in `user_metadata`, it returns NULL.
7. Appending to `decisions` works; UPDATE and DELETE on `decisions` raise.
8. `ledger.week_statements`: a `toll_week` row with `driver_id = '*'` inserts; a `toll_week` row with a real driver id fails; a `toll` row with `driver_id = '*'` fails (all inside the rolled-back transaction).

Add the file to `.github/workflows/parts-sql-checks.yml`, both under `paths:` and in the run step, the same way the other test files are listed.

## 7. Run locally (Docker Desktop must be open)
1. `npx supabase start` (if not running), then `npx supabase db reset`.
2. `node scripts/validate-migration-sql.mjs`
3. Run the test the way CI does: `docker cp supabase/tests/toll_v2_schema_checks.sql <db container>:/tmp/t.sql` then `docker exec <db container> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql`.
4. Run it **once**. If it fails, report the error and stop; don't loop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents or full SQL — I'll read the files. Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
