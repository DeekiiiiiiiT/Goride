/**
 * Driver Rollout Section
 * 
 * Controls which driver accounts participate in dispatch during beta.
 */

import { Switch } from '../../../ui/switch';
import { Badge } from '../../../ui/badge';
import {
  SettingsSection,
  SettingLabel,
  isSectionDisabled,
  toggleRowClass,
} from '../../shared/SettingsSection';
import { useSettingsSection } from '../../../../hooks/useSettingsSection';
import type { MatchingPolicy } from '../types';
import { TOOLTIPS, SECTION_KEYS } from '../types';

interface DriverRolloutSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function DriverRolloutSection({ policy, canEdit, onSave }: DriverRolloutSectionProps) {
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
    sectionKeys: SECTION_KEYS.driverRollout,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  return (
    <SettingsSection
      title="Driver Rollout"
      description="Control which Roam Driver accounts participate in passenger dispatch during beta."
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
          <div className="flex items-center gap-2">
            <SettingLabel
              variant="inline"
              label="Independent drivers only"
              tooltip={TOOLTIPS.independent_only_matching}
            />
            <Badge variant="secondary" className="text-xs">Beta</Badge>
          </div>
          <p className="text-xs text-slate-500">
            When on, only independent drivers receive offers. Fleet drivers use legacy START TRIP flow.
          </p>
        </div>
        <Switch
          disabled={disabled}
          checked={formData.independent_only_matching}
          onCheckedChange={(checked) => updateField('independent_only_matching', checked)}
        />
      </label>
    </SettingsSection>
  );
}
