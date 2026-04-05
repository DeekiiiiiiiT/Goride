# Ledger KV inventory (`ledger_event:*` vs `ledger:%`)

**Money SSOT:** **`ledger_event:*`** (canonical events). **`ledger:%`** keys were **legacy** trip-sourced rows; new writes are **disabled** (generators return empty / `null`; mutating routes return **403**).

**Plan / runbook:** [`src/solution.md`](../src/solution.md) · **Optional raw SQL (operator):** [`scripts/purge-legacy-ledger-kv.sql`](../scripts/purge-legacy-ledger-kv.sql) · **In-app purge:** Imports → **Delete Center** → **Remove all legacy ledger rows** (calls **`POST /ledger/purge-legacy-all`**; requires **`data.backfill`**).

---

## Status summary

| Area | State |
|------|--------|
| **Driver overview** | **`GET /ledger/driver-overview`** — **`ledger_event:*`** only (legacy branch removed). |
| **Earnings history** | **`GET /ledger/driver-earnings-history`** — **`ledger_event:*`** only. |
| **Fleet / drivers summaries** | **`GET /ledger/fleet-summary`**, **`/ledger/drivers-summary`** — **`ledger_event:*`** only. |
| **List / summary** | **`GET /ledger`**, **`/ledger/summary`** — **`ledger_event:*`** only. |
| **Count** | **`GET /ledger/count`** — **`ledgerEntries`** (canonical), **`trips`**, **`transactions`** only (no legacy column). |
| **Legacy removal** | **`POST /ledger/purge-legacy-all`** — deletes all **`ledger:%`** keys (`dryRun` or `confirm`). Replaces orphan-only purge. |
| **Gap diagnostic** | **`GET /ledger/diagnostic-trip-ledger-gap`** — **`ledger_event:*`** `fare_earning` only. |
| **InDrive wallet** | **`GET /ledger/driver-indrive-wallet`** — **`ledger_event:*`** for fees. |
| **Legacy writes** | **`legacyLedgerWritesDisabled()`** is **always true**. Trip/txn generators are no-ops; legacy POST routes return **403**. |
| **Imports (client)** | No **`ensureLedgerFromTripIds`** — canonical append only. |
| **Admin backfill UI** | **`LedgerBackfillPanel`** — live legacy runs disabled; dry-run where supported. |

---

## Product reads (canonical only)

| Route | Server | Notes |
|-------|--------|--------|
| GET `/ledger` (list) | `index.tsx` | **`ledger_event:%`** only. |
| GET `/ledger/summary` | `index.tsx` | Same. |
| GET `/ledger/driver-overview` | `index.tsx` | Canonical aggregation only. |
| GET `/ledger/driver-earnings-history` | `index.tsx` | Canonical events only. |
| GET `/ledger/drivers-summary` | `index.tsx` | Canonical only. |
| GET `/ledger/fleet-summary` | `index.tsx` | Canonical only. |
| GET `/ledger/diagnostic-trip-ledger-gap` | `index.tsx` | **`ledger_event:%`** only. |
| GET `/ledger/driver-indrive-wallet` | `index.tsx` | **`ledger_event:%`** for fees. |

**Client:** [`src/services/api.ts`](../src/services/api.ts) — list/overview calls omit legacy read paths.

---

## Remaining `ledger:%` touchpoints (server)

| Location | Role |
|----------|------|
| **`POST /ledger/purge-legacy-all`** | Deletes **all** **`ledger:%`** rows (or **`dryRun: true`** to count). |
| **`POST /ledger/repair-driver-ids`** | May still scan **`ledger:%`** for dry-run / repair (writes **403** when not dry-run). |
| Other **`like("key", "ledger:%")`** | Backfill/diagnostic paths — mostly inert if no keys remain. |

**Removed:** `deleteLedgerEntriesForTripSource`, **`POST /ledger/purge-orphans`**, **`legacyLedgerEntries`** on **`GET /ledger/count`**.

---

## Writes (`ledger:%`)

| Code path | Behavior |
|-----------|----------|
| `generateTripLedgerEntries` | Returns **`[]`**. |
| `buildUberFareEarningFallbackEntriesIfEligible` | Returns **`[]`**. |
| `generateTransactionLedgerEntry` | Returns **`null`**. |
| POST `/ledger`, `/ledger/batch`, PATCH `/ledger/:id` | **403** |
| POST `/ledger/backfill`, `/repair-driver`, `/ensure-from-trip-ids`, etc. | **403** (or dry-run only where implemented) |
| DELETE `/ledger/:id` | Allowed if a stray legacy row still exists. |

---

## Client / API (`src/services/api.ts`)

| Method | Endpoint | Notes |
|--------|----------|--------|
| `getLedger` | GET `/ledger` | Canonical list only. |
| `getLedgerCount` | GET `/ledger/count` | Canonical **`ledgerEntries`**, trips, transactions. |
| `purgeAllLegacyLedger` | POST `/ledger/purge-legacy-all` | **`data.backfill`** + session; **`dryRun`** or **`confirm`**. (Delete Center no longer surfaces this — use for rare stragglers or SQL.) |
| `repairDriverLedger`, `runLedgerBackfill`, `ensureLedgerFromTripIds` | Various | **403** for live legacy writes. |

---

## Admin UI

| File | Role |
|------|------|
| [`src/components/admin/LedgerBackfillPanel.tsx`](../src/components/admin/LedgerBackfillPanel.tsx) | Dry-run preview; live legacy disabled. |
| [`src/components/imports/DeleteCenter.tsx`](../src/components/imports/DeleteCenter.tsx) | Legacy count via **`purge-legacy-all` dry run**; one-click remove all **`ledger:%`** rows. |

---

## Operator notes

- **Preferred:** deploy Edge, sign in with **`data.backfill`**, open **Delete Center**, use **Remove all legacy ledger rows** after reviewing the count.
- **Alternative:** [`scripts/purge-legacy-ledger-kv.sql`](../scripts/purge-legacy-ledger-kv.sql) in Supabase SQL Editor **after backup**.

---

## Other KV namespaces

- **Tolls:** **`toll_ledger:*`** — separate from **`ledger:%`** / **`ledger_event:*`**.
