/**
 * WRA-16 / §4.1: how fresh the numbers are, on every Week Reconciliation page.
 * Green line when all is well; blue while updates are waiting; red when the
 * calculator is paused (Close is off then).
 */
import React from 'react';
import { AlertOctagon, Loader2 } from 'lucide-react';
import type { ReconCalculatorStatus } from '../../../services/reconApi';
import { formatAgo, formatDay } from './weekListFormat';
import { cn } from '../../ui/utils';

export function ReconCalculatorBanner({
  calculator,
  lastComputedAt,
  className,
}: {
  calculator: ReconCalculatorStatus | null | undefined;
  /** The saved desk's time, when a week is open (falls back to the calculator's). */
  lastComputedAt?: string | null;
  className?: string;
}) {
  const computedAt = lastComputedAt ?? calculator?.lastComputedAt ?? null;
  const ago = formatAgo(computedAt);

  if (calculator?.paused) {
    const since = calculator.pausedSince ? formatDay(calculator.pausedSince.slice(0, 10)) : null;
    return (
      <div
        role="alert"
        data-testid="recon-calculator-banner"
        data-state="paused"
        className={cn('flex flex-wrap items-center gap-3 rounded-2xl border border-[#ffdad6] bg-[#fff1f2] px-4 py-3 text-sm text-[#93000a]', className)}
      >
        <AlertOctagon className="h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">
            Calculator paused{since ? ` since ${since}` : ''}
            {computedAt ? ` — numbers last updated ${formatDay(computedAt.slice(0, 10))}` : ''}.
          </p>
          <p className="text-[13px]">
            {calculator.pendingUnits > 0 ? `${calculator.pendingUnits} changes waiting. ` : ''}
            Close week stays off until it is running again.
          </p>
        </div>
      </div>
    );
  }

  if (calculator && calculator.pendingUnits > 0) {
    return (
      <div
        data-testid="recon-calculator-banner"
        data-state="updating"
        className={cn('flex items-center gap-2 rounded-2xl bg-[#eff6ff] px-4 py-2.5 text-[13px] font-medium text-[#1d4ed8]', className)}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>
          Updating {calculator.pendingUnits} {calculator.pendingUnits === 1 ? 'change' : 'changes'}…
          {ago ? ` Numbers as of ${ago}.` : ''}
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="recon-calculator-banner"
      data-state="fresh"
      className={cn('flex items-center gap-2 text-[13px] font-medium text-[#0b1c30]', className)}
    >
      <span className="h-2 w-2 rounded-full bg-[#069669]" aria-hidden />
      <span>{ago ? `Numbers updated ${ago}` : 'Numbers are up to date'}</span>
    </div>
  );
}
