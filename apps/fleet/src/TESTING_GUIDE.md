# Roam "Business-First" Fuel System - Testing Guide

This guide outlines the steps to verify the new "Business-First" fuel logic, where the company pays for fuel by default and personal usage is calculated as a residual value.

## Prerequisites
- Ensure you are logged in as a **Driver** for Section 1.
- Ensure you are logged in as a **Fleet Manager** (Admin) for Section 2.
- *Note: In the current dev environment, you may switch roles or use separate browser windows.*

---

## Scenario 1: The Full Driver Cycle (Week Flow)

**Goal:** Verify that a driver can check in, log reimbursements, and see the correct "Personal Use" deduction.

### Step 1: Start of Week Check-In
1.  Navigate to the **Driver Dashboard**.
2.  You should see a "Weekly Check-In" prompt (if it's a new week).
3.  Click **Check In**.
4.  Enter a **Start Odometer** (e.g., `10,000` km).
5.  Upload a dummy photo (optional).
6.  Submit.
    *   *Verify:* The prompt disappears.

### Step 2: Simulate Business Activity
*   *Note: This usually happens automatically via Uber/Lyft integration.*
*   **Action:** Ensure there are `Trips` recorded for this driver in the current week.
    *   *Example:* 10 Trips, Total Distance = `500` km.

### Step 3: Log a Fuel Purchase (Cash/Reimbursement)
1.  Navigate to **Fuel & Expenses** > **Log Fuel**.
2.  Select **Payment Method**: `Cash / Reimbursement`.
3.  Enter **Amount**: `$50.00`.
4.  Check **"Was this for business use?"** (Should be checked by default).
5.  Submit.
    *   *Verify:* The entry appears in the log as "Reimbursement Pending".

### Step 4: End of Week Check-In (Simulated)
1.  *Dev Note:* You may need to manually trigger the check-in modal again or wait for the next "prompt logic" (usually next Monday).
2.  For testing, assume the week ends.
3.  Enter **End Odometer**: `10,800` km.
    *   *Calculation:*
        *   Total Delta: `800` km (10,800 - 10,000).
        *   Business Trips: `500` km.
        *   **Residual Personal:** `300` km (800 - 500).

### Step 5: Verify Earnings & Deductions
1.  Navigate to **Earnings**.
2.  Look for the **"Reimbursements"** section.
    *   *Verify:* You see `+$50.00` (Pending or Approved).
3.  Look for **"Deductions"**.
    *   *Verify:* You see a deduction for the `300 km` of Personal Use (Calculated at the fleet rate, e.g., $0.15/km = $45.00).

---

## Scenario 2: The Manager Review (Reconciliation)

**Goal:** Verify the Fleet Manager can see the waterfall logic and approve reimbursements.

### Step 1: Fuel Reconciliation Report
1.  Navigate to **Fleet Dashboard** > **Financials** (or Fuel Reports).
2.  Open the **Reconciliation Table**.
3.  Locate the Driver/Vehicle from Scenario 1.
4.  **Verify Columns:**
    *   **Total Spend:** `$50.00`
    *   **Paid by Driver:** `$50.00` (The cash entry).
    *   **Deduction:** `~$45.00` (The personal mileage cost).
    *   **Net Pay:** `+$5.00` ($50 Reimbursement - $45 Deduction).

### Step 2: Verify Mileage Waterfall
1.  Click on the Driver or "View Stats" to open the **Driver Fuel Stats** (if accessible to Admin, otherwise verify in Driver View).
2.  Locate the **"Mileage Breakdown"** card.
3.  **Verify the Waterfall:**
    *   Total Odometer Change: `800 km`
    *   (-) Business Trips: `500 km`
    *   (=) Personal Usage: `300 km`

### Step 3: Export Data
1.  In the **Reconciliation Table**, click **Export CSV**.
2.  Open the CSV file.
3.  *Verify:* The columns `PaidByDriver` and `NetPay` exist and contain the correct values.

---

## Scenario 3: Safety Nets (Alerts)

**Goal:** Trigger the new automated alerts.

### Test A: Fuel Leakage Alert
1.  Create a Fuel Entry for a vehicle with **High Cost** ($100) but **Zero Trips** for the week.
2.  Navigate to **Dashboard** > **Alerts**.
3.  *Verify:* A **"Fuel Leakage Detected"** alert appears (Severity: High).
    *   *Message:* "Spend ($100) exceeds estimate ($0)..."

### Test B: Missing Check-In Alert
1.  Identify an active driver (has trips this week).
2.  Ensure they have **NOT** submitted a check-in for the current week.
3.  Navigate to **Dashboard** > **Alerts**.
4.  *Verify:* A **"Missing Weekly Check-In"** alert appears (Severity: Medium).

---

## Troubleshooting
*   **No Alerts?** Alerts are generated based on *current week* data. Ensure the dates of your Trips and Fuel Entries match the current week (starting Monday).
*   **Wrong Calculations?** Check `services/fuelCalculationService.ts`. Ensure `totalDistance` is being derived correctly from the `Odometer History` entries created by the Check-In.