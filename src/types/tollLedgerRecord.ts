// ════════════════════════════════════════════════════════════════════════════
// Toll Ledger Record — Canonical Schema
// ════════════════════════════════════════════════════════════════════════════
// This is the single source of truth for toll data.
// All toll transactions are stored as `toll_ledger:{id}` in KV.
// ════════════════════════════════════════════════════════════════════════════

import type { FinancialTransaction } from './data';

// ── Enums ────────────────────────────────────────────────────────────────────

/** Type of toll transaction */
export type TollType =
  | 'usage'           // Toll passage (debit)
  | 'top_up'          // Adding balance to tag
  | 'refund'          // Refund from toll provider
  | 'adjustment'      // Manual balance adjustment
  | 'balance_transfer'; // Transfer between tags/accounts

/** How the toll was paid */
export type TollPaymentMethod =
  | 'tag_balance'     // Deducted from toll tag balance
  | 'cash'            // Paid cash at plaza
  | 'card'            // Paid with card at plaza
  | 'fleet_account';  // Billed to fleet account

/** Current status of the toll record */
export type TollStatus =
  | 'pending'         // Awaiting review/action
  | 'approved'        // Cash claim approved
  | 'rejected'        // Cash claim rejected
  | 'reconciled'      // Matched to a trip
  | 'resolved'        // Final resolution applied
  | 'disputed';       // Under dispute

/** How the toll was resolved (for personal/business classification) */
export type TollResolution =
  | 'personal'        // Driver responsibility
  | 'business'        // Company expense
  | 'write_off'       // Written off as loss
  | 'refunded';       // Refunded by provider

/** Actions tracked in audit trail */
export type TollAuditAction =
  | 'created'
  | 'updated'
  | 'reconciled'
  | 'unreconciled'
  | 'approved'
  | 'rejected'
  | 'resolved'
  | 'imported'
  | 'edited'
  | 'deleted';

// ── Audit Trail Entry ────────────────────────────────────────────────────────

export interface TollAuditEntry {
  action: TollAuditAction;
  timestamp: string;           // ISO timestamp
  userId?: string;             // Who performed the action
  userName?: string;           // Display name
  changes?: Record<string, { from: unknown; to: unknown }>; // Field changes
  metadata?: Record<string, unknown>; // Additional context
}

// ── Main Record ──────────────────────────────────────────────────────────────

export interface TollLedgerRecord {
  // ─── Identity ───
  id: string;                  // UUID (same as original transaction ID for migrated records)
  createdAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp

  // ─── Vehicle ───
  vehicleId: string | null;
  vehiclePlate: string | null;

  // ─── Driver ───
  driverId: string | null;
  driverName: string | null;

  // ─── Toll Tag ───
  tollTagId: string | null;    // Internal tag UUID
  tagNumber: string | null;    // Physical tag number (e.g., "T-0042")

  // ─── Location ───
  plaza: string | null;        // Toll plaza name
  highway: string | null;      // Highway identifier
  location: string | null;     // Raw location/vendor string

  // ─── Transaction Details ───
  date: string;                // ISO date YYYY-MM-DD
  time: string | null;         // HH:mm:ss
  type: TollType;
  amount: number;              // Signed: negative for usage, positive for top-up/refund
  paymentMethod: TollPaymentMethod;

  // ─── Status ───
  status: TollStatus;
  resolution: TollResolution | null;
  isReconciled: boolean;

  // ─── Trip Matching ───
  tripId: string | null;
  matchConfidence: number | null;  // 0-100 score
  matchedAt: string | null;        // ISO timestamp
  matchedBy: string | null;        // User who reconciled

  // ─── Import/Batch ───
  batchId: string | null;
  batchName: string | null;
  importedAt: string | null;
  sourceFile: string | null;

  // ─── Evidence ───
  receiptUrl: string | null;
  referenceNumber: string | null;
  description: string | null;
  notes: string | null;

