export type ExpenseFrequency = 'daily' | 'weekly' | 'monthly' | 'annually';

export type FixedExpenseCategory = 
    | 'Security' 
    | 'Insurance' 
    | 'Maintenance' 
    | 'Software' 
    | 'Lease' 
    | 'Permits'
    | 'Equipment'
    | 'Other';

export interface FixedExpenseConfig {
    id: string;
    vehicleId: string;
    name: string;
    category: FixedExpenseCategory | string; // Allow custom categories while suggesting defaults
    amount: number;
    frequency: ExpenseFrequency;
    startDate: string; // ISO Date string (YYYY-MM-DD)
    endDate?: string;  // Optional ISO Date string
    isActive: boolean;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

// Helper for UI dropdowns
export const EXPENSE_FREQUENCIES: { value: ExpenseFrequency; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'annually', label: 'Annually' },
];

export const EXPENSE_CATEGORIES: { value: FixedExpenseCategory; label: string }[] = [
    { value: 'Insurance', label: 'Insurance' },
    { value: 'Security', label: 'Security (Tracker/GPS)' },
    { value: 'Lease', label: 'Vehicle Lease/Financing' },
    { value: 'Maintenance', label: 'Maintenance Contract' },
    { value: 'Software', label: 'Software Subscription' },
    { value: 'Permits', label: 'Permits & Licenses' },
    { value: 'Equipment', label: 'Equipment Rental' },
    { value: 'Other', label: 'Other' },
];
