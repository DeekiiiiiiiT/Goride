# Legacy `ledger:%` inventory (KV store)

Register of every consumer of **`ledger:%`** keys for the canonical migration. **Update this file** when routes change.

**Plan / runbook:** [`src/solution.md`](../src/solution.md)

---

## Status summary

| Area | State |
|------|--------|
| **Earnings history** | **`GET /ledger/driver-earnings-history?readModel=canonical`** uses **`ledger_event:*`**. Client: `isLedgerEarningsReadModelEnabled()` → `readModel` param. **`shadowCompare=1`** for logs. |
| **Fleet + drivers summaries** | **`readModel=canonical`** uses **`ledger_event:*`**. Client (Dashboard, Drivers page): `isLedgerMoneyReadModelEnabled()` → `readModel`. |
| **Driver overview** | **`GET /ledger/driver-overview?source=canonical`** uses canonical aggregation. |
| **List / count / summary** | **`GET /ledger`**, **`/ledger/count`**, **`/ledger/summary`** — default **`source=canonical`** → **`ledger_event:*`**. Pass **`source=legacy`** for rollback. Count returns **`ledgerEntries`** (canonical) + **`legacyLedgerEntries`** (`ledger:%`). |
| **Trip ↔ ledger gap diagnostic** | **`GET /ledger/diagnostic-trip-ledger-gap`** — **`source=canonical`** (default) uses **`ledger_event:*`** fare rows; **`legacy`** = **`ledger:%`** only; **`both`** returns **`canonical`** + **`legacy`** sections. |
| **InDrive wallet** | **`GET /ledger/driver-indrive-wallet`** — fee math from **`ledger_event:*`** by default (`source=canonical`); loads still **`transaction:*`**; **`both`** compares fee totals vs legacy. |
| **Write kill-switch** | Edge env **`LEGACY_LEDGER_WRITES=false`** blocks **all** new legacy row writes listed under [Writes](#writes-ledger) (trip generator, Uber fallback, transaction→ledger, POST/PATCH/batch, backfill live, repair, `ensure-from-trip-ids`). Dry-run repair/backfill still allowed where implemented. **`DELETE /ledger/:id`** remains for cleanup. |

---

## Reads (`ledger:%`)

| Consumer | Location (server) | Canonical / notes | If legacy reads removed without replacement |
|----------|-------------------|-------------------|---------------------------------------------|
| GET `/ledger` (list + filters) | `index.tsx` | Default **`source=canonical`** → **`ledger_event:*`**; **`source=legacy`** → **`ledger:%`** | Trip Ledger UI uses canonical by default |
| GET `/ledger/count` | `index.tsx` | **`ledgerEntries`** = canonical count; **`legacyLedgerEntries`** = legacy count | Both returned for diagnostics |
| GET `/ledger/summary` | `index.tsx` | Same **`source`** switch; canonical summary uses **`filterByOrg`** after fetch | Aligns with list |
| GET `/ledger/driver-overview` | `index.tsx` | **`source=canonical`** → **`ledger_event:*`**; else legacy | Non-canonical branch wrong if removed early |
| GET `/ledger/driver-earnings-history` | `index.tsx` | **`readModel=canonical`** → **`ledger_event:*`**; default **`readModel=legacy`** if param omitted | Earnings table wrong if default flipped before data ready |
| GET `/ledger/drivers-summary` | `index.tsx` | **`readModel=canonical`** → **`ledger_event:*`** fare rows; default legacy | Drivers page financials |
| GET `/ledger/fleet-summary` | `index.tsx` | **`readModel=canonical`** → period slice of **`ledger_event:*`**; default legacy | Dashboard fleet metrics |
| GET `/ledger/diagnostic-trip-ledger-gap` | `index.tsx` | **`source=canonical`** / **`both`** / **`legacy`** — see status summary | Compares trips to canonical and/or legacy fare rows |
| GET `/ledger/driver-indrive-wallet` | `index.tsx` | **`source=canonical`** / **`both`** / **`legacy`** — see status summary | Loads from transactions unchanged |
| Dedup / integrity inside `generateTripLedgerEntries` | `index.tsx` | Reads **`ledger:%`** for trip-sourced dedup | N/A if generator skipped (`LEGACY_LEDGER_WRITES=false`) |
| `deleteLedgerEntriesForTripSource` | `index.tsx` | **Delete** trip-linked **`ledger:%`** rows | Stale rows if trips change while legacy rows remain |
| Batch delete import | `index.tsx` | **Delete** includes **`ledger:%`** keys | Orphans / cleanup behavior tied to legacy keys |
| POST `/ledger/purge-orphans` | `index.tsx` | Read/delete orphans under **`ledger:%`** | Cleanup targets legacy shape |
| Repair-driver-ids scan | `index.tsx` | Reads all **`ledger:%`** for UUID repair | N/A when only dry-run or kill-switch blocks writes |

---

## Writes (`ledger:%`)

All are **no-ops or 403** when **`LEGACY_LEDGER_WRITES=false`** (except **`DELETE /ledger/:id`**, which remains for deleting existing legacy rows).

| Writer | Route / function | Kill-switch behavior |
|--------|------------------|----------------------|
| Trip → ledger | `generateTripLedgerEntries` | Returns `[]` |
| Uber fallback rows | `buildUberFareEarningFallbackEntriesIfEligible` | Returns `[]` |
| Transaction → ledger | `generateTransactionLedgerEntry` | Returns `null` (no `kv.set`) |
| Fuel / approval paths | `kv.set('ledger:…')` after `generateTransactionLedgerEntry` | Skipped when generator returns `null` |
| POST trips / `fleet/sync` | `kv.mset` ledger chunk after trip save | No rows when generator + fallback return nothing |
| POST `/ledger` | Single create | **403** |
| POST `/ledger/batch` | Batch create | **403** |
| PATCH `/ledger/:id` | Update | **403** |
| POST `/ledger/backfill` | Trip + transaction backfill writes | **403** when **not** `dryRun=true` |
| POST `/ledger/repair-driver-ids` | In-place driverId fix | **403** when **not** `dryRun=true` |
| POST `/ledger/repair-driver` | Regenerate per trip | **403** |
| POST `/ledger/ensure-from-trip-ids` | Import ensure | **403** |
| DELETE `/ledger/:id` | Single delete | **Allowed** (cleanup of old rows) |

---

## Client / API (`src/services/api.ts`)

| Method | Endpoint | Notes |
|--------|----------|-------|
| `getLedger` | GET `/ledger` | Legacy list |
| `getLedgerCount` | GET `/ledger/count` | Legacy |
| `purgeLedgerOrphans` | POST `/ledger/purge-orphans` | Legacy keys |
| `getLedgerSummary` | GET `/ledger/summary` | Legacy |
| `getLedgerDriverOverview` | GET `/ledger/driver-overview` | `source=canonical` supported |
| `getLedgerTripLedgerGapDiagnostic` | GET `/ledger/diagnostic-trip-ledger-gap` | Optional `source` (`canonical` \| `legacy` \| `both`) |
| `getLedgerEarningsHistory` | GET `/ledger/driver-earnings-history` | `readModel`, `shadowCompare` — see `solution.md` |
| `getLedgerDriversSummary` | GET `/ledger/drivers-summary` | Optional `readModel` (`legacy` \| `canonical`) |
| `getLedgerFleetSummary` | GET `/ledger/fleet-summary` | Optional `readModel` (`legacy` \| `canonical`) |
| `getDriverIndriveWallet` | GET `/ledger/driver-indrive-wallet` | Optional `source` (`canonical` \| `legacy` \| `both`); **`both`** flattened to canonical in typed return |
| `repairDriverLedger` | POST `/ledger/repair-driver` | Blocked when `LEGACY_LEDGER_WRITES=false` |
| `runLedgerBackfill` | POST `/ledger/backfill` | Live write blocked when `LEGACY_LEDGER_WRITES=false` |
| `ensureLedgerFromTripIds` | POST `.../ledger/ensure-from-trip-ids` | Blocked when `LEGACY_LEDGER_WRITES=false` |

---

## Admin UI

| File | Role |
|------|------|
| [`src/components/admin/LedgerBackfillPanel.tsx`](../src/components/admin/LedgerBackfillPanel.tsx) | Backfill, toll backup — align with kill-switch / dry-run |

---

## External / manual

- ETL, spreadsheets, or scripts **not in repo** — record separately.
- **Tolls:** **`toll_ledger:*`** is separate from **`ledger:%`** (see toll reconciliation / server toll helpers).

---

## Still to track for “legacy extinction”

1. Migrate or deprecate **legacy-only** GETs: **`/ledger`**, **`/count`**, **`/summary`**, and diagnostics that have no **`ledger_event:*`** equivalent yet.
2. Decide **default** `readModel` / `source` on the server (canonical-first vs legacy-first) after sign-off.
3. **Backfill** historical **`ledger:%`** into **`ledger_event:*`**, or document **cutoff + archive**.
4. Remove **dual-path** UI and flags per Phase 8 in `solution.md`.
