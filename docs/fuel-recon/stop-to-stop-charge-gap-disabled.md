# Stop-to-Stop Charge Gap — enabled runbook

**Status:** Enabled (Rev 3 closeout Wave B)  
**Flag:** `STOP_TO_STOP_CHARGES_ENABLED = true` in `BucketReconciliationView.tsx`

## What Charge Gap does

1. UI requires **exact** confidence tier + panel reconciled (volume/distance/attribution/chain).
2. Client calls `POST …/gap-charges/recommend` (no client vehicle history — server loads the vehicle).
3. Same click then calls `POST …/gap-charges/approve` when the user has `fuel.second_approve`; otherwise toast asks for a second approver.
4. Approve writes a **Pending** `Gap_Deduction` ledger row (`transaction:{id}`) with deterministic id + `metadata.idempotencyKey`.
5. DB unique index `fleet_transactions_gap_deduction_idempotency_uidx` blocks concurrent duplicates.

## Ops checks

- Retry Charge Gap on the same bucket → same `transactionId`, no second row.
- Multi-driver window → recommend returns `blocked` (409).
- Non-exact tier → button hidden / charge blocked.
- Dispute path: FuelDispute on the Pending row (do not flip to Approved from this panel).

## Historical audit

Rows posted before the kill-switch era may still exist. Search ledger for `metadata.transactionType = Gap_Deduction`. Prefer Pending; any Approved from the old client writer should be reviewed manually.
