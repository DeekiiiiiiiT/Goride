# InDrive wallet — implementation plan

This document breaks the **InDrive wallet** feature into phases. **Do not start a phase until the stakeholder confirms** to proceed. After each phase is complete, wait for explicit approval before moving on.

**Scope recap**

- Fleet loads money into a driver’s **InDrive digital wallet**; InDrive deducts fees (aligned with **Implied on fare** / platform-fee breakdown in Period earnings).
- **MVP:** Log each load amount; show loads and fees on an **Overview** card.
- **API:** **GET** returns `{ periodLoads, periodFees, lifetimeLoads, estimatedBalance }` (Phase 7 adds `estimatedBalance` with an explicit server-side formula).
- **Optional later:** **Estimated running InDrive balance** = explicit formula (e.g. cumulative loads − cumulative InDrive fee ledger lines ± adjustments). This is product-defined, not inferred from trips alone.

---

## Phase 1 — Contract, types, and naming (no runtime behavior yet)

**Goal:** Lock naming and data shapes so backend and frontend stay aligned and ledger mapping stays correct.

### Steps

1. **Confirm transaction category string** for fleet top-ups (must match existing ledger mapper in `index.tsx` `generateTransactionLedgerEntry`: lowercase category must include both `wallet` and `credit`, e.g. `InDrive Wallet Credit`).
2. **Add TypeScript types** (e.g. in `src/types/data.ts`):
   - `IndriveWalletSummary` with `periodLoads`, `periodFees`, `lifetimeLoads`, and `estimatedBalance` (Phase 7).
3. **Document** that `periodFees` matches the **InDrive** slice of the same definitions used in Period earnings breakdown (clarify whether this is: sum of `platform_fee` ledger rows with `platform === 'InDrive'`, and/or **gross − net** on `fare_earning` for InDrive — align with product; ideally one canonical definition used by GET and overlay).
4. **List required fields** on “load” transactions: `driverId` (canonical Roam UUID), `date`, positive `amount`, `category`, `platform: 'InDrive'`, `type` (e.g. `Adjustment` — verify inflow vs `Expense` so ledger direction is **inflow**).
5. **Permissions:** Note which role can log loads (e.g. same as `transactions.edit` or a narrower permission if you add one later).
6. **Output:** Short ADR-style note in this file or a comment block listing **decisions** from steps 1–5 (single source of truth for implementers).

**Exit criteria:** Types committed; category string and `periodFees` definition agreed; no code changes to server/UI beyond types if you choose to add types only in this phase.

### Phase 1 — ADR (locked decisions)

| Decision | Choice |
|----------|--------|
| **Load transaction category** | `InDrive Wallet Credit` — constant `INDRIVE_WALLET_LOAD_CATEGORY` in `src/constants/indriveWallet.ts` (lowercase contains `wallet` + `credit` → ledger `wallet_credit`). |
| **Platform tag** | `InDrive` — `INDRIVE_WALLET_PLATFORM`. |
| **Transaction type for loads** | `Adjustment` with **positive** `amount` — `INDRIVE_WALLET_LOAD_TRANSACTION_TYPE` (avoids Expense/Payout outflow-only path in `generateTransactionLedgerEntry`). |
| **`periodFees` (canonical for Phase 2)** | In `[startDate, endDate]`: (1) Sum fee magnitude from ledger `platform_fee` rows with `platform === 'InDrive'`. (2) If that sum is **0**, use sum of `(grossAmount - netAmount)` on `fare_earning` for InDrive (same as `fareGrossMinusNetByPlatform.InDrive` / “Implied on fare” for InDrive). |
| **`periodLoads` / `lifetimeLoads` (Phase 2)** | Sum **positive** `amount` on `transaction:*` where `category === InDrive Wallet Credit` and `driverId` in resolved ID set; period filtered by date range, lifetime unbounded (or capped at `endDate` per handler). |
| **Permissions (logging loads)** | Reuse existing **`transactions.edit`** on `POST .../transactions` unless a narrower permission is added later. |
| **Types** | `IndriveWalletSummary`, `IndriveWalletSummaryResponse`, `IndriveWalletLoadTransactionInput` in `src/types/data.ts`; `TransactionCategory` includes `'InDrive Wallet Credit'`. |

