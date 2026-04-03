# Enterprise ledger SSOT — phased implementation plan

**Goal:** One money pipeline: **ingest → ledger events → projections → UI**. Trips are **context** (who / when / route / platform), not a second silent source of financial truth. Uber’s **statement** (`payments_driver` / org) is **explicit SSOT** in that pipeline, with reconciliation or visible variance—never two incompatible definitions without labeling.

**Process:** Phases below are **documentation and sequencing only**. **Do not start a phase until explicitly approved** for that phase. After each phase completes, wait for approval before starting the next.

**Status:** **Phase 2 — COMPLETE** (2026-04-03). Canonical ledger storage + append/list API + client helpers. **Awaiting approval to start Phase 3.**

---

## Guiding principles (non-negotiable)

- **Financial truth** = appendable **ledger events** (and materialized/projections derived only from them).
- **Trips** carry operational and linking data; amounts shown in product for money rollups should ultimately trace to **events**, not to ad-hoc sums of `mergeAndProcessData` in production UI.
- **Uber CSV statement lines** (e.g. Total Earnings, Total Earnings : Net Fare, tips, refunds, payouts) are **first-class**: stored and/or posted as events, not inferred only from per-trip `uberFareComponents` rolls.
- **Idempotency:** same import batch + same logical event must not double-post.
- **Auditability:** who imported, when, file identity (hash/name), period bounds.

---

## Phase 1 — Foundation, inventory, and contracts

**Objective:** Agree on vocabulary, map today’s system, and freeze the **event + idempotency** contract before coding storage or ingest.

### Steps

1. **Glossary (single page in repo or section here)**  
   - Define: *ledger event*, *projection*, *statement snapshot*, *trip-sourced event*, *period adjustment*, *reconciliation variance*, *idempotency key*, *batch*, *driver canonical ID*, *reporting period*.  
   - Explicitly state: current `ledger:*` rows from `generateTripLedgerEntries` are **trip-sourced projections**; new architecture may **extend** or **migrate** them—document chosen strategy in Phase 2.

2. **Inventory current write paths**  
   - List every path that **writes** money-related data: `POST /trips`, fleet sync, repair jobs, dispute refund saves, manual trip entry, any bulk import executors.  
   - For each: note whether it writes `trip:*`, `ledger:*`, both, and whether totals can diverge from CSV statement.

3. **Inventory current read paths**  
   - List UIs/APIs that **sum money**: driver overview (`resolvedFinancials`), Period earnings modal, Import preview (`importUberReconciliation` / `mergeAndProcessData`), Trip Ledger table columns, reports.  
   - Mark each as **target: ledger-only**, **temporary: dual**, or **preview-only**.

4. **Event taxonomy v1 (paper design)**  
   - Enumerate event **types** needed for v1 (e.g. `fare_earning`, `tip`, `promotion`, `refund_expense`, `prior_period_adjustment`, `statement_line`, `statement_adjustment`, `payout_cash`, `payout_bank`, `toll`, `dispute_refund`).  
   - For each: **required fields**, **optional metadata**, **sign convention** (inflow/outflow), **link to trip** (`sourceType`/`sourceId` or `tripId`).

5. **Idempotency key rules (paper)**  
   - Rule examples: `importBatchId + eventType + naturalKey` where `naturalKey` = trip UUID for trip lines, or `driverId + periodStart + lineCode` for statement lines.  
   - Document collision and retry behavior.

6. **Non-goals for v1**  
   - e.g. full double-entry chart of accounts, multi-currency, tax engine—list explicitly to avoid scope creep.

7. **Success criteria for Phase 1**  
   - Signed-off glossary + event list + idempotency rules + read/write inventory; **no production behavior change**.

### Phase 1 — Completion record (2026-04-03)

**Scope:** Documentation only. **No application code, API behavior, or data paths were changed** for Phase 1.

---

#### 1. Glossary (v1)

