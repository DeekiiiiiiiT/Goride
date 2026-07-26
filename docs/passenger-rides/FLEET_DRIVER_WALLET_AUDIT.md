# Fleet Driver Wallet Audit — Why Cash in Hand (and related balances) don't match Fleet Ops

**Status:** Historical audit — **superseded** by [`MONEY_LEDGER_RULES.md`](MONEY_LEDGER_RULES.md) and the Wallet Architecture implementation plan. Do not use this doc to decide merges of Fleet Cash Wallet into Roam Cash/Digital/Debt.
**Date:** 2026-07-26 (audit); rules locked 2026-07-26
**Trigger:** Fleet Ops Trip Analytics (roamfleet.co) shows driver Kenny Gregory Rattray with `$6,500` total earnings / cash for the week (4 completed trips, 3 tagged "Manual Entry"). The driver app's Earnings screen (roamdriver.co) shows `JMD 0.00` everywhere — Total Earnings, Cash in Hand, Cash wallet chip, Card trips.
**Relationship to prior audits:** Builds directly on [`FLEET_DRIVER_MIGRATION_AUDIT.md`](FLEET_DRIVER_MIGRATION_AUDIT.md) (dispatch eligibility / UI unification) and [`../../FLEET_INDEPENDENT_UI_AUDIT.md`](../../FLEET_INDEPENDENT_UI_AUDIT.md) (screen-by-screen fleet vs. independent UI diff). Those docs flagged the earnings data-layer split as the highest-effort open item and as a "no fleet payout/ledger attribution" gap (§3.3/§4.6 of the migration audit) — this doc is the deep-dive on exactly what that means for wallets specifically, now that the UI side of that migration has already landed.

**Resolution direction (locked):** Two desks stay separate (Roam platform vs fleet ops). Kenny’s $0 Roam wallet with $6,500 fleet books is correct for manual-only weeks. See [`MONEY_LEDGER_RULES.md`](MONEY_LEDGER_RULES.md).

---

## 1. Confirmed: the UI is already unified, only the data underneath is not

As of this audit, `DriverShell.tsx` (`apps/driver/src/components/layout/DriverShell.tsx`) unconditionally renders the same components for every driver regardless of `mode`:

```tsx
case 'earnings':
  return <IndependentEarningsPage onNavigate={setCurrentPage} />;
case 'trips':
  return <IndependentTripsPage />;
case 'profile':
  return <IndependentProfilePage onNavigate={setCurrentPage} />;
```

This is a change from what `FLEET_INDEPENDENT_UI_AUDIT.md` documented the day before (it still showed `isIndependentDriver ? <IndependentEarningsPage/> : <DriverEarnings/>`). So the UI-unification part of that plan (§4.2 in the migration audit) has since shipped. Similarly, the dispatch-provider gap flagged in §3.1/§4.4 of the migration audit has also been fixed:

```tsx
// DriverShell.tsx ~505-517
// All drivers (fleet + independent) get the dispatch context and trip overlays.
// Fleet eligibility to actually go online is enforced server-side (driverModeFilter).
return (
  <DispatchConfigProvider config={RIDESHARE_DISPATCH_CONFIG}>
    <RideDispatchProvider>
      {shell}
      <DriverTripRequestOverlay />
      <DriverEnRouteOverlay />
      <DriverOnTripOverlay />
      <DriverCashSettlementOverlay />
      <DriverDigitalTripCompleteOverlay />
      <DriverArrivedPickupOverlay />
    </RideDispatchProvider>
  </DispatchConfigProvider>
);
```

A per-driver staged-rollout gate has also been added (`driver_profiles.dispatch_pilot`, migration `20260721120000_driver_dispatch_pilot.sql`), plus a vehicle-assignment requirement before a fleet driver can go online (`driverModeFilter.ts:65-73`, via `getFleetDriverContext`).

**Net effect:** a fleet driver's actual Roam-dispatched trips (accepted via "Ride offers" / the passenger app) now flow through exactly the same pipeline as an independent driver's — same `rides.ride_requests` row, same cash-settlement overlay, same journal entries. **This part is not broken.** The problem is confined to trips that don't come through that pipeline, and to settlement/expense screens that were quietly dropped in the UI unification.

---

## 2. Root cause: two disconnected data stores, one write-only bridge between them

### 2.1 What the new (shared) wallet UI reads
`apps/driver/src/components/independent/IndependentEarningsPage.tsx` and `apps/driver/src/components/rides/DriverWalletsPage.tsx` — rendered for **every** driver now — pull from:

