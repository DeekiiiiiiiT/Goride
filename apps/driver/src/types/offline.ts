import { TripSession } from './tripSession';

export type OfflineActionType = 'SUBMIT_TRIP';

export interface SubmitTripPayload {
  tripData: Partial<TripSession>; 
  formData: {
    category: string;
    purpose: string;
    notes: string;
    projectId?: string;
    [key: string]: any;
  };
  rawRoute: any[]; // Raw GPS points
  calculatedDistance: number; // Distance in meters
}

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: SubmitTripPayload;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}
