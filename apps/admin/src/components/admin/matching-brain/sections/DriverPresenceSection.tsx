/**
 * Driver Presence Section
 * 
 * Configures when a driver's GPS is considered fresh enough for matching.
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

interface DriverPresenceSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function DriverPresenceSection({ policy, canEdit, onSave }: DriverPresenceSectionProps) {
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
    sectionKeys: SECTION_KEYS.driverPresence,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  return (
    <SettingsSection
      title="Driver Presence"
      description="When a driver's GPS is considered fresh enough for matching and quotes."
      canEdit={canEdit}
      isEditing={isEditing}
      isSaving={isSaving}
      onEdit={startEdit}
      onCancel={cancelEdit}
      onSave={saveChanges}
      error={error}
    >
      <label className="block space-y-1.5">
        <SettingLabel
          label="Location max age (minutes)"
          tooltip={TOOLTIPS.driver_location_max_age_minutes}
        />
        <input
          type="number"
          min={1}
          max={30}
          disabled={disabled}
          value={formData.driver_location_max_age_minutes}
          onChange={(e) => updateField('driver_location_max_age_minutes', parseInt(e.target.value, 10) || 1)}
          className={settingsInputClass}
        />
      </label>

      <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
        <div className="space-y-0.5">
          <SettingLabel
            variant="inline"
            label="Require body type on driver to receive offers"
            tooltip={TOOLTIPS.require_body_type_for_offers}
          />
        </div>
        <Switch
          disabled={disabled}
          checked={formData.require_body_type_for_offers}
          onCheckedChange={(checked) => updateField('require_body_type_for_offers', checked)}
        />
      </label>
    </SettingsSection>
  );
}
