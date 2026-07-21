# Fleet Driver → New Booking UI Migration: Audit & Implementation Plan

**Status:** Audit complete, not yet implemented.
**Author context:** Written after a full read-through of the driver app, the rides dispatch backend, and the existing rollout doc. No code was changed as part of this audit.
**Goal:** Retire the old fleet-driver UI (`apps/driver/src/components/legacy/*`) and move all drivers — fleet and independent — onto the new booking UI that lets passengers book them from roam-s.co, while giving fleet drivers a manual "Start Trip" button so they can still log trips the way they do today (walk-ups, phone bookings, other platforms).

---

## 1. Current architecture (as-is)

### 1.1 One app, one mode field, two UIs
There is **one** driver app — `apps/driver` — not two separate apps for fleet vs. independent drivers. Everything branches off a single field:

```
driver_profiles.mode: 'fleet' | 'independent'
```

This is loaded and exposed by [`apps/driver/src/contexts/DriverContext.tsx`](../../apps/driver/src/contexts/DriverContext.tsx):

```ts
export type DriverMode = 'fleet' | 'independent';

const permissions: DriverPermissions = {
  canAccessEquipment: isFleetDriver,
  canAccessFuelCard: isFleetDriver,
  canAccessReimbursements: isFleetDriver,
  canAccessWeeklyCheckin: isFleetDriver,
  canAccessTaxCenter: isIndependentDriver,
  canAccessInsurance: isIndependentDriver,
  canAccessVehicleManagement: isIndependentDriver,
};
```

`mode` currently controls **two unrelated things at once**, and that conflation is the central problem this migration needs to solve:

1. **Which home/booking UI renders** — legacy (`TripTimer` + manual entry) vs. new mint UI (`DriverMintHome` + Roam dispatch).
2. **Which back-office features are visible** — equipment, fuel card, reimbursements, weekly check-in (fleet-only) vs. tax center, insurance, vehicle management (independent-only).

These should be orthogonal. A fleet driver should be able to get the new booking UI *without* losing equipment/fuel-card/weekly-check-in, which are about the vehicle-ownership arrangement, not about which booking system is in use.

### 1.2 UI branching — `DriverShell.tsx`
[`apps/driver/src/components/layout/DriverShell.tsx`](../../apps/driver/src/components/layout/DriverShell.tsx) is the router/shell for the whole driver app. Key branch points:

- **`renderPage()` (lines 144-217)** — switches on `currentPage` and, within several cases, on `isFleetDriver`/`isIndependentDriver` to decide between legacy and new components:
  - `dashboard`: `DriverDashboard` (legacy) — but note `DriverDashboard` itself early-returns `<DriverMintHome />` when `isIndependentDriver` (see 1.3).
  - `earnings`: `IndependentEarningsPage` vs `DriverEarnings` (legacy).
  - `trips`: `IndependentTripsPage` vs `DriverTrips` (legacy).
  - `profile`: `IndependentProfilePage` vs `DriverProfile` (legacy).
  - `equipment`, `expenses` (fleet variant), `claims`, `fuel`, `performance`, `fuel-stats`, `checkin`: fleet-only, return `null` for independent drivers.
  - `vehicle`, `tax`, `insurance`: independent-only, return `null` for fleet drivers.
- **Provider wrapping (lines 540-554)** — **this is a live bug, see §3.1**:
  ```tsx
  return isIndependentDriver ? (
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
  ) : (
    shell
  );
  ```
  Fleet drivers get bare `shell` — no dispatch context, no trip-request/en-route/on-trip/cash-settlement overlays at all.
- **Weekly check-in modal (lines 526-536)**: forced on fleet drivers only (`isFleetDriver && (needsCheckIn || checkInOpen)`).

### 1.3 Navigation — `navigation.ts`
[`apps/driver/src/config/navigation.ts`](../../apps/driver/src/config/navigation.ts):

