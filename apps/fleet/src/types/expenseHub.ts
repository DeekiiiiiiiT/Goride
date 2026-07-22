/**
 * Expense Hub domain — additive types for Business Finance.
 * Does not replace FixedExpenseConfig; assignments project into that shape.
 */

import type { CanonicalExpenseFrequency, ExpenseCategory } from './expenses.ts';

export type ExpenseDocumentStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'partially_paid'
  | 'paid'
  | 'voided';

export type ExpenseRuleStatus = 'active' | 'paused' | 'ended';

export type ExpenseAllocation = {
  vehicleId: string;
  /** Absolute amount in document currency; shares must sum to document net. */
  amount: number;
  sharePercent?: number;
};

export type ExpenseVendor = {
  id: string;
  organizationId?: string;
  name: string;
  categoryDefault?: ExpenseCategory;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpensePermitType = 'fitness' | 'registration' | 'other';

export type ExpenseRuleVehicleOverride = {
  vehicleId: string;
  amount?: number;
  validityYears?: 1 | 3 | 5;
  startDateOverride?: string;
  startTimeOverride?: string;
  endDateOverride?: string;
  endTimeOverride?: string;
};

export type ExpenseRuleGroup = {
  id: string;
  organizationId?: string;
  name: string;
  category: ExpenseCategory;
  /** When category is Permits — Fitness uses Jamaica matrix bucketing. */
  permitType?: ExpensePermitType;
  vendorId?: string;
  vendorName?: string;
  /** Template amount; assignments may override. */
  amount: number;
  currency: string;
  frequency: CanonicalExpenseFrequency;
  startDate: string;
  /** Local effective time (HH:mm), interpreted in `timeZone`. */
  startTime?: string;
  endDate?: string;
  /** Local expiration time (HH:mm), interpreted in `timeZone`. */
  endTime?: string;
  /** IANA fleet timezone used for coverage boundaries. */
  timeZone?: string;
  autoRenew?: boolean;
  description?: string;
  status: ExpenseRuleStatus;
  /** Inactive until Fixed Assets module. */
  assetId?: string;
  accountCode?: string;
  requiresApproval?: boolean;
  version: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseRuleAssignment = {
  id: string;
  organizationId?: string;
  ruleGroupId: string;
  vehicleId: string;
  /** Stable link to legacy FixedExpenseConfig id (same as assignment id by default). */
  fixedExpenseConfigId: string;
  amountOverride?: number;
  /** Jamaica fitness certificate length when permitType is fitness. */
  validityYears?: 1 | 3 | 5;
  startDateOverride?: string;
  startTimeOverride?: string;
  endDateOverride?: string;
  endTimeOverride?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseDocument = {
  id: string;
  organizationId?: string;
  status: ExpenseDocumentStatus;
  category: ExpenseCategory | string;
  description: string;
  vendorId?: string;
  vendorName?: string;
  incurredDate: string;
  dueDate?: string;
  currency: string;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  allocations: ExpenseAllocation[];
  paymentMethod?: string;
  /** When true, approve+pay in one command. */
  paidNow?: boolean;
  evidenceUrls?: string[];
  notes?: string;
  rejectionReason?: string;
  voidReason?: string;
  /** Adapter for pre-Hub transactions — never re-posted. */
  legacyTransactionId?: string;
  assetId?: string;
  accountCode?: string;
  version: number;
  createdBy?: string;
  submittedBy?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  postedAt?: string;
  voidedAt?: string;
};

export type ExpensePayment = {
  id: string;
  organizationId?: string;
  documentId: string;
  amount: number;
  currency: string;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
};

export type ExpenseAuditEvent = {
  id: string;
  organizationId?: string;
  entityType: 'document' | 'rule_group' | 'assignment' | 'payment' | 'vendor';
  entityId: string;
  action: string;
  actorId?: string;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  at: string;
};

export type ExpenseHubSummary = {
  periodStartYmd: string;
  periodEndYmd: string;
  postedExpenseTotal: number;
  pendingApprovalCount: number;
  overdueUnpaidCount: number;
  activeRuleCount: number;
  paidThisPeriod: number;
  /** Operational cards — Fuel/Toll from existing BF bundle, not Hub writers. */
  operationalFuel: number;
  operationalTolls: number;
};

export type ExpenseBulkPreview = {
  includedVehicleIds: string[];
  excludedVehicleIds: string[];
  projectedAnnualTotal: number;
  estimatedOccurrenceCount: number;
  overrides: ExpenseRuleVehicleOverride[];
};

export type JournalLine = {
  account: 'expense' | 'accounts_payable' | 'cash';
  debit: number;
  credit: number;
  vehicleId?: string;
  category?: string;
  memo?: string;
};

export type ExpenseJournalEntry = {
  id: string;
  organizationId?: string;
  documentId?: string;
  paymentId?: string;
  kind: 'accrual' | 'payment' | 'void';
  date: string;
  lines: JournalLine[];
  idempotencyKey: string;
  createdAt: string;
};
