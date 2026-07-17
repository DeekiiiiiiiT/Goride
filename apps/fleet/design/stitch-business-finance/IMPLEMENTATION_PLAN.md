# Business Finance Center — Enterprise Implementation Plan

**Feature:** Fleet Owner Business Finance (new top-level area)  
**Stitch project:** Roam Fleet APP (`projects/3587123323600813385`)  
**Design system:** Precision Operations (`assets/d393c21ec4be4c768bf9a2e8060fd674`)  
**Priority #1:** No breakage — additive only; never rewrite settlement, bank confirm, fuel, or toll math  
**UI source of truth:** Google Stitch screens only (do not freestyle UI after Phase 1)

---

## Non-negotiable guardrails (every phase)

1. **Additive architecture** — New folder `components/business-finance/**`. Do not refactor `CashFlowDashboard`, `TransactionsTab`, settlement utils, or `fleetBankReceive` unless a phase explicitly says “touch for deep-link only.”
2. **No mocked KPIs** on new screens — If data is incomplete, show an honest “Incomplete data” state, never fake numbers.
3. **Three cash stories stay separate** — Platform bank ≠ Driver cash held ≠ InDrive wallet loads. Never merge into one “cash” number.
4. **Bank Deposits does not change settlement math** — Existing rule stays forever.
5. **Settlement Week–tagged Log Cash** remains the only SSOT for cash returned.
6. **Feature flag / permission** — New nav behind `canView('business-finance')` (map to a safe existing permission first, or add a new permission without removing old ones).
7. **Old Financial Analytics stays live** until Business Finance is proven; no deletion until Cleanup phase.
8. **Stitch → code fidelity** — After Phase 1 downloads, React components must match Stitch layout, spacing, hierarchy, and interaction patterns. If UI and Stitch diverge, Stitch wins; edit Stitch then re-download, do not invent.

### UX quality bar (all screens)

| Criterion | How we enforce it |
|-----------|-------------------|
| Usability | One period control for the whole section; cards click into detail tabs; max 1 primary action per card |
| User-friendly | Plain-English labels (“Money the fleet received”, not “payout_bank”); tooltips on accountant terms |
| Frictionless | Week/month preset chips (This week / Last week / This month); Clear filter in one click; deep-links open existing desks |
| High-fidelity | Stitch desktop + mobile screens; realistic sample data in mocks; working tab/period interactions in UI shell |
| Responsive | Desktop 1280+ and mobile ~390 screens in Stitch; stack KPI grids; tables scroll horizontally on small screens |

---

## Phase 0 — Pre-flight (no UI code, no backend)

**Goal:** Lock scope and inventory so Phase 1 Stitch prompts are accurate.

### Steps

0.1. Re-read accounting blueprint canvas and this plan; confirm tab list with stakeholder (Overview, P&L, Cash & Bank, Expenses, Driver Balances; Unit Economics = later phase).  
0.2. Inventory APIs already available (read-only list):
   - Canonical ledger events (`getCanonicalLedgerEvents`)
   - Fleet bank confirms (`getFleetBankConfirms`)
   - Driver financial periods / settlement rollups
   - Fuel finalized costs / fuel ledger
   - Toll analytics / claimable loss surfaces
   - InDrive wallet summaries
   - Maintenance logs (cost fields may be missing — note as Phase 6 stub)
0.3. Document **forbidden mutations** checklist (no edits to `driverSettlementMath`, `cashSettlementCalc`, bank confirm write paths, fuel finalize, toll settlement).  
0.4. Create design folder: `apps/fleet/design/stitch-business-finance/` with `SCREEN_BRIEFS.md`, `README.md`, `MANUAL_CHECKLIST.md`.  
0.5. Stakeholder sign-off: “Phase 1 = Stitch only; no production wiring.”

**Exit criteria:** Briefs approved; API inventory table saved; guardrails acknowledged.

---

## Phase 1 — Stitch design only (NO backend wiring)

**Goal:** Generate and apply Precision Operations to all Business Finance screens in Stitch. Download assets. Produce React **UI shells with mock data only**.  
**Explicitly forbidden:** New API routes, changing `api.ts` financial endpoints, wiring live queries, changing server controllers.

### Step 1.1 — Confirm Stitch project & design system

