import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { offlineStorage } from '../../services/offlineStorage';
import { offlineBlobStore } from '../../services/offlineBlobStore';
import { OfflineAction } from '../../types/offline';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { uploadEvidenceFile } from '../../services/uploadEvidence';
import { createManualTrip } from '../../utils/tripFactory';
import { mapMatchService } from '../../services/mapMatchService';
import { toast } from 'sonner';

interface OfflineContextType {
  isOnline: boolean;
  queue: OfflineAction[];
  addToQueue: (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>) => OfflineAction;
  refreshQueue: () => void;
  processQueue: (forceRetry?: boolean) => Promise<void>;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  syncStatus: 'IDLE' | 'SYNCING' | 'ERROR';
  setSyncStatus: (status: 'IDLE' | 'SYNCING' | 'ERROR') => void;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

const MAX_RETRIES = 3;

async function syncFuelExpense(action: Extract<OfflineAction, { type: 'SUBMIT_FUEL_EXPENSE' }>) {
  const { payload } = action;
  const tx = { ...payload.transaction };
  const txId = String(tx.id || crypto.randomUUID());
  tx.id = txId;

  let receiptUrl = tx.receiptUrl || '';
  let odometerProofUrl = tx.metadata?.odometerProofUrl || '';

  if (payload.receiptBlobKey) {
    const blob = await offlineBlobStore.get(payload.receiptBlobKey);
    if (!blob) throw new Error('Offline receipt photo missing');
    const file = new File(
      [blob],
      payload.receiptFileName || 'receipt.jpg',
      { type: payload.receiptMimeType || blob.type || 'image/jpeg' },
    );
    const uploadRes = await uploadEvidenceFile(file, {
      evidenceType: 'fuel_receipt',
      sourceType: 'transaction',
      sourceId: txId,
      retentionClass: 'ephemeral',
      parentStatus: 'Pending',
    });
    receiptUrl = uploadRes.url;
  }

  if (payload.odometerBlobKey) {
    const blob = await offlineBlobStore.get(payload.odometerBlobKey);
    if (!blob) throw new Error('Offline odometer photo missing');
    const file = new File(
      [blob],
      payload.odometerFileName || 'odometer.jpg',
      { type: payload.odometerMimeType || blob.type || 'image/jpeg' },
    );
    const uploadRes = await uploadEvidenceFile(file, {
      evidenceType: 'odometer_proof',
      sourceType: 'transaction',
      sourceId: txId,
      retentionClass: 'ephemeral',
      parentStatus: 'Pending',
    });
    odometerProofUrl = uploadRes.url;
  }

  if (receiptUrl) tx.receiptUrl = receiptUrl;
  if (odometerProofUrl) {
    tx.metadata = { ...(tx.metadata || {}), odometerProofUrl };
  }

  await api.saveTransaction(tx);
  await offlineBlobStore.removeMany([payload.odometerBlobKey, payload.receiptBlobKey]);
}

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

  const addToQueue = (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>): OfflineAction => {
    const created = offlineStorage.addToQueue(action);
    refreshQueue();
    return created;
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
      let tripSuccess = 0;
      let fuelSuccess = 0;

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
                  tripSuccess++;
              } else if (action.type === 'SUBMIT_FUEL_EXPENSE') {
                  await syncFuelExpense(action);
                  processedIds.push(action.id);
                  fuelSuccess++;
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
          const parts: string[] = [];
          if (tripSuccess > 0) parts.push(`${tripSuccess} trip${tripSuccess === 1 ? '' : 's'}`);
          if (fuelSuccess > 0) parts.push(`${fuelSuccess} fuel log${fuelSuccess === 1 ? '' : 's'}`);
          toast.success(`Synced ${parts.join(' and ') || `${processedIds.length} items`}`);
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
