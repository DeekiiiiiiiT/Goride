# Fleet vs Independent Driver UI — Audit

**Date:** 2026-07-25
**Status:** Audit only — no code changes made.
**Goal (for later planning):** Fully collapse the fleet driver UI onto the independent driver UI/UX. Keep only two fleet-specific things: (1) the "Start Trip" button on the home screen, (2) expense logging (fuel/tolls/etc) reachable from the nav. Delete the old fleet-specific screens once migrated.

---

## 1. Where the fleet/independent split is decided

Single source of truth: [`apps/driver/src/contexts/DriverContext.tsx`](apps/driver/src/components).

- `DriverMode = 'fleet' | 'independent'` (line 6), read from Supabase table `driver_profiles.mode` (lines 100-112).
- `DriverProvider` computes `mode = profile?.mode || 'independent'` (line 165), derives `isFleetDriver = mode === 'fleet'` and `isIndependentDriver = mode === 'independent'` (lines 166-167).
- Also derives a `DriverPermissions` object (lines 169-177): `canAccessEquipment` / `canAccessFuelCard` / `canAccessReimbursements` / `canAccessWeeklyCheckin` → true only for fleet; `canAccessTaxCenter` / `canAccessInsurance` / `canAccessVehicleManagement` → true only for independent.
  - **Note:** confirmed via grep this `permissions` object is exported but has **zero consumers** anywhere else in `apps/driver/src`. Dead scaffolding — not wired to anything.
- Consumed via `useDriver()`.

### Every branch point on `isFleetDriver` / `isIndependentDriver` / `mode`

- `apps/driver/src/App.tsx` — does **not** branch fleet/independent itself. Only branches admin (`/admin` pathname, lines 96-117) vs. driver app, and auth/onboarding state. Renders `DriverShell` unconditionally once authenticated+onboarded (line 59). All fleet/independent splitting happens inside `DriverShell`.
- `apps/driver/src/components/layout/DriverShell.tsx:60` — `const { mode, isFleetDriver, isIndependentDriver, fleet, loading, profile } = useDriver();` — the real branch point (full detail in §2/§3).
- `apps/driver/src/config/navigation.ts:58-64` — `getNavigationItems(mode)` branches the hamburger drawer contents.
- `apps/driver/src/components/home/DriverMintHome.tsx:9,17-21` — `isFleetDriver` gates whether `<FleetStartTripLauncher/>` is passed into the shared home dashboard.
- `apps/driver/src/components/onboarding/DriverHybridOnboarding.tsx:59` — `profile?.mode === 'fleet' && profile.fleetId` branches onboarding flow (join existing fleet vs. independent signup).
- `apps/driver/src/admin/components/ComplianceChecklist.tsx:25` and `apps/driver/src/admin/pages/users/DriverDetailPage.tsx:666` — branch on `mode === 'fleet'` in the **admin** app. Out of scope for the driver-app UI collapse, but the admin app will still need to know which drivers are "fleet" for reviewing the two retained features (e.g. expense review queues).

### Dead/orphaned duplicate branch points (not wired into `DriverShell`, zero importers found anywhere)

First-generation "single component, if/else inside" implementations that were abandoned in favor of the current split-component approach but never deleted:

- `apps/driver/src/components/dashboard/DriverDashboard.tsx` (lines 21, 41, 90, 113, 120) — superseded by `DriverMintHome` / `DriverHomeDashboard`.
- `apps/driver/src/components/earnings/DriverEarnings.tsx` (lines 6, 64) — superseded by `fleet/DriverEarnings.tsx` + `independent/IndependentEarningsPage.tsx`.
- `apps/driver/src/components/profile/DriverProfile.tsx` (lines 27, 44, 48, 56, 80, 95) — superseded by `fleet/DriverProfile.tsx` + `independent/IndependentProfilePage.tsx`.

