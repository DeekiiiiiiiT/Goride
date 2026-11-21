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
import { TollV2DangerOutlineButton, TollV2PrimaryButton, TollV2SecondaryButton } from './TollV2Buttons';
import { fmtTollMinor, formatDecidedAt, paybackLine } from './tollV2Format';

const SECTION_ICONS: Record<string, React.ReactNode> = {
  suggested: <Sparkles className="h-5 w-5 text-[#47464c]" aria-hidden />,
  pick: <GitBranch className="h-5 w-5 text-[#47464c]" aria-hidden />,
  no_trip: <UserX className="h-5 w-5 text-[#47464c]" aria-hidden />,
  receipts: <Camera className="h-5 w-5 text-[#47464c]" aria-hidden />,
  duplicates: <Copy className="h-5 w-5 text-[#47464c]" aria-hidden />,
  paybacks: <Wallet className="h-5 w-5 text-[#47464c]" aria-hidden />,
  decided: <Check className="h-5 w-5 text-[#47464c]" aria-hidden />,
};

/** Today's groups. The six-part layout (UI1) passes `only` to show some groups inside one part. */
const TODAY_KEYS = ['suggested', 'pick', 'no_trip', 'receipts', 'duplicates', 'paybacks', 'decided'];
/** Groups that hide when empty even in a part (they rarely have anything). */
const HIDE_WHEN_EMPTY = new Set(['awaiting_cash', 'part_paid']);

export function TollV2Sections({
  charges,
  paybacks,
  kept,
  rowActions,
  onConfirmAllSure,
  sureCount,
  sealed,
  only,
  bare,
}: {
  charges: TollV2Charge[];
  paybacks: TollV2Payback[];
  kept: TollV2KeptPayback[];
  rowActions: TollV2RowActions;
  onConfirmAllSure?: () => void;
  sureCount: number;
  sealed: boolean;
  emptyPairSlot?: React.ReactNode;
  only?: readonly string[];
  /** Inside a part card whose title already names the group: no title or explanation line. */
  bare?: boolean;
}) {
  const keys = only ?? TODAY_KEYS;
  const dupCount = chargesInSection(charges, 'duplicates').length;
  const pbCount = paybacks.length + kept.length;

  const compactEmptyCards =
    !only && !sealed && (dupCount === 0 || pbCount === 0) ? (
      <div className={dupCount === 0 && pbCount === 0 ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'}>
        {dupCount === 0 ? (
          <CompactEmptyReviewCard title="Possible duplicates" testId="toll-v2-compact-empty-duplicates" />
        ) : null}
        {pbCount === 0 ? (
          <CompactEmptyReviewCard title="Uber paybacks with no toll" testId="toll-v2-compact-empty-paybacks" />
        ) : null}
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {SECTION_ORDER.filter((sec) => keys.includes(sec.key)).map((sec) => {
        const rows = sec.key === 'paybacks' ? [] : chargesInSection(charges, sec.key);
        const count = sectionRowCount(charges, sec.key, paybacks, kept);
        const totalMinor =
          sec.key === 'paybacks'
            ? paybacks.reduce((n, p) => n + (p.openMinor ?? p.amountMinor ?? 0), 0) +
              kept.reduce((n, k) => n + (k.amountMinor ?? 0), 0)
            : sectionTotalMinor(charges, sec.key);

        const empty = count === 0;
        // Today's layout shows empty duplicates / paybacks as compact cards; a part shows the green empty row.
        if (!only && (sec.key === 'duplicates' || sec.key === 'paybacks') && empty) return null;
        if (HIDE_WHEN_EMPTY.has(sec.key) && empty) return null;

        // Stitch sealed week: only what was decided is listed; empty work sections are hidden.
        if (sealed && empty) return null;

        const sectionBlock = (
          <section key={sec.key} id={sec.id} className="overflow-hidden rounded-[20px] border border-[#e5eeff] bg-white shadow-sm">
            <header className="border-b border-[#eff4ff] bg-[#f8f9ff] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {bare ? null : SECTION_ICONS[sec.key]}
                {bare ? null : <h4 className="text-sm font-semibold text-[#0b1c30]">{sec.title}</h4>}
                <span className="rounded-full bg-[#d5e0f8] px-2.5 py-0.5 text-xs font-semibold text-[#0b1c30]">
                  {tollCountLabel(count, sec.key)}
                </span>
                <span className="text-sm font-semibold tabular-nums text-[#0b1c30]">
                  {fmtTollMinor(totalMinor)}
                </span>
              </div>
              {bare ? null : <p className="mt-1 text-sm text-[#47464c]">{sec.explanation}</p>}
              {sec.key === 'no_trip' ? <OfflineCrossingsLine rows={rows} /> : null}
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
                  <KeptRow key={k.id} kept={k} rowActions={rowActions} readOnly={!!rowActions.readOnly} />
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

        if (sec.key === 'decided') {
          return (
            <React.Fragment key={sec.key}>
              {compactEmptyCards}
              {sectionBlock}
            </React.Fragment>
          );
        }
        return sectionBlock;
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

function KeptRow({
  kept,
  rowActions,
  readOnly,
}: {
  kept: TollV2KeptPayback;
  rowActions: TollV2RowActions & { onUndoKept?: (kept: TollV2KeptPayback) => void };
  readOnly: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-testid="toll-v2-kept-row">
      <div className="text-sm">
        <p className="font-medium text-[#0b1c30]">{paybackLine(kept.trip, undefined, kept.amountMinor)}</p>
        <p className="text-xs text-[#47464c]">
          Kept with no toll · {formatDecidedAt(kept.at, kept.by)}
        </p>
      </div>
      {!readOnly && kept.undo && rowActions.onUndoKept ? (
        <TollV2DangerOutlineButton type="button" onClick={() => rowActions.onUndoKept?.(kept)}>
          Undo
        </TollV2DangerOutlineButton>
      ) : null}
    </li>
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
        <p className="font-medium text-[#0b1c30]">{paybackLine(payback.trip, payback.paidOn, payback.amountMinor)}</p>
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

/** "No trip" header line: crossings made while the driver was offline (Uber activity timeline). */
function OfflineCrossingsLine({ rows }: { rows: TollV2Charge[] }) {
  const flagged = rows.filter((c) => c.offlineFlag);
  if (!flagged.length) return null;
  const total = flagged.reduce((n, c) => n + (c.openMinor ?? c.amountMinor ?? 0), 0);
  return (
    <p className="mt-1 text-sm font-semibold text-[#93000a]" data-testid="toll-v2-offline-summary">
      {flagged.length} crossed while the driver was offline · {fmtTollMinor(total)}
    </p>
  );
}
