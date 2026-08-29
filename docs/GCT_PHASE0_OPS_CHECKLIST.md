# GCT Phase 0 — Ops & Accountant Gate

**Status:** Engineering is **complete** (Accounting GCT engine is the sole live charge source).  
This page is the **paper catch-up** checklist — accountant / ops signatures only.

**Related:** [GCT_ENGINE_AUDIT.md](./GCT_ENGINE_AUDIT.md), [GCT_CUTOVER_RUNBOOK.md](./GCT_CUTOVER_RUNBOOK.md), [JAMAICA_GCT_GUIDE.md](./JAMAICA_GCT_GUIDE.md)

---

## Accountant confirmation (written)

| # | Question | Answer | Date | Signed |
|---|---|---|---|---|
| D1 | Standard rate in force — **15%** (engine seeded from 2020-04-01)? | | | |
| D2 | Past over-collection at 16.5% — **forward-only** or restate? (Default: forward-only) | | | |
| D3 | Is Roam Rush GCT-registered? Entity name + TRN? (Paste TRN in Dominion → GCT → Registrations → roam_rush) | | | |
| §11.3 | Platform service fee + delivery-fee share correctly standard-rated? | | | |
| §11.4 | COD: Roam holds/remits merchant food GCT — in merchant agreement? Separate-account discipline? | | | |
| §11.5 | Courier delivery share — courier supply to Roam, or Roam supply to customer? | | | |
| §11.6 | Parcel vs passenger — written TAJ ruling warranted before scale? | | | |

---

## Ops (engineering already reset blank-TRN registered merchants)

New merchants cannot be `gct_registered` without a TRN (DB CHECK).  
For live partners later: capture TRN + evidence before flipping registration on.

```sql
-- Sanity (expect 0)
SELECT id, business_name, tax_id, gct_registered
FROM delivery.merchants
WHERE gct_registered = true
  AND (tax_id IS NULL OR trim(tax_id) = '');
```

---

## Filing notes

- Enter / import input tax (or post Expense Hub docs with vendor TRN) before first period close so net payable is not overstated.
- Remittance close applies partly-exempt apportionment when exempt + taxable output both exist.
- Do not invent TRNs in code — use Registrations UI.
