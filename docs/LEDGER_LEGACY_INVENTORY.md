# Legacy `ledger:%` inventory (KV store)

Generated for the canonical migration plan. **Update this file** when routes change.

| Consumer | Read/Write | Location / route | Risk if legacy `ledger:%` reads stop |
|----------|------------|------------------|--------------------------------------|
| Trip edit / delete cleanup | Write (delete) | `deleteLedgerEntriesForTripSource` — `index.tsx` | Stale fare rows if trips change |
| Trip → ledger generator | **Write** | `generateTripLedgerEntries` — `index.tsx` | **No new fare lines** — Phase 6 |
| Integrity / repair helpers | Read | `generateTripLedgerEntries` area — `.like("ledger:%")` | Repair logic breaks |
| POST trips / batch save | **Write** | `kv.set('ledger:...')` — `index.tsx` ~3135+ | Trips stop creating fare rows |
| GET `/ledger` (list) | Read | `index.tsx` ~3342 | Driver ledger page empty |
| GET `/ledger/count` | Read | `index.tsx` ~3450 | Diagnostics wrong |
| POST `/ledger/purge-orphans` | Read/Delete | `index.tsx` ~3512 | Cleanup can't find orphans |
| GET `/ledger/summary` | Read | `index.tsx` ~3737 | Summary wrong |
| GET `/ledger/driver-overview` (non-canonical) | Read | `index.tsx` ~3964+ | Overview falls back wrong if branch removed |
| GET `/ledger/diagnostic-trip-ledger-gap` | Read | `index.tsx` ~4505 | Gap diagnosis wrong |
| GET `/ledger/driver-indrive-wallet` | Read | `index.tsx` ~4757 | May mix sources |
| GET `/ledger/driver-earnings-history` | Read | `index.tsx` ~6128 | **Earnings table** — Phase 4 |
| Batch delete import | Delete | `index.tsx` ~7930 | Batch delete still clears trip-linked rows |
| GET `/ledger/drivers-summary` | Read | `index.tsx` ~13772 | **Drivers page** financials |
| GET `/ledger/fleet-summary` | Read | `index.tsx` ~13917 | **Dashboard / FinancialsView** |
| Repair / backfill | **Write** | `POST /ledger/repair-driver`, `POST /ledger/backfill` | **Phase 6** |
| POST `/ledger/batch` | **Write** | `index.tsx` ~5102 | Manual batch writes |
| PATCH/DELETE `/ledger/:id` | Read/Write | `index.tsx` ~5190+ | Single entry CRUD |

## Client / API (`src/services/api.ts`)

| Method | Endpoint | Notes |
|--------|----------|--------|
| `getLedger` | GET `/ledger` | |
| `getLedgerCount` | GET `/ledger/count` | |
| `purgeLedgerOrphans` | POST `/ledger/purge-orphans` | |
| `getLedgerSummary` | GET `/ledger/summary` | |
| `getLedgerDriverOverview` | GET `/ledger/driver-overview` | `source=canonical` supported |
| `getLedgerTripLedgerGapDiagnostic` | GET `/ledger/diagnostic-trip-ledger-gap` | |
| `getLedgerEarningsHistory` | GET `/ledger/driver-earnings-history` | `readModel`, `shadowCompare` — see `solution.md` |
| `repairDriverLedger` | POST `/ledger/repair-driver` | |
| `runLedgerBackfill` | POST `/ledger/backfill` | |
| `ensureLedgerFromTripIds` | fleet `ledger/ensure-from-trip-ids` | |

## Admin UI

| File | Role |
|------|------|
| [`src/components/admin/LedgerBackfillPanel.tsx`](../src/components/admin/LedgerBackfillPanel.tsx) | Backfill, toll backup |

## External / manual

- ETL, spreadsheets, or scripts **not in repo** — record separately.
- **Tolls:** `toll_ledger:*` is separate from `ledger:%` (see `toll_controller.tsx`).
