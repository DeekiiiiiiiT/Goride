import { OfflineAction } from '../types/offline';

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

  addToQueue: (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>) => {
    const queue = offlineStorage.getQueue();
    const newAction: OfflineAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retryCount: 0
    };
    queue.push(newAction);
    offlineStorage.saveQueue(queue);
    return newAction;
  },

  updateAction: (id: string, updates: Partial<OfflineAction>) => {
    const queue = offlineStorage.getQueue();
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1) {
      queue[index] = { ...queue[index], ...updates };
      offlineStorage.saveQueue(queue);
    }
  },

  removeFromQueue: (id: string) => {
    const queue = offlineStorage.getQueue();
    const newQueue = queue.filter(item => item.id !== id);
    offlineStorage.saveQueue(newQueue);
  },

  saveQueue: (queue: OfflineAction[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  },
  
  clearQueue: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  }
};

export type { OfflineAction };