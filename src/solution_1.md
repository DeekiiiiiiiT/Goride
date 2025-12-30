# Solution Implementation Plan: Ride-Share Fleet Management Enhancements

This document outlines the step-by-step plan to implement the features described in `Idea_1.md` into the existing Figma Make application.

---

## **Phase 1: Data Architecture & Tier Engine Foundation**
**Objective:** Replace hardcoded tier logic with a dynamic, configurable system and establish the data structures for expense splits.

### **Step 1.1: Update Data Models**
- **Action:** Modify `/types/data.ts`.
- **Details:**
  - Define `TierConfig` interface: `{ id: string, name: string, minEarnings: number, maxEarnings: number, sharePercentage: number }`.
  - Define `ExpenseSplitRule` interface: `{ category: string, companyShare: number, driverShare: number }`.
  - Update `DriverProfile` to include `tierConfigId` or explicit `currentTierName`.

### **Step 1.2: Implement Tier Configuration Store**
- **Action:** Create `TierService.ts` and `ExpenseService.ts`.
- **Details:**
  - Use `kv_store` (or existing API patterns) to save and retrieve the Global Tier Configuration.
  - Create a default seed function to populate the initial tiers (Tier 1: $0-75k, Tier 2: $75k-150k, etc.) if they don't exist.

### **Step 1.3: Create Tier Calculation Engine**
- **Action:** Create `/utils/tierCalculations.ts`.
- **Details:**
  - Function `calculateDriverTier(cumulativeEarnings: number, configs: TierConfig[])`: Returns the correct tier object.
  - Function `calculateNextTierProgress(cumulativeEarnings: number, currentTier: TierConfig)`: Returns percentage (0-100) and distinct formatting for "MAX" level.

### **Step 1.4: Admin Tier Settings UI**
- **Action:** Update `/components/settings/SettingsPage.tsx` or create a new `TierSettings.tsx` tab.
- **Details:**
  - Create a table allowing Admins to Add/Edit/Delete tiers.
  - Inputs: Name, Threshold ($), Profit Share (%).
  - "Save" button to persist changes to the backend/store.

---

## **Phase 2: Driver Portal - Tier Visibility & KPIs**
**Objective:** Give drivers immediate visibility into their standing and progress towards the next payout level.

### **Step 2.1: Update Driver Dashboard Header**
- **Action:** Modify `/components/driver-portal/DriverDashboard.tsx`.
- **Details:**
  - Integrate `calculateDriverTier` to determine current status based on the driver's total earnings.
  - Add the **Progress Bar** component: Visual indicator of `{current_earnings} / {next_tier_threshold}`.
  - Display "Current Share %" prominently.

### **Step 2.2: Detailed Earnings Breakdown**
- **Action:** Enhance `/components/driver-portal/DriverEarnings.tsx`.
- **Details:**
  - Add a **"Tier Calculation"** section below the charts.
  - Show: Cumulative Earnings (Before this week) + This Week = New Cumulative.
  - Show: Estimated Payout based on the Tier % share.

### **Step 2.3: Mobile Responsiveness Check**
- **Action:** Verify CSS.
- **Details:**
  - Ensure the new Progress Bar and Stats Cards stack correctly on mobile screens (since this is the "Driver App").

---

## **Phase 3: Driver Portal - Expense Logging**
**Objective:** Allow drivers to submit expenses (Fuel, Maintenance) directly from their portal for Admin review.

### **Step 3.1: Create Expense Log UI**
- **Action:** Create `/components/driver-portal/DriverExpenses.tsx`.
- **Details:**
  - **Form Fields:**
    - Category (Dropdown: Fuel, Maintenance, Other).
    - Amount (Input).
    - Date (DatePicker).
    - Notes (Text Area).
    - Receipt Upload (Use `ImageWithFallback` for preview, but real upload needs to handle file storage or just simulate for now).
  - **History List:** Show recently submitted expenses with status (Pending/Approved).

