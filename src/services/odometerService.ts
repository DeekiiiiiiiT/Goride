import { api } from './api';
import { OdometerReading } from '../types/vehicle';

export const odometerService = {
  getHistory: async (vehicleId: string) => {
    return await api.getOdometerHistory(vehicleId);
  },

  /**
   * Fetches odometer readings from all sources (Check-ins, Fuel Logs, Service Records)
   * and unifies them into a single chronological timeline.
   */
  getUnifiedHistory: async (vehicleId: string): Promise<OdometerReading[]> => {
    try {
      // 1. Fetch data from different sources in parallel
      const [directHistory, fuelEntries, checkIns, maintenanceLogs] = await Promise.all([
        api.getOdometerHistory(vehicleId),
        api.getFuelEntriesByVehicle(vehicleId),
        api.getCheckInsByVehicle(vehicleId),
        api.getMaintenanceLogs(vehicleId)
      ]);

      const unified: OdometerReading[] = [];

      // Add direct readings (Filtered to exclude old calculated/projected records)
      if (directHistory) {
        directHistory.forEach(r => {
            if (r.type !== 'Calculated') {
                unified.push({ ...r, source: r.source || 'Manual Update' });
            }
        });
      }

      // Add fuel entry anchors
      if (fuelEntries) {
        fuelEntries.forEach((entry: any) => {
          if (entry.odometer) {
            unified.push({
              id: `fuel_${entry.id}`,
              vehicleId: entry.vehicleId || vehicleId,
              driverId: entry.driverId,
              date: entry.date,
              value: entry.odometer,
              type: 'Hard',
              source: 'Fuel Log',
              notes: entry.location ? `Fuel at ${entry.location}` : 'Fuel Entry',
              referenceId: entry.id,
              isVerified: true,
              createdAt: entry.date
            });
          }
        });
      }

      // Add check-in anchors
      if (checkIns) {
        checkIns.forEach((checkIn: any) => {
          if (checkIn.odometer) {
            unified.push({
              id: `checkin_${checkIn.id}`,
              vehicleId: checkIn.vehicleId || vehicleId,
              driverId: checkIn.driverId,
              date: checkIn.timestamp || checkIn.date,
              value: checkIn.odometer,
              type: 'Hard',
              source: 'Weekly Check-in',
              notes: `Weekly Check-in (Week: ${checkIn.weekStart})`,
              referenceId: checkIn.id,
              imageUrl: checkIn.photoUrl,
              isVerified: checkIn.verified || false,
              isManagerVerified: checkIn.reviewStatus === 'approved' || checkIn.reviewStatus === 'auto_approved',
              createdAt: checkIn.timestamp || checkIn.date
            });
          }
        });
      }

      // Add maintenance anchors
      if (maintenanceLogs) {
        maintenanceLogs.forEach((log: any) => {
          if (log.odometer) {
            unified.push({
              id: `service_${log.id}`,
              vehicleId: log.vehicleId || vehicleId,
              date: log.date,
              value: log.odometer,
              type: 'Hard',
              source: 'Service Log',
              notes: log.serviceType || 'Maintenance Service',
              referenceId: log.id,
              isVerified: true,
              createdAt: log.date
            });
          }
        });
      }

      // Sort by date desc
      return unified.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
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
  }
};
