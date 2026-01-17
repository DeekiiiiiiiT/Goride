# Verification & Testing Guide: Fuel AI Auto-Approval

This guide outlines the steps to verify the implementation of the AI Odometer Auto-Approval workflow and Scenario Configuration.

## Prerequisites
- Logged in as an Admin (for Scenario Config)
- Logged in as a Driver (for Expense Submission)
- Access to a vehicle (mock or real)

---

## Test Case A: Happy Path (AI Auto-Approval)
**Goal:** Verify that an AI-verified fuel log is automatically approved and creates an odometer anchor.

1.  **Navigate to Driver Portal**: Go to the "Expenses" tab.
2.  **Start New Log**: Click "Log Expense" -> Select "Fuel".
3.  **Scan Odometer**:
    *   Upload a clear photo of an odometer (or a mock image).
    *   Wait for the "AI Analyzing" animation.
    *   **Action**: Click "Yes, Confirm" when the reading is detected.
4.  **Complete Submission**:
    *   Select Payment Method (e.g., Gas Card).
    *   Review details and Submit.
5.  **Verification**:
    *   **UI Feedback**: Confirm you see the toast: "Expense Auto-Approved & Odometer Verified! 🚀".
    *   **Transaction Status**: In the Expense List, the new transaction should show a green "Approved" badge immediately.
    *   **Anchor Creation**: Go to the Vehicle Detail page (Admin view) -> "Odometer" tab -> "Master Log Timeline". Verify a new "Hard Anchor" exists with the source "Fuel Log".

## Test Case B: Manual Override (Pending Approval)
**Goal:** Verify that manually editing the reading prevents auto-approval.

1.  **Navigate to Driver Portal**: Go to the "Expenses" tab -> "Log Expense" -> "Fuel".
2.  **Scan Odometer**:
    *   Upload an image.
    *   **Action**: Click "No, it's wrong" (or simulate a failure).
3.  **Manual Entry**:
    *   Enter a different odometer value manually.
    *   Provide a reason (e.g., "Glare on screen").
    *   Click "Submit".
4.  **Complete Submission**: Proceed as normal.
5.  **Verification**:
    *   **UI Feedback**: Confirm standard toast: "Expense submitted for approval".
    *   **Transaction Status**: In the Expense List, the transaction should show an amber "Pending" badge.
    *   **No Anchor**: Verify NO new anchor appears in the Master Log Timeline until an Admin approves it manually.

## Test Case C: Fuel Scenarios
**Goal:** Verify creation and assignment of fuel coverage rules.

1.  **Navigate to Admin**: Go to "Fuel Management" -> "Configuration" (or "Fuel Scenarios").
2.  **Create Scenario**:
    *   Click "New Scenario".
    *   Name: "Test Fleet 50/50".
    *   Rule: Fuel -> Percentage Split -> Company 50%, Driver 50%.
    *   Save.
3.  **Assign to Vehicle**:
    *   Go to "Fleet" -> Select a Vehicle.
    *   Click "Edit Specifications" (Pencil icon near Specs).
    *   **Action**: Select "Test Fleet 50/50" from the "Expense Scenario" dropdown.
    *   Save.
4.  **Verification**:
    *   Reload the page.
    *   Open "Edit Specifications" again.
    *   Confirm "Test Fleet 50/50" is still selected.

## Test Case D: Date & Timezone Accuracy
**Goal:** Verify that fuel logs are recorded and displayed with the correct date and time in the Master Log Timeline, regardless of timezone.

1.  **Log a New Expense**:
    *   Go to Driver Portal -> Expenses -> Log Expense (Fuel).
    *   Manually select a specific date (e.g., **Today's Date**).
    *   Note the specific Time entered (e.g., **14:30**).
    *   Complete the submission.
2.  **Verify Timeline**:
    *   Switch to the Admin view -> Vehicle Detail -> Odometer Tab.
    *   Find the new "Fuel Log" entry.
    *   **Check Date**: It should match the date you selected (not the day before).
    *   **Check Time**: It should match the time you entered (e.g., 14:30).
3.  **Verify Legacy Data**:
    *   Look at older entries in the timeline.
    *   They should now appear on the correct day (e.g., "Jan 17") instead of shifting back (e.g., "Jan 16").

---

## Troubleshooting
- **AI Fails**: If the AI mock/service fails, the system defaults to manual entry mode. This is expected behavior.
- **No Anchor**: Ensure the transaction was for "Fuel" and the backend logic in `POST /transactions` was triggered. Check Supabase logs if possible.
- **Wrong Date**: If the date is still off by one day, ensure your browser's timezone matches your system time and that the backend deployment has been updated.
