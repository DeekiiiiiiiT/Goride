/**
 * Toll Detection Section
 * 
 * Configures automatic toll detection during trips via geofencing.
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

interface TollDetectionSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function TollDetectionSection({ policy, canEdit, onSave }: TollDetectionSectionProps) {
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
    sectionKeys: SECTION_KEYS.tollDetection,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  return (
    <SettingsSection
      title="Toll Detection"
      description="Automatically detect and charge tolls when drivers pass through toll plazas during trips."
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
          <p className="text-xs text-slate-500">
            Tolls are detected via geofence and added to the final fare
          </p>
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
          onChange={(e) => updateField('toll_geofence_radius_m', parseInt(e.target.value, 10) || 100)}
          className={settingsInputClass}
        />
      </label>
    </SettingsSection>
  );
}
