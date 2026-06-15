/**
 * PIN Verification Section
 * 
 * Configures PIN-based rider identity verification before trip start.
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

interface PinVerificationSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function PinVerificationSection({ policy, canEdit, onSave }: PinVerificationSectionProps) {
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
    sectionKeys: SECTION_KEYS.pinVerification,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  return (
    <SettingsSection
      title="PIN Verification"
      description="Require driver to verify rider identity with a 4-digit PIN before starting the trip."
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
            label="Enable PIN verification"
            tooltip={TOOLTIPS.pin_verification_enabled}
          />
          <p className="text-xs text-slate-500">
            Each ride shows a 4-digit PIN to the rider
          </p>
        </div>
        <Switch
          disabled={disabled}
          checked={formData.pin_verification_enabled}
          onCheckedChange={(checked) => updateField('pin_verification_enabled', checked)}
        />
      </label>

      <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
        <div className="space-y-0.5">
          <SettingLabel
            variant="inline"
            label="Require PIN to start trip"
            tooltip={TOOLTIPS.pin_verification_required_for_start}
          />
          <p className="text-xs text-slate-500">
            Driver must enter the correct PIN before the trip can start
          </p>
        </div>
        <Switch
          disabled={disabled || !formData.pin_verification_enabled}
          checked={formData.pin_verification_required_for_start}
          onCheckedChange={(checked) => updateField('pin_verification_required_for_start', checked)}
        />
      </label>
    </SettingsSection>
  );
}
