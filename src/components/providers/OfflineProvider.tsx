import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { offlineStorage } from '../../services/offlineStorage';
import { OfflineAction } from '../../types/offline';
import { useAuth } from '../auth/AuthContext';
import { api } from '../../services/api';
import { createManualTrip } from '../../utils/tripFactory';
import { mapMatchService } from '../../services/mapMatchService';
import { toast } from 'sonner@2.0.3';

interface OfflineContextType {
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

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

const MAX_RETRIES = 3;

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useNetworkStatus();
  const { user } = useAuth();
  const [queue, setQueue] = useState<OfflineAction[]>([]);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING' | 'ERROR'>('IDLE');

  const refreshQueue = () => {
    setQueue(offlineStorage.getQueue());
  };

  useEffect(() => {
    refreshQueue();
  }, []);

  const addToQueue = (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>) => {
    offlineStorage.addToQueue(action);
    refreshQueue();
  };

  const removeFromQueue = (id: string) => {
    offlineStorage.removeFromQueue(id);
    refreshQueue();
  };

  const clearQueue = () => {
    offlineStorage.clearQueue();
    refreshQueue();
  };
  
  // Listen to storage changes (if other tabs update it)
  useEffect(() => {
      const handleStorageChange = () => refreshQueue();
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const processQueue = async (forceRetry = false) => {
      // Don't sync if offline, already syncing, or no user
      const currentQueue = offlineStorage.getQueue();
      if (!isOnline || syncStatus === 'SYNCING' || currentQueue.length === 0 || !user) return;

      setSyncStatus('SYNCING');
      
      const processedIds: string[] = [];
      let errorCount = 0;
      let successCount = 0;

      // Filter actionable items first
      const itemsToProcess = currentQueue.filter(item => 
          forceRetry || (item.retryCount || 0) < MAX_RETRIES
      );

      if (itemsToProcess.length === 0) {
          setSyncStatus('IDLE');
          return;
      }

      for (const action of itemsToProcess) {
          try {
              if (action.type === 'SUBMIT_TRIP') {
                  let { formData, rawRoute } = action.payload;
                  
                  // Attempt Snap to Road if we have a route and it's substantial
                  if (rawRoute && rawRoute.length > 5) {
                      try {
                          const matchResult = await mapMatchService.snapToRoad(rawRoute);
                          if (matchResult) {
                              // Update distance
                              formData.distance = Number((matchResult.totalDistance / 1000).toFixed(2));
                              
                              // Base time for fake timestamps (approximate)
                              const baseTime = formData.date && formData.time 
                                  ? new Date(`${formData.date}T${formData.time}`).getTime() 
                                  : Date.now();

                              // Map back to RoutePoint
                              formData.route = matchResult.snappedRoute.map((pt: any, idx: number) => ({
                                  lat: pt.lat,
                                  lon: pt.lon,
                                  timestamp: baseTime + (idx * 1000),
                                  speed: 0,
                                  heading: 0,
                                  accuracy: 10
                              }));
                          }
                      } catch (snapError) {
                          console.warn("Snap to road failed, using raw data", snapError);
                      }
                  }
                  
                  const driverName = user.user_metadata?.name || user.email || 'Unknown Driver';
                  const trip = createManualTrip(formData, user.id, driverName);
                  
                  await api.saveTrips([trip]);
                  processedIds.push(action.id);
                  successCount++;
              }
          } catch (e: any) {
              console.error("Sync failed for action", action.id, e);
              errorCount++;
              
              offlineStorage.updateAction(action.id, { 
                  retryCount: (action.retryCount || 0) + 1,
                  lastError: e.message || 'Unknown error'
              });
          }
      }

      if (processedIds.length > 0) {
          processedIds.forEach(id => offlineStorage.removeFromQueue(id));
          toast.success(`Synced ${processedIds.length} offline trips`);
          refreshQueue();
      }
      
      if (errorCount > 0) {
          toast.error(`Failed to sync ${errorCount} items`);
      }

      setSyncStatus(errorCount > 0 ? 'ERROR' : 'IDLE');
  };

  // Auto-sync when coming online
  useEffect(() => {
      if (isOnline && user) {
          const currentQueue = offlineStorage.getQueue();
          // Only auto-sync items that haven't failed too many times
          const hasPendingItems = currentQueue.some(item => (item.retryCount || 0) < MAX_RETRIES);
          
          if (hasPendingItems) {
              processQueue(false); // Do not force retry on auto-sync
          }
      }
  }, [isOnline, user]);

  return (
    <OfflineContext.Provider value={{ isOnline, queue, addToQueue, refreshQueue, processQueue, removeFromQueue, clearQueue, syncStatus, setSyncStatus }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
