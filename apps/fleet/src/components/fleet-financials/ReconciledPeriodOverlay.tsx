/**
 * Driver Settlements → Reconciled — Fleet vs Driver period scoreboard.
 * Reads DFP projection fields; tagged payments come from desk txs.
 */
import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { Loader2, CheckCircle2, Building2, User } from 'lucide-react';
import type { FinancialTransaction } from '../../types/data';
import {
  isCashReturnedForWeek,
  isCashWriteOffForWeek,
  isSettlementPaidForWeek,
} from '../../utils/driverCashPayment';
import { cn } from '../ui/utils';
import { OVERPAID_BADGE_TOOLTIP, overpaidBadgeLabel } from '../../utils/settlementDeskUx';

export type ReconciledPeriodDetail = {
  driverId: string;
  periodAnchor: string;
  periodEnd: string;
  earningsGross: number;
  driverShare: number;
  fleetShare: number;
  driverSharePercent: number;
  fuelDeduction: number;
  fuelFleetShare: number;
  tollChargedToDriver: number;
  tollCashSpend: number;
  cashCollected: number;
  cashReturned: number;
  cashWrittenOff: number;
  settlementPaid: number;
  cashStillHeld: number;
  payoutNet: number;
  settlementAmount: number;
  tripCount: number;
  fuelFinalized?: boolean;
  settlementStatus?: string;
  tierName?: string | null;
  tipsPaidToDriver?: number;
  tipsWithheld?: number;
  cashSourceMismatch?: number;
  overpaidAmount?: number;
  projectionSources?: Record<string, string>;
  serviceLineBreakdown?: Record<string, unknown>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string;
  detail: ReconciledPeriodDetail | null;
  loading?: boolean;
  partialData?: boolean;
  transactions?: FinancialTransaction[];
};

const fmt = (n: number) =>
  '$' +
  Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const SOURCE_LABELS: Record<string, string> = {
  events: 'Ledger events',
  events_or_trips: 'Events + trip fallback',
  ledger: 'Toll ledger',
  snapshot: 'Fuel snapshot',
  table: 'Settlement mirror',
  kv: 'Transaction scan',
};

