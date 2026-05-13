import { Trip } from './data';

// ... (existing Trip interface and others)

export type TransactionType = 'Revenue' | 'Expense' | 'Payout' | 'Transfer' | 'Adjustment';

export type TransactionCategory = 
  | 'Fare Earnings' | 'Tips' | 'Surge Pricing' | 'Bonuses' | 'Other Income' // Revenue
  | 'Fuel' | 'Maintenance' | 'Insurance' | 'Registration' | 'Tolls' | 'Driver Payouts' | 'Bank Charges' | 'Software' | 'Marketing' | 'Office' | 'Other Expense' // Expenses
  | 'Vehicle Payment' | 'Supplier Payment' | 'Tax Payment'; // Payouts

export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Digital Wallet' | 'Credit Card';

export type TransactionStatus = 'Completed' | 'Pending' | 'Failed' | 'Reconciled' | 'Void';

export interface FinancialTransaction {
  id: string; // Transaction UUID
  date: string; // ISO Date YYYY-MM-DD
  time?: string; // HH:mm:ss
  driverId?: string; // Optional if not driver related
  driverName?: string;
  vehicleId?: string; // Optional if not vehicle related
  vehiclePlate?: string;
  tripId?: string;
  
  type: TransactionType;
  category: string; // Using string to allow flexibility but typed above for reference
  description: string;
  
  amount: number; // Positive for inflow, Negative for outflow (or use distinct In/Out fields?)
  // Convention: Amount is absolute value usually, but let's stick to: Revenue (+), Expense (-).
  // Actually, standard accounting: Credit/Debit. 
  // Let's use signed amount for simplicity: + for money in, - for money out.
  
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  
  referenceNumber?: string;
  receiptUrl?: string;
  
  taxAmount?: number;
  netAmount?: number; // Amount - Tax
  
  balanceAfter?: number; // Running balance
  bankAccount?: string; // e.g., "Business Checking ****1234"
  processedDate?: string;
  isReconciled: boolean;
  
  notes?: string;
  
  // Metadata for filtering
  week?: string; // YYYY-Www
  month?: string; // YYYY-MM
}

export interface BankReconciliation {
  id: string;
  statementDate: string;
  transactionDate: string;
  description: string;
  bankAmount: number;
  systemAmount?: number;
  matchStatus: 'Matched' | 'Unmatched' | 'Partial';
  difference: number;
  reconciledBy?: string;
  reconciledDate?: string;
  notes?: string;
}

export interface CashFlowRecord {
  date: string; // YYYY-MM-DD
  openingBalance: number;
  cashIn: number;
  cashOut: number;
  closingBalance: number;
  
  breakdown: {
    cashOnHand: number;
    bankBalance: number;
  };
  
  dailyVariance?: number;
  weekAverage?: number;
  notes?: string;
}

// ... (keep existing interfaces like Trip, etc. if needed)
// I will rewrite the file to include these and keep compatible existing ones.
