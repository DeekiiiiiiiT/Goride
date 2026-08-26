// ════════════════════════════════════════════════════════════════════════════
// Toll Ledger Record — Canonical Schema (fleet)
// ════════════════════════════════════════════════════════════════════════════
// Pure types + validators. App-local FinancialTransaction conversions stay in
// apps/*/types/tollLedgerRecord.ts (need plaza integrity / app data types).
// ════════════════════════════════════════════════════════════════════════════

/** Type of toll transaction */
export type TollType =
  | 'usage'
  | 'top_up'
  | 'refund'
  | 'adjustment'
  | 'balance_transfer';

/** How the toll was paid */
export type TollPaymentMethod =
  | 'tag_balance'
  | 'cash'
  | 'card'
  | 'fleet_account';

/** Current status of the toll record */
export type TollStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'reconciled'
  | 'resolved'
  | 'disputed';

/** How the toll was resolved (for personal/business classification) */
export type TollResolution =
  | 'personal'
  | 'business'
  | 'write_off'
  | 'refunded';

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

export interface TollAuditEntry {
  action: TollAuditAction;
  timestamp: string;
  userId?: string;
  userName?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
}

export interface TollLedgerRecord {
  id: string;
  createdAt: string;
  updatedAt: string;

  vehicleId: string | null;
  vehiclePlate: string | null;

  driverId: string | null;
  driverName: string | null;

  tollTagId: string | null;
  tagNumber: string | null;

  plaza: string | null;
  plazaId?: string | null;
  highway: string | null;
  location: string | null;

  date: string;
  time: string | null;
  type: TollType;
  amount: number;
  paymentMethod: TollPaymentMethod;

  status: TollStatus;
  resolution: TollResolution | null;
  isReconciled: boolean;

  tripId: string | null;
  matchConfidence: number | null;
  matchedAt: string | null;
  matchedBy: string | null;

  unlinkedSourceTripId?: string | null;
  unlinkedSourcePlatform?: string | null;
  unlinkedAppliedAt?: string | null;
  unlinkedAppliedBy?: string | null;
  preUnlinkedTripId?: string | null;

  batchId: string | null;
  batchName: string | null;
  importedAt: string | null;
  sourceFile: string | null;

  receiptUrl: string | null;
  referenceNumber: string | null;
  description: string | null;
  notes: string | null;

  auditTrail: TollAuditEntry[];

  metadata: Record<string, unknown>;

  _legacyTransactionId?: string;
}

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
  dateFrom?: string;
  dateTo?: string;
  batchId?: string;
  search?: string;
}

/** Validates a raw object as a TollLedgerRecord. */
export function validateTollLedgerRecord(raw: unknown): TollLedgerRecord {
  if (!raw || typeof raw !== 'object') {
    throw new Error('TollLedgerRecord must be an object');
  }

  const record = raw as Record<string, unknown>;

  if (!record.id || typeof record.id !== 'string') {
    throw new Error('TollLedgerRecord.id is required and must be a string');
  }
  if (!record.date || typeof record.date !== 'string') {
    throw new Error('TollLedgerRecord.date is required and must be a string');
  }
  if (typeof record.amount !== 'number') {
    throw new Error('TollLedgerRecord.amount is required and must be a number');
  }

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
    plazaId: (record.plazaId as string) || null,
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

    unlinkedSourceTripId: (record.unlinkedSourceTripId as string) || null,
    unlinkedSourcePlatform: (record.unlinkedSourcePlatform as string) || null,
    unlinkedAppliedAt: (record.unlinkedAppliedAt as string) || null,
    unlinkedAppliedBy: (record.unlinkedAppliedBy as string) || null,
    preUnlinkedTripId: (record.preUnlinkedTripId as string) || null,

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

export function createAuditEntry(
  action: TollAuditAction,
  userId?: string,
  userName?: string,
  changes?: Record<string, { from: unknown; to: unknown }>,
  metadata?: Record<string, unknown>,
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

export function appendAuditTrail(
  record: TollLedgerRecord,
  action: TollAuditAction,
  userId?: string,
  userName?: string,
  changes?: Record<string, { from: unknown; to: unknown }>,
  metadata?: Record<string, unknown>,
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