**Status:** Phase 1 **implemented** (constants + types + ADR). Awaiting approval before Phase 2.

---

## Phase 2 — Backend GET: `periodLoads`, `periodFees`, `lifetimeLoads`

**Goal:** One authoritative endpoint that aggregates InDrive wallet data for a driver and date range.

### Steps

1. **Choose route and method**, e.g. `GET /make-server-37f42386/ledger/driver-indrive-wallet?driverId=&startDate=&endDate=` (same auth pattern as `/ledger/driver-overview`).
2. **Resolve driver IDs** the same way as `driver-overview` (Roam UUID + `uberDriverId` / `inDriveDriverId` if ledger rows use alternate IDs) so no rows are dropped.
3. **`periodLoads`:** Sum positive amounts from `transaction:*` (or org-filtered KV query) where:
   - category matches the agreed InDrive load category (step Phase 1.1),
   - `driverId` matches resolved set,
   - `date` ∈ `[startDate, endDate]` (inclusive, consistent with other endpoints).
4. **`lifetimeLoads`:** Same filter as `periodLoads` but **no** start/end (or `endDate` only if you cap at “today”).
5. **`periodFees`:** Implement the **single canonical definition** from Phase 1:
   - Prefer reusing query/aggregation logic already used for `fareGrossMinusNetByPlatform` / `platformFeesByPlatform` for **InDrive** only, **or** query `ledger:*` in range with `platform` InDrive and `eventType` in `platform_fee` (and optionally derive gross−net from `fare_earning` if product says so).
6. **Validate** response: `periodFees` should be ≥ 0; loads ≥ 0; handle missing driver → 404 or empty zeros per existing API style.
7. **Log** one debug line server-side with counts (not PII) for troubleshooting.
8. **Unit sanity:** Manually verify with one driver that numbers match Period earnings overlay for the same range when comparing InDrive fee lines.

**Exit criteria:** Endpoint returns JSON `{ success, data: { periodLoads, periodFees, lifetimeLoads } }`; documented in a comment above the handler.

**Status:** Phase 2 **implemented** — `GET /make-server-37f42386/ledger/driver-indrive-wallet` in `index.tsx`; client `api.getDriverIndriveWallet` in `api.ts`. Awaiting approval before Phase 3.

---

## Phase 3 — Backend: ensure “load” transactions write correct ledger rows

**Goal:** When an admin saves an InDrive load via existing `POST .../transactions`, a **`wallet_credit`** ledger entry is created with `platform: 'InDrive'` where applicable.

### Steps

1. **Trace** `saveTransaction` / `POST /transactions` path in `index.tsx` to confirm `generateTransactionLedgerEntry` runs for non-toll, non-fuel-gate transactions.
2. **Confirm** category `InDrive Wallet Credit` maps to `wallet_credit` (both `wallet` and `credit` in lowercase).
3. **Confirm** `transaction.platform` is copied to ledger entry (already in generator — verify).
4. **Edge cases:** If amount is negative or category wrong, reject or normalize with clear error message.
5. **Idempotency / duplicates:** Document whether editing the same load is allowed; ledger dedup is by `sourceId` + `sourceType` — avoid duplicate transaction IDs.
6. **Optional:** If repair jobs regenerate ledger from transactions, confirm InDrive loads are included in repair scope.

**Exit criteria:** Creating one test load in dev produces one `ledger:*` row with `eventType: 'wallet_credit'` and platform InDrive (or documented metadata).

**Status:** Phase 3 **implemented** — `POST /transactions` validates `InDrive Wallet Credit` (positive amount, `driverId`, `type=Adjustment`, `platform=InDrive`, defaults description/status/payment); `generateTransactionLedgerEntry` adds `metadata.indriveWalletLoad` + `walletProvider: InDrive`. Awaiting approval before Phase 4.

---

## Phase 4 — Client API and hooks

**Goal:** Frontend calls one function; no duplicated sum logic in components.

### Steps

