import React from 'react';
import { ChevronRight } from 'lucide-react';
import { statementFooting } from '@roam/finance-core';
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
  const className = cn(
    'w-full flex items-center justify-between gap-2 py-1.5 text-left text-sm rounded-sm',
    onClick && 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer',
  );
  const body = (
    <>
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
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

export function OverviewTab({ overview, onNavigateTab, onNavigatePage }: Props) {
  const { moneyIn, moneyOut, transfers, profit, risks } = overview;
  const profitNegative = profit.operatingProfit < -0.005;
  const fuelSpend = moneyOut.fuelSpend ?? moneyOut.fuel;
  const fleetFuel = moneyOut.fleetFuelCost ?? moneyOut.fuel;
  const foot = statementFooting({
    gross: moneyIn.grossEarnings,
    platformFees: moneyOut.platformFees || 0,
    driverCommission: moneyOut.driverCommission || 0,
    fleetFuelCost: fleetFuel,
    tolls: moneyOut.tolls,
    maintenance: moneyOut.maintenance,
    fixedCosts: moneyOut.fixedOverhead,
    otherOperating: moneyOut.operatingExpenses,
    otherIncome: moneyOut.otherIncome || 0,
    cashWriteOff: moneyOut.cashWrittenOff,
    driverPayouts: overview.basis === 'cash' ? moneyOut.driverPayouts : 0,
    operatingProfit: profit.withheld ? Number.NaN : profit.operatingProfit,
  });
  const basisLabel = overview.basis === 'cash' ? 'Cash' : 'Accrual';

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="border-slate-200 dark:border-slate-800 rounded-md sm:col-span-2">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Does this week agree?</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-0.5">
          <p className="text-[11px] text-slate-500 mb-2">{basisLabel}. A gap stays on its own line.</p>
          <Row
            label="The statement adds up"
            value={profit.withheld ? 'Unavailable' : foot.ok ? 'Yes' : formatMoney(foot.difference)}
            valueClassName={!profit.withheld && !foot.ok ? 'text-rose-700' : undefined}
          />
          {(overview.agreement || []).map((check) => (
            <Row
              key={check.id}
              label={check.label}
              value={check.held ? 'Waiting on Uber statement' : check.pending ? check.pending : check.ok ? 'Yes' : formatMoney(check.difference)}
              valueClassName={!check.held && !check.pending && !check.ok ? 'text-rose-700' : undefined}
            />
          ))}
          <Row
            label="Fuel company cost vs pump spend"
            value={formatMoney(fuelSpend - fleetFuel)}
          />
          <Row
            label="Bank received vs expected"
            value={formatMoney(moneyIn.bankReceived - moneyIn.bankExpected)}
            valueClassName={Math.abs(moneyIn.bankReceived - moneyIn.bankExpected) > 0.01 ? 'text-amber-700' : undefined}
          />
          <Row
            label="Week status"
            value={profit.withheld ? 'Unavailable' : (overview.weekStatus || 'Open')}
          />
        </CardContent>
      </Card>
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
          {(moneyIn.owedByDrivers || 0) > 0.005 && (
            <Row
              label="Owed by driver (overpaid Oct 12)"
              hint="Driver Balances"
              value={formatMoney(moneyIn.owedByDrivers || 0)}
              valueClassName="text-rose-700"
              onClick={() => onNavigateTab('driver-balances')}
            />
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Money out</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-0.5">
          <Row
            label="Fuel"
            hint="Pump spend. Profit uses the company share."
            value={formatMoney(fuelSpend)}
            onClick={() => onNavigateTab('expenses')}
          />
          <Row label="Fuel charged to the company" value={formatMoney(fleetFuel)} />
          <Row label="Platform fees" hint="Profit & Loss" value={formatMoney(moneyOut.platformFees || 0)} onClick={() => onNavigateTab('pnl')} />
          <Row label="Driver commission" hint="Profit & Loss" value={formatMoney(moneyOut.driverCommission || 0)} onClick={() => onNavigateTab('pnl')} />
          <Row label="Other income" value={formatMoney(moneyOut.otherIncome || 0)} />
          <Row
            label="Tolls"
            hint="Expenses"
            value={formatMoney(moneyOut.tolls)}
            onClick={() => onNavigateTab('expenses')}
          />
          <Row
            label="Maintenance"
            hint="Maintenance Hub"
            value={formatMoney(moneyOut.maintenance)}
            onClick={() => onNavigatePage?.('maintenance-hub')}
          />
          <Row
            label="Fixed overhead"
            hint={overview.basis === 'cash' ? 'Cash paid this week' : 'Spread across the cover period'}
            value={formatMoney(moneyOut.fixedOverhead)}
            onClick={() => onNavigateTab('expenses')}
          />
          <Row
            label="Other operating expenses"
            hint="Expenses"
            value={formatMoney(moneyOut.operatingExpenses)}
            onClick={() => onNavigateTab('expenses')}
          />
          <Row
            label="Driver payouts"
            hint="Profit & Loss"
            value={formatMoney(moneyOut.driverPayouts)}
            onClick={() => onNavigateTab('pnl')}
          />
          <Row
            label="Cash written off"
            hint="Driver Balances"
            value={formatMoney(moneyOut.cashWrittenOff)}
            valueClassName={moneyOut.cashWrittenOff > 0.005 ? 'text-rose-700' : undefined}
            onClick={() => onNavigateTab('driver-balances')}
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Transfers</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-0.5">
          <p className="text-[11px] text-slate-400 mb-2">
            Bank/cash moved to platform wallets — not an expense.
          </p>
          <Row
            label="Bank → InDrive wallet"
            hint="Cash & Bank"
            value={formatMoney(transfers.bankToIndriveWallet)}
            onClick={() => onNavigateTab('cash-bank')}
          />
          <Row
            label="Toll tag top-up"
            hint="Moves cash onto the tag. Not an expense."
            value={formatMoney(transfers.tagTopUps || 0)}
          />
          <Row
            label="Open InDrive Wallet"
            hint="Wallet Center"
            value="View"
            onClick={() => onNavigatePage?.('indrive-wallet')}
          />
          {overview.courier && (overview.courier.moneyIn > 0.005 || overview.courier.moneyOut > 0.005) && (
            <>
              <Row label="Courier money in" value={formatMoney(overview.courier.moneyIn)} />
              <Row label="Courier money out" value={formatMoney(overview.courier.moneyOut)} />
            </>
          )}
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
            {profit.withheld ? 'Unavailable' : formatMoney(profit.operatingProfit)}
          </div>
          <p className="text-xs text-slate-500 mt-1 mb-1">Operating profit · {basisLabel}</p>
          <Row
            label="Costs as % of gross"
            hint="Profit & Loss"
            value={profit.operatingRatio == null ? '—' : `${profit.operatingRatio}%`}
            onClick={() => onNavigateTab('pnl')}
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md sm:col-span-2">
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
            label="Tag tolls missing (all time)"
            hint="Toll Reconciliation"
            value={risks.tollVarianceFlags > 0 ? `${risks.tollVarianceFlags} need a look` : '0'}
            valueClassName={risks.tollVarianceFlags > 0 ? 'text-amber-700' : undefined}
            onClick={() => onNavigatePage?.('toll-tags')}
          />
          <Row
            label="Fuel fills missing (all time)"
            hint="Consumption Reconciliation"
            value={risks.fuelVarianceFlags > 0 ? `${risks.fuelVarianceFlags} need a look` : '0'}
            valueClassName={risks.fuelVarianceFlags > 0 ? 'text-amber-700' : undefined}
            onClick={() => onNavigatePage?.('fuel-analytics')}
          />
          <Row
            label="Drivers short on InDrive wallet"
            hint="InDrive Wallet"
            value={String(risks.walletShortDriverCount)}
            valueClassName={risks.walletShortDriverCount > 0 ? 'text-amber-700' : undefined}
            onClick={() => onNavigatePage?.('indrive-wallet')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
