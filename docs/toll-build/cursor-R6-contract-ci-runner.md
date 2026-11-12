# Cursor prompt — Toll R6: contract, drift tests, CI guards, one-command runner

No migrations. Do not change any existing migration or toll test file. Do not commit, branch or push.

## 1. The week result contract (B8)
Create `packages/toll-core/src/v2/weekResultV1.ts` with the `TollWeekResultV1` interface **exactly as in `docs/toll-architecture.md` B8**, including the Rev 8/9 fields:
- `unverified` and `awaitingCash` (each `{ charges; amountMinor }`, "in the counted week");
- `carriedIn` (with `cash_recovered`);
- `afterSeal` (with `relatedWeekKey`).

Copy the field comments. Export a constant `TOLL_WEEK_RESULT_CONTRACT_VERSION = 1`. Add an export entry in `packages/toll-core/package.json`, the same way the other modules are exported.

Add `packages/toll-core/src/v2/weekResultV1.test.ts` (vitest). Build one sample object that satisfies the type and check:
- `spend.totalMinor === spend.tagMinor + spend.cashMinor`;
- `contractVersion === 1`.

The point is that the file compiles and stays in step with the design. Don't add runtime validation logic.

## 2. Week rule drift: TypeScript `periodKeyFor` = SQL `ledger.jamaica_week_start`
1. Create `packages/toll-core/src/v2/weekRuleCases.json`: about 15 cases `{ "at": "<ISO timestamp with offset>", "week": "<yyyy-mm-dd Monday>" }`. Include:
   - Monday 00:00:00 Jamaica (`-05:00`);
   - Sunday 23:59:59 Jamaica;
   - Sunday 23:59:59 Jamaica written in UTC (= Monday 04:59:59Z, still the previous week);
   - Monday 05:00:00Z (= Monday 00:00 Jamaica);
   - a year boundary (Sunday 31 Dec / Monday 1 Jan);
   - 29 Feb in a leap year;
   - plain mid-week times.
2. `packages/toll-core/src/v2/weekRule.drift.test.ts` (vitest): for every case, `periodKeyFor({ effectiveAt: at }, 'America/Jamaica')` from `packages/finance-core/src/periodKey.ts` equals `week`.
3. `scripts/gen-toll-week-rule-sql.mjs` writes `supabase/tests/toll_v2_week_rule.sql` from the JSON: one `DO` block that checks `ledger.jamaica_week_start('<at>'::timestamptz) = '<week>'::date` for every case, raising on the first mismatch, and ends with `RAISE NOTICE 'toll_v2_week_rule: ok'`.
   - With `--check`, the script exits non-zero if the file on disk differs from what it would write.
   - Run it once to create the file. Add the SQL file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step), and add `node scripts/gen-toll-week-rule-sql.mjs --check` to `.github/workflows/ci.yml` next to the other node guard scripts.

## 3. Permission drift (who may manage tolls)
The SQL function `toll_system.user_can_manage_tolls` (in `supabase/migrations/20261112185355_toll_v2_command_core.sql`) mirrors the code catalog: `toll.manage` = `platform_owner`, `fleet_owner`, `fleet_manager`.

Add a vitest test (in `packages/toll-core/src/v2/tollManageRoles.drift.test.ts`, importing `ROLE_PERMISSIONS` from `packages/auth-client/src/permissions.ts` by relative path). It asserts that the sorted list of roles whose permissions include `'toll.manage'` equals `['fleet_manager', 'fleet_owner', 'platform_owner']`. Failure message: *"toll.manage roles changed — update toll_system.user_can_manage_tolls in a new migration."*

## 4. Database contract guards: `supabase/tests/toll_v2_contract.sql`
Plain `DO` checks, same style as the other toll tests:
1. **No company parameter (B7):** no function that `authenticated` can EXECUTE in schemas `toll_read`, `toll_write`, or named `public.toll_v2_%`, has an argument whose name contains `company`, `org` or `organization` (use `pg_proc.proargnames` and `has_function_privilege('authenticated', p.oid, 'EXECUTE')`).
2. **No service key on user functions (B7.3):** `service_role` can EXECUTE none of the functions in `toll_write`, and none named `public.toll_v2_%`.
3. **`toll_system` closed to users:** `authenticated` and `anon` can EXECUTE nothing in schema `toll_system`.
4. **Every SECURITY DEFINER function in `toll`, `toll_read`, `toll_write`, `toll_system` sets `search_path`** (`proconfig` contains a `search_path=` entry). Allow-list exactly one exception by name, `toll.tg_append_only` (a trigger with no definer rights); if it turns out to be definer, report it.

