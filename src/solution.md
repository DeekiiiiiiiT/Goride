# Plus Code-Anchored Geofence Radius Implementation

## Problem Statement

The geofence radius is currently hardcoded to 150m everywhere:
- `spatialNormalization.ts` line 39: `station.location?.radius || 150`
- `SpatialIntegrityMap.tsx` line 150: `feature.properties.radius || 150`
- `VerifiedStationsTab.tsx` lines 316-317: static text `"High Accuracy"` / `"±150m Match Radius"`
- `StationOverride` type has no `radius` or `geofenceRadius` field
- `AddStationModal.tsx` builds `location: { lat, lng }` with no radius
- `buildContext()` in `StationDatabaseView.tsx` constructs stations without radius
- Plus Code is never used to derive geofence center or radius

150m (300m diameter) covers ~3 city blocks, far too large for a gas station forecourt.

## Goal

Replace the hardcoded 150m with a **per-station configurable `geofenceRadius`** that:
1. Defaults intelligently based on Plus Code precision (11-digit ~3m code = 50m radius)
2. Is editable in the Add/Edit Station modal via a slider
3. Is persisted to KV and flows through all save/load paths
4. Is displayed in the Verified Stations table "Regional Efficiency" column
5. Is used by the Spatial Integrity Map to draw correctly-sized circles
6. Centers the geofence on Plus Code-decoded coordinates when available

---

## Phase 1: Data Model + Utility Functions

**Goal:** Establish the `geofenceRadius` field in the type system and create the smart-default utility function that maps Plus Code precision to a sensible radius.

### Step 1.1 — Add `geofenceRadius` to `StationProfile`

**File:** `/types/station.ts`
**Change:** Add `geofenceRadius?: number;` to the `StationProfile` interface, directly below the `plusCode` field.
**Why below `plusCode`:** These are conceptually linked — the Plus Code determines the anchor point, and `geofenceRadius` determines the fence around it.

```ts
plusCode?: string;
geofenceRadius?: number; // Configurable geofence radius in meters, derived from Plus Code precision
```

### Step 1.2 — Add `geofenceRadius` to `StationOverride`

**File:** `/types/station.ts`
**Change:** Add `geofenceRadius?: number;` to the `StationOverride` interface, directly below the `plusCode` field.
**Why:** Without this, the override (which is what gets saved to KV) can never persist a custom radius.

```ts
plusCode?: string;
geofenceRadius?: number; // Configurable geofence radius in meters
```

### Step 1.3 — Create `getDefaultGeofenceRadius()` utility

**File:** `/utils/plusCode.ts`
**Change:** Add a new exported function `getDefaultGeofenceRadius(plusCode?: string): number`

**Logic:**
- If no Plus Code is provided or it's invalid → return `150` (legacy default, keeps backward compatibility)
- Strip the Plus Code to just digits (remove `+` and any trailing `0`s)
- Count the digit length to determine precision tier:
  - `<= 8` digits (~275m cell) → `150`m (cell is already large, wide fence appropriate)
  - `10` digits (~14m cell) → `75`m (medium precision, tighter fence)
  - `11` digits (~3m cell) → `50`m (high precision, covers forecourt + parking)
  - `>= 12` digits (~0.6m cell) → `30`m (ultra-high precision, tight around pumps)

**Rationale for defaults:**
- A typical gas station forecourt is ~30-60m across
- Phone GPS drift under open sky is ~5-15m
- 50m for an 11-digit code gives ~3m anchor precision + 50m buffer = catches real transactions while rejecting ones across the street

### Step 1.4 — Create `getPlusCodeCellSizeMeters()` utility

**File:** `/utils/plusCode.ts`
**Change:** Add a new exported function that returns the approximate cell dimensions in meters for a given Plus Code. This is useful for contextual display ("Your Plus Code cell is ~3m x 3.5m") and for Phase 5 if we want to draw the cell rectangle.

**Logic:**
- Use the existing `PAIR_CELL_SIZES` array and `GRID_ROWS`/`GRID_COLUMNS` constants
- Convert degree-based cell sizes to approximate meters using `1 degree lat ≈ 111,000m` and `1 degree lng ≈ 111,000m * cos(lat)`
- For Jamaica (~18°N latitude), `cos(18°) ≈ 0.951`, so `1 degree lng ≈ 105,561m`
- Return `{ latMeters: number, lngMeters: number }` for the cell at the code's precision

