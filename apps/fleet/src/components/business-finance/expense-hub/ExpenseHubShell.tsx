/**
 * Expense Hub shell — always shows Overview / Register / Rules / Approvals / Vendors.
 * Flag OFF blocks server writes (and vehicle edit lock); UI stays browsable.
 */
import React from 'react';
import {
  ClipboardCheck,
  FileText,
  Info,
  LayoutDashboard,
  Repeat2,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../ui/utils';
import { usePermissions } from '../../../hooks/usePermissions';
import { useExpenseHubFlag } from '../../../hooks/useExpenseHub';
import type { ExpensesSnapshot } from '../types';
import { HubDenied, HubLoading } from './HubStates';
import { ExpenseHubOverview } from './ExpenseHubOverview';
import { ExpenseHubRegister } from './ExpenseHubRegister';
import { ExpenseHubRules } from './ExpenseHubRules';
import { ExpenseHubApprovals } from './ExpenseHubApprovals';
import { ExpenseHubVendors } from './ExpenseHubVendors';
import { ExpenseHubDetail } from './ExpenseHubDetail';

export type ExpenseHubSubview = 'overview' | 'register' | 'rules' | 'approvals' | 'settings';

export function ExpenseHubShell({
  expenses,
  onNavigatePage,
  onChanged,
  period,
  initialVehicleId,
  initialSubview,
}: {
  expenses: ExpensesSnapshot;
  onNavigatePage?: (page: string) => void;
  onChanged?: () => void;
  period?: { startYmd: string; endYmd: string };
  /** Deep link (e.g. from a vehicle page) — preselects the Register vehicle filter. */
  initialVehicleId?: string;
  initialSubview?: ExpenseHubSubview;
}) {
  const { can } = usePermissions();
  const flagQuery = useExpenseHubFlag();
  const hubEnabled = flagQuery.data?.enabled === true;

  const [subview, setSubview] = React.useState<ExpenseHubSubview>(
    initialSubview || (initialVehicleId ? 'register' : 'overview'),
  );
  const [detailId, setDetailId] = React.useState<string | null>(null);

  if (!can('expenses.view')) return <HubDenied what="Business Finance expenses" />;
  if (flagQuery.isLoading) return <HubLoading label="Loading Expense Hub…" />;

  const subviews: Array<{
    id: ExpenseHubSubview;
    label: string;
    icon: LucideIcon;
    visible: boolean;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, visible: true },
    { id: 'register', label: 'Register', icon: FileText, visible: true },
    { id: 'rules', label: 'Rules', icon: Repeat2, visible: true },
    {
      id: 'approvals',
      label: 'Approvals',
      icon: ClipboardCheck,
      visible: can('expenses.approve') || can('expenses.view'),
    },
    {
      id: 'settings',
      label: 'Vendors',
      icon: Store,
      visible: can('expenses.manage_vendors') || can('expenses.view'),
    },
  ];
  const visibleSubviews = subviews.filter((s) => s.visible);
  const active = visibleSubviews.some((s) => s.id === subview) ? subview : 'overview';

  return (
    <div className="space-y-4">
      {!hubEnabled && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Hub browsing is on; saving rules/bills/payments needs the expense_hub_v1 flag. Until
            then use “Log expense” for one-offs and keep editing recurring costs on each vehicle.
          </span>
        </div>
      )}

      <div className="hidden flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900 sm:flex">
        {visibleSubviews.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubview(s.id)}
            className={cn(
              'min-h-11 flex-1 rounded-md px-4 text-sm font-medium transition-colors sm:flex-none',
              active === s.id
                ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {active === 'overview' && (
        <ExpenseHubOverview
          expenses={expenses}
          onNavigatePage={onNavigatePage}
          onChanged={onChanged}
          period={period}
          hubEnabled={hubEnabled}
        />
      )}
      {active === 'register' && (
        <ExpenseHubRegister
          initialVehicleId={initialVehicleId}
          onOpenDetail={setDetailId}
          onChanged={onChanged}
          writesEnabled={hubEnabled}
        />
      )}
      {active === 'rules' && <ExpenseHubRules onChanged={onChanged} writesEnabled={hubEnabled} />}
      {active === 'approvals' && (
        <ExpenseHubApprovals
          onOpenDetail={setDetailId}
          onChanged={onChanged}
          writesEnabled={hubEnabled}
        />
      )}
      {active === 'settings' && <ExpenseHubVendors writesEnabled={hubEnabled} />}

      <ExpenseHubDetail
        documentId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={onChanged}
        writesEnabled={hubEnabled}
      />

      <nav
        aria-label="Expense Hub sections"
        className="sticky bottom-2 z-20 grid grid-cols-5 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:hidden"
      >
        {visibleSubviews.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => setSubview(item.id)}
              className={cn(
                'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-medium',
                selected
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
