# Trip Details: Stops & Wait Time Implementation Plan

This document outlines the phased approach to fixing the "Trip Details" view. The goal is to accurately display intermediate stops triggered by the driver (the "Stop" button), showing specific locations and the recorded wait time for each.

## Phase 1: Data Verification & Mocking
**Goal:** Ensure we have a reliable way to test the UI changes without needing to physically drive a vehicle to generate new data.

- [ ] **Step 1.1: Audit Data Interfaces**
    - Review `types/data.ts` (Trip) and `types/tripSession.ts` (TripStop) to confirm all necessary fields (`location`, `durationSeconds`, `arrivalTime`) are available.
- [ ] **Step 1.2: Create Test Fixture**
    - Define a `MOCK_TRIP_WITH_STOPS` object within `TripDetailsDialog.tsx` (commented out by default).
    - This object will simulate a trip with:
        - 1 Pickup
        - 2 Intermediate "Stop Button" events (one short wait, one long wait).
        - 1 Dropoff
    - This allows us to instantly verify UI changes.

## Phase 2: Timeline UI Refactor
**Goal:** Refactor the current hardcoded "Pickup -> Dropoff" HTML structure into a dynamic list that can handle *N* number of stops.

- [ ] **Step 2.1: Design "Stop Node" Component**
    - Create a reusable render helper or component for a single timeline event.
    - Define styles for:
        - **Pickup:** Green/Blue dot (existing).
        - **Intermediate Stop:** Amber/Slate dot (new). Must look distinct to indicate it's a "Wait" point.
        - **Dropoff:** Red dot (existing).
- [ ] **Step 2.2: Implement Vertical Connector Logic**
    - Ensure the vertical line (`border-l`) connects all dots seamlessly, regardless of the number of stops.
    - Handle the "Last Item" case (dropoff) where the line should stop.

## Phase 3: Integration & Wait Time Display
**Goal:** Connect the real `trip.stops` data to the new UI and display the specific wait time metrics.

- [ ] **Step 3.1: Map `trip.stops`**
    - In `TripDetailsDialog.tsx`, write the logic to merge Pickup, `trip.stops`, and Dropoff into a single chronological list for rendering.
- [ ] **Step 3.2: Render Wait Times**
    - For each intermediate stop, calculate the duration string (e.g., "3m 12s").
    - Add a `Clock` icon and the duration text next to the address.
- [ ] **Step 3.3: High-Visibility Alerts**
    - Implement conditional styling for "Long Stops" (e.g., > 2 minutes).
    - Make the text red or add an alert icon if the wait time was significant.

## Phase 4: Summary Metrics & Polish
**Goal:** Surface the aggregate impact of these stops (Total Wait Time) in the trip summary.

- [ ] **Step 4.1: Calculate Total Trip Wait Time**
    - Create a helper to sum `durationSeconds` from all stops in the `stops` array.
- [ ] **Step 4.2: Update Header Metrics**
    - Add a "Total Wait" metric block alongside "Distance" and "Duration" in the top section of the dialog.
- [ ] **Step 4.3: Final Review**
    - Verify Dark Mode appearance.
    - Remove the Mock Data from Phase 1.
