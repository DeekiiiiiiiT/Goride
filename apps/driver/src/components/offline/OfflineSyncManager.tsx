import React from 'react';
import { useOffline } from '../providers/OfflineProvider';
import { ScrollArea } from '@roam/ui';
import type { OfflineAction } from '../../types/offline';
import { isClosedWeekSaveError } from '../../utils/closedWeekTrip';

/**
 * Waiting to send (audit docs/fuel-log-offline-first-audit.md, screen 15; look: Stitch waiting_to_send_list).
 * No Remove and no Clear all: nothing a driver saved is deleted on the phone (FO-18).
 * An item leaves only when the server confirms it arrived.
 */
const Sym = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
    {name}
  </span>
);

export function OfflineSyncManager() {
  const { queue, isOnline, syncStatus, processQueue } = useOffline();
  const sending = syncStatus === 'SYNCING';

  return (
    <div className="w-[min(22rem,calc(100vw-2rem))] bg-[#f1f5f9] p-3 dark:bg-[#0b1220]">
      {isOnline ? (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-[#ecfdf5] px-4 py-3 text-[14px] font-semibold text-[#006948] dark:bg-emerald-950/40 dark:text-emerald-300">
          <Sym name="wifi" className="text-[20px]" /> Online
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-[#fffbeb] px-4 py-3 text-[14px] font-semibold text-[#b45309] shadow-sm dark:bg-amber-950/40 dark:text-amber-300">
          <Sym name="cloud_off" className="text-[20px]" />
          <span className="flex-1">No signal — saving on this phone</span>
          <span className="h-2.5 w-2.5 rounded-full bg-[#cf6721]" />
        </div>
      )}

      <div className="mb-3 flex items-center gap-2 px-1">
        <h4 className="text-[18px] font-semibold tracking-[-0.01em] text-[#131b2e] dark:text-slate-50">Items on this phone</h4>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#dce1ff] px-2 text-[13px] font-semibold text-[#131b2e]">
          {queue.length}
        </span>
      </div>

      <ScrollArea className="max-h-[320px]">
        {queue.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center rounded-2xl bg-white text-[#3d4a42] shadow-sm dark:bg-slate-900">
            <Sym name="check_circle" className="mb-2 text-[32px] text-[#006948]" />
            <p className="text-[14px] font-medium">All sent</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((item) => {
              const { icon, iconCls, title, amount, extra } = describe(item);
              return (
                <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
                  <div className="flex items-start gap-3">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconCls}`}>
                      <Sym name={icon} className="text-[22px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[15px] font-semibold text-[#131b2e] dark:text-slate-50">{title}</p>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fffbeb] px-2 py-0.5 text-[11px] font-semibold text-[#b45309]">
                          <Sym name="smartphone" className="text-[13px]" /> On this phone
                        </span>
                      </div>
                      {amount || extra ? (
                        <p className="mt-0.5 text-[18px] font-bold tabular-nums text-[#131b2e] dark:text-slate-50">
                          {amount}
                          {extra ? <span className="text-[14px] font-normal text-[#3d4a42] dark:text-slate-400"> · {extra}</span> : null}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[13px] text-[#3d4a42] dark:text-slate-400">
                    <Sym name="sync_problem" className="text-[16px]" /> {lastTryLine(item)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {queue.length > 0 ? (
        <>
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#eaedff] p-4 dark:bg-slate-900/70">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dce1ff] text-[#1d4ed8]">
              <Sym name="wifi_tethering" className="text-[20px]" />
            </span>
            <p className="text-[14px] leading-5 text-[#131b2e] dark:text-slate-200">It sends by itself when you have signal.</p>
          </div>
          <button
            type="button"
            onClick={() => void processQueue(true)}
            disabled={sending}
            className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#006948] text-[15px] font-semibold text-white shadow-md disabled:opacity-60"
          >
            <Sym name="sync" className={`text-[20px] ${sending ? 'animate-spin' : ''}`} />
            {sending ? 'Sending…' : 'Send now'}
          </button>
          <p className="mt-2 text-center text-[12px] font-semibold tracking-[0.02em] text-[#6d7a72]">Safe to close the app</p>
        </>
      ) : null}
    </div>
  );
}

function lastTryLine(item: OfflineAction): string {
  if (isClosedWeekSaveError(item.lastError)) return item.lastError || 'Waiting for the week to be reopened';
  if (!item.lastTryAt) return 'Not tried yet';
  const at = new Date(item.lastTryAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `Last try ${at}${item.lastError ? ` · ${item.lastError}` : ''}`;
}

function money(n: number) {
  return `J$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dayTime(ts: number) {
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

function describe(item: OfflineAction): { icon: string; iconCls: string; title: string; amount?: string; extra?: string } {
  const fuel = 'bg-[#ecfdf5] text-[#006948]';
  const when = dayTime(item.timestamp);
  if (item.type === 'SUBMIT_FUEL_EXPENSE' || item.type === 'SUBMIT_GAS_CARD_ANCHOR' || item.type === 'SUBMIT_SPLIT_FUEL_FILL') {
    const tx = item.type === 'SUBMIT_FUEL_EXPENSE' ? item.payload.transaction : null;
    const amt = tx && Number(tx.amount) ? money(Number(tx.amount)) : undefined;
    const litres = tx?.metadata?.fuelVolume ? `${Number(tx.metadata.fuelVolume)} L` : undefined;
    const paid = item.type === 'SUBMIT_GAS_CARD_ANCHOR' ? 'Gas Card' : item.type === 'SUBMIT_SPLIT_FUEL_FILL' ? 'Gas Card + Cash' : undefined;
    return { icon: 'local_gas_station', iconCls: fuel, title: `Fuel · ${when}`, amount: amt || (paid ? undefined : 'Amount coming'), extra: litres || paid };
  }
  if (item.type === 'SUBMIT_CASH_TOLL') {
    const p = item.payload;
    return {
      icon: 'toll',
      iconCls: 'bg-[#dce1ff] text-[#1d4ed8]',
      title: `Toll · ${when}`,
      amount: Number(p.amountMinor) ? money(Number(p.amountMinor) / 100) : undefined,
      extra: p.plazaName || p.merchant || undefined,
    };
  }
  if (item.type === 'SUBMIT_TRIP') {
    const data = item.payload.formData as { startLocation?: string; endLocation?: string };
    return { icon: 'route', iconCls: 'bg-[#eaedff] text-[#3d4a42]', title: `Trip · ${data.startLocation || 'Start'} → ${data.endLocation || 'End'}` };
  }
  if (item.type === 'SUBMIT_DRIVER_REPORT_UPDATE') {
    return { icon: 'build', iconCls: 'bg-[#eaedff] text-[#3d4a42]', title: item.payload.label || 'Car kit update' };
  }
  return { icon: 'inventory_2', iconCls: 'bg-[#eaedff] text-[#3d4a42]', title: 'Item' };
}
