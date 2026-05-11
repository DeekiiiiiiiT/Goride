import React from 'react';
import { useOffline } from '../providers/OfflineProvider';
import { RefreshCw, CloudCog, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { OfflineSyncManager } from './OfflineSyncManager';

export function OfflineStatusIndicator() {
  const { isOnline, queue, syncStatus } = useOffline();
  
  const pendingCount = queue.length;
  const isSyncing = syncStatus === 'SYNCING';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className={`relative rounded-full transition-all ${
            !isOnline 
              ? 'bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 ring-1 ring-amber-500/50' 
              : pendingCount > 0 
                ? 'bg-indigo-500 text-indigo-50 hover:bg-indigo-400' 
                : 'text-indigo-100 hover:bg-indigo-500'
          }`}
          title={!isOnline ? "Offline Mode" : (pendingCount > 0 ? `${pendingCount} Pending Items` : "Online")}
        >
          {isSyncing ? (
            <RefreshCw className="h-5 w-5 animate-spin" />
          ) : (
            <>
                {!isOnline ? (
                    <WifiOff className="h-5 w-5" />
                ) : (
                     pendingCount > 0 ? <CloudCog className="h-5 w-5" /> : <Wifi className="h-5 w-5 opacity-80" />
                )}
            </>
          )}

          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-indigo-600">
                {pendingCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <OfflineSyncManager />
      </PopoverContent>
    </Popover>
  );
}

function Wifi({ className }: { className?: string }) {
    return (
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={className}
        >
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
    );
}
