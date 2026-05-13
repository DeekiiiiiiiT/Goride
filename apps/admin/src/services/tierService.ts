import { api } from './api';
import { TierConfig, ExpenseSplitRule, DriverMetrics, QuotaConfig } from '../types/data';

// Default Tiers if none exist
const DEFAULT_TIERS: TierConfig[] = [
  { id: 'tier_1', name: 'Bronze', minEarnings: 0, maxEarnings: 75000, sharePercentage: 25, color: '#CD7F32' },
  { id: 'tier_2', name: 'Silver', minEarnings: 75000, maxEarnings: 150000, sharePercentage: 27, color: '#C0C0C0' },
  { id: 'tier_3', name: 'Gold', minEarnings: 150000, maxEarnings: 225000, sharePercentage: 29, color: '#FFD700' },
  { id: 'tier_4', name: 'Platinum', minEarnings: 225000, maxEarnings: 300000, sharePercentage: 31, color: '#E5E4E2' },
  { id: 'tier_5', name: 'Diamond', minEarnings: 300000, maxEarnings: null, sharePercentage: 33, color: '#B9F2FF' }
];

const DEFAULT_SPLIT_RULES: ExpenseSplitRule[] = [
    { id: 'fuel_default', category: 'Fuel', name: 'Standard Split', companyShare: 50, driverShare: 50, isDefault: true },
    { id: 'maint_default', category: 'Maintenance', name: 'Standard Maintenance', companyShare: 100, driverShare: 0, isDefault: true }
];

const DEFAULT_QUOTA_SETTINGS: QuotaConfig = {
  daily: { enabled: false, amount: 0 },
  weekly: { enabled: false, amount: 0 },
  monthly: { enabled: false, amount: 0 }
};

export const tierService = {
  async getTiers(): Promise<TierConfig[]> {
    try {
      const prefs = await api.getPreferences();
      if (!prefs.tiers || prefs.tiers.length === 0) {
        // Initialize if empty
        await this.saveTiers(DEFAULT_TIERS);
        return DEFAULT_TIERS;
      }
      return prefs.tiers;
    } catch (error) {
      console.error("Failed to load tiers", error);
      return DEFAULT_TIERS;
    }
  },

  async saveTiers(tiers: TierConfig[]): Promise<void> {
    const prefs = await api.getPreferences();
    await api.savePreferences({
      ...prefs,
      tiers: tiers
    });
  },

  async getSplitRules(): Promise<ExpenseSplitRule[]> {
    try {
      const prefs = await api.getPreferences();
      if (!prefs.expenseRules || prefs.expenseRules.length === 0) {
          await this.saveSplitRules(DEFAULT_SPLIT_RULES);
          return DEFAULT_SPLIT_RULES;
      }
      
      // Migration: Ensure all rules have names
      const migratedRules = prefs.expenseRules.map(r => ({
          ...r,
          name: r.name || (r.category === 'Fuel' ? 'Standard Split' : r.category)
      }));

      return migratedRules;
    } catch (error) {
       console.error("Failed to load split rules", error);
       return DEFAULT_SPLIT_RULES;
    }
  },

  async saveSplitRules(rules: ExpenseSplitRule[]): Promise<void> {
    const prefs = await api.getPreferences();
    await api.savePreferences({
        ...prefs,
        expenseRules: rules
    });
  },

  async getQuotaSettings(): Promise<QuotaConfig> {
    try {
      const prefs = await api.getPreferences();
      if (!prefs.quotas) {
        // Initialize if empty, but don't save yet to avoid unnecessary writes
        return DEFAULT_QUOTA_SETTINGS;
      }
      return prefs.quotas;
    } catch (error) {
      console.error("Failed to load quota settings", error);
      return DEFAULT_QUOTA_SETTINGS;
    }
  },

  async saveQuotaSettings(settings: QuotaConfig): Promise<void> {
    const prefs = await api.getPreferences();
    await api.savePreferences({
      ...prefs,
      quotas: settings
    });
  }
};

