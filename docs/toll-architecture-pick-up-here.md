# Pick up here — Toll rebuild

**Updated 2026-11-13 (break after P2-R4).** In a new chat, read `docs/toll-architecture.md` → **Part F (Tracker)** → "Phase 2": first "Where Phase 2 stands (13 Nov, break)", then the "**P2-R5 starting brief**".

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
| P2-R4b | Take-backs, amount / week corrections | closed, **not committed** |
| P2-R4c | Carry-forward into the open week | closed, **not committed** |
| **P2-R5** | **Fleet import route + driver app receipt / offline queue + matcher sweep** | **next** |
| P2-R6 | A real week's files end to end, `/code-review`, live SQL, then deploy | after R5 |

- **Branch `parts-auto-match`; nothing pushed.** All Phase 2 migrations are **local only**; they go live together in P2-R6.

## First things to do when we restart
1. **Commit R4b + R4c** (toll files only). The uncommitted R4b / R4c files are listed in the tracker under "Where Phase 2 stands (13 Nov, break)".
   - **Leave out** the unrelated work in the same folder: the `docs/*shop*fees*` files, `supabase/migrations/20261113010913_shop_fees_group.sql`, and the two `apps/admin/.../maintenance-master/*` edits plus `docs/maintenance-service-discount-audit.md`. These belong to other work.
2. **Start P2-R5:** Claude writes the Cursor build prompt from the starting brief, then checks Cursor's result.

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
