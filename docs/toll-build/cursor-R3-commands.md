# Cursor prompt — Toll R3: command tests + the Fleet route

Claude built the command core in `supabase/migrations/20261112185355_toll_v2_command_core.sql`. **Do not change any migration.** If a test shows a migration is wrong, report it and stop.

Read the migration first. What it gives you:
- `public.toll_v2_command(p_intent text, p_body jsonb) → jsonb`. It runs as the **signed-in user**. The company comes only from the token's `app_metadata.organizationId`, and a company in the body is refused.
- `public.toll_v2_enabled() → boolean`: is tolls v2 on for the caller's company.
- Who may run a command (`toll_system.user_can_manage_tolls`): the company's owner (`organizations.owner_id`), or an **active, unexpired** `platform.user_roles` seat (`scope_type 'organization'`, `scope_id` = the company) whose role name is `fleet_owner` or `fleet_manager`.
- Phase 0 intents: `seal_week`, `reopen_week`, `carry_forward` (refusals only). Every other known intent answers `INTENT_NOT_BUILT`; an unknown one answers `UNKNOWN_INTENT`.
- A refusal is a Postgres exception: **message = the code**, **detail = a JSON object**. It writes nothing.
- Codes: `NO_COMPANY`, `COMPANY_NOT_ACCEPTED`, `UNKNOWN_INTENT`, `FORBIDDEN`, `BAD_REQUEST`, `COMMAND_ID_REUSED`, `VERSION_CHANGED`, `WEEK_SEALED`, `WEEK_NOT_SEALED`, `PENDING_NOT_RESOLVED` (detail `blocking: [{kind, id, amountMinor, reason}]`), `DRIVERS_ALREADY_PAID`, `REOPEN_INSTEAD`, `INTENT_NOT_BUILT`.
- A replay (same `command_id`, same intent) returns the first answer plus `"replay": true`.

## Part A — `supabase/tests/toll_v2_commands.sql`
Same style as the other toll tests (`BEGIN … ROLLBACK`, made-up ids, made-up `auth.users`, two companies in `public.organizations`). To act as a user, run statements like:
```sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<user>","role":"authenticated","app_metadata":{"organizationId":"<company>"}}', true);
-- ... DO $$ ... $$ blocks calling public.toll_v2_command ...
RESET ROLE;
```
Seats: the local `platform.roles` table may be empty, so insert made-up roles named `fleet_manager` and `fleet_accountant` if missing, then `platform.user_roles` rows (look up the required columns).

Tests (each with a clear failure message):
1. **Owner seals an empty week:** the answer has `weeks[0].week_version = 1`, a `ledger.week_statements` row exists (`kind 'toll_week'`, `driver_id '*'`, `status 'closed'`), and one `toll.decisions` row has the stored answer.
2. **Replay:** the same `command_id` gives the same `decision_id` with `replay: true`, and no second statement row. The same `command_id` with a different intent → `COMMAND_ID_REUSED`.
3. **Seal blockers (G1), one week each:** a `pending` charge, an `unverified` cash charge, an open `duplicate_reviews` pair, and a payback with an unallocated amount each give `PENDING_NOT_RESOLVED`, listing that record with reason `pending` / `unverified` / `review_pair` / `unallocated_payback`. A fully allocated charge, a `rejected` charge, a confirmed duplicate, a reversed payback, an `is_legacy` charge and an `after_seal` charge do **not** block.
4. **Awaiting cash (G1.2):** an `awaiting_cash` charge doesn't block. After the seal it has one `provisional` fleet allocation, and one ledger row with `metadata->>'toll_rule' = 'P8_allocate_fleet'`.
5. **Versions:** a seal or reopen with a wrong `expected_week_version` → `VERSION_CHANGED` (detail has the current version). Sealing a sealed week → `WEEK_SEALED`. Reopening an open week → `WEEK_NOT_SEALED`.
6. **Reopen:** works with a reason, and gives version 2 with `status 'draft'` and an audit row. With no reason → `BAD_REQUEST`. When `ledger.settlement_movements` has a posted `pay` for that company and week → `DRIVERS_ALREADY_PAID`.
7. **carry_forward:** from an open week → `WEEK_NOT_SEALED`; from a sealed, unpaid week → `REOPEN_INSTEAD`; from a sealed and paid week → `INTENT_NOT_BUILT`.
8. **Who may act:**
   - owner allowed;
   - active `fleet_manager` seat allowed;
   - active `fleet_accountant` seat → `FORBIDDEN`;
   - expired `fleet_manager` seat → `FORBIDDEN`;
   - suspended seat → `FORBIDDEN`;
   - a manager seat in company B acting with a company-A token → `FORBIDDEN`.