```ts
const commonNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'passenger-rides', label: 'Ride offers', icon: Navigation },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'trips', label: 'Trips', icon: Car },
  { id: 'profile', label: 'Profile', icon: User },
];

const fleetOnlyNavItems: NavItem[] = [
  { id: 'expenses', label: 'Expenses', icon: Camera },
  { id: 'equipment', label: 'Equipment', icon: Wrench },
  { id: 'fuel', label: 'Log fuel', icon: Fuel },
  { id: 'performance', label: 'Performance', icon: History },
  { id: 'fuel-stats', label: 'Fuel Stats', icon: BarChart3 },
  { id: 'claims', label: 'Claims', icon: Receipt },
  { id: 'checkin', label: 'Check-in', icon: CheckCircle },
];

const independentOnlyNavItems: NavItem[] = [
  { id: 'vehicle', label: 'My Vehicle', icon: Car },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'tax', label: 'Tax Center', icon: FileText },
  { id: 'insurance', label: 'Insurance', icon: Shield },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function getNavigationItems(mode: DriverMode): NavItem[] {
  if (mode === 'independent') {
    return independentOnlyNavItems;
  }
  return [...commonNavItems, ...fleetOnlyNavItems, settingsNavItem];
}
```

Important detail: **fleet drivers already see "Ride offers" in their nav menu today** (it's in `commonNavItems`, which only fleet drivers get appended to — independent drivers get `independentOnlyNavItems` instead, which doesn't list it explicitly but they reach it via `passenger-rides` being their actual home). This nav item is currently a trap — see §3.1.

### 1.4 Legacy dashboard — manual "Start Trip" flow
[`apps/driver/src/components/legacy/DriverDashboard.tsx`](../../apps/driver/src/components/legacy/DriverDashboard.tsx):

- Early-returns `<DriverMintHome />` when `isIndependentDriver` (line ~479-481) — so this file is already a hybrid; it's the fleet-mode implementation in practice.
- `handleAction('start_trip')` (line ~277-279) opens `ManualTripForm`.
- `TripTimer` component (rendered at line ~515) lets a driver time a trip live, then hands off to `TripFareDialog` → `handleTripComplete` → `handleManualTripSubmit` → `createManualTrip` → `api.saveTrips([trip])`.
- This manual flow is **completely independent of the Roam dispatch/rides system** — it writes to the legacy trips table via `api.saveTrips`, not `rides.ride_requests`. This is exactly the mechanism your driver Kenny uses today to log a trip by tapping "Start Trip."
- **This flow is not going away** — it needs to be preserved and re-exposed inside the new UI, not deleted. It's how fleet drivers will keep logging trips that don't come through roam-s.co (walk-ups, phone bookings, Uber/InDrive trips they also log here for fleet accounting).