These three files (and their whole directories `components/dashboard/`, `components/earnings/`, `components/profile/`) are safe to delete outright, regardless of the migration plan — confirmed unreferenced.

---

## 2. Navigation / navbar

Both navs render from **one** component, `apps/driver/src/components/layout/DriverShell.tsx` — there's no separate `FleetNav`/`IndependentNav`, just one item list produced differently per mode.

### Bottom tab bar
`DriverShell.tsx` ~lines 388-446, item list from `getBottomNavItems()` (`config/navigation.ts:66-73`):
```
Home, Earnings, Trips, Profile
```
**Already identical for both modes today.** The old fleet screenshots showing a giant hamburger-only menu are the stale/legacy UI — current fleet drivers already get this same 4-tab bottom bar, plus extra items in the hamburger drawer on top of it.

### Hamburger drawer menu
`DriverShell.tsx` ~lines 448-500, item list from `getNavigationItems(mode)` (`config/navigation.ts:58-64`):

```ts
// navigation.ts
const commonNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Home' },
  { id: 'passenger-rides', label: 'Ride offers' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'trips', label: 'Trips' },
  { id: 'profile', label: 'Profile' },
];

const fleetOnlyNavItems: NavItem[] = [
  { id: 'expenses', label: 'Expenses' },        // Toll scanning, fuel, etc.
  { id: 'equipment', label: 'Equipment' },
  { id: 'service', label: 'Service request' },
  { id: 'fuel', label: 'Log fuel' },
  { id: 'performance', label: 'Performance' },
  { id: 'fuel-stats', label: 'Fuel Stats' },
  { id: 'claims', label: 'Claims' },
  { id: 'checkin', label: 'Check-in' },
];

const independentOnlyNavItems: NavItem[] = [
  { id: 'vehicle', label: 'My Vehicle' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'tax', label: 'Tax Center' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'settings', label: 'Settings' },
];

const settingsNavItem: NavItem = { id: 'settings', label: 'Settings' };

export function getNavigationItems(mode: DriverMode): NavItem[] {
  if (mode === 'independent') {
    return independentOnlyNavItems;
  }
  return [...commonNavItems, ...fleetOnlyNavItems, settingsNavItem];
}
```

- `mode === 'independent'` → `independentOnlyNavItems` only (My Vehicle, Expenses, Tax Center, Insurance, Settings).
- otherwise (fleet) → `commonNavItems` + `fleetOnlyNavItems` (8 extra items) + `settingsNavItem`.

### Drawer footer badge
The `"Fleet Driver"` vs `"Independent"` pill seen in your screenshots is rendered around `DriverShell.tsx:518-523`: `{isFleetDriver ? 'Fleet Driver' : 'Independent'}`.

### Header chrome
Also branches heavily on `mintDriverLayout` / `mintHomeLayout` / `isFleetDriver` (many `cn(...)` conditionals through `DriverShell.tsx` ~lines 155-330), purely cosmetic: fleet header shows `OfflineStatusIndicator` + `NotificationCenter` + fleet name badge; independent header shows a simplified "Roam" wordmark / profile avatar / notification bell (the "mint" styled screens).

**Implication for the plan:** collapsing the fleet nav onto the independent nav is mostly changing the fleet branch of `getNavigationItems()` to return `independentOnlyNavItems` (or equivalent) plus the two exceptions — Start Trip isn't a nav item at all (see §4), and "Log fuel"/"Expenses" would need to be merged into one "Expenses" entry.

---

## 3. Screen-by-screen: fleet component vs independent component

`DriverShell.renderPage()` (`DriverShell.tsx:146-219`) is the switch statement. Verified directly:

```ts
const renderPage = () => {
  switch (currentPage) {
    case 'dashboard':
      return <DriverMintHome />;                                    // SHARED
    case 'passenger-rides':
      return <RideDispatchPage onOpenWallets={...} />;
    case 'rides-wallets':
      return <DriverWalletsPage onBack={...} />;
    case 'earnings':
      return isIndependentDriver
        ? <IndependentEarningsPage onNavigate={setCurrentPage} />
        : <DriverEarnings />;
    case 'trips':
      return isIndependentDriver ? <IndependentTripsPage /> : <DriverTrips />;
    case 'profile':
      return isIndependentDriver
        ? <IndependentProfilePage onNavigate={setCurrentPage} />
        : <DriverProfile onNavigate={setCurrentPage} onLogout={handleSignOut} />;
    case 'documents':
      return isIndependentDriver
        ? <IndependentProfileDocumentsPage onBack={...} />
        : null;

    case 'equipment':
      return isFleetDriver ? <DriverEquipment onBack={...} /> : null;
    case 'expenses':
      return isFleetDriver
        ? <DriverExpenses onBack={...} />
        : <IndependentExpenses />;
    case 'claims':
      return isFleetDriver ? <DriverClaims /> : null;
    case 'fuel':
      return isFleetDriver ? <FleetFuelLogPage onBack={...} /> : null;
    case 'service':
      return isFleetDriver ? <FleetServiceRequestPage onBack={...} /> : null;
    case 'performance':
      return isFleetDriver ? <DriverPerformancePage onBack={...} /> : null;
    case 'fuel-stats':
      return isFleetDriver ? <DriverFuelStats /> : null;
    case 'checkin':
      return null;   // handled by the modal gate instead, see below

    case 'vehicle':
      return !isFleetDriver ? <MyVehicle /> : null;
    case 'tax':
      return !isFleetDriver ? <TaxCenter /> : null;
    case 'insurance':
      return !isFleetDriver ? <InsuranceCenter /> : null;

    case 'settings':
      return <DriverSettingsPage />;   // SHARED

    default:
      return <ComingSoonPlaceholder />;
  }
};
```

### Home (`dashboard`)
**Already shared**: `DriverMintHome` → `DriverHomeDashboard` (`components/home/DriverHomeDashboard.tsx`). Data: `useIndependentEarnings('today'/'week')` (backed by `ridesDriverMyEarnings` edge function) + `useRideDispatchContext` for online/offline toggle. Fleet gets one extra slot: `<FleetStartTripLauncher/>` (see §4).

### Earnings (`earnings`)
- **Fleet** — `fleet/DriverEarnings.tsx` (753 lines). Legacy KV-style `api.getTripsFiltered`, `api.getTransactions`, `api.getDriverMetrics`, `tierService.getTiers()`, `TierCalculations`, `api.getLedgerDriverOverview`. Computes tiers, cash-owed/net-outstanding, reimbursement/expense breakdown. Has a "Cash Wallet" sheet with 3 sub-tabs (`WeeklySettlementView`, `TransactionLedgerView`, `FuelWalletView`) and a History tab (`DriverHistory`).
- **Independent** — `independent/IndependentEarningsPage.tsx` (311 lines). `useIndependentEarnings` + `useIndependentTrips` + `useDriverWallets`, all backed by `services/ridesDriverEdge.ts` (newer Supabase "rides" edge functions). Simpler cash-in-hand / card-trips / wallet-chip UI. No tiers.
- **These are two entirely separate data layers, not just different UI.** This is the highest-effort item in the eventual migration.

### Trips (`trips`)
- **Fleet** — `fleet/DriverTrips.tsx` (427 lines). `api.getTrips()` (legacy `Trip` type from `types/data.ts`), local search/date filter, custom trip-detail drawer with fare breakdown.
- **Independent** — `independent/IndependentTripsPage.tsx` (183 lines). `useIndependentTrips()` → `ridesDriverMyTrips` (`RideRequestRow` type from `@roam/types/rides`), reuses shared `TripDetailsSheet` / `TripHistoryCard` components (`components/trips/`), plus cash-settlement resume flow via `useRideDispatchContext().resumeCashSettlement`.

