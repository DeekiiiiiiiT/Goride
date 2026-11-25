/**
 * Fuel list pieces for the photos-first flow (Stitch driver screen 8).
 * Chips: On this phone (amber) · Sent (blue) · Read (green) · Needs a look (red).
 * Items waiting on the phone are shown but can never be deleted here (FO-18).
 */
import React from 'react';
import { ArrowUp, Check, Eye, Smartphone } from 'lucide-react';
import type { OfflineAction } from '../../../types/offline';
import type { FuelFillChip as Chip } from './fuelPhotoFill';

const CHIP: Record<Chip, { label: string; className: string; icon: React.ReactNode }> = {
  on_phone: {
    label: 'On this phone',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    icon: <Smartphone className="h-3 w-3" />,
  },
  sent: {
    label: 'Sent',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    icon: <ArrowUp className="h-3 w-3" />,
  },
  read: {
    label: 'Read',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: <Check className="h-3 w-3" />,
  },
  needs_look: {
    label: 'Needs a look',
    className: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300',
    icon: <Eye className="h-3 w-3" />,
  },
};

export function FuelFillChip({ chip }: { chip: Chip }) {
  const c = CHIP[chip];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.className}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

/** "1 fill on this phone · It sends by itself when you have signal · Send now". */
export function FuelPhoneWaitingCard({ count, onSendNow }: { count: number; onSendNow: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/30">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
        <Smartphone className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
          {count} fill{count === 1 ? '' : 's'} on this phone
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">It sends by itself when you have signal.</p>
      </div>
      <button
        type="button"
        onClick={onSendNow}
        className="h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
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
        return (
          <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {day}, {time}
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {amount ? `J$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : (
                <span className="text-base font-normal italic text-slate-500">Amount coming</span>
              )}
              {liters ? <span className="text-base font-normal text-slate-500"> · {liters} L</span> : null}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <FuelFillChip chip="on_phone" />
              <span className="text-sm text-slate-500 dark:text-slate-400">{paid}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