Add the file to `parts-sql-checks.yml` (`paths:` and the run step).

## 5. Edge guard: `scripts/check-toll-system-not-from-user-handlers.mjs`
Scan `supabase/functions/**/*.ts` and `*.tsx` (skip generated `index.ts` bundles and `*.test.ts`). Fail, listing file:line, if any file:
- calls `.schema("toll_system")` / `.schema('toll_system')`, or `rpc("toll_system.`…;
- calls `.schema("toll")` / `.schema('toll')` (the service key has no business reading toll tables, B7.3);
- calls `rpc("toll_v2_command"` or `rpc("toll_v2_enabled"` on a client built by `getServiceClient` in the same file. Keep this one simple: fail if the file imports `getServiceClient` **and** calls either RPC, unless the call sits inside a function that builds a user-token client. If that is hard to do reliably, fail on any file that imports `getServiceClient` and calls `toll_v2_command`, and say in your report what you chose.

It must pass on today's code. Note that `toll_seal_before_pay.ts` uses the service client only to read `week_statements`, and calls `toll_v2_enabled` through a user-token client: check that this file passes. Add it to `ci.yml` next to `check-toll-org-scope.mjs`.

## 6. Two-session concurrency test (I7, `concurrent_decide`): `scripts/toll-concurrency-test.mjs`
Node, no new npm packages: run two `docker exec -i supabase_db_Goride psql …` processes at the same time with `child_process.spawn`, feeding SQL on stdin.
- **Setup** (one psql, committed): made-up user, company and owner (ids starting `e7`), plus `toll.switch_state` on.
- **Race 1 — same command id:**
  - session A: `BEGIN`; act as the owner; call `public.toll_v2_command('seal_week', {command_id:'race-1', week_key:<a Monday>, expected_week_version:0})`; `SELECT pg_sleep(3)`; `COMMIT`;
  - session B, started ~1 s later: the same call with the same `command_id`.
  - B must wait, then return the **same `decision_id`** with `replay: true`. Exactly one `toll_week` statement row exists.
- **Race 2 — two different commands on the same week:** A seals with `race-2a`, holding for 3 s; B seals the same week with `race-2b`, also expecting version 0. B must fail with `VERSION_CHANGED` or `WEEK_SEALED`, and exactly one new statement row exists.
- **Cleanup:** delete the made-up rows it created (as postgres; `toll.decisions` is append-only, so do the cleanup in one transaction with `SET LOCAL session_replication_role = replica` to skip triggers), or use a fresh week and company per run so leftovers never matter. Say which you chose.
- Exits non-zero with a clear message on any mismatch. Local only: refuse to run if the container isn't `supabase_db_Goride`.

## 7. One command: `pnpm test:toll` → `scripts/run-toll-tests.mjs`
Copy the local-only guard from `scripts/run-inventory-done-tests.mjs` (refuse any non-local database). Steps:
1. Check Docker is running; `npx supabase start` if the stack is down.
2. `npx supabase db reset --no-seed` (skip with `--keep-db`).
3. Run every `supabase/tests/toll_v2_*.sql` except `toll_v2_r0_live_look.sql` (the live read-only look) with `docker cp` + `docker exec … psql -v ON_ERROR_STOP=1`. Print one line per file: ok or the error.
4. `node scripts/toll-concurrency-test.mjs`.
5. `pnpm --filter @roam/toll-core test`.
6. `deno test --allow-read --allow-env` on `toll_v2_command_errors.test.ts` and `toll_seal_before_pay.test.ts`.
7. Print a summary table. Exit non-zero if anything failed. Leave the database running (say so in the output). Never start app servers.

Add `"test:toll": "node scripts/run-toll-tests.mjs"` to the root `package.json`.

## Run (once)
`pnpm test:toll`, then `node scripts/check-toll-system-not-from-user-handlers.mjs`, then `node scripts/gen-toll-week-rule-sql.mjs --check`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
