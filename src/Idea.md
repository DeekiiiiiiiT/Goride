# Cash Wallet Implementation Plan

## Phase 1: Data Model & Backend Foundation
**Goal**: Update the data structures to support rich payment details.
- [ ] **Step 1.1:** Update `FinancialTransaction` interface in `types/data.ts` to include:
  - `paymentMethod`: 'Cash' | 'Bank Transfer' | 'Mobile Money' | 'Check' | 'Other'.
  - `referenceId`: string (optional).
  - `transactionType`: 'Payment' | 'Float_Given' | 'Adjustment'.
  - `status`: 'Pending' | 'Completed' | 'Verified' | 'Void'.
  - `metadata`: Record<string, any> (for flexibility).
- [ ] **Step 1.2:** Update `api.saveTransaction` in `services/api.ts` to ensure these fields are passed correctly to the backend.

## Phase 2: UI Structure - The "Cash Wallet" Tab
**Goal**: Create a dedicated home for wallet operations.
- [ ] **Step 2.1:** Modify `DriverDetail.tsx` to add a new `TabsTrigger` for "Cash Wallet".
- [ ] **Step 2.2:** Create the `TabsContent` container for the new tab.
- [ ] **Step 2.3:** Move the `Transaction Ledger` component from its current location to this new tab.
- [ ] **Step 2.4:** Move the `Net Outstanding` summary card to this new tab.
- [ ] **Step 2.5:** Ensure the "Log Cash Payment" button is accessible within this tab.

## Phase 3: Enhanced "Log Payment" Modal
**Goal**: Capture precise payment details.
- [ ] **Step 3.1:** Update `LogCashPaymentModal.tsx` state to manage `method`, `referenceId`, and `transactionType`.
- [ ] **Step 3.2:** Add a "Payment Type" toggle:
  - **Receive Payment** (Reduces Driver Debt).
  - **Give Float** (Increases Driver Debt).
- [ ] **Step 3.3:** Add a "Payment Method" selector (Dropdown/Radio).
- [ ] **Step 3.4:** Add a "Reference ID" input field (visible for non-cash methods).
- [ ] **Step 3.5:** Implement logic to handle "Float" as a negative transaction amount (Outflow) so it correctly increases the Net Outstanding balance.

## Phase 4: Enhanced Ledger Table
**Goal**: Visualize the new data fields.
- [ ] **Step 4.1:** Update the table in `DriverDetail.tsx` to show "Method", "Reference", and "Status".
- [ ] **Step 4.2:** Add status badges (e.g., Yellow for "Pending", Green for "Verified").
- [ ] **Step 4.3:** Format "Float" entries differently (e.g., distinctive icon or color) to distinguish them from payments.

## Phase 5: Wallet Dashboard & Summary Cards
**Goal**: Provide at-a-glance financial health.
- [ ] **Step 5.1:** Implement "Wallet State" calculations in `DriverDetail`:
  - `Float Held`: Total value of active floats.
  - `Pending Clearance`: Total of unverified bank transfers.
- [ ] **Step 5.2:** Create new Summary Cards in the Cash Wallet tab to display these metrics alongside "Net Outstanding".

## Phase 6: Verification Workflow
**Goal**: Reconcile bank transfers.
- [ ] **Step 6.1:** Add a "Verify" action button to the Ledger Table for transactions with "Pending" status.
- [ ] **Step 6.2:** Implement the `handleVerifyTransaction` function to update the status to "Verified" and persist it via the API.

## Phase 7: Mobile Responsiveness & Polish
**Goal**: Ensure a smooth experience on all devices.
- [ ] **Step 7.1:** Verify the new Modal layout on mobile screens.
- [ ] **Step 7.2:** Ensure the Enhanced Ledger Table handles horizontal scrolling gracefully.
- [ ] **Step 7.3:** Conduct final math validation to ensure Float and Payments balance correctly.
