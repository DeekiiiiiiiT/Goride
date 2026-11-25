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
  afterFailedTry,
  buildOutboxReport,
  isOutboxItemDue,
  OUTBOX_MAX_DELAY_MS,
  OUTBOX_RETRY_DELAYS_MS,
  OUTBOX_SEND_TIMEOUT_MS,
  OUTBOX_TICK_MS,
  plainSendError,
  withTimeout,
} from '@roam/fuel-core/phoneOutbox';

interface OfflineContextType {
  isOnline: boolean;
  queue: OfflineAction[];
  addToQueue: (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>) => OfflineAction;
  refreshQueue: () => void;
  /** Send what is due; `true` = the driver tapped "Send now". Nothing here deletes an item (FO-18). */
  processQueue: (forceRetry?: boolean) => Promise<void>;
  syncStatus: 'IDLE' | 'SYNCING' | 'ERROR';
  setSyncStatus: (status: 'IDLE' | 'SYNCING' | 'ERROR') => void;
}

/** Exported so tests and screen previews can supply their own waiting list. */
export const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

/**
 * Upload one waiting photo. New-flow fills (captureId) use one fixed file per photo (S4), so a
 * re-send replaces it. A photo that is gone from the phone no longer blocks the fill forever:
 * the fill is sent without it and the server sends it to review (FO-09).
 */
async function uploadQueuedPhoto(
  blobKey: string | undefined,
  fileName: string,
  mimeType: string | undefined,
  meta: Parameters<typeof uploadEvidenceFile>[1] & object,
  captureId: string,
  photoKind: 'odometer' | 'pump' | 'receipt',
): Promise<{ url: string; missing: boolean }> {
  if (!blobKey) return { url: '', missing: false };
  const blob = await offlineBlobStore.get(blobKey);
  if (!blob) return { url: '', missing: true };
  const file = new File([blob], fileName, { type: mimeType || blob.type || 'image/jpeg' });
  const res = await uploadEvidenceFile(file, {
    ...meta,
    ...(captureId ? { captureId, photoKind } : {}),
  });
  return { url: res.url, missing: false };
}

function captureIdOfPayload(record: Record<string, any> | undefined): string {
  const id = record?.metadata?.captureId;
  return typeof id === 'string' ? id : '';
}

function markMissingPhotos(record: Record<string, any>, missing: string[]): void {
  if (!missing.length) return;
  record.metadata = { ...(record.metadata || {}), photoMissingOnPhone: missing };
}

async function syncFuelExpense(action: Extract<OfflineAction, { type: 'SUBMIT_FUEL_EXPENSE' }>) {
  const { payload } = action;
  const tx = { ...payload.transaction };
  const txId = String(tx.id || crypto.randomUUID());
  tx.id = txId;
  const captureId = captureIdOfPayload(tx);
  const missing: string[] = [];

  let receiptUrl = tx.receiptUrl || '';
  let odometerProofUrl = tx.metadata?.odometerProofUrl || '';

  const receipt = await uploadQueuedPhoto(
    payload.receiptBlobKey,
    payload.receiptFileName || 'receipt.jpg',
    payload.receiptMimeType,
    { evidenceType: 'fuel_receipt', sourceType: 'transaction', sourceId: txId, retentionClass: 'ephemeral', parentStatus: 'Pending' },
    captureId,
    'pump',
  );
  if (receipt.url) receiptUrl = receipt.url;
  if (receipt.missing) missing.push('pump');

  const odo = await uploadQueuedPhoto(
    payload.odometerBlobKey,
    payload.odometerFileName || 'odometer.jpg',
    payload.odometerMimeType,
    { evidenceType: 'odometer_proof', sourceType: 'transaction', sourceId: txId, retentionClass: 'ephemeral', parentStatus: 'Pending' },
    captureId,
    'odometer',
  );
  if (odo.url) odometerProofUrl = odo.url;
  if (odo.missing) missing.push('odometer');

  if (receiptUrl) tx.receiptUrl = receiptUrl;
  if (odometerProofUrl) {
    tx.metadata = { ...(tx.metadata || {}), odometerProofUrl };
  }
  markMissingPhotos(tx, missing);

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

  const odo = await uploadQueuedPhoto(
    payload.odometerBlobKey,
    payload.odometerFileName || 'odometer.jpg',
    payload.odometerMimeType,
    { evidenceType: 'odometer_proof', sourceType: 'fuel_entry', sourceId: entryId, retentionClass: 'ephemeral', parentStatus: 'Pending' },
    captureIdOfPayload(entry),
    'odometer',
  );
  if (odo.url) {
    entry.odometerImageUrl = odo.url;
    entry.metadata = {
      ...(entry.metadata || {}),
      odometerProofUrl: odo.url,
    };
  }
  markMissingPhotos(entry, odo.missing ? ['odometer'] : []);

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

  const captureId = captureIdOfPayload(cashTx);
  const missing: string[] = [];
  const receipt = await uploadQueuedPhoto(
    payload.receiptBlobKey,
    payload.receiptFileName || 'receipt.jpg',
    payload.receiptMimeType,
    { evidenceType: 'fuel_receipt', sourceType: 'transaction', sourceId: txId, retentionClass: 'ephemeral', parentStatus: 'Pending' },
    captureId,
    'pump',
  );
  if (receipt.url) receiptUrl = receipt.url;
  if (receipt.missing) missing.push('pump');

  const odo = await uploadQueuedPhoto(
    payload.odometerBlobKey,
    payload.odometerFileName || 'odometer.jpg',
    payload.odometerMimeType,
    { evidenceType: 'odometer_proof', sourceType: 'fuel_entry', sourceId: entryId, retentionClass: 'ephemeral', parentStatus: 'Pending' },
    captureId,
    'odometer',
  );
  if (odo.url) odometerProofUrl = odo.url;
  if (odo.missing) missing.push('odometer');
  markMissingPhotos(cashTx, missing);

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

const DEVICE_ID_KEY = 'roam:driver:device-id';
/** Re-send an unchanged report at most this often. */
const REPORT_REPEAT_MS = 10 * 60_000;

function phoneDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id || id.length < 8) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'no-storage-device';
  }
}

