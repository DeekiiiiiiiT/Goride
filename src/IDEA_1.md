# IDEA 1: Consumption Reconciliation Architecture Consolidation

## Executive Summary

There are **two parallel systems** that match trips to odometer gaps, but they were built independently and have drifted apart in 7 critical ways. This plan consolidates them into one canonical engine so every view in the app shows the same numbers.

### The Two Systems

| | System A: "Unified Timeline" | System B: "Stop-to-Stop Reconciliation" |
|---|---|---|
| **UI Location** | Vehicle Detail > Odometer > Unified Timeline tab | Fuel Management > Reconciliation > History icon sidebar |
| **UI Files** | `MasterLogTimeline.tsx`, `TripManifestSheet.tsx` | `BucketReconciliationView.tsx` |
| **Calc Engine** | `mileageCalculationService.ts` + inline in MasterLogTimeline | `fuelCalculationService.ts` > `calculateOdometerBuckets()` |
| **Anchor Source** | ALL sources (fuel, check-ins, service, manual) via `odometerService.getUnifiedHistory()` | Fuel entries only (entries with odometer readings) |
| **Trip Distance** | `trip.distance \|\| 0` (On Trip only) | `getTotalTripRideshareKm(t)` (On Trip + Enroute + Open + Unavailable) |
| **Trip Filter** | No explicit status filter | No explicit status filter |
| **Trip Matching** | `anchorPeriodId` tag, date range fallback | `startOdometer`/`endOdometer`, date range fallback |
| **Attribution** | 2-way: Business vs Personal | 3-way: RideShare + Personal + Company Misc + Unaccounted |
| **Efficiency** | N/A (no fuel calc) | `vehicle.fuelSettings?.efficiencyCity \|\| 10` (raw, no fallback chain) |

### The 7 Issues

1. **Different Anchor Sources** -- Stop-to-Stop misses check-in/service/manual anchors, creating coarser buckets
2. **Different Distance Calculations** -- Unified Timeline undercounts by ignoring Enroute/Open/Unavailable km
3. **Different Trip Matching** -- Odometer-based vs tag-based matching can produce different trip sets
4. **No Consistent Trip Status Filter** -- Neither system explicitly filters to Completed + Cancelled
5. **Different Gap Definitions** -- "Personal" in Timeline vs "Unaccounted/Leakage" in Stop-to-Stop
6. **Different Efficiency Baselines** -- Stop-to-Stop doesn't use the Phase 3 observed efficiency chain
7. **Redundant Computation** -- Buckets computed twice (once in `calculateReconciliation` for health, once in sidebar)

---

## Phase 1: Standardize Trip Distance in `mileageCalculationService`

**Goal:** Make `mileageCalculationService.ts` use `getTotalTripRideshareKm()` instead of `trip.distance || 0`, so the Unified Timeline and Trip Manifest use the same corrected distance as Stop-to-Stop.

**Risk:** Low -- additive import + one line change per function
**Files Changed:** `/services/mileageCalculationService.ts`
**Files NOT Changed:** Everything else (UI components, types, fuelCalculationService)

### Step 1.1: Add import for FuelCalculationService

**File:** `/services/mileageCalculationService.ts`
**Location:** Line 1 (imports section)

**Current:**
```ts
import { api } from './api';
import { odometerService } from './odometerService';
import { OdometerReading, MileageReport } from '../types/vehicle';
import { Trip } from '../types/data';
```

**Add after line 4:**
```ts
import { FuelCalculationService } from './fuelCalculationService';
```

**Why:** We need access to `getTotalTripRideshareKm()` which lives on `FuelCalculationService`.

**Risk check:** Circular dependency? `fuelCalculationService.ts` does NOT import from `mileageCalculationService.ts`, so no circular dependency.

### Step 1.2: Update `calculatePeriodMileage()` distance calculation

**File:** `/services/mileageCalculationService.ts`
**Location:** Line 55

**Current (line 55):**
```ts
const platformDistance = periodTrips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
```

**Change to:**
```ts
const platformDistance = periodTrips.reduce((sum, trip) => sum + FuelCalculationService.getTotalTripRideshareKm(trip), 0);
```

**What this does:** Instead of only counting On Trip distance, it now sums On Trip + Enroute + Open + Unavailable for each trip. This matches what `calculateOdometerBuckets()` does (line 348 of fuelCalculationService.ts).

**Impact analysis:**
- `personalDistance` (line 58) = `totalDistance - platformDistance` -- with more km attributed to platform, personal shrinks. This is correct: those km were rideshare activity, not personal.
- `personalPercentage` (line 59) -- automatically corrected.
- `anomalyDetected` check (line 68) -- `totalDistance - platformDistance < -1` -- with more platform distance, it's slightly more likely to trigger if platform exceeds odometer. This is a VALID anomaly flag (GPS over-reporting vs odometer).
- `MileageReport.platformDistance` -- downstream consumers (MasterLogTimeline, TripManifestSheet) read this. They'll now show the corrected value.

### Step 1.3: Verify no other `trip.distance` usages in this file

Confirm there are no other places in `mileageCalculationService.ts` that sum trip distances. The file has:
- `calculatePeriodMileage()` -- fixed in Step 1.2
- `getTripsForPeriod()` -- returns raw trips, doesn't sum distances (OK)
- `generateFullHistoryReport()` -- calls `calculatePeriodMileage()`, so inherits the fix (OK)

### Acceptance Criteria

- [ ] `FuelCalculationService` imported at top of file
- [ ] `calculatePeriodMileage()` uses `getTotalTripRideshareKm()` for `platformDistance`
- [ ] No circular dependency introduced
- [ ] File compiles without errors
- [ ] `generateFullHistoryReport()` inherits the corrected distance (no additional changes needed)

---