### Step 1.5 — Verification checklist

- [ ] `StationProfile.geofenceRadius` exists and is optional `number`
- [ ] `StationOverride.geofenceRadius` exists and is optional `number`
- [ ] `getDefaultGeofenceRadius()` returns correct values for each precision tier
- [ ] `getPlusCodeCellSizeMeters()` returns reasonable meter values
- [ ] No existing code is broken (both fields are optional, all existing paths unaffected)

---

## Phase 2: Persistence Pipeline

**Goal:** Wire `geofenceRadius` through every save/load/rebuild path so the field is never silently dropped (the same class of bug that previously affected `plusCode`).

### Step 2.1 — `buildContext()` else branch in `StationDatabaseView.tsx`

**File:** `/components/fuel/stations/StationDatabaseView.tsx`
**Location:** Inside `buildContext()`, the `else` branch (lines ~276-302) where station profiles are explicitly constructed from overrides.
**Change:** Add `geofenceRadius: override.geofenceRadius,` to the object literal.
**Why:** This is the exact same pattern that caused the Plus Code disappearing bug. If `geofenceRadius` is not listed here, it will be silently dropped every time the context rebuilds.

### Step 2.2 — `updateStationDetails()` in `StationDatabaseView.tsx`

**File:** `/components/fuel/stations/StationDatabaseView.tsx`
**Location:** Inside `updateStationDetails()` (lines ~131-148), the explicit field mapping.
**Change:** Add `geofenceRadius: details.geofenceRadius ?? current.geofenceRadius,` (use nullish coalescing `??` not `||` so that `0` is not treated as falsy — even though 0m radius is unlikely, correctness matters).
**Why:** The inline profile edit path and any future edit path that calls `updateStationDetails` must not silently drop the field.

### Step 2.3 — `onUpdate` handler (modal edit) in `StationDatabaseView.tsx`

