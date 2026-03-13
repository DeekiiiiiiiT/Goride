# IDEA 2: Enterprise Toll Matching Engine Overhaul

## Root Cause

Lines 158-166 of `toll_controller.tsx` contain a hard pre-filter:

```ts
const vehicleTrips = trips.filter(
  (t) =>
    (t.vehicleId && transaction.vehicleId && t.vehicleId === transaction.vehicleId) ||
    (t.driverId && transaction.driverId && t.driverId === transaction.driverId),
);
```

This requires trips to share a `vehicleId` OR `driverId` with the toll transaction **before** any time-window matching runs. InDrive/Roam trips imported via the generic CSV parser often lack `vehicleId`, causing them to be silently excluded even when they fall perfectly within the toll's time window.

## Design Intent

- **Time windows are the primary matching mechanism** ("Was the passenger in the car?")
- **Vehicle/driver ID match is a confidence booster**, never a hard gate
- **Data quality awareness** — the engine should know how precise a trip's timing is
- **Performance-safe** — replace the hard filter with a lightweight same-day pre-filter
- **Backward compatible** — add fields to `MatchResult`, never remove

## Data Quality Tiers (Discovery Results)

| Tier | Has Distinct Request/Pickup/Dropoff? | Has Duration? | Can Distinguish Enroute? | Example Source |
|------|--------------------------------------|---------------|--------------------------|----------------|
| `PRECISE` | Yes — requestTime != pickupTime != dropoffTime | Yes | Yes | Uber CSV import |
| `TIMED` | Partial — requestTime = pickupTime, but dropoffTime is real | Yes | No (request = pickup) | Manual InDrive/Roam |
| `DATE_ONLY` | No — all timestamps are midnight or identical | Maybe | No | Generic CSV import |

## Files Affected

| File | Phases | Risk |
|------|--------|------|
| `/supabase/functions/server/toll_controller.tsx` | 1-7 | Medium (core logic, but isolated to toll matching) |
| `/utils/tollReconciliation.ts` | 8 | Low (deprecated code, minimal change) |
| No frontend files | — | Zero (MatchResult additions are backward compatible) |

## Confidence Scoring System

### Base Score (from Time Window)

| Window | Base Score | windowHit value | matchType value |
|--------|-----------|-----------------|-----------------|
| On Trip (pickup to dropoff) | 70 | `ON_TRIP` | `PERFECT_MATCH` or `AMOUNT_VARIANCE` |
| Enroute (request-45min to pickup) | 45 | `ENROUTE` | `DEADHEAD_MATCH` |
| Post-Trip (dropoff to dropoff+15min) | 20 | `POST_TRIP` | `PERSONAL_MATCH` |
| Outside all windows | 0 | `NONE` | Not added to results |

### Boosters (additive, applied after base)

| Signal | Points | Rationale |
|--------|--------|-----------|
| Same `driverId` on toll and trip | +10 | Confirms the right driver |
| Same `vehicleId` on toll and trip | +10 | Confirms the right vehicle |
| Amount matches platform `tollCharges` | +10 | Platform already acknowledged this toll |

### Penalties (subtractive from base)

| Signal | Points | Rationale |
|--------|--------|-----------|
| `DATE_ONLY` data quality | -25 | Time window match is unreliable (comparing against midnight timestamps) |
| `TIMED` quality + `ENROUTE` windowHit | -15 | Cannot truly distinguish Enroute from On Trip when request = pickup |

### Score-to-Label Mapping

| Score Range | `confidence` Label |
|-------------|-------------------|
| 80-100 | `high` |
| 50-79 | `medium` |
| 1-49 | `low` |

---

# PHASE 1: Add `assessDataQuality()` Helper Function

**Goal:** Create a pure function that classifies a trip's timing data quality into one of three tiers. This function has zero behavioral impact — it is not wired into any logic yet. It simply exists for Phase 3 and Phase 6 to consume.

**File:** `/supabase/functions/server/toll_controller.tsx`

**Location:** Insert immediately after the existing `getTripWindows()` function (after line 102), before the `// ─── Ported Toll Matching Logic` section header.