### Profile (`profile`)
- **Fleet** — `fleet/DriverProfile.tsx` (613 lines). Single monolithic page: avatar, doc-status list inline, vehicle card, Settings list (Personal Info/Preferences/Tax/Report Issue) all in one file, bank-info form inline.
- **Independent** — `independent/IndependentProfilePage.tsx` (354 lines) + `independent/IndependentProfileDocumentsPage.tsx` / `DriverProfileDocumentsList.tsx` / `profileDocuments.ts`. Slim profile summary that navigates to a separate `documents` sub-page, uses shared `hooks/useDriverProfileExtras.ts` instead of duplicating the vehicle/metrics fetch inline.
- Both ultimately hit `api.getVehicles()` / `api.getDriverMetrics()` / `api.saveDriver()` (same legacy `api` service) for vehicle+bank info — some underlying data overlap despite different component structure.

### Independent-only utility pages (no fleet equivalent, listed for completeness)
Reachable from the hamburger menu, gated `!isFleetDriver` in `DriverShell.tsx:200-205`: `independent/MyVehicle.tsx` (157 lines), `independent/TaxCenter.tsx` (131 lines), `independent/InsuranceCenter.tsx` (156 lines).

---

## 4. The two things to keep

### "Start Trip" button
Already implemented as a small, cleanly isolated, mode-gated add-on to the **shared** home screen. Good news — nothing to rebuild.

- `apps/driver/src/components/home/DriverMintHome.tsx:9,17-21` — passes `startTripSlot={isFleetDriver && !tripFlowActive ? <FleetStartTripLauncher /> : null}` into `DriverHomeDashboard`.
- `apps/driver/src/components/home/DriverHomeDashboard.tsx:38-42,88` — accepts a generic `startTripSlot?: React.ReactNode` prop, renders it in `<div className="mt-3 flex justify-end">` under the stats row. No other fleet-specific logic in this file — it's a generic slot.
- `apps/driver/src/components/home/FleetStartTripLauncher.tsx` (250 lines) — the actual feature: pill button → full-screen sheet hosting `TripTimer` (live GPS trip recording, `components/trips/TripTimer.tsx`) → on completion opens `TripFareDialog` (`components/trips/TripFareDialog.tsx`) → `createManualTrip()` / `resolveTripIdentity()` / `withTripVehicle()` (`utils/tripFactory.ts`) → `api.saveTrips([trip])`. Has crash-recovery logic (persisted `TIMER_STORAGE_KEY` / `PENDING_FARE_STORAGE_KEY` in localStorage) and a `PendingCatalogRequestsDrawer` fallback for catalog-gate errors.

**To keep on the unified home screen:** since it's already a conditionally-rendered slot keyed off `isFleetDriver`, no restructuring needed — just keep the `isFleetDriver && <FleetStartTripLauncher/>` conditional (or re-key it to a per-driver-record flag once the rest of fleet UI is merged) rather than removing it. This is the one part of "fleet home" that is **not** legacy — depends only on `useAuth`, `useCurrentDriver`, `utils/tripFactory`, and `api.saveTrips`.

### Expense logging (fuel/tolls/etc.)
**Not symmetric today** — the two "equivalent" components are wildly different in maturity.

