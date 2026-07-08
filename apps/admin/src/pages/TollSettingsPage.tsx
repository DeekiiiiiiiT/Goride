import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '../components/ui/switch';
import {
  SettingsSection,
  SettingLabel,
  isSectionDisabled,
  settingsInputClass,
  toggleRowClass,
} from '../components/admin/shared/SettingsSection';
import { useSettingsSection } from '../hooks/useSettingsSection';
import { useAuth } from '../components/auth/AuthContext';
import {
  getTollDispatchSettings,
  updateTollDispatchSettings,
  type TollDispatchSettings,
} from '../services/platform/ridesDispatchSettingsService';

const WRITE_ROLES = new Set(['platform_owner', 'superadmin', 'rides_admin', 'super_admin', 'super admin']);

const SECTION_KEYS: (keyof TollDispatchSettings)[] = [
  'toll_detection_enabled',
  'toll_geofence_radius_m',
  'toll_detect_enroute',
  'route_toll_estimation_enabled',
];

const TOOLTIPS = {
  toll_detection_enabled:
    'Enable real-time toll detection during trips. Tolls are detected via geofence and added to the final fare.',
  toll_geofence_radius_m:
    'Radius around toll plazas for geofence detection. Driver must pass within this distance for toll to be recorded.',
  toll_detect_enroute:
    'Also detect tolls crossed while en route to pickup (deadhead), not only during the trip. Keep off — deadhead is a driver expense.',
  route_toll_estimation_enabled:
    'Use route polyline intersection for toll estimates on quotes. When off, fare rules static estimated tolls apply.',
} as const;

function hasWriteAccess(role: string | undefined | null): boolean {
  if (!role) return false;
  return WRITE_ROLES.has(role);
}

export function TollSettingsPage() {
  const { session, role } = useAuth();
  const token = session?.access_token;
  const canEdit = hasWriteAccess(role);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<TollDispatchSettings | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const next = await getTollDispatchSettings(token);
      setSettings(next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load toll settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(
    async (patch: Partial<TollDispatchSettings>) => {
      if (!token) throw new Error('Not signed in');
      const next = await updateTollDispatchSettings(token, patch);
      setSettings(next);
      return next;
    },
    [token],
  );

  const {
    formData,
    isEditing,
    isSaving,
    error,
    startEdit,
    cancelEdit,
    saveChanges,
    updateField,
    resetData,
  } = useSettingsSection<TollDispatchSettings>({
    initialData: settings,
    sectionKeys: SECTION_KEYS,
    onSave: handleSave,
  });

  useEffect(() => {
    resetData(settings);
  }, [settings, resetData]);

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Toll Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Platform toll detection and quote estimation flags for Roam Rides.
        </p>
      </div>

      <SettingsSection
        title="Toll detection & quotes"
        description="Automatically detect tolls during trips and estimate tolls on fare quotes."
        canEdit={canEdit}
        isEditing={isEditing}
        isSaving={isSaving}
        onEdit={startEdit}
        onCancel={cancelEdit}
        onSave={saveChanges}
        error={error}
      >
        <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Enable toll detection"
              tooltip={TOOLTIPS.toll_detection_enabled}
            />
            <p className="text-xs text-slate-500">Live GPS geofence charges during trips</p>
          </div>
          <Switch
            disabled={disabled}
            checked={formData.toll_detection_enabled}
            onCheckedChange={(checked) => updateField('toll_detection_enabled', checked)}
          />
        </label>

        <label className="block space-y-1.5 mt-4">
          <SettingLabel
            label="Toll geofence radius (meters)"
            tooltip={TOOLTIPS.toll_geofence_radius_m}
          />
          <input
            type="number"
            min={50}
            max={500}
            disabled={disabled || !formData.toll_detection_enabled}
            value={formData.toll_geofence_radius_m}
            onChange={(e) =>
              updateField('toll_geofence_radius_m', parseInt(e.target.value, 10) || 100)
            }
            className={settingsInputClass}
          />
        </label>

        <label className={`${toggleRowClass} mt-4 ${disabled || !formData.toll_detection_enabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Detect tolls en route to pickup"
              tooltip={TOOLTIPS.toll_detect_enroute}
            />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Keep off — deadhead tolls are a driver expense, not rider charges.
            </p>
          </div>
          <Switch
            disabled={disabled || !formData.toll_detection_enabled}
            checked={formData.toll_detect_enroute}
            onCheckedChange={(checked) => updateField('toll_detect_enroute', checked)}
          />
        </label>

        <label className={`${toggleRowClass} mt-4 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Route-based toll estimation on quotes"
              tooltip={TOOLTIPS.route_toll_estimation_enabled}
            />
            <p className="text-xs text-slate-500">Uses route polyline × plaza geofences on booking</p>
          </div>
          <Switch
            disabled={disabled}
            checked={formData.route_toll_estimation_enabled}
            onCheckedChange={(checked) => updateField('route_toll_estimation_enabled', checked)}
          />
        </label>
      </SettingsSection>
    </div>
  );
}
