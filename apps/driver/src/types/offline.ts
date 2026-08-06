import type { TripSession } from './tripSession';

export type OfflineActionType = 'SUBMIT_TRIP' | 'SUBMIT_FUEL_EXPENSE' | 'SUBMIT_GAS_CARD_ANCHOR';

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
    };
