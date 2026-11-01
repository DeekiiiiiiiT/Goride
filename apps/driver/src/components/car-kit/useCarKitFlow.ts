import { useCallback, useEffect, useState } from 'react';
import { driverInventoryApi, type DriverCarKitPayload } from '../../services/driverInventoryApi';
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
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
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

  const dk6View = loadStateToDk6View(sendError ? 'send_failed' : loadState);
  const showDk6 = dk6View !== null && screen !== 'dk2' && screen !== 'dk3';

  const openReportSheet = (itemLabel?: string) => {
    setReportItemLabel(itemLabel);
    setScreen('dk2');
  };

  const closeReportSheet = () => {
    setReportItemLabel(undefined);
    setScreen('dk1');
  };

  const submitReport = async () => {
    try {
      await driverInventoryApi.submitReport(
        {
          itemNames: reportItemLabel ? [reportItemLabel] : undefined,
          issueType: 'driver_report',
        },
        newIdempotencyKey('driver-report'),
      );
      setSendError(false);
      setScreen('dk3');
    } catch (err) {
      console.error('report submit failed', err);
      setSendError(true);
      setScreen('dk6');
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
    reload,
  };
}
