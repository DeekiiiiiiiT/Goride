# Audit — Split fill (Gas Card + Cash): missing station + Awaiting-statement queue

**Date:** 2026-10-04 · **Status:** Audit only — no code changed · **Scope:** `/fuel/split-fill` path, Transaction Logs station column, Review Queue → Awaiting statement tab

Evidence row (production, project `csfllzzastacofsvcdsc`):

| Half | Table | ID | Date | Driver ID |
|---|---|---|---|---|
| Card anchor | `fleet.fuel_entries` | `8e4584ba-7d67-4f77-9bab-1b6dbc12cff2` | 2026-09-26 | `73e5b1dc-…9841` (Kenny Gregory Rattray) |
| Cash half | `fleet.transactions` | `535a73c7-0958-412a-b8b4-e32092bdeb23` | 2026-09-26 | same |

`fillGroupId = 5b784523-1a73-48b7-9c7f-debc0063c4d6`, pump total $6,000.00.

---

## Issue 1 — "Unknown Station / No GPS metadata" on the split fill

### Finding: GPS was captured. It was never matched.

Both halves carry the driver's location in `metadata.locationMetadata`:

```json
{ "lat": 17.9909783, "lng": -76.979375, "accuracy": 1.216, "timestamp": "2026-09-26T14:31:16.543Z" }
```

That is a 1.2 m-accuracy fix. But `vendor`, `location`, `matchedStationId`, `metadata.locationStatus` and `metadata.verificationMethod` are all `null`.

**Proof it was a verified station.** The same driver's plain Gas Card fills at the same pump matched normally:

| Date | Payment | Station | Method | Distance from 9/26 fix |
|---|---|---|---|---|
| 2026-09-29 | Gas_Card | Jampet Service Station (`8cbe8d0e-06a7-471b-b19b-39435cfbd331`, verified) | `gps_handshake` | ~12 m |
| 2026-09-30 | Gas_Card | Jampet Service Station (same) | `gps_handshake` | ~2 m |
| **2026-09-26** | **Gas_Card (split)** | **—** | **—** | — |

### Root cause

The two driver flows send the same location payload but hit different server endpoints, and only one of them runs station matching.