### Step 1.1: Define the DataQuality type

Add a new type alias:

```ts
type DataQuality = 'PRECISE' | 'TIMED' | 'DATE_ONLY';
```

Place it right after the closing brace of `getTripWindows()` (line 102), with a blank line separator.

### Step 1.2: Implement `assessDataQuality(trip)`

Add the function immediately after the type alias.

**Logic (in order of checks):**

1. Extract `requestTime`, `pickupTime`, and `dropoffTime` by calling the existing `calculateTripTimes(trip)`.
2. If `!tripTimes.isValid` → return `'DATE_ONLY'` (timestamps couldn't even be parsed).
3. Check if the trip has **distinct request vs pickup times**:
   - Compute `requestPickupGapMs = Math.abs(pickupTime.getTime() - requestTime.getTime())`
   - If `requestPickupGapMs > 60_000` (more than 1 minute apart) → the trip has a real enroute window → return `'PRECISE'`
4. Check if the trip has **meaningful dropoff time** (not just midnight of the date):
   - Compute `dropoffHours = dropoffTime.getHours()`, `dropoffMinutes = dropoffTime.getMinutes()`
   - Compute `requestHours = requestTime.getHours()`, `requestMinutes = requestTime.getMinutes()`
   - If dropoff and request are NOT both at exactly `00:00` AND they differ by more than 1 minute → return `'TIMED'`
5. Fallback → return `'DATE_ONLY'`

### Step 1.3: Add a JSDoc comment

```ts
/**
 * Assesses the timing data quality of a trip for toll matching purposes.
 *
 * PRECISE  = Has distinct request, pickup, and dropoff times (e.g., Uber CSV)
 * TIMED    = Has start/end times but request = pickup (e.g., manual InDrive/Roam entry)
 * DATE_ONLY = Only has a date, no meaningful time-of-day (e.g., generic CSV import)
 */
```

### Step 1.4: Verification

After this phase:
- No existing behavior changes.
- The function is called by nobody yet.
- The file still compiles.
- All 4 GET and 6 POST endpoints remain identical.

---

# PHASE 2: Expand the `MatchResult` Interface

**Goal:** Add new fields to the existing `MatchResult` interface so the scoring engine (Phase 3) and the rewritten matcher (Phase 6) can populate them. All new fields are **optional** so existing code that constructs `MatchResult` objects doesn't break until Phase 6 rewires it.

**File:** `/supabase/functions/server/toll_controller.tsx`

**Location:** The existing `MatchResult` interface (lines 115-131).

### Step 2.1: Add `confidenceScore` field

```ts
confidenceScore?: number;  // 0-100 numeric score (populated from Phase 6 onward)
```

Insert after the existing `varianceAmount?: number;` line (line 121).

### Step 2.2: Add identity-match booleans

```ts
vehicleMatch?: boolean;   // true if toll's vehicleId === trip's vehicleId
driverMatch?: boolean;    // true if toll's driverId === trip's driverId
```

Insert immediately after `confidenceScore`.

### Step 2.3: Add `dataQuality` field

```ts
dataQuality?: DataQuality;  // Trip's timing data quality tier
```

Insert immediately after `driverMatch`.

### Step 2.4: Add `windowHit` field

```ts
windowHit?: 'ON_TRIP' | 'ENROUTE' | 'POST_TRIP' | 'NONE';  // Which time window the toll fell in
```

Insert immediately after `dataQuality`.

### Step 2.5: Add `isAmbiguous` field (for Phase 7)

```ts
isAmbiguous?: boolean;  // true if multiple trips compete for this toll with similar scores
```

Insert immediately after `windowHit`.

### Step 2.6: Verification

After this phase:
- All new fields are optional (`?`), so every existing `matches.push({...})` call still compiles.
- No runtime behavior changes.
- The frontend receives the same JSON shape (new fields will be `undefined` until Phase 6).

---

# PHASE 3: Add `calculateConfidenceScore()` Standalone Function

**Goal:** Create the scoring engine as a pure function that takes inputs and returns a numeric score plus metadata. Not wired into the matcher yet — that happens in Phase 6.

**File:** `/supabase/functions/server/toll_controller.tsx`

**Location:** Insert after `assessDataQuality()` (added in Phase 1), before the `// ─── Ported Toll Matching Logic` section header.

### Step 3.1: Define the function signature

```ts
interface ScoreResult {
  confidenceScore: number;       // 0-100
  confidence: 'high' | 'medium' | 'low';  // Derived label
  windowHit: 'ON_TRIP' | 'ENROUTE' | 'POST_TRIP' | 'NONE';
  matchType: MatchType;
  reason: string;                // Human-readable (placeholder — enriched in Phase 8)
  vehicleMatch: boolean;
  driverMatch: boolean;
  amountMatch: boolean;
  dataQuality: DataQuality;
}

function calculateConfidenceScore(params: {
  txDate: Date;
  windows: TripWindows;
  dataQuality: DataQuality;
  txVehicleId: string | undefined;
  tripVehicleId: string | undefined;
  txDriverId: string | undefined;
  tripDriverId: string | undefined;
  txAmount: number;
  tripTollCharges: number;
}): ScoreResult | null   // null = no window hit, skip this match
```

### Step 3.2: Implement base score from time window

Inside the function:

1. Determine `windowHit`:
   - If `txDate` is within `[windows.activeStart, windows.activeEnd]` → `'ON_TRIP'`, base = 70
   - Else if `txDate` is within `[windows.approachStart, windows.approachEnd]` → `'ENROUTE'`, base = 45
   - Else if `txDate` is after `windows.activeEnd` AND within `[windows.activeEnd, windows.searchEnd]` → `'POST_TRIP'`, base = 20
   - Else → return `null` (no window hit)

2. Use the existing `isWithinInterval` from date-fns for all interval checks.

### Step 3.3: Implement boosters

```ts
const vehicleMatch = !!(txVehicleId && tripVehicleId && txVehicleId === tripVehicleId);
const driverMatch = !!(txDriverId && tripDriverId && txDriverId === tripDriverId);
const amountMatch = isAmountMatch(tripTollCharges, txAmount);

let score = base;
if (vehicleMatch) score += 10;
if (driverMatch) score += 10;
if (amountMatch) score += 10;
```

### Step 3.4: Implement penalties

```ts
if (dataQuality === 'DATE_ONLY') {
  score -= 25;
}
if (dataQuality === 'TIMED' && windowHit === 'ENROUTE') {
  score -= 15;  // Can't reliably distinguish enroute when request = pickup
}
```

### Step 3.5: Clamp and map to label

```ts
score = Math.max(0, Math.min(100, score));

let confidence: 'high' | 'medium' | 'low';
if (score >= 80) confidence = 'high';
else if (score >= 50) confidence = 'medium';
else confidence = 'low';
```

### Step 3.6: Determine matchType

```ts
let matchType: MatchType;
if (windowHit === 'ON_TRIP') {
  matchType = amountMatch ? 'PERFECT_MATCH' : 'AMOUNT_VARIANCE';
} else if (windowHit === 'ENROUTE') {
  matchType = 'DEADHEAD_MATCH';  // FIX: Approach window was never assigned DEADHEAD before
} else if (windowHit === 'POST_TRIP') {
  matchType = 'PERSONAL_MATCH';
} else {
  matchType = 'POSSIBLE_MATCH';
}
```

### Step 3.7: Return the result

```ts
return {
  confidenceScore: score,
  confidence,
  windowHit,
  matchType,
  reason: '',  // Placeholder — Phase 8 will enrich this
  vehicleMatch,
  driverMatch,
  amountMatch,
  dataQuality,
};
```

### Step 3.8: Add JSDoc comment

```ts
/**
 * Enterprise Confidence Scoring Engine for Toll-to-Trip matching.
 *
 * Calculates a 0-100 confidence score based on:
 *   - Time window hit (primary signal): ON_TRIP=70, ENROUTE=45, POST_TRIP=20
 *   - Identity boosters: +10 each for vehicleId match, driverId match, amount match
 *   - Data quality penalties: -25 for DATE_ONLY, -15 for TIMED+ENROUTE
 *
 * Returns null if the toll falls outside all time windows (no match).
 */
```

### Step 3.9: Verification

After this phase:
- The function exists but is not called by anyone.
- Zero behavioral change.
- File compiles.

---

# PHASE 4: Add `sameDayPreFilter()` Helper Function

**Goal:** Create a performance-safe pre-filter that replaces the hard vehicle/driver gate. This function narrows the trip list to trips within +/- 1 calendar day of the toll transaction, which is the maximum reasonable time window for a toll-to-trip match.

**File:** `/supabase/functions/server/toll_controller.tsx`

**Location:** Insert after `calculateConfidenceScore()` (added in Phase 3), before the `// ─── Ported Toll Matching Logic` section header.

### Step 4.1: Implement the function

```ts
function sameDayPreFilter(txDate: Date, trips: any[]): any[]
```

**Logic:**

1. Calculate `dayStart = txDate` with hours/minutes/seconds set to 00:00:00, then subtract 1 day (to get the start of the previous day).
2. Calculate `dayEnd = txDate` with hours/minutes/seconds set to 23:59:59, then add 1 day (to get the end of the next day).
3. For each trip:
   - Parse the trip's date: `tripDate = parseISO(trip.dropoffTime || trip.date)`
   - If `tripDate` is valid AND falls within `[dayStart, dayEnd]` → include it
4. Return the filtered array.

### Step 4.2: Use date-fns helpers

Use `startOfDay`, `endOfDay`, `subDays`, `addDays` from date-fns. These are NOT currently imported, so we need to add them to the import statement on line 18-25:

```ts
import {
  parseISO,
  subMinutes,
  addMinutes,
  isWithinInterval,
  differenceInMinutes,
  isValid,
  startOfDay,    // NEW
  endOfDay,      // NEW
  subDays,       // NEW
  addDays,       // NEW
} from "npm:date-fns";
```

### Step 4.3: Add JSDoc comment

```ts
/**
 * Performance-safe pre-filter: narrows trips to +/- 1 calendar day of the toll.
 * Replaces the old hard vehicle/driver gate with a time-based filter that
 * never excludes valid matches while keeping the comparison set small.
 *
 * A 3-day window (yesterday, today, tomorrow) covers:
 *   - The approach window (up to 45 min before trip)
 *   - The post-trip gap (up to 15 min after dropoff)
 *   - Timezone edge cases at midnight boundaries
 */
```

### Step 4.4: Verification

After this phase:
- The function exists but is not called by anyone.
- The only change to existing code is 4 new imports added to the date-fns import block.
- These 4 imports (`startOfDay`, `endOfDay`, `subDays`, `addDays`) are standard date-fns functions that do not affect existing code.
- Zero behavioral change.

---

# PHASE 5: Add `buildReasonString()` Helper Function

**Goal:** Create the human-readable reason string builder as a standalone function. This replaces the inline reason strings scattered throughout the current matcher. Not wired in yet.

**File:** `/supabase/functions/server/toll_controller.tsx`

**Location:** Insert after `sameDayPreFilter()` (added in Phase 4), before the `// ─── Ported Toll Matching Logic` section header.

### Step 5.1: Define the function signature

```ts
function buildReasonString(params: {
  windowHit: 'ON_TRIP' | 'ENROUTE' | 'POST_TRIP' | 'NONE';
  amountMatch: boolean;
  vehicleMatch: boolean;
  driverMatch: boolean;
  dataQuality: DataQuality;
  confidenceScore: number;
  tripTollCharges: number;
  txAmount: number;
  varianceAmount: number;
}): string
```

### Step 5.2: Implement the ON_TRIP branch

```ts
if (windowHit === 'ON_TRIP') {
  let parts: string[] = ['Passenger in vehicle'];
  if (amountMatch) {
    parts.push('Platform reimbursed');
  } else if (tripTollCharges === 0) {
    parts.push('No reimbursement recorded');
  } else {
    parts.push(`Underpaid (Diff: ${varianceAmount.toFixed(2)})`);
  }
  // Identity boosters
  if (driverMatch && vehicleMatch) parts.push('Driver + Vehicle confirmed');
  else if (driverMatch) parts.push('Driver confirmed');
  else if (vehicleMatch) parts.push('Vehicle confirmed');
  // Data quality caveat
  if (dataQuality === 'DATE_ONLY') parts.push('Low timing precision');
  return parts.join(' · ') + ` (Score: ${confidenceScore})`;
}
```

### Step 5.3: Implement the ENROUTE branch

```ts
if (windowHit === 'ENROUTE') {
  let parts: string[] = ['Enroute to pickup', 'No passenger', 'Driver responsibility'];
  if (driverMatch) parts.push('Driver confirmed');
  if (dataQuality === 'TIMED') parts.push('Enroute window estimated');
  return parts.join(' · ') + ` (Score: ${confidenceScore})`;
}
```

### Step 5.4: Implement the POST_TRIP branch

```ts
if (windowHit === 'POST_TRIP') {
  let parts: string[] = ['After dropoff', 'Likely personal'];
  if (driverMatch) parts.push('Driver confirmed');
  return parts.join(' · ') + ` (Score: ${confidenceScore})`;
}
```

### Step 5.5: Implement the NONE fallback

```ts
return `Outside all trip windows (Score: ${confidenceScore})`;
```

### Step 5.6: Add JSDoc

```ts
/**
 * Builds a human-readable reason string for toll match results.
 * Uses a "segment · segment · segment (Score: N)" format for clarity.
 */
```

### Step 5.7: Verification

After this phase:
- The function exists but is not called by anyone.
- Zero behavioral change.
- File compiles.

---

# PHASE 6: Rewrite `findTollMatchesServer()` Core Logic

**Goal:** This is the critical phase. Replace the internals of `findTollMatchesServer()` to use the new helpers from Phases 1-5. This is the phase where behavior actually changes.

**File:** `/supabase/functions/server/toll_controller.tsx`

**Location:** The existing `findTollMatchesServer()` function (lines 149-271).

### Step 6.1: Replace the hard vehicle/driver pre-filter (lines 158-166)

**Remove:**
```ts
const vehicleTrips = trips.filter(
  (t: any) =>
    (t.vehicleId && transaction.vehicleId && t.vehicleId === transaction.vehicleId) ||
    (t.driverId && transaction.driverId && t.driverId === transaction.driverId),
);
```

**Replace with:**
```ts
const candidateTrips = sameDayPreFilter(txDate, trips);
```

### Step 6.2: Replace the loop variable

**Change:**
```ts
for (const trip of vehicleTrips) {
```
**To:**
```ts
for (const trip of candidateTrips) {
```

### Step 6.3: Replace the scoring logic inside the loop (lines 183-254)

**Remove** the entire block from `let diff = 0;` through the `matches.push({...})` call.

**Replace with:**

```ts
const tripTimes = calculateTripTimes(trip);
if (!tripTimes.isValid) continue;

const windows = getTripWindows(tripTimes);
const dataQuality = assessDataQuality(trip);

// Calculate time difference for sorting
let diff = 0;
if (txDate < windows.activeStart)
  diff = differenceInMinutes(windows.activeStart, txDate);
else if (txDate > windows.activeEnd)
  diff = differenceInMinutes(txDate, windows.activeEnd);

const txAmountAbs = Math.abs(transaction.amount);
const tripRefundAmount = trip.tollCharges || 0;
const varianceAmount = tripRefundAmount - txAmountAbs;

// Run the scoring engine
const scoreResult = calculateConfidenceScore({
  txDate,
  windows,
  dataQuality,
  txVehicleId: transaction.vehicleId,
  tripVehicleId: trip.vehicleId,
  txDriverId: transaction.driverId,
  tripDriverId: trip.driverId,
  txAmount: txAmountAbs,
  tripTollCharges: tripRefundAmount,
});

// null = toll fell outside all windows, skip
if (!scoreResult) continue;

// Build reason string
const reason = buildReasonString({
  windowHit: scoreResult.windowHit,
  amountMatch: scoreResult.amountMatch,
  vehicleMatch: scoreResult.vehicleMatch,
  driverMatch: scoreResult.driverMatch,
  dataQuality: scoreResult.dataQuality,
  confidenceScore: scoreResult.confidenceScore,
  tripTollCharges: tripRefundAmount,
  txAmount: txAmountAbs,
  varianceAmount,
});

matches.push({
  tripId: trip.id,
  confidence: scoreResult.confidence,
  reason,
  timeDifferenceMinutes: diff,
  matchType: scoreResult.matchType,
  varianceAmount: scoreResult.matchType === 'AMOUNT_VARIANCE' ? varianceAmount : undefined,
  // New fields
  confidenceScore: scoreResult.confidenceScore,
  vehicleMatch: scoreResult.vehicleMatch,
  driverMatch: scoreResult.driverMatch,
  dataQuality: scoreResult.dataQuality,
  windowHit: scoreResult.windowHit,
  // Existing trip info fields (unchanged)
  tripDate: trip.date,
  tripAmount: trip.amount,
  tripTollCharges: tripRefundAmount,
  tripPickup: (trip.pickupLocation || "Unknown").substring(0, 40),
  tripDropoff: (trip.dropoffLocation || "Unknown").substring(0, 40),
  tripPlatform: trip.platform || "Unknown",
  tripDriverId: trip.driverId || "",
  tripDriverName: trip.driverName || "",
});
```

### Step 6.4: Update the sort logic (lines 257-270)

**Remove** the old priority-based sort.

**Replace with:**
```ts
// Sort by confidence score descending, then by time difference ascending
return matches.sort((a, b) => {
  const scoreA = a.confidenceScore || 0;
  const scoreB = b.confidenceScore || 0;
  if (scoreA !== scoreB) return scoreB - scoreA;
  return a.timeDifferenceMinutes - b.timeDifferenceMinutes;
});
```

### Step 6.5: Remove the now-unused `vehicleTrips` variable

Confirm there are no other references to `vehicleTrips` in the function. There should not be.

### Step 6.6: Keep the `tripTimes` and `windows` computation inside the loop

Note: The existing lines 169-172 already compute `tripTimes` and `windows` inside the loop. In the rewrite (Step 6.3), we call `calculateTripTimes()` and `getTripWindows()` at the top of the loop body, so the old lines 169-172 should be **replaced** by the new code, not duplicated.

### Step 6.7: Verification

After this phase:
- **Behavior changes**: The matcher now considers ALL trips within +/-1 day, not just trips with matching vehicle/driver IDs.
- InDrive/Roam trips without `vehicleId` will now be matched if they fall within the time windows.
- The `DEADHEAD_MATCH` type is now correctly assigned to Enroute-window tolls (previously it was never used).
- All existing `MatchResult` consumers (frontend) continue to work because the old fields (`confidence`, `matchType`, `reason`, etc.) are still populated.
- New fields (`confidenceScore`, `vehicleMatch`, etc.) are now populated but the frontend can ignore them safely.

---

# PHASE 7: Ambiguity Detection + Result Capping

**Goal:** Add post-processing to the match results to (a) flag when multiple trips compete for the same toll with similar scores, and (b) cap results at the top 5 to prevent UI overload.

**File:** `/supabase/functions/server/toll_controller.tsx`

**Location:** At the end of `findTollMatchesServer()`, after the sort, before the return statement.

### Step 7.1: Add ambiguity detection logic

After the sort, before `return matches`:

```ts
// Ambiguity detection: if top 2 matches both have score >= 50
// and are within 15 points of each other, flag both as ambiguous
if (matches.length >= 2) {
  const top = matches[0];
  const second = matches[1];
  const topScore = top.confidenceScore || 0;
  const secondScore = second.confidenceScore || 0;
  if (topScore >= 50 && secondScore >= 50 && (topScore - secondScore) <= 15) {
    top.isAmbiguous = true;
    second.isAmbiguous = true;
  }
}
```

### Step 7.2: Add result capping

After the ambiguity detection:

```ts
// Cap at top 5 matches to prevent UI overload
const MAX_MATCHES = 5;
const capped = matches.slice(0, MAX_MATCHES);
return capped;
```

Update the return to use `capped` instead of `matches`.

### Step 7.3: Remove the old return statement

The old `return matches.sort(...)` (from Phase 6, Step 6.4) needs to be restructured:

```ts
// Sort
matches.sort((a, b) => { ... });

// Ambiguity detection
if (matches.length >= 2) { ... }

// Cap and return
return matches.slice(0, 5);
```

### Step 7.4: Verification

After this phase:
- Matches are capped at 5 per toll transaction (performance + UX).
- Ambiguous matches (two strong competitors) are flagged so the admin UI could show a warning.
- The `isAmbiguous` field was already added to the interface in Phase 2 (Step 2.5).
- No frontend changes needed — the field is optional and ignored until the UI chooses to use it.

---

# PHASE 8: Client-Side Deprecated Parity

**Goal:** Mirror the core fix (remove hard vehicle/driver pre-filter) in the deprecated client-side `findTollMatches()` in `/utils/tollReconciliation.ts`. This is a minimal change — no scoring engine, just the filter removal and same-day pre-filter.

**File:** `/utils/tollReconciliation.ts`

### Step 8.1: Locate the hard pre-filter

Find the equivalent vehicle/driver filter in the client-side `findTollMatches()` function. It will be a `.filter()` call similar to the server-side one.

### Step 8.2: Replace with same-day pre-filter

Replace the vehicle/driver filter with a date-based filter:

```ts
// OLD: const vehicleTrips = trips.filter(t => t.vehicleId === ... || t.driverId === ...);
// NEW: Same-day pre-filter (+/- 1 day)
const txTime = getTransactionDateTime(transaction)?.getTime() || 0;
const ONE_DAY_MS = 86_400_000;
const candidateTrips = trips.filter(t => {
  const tripTime = new Date(t.dropoffTime || t.date).getTime();
  return Math.abs(tripTime - txTime) <= ONE_DAY_MS * 2;  // +/- 2 days for safety
});
```

### Step 8.3: Update the loop variable

Change `for (const trip of vehicleTrips)` to `for (const trip of candidateTrips)`.

### Step 8.4: Add deprecation notice

Ensure the `@deprecated` JSDoc (added in Phase 8 of the toll overhaul plan) is still present. If not, add:

```ts
/**
 * @deprecated Use findTollMatchesServer() in toll_controller.tsx instead.
 * This client-side version is kept for backward compatibility only.
 * The server-side version has the full confidence scoring engine.
 */
```

### Step 8.5: Verification

After this phase:
- The deprecated client-side matcher no longer has the hard vehicle/driver gate.
- It uses a simple date-based pre-filter instead.
- No scoring engine (that's server-side only).
- Any code that still calls the client-side version will benefit from the fix.

---

# Execution Rules

1. **Each phase is implemented only after explicit user approval.**
2. **After each phase, wait for user confirmation before proceeding to the next.**
3. **Phases 1-5 are pure additions** — they add new functions/types but change zero existing behavior.
4. **Phase 6 is the critical behavioral change** — the old matching logic is replaced.
5. **Phase 7 is additive post-processing** — builds on Phase 6.
6. **Phase 8 is independent** — can be done any time after Phase 6 for consistency.

---

# Status Tracker

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | `assessDataQuality()` helper | COMPLETE |
| 2 | `MatchResult` interface extensions | COMPLETE |
| 3 | `calculateConfidenceScore()` function | COMPLETE |
| 4 | `sameDayPreFilter()` helper | COMPLETE |
| 5 | `buildReasonString()` helper | COMPLETE |
| 6 | Rewrite `findTollMatchesServer()` core | COMPLETE |
| 7 | Ambiguity detection + result capping | COMPLETE |
| 8 | Client-side deprecated parity | COMPLETE |