| Term | Definition |
|------|------------|
| **Ledger event** | An appendable financial fact stored under `ledger:{uuid}` (today) with fields such as `eventType`, `grossAmount`, `netAmount`, `sourceType`, `sourceId`, `date`, `platform`. *Target architecture:* either these rows become **canonical events** or a parallel **`ledger_event:*`** stream is introduced in Phase 2—decision pending. |
| **Projection** | Any aggregate built by **summing or grouping ledger rows** (and related KV) for a driver/period—e.g. `GET …/ledger/driver-overview` totals, `uber` block in `LedgerDriverOverview`. |
| **Statement snapshot** | Uber **period-level** figures from `payments_driver.csv` / `payments_organization` (e.g. Total Earnings, Total Earnings : Net Fare, payouts). **Not** yet first-class KV in production; parsed in client merge (`mergeAndProcessData`, `uberSsot`, `UberPaymentCsvRollup`). **Target:** persisted and/or emitted as events in Phase 4. |
| **Trip-sourced event** | A ledger row where `sourceType === 'trip'` and `sourceId` is the trip UUID—created by `generateTripLedgerEntries` on `POST /trips`, repair, backfill, fleet sync. |
| **Period adjustment** | Uber prior-period money attributed per trip (`uberPriorPeriodAdjustment`) → ledger `eventType: prior_period_adjustment`. Distinct from a **statement-level** adjustment event (Phase 4). |
| **Reconciliation variance** | Difference between **statement snapshot** totals and **sum of trip-sourced (or projected) ledger lines** for the same driver/period—must be **visible or closed by an explicit adjustment event**, not silent. |
| **Idempotency key** | Logical key so the same import/repair run does not post duplicate money—e.g. `batchId + eventType + naturalKey` (Phase 5 hygiene hardens this in code). |
| **Batch** | Import batch metadata (`batch:*`) + `trip.batchId` on uploaded trips—used for traceability; **not yet** a full audit hash in all paths. |
| **Driver canonical ID** | Roam internal UUID; Uber/InDrive UUIDs resolved in `POST /trips` via `resolveCanonicalDriverId` (`index.tsx`). |
| **Reporting period** | Date range `[startDate, endDate]` on driver overview, Period earnings modal, ledger queries—must align with CSV period for reconciliation. |

**Current `ledger:*` from `generateTripLedgerEntries`:** These are **trip-sourced projections** (fare/tip/promotion/refund/prior/toll/platform_fee as applicable). They are **not** the same as Uber’s statement **Net Fare** column unless trip fields were engineered to match. **Phase 2 decision:** extend with `schemaVersion` / `eventKind`, or add `ledger_event:*`; **not decided in Phase 1** (recommendation: document options in Phase 2 step 1).

---

#### 2. Inventory — money-related **write** paths

| # | Path | `trip:*` | `ledger:*` | Other KV / notes | Statement divergence risk |
|---|------|----------|------------|-------------------|---------------------------|
| W1 | **`POST /make-server-37f42386/trips`** — save trip array | ✅ `mset` | ✅ Deletes prior trip-sourced ledger for each trip id, then `generateTripLedgerEntries` → `mset` `ledger:*` | Org stamp on trip + ledger | **High** for Uber net fare vs CSV: fare line uses `uberFareComponents` / amounts from **trip**, not `payments_driver` Net Fare column. |
| W2 | **`DELETE /trips` / `DELETE /trips/:id`** | ✅ delete | ✅ `deleteLedgerEntriesForTripSource` for deleted trip(s) | — | N/A |
| W3 | **`POST /ledger/backfill`** | ❌ | ✅ Regenerates from existing trips | — | Same as W1 (trip-derived). |
| W4 | **`POST /ledger/repair-driver`** | ❌ | ✅ Targeted regenerate per driver trips | — | Same as W1. |
| W5 | **`POST /ledger/repair-driver-ids`** | ❌ | ✅ Fixes driver id on ledger rows | — | Metadata fix. |
| W6 | **Fleet sync** (batch trip upsert path in `index.tsx` ~8576+) | ✅ | ✅ Same pattern as POST trips | — | Same as W1. |
| W7 | **`POST /transactions`** (financial) | ❌ | ✅ Creates `ledger:{id}` per rules (~3114+) | `transaction:*` | Diverse: fuel, toll, wallet, fare-related categories—**not** Uber CSV statement lines unless manually aligned. |
| W8 | **Toll domain** | Optional link to trip | **`toll_ledger:*`** primary for toll workflow | Comment in code: tolls written to `toll_ledger:*` | Separate from Uber statement refunds split. |
| W9 | **`importDisputeRefunds`** (client → API) | ❌ | ❌ | **`dispute-refund:*`** keys; driver-overview sums these for `period.disputeRefunds` | **Medium:** $10 support adjustment in **import preview** comes from CSV parse; overlay only sees KV **matched/auto_resolved** in date range. |
| W10 | **Data Center import** — `saveTrips` / `saveFleetState` / `createBatch` (`ImportsPage.tsx`) | ✅ | ✅ Indirectly via POST trips behavior when trips saved | Batch record | Preview totals from **`mergeAndProcessData`** **before** save—second truth until Phase 5/6. |
| W11 | **`TripReImportFlow` / `importExecutor.processTripBatch`** | ✅ | ✅ via POST trips | `reimport_*` batch id | Same as W1. |
| W12 | **Manual / UI trip create** | ✅ | ✅ when saved through same POST path | — | User-entered amounts. |
| W13 | **Bulk delete** (Delete Center) | ✅ delete | ✅ Deletes trip-linked `ledger:*` for those trips | — | N/A |

