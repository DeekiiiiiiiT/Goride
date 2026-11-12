/**
 * Week Reconciliation step 5 (WRA-01): one fuel section card in the Stitch
 * "Step 5 Fuel" look. Layout only — content comes from the fuel wizard.
 */
import React from 'react';
import { ChevronDown, Loader2, Lock } from 'lucide-react';
import { cn } from '../../ui/utils';

export function FuelDeskSection({
  index,
  title,
  description,
  badge,
  defaultOpen = true,
  testId,
  children,
}: {
  index: number;
  title: string;
  description: string;
  badge?: { text: string; tone: 'todo' | 'done' } | null;
  defaultOpen?: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-[#e5eeff] bg-[#f8f9ff] p-4" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-[#0b1c30]">
            {index}. {title}
            {badge ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[12px] font-semibold',
                  badge.tone === 'done' ? 'bg-[#ecfdf5] text-[#069669]' : 'bg-[#dbe7ff] text-[#0051d5]',
                )}
              >
                {badge.text}
              </span>
            ) : null}
          </p>
          <p className="text-sm text-[#47464c]">{description}</p>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-[#47464c] transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** The step's finish: Finalize fuel locks the fuel week, which completes step 5. */
export function FuelDeskFinalizeBar({
  blockedReason,
  finalizing,
  locked,
  onFinalize,
}: {
  blockedReason: string | null;
  finalizing: boolean;
  locked: boolean;
  onFinalize: () => void;
}) {
  const ready = !blockedReason && !locked;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e5eeff] bg-white p-5"
      data-testid="recon-fuel-seal"
    >
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-lg font-semibold text-[#0b1c30]">
          Fuel seal
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
              locked ? 'bg-[#0b1c30] text-white' : ready ? 'bg-[#ecfdf5] text-[#069669]' : 'bg-[#eff4ff] text-[#0051d5]',
            )}
          >
            {locked ? 'Locked' : ready ? 'Ready' : 'Not ready'}
          </span>
        </p>
        <p className="text-[13px] text-[#47464c]">
          {locked
            ? 'This fuel week is locked. Driver fuel charges are posted.'
            : ready
              ? 'Everything checks out. Finalizing locks the fuel week and posts driver fuel charges.'
              : blockedReason}
        </p>
      </div>
      {locked ? null : (
        <button
          type="button"
          onClick={onFinalize}
          disabled={!ready || finalizing}
          data-testid="recon-finalize-fuel"
          className="flex h-11 items-center gap-2 rounded-xl bg-[#030213] px-5 text-sm font-semibold text-white hover:bg-[#213145] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {finalizing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
          Finalize fuel
        </button>
      )}
    </div>
  );
}