1. Open Stitch project **Roam Fleet APP** (`3587123323600813385`).  
2. Confirm design system **Precision Operations** (`assets/d393c21ec4be4c768bf9a2e8060fd674`) is attached.  
3. If design MD drifted, `upload_design_md` / `update_design_system` only — do not invent a new system.  
4. Record screen instance IDs as they are created in `SCREEN_BRIEFS.md`.

### Step 1.2 — Write screen briefs (before generate)

Create detailed briefs for each screen (desktop + mobile where noted):

| Screen ID (plan name) | Purpose | Must include |
|----------------------|---------|--------------|
| `bf-overview-desktop` | Owner 5-minute health | Period bar; 4 KPI groups (Money in / Money out / Profit health / Risk); clickable cards; empty/incomplete banners |
| `bf-overview-mobile` | Same, stacked | Same content, single column, sticky period chips |
| `bf-pnl-desktop` | P&L statement | Line items waterfall; operating ratio; platform split; export placeholder |
| `bf-cash-bank-desktop` | Three cash stories | Platform bank strip (link to Bank Deposits); Driver cash AR; Wallet loads; never one blended total |
| `bf-expenses-desktop` | Expense mix | Category cards + table; deep-link affordances to Fuel / Toll / Maintenance |
| `bf-driver-balances-desktop` | Fleet who-owes-whom | Dense table; search; sort; status chips; open driver deep-link |
| `bf-shell-nav` | Section chrome | Top tabs matching AppLayout pattern; period control shared |

### Step 1.3 — Generate screens in Stitch

For each brief:

1. Call `generate_screen_from_text` with:
   - `projectId`: `3587123323600813385`
   - `designSystemId`: `assets/d393c21ec4be4c768bf9a2e8060fd674`
   - Device: `DESKTOP` or `MOBILE` as briefed
   - Prompt must name **Precision Operations**, indigo primary `#4f46e5`, Inter, ROUND_FOUR, data-dense fleet console, no decorative fluff
2. Wait for completion; on timeout poll `get_screen` (do not blindly retry generate).  
3. Human review against UX bar; note defects.

### Step 1.4 — Apply design system to all new screens

1. `apply_design_system` with design system asset id + all new screen instances.  
2. Re-fetch screens; confirm tokens match Precision Operations.  
3. If drift: `edit_screens` with corrective prompt (still Stitch-only).

### Step 1.5 — Download assets locally

1. `download_assets` → `apps/fleet/design/stitch-business-finance/`.  
2. Keep HTML/screenshots as the **only** visual reference for Phase 2+.  
3. Update `README.md` with screen → folder map.

### Step 1.6 — Pixel-faithful React shells (mock data only)

1. Create `apps/fleet/src/components/business-finance/`:
   - `BusinessFinancePage.tsx` (tab shell + period state)
   - `OverviewTab.tsx`, `PnLTab.tsx`, `CashBankTab.tsx`, `ExpensesTab.tsx`, `DriverBalancesTab.tsx`
   - `shared/PeriodToolbar.tsx`, `shared/KpiCard.tsx`, `shared/IncompleteDataBanner.tsx`
2. Use existing shadcn primitives (`Card`, `Tabs`, `Table`, `Button`, `Badge`) styled to match Stitch — **layout from Stitch HTML**, not from old Analytics.  
3. Wire **hardcoded realistic mock fixtures** only (JMD-style amounts, Uber/InDrive labels).  
4. Register route + nav **behind permission**, defaulting to mock page — safe if flag off.  
5. **Do not** import live `api.*` financial fetchers yet (exception: none).  
6. Responsive pass: match mobile Stitch at 390px.

### Step 1.7 — Phase 1 acceptance

- [ ] All planned Stitch screens exist and use Precision Operations  
- [ ] Assets downloaded under `design/stitch-business-finance/`  
- [ ] React shells render mock data and match Stitch structure  
- [ ] No new backend endpoints; no edits to settlement/bank/fuel/toll math  
- [ ] Existing Financial Analytics / Bank Deposits unchanged in behavior  
- [ ] Stakeholder UX sign-off on Stitch + shell

**Exit criteria:** Approved Stitch + mock UI shells. **Stop here until approved.**

---

## Phase 2 — Shell integration & safe navigation (still no new aggregations)

**Goal:** Make Business Finance a first-class nav destination without changing money math.

### Steps

