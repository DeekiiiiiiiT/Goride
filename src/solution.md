# Live Trip Timer Implementation

## Phase 1: Setup and Definitions
- [ ] Define the `TripSession` interface to track the state of an active trip.
  - Properties: `isActive` (boolean), `startTime` (number | null), `startLocation` (string | null), `startCoords` ({ lat, lon } | null).
- [ ] Update `ManualTripInput` interface if needed, or ensure the component can handle "initial values" separately from "form state".

## Phase 2: TripTimer Component (UI & Logic)
- [ ] Create `components/trips/TripTimer.tsx`.
- [ ] Implement `useTripTimer` hook to handle the stopwatch logic (setInterval).
- [ ] Implement `startTrip` function:
  - Sets `startTime` to `Date.now()`.
  - Sets `isActive` to `true`.
  - Saves state to `localStorage` (key: `current_trip_session`).
- [ ] Implement `stopTrip` function:
  - Calculates duration.
  - Clears `localStorage`.
  - Calls `onComplete(tripData)` prop.
- [ ] Implement UI for "Idle" state (Start Button).
- [ ] Implement UI for "Active" state (Stopwatch + Complete Button).
- [ ] Add "Resume" logic: `useEffect` on mount to check `localStorage` and resume timer if valid.

## Phase 3: GPS Integration
- [ ] Import `getCurrentPosition` and `reverseGeocode` from `utils/locationService`.
- [ ] Update `startTrip` to:
  - Set loading state.
  - Call `getCurrentPosition`.
  - Call `reverseGeocode` to get the address.
  - Store `startLocation` and `startCoords` in state and `localStorage`.
- [ ] Handle errors: If GPS fails, start the timer anyway but leave location empty (user can fill it later).

## Phase 4: Enhancing ManualTripForm
- [ ] Update `ManualTripForm` props to accept optional `initialData`:
  - `initialStartTime` (string HH:mm)
  - `initialEndTime` (string HH:mm)
  - `initialDuration` (number minutes)
  - `initialPickupLocation` (string)
  - `initialPickupCoords` ({ lat, lon })
- [ ] Update `ManualTripForm` logic:
  - If `initialData` is present, populate the form fields on mount.
  - Ensure the "Duration" logic respects the passed value (maybe display it prominently).
  - Pre-fill `pickupLocation` and set `pickupCoords` state so distance calculation works later when drop-off is entered.

## Phase 5: Integration with DriverDashboard
- [ ] Import `TripTimer` in `components/driver-portal/DriverDashboard.tsx`.
- [ ] Create a handler `handleTripComplete(data)` in Dashboard:
  - Sets `manualTripFormOpen` to true.
  - Sets a new state `tripInitialData` with the results from the timer.
- [ ] Pass `tripInitialData` to `ManualTripForm`.
- [ ] Replace the "Log Trip" button in the Quick Actions section with the new `TripTimer` widget (or place it above Quick Actions for visibility).

## Phase 6: Testing & Refinement
- [ ] Verify "Browser Refresh": Start trip -> Refresh page -> Timer should continue from correct time.
- [ ] Verify "GPS Flow": Start trip -> Wait for location -> Location appears -> Complete -> Form opens with Address.
- [ ] Verify "End to End": Save the form -> Trip appears in list with correct duration and distance (once dropoff entered).
- [ ] UX Polish: Ensure the timer is large and easy to read.

