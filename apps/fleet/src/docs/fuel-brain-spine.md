# Fuel Brain Spine (Architecture Contract)

Single source of truth for tank integrity vs km attribution vs stop-to-stop diagnostics.

| Concern | Owner | Must not invent |
|---|---|---|
| Capacity full close + SPLIT | Server `fuel_logic.ts` (`classifyAnchor`, `resolveTankCapacity`) | Threshold forks in `index.tsx` / `fuel_controller.tsx` |
| Cycle display | `fuelCycleEngine.ts` | Re-capping that ignores persisted `volumeContributed` |
| Week health Emerald/Amber/Red | `fuelCalculationService.ts` | Bucket ±20% variance as primary Amber |
| Km purpose (RS / Personal / DH) | `fuelBrainClassify.ts` | Tank integrity / capacity close |

## Locked constants

- **Capacity full threshold:** **98%** of tank capacity (`SOFT_ANCHOR_THRESHOLD` / `CAPACITY_CLOSE_THRESHOLD = 0.98`)
- **Tank capacity order:** `specifications.tankCapacity` → `fuelSettings.tankCapacity` → `0` (fail closed on server; client UI may default 40 for display only)
- **Trust:** Capacity full close (with spillover) is the only tank-cycle close. Driver Full Tank checkbox removed / ignored. Expense-backed fills (`type: Reimbursement` in Roam) **do** participate in capacity cycles; only ignore stale hard/Full Tank flags.

## Cycle close rule

1. Sum liters in the open cycle (plus carryover `excessVolume` from prior capacity close).
2. When cumulative ≥ 98% of tank capacity → **capacity full close**.
3. Always **SPLIT**: `volumeContributed` fills this cycle to capacity; `excessVolume` opens the next cycle.
4. Stamp `metadata.cycleId` on every fill; mint a new UUID after a capacity close when spillover starts the next cycle.

## Canonical `cycleId` (stable UUID)

- Mint **one UUID** when a cycle opens (first fill of a vehicle, or first fill after a capacity close).
- Stamp that UUID on **every** `fuel_entry` / fuel `transaction` in the cycle as `metadata.cycleId`.
- Capacity SPLIT closer keeps the **same** cycle id for the closing fill; excess carryover opens the **next** UUID.
- Client `fuelCycleEngine` must prefer persisted `metadata.cycleId` over derived `cycle_${entryId}_${index}`.
- Finalized reports store **slim** cycle summaries (ids + stats + `transactionIds`, no embedded `transactions[]`).
- Helpers: `mintCycleId()` / cycle-id stamp flow in `fuel_logic.ts` (mirrored conceptually in client tests).

## Client mirror

Pure helpers live in `utils/fuelAnchorLogic.ts` and must stay in sync with `fuel_logic.ts` exports of the same names.
