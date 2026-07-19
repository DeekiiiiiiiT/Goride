import React from 'react';
import { useOffline } from '../providers/OfflineProvider';
import { Button } from '@roam/ui';
import { ScrollArea } from '@roam/ui';
import { AlertCircle, CheckCircle2, Trash2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { OfflineAction } from '../../types/offline';

export function OfflineSyncManager() {
  const { queue, isOnline, syncStatus, processQueue, removeFromQueue, clearQueue } = useOffline();

  const handleRetry = () => {
    void processQueue(true);
  };

  const handleClear = () => {
    if (
      window.confirm(
        'Are you sure you want to delete all pending offline data? This cannot be undone.',
      )
    ) {
      clearQueue();
    }
  };

  const handleDelete = (id: string) => {
    removeFromQueue(id);
  };

  const suspendedCount = queue.filter(item => (item.retryCount || 0) >= 3).length;

  return (
    <div className="w-80">
      <div className="flex items-center justify-between border-b bg-slate-50/50 p-4 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          {isOnline ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-amber-500" />}
          <h4 className="text-sm font-semibold">Offline Queue</h4>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xs font-medium ${isOnline ? 'text-green-600' : 'text-amber-600'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="border-b bg-white p-4 dark:bg-slate-950">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            {queue.length} items pending
            {suspendedCount > 0 && <span className="ml-1 text-red-500">({suspendedCount} failed)</span>}
          </span>
          {queue.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
            >
              Clear All
            </Button>
          )}
        </div>
        {queue.length > 0 ? (
          <Button
            size="sm"
            className={`w-full text-white ${suspendedCount > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            onClick={handleRetry}
            disabled={syncStatus === 'SYNCING' || !isOnline}
          >
            {syncStatus === 'SYNCING' ? (
              <>
                <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-3 w-3" />
                {isOnline ? (suspendedCount > 0 ? 'Force Retry All' : 'Sync Now') : 'Waiting for connection...'}
              </>
            )}
          </Button>
        ) : (
          <div className="py-2 text-center text-xs text-slate-400">System is up to date</div>
        )}
      </div>

      <ScrollArea className="h-[300px]">
        {queue.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-slate-400">
            <CheckCircle2 className="mb-2 h-8 w-8 opacity-20" />
            <p className="text-sm text-slate-500">All synced!</p>
          </div>
        ) : (
          <div className="divide-y">
            {queue.map(item => {
              const isSuspended = (item.retryCount || 0) >= 3;
              return (
                <div
                  key={item.id}
                  className={`group p-3 transition-colors ${isSuspended ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isSuspended ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}
                        >
                          {isSuspended ? 'Failed' : item.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-slate-400">{timeAgo(item.timestamp)}</span>
                      </div>
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                        {getDisplayTitle(item)}
                      </p>
                      {item.lastError && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-red-500">
                          <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                          <span className="line-clamp-2 break-words">{item.lastError}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function getDisplayTitle(item: OfflineAction) {
  if (item.type === 'SUBMIT_TRIP') {
    const data = item.payload.formData as { startLocation?: string; endLocation?: string };
    return `${data.startLocation || 'Unknown'} ➝ ${data.endLocation || 'Unknown'}`;
  }
  if (item.type === 'SUBMIT_FUEL_EXPENSE') {
    return item.payload.label || 'Fuel log';
  }
  return 'Unknown Action';
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