  // ─── Audit Trail ───
  auditTrail: TollAuditEntry[];

  // ─── Flexible Metadata ───
  metadata: Record<string, unknown>;

  // ─── Legacy Reference (for migration tracking) ───
  _legacyTransactionId?: string;   // Original transaction:* ID if migrated
}

// ── Query Filters ────────────────────────────────────────────────────────────

export interface TollLedgerFilters {
  vehicleId?: string;
  driverId?: string;
  tollTagId?: string;
  plaza?: string;
  highway?: string;
  type?: TollType;
  status?: TollStatus;
  resolution?: TollResolution;
  isReconciled?: boolean;
  dateFrom?: string;           // ISO date
  dateTo?: string;             // ISO date
  batchId?: string;
  search?: string;             // Free text search
}

// ── Conversion Utilities ─────────────────────────────────────────────────────

/**
 * Converts an existing FinancialTransaction (toll category) to TollLedgerRecord.
 * Used during migration/backfill.
 */
export function transactionToTollLedger(tx: FinancialTransaction): TollLedgerRecord {
  const now = new Date().toISOString();

  // Determine toll type from category/amount
  const category = (tx.category || '').toLowerCase();
  const isTopUp = category.includes('top') || category.includes('credit') || tx.amount > 0;
  const isRefund = category.includes('refund');
  const type: TollType = isRefund ? 'refund' : isTopUp ? 'top_up' : 'usage';

  // Determine payment method
  const pm = (tx.paymentMethod || '').toLowerCase();
  let paymentMethod: TollPaymentMethod = 'tag_balance';
  if (pm.includes('cash')) paymentMethod = 'cash';
  else if (pm.includes('card')) paymentMethod = 'card';
  else if (pm.includes('fleet') || pm.includes('account')) paymentMethod = 'fleet_account';

  // Determine status
  let status: TollStatus = 'pending';
  const txStatus = (tx.status || '').toLowerCase();
  if (txStatus === 'approved') status = 'approved';
  else if (txStatus === 'rejected') status = 'rejected';
  else if (tx.isReconciled) status = 'reconciled';
  else if (txStatus === 'completed' || txStatus === 'resolved') status = 'resolved';

  // Extract resolution from metadata if present
  let resolution: TollResolution | null = null;
  const metaResolution = tx.metadata?.resolution as string | undefined;
  if (metaResolution) {
    const r = metaResolution.toLowerCase();
    if (r === 'personal') resolution = 'personal';
    else if (r === 'business') resolution = 'business';
    else if (r.includes('write')) resolution = 'write_off';
    else if (r.includes('refund')) resolution = 'refunded';
  }

  return {
    id: tx.id,
    createdAt: tx.metadata?.createdAt as string || now,
    updatedAt: now,

    vehicleId: tx.vehicleId || null,
    vehiclePlate: tx.vehiclePlate || null,

    driverId: tx.driverId || null,
    driverName: tx.driverName || null,

    tollTagId: tx.metadata?.tollTagUuid as string || tx.metadata?.tollTagId as string || null,
    tagNumber: tx.metadata?.tagNumber as string || null,

    plaza: tx.vendor || tx.metadata?.tollPlaza as string || null,
    highway: tx.metadata?.highway as string || null,
    location: tx.vendor || tx.description || null,

    date: tx.date,
    time: tx.time || null,
    type,
    amount: tx.amount,
    paymentMethod,

    status,
    resolution,
    isReconciled: tx.isReconciled || false,

    tripId: tx.tripId || null,
    matchConfidence: tx.metadata?.matchConfidence as number || null,
    matchedAt: tx.metadata?.reconciledAt as string || null,
    matchedBy: tx.metadata?.reconciledBy as string || null,

    batchId: tx.batchId || null,
    batchName: tx.batchName || null,
    importedAt: tx.metadata?.importedAt as string || null,
    sourceFile: tx.metadata?.sourceFile as string || null,

    receiptUrl: tx.receiptUrl || null,
    referenceNumber: tx.referenceNumber || null,
    description: tx.description || null,
    notes: tx.notes || null,

    auditTrail: [{
      action: 'imported',
      timestamp: now,
      metadata: { source: 'migration', originalCategory: tx.category },
    }],

    metadata: tx.metadata || {},

    _legacyTransactionId: tx.id,
  };
}

