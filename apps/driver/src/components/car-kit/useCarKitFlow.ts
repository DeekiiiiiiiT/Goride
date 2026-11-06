import { useCallback, useEffect, useState } from 'react';
import {
  driverInventoryApi,
  type DriverCarKitPayload,
  type DriverReportRow,
} from '../../services/driverInventoryApi';
import {
  type CarKitLoadState,
  type CarKitScreen,
  loadStateToDk6View,
} from './carKitNavigation';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function deriveLoadState(payload: DriverCarKitPayload | null, error: string | null): CarKitLoadState {
  if (error) return 'load_failed';
  if (!payload) return 'loading';
  if (payload.state === 'no_vehicle') return 'no_vehicle';
  if (payload.state === 'no_kit') return 'no_kit';
  return 'ready';
}

export function useCarKitFlow(vehicleId?: string | null) {
  const [loadState, setLoadState] = useState<CarKitLoadState>('loading');
  const [kit, setKit] = useState<DriverCarKitPayload | null>(null);
  const [screen, setScreen] = useState<CarKitScreen>('dk1');
  const [reportItemLabel, setReportItemLabel] = useState<string | undefined>();
  const [sendError, setSendError] = useState(false);
  const [sendErrorRef, setSendErrorRef] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{
    itemLabel: string;
    issueLabel: string;
    note?: string;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastReport, setLastReport] = useState<DriverReportRow | null>(null);
  const [reports, setReports] = useState<DriverReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const dismissOfflineNotice = useCallback(() => {
    setPendingDraft(null);
    setSendError(false);
    setScreen('dk1');
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setSendError(false);
    (async () => {
      try {
        const data = await driverInventoryApi.carKit(vehicleId ?? null);
        if (cancelled) return;
        setKit(data);
        setLoadState(deriveLoadState(data, null));
      } catch (err) {
        if (cancelled) return;
        console.error('car-kit load failed', err);
        setKit(null);
        setLoadState('load_failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicleId, refreshKey]);

  useEffect(() => {
    if (screen !== 'dk4' && screen !== 'dk1') return;
    let cancelled = false;
    setReportsLoading(true);
    (async () => {
      try {
        const data = await driverInventoryApi.reports({ limit: 50 });
        if (!cancelled) setReports(data.items ?? []);
      } catch (err) {
        console.error('reports load failed', err);
        if (!cancelled) setReports([]);
      } finally {
        if (!cancelled) setReportsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, refreshKey]);

  useEffect(() => {
    if (screen !== 'dk4') return;
    let cancelled = false;
    (async () => {
      try {
        await driverInventoryApi.markReportsSeen(vehicleId ?? kit?.vehicleId ?? null);
        if (cancelled) return;
        const data = await driverInventoryApi.carKit(vehicleId ?? null);
        setKit(data);
      } catch (err) {
        console.error('mark reports seen failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, vehicleId, refreshKey]);

  const dk6View = loadStateToDk6View(sendError ? 'send_failed' : loadState);
  const showDk6 = dk6View !== null && screen !== 'dk2' && screen !== 'dk3';

  const openReportSheet = (itemLabel?: string | null) => {
    setReportItemLabel(itemLabel ?? undefined);
    setScreen('dk2');
  };

  const closeReportSheet = () => {
    setReportItemLabel(undefined);
    setScreen('dk1');
  };

  const submitReport = async (payload?: {
    issueType?: string;
    notes?: string;
    hasPhoto?: boolean;
  }) => {
    const itemLabel = reportItemLabel?.trim() || 'Kit item';
    setPendingDraft({
      itemLabel,
      issueLabel: payload?.issueType ?? 'Missing / Broken',
      note: payload?.notes,
    });
    setSending(true);
    try {
      const res = (await driverInventoryApi.submitReport(
        {
          itemNames: reportItemLabel ? [reportItemLabel] : undefined,
          issueType: payload?.issueType ?? 'driver_report',
          notes: payload?.notes?.trim() || undefined,
          vehicleId: kit?.vehicleId ?? vehicleId ?? undefined,
        },
        newIdempotencyKey('driver-report'),
      )) as { report?: DriverReportRow };
      setSendError(false);
      setSendErrorRef(null);
      setLastReport(res.report ?? { itemLabel: reportItemLabel, displayName: reportItemLabel });
      setScreen('dk3');
    } catch (err) {
      console.error('report submit failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      setSendErrorRef(msg.slice(0, 120) || 'SEND_FAILED');
      setSendError(true);
      setScreen('dk1');
    } finally {
      setSending(false);
    }
  };

  return {
    kit,
    loadState,
    screen,
    setScreen,
    showDk6,
    dk6View,
    reportItemLabel,
    openReportSheet,
    closeReportSheet,
    submitReport,
    sending,
    reload,
    lastReport,
    reports,
    reportsLoading,
    pendingDraft,
    sendErrorRef,
    dismissOfflineNotice,
  };
}