---

#### 3. Inventory — money-related **read** paths

| # | Consumer | What it sums / shows | Classification |
|---|----------|----------------------|----------------|
| R1 | **`GET …/ledger/driver-overview`** (`index.tsx` ~3740+) | Period/lifetime earnings, cash, tolls, tips, `period.uber` fareComponents (sum of **gross** on Uber `fare_earning`), promotions, refundExpense, disputeRefunds from `dispute-refund:*` | **Target: ledger-only** (after canonical events + statement SSOT merged into same read model). |
| R2 | **`DriverDetail.tsx` → `resolvedFinancials`** | Builds from trips + **prefers** `ledgerOverview` when loaded—platform stats, `uberLedgerReconciliation` | **Temporary: dual** (trips fallback when ledger incomplete). |
| R3 | **`OverviewMetricsGrid`** Period earnings modal | Uber block: ledger SSOT + `uberPaymentCsvRollup` when present; `showFinancialValues` when `source === 'ledger'` | **Temporary: dual** (statement rollup from import vs ledger trip roll). |
| R4 | **`ImportsPage` `importUberReconciliation`** | **`mergeAndProcessData`** + `uberStatementsByDriverId`—statement-aligned | **Preview-only** (must be labeled vs posted ledger in Phase 6). |
| R5 | **Trip Ledger table / trip list** | Trip `amount`, `netPayout`, platform filters | **Temporary: dual**—operational trip fields; **target** subtitle/tooltip from read model in Phase 6. |
| R6 | **`api.getLedger` / ledger summary / fleet-summary** | Raw or aggregated `ledger:*` | **Target: ledger-only** (evolve to canonical). |
| R7 | **Reports / dashboard** (e.g. dashboard stats from trips) | Various | **Audit in Phase 5**—flag any that bypass ledger. |
| R8 | **InDrive wallet** `GET …/ledger/driver-indrive-wallet` | Wallet API alignment vs ledger fees | **Ledger-aligned** (special case). |

---

#### 4. Event taxonomy v1 (paper — target canonical set)

*Existing `generateTripLedgerEntries` / transaction ledger already use a subset; v1 may unify naming.*

| `eventType` (v1) | Required fields (conceptual) | Optional metadata | Sign / direction | Trip link |
|------------------|------------------------------|-------------------|------------------|-----------|
| `fare_earning` | `date`, `driverId`, `platform`, `grossAmount`, `netAmount`, `sourceType`, `sourceId` | `paymentMethod`, `metadata.cashCollected`, `batchId` | Inflow | `sourceType: trip`, `sourceId: trip.id` |
| `tip` | same pattern | — | Inflow | Usually trip |
| `promotion` | Uber allocated promo | — | Inflow | trip |
| `refund_expense` | Uber allocated refund/expense | — | Outflow (net negative) | trip |
| `prior_period_adjustment` | prior-period fare adjust | — | Signed inflow/outflow | trip |
| `platform_fee` | InDrive (etc.) | — | Outflow | trip or transaction |
| `toll_charge` | toll on trip | — | Inflow or per product rule | trip |
| `statement_line` *(new)* | `driverId`, `periodStart`, `periodEnd`, `lineCode` (e.g. `NET_FARE`, `TOTAL_EARNINGS`), `amount` | `sourceFileHash`, `importBatchId` | Per line convention | **No trip**—period scope |
| `statement_adjustment` *(new)* | reconciliation delta | `reason`, `relatesToStatementLine` | Signed | Optional link to batch |
| `payout_cash` / `payout_bank` *(new)* | period, amount | org import ref | Outflow/inflow per Roam convention | No trip |
| `dispute_refund` / `toll_support_adjustment` *(new or map)* | amount, date, driver | `supportCaseId` | Inflow | May reference trip or none |
| Transaction-derived types | `wallet_credit`, `fuel_*`, `driver_payout`, etc. | From `transaction` → ledger helper | Per existing server logic | `sourceType: transaction` |

---

#### 5. Idempotency key rules (v1 — paper)

