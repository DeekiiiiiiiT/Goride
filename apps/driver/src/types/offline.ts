import type { TripSession } from './tripSession';

export type OfflineActionType =
  | 'SUBMIT_TRIP'
  | 'SUBMIT_FUEL_EXPENSE'
  | 'SUBMIT_GAS_CARD_ANCHOR'
  | 'SUBMIT_SPLIT_FUEL_FILL'
  | 'SUBMIT_CASH_TOLL'
  | 'SUBMIT_DRIVER_REPORT_UPDATE';

export interface SubmitDriverReportUpdatePayload {
  reportId: string;
  kind: 'found_it' | 'got_replacement' | 'still_missing';
  note?: string;
  photoBlobKey?: string;
  photoFileName?: string;
  photoMimeType?: string;
  vehicleId?: string | null;
  label?: string;
}

export interface SubmitTripPayload {
  tripData: Partial<TripSession>;
  formData: {
    category: string;
    purpose: string;
    notes: string;
    projectId?: string;
    [key: string]: any;
  };
  rawRoute: any[];
  calculatedDistance: number;
}

/** Transaction fields + IndexedDB blob keys for photos (not base64 in localStorage). */
export interface SubmitFuelExpensePayload {
  transaction: Record<string, any>;
  odometerBlobKey?: string;
  receiptBlobKey?: string;
  odometerFileName?: string;
  receiptFileName?: string;
  odometerMimeType?: string;
  receiptMimeType?: string;
  label?: string;
}

/** Gas Card odometer-only anchor (no pump receipt / no reimbursement tx). */
export interface SubmitGasCardAnchorPayload {
  fuelEntry: Record<string, any>;
  odometerBlobKey?: string;
  odometerFileName?: string;
  odometerMimeType?: string;
  label?: string;
}

/** Atomic Gas Card + Cash split — both rows or neither. */
export interface SubmitCashTollPayload {
  occurredAt: string;
  amountMinor: number;
  plazaName?: string;
  lane?: string;
  collector?: string;
  vehicleClass?: string;
  receiptNumber?: string;
  notes?: string;
  merchant?: string;
  receiptBlobKey?: string;
  receiptFileName?: string;
  receiptMimeType?: string;
  label?: string;
}

export interface SubmitSplitFuelFillPayload {
  fillGroupId: string;
  cashTransaction: Record<string, any>;
  cardFuelEntry: Record<string, any>;
  odometerBlobKey?: string;
  receiptBlobKey?: string;
  odometerFileName?: string;
  receiptFileName?: string;
  odometerMimeType?: string;
  receiptMimeType?: string;
  label?: string;
}

export type OfflineAction =
  | {
      id: string;
      type: 'SUBMIT_TRIP';
      payload: SubmitTripPayload;
      timestamp: number;
      retryCount: number;
      lastError?: string;
    }
  | {
      id: string;
      type: 'SUBMIT_FUEL_EXPENSE';
      payload: SubmitFuelExpensePayload;
      timestamp: number;
      retryCount: number;
      lastError?: string;
    }
  | {
      id: string;
      type: 'SUBMIT_GAS_CARD_ANCHOR';
      payload: SubmitGasCardAnchorPayload;
      timestamp: number;
      retryCount: number;
      lastError?: string;
    }
  | {
      id: string;
      type: 'SUBMIT_SPLIT_FUEL_FILL';
      payload: SubmitSplitFuelFillPayload;
      timestamp: number;
      retryCount: number;
      lastError?: string;
    }
  | {
      id: string;
      type: 'SUBMIT_CASH_TOLL';
      payload: SubmitCashTollPayload;
      timestamp: number;
      retryCount: number;
      lastError?: string;
    }
  | {
      id: string;
      type: 'SUBMIT_DRIVER_REPORT_UPDATE';
      payload: SubmitDriverReportUpdatePayload;
      timestamp: number;
      retryCount: number;
      lastError?: string;
    };