9. **Company isolation (`token_a_cannot_reach_b`):**
   - with company B's token, `SELECT` on `toll.charges` / `toll.decisions` returns none of company A's rows;
   - company B sealing a week never creates a company A statement;
   - a body with `organization_id` → `COMPANY_NOT_ACCEPTED`;
   - a token with no company → `NO_COMPANY`.
10. **Intents:** `link_payback` → `INTENT_NOT_BUILT`; `make_coffee` → `UNKNOWN_INTENT`; `seal_week` on a non-Monday → `BAD_REQUEST`.
11. **Grants:** `anon` and `service_role` have no EXECUTE on `public.toll_v2_command`, `public.toll_v2_enabled` or `toll_write.command`. `authenticated` has EXECUTE on all three, and none on `toll_write.intent_*`, `toll_system.*`.
12. **Switch:** `public.toll_v2_enabled()` is false with no `toll.switch_state` row, and true after inserting `(company, tolls_v2 = true)` (insert as postgres), for that company only.

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).

## Part B — the Fleet route (fleet-toll)
Add `POST /toll/v2/commands/:intent` to the **fleet-toll** edge function, registered the same way the routes in `supabase/functions/_fleet-server/toll_period_controller.tsx` are, in a new controller file `supabase/functions/_fleet-server/toll_v2_command_controller.ts`:
1. `requireAuth()`, then `requirePermission("toll.manage")` (the database checks again; this is a second guard).
2. Build a Supabase client with the **user's own token**: the anon key plus `global: { headers: { Authorization: <the request's Authorization header> } }`, exactly like `supabase/functions/_fleet-server/ledger_ensure_routes.ts:61`. **Never use the service client for these calls.**
3. Call `rpc("toll_v2_enabled")`. If false → `409 { code: "TOLLS_V2_OFF" }`.
4. Call `rpc("toll_v2_command", { p_intent: intent, p_body: body })` and pass the JSON body through unchanged. Don't add or read a company.
5. Map errors with a pure function `mapTollCommandError(err)` in `supabase/functions/_fleet-server/toll_v2_command_errors.ts`. Postgres raises come back from PostgREST as `{ code: "P0001", message: <our code>, details: <JSON text> }`.
   - 409: `VERSION_CHANGED`, `WEEK_SEALED`, `WEEK_NOT_SEALED`, `PENDING_NOT_RESOLVED`, `DRIVERS_ALREADY_PAID`, `REOPEN_INSTEAD`, `COMMAND_ID_REUSED`, `TOLLS_V2_OFF`
   - 403: `FORBIDDEN`
   - 401: `NO_COMPANY`
   - 400: `BAD_REQUEST`, `COMPANY_NOT_ACCEPTED`, `UNKNOWN_INTENT`
   - 501: `INTENT_NOT_BUILT`
   - anything else: 500 with a generic message (never leak SQL text)
   - Body: `{ code, current_state: <parsed details or {}> }`.
6. A 200 returns the RPC answer as is.

Regenerate the fleet-toll bundle and route manifest with the repo's existing scripts (see how `routes.generated.json` and the generated `index.ts` are produced: `scripts/build-edge-bundle.mjs` and the edge route manifest check in `.github/workflows/ci.yml`). Then make sure `node scripts/check-client-route-contract.mjs` and the manifest checks still pass.

**Deno test** `supabase/functions/_fleet-server/toll_v2_command_errors.test.ts`: every code above maps to its status; unknown codes give 500 with no SQL text; `details` that aren't valid JSON give `current_state: {}`. Add it to the toll step in `.github/workflows/ci.yml`.

## Run locally (once; Docker Desktop open)
1. `npx supabase db reset`
2. Run all three toll SQL tests (`toll_v2_schema_checks`, `toll_v2_postings`, `toll_v2_commands`) with `docker cp` + `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<file>.sql`. In Git Bash, set `MSYS_NO_PATHCONV=1` first.
3. `deno test --allow-read --allow-env supabase/functions/_fleet-server/toll_v2_command_errors.test.ts`
4. The route-contract and manifest checks.

If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents or full SQL — I'll read the files. Do not commit, branch or push. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
