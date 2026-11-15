# Give Cursor this — Service items, Round S4 (Server: a failed Business Finance write must stop completion)

You are building **Round S4 only** of `docs/service-items-architecture-audit.md`. Read **section 1 ("Decisions to keep": "A Business Finance failure stops completion") and section 8 "UI2 result" → B1** first. Everything else in the plan is built. No screen code in this round.

**Goal:** when the Business Finance write for a service fails, the service is **not** completed. It stays `in_progress` ("Not finished saving"), nothing is doubled, and Finish saving completes it once the books answer again.

## The bug (B1, Critical)

Finishing a service runs `appendCanonicalMaintenance` (`supabase/functions/_fleet-server/maintenance_completion.ts`) → `appendCanonicalMaintenanceIfEligible` (`canonical_from_ops.ts`) → `appendCanonicalLedgerEvents` (`ledger_canonical.ts`) → `fleetDualWriteCanonicalEvent` (`unified_ledger_dual_write.ts`) → `postEntry` → RPC `ledger_post_entry` (writes `ledger.entries`; `public.ledger_entries` and `fleet.ledger_entries` are views over it).

- `postEntry` returns `{ ok: false, error }` when the RPC fails.
- `fleetDualWriteCanonicalEvent` only **logs** that (`status: "fail"`) and returns `void`.
- `appendCanonicalLedgerEvents` then counts the event as `inserted++`.
- So `appendCanonicalMaintenanceIfEligible` gets `success: true, failed: 0`, the runner carries on, and the service is marked completed with **nothing in the books**.

Proven on the local copy (14 Nov): a `BEFORE INSERT` trigger on `ledger.entries` that raises for one test company → the edge log shows `unified_dual_write … status "fail"` followed by `[CanonicalLedger] inserted(unified)`, and the service completed.

## What to build

### 1. `fleetDualWriteCanonicalEvent` reports what happened
In `unified_ledger_dual_write.ts`, return `Promise<{ status: "posted" | "skipped" | "failed"; reason?: string }>` instead of `void`:
- `posted` — `postEntry` returned `ok: true`.
- `skipped` — every existing early return (`flag_off`, `neutral`, `zero_amount`, `self_ref_accounts`). Keep their metric logs exactly as today.
- `failed` — `postEntry` returned `ok: false` (reason = its error). Keep the metric log.
- The existing `throw` for a missing organization id stays a throw.

### 2. `appendCanonicalLedgerEvents` counts honestly
In `ledger_canonical.ts`, use that result:
- `posted` → `inserted++` (as today).
- `skipped` → `skipped++`, with a `details` row `{ index, idempotencyKey, id, skipped: true, reason }`.
- `failed` → `failed++`, with a `details` row `{ index, idempotencyKey, error: reason }`. Change the `[CanonicalLedger] inserted(unified)` log so it's only printed for `posted`.
- `success` in the return value is `failed === 0` (check how it's set today and keep the same rule for validation failures).

Change **nothing else** in this function (validation, idempotency lookup, id building, metadata stamping).

### 3. The maintenance step stops completion
`appendCanonicalMaintenanceIfEligible` already returns `failed: true` when `!r.success || r.failed > 0`, and the runner already stops and releases the claim on `failed`. With 1–2 in place this now works. Check, don't rebuild:
- the response is 500 `{ code: "completion_failed", step: "appendCanonicalMaintenance", error }`;
- the work order stays `in_progress`, `completing_since` is cleared, no `maintenance_records` row is marked completed by `fleet_finish_completion`;
- a second `/complete` after the books are back posts **once** (`ledger_post_entry` is keyed on `kv_ledger_event:<idempotencyKey>`; the canonical key is `maintenance_record:<recordId>` and the record id doesn't change on a retry) and completes.

### 4. Every other caller — report only, don't change their code
`appendCanonicalLedgerEvents` is also called from `canonical_from_ops.ts` (lines ~432, 445, 500, 574, 638, 709, 761, 815, 877), `expense_hub_routes.ts` (~215, 232, 1062), `fuel_pnl_offset.ts` (~129, 139, 214) and `ledger_ensure_routes.ts` (~166). For each one, **read** it and write one row in your report: what it does with the result today, and what it now does when the books write fails (e.g. "ignores the result — unchanged", "now returns 500 / shows failed count — correct, it was hiding a failure"). If any caller would now do something **wrong** (e.g. undo work it shouldn't, or retry forever), stop and say so in the report instead of changing it.

## Tests

- **Deno, new `supabase/functions/_fleet-server/unified_ledger_dual_write.test.ts`:** `postEntry` stub failing → `failed`; succeeding → `posted`; each early return → `skipped`.
- **Deno, new `supabase/functions/_fleet-server/ledger_canonical_append.test.ts`:** with the dual write stubbed to `failed` → `inserted 0, failed 1, success false`; `posted` → `inserted 1`; `skipped` → `skipped 1, success true`.
- **Deno, `maintenance_completion.test.ts`:** a test that uses the **real** `appendCanonicalMaintenanceIfEligible` + **real** `appendCanonicalLedgerEvents`, stubbing only the RPC call underneath, and shows the runner stops at `appendCanonicalMaintenance` and calls release, not finish. (Lesson from S3/UI2: stubbing whole steps hid real bugs; the stub must sit at the database call.)
- Keep `supabase/functions/_fleet-server/maintenance_discount.test.ts` and every other existing test passing.

## Also: test clean-up gap
`e2e/fixtures/maintenance-discount-done-test-teardown.sql` deletes the test company's rows only in `public` and `fleet`, so its `ledger.entries` rows (and any other `ledger.*` table with `organization_id`) are left behind on the local copy. Add `ledger` to the schemas it loops over, keeping `session_replication_role = replica` (the ledger has delete guards).

## Run before you report
Git Bash, Docker Desktop open, local copy only:
```
export MSYS_NO_PATHCONV=1
deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/service_items_*.test.ts supabase/functions/_fleet-server/maintenance_*.test.ts supabase/functions/_fleet-server/parts_finder.test.ts supabase/functions/_fleet-server/canonical_from_ops*.test.ts supabase/functions/_fleet-server/ledger_*.test.ts supabase/functions/_fleet-server/unified_ledger*.test.ts
node scripts/build-edge-bundle.mjs fleet-ops
node scripts/build-edge-bundle.mjs fleet-core
node scripts/validate-migration-sql.mjs
```
Then run the teardown once to prove it works:
```
node scripts/seed-maintenance-discount-done-tests.mjs seed
node scripts/seed-maintenance-discount-done-tests.mjs teardown
```
Don't run Playwright — Claude runs the Fleet click-through after your round. Stop anything you started in the background (dev servers, `supabase functions serve`, Deno watchers) before you report.

## Report back
Only file links and results, no pasted code:
- a link to every file you changed or added;
- each test command above with its pass / fail count;
- the caller table from section 4;
- anything you found that this prompt got wrong.
