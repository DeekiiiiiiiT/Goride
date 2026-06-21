export interface LocationValue {
  lat: number;
  lng: number;
  streetAddress: string;
  city: string;
  postalCode: string;
  formattedAddress: string;
  placeId?: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  streetAddress: string;
  city: string;
  parish?: string;
  postalCode: string;
}
