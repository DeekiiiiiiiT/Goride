# Enroute Distance Normalization: Uniform Average Strategy

## Objective
Align the "Enroute Distance" calculated from individual trip logs with the trusted "Total Enroute Distance" from the `driver_time_and_distance.csv` reference file.

## Strategy: "Uniform Average"
As identified in `IDEA_1.md`, we lack granular GPS data for individual trips. Therefore, the most mathematically robust method is to calculate an **Average Enroute Distance per Trip** and apply it uniformly to all completed trips.

**Formula:**
`AvgEnrouteDistance = TotalCSVEnrouteDistance / TotalCompletedTrips`

## Phases

### Phase 1: Foundation & Utilities
**Goal**: Create the logic to handle the Uniform Average calculation.
*   **Step 1.1**: Create `/utils/enrouteStrategy.ts`.
    *   Implement `calculateAverageEnroute(totalDistance: number, tripCount: number): number`.
    *   Implement `estimateEnrouteFallback(trip: Trip): number` (Time-based fallback for when CSV is unavailable).
*   **Step 1.2**: Update `/types/data.ts` to ensure `Trip` interface can hold `normalizedEnrouteDistance`.

### Phase 2: Data Extraction in DriverDetail
**Goal**: Retrieve the Source of Truth (CSV) values within the main calculation loop.
*   **Step 2.1**: In `/components/drivers/DriverDetail.tsx`, inside the `useMemo` calculation block:
    *   Identify if `selectedPlatforms` includes "All".
    *   Extract `csvTotalEnroute` from `relevantCsvMetrics`.
    *   Extract `totalCompletedTrips` count for the period.

### Phase 3: Logic Integration
**Goal**: Switch between "Uniform Average" (when CSV exists) and "Time-Based Estimate" (fallback).
*   **Step 3.1**: Calculate the `uniformEnrouteValue`.
    *   If `isAllPlatforms` AND `csvTotalEnroute > 0`: `val = csvTotalEnroute / tripCount`.
    *   Else: `val = null` (use fallback).
*   **Step 3.2**: Iterate through trips.
    *   If `val` exists: `trip.enroute = val`.
    *   Else: `trip.enroute = estimateEnrouteFallback(trip)`.
*   **Step 3.3**: Accumulate `recEnrouteDist` based on these assigned values.

### Phase 4: Downstream Updates (Fuel & Totals)
**Goal**: Ensure the Fuel Split calculation uses the new normalized distance.
*   **Step 4.1**: Verify `fuelRideShare` calculation uses the accumulated `recEnrouteDist`.
*   **Step 4.2**: Update `reconstructedDistanceMetrics` to reflect the new totals.
*   **Step 4.3**: Ensure `relevantCsvMetrics` logic handles cases with missing data gracefully.

### Phase 5: Verification & Cleanup
**Goal**: Validate the numbers match `IDEA_1` expectations.
*   **Step 5.1**: Verify that for the sample dataset (83 trips, 279.52km), the per-trip enroute is ~3.37km.
*   **Step 5.2**: Clean up any unused legacy calculation code in `DriverDetail.tsx`.
