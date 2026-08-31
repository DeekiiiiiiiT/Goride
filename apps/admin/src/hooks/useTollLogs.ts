import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { FinancialTransaction } from '../types/data';
import { Vehicle } from '../types/vehicle';
import { TollPlaza } from '../types/toll';
import { TollLogEntry } from '../types/tollLog';
import { tollLogKindFromTx } from '../utils/tollCategoryHelper';
import {
  resolveTollPlaza,
  isVoidedToll,
  resolveTollStatusDisplay,
} from '@roam/toll-core';

/**
 * Dominion useTollLogs — same enrichment as fleet (plazaId-first via toll-core).
 */

interface DriverRecord {
  id: string;
  name?: string;
  driverId?: string;
  [key: string]: any;
}

function resolvePaymentDisplay(tx: FinancialTransaction): string {
  const method = (tx.paymentMethod || '').toLowerCase();
  if (method.includes('cash')) return 'Cash';
  if (method.includes('tag') || method === 'digital wallet') return 'E-Tag';
  if (method.includes('card') || method.includes('credit')) return 'Card';
  if (method.includes('bank')) return 'Bank Transfer';
  if (method === 'other' && tx.metadata?.tollTagId) return 'E-Tag';
  if (method) return tx.paymentMethod;
  return 'Unknown';
}

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
        api.getTollLogs(),
        api.getVehicles(),
        api.getDrivers(),
        api.getTollPlazas().catch(() => [] as TollPlaza[]),
      ]);

      setVehicles(allVehicles);
      setDrivers(allDrivers);
      setPlazas(allPlazas);

      const tollTransactions: FinancialTransaction[] = tollResponse?.data || [];

      const vehicleMap = new Map<string, Vehicle>();
      (allVehicles || []).forEach((v: Vehicle) => {
        vehicleMap.set(v.id, v);
        if (v.licensePlate) vehicleMap.set(v.licensePlate, v);
      });

      const driverMap = new Map<string, string>();
      (allDrivers || []).forEach((d: DriverRecord) => {
        if (d.id && d.name) driverMap.set(d.id, d.name);
        if (d.driverId && d.name) driverMap.set(d.driverId, d.name);
      });

      const enriched: TollLogEntry[] = tollTransactions.map((tx: any) => {
        const kind = tollLogKindFromTx(tx);
        const isUsage = kind === 'usage';
        const typeLabel: 'Usage' | 'Top-up' = isUsage ? 'Usage' : 'Top-up';

        const vehicle = tx.vehicleId ? vehicleMap.get(tx.vehicleId) : undefined;
        const vehicleName = vehicle
          ? `${vehicle.licensePlate || vehicle.make + ' ' + vehicle.model}`
          : (tx.vehiclePlate || 'Unknown Vehicle');

        const driverName = tx.driverId
          ? (driverMap.get(tx.driverId) || tx.driverName || 'Unknown Driver')
          : (tx.driverName || 'Unassigned');

        const { plaza, source: plazaSource } = resolveTollPlaza(tx, allPlazas || []);
        const voided = isVoidedToll(tx);

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
          linkedTrip: tx.linkedTrip || null,
          _raw: tx,
        };
      });

      setLogs(enriched);
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
