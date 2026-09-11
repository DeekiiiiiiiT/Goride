# Close integrity — Phase 0 rebuild call-site inventory

Inventory of every `rebuildOneDriverPeriod` / `rebuildPeriodsForAnchors` caller.
After Phase 1D early-skip, **all** of these become **skip** for frozen weeks (no throw, no seal overwrite). Cash-sync remains the only `allowFrozen: true` write path and strips seal columns (Phase 1C).

Disposition legend:

| Disposition | Meaning |
|-------------|---------|
| **skip** | Frozen weeks skipped inside rebuild helpers (Phase 1D). |
| **allowFrozen-reviewed** | Explicit `allowFrozen: true` on persist; seal columns stripped (1C). |
| **throw** | Would have thrown via persist freeze guard — superseded by early-skip. |

## `rebuildOneDriverPeriod`

| Caller | Location | Disposition |
|--------|----------|-------------|
| `dispute_refund_controller.tsx` | ~541, ~916 | **skip** |
| `driver_financial_period_controller.tsx` | ~525, ~539 | **skip** |
| `fuel_financial_reset.ts` | ~224, ~364 | **skip** |
| `syncPeriodCashFromTransactions` (internal) | `driver_financial_periods.ts` ~2244 | **skip** (falls through to rebuild only when row missing) |

## `rebuildPeriodsForAnchors`

| Caller | Location | Disposition |
|--------|----------|-------------|
| `toll_controller.tsx` | ~4516, ~4599 | **skip** |
| `toll_period_controller.tsx` | ~752, ~818, ~835 | **skip** |
| `toll_financial_reset.ts` | ~933 | **skip** |
| `fuel_financial_reset.ts` | ~136 | **skip** |
| `fuel_period_routes.ts` | ~99 | **skip** |
| `period_reset.ts` | ~514 | **skip** |
| `settlement_audit_repair.ts` | ~29, ~59 | **skip** |
| `heal_feb16_reimport_recovery.ts` | ~34 | **skip** |
| `week_close.ts` (prepare path) | ~616 | **skip** |
| `driver_financial_period_controller.tsx` | ~430 | **skip** |

## Related write path (not a rebuild)

| Path | Disposition |
|------|-------------|
| `syncPeriodCashFromTransactions` → `updatePeriodCashWithVersion(..., { allowFrozen: true })` | **allowFrozen-reviewed** — cash fields only; `source_event_hash` / `close_hash` stripped before write |
| `carryForwardCashCustodyAfterFreeze` source mark → `persistPeriodRowWithVersion(..., { allowFrozen: true })` | **allowFrozen-reviewed** — metadata transfer marks only after successor write (Pass 4 N-2) |
| `carryForwardCashCustodyAfterFreeze` successor → `persistPeriodRowWithVersion` (no allowFrozen) | **skip** frozen targets — walks to first open week or `CUSTODY_NO_OPEN_TARGET` |
| `processFinancialOutbox` | Already skips signed weeks unless `payload.force`; still subject to persist freeze guard |

See also `docs/CLOSE_VOCABULARY.md` (M-3 / M-4 / custody error codes).

## Verification

1. Close a week → call any rebuild entry above for that anchor → row money columns and `close_hash` unchanged; `assertFrozenPeriodHashIntact` still passes.
2. Outbox drain without `force` continues to skip signed anchors.
3. Close week N when N+1 is frozen → custody lands on first open later week (or `CUSTODY_NO_OPEN_TARGET`).
4. Reopen N after carry → successor opening reduced; Collect does not double-count.
