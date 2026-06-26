import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobStation } from '../../types/team';
import { enrollStoreTablet } from '../../lib/partner-api';
import { formatTabletEnrollError } from '../../lib/tablet-enroll-errors';
import { persistDeviceSession } from '../../lib/store-tablet-session';
import { parseTabletUrlParams } from '../../lib/storeTabletUrl';
import StoreCodeEntryPage from './StoreCodeEntryPage';
import TabletStationPickerPage from './TabletStationPickerPage';
import TabletPairingSuccessPage from './TabletPairingSuccessPage';

type FlowStep = 'code' | 'station' | 'success';

interface StoreTabletFlowProps {
  onPaired: () => void;
  onBack?: () => void;
}

export default function StoreTabletFlow({ onPaired, onBack }: StoreTabletFlowProps) {
  const urlParams = useMemo(() => parseTabletUrlParams(), []);

  const [step, setStep] = useState<FlowStep>(() => {
    if (urlParams.code && urlParams.station) return 'station';
    if (urlParams.code) return 'station';
    return 'code';
  });
  const [code, setCode] = useState(urlParams.code || '');
  const [pendingStation, setPendingStation] = useState<JobStation | null>(urlParams.station);
  const [pairingResult, setPairingResult] = useState<{
    storeName: string;
    station: JobStation;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const completeEnroll = useCallback(
    async (pairingCode: string, station: JobStation) => {
      setIsLoading(true);
      setError(null);
      try {
        const prepStationId =
          station === 'kitchen' ? urlParams.prepStationId ?? undefined : undefined;
        const result = await enrollStoreTablet({
          code: pairingCode,
          station,
          prepStationId,
        });
        persistDeviceSession({
          deviceToken: result.deviceToken,
          merchantId: result.merchantId,
          storeName: result.storeName,
          station: result.station,
          expiresAt: result.expiresAt,
          staffOperationsEnabled: result.staffOperationsEnabled,
          staffStationPinEnabled: result.staffStationPinEnabled,
          inStoreOperationsEnabled: result.inStoreOperationsEnabled,
          prepStationId: result.prepStationId ?? prepStationId ?? null,
        });
        setPairingResult({
          storeName: result.storeName,
          station: result.station,
        });
        setStep('success');
      } catch (err) {
        setError(formatTabletEnrollError(err));
        setStep(station ? 'station' : 'code');
      } finally {
        setIsLoading(false);
      }
    },
    [urlParams.prepStationId],
  );

  useEffect(() => {
    if (urlParams.code && urlParams.station) {
      setCode(urlParams.code);
      void completeEnroll(urlParams.code, urlParams.station);
    }
  }, [urlParams.code, urlParams.station, completeEnroll]);

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
        onBack={() => {
          setError(null);
          setStep('code');
        }}
        isLoading={isLoading}
        error={error}
        venueOpsV2
      />
    );
  }

  if (step === 'success' && pairingResult) {
    return (
      <TabletPairingSuccessPage
        storeName={pairingResult.storeName}
        station={pairingResult.station}
        onContinue={onPaired}
      />
    );
  }

  return null;
}
