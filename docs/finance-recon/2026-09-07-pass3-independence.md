# Pass 3 — Close Week independence (H-7) — 2026-09-07

## What changed

1. **Toll seal** — publishes `closed` only from canonical events / financial_events.
   Period-column fallback with activity → `draft` (`TOLL_STATEMENT_UNVERIFIED` blocks close).
2. **Fuel seal** — `closed` only from rebuild snapshot, finalized_report KV, or consumption strip.
   Period-column copies → `draft` (`FUEL_STATEMENT_UNVERIFIED`).
3. **Earnings** — DFP rebuild publishes from commission + cash engine outputs with fare/tip source ids.
   `week_close` **no longer** auto-copies earnings from period columns.
4. **closeInvariants** — draft / unverified statement status blocks close; mismatch tests added.
5. **H-4** — close stores `closeSourceRowIds` + `closeEngineVersion`; verify-on-read uses them
   (default engine `week-statement@1`).
6. **M-4** — period list helpers + legacy DFP routes fail-closed without `organizationId`.

## Cutover note (Pass 4)

`PROJECTION_READS_WEEK_STATEMENTS` remains **off** by default. Flip only after shadow drift is clean
for a full org-week (see `2026-09-07-pass2-cutover.md`).

**Shadow run 2026-09-07:** FAIL — see [`2026-09-07-pass4-shadow.md`](./2026-09-07-pass4-shadow.md).
Weeks `2026-08-10` / `2026-08-17` clean; `2026-08-24` fuel+toll drift; `2026-08-31` missing toll lane.
Do not flip until `scripts/shadow-week-statements.mjs` exits 0.