1. **Add** `api.getDriverIndriveWallet({ driverId, startDate, endDate })` in `src/services/api.ts` pointing to the Phase 2 route.
2. **Parse** response and surface errors (network, 401, 400) consistently with `getLedgerDriverOverview`.
3. **Optional React hook** `useIndriveWallet(driverId, dateRange)` that fetches when `driverId` and range are set and returns `{ data, loading, error, refetch }`.
4. **Type imports** from `types/data.ts` for the response.

**Exit criteria:** From browser console or a temporary test button, the hook/API returns the same numbers as the raw GET for a known driver.

**Status:** Phase 4 **implemented** — `api.getDriverIndriveWallet` (with `parseFinancialApiErrorBody` for 4xx/5xx); same helper applied to `getLedgerDriverOverview`; `useIndriveWallet` in `src/hooks/useIndriveWallet.ts` (`data`, `loading`, `error`, `refetch`). Awaiting approval before Phase 5.

---

## Phase 5 — Overview UI: “InDrive wallet” card + log load

**Goal:** Driver Detail Overview shows loads, fees (period), and a control to log a new load.

### Steps

1. **Placement:** Add a card to `OverviewMetricsGrid` (or adjacent section in `DriverDetail`) with title **InDrive wallet** (exact casing per design system).
2. **Display:** Show `periodLoads`, `periodFees`, `lifetimeLoads` from Phase 4 (loading skeleton, error state).
3. **Log load modal:** Form fields: amount (required, > 0), date (default today), optional note/reference; submit calls **`api.saveTransaction`** with agreed category, `platform: 'InDrive'`, `driverId`, positive amount, appropriate `type`.
4. **On success:** Close modal, toast, **refetch** wallet summary (and optionally append to local transactions if parent passes `setTransactions`).
5. **Copy:** Short helper text explaining fees vs fleet loads (one sentence) to reduce support questions.
6. **Accessibility:** Focus trap in modal, labels on inputs, keyboard submit.

**Exit criteria:** User can log a load and see totals update without full page reload.

**Status:** Phase 5 **implemented** — `OverviewMetricsGrid` includes an **InDrive wallet** card (period loads headline, period fees & lifetime loads in breakdown; loading/error states; helper copy + tooltip). **Log load** modal posts via `api.saveTransaction` with `InDrive Wallet Credit` / `InDrive` / `Adjustment`. On success: toast, `useIndriveWallet` refetch, `refreshData()` + ledger refresh key bump from `DriverDetail`. `walletRange` is derived from Driver Detail `dateRange` (`yyyy-MM-dd`). Awaiting approval before Phase 6.

---

## Phase 6 — Polish, edge cases, and alignment with Period earnings overlay

**Goal:** Numbers match expectations; empty states; no double-counting.

### Steps

1. **Cross-check** `periodFees` from GET vs InDrive rows inside Period earnings breakdown modal for the **same** date range (document any intentional difference).
2. **Empty state:** No InDrive trips and no loads — show zeros and friendly copy.
3. **Large numbers / currency:** Use same formatting as other Overview cards (`fmtMoney` / locale).
4. **Date range:** When driver changes date filter on Driver Detail, wallet card refetches with same `startDate`/`endDate` as `driver-overview`.
5. **Performance:** Debounce or single fetch with `driver-overview` if both load together (optional batch later — not required for MVP).

**Exit criteria:** QA checklist in this file ticked for items 1–5.

**Status:** Phase 6 **implemented** — (1) Period earnings modal includes **InDrive fees — period alignment**: compares `GET /ledger/driver-indrive-wallet` `periodFees` with the same server rule from `resolvedFinancials` (ledger `platformFeesByPlatform.InDrive` or `fareGrossMinusNetByPlatform.InDrive`), with copy when platform filter ≠ All. (2) InDrive wallet card **empty state** when all three metrics are zero. (3) Amounts use shared **`fmtMoney`**. (4) **`ledgerDateRangeStrings`** in `DriverDetail` is the single source for driver-overview fetch and `walletRange` prop. (5) **`useIndriveWallet`** debounces range changes (300ms) with generation guards.

**QA checklist (Phase 6 items 1–5)**

