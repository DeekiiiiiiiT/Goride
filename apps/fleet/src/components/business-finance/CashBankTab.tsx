import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { formatMoney } from './money';
import type { CashBankSnapshot } from './types';

export function CashBankTab({
  cashBank,
  onOpenBankDeposits,
  onOpenWallet,
  onOpenCashRetag,
  onOpenDriver,
}: {
  cashBank: CashBankSnapshot;
  onOpenBankDeposits: () => void;
  onOpenWallet?: () => void;
  onOpenCashRetag?: () => void;
  onOpenDriver?: (driverId: string) => void;
}) {
  const { platformBank, driverCash, walletLoads } = cashBank;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Platform bank</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Expected</span>
            <span className="tabular-nums font-medium">{formatMoney(platformBank.expected)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Received</span>
            <span className="tabular-nums font-medium">{formatMoney(platformBank.received)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Variance</span>
            <span
              className={`tabular-nums font-medium ${
                Math.abs(platformBank.variance) > 0.005 ? 'text-amber-700' : ''
              }`}
            >
              {formatMoney(platformBank.variance)}
            </span>
          </div>
          {platformBank.needsStatementWeeks > 0 && (
            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-none">
              Needs statement ({platformBank.needsStatementWeeks})
            </Badge>
          )}
          <Button type="button" size="sm" className="w-full mt-2 bg-indigo-600 hover:bg-indigo-600" onClick={onOpenBankDeposits}>
            Open Bank Deposits
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Driver cash receivable</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-2 text-sm">
          <div className="flex justify-between mb-2">
            <span className="text-slate-500">Total still held</span>
            <span className="tabular-nums font-semibold text-amber-800 dark:text-amber-300">
              {formatMoney(driverCash.totalStillHeld)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-1">Top debtors</p>
          {driverCash.topDebtors.length === 0 ? (
            <p className="text-xs text-slate-400">No outstanding cash in this period.</p>
          ) : (
            <ul className="space-y-1.5">
              {driverCash.topDebtors.map((d) => (
                <li key={d.driverId}>
                  <button
                    type="button"
                    className="w-full flex justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-1 py-0.5"
                    onClick={() => onOpenDriver?.(d.driverId)}
                  >
                    <span className="truncate pr-2">{d.name}</span>
                    <span className="tabular-nums shrink-0">{formatMoney(d.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" size="sm" variant="outline" className="w-full mt-2" onClick={onOpenCashRetag}>
            Open Cash Retag
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">InDrive wallet loads</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Period loads</span>
            <span className="tabular-nums font-medium">{formatMoney(walletLoads.periodLoads)}</span>
          </div>
          {walletLoads.shortDriverCount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Drivers short</span>
              <span className="tabular-nums font-medium text-amber-700">
                {walletLoads.shortDriverCount}
              </span>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Funding cost, not revenue. Open Wallet Center for load detail.
          </p>
          <Button type="button" size="sm" variant="outline" className="w-full mt-2" onClick={onOpenWallet}>
            Open InDrive Wallet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
