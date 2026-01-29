# Driver Portal - Cash Wallet "Your Payments" Fix

## Investigation Findings

### Current State
In the Driver Portal (`/components/driver-portal/DriverEarnings.tsx`), the "Your Payments" tab uses the `TransactionLedgerView` component. Currently, it passes the entire `transactions` array to this view without specific filtering for driver payments. This causes Fuel Expenses, Tolls, and other transaction types to appear in the list, which is incorrect.

### Reference Implementation
In the Fleet Portal (`/components/drivers/DriverDetail.tsx`), the "Payments Log" tab correctly filters transactions to show only payments received from the driver. It uses the following logic:
- **Excludes**: Tag Balance operations, Top-ups, Tolls, and Fuel transactions.
- **Includes**: Transactions where category is 'Cash Collection' or type is 'Payment_Received', and the amount is positive.

### Proposed Solution
To align the Driver Portal with the Fleet Portal and the user requirement:

1.  **Modify `DriverEarnings.tsx`**:
    - Implement a `paymentTransactions` useMemo hook similar to the one in `DriverDetail.tsx`.
    - This hook will filter the `transactions` state to include only valid driver payments.
    - Pass this filtered `paymentTransactions` array to the `TransactionLedgerView` instead of the raw `transactions` array when `cashWalletView` is set to `'ledger'`.

### Code Changes Required

**File**: `/components/driver-portal/DriverEarnings.tsx`

```typescript
// Add this memoized filter logic
const paymentTransactions = React.useMemo(() => transactions.filter(t => {
    // Strict Safety: Never show Tag Balance operations in Payment Log
    if (t.paymentMethod === 'Tag Balance') return false;
    if (t.description?.toLowerCase().includes('top-up')) return false;

    // Exclude tolls
    const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
    if (isToll) return false;

    // Exclude fuel
    const isFuel = (t.category || '').toLowerCase().includes('fuel') || (t.description || '').toLowerCase().includes('fuel');
    if (isFuel) return false;

    // Strict Payment Logic: Focus on Cash Collections (Money from Driver)
    const isPayment = t.category === 'Cash Collection' || t.type === 'Payment_Received';
    return isPayment && t.amount > 0;
}), [transactions]);
```

**Update Render**:
```tsx
// Inside the return statement where TransactionLedgerView is rendered
<TransactionLedgerView 
    transactions={paymentTransactions} // Use the filtered list
/>
```
