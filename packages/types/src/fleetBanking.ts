/**
 * Fleet bank confirmation / statement shapes (KV fleet_bank_* → fleet.bank_*).
 */
export interface FleetBankConfirmation {
  id: string;
  organizationId?: string;
  driverId?: string;
  weekStartYmd?: string;
  status?: "pending" | "confirmed" | "disputed" | string;
  amountReceived?: number;
  notes?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  [key: string]: unknown;
}

export interface FleetBankStatement {
  id: string;
  organizationId?: string;
  fileName?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  lineCount?: number;
  [key: string]: unknown;
}
