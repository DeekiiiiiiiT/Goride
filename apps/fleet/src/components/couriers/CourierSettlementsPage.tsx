import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { api } from '../../services/api';
import { useFeatureFlags } from '../auth/FeatureFlagContext';

function fmtMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Weekly courier settlement desk — Rush delivery revenue + read-only COD owed to Roam. */
export function CourierSettlementsPage() {
  const { isModuleEnabled } = useFeatureFlags();
  const settlementEnabled = isModuleEnabled('rush_courier_settlements');

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['rush-delivery-settlement-summary'],
    queryFn: () => api.getRushDeliverySettlementSummary(),
    enabled: settlementEnabled,
  });

  const { data: cod, isLoading: codLoading } = useQuery({
    queryKey: ['rush-courier-cash-balances'],
    queryFn: () => api.getRushCourierCashBalances(),
    enabled: settlementEnabled,
  });

  const rows = summary?.rows ?? [];
  const totalGross = rows.reduce((s: number, r: { grossEarnings?: number }) => s + (r.grossEarnings ?? 0), 0);
  const codRows = cod?.balances ?? [];
  const totalOwed = codRows.reduce((s: number, r: { owedToRoam?: number }) => s + (r.owedToRoam ?? 0), 0);

  if (!settlementEnabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Courier Settlements</h1>
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-slate-500">
            <AlertCircle className="h-5 w-5" />
            Rush courier settlements add-on is not enabled for your organization.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Courier Settlements
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Weekly delivery revenue and COD owed to Roam — read-only; Roam pays couriers directly.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Period start', value: summary?.since ?? 'Current week' },
          { label: 'Delivery gross', value: summaryLoading ? '…' : fmtMoney(totalGross) },
          { label: 'COD owed to Roam', value: codLoading ? '…' : fmtMoney(totalOwed) },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery earnings by courier</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summaryLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Courier ID</TableHead>
                  <TableHead className="text-right">Deliveries</TableHead>
                  <TableHead className="text-right">Gross earnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-slate-500">
                      No Rush delivery trips in this period yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r: { driverId: string; deliveries: number; grossEarnings: number }) => (
                    <TableRow key={r.driverId}>
                      <TableCell className="font-mono text-xs">{r.driverId.slice(0, 8)}…</TableCell>
                      <TableCell className="text-right">{r.deliveries}</TableCell>
                      <TableCell className="text-right">{fmtMoney(r.grossEarnings)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">COD balances (read-only)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {codLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Courier</TableHead>
                  <TableHead className="text-right">Owed to Roam</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <DollarSign className="h-8 w-8 text-slate-300" />
                        <span className="text-sm">No COD balances on file.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  codRows.map((r: { courierId: string; courierName: string; owedToRoam: number }) => (
                    <TableRow key={r.courierId}>
                      <TableCell>{r.courierName}</TableCell>
                      <TableCell className="text-right">{fmtMoney(r.owedToRoam)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          Read-only
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