2.1. Add page id `business-finance` in `App.tsx` routing (render `BusinessFinancePage`).  
2.2. Add sidebar item (top-level, near Financial Analytics) — label **Business Finance**.  
2.3. Map permission in `permissions.ts` (prefer new key; temporary map to `nav.financial_analytics` if needed — document).  
2.4. Deep-link buttons in Overview mock → existing pages (`fleet-financials`, fuel, toll) via `onNavigate` only.  
2.5. Feature flag (if module flags exist): `businessFinance` default off in production until Phase 3 exit.  
2.6. Smoke test: all existing pages still load; Bank Deposits KPIs unchanged.

**Exit criteria:** Nav works; flag can hide section; zero regressions on old desks.

---

## Phase 3 — Overview live data (read-only aggregations)

**Goal:** Replace Overview mocks with **read-only** rollups. Additive server helpers preferred; do not alter writers.

### Steps

3.1. Design `BusinessFinanceOverview` DTO (TypeScript types only first):
   - `periodStart`, `periodEnd`
   - Money in: grossEarnings, bankExpected, bankReceived, cashCollected, cashStillHeld
   - Money out: fuel, toll, maintenance (0 or null if unavailable), walletLoads, driverPayouts
   - Profit: operatingProfit, operatingRatio
   - Risks: needsStatementWeeks, highCashDriversCount, tollVarianceFlags
3.2. Implement **pure** client aggregator first (preferred for safety): compose existing APIs in a new util `utils/businessFinanceOverview.ts` — no server change if possible.  
3.3. If payload too heavy, add **new** read-only endpoint (e.g. `GET /business-finance/overview`) that only reads; never writes; never calls settlement mutators.  
3.4. Wire OverviewTab to React Query; keep IncompleteDataBanner when any source fails.  
3.5. Click-through: KPI → correct sub-tab or existing desk.  
3.6. Parallel-load sources; timeout / partial success handling.  
3.7. Regression: Bank Deposits confirm/unconfirm still works; settlement screens unchanged.

**Exit criteria:** Overview shows real numbers or honest incomplete; no write side effects.

---

## Phase 4 — Profit & Loss (ledger-backed statement)

**Goal:** Real P&L waterfall from canonical ledger event types.

### Steps

4.1. Lock chart of accounts mapping (code constant, documented):
   - Gross = fare_earning + tip + promotion (+ statement_line as needed)
   - − platform_fee
   - − fuel_expense
   - − toll_charge (net of recoveries if defined)
   - − maintenance (when available)
   - − wallet_credit (ops funding)
   - − driver_payout / settlement fleet share rules (read-only from period projections — **do not recalculate settlement**)
   - = operating profit; operating ratio
4.2. Implement `utils/businessFinancePnL.ts` pure functions + unit tests (or fixture tests).  
4.3. PnLTab: statement UI from Stitch; period shared with Overview.  
4.4. Platform split (Uber / InDrive / Roam) as secondary breakdown.  
4.5. Explicit disclaimer: “Owner view — does not change driver settlement.”  
4.6. Export CSV (client-side) optional; no new write APIs.  
4.7. Guard: if ledger coverage thin, show coverage % + IncompleteDataBanner.

**Exit criteria:** P&L matches sampled ledger sums for a known week; settlement math untouched.

---

## Phase 5 — Cash & Bank rollup (extends Bank Deposits)

**Goal:** Owner summary of three cash stories; Bank Deposits remains the workshop.

### Steps

5.1. Platform bank panel: reuse `fleetBankReceive` merge + confirms (same as Bank Deposits) — **import utils, do not duplicate logic**.  
5.2. “Open Bank Deposits” CTA → `fleet-financials`.  
5.3. Driver cash AR: fleet rollup of cash still held from driver financial periods API (read-only).  
5.4. Wallet loads: sum InDrive wallet credits for period (existing wallet APIs).  
5.5. UI must show **three separate totals** (Stitch layout).  
5.6. No new confirm/unconfirm writers here — all mutations stay on Bank Deposits / Wallet Center.  
5.7. Regression checklist: Bank Deposits upload PDF/CSV, confirm, enter amount, unconfirm.

**Exit criteria:** Cash & Bank accurate; Bank Deposits behavior identical.

---

## Phase 6 — Expenses rollup + Maintenance cost readiness

**Goal:** Single expense view; prepare Maintenance $ without blocking on full Maintenance rebuild.

### Steps

