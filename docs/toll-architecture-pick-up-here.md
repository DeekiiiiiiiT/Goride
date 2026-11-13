# Pick up here — Toll rebuild

**Updated 2026-11-13 (R4b + R4c committed; R5 prompt written).** In a new chat, read `docs/toll-architecture.md` → **Part F (Tracker)** → "Phase 2": first "Where Phase 2 stands (13 Nov, break)", then the "**P2-R5 starting brief**".

## Where we are
- **Design:** agreed. No more review rounds; changes come only from failing tests.
- **Phase 0 + Phase 1:** complete, deployed and live (`main` `512492ff`). `tolls_v2` is **off** everywhere; `toll_seal_before_pay` is on for deekiiiiiii's Fleet.
- **Phase 2 (adapters + decisions): R1–R4 are all closed.** Every toll test is green from a database reset.

| Round | What | State |
|---|---|---|
| P2-R1 | Import core (`import_batch`) | closed, committed `0bece3c8` |
| P2-R2 | File readers (adapters) | closed, committed `0bece3c8` |
| P2-R3 | Matcher (suggestions, shadow only) | closed, committed `0f21cad5` |
| P2-R4a | Everyday decisions + I4 guard | closed, committed `0f21cad5` |
| P2-R4b | Take-backs, amount / week corrections | closed, committed `c0b33a32` |
| P2-R4c | Carry-forward into the open week | closed, committed `c0b33a32` |
| **P2-R5** | **Fleet import route + driver app receipt / offline queue + matcher sweep** | **closed 13 Nov, not committed.** Cursor built it; Claude's check found 8 fixes (`cursor-P2-R5b-fixes.md`), all fixed. Claude re-ran: toll-core 180, `pnpm test:toll` all ok, controller Deno 13, driver 7 |
| P2-R6 | A real week's files end to end, `/code-review`, live SQL, then deploy | after R5 |

- **Branch `parts-auto-match`; nothing pushed.** All Phase 2 migrations are **local only**; they go live together in P2-R6.

## First things to do when we restart
1. **Commit R5** (toll files only): the new `toll_v2_import_*` server files and tests, `fleet-toll/src/main.ts`, `scripts/build-edge-bundle.mjs` (papaparse external), the driver app toll files (`syncCashToll*`, `buildCashTollQueuePayload*`, `DriverExpenses.tsx`, `OfflineProvider.tsx`, `OfflineSyncManager.tsx`, `offlineStorage.ts`, `types/offline.ts`, `services/api.ts`), `apps/fleet/src/services/api.ts`, the `driverCashReceipt` reader + test, `supabase/tests/toll_v2_import.sql`, the two R5 prompts and this page. Include the rebuilt `fleet-toll/index.ts` (earlier toll commits kept it in git).
2. **Start P2-R6:** a real week's files end to end, `/code-review`, the matcher-sweep schedule SQL (Claude), live SQL, then deploy.
3. **Claude still owes for P2-R6:** the pg_cron schedule SQL for `/internal/toll-matcher-sweep`.
4. **Never commit the unrelated work** in the same folder with toll work: the `docs/*shop*fees*` files, `supabase/migrations/20261113010913_shop_fees_group.sql`, the two `apps/admin/.../maintenance-master/*` edits and `docs/maintenance-service-discount-audit.md`.

## How we work
- Cursor does the easy bulk from prompts in `docs/toll-build/`. Claude writes the money SQL and checks every round.
- **Claude's checks on Cursor's tests:**
  - a money check (nightly) after **every** section;
  - hand-made money rows only in blocks that undo themselves, never deleted;
  - refusals checked by **reason (state)**, not just the error code.
- The owner runs live SQL (clickable files in `docs/toll-build/`), flips switches, and says when to commit or deploy.
- **Docker:** Cursor's test run resets the local database and loads every migration in the folder, so don't run two test runs at once. If Docker hangs (`docker ps` never answers): quit Docker Desktop, end `com.docker.build` in Task Manager, and reopen.
- **Run every toll test:** `pnpm test:toll` (Docker Desktop open) and `pnpm --filter @roam/toll-core test`.

## Other threads
- **Week Reconciliation:** tests 5 and 13 wait for toll Phase 4. WRA-41 (Fuel, test 6) and the 9t re-run can be done any time.
- **Noted for Phase 5:** a carried Roam native charge whose ride cash settles later isn't covered (rare); the old Uber import's `Math.abs` on support adjustments.
