import React from 'react';
import { Moon } from 'lucide-react';
import { ProductLineSettingsPage } from '@roam/admin-core/settings';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { usePortalTheme } from '../../hooks/usePortalTheme';
import { Switch } from '../ui/switch';
import { api } from '../../services/api';
import type { ProductLineSegment } from '@roam/api-client';

type PlatformSettingsProps = {
  activeTab?: string;
  segment?: ProductLineSegment;
};

function AppearanceSlot() {
  const { isDark, setDarkMode } = usePortalTheme();

  const handleDarkModeChange = async (checked: boolean) => {
    setDarkMode(checked);
    try {
      const prefs = await api.getPreferences().catch(() => ({}));
      await api.savePreferences({ ...(prefs || {}), darkMode: checked });
    } catch {
      // Preference is still stored locally via applyPortalTheme
    }
  };

  return (
    <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl p-5 mb-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
          <Moon className="w-4 h-4 text-violet-500 dark:text-violet-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Appearance</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Personal display preferences for this admin portal.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">Dark mode</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Synced with your fleet dashboard preference.
          </p>
        </div>
        <Switch checked={isDark} onCheckedChange={handleDarkModeChange} aria-label="Toggle dark mode" />
      </div>
    </div>
  );
}

export function PlatformSettings({ activeTab, segment = 'enterprise' }: PlatformSettingsProps = {}) {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const userRole = (user?.user_metadata?.role as string | undefined) ?? 'superadmin';

  return (
    <ProductLineSettingsPage
      segment={segment}
      apiBaseUrl={API_ENDPOINTS.admin}
      accessToken={accessToken}
      userEmail={user?.email}
      userRole={userRole}
      activeTab={activeTab}
      showBusinessTypes={segment === 'enterprise'}
      showDangerZone={false}
      platformLabel="Roam Dominion — Platform Admin"
      appearanceSlot={activeTab === 'general' || !activeTab ? <AppearanceSlot /> : undefined}
    />
  );
}
