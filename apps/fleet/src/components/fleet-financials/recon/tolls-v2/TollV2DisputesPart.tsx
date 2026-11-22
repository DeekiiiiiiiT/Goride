import React, { useState } from 'react';
import { AlertTriangle, Check, Clock, Info, Smartphone, Undo2 } from 'lucide-react';
import type { TollV2DisputeResult, TollV2DisputeRow, TollV2DisputesBlock } from './types';
import { fmtTollMinor, formatDecidedAt } from './tollV2Format';
import {
  daysLeftText,
  disputeMoneyLine,
  disputeOwedChip,
  disputeStateChip,
  disputeTitle,
  disputeTripPill,
  fromWeekChip,
  resultChip,
  waitingSentence,
  type DisputeChip,
} from './tollV2Parts';
import { TollV2DangerOutlineButton, TollV2PrimaryButton, TollV2SecondaryButton } from './TollV2Buttons';

const TONE: Record<DisputeChip['tone'], string> = {
  amber: 'bg-amber-100 text-amber-900',
  blue: 'bg-[#dbeafe] text-[#1d4ed8]',
  red: 'bg-[#ffdad6] text-[#93000a]',
  green: 'bg-[#ecfdf5] text-[#069669]',
  grey: 'bg-[#eff4ff] text-[#47464c]',
};

export type TollV2DisputeActions = {
  onMarkSent: (d: TollV2DisputeRow) => void;
  onRefundReceived: (d: TollV2DisputeRow) => void;
  onLost: (d: TollV2DisputeRow) => void;
  onOpenTrip: (d: TollV2DisputeRow) => void;
  onUndoResult: (r: TollV2DisputeResult) => void;
};

const FIRST_ROWS = 5;

