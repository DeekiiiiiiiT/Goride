import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  AlertCircle,
  Save,
  Check,
  Server,
  Shield,
  AlertTriangle,
  Globe,
  Megaphone,
} from 'lucide-react';
import { withSettingsSegmentHeaders } from '@roam/api-client';
import {
  DEFAULT_GLOBAL_SETTINGS,
  mergeSettings,
  type GlobalPlatformSettings,
} from '@roam/platform-settings';
import { ProductLineSettingsPage } from './ProductLineSettingsPage';

export type GlobalPlatformSettingsPageProps = {
  apiBaseUrl: string;
  accessToken?: string;
  userEmail?: string;
  userRole?: string;
  activeTab?: string;
  /** Re-use danger zone from product line page via delegation */
  dangerZoneApiBaseUrl?: string;
};

function SettingsPanel({
  icon,
  title,
  description,
  children,
  className = '',
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl p-5 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function GlobalPlatformSettingsPage({
  apiBaseUrl,
  accessToken,
  userEmail,
  userRole,
  activeTab: externalTab,
}: GlobalPlatformSettingsPageProps) {
  const activeTab = externalTab || 'general';
  const defaults = useMemo(() => ({ ...DEFAULT_GLOBAL_SETTINGS }), []);

  const [settings, setSettings] = useState<GlobalPlatformSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/platform-settings`, {
        headers: withSettingsSegmentHeaders('global', {
          Authorization: `Bearer ${accessToken}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.settings) {
        setSettings(mergeSettings(defaults, data.settings));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [accessToken, apiBaseUrl, defaults]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/platform-settings`, {
        method: 'PUT',
        headers: withSettingsSegmentHeaders('global', {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        }),
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (activeTab === 'danger') {
    return (
      <ProductLineSettingsPage
        segment="fleet"
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        userEmail={userEmail}
        userRole={userRole}
        activeTab="danger"
        showBusinessTypes={false}
        showDangerZone
        platformLabel="Roam Dominion — Global"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Global Settings</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Cross-product platform controls for Roam Dominion.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
            ${saved ? 'bg-emerald-600 text-white' : dirty ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 cursor-not-allowed border border-slate-300 dark:bg-slate-800 dark:border-slate-700'}
          `}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(activeTab === 'general' || activeTab === 'security') && (
        <SettingsPanel
          icon={<Server className="w-4 h-4 text-emerald-400" />}
          title="System Information"
          description="Read-only platform metadata."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Super Admin</p>
              <p className="text-slate-900 dark:text-white">{userEmail || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Admin Role</p>
              <p className="text-slate-900 dark:text-white">{userRole || 'superadmin'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Settings Segment</p>
              <p className="text-slate-900 dark:text-white">global</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Backend</p>
              <p className="text-slate-900 dark:text-white">Supabase Edge Functions + KV</p>
            </div>
          </div>
        </SettingsPanel>
      )}

      {activeTab === 'general' && (
        <SettingsPanel
          icon={<Globe className="w-4 h-4 text-blue-400" />}
          title="Global Maintenance"
          description="Master maintenance flag for cross-product emergencies (optional)."
        >
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.maintenanceMode ?? false}
              onChange={(e) => {
                setSettings((s) => ({ ...s, maintenanceMode: e.target.checked }));
                setDirty(true);
              }}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-900 dark:text-white">Enable global maintenance mode</span>
          </label>
          {(settings.maintenanceMode ?? false) && (
            <textarea
              value={settings.maintenanceMessage ?? ''}
              onChange={(e) => {
                setSettings((s) => ({ ...s, maintenanceMessage: e.target.value }));
                setDirty(true);
              }}
              rows={2}
              className="mt-3 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              placeholder="Maintenance message for all products"
            />
          )}
        </SettingsPanel>
      )}

      {activeTab === 'announcements' && (
        <SettingsPanel
          icon={<Megaphone className="w-4 h-4 text-amber-400" />}
          title="Global Announcements"
          description="Cross-product banner (optional)."
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Configure segment-specific announcements under Business Segments → Fleet or Enterprise settings.
          </p>
        </SettingsPanel>
      )}

      {activeTab === 'security' && (
        <SettingsPanel
          icon={<Shield className="w-4 h-4 text-red-400" />}
          title="Global Security"
          description="Platform-wide security baseline. API keys live in API Command Center."
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Password policies and session controls are configured per product line under Business Segments.
          </p>
        </SettingsPanel>
      )}

      {activeTab === 'features' && (
        <SettingsPanel
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
          title="Features"
          description="Module toggles are product-line specific."
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Fleet module toggles (fuel, toll, driver portal) are under Business Segments → Roam Fleet → Settings → Features.
          </p>
        </SettingsPanel>
      )}

      {activeTab === 'registration' && (
        <SettingsPanel
          icon={<Globe className="w-4 h-4 text-emerald-400" />}
          title="Registration"
          description="Signup policies are per product line."
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Fleet manager registration is configured under Business Segments → Roam Fleet or Roam Enterprise → Settings → Registration.
          </p>
        </SettingsPanel>
      )}
    </div>
  );
}
