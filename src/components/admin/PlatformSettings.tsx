import React, { useEffect, useState, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  Save,
  Check,
  Settings,
  Globe,
  Building2,
  Server,
  ToggleLeft,
  ToggleRight,
  Car,
  Package,
  Navigation,
  Truck,
  Ship,
  Shield,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
interface PlatformSettingsData {
  platformName: string;
  defaultCurrency: string;
  platformVersion: string;
  maintenanceMode: boolean;
  enabledBusinessTypes: Record<string, boolean>;
  updatedAt?: string;
}

const DEFAULT_SETTINGS: PlatformSettingsData = {
  platformName: 'Roam Fleet',
  defaultCurrency: 'JMD',
  platformVersion: '1.0.0',
  maintenanceMode: false,
  enabledBusinessTypes: {
    rideshare: true,
    delivery: true,
    taxi: true,
    trucking: true,
    shipping: true,
  },
};

const BUSINESS_TYPE_DEFS = [
  { key: 'rideshare', label: 'Rideshare', description: 'Uber, Lyft-style ride services', icon: Car },
  { key: 'delivery', label: 'Delivery / Courier', description: 'Package delivery, document courier, last-mile', icon: Package },
  { key: 'taxi', label: 'Taxi / Cab', description: 'Traditional taxi and dispatch services', icon: Navigation },
  { key: 'trucking', label: 'Trucking / Haulage', description: 'Long-haul freight, cargo transport', icon: Truck },
  { key: 'shipping', label: 'Shipping / Logistics', description: 'Maritime, port logistics, container transport', icon: Ship },
];

const CURRENCY_OPTIONS = [
  { value: 'JMD', label: 'JMD — Jamaican Dollar' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'TTD', label: 'TTD — Trinidad & Tobago Dollar' },
  { value: 'BBD', label: 'BBD — Barbados Dollar' },
];

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
export function PlatformSettings() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;

  const [settings, setSettings] = useState<PlatformSettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // ---------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/platform-settings`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    } catch (err: any) {
      console.error('PlatformSettings load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ---------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------
  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/platform-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      console.error('PlatformSettings save error:', err);
      setError(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------
  // Update helpers
  // ---------------------------------------------------------------
  const updateField = (field: keyof PlatformSettingsData, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const toggleBusinessType = (key: string) => {
    setSettings(prev => ({
      ...prev,
      enabledBusinessTypes: {
        ...prev.enabledBusinessTypes,
        [key]: !prev.enabledBusinessTypes[key],
      },
    }));
    setDirty(true);
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Platform Settings</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Configure global platform options that affect all customer accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSettings}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
              ${saved
                ? 'bg-emerald-600 text-white'
                : dirty
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }
            `}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Section: General ── */}
      <SettingsSection
        icon={<Globe className="w-4 h-4 text-blue-400" />}
        title="General"
        description="Core platform identity and configuration."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Platform Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Platform Name</label>
            <input
              type="text"
              value={settings.platformName}
              onChange={e => updateField('platformName', e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="Roam Fleet"
            />
          </div>

          {/* Default Currency */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Default Currency</label>
            <select
              value={settings.defaultCurrency}
              onChange={e => updateField('defaultCurrency', e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              {CURRENCY_OPTIONS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Platform Version */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Platform Version</label>
            <input
              type="text"
              value={settings.platformVersion}
              onChange={e => updateField('platformVersion', e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="1.0.0"
            />
          </div>

          {/* Maintenance Mode */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Maintenance Mode</label>
            <button
              onClick={() => updateField('maintenanceMode', !settings.maintenanceMode)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors w-full
                ${settings.maintenanceMode
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
                }
              `}
            >
              {settings.maintenanceMode
                ? <ToggleRight className="w-5 h-5" />
                : <ToggleLeft className="w-5 h-5" />
              }
              {settings.maintenanceMode ? 'Enabled — Platform in Maintenance' : 'Disabled — Normal Operation'}
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* ── Section: Business Types ── */}
      <SettingsSection
        icon={<Building2 className="w-4 h-4 text-purple-400" />}
        title="Business Types"
        description="Toggle which business types appear on the Fleet Manager registration form. Disabling a type does NOT delete existing accounts of that type — it only hides the option from new signups."
      >
        <div className="space-y-2">
          {BUSINESS_TYPE_DEFS.map(bt => {
            const enabled = settings.enabledBusinessTypes[bt.key] !== false;
            const IconComp = bt.icon;
            return (
              <button
                key={bt.key}
                onClick={() => toggleBusinessType(bt.key)}
                className={`w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all
                  ${enabled
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-slate-800 bg-slate-900/50 opacity-60'
                  }
                `}
              >
                <div className={`p-2 rounded-lg ${enabled ? 'bg-amber-500/15' : 'bg-slate-800'}`}>
                  <IconComp className={`w-5 h-5 ${enabled ? 'text-amber-400' : 'text-slate-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${enabled ? 'text-white' : 'text-slate-500'}`}>
                    {bt.label}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{bt.description}</p>
                </div>
                <div className={`shrink-0 ${enabled ? 'text-amber-400' : 'text-slate-600'}`}>
                  {enabled
                    ? <ToggleRight className="w-6 h-6" />
                    : <ToggleLeft className="w-6 h-6" />
                  }
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5 mt-3">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-300/80">
            Changes take effect on the signup page immediately after saving. Existing fleet manager accounts are not affected.
          </p>
        </div>
      </SettingsSection>

      {/* ── Section: System Info ── */}
      <SettingsSection
        icon={<Server className="w-4 h-4 text-emerald-400" />}
        title="System Information"
        description="Read-only system details and admin account information."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ReadOnlyField label="Super Admin" value={user?.email || '—'} />
          <ReadOnlyField label="Admin Role" value={user?.user_metadata?.role || 'superadmin'} />
          <ReadOnlyField label="Platform" value="Roam Fleet — Figma Make" />
          <ReadOnlyField label="Environment" value="Production" />
          <ReadOnlyField
            label="Settings Last Updated"
            value={
              settings.updatedAt
                ? new Date(settings.updatedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Never saved'
            }
          />
          <ReadOnlyField label="Backend" value="Supabase Edge Functions + KV" />
        </div>
      </SettingsSection>

      {/* ── Section: Security ── */}
      <SettingsSection
        icon={<Shield className="w-4 h-4 text-red-400" />}
        title="Security"
        description="API keys and integrations. These are managed via Supabase secrets."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SecretField label="OpenAI API Key" configured />
          <SecretField label="Gemini API Key" configured />
          <SecretField label="Google Maps API Key" configured />
          <SecretField label="Supabase Service Role Key" configured />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          API keys are stored as Supabase secrets and cannot be viewed here. To rotate a key, update it in the Supabase dashboard.
        </p>
      </SettingsSection>
    </div>
  );
}

// ===================================================================
// Sub-components
// ===================================================================

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">{description}</p>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-800 rounded-lg px-3 py-2.5">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-slate-300 truncate">{value}</p>
    </div>
  );
}

function SecretField({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="bg-slate-800/50 border border-slate-800 rounded-lg px-3 py-2.5 flex items-center justify-between">
      <div>
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm text-slate-500 font-mono">{'•'.repeat(20)}</p>
      </div>
      {configured && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
          <Check className="w-3 h-3" />
          Set
        </span>
      )}
    </div>
  );
}
