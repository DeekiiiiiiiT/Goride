/**
 * Quotes Section
 * 
 * Configures the driver search radius for fare quotes.
 */

import {
  SettingsSection,
  SettingLabel,
  isSectionDisabled,
  settingsInputClass,
} from '../../shared/SettingsSection';
import { useSettingsSection } from '../../../../hooks/useSettingsSection';
import type { MatchingPolicy } from '../types';
import { TOOLTIPS, SECTION_KEYS } from '../types';

interface QuotesSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function QuotesSection({ policy, canEdit, onSave }: QuotesSectionProps) {
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
    sectionKeys: SECTION_KEYS.quotes,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  return (
    <SettingsSection
      title="Quotes"
      description="Radius used when estimating pickup ETA on the fare quote."
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
          label="Quote driver search radius (km)"
          tooltip={TOOLTIPS.quote_driver_radius_km}
        />
        <input
          type="number"
          min={1}
          max={50}
          step={0.5}
          disabled={disabled}
          value={formData.quote_driver_radius_km}
          onChange={(e) => updateField('quote_driver_radius_km', parseFloat(e.target.value) || 1)}
          className={settingsInputClass}
        />
      </label>
    </SettingsSection>
  );
}
