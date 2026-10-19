import type { StationGateEvidenceRow } from './EvidenceInboxTab';

export type UnresolvedLinkage = 'linked' | 'payment_only' | 'location_only' | 'provisional';

/** Queue filters — linkage chips plus sticky resolution reasons (R3b). */
export type UnresolvedFilter =
  | 'all'
  | UnresolvedLinkage
  | 'statement_mismatch'
  | 'claim_conflict';

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
  /** G2: resolution reason stamped at learnt create */
  reason?: string;
  nearMissCandidates?: Array<{ stationId?: string; name?: string; distanceM?: number }>;
  statementMerchant?: string;
}

/** Open provisional fuel fill (no learnt row). */
export interface ProvisionalFillDto {
  id: string;
  vendor?: string;
  location?: string;
  date?: string | null;
  matchedStationId?: string | null;
  organizationId?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  metadata?: {
    locationStatus?: string;
    matchDistance?: number;
    nearMissCandidates?: Array<{ stationId?: string; name?: string; distanceM?: number }>;
    stationResolution?: {
      reason?: string;
      state?: string;
      stationId?: string | null;
      decidedAt?: string;
    };
    driverClaim?: unknown;
    jaaStation?: string;
    statementMerchant?: string | null;
  };
}

export interface UnresolvedStopRow {
  rowKey: string;
  linkage: UnresolvedLinkage;
  learnt?: LearntLocationDto;
  evidence?: StationGateEvidenceRow;
  provisional?: ProvisionalFillDto;
  sortDate: string;
}

export type { StationGateEvidenceRow };
