import React from 'react';
import { TabbedTransactionList } from '../finance/TabbedTransactionList';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';

/** Ledgers desk (page id transaction-list). Analytics mode removed (F-32). */
export function TransactionsPage({
  onBackToBusinessFinance,
  onOpenTollRecon,
}: {
  onBackToBusinessFinance?: () => void;
  onOpenTollRecon?: (opts: { startYmd: string; endYmd: string }) => void;
}) {
  return (
    <div className="space-y-4">
      {onBackToBusinessFinance && (
        <BusinessFinanceDeskChrome deskLabel="Ledgers" onBack={onBackToBusinessFinance} />
      )}
      <TabbedTransactionList onOpenTollRecon={onOpenTollRecon} />
    </div>
  );
}
