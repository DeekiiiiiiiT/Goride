# Solution Plan: Trip Manifest Implementation

This plan details the implementation of the "Trip Manifest" feature, which allows users to view the specific trips that constitute the "Business Mileage" within a verified odometer gap.

## Phase 1: Service Layer Refactoring
**Goal:** Extract trip fetching logic into a reusable method to support on-demand loading.

1.  **Refactor `mileageCalculationService`**:
    -   Create a new public method `getTripsForPeriod(vehicleId: string, startAnchor: OdometerReading, endAnchor: OdometerReading): Promise<Trip[]>`.
    -   Move the logic that fetches trips (either by `anchorPeriodId` or date range) from `calculatePeriodMileage` into this new method.
    -   Update `calculatePeriodMileage` to call `getTripsForPeriod`.

## Phase 2: UI Foundation - SlideOut Component
**Goal:** Create the container component for the manifest.

1.  **Create `components/vehicles/odometer/TripManifestSheet.tsx`**:
    -   Import `Sheet`, `SheetContent`, `SheetHeader`, etc. from `../../ui/sheet`.
    -   Define props: `isOpen`, `onClose`, `vehicleId`, `startAnchor`, `endAnchor`.
    -   Set up the basic structure with a placeholder title and content area.
    -   Ensure it handles `null` anchors gracefully (though it shouldn't be called with them).

## Phase 3: Integration into MasterLogTimeline
**Goal:** Connect the new component to the main timeline view.

1.  **Update `MasterLogTimeline.tsx`**:
    -   Import `TripManifestSheet`.
    -   Add state: `const [manifestGap, setManifestGap] = useState<{start: OdometerReading, end: OdometerReading} | null>(null);`.
    -   In the gap rendering section (inside the map loop), add a "View Trip Manifest" button.
    -   Wire the button `onClick` to `setManifestGap({ start: prevItem, end: item })`.
    -   Render the `TripManifestSheet` at the bottom of the component, passing the `manifestGap` state (controlled by `!!manifestGap`) and an `onClose` handler that clears the state.

## Phase 4: Data Fetching in Manifest
**Goal:** Load the actual trips when the sheet opens.

1.  **Implement Data Loading in `TripManifestSheet`**:
    -   Add state for `trips` (`Trip[]`) and `loading` (`boolean`).
    -   Add a `useEffect` that triggers when `startAnchor` or `endAnchor` changes.
    -   Call `mileageCalculationService.getTripsForPeriod` inside the effect.
    -   Handle loading state (show spinner) and error state (show error message).

## Phase 5: Manifest Content - Summary Header
**Goal:** Show the context of the gap (Physical vs Digital).

1.  **Build the Header UI**:
    -   Display the date range of the gap.
    -   Show the "Physical Gap": Start Odometer -> End Odometer (and total Δ).
    -   Show the "Digital Sum": Total Trip Distance & Trip Count.
    -   Calculate and show "Variance" or "Personal Mileage" (Physical - Digital).
    -   Use the "Business-First" styling (clean metrics, verified badges).

## Phase 6: Manifest Content - Trip List Structure
**Goal:** Render the trips in an organized list.

1.  **Implement Trip List**:
    -   Create a scrollable area for the list.
    -   Map through the `trips`.
    -   Render a card or row for each trip showing:
        -   Time (HH:mm)
        -   Platform (Uber/Lyft icon/text)
        -   Distance (km)
        -   Status (Completed/Cancelled)
    -   Add an empty state ("No trips found for this period").

## Phase 7: Grouping & Sorting
**Goal:** Improve readability by grouping trips by day.

1.  **Group Trips**:
    -   Helper function to group trips by date (YYYY-MM-DD).
    -   Sort groups chronologically (or reverse, depending on preference - usually chronological for a manifest).
    -   Render sticky headers for each date group (e.g., "Jan 5, 2024").

## Phase 8: Final Polish & Testing
**Goal:** Ensure a seamless user experience.

1.  **Refine UI**:
    -   Add source icons to the Start/End anchors in the header (using the `getSourceIcon` logic - might need to duplicate or export it).
    -   Ensure mobile responsiveness (Sheet works well on mobile).
    -   Verify that clicking "Close" works correctly.
    -   Test edge cases:
        -   Gap with 0 trips.
        -   Gap where trips > physical distance (Anomaly).
