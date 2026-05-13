export interface FuelEntry {
  id: string;
  driverId?: string;
  vehicleId?: string;
  date: string;
  amount: number;
  gallons?: number;
  pricePerGallon?: number;
  stationName?: string;
  stationId?: string;
  odometer?: number;
  type?: string;
  status?: string;
  notes?: string;
  receiptUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}
