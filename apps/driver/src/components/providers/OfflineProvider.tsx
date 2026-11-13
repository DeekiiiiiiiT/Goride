import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { offlineStorage } from '../../services/offlineStorage';
import { offlineBlobStore } from '../../services/offlineBlobStore';
import { OfflineAction } from '../../types/offline';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { driverInventoryApi } from '../../services/driverInventoryApi';
import { uploadEvidenceFile } from '../../services/uploadEvidence';
import { createManualTrip } from '../../utils/tripFactory';
import { mapMatchService } from '../../services/mapMatchService';
import { toast } from 'sonner';
import { CLOSED_WEEK_TRIP_MESSAGE, isClosedWeekSaveError } from '../../utils/closedWeekTrip';
import {
  isPermanentTollSyncError,
  syncCashToll,
  tollSyncPermanentMessage,
  type TollSyncError,
} from '../../services/syncCashToll';
import {
  markRerunWhileSyncing,
  shouldProcessQueueAfterSync,
} from './offlineQueueRerun';

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

async function syncDriverReportUpdate(
  action: Extract<OfflineAction, { type: 'SUBMIT_DRIVER_REPORT_UPDATE' }>,
) {
  const { payload } = action;
  let photoPaths: string[] | undefined;
  if (payload.photoBlobKey) {
    const blob = await offlineBlobStore.get(payload.photoBlobKey);
    if (blob) {
      const file = new File(
        [blob],
        payload.photoFileName || 'report-update.jpg',
        { type: payload.photoMimeType || blob.type || 'image/jpeg' },
      );
      const uploadRes = await uploadEvidenceFile(file, {
        evidenceType: 'driver_report_update',
        sourceType: 'driver_report',
        sourceId: payload.reportId,
        retentionClass: 'ephemeral',
        parentStatus: 'Pending',
      });
      photoPaths = [uploadRes.url];
    }
  }
  await driverInventoryApi.submitReportUpdate(
    payload.reportId,
    {
      kind: payload.kind,
      note: payload.note,
      photoPaths,
      vehicleId: payload.vehicleId,
    },
    `offline-${action.id}`,
  );
  await offlineBlobStore.removeMany([payload.photoBlobKey]);
}

async function syncCashTollAction(action: Extract<OfflineAction, { type: 'SUBMIT_CASH_TOLL' }>) {
  const outcome = await syncCashToll(action, {
    uploadReceipt: async (file, sourceId) => {
      const uploadRes = await uploadEvidenceFile(file, {
        evidenceType: 'toll_receipt',
        sourceType: 'transaction',
        sourceId,
        retentionClass: 'ephemeral',
        parentStatus: 'Pending',
      });
      return uploadRes.url;
    },
    submitDriverCash: async (body) => {
      try {
        await api.submitDriverCashTollV2(body as Parameters<typeof api.submitDriverCashTollV2>[0]);
        return { ok: true as const };
      } catch (e: unknown) {
        const err = e as { status?: number; code?: string; message?: string };
        if (err?.status === 409 && err?.code === 'TOLLS_V2_OFF') {
          return { ok: false as const, status: 409, code: 'TOLLS_V2_OFF' };
        }
        if (err?.status === 400) {
          return { ok: false as const, status: 400, code: err.code };
        }
        throw e;
      }
    },
    saveLegacyTransaction: async (tx) => {
      await api.saveTransaction(tx as Parameters<typeof api.saveTransaction>[0]);
    },
    removeBlob: async (key) => {
      if (key) await offlineBlobStore.removeMany([key]);
    },
  });
  if (outcome === 'retry') {
    const err = new Error('Toll sync failed — will retry when online') as TollSyncError;
    err.code = 'TOLL_SYNC_RETRY';
    throw err;
  }
}

async function syncGasCardAnchor(action: Extract<OfflineAction, { type: 'SUBMIT_GAS_CARD_ANCHOR' }>) {
  const { payload } = action;
  const entry = { ...payload.fuelEntry };
  const entryId = String(entry.id || crypto.randomUUID());
  entry.id = entryId;

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
      sourceType: 'fuel_entry',
      sourceId: entryId,
      retentionClass: 'ephemeral',
      parentStatus: 'Pending',
    });
    entry.odometerImageUrl = uploadRes.url;
    entry.metadata = {
      ...(entry.metadata || {}),
      odometerProofUrl: uploadRes.url,
    };
  }

  const { fuelService } = await import('../../services/fuelService');
  await fuelService.saveFuelEntry(entry as any);
  await offlineBlobStore.removeMany([payload.odometerBlobKey]);
}

