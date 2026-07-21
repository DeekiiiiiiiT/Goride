import React from 'react';
import { Loader2, ReceiptText, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';
import { useExpensesSnapshot } from './useExpensesSnapshot';
import { PeriodToolbar } from '../PeriodToolbar';
import type { PeriodPreset } from '../types';
import { ExpenseHubShell, type ExpenseHubSubview } from './ExpenseHubShell';

type Props = {
  onNavigate?: (page: string, periodHint?: { startYmd: string; endYmd: string }) => void;
  initialVehicleId?: string;
  initialSubview?: ExpenseHubSubview;
};

/** Dedicated Expense Hub desk; Business Finance remains the accounting roll-up. */
export function ExpenseHubPage({
  onNavigate,
  initialVehicleId,
  initialSubview,
}: Props) {
  const [preset, setPreset] = React.useState<PeriodPreset>('this_week');
  const [anchorPreset, setAnchorPreset] = React.useState<PeriodPreset>('this_week');
  const [customStart, setCustomStart] = React.useState('');
  const [customEnd, setCustomEnd] = React.useState('');

  const customReady = Boolean(customStart && customEnd);
  const queryPreset: PeriodPreset =
    preset === 'custom' && !customReady
      ? anchorPreset
      : preset === 'custom' && customReady
        ? 'custom'
        : preset;

  const { period, data, isLoading, isFetching, isError, error, refetch } =
    useExpensesSnapshot(
      queryPreset,
      customReady ? customStart : undefined,
      customReady ? customEnd : undefined,
    );

  const setPresetSafe = (next: PeriodPreset) => {
    if (next !== 'custom') {
      setAnchorPreset(next);
      setCustomStart('');
      setCustomEnd('');
    }
    setPreset(next);
  };

  const navigateWithPeriod = (page: string) => {
    const seedPeriod = ['fleet-financials', 'indrive-wallet', 'cash-retag'].includes(page);
    onNavigate?.(
      page,
      seedPeriod ? { startYmd: period.startYmd, endYmd: period.endYmd } : undefined,
    );
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-indigo-50 p-2.5 dark:bg-indigo-950">
            <ReceiptText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              Business Finance / Expense Hub
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Expense Hub
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Manage bills, recurring rules, allocations, approvals, receipts, and payments.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </header>

      <PeriodToolbar
        period={period}
        preset={preset}
        onPreset={setPresetSafe}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={(value) => {
          setCustomStart(value);
          setPreset('custom');
        }}
        onCustomEnd={(value) => {
          setCustomEnd(value);
          setPreset('custom');
        }}
        onClear={() => setPresetSafe('this_week')}
      />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading Expense Hub…
        </div>
      ) : isError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-900">
          {(error as Error)?.message || 'Failed to load Expense Hub'}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-3"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </div>
      ) : data ? (
        <ExpenseHubShell
          expenses={data}
          onNavigatePage={navigateWithPeriod}
          onChanged={() => void refetch()}
          period={{ startYmd: period.startYmd, endYmd: period.endYmd }}
          initialVehicleId={initialVehicleId}
          initialSubview={initialSubview}
        />
      ) : null}
    </div>
  );
}