## Phase 2: Standardize Trip Distance in `MasterLogTimeline`

**Goal:** The MasterLogTimeline has its own inline distance calculation (line 165) that duplicates `mileageCalculationService` logic. Fix it to use `getTotalTripRideshareKm()`.

**Risk:** Low -- one line change
**Files Changed:** `/components/vehicles/odometer/MasterLogTimeline.tsx`
**Files NOT Changed:** Everything else

### Step 2.1: Add import for FuelCalculationService

**File:** `/components/vehicles/odometer/MasterLogTimeline.tsx`
**Location:** Imports section (after line 62, near other service imports)

**Current imports (lines 60-62):**
```ts
import { odometerService } from '../../../services/odometerService';
import { mileageCalculationService } from '../../../services/mileageCalculationService';
import { api } from '../../../services/api';
```

**Add after line 62:**
```ts
import { FuelCalculationService } from '../../../services/fuelCalculationService';
```

### Step 2.2: Update the inline `platformDistance` calculation

**File:** `/components/vehicles/odometer/MasterLogTimeline.tsx`
**Location:** Line 165 (inside `fetchTimelineData`, the `for` loop that builds reports)

**Current (line 165):**
```ts
const platformDistance = periodTrips.reduce((sum: number, trip: Trip) => sum + (trip.distance || 0), 0);
```

**Change to:**
```ts
const platformDistance = periodTrips.reduce((sum: number, trip: Trip) => sum + FuelCalculationService.getTotalTripRideshareKm(trip), 0);
```

**Why inline and not using mileageCalculationService?** MasterLogTimeline intentionally does NOT call `mileageCalculationService.calculatePeriodMileage()` because of the Phase 8 optimization: it batch-fetches all trips once (line 139-143) and filters locally, instead of making N separate API calls. So the distance calculation is inline by design. We just need to fix the formula.

### Step 2.3: Verify the report object structure

The inline code builds a `MileageReport`-shaped object (lines 180-193) with:
- `totalDistance` -- from odometer span (unchanged, correct)
- `platformDistance` -- now fixed to use full rideshare km
- `personalDistance` -- `totalDistance - platformDistance` (auto-corrected)
- `personalPercentage` -- auto-corrected
- `anomalyDetected` -- auto-corrected (same reasoning as Phase 1, Step 1.2)
- `tripCount` -- count of trips (unchanged)

No additional changes needed to the report structure.

### Step 2.4: Verify downstream UI consumers

The `reports` state feeds into the timeline rendering. Specifically:
- Line 551: `report.totalDistance` -- unchanged
- Line 555: `report.platformDistance` -- now shows corrected full rideshare km
- Line 559: `report.totalDistance - report.platformDistance` -- gap shrinks (correct)
- Line 192: `report.tripCount` -- unchanged

The Trip Manifest sidebar (`TripManifestSheet`) does NOT read from `reports` state -- it makes its own API call via `mileageCalculationService.getTripsForPeriod()`. So it's handled separately in Phase 3.

### Acceptance Criteria

- [ ] `FuelCalculationService` imported
- [ ] `platformDistance` calculation uses `getTotalTripRideshareKm()`
- [ ] File compiles without errors
- [ ] Timeline gap cards show corrected distances
- [ ] No changes to TripManifestSheet (handled in Phase 3)

---

## Phase 3: Standardize Trip Distance in `TripManifestSheet`

**Goal:** The Trip Manifest sidebar (the "View Trip Manifest" sheet from the Unified Timeline) calculates `platformDistance` locally using `trip.distance || 0`. Fix it.

**Risk:** Low -- one line change
**Files Changed:** `/components/vehicles/odometer/TripManifestSheet.tsx`
**Files NOT Changed:** Everything else

### Step 3.1: Add import for FuelCalculationService

**File:** `/components/vehicles/odometer/TripManifestSheet.tsx`
**Location:** Imports section (after line 16, near other service imports)

**Current imports (line 16):**
```ts
import { mileageCalculationService } from '../../../services/mileageCalculationService';
```

**Add after line 16:**
```ts
import { FuelCalculationService } from '../../../services/fuelCalculationService';
```

### Step 3.2: Update the `platformDistance` calculation

**File:** `/components/vehicles/odometer/TripManifestSheet.tsx`
**Location:** Line 79

**Current (line 79):**
```ts
const platformDistance = trips.reduce((acc, trip) => acc + (trip.distance || 0), 0);
```

**Change to:**
```ts
const platformDistance = trips.reduce((acc, trip) => acc + FuelCalculationService.getTotalTripRideshareKm(trip), 0);
```

### Step 3.3: Verify downstream UI impact

The `platformDistance` variable feeds into:
- Line 80: `personalDistance = totalDistance - platformDistance` -- auto-corrected
- Line 81: `coveragePercent = platformDistance / totalDistance * 100` -- auto-corrected
- Line 149: Displayed as "Business: XX.X km" -- now shows full rideshare km
- Line 158: "Unverified / Personal: XX.X km" -- now smaller (correct)
- Line 162: Percentage display -- auto-corrected

### Step 3.4: Note on individual trip row display

Line 199 in TripManifestSheet displays each trip's distance as:
```ts
{(trip.distance || 0).toFixed(1)} km
```

This shows only the On Trip distance per row. Should we change it to show `getTotalTripRideshareKm(trip)`?

**Decision: NO, leave it.** The individual trip row should show On Trip distance because that's the trip-specific value. The total at the top already accounts for all segments. If we showed the full distance per row, the sum wouldn't match the total because enroute/open/unavailable are normalized across trips, not per-trip values.

### Acceptance Criteria

- [ ] `FuelCalculationService` imported
- [ ] `platformDistance` uses `getTotalTripRideshareKm()`
- [ ] Individual trip rows still show `trip.distance` (unchanged)
- [ ] File compiles without errors
- [ ] Business/Personal km totals at top of sheet show corrected values

