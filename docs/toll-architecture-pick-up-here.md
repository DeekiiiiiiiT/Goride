# Pick up here — Toll rebuild

**Updated 2026-11-12.** Read `docs/toll-architecture.md` → **Part F (Tracker)** first.

- **Design:** agreed. No more review rounds; changes come from failing tests.
- **Phase 0:** complete, deployed and live (`main` `142ee692`, CI green). `toll_seal_before_pay` is on for deekiiiiiii's Fleet. Still to *see* live: the first real driver payout for a week after 14 Sep is refused until that week's tolls are sealed (owner sends a screenshot).
- **Phase 1 (core + Roam hooks):** in progress. P1-R1 (the week's toll answer) is built by Claude and waiting on Cursor's tests (`docs/toll-build/cursor-P1-R1-week-result-tests.md`). Next: P1-R2.
- **How we work:** Cursor does the easy bulk from prompts in `docs/toll-build/`; Claude writes the money SQL and checks every round; the owner runs live SQL (clickable files in `docs/toll-build/`), flips switches and deploys.
- **Run every toll test:** `pnpm test:toll` (Docker Desktop open).
- **Week Reconciliation:** tests 5 and 13 wait for toll Phase 4. WRA-41 (Fuel, test 6) and the 9t re-run can be done any time.
