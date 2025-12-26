import { api } from './api';
import { OdometerReading } from '../types/vehicle';

export const odometerService = {
  getHistory: async (vehicleId: string) => {
    return await api.getOdometerHistory(vehicleId);
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

  calculateProjectedReading: (history: OdometerReading[], date: string, distance: number) => {
    // Find the anchor (latest reading BEFORE the date)
    const targetDate = new Date(date).getTime();
    
    // Sort history by date desc
    const sorted = [...history].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Find first reading that is older than targetDate
    const anchor = sorted.find(r => new Date(r.date).getTime() <= targetDate);

    if (!anchor) {
        // If no history exists before this date, we just assume the distance is from 0?
        // Or strictly speaking we can't calculate it accurately.
        // For now, returning distance is a safe fallback (assuming 0 base).
        return distance;
    }

    return anchor.value + distance;
  }
};
