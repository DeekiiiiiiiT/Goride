# Pick up here — Toll rebuild

**Updated 2026-11-12 (end of day).** Read `docs/toll-architecture.md` → **Part F (Tracker)** → "Phase 2", then its "P2-R3 starting brief".

- **Design:** agreed. No more review rounds; changes come from failing tests.
- **Phase 0 + Phase 1:** complete, deployed and live (`main` `512492ff`). `tolls_v2` is off everywhere; `toll_seal_before_pay` is on for deekiiiiiii's Fleet.
- **Phase 2:**
  - P2-R1 (import core) and P2-R2 (file readers) are closed and committed (`0bece3c8`, not pushed). The P2-R1 migration is **not live yet**.
  - **P2-R3 (the matcher): built by Claude on 13 Nov. The smoke run and the full `pnpm test:toll` pass.** The migration `20261113011349_toll_v2_matcher.sql` is local only and not committed.
  - **P2-R3 closed 13 Nov:** all tests green from a reset. Not committed yet.
  - **P2-R4 is split.** **R4a (the everyday decisions + the I4 guard) closed on 13 Nov:** all toll tests are green from a reset. Its migration `20261113023100_toll_v2_decisions.sql` is local only.
  - **Next: R4b** (take-backs, corrections, carry-forward). Claude builds it.
  - Nothing since `0bece3c8` is committed: P2-R3 + P2-R4a are waiting for the owner's go.
- **How we work:**
  - Cursor does the easy bulk from prompts in `docs/toll-build/`.
  - Claude writes the money SQL and checks every round.
  - The owner runs live SQL (clickable files in `docs/toll-build/`), flips switches, and says when to commit or deploy.
- **Run every toll test:** `pnpm test:toll` (Docker Desktop open) and `pnpm --filter @roam/toll-core test`.
- **Week Reconciliation:** tests 5 and 13 wait for toll Phase 4. WRA-41 (Fuel, test 6) and the 9t re-run can be done any time.
