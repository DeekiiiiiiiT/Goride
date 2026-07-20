import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../ui/utils';
import { formatMoney } from './money';
import type { BusinessFinanceOverview, BusinessFinanceTab } from './types';

type Props = {
  overview: BusinessFinanceOverview;
  onNavigateTab: (tab: BusinessFinanceTab) => void;
  onNavigatePage?: (page: string) => void;
};

function Row({
  label,
  value,
  hint,
  onClick,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
  valueClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between gap-2 py-1.5 text-left text-sm rounded-sm',
        onClick && 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer',
        !onClick && 'cursor-default',
      )}
    >
      <span className="min-w-0">
        <span className="text-slate-600 dark:text-slate-400 block">{label}</span>
        {hint && onClick && (
          <span className="text-[10px] text-slate-400 block">{hint}</span>
        )}
      </span>
      <span
        className={cn(
          'tabular-nums font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1 shrink-0',
          valueClassName,
        )}
      >
        {value}
        {onClick && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
      </span>
    </button>
  );
}

export function OverviewTab({ overview, onNavigateTab, onNavigatePage }: Props) {
  const { moneyIn, moneyOut, profit, risks } = overview;
  const profitNegative = profit.operatingProfit < -0.005;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Money in</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-0.5">
          <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 mb-2">
            {formatMoney(moneyIn.grossEarnings)}
          </div>
          <p className="text-xs text-slate-500 mb-2">Gross platform earnings</p>
          <Row
            label="Bank received / expected"
            hint="Cash & Bank"
            value={`${formatMoney(moneyIn.bankReceived)} / ${formatMoney(moneyIn.bankExpected)}`}
            onClick={() => onNavigateTab('cash-bank')}
          />
          <Row
            label="Cash collected"
            hint="Driver Balances"
            value={formatMoney(moneyIn.cashCollected)}
            onClick={() => onNavigateTab('driver-balances')}
          />
          <Row
            label="Cash still held"
            hint="Driver Balances"
            value={formatMoney(moneyIn.cashStillHeld)}
            valueClassName={moneyIn.cashStillHeld > 0.005 ? 'text-amber-700' : undefined}
            onClick={() => onNavigateTab('driver-balances')}
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Money out</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-0.5">
          <Row
            label="Fuel"
            hint="Expenses"
            value={formatMoney(moneyOut.fuel)}
            onClick={() => onNavigateTab('expenses')}
          />
          <Row
            label="Tolls"
            hint="Expenses"
            value={formatMoney(moneyOut.tolls)}
            onClick={() => onNavigateTab('expenses')}
          />
          <Row
            label="Maintenance"
            hint="Maintenance Hub"
            value={moneyOut.maintenance == null ? 'Not tracked yet' : formatMoney(moneyOut.maintenance)}
            onClick={() => onNavigatePage?.('maintenance-hub')}
          />
          <Row
            label="Wallet loads"
            hint="InDrive Wallet"
            value={formatMoney(moneyOut.walletLoads)}
            onClick={() => onNavigatePage?.('indrive-wallet')}
          />
          <Row
            label="Driver payouts"
            hint="Profit & Loss"
            value={formatMoney(moneyOut.driverPayouts)}
            onClick={() => onNavigateTab('pnl')}
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Profit health</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <div
            className={cn(
              'text-2xl font-bold tabular-nums',
              profitNegative ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100',
            )}
          >
            {formatMoney(profit.operatingProfit)}
          </div>
          <p className="text-xs text-slate-500 mt-1 mb-1">Operating profit</p>
          <p className="text-[11px] text-slate-400 mb-3">
            Share of gross eaten by costs (not profit margin).
          </p>
          <Row
            label="Operating ratio"
            hint="Profit & Loss"
            value={profit.operatingRatio == null ? '—' : `${profit.operatingRatio}%`}
            onClick={() => onNavigateTab('pnl')}
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Risk flags</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-0.5">
          <Row
            label="Needs statement"
            hint="Bank Deposits"
            value={String(risks.needsStatementWeeks)}
            onClick={() => onNavigatePage?.('fleet-financials')}
          />
          <Row
            label="High cash drivers"
            hint="Driver Balances"
            value={String(risks.highCashDrivers)}
            onClick={() => onNavigateTab('driver-balances')}
          />
          <Row
            label="Tag tolls missing from P&L"
            hint="Toll Reconciliation"
            value={String(risks.tollVarianceFlags)}
            valueClassName={risks.tollVarianceFlags > 0 ? 'text-amber-700' : undefined}
            onClick={() => onNavigatePage?.('toll-tags')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
