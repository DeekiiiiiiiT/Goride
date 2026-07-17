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
  onClick,
  valueClassName,
}: {
  label: string;
  value: string;
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
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className={cn('tabular-nums font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1', valueClassName)}>
        {value}
        {onClick && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
      </span>
    </button>
  );
}

export function OverviewTab({ overview, onNavigateTab, onNavigatePage }: Props) {
  const { moneyIn, moneyOut, profit, risks } = overview;
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
            value={`${formatMoney(moneyIn.bankReceived)} / ${formatMoney(moneyIn.bankExpected)}`}
            onClick={() => onNavigateTab('cash-bank')}
          />
          <Row label="Cash collected" value={formatMoney(moneyIn.cashCollected)} onClick={() => onNavigateTab('driver-balances')} />
          <Row
            label="Cash still held"
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
          <Row label="Fuel" value={formatMoney(moneyOut.fuel)} onClick={() => onNavigateTab('expenses')} />
          <Row label="Tolls" value={formatMoney(moneyOut.tolls)} onClick={() => onNavigateTab('expenses')} />
          <Row
            label="Maintenance"
            value={moneyOut.maintenance == null ? 'Not tracked yet' : formatMoney(moneyOut.maintenance)}
            onClick={() => onNavigatePage?.('maintenance-hub')}
          />
          <Row label="Wallet loads" value={formatMoney(moneyOut.walletLoads)} onClick={() => onNavigatePage?.('indrive-wallet')} />
          <Row label="Driver payouts" value={formatMoney(moneyOut.driverPayouts)} onClick={() => onNavigateTab('pnl')} />
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Profit health</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {formatMoney(profit.operatingProfit)}
          </div>
          <p className="text-xs text-slate-500 mt-1 mb-3">Operating profit</p>
          <Row
            label="Operating ratio"
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
            value={String(risks.needsStatementWeeks)}
            onClick={() => onNavigatePage?.('fleet-financials')}
          />
          <Row
            label="High cash drivers"
            value={String(risks.highCashDrivers)}
            onClick={() => onNavigateTab('driver-balances')}
          />
          <Row label="Toll variances" value={String(risks.tollVarianceFlags)} onClick={() => onNavigatePage?.('toll-tags')} />
        </CardContent>
      </Card>
    </div>
  );
}
