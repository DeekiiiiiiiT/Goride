/**
 * Cash Wallet tab body — KPI row + settlements / payments ledger.
 */
import React from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Landmark,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { cn } from '../../ui/utils';
import { formatJMD } from '../../../utils/formatJMD';
import { PeriodWeekDropdown } from '../../ui/PeriodWeekDropdown';
import type { PeriodWeekOption } from '../../../utils/periodWeekOptions';
import { WeeklySettlementView } from '../WeeklySettlementView';
import { ContentVisibilityList } from '../ContentVisibilityList';
import {
  isCashWriteOffTransaction,
  isDriverPayoutTransaction,
} from '../../../utils/driverCashPayment';
import type { DriverMetrics, FinancialTransaction, Trip } from '../../../types/data';

function parseDisplayDate(dateStr: string | Date | undefined | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type WalletCollectionTotals = {
  callOutstanding: number;
  fleetOwes: number;
  cashReturned: number;
};

export type WalletPeriodPrefill = {
  start: Date;
  end: Date;
  amount: number;
};

export type PaymentGroup = {
  key: string;
  label: string;
  total: number;
  writeOffTotal: number;
  payoutTotal: number;
  rows: FinancialTransaction[];
};

export type DriverCashWalletTabProps = {
  financialDateRange?: DateRange;
  periodFrom?: Date;
  periodTo?: Date;
  onPeriodSelect?: (period: PeriodWeekOption) => void;
  walletCollectionTotals: WalletCollectionTotals;
  pendingClearance: number;
  walletView: 'ledger' | 'settlements';
  setWalletView: (v: 'ledger' | 'settlements') => void;
  allTrips: Trip[];
  transactions: FinancialTransaction[];
  csvMetrics?: DriverMetrics[];
  walletCashWeeks: any[];
  callOutstandingByMonday: Record<string, any>;
  canEditTransactions: boolean;
  onLogPayment?: (start: Date, end: Date, amount: number) => void;
  onWriteOff?: (start: Date, end: Date, maxAmount: number) => void;
  onPayDriver?: (start: Date, end: Date, maxAmount: number) => void;
  onDeleteWriteOff?: (txId: string) => void;
  paymentsLogTab: 'cash' | 'bank';
  setPaymentsLogTab: (t: 'cash' | 'bank') => void;
  cashReceivedTransactions: FinancialTransaction[];
  bankTransferTransactions: FinancialTransaction[];
  activePaymentTransactions: FinancialTransaction[];
  groupedPaymentTransactions: PaymentGroup[];
  expandedPaymentGroups: Set<string>;
  togglePaymentGroup: (key: string) => void;
  openWalletPeriodPrefill: WalletPeriodPrefill | null;
  openFleetOwesPrefill: WalletPeriodPrefill | null;
  onOpenLogPayment: (opts: {
    initialWorkPeriodStart?: string;
    initialWorkPeriodEnd?: string;
    initialAmount?: number;
  }) => void;
  onOpenPayout: (opts: { workPeriodStart: string; workPeriodEnd: string; maxAmount: number }) => void;
  onVerifyTransaction: (id: string) => void;
  onEditTransaction: (tx: FinancialTransaction) => void;
  onDeleteTransaction: (id: string) => void;
};

export function DriverCashWalletTab({
  financialDateRange: _financialDateRange,
  periodFrom,
  periodTo,
  onPeriodSelect,
  walletCollectionTotals,
  pendingClearance,
  walletView,
  setWalletView,
  allTrips,
  transactions,
  csvMetrics,
  walletCashWeeks,
  callOutstandingByMonday,
  canEditTransactions,
  onLogPayment,
  onWriteOff,
  onPayDriver,
  onDeleteWriteOff,
  paymentsLogTab,
  setPaymentsLogTab,
  cashReceivedTransactions,
  bankTransferTransactions,
  activePaymentTransactions,
  groupedPaymentTransactions,
  expandedPaymentGroups,
  togglePaymentGroup,
  openWalletPeriodPrefill,
  openFleetOwesPrefill,
  onOpenLogPayment,
  onOpenPayout,
  onVerifyTransaction,
  onEditTransaction,
  onDeleteTransaction,
}: DriverCashWalletTabProps) {
  return (
    <div className="space-y-6">
      {periodFrom && onPeriodSelect && (
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Period</span>
          <PeriodWeekDropdown
            selectedStart={format(periodFrom, 'yyyy-MM-dd')}
            selectedEnd={format(periodTo || periodFrom, 'yyyy-MM-dd')}
            onSelect={onPeriodSelect}
            weekCount={24}
            allowCustomRange
            placeholder="Select period"
            buttonClassName="h-9"
          />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white border-rose-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Driver owes</CardTitle>
            <Landmark className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-bold tabular-nums',
                walletCollectionTotals.callOutstanding > 0.005 ? 'text-rose-700' : 'text-emerald-600',
              )}
            >
              {formatJMD(walletCollectionTotals.callOutstanding, 2)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Outstanding cash to collect (open weeks in period above)</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-sky-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Fleet owes</CardTitle>
            <Wallet className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-bold tabular-nums',
                walletCollectionTotals.fleetOwes > 0.005 ? 'text-sky-700' : 'text-slate-900',
              )}
            >
              {formatJMD(walletCollectionTotals.fleetOwes, 2)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Net payout owed to driver (open weeks)</p>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Cash logged</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 tabular-nums">
              {formatJMD(walletCollectionTotals.cashReturned, 2)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Verified cash received from driver</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Awaiting bank clear</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 tabular-nums">
              {formatJMD(pendingClearance, 2)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Bank/mobile transfers logged but not verified yet</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-slate-900">Financial Records</h3>
        <div className="flex p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
              walletView === 'settlements' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900',
            )}
            onClick={() => setWalletView('settlements')}
          >
            Weekly Settlements
          </button>
          <button
            type="button"
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
              walletView === 'ledger' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900',
            )}
            onClick={() => setWalletView('ledger')}
          >
            Transaction Ledger
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {walletView === 'settlements' ? (
            <WeeklySettlementView
              trips={allTrips}
              transactions={transactions}
              csvMetrics={csvMetrics || []}
              cashWeeks={walletCashWeeks}
              callOutstandingByMonday={callOutstandingByMonday}
              onLogPayment={onLogPayment}
              onWriteOff={onWriteOff}
              onPayDriver={onPayDriver}
              onDeleteWriteOff={onDeleteWriteOff}
            />
          ) : (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Payments Log</CardTitle>
                  <CardDescription>
                    {paymentsLogTab === 'cash'
                      ? 'Cash received from the driver and write-offs, by Settlement Week.'
                      : 'Bank, mobile money, and check transfers — including ones still awaiting verify.'}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex p-1 bg-slate-100 rounded-lg w-fit">
                    <button
                      type="button"
                      className={cn(
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                        paymentsLogTab === 'cash'
                          ? 'bg-white shadow-sm text-slate-900'
                          : 'text-slate-500 hover:text-slate-900',
                      )}
                      onClick={() => setPaymentsLogTab('cash')}
                    >
                      Cash received
                      <span className="ml-1.5 text-xs text-slate-400 tabular-nums">
                        {cashReceivedTransactions.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                        paymentsLogTab === 'bank'
                          ? 'bg-white shadow-sm text-slate-900'
                          : 'text-slate-500 hover:text-slate-900',
                      )}
                      onClick={() => setPaymentsLogTab('bank')}
                    >
                      Bank transfers
                      <span className="ml-1.5 text-xs text-slate-400 tabular-nums">
                        {bankTransferTransactions.length}
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-slate-500">
                      {paymentsLogTab === 'cash'
                        ? `${activePaymentTransactions.length} cash / write-off entr${
                            activePaymentTransactions.length !== 1 ? 'ies' : 'y'
                          } on record`
                        : `${activePaymentTransactions.length} bank / mobile / check entr${
                            activePaymentTransactions.length !== 1 ? 'ies' : 'y'
                          } on record`}
                      {transactions.length > 0
                        ? ` (${transactions.length.toLocaleString()} total transactions loaded)`
                        : ''}
                    </p>
                    {activePaymentTransactions.length <= 1 && transactions.length <= 10 && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 sm:max-w-md">
                        Older cash logs may be stored under a linked platform ID or hidden until the server update is
                        deployed. This screen does not delete payment history.
                      </p>
                    )}
                    {canEditTransactions && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                        onClick={() =>
                          onOpenLogPayment({
                            initialWorkPeriodStart: openWalletPeriodPrefill?.start.toISOString(),
                            initialWorkPeriodEnd: openWalletPeriodPrefill?.end.toISOString(),
                            initialAmount:
                              openWalletPeriodPrefill?.amount ?? walletCollectionTotals.callOutstanding,
                          })
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Log New Payment
                      </Button>
                    )}
                  </div>

                  <div className="rounded-md border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-[110px_140px_minmax(0,1fr)_120px_90px_90px_50px] gap-0 px-3 py-2 text-xs font-medium text-slate-500 bg-slate-50 border-b border-slate-200">
                      <span>Date</span>
                      <span>Settlement Week</span>
                      <span>Description</span>
                      <span>Method</span>
                      <span>Status</span>
                      <span className="text-right">Amount</span>
                      <span />
                    </div>
                    {groupedPaymentTransactions.length > 0 ? (
                      <ContentVisibilityList
                        items={groupedPaymentTransactions}
                        getKey={(g) => g.key}
                        maxHeightPx={480}
                        estimateRowPx={64}
                        renderRow={(group) => {
                          const expanded = expandedPaymentGroups.has(group.key);
                          return (
                            <div className="border-b border-slate-100 last:border-0">
                              <button
                                type="button"
                                className="w-full grid grid-cols-[110px_140px_minmax(0,1fr)_120px_90px_90px_50px] gap-0 px-3 py-2 text-left bg-slate-50 hover:bg-slate-100"
                                onClick={() => togglePaymentGroup(group.key)}
                              >
                                <span className="col-span-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                                  {expanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                  {group.label}
                                </span>
                                <span className="col-span-2 py-0.5 text-xs text-slate-400">
                                  {group.rows.length} entr{group.rows.length !== 1 ? 'ies' : 'y'}
                                  {group.writeOffTotal > 0.005
                                    ? ` · write-offs −${formatJMD(group.writeOffTotal, 2)}`
                                    : ''}
                                  {group.payoutTotal > 0.005
                                    ? ` · paid −${formatJMD(group.payoutTotal, 2)}`
                                    : ''}
                                </span>
                                <span className="py-0.5 text-right text-xs text-slate-500">
                                  {paymentsLogTab === 'bank' ? 'Bank received' : 'Cash returned'}
                                </span>
                                <span className="py-0.5 text-right font-bold font-mono text-emerald-700 text-sm">
                                  {formatJMD(group.total, 2)}
                                </span>
                                <span />
                              </button>
                              {expanded &&
                                group.rows.map((tx) => {
                                  const isWriteOff = isCashWriteOffTransaction(tx);
                                  const isPayout = isDriverPayoutTransaction(tx);
                                  return (
                                    <div
                                      key={tx.id}
                                      className="grid grid-cols-[110px_140px_minmax(0,1fr)_120px_90px_90px_50px] gap-0 px-3 py-2.5 items-start border-t border-slate-50"
                                    >
                                      <span className="font-medium text-slate-600 text-sm">
                                        {(() => {
                                          const d = parseDisplayDate(tx.date);
                                          return d ? format(d, 'MMM d, yyyy') : '-';
                                        })()}
                                      </span>
                                      <span className="text-sm text-slate-600">
                                        {(() => {
                                          const s = tx.metadata?.workPeriodStart;
                                          const e = tx.metadata?.workPeriodEnd;
                                          if (!s) {
                                            if (isWriteOff || isPayout) {
                                              return <span className="text-xs text-slate-400">Untagged</span>;
                                            }
                                            return (
                                              <button
                                                type="button"
                                                className="text-left text-amber-700 hover:underline text-xs font-medium"
                                                onClick={() => onEditTransaction(tx)}
                                                title="Tag a Settlement Week so this counts as Cash Returned"
                                              >
                                                Untagged — Edit to tag
                                              </button>
                                            );
                                          }
                                          const sd = parseDisplayDate(String(s).split('T')[0]);
                                          const ed = e
                                            ? parseDisplayDate(String(e).split('T')[0])
                                            : null;
                                          if (!sd) return <span className="text-xs text-slate-400">—</span>;
                                          const pending =
                                            String(tx.status || '').toLowerCase() === 'pending';
                                          return (
                                            <span className={pending ? 'text-blue-700' : undefined}>
                                              {ed
                                                ? `${format(sd, 'MMM d')} – ${format(ed, 'MMM d')}`
                                                : format(sd, 'MMM d, yyyy')}
                                              {pending ? ' · Unverified' : ''}
                                            </span>
                                          );
                                        })()}
                                      </span>
                                      <div className="flex flex-col gap-1 min-w-0 pr-2">
                                        <span className="font-medium text-slate-900 text-sm truncate">
                                          {tx.description}
                                        </span>
                                        {isWriteOff && (
                                          <Badge
                                            variant="secondary"
                                            className="w-fit font-normal bg-slate-100 text-slate-700"
                                          >
                                            Write-off
                                          </Badge>
                                        )}
                                        {isPayout && (
                                          <Badge
                                            variant="secondary"
                                            className="w-fit font-normal bg-emerald-50 text-emerald-800"
                                          >
                                            Driver payout
                                          </Badge>
                                        )}
                                        {tx.referenceNumber && (
                                          <span className="text-xs text-slate-500 font-mono mt-0.5">
                                            Ref: {tx.referenceNumber}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 text-slate-600">
                                        {isWriteOff ? (
                                          <span className="text-sm">Company loss</span>
                                        ) : (
                                          <>
                                            {tx.paymentMethod === 'Cash' && (
                                              <DollarSign className="h-3 w-3" />
                                            )}
                                            {tx.paymentMethod === 'Bank Transfer' && (
                                              <Landmark className="h-3 w-3" />
                                            )}
                                            {tx.paymentMethod === 'Mobile Money' && (
                                              <Wallet className="h-3 w-3" />
                                            )}
                                            {tx.paymentMethod === 'Check' && (
                                              <FileText className="h-3 w-3" />
                                            )}
                                            <span className="text-sm">{tx.paymentMethod || 'Cash'}</span>
                                          </>
                                        )}
                                      </div>
                                      <div>
                                        <Badge
                                          variant="secondary"
                                          className={cn(
                                            'font-normal',
                                            tx.status === 'Completed' &&
                                              'bg-emerald-100 text-emerald-700',
                                            tx.status === 'Verified' &&
                                              'bg-emerald-100 text-emerald-700',
                                            tx.status === 'Pending' && 'bg-amber-100 text-amber-700',
                                            tx.status === 'Failed' && 'bg-red-100 text-red-700',
                                          )}
                                        >
                                          {tx.status}
                                        </Badge>
                                      </div>
                                      <span
                                        className={cn(
                                          'text-right font-bold font-mono text-sm',
                                          isWriteOff || isPayout
                                            ? 'text-slate-700'
                                            : 'text-emerald-600',
                                          isPayout && 'text-emerald-800',
                                        )}
                                      >
                                        {isWriteOff || isPayout ? '−' : '+'}
                                        {formatJMD(Math.abs(Number(tx.amount) || 0), 2)}
                                      </span>
                                      <div className="flex items-center gap-1 justify-end">
                                        {!isWriteOff && tx.status === 'Pending' && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-amber-600 hover:text-emerald-600 hover:bg-emerald-50"
                                            onClick={() => onVerifyTransaction(tx.id)}
                                            title="Verify Transaction"
                                          >
                                            <CheckCircle2 className="h-4 w-4" />
                                          </Button>
                                        )}
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                              <span className="sr-only">Open menu</span>
                                              <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            {canEditTransactions && !isWriteOff && !isPayout && (
                                              <>
                                                <DropdownMenuItem
                                                  onClick={() => onEditTransaction(tx)}
                                                >
                                                  <Pencil className="mr-2 h-4 w-4" />
                                                  Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                              </>
                                            )}
                                            {canEditTransactions && (
                                              <DropdownMenuItem
                                                onClick={() => onDeleteTransaction(tx.id)}
                                                className="text-red-600 focus:text-red-600"
                                              >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                {isWriteOff
                                                  ? 'Undo write-off'
                                                  : isPayout
                                                    ? 'Undo payout'
                                                    : 'Delete'}
                                              </DropdownMenuItem>
                                            )}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          );
                        }}
                      />
                    ) : (
                      <div className="h-24 flex items-center justify-center text-slate-500 text-sm">
                        {paymentsLogTab === 'bank'
                          ? 'No bank, mobile money, or check transfers recorded.'
                          : 'No cash payments or write-offs recorded.'}
                      </div>
                    )}
                  </div>

                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Collect Cash</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-rose-50 rounded-lg space-y-1">
                <p className="text-xs text-slate-500">Driver owes (open weeks)</p>
                <p className="text-sm font-semibold text-rose-800 tabular-nums">
                  {formatJMD(walletCollectionTotals.callOutstanding, 2)}
                </p>
              </div>
              {canEditTransactions && (
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() =>
                    onOpenLogPayment({
                      initialWorkPeriodStart: openWalletPeriodPrefill?.start.toISOString(),
                      initialWorkPeriodEnd: openWalletPeriodPrefill?.end.toISOString(),
                      initialAmount:
                        openWalletPeriodPrefill?.amount ?? walletCollectionTotals.callOutstanding,
                    })
                  }
                >
                  Log Cash Payment
                </Button>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Pay Driver</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-emerald-50 rounded-lg space-y-1">
                <p className="text-xs text-slate-500">Fleet owes (open weeks)</p>
                <p className="text-sm font-semibold text-emerald-800 tabular-nums">
                  {formatJMD(walletCollectionTotals.fleetOwes, 2)}
                </p>
                <p className="text-[10px] text-slate-400">After cash held, fuel, and tolls</p>
              </div>
              {canEditTransactions && (
                <Button
                  className="w-full bg-emerald-700 hover:bg-emerald-800"
                  disabled={walletCollectionTotals.fleetOwes < 0.005}
                  onClick={() => {
                    if (!openFleetOwesPrefill) return;
                    onOpenPayout({
                      workPeriodStart: format(openFleetOwesPrefill.start, 'yyyy-MM-dd'),
                      workPeriodEnd: format(openFleetOwesPrefill.end, 'yyyy-MM-dd'),
                      maxAmount: openFleetOwesPrefill.amount,
                    });
                  }}
                >
                  Record Payout
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
