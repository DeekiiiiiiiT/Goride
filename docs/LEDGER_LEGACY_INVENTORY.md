# Ledger KV inventory (`ledger_event:*` vs `ledger:%`)

**Money SSOT:** **`ledger_event:*`** (canonical events). **`ledger:%`** keys are **legacy** trip-sourced rows; new writes from app code paths are **disabled** (generators return empty / `null`; mutating routes return **403**).

**Plan / runbook:** [`src/solution.md`](../src/solution.md) · **Operator purge template:** [`scripts/purge-legacy-ledger-kv.sql`](../scripts/purge-legacy-ledger-kv.sql)

---

## Status summary

| Area | State |
|------|--------|
| **Driver overview** | **`GET /ledger/driver-overview`** — **`ledger_event:*`** only (legacy branch removed). |
| **Earnings history** | **`GET /ledger/driver-earnings-history`** — **`ledger_event:*`** only; no **`readModel=legacy`**, no shadow-compare logging. |
| **Fleet / drivers summaries** | **`GET /ledger/fleet-summary`**, **`/ledger/drivers-summary`** — **`ledger_event:*`** only. |
| **List / summary** | **`GET /ledger`**, **`/ledger/summary`** — list reads **`ledger_event:*`** only (`resolveLedgerApiSourceParam` always canonical; `?source=legacy` is ignored for prefix). |
| **Count** | **`GET /ledger/count`** — returns **`ledgerEntries`** (canonical) **and** **`legacyLedgerEntries`** (count of **`ledger:%`**) for **diagnostics** until KV purge. |
| **Gap diagnostic** | **`GET /ledger/diagnostic-trip-ledger-gap`** — compares trips to **`ledger_event:*`** `fare_earning` rows only. |
| **InDrive wallet** | **`GET /ledger/driver-indrive-wallet`** — fee math from **`ledger_event:*`** only; loads from **`transaction:*`** unchanged. |
| **Legacy writes** | **`legacyLedgerWritesDisabled()`** is **always true** in code ( **`LEGACY_LEDGER_WRITES`** env is **not** read). Trip/txn generators are no-ops; POST/PATCH/batch backfill/repair/ensure return **403** as before. |
| **Imports (client)** | Merged import no longer calls **`ensureLedgerFromTripIds`** (see **`ImportsPage`**, **`data-import-executor.ts`**) — canonical append only. |
| **Admin backfill UI** | **`LedgerBackfillPanel`** — live legacy runs disabled in UI; dry-run preview retained. Trip **`LedgerView`** does not offer legacy mass backfill. |

---

## Product reads (canonical only)

These routes **do not** serve money aggregates from **`ledger:%`** anymore:

| Route | Server | Notes |
|-------|--------|--------|
| GET `/ledger` (list) | `index.tsx` | Queries **`ledger_event:%`** only. |
| GET `/ledger/summary` | `index.tsx` | Same. |
| GET `/ledger/driver-overview` | `index.tsx` | Canonical aggregation only. |
| GET `/ledger/driver-earnings-history` | `index.tsx` | **`fetchAllLedgerEventValuesForDrivers`** only. |
| GET `/ledger/drivers-summary` | `index.tsx` | **`fetchCanonicalFareEarningAll`** only. |
| GET `/ledger/fleet-summary` | `index.tsx` | **`fetchCanonicalLedgerEventsInPeriod`** only. |
| GET `/ledger/diagnostic-trip-ledger-gap` | `index.tsx` | **`fetchFareEarningRows("ledger_event:%")`** only. |
| GET `/ledger/driver-indrive-wallet` | `index.tsx` | **`fetchLedgerEntryValues("ledger_event:%")`** for fees. |

**Client:** no feature-flag branching; see [`src/services/api.ts`](../src/services/api.ts) — list/call sites omit legacy params; **`getDriverIndriveWallet`** returns typed **`IndriveWalletSummary`** from canonical fees only.

---

## Remaining `ledger:%` touchpoints (diagnostics / cleanup / ops)

These **still** reference **`ledger:%`** until you delete keys (e.g. [`scripts/purge-legacy-ledger-kv.sql`](../scripts/purge-legacy-ledger-kv.sql)) and optionally simplify code:

