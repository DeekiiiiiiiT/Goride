import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { FinancialTransaction } from '../types/data';
import { Vehicle } from '../types/vehicle';
import { TollPlaza } from '../types/toll';
import { TollLogEntry } from '../types/tollLog';
import { tollLogKindFromTx } from '../utils/tollCategoryHelper';
import { resolveTollPlaza } from '../utils/tollPlazaResolution';
import { isVoidedTx } from '../utils/tollTagLedger';
import { resolveTollStatusDisplay } from '../utils/tollLogStatus';

// Simple driver shape returned by api.getDrivers()
interface DriverRecord {
  id: string;
  name?: string;
  driverId?: string;
  [key: string]: any;
}

/**
 * Resolve a human-readable payment method label from raw transaction data.
 */
function resolvePaymentDisplay(tx: FinancialTransaction): string {
  const method = (tx.paymentMethod || '').toLowerCase();
  if (method.includes('cash')) return 'Cash';
  if (method.includes('tag') || method === 'digital wallet') return 'E-Tag';
  if (method.includes('card') || method.includes('credit')) return 'Card';
  if (method.includes('bank')) return 'Bank Transfer';
  if (method === 'other' && tx.metadata?.tollTagId) return 'E-Tag';
  if (method) return tx.paymentMethod; // Return original if we can't classify
  return 'Unknown';
}

/**
 * Custom hook: fetches toll transactions from the server-side /toll-logs
 * endpoint (which returns pre-filtered, pre-sorted toll-category transactions
 * with linked trip data already embedded), then enriches each with resolved
 * vehicle/driver/plaza names on the client side.
 *
 * Phase 5 refactor: replaced api.getTransactions() + client-side category
 * filtering with api.getTollLogs() — server now handles filtering, sorting,
 * deduplication, and trip embedding.
 */
export function useTollLogs() {
  const [logs, setLogs] = useState<TollLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [plazas, setPlazas] = useState<TollPlaza[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tollResponse, allVehicles, allDrivers, allPlazas] = await Promise.all([
        api.getTollLogs(),                                       // <-- Phase 5: server-side toll-logs endpoint
        api.getVehicles(),
        api.getDrivers(),
        api.getTollPlazas().catch(() => [] as TollPlaza[]),      // Graceful fallback if no plazas
      ]);

      setVehicles(allVehicles);
      setDrivers(allDrivers);
      setPlazas(allPlazas);

      // Extract the toll transactions array from the server response
      const tollTransactions: FinancialTransaction[] = tollResponse?.data || [];

      // Build lookup maps
      const vehicleMap = new Map<string, Vehicle>();
      (allVehicles || []).forEach((v: Vehicle) => {
        vehicleMap.set(v.id, v);
        // Also index by license plate for matching vehiclePlate references
        if (v.licensePlate) vehicleMap.set(v.licensePlate, v);
      });

      const driverMap = new Map<string, string>(); // id -> name
      (allDrivers || []).forEach((d: DriverRecord) => {
        if (d.id && d.name) driverMap.set(d.id, d.name);
        if (d.driverId && d.name) driverMap.set(d.driverId, d.name);
      });

      // Enrich each transaction into a TollLogEntry
      // Note: server already filters to toll categories and sorts by date desc,
      // so we skip client-side filtering/deduplication/sorting.
      const enriched: TollLogEntry[] = tollTransactions.map((tx: any) => {
        const kind = tollLogKindFromTx(tx);
        const isUsage = kind === 'usage';
        // TollLogEntry.typeLabel is Usage | Top-up; credits/refunds share Top-up lane
        const typeLabel: 'Usage' | 'Top-up' = isUsage ? 'Usage' : 'Top-up';

        // Resolve vehicle
        const vehicle = tx.vehicleId ? vehicleMap.get(tx.vehicleId) : undefined;
        const vehicleName = vehicle
          ? `${vehicle.licensePlate || vehicle.make + ' ' + vehicle.model}`
          : (tx.vehiclePlate || 'Unknown Vehicle');

        // Resolve driver
        const driverName = tx.driverId
          ? (driverMap.get(tx.driverId) || tx.driverName || 'Unknown Driver')
          : (tx.driverName || 'Unassigned');

        // Attribute to a plaza — by the ledger's plazaId first, text only as fallback.
        const { plaza, source: plazaSource } = resolveTollPlaza(tx, allPlazas || []);

        const voided = isVoidedTx(tx);

        // Tag info
        const tollTagId = tx.metadata?.tollTagId || tx.metadata?.tagNumber || null;
        const tollTagUuid = tx.metadata?.tollTagUuid || null;

        return {
          id: tx.id,
          date: tx.date,
          time: tx.time || null,
          amount: tx.amount,
          absAmount: Math.abs(tx.amount),
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
          paymentMethodDisplay: resolvePaymentDisplay(tx),
          tollTagId,
          tollTagUuid,
          status: tx.status || 'Unknown',
          statusDisplay: resolveTollStatusDisplay(tx),
          isReconciled: tx.isReconciled || false,
          isVoided: voided,
          referenceNumber: tx.referenceNumber || null,
          description: tx.description || '',
          tripId: tx.tripId || null,
          batchId: tx.batchId || null,
          notes: tx.notes || null,
          linkedTrip: tx.linkedTrip || null,    // <-- Phase 5: pre-embedded by server
          _raw: tx,
        };
      });

      setLogs(enriched);
      console.log(`[useTollLogs] Loaded ${enriched.length} toll transactions via /toll-logs (server total: ${tollResponse?.total || '?'})`);
    } catch (err) {
      console.error('[useTollLogs] Failed to fetch toll logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    logs,
    loading,
    vehicles,
    drivers,
    plazas,
    refresh: fetchData,
  };
}