---

## Phase 4: Standardize Trip Status Filter Everywhere

**Goal:** Ensure all trip-to-bucket matching uses `Completed + Cancelled` filter consistently. Currently `calculateReconciliation()` is the only place that filters correctly.

**Risk:** Low -- adding filters to existing queries
**Files Changed:** `/services/fuelCalculationService.ts` (calculateOdometerBuckets), `/components/vehicles/odometer/MasterLogTimeline.tsx`, `/services/mileageCalculationService.ts`

### Step 4.1: Add status filter to `calculateOdometerBuckets()`

**File:** `/services/fuelCalculationService.ts`
**Location:** Lines 332-340 (the `bucketTrips` filter inside the for loop)

**Current (lines 332-340):**
```ts
const bucketTrips = trips.filter(t => {
    const tripStart = t.startOdometer || 0;
    const tripEnd = t.endOdometer || 0;
    // If trip has odometers, use them. If not, use date range as fallback
    if (t.startOdometer && t.endOdometer) {
        return t.vehicleId === vehicle.id && tripStart >= startOdo && tripEnd <= endOdo;
    }
    return t.vehicleId === vehicle.id && t.date >= startAnchor.date && t.date <= endAnchor.date;
});
```

**Change to:**
```ts
const bucketTrips = trips.filter(t => {
    // Only include Completed and Cancelled trips (Processing trips are unverified)
    if (t.status !== 'Completed' && t.status !== 'Cancelled') return false;
    
    const tripStart = t.startOdometer || 0;
    const tripEnd = t.endOdometer || 0;
    // If trip has odometers, use them. If not, use date range as fallback
    if (t.startOdometer && t.endOdometer) {
        return t.vehicleId === vehicle.id && tripStart >= startOdo && tripEnd <= endOdo;
    }
    return t.vehicleId === vehicle.id && t.date >= startAnchor.date && t.date <= endAnchor.date;
});
```

**Why:** Processing trips are incomplete/unverified data. They shouldn't count toward distance attribution. `calculateReconciliation()` already does this (line 133).

**Impact:** If any `Processing` trips were previously included, they'll now be excluded. This could slightly increase the unaccounted distance for those buckets. This is correct behavior -- we shouldn't attribute distance from unverified data.

### Step 4.2: Add status filter to `MasterLogTimeline` inline trip filter

**File:** `/components/vehicles/odometer/MasterLogTimeline.tsx`
**Location:** Lines 155-162 (inside `fetchTimelineData`)

**Current (lines 155-162):**
```ts
const periodTrips = allTrips.filter((t: Trip) => {
    const tTime = new Date(t.date).getTime();
    // Prioritize anchorPeriodId tag if available (from Phase 6 logic)
    if (t.metadata?.anchorPeriodId) {
        return t.metadata.anchorPeriodId === start.id;
    }
    return tTime >= startTime && tTime <= endTime;
});
```

**Change to:**
```ts
const periodTrips = allTrips.filter((t: Trip) => {
    // Only include Completed and Cancelled trips (Processing trips are unverified)
    if (t.status !== 'Completed' && t.status !== 'Cancelled') return false;
    
    const tTime = new Date(t.date).getTime();
    // Prioritize anchorPeriodId tag if available (from Phase 6 logic)
    if (t.metadata?.anchorPeriodId) {
        return t.metadata.anchorPeriodId === start.id;
    }
    return tTime >= startTime && tTime <= endTime;
});
```

### Step 4.3: Add status filter to `mileageCalculationService.getTripsForPeriod()`

**File:** `/services/mileageCalculationService.ts`
**Location:** After line 21 (after `periodTrips = response.data`)

This one is trickier because the trips come from an API call that may or may not filter by status server-side. To be safe, we add a client-side filter after fetching.

**Current pattern (simplified):**
```ts
const response = await api.getTripsFiltered({ vehicleId, anchorPeriodId: startAnchor.id, limit: 1000 });
periodTrips = response.data;
```

**Change to add post-fetch filter at the end of the function (before the return on line 43):**

**Current (line 43):**
```ts
return periodTrips;
```

**Change to:**
```ts
// Ensure only Completed and Cancelled trips are included
return periodTrips.filter(t => t.status === 'Completed' || t.status === 'Cancelled');
```

**Why at the end?** There are 3 code paths that set `periodTrips` (tag search, date fallback, and catch-all fallback). By filtering at the single return point, we cover all paths with one line.

### Acceptance Criteria

- [ ] `calculateOdometerBuckets()` bucket trip filter includes status check
- [ ] `MasterLogTimeline` inline filter includes status check
- [ ] `mileageCalculationService.getTripsForPeriod()` returns only Completed + Cancelled
- [ ] All 3 files compile without errors
- [ ] Processing trips are excluded from distance attribution everywhere

---

## Phase 5: Upgrade `calculateOdometerBuckets()` to Accept Unified Anchors

**Goal:** Currently `calculateOdometerBuckets()` uses only fuel entries with odometer readings as anchors. Upgrade it to accept the full unified history (fuel + check-ins + service + manual readings) so it produces the same fine-grained buckets as the Unified Timeline.

**Risk:** Medium -- changes the function signature and anchor source, which affects bucket granularity
**Files Changed:** `/services/fuelCalculationService.ts`, `/components/fuel/BucketReconciliationView.tsx`, `/pages/FuelManagement.tsx`

### Step 5.1: Define a minimal Anchor type

We need `calculateOdometerBuckets()` to accept either fuel entries (current) or unified odometer entries (new). The minimal fields needed from an anchor are:

- `id: string`
- `date: string`
- `odometer: number` (or `value: number` for unified entries)

