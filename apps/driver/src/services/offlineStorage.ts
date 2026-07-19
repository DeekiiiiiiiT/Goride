import type { OfflineAction } from '../types/offline';
import { offlineBlobStore } from './offlineBlobStore';

const STORAGE_KEY = 'roam_offline_queue';

export const offlineStorage = {
  getQueue: (): OfflineAction[] => {
    if (typeof window === 'undefined') return [];
    try {
      const item = localStorage.getItem(STORAGE_KEY);
      return item ? JSON.parse(item) : [];
    } catch (e) {
      console.error('Error reading offline queue', e);
      return [];
    }
  },

  addToQueue: (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>): OfflineAction => {
    const queue = offlineStorage.getQueue();
    const newAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retryCount: 0,
    } as OfflineAction;
    queue.push(newAction);
    offlineStorage.saveQueue(queue);
    return newAction;
  },

  updateAction: (id: string, updates: Partial<OfflineAction>) => {
    const queue = offlineStorage.getQueue();
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1) {
      queue[index] = { ...queue[index], ...updates } as OfflineAction;
      offlineStorage.saveQueue(queue);
    }
  },

  removeFromQueue: (id: string) => {
    const queue = offlineStorage.getQueue();
    const item = queue.find(a => a.id === id);
    const newQueue = queue.filter(item => item.id !== id);
    offlineStorage.saveQueue(newQueue);
    // Clean IndexedDB blobs for fuel expenses
    if (item?.type === 'SUBMIT_FUEL_EXPENSE') {
      void offlineBlobStore.removeMany([
        item.payload.odometerBlobKey,
        item.payload.receiptBlobKey,
      ]);
    }
  },

  saveQueue: (queue: OfflineAction[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  },

  clearQueue: () => {
    if (typeof window === 'undefined') return;
    const queue = offlineStorage.getQueue();
    for (const item of queue) {
      if (item.type === 'SUBMIT_FUEL_EXPENSE') {
        void offlineBlobStore.removeMany([
          item.payload.odometerBlobKey,
          item.payload.receiptBlobKey,
        ]);
      }
    }
    localStorage.removeItem(STORAGE_KEY);
  },
};

export type { OfflineAction };