/**
 * Converts a TollLedgerRecord back to FinancialTransaction format.
 * Used for backward compatibility with existing UI components.
 */
export function tollLedgerToTransaction(toll: TollLedgerRecord): FinancialTransaction {
  // Map toll type to category
  let category: string;
  switch (toll.type) {
    case 'top_up':
      category = 'Toll Top-up';
      break;
    case 'refund':
      category = 'Toll Refund';
      break;
    case 'adjustment':
      category = 'Toll Adjustment';
      break;
    default:
      category = 'Toll Usage';
  }

  // Map payment method
  let paymentMethod: string;
  switch (toll.paymentMethod) {
    case 'cash':
      paymentMethod = 'Cash';
      break;
    case 'card':
      paymentMethod = 'Card';
      break;
    case 'fleet_account':
      paymentMethod = 'Fleet Account';
      break;
    default:
      paymentMethod = 'Tag Balance';
  }

  // Map status
  let status: string;
  switch (toll.status) {
    case 'approved':
      status = 'Approved';
      break;
    case 'rejected':
      status = 'Rejected';
      break;
    case 'reconciled':
      status = 'Completed';
      break;
    case 'resolved':
      status = 'Resolved';
      break;
    case 'disputed':
      status = 'Disputed';
      break;
    default:
      status = 'Pending';
  }

  return {
    id: toll.id,
    date: toll.date,
    time: toll.time || undefined,
    driverId: toll.driverId || undefined,
    driverName: toll.driverName || undefined,
    vehicleId: toll.vehicleId || undefined,
    vehiclePlate: toll.vehiclePlate || undefined,
    tripId: toll.tripId || undefined,

    type: 'Expense',
    category,
    description: toll.description || toll.plaza || 'Toll Transaction',

    amount: toll.amount,
    paymentMethod: paymentMethod as any,
    status: status as any,

    referenceNumber: toll.referenceNumber || undefined,
    receiptUrl: toll.receiptUrl || undefined,
    isReconciled: toll.isReconciled,

    vendor: toll.plaza || toll.location || undefined,
    notes: toll.notes || undefined,

    batchId: toll.batchId || undefined,
    batchName: toll.batchName || undefined,

    metadata: {
      ...toll.metadata,
      tollTagId: toll.tollTagId,
      tagNumber: toll.tagNumber,
      highway: toll.highway,
      tollPlaza: toll.plaza,
      resolution: toll.resolution,
      matchConfidence: toll.matchConfidence,
      reconciledAt: toll.matchedAt,
      reconciledBy: toll.matchedBy,
      tollLedgerId: toll.id, // Reference back to toll ledger
    },
  };
}

/**
 * Validates a raw object as a TollLedgerRecord.
 * Returns the validated record or throws an error.
 */