Rather than changing the function signature drastically, we'll add an **optional** `anchors` parameter. If provided, it replaces the internal fuel-entry-based anchor extraction.

**File:** `/services/fuelCalculationService.ts`
**Location:** Lines 288-293 (function signature)

**Current:**
```ts
calculateOdometerBuckets: (
    vehicle: Vehicle,
    fuelEntries: FuelEntry[],
    trips: Trip[],
    adjustments: MileageAdjustment[] = []
): OdometerBucket[] => {
```

**Change to:**
```ts
calculateOdometerBuckets: (
    vehicle: Vehicle,
    fuelEntries: FuelEntry[],
    trips: Trip[],
    adjustments: MileageAdjustment[] = [],
    externalAnchors?: { id: string; date: string; odometer: number }[]
): OdometerBucket[] => {
```

**Why optional?** Backward compatibility. Existing callers (calculateReconciliation line 208, BucketReconciliationView line 58) don't pass anchors, so they continue to work with the old fuel-entry-only behavior until we wire them up.

### Step 5.2: Use externalAnchors when provided

**File:** `/services/fuelCalculationService.ts`
**Location:** Lines 294-303 (anchor extraction logic)

**Current (lines 294-303):**
```ts
// 1. Separate entries into Anchors (Verified Odo) and Floating (Legacy/Cash)
const anchors = fuelEntries
    .filter(e => e.vehicleId === vehicle.id && e.odometer !== undefined && e.odometer !== null)
    .sort((a, b) => (a.odometer || 0) - (b.odometer || 0));

const floating = fuelEntries
    .filter(e => e.vehicleId === vehicle.id && (e.odometer === undefined || e.odometer === null));

if (anchors.length < 2) return [];
```

**Change to:**
```ts
// 1. Determine anchors: use external unified anchors if provided, otherwise extract from fuel entries
let anchors: { id: string; date: string; odometer: number }[];

if (externalAnchors && externalAnchors.length >= 2) {
    anchors = [...externalAnchors].sort((a, b) => a.odometer - b.odometer);
} else {
    anchors = fuelEntries
        .filter(e => e.vehicleId === vehicle.id && e.odometer !== undefined && e.odometer !== null)
        .map(e => ({ id: e.id, date: e.date, odometer: e.odometer! }))
        .sort((a, b) => a.odometer - b.odometer);
}

const floating = fuelEntries
    .filter(e => e.vehicleId === vehicle.id && (e.odometer === undefined || e.odometer === null));

if (anchors.length < 2) return [];
```

### Step 5.3: Update internal anchor references

The loop body (lines 308-403) references `startAnchor` and `endAnchor` as `FuelEntry` objects. After the change, they are `{ id, date, odometer }` objects. We need to update:

**Line 309-310 (current):**
```ts
const startAnchor = anchors[i];
const endAnchor = anchors[i + 1];
```
These remain the same but the type changes from FuelEntry to the minimal anchor type. All subsequent usages of `startAnchor` and `endAnchor` in the loop body are:

- `startAnchor.odometer || 0` -> becomes `startAnchor.odometer` (always defined now)
- `endAnchor.odometer || 0` -> becomes `endAnchor.odometer`
- `startAnchor.date` -> still works
- `endAnchor.date` -> still works
- `endAnchor.liters` (line 326) -> **PROBLEM**: unified anchors don't have liters
- `endAnchor.amount` (line 327) -> **PROBLEM**: unified anchors don't have amount
- `endAnchor.id` (line 329) -> still works

**Lines 326-327 need special handling.** When the closing anchor is a fuel entry, we want its liters and amount. When it's a non-fuel anchor (check-in, service), those fields don't exist.

**Fix:** Look up the closing anchor in `fuelEntries` by date proximity. If the anchor IS a fuel entry, use it. If not, the fuel data for the bucket comes entirely from floating receipts.

**Replace lines 324-329:**

**Current:**
```ts
// 3. Accumulate Volume & Cost
const totalLiters = (endAnchor.liters || 0) + windowReceipts.reduce((sum, r) => sum + (r.liters || 0), 0);
const totalCost = (endAnchor.amount || 0) + windowReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);

const associatedReceipts = [endAnchor.id, ...windowReceipts.map(r => r.id)];
```

**Change to:**
```ts
// 3. Accumulate Volume & Cost
// Check if the closing anchor corresponds to a fuel entry (it might be a check-in or service record)
const closingFuelEntry = fuelEntries.find(e => e.id === endAnchor.id || (e.odometer === endAnchor.odometer && e.date === endAnchor.date));
const closingLiters = closingFuelEntry?.liters || 0;
const closingCost = closingFuelEntry?.amount || 0;

// Also find any fuel entries that fall WITHIN the bucket window (between anchors, with odometer readings)
// These are fuel entries whose odometer is between startOdo and endOdo, excluding the anchors themselves
const midBucketFuelEntries = fuelEntries.filter(e =>
    e.vehicleId === vehicle.id &&
    e.odometer !== undefined && e.odometer !== null &&
    e.odometer > startOdo && e.odometer < endOdo &&
    e.id !== startAnchor.id && e.id !== endAnchor.id
);

const totalLiters = closingLiters 
    + windowReceipts.reduce((sum, r) => sum + (r.liters || 0), 0)
    + midBucketFuelEntries.reduce((sum, e) => sum + (e.liters || 0), 0);
const totalCost = closingCost 
    + windowReceipts.reduce((sum, r) => sum + (r.amount || 0), 0)
    + midBucketFuelEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

const associatedReceipts = [
    ...(closingFuelEntry ? [closingFuelEntry.id] : []),
    ...windowReceipts.map(r => r.id),
    ...midBucketFuelEntries.map(e => e.id)
];
```