| Event class | Suggested natural key | Full idempotency key example | On collision |
|-------------|----------------------|------------------------------|--------------|
| Trip-sourced fare/tip/promo/refund/prior | `trip.id` + `eventType` | `{batchId}\|{tripId}\|fare_earning` | **Skip** insert; log `skipped_duplicate`. |
| Statement line (period) | `driverCanonicalId` + `periodStart` + `periodEnd` + `lineCode` | `{batchId}\|stmt\|{driverId}\|{period}\|NET_FARE` | Skip or **replace** if policy = latest batch wins (document in Phase 4). |
| Dispute refund | `supportCaseId` or Uber case id | `{batchId}\|dispute\|{supportCaseId}` | Skip. |
| Repair/backfill | N/A—uses same trip keys | Regenerate deletes old trip-sourced rows first (today); **canonical phase** should use same keys as import to avoid dupes. |

**Retry behavior:** HTTP retry of `POST /trips` with same payloads should yield **same ledger ids** only if trip ids stable; today new ledger row UUIDs each time after delete—**Phase 2** should align stable idempotency keys with row ids or separate index.

---

#### 6. Non-goals for v1 (enterprise SSOT MVP)

- Full **double-entry** chart of accounts and GL period close.
- **Multi-currency** FX and rounding policies.
- **Tax engine** / VAT lines per jurisdiction.
- Real-time **analytics warehouse** separate from KV (optional later).
- Changing **toll_ledger:** domain rules in Phase 2–4 (only touch where Uber statement intersects toll refunds/support).
- **Automatic legal/compliance** certification of numbers—product shows Roam’s ledger + stated Uber reconciliation only.

---

#### 7. Phase 1 sign-off checklist

- [x] Glossary documented  
- [x] Write-path inventory documented with code anchors  
- [x] Read-path inventory + target classification  
- [x] Event taxonomy v1 table  
- [x] Idempotency key rules v1  
- [x] Non-goals listed  
- [x] **No production code changes** for Phase 1  

**Approved by:** _(product owner — fill when reviewed)_  
**Next:** _(done — Phase 2 delivered)._

---

## Phase 2 — Ledger event model and storage

**Objective:** Implement (or extend) a **canonical event representation** and **storage** that supports idempotent writes and future replay.

### Steps

1. **Choose storage strategy**  
   - Option A: extend existing `kv_store` `ledger:*` values with a strict `schemaVersion` and `eventKind: 'canonical' | 'legacy'`.  
   - Option B: new prefix `ledger_event:*` for canonical events; keep legacy `ledger:*` during migration.  
   - Document read path: projections read **canonical** only after cutover (or merge rules during transition).

2. **TypeScript types**  
   - Add interfaces for `LedgerEvent`, `LedgerEventEnvelope` (idempotencyKey, batchId, importerUserId, sourceFileHash, createdAt, organizationId, driverId, period bounds).  
   - Validate with Zod or manual runtime checks at write boundary.

3. **Write API (internal)**  
   - Single server function: `appendLedgerEvents(events[], { idempotencyKeys })` that: checks existing keys; skips or updates per policy; never duplicates logical duplicates.  
   - Log structured result: inserted / skipped / failed.

4. **Link to trips**  
   - Events that originate from a trip must set `sourceType: 'trip'`, `sourceId: trip.id` (or explicit `tripId` field).  
   - Do **not** duplicate “statement net fare” as `trip.amount` if that competes with events—trips hold **links** and operational fields only where agreed in Phase 3.

5. **Migration stance**  
   - Document whether existing `generateTripLedgerEntries` output is **reclassified** as legacy, **dual-written**, or **replaced** by event emitter—decision gates Phase 3/5.

6. **Success criteria**  
   - Can persist idempotent test events via API or script; listing by driver/period returns stable results on retry.

### Phase 2 — Completion record (2026-04-03)

#### Storage strategy (decision)

- **Option B** adopted: canonical rows live under **`ledger_event:{uuid}`**.  
- **Idempotency index:** **`ledger_event_idem:{sha256(idempotencyKey)}`** → `{ id, idempotencyKey }`. Duplicate append with the same `idempotencyKey` → **skipped** (no second row).  
- **Legacy `ledger:*`** rows from `generateTripLedgerEntries` / `POST /trips` are **unchanged** and remain the source for **`ledger/driver-overview`** until Phase 5 merges read paths.

#### Migration stance (Phase 2 → 5)

- **Dual universe:** trip-sourced **`ledger:*`** + optional canonical **`ledger_event:*`**. No automatic migration or deletion of legacy rows in Phase 2.  
- Phase 3–4 will **emit** canonical events from ingest/statement; Phase 5 will **aggregate** canonical (and optionally legacy) in one read model.  
- **Trip fields** (`uberFareComponents`, etc.) are **not** removed in Phase 2.

#### Code / API

