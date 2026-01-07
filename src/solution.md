# Toll Activity Ledger Refactor Plan

## Context
Refactoring the "Toll Activity" ledger in `DriverDetail.tsx` to use a standard accounting format with separate "Debit" (Charge) and "Credit" (Reimbursement) columns, replacing the ambiguous single "Amount" column.

## Phase 1: Logic Standardization
**Goal:** Centralize the logic for determining transaction impact (Debit vs Credit) to ensure the Table and Net Calculation are always in sync.

1.  **Define Transaction Types:**
    *   **Credit (Reimbursement):**
        *   Categories: `['Toll Usage', 'Toll', 'Tolls', 'Expense']`
        *   Visual: Green Text, Green Badge.
        *   Meaning: Money owed to driver (or reducing their debt).
    *   **Debit (Charge):**
        *   Categories: `['Adjustment', 'Claim', 'Chargeback']`
        *   Visual: Red Text, Red Badge.
        *   Meaning: Money charged to driver (increasing their debt).

2.  **Implementation Step:**
    *   Create a helper logic block inside `DriverDetail.tsx` (or a utility function) that accepts a transaction and returns its type (`debit` | `credit`).
    *   Refactor the **Net Toll Reimbursement** calculation to use this explicit logic instead of the current inline check.
    *   *Verification:* Ensure the Net Calculation remains correct ($285 Credit - $10 Debit = $275 Net).

## Phase 2: UI Implementation (Column Split)
**Goal:** Update the Table structure to split the Amount column.

1.  **Update Table Headers:**
    *   Remove the single `Amount` header.
    *   Add `Debit (Charge)` header (Right-aligned, Red text).
    *   Add `Credit (Reimbursement)` header (Right-aligned, Emerald text).

2.  **Update Table Rows:**
    *   For each transaction, determine if it is Debit or Credit.
    *   **Debit Column Cell:**
        *   If Debit: Show Amount (Red).
        *   If Credit: Show `-` or empty.
    *   **Credit Column Cell:**
        *   If Credit: Show Amount (Green).
        *   If Debit: Show `-` or empty.
    *   Remove `+/-` signs from the values (the column implies the sign).

## Phase 3: Styling & Responsiveness
**Goal:** Ensure the new table layout is clean, responsive, and visually consistent.

1.  **Visual Polish:**
    *   Ensure column widths are appropriate.
    *   Verify the Status Badge colors (Green for Credit, Red for Debit) match the columns.

2.  **Mobile Responsiveness:**
    *   Ensure the table scrolls horizontally if it overflows on small screens (add `overflow-x-auto` wrapper if missing).
    *   Verify headers don't break/wrap awkwardly.
