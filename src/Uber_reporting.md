# Uber Reporting System Analysis

This document analyzes the structure of Uber's reporting system and outlines strategies for integrating this data into the GoRide platform.

## Executive Summary
Uber provides a suite of CSV reports covering Operations (Trips), Financials (Payments), and Performance (Quality/Activity). By ingesting these specific report types, GoRide can move beyond simple trip logging to full-scale fleet management, automated reconciliation, and performance optimization.

## Data Utilization Strategy

### 1. Trip & Financial Reconciliation (The Core Loop)
**Sources:** `REPORT_TYPE_TRIP_ACTIVITY` + `REPORT_TYPE_PAYMENTS_ORDER`
*   **Linkage:** Join on `Trip UUID`.
*   **Strategy:**
    *   **Source of Truth:** Use `TRIP_ACTIVITY` for operational data (Time, Distance, Locations) and `PAYMENTS_ORDER` for financial data (Fare, Tax, Tip, Service Fee).
    *   **Cash Management:** specifically track the `Cash Collected` column from `PAYMENTS_ORDER`. This allows GoRide to calculate exactly how much cash a driver owes the fleet owner at the end of the week.
    *   **Audit:** Compare `Earnings` vs `Payouts` to identify platform fees and adjustments.

### 2. Automated Driver Performance Reviews
**Sources:** `REPORT_TYPE_DRIVER_QUALITY` + `REPORT_TYPE_DRIVER_ACTIVITY`
*   **Strategy:**
    *   **KPI Dashboard:** Instead of calculating metrics manually (which can be error-prone), directly import:
        *   `Acceptance Rate` & `Cancellation Rate` (Quality Control)
        *   `Driver Ratings` (Customer Satisfaction)
        *   `Online Hours` vs `OnTrip Hours` (Utilization Efficiency)
    *   **Incentives:** Build an automated "Bonus Eligibility" checker based on these official stats (e.g., "Bonus unlocked if Acceptance Rate > 85%").

### 3. Vehicle Profitability & ROI
**Source:** `REPORT_TYPE_VEHICLE_PERFORMANCE`
*   **Strategy:**
    *   **Asset Management:** Track `Earnings Per Hour` and `Total Trips` per `Vehicle Plate Number`.
    *   **Maintenance Decisions:** Identify vehicles with declining `Earnings Per Hour` or high `Cash Collected` (risk) vs low utilization. This data helps decide which cars to retire or repair.

### 4. Fleet-Level Financial Auditing
**Sources:** `REPORT_TYPE_PAYMENTS_ORGANIZATION`
*   **Strategy:**
    *   **Bank Reconciliation:** Use `Payouts` and `End Of Period Balance` to reconcile against actual bank deposits.
    *   **Cash Flow Analysis:** Monitor `NetFare` vs `Total Earnings` to understand the true margin after Uber's cut.

### 5. Leasing & Rental Management (Advanced Feature)
**Sources:** `REPORT_TYPE_RENTAL_PAYMENTS_CONTRACT`
*   **Strategy:**
    *   **Automated Invoicing:** If the fleet leases cars to drivers, use `Amount to charge` (Rental Fee) vs `Driver Earnings` to auto-calculate the weekly settlement statement.
    *   **Debt Tracking:** Monitor `Balance at the end of the period` to track driver debt/credit carryover.

## Implementation Guidelines for Import Module
When processing these files in `ImportsPage.tsx`:
1.  **Auto-Detection:** Detect report type by checking unique headers (e.g., if header has `Acceptance Rate` -> It's `DRIVER_QUALITY`).
2.  **Validation:** Ensure `Trip UUID` exists for Transaction/Trip merges.
3.  **Storage:**
    *   Store **Trips** in the main `trips` table.
    *   Store **Performance Metrics** in a new `driver_stats` table (linked by `Driver UUID` + Date).
    *   Store **Vehicle Stats** in a `vehicle_stats` table (linked by `Vehicle UUID` + Date).

---

## Raw Report Specifications

### REPORT_TYPE_ORGANIZATION
*Generation level:* Parent
*Description:* Provides information about associated organizations like UUID, name, alias.

### REPORT_TYPE_PAYMENTS_ORDER
*Generation level:* Child
*Description:* Report having payment information for orders.
*Key Columns:* `Trip UUID`, `Earnings`, `Payouts`, `Cash Collected`, `Fare Details`, `Taxes`.

### REPORT_TYPE_PAYMENTS_DRIVER
*Generation level:* Parent
*Description:* Report having payment information for the driver.
*Key Columns:* `Driver UUID`, `Total Earnings`, `Refunds and Expenses`, `Cash Collected`.

### REPORT_TYPE_PAYMENTS_ORGANIZATION
*Generation level:* Parent
*Description:* Report having payment information for the organization.
*Key Columns:* `Start Of Period Balance`, `End Of Period Balance`, `NetFare`.

### REPORT_TYPE_DRIVER_QUALITY
*Generation level:* Parent
*Description:* Report having driver quality-related information.
*Key Columns:* `Acceptance Rate`, `Cancellation Rate`, `Driver Ratings`, `Trips Completed`.

### REPORT_TYPE_DRIVER_ACTIVITY
*Generation level:* Parent
*Description:* Report having driver activity-related information.
*Key Columns:* `Online Hours`, `OnTrip Hours`.

### REPORT_TYPE_TRIP_ACTIVITY
*Generation level:* Parent
*Description:* Report having trips related information.
*Key Columns:* `Trip UUID`, `Trip Request Time`, `Trip DropOff Time`, `Trip Distance`, `Trip Status`, `Service Type`.

### REPORT_TYPE_VEHICLE_PERFORMANCE
*Generation level:* Parent
*Description:* Report having vehicle performance-related information.
*Key Columns:* `Vehicle Plate Number`, `Earnings Per Hour`, `Total Trips`.

### REPORT_TYPE_RENTAL_PAYMENTS_CONTRACT
*Generation level:* Parent
*Description:* Report consisting of aggregated payments for rental organization, with one row per contract.
*Key Columns:* `Amount to charge`, `Balance at the end of the period`.
