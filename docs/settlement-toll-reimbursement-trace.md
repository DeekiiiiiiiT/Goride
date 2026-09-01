# Toll Reimbursement Trace Checklist (P-6 / §3.8)

Use this when you need to answer: **did Uber already pay the toll inside the fare?**

## Steps

1. **Pick one real week** on Driver Settlements → Reconciled → open the overlay.
2. **Find a reimbursed toll** in Toll Recon or Unlinked Refunds (status reimbursed / tag credited).
3. **Note the toll amount** ($X) and trip date.
4. **Open that trip** in Trips — check `tollCharges` and fare gross.
5. **Check earnings** for that week — does `earnings_gross` already include the toll?

## Fill in

| Field | Your answer |
|---|---|
| Week (Mon anchor) | |
| Toll amount $X | |
| Trip ID | |
| Toll in trip fare? (yes/no) | |
| Tag credited on desk? (yes/no) | |
| Cash wash applied? (yes/no) | |

## Decision

- **Toll is separate from fare** → current formula is correct; we only add a display line “Tag reimbursed $X”.
- **Toll is inside fare gross** → engineering must change commission/wash math (triple-benefit risk).

## §3.7 — Cash source mismatch

The amber “Cash source mismatch” badge is **informational only**. It does **not** block Pay or Reconciled. CSV Uber cash disagrees with ledger payout_cash; **ledger wins**.
