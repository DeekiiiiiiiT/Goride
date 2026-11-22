import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Check, Clock } from 'lucide-react';
import type { TollV2DisputeRow } from '../types';
import { fmtTollMinor } from '../tollV2Format';
import {
  daysLeftText,
  disputeMoneyLine,
  disputeOwedChip,
  disputeStateChip,
  disputeTitle,
  disputeTripPill,
  type DisputeChip,
} from '../tollV2Parts';
import { useTollV2Commands } from '../useTollV2Commands';
import { TollV2DangerOutlineButton, TollV2PrimaryButton, TollV2SecondaryButton } from '../TollV2Buttons';
import { TollV2ApprovalReasonDialog, TollV2LostDialog } from '../dialogs/TollV2DisputeDialogs';
import { disputeTiles, TOLL_V2_DISPUTES_KEY, useTollV2Disputes } from './useTollV2Disputes';

const TONE: Record<DisputeChip['tone'], string> = {
  amber: 'bg-amber-100 text-amber-900',
  blue: 'bg-[#dbeafe] text-[#1d4ed8]',
  red: 'bg-[#ffdad6] text-[#93000a]',
  green: 'bg-[#ecfdf5] text-[#069669]',
  grey: 'bg-[#eff4ff] text-[#47464c]',
};

const FIRST_ROWS = 6;

/** "Week of 9 Nov" for the week the toll belongs to. */
export function weekChip(weekKey: string | null | undefined): string | null {
  if (!weekKey) return null;
  const d = new Date(`${weekKey}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return `Week of ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)}`;
}

/** Driver Settlements → Disputes (UI2, audit C3): every open dispute of every driver. No Refund received here. */
export function DriverDisputesTab({ onOpenWeek }: { onOpenWeek: (weekKey: string) => void }) {
  const queryClient = useQueryClient();
  const query = useTollV2Disputes();
  const { runCommand, busy, approvalAsk } = useTollV2Commands('');
  const [driver, setDriver] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [lostFor, setLostFor] = useState<TollV2DisputeRow | null>(null);

  const active = query.data?.active ?? [];
  const byDriver = query.data?.byDriver ?? [];
  const tiles = useMemo(() => disputeTiles(active), [active]);
  const rows = driver ? active.filter((r) => r.driverId === driver) : active;
  const shown = showAll ? rows : rows.slice(0, FIRST_ROWS);
  const picked = driver ? byDriver.find((b) => b.driverId === driver) : null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: TOLL_V2_DISPUTES_KEY });

  const closeLost = async (d: TollV2DisputeRow) => {
    try {
      const res = await runCommand('close_dispute_lost', { dispute_id: d.id, expected_dispute_version: d.version });
      await refresh();
      if (res === null) return;
      setLostFor(null);
      toast.success('Dispute closed as lost');
    } catch {
      /* error toast shown by runCommand */
    }
  };

  if (query.isLoading) {
    return <p className="py-10 text-center text-sm text-[#47464c]">Loading disputes…</p>;
  }
  if (query.isError) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-[#47464c] shadow-sm">
        Disputes could not be loaded.{' '}
        <TollV2SecondaryButton type="button" className="ml-2 w-auto" onClick={() => void query.refetch()}>
          Try again
        </TollV2SecondaryButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="toll-v2-disputes-tab">
      <p className="text-sm text-[#47464c]">Tolls Uber paid short. The driver asks Uber for the rest from the Roam Driver app.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="To send" t={tiles.toSend} tone="amber" testId="toll-v2-tab-tile-to-send" />
        <Tile label="Sent, waiting on Uber" t={tiles.sent} tone="blue" testId="toll-v2-tab-tile-sent" />
        <Tile label="Late" t={tiles.late} tone="red" testId="toll-v2-tab-tile-late" />
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-12 text-center shadow-sm" data-testid="toll-v2-disputes-tab-empty">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ecfdf5]">
            <Check className="h-6 w-6 text-[#069669]" aria-hidden />
          </span>
          <p className="text-base font-semibold text-[#0b1c30]">No open disputes</p>
          <p className="max-w-md text-sm text-[#47464c]">
            When Uber pays back less than a toll, a dispute opens here by itself and the driver sees it in the Roam Driver app.
          </p>
        </div>
      ) : (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Drivers">
            <DriverChip label="All drivers" count={active.length} on={driver === null} onClick={() => setDriver(null)} />
            {byDriver.map((b) => (
              <DriverChip
                key={b.driverId}
                label={b.driverName || 'Driver'}
                count={b.toSend + b.sent}
                late={b.late > 0}
                on={driver === b.driverId}
                onClick={() => setDriver(b.driverId)}
              />
            ))}
          </div>

          {picked ? (
            <div className="rounded-2xl bg-white px-4 py-3 text-sm shadow-sm" data-testid="toll-v2-disputes-driver-card">
              <p className="font-semibold text-[#0b1c30]">{picked.driverName || 'Driver'}</p>
              <p className="text-[#47464c]">
                {picked.toSend + picked.sent} open · {fmtTollMinor(picked.leftMinor)} still owed by Uber
                {picked.late > 0 ? ` · ${picked.late} late` : ''}
              </p>
            </div>
          ) : null}

          <ul className="flex flex-col gap-3">
            {shown.map((d) => (
              <DisputeRow
                key={d.id}
                d={d}
                busy={busy}
                onLost={() => setLostFor(d)}
                onOpenWeek={() => d.chargeWeekKey && onOpenWeek(d.chargeWeekKey)}
              />
            ))}
          </ul>
          {rows.length > FIRST_ROWS && !showAll ? (
            <div className="flex justify-center">
              <TollV2SecondaryButton type="button" className="w-auto" onClick={() => setShowAll(true)}>
                Show all {rows.length} disputes
              </TollV2SecondaryButton>
            </div>
          ) : null}
        </>
      )}

      <TollV2LostDialog
        dispute={lostFor}
        busy={busy}
        onOpenChange={(o) => !o && setLostFor(null)}
        onConfirm={() => lostFor && void closeLost(lostFor)}
      />
      <TollV2ApprovalReasonDialog
        intent={approvalAsk?.intent ?? null}
        amountMinor={approvalAsk?.amountMinor ?? null}
        onDone={(reason) => approvalAsk?.resolve(reason)}
      />
    </div>
  );
}

function Tile({
  label,
  t,
  tone,
  testId,
}: {
  label: string;
  t: { count: number; amountMinor: number };
  tone: 'amber' | 'blue' | 'red';
  testId: string;
}) {
  const zero = t.count === 0;
  const box = zero ? 'bg-white' : tone === 'amber' ? 'bg-[#fffbeb]' : tone === 'blue' ? 'bg-[#eff6ff]' : 'bg-[#fff1f2]';
  const text = zero ? 'text-[#47464c]' : tone === 'amber' ? 'text-[#b45309]' : tone === 'blue' ? 'text-[#1d4ed8]' : 'text-[#ba1a1a]';
  return (
    <div className={`flex items-center justify-between gap-2 rounded-2xl p-4 shadow-sm sm:flex-col sm:items-start ${box}`} data-testid={testId}>
      <span className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${text}`}>
        {label}
        {tone === 'red' && !zero ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : null}
      </span>
      <span className={`flex items-baseline gap-1.5 tabular-nums ${text}`}>
        <span className="text-2xl font-bold">{t.count}</span>
        <span className="text-base font-semibold">· {fmtTollMinor(t.amountMinor)}</span>
      </span>
    </div>
  );
}