**File:** `/components/fuel/stations/StationDatabaseView.tsx`
**Location:** The `onUpdate` prop passed to `<AddStationModal>` (around line ~490+).
**Current code:** `const updated = { ...current, ...stationData, id, status: ..., dataSource: ... }`
**Analysis:** The `...stationData` spread WILL include `geofenceRadius` if the modal sends it. But if the modal does NOT send it (e.g., user didn't touch the slider), `geofenceRadius` from `...current` would be overwritten to `undefined`. We need to be explicit:
**Change:** Add `geofenceRadius: stationData.geofenceRadius ?? current.geofenceRadius,` after the `dataSource` line.

### Step 2.4 — `handleSubmit()` in `AddStationModal.tsx`

**File:** `/components/fuel/stations/AddStationModal.tsx`
**Location:** Inside `handleSubmit()`, the `newStation` object construction (lines ~345-360).
**Change:** Add `geofenceRadius` to the `newStation` object. The value comes from the form state (to be added in Phase 3). For now, use `getDefaultGeofenceRadius(finalPlusCode)` as the value so that even before the UI slider exists, new stations get a smart radius.
**Import:** Add `getDefaultGeofenceRadius` to the import from `plusCode.ts`.

### Step 2.5 — `handleImportStations()` in `StationDatabaseView.tsx`

**File:** `/components/fuel/stations/StationDatabaseView.tsx`
**Location:** Inside `handleImportStations()`, where imported stations are constructed.
**Change:** If the imported CSV item has a `plusCode`, set `geofenceRadius: getDefaultGeofenceRadius(item.plusCode)`. If not, omit it (will fall back to 150 at render time).
**Import:** Add `getDefaultGeofenceRadius` to the import from `plusCode.ts`.

### Step 2.6 — Verification checklist

- [ ] Create a station via modal with a Plus Code → `geofenceRadius` is saved to KV
- [ ] Close and reopen the edit modal → `geofenceRadius` is pre-filled correctly
- [ ] `buildContext()` includes `geofenceRadius` for override-only stations
- [ ] `updateStationDetails()` preserves `geofenceRadius` through inline edits
- [ ] `onUpdate` handler preserves `geofenceRadius` through modal edits
- [ ] CSV imports with Plus Codes get a smart default radius
- [ ] Stations without a Plus Code still work (no regressions)

---

## Phase 3: Edit Modal UI — Geofence Radius Control

**Goal:** Add a visible, intuitive control to `AddStationModal.tsx` that lets users set and adjust the geofence radius, with smart defaults driven by Plus Code precision.

### Step 3.1 — Add `geofenceRadius` to form state

**File:** `/components/fuel/stations/AddStationModal.tsx`
**Change:** Add a new state variable `const [geofenceRadius, setGeofenceRadius] = useState<number | null>(null);`
**Why `null` default:** `null` means "user hasn't explicitly set a value yet, use the smart default." This lets us distinguish between "user chose 50m" vs "system defaulted to 50m."

### Step 3.2 — Pre-fill `geofenceRadius` in edit mode

**File:** `/components/fuel/stations/AddStationModal.tsx`
**Location:** Inside the `useEffect` that runs when `isOpen` changes (lines ~63-101).
**Change:** In the `if (editStation)` branch, add:
```ts
setGeofenceRadius(editStation.geofenceRadius ?? null);
```
**In the `else` (reset) branch, add:**
```ts
setGeofenceRadius(null);
```

### Step 3.3 — Auto-set radius when "Verify GPS" completes

**File:** `/components/fuel/stations/AddStationModal.tsx`
**Location:** At the END of `handleVerifyFromPlusCode()`, after coordinates and address are populated.
**Change:** If `geofenceRadius` is still `null` (user hasn't manually set it), auto-calculate:
```ts
if (geofenceRadius === null) {
  setGeofenceRadius(getDefaultGeofenceRadius(fullCode));
}
```
**Why only when null:** If the user previously set a custom radius (e.g., 75m for a truck stop), we don't overwrite it just because they re-verified the GPS.

### Step 3.4 — Add the Geofence Radius UI control

**File:** `/components/fuel/stations/AddStationModal.tsx`
**Location:** Below the Plus Code / GPS section, before the submit button.
**UI Design:**
```
[Geofence Radius]
[===========O--------] 50m
Recommended: 50m (11-digit Plus Code, ~3m precision)
```

**Components needed:**
- A `<Label>` with text "Geofence Radius (meters)" and a tooltip explaining what it is
- A range `<input type="range">` (HTML native slider) with `min={10}` `max={500}` `step={5}`
- A numeric `<Input>` beside the slider showing the exact value (editable)
- A contextual hint line showing the smart default and Plus Code precision
- The hint text changes dynamically based on the Plus Code input:
  - No Plus Code: "Default: 150m (no Plus Code anchor)"
  - 11-digit: "Recommended: 50m (11-digit code, ~3m precision)"
  - 10-digit: "Recommended: 75m (10-digit code, ~14m precision)"

### Step 3.5 — Include `geofenceRadius` in submit

**File:** `/components/fuel/stations/AddStationModal.tsx`
**Location:** Inside `handleSubmit()`, the `newStation` object.
**Change:** Add:
```ts
geofenceRadius: geofenceRadius ?? getDefaultGeofenceRadius(finalPlusCode),
```
This ensures that even if the user never touched the slider, the station still gets a smart default.

### Step 3.6 — Reset on form clear

**File:** `/components/fuel/stations/AddStationModal.tsx`
**Location:** The form reset logic in the `useEffect` (the `else` branch for non-edit mode).
**Change:** `setGeofenceRadius(null);` — already covered in Step 3.2 but verify it's in both branches.

### Step 3.7 — Verification checklist

- [ ] Open "Add Station" modal → slider is hidden/shows default until Plus Code is entered
- [ ] Enter an 11-digit Plus Code → hit Verify GPS → slider auto-sets to 50m
- [ ] Enter a 10-digit Plus Code → hit Verify GPS → slider auto-sets to 75m
- [ ] Manually drag slider to 100m → re-verify GPS → slider stays at 100m (no overwrite)
- [ ] Edit existing station with saved radius → slider pre-fills correctly
- [ ] Submit → station saves with correct `geofenceRadius` value
- [ ] Clear/reset form → slider resets to null/default

---

## Phase 4: Verified Stations Table — Dynamic Radius Display

**Goal:** Replace the hardcoded "High Accuracy / ±150m Match Radius" in the Regional Efficiency column with real data from the station's `geofenceRadius` and Plus Code precision.

### Step 4.1 — Import `getPlusCodePrecision` and `getDefaultGeofenceRadius`

**File:** `/components/fuel/stations/VerifiedStationsTab.tsx`
**Change:** Add to the import from `plusCode.ts`:
```ts
import { encodePlusCode, getPlusCodePrecision, getDefaultGeofenceRadius } from '../../../utils/plusCode';
```

### Step 4.2 — Replace the hardcoded table cell

**File:** `/components/fuel/stations/VerifiedStationsTab.tsx`
**Location:** Lines 314-318, the `<TableCell>` for Regional Efficiency.
**Current code:**
```tsx
<TableCell>
  <div className="flex flex-col text-xs">
    <span className="text-slate-900 font-medium">High Accuracy</span>
    <span className="text-slate-500 text-[10px]">±150m Match Radius</span>
  </div>
</TableCell>
```

**New code logic:**
```tsx
const radius = s.geofenceRadius || getDefaultGeofenceRadius(s.plusCode);
const precision = s.plusCode ? getPlusCodePrecision(s.plusCode) : null;
const isCustom = !!s.geofenceRadius;
const tierColor = radius <= 50 ? 'text-emerald-600' : radius <= 100 ? 'text-amber-600' : 'text-red-600';
const tierLabel = radius <= 50 ? 'Tight' : radius <= 100 ? 'Standard' : 'Wide';
const tierBg = radius <= 50 ? 'bg-emerald-50' : radius <= 100 ? 'bg-amber-50' : 'bg-red-50';
```

**Display:**
- Line 1: Tier label (e.g., "Tight Guardrail") with color coding
- Line 2: `±{radius}m` with font-mono, color-coded
- Line 3 (optional): Plus Code precision if available (e.g., "~3m anchor precision")
- If the radius is the legacy 150m default and there's no explicit `geofenceRadius`, show a subtle "Legacy Default" indicator

### Step 4.3 — Update the table header label

**File:** `/components/fuel/stations/VerifiedStationsTab.tsx`
**Location:** The `<TableHead>` for "Regional Efficiency" (line ~250).
**Change:** Rename to "Geofence Radius" to be clearer about what the column shows.

### Step 4.4 — Verification checklist

- [ ] Station with `geofenceRadius: 50` shows "Tight Guardrail / ±50m" in green
- [ ] Station with `geofenceRadius: 150` shows "Wide Guardrail / ±150m" in red
- [ ] Station without `geofenceRadius` (legacy) shows default based on Plus Code
- [ ] Station without Plus Code or radius shows "±150m / Legacy Default"
- [ ] Plus Code precision is shown when available
- [ ] Column header says "Geofence Radius"

---

## Phase 5: Spatial Integrity Map — Render Real Geofences

**Goal:** Make the Spatial Audit map draw geofence circles using the station's actual `geofenceRadius` and, when a Plus Code exists, center the circle on the Plus Code-decoded coordinates (the true source of truth).

### Step 5.1 — Update `normalizeStationFeature()` in `spatialNormalization.ts`

**File:** `/utils/spatialNormalization.ts`
**Location:** `normalizeStationFeature()` function (lines 24-45).
**Changes:**
1. Import `decodePlusCode` and `getDefaultGeofenceRadius` from `./plusCode`
2. **Radius:** Change `radius: station.location?.radius || 150` to:
   ```ts
   radius: station.geofenceRadius ?? getDefaultGeofenceRadius(station.plusCode),
   ```
3. **Coordinates (geofence center):** If the station has a Plus Code, decode it and use those coordinates as the geofence center. The `station.location` coordinates may have been manually entered or drifted, but the Plus Code is the canonical anchor:
   ```ts
   // Prefer Plus Code-decoded coordinates for geofence center (source of truth)
   let geofenceLat = lat;
   let geofenceLng = lng;
   if (station.plusCode) {
     const decoded = decodePlusCode(station.plusCode);
     if (decoded) {
       geofenceLat = decoded.lat;
       geofenceLng = decoded.lng;
     }
   }
   ```
4. Add `geofenceCenter: [geofenceLat, geofenceLng]` and `hasPlusCodeAnchor: !!station.plusCode` to `properties`

### Step 5.2 — Update `normalizeGeofenceFeature()` in `spatialNormalization.ts`

**File:** `/utils/spatialNormalization.ts`
**Location:** `normalizeGeofenceFeature()` function (lines 99-115).
**Change:** Same radius and coordinate logic as Step 5.1 for consistency.

### Step 5.3 — Update geofence drawing in `SpatialIntegrityMap.tsx`

**File:** `/components/fuel/stations/SpatialIntegrityMap.tsx`
**Location:** The station geofence block (lines 147-162).
**Changes:**
1. Use `feature.properties.geofenceCenter` as the circle center instead of `[lat, lng]` (the station pin location). This means the pin and the geofence may be in slightly different positions — that's correct, because the pin shows where the station was registered and the geofence shows the Plus Code anchor.
2. Remove the `|| 150` fallback from `const radius = feature.properties.radius || 150;` — the normalization layer now handles defaults.
3. Differentiate visual style:
   - Plus Code-anchored geofence: solid border, slightly thicker weight
   - Non-Plus Code geofence: dashed border (less trustworthy anchor)

### Step 5.4 — Update station popup in `SpatialIntegrityMap.tsx`

**File:** `/components/fuel/stations/SpatialIntegrityMap.tsx`
**Location:** The station popup HTML (lines 182-208).
**Changes:**
1. Show "Guardrail Radius: {radius}m" with the actual value (already works, but now shows real data)
2. Add a line for Plus Code precision if available: "Anchor Precision: ~3m (11-digit)"
3. Add an indicator: "Plus Code Anchored" badge (green) or "Coordinate Only" badge (amber)
4. Show whether the radius was explicitly set or auto-defaulted

### Step 5.5 — Verification checklist

- [ ] Station with Plus Code + `geofenceRadius: 50` → 50m circle centered on Plus Code coordinates
- [ ] Station without Plus Code → circle centered on `station.location`, radius from `geofenceRadius` or 150m default
- [ ] Station with Plus Code but no explicit radius → auto-defaults based on Plus Code precision
- [ ] Geofence visually covers just the gas station area (not 3 city blocks)
- [ ] Popup shows correct radius, Plus Code precision, and anchor type
- [ ] Drift lines still connect fueling snapshots to station pin (not to geofence center)
- [ ] No Leaflet rendering errors or crashes
- [ ] Dead Zones and Heatmap layers unaffected
- [ ] Legend still accurate

---

## File Change Summary

| File | Phase | Changes |
|------|-------|---------|
| `/types/station.ts` | 1 | Add `geofenceRadius` to both interfaces |
| `/utils/plusCode.ts` | 1 | Add `getDefaultGeofenceRadius()` and `getPlusCodeCellSizeMeters()` |
| `/components/fuel/stations/StationDatabaseView.tsx` | 2 | Wire `geofenceRadius` through `buildContext`, `updateStationDetails`, `onUpdate`, `handleImportStations` |
| `/components/fuel/stations/AddStationModal.tsx` | 2, 3 | Include `geofenceRadius` in submit; add slider UI + form state |
| `/components/fuel/stations/VerifiedStationsTab.tsx` | 4 | Replace hardcoded "±150m" with dynamic radius display |
| `/utils/spatialNormalization.ts` | 5 | Use `geofenceRadius` and Plus Code center in feature normalization |
| `/components/fuel/stations/SpatialIntegrityMap.tsx` | 5 | Draw geofences with real radius and Plus Code center; update popup |

---

## Risk Mitigation

- **Backward compatibility:** All fields are optional with sensible fallbacks. Existing stations without `geofenceRadius` get auto-defaults via `getDefaultGeofenceRadius()`.
- **No data loss:** We use `??` (nullish coalescing) not `||` for radius to avoid treating `0` as falsy.
- **Same bug class as Plus Code:** Every explicit object construction (`buildContext` else branch, `updateStationDetails`, `onUpdate`) must include `geofenceRadius` — we check all paths in Phase 2.
- **Map stability:** Leaflet cleanup fixes from previous work remain intact. No changes to map initialization or teardown.
