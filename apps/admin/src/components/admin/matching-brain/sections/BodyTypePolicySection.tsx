/**
 * Body Type Policy Section
 * 
 * Configures how vehicle body types affect matching.
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

interface BodyTypePolicySectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function BodyTypePolicySection({ policy, canEdit, onSave }: BodyTypePolicySectionProps) {
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
    sectionKeys: SECTION_KEYS.bodyTypePolicy,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  return (
    <SettingsSection
      title="Body-type Policy"
      description="How service ↔ body type links affect matching (configured under Transport Solutions)."
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
            label="Enable body-type filtering"
            tooltip={TOOLTIPS.body_type_filtering_enabled}
          />
        </div>
        <Switch
          disabled={disabled}
          checked={formData.body_type_filtering_enabled}
          onCheckedChange={(checked) => updateField('body_type_filtering_enabled', checked)}
        />
      </label>

      <label className="block space-y-1.5">
        <SettingLabel label="Tier expansion" tooltip={TOOLTIPS.body_type_tier_mode} />
        <select
          disabled={disabled || !formData.body_type_filtering_enabled}
          value={formData.body_type_tier_mode}
          onChange={(e) => updateField('body_type_tier_mode', e.target.value as 'expand' | 'strict')}
          className={settingsInputClass}
        >
          <option value="expand">Expand — add lower-priority body types each wave</option>
          <option value="strict">Strict — only highest-priority body types</option>
        </select>
      </label>
    </SettingsSection>
  );
}
