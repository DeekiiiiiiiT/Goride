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
2. **P2-R6 step 1 DONE (13 Nov): real week 24–30 Aug 2026** (owner's files in `Desktop\New folder`), run locally (test company `f1aaaaaa-…`):
   - **Bug found + fixed:** `toMinor` rejected `JMD -370.00` / `JMD 5,000.00` (every tag row + top-up). Fixed in `adapters/common.ts` + test (**not committed**).
   - **New system:** 12 tag crossings $4,250; top-up $5,000; 11 Uber paybacks $3,975 (= Uber's summary); 27 Aug 12:50 Spanish Town East $275 has no trip → driver_pays (owner confirmed: personal); 2 competing pairs left for a person; nightly checks all pass. Part E #3 confirmed on 3 cash trips (paid = earnings + toll − cash).
   - **Old system (closed statement v12):** the same 12 crossings and 11 paybacks. But it marks trip 1d4a29d3 Cash (the file says card: cash collected 0), links trip 94908b46 to two crossings and a47521e7 to none (it put a47521e7 on a 30 Aug cash toll), counts $5,920 all as **tag** spend (incl. cash), and charged the driver $2,190, which is $245 more than the tolls Uber didn't pay ($1,945; `netLoss −245`). Old-system issue, separate from v2; the owner decides whether to look at it.
   - **Cash tolls (driver app) that week:** 6 in the old ledger: 2 rejected, 1 reconciled, 3 still pending in a closed week. v2 would block the seal until they're decided.
3. **P2-R6 step 2 — `/code-review` (13 Nov, `512492ff..HEAD`): 10 findings, all real.** Reader fix committed `323fa548`.
   - **#8 fixed by Claude:** a re-imported trip no longer blanks stored fields, edited in place in `20261113001948_toll_v2_import_core.sql` (never live). Not committed; `pnpm test:toll` all ok.
   - **The other 9 are with Cursor:** `docs/toll-build/cursor-P2-R6b-review-fixes.md` (InDrive plate / driver / cents, top-up plaza check, driver id in the receipt ref, Uber unknown driver / vehicle reported, UTC times, the sweep continues past a failing company, the driver app re-runs the queue).
4. **R6b checked by Claude (13 Nov):** all 9 fixes right. The real week re-reads identically (87 rows). toll-core 186, Deno 20, driver 52, `pnpm test:toll` all ok.
5. **Sweep timer (Claude):** `20261113142520_toll_v2_matcher_sweep_cron.sql` (pg_cron every 10 min → `fleet-toll-cron`, which has a cron secret and `verify_jwt = false` in `config.toml` → `fleet-toll /internal/toll-matcher-sweep` with the service key). It calls nothing while `toll.match_queue` is empty.
6. **Live SQL ready + proven:** `docs/toll-build/toll_v2_phase2_LIVE_apply.sql` (6 migrations + logbook, one transaction).
   - **Proof:** a local copy rebuilt without the 6, then the file applied. Its check gives `6 | t | t | 1`; the schema + function dump is identical to a normal build (only pg_dump's random tokens differ); all 16 toll SQL tests pass against it.
   - **If any Phase 2 migration changes, rebuild this file.**
8. **PHASE 2 LIVE (13 Nov):**
   - **Live SQL:** the owner ran the file and got `6 | true | true | 1`.
   - **Deploy:** pushed to `main` `66ea83c2`. Edge deploy (incl. the new `fleet-toll-cron`, now in the deploy list), recon worker, Vercel, function tests and Parts SQL checks are all green.
   - **CI** is red on one check only: production has `20261113010913_shop_fees_group`, but its file isn't committed (shop-fees work, not toll).
   - The inventory done-test 06 failure was a flake (passed on rerun). It's a test race: it goes offline before the kit list loads.
   - `tolls_v2` is still off everywhere. The driver app changes reach drivers with the next Play release.
   - **Next:** Phase 3 (screens from Stitch).
7. **Owner, in order (done):**
   1. say commit (R6b + #8 + timer + live file are uncommitted);
   2. run the live file when the live database answers normally (Claude's reads timed out on 13 Nov);
   3. then deploy. `fleet-toll-cron` is a new function to deploy.
   - Owner confirmed 13 Nov: the 27 Aug 12:50 Spanish Town East $275 crossing was personal → driver pays (as recorded in the run).
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
