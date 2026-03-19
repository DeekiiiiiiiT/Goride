// =============================================================================
// Toll Log View Type
// =============================================================================
// A display-ready wrapper around FinancialTransaction for the Toll Logs page.
// Enriched with resolved vehicle/driver/plaza names and toll-specific fields.
// =============================================================================

import { FinancialTransaction } from './data';
import { CsvColumn } from '../utils/csv-helper';

export interface TollLogEntry {
  // --- Identity ---
  id: string;                          // Same as FinancialTransaction.id

  // --- Core fields (from transaction) ---
  date: string;                        // ISO date string
  time: string | null;                 // HH:mm:ss or null
  amount: number;                      // Signed: negative for usage, positive for top-up
  absAmount: number;                   // Always positive — for display/sorting

  // --- Type classification ---
  isUsage: boolean;                    // true = toll passage (debit), false = top-up (credit)
  typeLabel: 'Usage' | 'Top-up';      // Human-readable label

  // --- Resolved display names ---
  vehicleId: string | null;
  vehicleName: string;                 // Resolved plate / name, or "Unknown Vehicle"
  driverId: string | null;
  driverDisplayName: string;           // Resolved driver name, or "Unassigned"

  // --- Plaza / Location ---
  plazaId: string | null;             // Matched TollPlaza.id, or null
  plazaName: string | null;           // Matched TollPlaza.name, or null
  highway: string | null;             // From matched plaza
  direction: string | null;           // From matched plaza
  parish: string | null;              // From matched plaza
  locationRaw: string | null;         // Original vendor/description (fallback)

  // --- Payment ---
  paymentMethod: string;              // Original value from transaction
  paymentMethodDisplay: string;       // Human-readable: "E-Tag", "Cash", "Card", etc.

  // --- Tag ---
  tollTagId: string | null;           // Visible tag number (e.g. "T-0042")
  tollTagUuid: string | null;         // Internal tag UUID

  // --- Status ---
  status: string;                     // Original status value
  statusDisplay: string;              // Human-readable
  isReconciled: boolean;

  // --- Reference / Audit ---
  referenceNumber: string | null;
  description: string;
  tripId: string | null;
  batchId: string | null;
  notes: string | null;

  // --- Original record ---
  _raw: FinancialTransaction;         // Full original for detail panel

  // --- Linked trip (from server-side /toll-logs endpoint) ---
  linkedTrip?: {
    id: string;
    date: string;
    platform: string;
    pickupLocation: string;
    dropoffLocation: string;
    requestTime: string | null;
    dropoffTime: string | null;
    amount: number;
    tollCharges: number;
    driverId: string | null;
    driverName: string | null;
    vehicleId: string | null;
    duration: string | null;
    distance: string | null;
    serviceType: string | null;
  } | null;
}

// --- Filter state (used by Phase 5 Filters component) ---
export interface TollLogFiltersState {
  search: string;
  dateRange: { from: Date; to: Date } | undefined;
  vehicleId: string;   // 'all' or specific ID
  driverId: string;    // 'all' or specific ID
  plazaId: string;     // 'all' or specific ID
  highway: string;     // 'all' or specific highway name
  paymentMethod: string; // 'all' | 'Cash' | 'Tag' | 'Card'
  status: string;      // 'all' | 'Completed' | 'Pending' | 'Flagged' | 'Reconciled' | 'Void'
  type: string;        // 'all' | 'usage' | 'topup'
}

export const DEFAULT_TOLL_LOG_FILTERS: TollLogFiltersState = {
  search: '',
  dateRange: undefined,
  vehicleId: 'all',
  driverId: 'all',
  plazaId: 'all',
  highway: 'all',
  paymentMethod: 'all',
  status: 'all',
  type: 'all',
};

// --- CSV export column schema ---
export const TOLL_LOG_CSV_COLUMNS: CsvColumn<TollLogEntry>[] = [
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time', formatter: (v) => v || '' },
  { key: 'vehicleName', label: 'Vehicle' },
  { key: 'driverDisplayName', label: 'Driver' },
  { key: 'plazaName', label: 'Plaza', formatter: (v) => v || '' },
  { key: 'highway', label: 'Highway', formatter: (v) => v || '' },
  { key: 'direction', label: 'Direction', formatter: (v) => v || '' },
  { key: 'typeLabel', label: 'Type' },
  { key: 'paymentMethodDisplay', label: 'Payment Method' },
  { key: 'amount', label: 'Amount', formatter: (v) => String(v) },
  { key: 'absAmount', label: 'Abs Amount', formatter: (v) => String(v) },
  { key: 'statusDisplay', label: 'Status' },
  { key: 'referenceNumber', label: 'Reference #', formatter: (v) => v || '' },
  { key: 'tollTagId', label: 'Tag ID', formatter: (v) => v || '' },
  { key: 'description', label: 'Description' },
  { key: 'isReconciled', label: 'Reconciled', formatter: (v) => v ? 'Yes' : 'No' },
  { key: 'tripId', label: 'Trip ID', formatter: (v) => v || '' },
  { key: 'batchId', label: 'Batch ID', formatter: (v) => v || '' },
];