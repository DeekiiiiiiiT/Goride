import React from 'react';
import {
  Camera,
  Check,
  Copy,
  GitBranch,
  Sparkles,
  UserX,
  Wallet,
} from 'lucide-react';
import {
  chargesInSection,
  SECTION_ORDER,
  sectionRowCount,
  sectionTotalMinor,
  tollCountLabel,
} from './tollV2DeskLogic';
import type { TollV2Charge, TollV2KeptPayback, TollV2Payback } from './types';
import { TollV2ChargeRow, type TollV2RowActions } from './TollV2ChargeRow';
import { TollV2PrimaryButton, TollV2SecondaryButton } from './TollV2Buttons';
import { fmtTollMinor, tripPill } from './tollV2Format';

const SECTION_ICONS: Record<string, React.ReactNode> = {
  suggested: <Sparkles className="h-5 w-5 text-[#47464c]" aria-hidden />,
  pick: <GitBranch className="h-5 w-5 text-[#47464c]" aria-hidden />,
  no_trip: <UserX className="h-5 w-5 text-[#47464c]" aria-hidden />,
  receipts: <Camera className="h-5 w-5 text-[#47464c]" aria-hidden />,
  duplicates: <Copy className="h-5 w-5 text-[#47464c]" aria-hidden />,
  paybacks: <Wallet className="h-5 w-5 text-[#47464c]" aria-hidden />,
  decided: <Check className="h-5 w-5 text-[#47464c]" aria-hidden />,
};

export function TollV2Sections({
  charges,
  paybacks,
  kept,
  rowActions,
  onConfirmAllSure,
  sureCount,
  sealed,
}: {
  charges: TollV2Charge[];
  paybacks: TollV2Payback[];
  kept: TollV2KeptPayback[];
  rowActions: TollV2RowActions;
  onConfirmAllSure?: () => void;
  sureCount: number;
  sealed: boolean;
  emptyPairSlot?: React.ReactNode;
}) {
  const dupCount = chargesInSection(charges, 'duplicates').length;
  const pbCount = paybacks.length + kept.length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {dupCount === 0 ? (
          <CompactEmptyReviewCard title="Possible duplicates" testId="toll-v2-compact-empty-duplicates" />
        ) : null}
        {pbCount === 0 ? (
          <CompactEmptyReviewCard title="Uber paybacks with no toll" testId="toll-v2-compact-empty-paybacks" />
        ) : null}
      </div>
      {SECTION_ORDER.map((sec) => {
        const rows = sec.key === 'paybacks' ? [] : chargesInSection(charges, sec.key);
        const count = sectionRowCount(charges, sec.key, paybacks, kept);
        const totalMinor =
          sec.key === 'paybacks'
            ? paybacks.reduce((n, p) => n + (p.openMinor ?? p.amountMinor ?? 0), 0) +
              kept.reduce((n, k) => n + (k.amountMinor ?? 0), 0)
            : sectionTotalMinor(charges, sec.key);

        if (sec.key === 'duplicates' && dupCount > 0) {
          // full section below
        } else if (sec.key === 'duplicates' && dupCount === 0) {
          return null;
        }
        if (sec.key === 'paybacks' && pbCount > 0) {
          // full section
        } else if (sec.key === 'paybacks' && pbCount === 0) {
          return null;
        }

        const empty = count === 0;

        return (
          <section key={sec.key} id={sec.id} className="overflow-hidden rounded-[20px] border border-[#e5eeff] bg-white shadow-sm">
            <header className="border-b border-[#eff4ff] bg-[#f8f9ff] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {SECTION_ICONS[sec.key]}
                <h4 className="text-sm font-semibold text-[#0b1c30]">{sec.title}</h4>
                <span className="rounded-full bg-[#d5e0f8] px-2.5 py-0.5 text-xs font-semibold text-[#0b1c30]">
                  {tollCountLabel(count)}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[#0b1c30]">
                  {fmtTollMinor(totalMinor)}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#47464c]">{sec.explanation}</p>
            </header>
            {sec.key === 'suggested' && !sealed && sureCount > 0 && onConfirmAllSure ? (
              <div className="border-b border-[#eff4ff] px-4 py-2">
                <TollV2PrimaryButton type="button" onClick={onConfirmAllSure} data-testid="toll-v2-confirm-all-open">
                  Confirm all sure matches ({sureCount})
                </TollV2PrimaryButton>
              </div>
            ) : null}
            {empty ? (
              <p className="flex items-center gap-2 px-4 py-4 text-sm text-[#47464c]" data-testid={`toll-v2-empty-${sec.key}`}>
                <Check className="h-4 w-4 shrink-0 text-[#069669]" aria-hidden />
                {sec.emptyCopy}
              </p>
            ) : sec.key === 'paybacks' ? (
              <ul className="divide-y divide-[#eff4ff]">
                {paybacks.map((p) => (
                  <PaybackRow key={p.id} payback={p} rowActions={rowActions} readOnly={!!rowActions.readOnly} />
                ))}
                {kept.map((k) => (
                  <li key={k.id} className="px-4 py-3 text-sm text-[#47464c]">
                    Kept with no toll · {fmtTollMinor(k.amountMinor)}
                  </li>
                ))}
              </ul>
            ) : (
              <ul>
                {rows.map((c) => (
                  <TollV2ChargeRow key={c.id} charge={c} actions={rowActions} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CompactEmptyReviewCard({ title, testId }: { title: string; testId: string }) {
  return (
    <div
      className="rounded-xl border border-[#e5eeff] bg-white px-4 py-4 shadow-sm"
      data-testid={testId}
    >
      <p className="text-sm font-semibold text-[#0b1c30]">{title}</p>
      <p className="mt-2 flex items-center gap-2 text-sm text-[#47464c]">
        <Check className="h-4 w-4 shrink-0 text-[#069669]" aria-hidden />
        Nothing to review
      </p>
    </div>
  );
}

function PaybackRow({
  payback,
  rowActions,
  readOnly,
}: {
  payback: TollV2Payback;
  rowActions: TollV2RowActions & {
    onLinkPayback?: (payback: TollV2Payback) => void;
    onLeaveUnlinked?: (payback: TollV2Payback) => void;
  };
  readOnly: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="text-sm">
        <p className="font-medium text-[#0b1c30]">{tripPill(payback.trip, payback.amountMinor)}</p>
        <p className="text-xs text-[#47464c]">Open {fmtTollMinor(payback.openMinor)}</p>
      </div>
      {!readOnly ? (
        <div className="flex gap-2">
          <TollV2SecondaryButton type="button" onClick={() => rowActions.onLeaveUnlinked?.(payback)}>
            Keep with no toll
          </TollV2SecondaryButton>
          <TollV2PrimaryButton type="button" onClick={() => rowActions.onLinkPayback?.(payback)}>
            Match to a toll
          </TollV2PrimaryButton>
        </div>
      ) : null}
    </li>
  );
}
