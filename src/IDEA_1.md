# Smart Unified Restoration - Analysis & Proposal

## Current State Analysis
1.  **Fuel Log Export:** 
    *   Produces a detailed transaction log with financial fields (Screenshot 1).
    *   Columns: `date`, `vehicleId`, `driverId`, `odometer`, `liters`, `amount`, `type`, `location`, `entryMode`.
    *   This functions as the "Financial/Fuel Source of Truth".

2.  **Service Log Export:** 
    *   Distinct export for maintenance records.

3.  **Check-in Export (Currently labeled "Odometer History"):**
    *   **Behavior:** Exports only the entries from the `Odometer Readings` table (mostly Weekly Check-ins).
    *   **Format:** `date`, `vehicleId`, `value`, `source` (Screenshot 2).
    *   **Limitation:** Missing Fuel Logs and Service Logs, making it incomplete as a Master Log.

## Problem
The user requires a single **Master Log** that reflects the "Smart Unified Restoration" strategy: aggregating Fuel, Service, and Check-ins into one timeline. However, the current "Odometer History" export is actually just a "Check-in Export". Overwriting it caused the loss of the specific "Check-in" CSV format.

## Proposal: Split Export Strategy

We should implement a **Multi-Export System** in the Odometer History view to satisfy both requirements (Legacy Check-in format + New Master Log).

### 1. Preserve "Check-in Export"
*   **Action:** Rename the existing "Export Odometer History" action to **"Export Check-ins"**.
*   **Logic:** Continue using the raw `api.getOdometerHistory(vehicleId)` endpoint.
*   **Output:** Matches Screenshot 2 (`date`, `vehicleId`, `value`, `source`).
*   **Use Case:** Legacy imports, specific check-in auditing.

### 2. Implement "Master Log Export"
*   **Action:** Add a new **"Export Master Log"** button.
*   **Logic:** Export the **Unified History** (the data currently displayed in the Timeline UI).
*   **Format:** Standardized Audit Format.
    *   `Date` (YYYY-MM-DD)
    *   `Time` (HH:MM)
    *   `Odometer` (Value)
    *   `Source` (Fuel Log, Weekly Check-in, Service Log, Manual)
    *   `Reference ID` (For data integrity/linking)
    *   `Driver`
*   **Use Case:** The "Master Checklist" mentioned in requirements. This file will be used to cross-reference the Fuel and Service sheets.

## Technical Implementation Steps

1.  **Update `OdometerHistory.tsx`:**
    *   Add a **Dropdown Menu** for the Export button.
    *   Option 1: **"Export Master Log"** (Triggers unified export from UI state).
    *   Option 2: **"Export Check-ins"** (Triggers raw fetch export).

2.  **Refine Export Logic:**
    *   Ensure `Master Log` uses capitalized headers (`Date`, `Odometer`, `Source`) for readability.
    *   Ensure `Check-in Log` keeps raw lowercase headers (`date`, `vehicleId`, `value`) to match Screenshot 2.

3.  **Import Compatibility:**
    *   The Master Log's inclusion of `Reference ID` and `Source` will allow future import logic to "Smartly" map rows back to their original tables (Fuel vs Odometer vs Service) or skip duplicates.

This approach ensures zero loss of functionality while delivering the new Master Log feature.
