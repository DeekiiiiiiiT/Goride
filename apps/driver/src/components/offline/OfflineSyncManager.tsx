import React from 'react';
import { useOffline } from '../providers/OfflineProvider';
import { Button } from '@roam/ui';
import { ScrollArea } from '@roam/ui';
import { CheckCircle2, RefreshCw, Smartphone, Wifi, WifiOff } from 'lucide-react';
import type { OfflineAction } from '../../types/offline';
import { isClosedWeekSaveError } from '../../utils/closedWeekTrip';

/**
 * Waiting to send (audit docs/fuel-log-offline-first-audit.md, screen 15).
 * No Remove and no Clear all: nothing a driver saved is deleted on the phone (FO-18).
 * An item leaves only when the server confirms it arrived.
 */
export function OfflineSyncManager() {
  const { queue, isOnline, syncStatus, processQueue } = useOffline();
  const sending = syncStatus === 'SYNCING';

  return (
    <div className="w-80">
      <div className="flex items-center justify-between border-b bg-slate-50/50 p-4 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          {isOnline ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-amber-500" />}
          <h4 className="text-sm font-semibold">Waiting to send</h4>
        </div>
        <span className={`text-xs font-medium ${isOnline ? 'text-green-600' : 'text-amber-600'}`}>
          {isOnline ? 'Online' : 'No signal'}
        </span>
      </div>

      <div className="border-b bg-white p-4 dark:bg-slate-950">
        <p className="mb-3 text-xs font-medium text-slate-500">
          {queue.length === 0
            ? 'Nothing waiting'
            : `${queue.length} item${queue.length === 1 ? '' : 's'} on this phone`}
        </p>
        {queue.length > 0 ? (
          <>
            <Button
              size="sm"
              className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void processQueue(true)}
              disabled={sending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${sending ? 'animate-spin' : ''}`} />
              {sending ? 'Sending…' : 'Send now'}
            </Button>
            <p className="mt-2 text-center text-xs text-slate-500">
              It sends by itself when you have signal. Safe to close the app.
            </p>
          </>
        ) : null}
      </div>

      <ScrollArea className="h-[300px]">
        {queue.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-slate-400">
            <CheckCircle2 className="mb-2 h-8 w-8 opacity-20" />
            <p className="text-sm text-slate-500">All sent</p>
          </div>
        ) : (
          <div className="divide-y">
            {queue.map((item) => (
              <div key={item.id} className="p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    <Smartphone className="h-3 w-3" /> On this phone
                  </span>
                  <span className="text-[11px] text-slate-400">{timeAgo(item.timestamp)}</span>
                </div>
                <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                  {getDisplayTitle(item)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{lastTryLine(item)}</p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function lastTryLine(item: OfflineAction): string {
  if (isClosedWeekSaveError(item.lastError)) return item.lastError || 'Waiting for the week to be reopened';
  if (!item.lastTryAt) return 'Not tried yet';
  const at = new Date(item.lastTryAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Last try ${at}${item.lastError ? ` · ${item.lastError}` : ''}`;
}

function getDisplayTitle(item: OfflineAction) {
  if (item.type === 'SUBMIT_TRIP') {
    const data = item.payload.formData as { startLocation?: string; endLocation?: string };
    return `Trip · ${data.startLocation || 'Start'} → ${data.endLocation || 'End'}`;
  }
  if (item.type === 'SUBMIT_FUEL_EXPENSE') return item.payload.label || 'Fuel';
  if (item.type === 'SUBMIT_CASH_TOLL') return item.payload.label || 'Toll';
  if (item.type === 'SUBMIT_GAS_CARD_ANCHOR') return item.payload.label || 'Fuel · Gas Card';
  if (item.type === 'SUBMIT_SPLIT_FUEL_FILL') return item.payload.label || 'Fuel · Gas Card + Cash';
  if (item.type === 'SUBMIT_DRIVER_REPORT_UPDATE') return item.payload.label || 'Car kit update';
  return 'Item';
}

function timeAgo(date: number) {
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
