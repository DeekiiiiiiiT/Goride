import { EvidenceMediaPanel } from './EvidenceMediaPanel';
import type { EvidenceLabel } from './types';

export interface EvidenceFromRecordProps {
  record: {
    receiptUrl?: string | null;
    odometerProofUrl?: string | null;
    status?: string | null;
    metadata?: {
      evidenceExpired?: boolean;
      evidenceDeleteAfter?: string;
      odometerProofUrl?: string;
      receiptUrl?: string;
    } | null;
  };
  urlField?: 'receiptUrl' | 'odometerProofUrl';
  label?: EvidenceLabel;
  compact?: boolean;
  className?: string;
}

/** Maps transaction/fuel record fields to EvidenceMediaPanel. */
export function EvidenceFromRecord({
  record,
  urlField = 'receiptUrl',
  label = 'Evidence photo',
  compact,
  className,
}: EvidenceFromRecordProps) {
  const imageUrl =
    urlField === 'odometerProofUrl'
      ? record.odometerProofUrl || record.metadata?.odometerProofUrl
      : record.receiptUrl || record.metadata?.receiptUrl;

  return (
    <EvidenceMediaPanel
      label={label}
      imageUrl={imageUrl}
      evidenceExpired={record.metadata?.evidenceExpired}
      evidenceDeleteAfter={record.metadata?.evidenceDeleteAfter}
      parentStatus={record.status}
      compact={compact}
      className={className}
    />
  );
}
