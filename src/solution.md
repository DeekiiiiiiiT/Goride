# Solution: Fix Hidden/Ignored Transactions in Toll Ledger

## Phase 1: Implement Toll Relevance Filtering
- [x] **Step 1:** Open `components/drivers/DriverDetail.tsx` and locate the `cashTollTransactions` useMemo hook (approx line 219).
- [x] **Step 2:** Inside the `processed.forEach` loop, define a helper check `isTollRelated(tx)` that returns true only if the transaction is relevant to Toll Activity (e.g., categories like 'Toll Usage', 'Toll', 'Adjustment', 'Claim', or descriptions containing 'toll').
- [x] **Step 3:** Modify the condition for pushing to the `hidden` array. It should only push if `classification` is ('Ignored' OR 'Pending_Dispute') AND `isTollRelated` is true.
- [x] **Step 4:** Explicitly blacklist categories 'Cash Collection', 'Float Issue', and 'Fuel' to ensure they never appear in the Toll view.

## Phase 2: Refine "Tag Balance" Handling
- [x] **Step 1:** Analyze logic for "Tag Balance" transactions. Currently, they are classified as `Ignored` and appear in the hidden list.
- [x] **Step 2:** Add a check to exclude transactions with `paymentMethod === 'Tag Balance'` from the `hidden` list, as this view is intended for Cash/Reimbursable toll activity.

## Phase 3: Verification
- [x] **Step 1:** Verify the file `components/drivers/DriverDetail.tsx` for syntax errors.
- [x] **Step 2:** Review the logic to ensure that valid "Ignored" tolls (like failed cash toll transactions) are still shown in the hidden section.
- [x] **Step 3:** Confirm that "Cash Collection", "Fuel", and "Tag Balance" transactions are effectively filtered out.