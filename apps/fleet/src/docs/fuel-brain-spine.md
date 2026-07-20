# Fuel Brain Spine (Architecture Contract)

Single source of truth for tank integrity vs km attribution vs stop-to-stop diagnostics.

| Concern | Owner | Must not invent |
|---|---|---|
| Soft/hard anchor + SPLIT | Server `fuel_logic.ts` (`classifyAnchor`, `resolveTankCapacity`) | Threshold forks in `index.tsx` / `fuel_controller.tsx` |
| Cycle display | `fuelCycleEngine.ts` | Re-capping that ignores persisted `volumeContributed` |
| Week health Emerald/Amber/Red | `fuelCalculationService.ts` | Bucket ±20% variance as primary Amber |
| Km purpose (RS / Personal / DH) | `fuelBrainClassify.ts` | Tank integrity / soft-anchor |

## Locked constants

- **Soft anchor threshold:** **98%** of tank capacity (`SOFT_ANCHOR_THRESHOLD = 0.98`)
- **Tank capacity order:** `specifications.tankCapacity` → `fuelSettings.tankCapacity` → `0` (fail closed on server; client UI may default 40 for display only)
- **Trust tiers:** Manual Full Tank = gold; Auto Soft = silver; Soft may close cycles; hard charges / critical paths prefer Manual or clear GAP/overflow

## Canonical `cycleId` (stable UUID)

- Mint **one UUID** when a cycle opens (first fill of a vehicle, or first fill after a soft/hard close).
- Stamp that UUID on **every** `fuel_entry` / fuel `transaction` in the cycle as `metadata.cycleId`.
- Soft SPLIT closer keeps the **same** cycle id; excess carryover opens the **next** UUID.
- Client `fuelCycleEngine` must prefer persisted `metadata.cycleId` over derived `cycle_${entryId}_${index}`.
- Finalized reports store **slim** cycle summaries (ids + stats + `transactionIds`, no embedded `transactions[]`).
- Helpers: `mintCycleId()` / cycle-id stamp flow in `fuel_logic.ts` (mirrored conceptually in client tests).

## Client mirror

Pure helpers live in `utils/fuelAnchorLogic.ts` and must stay in sync with `fuel_logic.ts` exports of the same names.
