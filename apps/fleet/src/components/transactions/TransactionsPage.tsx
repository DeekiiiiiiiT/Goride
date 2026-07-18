import React from 'react';
import { TabbedTransactionList } from '../finance/TabbedTransactionList';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';

/**
 * Transaction List desk only.
 * Legacy Financial Analytics (mode=analytics) removed — redirects live in App.tsx → Business Finance Workbench.
 */
export function TransactionsPage({
  mode = 'list',
  onBackToBusinessFinance,
}: {
  mode?: 'analytics' | 'list';
  onBackToBusinessFinance?: () => void;
}) {
  if (mode === 'analytics') {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Financial Analytics moved to{' '}
        <span className="font-semibold text-slate-900 dark:text-slate-100">Business Finance → Workbench</span>.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {onBackToBusinessFinance && (
        <BusinessFinanceDeskChrome deskLabel="Transaction List" onBack={onBackToBusinessFinance} />
      )}
      <TabbedTransactionList />
    </div>
  );
}
