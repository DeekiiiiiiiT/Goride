/**
 * Toll ledger types from @roam/toll-core + fleet-local FinancialTransaction
 * conversions (need plaza integrity helpers).
 */
export type {
  TollType,
  TollPaymentMethod,
  TollStatus,
  TollResolution,
  TollAuditAction,
  TollAuditEntry,
  TollLedgerRecord,
  TollLedgerFilters,
} from '@roam/toll-core';
export {
  validateTollLedgerRecord,
  createAuditEntry,
  appendAuditTrail,
} from '@roam/toll-core';

import type {
  TollType,
  TollPaymentMethod,
  TollStatus,
  TollResolution,
  TollLedgerRecord,
} from '@roam/toll-core';
import type { FinancialTransaction } from './data';
import {
  buildTollContentFingerprint,
  resolveTollPlazaSSot,
} from '../utils/tollLedgerIntegrity';

/**
 * Converts an existing FinancialTransaction (toll category) to TollLedgerRecord.
 * Used during migration/backfill.
 */
export function transactionToTollLedger(tx: FinancialTransaction): TollLedgerRecord {
  const now = new Date().toISOString();

  const category = (tx.category || '').toLowerCase();
  const isTopUp = category.includes('top') || category.includes('credit') || tx.amount > 0;
  const isRefund = category.includes('refund');
  const type: TollType = isRefund ? 'refund' : isTopUp ? 'top_up' : 'usage';

  const pm = (tx.paymentMethod || '').toLowerCase();
  let paymentMethod: TollPaymentMethod = 'tag_balance';
  if (pm.includes('cash')) paymentMethod = 'cash';
  else if (pm.includes('card')) paymentMethod = 'card';
  else if (pm.includes('fleet') || pm.includes('account')) paymentMethod = 'fleet_account';

  let status: TollStatus = 'pending';
  const txStatus = (tx.status || '').toLowerCase();
  if (txStatus === 'approved') status = 'approved';
  else if (txStatus === 'rejected') status = 'rejected';
  else if (tx.isReconciled) status = 'reconciled';
  else if (txStatus === 'completed' || txStatus === 'resolved') status = 'resolved';

  let resolution: TollResolution | null = null;
  const metaResolution = tx.metadata?.resolution as string | undefined;
  if (metaResolution) {
    const r = metaResolution.toLowerCase();
    if (r === 'personal') resolution = 'personal';
    else if (r === 'business') resolution = 'business';
    else if (r.includes('write')) resolution = 'write_off';
    else if (r.includes('refund')) resolution = 'refunded';
  }

  const dateOnly =
    typeof tx.date === 'string' && tx.date.includes('T')
      ? tx.date.slice(0, 10)
      : tx.date;
  const plazaSsot = resolveTollPlazaSSot({
    vendor: tx.vendor,
    plaza: (tx as { plaza?: string | null }).plaza ?? null,
    metadata: (tx.metadata || {}) as Record<string, unknown>,
  });
  const contentFingerprint = buildTollContentFingerprint({
    vehicleId: tx.vehicleId,
    date: dateOnly,
    amount: tx.amount,
    plaza: plazaSsot.plaza,
    metadata: plazaSsot.metadata,
  });
  const metadata = {
    ...plazaSsot.metadata,
    contentFingerprint,
  };

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

    plaza: plazaSsot.plaza,
    highway: plazaSsot.highway,
    location: plazaSsot.plaza || tx.vendor || tx.description || null,

    date: dateOnly,
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

    metadata,

    _legacyTransactionId: tx.id,
  };
}

/**
 * Converts a TollLedgerRecord back to FinancialTransaction format.
 */
export function tollLedgerToTransaction(toll: TollLedgerRecord): FinancialTransaction {
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

    unlinkedSourceTripId: toll.unlinkedSourceTripId ?? undefined,
    unlinkedSourcePlatform: toll.unlinkedSourcePlatform ?? undefined,
    unlinkedAppliedAt: toll.unlinkedAppliedAt ?? undefined,
    unlinkedAppliedBy: toll.unlinkedAppliedBy ?? undefined,
    preUnlinkedTripId: toll.preUnlinkedTripId ?? undefined,

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
      tollLedgerId: toll.id,
      unlinkedSourceTripId: toll.unlinkedSourceTripId,
      unlinkedSourcePlatform: toll.unlinkedSourcePlatform,
      unlinkedAppliedAt: toll.unlinkedAppliedAt,
      unlinkedAppliedBy: toll.unlinkedAppliedBy,
      preUnlinkedTripId: toll.preUnlinkedTripId,
    },
  };
}
