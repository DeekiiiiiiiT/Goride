/**
 * Business Finance — fleet owner finance center (Stitch Precision Operations).
 * Read-only aggregations; never mutates settlement / bank confirm / fuel / toll writers.
 */
import React, { useState } from 'react';
import { Landmark, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../ui/utils';
import { useBusinessFinanceBundle } from './useBusinessFinanceBundle';
import { PeriodToolbar } from './PeriodToolbar';
import { IncompleteDataBanner } from './IncompleteDataBanner';
import { OverviewTab } from './OverviewTab';
import { PnLTab } from './PnLTab';
import { CashBankTab } from './CashBankTab';
import { ExpensesTab } from './ExpensesTab';
import { BudgetsTab } from './BudgetsTab';
import { DriverBalancesTab } from './DriverBalancesTab';
import { WorkbenchTab } from './workbench/WorkbenchTab';
import type { BusinessFinanceTab, PeriodPreset } from './types';

type Props = {
  onNavigate?: (page: string, periodHint?: { startYmd: string; endYmd: string }) => void;
  onOpenDriver?: (driverId: string) => void;
  /** e.g. open Workbench when redirected from legacy Financial Analytics */
  initialTab?: BusinessFinanceTab;
  /** Deep link from a vehicle page — Expenses tab opens the Hub register filtered to this vehicle. */
  expensesInitialVehicleId?: string;
};

export function BusinessFinancePage({
  onNavigate,
  onOpenDriver,
  initialTab = 'overview',
  expensesInitialVehicleId,
}: Props) {
  const [tab, setTab] = useState<BusinessFinanceTab>(initialTab);
  const [preset, setPreset] = useState<PeriodPreset>('this_week');
  /** Last complete non-custom preset — used while custom From/To are incomplete */
  const [anchorPreset, setAnchorPreset] = useState<PeriodPreset>('this_week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const customReady = Boolean(customStart && customEnd);
  const queryPreset: PeriodPreset =
    preset === 'custom' && !customReady ? anchorPreset : preset === 'custom' && customReady ? 'custom' : preset;

  const { period, data, isLoading, isFetching, isError, error, refetch } = useBusinessFinanceBundle(
    queryPreset,
    customReady ? customStart : undefined,
    customReady ? customEnd : undefined,
  );

  const setPresetSafe = (p: PeriodPreset) => {
    if (p !== 'custom') {
      setAnchorPreset(p);
      setCustomStart('');
      setCustomEnd('');
    }
    setPreset(p);
  };

  // Hard gaps only — soft "not tracked" notes live on cards
  const incomplete = data
    ? [
        ...data.overview.incompleteSources,
        ...data.expenses.incompleteSources.filter((s) => !/not tracked/i.test(s)),
        ...data.driverBalances.incompleteSources,
        ...(data.pnl.coverageNote ? [data.pnl.coverageNote] : []),
      ]
    : [];

  const openDriver = (driverId: string) => {
    onOpenDriver?.(driverId);
  };

  const navigateWithPeriod = (page: string) => {
    const seedPeriod = ['fleet-financials', 'indrive-wallet', 'cash-retag'].includes(page);
    onNavigate?.(page, seedPeriod ? { startYmd: period.startYmd, endYmd: period.endYmd } : undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-indigo-50 dark:bg-indigo-950 p-2.5 mt-0.5">
            <Landmark className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Business Finance</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-xl">
              Owner view of profit, cash, and expenses. Does not change driver settlement.
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
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {!bannerDismissed && incomplete.length > 0 && (
        <IncompleteDataBanner sources={incomplete} onDismiss={() => setBannerDismissed(true)} />
      )}

      <PeriodToolbar
        period={period}
        preset={preset}
        onPreset={setPresetSafe}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={(v) => {
          setCustomStart(v);
          setPreset('custom');
        }}
        onCustomEnd={(v) => {
          setCustomEnd(v);
          setPreset('custom');
        }}
        onClear={() => {
          setPresetSafe('this_week');
        }}
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as BusinessFinanceTab)}
        className="space-y-4"
      >
        <TabsList className="h-auto flex flex-wrap gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="cash-bank">Cash &amp; Bank</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="driver-balances">Driver Balances</TabsTrigger>
          <TabsTrigger value="workbench">Workbench</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading business finance…
          </div>
        ) : isError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {(error as Error)?.message || 'Failed to load Business Finance'}
            <Button type="button" size="sm" variant="outline" className="ml-3" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : data ? (
          <>
            <TabsContent value="overview" className="mt-0">
              <OverviewTab
                overview={data.overview}
                onNavigateTab={setTab}
                onNavigatePage={navigateWithPeriod}
              />
            </TabsContent>
            <TabsContent value="pnl" className="mt-0">
              <PnLTab pnl={data.pnl} />
            </TabsContent>
            <TabsContent value="cash-bank" className="mt-0">
              <CashBankTab
                cashBank={data.cashBank}
                onOpenBankDeposits={() => navigateWithPeriod('fleet-financials')}
                onOpenWallet={() => navigateWithPeriod('indrive-wallet')}
                onOpenCashRetag={() => navigateWithPeriod('cash-retag')}
                onOpenDriver={openDriver}
              />
            </TabsContent>
            <TabsContent value="expenses" className="mt-0">
              <ExpensesTab
                expenses={data.expenses}
                onNavigatePage={navigateWithPeriod}
                onChanged={() => void refetch()}
                period={{ startYmd: period.startYmd, endYmd: period.endYmd }}
                initialVehicleId={expensesInitialVehicleId}
              />
            </TabsContent>
            <TabsContent value="budgets" className="mt-0">
              <BudgetsTab expenses={data.expenses} period={period} />
            </TabsContent>
            <TabsContent value="driver-balances" className="mt-0">
              <DriverBalancesTab snapshot={data.driverBalances} onOpenDriver={openDriver} />
            </TabsContent>
            <TabsContent value="workbench" className="mt-0">
              <WorkbenchTab
                bundle={data}
                onNavigatePage={navigateWithPeriod}
                onOpenDriver={openDriver}
              />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