**Why `midBucketFuelEntries`?** When unified anchors include check-ins or service records, a fuel entry with an odometer reading might fall BETWEEN two non-fuel anchors. Previously this wouldn't happen because every anchor WAS a fuel entry. Now we need to capture fuel entries that sit inside a bucket defined by non-fuel anchors.

### Step 5.4: Update the closingEntryId in the bucket output

**Current (implicit in the push, line 389):**
The bucket object uses `endAnchor.id` as the closingEntryId. With unified anchors, this should be the closing fuel entry if one exists.

**In the bucket push (around line 389), update:**
```ts
closingEntryId: closingFuelEntry?.id || endAnchor.id,
```

### Step 5.5: Verify no other FuelEntry-specific field accesses on anchors

Search the loop body for any other references to FuelEntry-specific fields on `startAnchor` or `endAnchor`:
- `startAnchor.liters` -- NOT used (only endAnchor's fuel is counted)
- `startAnchor.amount` -- NOT used
- `startAnchor.vehicleId` -- NOT used (we use `vehicle.id`)
- `endAnchor.vehicleId` -- NOT used

All clear. The only FuelEntry-specific accesses were `liters`, `amount`, and `id` (which is handled).

### Step 5.6: DO NOT wire up the externalAnchors parameter yet

This phase only changes the function signature and internal logic. The callers still use the default (no externalAnchors). Wiring up the callers to pass unified anchors happens in Phase 6.

### Acceptance Criteria

- [ ] `calculateOdometerBuckets()` accepts optional `externalAnchors` parameter
- [ ] When `externalAnchors` is provided, they are used as the anchor set
- [ ] When `externalAnchors` is NOT provided, fuel-entry-only behavior is preserved (backward compat)
- [ ] Closing fuel entry is looked up properly for non-fuel anchors
- [ ] Mid-bucket fuel entries are captured for non-fuel-anchored buckets
- [ ] `closingEntryId` correctly references the fuel entry (if any) or the anchor ID
- [ ] File compiles without errors
- [ ] Existing callers (calculateReconciliation, BucketReconciliationView) are NOT changed yet

---

## Phase 6: Wire Up Unified Anchors to `BucketReconciliationView`

**Goal:** Make the Stop-to-Stop Reconciliation sidebar pass unified anchors (from `odometerService.getUnifiedHistory()`) to `calculateOdometerBuckets()`, so it produces the same fine-grained buckets as the Unified Timeline.

**Risk:** Medium -- changes the sidebar's data source, which changes the buckets displayed
**Files Changed:** `/components/fuel/BucketReconciliationView.tsx`
**Files NOT Changed:** `fuelCalculationService.ts` (already prepared in Phase 5), `FuelManagement.tsx` (props pass-through)

### Step 6.1: Add import for odometerService

**File:** `/components/fuel/BucketReconciliationView.tsx`
**Location:** Imports section (after line 34)

**Add:**
```ts
import { odometerService } from '../../services/odometerService';
```

### Step 6.2: Add state and effect to fetch unified anchors

**File:** `/components/fuel/BucketReconciliationView.tsx`
**Location:** Inside the component, after the `isPosting` state (line 55)

**Add:**
```ts
const [unifiedAnchors, setUnifiedAnchors] = React.useState<{ id: string; date: string; odometer: number }[] | null>(null);

React.useEffect(() => {
    const loadAnchors = async () => {
        try {
            const history = await odometerService.getUnifiedHistory(vehicle.id);
            // Filter to verified anchors only and map to minimal shape
            const anchors = history
                .filter(h => h.isVerified && h.isAnchorPoint)
                .map(h => ({ id: h.id, date: h.date, odometer: h.value }));
            setUnifiedAnchors(anchors);
        } catch (err) {
            console.error("Failed to load unified anchors for bucket view:", err);
            // Fall back to fuel-entry-only anchors (null means "use default")
            setUnifiedAnchors(null);
        }
    };
    loadAnchors();
}, [vehicle.id]);
```

### Step 6.3: Pass unified anchors to `calculateOdometerBuckets()`

**File:** `/components/fuel/BucketReconciliationView.tsx`
**Location:** Lines 57-63 (the `useMemo` that computes buckets)

**Current:**
```ts
const buckets = useMemo(() => {
    const rawBuckets = FuelCalculationService.calculateOdometerBuckets(
        vehicle,
        fuelEntries,
        trips,
        adjustments
    );
```

**Change to:**
```ts
const buckets = useMemo(() => {
    const rawBuckets = FuelCalculationService.calculateOdometerBuckets(
        vehicle,
        fuelEntries,
        trips,
        adjustments,
        unifiedAnchors || undefined
    );
```

**Also update the dependency array (line 77):**

**Current:**
```ts
}, [vehicle, fuelEntries, trips, adjustments, transactions]);
```

**Change to:**
```ts
}, [vehicle, fuelEntries, trips, adjustments, transactions, unifiedAnchors]);
```

### Step 6.4: Handle loading state

While `unifiedAnchors` is being fetched (initial `null` state before the effect fires), the buckets will compute using the default fuel-entry-only mode. Once anchors load, the memo will recompute. This is acceptable UX -- the sidebar shows data immediately and refines when unified anchors arrive.

Optionally, add a subtle loading indicator:
```ts
{unifiedAnchors === null && (
    <div className="text-xs text-blue-500 mb-2">Loading unified anchor data...</div>
)}
```

### Step 6.5: Update the "Efficiency Profile" card to indicate anchor source

**File:** `/components/fuel/BucketReconciliationView.tsx`
**Location:** Line 143 (the description text in the Efficiency Profile card)

**Current:**
```ts
<p className="text-xs text-slate-500 mt-1">Based on vehicle configuration</p>
```

**Change to:**
```ts
<p className="text-xs text-slate-500 mt-1">
    {unifiedAnchors ? `${unifiedAnchors.length} unified anchors` : 'Fuel entries only'}
</p>
```

### Step 6.6: Update the "Total Distance" card to show anchor count correctly

**File:** `/components/fuel/BucketReconciliationView.tsx`
**Location:** Line 156

**Current:**
```ts
<p className="text-xs text-slate-500 mt-1">Spanning {buckets.length} fuel stops</p>
```

**Change to:**
```ts
<p className="text-xs text-slate-500 mt-1">Spanning {buckets.length + 1} anchor points</p>
```

**Why +1?** N buckets are formed from N+1 anchors (each bucket spans two consecutive anchors).

### Acceptance Criteria

- [ ] `odometerService` imported
- [ ] Unified anchors fetched on mount, filtered to verified + anchor points
- [ ] `calculateOdometerBuckets()` called with unified anchors when available
- [ ] Memo dependency array updated to include `unifiedAnchors`
- [ ] Graceful fallback to fuel-entry-only mode if fetch fails
- [ ] Summary cards updated to reflect unified anchor source
- [ ] File compiles without errors

---

## Phase 7: Unify Efficiency Calculation in `calculateOdometerBuckets()`

**Goal:** The Stop-to-Stop sidebar's "Expected Fuel" and "Variance" columns use `vehicle.fuelSettings?.efficiencyCity || 10` as a raw L/100km value. Upgrade it to use the same 3-tier fallback chain (observed efficiency from odometer span > vehicle settings > default) that `calculateReconciliation()` uses.

**Risk:** Low -- changes the expected fuel calculation, not the actual fuel or distance numbers
**Files Changed:** `/services/fuelCalculationService.ts` (calculateOdometerBuckets function only)

### Step 7.1: Compute observed efficiency inside `calculateOdometerBuckets()`

**File:** `/services/fuelCalculationService.ts`
**Location:** After the `if (anchors.length < 2) return [];` guard (around line 303), before the `for` loop

**Current (line 306):**
```ts
const avgEfficiency = vehicle.fuelSettings?.efficiencyCity || 10;
```

**Replace with:**
```ts
// Compute observed efficiency using the same 3-tier fallback chain as calculateReconciliation
const allVehicleEntries = fuelEntries.filter(e => e.vehicleId === vehicle.id);
const allLiters = allVehicleEntries.reduce((sum, e) => sum + (e.liters || 0), 0);
const odoEntries = allVehicleEntries
    .filter(e => e.odometer !== undefined && e.odometer !== null && e.odometer > 0)
    .sort((a, b) => (a.odometer || 0) - (b.odometer || 0));

let bucketEfficiencyKmL = 0; // km/L
if (odoEntries.length >= 2 && allLiters > 0) {
    const odoSpan = (odoEntries[odoEntries.length - 1].odometer || 0) - (odoEntries[0].odometer || 0);
    if (odoSpan > 0) {
        bucketEfficiencyKmL = odoSpan / allLiters;
    }
}
if (bucketEfficiencyKmL <= 0) {
    const cityEff = vehicle.fuelSettings?.efficiencyCity;
    if (cityEff && cityEff > 0) {
        bucketEfficiencyKmL = 100 / cityEff; // L/100km -> km/L
    } else {
        bucketEfficiencyKmL = 10; // 10 km/L default
    }
}

// Convert km/L to L/100km for expected fuel calculation
const avgEfficiency = 100 / bucketEfficiencyKmL; // L/100km
```

**Why keep `avgEfficiency` as L/100km?** Because it's used on line 360 as:
```ts
const expectedFuelLiters = (bucketDistance / 100) * avgEfficiency;
```
This formula expects L/100km. So we compute in km/L (matching calculateReconciliation's chain) then convert back.

### Step 7.2: Verify the expected fuel formula is correct

**Line 360 (unchanged):**
```ts
const expectedFuelLiters = (bucketDistance / 100) * avgEfficiency;
```

With `avgEfficiency` now = `100 / bucketEfficiencyKmL`:
- If observed efficiency = 13.2 km/L, then `avgEfficiency` = 100/13.2 = 7.58 L/100km
- For a 500km bucket: `(500/100) * 7.58 = 37.9 L expected`
- Previously with hardcoded 10 L/100km: `(500/100) * 10 = 50 L expected`
- The corrected value is more accurate, leading to smaller/more-realistic variances

### Step 7.3: Verify no other uses of `avgEfficiency` in the function

Search the function body: `avgEfficiency` is used ONLY on line 360. Confirmed.

### Acceptance Criteria

- [ ] `avgEfficiency` computed using 3-tier fallback chain: observed > vehicle settings > default
- [ ] Conversion from km/L to L/100km is correct
- [ ] Expected fuel calculation formula unchanged (still `(bucketDistance / 100) * avgEfficiency`)
- [ ] Variance calculations auto-correct (they use `expectedFuelLiters` downstream)
- [ ] File compiles without errors
- [ ] No changes to any other files

---

## Phase 8: Eliminate Redundant Bucket Computation

**Goal:** `calculateReconciliation()` calls `calculateOdometerBuckets()` on line 208 solely to derive health status, then discards the buckets. `BucketReconciliationView` computes them again. Fix this by returning the buckets as part of the `WeeklyFuelReport` so the sidebar can reuse them.

**Risk:** Low -- additive type change + one extra field on the return object
**Files Changed:** `/types/fuel.ts`, `/services/fuelCalculationService.ts`, `/components/fuel/BucketReconciliationView.tsx`

### Step 8.1: Add `odometerBuckets` field to `WeeklyFuelReport`

**File:** `/types/fuel.ts`
**Location:** After line 152 (after `signedAt`), before the closing `}`

**Add:**
```ts
  // Phase: Architecture Consolidation - cached bucket data for sidebar reuse
  odometerBuckets?: OdometerBucket[];
```

**Note:** The `OdometerBucket` type is already defined in the same file (line 155), so no import needed. The `?` makes it optional so existing code that constructs `WeeklyFuelReport` objects without this field still compiles.

### Step 8.2: Return buckets from `calculateReconciliation()`

**File:** `/services/fuelCalculationService.ts`
**Location:** Inside the return statement (around line 225-262)

**Current (line 208):**
```ts
const buckets = FuelCalculationService.calculateOdometerBuckets(vehicle, vehicleEntries, vehicleTrips, vehicleAdjustments);
```

This line already computes the buckets. We just need to add them to the return object.

**Add to the return object (after line 261, before the closing `}`):**
```ts
            odometerBuckets: buckets,
```

### Step 8.3: Use cached buckets in `BucketReconciliationView`

This step is DEFERRED. The BucketReconciliationView currently receives `vehicle`, `fuelEntries`, `trips`, `adjustments` as separate props and computes buckets itself. Changing it to receive pre-computed buckets would require:

1. The parent (`FuelManagement.tsx`) to pass the relevant `WeeklyFuelReport` to the sidebar
2. BucketReconciliationView to accept an optional `precomputedBuckets` prop

**Why defer?** Phase 6 already changed BucketReconciliationView to use unified anchors, which makes the pre-computed buckets (from calculateReconciliation, which doesn't use unified anchors yet) potentially stale. The full consolidation would require calculateReconciliation to also use unified anchors, which is a larger change better suited for a follow-up.

For now, the benefit of Step 8.2 is that the `odometerBuckets` field is available for future consumers (e.g., export, API responses, downstream dashboards) without recomputation.

### Step 8.4: Document the new field

**File:** `/types/fuel.ts`
**Location:** Add a comment above the new field

```ts
  // Cached OdometerBucket[] from calculateOdometerBuckets().
  // Available after calculateReconciliation() runs. Used by Stop-to-Stop sidebar and health status.
  // These buckets use fuel-entry-only anchors. For unified anchors, BucketReconciliationView
  // fetches its own via odometerService.getUnifiedHistory().
  odometerBuckets?: OdometerBucket[];
```

### Acceptance Criteria

- [ ] `WeeklyFuelReport` type has optional `odometerBuckets` field
- [ ] `calculateReconciliation()` includes `odometerBuckets: buckets` in return
- [ ] BucketReconciliationView NOT changed in this phase (it uses its own unified anchors from Phase 6)
- [ ] All files compile without errors
- [ ] Existing consumers of `WeeklyFuelReport` are unaffected (field is optional)

---

## Phase 9: Upgrade `MileageReport` to 3-Way Attribution

**Goal:** The `MileageReport` type (used by the Unified Timeline) only tracks `platformDistance` and `personalDistance` (2-way). Upgrade it to support the same 3-way attribution as Stop-to-Stop: RideShare, Personal (from adjustments), Company Misc, and Unaccounted.

**Risk:** Medium -- type change affects MasterLogTimeline UI rendering
**Files Changed:** `/types/vehicle.ts`, `/services/mileageCalculationService.ts`, `/components/vehicles/odometer/MasterLogTimeline.tsx`

### Step 9.1: Extend `MileageReport` interface

**File:** `/types/vehicle.ts`
**Location:** Lines 160-173 (MileageReport interface)

**Current:**
```ts
export interface MileageReport {
    vehicleId: string;
    periodStart: string;
    periodEnd: string;
    startOdometer: number;
    endOdometer: number;
    totalDistance: number;
    platformDistance: number;
    personalDistance: number;
    personalPercentage: number;
    anomalyDetected: boolean;
    anomalyReason?: string;
    tripCount: number;
}
```

**Change to:**
```ts
export interface MileageReport {
    vehicleId: string;
    periodStart: string;
    periodEnd: string;
    startOdometer: number;
    endOdometer: number;
    totalDistance: number;
    platformDistance: number;      // RideShare km (full: On Trip + Enroute + Open + Unavailable)
    personalDistance: number;      // Legacy: totalDistance - platformDistance (kept for backward compat)
    personalPercentage: number;   // Legacy: kept for backward compat
    anomalyDetected: boolean;
    anomalyReason?: string;
    tripCount: number;
    // 3-way attribution (new fields, all optional for backward compat)
    rideShareDistance?: number;    // Same as platformDistance (explicit name)
    adjustedPersonalDistance?: number;  // From MileageAdjustments with type='Personal'
    companyMiscDistance?: number;  // From MileageAdjustments with type='Company_Misc' or 'Maintenance'
    unaccountedDistance?: number;  // totalDistance - (rideShare + adjustedPersonal + companyMisc)
}
```

**Why keep `personalDistance`?** Backward compatibility. Existing UI code reads `personalDistance` as `totalDistance - platformDistance`. The new `adjustedPersonalDistance` is specifically from logged Personal adjustments.

### Step 9.2: Update `MasterLogTimeline` to compute 3-way attribution

**File:** `/components/vehicles/odometer/MasterLogTimeline.tsx`
**Location:** Lines 164-167 (inside the report-building loop in `fetchTimelineData`)

This requires the component to have access to `MileageAdjustment` data. Currently it does NOT receive adjustments as a prop.

**Option A:** Add an `adjustments` prop to MasterLogTimeline.
**Option B:** Fetch adjustments inside the component (another API call).
**Option C:** Compute 3-way attribution only in the report-building loop, by fetching adjustments once with the batch.

**Decision: Option C** -- fetch adjustments in the batch alongside trips. This is the least invasive.

**Step 9.2a: Add adjustment fetch to the batch**

**Current (lines 138-143):**
```ts
const allTripsResponse = await api.getTripsFiltered({ 
    vehicleId, 
    limit: 5000
});
const allTrips = allTripsResponse.data || [];
```

**Add after line 143:**
```ts
// Fetch adjustments for 3-way attribution
let allAdjustments: any[] = [];
try {
    const adjResponse = await api.getMileageAdjustments(vehicleId);
    allAdjustments = adjResponse || [];
} catch (e) {
    console.error("Failed to fetch adjustments for 3-way attribution", e);
}
```

**Step 9.2b: Compute 3-way attribution in the loop**

**After line 167 (after `personalPercentage`):**

**Add:**
```ts
// 3-way attribution: match adjustments to this anchor period by date
const periodAdjustments = allAdjustments.filter((a: any) => {
    const aTime = new Date(a.date).getTime();
    return aTime >= startTime && aTime <= endTime;
});

const adjustedPersonalDistance = periodAdjustments
    .filter((a: any) => a.type === 'Personal')
    .reduce((sum: number, a: any) => sum + (a.distance || 0), 0);
const companyMiscDistance = periodAdjustments
    .filter((a: any) => a.type === 'Company_Misc' || a.type === 'Maintenance')
    .reduce((sum: number, a: any) => sum + (a.distance || 0), 0);
const unaccountedDistance = Math.max(0, totalDistance - platformDistance - adjustedPersonalDistance - companyMiscDistance);
```

**Step 9.2c: Add new fields to the report object**

**Current report object (lines 180-193):**
```ts
newReports[`${start.id}_${end.id}`] = {
    vehicleId,
    periodStart: start.date,
    periodEnd: end.date,
    startOdometer: start.value,
    endOdometer: end.value,
    totalDistance,
    platformDistance,
    personalDistance,
    personalPercentage,
    anomalyDetected,
    anomalyReason,
    tripCount: periodTrips.length
};
```

**Change to:**
```ts
newReports[`${start.id}_${end.id}`] = {
    vehicleId,
    periodStart: start.date,
    periodEnd: end.date,
    startOdometer: start.value,
    endOdometer: end.value,
    totalDistance,
    platformDistance,
    personalDistance,
    personalPercentage,
    anomalyDetected,
    anomalyReason,
    tripCount: periodTrips.length,
    rideShareDistance: platformDistance,
    adjustedPersonalDistance,
    companyMiscDistance,
    unaccountedDistance
};
```

### Step 9.3: Verify API exists for adjustments

Check that `api.getMileageAdjustments(vehicleId)` exists. If not, we may need to use a different method or add one.

**Action:** Before implementing, search for `getMileageAdjustments` in the API service. If it doesn't exist, use `api.getAdjustments()` and filter client-side, or whatever method the FuelManagement page uses to fetch adjustments.

### Step 9.4: DO NOT change the MasterLogTimeline UI rendering yet

The UI changes (showing 3-way attribution in the gap cards) are visual and can be done as a follow-up. This phase only adds the data to the report objects. The existing UI reads `report.platformDistance` and `report.personalDistance` which are unchanged.

### Acceptance Criteria

- [ ] `MileageReport` type has new optional fields: `rideShareDistance`, `adjustedPersonalDistance`, `companyMiscDistance`, `unaccountedDistance`
- [ ] `MasterLogTimeline` fetches adjustments in batch
- [ ] 3-way attribution computed per anchor period
- [ ] New fields included in report objects
- [ ] Existing UI rendering unchanged (reads same fields as before)
- [ ] All files compile without errors
- [ ] No breaking changes to existing consumers of `MileageReport`

---

## Implementation Order & Risk Assessment

| Phase | Description | Risk | Rollback | Dependencies |
|-------|-------------|------|----------|--------------|
| 1 | Standardize trip distance in mileageCalculationService | Low | Revert one line | None |
| 2 | Standardize trip distance in MasterLogTimeline | Low | Revert one line | None (parallel with 1) |
| 3 | Standardize trip distance in TripManifestSheet | Low | Revert one line | None (parallel with 1,2) |
| 4 | Standardize trip status filter everywhere | Low | Revert 3 filter additions | None (parallel with 1-3) |
| 5 | Upgrade calculateOdometerBuckets to accept unified anchors | Medium | Revert function signature | None |
| 6 | Wire up unified anchors in BucketReconciliationView | Medium | Remove effect + revert memo | Phase 5 |
| 7 | Unify efficiency calculation in calculateOdometerBuckets | Low | Revert efficiency block | None (parallel with 5-6) |
| 8 | Eliminate redundant bucket computation | Low | Remove one field | None |
| 9 | Upgrade MileageReport to 3-way attribution | Medium | Remove new fields | Phases 1-2 (uses corrected distance) |

**Phases 1-4 can be done in any order** (they're independent fixes).
**Phase 6 depends on Phase 5** (uses the new parameter).
**Phase 9 depends on Phases 1-2** (assumes corrected platform distance).
**Total files changed:** ~6 files across all phases.
**No new files created.**

---

## Post-Consolidation State

After all 9 phases, the architecture will be:

| Aspect | Before (Fragmented) | After (Consolidated) |
|--------|---------------------|---------------------|
| **Anchor Source** | Fuel-only (Stop-to-Stop) vs All sources (Timeline) | All sources everywhere |
| **Trip Distance** | `trip.distance` (Timeline) vs `getTotalTripRideshareKm` (Stop-to-Stop) | `getTotalTripRideshareKm` everywhere |
| **Trip Filter** | Inconsistent | Completed + Cancelled everywhere |
| **Attribution** | 2-way (Timeline) vs 3-way (Stop-to-Stop) | 3-way everywhere |
| **Efficiency** | Raw vehicle setting (Stop-to-Stop) vs 3-tier chain (Reconciliation) | 3-tier chain everywhere |
| **Computation** | Buckets computed twice | Buckets computed once, cached on report |
