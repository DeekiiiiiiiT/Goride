# Week Reconciliation — Guided Wizard & Service-Line Split

**Rev 7 · 2026-10-20 · R6 closeout live on prod**
Open items only. Earlier revisions are in git history.

## Status

R5-01 to R5-04 and **R6-01 to R6-04** are **verified closed and live**.

| Item | Result |
|------|--------|
| R6-01 Coverage truth | `20261020190000_r6_01_coverage_truth_and_revoke` — per-day batch + live fallback only for `week_key < 2026-10-19` |
| R6-02 anon revoke | `assert-public-fn-revoke-anon.mjs` OK; prod anon/authenticated EXECUTE = false on `compute_source_coverage` |
| R6-03 history | Stray `134956`/`140015` reverted; repo `170000`/`180000`/`190000` marked applied |
| R6-04 Log Cash soft guards | Receipt-first kept; over-owed/fat-finger needs reason; stale `expectedOutstanding` → 409; Kenny Deno tests; `fleet-pay` redeployed |
| Smoke | Oct 12 toll_usage Covered only on live days (not whole week); uber batch `10-13…18` → Mon Missing; post-bridge Oct 19 toll all Missing without batch |

Gates: revoke CI green; Deno settlement_commands 16/16; fleet `useCashCollection` 13/13. **`fleet-pay` smoke OK.** (`deploy:edge` still hits a separate pre-existing `assert-fleet-view-invoker` fail on fuel views — not R6-02.)

**Prod week run** (rideshare, Oct 12–18, org `8cfa606a-…`, version 5, `collecting`): Sources + Attribution steps already completed; 0 staged imports; Tolls / Fuel / Close still open.

---

## R5-05 · First real end-to-end run · High (ops remaining)

Engineering gate after R6-01 is **met**: Sources coverage no longer paints a whole week Received from one live row.

**Already done on the run:** `sources` and `attribution` completed (2026-10-20).

**Operator finish (Fleet UI — preview close only):**

1. Week Reconciliation → Oct 12–18 rideshare → confirm statement sources show **Missing** on days without batch/CSV (toll Mon/Tue/Sun Missing until toll CSV covers them).
2. Upload any still-missing statement CSVs → days flip **Covered** only inside `coverage_start…coverage_end`.
3. DB: exactly one active `toll_usage` per imported usage toll; none for skipped/dupes.
4. Tolls step → Finish → `toll_reconciliation_period.state = ready`, `service_line = rideshare`.
5. Fuel → Settlement → Close **preview only** (do not seal unless intentional).

---

## Noted, no action

- Toll auto-match audit row remains best-effort (`toll_auto_match.ts`).
- Delivery stays behind its readiness card. Q2 / Q3 / Q5 wait for it.

## Order (remaining)

R5-05 ops UI finish (above) only.