- `apps/driver/src/components/fleet/DriverExpenses.tsx` — **1,842 lines**, the real, fully-built feature. State machine (`ViewState`) covering: list → category select → odometer scan (`common/OdometerScanner.tsx`, 548 lines, camera + OCR) → GPS lock/retry for fuel station verification → payment method select (`expenses/PaymentMethodSelector.tsx`) → gas-card flow (`expenses/GasCardSummary.tsx`) or cash flow (`expenses/FuelCashInputs.tsx`, `expenses/PumpNumbersConfirm.tsx`, `expenses/ReceiptUploader.tsx`) → toll scan/review (uses `api.scanReceipt` OCR) → submit.
  - Talks to `api.saveTransaction`, `api.getTransactions`, `api.getAllFuelEntries`, `api.getFuelEntriesByVehicle`, `api.getVehicleTankStatus`, `api.getStations`, `api.processFuelReceipt`, `uploadEvidenceFile` (`services/uploadEvidence.ts`).
  - Has an **offline queue path** via `useOffline()` / `addToQueue({type:'SUBMIT_FUEL_EXPENSE',...})` that stashes photos in `services/offlineBlobStore.ts` (IndexedDB) for later sync (processed by `components/providers/OfflineProvider.tsx:29` `syncFuelExpense()`).
  - Has two dead imports: `PortalHome` (`fleet/views/PortalHome.tsx`) and `ReimbursementMenu` (`fleet/views/ReimbursementMenu.tsx`) are imported (lines 46-47) but never referenced anywhere else in the file — confirmed via full-file grep. These (and their dependency `fleet/ui/DriverGradientCard.tsx` / `fleet/theme.ts`) are otherwise unused anywhere in the app.
- `apps/driver/src/components/independent/IndependentExpenses.tsx` — **98 lines**, a static placeholder/mockup. No `useState`, no API calls, no data fetching. "This month's expenses: $0.00" hardcoded, category tiles hardcoded to `$0.00`, "Add Expense" button has **no `onClick` handler at all** (does nothing), "Export for Taxes" button does nothing. Not a working feature.

**Conclusion:** `IndependentExpenses.tsx` does **not** already cover fuel/toll logging — it's a non-functional stub. The real feature that must be preserved and made reachable from the nav for both driver types is `DriverExpenses.tsx` plus everything it pulls in (`common/OdometerScanner.tsx`, the `fleet/expenses/*` subfolder, `uploadEvidenceFile`, the offline-queue plumbing). "Keep expense logging" effectively means: keep and re-point to `DriverExpenses.tsx`; the independent stub is what gets replaced/discarded, not the other way around.

`DriverExpenses.tsx` currently expects an `onBack` prop and renders fullscreen (not embedded) — consistent with being launched from a nav item. `DriverShell.tsx:179-184` already renders `<DriverExpenses onBack={...} />` for `currentPage === 'expenses'` when `isFleetDriver`. Wiring it to the same `expenses` nav item for independent drivers is mechanically simple: swap the ternary at that `case 'expenses':` to always render `DriverExpenses`.

---

## 5. Supporting infra fleet-only components depend on

### Must be preserved (needed by the two retained features)
- `apps/driver/src/components/fleet/common/OdometerScanner.tsx` (548 lines) — camera capture + AI odometer-reading OCR, used by `DriverExpenses.tsx`'s fuel path.
- `apps/driver/src/components/fleet/expenses/*` — all 5 files (`PaymentMethodSelector.tsx`, `GasCardSummary.tsx`, `FuelCashInputs.tsx`, `PumpNumbersConfirm.tsx`, `ReceiptUploader.tsx`), only imported by `DriverExpenses.tsx` (and `GasCardSummary.tsx` internally imports the other three).
- `hooks/useGeolocation.ts` — used by `DriverExpenses.tsx` for the fuel-station GPS lock step.
- `services/uploadEvidence.ts` (`uploadEvidenceFile`) — receipt/odometer photo uploads.
- `services/offlineBlobStore.ts` + the `SUBMIT_FUEL_EXPENSE` branch of `components/providers/OfflineProvider.tsx` (`syncFuelExpense()` at line 29, dispatch at ~line 181) — offline fuel-log queueing. Note: `OfflineProvider` itself already wraps the whole app (`App.tsx`) for both driver types, so only the fuel-specific sync logic inside it is fleet-feature-specific, not the provider itself.
- `apps/driver/src/utils/resolveDriverVehicleId.ts`, `@roam/types/driverIdentity` (`resolveCanonicalDriverIdentity`) — vehicle/driver identity resolution in the expense submit path.
- `hooks/useCurrentDriver.ts` — used broadly by both fleet and independent screens already, not fleet-only, needed regardless.
- For Start Trip: `components/trips/TripTimer.tsx`, `components/trips/TripFareDialog.tsx`, `utils/tripFactory.ts`, `components/vehicles/PendingCatalogRequestsDrawer.tsx`, `utils/catalogGateErrors.ts`.

