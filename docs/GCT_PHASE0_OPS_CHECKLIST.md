# GCT Phase 0 — Ops & Accountant Gate

**Status:** Engineering cutover is **live** (Accounting engine sole charge source — see [GCT_CUTOVER_RUNBOOK.md](./GCT_CUTOVER_RUNBOOK.md)).  
Accountant / ops rows below remain required for filing quality and TRN hygiene.

**Related:** [GCT_ENGINE_AUDIT.md](./GCT_ENGINE_AUDIT.md), [JAMAICA_GCT_GUIDE.md](./JAMAICA_GCT_GUIDE.md)

---

## Accountant confirmation (written)

| # | Question | Answer | Date | Signed |
|---|---|---|---|---|
| 1 | Standard rate in force — **15%** or **16.5%**? (Engine seeded at **15%** from 2020-04-01) | | | |
| 2 | Past over-collection at 16.5% — **forward-only** or restate? (Plan default: forward-only) | | | |
| 3 | Is Roam Rush GCT-registered? Entity name + TRN? | | | |
| 4 | COD: Roam holds/remits merchant food GCT — documented in merchant agreement? Separate-account discipline? | | | |
| 5 | Platform service fee + delivery-fee share — correctly standard-rated? | | | |
| 6 | Courier delivery share — courier supply to Roam, or Roam supply to customer? | | | |

---

## Ops: merchants registered without TRN

Run in SQL editor (service role / dashboard):

```sql
SELECT id, business_name, operational_status, verification_status, tax_id, gct_registered
FROM delivery.merchants
WHERE gct_registered = true
  AND (tax_id IS NULL OR trim(tax_id) = '');
```

For each row:

1. Confirm with merchant whether they are registered with TAJ.
2. If yes — capture TRN into `tax_id` and evidence in Accounting → GCT registrations.
3. If no — set `gct_registered = false` (stops unlawful collection).
4. Do **not** auto-register from turnover; threshold watchlist is advisory only.

---

## Filing notes

- Rate correction is **forward-only** unless accountant directs restatement.
- Do not restate historical `tax_food_jmd` / `tax_platform_jmd` without written instruction.
- Dominion → Accounting → GCT: entities needing review, open periods, orphan ledger rows.