| Artifact | Location |
|----------|----------|
| Client types | `src/types/ledgerCanonical.ts` |
| Vitest smoke | `src/types/ledgerCanonical.test.ts` |
| Server module | `src/supabase/functions/server/ledger_canonical.ts` — `appendCanonicalLedgerEvents()` |
| **POST** append | `/make-server-37f42386/ledger/canonical-events/append` — `transactions.edit` |
| **GET** list | `/make-server-37f42386/ledger/canonical-events` — query: `driverId`, `startDate`, `endDate`, `limit`, `offset`; **org-scoped** via `filterByOrg` |
| Client API | `api.appendCanonicalLedgerEvents`, `api.getCanonicalLedgerEvents` |

#### Payload rules (append)

- Required per event: `idempotencyKey`, `date` (YYYY-MM-DD), `driverId`, `eventType`, `direction` (`inflow` \| `outflow`), `netAmount`, `sourceType` (`trip` \| `statement` \| `import_batch` \| `transaction` \| `adjustment`), `sourceId`.  
- Optional: `batchId`, `importerUserId` (auto-filled from RBAC if omitted), `sourceFileHash`, `periodStart` / `periodEnd`, `platform`, `grossAmount`, `currency`, `metadata`, etc.  
- Max **200** events per request.  
- Validation is **manual** in `ledger_canonical.ts` (no Zod in repo).

#### Manual verification (deployed server)

1. `POST …/ledger/canonical-events/append` with one test event and a unique `idempotencyKey`.  
2. `GET …/ledger/canonical-events?driverId=…` — row appears.  
3. Repeat POST — response shows `skipped: 1`, same `id`.

---

## Phase 3 — Ingest pipeline: validate → emit events → trips as context

**Objective:** CSV import produces **validated** input, **emits ledger events**, and updates trips **without** introducing a second competing financial total for reporting.

### Steps

1. **Validation layer (server or shared module)**  
   - Per file type: schema (headers), required columns, date range, driver UUID presence, numeric parsing rules.  
   - **Cross-file checks** where applicable (e.g. period alignment across `payments_driver` / `payments_organization`).  
   - Fail fast with actionable errors; optional warnings for non-blocking issues.

2. **Batch identity**  
   - Every import run gets `batchId` (existing pattern) + **content hash** of file set (or per file) for audit and idempotency.

3. **Trip merge behavior (unchanged IDs)**  
   - Keep merging Uber rows into **trip** records for operational context (addresses, UUID, status).  
   - Strip or avoid persisting **reporting** totals on trips that duplicate statement SSOT (decision table: which fields remain on `Trip` for UI convenience vs read model only).

4. **Event emission order**  
   - Define order: e.g. statement snapshot lines first (if present), then trip-level fare/tip/promotion/refund allocations, then dispute/support lines.  
   - Ensures reconciliation math can assume ordering if needed.

5. **Idempotent application**  
   - Re-import same batch: same idempotency keys → **no duplicate events**; allow **replace** policy for “latest batch wins” only if explicitly designed and documented.

6. **Wire `POST /trips` (or successor)**  
   - After trip KV write, call **event append** for trip-derived money lines **or** replace trip-sourced ledger generation with events only—per Phase 2 decision.  
   - Ensure Roam/InDrive paths still write only their trips/events without wiping other platforms.

7. **Success criteria**  
   - Import test bundle: trips saved, events present, second run idempotent, non-Uber trips untouched when Uber-only batch imported.

### Phase 3 — Completion record (2026-04-03)

#### Behavior

- **Validation:** `validateMergedImportPreview` runs on confirm (blocking errors for invalid dispute driver IDs; warnings for period / cross-file gaps).  
- **Batch audit:** `contentFingerprint` = SHA-256 of sorted `fileName:rowCount` on `ImportBatch`; passed as `sourceFileHash` on canonical events.  
- **Emit:** After `saveFleetState` or legacy `saveTrips` (+ related metrics), `buildCanonicalImportEvents` posts **`statement_line`**, **`payout_cash` / `payout_bank`**, and **`dispute_refund`** rows via `api.appendCanonicalLedgerEvents` in chunks of 200. Append failures are **non-fatal** (toast); trips remain saved.  
- **Unchanged:** Legacy **`ledger:*`** from `POST /trips` is **not** removed or bypassed in Phase 3.

#### Code

| Artifact | Location |
|----------|----------|
| Bundle fingerprint | `src/utils/importBundleFingerprint.ts` |
| Import validation | `src/utils/importValidation.ts` |
| Event builder + primary driver helper | `src/utils/buildCanonicalImportEvents.ts` |
| Vitest | `src/utils/buildCanonicalImportEvents.test.ts` |
| Wired | `ImportsPage.tsx` — `handleConfirmImport` |
| Batch field | `ImportBatch.contentFingerprint` in `src/types/data.ts` |