| Flow | Client | Server | Station matching? |
|---|---|---|---|
| Gas Card only | `fuelService.saveFuelEntry` → `POST /fuel-entries` | [fuel_controller.tsx:4480-4723](../supabase/functions/_fleet-server/fuel_controller.tsx#L4480-L4723) | **Yes.** `extractEntryCoords` → `findMatchingStationSmart` (600 m) → sets `matchedStationId`, `vendor`, `locationStatus`, signature/lock; no match → Learnt Location; no GPS → gate-hold |
| Gas Card + Cash | `fuelService.saveSplitFill` → `POST /fuel/split-fill` | [fuel_split_fill.ts:60-285](../supabase/functions/_fleet-server/fuel_split_fill.ts#L60-L285) `persistSplitFill` | **No.** Writes both rows straight to storage. No coord extraction, no smart match, no Learnt Location, no gate-hold, no signature |

`persistSplitFill` does odometer projection, retail price stamp, anchor-conflict and soft-dedup checks, but none of the station pipeline. With nothing stamped, [jaaStationDisplay.ts:188-200](../apps/fleet/src/utils/jaaStationDisplay.ts#L188-L200) falls through to `'Unknown Station'` / `'No GPS metadata'`. The subtitle text is misleading: it means "no address resolved," not "no GPS."

Secondary consequences of the same root cause:

- Split fills are **never geofence-verified, signed or auto-locked**, so they carry less audit evidence than a plain Gas Card fill even though they involve cash reimbursement.
- A split fill at an **unverified** station does not create a Learnt Location, so the "if it's not on my verified list I'd know" control silently does not apply.
- A split fill with **no GPS at all** is not gate-held. It saves normally.
- The offline queue (`SUBMIT_SPLIT_FUEL_FILL` in [OfflineProvider.tsx:176](../apps/driver/src/components/providers/OfflineProvider.tsx#L176)) uses the same endpoint, so it has the same gap.

### Fix

**F1.1 — Extract the station pipeline into one shared function (server).**
Move [fuel_controller.tsx:4480-4663](../supabase/functions/_fleet-server/fuel_controller.tsx#L4480-L4663) (coord normalization → manual override → smart match → ambiguous → Learnt Location) into a new module, e.g. `_fleet-server/fuel_station_match.ts`:

```ts
export async function applyStationMatch(entry: Record<string, any>): Promise<{
  outcome: "verified" | "review_required" | "ambiguous" | "learnt" | "no_gps" | "skipped";
}>;
```

`POST /fuel-entries` calls it and keeps its existing no-GPS gate-hold branch. One implementation means the two paths cannot drift again.

**F1.2 — Call it from `persistSplitFill`.**
Run it on `cardEntry` after `enrichRecordWithDriverVehicle` and **before** `stampFuelEntryRetailPrice` and `findSoftDuplicateFuelEntry`, because soft-dedup compares vendor/location. Then mirror the result onto the cash half so both halves of one pump stop agree:

```ts
const match = await applyStationMatch(cardEntry);
cashTx.vendor = cardEntry.vendor;
cashTx.matchedStationId = cardEntry.matchedStationId;
cashTx.metadata = {
  ...(cashTx.metadata as Record<string, unknown>),
  matchedStationId: cardEntry.matchedStationId ?? null,
  locationStatus: (cardEntry.metadata as any)?.locationStatus,
  verificationMethod: (cardEntry.metadata as any)?.verificationMethod,
  stationLocation: cardEntry.stationAddress || "",
};
```

- **No-GPS case:** do **not** reuse the `/fuel-entries` gate-hold (it rewrites the entry as a held transaction and returns early, which would break the atomic two-row write). Instead stamp `locationStatus: 'unknown'`, `stationGateHold: true` on the card half and create the Learnt Location. That puts it in front of an admin without splitting the pair.
- Keep the signature/auto-lock step. Run it only on the card half, after the cash half is written, so the hash covers the final record.

**F1.3 — Fix the misleading label (UI).**
In [jaaStationDisplay.ts:200](../apps/fleet/src/utils/jaaStationDisplay.ts#L200), when `metadata.locationMetadata.lat` exists but no station resolved, show `'GPS captured — not matched'` instead of `'No GPS metadata'`. Apply the same to the driver mirror [fuelStationDisplay.ts:152](../apps/driver/src/utils/fuelStationDisplay.ts#L152) and update [jaaStationDisplay.test.ts:133](../apps/fleet/src/utils/jaaStationDisplay.test.ts#L133).

**F1.4 — Backfill existing split rows.**
After deploy, re-run `applyStationMatch` on every `fleet.fuel_entries` row where `payload_json->'metadata'->>'fillGroupId' is not null and payload_json->>'matchedStationId' is null`, then mirror onto the sibling `fleet.transactions` row. Today that is one pair, and it should resolve to Jampet Service Station. Use a script through the server function rather than raw SQL, so `bumpStationPriceStats` and the signature run.

**F1.5 — Test.** Add a `persistSplitFill` test: card entry with `locationMetadata` 10 m from a verified station fixture → both rows come back with `matchedStationId` set and `locationStatus: 'verified'`. Add a second case with no GPS → `stationGateHold: true` + Learnt Location created, and both rows still written.

---

## Issue 2a — Review Queue shows a UUID instead of the driver's name

### Root cause

The cash half is saved without `driverName`. Every other fuel transaction for this driver has it (`"Kenny Gregory Rattray"`); only the split row is `null`.

1. **Client.** The split payload builder at [DriverExpenses.tsx:856-859](../apps/driver/src/components/fleet/DriverExpenses.tsx#L856-L859) destructures only `driverId` from `resolveCanonicalDriverIdentity`. The cash-fuel paths at [line 1264](../apps/driver/src/components/fleet/DriverExpenses.tsx#L1264) and [line 1385](../apps/driver/src/components/fleet/DriverExpenses.tsx#L1385) take `driverName` too and put it on the payload.
2. **Server.** [fuel_split_fill.ts:166-172](../supabase/functions/_fleet-server/fuel_split_fill.ts#L166-L172) runs `enrichRecordWithDriverVehicle` on the **card** entry only. The cash transaction is never enriched.
3. **UI.** [FuelReimbursementTable.tsx:1343](../apps/fleet/src/components/fuel/FuelReimbursementTable.tsx#L1343) (and the Split mismatches tab at line 1238) render `tx.driverName || tx.driverId`, so a missing name prints the raw UUID.

### Fix

- **F2a.1** In `buildSplitPayloads`, take `driverName: canonicalDriverName` and put it on both the cash transaction and the card entry.
- **F2a.2** In `persistSplitFill`, resolve the name server-side from `fleet.drivers` by `driverId` when it is missing, and stamp both halves. This also covers the offline queue and any older driver-app build still in the field.
- **F2a.3** In the two Review Queue tables, fall back to a driver lookup (the page already loads drivers for other tabs) before the UUID, and show `'Unknown driver'` rather than a raw ID.
- **F2a.4** Backfill `driverName` on transaction `535a73c7-0958-412a-b8b4-e32092bdeb23` and any other `fillGroupId` row missing it.

---

## Issue 2b — Why does the Awaiting statement tab offer "Resolve"?

### What the row is

This is the cash half of the split. By design, cash = pump total − gas card amount, and the gas card amount only becomes known when Roam uploads the Dominion/JAA CSV. Until then the row sits at $0 with `awaitingCashStatement: true`.

Production check: **no statement rows have been imported for 2026-09-24 → 2026-10-04.** The row is waiting correctly on the CSV upload. Nothing is wrong with it.

### Why the button exists

It was added deliberately in the Split Cash Guardian remediation (finding **C3** in [fuel-split-statement-derived-audit.md](fuel-split-statement-derived-audit.md)). Without it, a statement that never matches would leave the driver's cash stranded forever. The dialog ([SplitCashResolveDialog.tsx](../apps/fleet/src/components/fuel/SplitCashResolveDialog.tsx)) offers:

- **Accept derived cash.** Disabled here, because there is no statement amount yet.
- **Enter cash amount.** Available. Lets staff set the cash manually.
- **Void reimbursement.** Available. Rejects the driver's cash.

### The problem

The escape hatch is offered on **every** awaiting row from day 0, not only on rows where the statement has actually failed. That has three effects:

1. **It bypasses the CSV process.** Staff can type a cash figure on day 1, before Roam uploads the statement. The design point of "cash = pump − card from the CSV" is defeated, and an OCR'd pump total becomes the payout with no cross-check.
2. **The UI is the only gate.** `handleResolveSplitCash` at [FuelManagement.tsx:1541-1578](../apps/fleet/src/pages/FuelManagement.tsx#L1541-L1578) builds the patch in the browser with fuel-core helpers and saves it through the generic `api.saveTransaction`. No server rule says "an awaiting row can't be resolved until the statement lands or the row is stale." Anyone with a role that can save transactions can do this through the API.
3. **Conflict with the later CSV is unverified.** If staff enter cash and the CSV then arrives, whether `fuel_jaa_match.ts` skips the row, overwrites it, or pays twice was not traced in this audit. Verify it before shipping F2b.

The page also does not say *who* is expected to act. For a fresh row the answer is "Roam uploads the CSV", not "a fleet user resolves it."

### Fix

**F2b.1 — Replace the button with a status on fresh rows (UI).**
In [FuelReimbursementTable.tsx:1360-1371](../apps/fleet/src/components/fuel/FuelReimbursementTable.tsx#L1360-L1371):

- `days < AWAITING_CASH_STALE_DAYS` (14): show a muted badge, **"Waiting for gas card statement (CSV)"**, and no button. Optionally add a link to the statement import screen for users with import permission.
- `days >= 14` (already flagged by `isStaleAwaitingCash` and the amber banner): show **"Escalate"**. Open the existing dialog only for `fleet_owner` / admin, under a new permission such as `fuel.split_cash_override` instead of the broad `fuel.approve`.
- Rewrite the tab's helper text: "Cash is calculated automatically when Roam uploads the gas card statement. No action needed unless a fill has waited 14+ days."

**F2b.2 — Enforce it on the server.**
Add a dedicated endpoint (e.g. `POST /fuel/split-fill/:fillGroupId/resolve`) that runs the fuel-core resolve helpers server-side. It refuses with `409 SPLIT_CASH_AWAITING_STATEMENT` when the row is `awaitingCashStatement`, no statement has matched, and it is under 14 days old. Also make the generic transaction save reject edits that clear `awaitingCashStatement` on a split cash row. Move `handleResolveSplitCash` to the new endpoint.

**F2b.3 — Close the CSV race.**
Before shipping, trace `fuel_jaa_match.ts`. When a statement row matches a split whose cash half was already manually resolved, it must not pay again. It should either record the variance against the manual figure (Split mismatches tab) or skip with an audit note. Add a sequence test: split fill → manual resolve at day 15 → CSV import → driver paid exactly once.

**F2b.4 — Keep the stale escape hatch.** Do not remove resolve entirely. That reopens C3: if a statement never matches (wrong card, issuer error), the driver's cash would be stranded with no way to pay or void it.

---

## Apply order

1. **F2a.1–F2a.4** (driver name). Smallest change, no money impact.
2. **F1.1–F1.3, F1.5** (station matching in the split path, plus tests). Deploy edge.
3. **F1.4** backfill. Re-check the 9/26 row shows Jampet Service Station.
4. **F2b.3** trace and test first, then **F2b.2** (server gate), then **F2b.1** (UI). Shipping the UI alone leaves the API open.

## Gate before marking done

- `npx tsc -p apps/fleet/tsconfig.json --noEmit | grep -c "error TS"` must not exceed the current baseline. Vitest strips types, so a green suite alone is not enough.
- Deno tests for `fuel_split_fill.ts` and the new `fuel_station_match.ts` must be listed explicitly in `ci.yml` (Deno tests are not globbed).
- Production SQL check: zero `fillGroupId` fuel entries that have `locationMetadata.lat` but a null `matchedStationId` and no `learntLocationId`.
