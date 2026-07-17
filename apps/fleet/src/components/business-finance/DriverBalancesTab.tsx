import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { formatMoney } from './money';
import type { DriverBalancesSnapshot } from './types';

export function DriverBalancesTab({
  snapshot,
  onOpenDriver,
}: {
  snapshot: DriverBalancesSnapshot;
  onOpenDriver?: (driverId: string) => void;
}) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return snapshot.rows;
    return snapshot.rows.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.driverId.toLowerCase().includes(needle),
    );
  }, [snapshot.rows, q]);

  return (
    <Card className="border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-semibold">Driver balances</CardTitle>
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
              <TableHead className="text-right">Cash still held</TableHead>
              <TableHead className="text-right">Company owes</TableHead>
              <TableHead>Bank settled</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                  No driver balances for this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={`${r.driverId}-${r.periodAnchor}`}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  onClick={() => onOpenDriver?.(r.driverId)}
                >
                  <TableCell>
                    <div className="font-medium text-sm">{r.name}</div>
                    <div className="text-[11px] text-slate-400">{r.driverId}</div>
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      r.cashStillHeld > 0.005 ? 'text-rose-700' : 'text-slate-400'
                    }`}
                  >
                    {formatMoney(r.cashStillHeld)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.companyOwes)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        r.bankSettled === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                          : r.bankSettled === 'pending'
                            ? 'bg-amber-100 text-amber-900 hover:bg-amber-100'
                            : ''
                      }
                    >
                      {r.bankSettled === 'confirmed'
                        ? 'Confirmed'
                        : r.bankSettled === 'pending'
                          ? 'Pending'
                          : '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{r.weekLabel}</TableCell>
                  <TableCell className="text-sm text-slate-600">{r.status}</TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
