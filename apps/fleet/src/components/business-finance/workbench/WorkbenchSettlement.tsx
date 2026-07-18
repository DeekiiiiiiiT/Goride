/**
 * Settlement command — read-only fleet weeks; deep-link to Drivers Settlement.
 * Never calculates pay.
 */
import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { formatMoney } from '../money';
import type { DriverBalanceRow } from '../types';

export function WorkbenchSettlement({
  rows,
  onBack,
  onOpenDriver,
}: {
  rows: DriverBalanceRow[];
  onBack: () => void;
  onOpenDriver?: (driverId: string) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(n) || r.driverId.toLowerCase().includes(n),
    );
  }, [rows, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Driver settlement</h2>
          <p className="text-xs text-slate-500">
            Read-only. Open in Drivers to run real Settlement / Payout — this screen does not calculate pay.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          Back to Workbench
        </Button>
      </div>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <CardHeader className="py-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Weeks in period</CardTitle>
          <Input
            className="h-8 max-w-xs"
            placeholder="Search drivers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Week</TableHead>
                <TableHead className="text-right">Cash still held</TableHead>
                <TableHead className="text-right">Company owes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                    No settlement activity in this period.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow
                    key={`${r.driverId}-${r.periodAnchor}`}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => onOpenDriver?.(r.driverId)}
                  >
                    <TableCell className="font-medium text-sm">{r.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.weekLabel}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        r.cashStillHeld > 0.005 ? 'text-rose-700' : 'text-slate-400'
                      }`}
                    >
                      {formatMoney(r.cashStillHeld)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.companyOwes)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-indigo-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDriver?.(r.driverId);
                        }}
                      >
                        Open in Drivers
                        <ChevronRight className="h-4 w-4 ml-0.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
