# Fuel Brain Spine (Architecture Contract)

Single source of truth for tank integrity vs km attribution vs stop-to-stop diagnostics.

| Concern | Owner | Must not invent |
|---|---|---|
| Cycle stamp + lane split | Server `fuel_cycle_stamp.ts` | Ad-hoc cycle math in `index.tsx` / `fuel_controller.tsx` |
| Close policy (rideshare default) | `fuel_cycle_close_policy.ts` | Client-only 98% stacking unless org opts into `cumulative_98` |
| Cycle snapshots | `fuel_cycle_snapshot.ts` + `GET /fuel/cycles` | Client re-derive when server snapshot available |
| Log KPI roll-up | `GET /fuel/log-summary` | Client totals when server summary available |
| Corrections to sealed rows | `fuel_entry_corrections` table + `correctionReason` | Client `bypassSignatureCheck` (removed) |
| Week health Emerald/Amber/Red | `fuelCalculationService.ts` | Bucket ±20% variance as primary Amber |
| Km purpose (RS / Personal / DH) | `fuelBrainClassify.ts` | Tank integrity / capacity close |

## Client engine is legacy-only

`utils/fuelCycleEngine.ts` (`calculateFuelCycles`) is now the **fallback**, not the source of truth.
`useFuelCycles` fetches the server snapshot (`GET /fuel/cycles`) per vehicle and hydrates it; it
only runs the in-browser engine when `VITE_FUEL_CYCLE_LEGACY_CLIENT=1`, when a caller passes
`legacyClient`, or when the server fetch fails (silent fallback so Full Tanks never blanks out).
The client engine also no longer fabricates a 40 L tank: a vehicle with no configured tank
capacity is skipped entirely.

## Corrections replace bypassSignatureCheck

Sealed fuel rows (signed / locked / finalized) can no longer be edited via a client
`bypassSignatureCheck` flag — the server strips it. Editing a sealed row requires a
`correctionReason`; the server records an append-only `fuel_entry_corrections` row
(reason + field diffs + signature rotation) and rotates the signature. History is read via
`GET /fuel-entries/:id/corrections`.

## Three lanes (locked)

```
Cash lane liters  ──► tank cycle volume (partials OK; cumulative_98 stacks to ~tank size)
Card statement    ──► Card Inventory only (jaa_raw / approved_fuel) — never tank volume
Card ops log      ──► after CSV match: liters count on the Gas Card ops row (statement stays inventory-only)
```

**Matched pairs** (`jaaMatchedStatementId` ↔ `jaaMatchedDriverEntryId`) count as **one** swipe for frequency; frequency flags suppressed. Awaiting (pre-match) Gas Card anchors contribute **0** liters until statement liters land.

**5179KZ / fleets that expect “every full tank ≈ tank capacity liters”:** set `vehicle.fuelSettings.cycleCloseMode = cumulative_98` (default org-wide is still `rideshare`).

## Close modes

| Mode | Default | Closes when |
|---|---|---|
| `rideshare` | **Yes (all fleets)** | Single fill ≥ 90% tank, admin confirmed full, week finalize |
| `cumulative_98` | Org opt-in (`fuelSettings.cycleCloseMode`) | Legacy 98% partial stacking + SPLIT |

Org flag: `vehicle.fuelSettings.cycleCloseMode` or `config:audit_settings.cycleCloseMode`.

## Signal tiers (UI contract)

| Tier | Meaning | Header count | Finalize |
|---|---|---|---|
| `observe` | Log only (fragmented purchase, high $/km) | No | Allowed |
| `review` | Queue (unmatched card, same-odo same day) | No | Warn |
| `exception` | Real problem (odo regression, duplicate card) | **Yes — "Exceptions"** | **Blocked** |

Cycle `status` (Complete / Active / Anomaly) is decoupled from row `integrityStatus`. Overflow from partial stacking is **informational** in rideshare mode — not an exception.

## Canonical `cycleId` (stable UUID)

- Mint **one UUID** when a cycle opens; stamp on every fill as `metadata.cycleId`.
- Server stamper is the single write path: `stampEntryCycleMetadata`.
- Client `useFuelCycles` reads `GET /fuel/cycles`; fallback `fuelCycleEngine` only when `VITE_FUEL_CYCLE_LEGACY_CLIENT=1`.

## Client mirror

- `utils/fuelCycleClosePolicy.ts` — close mode helpers (keep in sync with server).
- `utils/fuelAnchorLogic.ts` — legacy 98% classify for `cumulative_98` orgs only.

## Fuel Brain vs Cycle engine vs Ledger

- **Fuel Brain** = km attribution (RS / Personal / Deadhead)
- **Cycle engine** = tank/cost grouping (cash lane + close policy)
- **Ledger** = wallet money (Pending → Finalize settlement)
