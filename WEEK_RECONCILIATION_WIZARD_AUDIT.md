# Week Reconciliation — Guided Wizard & Service-Line Split

**Rev 6 · 2026-10-20 · R5 close-out applied on prod (`fleet-core` / `fleet-toll` / `finance-doctor` redeployed)**
Open items only. Earlier revisions are in git history.

## Status

R5-01 (orphan toll money on skipped bulk rows), R5-02 (23 anon-reachable SD RPCs),
R5-03 (16 uncommitted files), and R5-04 (Deno suites missing from CI) are **fixed and live**.
Tests: Deno recon suites pass; `assert-public-fn-revoke-anon` 27/27; prod
`finance_doctor_anon_execute_audit()` → `ok: true`. Still **0 week runs and 0 staged
imports in prod** — first UI walkthrough needs operator files (R5-05).

---

## R5-05 · First real end-to-end run still not done · High

Unchanged walkthrough (now requires R5-01 live): open run → upload toll CSV + Uber
bundle → Sources Covered → **exactly one `toll_usage` event per imported toll, none
for duplicates** → Tolls Finish → Fuel → Close preview.

See [docs/recon-wizard-deploy-checklist.md](docs/recon-wizard-deploy-checklist.md).
Redeploy fleet **web** first so partial-commit error toasts are live.

---

## Deferred with Delivery (unchanged)

Delivery stays behind its readiness card. Owner questions Q2 (shared-cost allocation), Q3 (payout netting) and Q5 (toll statement closing balance) wait for it.

## Order

R5-05 (ops UI walkthrough) — only open item. Delivery deferred items stay deferred.