6.1. Fuel spend: aggregate from fuel ledger / finalized reports for period.  
6.2. Toll spend + claimable loss: read from existing toll analytics / recon surfaces (deep-link to Toll Reconciliation).  
6.3. Other / fixed expenses: existing transaction categories or fixed-expense service if present.  
6.4. Maintenance:
   - If logs lack amount: show card “Maintenance costs not tracked yet” + link to Maintenance Hub  
   - Schema note for upcoming work: require `amount`, `category`, `vehicleId`, `paidBy` on service logs  
   - **Do not** invent maintenance totals  
6.5. Expense mix chart + category table per Stitch.  
6.6. Deep-links only — no rewrite of Fuel/Toll pages.

**Exit criteria:** Expenses tab truthful; Maintenance stub honest; fuel/toll desks unchanged.

---

## Phase 7 — Driver balances fleet table

**Goal:** Fleet-wide who owes whom without opening each driver.

### Steps

7.1. Read-only table from driver financial periods / settlement period rows across drivers.  
7.2. Columns (align Stitch): Driver, Cash still held, Company owes, Bank settled flag (display-only), Week, Status.  
7.3. Search + sort + sticky header.  
7.4. Row click → Driver Detail Financials/Settlement (existing route).  
7.5. Do not call Log Cash or retag APIs from this page.  
7.6. Performance: paginate or virtualize if driver count large.

**Exit criteria:** Matches spot-checks against 3 drivers’ Settlement screens.

---

## Phase 8 — Hardening, permissions, observability

### Steps

8.1. Permission audit: who can see Business Finance vs who can mutate Bank/Cash.  
8.2. Loading / error / empty / incomplete states for every tab (match Stitch empty states).  
8.3. Timezone: use `useFleetTimezone` consistently with Bank Deposits weeks.  
8.4. Logging: client-side timing for slow aggregations; no PII in logs.  
8.5. Manual QA script in `MANUAL_CHECKLIST.md` (desktop + mobile widths).  
8.6. Turn feature flag on for internal users; soak; then default on.

**Exit criteria:** Checklist passed; no P0/P1 bugs on existing money flows.

---

## Phase 9 — Unit economics (optional / later)

**Defer until Phases 3–7 stable.** Per-vehicle TCO and per-platform contribution. Requires reliable maintenance $ and trip attribution. Same Stitch-first process if new screens needed (mini Phase 1 for those screens only).

---

## Phase 10 — Code clean-up (mandatory final phase)

**Goal:** Reduce duplication and dead paths **without** changing behavior.

### Steps

10.1. Remove Business Finance mock fixtures once all tabs live.  
10.2. Deduplicate money formatters / period helpers into shared utils used by Business Finance only (do not force-refactor old Analytics yet).  
10.3. Evaluate old Financial Analytics tabs:
   - If fully superseded: hide behind flag or deprecate with banner “Use Business Finance”  
   - **Do not delete** until one full settlement cycle with flag off tested  
10.4. Delete unused experimental components created during shells.  
10.5. Ensure `design/stitch-business-finance/` README lists final screen → component map.  
10.6. Comment pass: short technical comments on P&L mapping constants.  
10.7. Final regression: Bank Deposits, Settlement, Cash Wallet, Fuel finalize, Toll recon, InDrive wallet.  
10.8. Archive this plan’s “done” checkboxes; note follow-ups (Maintenance $ schema).

**Exit criteria:** Clean tree; no dead mocks; old tools either linked or clearly deprecated; zero money-math regressions.

---

## Suggested delivery sequence (calendar)

| Phase | Focus | Backend? |
|-------|--------|----------|
| 0 | Pre-flight | No |
| **1** | **Stitch + mock shells** | **No** |
| 2 | Nav / flag | No money APIs |
| 3 | Overview live | Read-only |
| 4 | P&L | Read-only |
| 5 | Cash & Bank | Read-only (+ deep-link) |
| 6 | Expenses + Maint stub | Read-only |
| 7 | Driver balances | Read-only |
| 8 | Hardening | Minimal |
| 9 | Unit economics | Later |
| 10 | Clean-up | No behavior change |

---

## Rollback plan

- Feature flag / permission off → Business Finance disappears; all legacy desks remain.  
- If an aggregation bug ships: revert only `components/business-finance/**` and any **new** endpoint — never revert bank confirm or settlement commits as part of rollback.

---

## Immediate next action (when approved)

**Start Phase 0.4–0.5 + Phase 1.2:** create `design/stitch-business-finance/SCREEN_BRIEFS.md`, then generate Stitch screens with Precision Operations. No app money wiring until Phase 1 exit sign-off.
