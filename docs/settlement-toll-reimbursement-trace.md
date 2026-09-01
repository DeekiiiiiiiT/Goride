# Toll Reimbursement Trace Checklist (P-6 / §3.8)

Use this when you need to answer: **did Uber already pay the toll inside the fare?**

## Live sample (closed 2026-09-01)

| Field | Answer |
|---|---|
| Week (Mon anchor) | 2026-08-24 |
| Driver | `73e5b1dc-01b4-45ee-a34a-25a3256b9841` |
| Toll reimbursed (desk) | $3,605.00 |
| Toll spend | $5,920.00 |
| Earnings gross | $96,442.57 |
| Cash wash (toll_cash_spend) | $1,670.00 |
| Source of reimbursed | Plaza/tag rows matched to trips (`isPlatformReimbursedPlazaToll`) — rider-paid trip, not a fare line item |
| Toll in trip fare? | No — reimbursement is tag/plaza attribution, tracked separately from `fare_earning` |
| Tag credited on desk? | Yes (`toll_reimbursed` column / Expenses “Tag credited”) |
| Cash wash applied? | Yes for cash plaza only (`toll_cash_spend`); reimbursed tag tolls are not cash-washed |

## Decision (locked)

**Toll reimbursement is separate from fare gross.** Current formula is correct: keep `tollReimbursed` **display-only** on Expenses. Do **not** subtract it from settlement residual (would invent a second credit on top of platform already covering the tag).

## Steps (for future samples)

1. **Pick one real week** on Driver Settlements → Reconciled → open the overlay.
2. **Find a reimbursed toll** in Toll Recon or Unlinked Refunds (status reimbursed / tag credited).
3. **Note the toll amount** ($X) and trip date.
4. **Open that trip** in Trips — check `tollCharges` and fare gross.
5. **Check earnings** for that week — does `earnings_gross` already include the toll?

## §3.7 — Cash source mismatch

The amber “Cash source mismatch” badge is **informational only**. It does **not** block Pay or Reconciled. CSV Uber cash disagrees with ledger payout_cash; **ledger wins**.
