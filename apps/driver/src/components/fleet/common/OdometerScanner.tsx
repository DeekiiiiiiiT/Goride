import { OdometerScanner as SharedOdometerScanner, type ScanResult } from '@roam/ui/odometer-scanner';
import { api } from '../../../services/api';

export type { ScanResult };

export function OdometerScanner({
  onScanComplete,
  onCancel,
  lastOdometer,
  isFleetDriver = true,
}: {
  onScanComplete: (result: ScanResult) => void;
  onCancel: () => void;
  lastOdometer?: number;
  className?: string;
  isFleetDriver?: boolean;
}) {
  return (
    <SharedOdometerScanner
      lastOdometer={lastOdometer}
      isFleetDriver={isFleetDriver}
      onCancel={onCancel}
      onScanComplete={onScanComplete}
      scanPhoto={async (file, signal) => {
        const res = await api.scanOdometerWithAI(file, signal);
        const data = res?.data as { reading?: number | null; confidence?: string } | undefined;
        return { reading: data?.reading ?? null, confidence: data?.confidence };
      }}
    />
  );
}
