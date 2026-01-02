# Location Intelligence Implementation Plan

## Goal
Enhance the Manual Trip Entry form with "Uber-like" location features:
1. One-click "Current Location" capture.
2. Address Autocomplete/Search.
3. Integration with external navigation apps.

## Strategy
We will replace standard text inputs with a smart `LocationInput` component backed by OpenStreetMap (Nominatim) services.

---

### Phase 1: Geolocation & Reverse Geocoding Utilities
**Objective:** Build the core logic to get GPS coordinates and convert them to human-readable addresses.
- [ ] **Step 1.1:** Create `utils/locationService.ts`.
- [ ] **Step 1.2:** Implement `getCurrentPosition()` wrapper around `navigator.geolocation` to handle permissions and Promise-based responses.
- [ ] **Step 1.3:** Implement `reverseGeocode(lat, lon)` function that calls OpenStreetMap Nominatim API (`https://nominatim.openstreetmap.org/reverse`).
- [ ] **Step 1.4:** Define TypeScript interfaces for the API responses to ensure type safety.

### Phase 2: Address Search (Autocomplete) Logic
**Objective:** Build the logic to search for addresses based on user text input.
- [ ] **Step 2.1:** Update `utils/locationService.ts`.
- [ ] **Step 2.2:** Implement `searchAddress(query)` function calling OpenStreetMap API (`https://nominatim.openstreetmap.org/search`).
- [ ] **Step 2.3:** Implement a `debounce` utility to prevent API rate limiting (only search after user stops typing for 300-500ms).
- [ ] **Step 2.4:** Test the API search manually to verify response format.

### Phase 3: Smart Location Input Component (UI Skeleton)
**Objective:** Create the reusable UI component that will replace the simple text boxes.
- [ ] **Step 3.1:** Create `components/ui/LocationInput.tsx`.
- [ ] **Step 3.2:** Design the component layout: An input field with a specific "Right Side" area for action icons.
- [ ] **Step 3.3:** Add the "Green Map Pin" icon trigger for the Current Location feature.
- [ ] **Step 3.4:** Add the visual container for the Autocomplete Dropdown (initially hidden).
- [ ] **Step 3.5:** Ensure it accepts standard props (`value`, `onChange`, `placeholder`) to be compatible with the existing form.

### Phase 4: Integrating "Current Location" Feature
**Objective:** Make the Green Map Pin functional.
- [ ] **Step 4.1:** Import utilities from Phase 1 into `LocationInput.tsx`.
- [ ] **Step 4.2:** Implement specific `handleUseCurrentLocation` function:
    - Set loading state (spinner icon).
    - Call `getCurrentPosition`.
    - Call `reverseGeocode`.
    - Update the input value with the result.
- [ ] **Step 4.3:** Add error handling (e.g., Toast notification if GPS is denied).

### Phase 5: Integrating Autocomplete Feature
**Objective:** Enable type-ahead address searching.
- [ ] **Step 5.1:** Connect the Input `onChange` to the `searchAddress` utility from Phase 2.
- [ ] **Step 5.2:** Manage state for `suggestions` (array of results) and `isLoading`.
- [ ] **Step 5.3:** Render the suggestions in the Dropdown container created in Phase 3.
- [ ] **Step 5.4:** Implement `handleSelectAddress(address)`:
    - Update input value.
    - Clear suggestions.
    - Close dropdown.
- [ ] **Step 5.5:** Implement "Click Outside" logic to close the dropdown if the user clicks away.

### Phase 6: Final Integration & Navigation Handoff
**Objective:** Plug the new component into the main form and add the "Navigate" button.
- [ ] **Step 6.1:** Open `components/trips/ManualTripForm.tsx`.
- [ ] **Step 6.2:** Replace the standard `Input` fields for "Pickup" and "Dropoff" with the new `LocationInput` component.
- [ ] **Step 6.3:** Add a "Navigate" button (Arrow icon) next to the Dropoff field.
- [ ] **Step 6.4:** Implement `openNavigationApp(address)` function:
    - Constructs a Universal Link for Google Maps (`https://www.google.com/maps/dir/?api=1&destination=...`).
    - Opens in a new tab/window.
- [ ] **Step 6.5:** Verify the entire flow: Locate -> Auto-fill -> Submit.
