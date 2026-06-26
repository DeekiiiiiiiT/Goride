import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobStation, RosterMember } from '../../types/team';
import { enrollStoreTablet } from '../../lib/partner-api';
import { persistDeviceSession, readDeviceSession } from '../../lib/store-tablet-session';
import { parseTabletUrlParams } from '../../lib/storeTabletUrl';
import StoreCodeEntryPage from './StoreCodeEntryPage';
import TabletStationPickerPage from './TabletStationPickerPage';
import TabletPairingSuccessPage from './TabletPairingSuccessPage';
import StationKioskFlow from '../staff-ops/station/StationKioskFlow';

type FlowStep = 'code' | 'station' | 'success' | 'kiosk';

interface StoreTabletFlowProps {
  onPaired: () => void;
  onBack?: () => void;
}

export default function StoreTabletFlow({ onPaired, onBack }: StoreTabletFlowProps) {
  const urlParams = useMemo(() => parseTabletUrlParams(), []);
  const existing = readDeviceSession();

  const [step, setStep] = useState<FlowStep>(() => {
    if (existing) return 'kiosk';
    if (urlParams.code && urlParams.station) return 'station';
    if (urlParams.code) return 'station';
    return 'code';
  });
  const [code, setCode] = useState(urlParams.code || '');
  const [pendingStation, setPendingStation] = useState<JobStation | null>(urlParams.station);
  const [pairingResult, setPairingResult] = useState<{
    storeName: string;
    station: JobStation;
    merchantId: string;
  } | null>(existing
    ? {
        storeName: existing.storeName,
        station: existing.station,
        merchantId: existing.merchantId,
      }
    : null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const completeEnroll = useCallback(
    async (pairingCode: string, station: JobStation) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await enrollStoreTablet({ code: pairingCode, station });
        persistDeviceSession({
          deviceToken: result.deviceToken,
          merchantId: result.merchantId,
          storeName: result.storeName,
          station: result.station,
          expiresAt: result.expiresAt,
          staffOperationsEnabled: result.staffOperationsEnabled,
          staffStationPinEnabled: result.staffStationPinEnabled,
        });
        setPairingResult({
          storeName: result.storeName,
          station: result.station,
          merchantId: result.merchantId,
        });
        setStep('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not connect tablet');
        setStep(urlParams.code && !urlParams.station ? 'station' : 'code');
      } finally {
        setIsLoading(false);
      }
    },
    [urlParams.code, urlParams.station],
  );

  useEffect(() => {
    if (existing) return;
    if (urlParams.code && urlParams.station) {
      setCode(urlParams.code);
      void completeEnroll(urlParams.code, urlParams.station);
    }
  }, [existing, urlParams.code, urlParams.station, completeEnroll]);

  const handleCodeContinue = (nextCode: string) => {
    setCode(nextCode);
    setError(null);
    if (urlParams.station || pendingStation) {
      void completeEnroll(nextCode, urlParams.station || pendingStation!);
      return;
    }
    setStep('station');
  };

  const handleStationSelect = (station: JobStation) => {
    setPendingStation(station);
    void completeEnroll(code, station);
  };

  const handleShiftStarted = (_member: RosterMember) => {
    onPaired();
  };

  if (step === 'code') {
    return (
      <StoreCodeEntryPage
        initialCode={code}
        onContinue={handleCodeContinue}
        onBack={onBack}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  if (isLoading && !pairingResult) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-inset-lg text-body-md text-on-surface-variant">
        Connecting tablet…
      </div>
    );
  }

  if (step === 'station' && !isLoading) {
    return (
      <TabletStationPickerPage
        onSelect={handleStationSelect}
        onBack={() => setStep('code')}
        isLoading={isLoading}
      />
    );
  }

  if (step === 'success' && pairingResult) {
    return (
      <TabletPairingSuccessPage
        storeName={pairingResult.storeName}
        station={pairingResult.station}
        onContinue={() => {
          setStep('kiosk');
          onPaired();
        }}
      />
    );
  }

  if (pairingResult) {
    return (
      <StationKioskFlow
        merchantId={pairingResult.merchantId}
        storeName={pairingResult.storeName}
        initialStationFilter={pairingResult.station}
        lockStationFilter
        shiftSurface="store_tablet"
        onShiftStarted={handleShiftStarted}
      />
    );
  }

  return null;
}
