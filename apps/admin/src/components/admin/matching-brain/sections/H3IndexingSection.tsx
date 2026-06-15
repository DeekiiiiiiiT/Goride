/**
 * H3 Indexing Section
 * 
 * Configures H3 hexagonal spatial indexing for supply and surge.
 */

import { Switch } from '../../../ui/switch';
import { Slider } from '../../../ui/slider';
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

interface H3IndexingSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

const H3_RESOLUTION_LABELS: Record<number, string> = {
  4: '~22.6 km edge (country)',
  5: '~8.5 km edge (region)',
  6: '~3.2 km edge (city)',
  7: '~1.2 km edge (urban)',
  8: '~461 m edge (dense urban)',
  9: '~174 m edge (block)',
  10: '~66 m edge (building)',
};

export function H3IndexingSection({ policy, canEdit, onSave }: H3IndexingSectionProps) {
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
    sectionKeys: SECTION_KEYS.h3Indexing,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  const handleKRingsChange = (value: string) => {
    const kRings = value
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0);
    updateField('wave_h3_k_rings', kRings);
  };

  return (
    <SettingsSection
      title="H3 Spatial Indexing"
      description="Hexagonal indexing for efficient driver lookups and surge calculations."
      canEdit={canEdit}
      isEditing={isEditing}
      isSaving={isSaving}
      onEdit={startEdit}
      onCancel={cancelEdit}
      onSave={saveChanges}
      error={error}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="H3 Supply Index"
              tooltip={TOOLTIPS.h3_supply_enabled}
            />
          </div>
          <Switch
            disabled={disabled}
            checked={formData.h3_supply_enabled}
            onCheckedChange={(checked) => updateField('h3_supply_enabled', checked)}
          />
        </label>

        <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="H3 Surge Index"
              tooltip={TOOLTIPS.h3_surge_enabled}
            />
          </div>
          <Switch
            disabled={disabled}
            checked={formData.h3_surge_enabled}
            onCheckedChange={(checked) => updateField('h3_surge_enabled', checked)}
          />
        </label>
      </div>

      <div className="space-y-3 mt-4">
        <div className="flex items-center justify-between">
          <SettingLabel
            label="H3 Resolution"
            tooltip={TOOLTIPS.h3_resolution}
          />
          <span className="text-sm font-medium text-white">
            {formData.h3_resolution}
          </span>
        </div>
        <Slider
          min={4}
          max={10}
          step={1}
          disabled={disabled}
          value={[formData.h3_resolution]}
          onValueChange={([v]) => updateField('h3_resolution', v)}
        />
        <p className="text-xs text-slate-500">
          {H3_RESOLUTION_LABELS[formData.h3_resolution] || `Resolution ${formData.h3_resolution}`}
        </p>
      </div>

      <div className="space-y-1.5 mt-4">
        <SettingLabel label="Wave K-Rings" tooltip={TOOLTIPS.wave_h3_k_rings} />
        <input
          type="text"
          disabled={disabled}
          value={formData.wave_h3_k_rings.join(', ')}
          onChange={(e) => handleKRingsChange(e.target.value)}
          placeholder="4, 13, 29"
          className={settingsInputClass}
        />
        <p className="text-xs text-slate-500">
          K-ring values per wave. Calibrate per market.
        </p>
      </div>
    </SettingsSection>
  );
}
