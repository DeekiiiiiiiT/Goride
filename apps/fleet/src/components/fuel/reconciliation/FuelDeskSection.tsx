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

/** Server block reasons in plain words, with the part to go to (Week Reconciliation Fuel step). */
export function plainFuelBlockReason(reason: string | null): string | null {
  if (!reason) return reason;
  if (/critical fill flags not dispositioned/i.test(reason)) return 'A flagged fill still needs a decision — see Fuel checks.';
  if (/data-quality flagged vehicles not marked reviewed/i.test(reason)) return 'A flagged car still needs Mark reviewed — see Fuel checks.';
  if (/stop-to-stop attribution does not close/i.test(reason)) return "A fill window's km don't add up — see Distance and who pays.";
  return reason;
}

/** The step's finish: Finalize fuel locks the fuel week, which completes step 5. */
export function FuelDeskFinalizeBar({
  blockedReason,
  finalizing,
  locked,
  onFinalize,
  openCount = 0,
  refused = false,
}: {
  blockedReason: string | null;
  finalizing: boolean;
  locked: boolean;
  onFinalize: () => void;
  /** Things in "Still open" (Part J screen 10): the line reads "N things still open". */
  openCount?: number;
  /** The last Finalize was refused and nothing locked (Part J screen 11). */
  refused?: boolean;
}) {
  const ready = !blockedReason && !locked;
  const chip = locked ? 'Locked' : refused ? 'Not locked' : ready ? 'Ready' : 'Not ready';
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#f2f4f6] p-5"
      data-testid="recon-fuel-seal"
    >
      <div className="flex min-w-0 items-center gap-4">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white',
            refused && !locked ? 'text-[#ba1a1a]' : 'text-[#47464c]',
          )}
        >
          <Lock className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-[#191c1e]">
            Fuel seal
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[12px] font-semibold',
                locked
                  ? 'bg-[#0b1c30] text-white'
                  : refused
                    ? 'bg-[#ffdad6] text-[#ba1a1a]'
                    : ready
                      ? 'bg-[#ecfdf5] text-[#069669]'
                      : 'bg-[#e6e8ea] text-[#47464c]',
              )}
            >
              {chip}
            </span>
          </p>
          <p className="text-[13px] text-[#47464c]">
            {locked
              ? 'This fuel week is locked. Driver fuel charges are posted.'
              : ready
                ? refused
                  ? 'Nothing was locked. Finalize again when you are ready.'
                  : 'Everything checks out. Finalizing locks the fuel week and posts driver fuel charges.'
                : openCount > 0
                  ? `${openCount === 1 ? '1 thing' : `${openCount} things`} still open`
                  : plainFuelBlockReason(blockedReason)}
          </p>
        </div>
      </div>
      {locked ? null : (
        <button
          type="button"
          onClick={onFinalize}
          disabled={!ready || finalizing}
          data-testid="recon-finalize-fuel"
          className="flex h-11 items-center gap-2 rounded-xl bg-[#030213] px-5 text-sm font-semibold text-white hover:bg-[#213145] disabled:cursor-not-allowed disabled:bg-[#78767d] disabled:opacity-70"
        >
          {finalizing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
          Finalize fuel
        </button>
      )}
    </div>
  );
}