- [x] **1.** `periodFees` from wallet GET cross-checked against Period earnings breakdown (same fee rule; filter caveat documented in UI).
- [x] **2.** Empty InDrive activity shows zeros + friendly subtext on the wallet card.
- [x] **3.** Currency uses `fmtMoney` / locale-consistent formatting on the InDrive surfaces touched here.
- [x] **4.** Wallet fetch uses the same `yyyy-MM-dd` range as `getLedgerDriverOverview` (`ledgerDateRangeStrings`).
- [x] **5.** Debounced wallet fetch (optional perf) — **done** (no batch with driver-overview for MVP).

---

## Phase 7 — Estimated InDrive balance (optional product logic)

**Goal:** Optional fourth field, e.g. `estimatedBalance`, using an **explicit** formula (not magic).

### Steps

1. **Define formula in code comments** (e.g. `estimatedBalance = lifetimeLoads - sum(InDrive platform_fee ledger net) + sum(wallet_credit adjustments) - …`). Adjust to match fleet accounting.
2. **Implement** only if product approves; add to GET response as optional field.
3. **Disclaim in UI:** “Estimate only — not InDrive’s official balance.”
4. **Do not** conflate with Roam cash wallet or Uber balance.

**Exit criteria:** If shipped, value is reproducible from ledger + transactions export; if not shipped, Phase 2 response remains three fields only.

**Status:** Phase 7 **implemented** — `GET /ledger/driver-indrive-wallet` returns **`estimatedBalance`** = `lifetimeLoads − lifetimeInDriveFees`, where `lifetimeInDriveFees` uses the same dual rule as `periodFees` (ledger `platform_fee` for InDrive, else `fare_earning` gross−net) over **all** ledger rows for the driver. Comments in `index.tsx` document the formula. UI: fourth breakdown row **Est. balance** plus footer disclaimer (not official InDrive balance; not Roam cash / Uber). Types: `IndriveWalletSummary.estimatedBalance` in `types/data.ts`.

---

## Phase 8 — Verification, permissions, and handoff

**Goal:** Safe rollout.

### Steps

1. **Permission check** on GET and on POST transaction for loads (match Phase 1.5).
2. **Regression:** Driver overview and Period earnings modal unchanged for non–InDrive drivers.
3. **Update** this `solution.md` with “Implemented in commit …” and any deviations.
4. **Stakeholder sign-off** on copy and formula (especially Phase 7 if enabled).

**Exit criteria:** Checklist complete; feature flag removed or documented.

**Status:** Phase 8 **implemented** — **GET** `/ledger/driver-indrive-wallet`: `requireAuth()` + `requirePermission('transactions.view')` (read path aligned with who can view transactions). **POST** `/transactions`: `requireAuth()` on the route; **InDrive Wallet Credit** additionally requires `hasPermission(..., 'transactions.edit')` with **403** + message if missing (Phase 1.5). **UI:** `OverviewMetricsGrid` disables **Log load** when `!can('transactions.edit')` (native `title` hint). **Regression:** InDrive wallet card and Period earnings remain date-range and driver-agnostic; drivers without InDrive activity still show zeros / alignment messaging only. **Feature flag:** none; no flag to remove. **Stakeholder sign-off:** manual step before production.

**QA checklist (Phase 8)**

- [x] **1.** GET wallet + POST load permissions enforced (see above).
- [x] **2.** Non–InDrive drivers: no InDrive-specific branching; overview/cards behave as before.
- [x] **3.** This document updated (implementation notes; commit hash left to author at commit time).
- [ ] **4.** Stakeholder sign-off (optional — track outside repo).

---

## Execution rule (for implementers)

1. **Confirm** with the stakeholder before starting **Phase 1** implementation.
2. Complete phases **in order**; after each phase, **stop** and wait for **explicit approval** before starting the next.
3. If a phase reveals a design conflict (e.g. `periodFees` definition), **update this document** and resolve before coding dependent phases.

---

## Appendix — Reference (from prior analysis)

- Ledger mapper: category contains `wallet` + `credit` → `wallet_credit` (`generateTransactionLedgerEntry` in `index.tsx`).
- Trip-derived InDrive fees: `platform_fee` from `indriveServiceFee` on trip ledger generation.
- Driver overview already exposes InDrive splits: `fareGrossMinusNetByPlatform`, `platformFeesByPlatform` (reuse or mirror for `periodFees`).
