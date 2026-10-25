# Business Finance Overview + Expense Hub — Audit

**Rev 12 · 2026-10-24 · CLOSED (verified), one owner action left**

Scope: Business Finance Overview, Expense Hub, and the sections that feed them. Rev 1–11 are in git history.

## 1. Verified
- **Deployed after the last fix commit:**
  - Edge functions at 22:06 UTC.
  - Recon worker rev `00010` at 22:07 UTC.
- **Fuel:** ledger = fuel records in all 13 weeks (Jul 27 → Oct 19).
- **Uber:** ledger + corrections = Uber's total in every week from Jul 13 to Oct 12.
  - Aug 3 is 63,479.40 and Aug 24 is 74,006.18, which match the Uber files.
- **Payouts check:** Oct 12 owed $17,183.53 = paid.
- **Access:** the week-money functions are service-role only. The `fleet` schema isn't exposed to the API.

## 2. Left
- **Confirm the Oct 12 bank deposit** in Bank Deposits. Until a real deposit is confirmed, "Bank (expected vs received)" shows **Not confirmed**.
- **Driver Settlements** still needs its own audit. It's out of this scope.