function DriverChip({
  label,
  count,
  late,
  on,
  onClick,
}: {
  label: string;
  count: number;
  late?: boolean;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
        on ? 'bg-[#030213] text-white' : 'border border-[#e5eeff] bg-white text-[#0b1c30]'
      }`}
      data-testid={`toll-v2-driver-chip-${label}`}
    >
      {late ? <span className="h-2 w-2 rounded-full bg-[#ba1a1a]" aria-label="has a late dispute" /> : null}
      {label}
      <span className={on ? 'text-white/70' : 'text-[#47464c]'}>{count}</span>
    </button>
  );
}

function DisputeRow({
  d,
  busy,
  onLost,
  onOpenWeek,
}: {
  d: TollV2DisputeRow;
  busy: boolean;
  onLost: () => void;
  onOpenWeek: () => void;
}) {
  const chip = disputeStateChip(d);
  const days = daysLeftText(d);
  const trip = disputeTripPill(d);
  const week = weekChip(d.chargeWeekKey);
  return (
    <li
      className="flex flex-col justify-between gap-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center"
      data-testid={`toll-v2-tab-dispute-${d.id}`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-[#0b1c30]">{disputeTitle(d)}</span>
          {d.plate ? (
            <span className="rounded bg-[#eff4ff] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#0b1c30]">{d.plate}</span>
          ) : null}
          {d.driverName ? <span className="text-sm text-[#0b1c30]">{d.driverName}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#47464c]">
          <span>{disputeMoneyLine(d)}</span>
          <span className="text-[#cbd5e1]">·</span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
              d.state === 'sent' ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'bg-amber-50 text-amber-900'
            }`}
          >
            {disputeOwedChip(d)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {trip ? <span className="rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-xs text-[#0b1c30]">{trip}</span> : null}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[chip.tone]}`} data-testid="toll-v2-tab-dispute-state">
            {chip.text}
          </span>
          {days && !d.windowClosed ? (
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${
                d.red ? 'bg-[#fff1f2] font-semibold text-[#ba1a1a]' : 'bg-[#f1f5f9] text-[#47464c]'
              }`}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden /> {days}
            </span>
          ) : null}
          {week ? <span className="rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-xs text-[#47464c]">{week}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <TollV2SecondaryButton type="button" onClick={onOpenWeek} data-testid="toll-v2-tab-open-week">
          Open week
        </TollV2SecondaryButton>
        {d.canLost ? (
          <TollV2DangerOutlineButton type="button" disabled={busy} onClick={onLost} data-testid="toll-v2-tab-lost">
            Lost
          </TollV2DangerOutlineButton>
        ) : null}
      </div>
    </li>
  );
}
