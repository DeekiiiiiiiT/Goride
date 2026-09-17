# Stop-to-Stop Charge Gap — runbook (Rev 9)

**Status:** Enabled — solo-owner operable; multi-user dual control parked  
**Flag:** `STOP_TO_STOP_CHARGES_ENABLED` in `BucketReconciliationView.tsx`  
**Edge:** Client calls `/fleet-fuel` → `fuel_period_routes` gap-charge handlers

## Flow (solo owner — current)

1. UI requires **exact** confidence tier + panel reconciled + period not locked.
2. **Post charge (Pending)** → recommend then auto-approve in one step.  
   - Refuses if period **locked** (`period_locked` 409).  
   - Requires signed-in actor (`actor_required` 401).  
   - Org check on vehicle; stamps `recommendedBy`.  
   - Writes **Pending** `Gap_Deduction` ledger row.
3. If approve falls through, row stays **Recommended** — use **Approve charge (Pending)** on the same login.
4. Idempotency: deterministic tx id + unique index.

## Multi-user (deferred)

When owners use a second team login, turn on distinct-actor dual control (`requireDistinctActor: true`), set `autoApprove: false`, and run the checklist in Notion: **Future Features → Future tests — Gap charge dual control (multi-user)**.

## Ops checks (solo)

- Post charge on exact + reconciled row → Pending ledger.
- Locked week → mutate APIs 409; UI buttons hidden.
- Dispute via FuelDispute on the Pending row.

## Kill switch

Set `STOP_TO_STOP_CHARGES_ENABLED = false` to hide CTAs immediately.