### Would become orphaned/deletable once fleet-only screens beyond the two retained features are dropped
- `components/dashboard/DriverDashboard.tsx`, `components/earnings/DriverEarnings.tsx`, `components/profile/DriverProfile.tsx` — already dead code today (§1), deletable immediately regardless of migration timing.
- `components/fleet/FleetReimbursements.tsx`, `FleetCheckin.tsx`, `FleetEquipment.tsx`, `FleetFuelCard.tsx` — confirmed **zero importers anywhere**. Already-dead prototype/stub screens (hardcoded "$0"/empty-state UI). Safe to delete now.
- `components/fleet/views/PortalHome.tsx`, `views/ReimbursementMenu.tsx`, `ui/DriverGradientCard.tsx`, `ui/DriverHeader.tsx`, `theme.ts` — `PortalHome`/`ReimbursementMenu` are imported-but-unused dead code inside `DriverExpenses.tsx` (§4); `DriverGradientCard` is only used by those two dead views; `DriverHeader`/`theme.ts` have no live consumers. Safe to delete.
- `components/fleet/DriverEquipment.tsx` (522 lines), `DriverClaims.tsx` (386 lines, uses `hooks/useClaims.ts`), `DriverFuelStats.tsx` (330 lines, uses `services/fuelService.ts` / `fuelCalculationService.ts` / `fuelDisputeService.ts` / `components/fuel/DisputeModal.tsx`), `DriverPerformancePage.tsx` (77 lines, reuses `DriverHistory.tsx`), `FleetServiceRequestPage.tsx` + `ServiceRequestForm.tsx` (uses `api.createMaintenanceRequest`), `FleetFuelLogPage.tsx` + `FuelLogForm.tsx` + `EvidenceBridgeStatus.tsx` + `fuelService`/`settlementService` (a **second, separate** fuel-logging UI — see §6), `WeeklyCheckInModal.tsx` (457 lines) + `hooks/useWeeklyCheckIn.ts` (120 lines, force-blocks fleet drivers via `checkInForced` in `DriverShell.tsx`) — all become orphaned once their nav entries/routes are removed. You said these "may migrate/handle later" — flag, don't delete yet.
- `components/home/DriverHomeQuickStats.tsx`, `DriverOnlineMiniToggle.tsx`, `independent/IndependentHomeEarnings.tsx` — already orphaned today (zero importers), unrelated to this migration, just stale files worth cleaning up separately.

---

## 6. Other fleet-only screens/features (not the two you're keeping)

All reached only via `fleetOnlyNavItems` in `navigation.ts:37-46` and the `isFleetDriver` guards in `DriverShell.renderPage()`. You said these can be handled/migrated later — listed here for reference:

- **Equipment** (`fleet/DriverEquipment.tsx`) — vehicle exterior damage-report tool: lists equipment/exterior parts (`utils/vehicle_parts.ts`), lets driver report damage per part (type/severity/notes) via `equipmentService` / `createDamageReport`.
- **Service request** (`FleetServiceRequestPage.tsx` → `ServiceRequestForm.tsx`) — maintenance-request form (type/priority/description/odometer), posted via `api.createMaintenanceRequest`.
- **Log fuel** (`FleetFuelLogPage.tsx` → `FuelLogForm.tsx`) — a **second, separate** fuel-logging dialog, functionally overlapping with the fuel category already inside `DriverExpenses.tsx`. Computes `entryMode: 'Anchor'|'Floating'` based on odometer presence, resolves `paymentSource` (RideShare_Cash / Gas_Card / Personal), calls `fuelService` / `settlementService`. **Flag as duplicate functionality to reconcile** when planning the fuel-logging consolidation.
- **Performance** (`DriverPerformancePage.tsx`) — monthly tier-earnings history (reuses `DriverHistory.tsx`, `tierService`, `TierCalculations`).
- **Fuel Stats** (`DriverFuelStats.tsx`) — weekly fuel-efficiency report (expected vs actual consumption) with a dispute-filing modal (`DisputeModal.tsx`, `FuelDisputeService`).
- **Claims** (`DriverClaims.tsx`) — toll-usage/claims list with status badges and driver-side actions, backed by `hooks/useClaims.ts`.
- **Check-in** (`WeeklyCheckInModal.tsx` + `hooks/useWeeklyCheckIn.ts`) — mandatory weekly odometer-photo check-in. `DriverShell.tsx` force-opens this modal (`checkInModalOpen`/`checkInForced`, lines ~72-74, ~107-117) whenever `isFleetDriver && needsCheckIn` — the one fleet-only feature reached via a blocking modal gate on load, not a nav click.
- Dead/never-wired stub screens present in the repo but not reachable from any nav item today: `FleetReimbursements.tsx`, `FleetCheckin.tsx`, `FleetEquipment.tsx`, `FleetFuelCard.tsx` (all confirmed zero importers) — likely superseded by the real `DriverClaims` / `DriverEquipment` / `WeeklyCheckInModal` / fuel-log implementations, or abandoned prototypes.

---

## Summary table — what happens to each fleet-only nav item

| Nav item | Component | Status | Disposition per your stated plan |
|---|---|---|---|
| Home | shared (`DriverMintHome`) | already unified | keep Start Trip slot |
| Earnings | `fleet/DriverEarnings.tsx` | separate data layer from independent | replace with independent version — needs data-layer work |
| Trips | `fleet/DriverTrips.tsx` | separate data layer | replace with independent version — needs data-layer work |
| Profile | `fleet/DriverProfile.tsx` | separate, monolithic | replace with independent version |
| Expenses | `fleet/DriverExpenses.tsx` | **real, working feature** | **keep** — re-point independent's `expenses` nav item to this component; discard `IndependentExpenses.tsx` stub |
| Equipment | `fleet/DriverEquipment.tsx` | fleet-only | defer ("handle later") |
| Service request | `FleetServiceRequestPage.tsx` | fleet-only | defer |
| Log fuel | `FleetFuelLogPage.tsx` | duplicate of Expenses' fuel flow | defer, but flag as redundant |
| Performance | `DriverPerformancePage.tsx` | fleet-only | defer |
| Fuel Stats | `DriverFuelStats.tsx` | fleet-only | defer |
| Claims | `DriverClaims.tsx` | fleet-only | defer |
| Check-in | `WeeklyCheckInModal.tsx` (modal gate, not a page) | fleet-only, blocking | defer |

## Known dead code to clean up regardless of this migration
`components/dashboard/DriverDashboard.tsx`, `components/earnings/DriverEarnings.tsx`, `components/profile/DriverProfile.tsx`, `fleet/FleetReimbursements.tsx`, `fleet/FleetCheckin.tsx`, `fleet/FleetEquipment.tsx`, `fleet/FleetFuelCard.tsx`, `fleet/views/PortalHome.tsx`, `fleet/views/ReimbursementMenu.tsx`, `fleet/ui/DriverGradientCard.tsx`, `fleet/ui/DriverHeader.tsx`, `fleet/theme.ts`, `components/home/DriverHomeQuickStats.tsx`, `components/home/DriverOnlineMiniToggle.tsx`, `independent/IndependentHomeEarnings.tsx`, and the unused `permissions` object in `DriverContext.tsx`.
