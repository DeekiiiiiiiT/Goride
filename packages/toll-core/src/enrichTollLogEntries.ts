/**
 * Shared toll-log enrichment used by Fleet + Dominion useTollLogs hooks.
 * Keeps plaza / void / kind classification in one place (audit E1).
 */

import { tollLogKindFromTx } from './tollCategoryHelper.ts';
import {
  resolveTollPlaza,
  isVoidedToll,
  resolveTollStatusDisplay,
  type PlazaMatchSource,
  type TollPlazaMatchable,
} from './tollPlazaResolution.ts';

export interface EnrichVehicle {
  id: string;
  licensePlate?: string | null;
  make?: string | null;
  model?: string | null;
}

export interface EnrichDriver {
  id: string;
  name?: string | null;
  driverId?: string | null;
}

export type EnrichPlaza = TollPlazaMatchable & {
  highway?: string | null;
  direction?: string | null;
  parish?: string | null;
};

/** Minimal transaction shape from GET /toll-logs. */
export interface EnrichTollTx {
  id: string;
  date?: string;
  time?: string | null;
  amount?: number;
  paymentMethod?: string | null;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  plazaId?: string | null;
  vendor?: string | null;
  description?: string | null;
  status?: string | null;
  isReconciled?: boolean;
  referenceNumber?: string | null;
  tripId?: string | null;
  batchId?: string | null;
  notes?: string | null;
  linkedTrip?: unknown;
  metadata?: Record<string, any> | null;
  [key: string]: unknown;
}

export interface EnrichedTollLogEntry {
  id: string;
  date: string;
  time: string | null;
  amount: number;
  absAmount: number;
  isUsage: boolean;
  typeLabel: 'Usage' | 'Top-up';
  vehicleId: string | null;
  vehicleName: string;
  driverId: string | null;
  driverDisplayName: string;
  plazaId: string | null;
  plazaName: string | null;
  plazaSource: PlazaMatchSource;
  highway: string | null;
  direction: string | null;
  parish: string | null;
  locationRaw: string | null;
  paymentMethod: string;
  paymentMethodDisplay: string;
  tollTagId: string | null;
  tollTagUuid: string | null;
  status: string;
  statusDisplay: string;
  isReconciled: boolean;
  isVoided: boolean;
  referenceNumber: string | null;
  description: string;
  tripId: string | null;
  batchId: string | null;
  notes: string | null;
  linkedTrip: unknown;
  _raw: EnrichTollTx;
}

/** Resolve a human-readable payment method label from raw transaction data. */
export function resolvePaymentMethodDisplay(tx: {
  paymentMethod?: string | null;
  metadata?: { tollTagId?: unknown } | null;
}): string {
  const method = (tx.paymentMethod || '').toLowerCase();
  if (method.includes('cash')) return 'Cash';
  if (method.includes('tag') || method === 'digital wallet') return 'E-Tag';
  if (method.includes('card') || method.includes('credit')) return 'Card';
  if (method.includes('bank')) return 'Bank Transfer';
  if (method === 'other' && tx.metadata?.tollTagId) return 'E-Tag';
  if (method && tx.paymentMethod) return tx.paymentMethod;
  return 'Unknown';
}

export function enrichTollLogEntries(input: {
  transactions: EnrichTollTx[];
  vehicles: EnrichVehicle[];
  drivers: EnrichDriver[];
  plazas: EnrichPlaza[];
}): EnrichedTollLogEntry[] {
  const { transactions, vehicles, drivers, plazas } = input;

  const vehicleMap = new Map<string, EnrichVehicle>();
  for (const v of vehicles || []) {
    vehicleMap.set(v.id, v);
    if (v.licensePlate) vehicleMap.set(v.licensePlate, v);
  }

  const driverMap = new Map<string, string>();
  for (const d of drivers || []) {
    if (d.id && d.name) driverMap.set(d.id, d.name);
    if (d.driverId && d.name) driverMap.set(d.driverId, d.name);
  }

  return (transactions || []).map((tx) => {
    const kind = tollLogKindFromTx(tx as any);
    const isUsage = kind === 'usage';
    const typeLabel: 'Usage' | 'Top-up' = isUsage ? 'Usage' : 'Top-up';

    const vehicle = tx.vehicleId ? vehicleMap.get(tx.vehicleId) : undefined;
    const vehicleName = vehicle
      ? `${vehicle.licensePlate || `${vehicle.make || ''} ${vehicle.model || ''}`.trim()}`
      : (tx.vehiclePlate || 'Unknown Vehicle');

    const driverName = tx.driverId
      ? (driverMap.get(tx.driverId) || tx.driverName || 'Unknown Driver')
      : (tx.driverName || 'Unassigned');

    const { plaza, source: plazaSource } = resolveTollPlaza(tx, plazas || []);
    const voided = isVoidedToll(tx);

    return {
      id: tx.id,
      date: String(tx.date || ''),
      time: tx.time || null,
      amount: Number(tx.amount ?? 0),
      absAmount: Math.abs(Number(tx.amount ?? 0)),
      isUsage,
      typeLabel,
      vehicleId: tx.vehicleId || null,
      vehicleName,
      driverId: tx.driverId || null,
      driverDisplayName: driverName,
      plazaId: plaza?.id || null,
      plazaName: plaza?.name || null,
      plazaSource,
      highway: plaza?.highway || null,
      direction: plaza?.direction || null,
      parish: plaza?.parish || null,
      locationRaw: tx.vendor || tx.description || null,
      paymentMethod: tx.paymentMethod || 'Unknown',
      paymentMethodDisplay: resolvePaymentMethodDisplay(tx),
      tollTagId: (tx.metadata?.tollTagId || tx.metadata?.tagNumber || null) as string | null,
      tollTagUuid: (tx.metadata?.tollTagUuid || null) as string | null,
      status: tx.status || 'Unknown',
      statusDisplay: resolveTollStatusDisplay(tx),
      isReconciled: !!tx.isReconciled,
      isVoided: voided,
      referenceNumber: tx.referenceNumber || null,
      description: tx.description || '',
      tripId: tx.tripId || null,
      batchId: tx.batchId || null,
      notes: tx.notes || null,
      linkedTrip: tx.linkedTrip || null,
      _raw: tx,
    };
  });
}
