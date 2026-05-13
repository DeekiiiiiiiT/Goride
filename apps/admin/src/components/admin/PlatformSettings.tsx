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
  Zap,
  Fuel,
  MapPin,
  FileText,
  BarChart3,
  Wrench,
  UserPlus,
  Lock,
  AtSign,
  X,
  KeyRound,
  Activity,
  Timer,
  ShieldAlert,
  Ban,
  Megaphone,
  AlertTriangle,
  Download,
  Trash2,
  HeartPulse,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
interface PlatformSettingsData {
  platformName: string;
  defaultCurrency: string;
  fleetTimezone: string;
  platformVersion: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  enabledBusinessTypes: Record<string, boolean>;
  enabledModules: {
    fuelManagement: boolean;
    tollManagement: boolean;
    driverPortal: boolean;
    fleetEquipment: boolean;
    claimableLoss: boolean;
    performanceAnalytics: boolean;
  };
  registrationMode: 'open' | 'invite_only' | 'domain_restricted';
  allowedDomains: string[];
  requireApproval: boolean;
  welcomeEmailMessage: string;
  securityPolicies: {
    minPasswordLength: number;
    requireUppercase: boolean;
    requireNumber: boolean;
    requireSpecialChar: boolean;
    sessionTimeoutMinutes: number;
    maxLoginAttempts: number;
    lockoutDurationMinutes: number;
  };
  announcement: {
    enabled: boolean;
    message: string;
    type: 'info' | 'warning' | 'critical';
    startDate: string | null;
    endDate: string | null;
    dismissible: boolean;
  };
  updatedAt?: string;
}

const DEFAULT_SETTINGS: PlatformSettingsData = {
  platformName: 'Roam Fleet',
  defaultCurrency: 'JMD',
  fleetTimezone: 'America/Jamaica',
  platformVersion: '1.0.0',
  maintenanceMode: false,
  maintenanceMessage: '',
  enabledBusinessTypes: {
    rideshare: true,
    delivery: true,
    taxi: true,
    trucking: true,
    shipping: true,
  },
  enabledModules: {
    fuelManagement: true,
    tollManagement: true,
    driverPortal: true,
    fleetEquipment: true,
    claimableLoss: true,
    performanceAnalytics: true,
  },
  registrationMode: 'open',
  allowedDomains: [],
  requireApproval: false,
  welcomeEmailMessage: '',
  securityPolicies: {
    minPasswordLength: 8,
    requireUppercase: false,
    requireNumber: false,
    requireSpecialChar: false,
    sessionTimeoutMinutes: 0,
    maxLoginAttempts: 0,
    lockoutDurationMinutes: 15,
  },
  announcement: {
    enabled: false,
    message: '',
    type: 'info',
    startDate: null,
    endDate: null,
    dismissible: true,
  },
};

