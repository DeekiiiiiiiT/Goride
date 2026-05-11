import { FinancialTransaction, Claim } from "../types/data";

export type TransactionClassification = 
    | 'Standard_Credit'   // Normal Toll Expense (Driver paid, we owe)
    | 'Resolved_Debit'    // Charged to Driver (Resolved Dispute)
    | 'Resolved_Credit'   // Reimbursed (Resolved Dispute)
    | 'Pending_Dispute'   // Dispute in progress (Hide from Settlement)
    | 'Ignored';          // Not relevant

export const classifyTollTransaction = (
    tx: FinancialTransaction, 
    claim?: Claim
): TransactionClassification => {
    // 1. Check Status
    if (tx.status === 'Rejected' || tx.status === 'Void' || tx.status === 'Failed') {
        return 'Ignored';
    }

    // 2. Check for explicit "Retry Charge" metadata
    // This allows us to show the "Fix Format" button or process it
    if (tx.metadata?.source === 'retry_charge') {
        // If it's a retry charge, it's intended to be a Resolved Debit (Charge)
        return 'Resolved_Debit';
    }

    // 3. Analyze Category & Description
    const category = tx.category || '';
    const desc = (tx.description || '').toLowerCase();

    // Is it a Credit Candidate? (Expense)
    const isTollCategory = ['Toll Usage', 'Toll', 'Tolls', 'Expense'].includes(category);
    const isTollRelatedDesc = desc.includes('toll');
    const isCreditCandidate = isTollCategory && (category !== 'Expense' || isTollRelatedDesc);

    // Is it a Debit Candidate? (Adjustment)
    const isAdjustment = ['Adjustment', 'Claim', 'Chargeback'].includes(category);
    const isExplicitClaim = ['Claim', 'Chargeback'].includes(category);
    const isDebitCandidate = isExplicitClaim || (isAdjustment && (
        desc.includes('toll') || 
        desc.includes('dispute') || 
        desc.includes('refund') || 
        desc.includes('charge')
    ));

    // 4. Resolve using Claim Data (if available)
    if (claim) {
        const status = claim.status;
        const resolution = claim.resolutionReason;

        // A. Resolved Claims
        if (status === 'Resolved') {
            if (resolution === 'Charge Driver') {
                // If this TX is the Result of the charge (Adjustment), it's a Debit.
                // If this TX is the Original (Expense), it's complicated.
                // Usually, the Original Expense is effectively "cancelled" by the Charge.
                // BUT, to keep the ledger clean:
                // If we show the Expense (+5) and the Charge (-5), they net to 0.
                // So we can classify the Original as Standard_Credit (it happened)
                // And the Charge as Resolved_Debit.
                
                if (isDebitCandidate) return 'Resolved_Debit';
                if (isCreditCandidate) return 'Standard_Credit'; // Keep original visible
            }
            if (resolution === 'Reimbursed') return 'Resolved_Credit';
            if (resolution === 'Write Off') return 'Resolved_Credit'; // Effectively same as reimbursed for driver
        }

        // B. Pending/Active Claims
        // If it has a claim that is NOT resolved, we treat it as Pending.
        // BUT, if it's the *original expense*, hiding it might be confusing?
        // "The only debit/credits ... is from the History tab".
        // If we have a pending dispute on a trip, maybe we SHOULD hide it?
        // No, standard flow: Driver pays. -> Credit (+5).
        // Dispute starts -> Pending.
        // If we hide the +5, the driver thinks we lost their receipt.
        // So we likely only use 'Pending_Dispute' to filter out *intermediate* or *duplicate* records,
        // OR to block "Potential Charges" if they exist as transactions.
        
        if (['Submitted_to_Uber', 'Sent_to_Driver', 'Under_Review'].includes(status)) {
            // If this transaction ITSELF is the dispute record (Adjustment), hide it.
            if (isDebitCandidate) return 'Pending_Dispute';
            // If it's the original expense, keep it shown until resolved.
            if (isCreditCandidate) return 'Standard_Credit';
        }
        
        // C. Rejected Claims (Lost)
        // If we lost the dispute with Uber, does the driver pay?
        // Only if we resolution === 'Charge Driver'.
        // If just 'Rejected', usually implies we eat the cost or it remains as is.
        if (status === 'Rejected') {
            // If it's the original expense, keep it.
            if (isCreditCandidate) return 'Standard_Credit';
        }
    }

    // 5. No Claim Linked (Standard Flow)
    if (isCreditCandidate) {
        // Check for "Cash" or Receipt
        const isCash = tx.paymentMethod?.toLowerCase() === 'cash' || !!tx.receiptUrl;
        if (isCash) return 'Standard_Credit';
    }

    if (isDebitCandidate) {
        // An adjustment without a claim link?
        // Be safe and show it (it might be a manual admin adjustment).
        // Unless we want to enforce "Only from History tab".
        // Let's assume manual adjustments are valid Debits.
        return 'Resolved_Debit'; 
    }

    return 'Ignored';
};
