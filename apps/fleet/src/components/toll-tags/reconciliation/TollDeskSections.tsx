/**
 * Week Reconciliation step 3 (WRA-01): the toll categories as stacked sections,
 * in the Stitch "Step 3 Tolls" look. Layout only — every number and action
 * comes from ReconciliationWizard, which keeps all toll money logic.
 * No inner stepper, no landing, no "Close Week": Seal tolls finishes the step.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import type { FinancialTransaction } from '../../../types/data';
import { cn } from '../../ui/utils';

export type TollDeskSection = {
  id: string;
  title: string;
  description: string;
  /** Rows shown in the section heading ("5 tolls"). */
  itemCount: number;
  itemNoun: string;
  /** Items still needing a decision (server count when available). */
  todo: number;
  /** Section total in dollars, when it is a simple sum. */
  total?: number | null;
  /** Refund sections show credits in green with a minus sign. */
  credit?: boolean;
  content: React.ReactNode;
};

export function fmtTollMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}J$${abs}`;
}

function tollWhen(tx: FinancialTransaction): string {
  const d = String(tx.date || '').slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  const time = tx.time ? ` ${String(tx.time).slice(0, 5)}` : '';
  return `${day} ${month}${time}`;
}

/** Section 1: tolls on a trip that the platform paid back in full. Read-only rows. */
export function ReimbursedTollRows({ tolls }: { tolls: FinancialTransaction[] }) {
  if (tolls.length === 0) {
    return <p className="rounded-xl bg-[#f8f9ff] px-4 py-3 text-sm text-[#47464c]">No fully paid-back tolls yet this week.</p>;
  }
  return (
    <ul className="divide-y divide-[#eff4ff] rounded-xl border border-[#e5eeff] bg-white">
      {tolls.map((tx) => (
        <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm text-[#0b1c30]">
          <span className="font-medium">{tollWhen(tx)}</span>
          <span className="text-[#47464c]">· {tx.description || 'Toll'}</span>
          {tx.vehiclePlate ? <span className="font-mono text-[12px] text-[#47464c]">· {tx.vehiclePlate}</span> : null}
          {tx.driverName ? <span className="text-[#47464c]">· {tx.driverName}</span> : null}
          <span className="ml-auto font-mono tabular-nums">{fmtTollMoney(Math.abs(tx.amount))}</span>
          <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[12px] font-semibold text-[#069669]">Done</span>
        </li>
      ))}
    </ul>
  );
}

export function TollDeskSections({
  money,
  sections,
  driverCharges,
  ledgerDifference,
  sealBlockedReason,
  sealing,
  busy,
  onSeal,
  onRefresh,
  topSlot,
  summaryTarget,
}: {
  money: { spend: number; paidBack: number; charged: number; fleetCost: number };
  sections: TollDeskSection[];
  driverCharges: Array<{ name: string; amount: number }>;
  /** Cards vs ledger events; 0 = they agree, null = not checked. */
  ledgerDifference: number | null;
  /** Why Seal tolls is off, in plain words; null = ready. */
  sealBlockedReason: string | null;
  sealing: boolean;
  busy: boolean;
  onSeal: () => void;
  onRefresh: () => void;
  /** Banners that stay above the sections (truncation, rematch queue). */
  topSlot?: React.ReactNode;
  /** The week page's right column, for the "Driver toll charges" card. */
  summaryTarget?: HTMLElement | null;
}) {
  const todoTotal = sections.reduce((n, s) => n + s.todo, 0);
  const chargedTotal = driverCharges.reduce((n, d) => n + d.amount, 0);
  const ready = sealBlockedReason == null;

  const summaryCards = (
    <div className="space-y-4">
      <div className="rounded-[20px] bg-white p-5 shadow-sm" data-testid="recon-toll-driver-charges">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">Driver toll charges</p>
        {driverCharges.length === 0 ? (
          <p className="mt-2 text-sm text-[#47464c]">No drivers charged this week.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {driverCharges.map((d) => (
              <li key={d.name} className="flex justify-between gap-2">
                <span className="truncate text-[#0b1c30]">{d.name}</span>
                <span className="font-mono tabular-nums">{fmtTollMoney(d.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex justify-between border-t border-[#e5eeff] pt-2 text-sm font-semibold">
          <span>Total to charge drivers</span>
          <span className="font-mono tabular-nums">{fmtTollMoney(chargedTotal)}</span>
        </div>
      </div>
      <div className="rounded-[20px] bg-white p-5 shadow-sm" data-testid="recon-toll-status">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">Toll status</p>
        {ready ? (
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#069669]">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Balanced and ready to seal
          </p>
        ) : (
          <p className="mt-2 text-sm font-semibold text-[#0051d5]">{sealBlockedReason}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="recon-tolls-panel">
      {topSlot}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Toll spend', value: money.spend, tone: 'text-[#0b1c30]' },
          { label: 'Paid back by platforms', value: money.paidBack, tone: 'text-[#069669]' },
          { label: 'Charged to drivers', value: money.charged, tone: 'text-[#0b1c30]' },
          { label: 'Fleet cost', value: money.fleetCost, tone: 'text-[#0b1c30]' },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl bg-[#eff4ff] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">{t.label}</p>
            <p className={cn('mt-1 text-lg font-bold tabular-nums', t.tone)}>{fmtTollMoney(t.value)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#47464c]">
          {todoTotal === 0 ? 'Every toll has a decision.' : `${todoTotal} ${todoTotal === 1 ? 'item needs' : 'items need'} a decision.`}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="flex h-9 items-center gap-2 rounded-xl bg-[#e5eeff] px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#d3e4fe] disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Re-run matching
        </button>
      </div>

      {sections.map((s, i) => (
        <details
          key={s.id}
          open={s.todo > 0 || s.id === 'underpaid'}
          className="group rounded-2xl border border-[#e5eeff] bg-[#f8f9ff] p-4"
          data-testid={`recon-toll-section-${s.id}`}
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-[#0b1c30]">
                {i + 1}. {s.title}
                <span className="rounded-full bg-[#e5eeff] px-2 py-0.5 text-[12px] font-medium text-[#47464c]">
                  {s.itemCount} {s.itemNoun}
                </span>
                {s.todo > 0 ? (
                  <span className="rounded-full bg-[#dbe7ff] px-2 py-0.5 text-[12px] font-semibold text-[#0051d5]">
                    {s.todo} to decide
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-[#47464c]">{s.description}</p>
            </div>
            <span className="flex items-center gap-2">
              {s.total != null ? (
                <span className={cn('text-lg font-bold tabular-nums', s.credit && s.total > 0 ? 'text-[#069669]' : 'text-[#0b1c30]')}>
                  {fmtTollMoney(s.credit ? -s.total : s.total)}
                </span>
              ) : null}
              <ChevronDown className="h-5 w-5 text-[#47464c] transition-transform group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <div className="mt-3">{s.content}</div>
        </details>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e5eeff] bg-white p-5" data-testid="recon-toll-seal">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-lg font-semibold text-[#0b1c30]">
            {ready ? <CheckCircle2 className="h-5 w-5 text-[#069669]" aria-hidden /> : null}
            Toll seal
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                ready ? 'bg-[#ecfdf5] text-[#069669]' : 'bg-[#eff4ff] text-[#0051d5]',
              )}
            >
              {ready ? 'Balanced' : 'Not ready'}
            </span>
          </p>
          <p className="font-mono text-[13px] text-[#0b1c30]">
            Spend {fmtTollMoney(money.spend)} − Paid back {fmtTollMoney(money.paidBack)} − Charged {fmtTollMoney(money.charged)} = Fleet cost{' '}
            {fmtTollMoney(money.fleetCost)}
          </p>
          <p className="text-[13px] text-[#47464c]">
            {ledgerDifference == null
              ? 'Ledger check runs once all platforms are shown.'
              : ledgerDifference === 0
                ? 'Matches the toll ledger.'
                : `Differs from the toll ledger by ${fmtTollMoney(Math.abs(ledgerDifference))}.`}
          </p>
          {!ready ? <p className="text-[13px] font-medium text-[#0051d5]">{sealBlockedReason}</p> : null}
        </div>
        <button
          type="button"
          onClick={onSeal}
          disabled={!ready || sealing || busy}
          data-testid="recon-seal-tolls"
          className="flex h-11 items-center gap-2 rounded-xl bg-[#030213] px-5 text-sm font-semibold text-white hover:bg-[#213145] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sealing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
          Seal tolls
        </button>
      </div>

      <p className="text-[13px] text-[#47464c]">
        <span className="font-semibold text-[#0b1c30]">Rule:</span> On a trip = pickup to drop-off. Deadhead = up to about 45 minutes
        before a pickup. After a trip or no trip = personal.
      </p>

      {summaryTarget ? createPortal(summaryCards, summaryTarget) : null}
    </div>
  );
}