- `useIndependentEarnings` → `ridesDriverMyEarnings` edge function → `aggregateDriverEarnings()` in [`supabase/functions/_shared/driverRideQueries.ts:537-548`](../../supabase/functions/_shared/driverRideQueries.ts#L537-L548), which internally calls `aggregateFromTable()` ([lines 468-535](../../supabase/functions/_shared/driverRideQueries.ts#L468-L535)):
  ```ts
  const { data, error } = await db.from(table)
    .select(columns)
    .eq("assigned_driver_user_id", driverUserId)
    .eq("status", "completed");
  ```
  against `rides.ride_requests` (falling back to `public.rides_ride_requests`). `cash_in_hand_minor` is summed per-row via `effectiveCashInHandMinor(r, isCashTrip)`, with a fallback to the payment journal (`aggregateCashInHandFromJournal`, lines 424-466) which reads `entry_type = 'cash_trip_collection'` rows credited to the driver's cash account.
- `useDriverWallets` → `ridesDriverWallets` edge function → driver cash/digital/debt account balances, computed from the **same** `rides` schema payment ledger (accounts + journal), populated by `submitCashSettlement` during the cash-settlement flow.
- `DriverWalletsPage`'s transaction list → `ridesDriverWalletJournal` → same `rides` schema journal.

**Everything the new wallet UI shows is scoped to `rides.ride_requests` + the `rides` schema payment ledger.** Nothing else.

### 2.2 What Fleet Ops Trip Analytics reads
The 4 trips shown for Kenny (3 tagged "Manual Entry") come from the Fleet dashboard's **"Log Manual Trip"** feature:

- `apps/fleet/src/components/trips/ManualTripForm.tsx` → submit handler (`handleManualTripSubmit` in `apps/fleet/src/components/trips/TripLogsPage.tsx:319`) → `api.saveTrips([newTrip])`.
- `apps/fleet/src/services/api.ts:253-259`:
  ```ts
  async saveTrips(trips: Trip[]) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/trips`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(trips),
    });
    ...
  }
  ```
  This posts to the **legacy fleet KV store** — the `_fleet-server` edge function (`make-server-37f42386`), backed by table `kv_store_37f42386`. This is a completely different backend from the `rides` schema.
- The driver's own **"Start Trip"** button (`apps/driver/src/components/home/FleetStartTripLauncher.tsx`) uses the exact same path: `TripTimer` → `TripFareDialog` → `createManualTrip()` (`utils/tripFactory.ts`) → `api.saveTrips([trip])`. So self-logged trips by the driver land in the same legacy KV store, not `rides.ride_requests`.

### 2.3 The bridge only runs one direction
[`supabase/functions/_shared/rideToFleetTrip.ts`](../../supabase/functions/_shared/rideToFleetTrip.ts) — `syncRideToFleetKv()` — fires when a `rides.ride_requests` row completes/cancels, and POSTs a mapped copy of it into the same fleet KV `/trips` endpoint used above, so Fleet Ops analytics can see Roam-dispatched trips alongside manual ones. It explicitly resolves fleet attribution (`getFleetDriverContext`) and skips non-fleet drivers:
```ts
// Fleet attribution: only fleet drivers' rides belong in fleet books.
// Independent drivers settle via their personal ride wallets — syncing them
// creates unscoped trip:* rows in fleet KV (no org, no vehicle).
```

**There is no code anywhere that runs the reverse: legacy-KV trip → `rides.ride_requests` row / cash-ledger journal entry.** So:

| Trip origin | Lands in `rides.ride_requests`? | Lands in fleet KV `trips`? | Shows in driver app wallet? | Shows in Fleet Ops analytics? |
|---|---|---|---|---|
| Roam dispatch (passenger books via roam-s.co) | ✅ | ✅ (synced by `rideToFleetTrip.ts`) | ✅ | ✅ |
| Fleet admin "Log Manual Trip" | ❌ | ✅ | ❌ | ✅ |
| Driver's own "Start Trip" | ❌ | ✅ | ❌ | ✅ |

Kenny's 4 trips are all manual-track trips (or a mix that happens to route entirely through the manual track this week), so they only populate the right-hand column — hence Fleet Ops shows $6,500 and the driver app shows $0.00. This is not a bug in either individual system; it's a missing link between them.

### 2.4 Independent drivers never hit this gap today
Independent drivers have no manual-trip entry point at all in the current UI — every trip of theirs originates as a Roam dispatch, so 100% of their trips take the left-hand path above. That's why "it works for independent drivers" — there's no manual track for them to fall into.

---

## 3. Three more disconnects found beyond Cash in Hand

### 3.1 Weekly Settlement / Transaction Ledger / Fuel Wallet are now unreachable in the driver app
Before the earnings-page unification (§1), `case 'earnings'` rendered `fleet/DriverEarnings.tsx` for fleet drivers — a 753-line screen with a "Cash Wallet" bottom sheet containing three sub-tabs:
- `WeeklySettlementView` — weekly cash-owed reconciliation
- `TransactionLedgerView` — raw transaction history
- `FuelWalletView` — fuel wallet / reimbursement balance

`fleet/DriverEarnings.tsx` is **no longer referenced anywhere in `DriverShell.tsx`** — confirmed via grep, zero matches. It is now orphaned, along with its driver-app-side sub-components (`apps/driver/src/components/drivers/WeeklySettlementView.tsx`, `FuelWalletView.tsx`, `TransactionLedgerView.tsx` — all zero importers).

**Consequence:** Kenny has no in-app way to see a weekly settlement summary, a raw transaction ledger, or a fuel-wallet balance anymore. This data still exists and is still visible to fleet admins on roamfleet.co (`apps/fleet/src/components/drivers/DriverDetail.tsx`, "Cash Wallet" tab — same `WeeklySettlementView`/`FuelWalletView`/`TransactionLedgerView` components, fleet-app copies), just not to the driver themselves. This looks like an unintentional regression from the UI-unification work, not a deliberate product decision — worth confirming which it is before planning a fix.

### 3.2 Two different "cash" liabilities, same word, opposite direction, no reconciliation
This is the most important conceptual gap to resolve before wiring anything further:

- **Fleet Ops "Cash Wallet"** (`apps/fleet/src/components/drivers/DriverDetail.tsx:3881`, comment in code): *"Cash Wallet tracks cash only — how much cash the fleet is still owed after returns, fuel, and tolls (same as Settlement)."* This is a **driver → fleet** liability: money the driver collected on behalf of the fleet business and hasn't yet handed over. Computed entirely from the legacy KV trips/transactions/fuel-entry data.
- **Driver app "Cash" / "Debt" wallet chips** (`IndependentEarningsPage`, `DriverWalletsPage`): a **driver ↔ Roam platform** liability — cash the driver is physically holding from a cash-paying rider, and a separate "Debt" balance representing rider-change float the driver owes back to the platform's digital wallet system, auto-repaid from card-trip earnings. Computed entirely from the `rides` schema ledger (`submitCashSettlement`, `cash_trip_collection` journal entries).

These are two independent debts, in different directions, to different parties, currently tracked in two systems that don't talk to each other. Making manual trips flow into `rides.ride_requests` (the fix implied by §2) would correct the **second** number only. It would do nothing for the first — Fleet Ops' "how much does Kenny owe the fleet this week" figure would still need its own settlement math, and nothing today keeps the two numbers consistent with each other (e.g., a driver settling cash with Roam doesn't reduce what they owe the fleet, and vice versa). Any future plan needs to explicitly decide: should these merge into one ledger, stay separate but cross-reference each other, or stay fully separate by design (fleet-internal accounting vs. platform accounting)?

### 3.3 Expense/fuel reimbursements don't touch the new wallet at all
`DriverExpenses.tsx` (`apps/driver/src/components/fleet/DriverExpenses.tsx`) — the real, fully-built fuel/toll logging feature that both the migration audit and the UI audit flagged as "must be preserved" — posts through `settlementService.processFuelSettlement()` (`apps/driver/src/services/settlementService.ts:257`). That function feeds fleet-side settlement math (`cashReceived`, `floatHeld`, `pendingClearance`, `approvedFuelCredits` — all fleet-liability concepts, see §3.2) — **not** the `rides` schema.

**Consequence:** when a fleet driver logs a cash fuel expense, it never offsets their "Cash in hand" or "Debt" figures in the new wallet UI, and per §3.1, there's currently no screen in the driver app where they'd see that offset happen at all (the screen that used to show it — `FuelWalletView` — is now orphaned).

---

## 4. What already works and should not be touched

- Roam-dispatched trip completion → cash settlement → `rides` ledger journal entries → driver-app wallet balances: **fully wired**, identical for fleet and independent drivers.
- Roam-dispatched trip → Fleet Ops analytics: **fully wired** via `syncRideToFleetKv` (one-way, by design — independent drivers are explicitly excluded from this sync since they have no fleet to report to).
- Dispatch eligibility gating (`independent_only_matching` flag + per-driver `dispatch_pilot` allowlist + vehicle-assignment check): **fully wired**, staged-rollout-capable.
- `RideDispatchProvider`/overlay wrapping in `DriverShell.tsx`: **fully wired** for all drivers.

---

## 5. Key files reference

| Concern | File |
|---|---|
| Unified earnings/trips/profile routing | `apps/driver/src/components/layout/DriverShell.tsx` (~140-146, ~505-517) |
| Driver-app wallet UI | `apps/driver/src/components/independent/IndependentEarningsPage.tsx` |
| Driver-app wallet detail/tabs | `apps/driver/src/components/rides/DriverWalletsPage.tsx` |
| Wallet balance fetch hook | `apps/driver/src/hooks/useDriverWallets.ts` |
| Earnings aggregation (rides schema) | `supabase/functions/_shared/driverRideQueries.ts` (`aggregateDriverEarnings`, `aggregateFromTable`, `aggregateCashInHandFromJournal`) |
| Cash-in-hand type helper | `packages/types/src/cashInHand.ts` |
| Cash settlement journal writer | `supabase/functions/rides/cashSettlement/*` (`processCashSettlement.ts`, `buildJournalEntries.ts`, `buildSettlementJournalV2.ts`, `registerCashSettlementRoutes.ts`) |
| One-way rides→fleet-KV sync | `supabase/functions/_shared/rideToFleetTrip.ts` |
| Fleet driver context resolver (mode/org/vehicle) | `supabase/functions/_shared/fleetDriverContext.ts` |
| Dispatch eligibility gate | `supabase/functions/_shared/driverModeFilter.ts` |
| Per-driver dispatch pilot allowlist | `supabase/migrations/20260721120000_driver_dispatch_pilot.sql` |
| Fleet admin "Log Manual Trip" UI | `apps/fleet/src/components/trips/ManualTripForm.tsx`, `TripLogsPage.tsx` |
| Fleet legacy trip-save endpoint | `apps/fleet/src/services/api.ts` (`saveTrips`, POST to `${API_ENDPOINTS.fleet}/trips`) |
| Driver's own manual "Start Trip" | `apps/driver/src/components/home/FleetStartTripLauncher.tsx`, `utils/tripFactory.ts` |
| Orphaned fleet earnings screen (dead) | `apps/driver/src/components/fleet/DriverEarnings.tsx` |
| Orphaned driver-side settlement sub-views (dead) | `apps/driver/src/components/drivers/WeeklySettlementView.tsx`, `FuelWalletView.tsx`, `TransactionLedgerView.tsx` |
| Live fleet admin equivalents (still working) | `apps/fleet/src/components/drivers/DriverDetail.tsx`, `WeeklySettlementView.tsx`, `FuelWalletView.tsx`, `TransactionLedgerView.tsx` |
| Fleet-side fuel/expense settlement | `apps/driver/src/services/settlementService.ts` (`processFuelSettlement`) |
| Related prior audits | `FLEET_INDEPENDENT_UI_AUDIT.md` (repo root), `docs/passenger-rides/FLEET_DRIVER_MIGRATION_AUDIT.md` |

---

## 6. Open questions to resolve before planning a fix

1. **Manual trips → `rides` ledger:** should "Log Manual Trip" (fleet admin) and "Start Trip" (driver) be re-pointed to write into `rides.ride_requests` + trigger the same cash-settlement journal path Roam-dispatched trips use, instead of (or in addition to) the legacy fleet KV store? This is the direct fix for the Cash-in-Hand mismatch.
2. **Fleet "cash owed" vs. platform "cash in hand" (§3.2):** should these become one ledger, stay two ledgers that reference each other, or remain intentionally separate (fleet-internal accounting vs. Roam-platform accounting)? This is a product/business decision, not just an engineering one — it determines the scope of everything else.
3. **Weekly Settlement / Fuel Wallet / Transaction Ledger (§3.1):** was dropping these from the driver-facing app intentional (moved to fleet-admin-only visibility) or an unintended regression from the earnings-page unification? If drivers need to see them, where do they live in the new unified UI — folded into the existing Cash/Digital/Debt tabs, or restored as a separate screen?
4. **Fuel/expense reimbursement (§3.3):** once the ledger question (#2) is answered, does a fuel expense need to post an offsetting entry into whichever ledger(s) track "cash owed," so the driver's wallet reflects reimbursements in real time?
5. **Scope of the fix:** does this need to work retroactively (backfill Kenny's existing $6,500 of manually-logged trips into the `rides` ledger) or only prospectively (new manual trips going forward)?

This document is descriptive only — no implementation plan or code changes are included. Use it as the reference point when scoping the actual fix.