export function TollV2DisputesPart({
  disputes,
  results,
  busy,
  actions,
}: {
  disputes: TollV2DisputesBlock;
  results: TollV2DisputeResult[];
  busy: boolean;
  actions: TollV2DisputeActions;
}) {
  const [showAll, setShowAll] = useState(false);
  const active = disputes.active ?? [];
  const rows = showAll ? active : active.slice(0, FIRST_ROWS);
  const { toSend, sent, late } = disputes.tiles;
  // Owner 21 Nov: two tabs at the top, so the results are not at the bottom of a long list.
  const [tab, setTab] = useState<'open' | 'results'>(() => (active.length === 0 && results.length > 0 ? 'results' : 'open'));
  const openMinor = active.reduce((n, d) => n + (d.leftMinor ?? 0), 0);

  return (
    <div className="flex flex-col gap-5" data-testid="toll-v2-part-disputes">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#eff4ff] p-1" role="tablist" aria-label="Disputes">
        <DisputeTab
          selected={tab === 'open'}
          onClick={() => setTab('open')}
          label="Open disputes"
          sub={active.length === 0 ? 'None' : `${active.length} · ${fmtTollMinor(openMinor)}`}
          testId="toll-v2-disputes-tab-open"
        />
        <DisputeTab
          selected={tab === 'results'}
          onClick={() => setTab('results')}
          label="Results this week"
          sub={results.length === 0 ? 'None yet' : String(results.length)}
          testId="toll-v2-disputes-tab-results"
        />
      </div>

      {tab === 'open' ? (
        <>
          {disputes.waitingMinor > 0 ? (
            <div className="flex items-start gap-3 rounded-xl bg-blue-50/80 p-4" data-testid="toll-v2-disputes-waiting">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#1d4ed8]" aria-hidden />
              <p className="text-sm leading-relaxed text-[#0b1c30]">{waitingSentence(disputes.waitingMinor)}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="To send" count={toSend.count} amountMinor={toSend.amountMinor} tone={toSend.count ? 'amber' : 'none'} testId="toll-v2-tile-to-send" />
            <Tile label="Sent, waiting on Uber" count={sent.count} amountMinor={sent.amountMinor} tone={sent.count ? 'blue' : 'none'} testId="toll-v2-tile-sent" />
            <Tile label="Late" count={late.count} amountMinor={late.amountMinor} tone={late.count ? 'red' : 'none'} testId="toll-v2-tile-late" />
          </div>

          {active.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-[#47464c]" data-testid="toll-v2-empty-disputes">
              <Check className="h-4 w-4 shrink-0 text-[#069669]" aria-hidden />
              Nothing to review
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((d) => (
                <DisputeRow key={d.id} d={d} busy={busy} actions={actions} />
              ))}
            </ul>
          )}
          {active.length > FIRST_ROWS && !showAll ? (
            <div className="flex justify-center">
              <TollV2SecondaryButton type="button" onClick={() => setShowAll(true)} data-testid="toll-v2-disputes-show-all">
                Show all {active.length} disputes
              </TollV2SecondaryButton>
            </div>
          ) : null}

          {active.length > 0 ? (
            <p className="flex items-center justify-center gap-2 py-1 text-center text-xs text-[#47464c] sm:text-sm">
              <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
              The driver sees each dispute in the Roam driver app with the text to copy into Uber.
            </p>
          ) : null}
        </>
      ) : results.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-[#47464c]" data-testid="toll-v2-results-empty">
          <Check className="h-4 w-4 shrink-0 text-[#069669]" aria-hidden />
          No disputes were won, lost or closed this week yet.
        </p>
      ) : (
        <section className="flex flex-col gap-3" data-testid="toll-v2-results">
          <ul className="flex flex-col gap-2">
            {results.map((r) => (
              <ResultRow key={r.id} r={r} busy={busy} onUndo={actions.onUndoResult} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DisputeTab({
  selected,
  onClick,
  label,
  sub,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      data-testid={testId}
      className={`flex flex-col items-center rounded-lg px-3 py-2 text-sm font-semibold ${
        selected ? 'bg-[#030213] text-white' : 'text-[#47464c] hover:bg-white'
      }`}
    >
      {label}
      <span className={`text-xs font-medium ${selected ? 'text-white/80' : 'text-[#47464c]'}`}>{sub}</span>
    </button>
  );
}

function Tile({
  label,
  count,
  amountMinor,
  tone,
  testId,
}: {
  label: string;
  count: number;
  amountMinor: number;
  tone: 'amber' | 'blue' | 'red' | 'none';
  testId: string;
}) {
  const box =
    tone === 'red' ? 'bg-[#fff1f0]' : tone === 'blue' ? 'bg-[#eff6ff]' : 'bg-[#f8f9ff]';
  const head =
    tone === 'amber' ? 'text-amber-800' : tone === 'blue' ? 'text-[#1d4ed8]' : tone === 'red' ? 'text-[#93000a]' : 'text-[#47464c]';
  const num = tone === 'none' ? 'text-[#47464c]' : tone === 'red' ? 'text-[#93000a]' : tone === 'blue' ? 'text-[#1d4ed8]' : 'text-[#0b1c30]';
  return (
    <div className={`flex flex-col rounded-lg p-3.5 ${box}`} data-testid={testId}>
      <span className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${head}`}>
        {tone === 'red' ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : null}
        {label}
      </span>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-2xl font-bold tabular-nums ${num}`}>{count}</span>
        <span className={`text-sm font-medium tabular-nums ${tone === 'none' ? 'text-[#47464c]' : num}`}>
          · {fmtTollMinor(amountMinor)}
        </span>
      </div>
    </div>
  );
}

function Chip({ chip, testId }: { chip: DisputeChip; testId?: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[chip.tone]}`} data-testid={testId}>
      {chip.text}
    </span>
  );
}

function RowHead({ d }: { d: TollV2DisputeRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-base font-semibold text-[#0b1c30]">{disputeTitle(d)}</span>
      {d.plate ? (
        <span className="rounded bg-[#dce9ff] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#0b1c30]">{d.plate}</span>
      ) : null}
      {d.driverName ? <span className="truncate text-sm text-[#47464c]">{d.driverName}</span> : null}
    </div>
  );
}

function DisputeRow({ d, busy, actions }: { d: TollV2DisputeRow; busy: boolean; actions: TollV2DisputeActions }) {
  const trip = disputeTripPill(d);
  const days = daysLeftText(d);
  const from = fromWeekChip(d.fromWeekKey);
  return (
    <li
      className="flex flex-col justify-between gap-4 rounded-xl border border-[#eff4ff] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:flex-row lg:items-center"
      data-testid={`toll-v2-dispute-${d.id}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <RowHead d={d} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[#47464c]">{disputeMoneyLine(d)}</span>
          <span className="text-[#cbd5e1]">·</span>
          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-900">{disputeOwedChip(d)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          {trip ? <span className="rounded-full bg-[#eff4ff] px-2.5 py-0.5 text-xs text-[#0b1c30]">{trip}</span> : null}
          <Chip chip={disputeStateChip(d)} testId="toll-v2-dispute-state" />
          {from ? (
            <span className="rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-xs font-semibold text-[#47464c]" data-testid="toll-v2-dispute-from-week">
              {from}
            </span>
          ) : null}
          {days && !d.windowClosed ? (
            <span className={`flex items-center gap-1 text-xs ${d.red ? 'font-semibold text-[#ba1a1a]' : 'text-[#47464c]'}`}>
              <Clock className="h-3.5 w-3.5" aria-hidden /> {days}
            </span>
          ) : null}
        </div>
        {d.state === 'to_send' && d.bearerIfNotSent ? (
          <p className="text-xs text-[#47464c]">
            If it isn&apos;t sent in time, {d.bearerIfNotSent.bearer === 'fleet' ? 'the fleet' : 'the driver'} pays{' '}
            {fmtTollMinor(d.bearerIfNotSent.amountMinor)}.
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-2 self-stretch sm:flex-row sm:items-center lg:self-center">
        {/* Owner 21 Nov: the driver files it with Uber and marks it in Roam Driver; the fleet only sees the status. */}
        {d.canRefundReceived ? (
          <TollV2PrimaryButton type="button" disabled={busy} onClick={() => actions.onRefundReceived(d)} data-testid="toll-v2-dispute-refund">
            Refund received
          </TollV2PrimaryButton>
        ) : null}
        {d.canLost ? (
          <TollV2DangerOutlineButton type="button" disabled={busy} onClick={() => actions.onLost(d)} data-testid="toll-v2-dispute-lost">
            Lost
          </TollV2DangerOutlineButton>
        ) : null}
        <TollV2SecondaryButton type="button" onClick={() => actions.onOpenTrip(d)} data-testid="toll-v2-dispute-open-trip">
          Open trip
        </TollV2SecondaryButton>
      </div>
    </li>
  );
}

function ResultRow({ r, busy, onUndo }: { r: TollV2DisputeResult; busy: boolean; onUndo: (r: TollV2DisputeResult) => void }) {
  const trip = disputeTripPill(r);
  return (
    <li
      className="flex flex-col justify-between gap-3 rounded-xl bg-[#f8f9ff] p-4 sm:flex-row sm:items-center"
      data-testid={`toll-v2-result-${r.id}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-[#0b1c30]">{disputeTitle(r)}</span>
          <span className="text-sm font-semibold tabular-nums text-[#0b1c30]">{fmtTollMinor(r.owedMinor)}</span>
          <Chip chip={resultChip(r)} testId="toll-v2-result-chip" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#47464c]">
          {r.plate ? <span className="rounded bg-[#dce9ff] px-2 py-0.5 font-semibold text-[#0b1c30]">{r.plate}</span> : null}
          {r.driverName ? <span>{r.driverName}</span> : null}
          {trip ? <span className="rounded-full bg-white px-2.5 py-0.5">{trip}</span> : null}
          {r.decider?.at || r.decider?.by ? <span>{formatDecidedAt(r.decider?.at, r.decider?.by)}</span> : null}
        </div>
      </div>
      {r.undo?.decision_id ? (
        <TollV2DangerOutlineButton type="button" disabled={busy} onClick={() => onUndo(r)} data-testid="toll-v2-result-undo">
          <Undo2 className="mr-1 h-4 w-4" aria-hidden />
          Undo
        </TollV2DangerOutlineButton>
      ) : null}
    </li>
  );
}
