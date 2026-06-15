/**
 * Serial Dispatch Section
 * 
 * Configures serial (one-at-a-time) dispatch behavior.
 */

import { Switch } from '../../../ui/switch';
import {
  SettingsSection,
  SettingLabel,
  isSectionDisabled,
  toggleRowClass,
} from '../../shared/SettingsSection';
import { useSettingsSection } from '../../../../hooks/useSettingsSection';
import type { MatchingPolicy } from '../types';
import { TOOLTIPS, SECTION_KEYS } from '../types';

interface SerialDispatchSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function SerialDispatchSection({ policy, canEdit, onSave }: SerialDispatchSectionProps) {
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
    sectionKeys: SECTION_KEYS.serialDispatch,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  return (
    <SettingsSection
      title="Serial Dispatch"
      description="Offer rides to one driver at a time to reduce churn."
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
            label="Enable serial dispatch"
            tooltip={TOOLTIPS.serial_dispatch_enabled}
          />
          <p className="text-xs text-slate-500">
            When on, offers go to one driver at a time instead of parallel.
            Reduces churn but may increase pickup wait times.
          </p>
        </div>
        <Switch
          disabled={disabled}
          checked={formData.serial_dispatch_enabled}
          onCheckedChange={(checked) => updateField('serial_dispatch_enabled', checked)}
        />
      </label>
    </SettingsSection>
  );
}