const BUSINESS_TYPE_DEFS = [
  { key: 'rideshare', label: 'Rideshare', description: 'Uber, InDrive-style ride services', icon: Car },
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

const TIMEZONE_OPTIONS = [
  { value: 'America/Jamaica', label: 'America/Jamaica — Jamaica (EST, no DST)' },
  { value: 'America/New_York', label: 'America/New_York — US Eastern' },
  { value: 'America/Chicago', label: 'America/Chicago — US Central' },
  { value: 'America/Denver', label: 'America/Denver — US Mountain' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles — US Pacific' },
  { value: 'America/Toronto', label: 'America/Toronto — Canada Eastern' },
  { value: 'America/Port_of_Spain', label: 'America/Port_of_Spain — Trinidad & Tobago' },
  { value: 'America/Barbados', label: 'America/Barbados — Barbados' },
  { value: 'America/Panama', label: 'America/Panama — Panama' },
  { value: 'America/Bogota', label: 'America/Bogota — Colombia' },
  { value: 'Europe/London', label: 'Europe/London — United Kingdom' },
  { value: 'UTC', label: 'UTC — Coordinated Universal Time' },
];

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
export function PlatformSettings({ activeTab: externalTab }: { activeTab?: string } = {}) {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;

  const [settings, setSettings] = useState<PlatformSettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const activeTab = externalTab || 'general';

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

  const toggleModule = (key: keyof PlatformSettingsData['enabledModules']) => {
    setSettings(prev => ({
      ...prev,
      enabledModules: {
        ...prev.enabledModules,
        [key]: !prev.enabledModules[key],
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
    <div className="space-y-6 max-w-3xl">
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

      {/* ── Tab: General ── */}
      {activeTab === 'general' && <>
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

          {/* Fleet Timezone */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Fleet Timezone</label>
            <select
              value={settings.fleetTimezone}
              onChange={e => updateField('fleetTimezone', e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              {TIMEZONE_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
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

        {/* Maintenance Message — only shown when maintenance mode is enabled */}
        {settings.maintenanceMode && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Maintenance Message</label>
            <textarea
              value={settings.maintenanceMessage}
              onChange={e => {
                if (e.target.value.length <= 200) {
                  updateField('maintenanceMessage', e.target.value);
                }
              }}
              rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
              placeholder="We're performing scheduled maintenance. Back soon!"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-slate-500">
                Shown to users on the maintenance page. Leave blank for the default message.
              </p>
              <span className={`text-[10px] font-mono ${settings.maintenanceMessage.length > 180 ? 'text-amber-400' : 'text-slate-600'}`}>
                {settings.maintenanceMessage.length}/200
              </span>
            </div>
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 mt-2">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300/80">
                When maintenance mode is active, all fleet managers, team members, and drivers are blocked from using the platform. Only platform administrators can access the admin portal.
              </p>
            </div>
          </div>
        )}
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
      </>}

      {/* ── Tab: Security ── */}
      {activeTab === 'security' && <>
      {/* ── Section: Security ── */}
      <SettingsSection
        icon={<Shield className="w-4 h-4 text-red-400" />}
        title="Security"
        description="API keys, password policies, session management, and emergency controls."
      >
        {/* Sub-area 1: API Keys — moved to API Command Center */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> API Keys & Secrets
          </h3>
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg px-4 py-3 flex items-start gap-3 text-sm">
            <Activity className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-slate-300">
                API key management has moved to the <strong className="text-amber-300">API Command Center</strong>.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Use the sidebar to open <strong className="text-slate-300">API Command Center → API Keys</strong> to
                view masked keys, see rotation history, and rotate keys via the Supabase Management API.
              </p>
            </div>
          </div>
        </div>

        {/* Sub-area 2: Password Policy */}
        <div className="mb-5 pt-4 border-t border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Password Policy
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Minimum Password Length</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={8}
                  max={32}
                  value={settings.securityPolicies?.minPasswordLength ?? 8}
                  onChange={e => updateField('securityPolicies', { ...settings.securityPolicies, minPasswordLength: parseInt(e.target.value) })}
                  className="flex-1 accent-amber-500"
                />
                <span className="text-sm font-mono text-amber-400 w-8 text-center">{settings.securityPolicies?.minPasswordLength ?? 8}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { key: 'requireUppercase', label: 'Uppercase (A-Z)' },
                { key: 'requireNumber', label: 'Number (0-9)' },
                { key: 'requireSpecialChar', label: 'Special (!@#$%)' },
              ] as const).map(opt => {
                const val = settings.securityPolicies?.[opt.key] ?? false;
                return (
                  <button
                    key={opt.key}
                    onClick={() => updateField('securityPolicies', { ...settings.securityPolicies, [opt.key]: !val })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors
                      ${val ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-400'}
                    `}
                  >
                    {val ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {/* Preview */}
            <div className="bg-slate-800/50 border border-slate-800 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-400">
                Passwords must be at least <span className="text-white font-medium">{settings.securityPolicies?.minPasswordLength ?? 8}</span> characters
                {settings.securityPolicies?.requireUppercase && <>, contain an <span className="text-white font-medium">uppercase letter</span></>}
                {settings.securityPolicies?.requireNumber && <>, a <span className="text-white font-medium">number</span></>}
                {settings.securityPolicies?.requireSpecialChar && <>, and a <span className="text-white font-medium">special character</span></>}
                .
              </p>
            </div>
          </div>
        </div>

        {/* Sub-area 3: Session Management */}
        <div className="mb-5 pt-4 border-t border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5" /> Session Management
          </h3>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Auto-logout after inactivity</label>
            <select
              value={settings.securityPolicies?.sessionTimeoutMinutes ?? 0}
              onChange={e => updateField('securityPolicies', { ...settings.securityPolicies, sessionTimeoutMinutes: parseInt(e.target.value) })}
              className="w-full sm:w-64 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value={60}>1 hour</option>
              <option value={240}>4 hours</option>
              <option value={480}>8 hours</option>
              <option value={1440}>24 hours</option>
              <option value={10080}>7 days</option>
              <option value={0}>Never (not recommended)</option>
            </select>
          </div>
          <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5 mt-2">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-300/80">
              This applies to all fleet managers, team members, and drivers. Platform administrators are not affected.
            </p>
          </div>
        </div>

        {/* Sub-area 4: Login Protection */}
        <div className="mb-5 pt-4 border-t border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> Login Protection
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Maximum failed login attempts</label>
              <input
                type="number"
                min={0}
                max={20}
                value={settings.securityPolicies?.maxLoginAttempts ?? 0}
                onChange={e => updateField('securityPolicies', { ...settings.securityPolicies, maxLoginAttempts: Math.max(0, Math.min(20, parseInt(e.target.value) || 0)) })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="0 = unlimited"
              />
            </div>
            {(settings.securityPolicies?.maxLoginAttempts ?? 0) > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Lockout duration</label>
                <select
                  value={settings.securityPolicies?.lockoutDurationMinutes ?? 15}
                  onChange={e => updateField('securityPolicies', { ...settings.securityPolicies, lockoutDurationMinutes: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>
            )}
          </div>
          {(settings.securityPolicies?.maxLoginAttempts ?? 0) === 0 && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 mt-2">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300/80">
                Unlimited login attempts are not recommended for production environments.
              </p>
            </div>
          )}
        </div>

        {/* Sub-area 5: Emergency Actions */}
        <SecurityEmergencyActions accessToken={accessToken} />
      </SettingsSection>
      </>}

      {/* ── Tab: Features ── */}
      {activeTab === 'features' && <>
      {/* ── Section: Modules ── */}
      <SettingsSection
        icon={<Wrench className="w-4 h-4 text-indigo-400" />}
        title="Modules"
        description="Enable or disable additional features for fleet management."
      >
        <div className="space-y-2">
          <button
            onClick={() => toggleModule('fuelManagement')}
            className={`w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all
              ${settings.enabledModules.fuelManagement
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-slate-800 bg-slate-900/50 opacity-60'
              }
            `}
          >
            <div className={`p-2 rounded-lg ${settings.enabledModules.fuelManagement ? 'bg-amber-500/15' : 'bg-slate-800'}`}>
              <Fuel className={`w-5 h-5 ${settings.enabledModules.fuelManagement ? 'text-amber-400' : 'text-slate-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${settings.enabledModules.fuelManagement ? 'text-white' : 'text-slate-500'}`}>
                Fuel Management
              </p>
              <p className="text-xs text-slate-500 truncate">Track and manage fuel consumption and costs.</p>
            </div>
            <div className={`shrink-0 ${settings.enabledModules.fuelManagement ? 'text-amber-400' : 'text-slate-600'}`}>
              {settings.enabledModules.fuelManagement
                ? <ToggleRight className="w-6 h-6" />
                : <ToggleLeft className="w-6 h-6" />
              }
            </div>
          </button>

          <button
            onClick={() => toggleModule('tollManagement')}
            className={`w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all
              ${settings.enabledModules.tollManagement
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-slate-800 bg-slate-900/50 opacity-60'
              }
            `}
          >
            <div className={`p-2 rounded-lg ${settings.enabledModules.tollManagement ? 'bg-amber-500/15' : 'bg-slate-800'}`}>
              <MapPin className={`w-5 h-5 ${settings.enabledModules.tollManagement ? 'text-amber-400' : 'text-slate-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${settings.enabledModules.tollManagement ? 'text-white' : 'text-slate-500'}`}>
                Toll Management
              </p>
              <p className="text-xs text-slate-500 truncate">Automate toll payments and track toll expenses.</p>
            </div>
            <div className={`shrink-0 ${settings.enabledModules.tollManagement ? 'text-amber-400' : 'text-slate-600'}`}>
              {settings.enabledModules.tollManagement
                ? <ToggleRight className="w-6 h-6" />
                : <ToggleLeft className="w-6 h-6" />
              }
            </div>
          </button>

          <button
            onClick={() => toggleModule('driverPortal')}
            className={`w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all
              ${settings.enabledModules.driverPortal
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-slate-800 bg-slate-900/50 opacity-60'
              }
            `}
          >
            <div className={`p-2 rounded-lg ${settings.enabledModules.driverPortal ? 'bg-amber-500/15' : 'bg-slate-800'}`}>
              <Car className={`w-5 h-5 ${settings.enabledModules.driverPortal ? 'text-amber-400' : 'text-slate-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${settings.enabledModules.driverPortal ? 'text-white' : 'text-slate-500'}`}>
                Driver Portal
              </p>
              <p className="text-xs text-slate-500 truncate">Provide drivers with a portal to manage their schedules and earnings.</p>
            </div>
            <div className={`shrink-0 ${settings.enabledModules.driverPortal ? 'text-amber-400' : 'text-slate-600'}`}>
              {settings.enabledModules.driverPortal
                ? <ToggleRight className="w-6 h-6" />
                : <ToggleLeft className="w-6 h-6" />
              }
            </div>
          </button>

          <button
            onClick={() => toggleModule('fleetEquipment')}
            className={`w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all
              ${settings.enabledModules.fleetEquipment
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-slate-800 bg-slate-900/50 opacity-60'
              }
            `}
          >
            <div className={`p-2 rounded-lg ${settings.enabledModules.fleetEquipment ? 'bg-amber-500/15' : 'bg-slate-800'}`}>
              <Package className={`w-5 h-5 ${settings.enabledModules.fleetEquipment ? 'text-amber-400' : 'text-slate-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${settings.enabledModules.fleetEquipment ? 'text-white' : 'text-slate-500'}`}>
                Fleet Equipment
              </p>
              <p className="text-xs text-slate-500 truncate">Manage and track the equipment in your fleet.</p>
            </div>
            <div className={`shrink-0 ${settings.enabledModules.fleetEquipment ? 'text-amber-400' : 'text-slate-600'}`}>
              {settings.enabledModules.fleetEquipment
                ? <ToggleRight className="w-6 h-6" />
                : <ToggleLeft className="w-6 h-6" />
              }
            </div>
          </button>

          <button
            onClick={() => toggleModule('claimableLoss')}
            className={`w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all
              ${settings.enabledModules.claimableLoss
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-slate-800 bg-slate-900/50 opacity-60'
              }
            `}
          >
            <div className={`p-2 rounded-lg ${settings.enabledModules.claimableLoss ? 'bg-amber-500/15' : 'bg-slate-800'}`}>
              <FileText className={`w-5 h-5 ${settings.enabledModules.claimableLoss ? 'text-amber-400' : 'text-slate-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${settings.enabledModules.claimableLoss ? 'text-white' : 'text-slate-500'}`}>
                Claimable Loss
              </p>
              <p className="text-xs text-slate-500 truncate">Manage and track claimable losses for your fleet.</p>
            </div>
            <div className={`shrink-0 ${settings.enabledModules.claimableLoss ? 'text-amber-400' : 'text-slate-600'}`}>
              {settings.enabledModules.claimableLoss
                ? <ToggleRight className="w-6 h-6" />
                : <ToggleLeft className="w-6 h-6" />
              }
            </div>
          </button>

          <button
            onClick={() => toggleModule('performanceAnalytics')}
            className={`w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all
              ${settings.enabledModules.performanceAnalytics
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-slate-800 bg-slate-900/50 opacity-60'
              }
            `}
          >
            <div className={`p-2 rounded-lg ${settings.enabledModules.performanceAnalytics ? 'bg-amber-500/15' : 'bg-slate-800'}`}>
              <BarChart3 className={`w-5 h-5 ${settings.enabledModules.performanceAnalytics ? 'text-amber-400' : 'text-slate-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${settings.enabledModules.performanceAnalytics ? 'text-white' : 'text-slate-500'}`}>
                Performance Analytics
              </p>
              <p className="text-xs text-slate-500 truncate">Analyze and visualize performance metrics for your fleet.</p>
            </div>
            <div className={`shrink-0 ${settings.enabledModules.performanceAnalytics ? 'text-amber-400' : 'text-slate-600'}`}>
              {settings.enabledModules.performanceAnalytics
                ? <ToggleRight className="w-6 h-6" />
                : <ToggleLeft className="w-6 h-6" />
              }
            </div>
          </button>
        </div>
      </SettingsSection>
      </>}

      {/* ── Tab: Registration ── */}
      {activeTab === 'registration' && <>
      <RegistrationSection settings={settings} updateField={updateField} setSettings={setSettings} setDirty={setDirty} />
      </>}

      {/* ── Tab: Announcements ── */}
      {activeTab === 'announcements' && <>
      <AnnouncementSection settings={settings} updateField={updateField} setSettings={setSettings} setDirty={setDirty} />
      </>}

      {/* ── Tab: Danger Zone ── */}
      {activeTab === 'danger' && <>
      <DangerZoneSection accessToken={accessToken} settings={settings} setSettings={setSettings} setSaving={setSaving} setSaved={setSaved} setError={setError} setDirty={setDirty} />
      </>}
    </div>
  );
}

// ===================================================================
// Registration & Onboarding Section
// ===================================================================
const REGISTRATION_MODES = [
  { value: 'open' as const, label: 'Open Registration', description: 'Anyone can create a fleet manager account. Suitable for public platforms.', icon: Globe },
  { value: 'invite_only' as const, label: 'Invite Only', description: 'Registration is disabled. Only accounts created by platform administrators can access the system.', icon: Lock },
  { value: 'domain_restricted' as const, label: 'Domain Restricted', description: 'Only email addresses from approved domains can register.', icon: AtSign },
];

function RegistrationSection({ settings, updateField, setSettings, setDirty }: {
  settings: PlatformSettingsData;
  updateField: (field: keyof PlatformSettingsData, value: any) => void;
  setSettings: React.Dispatch<React.SetStateAction<PlatformSettingsData>>;
  setDirty: (v: boolean) => void;
}) {
  const [domainInput, setDomainInput] = React.useState('');

  const addDomain = () => {
    const d = domainInput.trim().replace(/^@/, '').toLowerCase();
    if (!d || !d.includes('.') || d.includes(' ')) return;
    if (settings.allowedDomains.includes(d)) { setDomainInput(''); return; }
    setSettings(prev => ({ ...prev, allowedDomains: [...prev.allowedDomains, d] }));
    setDirty(true);
    setDomainInput('');
  };

  const removeDomain = (d: string) => {
    setSettings(prev => ({ ...prev, allowedDomains: prev.allowedDomains.filter(x => x !== d) }));
    setDirty(true);
  };

  return (
    <SettingsSection
      icon={<UserPlus className="w-4 h-4 text-emerald-400" />}
      title="Registration & Onboarding"
      description="Control how new fleet managers can register on the platform."
    >
      {/* Registration Mode — Radio cards */}
      <div className="space-y-2 mb-4">
        {REGISTRATION_MODES.map(mode => {
          const selected = settings.registrationMode === mode.value;
          const IconComp = mode.icon;
          return (
            <button
              key={mode.value}
              onClick={() => updateField('registrationMode', mode.value)}
              className={`w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all
                ${selected
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-slate-800 bg-slate-900/50 opacity-60 hover:opacity-80'
                }
              `}
            >
              <div className={`p-2 rounded-lg ${selected ? 'bg-emerald-500/15' : 'bg-slate-800'}`}>
                <IconComp className={`w-5 h-5 ${selected ? 'text-emerald-400' : 'text-slate-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${selected ? 'text-white' : 'text-slate-500'}`}>
                  {mode.label}
                </p>
                <p className="text-xs text-slate-500">{mode.description}</p>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center
                ${selected ? 'border-emerald-400' : 'border-slate-600'}
              `}>
                {selected && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Allowed Domains — only when domain_restricted */}
      {settings.registrationMode === 'domain_restricted' && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Allowed Domains</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={domainInput}
              onChange={e => setDomainInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }}
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="Type a domain (e.g. myfleet.com) and press Enter"
            />
            <button
              onClick={addDomain}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
            >
              Add
            </button>
          </div>
          {settings.allowedDomains.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {settings.allowedDomains.map(d => (
                <span key={d} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-full">
                  @{d}
                  <button onClick={() => removeDomain(d)} className="hover:text-red-400 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {settings.allowedDomains.length === 0 && (
            <p className="text-[10px] text-amber-400 mt-1">No domains added yet. Users won't be able to register until at least one domain is added.</p>
          )}
        </div>
      )}

      {/* Require Admin Approval */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Require Admin Approval</label>
        <button
          onClick={() => updateField('requireApproval', !settings.requireApproval)}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors w-full
            ${settings.requireApproval
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
              : 'bg-slate-800 border-slate-700 text-slate-400'
            }
          `}
        >
          {settings.requireApproval
            ? <ToggleRight className="w-5 h-5" />
            : <ToggleLeft className="w-5 h-5" />
          }
          {settings.requireApproval ? 'Enabled — New accounts need admin approval' : 'Disabled — Accounts are active immediately'}
        </button>
        {settings.requireApproval && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 mt-2">
            <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300/80">
              When enabled, new registrations will appear in Customer Accounts with a "Pending Approval" badge. You must approve each account before the fleet manager can log in.
            </p>
          </div>
        )}
      </div>

      {/* Welcome Message */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Welcome Message</label>
        <textarea
          value={settings.welcomeEmailMessage}
          onChange={e => {
            if (e.target.value.length <= 500) {
              updateField('welcomeEmailMessage', e.target.value);
            }
          }}
          rows={3}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
          placeholder="Welcome to Roam Fleet! Your account has been set up..."
        />
        <div className="flex items-center justify-between mt-1">
          <p className="text-[10px] text-slate-500">
            Shown to new users on their first login. Leave blank to skip.
          </p>
          <span className={`text-[10px] font-mono ${settings.welcomeEmailMessage.length > 450 ? 'text-amber-400' : 'text-slate-600'}`}>
            {settings.welcomeEmailMessage.length}/500
          </span>
        </div>
      </div>
    </SettingsSection>
  );
}

// ===================================================================
// Announcement Section
// ===================================================================
function AnnouncementSection({ settings, updateField }: {
  settings: PlatformSettingsData;
  updateField: (field: keyof PlatformSettingsData, value: any) => void;
  setSettings: React.Dispatch<React.SetStateAction<PlatformSettingsData>>;
  setDirty: (v: boolean) => void;
}) {
  const ann = settings.announcement || { enabled: false, message: '', type: 'info' as const, startDate: null, endDate: null, dismissible: true };
  const updateAnn = (partial: Partial<typeof ann>) => updateField('announcement', { ...ann, ...partial });

  const TYPES = [
    { value: 'info' as const, label: 'Info', desc: 'Feature updates', color: 'blue' },
    { value: 'warning' as const, label: 'Warning', desc: 'Disruptions', color: 'amber' },
    { value: 'critical' as const, label: 'Critical', desc: 'Urgent issues', color: 'red' },
  ];
  const colorMap: Record<string, { bg: string; text: string; icon: React.ComponentType<any> }> = {
    info: { bg: 'bg-blue-500', text: 'text-white', icon: Info },
    warning: { bg: 'bg-amber-500', text: 'text-amber-950', icon: AlertTriangle },
    critical: { bg: 'bg-red-600', text: 'text-white', icon: AlertCircle },
  };

  return (
    <SettingsSection
      icon={<Megaphone className="w-4 h-4 text-orange-400" />}
      title="Platform Announcements"
      description="Broadcast a message banner to all fleet managers and drivers across the platform."
    >
      <div className="mb-4">
        <button
          onClick={() => updateAnn({ enabled: !ann.enabled })}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors w-full
            ${ann.enabled ? 'bg-orange-500/15 border-orange-500/40 text-orange-400' : 'bg-slate-800 border-slate-700 text-slate-400'}
          `}
        >
          {ann.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          {ann.enabled ? 'Show announcement banner' : 'Announcement banner disabled'}
        </button>
      </div>

      {ann.enabled && (
        <>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Message</label>
            <textarea
              value={ann.message}
              onChange={e => { if (e.target.value.length <= 300) updateAnn({ message: e.target.value }); }}
              rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              placeholder="We're upgrading our systems this weekend..."
            />
            <span className={`text-[10px] font-mono float-right ${ann.message.length > 270 ? 'text-amber-400' : 'text-slate-600'}`}>
              {ann.message.length}/300
            </span>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => {
                const sel = ann.type === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => updateAnn({ type: t.value })}
                    className={`rounded-lg border-2 px-3 py-2.5 text-left transition-all text-xs
                      ${sel
                        ? t.color === 'blue' ? 'border-blue-500/40 bg-blue-500/10' : t.color === 'amber' ? 'border-amber-500/40 bg-amber-500/10' : 'border-red-500/40 bg-red-500/10'
                        : 'border-slate-800 bg-slate-900/50 opacity-60 hover:opacity-80'
                      }
                    `}
                  >
                    <p className={`font-medium ${sel ? 'text-white' : 'text-slate-500'}`}>{t.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Schedule (optional)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Start showing</label>
                <input type="date" value={ann.startDate || ''} onChange={e => updateAnn({ startDate: e.target.value || null })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Stop showing</label>
                <input type="date" value={ann.endDate || ''} onChange={e => updateAnn({ endDate: e.target.value || null })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Leave blank to show immediately / until you disable it.</p>
          </div>

          <div className="mb-4">
            <button
              onClick={() => updateAnn({ dismissible: !ann.dismissible })}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors w-full
                ${ann.dismissible ? 'bg-orange-500/15 border-orange-500/40 text-orange-400' : 'bg-slate-800 border-slate-700 text-slate-400'}
              `}
            >
              {ann.dismissible ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {ann.dismissible ? 'Users can dismiss the banner' : 'Banner cannot be dismissed'}
            </button>
          </div>

          {ann.message && (
            <div className="mt-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Live Preview</label>
              <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${colorMap[ann.type].bg}`}>
                {React.createElement(colorMap[ann.type].icon, { className: `w-4 h-4 ${colorMap[ann.type].text} shrink-0` })}
                <p className={`text-sm flex-1 ${colorMap[ann.type].text}`}>{ann.message}</p>
                {ann.dismissible && <X className={`w-4 h-4 ${colorMap[ann.type].text} opacity-60 shrink-0`} />}
              </div>
            </div>
          )}
        </>
      )}
    </SettingsSection>
  );
}

// ===================================================================
// Danger Zone Section
// ===================================================================
function DangerZoneSection({ accessToken, settings, setSettings, setSaving, setSaved, setError, setDirty }: {
  accessToken?: string;
  settings: PlatformSettingsData;
  setSettings: React.Dispatch<React.SetStateAction<PlatformSettingsData>>;
  setSaving: (v: boolean) => void;
  setSaved: (v: boolean) => void;
  setError: (v: string | null) => void;
  setDirty: (v: boolean) => void;
}) {
  const [exportLoading, setExportLoading] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };

  const handleExport = async () => {
    setExportLoading(true);
    setActionResult(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/export-data`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roam-fleet-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setActionResult({ type: 'success', msg: `Export complete — ${data.totalEntries || 0} entries.` });
    } catch (e: any) {
      setActionResult({ type: 'error', msg: e.message });
    } finally {
      setExportLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/system-health`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setHealthData(data);
    } catch (e: any) {
      setHealthData({ dbStatus: 'error', error: e.message });
    } finally {
      setHealthLoading(false);
    }
  };

  const handlePurge = async () => {
    setPurgeLoading(true);
    setActionResult(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/purge-synthetic`, { method: 'POST', headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setActionResult({ type: 'success', msg: `Purge complete — ${data.count || 0} synthetic entries removed.` });
      setPurgeConfirm(false);
    } catch (e: any) {
      setActionResult({ type: 'error', msg: e.message });
    } finally {
      setPurgeLoading(false);
    }
  };

  const handleReset = async () => {
    setResetLoading(true);
    setActionResult(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/platform-settings`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(DEFAULT_SETTINGS),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSettings({ ...DEFAULT_SETTINGS });
      setDirty(false);
      setResetConfirm(false);
      setResetText('');
      setActionResult({ type: 'success', msg: 'All platform settings have been reset to factory defaults.' });
    } catch (e: any) {
      setActionResult({ type: 'error', msg: e.message });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <SettingsSection
      icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
      title="Danger Zone"
      description="Destructive operations and advanced system tools. Handle with care."
      className="bg-slate-900 border-2 border-red-500/30 rounded-xl p-5"
    >
      <div className="space-y-4">
        {/* Export */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-500/15 shrink-0 mt-0.5">
            <Download className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Export Platform Data</p>
            <p className="text-xs text-slate-500 mt-0.5">Download a full JSON backup of all platform data, including settings, customers, drivers, fuel logs, toll logs, and audit trail.</p>
            <button onClick={handleExport} disabled={exportLoading}
              className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
              {exportLoading ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>

        {/* Purge Test Data */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/15 shrink-0 mt-0.5">
            <Trash2 className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Purge Test Data</p>
            <p className="text-xs text-slate-500 mt-0.5">Remove synthetic/test data generated by the Chaos Seeder. This does NOT delete real customer accounts, drivers, or settings.</p>
            {!purgeConfirm ? (
              <button onClick={() => setPurgeConfirm(true)}
                className="mt-2 px-3 py-1.5 border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-medium rounded-lg transition-colors">
                Purge Test Data
              </button>
            ) : (
              <div className="mt-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs text-red-300 mb-2">Are you sure? This will delete all entries marked as synthetic. This action cannot be undone.</p>
                <div className="flex gap-2">
                  <button onClick={handlePurge} disabled={purgeLoading}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
                    {purgeLoading ? 'Purging...' : 'Yes, Purge'}
                  </button>
                  <button onClick={() => setPurgeConfirm(false)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/15 shrink-0 mt-0.5">
            <HeartPulse className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">System Health</p>
            <p className="text-xs text-slate-500 mt-0.5">Check database connectivity, KV row count, and last settings update.</p>
            <button onClick={handleHealthCheck} disabled={healthLoading}
              className="mt-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
              {healthLoading ? 'Checking...' : 'Run Health Check'}
            </button>
            {healthData && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-900 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-slate-500">DB Status</p>
                  <p className={`text-sm font-medium ${healthData.dbStatus === 'healthy' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {healthData.dbStatus === 'healthy' ? 'Healthy' : 'Error'}
                  </p>
                </div>
                <div className="bg-slate-900 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-slate-500">KV Rows</p>
                  <p className="text-sm font-medium text-white">{healthData.kvRowCount ?? '—'}</p>
                </div>
                <div className="bg-slate-900 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-slate-500">Last Update</p>
                  <p className="text-sm font-medium text-white">{healthData.lastSettingsUpdate ? new Date(healthData.lastSettingsUpdate).toLocaleDateString() : '—'}</p>
                </div>
                <div className="bg-slate-900 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-slate-500">Server Time</p>
                  <p className="text-sm font-medium text-white">{healthData.serverTime ? new Date(healthData.serverTime).toLocaleTimeString() : '—'}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reset All Settings */}
        <div className="bg-red-500/5 border-2 border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-500/15 shrink-0 mt-0.5">
            <RotateCcw className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">Reset Platform Settings</p>
            <p className="text-xs text-slate-500 mt-0.5">Restore all settings to their factory defaults. This resets general config, feature flags, registration mode, security policies, and announcements.</p>
            {!resetConfirm ? (
              <button onClick={() => setResetConfirm(true)}
                className="mt-2 px-3 py-1.5 border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-medium rounded-lg transition-colors">
                Reset to Defaults
              </button>
            ) : (
              <div className="mt-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs text-red-300 mb-2">Are you sure? This will reset ALL platform settings to defaults. Type <strong>RESET</strong> to confirm.</p>
                <input
                  type="text"
                  value={resetText}
                  onChange={e => setResetText(e.target.value)}
                  placeholder="Type RESET"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 mb-2"
                />
                <div className="flex gap-2">
                  <button onClick={handleReset} disabled={resetText !== 'RESET' || resetLoading}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {resetLoading ? 'Resetting...' : 'Confirm Reset'}
                  </button>
                  <button onClick={() => { setResetConfirm(false); setResetText(''); }}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action result */}
        {actionResult && (
          <p className={`text-xs ${actionResult.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{actionResult.msg}</p>
        )}
      </div>
    </SettingsSection>
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
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className || "bg-slate-900 border border-slate-800 rounded-xl p-5"}>
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

// ===================================================================
// Security Emergency Actions
// ===================================================================
function SecurityEmergencyActions({ accessToken }: { accessToken?: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleTerminateAll = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/terminate-all-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(`All sessions terminated. ${data.count || 0} users signed out.`);
      setConfirming(false);
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-4 border-t border-slate-800">
      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Ban className="w-3.5 h-3.5" /> Emergency Actions
      </h3>
      <div className="bg-red-500/5 border-2 border-red-500/20 rounded-xl px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-500/15 shrink-0">
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">Terminate All Sessions</p>
            <p className="text-xs text-slate-500 mt-0.5">Force all users to re-authenticate. Use this after a security incident.</p>
          </div>
        </div>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Terminate All Sessions
          </button>
        ) : (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-xs text-red-300 mb-3">
              This will sign out <strong>ALL users</strong> (fleet managers, team members, and drivers) across the platform. Platform administrators will also be signed out. Are you sure?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleTerminateAll}
                disabled={loading}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Terminating...' : 'Yes, Terminate All'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {result && (
          <p className={`text-xs mt-2 ${result.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{result}</p>
        )}
      </div>
    </div>
  );
}