/**
 * Unverified Vendor Management Types
 * 
 * Phase 1 - Enterprise Vendor Verification System
 * Handles fuel transactions submitted without verified gas station matches.
 */

export interface UnverifiedVendor {
  id: string;
  name: string;
  createdAt: string;
  status: 'pending' | 'resolved';
  transactionIds: string[];
  sourceType: 'no_gps' | 'unmatched_name' | 'manual_entry';
  metadata: {
    totalAmount: number;
    transactionCount: number;
    firstSeen: string;
    lastSeen: string;
    submittedBy: string[];
    vehicles: string[];
  };
  resolution?: {
    resolvedAt: string;
    resolvedBy: string;
    action: 'matched_existing' | 'created_new' | 'rejected';
    targetStationId?: string;
    notes?: string;
  };
}

export interface VendorMatchRequest {
  unverifiedVendorId: string;
  action: 'match_existing' | 'create_new';
  targetStationId?: string;
  stationData?: {
    name: string;
    brand: string;
    address: string;
    status: 'verified';
  };
  notes?: string;
}

export interface UnverifiedVendorSummary {
  vendors: UnverifiedVendor[];
  summary: {
    total: number;
    pending: number;
    resolved: number;
    totalAmountAtRisk: number;
  };
}

export interface VendorResolutionResult {
  success: boolean;
  vendorId: string;
  stationId: string;
  released: number;
  failed: number;
  transactionIds: string[];
  message: string;
}
