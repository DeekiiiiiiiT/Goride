import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { FinancialTransaction } from '../types/data';
import { Vehicle } from '../types/vehicle';
import { TollPlaza } from '../types/toll';
import { TollLogEntry } from '../types/tollLog';

// Categories that indicate a toll-related transaction
const TOLL_CATEGORIES = ['Toll Usage', 'Tolls', 'Toll Top-up'];

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
 * Resolve a human-readable status label.
 */
function resolveStatusDisplay(status: string): string {
  switch (status) {
    case 'Completed': return 'Completed';
    case 'Pending': return 'Pending';
    case 'Failed': return 'Failed';
    case 'Reconciled': return 'Reconciled';
    case 'Void': return 'Void';
    case 'Verified': return 'Verified';
    case 'Approved': return 'Approved';
    case 'Rejected': return 'Rejected';
    case 'Flagged': return 'Flagged';
    default: return status || 'Unknown';
  }
}

/**
 * Try to match a transaction to a toll plaza by comparing the vendor / description
 * text against known plaza names. Falls back to GPS proximity if coordinates exist.
 */
function matchPlaza(
  tx: FinancialTransaction,
  plazas: TollPlaza[]
): TollPlaza | null {
  if (!plazas.length) return null;

  const vendor = (tx.vendor || '').toLowerCase().trim();
  const desc = (tx.description || '').toLowerCase().trim();
  const searchText = `${vendor} ${desc}`;

  // 1. Exact name match (case-insensitive)
  for (const plaza of plazas) {
    const plazaNameLower = plaza.name.toLowerCase();
    if (vendor === plazaNameLower || desc.includes(plazaNameLower) || searchText.includes(plazaNameLower)) {
      return plaza;
    }
  }

  // 2. Partial match — check if any significant word from plaza name appears
  for (const plaza of plazas) {
    const words = plaza.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matchCount = words.filter(w => searchText.includes(w)).length;
    if (words.length > 0 && matchCount >= Math.ceil(words.length * 0.6)) {
      return plaza;
    }
  }

  // 3. GPS proximity match (if transaction has lat/lng in metadata)
  const txLat = tx.metadata?.lat ?? tx.metadata?.latitude;
  const txLng = tx.metadata?.lng ?? tx.metadata?.longitude;
  if (txLat != null && txLng != null) {
    let closest: TollPlaza | null = null;
    let closestDist = Infinity;
    for (const plaza of plazas) {
      if (!plaza.location?.lat || !plaza.location?.lng) continue;
      const dist = haversineKm(txLat, txLng, plaza.location.lat, plaza.location.lng);
      const radiusKm = (plaza.geofenceRadius || 500) / 1000;
      if (dist < radiusKm && dist < closestDist) {
        closestDist = dist;
        closest = plaza;
      }
    }
    if (closest) return closest;
  }

  return null;
}

/** Simple haversine distance in km */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Custom hook: fetches all financial transactions, filters to toll-related ones,
 * and enriches each with resolved vehicle/driver/plaza names.
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
      const [rawTx, allVehicles, allDrivers, allPlazas] = await Promise.all([
        api.getTransactions(),
        api.getVehicles(),
        api.getDrivers(),
        api.getTollPlazas().catch(() => [] as TollPlaza[]), // Graceful fallback if no plazas
      ]);

      setVehicles(allVehicles);
      setDrivers(allDrivers);
      setPlazas(allPlazas);

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

      // Deduplicate transactions
      const uniqueTxMap = new Map<string, FinancialTransaction>();
      (rawTx || []).forEach((tx: FinancialTransaction) => {
        if (tx?.id) uniqueTxMap.set(tx.id, tx);
      });

      // Filter to toll-related
      const tollTransactions = Array.from(uniqueTxMap.values()).filter(tx =>
        TOLL_CATEGORIES.includes(tx.category as string)
      );

      // Enrich each transaction into a TollLogEntry
      const enriched: TollLogEntry[] = tollTransactions.map(tx => {
        const isUsage = tx.category === 'Toll Usage' || tx.category === 'Tolls';

        // Resolve vehicle
        const vehicle = tx.vehicleId ? vehicleMap.get(tx.vehicleId) : undefined;
        const vehicleName = vehicle
          ? `${vehicle.licensePlate || vehicle.make + ' ' + vehicle.model}`
          : (tx.vehiclePlate || 'Unknown Vehicle');

        // Resolve driver
        const driverName = tx.driverId
          ? (driverMap.get(tx.driverId) || tx.driverName || 'Unknown Driver')
          : (tx.driverName || 'Unassigned');

        // Match plaza
        const plaza = matchPlaza(tx, allPlazas || []);

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
          typeLabel: isUsage ? 'Usage' : 'Top-up',
          vehicleId: tx.vehicleId || null,
          vehicleName,
          driverId: tx.driverId || null,
          driverDisplayName: driverName,
          plazaId: plaza?.id || null,
          plazaName: plaza?.name || null,
          highway: plaza?.highway || null,
          direction: plaza?.direction || null,
          parish: plaza?.parish || null,
          locationRaw: tx.vendor || tx.description || null,
          paymentMethod: tx.paymentMethod || 'Unknown',
          paymentMethodDisplay: resolvePaymentDisplay(tx),
          tollTagId,
          tollTagUuid,
          status: tx.status || 'Unknown',
          statusDisplay: resolveStatusDisplay(tx.status || ''),
          isReconciled: tx.isReconciled || false,
          referenceNumber: tx.referenceNumber || null,
          description: tx.description || '',
          tripId: tx.tripId || null,
          batchId: tx.batchId || null,
          notes: tx.notes || null,
          _raw: tx,
        };
      });

      // Sort by date descending (newest first)
      enriched.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setLogs(enriched);
      console.log(`[useTollLogs] Loaded ${enriched.length} toll transactions (${tollTransactions.length} raw, ${uniqueTxMap.size} total tx)`);
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