type SentKind = 'trip' | 'toll' | 'fuel' | 'other';

async function sendOne(action: OfflineAction, user: NonNullable<ReturnType<typeof useAuth>['user']>): Promise<SentKind> {
  if (action.type === 'SUBMIT_TRIP') {
    const { formData, rawRoute } = action.payload;
    // Snap to road when the route is long enough; a failure keeps the raw route.
    if (rawRoute && rawRoute.length > 5) {
      try {
        const matchResult = await mapMatchService.snapToRoad(rawRoute);
        if (matchResult) {
          formData.distance = Number((matchResult.totalDistance / 1000).toFixed(2));
          const baseTime = formData.date && formData.time
            ? new Date(`${formData.date}T${formData.time}`).getTime()
            : Date.now();
          formData.route = matchResult.snappedRoute.map((pt: any, idx: number) => ({
            lat: pt.lat,
            lon: pt.lon,
            timestamp: baseTime + (idx * 1000),
            speed: 0,
            heading: 0,
            accuracy: 10,
          }));
        }
      } catch (snapError) {
        console.warn('Snap to road failed, using raw data', snapError);
      }
    }
    const driverName = user.user_metadata?.name || user.email || 'Unknown Driver';
    await api.saveTrips([createManualTrip(formData, user.id, driverName)]);
    return 'trip';
  }
  if (action.type === 'SUBMIT_CASH_TOLL') {
    await syncCashTollAction(action);
    return 'toll';
  }
  if (action.type === 'SUBMIT_FUEL_EXPENSE') {
    await syncFuelExpense(action);
    return 'fuel';
  }
  if (action.type === 'SUBMIT_GAS_CARD_ANCHOR') {
    await syncGasCardAnchor(action);
    return 'fuel';
  }
  if (action.type === 'SUBMIT_SPLIT_FUEL_FILL') {
    await syncSplitFuelFill(action);
    return 'fuel';
  }
  if (action.type === 'SUBMIT_DRIVER_REPORT_UPDATE') {
    await syncDriverReportUpdate(action);
    return 'other';
  }
  return 'other';
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useNetworkStatus();
  const { user } = useAuth();
  const [queue, setQueue] = useState<OfflineAction[]>([]);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING' | 'ERROR'>('IDLE');

  // Refs so the timer and listeners always see the latest values (FO-07: never stuck "Syncing").
  const runningRef = useRef(false);
  const rerunRef = useRef<boolean | null>(null);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const userRef = useRef(user);
  userRef.current = user;
  const lastReportRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });

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

  // Listen to storage changes (if other tabs update it)
  useEffect(() => {
    const handleStorageChange = () => refreshQueue();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  /** S1: tell Fleet how many items wait here. Changed reports go at once, the same one every 10 min. */
  const reportToFleet = async () => {
    if (!userRef.current || !isOnlineRef.current) return;
    const report = buildOutboxReport(offlineStorage.getQueue());
    const key = JSON.stringify(report);
    const now = Date.now();
    if (key === lastReportRef.current.key && now - lastReportRef.current.at < REPORT_REPEAT_MS) return;
    const ok = await withTimeout(
      api.reportPhoneOutbox({
        deviceId: phoneDeviceId(),
        appVersion: import.meta.env.VITE_APP_VERSION || null,
        ...report,
      }),
      20_000,
      'Report',
    ).catch(() => false);
    if (ok) lastReportRef.current = { key, at: now };
  };

  /**
   * Send what is due. `forceRetry` = the driver tapped "Send now": the waits are skipped.
   * An item leaves the phone only when the server confirms it (FO-18).
   */
  const processQueue = async (forceRetry = false): Promise<void> => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    if (!isOnlineRef.current && !forceRetry) return;
    if (runningRef.current) {
      rerunRef.current = (rerunRef.current ?? false) || forceRetry;
      return;
    }
    runningRef.current = true;
    setSyncStatus('SYNCING');

    let errorCount = 0;
    const sent: Record<SentKind, number> = { trip: 0, toll: 0, fuel: 0, other: 0 };
    try {
      const now = Date.now();
      const due = offlineStorage.getQueue().filter(
        (item) => !isClosedWeekSaveError(item.lastError) && isOutboxItemDue(item, now, forceRetry),
      );

      for (const action of due) {
        try {
          const kind = await withTimeout(sendOne(action, currentUser), OUTBOX_SEND_TIMEOUT_MS, 'Sending');
          offlineStorage.removeFromQueue(action.id);
          sent[kind]++;
        } catch (e: any) {
          console.error('Sync failed for action', action.id, e);
          const code = String(e?.code || '');
          const msg = String(e?.message || '');
          const closedWeek = code === 'CLOSED_WEEK' || isClosedWeekSaveError(e);
          const tollPermanent = action.type === 'SUBMIT_CASH_TOLL' && isPermanentTollSyncError(e);
          const permanent =
            tollPermanent ||
            code === 'MODULE_DISABLED' ||
            /MODULE_DISABLED/i.test(msg) ||
            /not enabled for this organization/i.test(msg);
          const tollMsg = tollPermanent
            ? tollSyncPermanentMessage((e as TollSyncError).code, msg)
            : undefined;

          const failed = afterFailedTry(action, plainSendError(e), Date.now());
          offlineStorage.updateAction(action.id, {
            // A refusal the server keeps giving waits an hour between tries; nothing is parked or dropped.
            retryCount: permanent ? Math.max(failed.retryCount, OUTBOX_RETRY_DELAYS_MS.length) : failed.retryCount,
            nextAttemptAt: permanent ? Date.now() + OUTBOX_MAX_DELAY_MS : failed.nextAttemptAt,
            lastTryAt: Date.now(),
            held: closedWeek ? true : undefined,
            lastError: closedWeek ? CLOSED_WEEK_TRIP_MESSAGE : tollMsg || failed.lastError,
          });
          if (closedWeek) {
            toast.error(CLOSED_WEEK_TRIP_MESSAGE);
          } else {
            errorCount++;
            if (forceRetry && tollPermanent) toast.error(tollMsg || msg);
          }
        }
      }

      const parts: string[] = [];
      if (sent.trip > 0) parts.push(`${sent.trip} trip${sent.trip === 1 ? '' : 's'}`);
      if (sent.toll > 0) parts.push(`${sent.toll} toll${sent.toll === 1 ? '' : 's'}`);
      if (sent.fuel > 0) parts.push(`${sent.fuel} fuel log${sent.fuel === 1 ? '' : 's'}`);
      const total = sent.trip + sent.toll + sent.fuel + sent.other;
      if (total > 0) toast.success(`Sent ${parts.join(' and ') || `${total} item${total === 1 ? '' : 's'}`}`);
      // Quiet on the timer; only a tap on "Send now" gets told that something is still waiting.
      if (errorCount > 0 && forceRetry) {
        toast.message(`${errorCount} item${errorCount === 1 ? '' : 's'} still on this phone. It sends by itself when you have signal.`);
      }
    } finally {
      runningRef.current = false;
      setSyncStatus(errorCount > 0 ? 'ERROR' : 'IDLE');
      refreshQueue();
      void reportToFleet();
      const again = rerunRef.current;
      rerunRef.current = null;
      if (again !== null) void processQueue(again);
    }
  };

  // FO-08: try on start, every minute while open, and when the app comes back to the front.
  useEffect(() => {
    if (!user?.id) return;
    void processQueue(false);
    const timer = setInterval(() => void processQueue(false), OUTBOX_TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void processQueue(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    let removeAppListener: (() => void) | undefined;
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void processQueue(false);
        });
        removeAppListener = () => void handle.remove();
      } catch {
        /* web */
      }
    })();
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      removeAppListener?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Signal came back: try at once.
  useEffect(() => {
    if (isOnline && user) void processQueue(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return (
    <OfflineContext.Provider value={{ isOnline, queue, addToQueue, refreshQueue, processQueue, syncStatus, setSyncStatus }}>
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
