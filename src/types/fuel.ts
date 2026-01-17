export type FuelType = 'Gasoline_87' | 'Gasoline_91' | 'Gasoline_93' | 'Diesel' | 'Electric' | 'Hybrid';

export interface FuelCard {
  id: string;
  cardNumber: string; // Last 4 or full visible number
  provider: string; // e.g., 'Shell', 'FleetCor', 'Wex'
  status: 'Active' | 'Inactive' | 'Lost';
  assignedVehicleId?: string;
  assignedDriverId?: string;
  expiryDate?: string;
  notes?: string;
}

export interface FuelEntry {
  id: string;
  date: string; // ISO Date
  cardId?: string;
  vehicleId?: string;
  driverId?: string;
  
  amount: number; // Total Cost
  liters?: number; // Volume
  pricePerLiter?: number;
  
  odometer?: number;
  location?: string; // Station Name/Address
  stationAddress?: string; // Specific location/address
  
  type: 'Card_Transaction' | 'Manual_Entry' | 'Reimbursement';
  isFlagged?: boolean; // If capacity exceeded or outlier
  
  // Link to financial transaction
  transactionId?: string;
}

export interface MileageAdjustment {
  id: string;
  date: string;
  vehicleId: string;
  driverId: string;
  type: 'Company_Misc' | 'Personal' | 'Maintenance';
  distance: number; // in km/miles
  reason: string;
  approvedBy?: string;
}

export interface WeeklyFuelReport {
  id: string; // composite: vehicleId_weekStart
  weekStart: string; // ISO Date (Monday)
  weekEnd: string; // ISO Date (Sunday)
  vehicleId: string;
  driverId: string;

  // 1. The Truth (Financial)
  totalGasCardCost: number;
  
  // 2. The Operation (Trips)
  totalTripDistance: number;
  operatingFuelCost: number; // Calculated
  
  // 3. Known Non-Trip (Adjustments)
  companyMiscDistance: number;
  companyMiscCost: number;
  
  personalDistance: number;
  personalCost: number;
  
  // 4. The Leakage (Remainder)
  fuelMiscCost: number; // (GasCard - Operating - Misc - Personal)
  
  // 5. The Split
  companyShare: number;
  driverShare: number;
  
  status: 'Draft' | 'Finalized';
  finalizedAt?: string;
}

export type DisputeStatus = 'Open' | 'Resolved' | 'Rejected';

export type DisputeReason = 
  | 'Trip_Log_Error' 
  | 'Fuel_Transaction_Error' 
  | 'Mechanical_Issue' 
  | 'Theft_Suspected' 
  | 'Other';

export interface FuelDispute {
  id: string;
  weekStart: string; // ISO Date (Monday)
  weekEnd?: string; // ISO Date (Sunday) - Optional for backward compatibility
  vehicleId: string;
  driverId: string;
  createdAt: string;
  
  reason: DisputeReason;
  description: string;
  
  status: DisputeStatus;
  adminResponse?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export type FuelCoverageType = 'Percentage' | 'Fixed_Amount' | 'Full';

export interface FuelRule {
  id: string;
  category: 'Fuel' | 'Maintenance' | 'Tolls';
  coverageType: FuelCoverageType;
  coverageValue: number; // e.g., 50 for 50%, or 100 for $100
  conditions?: {
    maxAmount?: number;
    requiresReceipt?: boolean;
  };
}

export interface FuelScenario {
  id: string;
  name: string; // e.g. "Standard Fleet", "Owner Operator", "Rental"
  description?: string;
  rules: FuelRule[];
  isDefault?: boolean;
}