---

## Phase 4 — Uber statement SSOT and reconciliation

**Objective:** **payments_driver** / **payments_organization** totals are **stored as explicit statement facts** and tied to driver + period; trip rolls **reconcile** or **show variance**.

### Steps

1. **Statement snapshot model**  
   - Structure keyed by `(organizationId?, driverCanonicalId, periodStart, periodEnd)` or `(driverId, weekId)` with fields: totalEarnings, netFareStatement, tipsStatement, promotions, refundsAndExpenses, cashCollected, bankTransferred, refundsToll, etc.—match columns you already parse in `mergeAndProcessData` / `uberSsot`.

2. **Persistence**  
   - Option A: dedicated KV `statement_snapshot:*` or table.  
   - Option B: immutable `statement_line` ledger events.  
   - Prefer one approach for v1; document reads for UI and reconciliation.

3. **Reconciliation rules**  
   - Compute: `sum(trip-sourced net fare events)` vs `netFareStatement`.  
   - If delta > tolerance: emit **`statement_adjustment`** event **or** surface **variance** in UI without silent overwrite—product choice documented here.

4. **Payout lines**  
   - Bank transfer and cash from org row → **payout** events or snapshot fields so Period earnings overlay does not show “—” when data exists.

5. **Toll support adjustment**  
   - Map `payments_transaction` support adjustments to **dispute_refund** or dedicated **`toll_support_adjustment`** events with correct date/idempotency so Period earnings matches import preview.

6. **Success criteria**  
   - For a known week, statement net fare and import preview **match** read model; variance UI or adjustment event documented and testable.

### Phase 4 — Completion record (2026-04-03)

#### Persistence (decision)

- **Option B** for v1: statement facts live as immutable canonical rows — `statement_line` (`metadata.lineCode`), `payout_cash` / `payout_bank`, `toll_support_adjustment`.  
- **No** separate `statement_snapshot:*` KV in v1; logical shape is `UberStatementSnapshot` in `src/types/statementSnapshot.ts` for docs and rebuild via `snapshotsFromCanonicalLedgerEvents`.

#### Reconciliation (decision)

- **Variance UI** on merged import preview: per-driver **statement net fare** vs **sum of trip `uberFareComponents`** in the org period (`reconcileUberNetFareByDriver`, default tolerance **$0.02**).  
- **No** automatic `statement_adjustment` append on import in Phase 4 — avoids double-counting with `statement_line` until Phase 5 defines a single money read model.

#### Canonical ingest extensions

- **`REFUNDS_TOLL`** statement line when `OrganizationMetrics.refundsToll` is set (attributed to primary Uber driver for the batch, same as org payouts).  
- **`payments_transaction` support refunds** (and `toll_usage`) post as **`toll_support_adjustment`** with idempotency `batchId|toll_support|{disputeRefund.id}` (replaces `dispute_refund` for those sources).

#### Code

| Artifact | Location |
|----------|----------|
| Snapshot type | `src/types/statementSnapshot.ts` |
| Trip vs statement reconciliation | `src/utils/uberStatementReconciliation.ts` |
| Rebuild snapshots from canonical GET | `src/utils/snapshotsFromCanonicalLedgerEvents.ts` |
| Vitest | `uberStatementReconciliation.test.ts`, `snapshotsFromCanonicalLedgerEvents.test.ts` |
| Import UI | `ImportsPage.tsx` — net fare variance table |
| Builder updates | `buildCanonicalImportEvents.ts` |

---

## Phase 5 — Single read model for money

**Objective:** One module/API returns **period earnings, net fare, tips, refunds, payouts** by **aggregating ledger events and statement snapshots** only—not `mergeAndProcessData` in production paths.

### Steps

1. **Define aggregation API**  
   - e.g. `GET /ledger/money-overview?driverId&startDate&endDate` or extend `ledger/driver-overview` with a **`source: 'canonical_events'`** mode.  
   - Response shape matches what `DriverDetail` / Period earnings modal need.

2. **Implement aggregations**  
   - Sum by `eventType`, platform, sign rules; include statement snapshot section for Uber SSOT lines.  
   - Deprecate fields that sum `grossAmount` on `fare_earning` where it contradicts statement net fare—replace with event-driven or snapshot-driven figures.

3. **Caching (optional)**  
   - If needed, materialized projection per driver-week with invalidation on event append for that key.

4. **Feature flag**  
   - `useLedgerMoneyReadModel` (or similar) to toggle client between old and new API until Phase 8.

5. **Success criteria**  
   - All aggregations in one place; unit tests on synthetic event lists; no direct CSV merge in this layer.