export function validateTollLedgerRecord(raw: unknown): TollLedgerRecord {
  if (!raw || typeof raw !== 'object') {
    throw new Error('TollLedgerRecord must be an object');
  }

  const record = raw as Record<string, unknown>;

  // Required fields
  if (!record.id || typeof record.id !== 'string') {
    throw new Error('TollLedgerRecord.id is required and must be a string');
  }
  if (!record.date || typeof record.date !== 'string') {
    throw new Error('TollLedgerRecord.date is required and must be a string');
  }
  if (typeof record.amount !== 'number') {
    throw new Error('TollLedgerRecord.amount is required and must be a number');
  }

  // Validate enums
  const validTypes: TollType[] = ['usage', 'top_up', 'refund', 'adjustment', 'balance_transfer'];
  if (record.type && !validTypes.includes(record.type as TollType)) {
    throw new Error(`TollLedgerRecord.type must be one of: ${validTypes.join(', ')}`);
  }

  const validPaymentMethods: TollPaymentMethod[] = ['tag_balance', 'cash', 'card', 'fleet_account'];
  if (record.paymentMethod && !validPaymentMethods.includes(record.paymentMethod as TollPaymentMethod)) {
    throw new Error(`TollLedgerRecord.paymentMethod must be one of: ${validPaymentMethods.join(', ')}`);
  }

  const validStatuses: TollStatus[] = ['pending', 'approved', 'rejected', 'reconciled', 'resolved', 'disputed'];
  if (record.status && !validStatuses.includes(record.status as TollStatus)) {
    throw new Error(`TollLedgerRecord.status must be one of: ${validStatuses.join(', ')}`);
  }

  // Return with defaults for optional fields
  const now = new Date().toISOString();
  return {
    id: record.id as string,
    createdAt: (record.createdAt as string) || now,
    updatedAt: (record.updatedAt as string) || now,

    vehicleId: (record.vehicleId as string) || null,
    vehiclePlate: (record.vehiclePlate as string) || null,

    driverId: (record.driverId as string) || null,
    driverName: (record.driverName as string) || null,

    tollTagId: (record.tollTagId as string) || null,
    tagNumber: (record.tagNumber as string) || null,

    plaza: (record.plaza as string) || null,
    highway: (record.highway as string) || null,
    location: (record.location as string) || null,

    date: record.date as string,
    time: (record.time as string) || null,
    type: (record.type as TollType) || 'usage',
    amount: record.amount as number,
    paymentMethod: (record.paymentMethod as TollPaymentMethod) || 'tag_balance',

    status: (record.status as TollStatus) || 'pending',
    resolution: (record.resolution as TollResolution) || null,
    isReconciled: Boolean(record.isReconciled),

    tripId: (record.tripId as string) || null,
    matchConfidence: (record.matchConfidence as number) || null,
    matchedAt: (record.matchedAt as string) || null,
    matchedBy: (record.matchedBy as string) || null,

    batchId: (record.batchId as string) || null,
    batchName: (record.batchName as string) || null,
    importedAt: (record.importedAt as string) || null,
    sourceFile: (record.sourceFile as string) || null,

    receiptUrl: (record.receiptUrl as string) || null,
    referenceNumber: (record.referenceNumber as string) || null,
    description: (record.description as string) || null,
    notes: (record.notes as string) || null,

    auditTrail: Array.isArray(record.auditTrail) ? record.auditTrail as TollAuditEntry[] : [],

    metadata: (record.metadata as Record<string, unknown>) || {},

    _legacyTransactionId: record._legacyTransactionId as string | undefined,
  };
}

/**
 * Creates an audit trail entry helper.
 */
export function createAuditEntry(
  action: TollAuditAction,
  userId?: string,
  userName?: string,
  changes?: Record<string, { from: unknown; to: unknown }>,
  metadata?: Record<string, unknown>
): TollAuditEntry {
  return {
    action,
    timestamp: new Date().toISOString(),
    userId,
    userName,
    changes,
    metadata,
  };
}

/**
 * Appends an audit entry to a toll ledger record.
 */
export function appendAuditTrail(
  record: TollLedgerRecord,
  action: TollAuditAction,
  userId?: string,
  userName?: string,
  changes?: Record<string, { from: unknown; to: unknown }>,
  metadata?: Record<string, unknown>
): TollLedgerRecord {
  return {
    ...record,
    updatedAt: new Date().toISOString(),
    auditTrail: [
      ...record.auditTrail,
      createAuditEntry(action, userId, userName, changes, metadata),
    ],
  };
}
