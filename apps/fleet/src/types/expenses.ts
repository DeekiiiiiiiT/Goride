// Fixed (recurring) vehicle expense config + canonical normalizers.
// The UI (AddFixedExpenseDialog / FixedExpensesManager) historically emitted a
// wider, differently-cased vocabulary than the original type declared. Rather
// than break the live vehicle-expense entry UI, this file is the SUPERSET that
// every consumer compiles against, plus normalizers that collapse legacy
// synonyms/casing into ONE canonical vocabulary for the ledger bridge (Phase 2).

/** Canonical recurring cadence (lowercase, snake). Ledger recognition uses this. */
export type CanonicalExpenseFrequency =
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'quarterly'
    | 'annually'
    | 'one_time';

/**
 * Accepted frequency inputs. Superset of canonical + legacy UI casings so
 * existing components and already-saved KV rows keep compiling/working.
 */
export type ExpenseFrequency =
    | CanonicalExpenseFrequency
    | 'Daily'
    | 'Weekly'
    | 'Monthly'
    | 'Quarterly'
    | 'Yearly'
    | 'Annually'
    | 'One-time'
    | 'one-time';

/** Canonical expense categories for fleet overhead. */
export type FixedExpenseCategory =
    | 'Security'
    | 'Insurance'
    | 'Maintenance'
    | 'Software'
    | 'Lease'
    | 'Permits'
    | 'Equipment'
    | 'Parking'
    | 'Other';

/**
 * Accepted category inputs. Superset including legacy UI synonyms
 * (Tracking → Security, License → Permits) so nothing breaks; the ledger
 * bridge normalizes these before posting.
 */
export type ExpenseCategory =
    | FixedExpenseCategory
    | 'Tracking'
    | 'License'
    | string; // custom free-text categories are allowed

export interface FixedExpenseConfig {
    /** Optional on create (server assigns); present after save. */
    id?: string;
    vehicleId: string;
    name: string;
    category: ExpenseCategory;
    amount: number;
    /** ISO 4217; defaults to JMD in the entry UI. */
    currency?: string;
    frequency: ExpenseFrequency;
    startDate: string; // ISO Date string (YYYY-MM-DD)
    endDate?: string;  // Optional ISO Date string
    /** Provider / counterparty (e.g. ICWI, KingAlarm). */
    vendor?: string;
    /** Free-text notes shown in the entry UI. */
    description?: string;
    /** Legacy field name kept for back-compat with older saved rows. */
    notes?: string;
    /** When true, projects indefinitely with no end date. */
    autoRenew?: boolean;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

// Helper for UI dropdowns (canonical values).
export const EXPENSE_FREQUENCIES: { value: CanonicalExpenseFrequency; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annually', label: 'Annually' },
    { value: 'one_time', label: 'One-time' },
];

export const EXPENSE_CATEGORIES: { value: FixedExpenseCategory; label: string }[] = [
    { value: 'Insurance', label: 'Insurance' },
    { value: 'Security', label: 'Security (Tracker/GPS)' },
    { value: 'Lease', label: 'Vehicle Lease/Financing' },
    { value: 'Maintenance', label: 'Maintenance Contract' },
    { value: 'Software', label: 'Software Subscription' },
    { value: 'Permits', label: 'Permits & Licenses' },
    { value: 'Equipment', label: 'Equipment Rental' },
    { value: 'Parking', label: 'Parking' },
    { value: 'Other', label: 'Other' },
];

/** Collapse any accepted frequency input into the canonical cadence. */
export function normalizeExpenseFrequency(input: string | null | undefined): CanonicalExpenseFrequency {
    const f = String(input ?? '').trim().toLowerCase();
    switch (f) {
        case 'daily':
            return 'daily';
        case 'weekly':
            return 'weekly';
        case 'monthly':
            return 'monthly';
        case 'quarterly':
            return 'quarterly';
        case 'yearly':
        case 'annually':
            return 'annually';
        case 'one-time':
        case 'one_time':
        case 'onetime':
            return 'one_time';
        default:
            return 'monthly';
    }
}

/** Collapse legacy category synonyms into the canonical set (keeps unknown custom strings as-is). */
export function normalizeExpenseCategory(input: string | null | undefined): FixedExpenseCategory | string {
    const c = String(input ?? '').trim();
    switch (c.toLowerCase()) {
        case 'tracking':
        case 'security':
            return 'Security';
        case 'license':
        case 'permits':
        case 'registration':
            return 'Permits';
        case 'insurance':
            return 'Insurance';
        case 'lease':
        case 'financing':
            return 'Lease';
        case 'maintenance':
            return 'Maintenance';
        case 'software':
            return 'Software';
        case 'equipment':
            return 'Equipment';
        case 'parking':
            return 'Parking';
        case 'other':
            return 'Other';
        default:
            return c || 'Other';
    }
}
