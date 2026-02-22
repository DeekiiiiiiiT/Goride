# IDEA 1: Ambiguity-Aware GPS Station Matching ("Unknown Vendor" Fix)

## Problem Summary

Live Driver Portal fuel submissions show **"Unknown Vendor"** in Transaction Logs even when the station is verified. Three compounding bugs in the Transaction POST handler (`/supabase/functions/server/index.tsx`):

1. **Bug 1 -- Tight Radius:** GPS matching at line ~1696 uses a 150m radius. Phone GPS drift (typically 50-200m in Jamaica) causes misses even when the driver is at the station.
2. **Bug 2 -- Missing `vendor` Field:** The `fuel_entry` object (lines ~1918-1946) never sets a `vendor` field. The station name goes into `location`, but `FuelLogTable` reads `entry.vendor` (line 452).
3. **Bug 3 -- `locationStatus` in Wrong Place:** `locationStatus` is stored at the **top level** of fuel_entry (line 1938) instead of inside `metadata` where `FuelLogTable` checks for it (`entry.metadata?.locationStatus` at line 454).

**Bonus Bug (discovered during audit):** The Transaction POST handler **never calls `calculateConfidenceScore()`**. This is why the Audit Confidence column shows `0/0/0/0/0` or `??` for all Driver Portal entries. The fuel_controller's POST handler DOES call it (line 1077), but the Transaction handler does not.

## Why NOT Simply Widen to 600m

Blindly increasing the radius to 600m would cause **wrong matches** when two stations are close together (e.g., Total and a neighbouring station whose geofence circles overlap). A wrong match is worse than no match -- it silently corrupts data.

## Solution: Ambiguity-Aware Matching

The system searches at a wide radius (up to 600m) but **checks for ambiguity** before accepting a match:

- **1 station in range** -> match it (no ambiguity, safe)
- **Multiple stations in range, but one is clearly closest** -> match the closest (distance ratio proves it's unambiguous)
- **Multiple stations roughly equidistant** -> refuse to match, flag for admin review (honest "I don't know" rather than a guess)

The driver workflow does NOT change. The driver only enters amount and price. The system figures out the station purely from GPS intelligence.

## Per-Station Regional Efficiency Values

Each station has a `geofenceRadius` property (set from Plus Code precision or manually in the admin panel). These values should **NOT** be changed to 600m. They represent the station's tight "home zone" and are used as the high-confidence matching threshold. The 600m is only the outer search boundary.

---

## Phase 1: Code Audit & Current-State Documentation

**Goal:** Confirm exact line numbers, data shapes, and all call sites before touching any code. No code changes in this phase.

### Step 1.1 -- Map the Transaction POST Handler GPS Matching (index.tsx)
- **File:** `/supabase/functions/server/index.tsx`
- **Lines ~1684-1758:** The geolocation matching block
- Confirm: `findMatchingStation()` is called twice -- once for verified stations at 150m (line 1696), once for unverified at 150m (line 1710)
- Confirm: If no match, a Learnt Location is created (lines 1737-1752)
- **Document:** What fields are set on `transaction.metadata`: `matchedStationId`, `locationStatus`, `verificationMethod`

### Step 1.2 -- Map the fuel_entry Object (index.tsx)
- **Lines ~1918-1946:** The fuel_entry creation block
- Confirm: `vendor` is NEVER set (only `location` at line 1928)
- Confirm: `locationStatus` is at TOP LEVEL (line 1938) -- NOT inside `metadata`
- Confirm: `matchedStationId` is at TOP LEVEL (line 1939) -- NOT inside `metadata`
- Confirm: `metadata` object (lines 1940-1946) does NOT include `locationStatus`, `matchedStationId`, or `auditConfidenceScore`
- **Document:** What FuelLogTable expects vs what it actually gets

### Step 1.3 -- Map the Fuel Controller POST Handler (fuel_controller.tsx)
- **Line ~1049:** Uses `findMatchingStation()` with 600m -- this ALSO has the overlap risk
- Confirm: It DOES correctly set `entry.vendor = matchedStation.name` (line 1060)
- Confirm: It DOES correctly nest `locationStatus` inside `metadata` (line 1063)
- Confirm: It DOES call `calculateConfidenceScore()` (line 1077)
- **Document:** This handler does things RIGHT -- the transaction handler needs to match this pattern

### Step 1.4 -- Map Sync Orphans (fuel_controller.tsx)
- **Line ~1299:** Uses `findMatchingStation()` with 600m blindly
- Confirm: It correctly sets `entry.vendor`, `entry.metadata.locationStatus` etc. (lines 1308-1320)
- **Document:** Same overlap risk as the fuel_controller POST handler

### Step 1.5 -- Map All `findMatchingStation()` Call Sites

| File | Line | Radius | Purpose | Change? |
|------|------|--------|---------|---------|
| `index.tsx` | ~1696 | 150m | Transaction POST -- verified stations | YES |
| `index.tsx` | ~1710 | 150m | Transaction POST -- unverified stations | YES |
| `fuel_controller.tsx` | ~1049 | 600m | Fuel entry POST -- Evidence Bridge | YES |
| `fuel_controller.tsx` | ~1128 | 1000m | Forensic geofence verification | NO (different purpose) |
| `fuel_controller.tsx` | ~1299 | 600m | Sync Orphans reconciliation | YES |
| `fuel_controller.tsx` | ~681 | per-station | Learnt Location auto-cleanup | NO (leave for now) |

### Step 1.6 -- Confirm Station Data Shape
- Each station object has a `geofenceRadius` property (set from Plus Code precision or manually)
- Default values: `fuel_controller.tsx` line 346 uses `station.geofenceRadius || 150`
- The existing `findMatchingStation()` in `geo_matcher.ts` does NOT use per-station geofenceRadius -- it takes a single flat `radiusMeters` parameter
- The new smart function will use each station's own `geofenceRadius` as the "high confidence" zone

**Deliverable:** No code changes. Confirmed map of the current state. Report findings before moving to Phase 2.

---

## Phase 2: Build the Smart Matching Function in `geo_matcher.ts`

**Goal:** Create a new `findMatchingStationSmart()` function that detects ambiguity. Keep existing `findMatchingStation()` completely untouched for backward compatibility.

### Step 2.1 -- Define the Return Type

Create a new interface `SmartMatchResult`:
```typescript
interface SmartMatchResult {
  station: StationProfile | null;    // The matched station (or null if no match / ambiguous)
  confidence: 'high' | 'medium' | 'ambiguous' | 'none';
  distance: number;                  // Distance to matched station in metres
  candidatesInRange: number;         // How many stations were within the max radius
  secondClosestDistance: number;     // Distance to 2nd-closest station (Infinity if only 1)
  ambiguityReason?: string;          // Human-readable reason if ambiguous
}
```

### Step 2.2 -- Implement `findMatchingStationSmart()`

**Function signature:**
```typescript
export const findMatchingStationSmart = (
    lat: number,
    lng: number,
    stations: StationProfile[],
    maxRadiusMeters: number = 600,
    gpsAccuracy: number = 0
): SmartMatchResult
```

**Algorithm (in plain language):**
1. Calculate distance from the GPS point to EVERY station (including gpsAliases). For each station, use the shortest distance across its primary location + all aliases. Store as an array of `{station, distance}` pairs.
2. Filter to only those within `maxRadiusMeters + gpsAccuracy`.
3. Sort by distance ascending (closest first).
4. **Decision logic:**
   - **0 candidates:** Return `{ station: null, confidence: 'none' }`.
   - **1 candidate:** Return `{ station, confidence: 'high' }` -- no ambiguity possible.
   - **2+ candidates:** Let `d1` = distance to closest, `d2` = distance to second-closest.
     - If `d1` is within the closest station's own `geofenceRadius` (its tight zone): `confidence: 'high'`. The driver is inside that station's defined perimeter -- safe match even if another station is nearby.
     - Else if `d1 < d2 * 0.5` (closest is less than half the distance of second-closest): `confidence: 'medium'`. Clearly closer to one station even though outside its tight zone.
     - Else: `confidence: 'ambiguous'`. Distances are too similar to tell. Do NOT match -- return `station: null`.

### Step 2.3 -- Handle GPS Aliases in Distance Calculation

When calculating distance to a station, check BOTH the primary `station.location` AND all `station.gpsAliases[]`. Use the SHORTEST distance across all points as that station's effective distance. This is the same logic already used in the existing `findMatchingStation()` function.

### Step 2.4 -- Add Detailed Logging

Log every decision:
```
[SmartMatch] 3 stations within 600m. Closest: "Total Mandeville" at 89m. Second: "Rubis May Pen" at 412m. Ratio: 0.22. Decision: high (within geofence 150m)
```
```
[SmartMatch] 2 stations within 600m. Closest: "Total Mandeville" at 320m. Second: "Rubis May Pen" at 350m. Ratio: 0.91. Decision: ambiguous (equidistant)
```

### Step 2.5 -- Export Alongside Existing Function

- Add the new function and interface to the file's exports
- Do NOT modify the existing `findMatchingStation()` in any way
- Existing callers continue working unchanged
- New callers opt-in to `findMatchingStationSmart()`

**Deliverable:** Updated `/supabase/functions/server/geo_matcher.ts` with the new function. No other files changed.

---

## Phase 3: Fix Transaction POST Handler -- GPS Matching (index.tsx)

**Goal:** Replace the two 150m `findMatchingStation()` calls with the new smart matching function. Handle all confidence levels correctly.

### Step 3.1 -- Add Import for New Function

At the top of `index.tsx`, add `findMatchingStationSmart` to the existing import from `./geo_matcher.ts`.

### Step 3.2 -- Add a Variable to Track the Matched Station Name

Before the geolocation matching block (before line ~1684), declare:
```javascript
let matchedStationName = '';
```
This variable will be used later in Phase 4 when building the fuel_entry object. It must be declared here so it's in scope for both the matching block and the fuel_entry block.

### Step 3.3 -- Replace Verified Station Matching (lines ~1695-1707)

**Current code:**
```javascript
const matchedVerified = findMatchingStation(
    locationMetadata.lat, locationMetadata.lng, verifiedStations, 150
);
if (matchedVerified) { ... }
```

**New code:**
- Call `findMatchingStationSmart(locationMetadata.lat, locationMetadata.lng, verifiedStations, 600)`
- If `confidence === 'high'` or `confidence === 'medium'`:
  - Accept the match
  - Set `transaction.metadata.matchedStationId`, `locationStatus = 'verified'`, `verificationMethod = 'gps_matching'`
  - Set `matchedStationName = matchedVerified.station.name`
  - Log with the confidence level and distance
- If `confidence === 'ambiguous'` or `'none'`:
  - Fall through to unverified check (same as before)

### Step 3.4 -- Replace Unverified Station Matching (lines ~1709-1732)

**Current code:**
```javascript
const matchedUnverified = findMatchingStation(
    locationMetadata.lat, locationMetadata.lng, unverifiedStations, 150
);
if (matchedUnverified) { /* auto-promote */ }
```

**New code:**
- Call `findMatchingStationSmart(locationMetadata.lat, locationMetadata.lng, unverifiedStations, 600)`
- If `confidence === 'high'`:
  - Auto-promote (same as current behaviour)
  - Set `matchedStationName = result.station.name`
- If `confidence === 'medium'`:
  - Match but do NOT auto-promote (the match isn't confident enough to promote)
  - Set `locationStatus = 'review_required'`
  - Set `matchedStationName = result.station.name`
- If `confidence === 'ambiguous'` or `'none'`:
  - Fall through to Learnt Location creation

### Step 3.5 -- Handle the Ambiguous Case in Learnt Location Creation

When the matching is ambiguous (both verified and unverified checks failed or were ambiguous):
- Create the Learnt Location as before (lines 1737-1752)
- BUT add extra metadata: `ambiguityFlag: true`, `nearbyStationCount: N`
- Set `transaction.metadata.locationStatus = 'review_required'` instead of `'unverified'`
- Log: `[GeoMatch] Ambiguous match -- N stations within range, distances too close to call. Flagged for review.`

**Deliverable:** Updated `/supabase/functions/server/index.tsx` -- GPS matching block only. The fuel_entry block is NOT changed yet (that's Phase 4).

---

## Phase 4: Fix Transaction POST Handler -- fuel_entry Object (index.tsx)

**Goal:** Fix the three missing/misplaced fields on the fuel_entry object AND add confidence score calculation.

### Step 4.1 -- Add `vendor` Field to fuel_entry

**Current (line ~1928):**
```javascript
location: transaction.vendor || transaction.description || 'Reimbursement',
```
(No `vendor` field exists.)

**Fix -- add a new line above or below:**
```javascript
vendor: matchedStationName || transaction.vendor || transaction.description || 'Unknown Vendor',
location: transaction.vendor || transaction.description || 'Reimbursement',
```
The `matchedStationName` variable was declared in Phase 3 (Step 3.2) and set during matching.

### Step 4.2 -- Move `locationStatus` and `matchedStationId` Inside `metadata`

**Current (lines ~1938-1946):**
```javascript
locationStatus: transaction.metadata?.locationStatus,       // TOP LEVEL -- WRONG
matchedStationId: transaction.metadata?.matchedStationId,   // TOP LEVEL only
metadata: {
    receiptUrl: ...,
    odometerProofUrl: ...,
    originalTransactionId: ...,
    locationMetadata: ...,
    parentCompany: ...
}
```

**Fix:**
- Keep `matchedStationId` at top level for backward compatibility (other code reads it there)
- REMOVE `locationStatus` from the top level
- ADD `locationStatus`, `matchedStationId`, and `verificationMethod` INSIDE the `metadata` object:
```javascript
matchedStationId: transaction.metadata?.matchedStationId,   // Keep at top level
metadata: {
    receiptUrl: ...,
    odometerProofUrl: ...,
    originalTransactionId: ...,
    locationMetadata: ...,
    parentCompany: ...,
    locationStatus: transaction.metadata?.locationStatus,           // ADDED
    matchedStationId: transaction.metadata?.matchedStationId,       // ADDED
    verificationMethod: transaction.metadata?.verificationMethod,   // ADDED
}
```

### Step 4.3 -- Add Confidence Score Calculation

**The problem:** The Transaction handler NEVER calls `calculateConfidenceScore()`. This is why Audit Confidence shows `0/0/0/0/0` for Driver Portal entries.

**Fix -- add after fuel_entry creation (after line ~1947), before saving to KV:**
```javascript
// Import at top of file (or add to existing import)
import * as fuelLogic from "./fuel_logic.ts";

// After creating fuelEntry, before kv.set:
if (fuelEntry.matchedStationId) {
    const matchedStation = allStations.find(s => s.id === fuelEntry.matchedStationId);
    if (matchedStation) {
        const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, matchedStation);
        fuelEntry.metadata = {
            ...fuelEntry.metadata,
            auditConfidenceScore: confidence.score,
            auditConfidenceBreakdown: confidence.breakdown,
            isHighlyTrusted: confidence.isHighlyTrusted
        };
    }
}
```
Note: `allStations` is already loaded at line 1690. We need to make sure it's still in scope here. It's declared inside the `try` block that starts at line 1688, but the fuel_entry creation is inside a DIFFERENT `if` block that starts at line 1897. We may need to hoist the `allStations` variable to a wider scope, or re-fetch it. The exact approach will be determined during implementation.

### Step 4.4 -- Verify the Full fuel_entry Object Shape After Changes

After all fixes, the fuel_entry should look like:
```javascript
{
    id: 'uuid',
    date: '2026-02-22T14:30:00',
    type: 'Reimbursement',
    amount: 5000,
    liters: 33.5,
    pricePerLiter: 149.25,
    odometer: 45000,
    vendor: 'Total Mandeville',                // NEW -- from matched station
    location: 'Total Mandeville',              // Existing -- kept for backward compat
    stationAddress: '...',
    vehicleId: 'v-123',
    driverId: 'd-456',
    transactionId: 't-789',
    receiptUrl: '...',
    odometerProofUrl: '...',
    isVerified: true,
    source: 'Fuel Log',
    matchedStationId: 'station-uuid',          // TOP LEVEL -- kept for backward compat
    metadata: {
        receiptUrl: '...',
        odometerProofUrl: '...',
        originalTransactionId: 't-789',
        locationMetadata: { lat: 18.04, lng: -77.50, accuracy: 25 },
        parentCompany: 'Total Energies',
        locationStatus: 'verified',            // MOVED inside metadata
        matchedStationId: 'station-uuid',      // DUPLICATED inside metadata
        verificationMethod: 'gps_matching',    // ADDED
        auditConfidenceScore: 85,              // NEW -- from calculateConfidenceScore
        auditConfidenceBreakdown: {            // NEW
            gps: 30,
            gps_bonus: 5,
            crypto: 0,
            physical: 15,
            behavioral: 20
        },
        isHighlyTrusted: false                 // NEW
    }
}
```

**Deliverable:** Updated `/supabase/functions/server/index.tsx` with corrected fuel_entry object. All three original bugs fixed for new entries, plus the bonus confidence score bug.

---

## Phase 5: Upgrade Fuel Controller & Sync Orphans to Smart Matching

**Goal:** Replace blind 600m matching in `fuel_controller.tsx` with the same ambiguity-aware logic for consistency and data accuracy.

### Step 5.1 -- Add Import for New Function

At the top of `fuel_controller.tsx`, add `findMatchingStationSmart` to the existing import from `./geo_matcher.ts`.

### Step 5.2 -- Fix Fuel Controller POST Handler (line ~1049)

**Current:**
```javascript
const matchedStation = findMatchingStation(entryLat, entryLng, allStationsForEntry, 600);
```

**New:**
- Replace with `findMatchingStationSmart(entryLat, entryLng, allStationsForEntry, 600)`
- If `confidence === 'high'` or `'medium'`:
  - Proceed exactly as before (set vendor, metadata, sign, lock, confidence score)
  - Everything after the match (lines 1051-1092) stays the same
- If `confidence === 'ambiguous'`:
  - Still create the entry (don't reject it -- the driver legitimately bought fuel)
  - Set `entry.vendor = result.station.name` (best guess, but flagged)
  - Set `locationStatus: 'review_required'` instead of `'verified'`
  - Do NOT sign or auto-lock (don't give cryptographic stamp to an uncertain match)
  - Still calculate confidence score (it will naturally be lower without a firm GPS match)
  - Log: `[GeoMatch] Ambiguous match for entry {id}. Closest: {name} at {d1}m, Second: {name2} at {d2}m.`
- If `confidence === 'none'`:
  - Fall through to Learnt Location funnel (existing behaviour at lines 1093-1113)

### Step 5.3 -- Fix Sync Orphans Reconciliation (line ~1299)

**Current:**
```javascript
const matchedStation = findMatchingStation(entryLat, entryLng, allStations, 600);
```

**New:**
- Replace with `findMatchingStationSmart(entryLat, entryLng, allStations, 600)`
- If `confidence === 'high'` or `'medium'`:
  - Proceed exactly as before (update vendor, metadata, sign, save)
  - Everything in the `if (matchedStation)` block stays the same
- If `confidence === 'ambiguous'`:
  - Do NOT reconcile this entry -- skip it
  - Increment a new counter: `skippedAmbiguous++`
  - Log: `[Reconcile] Skipped ambiguous entry {id}. {N} stations within range.`
- If `confidence === 'none'`:
  - Increment `skippedNoMatch` as before

### Step 5.4 -- Update Sync Orphans Response to Include Ambiguous Count

Add `ambiguousCount` to the response JSON so the admin can see how many entries were skipped due to ambiguity:
```javascript
return c.json({
    success: true,
    matchesFound: matchCount,
    skippedNoCoords,
    skippedNoMatch,
    skippedAmbiguous,     // NEW
    totalOrphans: orphans.length
});
```

### Step 5.5 -- Leave These Call Sites Untouched

Do NOT change these calls in this phase:
- **Forensic verification** (line ~1128, 1000m radius) -- different purpose, verifying proximity not matching
- **Learnt Location auto-cleanup** (line ~681) -- uses per-station geofenceRadius, different logic
- **Duplicate detection** (line ~346) -- uses per-station geofenceRadius, different logic

**Deliverable:** Updated `/supabase/functions/server/fuel_controller.tsx` with smart matching at the two critical points. All other logic untouched.

---

## Phase 6: FuelLogTable Display Fixes & Cleanup

**Goal:** Ensure the frontend renders correctly for both old entries (pre-fix) and new entries (post-fix), and remove debug artifacts.

### Step 6.1 -- Add Backward-Compatible locationStatus Fallback

**Current (line ~454):**
```jsx
{entry.metadata?.locationStatus === 'verified' && ( ... green shield ... )}
```

**Fix:** Add a local variable at the top of the row render function that checks both locations:
```javascript
const locationStatus = entry.metadata?.locationStatus || entry.locationStatus;
```
Then use `locationStatus` instead of `entry.metadata?.locationStatus` in all the conditional checks. This ensures old entries that have `locationStatus` at the top level (Bug 3 from before the fix) still display correctly.

### Step 6.2 -- Add `review_required` Status Display

The new ambiguity logic introduces `locationStatus: 'review_required'`. FuelLogTable currently only handles `'verified'` and `'unknown'`.

**Add a new condition between the verified (green) and unknown (grey) blocks:**
```jsx
{locationStatus === 'review_required' && (
    <Tooltip>
        <TooltipTrigger asChild>
            <AlertTriangle className="h-3 w-3 text-amber-500" />
        </TooltipTrigger>
        <TooltipContent>
            GPS match requires admin review -- multiple nearby stations detected
        </TooltipContent>
    </Tooltip>
)}
```

### Step 6.3 -- Remove [TankCap Debug] Console Log

**File:** `/components/fuel/FuelLogTable.tsx`
**Lines ~506-516:** Remove the entire debug block:
```javascript
// DELETE THIS BLOCK:
if (entry === filteredEntries[0]) {
    console.log('[TankCap Debug]', {
        vehicleId: entry.vehicleId,
        'specs.tankCapacity': vehicle?.specifications?.tankCapacity,
        'specs.asNumber': Number(vehicle?.specifications?.tankCapacity),
        'fuelSettings.tankCapacity': vehicle?.fuelSettings?.tankCapacity,
        resolvedTankCap: tankCap,
        hasSpecs: !!vehicle?.specifications,
        vehicleKeys: vehicle ? Object.keys(vehicle) : 'NO_VEHICLE'
    });
}
```

### Step 6.4 -- Verify Vendor Display (No Change Needed)

**Current (line ~452):**
```jsx
{entry.vendor || entry.metadata?.stationName || "Unknown Vendor"}
```

This is already correct:
- New entries (post-fix): `entry.vendor` will be populated -> shows station name
- Old entries (post Sync Orphans): `entry.vendor` will be populated -> shows station name
- Old entries (pre Sync Orphans): `entry.vendor` is missing -> falls through to "Unknown Vendor"
- No code change needed here.

### Step 6.5 -- Verify Audit Confidence Display (No Change Needed)

**Current (line ~435):**
```jsx
const confidenceScore = entry.metadata?.auditConfidenceScore;
```

This is already correct:
- New entries (post Phase 4): will have `auditConfidenceScore` in metadata -> shows real score
- Old entries: missing score -> shows `??` (existing fallback at line 558)
- No code change needed here.

### Step 6.6 -- Ensure AlertTriangle Icon is Imported

Check the existing icon imports at the top of FuelLogTable.tsx. If `AlertTriangle` is not already imported from `lucide-react`, add it.

**Deliverable:** Updated `/components/fuel/FuelLogTable.tsx` with backward-compatible display fixes, new `review_required` status indicator, and debug cleanup.

---

## Phase 7: Historical Backfill & End-to-End Verification

**Goal:** Fix existing broken entries using Sync Orphans and verify the complete flow works. No code changes in this phase -- testing only.

### Step 7.1 -- Run Sync Orphans to Backfill Old Entries

After all code changes from Phases 2-6 are deployed:
1. Go to the Verified Stations tab
2. Click "Sync Orphans"
3. The upgraded Sync Orphans (Phase 5) will re-process all entries with missing vendor, unknown locationStatus, or missing confidence scores
4. It will now use smart matching -- entries in overlap zones won't get wrong matches (they'll be skipped as ambiguous)

### Step 7.2 -- Check the Response

The response should show:
- `matchesFound`: How many orphan entries were linked to a station
- `skippedNoCoords`: How many entries had no GPS data at all
- `skippedNoMatch`: How many entries were too far from any station
- `skippedAmbiguous`: **NEW** -- How many entries were in overlap zones

### Step 7.3 -- Verify Test Scenarios

| Scenario | Expected Behaviour |
|----------|-------------------|
| Driver fuels at an **isolated** verified station (no other station within 600m) | Matched at up to 600m. Vendor shown. Green shield. Confidence score populated. |
| Driver fuels at a station with a **nearby neighbour** but clearly closer to one | Matched to the closest. Vendor shown. Green or amber icon depending on confidence. |
| Driver fuels **exactly between** two stations (ambiguous GPS) | NOT matched. Flagged as `review_required`. Amber triangle icon. Admin can manually resolve. |
| Driver fuels at a station with **no GPS data** at all | Falls through to Learnt Location. Shows "Unknown Vendor" with grey question mark. Normal. |
| **Old entries** created before this fix | Show "Unknown Vendor" until Sync Orphans re-processes them. After sync, correctly display vendor + shield. |
| **Old entries in overlap zones** | Sync Orphans skips them (ambiguous). They remain as "Unknown Vendor" until admin manually resolves. |

### Step 7.4 -- Verify No Regressions

Check these are all working as before:
- Fuel Controller POST (manual entry from admin) -- should work as before but with ambiguity protection
- Forensic geofence verification -- untouched, should work exactly as before
- Learnt Location cleanup -- untouched, should work exactly as before
- Station duplicate detection -- untouched, uses its own logic
- Station merging -- untouched

### Step 7.5 -- Monitor Server Logs

After deploying, watch for these log lines in the server console:
- `[SmartMatch]` -- confirms the new function is being called with decisions
- `[GeoMatch] Ambiguous match` -- shows when ambiguity detection triggers during transaction creation
- `[Reconcile] Skipped N ambiguous entries` -- shows during Sync Orphans

### Step 7.6 -- Clean Up Any Remaining Issues

If some old entries still show "Unknown Vendor" after Sync Orphans:
- These are entries with no GPS coordinates at all (the driver submitted without location data)
- OR entries in overlap zones that were correctly skipped as ambiguous
- Both are expected and correct behaviour -- they need admin manual review, not an automatic guess

**Deliverable:** Verification that all scenarios work correctly. Document any edge cases found.

---

## Summary of Files Changed Per Phase

| Phase | Files Modified | Type |
|-------|---------------|------|
| 1 | None | Audit only |
| 2 | `/supabase/functions/server/geo_matcher.ts` | New function added |
| 3 | `/supabase/functions/server/index.tsx` | GPS matching block rewritten |
| 4 | `/supabase/functions/server/index.tsx` | fuel_entry object fixed + confidence score added |
| 5 | `/supabase/functions/server/fuel_controller.tsx` | Two call sites upgraded to smart matching |
| 6 | `/components/fuel/FuelLogTable.tsx` | Display fixes + debug cleanup |
| 7 | None | Testing only |

## Standing Reminders
- The driver workflow does NOT change. Driver enters amount + price only.
- Per-station Regional Efficiency (`geofenceRadius`) values stay as-is. Do NOT change them to 600m.
- The original `findMatchingStation()` function is preserved untouched. Only new callers use `findMatchingStationSmart()`.
- Jamaica DD/MM/YYYY date format is unaffected by these changes.
- After all phases, the two older audit items (Manual Resolve bug and Audit Confidence 0/0/0/0/0) will also be addressed: the confidence score fix is built into Phase 4, and Manual Resolve is a separate issue outside this IDEA.
