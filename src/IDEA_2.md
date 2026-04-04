# IDEA 2 — Unified Toll Financial Events (Read Model / Report Layer)

**Goal:** One canonical **read-only** representation of toll-related money and workflow events, built by **projecting** existing KV data (`toll_ledger:*`, legacy `transaction:*` toll rows where still read, `trip:*` for unlinked refund signals, `dispute-refund:*`). Writes stay on existing controllers; this layer **does not** become a second write path.

**Process:** Implement **phase by phase**. Do **not** start a phase until the product owner confirms. After each phase, stop and wait for explicit approval before the next phase.

---

## Phase 1 — Inventory, contracts, and sign conventions

**Objective:** Lock down what exists and what each field means before coding mappers.

**Steps:** (see **Contract** section below — completed in repo)

**Exit criteria:** A developer can answer “what is the amount sign for a dispute refund?” and “what ID prefixes exist?” without reading the whole codebase.

---

## Phase 2 — Canonical DTO and enums (shared types)

**Objective:** One TypeScript shape for `TollFinancialEvent` used by server mappers and client.

**Exit criteria:** `TollFinancialEvent` compiles everywhere it is imported.

---

## Phase 3 — Per-source mapper functions (pure, unit-testable)

**Objective:** Map each backing record → `TollFinancialEvent` with **no** I/O in the mapper.

**Exit criteria:** Unit tests cover golden fixtures per source.

---

## Phase 4 — Merge, sort, and deduplication rules

**Objective:** Deterministic merge when legacy `transaction:*` overlaps `toll_ledger:*`.

**Policy:** `loadMergedTollTxArray()` already enforces **ledger wins by id**; legacy toll rows are only included when no ledger row exists for the same id. The unified projector uses that merged list and tags each row as `plaza_toll` vs `legacy_transaction_toll` via membership in `getAllTollLedgerEntries()` id set. No duplicate toll ids in the merged array.

**Exit criteria:** Dedupe + sort tests pass.

---

## Phase 5 — Server API: unified list endpoint

**Route:** `GET /make-server-37f42386/toll-reconciliation/unified-events`

**Exit criteria:** Returns `{ data, meta }` with schema version.

---

## Phase 6 — Client API and thin data hook

**Exit criteria:** `api.getTollUnifiedEvents` + `useTollUnifiedEvents` work for a selected driver.

---

## Phase 7 — UI: unified timeline (minimal, polished)

**Placement:** Tab **All activity** on Toll Reconciliation dashboard.

**Exit criteria:** Source column distinguishes toll ledger, legacy tx, trip signal, dispute refund.

---

## Phase 8 — Export path using the same projector

**Route:** `GET .../toll-reconciliation/unified-events/export` (CSV).

**Exit criteria:** Same filters as list endpoint; CSV columns documented in glossary row.

---

## Phase 9 — Automated tests and regression fixtures

**Exit criteria:** Vitest tests for mappers + merge in CI.

---

## Phase 10 — Performance, observability, and optional future materialization

**Limits:** `limit` capped at **500** per request.

**Future:** If KV fan-in is too slow at scale, add materialized `toll_financial_event_projection:*` on write — not implemented until measured.

---

## Dependency order

Phases **1 → 2 → 3 → 4** are sequential. **5** depends on **3–4**. **6** depends on **5** and **2**. **7** depends on **6**. **8** depends on **5**. **9** overlaps **7–8**. **10** last.

---

## Open decisions (resolved)

- **Dedup:** Ledger wins by id; legacy only fills gaps (see Phase 4).
- **Unified UI:** Reconciliation dashboard tab **All activity** (Toll Ledger page unchanged in v1).
- **Pagination:** Offset + limit (max 500).

---

# Contract (Phase 1 deliverable)

## Endpoint inventory — `toll_controller.tsx` (`BASE = /make-server-37f42386/toll-reconciliation`)

| Route | Method | Pagination | Notes |
|-------|--------|------------|--------|
| `/summary` | GET | N/A (aggregates) | Query: `driverId`. Cards: unreconciled / reconciled / unclaimed counts & amounts. |
| `/unreconciled` | GET | `limit`, `offset` | Query: `driverId`. Returns toll rows + server suggestions map. |
| `/unclaimed-refunds` | GET | `limit`, `offset` | Trips with `tollCharges > 0` and no linked toll `tripId`. |
| `/reconciled` | GET | `limit`, `offset` | Matched toll history + optional `linkedTrip`. |
| `/toll-logs` | GET | optional `limit`/`offset` | Merged toll rows + filters: `vehicleId`, `tagNumber`, `driverId`, `category`. |
| `/toll-ledger/*` | GET/POST | varies | Stats, backup, repair, sync-check, backfill — ops. |
| `/reconcile`, `/unreconcile`, `/bulk-reconcile` | POST | — | Mutations. |
| `/edit` | PATCH | — | Toll field updates. |
| `/approve`, `/reject`, `/resolve` | POST | — | Status / resolution. |
| `/reset-for-reconciliation` | POST | — | Re-queue toll for unmatched. |
| `/export` | GET | **Full dump** | All merged toll rows flattened for legacy CSV export (not unified). |
| `/unified-events` | GET | `limit`≤500, `offset` | **New** — canonical multi-source read model. |
| `/unified-events/export` | GET | same filters | **New** — CSV of unified events. |

## Dispute refunds — `dispute_refund_controller.tsx`

- **GET** `/make-server-37f42386/dispute-refunds` — Query: `status`, `driverId`, `dateFrom`, `dateTo`. Returns `{ data, total }`.
- **PATCH** `/:id/match`, `/:id/unmatch` — mutations.
- **Record fields:** `id`, `supportCaseId`, `amount` (positive USD), `date`, `driverId`, `driverName`, `status` (`unmatched` \| `matched` \| `auto_resolved`), `matchedTollId`, `matchedClaimId`, `batchId`, `importedAt`, etc.

## KV key patterns

- `toll_ledger:{id}` — canonical toll charges (and top-ups/refunds as typed).
- `transaction:{id}` — legacy; toll-category rows merged only if no ledger row for same id.
- `trip:{id}` — trip activity; `tollCharges` used for unlinked refund signal.
- `dispute-refund:{id}` — support adjustments; `dispute-refund-dedup:{supportCaseId}` — index only (not events).

Legacy rows may omit `batchId` (imports predating the field).

## Sign convention (amounts)

- **Toll usage rows:** `amount` is typically **negative** (expense/outflow) in merged toll tx shape.
- **Dispute refunds:** `amount` is **positive** (credit to driver) per `DisputeRefund` type.
- **Unlinked trip signals:** use `tollCharges` as **positive** platform-reported refund expectation.
- The canonical DTO stores **`amount` exactly as the source** (no automatic sign flip). UI/export may show `abs()` with labels.

## Stable `eventId` prefixes

| Prefix | Meaning |
|--------|---------|
| `toll:` | Merged toll charge row (ledger or legacy), suffix = transaction/toll id |
| `trip_refund:` | Unlinked refund signal, suffix = `trip.id` |
| `dispute_refund:` | Support adjustment, suffix = `dispute refund id` |

---

## Support runbook (Phase 10)

- **`eventId`** — Globally unique string for the row in the unified feed; use in bug reports.
- **`sourceSystem`** — `toll_ledger` \| `legacy_transaction` \| `trip` \| `dispute_refund` — which KV family produced the row.
- **Filters** — Narrow by `driverId`, `from`/`to` (ISO date), `batchId`, `kinds` (comma-separated).
- **Limits** — Default limit 50; maximum **500** per request.
