/** Toll crossing + quote metadata shared across apps. */

export interface TollCrossingDto {
  toll_plaza_id: string;
  toll_plaza_name: string;
  toll_amount_minor: number;
  currency?: string;
  crossed_at?: string;
  driver_lat?: number;
  driver_lng?: number;
}

export interface TollCrossingsResponse {
  ride_id: string;
  actual_tolls_minor: number;
  crossings: TollCrossingDto[];
}

export interface EstimatedTollPlazaDto {
  toll_plaza_id: string;
  toll_plaza_name: string;
  toll_amount_minor: number;
  currency: string;
}

export type GeofenceMatchStatus = 'confirmed' | 'none' | 'mismatch';

export type TollUiState = 'loading' | 'empty' | 'error' | 'data';
