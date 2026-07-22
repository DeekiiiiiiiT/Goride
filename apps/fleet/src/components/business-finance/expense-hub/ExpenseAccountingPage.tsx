/**
 * RoamFleet Accounting setup — recurring cost rules (per-org).
 * Vendor master lives in Super Admin; this page only configures standing schedules.
 */
import React from 'react';
import { Repeat2 } from 'lucide-react';
import { ExpenseHubRules } from './ExpenseHubRules';
import { useExpenseHubFlag } from '../../../hooks/useExpenseHub';
import { usePermissions } from '../../../hooks/usePermissions';
import { HubDenied, HubLoading } from './HubStates';

export function ExpenseAccountingPage({ onChanged }: { onChanged?: () => void }) {
  const { can } = usePermissions();
  const flagQuery = useExpenseHubFlag();
  const hubEnabled = flagQuery.data?.enabled === true;

  if (!can('expenses.view')) return <HubDenied what="Accounting / recurring rules" />;
  if (flagQuery.isLoading) return <HubLoading label="Loading Accounting…" />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="mt-0.5 rounded-md bg-indigo-50 p-2.5 dark:bg-indigo-950">
          <Repeat2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Business Finance / Accounting</p>
          <h1 className="mt-0.5 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Recurring cost rules
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Schedules that post on due dates for this fleet. Use Expense Hub Register for one-off
            bills. Jamaica vendors are managed by Roam in Super Admin.
          </p>
        </div>
      </header>

      {!hubEnabled && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Saving rules needs the expense_hub_v1 flag. You can browse existing rules meanwhile.
        </div>
      )}

      <ExpenseHubRules onChanged={onChanged} writesEnabled={hubEnabled && can('expenses.manage_rules')} />
    </div>
  );
}
