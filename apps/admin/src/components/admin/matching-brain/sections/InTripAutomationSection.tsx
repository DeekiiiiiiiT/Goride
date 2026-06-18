/**
 * In-Trip Automation Section
 * 
 * Configures GPS geofencing and automatic status transitions.
 */

import { Switch } from '../../../ui/switch';
import {
  SettingsSection,
  SettingLabel,
  isSectionDisabled,
  settingsInputClass,
  toggleRowClass,
} from '../../shared/SettingsSection';
import { useSettingsSection } from '../../../../hooks/useSettingsSection';
import type { MatchingPolicy } from '../types';
import { TOOLTIPS, SECTION_KEYS } from '../types';

interface InTripAutomationSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function InTripAutomationSection({ policy, canEdit, onSave }: InTripAutomationSectionProps) {
  const {
    formData,
    isEditing,
    isSaving,
    error,
    startEdit,
    cancelEdit,
    saveChanges,
    updateField,
  } = useSettingsSection<MatchingPolicy>({
    initialData: policy,
    sectionKeys: SECTION_KEYS.inTripAutomation,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  return (
    <SettingsSection
      title="In-Trip Automation"
      description="GPS geofencing and automatic status transitions. Toggle gradually in production."
      canEdit={canEdit}
      isEditing={isEditing}
      isSaving={isSaving}
      onEdit={startEdit}
      onCancel={cancelEdit}
      onSave={saveChanges}
      error={error}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <label className="block space-y-1.5">
          <SettingLabel
            label="Location interval (sec)"
            tooltip={TOOLTIPS.trip_location_interval_seconds}
          />
          <input
            type="number"
            min={1}
            max={60}
            disabled={disabled}
            value={formData.trip_location_interval_seconds}
            onChange={(e) => updateField('trip_location_interval_seconds', parseInt(e.target.value, 10) || 4)}
            className={settingsInputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <SettingLabel
            label="Pickup geofence (m)"
            tooltip={TOOLTIPS.pickup_geofence_radius_m}
          />
          <input
            type="number"
            min={20}
            max={500}
            disabled={disabled}
            value={formData.pickup_geofence_radius_m}
            onChange={(e) => updateField('pickup_geofence_radius_m', parseInt(e.target.value, 10) || 80)}
            className={settingsInputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <SettingLabel
            label="Drop-off geofence (m)"
            tooltip={TOOLTIPS.dropoff_geofence_radius_m}
          />
          <input
            type="number"
            min={20}
            max={500}
            disabled={disabled}
            value={formData.dropoff_geofence_radius_m}
            onChange={(e) => updateField('dropoff_geofence_radius_m', parseInt(e.target.value, 10) || 100)}
            className={settingsInputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <SettingLabel
            label="Arrival dwell (sec)"
            tooltip={TOOLTIPS.arrival_dwell_seconds}
          />
          <input
            type="number"
            min={0}
            max={120}
            disabled={disabled}
            value={formData.arrival_dwell_seconds}
            onChange={(e) => updateField('arrival_dwell_seconds', parseInt(e.target.value, 10) || 15)}
            className={settingsInputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <SettingLabel
            label="Max speed for arrive (m/s)"
            tooltip={TOOLTIPS.max_speed_mps_for_arrival}
          />
          <input
            type="number"
            min={1}
            max={20}
            disabled={disabled}
            value={formData.max_speed_mps_for_arrival}
            onChange={(e) => updateField('max_speed_mps_for_arrival', parseFloat(e.target.value) || 4)}
            className={settingsInputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <SettingLabel
            label="GPS max accuracy (m)"
            tooltip={TOOLTIPS.gps_max_accuracy_m_for_arrival}
          />
          <input
            type="number"
            min={5}
            max={200}
            disabled={disabled}
            value={formData.gps_max_accuracy_m_for_arrival}
            onChange={(e) => updateField('gps_max_accuracy_m_for_arrival', parseInt(e.target.value, 10) || 50)}
            className={settingsInputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <SettingLabel
            label="No-show cancel after (min)"
            tooltip={TOOLTIPS.no_show_cancel_minutes}
          />
          <input
            type="number"
            min={1}
            max={30}
            disabled={disabled}
            value={formData.no_show_cancel_minutes}
            onChange={(e) => updateField('no_show_cancel_minutes', parseInt(e.target.value, 10) || 5)}
            className={settingsInputClass}
          />
        </label>
      </div>

      <div className="border-t border-slate-200 mt-6 pt-4 dark:border-slate-700 space-y-3">
        <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Auto en route on accept"
              tooltip={TOOLTIPS.auto_en_route_on_accept}
            />
          </div>
          <Switch
            disabled={disabled}
            checked={formData.auto_en_route_on_accept}
            onCheckedChange={(checked) => updateField('auto_en_route_on_accept', checked)}
          />
        </label>

        <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Auto arrive at pickup (geofence)"
              tooltip={TOOLTIPS.auto_arrive_enabled}
            />
          </div>
          <Switch
            disabled={disabled}
            checked={formData.auto_arrive_enabled}
            onCheckedChange={(checked) => updateField('auto_arrive_enabled', checked)}
          />
        </label>

        <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Suggest complete at drop-off"
              tooltip={TOOLTIPS.auto_complete_suggest_enabled}
            />
          </div>
          <Switch
            disabled={disabled}
            checked={formData.auto_complete_suggest_enabled}
            onCheckedChange={(checked) => updateField('auto_complete_suggest_enabled', checked)}
          />
        </label>

        <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Auto-cancel rider no-show (after dwell at pickup)"
              tooltip={TOOLTIPS.no_show_auto_cancel_enabled}
            />
            <p className="text-xs text-slate-500">
              Off by default until QA sign-off
            </p>
          </div>
          <Switch
            disabled={disabled}
            checked={formData.no_show_auto_cancel_enabled}
            onCheckedChange={(checked) => updateField('no_show_auto_cancel_enabled', checked)}
          />
        </label>
      </div>
    </SettingsSection>
  );
}
