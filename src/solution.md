# Trip Route Visualization Implementation Plan

We are upgrading the "Live Trip" system to continuously track the driver's location (breadcrumbs) and visualize the route.

## Phase 1: Location Tracking Engine
**Goal:** Implement the logic to continuously capture, filter, and persist GPS coordinates during an active trip.

- [ ] **Step 1.1: Define Data Structures**
    - Define `RoutePoint` interface (lat, lon, timestamp, accuracy, speed).
    - Update `TripSession` interface to include `route: RoutePoint[]`.
- [ ] **Step 1.2: Create `useTripTracker` Hook**
    - Implement `useTripTracker` to wrap `navigator.geolocation.watchPosition`.
    - Implement a filtering algorithm (e.g., only record points if distance > 10m from last point) to reduce noise and data size.
    - Handle permission errors and GPS dropouts gracefully.
- [ ] **Step 1.3: Integrate with `TripTimer`**
    - Update `TripTimer.tsx` to use the hook.
    - Start tracking when the user clicks "Start Trip".
    - Stop tracking when the user clicks "Complete Trip".
- [ ] **Step 1.4: Persistence Strategy**
    - Update the `localStorage` logic in `TripTimer` to save the accumulating `route` array.
    - Ensure the route is restored correctly if the page is reloaded.

## Phase 2: Active Trip Visualization (Live Map)
**Goal:** Provide visual feedback to the driver that their route is being recorded.

- [ ] **Step 2.1: Setup Map Library**
    - Install/Import `react-leaflet` and `leaflet` (and their CSS).
    - Create a reusable `LeafletMap` component that can accept a route and markers.
- [ ] **Step 2.2: Integrate Map into `TripTimer`**
    - Add a "Show Map" toggle or expandable section in `TripTimer`.
    - Render the `LeafletMap` displaying the current `route` as a Polyline.
    - Show a marker for the "Current Location".

## Phase 3: Data Handoff Integration
**Goal:** Pass the captured route data from the timer to the dashboard and form.

- [ ] **Step 3.1: Update Callback Signatures**
    - Update `TripTimer`'s `onComplete` prop to include the `route` array.
    - Update `DriverDashboard` state `tripInitialData` to store the route.
- [ ] **Step 3.2: Update Form Props**
    - Update `ManualTripForm` props (`initialData`) to accept the `route`.
    - Update `ManualTripInput` type definition to potentially hold route data (or keep it separate until submission).

## Phase 4: Route Visualization in ManualTripForm
**Goal:** Display the recorded route in the completion form so the driver can verify it.

- [ ] **Step 4.1: Create `TripRouteMap` Component**
    - A specialized version of the map component designed for the form (static/read-only view).
    - Auto-fit the map bounds to show the entire route.
- [ ] **Step 4.2: Embed in `ManualTripForm`**
    - Insert the map component into the `ManualTripForm` layout (likely between locations and stats).
    - Visualize the Start Point (Green Marker), End Point (Red Marker), and the path (Blue Line).

## Phase 5: Backend Persistence
**Goal:** Save the recorded route data to the database.

- [ ] **Step 5.1: Update Data Models**
    - Update the `Trip` interface in `types/data.ts` to include a `route` or `path` field (JSON type).
    - Update `ManualTripInput` in `utils/tripFactory.ts` to accept the route.
- [ ] **Step 5.2: Update Factory Logic**
    - Modify `createManualTrip` to attach the `route` data to the generated Trip object.
- [ ] **Step 5.3: Verify API Payload**
    - Ensure `api.saveTrips` transmits the new field correctly to Supabase.

## Phase 6: History & Summary Visualization
**Goal:** Allow drivers to see the route of their past trips.

- [ ] **Step 6.1: Update `DriverHistory`**
    - Add a "View Route" button or modal to the history items.
- [ ] **Step 6.2: Render Historical Routes**
    - Use the map component to display the saved route data for completed trips.
    - Handle cases where older trips do not have route data (graceful fallback).