function ServiceLineBreakdownPanel({
  breakdown,
}: {
  breakdown?: Record<string, unknown>;
}) {
  if (!breakdown || Object.keys(breakdown).length === 0) return null;
  const labels: Record<string, string> = {
    rideshare: 'Rideshare',
    rush_delivery: 'Delivery',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        Per-line commission (combined statement)
      </p>
      <div className="space-y-2">
        {Object.entries(breakdown).map(([line, raw]) => {
          const row = raw as Record<string, unknown>;
          const gross = Number(row.earningsGross) || 0;
          const share = Number(row.driverShare) || 0;
          const trips = Number(row.tripCount) || 0;
          return (
            <div key={line} className="text-[11px] border-b border-slate-100 last:border-0 pb-1.5 last:pb-0">
              <p className="font-medium text-slate-800">{labels[line] || line}</p>
              <p className="text-slate-600 tabular-nums">
                {trips} trip{trips !== 1 ? 's' : ''} · gross {fmt(gross)} · driver {fmt(share)}
                {row.tierName ? ` · ${String(row.tierName)}` : ''}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectionSourcesPanel({ sources }: { sources?: Record<string, string> }) {
  if (!sources || Object.keys(sources).length === 0) return null;
  const rows = [
    { key: 'fares', label: 'Commission / fares' },
    { key: 'fuel', label: 'Fuel' },
    { key: 'tolls', label: 'Toll spend' },
    { key: 'cash', label: 'Cash transactions' },
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        Data sources
      </p>
      <p className="text-[10px] text-slate-400 mb-2">
        Where this week&apos;s numbers were loaded from — for ops troubleshooting only.
      </p>
      <div className="space-y-1">
        {rows.map(({ key, label }) => {
          const raw = sources[key];
          if (!raw) return null;
          return (
            <div key={key} className="flex justify-between gap-2 text-[11px]">
              <span className="text-slate-600">{label}</span>
              <span className="text-slate-800 font-medium tabular-nums">
                {SOURCE_LABELS[raw] || raw}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  hint,
  tone,
  bold,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'muted' | 'fleet' | 'driver' | 'ok' | 'warn';
  bold?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className={cn('text-sm', bold ? 'font-semibold text-slate-900' : 'text-slate-600')}>
          {label}
        </p>
        {hint ? <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p> : null}
      </div>
      <span
        className={cn(
          'text-sm tabular-nums shrink-0',
          bold && 'font-bold',
          tone === 'fleet' && 'text-indigo-700 font-semibold',
          tone === 'driver' && 'text-emerald-700 font-semibold',
          tone === 'ok' && 'text-emerald-700 font-bold',
          tone === 'warn' && 'text-amber-700',
          tone === 'muted' && 'text-slate-500',
          !tone && 'text-slate-800 font-medium',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function ReconciledPeriodOverlay({
  open,
  onOpenChange,
  driverName,
  detail,
  loading,
  partialData,
  transactions = [],
}: Props) {
  const periodLabel = useMemo(() => {
    if (!detail) return '';
    try {
      return `${format(parseISO(`${detail.periodAnchor}T12:00:00`), 'MMM d')} – ${format(
        parseISO(`${detail.periodEnd}T12:00:00`),
        'MMM d, yyyy',
      )}`;
    } catch {
      return `${detail.periodAnchor} – ${detail.periodEnd}`;
    }
  }, [detail]);

  const tagged = useMemo(() => {
    if (!detail) return { cash: [] as FinancialTransaction[], payouts: [] as FinancialTransaction[], writeOffs: [] as FinancialTransaction[] };
    const monday = detail.periodAnchor;
    const forDriver = (transactions || []).filter(
      (t) => String(t.driverId || '') === String(detail.driverId),
    );
    return {
      cash: forDriver
        .filter((t) => isCashReturnedForWeek(t, monday))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
      payouts: forDriver
        .filter((t) => isSettlementPaidForWeek(t, monday))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
      writeOffs: forDriver
        .filter((t) => isCashWriteOffForWeek(t, monday))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    };
  }, [detail, transactions]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Fleet vs Driver</SheetTitle>
          <SheetDescription className="text-xs">
            {driverName}
            {periodLabel ? ` · ${periodLabel}` : ''}
          </SheetDescription>
        </SheetHeader>

        {loading || !detail ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading period…</span>
          </div>
        ) : (
          <div className="px-1 pb-8 space-y-5">
            {partialData ? (
              <p className="text-[11px] text-amber-800 rounded-md bg-amber-50 px-3 py-2 border border-amber-100">
                Showing list-row data — live period detail could not be loaded. Amounts may be
                incomplete.
              </p>
            ) : null}
            {Number(detail.overpaidAmount) > 0.005 ? (
              <p
                className="text-[11px] text-violet-900 rounded-md bg-violet-50 px-3 py-2 border border-violet-100"
                title={OVERPAID_BADGE_TOOLTIP}
              >
                {overpaidBadgeLabel(detail.overpaidAmount)} — fleet disbursed more than gross
                entitlement this week. Recovery exposure is in Driver owes / settlement residual.
              </p>
            ) : null}
            <ProjectionSourcesPanel sources={detail.projectionSources} />
            <ServiceLineBreakdownPanel breakdown={detail.serviceLineBreakdown} />
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-emerald-800">Reconciled</p>
                  <Badge variant="secondary" className="font-normal bg-emerald-100 text-emerald-800">
                    Residual {fmt(detail.settlementAmount)}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {detail.tripCount} trip{detail.tripCount !== 1 ? 's' : ''}
                  {detail.tierName ? ` · ${detail.tierName}` : ''}
                  {detail.driverSharePercent > 0
                    ? ` · Driver ${detail.driverSharePercent}%`
                    : ''}
                </p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Gross split
              </p>
              <Line label="Gross revenue" value={fmt(detail.earningsGross)} bold />
              <Line
                label="Tips paid to driver"
                value={fmt(detail.tipsPaidToDriver || 0)}
                tone={(detail.tipsPaidToDriver || 0) > 0.005 ? 'driver' : 'muted'}
              />
              <Line
                label="Tips withheld (fleet)"
                value={fmt(detail.tipsWithheld || 0)}
                hint="Missed quota — retained in fleet share"
                tone={(detail.tipsWithheld || 0) > 0.005 ? 'fleet' : 'muted'}
              />
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 mb-2">
                    <Building2 className="h-3.5 w-3.5" />
                    Fleet
                  </div>
                  <Line label="Fleet share" value={fmt(detail.fleetShare)} tone="fleet" bold />
                  <Line
                    label="Fuel credit"
                    value={fmt(detail.fuelFleetShare)}
                    hint="Company fuel share"
                    tone={detail.fuelFleetShare > 0.005 ? 'fleet' : 'muted'}
                  />
                  <Line
                    label="Cash toll credit"
                    value={fmt(detail.tollCashSpend)}
                    hint="Cash plaza wash"
                    tone={detail.tollCashSpend > 0.005 ? 'fleet' : 'muted'}
                  />
                  <Line
                    label="Personal toll charged"
                    value={fmt(detail.tollChargedToDriver)}
                    hint="Driver owes back"
                    tone={detail.tollChargedToDriver > 0.005 ? 'warn' : 'muted'}
                  />
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-2">
                    <User className="h-3.5 w-3.5" />
                    Driver
                  </div>
                  <Line label="Driver share" value={fmt(detail.driverShare)} tone="driver" bold />
                  <Line
                    label="Fuel deduction"
                    value={detail.fuelDeduction > 0.005 ? `−${fmt(detail.fuelDeduction)}` : '$0.00'}
                    tone={detail.fuelDeduction > 0.005 ? 'warn' : 'muted'}
                  />
                  <Line
                    label="Charged to driver"
                    value={fmt(detail.tollChargedToDriver)}
                    hint="Personal tag tolls"
                    tone={detail.tollChargedToDriver > 0.005 ? 'warn' : 'muted'}
                  />
                  <Line label="Net payout" value={fmt(detail.payoutNet)} tone="driver" bold />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                How it closed
              </p>
              <p className="text-[11px] text-slate-400 mb-2">
                Passenger cash → returns & credits → still held − net payout → residual
              </p>
              <p className="text-[11px] text-amber-700/80 mb-2 rounded-md bg-amber-50/80 px-2 py-1.5">
                Platform toll reimbursement (tag credited) is display-only on Expenses — it does not
                change this week’s money residual. Confirmed via live sample (see
                docs/settlement-toll-reimbursement-trace.md).
              </p>
              {detail.cashSourceMismatch != null && Math.abs(detail.cashSourceMismatch) > 0.5 ? (
                <p className="text-[11px] text-amber-800 mb-2 rounded-md bg-amber-50 px-2 py-1.5">
                  Cash source mismatch {fmt(detail.cashSourceMismatch)} — trip CSV Uber cash disagrees
                  with ledger payout_cash; ledger already wins for passenger cash. Informational only —
                  does not block Pay or reconciliation.
                </p>
              ) : null}
              <Line label="Passenger cash" value={fmt(detail.cashCollected)} />
              <Line
                label="− Cash returned"
                value={detail.cashReturned > 0.005 ? `−${fmt(detail.cashReturned)}` : '$0.00'}
                tone={detail.cashReturned > 0.005 ? 'ok' : 'muted'}
              />
              <Line
                label="− Fleet fuel credit"
                value={detail.fuelFleetShare > 0.005 ? `−${fmt(detail.fuelFleetShare)}` : '$0.00'}
                tone={detail.fuelFleetShare > 0.005 ? 'ok' : 'muted'}
              />
              <Line
                label="− Cash toll credit"
                value={detail.tollCashSpend > 0.005 ? `−${fmt(detail.tollCashSpend)}` : '$0.00'}
                tone={detail.tollCashSpend > 0.005 ? 'ok' : 'muted'}
              />
              <Line
                label="+ Personal toll charged"
                value={
                  detail.tollChargedToDriver > 0.005
                    ? `+${fmt(detail.tollChargedToDriver)}`
                    : '$0.00'
                }
                tone={detail.tollChargedToDriver > 0.005 ? 'warn' : 'muted'}
              />
              <Line
                label="− Cash write-offs"
                value={detail.cashWrittenOff > 0.005 ? `−${fmt(detail.cashWrittenOff)}` : '$0.00'}
                tone={detail.cashWrittenOff > 0.005 ? 'ok' : 'muted'}
              />
              <Separator className="my-2" />
              <Line
                label="Cash still held (before net)"
                value={fmt(detail.cashStillHeld)}
                bold
              />
              <Line
                label="− Net payout (driver keeps)"
                value={detail.payoutNet > 0.005 ? `−${fmt(detail.payoutNet)}` : '$0.00'}
                tone="driver"
              />
              <Line
                label="− Settlement paid to driver"
                value={detail.settlementPaid > 0.005 ? `−${fmt(detail.settlementPaid)}` : '$0.00'}
                hint="Cleared Driver Payouts tagged to this week"
                tone={detail.settlementPaid > 0.005 ? 'ok' : 'muted'}
              />
              <Separator className="my-2" />
              <Line label="Residual (should be ~$0)" value={fmt(detail.settlementAmount)} tone="ok" bold />
            </div>

            <Separator />

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Payments that counted
              </p>
              {tagged.cash.length === 0 &&
              tagged.payouts.length === 0 &&
              tagged.writeOffs.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">
                  No tagged Log Cash / payout / write-off rows in this desk range for the week.
                  Totals above still come from the period projection.
                </p>
              ) : (
                <div className="space-y-3">
                  {tagged.cash.length > 0 && (
                    <PaymentGroup title="Cash returned" rows={tagged.cash} />
                  )}
                  {tagged.payouts.length > 0 && (
                    <PaymentGroup title="Paid to driver" rows={tagged.payouts} />
                  )}
                  {tagged.writeOffs.length > 0 && (
                    <PaymentGroup title="Write-offs" rows={tagged.writeOffs} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PaymentGroup({ title, rows }: { title: string; rows: FinancialTransaction[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-600 mb-1">{title}</p>
          <ul className="rounded-lg border border-slate-100 divide-y divide-slate-100">
        {rows.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="font-medium text-slate-800 truncate">
                {String(t.date || '').slice(0, 10)}
                {t.paymentMethod ? ` · ${t.paymentMethod}` : ''}
              </p>
              <p className="text-slate-400 truncate">
                {t.referenceNumber || t.description || t.status || '—'}
              </p>
            </div>
            <span className="tabular-nums font-semibold text-slate-900 shrink-0">
              {fmt(Math.abs(Number(t.amount) || 0))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
