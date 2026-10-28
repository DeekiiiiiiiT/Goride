import React from 'react';
import { TabbedTransactionList } from '../finance/TabbedTransactionList';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import { Skeleton } from '../ui/skeleton';

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
      <React.Suspense
        fallback={
          <div className="space-y-4" aria-busy="true" aria-label="Loading ledgers">
            <Skeleton className="h-10 w-56" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
          </div>
        }
      >
        <TabbedTransactionList onOpenTollRecon={onOpenTollRecon} />
      </React.Suspense>
    </div>
  );
}
