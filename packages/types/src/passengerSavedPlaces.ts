export type PassengerSavedPlaceIcon =
  | 'home'
  | 'work'
  | 'saved'
  | 'star'
  | 'gym'
  | 'school'
  | 'coffee'
  | 'hospital'
  | 'location';

export interface PassengerSavedPlaceRow {
  id: string;
  owner_user_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  icon: PassengerSavedPlaceIcon;
  created_at: string;
  updated_at: string;
}

export interface PassengerSavedPlacesListResponse {
  places: PassengerSavedPlaceRow[];
}

export interface CreatePassengerSavedPlaceBody {
  name: string;
  address: string;
  lat: number;
  lng: number;
  icon?: PassengerSavedPlaceIcon;
}

export interface UpdatePassengerSavedPlaceBody {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  icon?: PassengerSavedPlaceIcon;
}
