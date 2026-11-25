/**
 * Fuel list pieces for the photos-first flow (Stitch driver screen 8).
 * Chips: On this phone (amber) · Sent (blue) · Read (green) · Needs a look (red).
 * Items waiting on the phone are shown but can never be deleted here (FO-18).
 */
import React from 'react';
const Sym = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">{name}</span>
);
import type { OfflineAction } from '../../../types/offline';
import type { FuelFillChip as Chip } from './fuelPhotoFill';

const CHIP: Record<Chip, { label: string; className: string; icon: React.ReactNode }> = {
  on_phone: {
    label: 'On this phone',
    className: 'bg-[#fffbeb] text-[#b45309] dark:bg-amber-950/40 dark:text-amber-300',
    icon: <Sym name="smartphone" className="text-[14px]" />,
  },
  sent: {
    label: 'Sent',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    icon: <Sym name="arrow_upward" className="text-[14px]" />,
  },
  read: {
    label: 'Read',
    className: 'bg-[#ecfdf5] text-[#006948] dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: <Sym name="check_circle" className="text-[14px]" />,
  },
  needs_look: {
    label: 'Needs a look',
    className: 'bg-[#ffdad6] text-[#ba1a1a] dark:bg-red-950/40 dark:text-red-300',
    icon: <Sym name="visibility" className="text-[14px]" />,
  },
};

export function FuelFillChip({ chip }: { chip: Chip }) {
  const c = CHIP[chip];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold tracking-[0.04em] ${c.className}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

/** "1 fill on this phone · It sends by itself when you have signal · Send now". */
export function FuelPhoneWaitingCard({ count, onSendNow }: { count: number; onSendNow: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#fffbeb] p-4 shadow-sm dark:bg-amber-950/30">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fef3c7] text-[#b45309] dark:bg-amber-900/50 dark:text-amber-300">
        <Sym name="phonelink_ring" className="text-[24px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold text-[#131b2e] dark:text-slate-50">
          {count} fill{count === 1 ? '' : 's'} on this phone
        </p>
        <p className="text-[14px] leading-5 text-[#3d4a42] dark:text-slate-300">It sends by itself when you have signal.</p>
      </div>
      <button
        type="button"
        onClick={onSendNow}
        className="h-11 shrink-0 rounded-xl bg-white px-4 text-[14px] font-semibold text-[#131b2e] shadow-sm dark:bg-slate-900 dark:text-slate-100"
      >
        Send now
      </button>
    </div>
  );
}

function fuelQueueItems(queue: OfflineAction[]) {
  return queue.filter(
    (q) => q.type === 'SUBMIT_FUEL_EXPENSE' || q.type === 'SUBMIT_GAS_CARD_ANCHOR' || q.type === 'SUBMIT_SPLIT_FUEL_FILL',
  );
}

/** Fills still on the phone, newest first, above the fills the server has. */
export function FuelPhoneHeldRows({ queue }: { queue: OfflineAction[] }) {
  const items = fuelQueueItems(queue).sort((a, b) => b.timestamp - a.timestamp);
  if (!items.length) return null;
  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const when = new Date(item.timestamp);
        const day = when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const paid =
          item.type === 'SUBMIT_GAS_CARD_ANCHOR' ? 'Gas Card' : item.type === 'SUBMIT_SPLIT_FUEL_FILL' ? 'Gas Card + Cash' : 'Cash';
        const tx = item.type === 'SUBMIT_FUEL_EXPENSE' ? item.payload.transaction : null;
        const amount = tx && Number(tx.amount) ? Math.abs(Number(tx.amount)) : null;
        const liters = tx?.metadata?.fuelVolume ? Number(tx.metadata.fuelVolume) : null;
        const plate = String(tx?.vehiclePlate || tx?.metadata?.vehiclePlate || '');
        return (
          <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[14px] text-[#3d4a42] dark:text-slate-400">
              {day}, {time}
              {plate ? <span className="rounded-[6px] bg-[#eaedff] px-2 py-0.5 text-[12px] font-bold tracking-wider text-[#131b2e]">{plate}</span> : null}
            </p>
            <p className="mt-1 text-[22px] font-bold tabular-nums text-[#131b2e] dark:text-slate-50">
              {amount ? `J$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : (
                <span className="text-[20px] font-normal italic text-[#3d4a42]">Amount coming</span>
              )}
              <span className="text-[18px] font-normal text-[#3d4a42]"> · {liters ? `${liters} L` : '— L'}</span>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <FuelFillChip chip="on_phone" />
              <span className="text-[14px] text-[#3d4a42] dark:text-slate-400">{paid}</span>
            </div>
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