### Phase 5 — Completion record (2026-04-03)

#### API (decision)

- Extended **existing** `GET /make-server-37f42386/ledger/driver-overview` with query param **`source=canonical`** (alias `canonical_events`).  
- Response shape matches legacy **`LedgerDriverOverview`**; adds optional **`readModelSource: 'canonical_events'`** for debugging.  
- **No** separate `/ledger/money-overview` route in v1 (avoids duplicate clients).

#### Aggregation

- Pure module **`ledger_money_aggregate.ts`** (Edge bundle): `aggregateCanonicalEventsToLedgerDriverOverview(period, prev, lifetime, platforms?)`.  
- Reads **`ledger_event:*`** only for this path. **Uber:** when statement `statement_line` facts exist in-window, **statement SSOT** drives Uber earnings totals; **fare_earning** / **tip** / **promotion** / **refund_expense** for Uber are **not** re-added to earnings (still counted for **tripCount** / **baseFare**). **InDrive / other:** trip-sourced canonical rows sum as before. **Toll support:** **`toll_support_adjustment`** / **`dispute_refund`** → earnings + **`period.disputeRefunds`**.  
- **Lifetime** row uses the same rules over all fetched canonical events (capped at **50k** rows per query, same as legacy overview pagination).  
- **Caching:** not implemented (optional step deferred).

#### Client

- **`isLedgerMoneyReadModelEnabled()`** in `src/utils/featureFlags.ts` — `localStorage.roam_ledger_money_read_model === '1'` **or** `VITE_LEDGER_MONEY_READ_MODEL=true`.  
- **`api.getLedgerDriverOverview({ …, source: 'canonical' })`** when flag on.  
- Wired: **`DriverDetail.tsx`**, **`DriverEarnings.tsx`**.

#### Tests

- **`src/utils/ledgerMoneyAggregate.test.ts`** — synthetic canonical event lists (statement vs fare double-count, InDrive, toll support).

#### Ops

- Redeploy Edge function **`make-server-37f42386`** so `source=canonical` branch is live.

---

## Phase 6 — UI: previews vs truth

**Objective:** User never confuses **import preview** with **posted ledger truth**; Period earnings and cards use **read model** when flag on.

### Steps

1. **Import Health / reconciliation**  
   - Label clearly: **“Preview (pre-post)”** vs **“Posted ledger”** after import completes.  
   - After successful import, deep-link or refresh to **read model** totals.

2. **Period earnings modal**  
   - Replace dual-definition rows with read model + optional **“Statement”** vs **“Trip roll”** comparison when variance exists.

3. **Driver overview cards**  
   - Wire `resolvedFinancials` to new API when flag enabled; fall back documented.

4. **Trip Ledger table**  
   - Clarify whether row **Amount** is operational trip field vs ledger-derived; tooltip or column subtitle if mixed during migration.

5. **Success criteria**  
   - UX review: no unlabeled conflicting totals; QA checklist for Uber + Roam + InDrive on same driver.

### Phase 6 — Completion record (2026-04-03)

#### Import (Data Center)

- **Preview (pre-post):** badge + copy on merged import; reconciliation card tagged **Preview**.  
- **Posted ledger:** success step badge + explanation (trip + canonical when sync succeeds); optional **View drivers** (`ImportsPage` `onNavigate` from `App`); `queryClient` invalidates **`driver-ledger`** after import.

#### Driver overview

- **Period earnings modal:** description switches for **`readModelSource === 'canonical_events'`**; indigo callout for canonical read model; variance line labeled **Statement vs posted ledger** when import rollup ≠ ledger Uber components.  
- **Earnings card subtext:** `Posted ledger` / **`Posted ledger (canonical)`** / `Trips fallback`.  
- **`resolvedFinancials.readModelSource`** passed through from `ledgerOverview`.

#### Trip / transaction ledger UI

- **`DriverLedgerPage`:** CardDescription clarifies **ledger `netAmount`** vs **`trip.amount`**; **Debit / Credit** column headers with tooltips.

---

## Phase 7 — Enterprise hygiene: audit, replay, repair

**Objective:** Operations can **prove** what was imported, **replay** projections, and **repair** without duplicate money.

### Steps

1. **Audit trail**  
   - Persist: `batchId`, `uploadedBy`, timestamps, file names, **SHA-256** (or size+name v1), period, counts of events emitted.

2. **Admin audit view (optional v1)**  
   - List recent import batches and event counts per driver.

3. **Replay job**  
   - Script or endpoint: rebuild projection from all `ledger_event:*` (or canonical events) for a driver or org—idempotent.

