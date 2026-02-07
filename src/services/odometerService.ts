import { api } from './api';
import { OdometerReading, UnifiedOdometerEntry, UnifiedOdometerSource } from '../types/vehicle';
import { processUnifiedHistory } from '../utils/odometerUtils';

export const odometerService = {
  getHistory: async (vehicleId: string) => {
    return await api.getOdometerHistory(vehicleId);
  },

  /**
   * Fetches odometer readings from all sources (Check-ins, Fuel Logs, Service Records)
   * and unifies them into a single chronological timeline.
   */
  getUnifiedHistory: async (vehicleId: string): Promise<UnifiedOdometerEntry[]> => {
    try {
      // 1. Fetch data from different sources in parallel
      const [directHistory, fuelEntries, checkIns, maintenanceLogs] = await Promise.all([
        api.getOdometerHistory(vehicleId),
        api.getFuelEntriesByVehicle(vehicleId),
        api.getCheckInsByVehicle(vehicleId),
        api.getMaintenanceLogs(vehicleId)
      ]);

      const unified: UnifiedOdometerEntry[] = [];

      // 2. Normalize Direct Readings (Manual Updates from Odometer Table)
      if (directHistory) {
        directHistory.forEach(r => {
            // We include all manual updates, but ensure they map to UnifiedOdometerEntry
            // Direct history items already have an ID, but we want to ensure source is typed correctly
            if (r.type !== 'Calculated') {
                // Respect 'checkin' source if it was restored that way
                const mappedSource = (r.source === 'Weekly Check-in' || r.source === 'checkin') ? 'checkin' : 'manual';
                
                unified.push({
                    ...r,
                    source: mappedSource, 
                    referenceId: r.id, // Self-referential for manual entries
                    metaData: {
                        originalSource: r.source // Keep original source string for context
                    }
                });
            }
        });
      }

      // 3. Normalize Fuel Entries
      if (fuelEntries) {
        fuelEntries.forEach((entry: any) => {
          if (entry.odometer && entry.odometer > 0) {
            unified.push({
              id: `fuel_${entry.id}`,
              vehicleId: entry.vehicleId || vehicleId,
              driverId: entry.driverId,
              date: entry.date,
              value: entry.odometer,
              type: 'Hard',
              source: 'fuel',
              notes: entry.location ? `Fuel at ${entry.location}` : 'Fuel Entry',
              referenceId: entry.id,
              isVerified: true, // Fuel logs are generally considered verified/hard readings
              createdAt: entry.date,
              metaData: {
                liters: entry.liters,
                price: entry.price,
                totalCost: entry.totalCost,
                paymentSource: entry.paymentSource,
                receiptUrl: entry.receiptUrl,
                odometerMethod: entry.odometerMethod || entry.metadata?.odometerMethod
              }
            });
          }
        });
      }

      // 4. Normalize Check-ins
      if (checkIns) {
        checkIns.forEach((checkIn: any) => {
          if (checkIn.odometer && checkIn.odometer > 0) {
            const date = checkIn.timestamp || checkIn.date;
            unified.push({
              id: `checkin_${checkIn.id}`,
              vehicleId: checkIn.vehicleId || vehicleId,
              driverId: checkIn.driverId,
              date: date,
              value: checkIn.odometer,
              type: 'Hard',
              source: 'checkin',
              notes: `Weekly Check-in (Week: ${checkIn.weekStart})`,
              referenceId: checkIn.id,
              imageUrl: checkIn.photoUrl,
              isVerified: checkIn.verified || false,
              isManagerVerified: checkIn.reviewStatus === 'approved' || checkIn.reviewStatus === 'auto_approved',
              createdAt: date,
              metaData: {
                weekStart: checkIn.weekStart,
                status: checkIn.status,
                method: checkIn.method,
                aiReading: checkIn.aiReading
              }
            });
          }
        });
      }

      // 5. Normalize Maintenance Logs
      if (maintenanceLogs) {
        const logs = Array.isArray(maintenanceLogs) ? maintenanceLogs : [];
        logs.forEach((log: any) => {
          if (log.odometer && log.odometer > 0) {
            unified.push({
              id: `service_${log.id}`,
              vehicleId: log.vehicleId || vehicleId,
              date: log.date,
              value: log.odometer,
              type: 'Hard',
              source: 'service',
              notes: log.serviceType || 'Maintenance Service',
              referenceId: log.id,
              isVerified: true,
              createdAt: log.date,
              metaData: {
                serviceType: log.serviceType,
                garage: log.garage
              }
            });
          }
        });
      }

      // Apply Phase 3: Merging, Deduplication, and Gap Analysis
      return processUnifiedHistory(unified);
    } catch (error) {
      console.error("Error fetching unified odometer history:", error);
      return [];
    }
  },

  addReading: async (reading: Partial<OdometerReading>) => {
    return await api.addOdometerReading(reading);
  },

  deleteReading: async (id: string, vehicleId: string) => {
    return await api.deleteOdometerReading(id, vehicleId);
  },

  getLatestReading: (history: OdometerReading[]): OdometerReading | null => {
    if (!history || history.length === 0) return null;
    
    // Sort by date desc just to be sure
    const sorted = [...history].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    return sorted[0];
  },

  /**
   * Restores a batch of unified entries to the database.
   * Maps 'Unified' types back to 'OdometerReading' types.
   * Handles Fuel/Service logs by preserving their Reference IDs and Source types.
   */
  restoreOdometerBatch: async (entries: UnifiedOdometerEntry[], vehicleId: string) => {
      const results = {
          success: 0,
          failed: 0,
          errors: [] as any[]
      };

      // Map UnifiedSource to OdometerSource
      const sourceMap: Record<UnifiedOdometerSource, string> = {
          'fuel': 'Fuel Log',
          'service': 'Service Log',
          'checkin': 'Weekly Check-in',
          'manual': 'Manual Update'
      };

      // Process in chunks to avoid overwhelming the server
      const CHUNK_SIZE = 5;
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
          const chunk = entries.slice(i, i + CHUNK_SIZE);
          
          await Promise.all(chunk.map(async (entry) => {
              try {
                  const mappedSource = sourceMap[entry.source] || 'Manual Update';
                  
                  // Construct payload
                  // Ensure we do NOT pass the 'unified' ID (e.g. "fuel_123") as the primary key ID,
                  // because Supabase likely expects a UUID or generates one.
                  // However, we MUST preserve the Reference ID.
                  
                  let finalNotes = entry.notes || '';
                  if (entry.metaData?.isRestored) {
                      finalNotes += ` (Restored: ${entry.referenceId})`;
                  }

                  const payload: Partial<OdometerReading> = {
                      vehicleId: entry.vehicleId || vehicleId,
                      date: entry.date,
                      value: entry.value,
                      type: 'Hard', // Restored anchors are Hard
                      source: mappedSource as any,
                      referenceId: entry.referenceId,
                      notes: finalNotes,
                      isVerified: true
                      // We do NOT send 'id', let DB generate a new UUID for this row
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
  }
};
