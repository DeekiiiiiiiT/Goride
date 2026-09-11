# Close vocabulary (Close Integrity)

Short glossary so later passes do not “fix” deliberate behavior.

## `skipSettlementDeskClear` (M-4)

- **Legacy flag** still accepted on restatement re-sign paths (`acceptRestatementDrafts`).
- **Behavior since Pass 3/4:** ignored for desk owes. `SETTLEMENT_FLEET_OWES` / `SETTLEMENT_DRIVER_OWES` always run (`closeInvariants.ts` voids the flag).
- Do **not** restore a bypass that lets restatement close with unpaid settlement.

## `closeWeekStatements` (M-3)

- Draft → closed for a driver-week is a **single** `.in('id', ids)` update (not a mid-loop per-row throw that leaves mixed draft/closed).
- Supersede retire is a second batch `.in` — recoverable if it fails; next prepare cleans drafts.

## Custody carry (Pass 4–6)

| Code | When |
|------|------|
| `CUSTODY_NO_OPEN_TARGET` | Close with held cash and no non-frozen week within 52 weeks ahead — **block before freeze** (Pass 6 / N-3) |
| `REOPEN_CUSTODY_SUCCESSOR_FROZEN` | Reopen week N whose custody was carried to a still-frozen successor — reopen successor first |
| `PRIOR_CLOSE_HASH_CHANGED` | Re-close hash ≠ archived `priorCloseHash` — **warn** only (H-3); does not block |

Carry writes go through `persistPeriodRowWithVersion`. Target is the first open week after N (not blind `+7`).
`retryFreezeWeek` and re-Close on an already-frozen week also run custody carry so a post-freeze strand is recoverable without reopen.