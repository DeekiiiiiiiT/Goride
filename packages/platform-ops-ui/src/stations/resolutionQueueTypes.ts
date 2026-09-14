import type { StationGateEvidenceRow } from './EvidenceInboxTab';

export type UnresolvedLinkage = 'linked' | 'payment_only' | 'location_only';

export type UnresolvedFilter = 'all' | UnresolvedLinkage;

export interface LearntLocationDto {
  id: string;
  name?: string;
  location?: {
    lat?: number | null;
    lng?: number | null;
    accuracy?: number;
  };
  timestamp?: string;
  firstSeen?: string;
  transactionId?: string;
  sourceEntryId?: string;
  nearbyStation?: {
    id: string;
    name: string;
    distance: number;
    status?: string;
  };
  gateReason?: string;
  status?: string;
}

export interface UnresolvedStopRow {
  rowKey: string;
  linkage: UnresolvedLinkage;
  learnt?: LearntLocationDto;
  evidence?: StationGateEvidenceRow;
  sortDate: string;
}

export type { StationGateEvidenceRow };
