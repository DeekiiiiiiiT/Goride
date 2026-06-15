/**
 * Wait Time Billing Section
 * 
 * Configures charging riders when drivers wait beyond a grace period.
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

interface WaitTimeBillingSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

export function WaitTimeBillingSection({ policy, canEdit, onSave }: WaitTimeBillingSectionProps) {
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
    sectionKeys: SECTION_KEYS.waitTimeBilling,
    onSave,
  });

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);

  // Convert minor units to display units
  const ratePerMinJMD = formData.wait_time_rate_per_min_minor / 100;

  return (
    <SettingsSection
      title="Wait Time Billing"
      description="Charge riders when they make drivers wait beyond a grace period at pickup."
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
            label="Enable wait time billing"
            tooltip={TOOLTIPS.wait_time_charge_enabled}
          />
        </div>
        <Switch
          disabled={disabled}
          checked={formData.wait_time_charge_enabled}
          onCheckedChange={(checked) => updateField('wait_time_charge_enabled', checked)}
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <label className="block space-y-1.5">
          <SettingLabel
            label="Grace period (minutes)"
            tooltip={TOOLTIPS.wait_time_grace_minutes}
          />
          <input
            type="number"
            min={0}
            max={15}
            disabled={disabled || !formData.wait_time_charge_enabled}
            value={formData.wait_time_grace_minutes}
            onChange={(e) => updateField('wait_time_grace_minutes', parseInt(e.target.value, 10) || 2)}
            className={settingsInputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <SettingLabel
            label="Rate per minute (JMD)"
            tooltip={TOOLTIPS.wait_time_rate_per_min_minor}
          />
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            disabled={disabled || !formData.wait_time_charge_enabled}
            value={ratePerMinJMD}
            onChange={(e) => {
              const jmd = parseFloat(e.target.value) || 0;
              updateField('wait_time_rate_per_min_minor', Math.round(jmd * 100));
            }}
            className={settingsInputClass}
          />
          <p className="text-xs text-slate-500">
            Currently: {formData.wait_time_rate_per_min_minor} cents
          </p>
        </label>

        <label className="block space-y-1.5">
          <SettingLabel
            label="Max wait before cancel (minutes)"
            tooltip={TOOLTIPS.wait_time_max_minutes}
          />
          <input
            type="number"
            min={1}
            max={60}
            disabled={disabled || !formData.wait_time_charge_enabled}
            value={formData.wait_time_max_minutes}
            onChange={(e) => updateField('wait_time_max_minutes', parseInt(e.target.value, 10) || 10)}
            className={settingsInputClass}
          />
        </label>
      </div>
    </SettingsSection>
  );
}
