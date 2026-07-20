import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { cn } from '../ui/utils';
import { formatMoney } from './money';
import type { BusinessFinancePnL, PnLFuelBreakdown, PnLTollBreakdown } from './types';

function TollBreakdownPanel({ breakdown }: { breakdown: PnLTollBreakdown }) {
  const rows: Array<{ label: string; hint: string; amount: number; emphasize?: boolean }> = [
    {
      label: 'Toll charges',
      hint: 'Tag & trip tolls this period',
      amount: breakdown.grossCharges,
    },
    {
      label: 'Already covered',
      hint: 'Cash-wash, personal, refunds — not a fleet loss',
      amount: breakdown.alreadyCovered,
    },
    {
      label: 'Charged to drivers',
      hint: 'Recovered via Charge Driver (wallet)',
      amount: breakdown.chargedToDrivers,
    },
    {
      label: 'Fleet loss',
      hint: 'Hits this P&L Tolls line',
      amount: breakdown.fleetLoss,
      emphasize: true,
    },
  ];

  return (
    <div className="mt-2 mb-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            'rounded-md border px-3 py-2.5',
            row.emphasize
              ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/40'
              : 'border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50',
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {row.label}
          </p>
          <p
            className={cn(
              'mt-1 text-lg font-semibold tabular-nums',
              row.emphasize
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-slate-900 dark:text-slate-100',
            )}
          >
            {formatMoney(row.amount)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{row.hint}</p>
        </div>
      ))}
    </div>
  );
}

function FuelBreakdownPanel({ breakdown }: { breakdown: PnLFuelBreakdown }) {
  const rows: Array<{ label: string; hint: string; amount: number; emphasize?: boolean }> = [
    {
      label: 'Fuel spend',
      hint: 'All fills this period (gross)',
      amount: breakdown.grossSpend,
    },
    {
      label: 'Already covered',
      hint: 'Driver share after Finalize — not a fleet loss',
      amount: breakdown.alreadyCovered,
    },
    {
      label: 'Reimbursed to drivers',
      hint: 'Wallet fuel credits (memo only)',
      amount: breakdown.reimbursedToDrivers,
    },
    {
      label: 'Fleet loss',
      hint: 'Hits this P&L Fuel line',
      amount: breakdown.fleetLoss,
      emphasize: true,
    },
  ];

  return (
    <div className="mt-2 mb-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            'rounded-md border px-3 py-2.5',
            row.emphasize
              ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/40'
              : 'border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50',
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {row.label}
          </p>
          <p
            className={cn(
              'mt-1 text-lg font-semibold tabular-nums',
              row.emphasize
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-slate-900 dark:text-slate-100',
            )}
          >
            {formatMoney(row.amount)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{row.hint}</p>
        </div>
      ))}
    </div>
  );
}

export function PnLTab({ pnl }: { pnl: BusinessFinancePnL }) {
  const [tollsOpen, setTollsOpen] = useState(false);
  const [fuelOpen, setFuelOpen] = useState(false);
  const tollBreakdown = pnl.tollBreakdown;
  const fuelBreakdown = pnl.fuelBreakdown;

  const exportCsv = () => {
    const lines = [
      'Line,Amount',
      ...pnl.lines.map((l) =>
        l.tracked === false || l.amount == null
          ? `"${l.label}",not_tracked`
          : `"${l.label}",${l.amount}`,
      ),
    ];
    if (fuelBreakdown) {
      lines.push(
        `"Fuel spend (gross)",${fuelBreakdown.grossSpend}`,
        `"Already covered (driver share)",${fuelBreakdown.alreadyCovered}`,
        `"Reimbursed to drivers",${fuelBreakdown.reimbursedToDrivers}`,
        `"Fleet fuel loss",${fuelBreakdown.fleetLoss}`,
      );
    }
    if (tollBreakdown) {
      lines.push(
        `"Toll charges (gross)",${tollBreakdown.grossCharges}`,
        `"Already covered (not fleet loss)",${tollBreakdown.alreadyCovered}`,
        `"Charged to drivers",${tollBreakdown.chargedToDrivers}`,
        `"Fleet toll loss",${tollBreakdown.fleetLoss}`,
      );
    }
    lines.push(`Operating ratio %,${pnl.operatingRatio ?? ''}`);
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
              if (line.kind === 'memo') return null;

              if (line.id === 'fuel' && fuelBreakdown) {
                const amt = line.amount ?? 0;
                return (
                  <li key={line.id} className="py-2.5 text-sm">
                    <Collapsible open={fuelOpen} onOpenChange={setFuelOpen}>
                      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left min-h-[44px]">
                        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
                              fuelOpen && 'rotate-180',
                            )}
                            aria-hidden
                          />
                          {line.label}
                          <span className="text-[11px] font-normal text-slate-400">
                            {fuelOpen ? 'Hide breakdown' : 'Show breakdown'}
                          </span>
                        </span>
                        <span className="tabular-nums text-slate-600">{formatMoney(amt)}</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <FuelBreakdownPanel breakdown={fuelBreakdown} />
                      </CollapsibleContent>
                    </Collapsible>
                  </li>
                );
              }

              if (line.id === 'tolls' && tollBreakdown) {
                const amt = line.amount ?? 0;
                return (
                  <li key={line.id} className="py-2.5 text-sm">
                    <Collapsible open={tollsOpen} onOpenChange={setTollsOpen}>
                      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left min-h-[44px]">
                        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
                              tollsOpen && 'rotate-180',
                            )}
                            aria-hidden
                          />
                          {line.label}
                          <span className="text-[11px] font-normal text-slate-400">
                            {tollsOpen ? 'Hide breakdown' : 'Show breakdown'}
                          </span>
                        </span>
                        <span className="tabular-nums text-slate-600">{formatMoney(amt)}</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <TollBreakdownPanel breakdown={tollBreakdown} />
                      </CollapsibleContent>
                    </Collapsible>
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
