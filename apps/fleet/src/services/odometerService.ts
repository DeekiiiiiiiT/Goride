import { api } from './api';
import { OdometerReading, UnifiedOdometerEntry, UnifiedOdometerSource } from '../types/vehicle';
import { processUnifiedHistory } from '../utils/odometerUtils';

export type CurrentOdometer = {
  km: number;
  source: string | null;
  recordedAt: string | null;
  readingId: string | null;
  vehicleId: string;
  isVerified: boolean;
};

export type LedgerFilters = {
  source?: string;
  from?: string;
  to?: string;
  includeVoided?: boolean;
  anomaliesOnly?: boolean;
  limit?: number;
  offset?: number;
};

function mapLedgerRowToUnified(r: any, vehicleId: string): UnifiedOdometerEntry {
  const sourceRaw = String(r.source || 'manual');
  const source: UnifiedOdometerSource =
    sourceRaw === 'fuel' ? 'fuel'
    : sourceRaw === 'checkin' ? 'checkin'
    : sourceRaw === 'service' ? 'service'
    : 'manual';
  const readingValue = Number(r.value ?? r.reading ?? r.odometer ?? 0) || 0;
  return {
    ...r,
    id: r.id,
    vehicleId: r.vehicleId || vehicleId,
    date: r.date || r.recordedAt || r.reading_date,
    recordedAt: r.recordedAt || r.recorded_at || r.date,
    value: readingValue,
    type: r.isHard === false ? 'Calculated' : 'Hard',
    source,
    referenceId: r.referenceId || r.reference_id || r.id,
    isVerified: !!(r.isVerified || r.is_verified),
    isAnchorPoint: !!(r.isVerified || r.is_verified || source !== 'manual'),
    imageUrl: r.imageUrl,
    notes: r.notes,
    createdAt: r.recordedAt || r.createdAt || r.date,
    metaData: {
      ...(r.payload || r.metaData || {}),
      isAnomaly: !!(r.isAnomaly || r.is_anomaly),
      ledgerSource: sourceRaw,
      deltaKm: r.deltaKm,
    },
  };
}

export const odometerService = {
  getHistory: async (vehicleId: string) => {
    return await api.getOdometerHistory(vehicleId);
  },

  getCurrent: async (vehicleId: string): Promise<CurrentOdometer> => {
    return await api.getOdometerCurrent(vehicleId);
  },

  getLedger: async (
    vehicleId: string,
    filters: LedgerFilters = {},
  ): Promise<{ data: UnifiedOdometerEntry[]; total: number }> => {
    const result = await api.getOdometerLedger(vehicleId, filters);
    const rows = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
    const mapped = rows.map((r: any) => mapLedgerRowToUnified(r, vehicleId));
    // Soft-collapse exact same-time/same-odo re-submits that already landed in the ledger
    const data = processUnifiedHistory(mapped);
    return {
      data,
      // total is raw count; UI uses data.length for visible rows
      total: Number(result?.total ?? rows.length) || rows.length,
    };
  },

  /**
   * @deprecated Prefer getLedger — thin wrapper over server ledger for one release.
   * getLedger already applies processUnifiedHistory.
   */
  getUnifiedHistory: async (vehicleId: string): Promise<UnifiedOdometerEntry[]> => {
    try {
      const { data } = await odometerService.getLedger(vehicleId, { limit: 5000 });
      return data;
    } catch (error) {
      console.error("Error fetching odometer ledger history:", error);
      return [];
    }
  },

  addReading: async (reading: Partial<OdometerReading>) => {
    return await api.addOdometerReading(reading);
  },

  deleteReading: async (id: string, vehicleId: string, source?: string) => {
    return await api.deleteOdometerReading(id, vehicleId, source);
  },

  getLatestReading: (history: OdometerReading[]): OdometerReading | null => {
    if (!history || history.length === 0) return null;
    const sorted = [...history].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return sorted[0];
  },

  restoreOdometerBatch: async (entries: UnifiedOdometerEntry[], vehicleId: string) => {
      const results = {
          success: 0,
          failed: 0,
          errors: [] as any[]
      };

      const sourceMap: Record<UnifiedOdometerSource, string> = {
          'fuel': 'Fuel Log',
          'service': 'Service Log',
          'checkin': 'Weekly Check-in',
          'manual': 'Manual Update'
      };

      const CHUNK_SIZE = 5;
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
          const chunk = entries.slice(i, i + CHUNK_SIZE);

          await Promise.all(chunk.map(async (entry) => {
              try {
                  const mappedSource = sourceMap[entry.source] || 'Manual Update';

                  let finalNotes = entry.notes || '';
                  if (entry.metaData?.isRestored) {
                      finalNotes += ` (Restored: ${entry.referenceId})`;
                  }

                  const payload: Partial<OdometerReading> = {
                      vehicleId: entry.vehicleId || vehicleId,
                      date: entry.date,
                      value: entry.value,
                      type: 'Hard',
                      source: mappedSource as any,
                      referenceId: entry.referenceId,
                      notes: finalNotes,
                      imageUrl: entry.imageUrl || entry.metaData?.odometerProofUrl || entry.metaData?.photoUrl || entry.metaData?.receiptUrl || entry.metaData?.invoiceUrl,
                      isVerified: true,
                      isAnchorPoint: entry.isAnchorPoint || true
                  };

                  await api.addOdometerReading(payload);
                  results.success++;
              } catch (error) {
                  console.error(`Failed to restore entry ${entry.id}:`, error);
                  results.failed++;
                  results.errors.push({ id: entry.id, error });
              }
          }));
      }

      return results;
  },
};