### 1.5 New mint UI — independent drivers today
- [`apps/driver/src/components/home/DriverMintHome.tsx`](../../apps/driver/src/components/home/DriverMintHome.tsx) — calls `useRideDispatchContext()` directly (requires `RideDispatchProvider` ancestor), derives `tripFlowActive` from `activeRide.status`, renders `DriverHomeDashboard`.
- Independent drivers get the full ride-dispatch overlay stack (trip request, en route, on trip, cash settlement, digital trip complete, arrived pickup) because `DriverShell` wraps them in `RideDispatchProvider` (see §1.2).
- **There is currently no manual "Start Trip" / manual trip entry anywhere in the independent/mint UI.** That's fine for pure independent drivers today, but it means if fleet drivers move onto this UI as-is, they lose manual trip logging entirely unless it's explicitly added back (this doc's plan does that — see §4.3).

---

## 2. Dispatch eligibility gate (server-side, separate from UI)

This is a **second, independent gate** from the UI split above, and it's the one that actually stops fleet drivers from receiving roam-s.co bookings today.

### 2.1 The flag
`rides.dispatch_settings.independent_only_matching` — boolean, default `true`. Added in [`supabase/migrations/20260524100000_rides_independent_only_matching.sql`](../../supabase/migrations/20260524100000_rides_independent_only_matching.sql):

```sql
ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS independent_only_matching BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN rides.dispatch_settings.independent_only_matching IS
  'When true, only independent drivers receive offers and can go online for Roam passenger dispatch.';
```

**This is a single global boolean on what looks like a singleton settings row — not per-driver, not per-fleet.** Flipping it affects every fleet driver on the platform simultaneously. There is no scoping mechanism today to roll it out to just one driver (e.g. Kenny) while keeping it off for other fleet drivers, if you have any.

### 2.2 Where it's enforced
[`supabase/functions/_shared/driverModeFilter.ts`](../../supabase/functions/_shared/driverModeFilter.ts):

```ts
export async function isDriverEligibleForDispatch(
  userId: string,
  dispatchSettings: Pick<DispatchSettings, "independent_only_matching">,
): Promise<{ eligible: boolean; reason?: string }> {
  const db = publicDb();
  const { data, error } = await db
    .from("driver_profiles")
    .select("user_id, mode, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { eligible: false, reason: "profile_lookup_failed" };
  if (!data) return { eligible: false, reason: "no_driver_profile" };
  if (data.status !== "active") return { eligible: false, reason: "driver_not_active" };
  if (dispatchSettings.independent_only_matching && data.mode !== "independent") {
    return { eligible: false, reason: "fleet_not_eligible_for_dispatch" };
  }
  return { eligible: true };
}
```

Also gates the driver pool for matching in `getEligibleDriverUserIds` (same file) — when the flag is on, fleet drivers are filtered out of the candidate pool entirely, so they'd never even be offered a ride.

Called from [`supabase/functions/rides/index.ts:2183-2189`](../../supabase/functions/rides/index.ts#L2183-L2189) in the presence/go-online endpoint:

```ts
const goingOnline = Boolean(body.available_for_rides ?? true);
if (goingOnline) {
  const eligibility = await isDriverEligibleForDispatch(auth.user.id, dispatchSettings);
  if (!eligibility.eligible) {
    return c.json({ error: eligibility.reason ?? "not_eligible_for_dispatch" }, 403);
  }
}
```

### 2.3 Where the error surfaces client-side
[`apps/driver/src/hooks/useRideDispatch.ts`](../../apps/driver/src/hooks/useRideDispatch.ts), inside `postPresenceFromCoords` (the function that fires when a driver tries to go online):

```ts
if (message.includes('fleet_not_eligible')) {
  toast.error('Fleet drivers cannot go online for Roam dispatch during beta.');
} else if (message.includes('driver_not_active')) {
  toast.error('Your driver account is not active yet. Contact support.');
} else if (message.includes('no_driver_profile')) {
  toast.error('No driver profile found for this login.');
} else if (fatal) {
  toast.error(display);
}
```

`isFatalPresenceError` (top of the same file) treats `fleet_not_eligible`, `driver_not_active`, `no_driver_profile`, and `not_eligible_for_dispatch` as fatal — meaning `setOnline(false)` fires immediately, no retry.

### 2.4 The admin control panel toggle already exists
[`apps/admin/src/components/admin/matching-brain/sections/DriverRolloutSection.tsx`](../../apps/admin/src/components/admin/matching-brain/sections/DriverRolloutSection.tsx):

```tsx
<SettingLabel
  variant="inline"
  label="Independent drivers only"
  tooltip={TOOLTIPS.independent_only_matching}
/>
<Badge variant="secondary" className="text-xs">Beta</Badge>
...
<p className="text-xs text-slate-500">
  When on, only independent drivers receive offers. Fleet drivers use legacy START TRIP flow.
</p>
<Switch
  checked={formData.independent_only_matching}
  onCheckedChange={(checked) => updateField('independent_only_matching', checked)}
/>
```

This is a real, wired-up toggle in Control Panel → Matching Brain. **Flipping this switch off is the literal action that opens roam-s.co dispatch to fleet drivers.** No new backend work is required to make that connection — it already exists.

---

## 3. Gaps found (must be addressed, not just the flag flip)

### 3.1 Live bug: "Ride offers" nav item crashes for fleet drivers today
Fleet drivers already see a **"Ride offers"** nav item (it's in `commonNavItems` in `navigation.ts`, appended for all non-independent modes). If a fleet driver taps it right now:

1. `DriverShell.renderPage()` hits `case 'passenger-rides': return <RideDispatchPage ... />` — this case is **not** gated by `isFleetDriver`/`isIndependentDriver`, so it renders unconditionally.
2. [`RideDispatchPage.tsx`](../../apps/driver/src/components/rides/RideDispatchPage.tsx) calls `useRideDispatchContext()` (line 4, 28).
3. [`RideDispatchContext.tsx`](../../apps/driver/src/contexts/RideDispatchContext.tsx) throws if there's no provider ancestor:
   ```tsx
   export function useRideDispatchContext(): RideDispatchValue {
     const ctx = useContext(RideDispatchContext);
     if (!ctx) {
       throw new Error('useRideDispatchContext must be used within RideDispatchProvider');
     }
     return ctx;
   }
   ```
4. Because `DriverShell` only wraps `isIndependentDriver` drivers in `<RideDispatchProvider>` (§1.2), a fleet driver hits this throw — an uncaught render error.

This directly contradicts [`docs/passenger-rides/RIDES_SPEC.md:326`](RIDES_SPEC.md#L326): *"Fleet drivers (beta): home `TripTimer` unchanged; **Ride offers** nav remains available as fallback."* That fallback is currently broken. **This needs to be fixed regardless of the migration timeline**, since fleet drivers can hit it today.

**Fix:** wrap all drivers in `RideDispatchProvider`/`DispatchConfigProvider`, not just independent ones (this is also required for the migration itself, so it's not extra work — see §4.4).

### 3.2 Conflated `mode` semantics will delete fleet back-office features if migrated naively
The spec's own suggested Phase 3 step 2 says:

> In `apps/driver/src/components/legacy/DriverDashboard.tsx`, render `RideDispatchHome` for all drivers (remove `isIndependentDriver` branch).

Taken literally, "remove the branch" would also remove access to:
- Equipment tracking (`canAccessEquipment`)
- Fuel card (`canAccessFuelCard`)
- Reimbursements (`canAccessReimbursements`)
- **Weekly check-in** (`canAccessWeeklyCheckin`) — this is **forced/blocking** in `DriverShell` (`checkInForced = isFleetDriver && needsCheckIn`), which strongly suggests it's a compliance requirement (likely odometer/insurance verification), not a nice-to-have.
- Claims, fuel stats, performance pages.

None of these are about *how a driver gets bookings* — they're about the fact that the vehicle is fleet-owned/managed. **Do not let "adopt the new booking UI" and "lose fleet back-office tooling" happen together.** The fix is to decouple: keep `mode` purely for back-office permission gating, and stop using it to choose the home/booking UI at all (see §4.2).

### 3.3 No payout/ledger attribution for fleet vehicles on Roam-sourced (roam-s.co) rides
Searched `supabase/functions/rides/index.ts` for any `fleet_id`, `organization_id`, or mode-aware payout branching — **none exists**. Every completed ride in `rides.ride_requests` pays out identically regardless of the driver's `mode`: straight to the driver (cash settlement via `DriverCashSettlementOverlay`/`submitCashSettlement`, or digital via `DriverDigitalTripCompleteOverlay`).

Compare this to the **legacy manual trip flow**, which explicitly routes through the fleet's financial system — e.g. in `legacy/DriverDashboard.tsx`'s `handleFuelSubmit`:
```ts
if (method === 'reimbursement') {
    paymentSource = 'RideShare_Cash';
} ...
await settlementService.processFuelSettlement(savedEntry, scenarios);
```
and the wider `business-finance`/expense-hub system you're actively building out (`apps/fleet/src/components/business-finance/*`, `expense-hub/*`) tracks cash liability and settlement per vehicle/fleet.

**Open question you need to answer before flipping the dispatch flag:** when Kenny (a fleet driver, fleet-owned vehicle) completes a roam-s.co-sourced ride, does that revenue need to:
- (a) flow into the fleet's existing ledger/liability system the same way a manually-logged trip does, or
- (b) pay out directly to Kenny personally, same as an independent driver, with the fleet getting nothing automatically?

Right now the code only supports (b), silently, because no fleet-aware branching exists in the rides payment path. If the business model requires (a), that's new backend work — a fleet revenue-share/attribution step needs to be designed and built into the ride-completion path (`advance()`/`submitCashSettlement()` in `useRideDispatch.ts`, and the corresponding edge function in `rides/index.ts`) before opening dispatch to fleet drivers. This is a product decision first, engineering task second.

### 3.4 Global flag = all-or-nothing rollout
Because `independent_only_matching` is a single boolean on one settings row (§2.1), there is no way today to roll this out to one driver at a time. If you want to test with just Kenny before opening it to any other fleet drivers you might onboard later, you have two options:
1. Add a narrower gate — e.g. a per-driver allowlist column on `driver_profiles`, or a per-fleet override on the `organizations` row referenced by `fleet_id` — checked in `isDriverEligibleForDispatch` before falling back to the global flag.
2. Or, as a zero-code stopgap: temporarily set Kenny's `driver_profiles.mode` to `'independent'` to test the dispatch path end-to-end, accepting that he'll also pick up the independent-only back-office permissions in the interim (loses fleet-only equipment/fuel-card/checkin access unless you also patch those permissions to check something other than `mode`). This is a real shortcut but muddies the data model — treat it as throwaway testing, not a real rollout mechanism.

---

## 4. Recommended implementation plan

### 4.1 Decide the payout/ledger question first (§3.3)
Before writing any code, decide whether fleet-owned vehicles' Roam-sourced trip revenue needs to reconcile against the fleet financial system, or whether it's fine for it to pay out directly to the driver like an independent driver's earnings. This determines whether step 4.6 below is required.

### 4.2 Decouple `mode` from "which home UI renders"
- Stop branching `dashboard`/`earnings`/`trips`/`profile` on `isFleetDriver`/`isIndependentDriver` in `DriverShell.renderPage()`. Always render the mint-UI components (`DriverMintHome`, `IndependentEarningsPage`, `IndependentTripsPage`, `IndependentProfilePage`) for everyone.
- Keep the back-office nav items (`equipment`, `fuel`, `performance`, `fuel-stats`, `claims`, `checkin`, weekly check-in modal) gated on `mode === 'fleet'`, untouched. These stay exactly as they are — only the *booking* UI changes.
- In `navigation.ts`, merge the nav item lists so fleet drivers get the same home/earnings/trips/profile items independent drivers get, **plus** their existing fleet-only back-office items. Independent drivers' nav shouldn't change.

### 4.3 Add a manual "Start Trip" entry point to the new mint UI
- Reuse `ManualTripForm`, `TripFareDialog`, and (if you want live timing, not just after-the-fact entry) `TripTimer` — all already exist and are UI-framework-agnostic (they don't depend on legacy-only context).
- Surface this as a button/card on `DriverHomeDashboard` (rendered inside `DriverMintHome`), visible when `isFleetDriver` (or make it available to everyone — doesn't hurt independent drivers to have a manual-entry fallback too, your call).
- This satisfies your original ask directly: Kenny keeps a "Start Trip" button for trips that don't come through roam-s.co, while also being able to go online for roam-s.co bookings via the same screen.
- Wire it to the same `createManualTrip`/`api.saveTrips` path the legacy dashboard already uses — no backend changes needed here, this part is pure UI relocation.

### 4.4 Fix the `RideDispatchProvider` gap (§3.1)
- In `DriverShell.tsx`, remove the `isIndependentDriver` conditional around `DispatchConfigProvider`/`RideDispatchProvider`/the six overlay components — wrap **all** drivers.
- This alone fixes the existing crash-on-tap bug for fleet drivers hitting "Ride offers" today, independent of anything else in this plan.
- Double check `useRideDispatch.ts`'s `goOnline()`/`postPresenceFromCoords()` — once fleet drivers can actually reach this code path, they'll hit the `fleet_not_eligible_for_dispatch` toast until §4.5 is done. That's expected and fine as an intermediate state.

### 4.5 Flip the dispatch eligibility flag
- Once 4.2–4.4 are shipped and tested, flip `independent_only_matching` to `false` in Control Panel → Matching Brain → Driver Rollout.
- Per §3.4, this is global. If you want a staged rollout (Kenny first), build the narrower gate described in §3.4 option 1 before flipping the global flag, rather than flipping it platform-wide on day one.

### 4.6 (Conditional on §4.1) Build fleet revenue attribution for Roam-sourced rides
Only needed if you decided fleet-owned-vehicle trips must reconcile through the fleet ledger. Scope:
- Add fleet/organization attribution to the ride completion path in `rides/index.ts` (likely: when a ride completes, if the driver's `mode === 'fleet'`, write a corresponding ledger entry against `fleet_id` the way `settlementService.processFuelSettlement` does for fuel).
- Decide cash vs. digital handling separately — cash settlement already flows through `submitCashSettlement`/`ridesDriverCashSettlement`; digital completion flows through `advance()` → `status: 'completed'` → `DriverDigitalTripCompleteOverlay`. Both would need the same fleet-attribution hook.

### 4.7 Retire the legacy UI
Once fleet drivers are confirmed working end-to-end on the new home + manual Start Trip button + live dispatch for a reasonable soak period, delete `apps/driver/src/components/legacy/*` and the now-dead `isFleetDriver`/`isIndependentDriver` UI branches (keep the `mode`-based *permission* checks — those stay).

---

## 5. Summary checklist

- [ ] Decide fleet payout/ledger attribution question (§3.3, §4.1)
- [ ] Decouple `mode` from home-UI selection in `DriverShell.tsx` (§4.2)
- [ ] Merge nav items so fleet drivers keep back-office access on the new UI (§4.2)
- [ ] Add manual "Start Trip" button to `DriverHomeDashboard` using existing `ManualTripForm`/`TripFareDialog`/`TripTimer` (§4.3)
- [ ] Wrap all drivers in `RideDispatchProvider`/overlays, not just independent (§4.4) — **also fixes a live crash bug, do this regardless of timeline**
- [ ] Decide on staged vs. global rollout; build per-driver/per-fleet gate if staged (§3.4)
- [ ] Flip `rides.dispatch_settings.independent_only_matching` off (§4.5)
- [ ] If required by §4.1: build fleet revenue attribution into ride completion (§4.6)
- [ ] Soak test with Kenny, then delete `apps/driver/src/components/legacy/*` (§4.7)

## 6. Key files referenced

| File | Role |
|---|---|
| `apps/driver/src/contexts/DriverContext.tsx` | `mode` field, permissions object |
| `apps/driver/src/components/layout/DriverShell.tsx` | Page routing, provider wrapping, weekly check-in gate |
| `apps/driver/src/config/navigation.ts` | Nav item lists per mode |
| `apps/driver/src/components/legacy/DriverDashboard.tsx` | Legacy home, manual Start Trip flow, fuel/service/claim forms |
| `apps/driver/src/components/home/DriverMintHome.tsx` | New mint home, requires `RideDispatchProvider` |
| `apps/driver/src/contexts/RideDispatchContext.tsx` | Context that throws without a provider ancestor |
| `apps/driver/src/hooks/useRideDispatch.ts` | Go-online, offer accept/decline, trip state transitions, cash settlement |
| `apps/driver/src/components/rides/RideDispatchPage.tsx` | "Ride offers" page, consumes `useRideDispatchContext` |
| `supabase/functions/_shared/driverModeFilter.ts` | Server-side dispatch eligibility check |
| `supabase/functions/rides/index.ts` | Rides edge function, presence/go-online endpoint (~line 2183) |
| `supabase/functions/rides/fare/dispatchSettings.ts` | `DispatchSettings` type, defaults |
| `supabase/migrations/20260524100000_rides_independent_only_matching.sql` | Adds the gating column |
| `apps/admin/src/components/admin/matching-brain/sections/DriverRolloutSection.tsx` | Control Panel toggle UI |
| `docs/passenger-rides/RIDES_SPEC.md` (§10, "Phase 3") | Original (incomplete) rollout plan this doc supersedes/expands |
