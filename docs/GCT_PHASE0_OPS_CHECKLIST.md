# GCT Phase 0 — Ops & Accountant Gate

**Status:** Required before Workstream D (customer-facing rate cutover).  
**Related:** [GCT_ENGINE_AUDIT.md](./GCT_ENGINE_AUDIT.md), [JAMAICA_GCT_GUIDE.md](./JAMAICA_GCT_GUIDE.md)

Engineering does not change live customer prices until this checklist is signed off.

---

## Accountant confirmation (written)

| # | Question | Answer | Date | Signed |
|---|---|---|---|---|
| 1 | Standard rate in force — **15%** or **16.5%**? | | | |
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

## Go-live note (after sign-off)

- Rate correction is **forward-only** unless accountant directs restatement.
- Do not restate historical `tax_food_jmd` / `tax_platform_jmd` without written instruction.
- Attach this signed checklist to the Dominion cutover ticket.

---

## Engineering health checks (after schema lands)

Dominion → Accounting → GCT engine surfaces:

- Merchants with `gct_registered` and blank TRN
- Dual-read disagreement (KV vs `accounting.gct_rates`)
- Open tax periods
