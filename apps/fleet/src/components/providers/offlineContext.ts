import { createContext, useContext } from 'react';
import type { OfflineAction } from '../../types/offline';

/** Kept in its own module so Vite HMR on OfflineProvider does not mint a new context. */
export interface OfflineContextType {
  isOnline: boolean;
  queue: OfflineAction[];
  addToQueue: (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>) => void;
  refreshQueue: () => void;
  processQueue: (forceRetry?: boolean) => Promise<void>;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  syncStatus: 'IDLE' | 'SYNCING' | 'ERROR';
  setSyncStatus: (status: 'IDLE' | 'SYNCING' | 'ERROR') => void;
}

export const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function useOffline() {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
