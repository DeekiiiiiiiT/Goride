# Implementation Plan: Manual Trip Entry System

This document outlines the step-by-step implementation plan to allow both Drivers and Admins to manually log trips into the system.

## Phase 1: Foundation & Data Structure
**Goal:** Prepare the data types and utility functions to ensure consistent data entry.
1.  **Review `Trip` Interface:** Verify `types/data.ts` accommodates manual entries (specifically `platform` enums and status).
2.  **Create Factory Function:** Create a helper utility `utils/tripFactory.ts`.
    *   **Step:** Export a function `createManualTrip(data: ManualTripInput, driverId: string): Trip`.
    *   **Step:** Ensure it generates a unique UUID (using `crypto.randomUUID()`).
    *   **Step:** Set default fields: `status: 'Completed'`, `platform: 'Other'`, `source: 'Manual'`.
    *   **Step:** Handle timestamp formatting (combining Date and Time inputs into ISO string).

## Phase 2: Shared Form Component (UI Layout)
**Goal:** Create the visual interface for the form without binding logic yet.
1.  **Create Component File:** Create `components/trips/ManualTripForm.tsx`.
2.  **Define Props:** `isOpen`, `onClose`, `onSubmit`, `isAdmin`, `drivers` (optional list).
3.  **Scaffold Dialog/Drawer:**
    *   **Step:** Use `Dialog` component for the container (responsive).
    *   **Step:** Add `DialogHeader`, `DialogTitle` ("Log Manual Trip").
4.  **Add Form Fields (Visuals):**
    *   **Step:** Date Picker (or Input type="date") & Time Input.
    *   **Step:** Amount Input (Number, prefix "$").
    *   **Step:** Platform Select (Uber, Lyft, Bolt, Private, Cash, Other).
    *   **Step:** Driver Select (Select component, conditionally rendered if `isAdmin` is true).
    *   **Step:** Notes Textarea.

## Phase 3: Form Logic & Validation
**Goal:** Make the form functional and robust.
1.  **State Management:**
    *   **Step:** Add local state for `formData` (date, time, amount, platform, driverId, notes).
    *   **Step:** Default `date` to today, `time` to current time.
2.  **Validation:**
    *   **Step:** Ensure `amount` is positive.
    *   **Step:** Ensure `driverId` is selected (if Admin).
    *   **Step:** Disable "Submit" button if form is invalid.
3.  **Submission Handler:**
    *   **Step:** Construct the payload.
    *   **Step:** Call `onSubmit(payload)`.
    *   **Step:** Handle loading state (spinner on button).

## Phase 4: Driver Portal Integration
**Goal:** Enable drivers to log their own trips.
1.  **Update `DriverOverview.tsx`:**
    *   **Step:** Import `ManualTripForm`.
    *   **Step:** Add state `isManualTripOpen`.
2.  **Add Trigger Button:**
    *   **Step:** In the "Quick Actions" grid (or Action Drawer), add a new item: "Log Trip".
    *   **Step:** Use `MapPin` or `PlusCircle` icon.
    *   **Step:** `onClick` sets `isManualTripOpen(true)`.
3.  **Implement Handler:**
    *   **Step:** Create `handleTripSubmit`.
    *   **Step:** Use `createManualTrip` utility with `user.id`.
    *   **Step:** Call `api.saveTrips`.
    *   **Step:** On success, close modal and trigger data refresh (if applicable).

## Phase 5: Admin Portal Integration
**Goal:** Enable admins to log trips for any driver.
1.  **Update `TripLogsPage.tsx`:**
    *   **Step:** Import `ManualTripForm`.
    *   **Step:** Add state `isManualTripOpen`.
2.  **Add Trigger Button:**
    *   **Step:** In the page header (next to "Export" or "Filter"), add button "Add Manual Trip".
3.  **Driver List Logic:**
    *   **Step:** Ensure the existing `uniqueDrivers` list is passed to the form component.
4.  **Implement Handler:**
    *   **Step:** Create `handleAdminTripSubmit`.
    *   **Step:** Use `createManualTrip` utility with the *selected* `driverId` from the form.
    *   **Step:** Call `api.saveTrips`.
    *   **Step:** Refresh the trips table.

## Phase 6: API Integration & Feedback Loop
**Goal:** Ensure data is saved and UI updates immediately.
1.  **API Verification:**
    *   **Step:** Verify `api.saveTrips` accepts single-item arrays.
    *   **Step:** Ensure backend (Supabase) allows these inserts (RLS policies should allow auth users to insert trips).
2.  **Toast Notifications:**
    *   **Step:** Add `toast.success` with trip details (Amount, Date) upon success.
    *   **Step:** Add `toast.error` if API fails.
3.  **Refetching:**
    *   **Step:** In `DriverDashboard`, ensure `fetchData` is called after submission to update Earnings cards.
    *   **Step:** In `TripLogsPage`, ensure `fetchTrips` is called to add the new row to the table.

## Phase 7: Mobile Optimization & Testing
**Goal:** Ensure the feature works on small screens (Driver context).
1.  **Responsive Check:**
    *   **Step:** Ensure the Dialog scales down to a full-screen or bottom-sheet on mobile.
    *   **Step:** Verify touch targets for inputs.
2.  **Edge Case Testing:**
    *   **Step:** Test entering a trip for a past date.
    *   **Step:** Test entering a trip with $0 amount (should act as record only).