async function syncSplitFuelFill(action: Extract<OfflineAction, { type: 'SUBMIT_SPLIT_FUEL_FILL' }>) {
  const { payload } = action;
  const cashTx = { ...payload.cashTransaction };
  const cardEntry = { ...payload.cardFuelEntry };
  const txId = String(cashTx.id || crypto.randomUUID());
  const entryId = String(cardEntry.id || crypto.randomUUID());
  cashTx.id = txId;
  cardEntry.id = entryId;

  let receiptUrl = cashTx.receiptUrl || '';
  let odometerProofUrl =
    cashTx.metadata?.odometerProofUrl || cardEntry.odometerImageUrl || '';

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
      sourceType: 'fuel_entry',
      sourceId: entryId,
      retentionClass: 'ephemeral',
      parentStatus: 'Pending',
    });
    odometerProofUrl = uploadRes.url;
  }

  if (receiptUrl) cashTx.receiptUrl = receiptUrl;
  if (odometerProofUrl) {
    cashTx.metadata = { ...(cashTx.metadata || {}), odometerProofUrl };
    cardEntry.odometerImageUrl = odometerProofUrl;
    cardEntry.metadata = {
      ...(cardEntry.metadata || {}),
      odometerProofUrl,
    };
  }

  const { fuelService } = await import('../../services/fuelService');
  await fuelService.saveSplitFill({
    fillGroupId: payload.fillGroupId,
    cashTransaction: cashTx,
    cardFuelEntry: cardEntry,
  });
  await offlineBlobStore.removeMany([payload.odometerBlobKey, payload.receiptBlobKey]);
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const deferQueueRerunRef = useRef(false);
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
      const currentQueue = offlineStorage.getQueue();
      if (!isOnline || currentQueue.length === 0 || !user) return;
      if (syncStatus === 'SYNCING') {
        deferQueueRerunRef.current = markRerunWhileSyncing(deferQueueRerunRef.current, true);
        return;
      }

      setSyncStatus('SYNCING');
      
      const processedIds: string[] = [];
      let errorCount = 0;
      let tripSuccess = 0;
      let fuelSuccess = 0;
      let tollSuccess = 0;

      // Filter actionable items first
      const itemsToProcess = currentQueue.filter(item => {
          if (isClosedWeekSaveError(item.lastError)) return false;
          return forceRetry || (item.retryCount || 0) < MAX_RETRIES;
      });

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
              } else if (action.type === 'SUBMIT_CASH_TOLL') {
                  await syncCashTollAction(action);
                  processedIds.push(action.id);
                  tollSuccess++;
              } else if (action.type === 'SUBMIT_FUEL_EXPENSE') {
                  await syncFuelExpense(action);
                  processedIds.push(action.id);
                  fuelSuccess++;
              } else if (action.type === 'SUBMIT_GAS_CARD_ANCHOR') {
                  await syncGasCardAnchor(action);
                  processedIds.push(action.id);
                  fuelSuccess++;
              } else if (action.type === 'SUBMIT_SPLIT_FUEL_FILL') {
                  await syncSplitFuelFill(action);
                  processedIds.push(action.id);
                  fuelSuccess++;
              } else if (action.type === 'SUBMIT_DRIVER_REPORT_UPDATE') {
                  await syncDriverReportUpdate(action);
                  processedIds.push(action.id);
              }
          } catch (e: any) {
              console.error("Sync failed for action", action.id, e);

              const code = String(e?.code || "");
              const msg = String(e?.message || "");
              const closedWeek = code === "CLOSED_WEEK" || isClosedWeekSaveError(e);
              const tollPermanent =
                action.type === "SUBMIT_CASH_TOLL" && isPermanentTollSyncError(e);
              const permanent =
                closedWeek ||
                tollPermanent ||
                code === "MODULE_DISABLED" ||
                /MODULE_DISABLED/i.test(msg) ||
                /not enabled for this organization/i.test(msg);

              const tollMsg =
                tollPermanent
                  ? tollSyncPermanentMessage(
                      (e as TollSyncError).code,
                      msg,
                    )
                  : undefined;

              offlineStorage.updateAction(action.id, {
                  retryCount: permanent ? MAX_RETRIES : (action.retryCount || 0) + 1,
                  lastError: closedWeek
                    ? CLOSED_WEEK_TRIP_MESSAGE
                    : tollMsg
                    ? tollMsg
                    : permanent
                    ? (msg || "Split fills are not enabled for this fleet")
                    : (msg || "Unknown error"),
              });
              if (closedWeek) {
                toast.error(CLOSED_WEEK_TRIP_MESSAGE);
              } else {
                errorCount++;
                if (tollPermanent) {
                  toast.error(tollMsg || msg);
                } else if (permanent && action.type === "SUBMIT_SPLIT_FUEL_FILL") {
                  toast.error("Split fuel fill is not available for your fleet");
                }
              }
          }
      }

      if (processedIds.length > 0) {
          processedIds.forEach(id => offlineStorage.removeFromQueue(id));
          const parts: string[] = [];
          if (tripSuccess > 0) parts.push(`${tripSuccess} trip${tripSuccess === 1 ? '' : 's'}`);
          if (tollSuccess > 0) parts.push(`${tollSuccess} toll${tollSuccess === 1 ? '' : 's'}`);
          if (fuelSuccess > 0) parts.push(`${fuelSuccess} fuel log${fuelSuccess === 1 ? '' : 's'}`);
          toast.success(`Synced ${parts.join(' and ') || `${processedIds.length} items`}`);
          refreshQueue();
      }
      
      if (errorCount > 0) {
          toast.error(`Failed to sync ${errorCount} items`);
      }

      const nextStatus = errorCount > 0 ? 'ERROR' : 'IDLE';
      setSyncStatus(nextStatus);

      const deferred = deferQueueRerunRef.current;
      deferQueueRerunRef.current = false;
      const pendingRetryable = offlineStorage.getQueue().some(
        (item) => (item.retryCount || 0) < MAX_RETRIES && !isClosedWeekSaveError(item.lastError),
      );
      if (shouldProcessQueueAfterSync(deferred, pendingRetryable)) {
        void processQueue(false);
      }
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
