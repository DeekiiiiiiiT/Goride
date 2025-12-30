import { TierConfig } from '../types/data';

export const TierCalculations = {
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

    return match || sorted[sorted.length - 1]; // Default to highest if over? No, logic above covers it. Fallback to lowest? 
    // Actually if earnings > max of last tier (which should be null), it hits the null check.
    // If earnings < min of first tier (should be 0), returns undefined -> Fallback to first.
  },

  getNextTier(currentTier: TierConfig, tiers: TierConfig[]): TierConfig | null {
      const sorted = [...tiers].sort((a, b) => a.minEarnings - b.minEarnings);
      const currentIndex = sorted.findIndex(t => t.id === currentTier.id);
      
      if (currentIndex === -1 || currentIndex === sorted.length - 1) return null;
      return sorted[currentIndex + 1];
  },

  calculateProgress(cumulativeEarnings: number, currentTier: TierConfig): number {
     if (currentTier.maxEarnings === null) return 100;
     
     const range = currentTier.maxEarnings - currentTier.minEarnings;
     const progress = cumulativeEarnings - currentTier.minEarnings;
     
     return Math.min(100, Math.max(0, (progress / range) * 100));
  },

  formatCurrency(amount: number): string {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  }
};
