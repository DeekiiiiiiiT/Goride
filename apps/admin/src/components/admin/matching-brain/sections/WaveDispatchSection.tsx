/**
 * Wave Dispatch Section
 * 
 * Configures the core matching wave behavior: number of waves,
 * radii, offers per wave, timeout, and max duration.
 */

import { Input } from '../../../ui/input';
import {
  SettingsSection,
  SettingLabel,
  isSectionDisabled,
  settingsInputClass,
} from '../../shared/SettingsSection';
import { useSettingsSection } from '../../../../hooks/useSettingsSection';
import type { MatchingPolicy } from '../types';
import { TOOLTIPS, SECTION_KEYS, validateWaveRadii, isAggressiveSettings } from '../types';

interface WaveDispatchSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function WaveDispatchSection({ policy, canEdit, onSave }: WaveDispatchSectionProps) {
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
    sectionKeys: SECTION_KEYS.waveDispatch,
    onSave,
    validate: (data) => {
      // Validate wave radii
      const radii = data.wave_radius_km ?? policy.wave_radius_km;
      const radiiError = validateWaveRadii(radii);
      if (radiiError) return radiiError;

      // Check for aggressive settings
      const maxOffers = data.max_offers_per_wave ?? policy.max_offers_per_wave;
      if (isAggressiveSettings(maxOffers, radii)) {
        if (!window.confirm(
          'These settings widen driver search or increase offers per wave significantly. Save anyway?'
        )) {
          return 'Cancelled by user';
        }
      }

      return null;
    },
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  const handleWaveRadiiChange = (value: string) => {
    const radii = value
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);
    updateField('wave_radius_km', radii);
  };

  return (
    <SettingsSection
      title="Wave Dispatch"
      description="How far and how many times the system searches for drivers per ride."
      canEdit={canEdit}
      isEditing={isEditing}
      isSaving={isSaving}
      onEdit={startEdit}
      onCancel={cancelEdit}
      onSave={saveChanges}
      error={error}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block space-y-1.5">
          <SettingLabel label="Max matching waves" tooltip={TOOLTIPS.max_match_waves} />
          <input
            type="number"
            min={1}
            max={5}
            disabled={disabled}
            value={formData.max_match_waves}
            onChange={(e) => updateField('max_match_waves', parseInt(e.target.value, 10) || 1)}
            className={settingsInputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <SettingLabel label="Offers per wave" tooltip={TOOLTIPS.max_offers_per_wave} />
          <input
            type="number"
            min={1}
            max={20}
            disabled={disabled}
            value={formData.max_offers_per_wave}
            onChange={(e) => updateField('max_offers_per_wave', parseInt(e.target.value, 10) || 1)}
            className={settingsInputClass}
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <SettingLabel
            label="Max matching duration (minutes)"
            tooltip={TOOLTIPS.max_matching_duration_minutes}
          />
          <input
            type="number"
            min={2}
            max={120}
            disabled={disabled}
            value={formData.max_matching_duration_minutes}
            onChange={(e) => updateField('max_matching_duration_minutes', parseInt(e.target.value, 10) || 2)}
            className={settingsInputClass}
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <SettingLabel
            label="Default offer timeout (seconds)"
            tooltip={TOOLTIPS.default_driver_offer_timeout_seconds}
          />
          <input
            type="number"
            min={5}
            max={120}
            disabled={disabled}
            value={formData.default_driver_offer_timeout_seconds}
            onChange={(e) => updateField('default_driver_offer_timeout_seconds', parseInt(e.target.value, 10) || 15)}
            className={settingsInputClass}
          />
        </label>
      </div>

      <div className="space-y-3 mt-4">
        <SettingLabel label="Wave search radius (km)" tooltip={TOOLTIPS.wave_radius_km} />
        <p className="text-xs text-slate-500">Comma-separated radius values. Each wave should use a larger radius.</p>
        <input
          type="text"
          disabled={disabled}
          value={formData.wave_radius_km.join(', ')}
          onChange={(e) => handleWaveRadiiChange(e.target.value)}
          placeholder="5, 15, 35"
          className={settingsInputClass}
        />
      </div>
    </SettingsSection>
  );
}