4. **Repair alignment**  
   - Document procedure: delete batch events by idempotency prefix + re-import (or targeted adjustment events).

5. **Success criteria**  
   - Runbook documented; replay tested on staging copy of data.

### Phase 7 implementation (2026-04-03)

- **Audit trail:** `ImportBatch` extended with `periodStart` / `periodEnd`, `uploadedBy`, `canonicalEventsInserted` / `canonicalEventsSkipped` / `canonicalEventsFailed`, `canonicalAppendCompletedAt` (plus existing `contentFingerprint`, `uploadDate`, `fileName`, `id`). Merged import hydrates period and session uploader when available, then **PATCH**es the batch after canonical append with chunk-aggregated totals.
- **Server:** `PATCH /make-server-37f42386/batches/:id` merges allowed keys only; org check via `belongsToOrg`. `GET /make-server-37f42386/ledger/canonical-batch-audit/:batchId` paginates `ledger_event:*` with `value->>batchId`, applies `filterByOrg`, returns `total`, `byDriver`, `byEventType`.
- **Client:** `api.patchImportBatch`, `api.getCanonicalBatchAudit` (JWT via `getHeaders` when logged in). **Imports** page: `ImportBatchAuditPanel` (recent batches + **Recount**). **Delete Center** import list shows canonical append summary when present. `queryClient` invalidates `['batches']` after import.
- **Repair / runbook (ops):**
  1. **Wrong or duplicate money for a batch:** In **Delete Center**, delete the import batch (cascade removes trips, transactions, and related data per existing flow). Canonical `ledger_event:*` rows for that `batchId` are not removed by batch delete today — operators should use **Database / ledger tools** or a one-off cleanup that removes `ledger_event:*` (and matching `ledger_event_idem:*`) for keys tied to that import, then re-import the same files (idempotent keys prevent double-count if cleanup was complete).
  2. **Verify before trusting UI:** Use **Import batch audit** → **Recount** and compare live totals to the stored append line; investigate spikes with driver / event-type breakdown.
  3. **Replay projections:** Re-aggregate driver overview from canonical events using existing read-model paths (`ledger/driver-overview` and related); full org recompute is a future scripted job — the audit endpoint provides the per-batch **ground truth** count from KV.

---

## Phase 8 — Tests, golden fixtures, cutover, and runbook

**Objective:** Lock behavior with tests; **flip** production to ledger read model when trusted.

### Steps

1. **Golden CSV bundle**  
   - Fixture in repo: minimal `payments_driver`, `payments_organization`, `payments_transaction`, `trip_activity` slice with **expected** event totals and read-model JSON.

2. **Automated tests**  
   - Integration: import fixture → assert event keys and sums.  
   - Unit: idempotency, reconciliation delta, sign conventions.

3. **Cutover checklist**  
   - Enable feature flag org-by-org or globally; monitor errors; rollback = flag off + read legacy.

4. **Runbook**  
   - One-page: import failure, duplicate events, variance spike, replay steps.

5. **Success criteria**  
   - CI green on golden bundle; stakeholder sign-off; Phase 8 complete = **enterprise SSOT path is default**.

---

## Phase dependency summary

| Phase | Depends on | Blocks |
|-------|------------|--------|
| 1 | — | 2 |
| 2 | 1 | 3, 4 |
| 3 | 2 | 4, 5 |
| 4 | 2, 3 | 5 |
| 5 | 2, 3, 4 | 6 |
| 6 | 5 | 8 |
| 7 | 2, 3 | 8 |
| 8 | 5, 6, 7 | — |

---

## Your approval gate

- **Phase 1** — Documentation complete (2026-04-03).  
- **Phase 2** — Code complete (2026-04-03): canonical KV + append/list + `api` helpers.  
- **Phase 3** — Code complete (2026-04-03): validate → fingerprint → canonical append on merged import (legacy `ledger:*` unchanged).  
- **Phase 4** — Code complete (2026-04-03): statement snapshot model + reconciliation UI; `REFUNDS_TOLL` + `toll_support_adjustment` canonical lines; read-side snapshot merge helper.  
- **Phase 5** — Code complete (2026-04-03): canonical driver-overview mode + shared aggregate module + feature flag + Vitest.  
- **Phase 6** — Code complete (2026-04-03): preview vs posted ledger labeling; period modal + overview subtext; driver ledger column context.  
- **Phase 7** — Code complete (2026-04-03): batch audit fields + PATCH; canonical batch audit GET; Imports audit panel + Delete Center summary; repair/runbook in this doc.  
- **Next:** Say **“Start Phase 8”** when ready. **No phase starts without your explicit go-ahead.**