### **Step 3.2: Integrate Expense Navigation**
- **Action:** Update `/components/driver-portal/DriverLayout.tsx`.
- **Details:**
  - Add "Expenses" to the bottom navigation bar or sidebar menu.

### **Step 3.3: Backend Submission Logic**
- **Action:** Update API/Service.
- **Details:**
  - When a driver submits an expense, create a `FinancialTransaction` record with `status: 'Pending'` and `source: 'Driver_Submission'`.

---

## **Phase 4: Admin Tools - Fuel Split & Expense Processing**
**Objective:** Provide Admins the tools to process expenses and automatically apply the 50/50 split rules.

### **Step 4.1: Fuel Split Calculator Utility**
- **Action:** Create `/components/finance/FuelSplitCalculator.tsx`.
- **Details:**
  - **Input:** Total Fuel Bill Amount.
  - **Logic:** Automatically calculate 50% Company / 50% Driver.
  - **Output:** Visual breakdown of the split.
  - **Action:** "Create Transactions" button that generates two records:
    1. Expense (Category: Fuel, Amount: -50%).
    2. Driver Debit (Category: Fuel Charge, Amount: -50%).

### **Step 4.2: Pending Expense Review Queue**
- **Action:** Update `/components/transactions/TransactionsPage.tsx` or create `ExpenseReview.tsx`.
- **Details:**
  - List all transactions with `status: 'Pending'`.
  - Actions: **Approve** (Applies the Split Logic automatically), **Reject**, **Edit**.

### **Step 4.3: Configuration for Splits**
- **Action:** Add to Global Settings.
- **Details:**
  - Allow changing the default Fuel Split % (e.g., from 50/50 to 60/40) without changing code.

---

## **Phase 5: Admin Dashboard - Profit & Income Statement**
**Objective:** Implement the "Income Statement" visualization to track profitability.

### **Step 5.1: Refactor Financials View**
- **Action:** Modify `/components/dashboard/FinancialsView.tsx`.
- **Details:**
  - Remove generic widgets.
  - Implement the **2-Column Layout** from `Idea_1.md`.

### **Step 5.2: Left Column - Income Statement Logic**
- **Action:** Implement aggregation logic.
- **Details:**
  - **Revenue:** Sum of all 'Fare' + 'Other Income'.
  - **Expenses (Grouped):**
    - Fixed: Maintenance, Insurance, Software Fees.
    - Variable: Fuel (Company Share).
  - **Driver Payouts:** Calculated sum of Driver Earnings.
  - **Net Profit:** Revenue - (Expenses + Payouts).

### **Step 5.3: Right Column - Visualizations**
- **Action:** Add Charts.
- **Details:**
  - **Expense Pie Chart:** Fixed vs. Fuel vs. Payout.
  - **Trend Bar Chart:** Revenue vs. Profit (Last 8 weeks).
  - **Comparison Cards:** "This Month vs Last Month".

---

## **Phase 6: Advanced Reporting & Driver Management**
**Objective:** Tie everything together with detailed per-driver reporting and CSV exports.

### **Step 6.1: Enhanced Driver Detail View**
- **Action:** Update `/components/drivers/DriverDetail.tsx`.
- **Details:**
  - Add the **"Earnings History Table"** tab.
  - Columns: Week | Total Earnings | Tier Applied | Payout Amount.

### **Step 6.2: Report Generator**
- **Action:** Create `/components/reports/ReportGeneratorModal.tsx`.
- **Details:**
  - Selectors: Date Range, Report Type (Profit/Loss, Driver Payouts).
  - Logic: Filter existing data based on selection.
  - Action: Generate PDF/CSV (Re-use existing `exportToCSV` utility).

### **Step 6.3: Final Integration Test**
- **Action:** Walkthrough.
- **Details:**
  - Simulate a full flow:
    1. Driver logs expense.
    2. Admin approves expense (Split applied).
    3. Admin checks Profit Dashboard (Expenses updated).
    4. Driver checks Dashboard (Tier progress updated).

