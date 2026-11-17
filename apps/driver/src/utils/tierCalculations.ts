import { TierConfig, Trip, MonthlyPerformance } from '../types/data';
import { getDriverPortalTripEarnings } from './tripEarnings';
import { parseISO, format } from 'date-fns';
import {
  computeTierMonthToDateFromTrips,
  DEFAULT_FLEET_TZ,
  periodKeyFor,
} from '@roam/finance-core';

export const TierCalculations = {
  calculateMonthlyEarnings(trips: Trip[], referenceDate: Date = new Date()): number {
      if (!trips || trips.length === 0) return 0;
      const refYmd = format(referenceDate, 'yyyy-MM-dd');
      const periodAnchor = periodKeyFor(refYmd, DEFAULT_FLEET_TZ);
      if (!periodAnchor) return 0;

      return computeTierMonthToDateFromTrips({
          trips,
          periodAnchor,
          tripEarnings: getDriverPortalTripEarnings,
          tripDate: (trip) => {
              if (!trip.date) return undefined;
              try {
                  const tripDate = typeof trip.date === 'string' ? parseISO(trip.date) : trip.date;
                  return format(tripDate, 'yyyy-MM-dd');
              } catch {
                  return undefined;
              }
          },
          timezone: DEFAULT_FLEET_TZ,
      });
  },

  getTierForEarnings(cumulativeEarnings: number, tiers: TierConfig[]): TierConfig {
    if (!tiers || tiers.length === 0) {
        // Fallback safety
        return { id: 'default', name: 'Standard', minEarnings: 0, maxEarnings: null, sharePercentage: 25, color: '#gray' };
    }

    // Sort tiers by minEarnings asc
    const sorted = [...tiers].sort((a, b) => a.minEarnings - b.minEarnings);
    
    // Find the matching tier
    const match = sorted.find(t => {
       if (t.maxEarnings === null) return cumulativeEarnings >= t.minEarnings;
       return cumulativeEarnings >= t.minEarnings && cumulativeEarnings < t.maxEarnings;
    });

    // If no match found (e.g., negative earnings or below first tier), return the lowest tier
    return match || sorted[0];
  },

  getNextTier(currentTier: TierConfig, tiers: TierConfig[]): TierConfig | null {
      if (!currentTier || !tiers) return null;
      const sorted = [...tiers].sort((a, b) => a.minEarnings - b.minEarnings);
      const currentIndex = sorted.findIndex(t => t.id === currentTier.id);
      
      if (currentIndex === -1 || currentIndex === sorted.length - 1) return null;
      return sorted[currentIndex + 1];
  },

  calculateProgress(cumulativeEarnings: number, currentTier: TierConfig): number {
     if (!currentTier) return 0;
     if (currentTier.maxEarnings === null) return 100;
     
     const range = currentTier.maxEarnings - currentTier.minEarnings;
     if (range <= 0) return 100; // Prevent division by zero

     const progress = cumulativeEarnings - currentTier.minEarnings;
     
     return Math.min(100, Math.max(0, (progress / range) * 100));
  },

  formatCurrency(amount: number): string {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  },

  getMonthlyHistory(trips: Trip[], tiers: TierConfig[]): MonthlyPerformance[] {
      if (!trips || trips.length === 0) return [];

      const currentMonthKey = format(new Date(), 'yyyy-MM');
      const monthlyData = new Map<string, { earnings: number; count: number; date: Date }>();

      trips.forEach(trip => {
          if (!trip.date) return;
          try {
              const tripDate = typeof trip.date === 'string' ? parseISO(trip.date) : trip.date;
              const key = format(tripDate, 'yyyy-MM');
              
              const current = monthlyData.get(key) || { earnings: 0, count: 0, date: tripDate };
              current.earnings += getDriverPortalTripEarnings(trip);
              current.count += 1;
              monthlyData.set(key, current);
          } catch (e) {
              console.warn("Invalid trip date in history", trip);
          }
      });

      return Array.from(monthlyData.entries())
          .map(([key, data]) => {
              const tier = this.getTierForEarnings(data.earnings, tiers);
              return {
                  monthKey: key,
                  monthLabel: format(data.date, 'MMMM yyyy'),
                  earnings: data.earnings,
                  tripCount: data.count,
                  tier: tier,
                  isCurrentMonth: key === currentMonthKey
              };
          })
          .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }
};
