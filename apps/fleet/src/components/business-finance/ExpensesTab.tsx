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
import { formatMoney } from './money';
import type { ExpensesSnapshot } from './types';

export function ExpensesTab({
  expenses,
  onNavigatePage,
}: {
  expenses: ExpensesSnapshot;
  onNavigatePage?: (page: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {expenses.categories.map((c) => (
          <Card key={c.id} className="border-slate-200 dark:border-slate-800 rounded-md">
            <CardHeader className="py-3 pb-1">
              <CardTitle className="text-sm font-semibold">{c.label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="text-xl font-bold tabular-nums">
                {c.tracked && c.amount != null ? formatMoney(c.amount) : 'Not tracked yet'}
              </div>
              {c.deepLinkPage && c.deepLinkLabel && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => onNavigatePage?.(c.deepLinkPage!)}
                >
                  {c.deepLinkLabel}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Expense detail</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                    No expense ledger lines in this period.
                  </TableCell>
                </TableRow>
              ) : (
                expenses.rows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="whitespace-nowrap text-sm">{r.dateYmd}</TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{r.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.amount)}</TableCell>
                    <TableCell className="text-slate-500 text-sm">{r.source}</TableCell>
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