| Consumer | Location (server) | Role |
|----------|-------------------|------|
| GET `/ledger/count` | `index.tsx` | Second query: **`legacyLedgerEntries`** count under **`ledger:%`** (diagnostics pre-purge). |
| `deleteLedgerEntriesForTripSource` | `index.tsx` | Deletes trip-linked **`ledger:%`** rows when trips change/delete. |
| Batch delete / import cleanup | `index.tsx` | May include **`ledger:%`** keys. |
| POST `/ledger/purge-orphans` | `index.tsx` | Finds/removes orphan **`ledger:%`** rows (permission-gated). |
| POST `/ledger/repair-driver-ids` (scan) | `index.tsx` | Scans **`ledger:%`** for UUID repair (writes **403** when not dry-run). |
| Other scans / helpers | `index.tsx` | Grep **`like("key", "ledger:%")`** for repair/import/dedup paths. |

**Not applicable anymore:** live **`generateTripLedgerEntries`** dedup against **`ledger:%`** — the generator is a **no-op** (empty return).

---

## Writes (`ledger:%`)

| Code path | Behavior |
|-----------|----------|
| `generateTripLedgerEntries` | Returns **`[]`** (no new rows). |
| `buildUberFareEarningFallbackEntriesIfEligible` | Returns **`[]`**. |
| `generateTransactionLedgerEntry` | Returns **`null`**. |
| POST `/ledger`, `/ledger/batch`, PATCH `/ledger/:id` | **403** |
| POST `/ledger/backfill`, `/repair-driver`, `/ensure-from-trip-ids`, etc. | **403** (or dry-run only where implemented) |
| DELETE `/ledger/:id` | Allowed — delete existing legacy row by id. |

**Env:** **`LEGACY_LEDGER_WRITES`** is **not** read; behavior is fixed in code.

---

## Client / API (`src/services/api.ts`)

| Method | Endpoint | Notes |
|--------|----------|--------|
| `getLedger` | GET `/ledger` | Canonical list only (`source` resolver always canonical). |
| `getLedgerCount` | GET `/ledger/count` | **`ledgerEntries`** + **`legacyLedgerEntries`**. |
| `getLedgerSummary` | GET `/ledger/summary` | Canonical summary. |
| `getLedgerDriverOverview` | GET `/ledger/driver-overview` | Optional **`source`**; server ignores legacy (canonical only). |
| `getLedgerTripLedgerGapDiagnostic` | GET `/ledger/diagnostic-trip-ledger-gap` | Canonical gap only. |
| `getLedgerEarningsHistory` | GET `/ledger/driver-earnings-history` | Optional **`readModel`** (ignored server-side; canonical only). |
| `getLedgerDriversSummary` | GET `/ledger/drivers-summary` | Canonical only. |
| `getLedgerFleetSummary` | GET `/ledger/fleet-summary` | Canonical only. |
| `getDriverIndriveWallet` | GET `/ledger/driver-indrive-wallet` | Canonical fees; typed return. |
| `purgeLedgerOrphans` | POST `/ledger/purge-orphans` | Targets **`ledger:%`** orphans. |
| `repairDriverLedger`, `runLedgerBackfill`, `ensureLedgerFromTripIds` | Various | **403** for live legacy writes. |

---

## Admin UI

| File | Role |
|------|------|
| [`src/components/admin/LedgerBackfillPanel.tsx`](../src/components/admin/LedgerBackfillPanel.tsx) | Backfill UI — live writes blocked server-side; dry-run where supported. |
| [`src/components/imports/DeleteCenter.tsx`](../src/components/imports/DeleteCenter.tsx) | Shows **`legacyLedgerEntries`** from **`GET /ledger/count`**; orphan heuristic uses **legacy count only** (not canonical events). |

---

## Operator: KV purge (full legacy row removal)

1. **Backup** the KV / project (see `src/solution.md` Phase 0).
2. **Verify** counts with **`GET /ledger/count`** (`legacyLedgerEntries`) and/or SQL in [`scripts/purge-legacy-ledger-kv.sql`](../scripts/purge-legacy-ledger-kv.sql).
3. **Execute** the `DELETE` in that script (or batched equivalent) in a maintenance window.
4. **Re-verify** `legacyLedgerEntries === 0`, then optionally simplify server + UI per checklist below.

---

## Other KV namespaces

- **Tolls:** **`toll_ledger:*`** (and related) — separate from **`ledger:%`** / **`ledger_event:*`** (see toll reconciliation).
- **Imports / ETL** outside this repo — record operator-specific processes separately.

---

## Checklist after full KV purge (optional)

1. Run **`scripts/purge-legacy-ledger-kv.sql`** (or batched deletes) **after backup** and sign-off.
2. Remove or simplify **`legacyLedgerEntries`** in **`GET /ledger/count`** if always zero.
3. Remove **`deleteLedgerEntriesForTripSource`** / **`purge-orphans`** / repair scan code paths if **`ledger:%`** no longer exists.
4. Re-grep **`ledger:%`** in `index.tsx` and delete dead code.
