import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { cn } from '../ui/utils';
import { formatMoney } from './money';
import type { BusinessFinancePnL } from './types';

export function PnLTab({ pnl }: { pnl: BusinessFinancePnL }) {
  const exportCsv = () => {
    const lines = [
      'Line,Amount',
      ...pnl.lines.map((l) =>
        l.tracked === false || l.amount == null
          ? `"${l.label}",not_tracked`
          : `"${l.label}",${l.amount}`,
      ),
      `Operating ratio %,${pnl.operatingRatio ?? ''}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'business-finance-pnl.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Owner view — does not change driver settlement.
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>
      {pnl.coverageNote && (
        <p className="text-sm text-amber-800 dark:text-amber-300">{pnl.coverageNote}</p>
      )}
      <Card className="border-slate-200 dark:border-slate-800 rounded-md">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3 flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold">Profit &amp; Loss</CardTitle>
            {pnl.operatingRatio != null && (
              <p className="text-[11px] text-slate-500 mt-0.5 font-normal">
                Share of gross eaten by costs (not profit margin).
              </p>
            )}
          </div>
          {pnl.operatingRatio != null && (
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300 shrink-0">
              Operating ratio {pnl.operatingRatio}%
            </span>
          )}
        </CardHeader>
        <CardContent className="pt-2 pb-3">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {pnl.lines.map((line) => {
              if (line.kind === 'memo') {
                const amt = line.amount ?? 0;
                return (
                  <li
                    key={line.id}
                    className="flex items-center justify-between py-1.5 pl-4 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <span className="italic">{line.label}</span>
                    <span className="tabular-nums italic">{formatMoney(amt)}</span>
                  </li>
                );
              }
              const untracked = line.tracked === false || line.amount == null;
              const amt = line.amount ?? 0;
              return (
                <li
                  key={line.id}
                  className={cn(
                    'flex items-center justify-between py-2.5 text-sm',
                    line.kind === 'result' && 'font-semibold text-base pt-3',
                    line.kind === 'subtotal' && 'font-medium',
                  )}
                >
                  <span className="text-slate-700 dark:text-slate-300">{line.label}</span>
                  <span
                    className={cn(
                      'tabular-nums',
                      untracked && 'text-slate-400 italic font-normal',
                      !untracked && amt < 0 && 'text-slate-600',
                      line.kind === 'result' &&
                        !untracked &&
                        (amt >= 0 ? 'text-emerald-700' : 'text-rose-700'),
                    )}
                  >
                    {untracked ? 'Not tracked yet' : formatMoney(amt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {pnl.platformSplit.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
            <CardTitle className="text-sm font-semibold">Platform split</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pnl.platformSplit.map((r) => (
                  <TableRow key={r.platform}>
                    <TableCell>{r.platform}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.fees)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
