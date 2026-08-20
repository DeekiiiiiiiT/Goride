import { useEffect } from 'react';
import { formatJobStationLabel, type JobStation } from '../../types/team';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface TabletPairingSuccessPageProps {
  storeName: string;
  station: JobStation;
  onContinue: () => void;
  autoContinueMs?: number;
}

export default function TabletPairingSuccessPage({
  storeName,
  station,
  onContinue,
  autoContinueMs = 2000,
}: TabletPairingSuccessPageProps) {
  useEffect(() => {
    const timer = window.setTimeout(onContinue, autoContinueMs);
    return () => window.clearTimeout(timer);
  }, [autoContinueMs, onContinue]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-margin-mobile text-center">
      <div className="mb-inset-lg flex h-20 w-20 items-center justify-center rounded-full bg-primary-container/15">
        <MaterialIcon name="check_circle" size={48} className="text-primary-container" />
      </div>
      <h1 className="text-headline-md font-bold text-on-background">Tablet connected</h1>
      <p className="mt-inset-sm max-w-sm text-body-lg text-on-surface-variant">
        <span className="font-semibold text-on-background">{storeName}</span> is set up as{' '}
        <span className="font-semibold text-on-background">{formatJobStationLabel(station)}</span>.
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-inset-xl h-12 rounded-full bg-primary-container px-inset-xl text-label-lg font-semibold text-on-primary-container"
      >
        Continue to staff sign-in
      </button>
    </div>
  );
}
