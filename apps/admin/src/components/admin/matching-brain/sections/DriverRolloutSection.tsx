/**
 * Driver Rollout Section
 * 
 * Controls which driver accounts participate in dispatch during beta,
 * including the per-driver fleet pilot allowlist (dispatch_pilot).
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Switch } from '../../../ui/switch';
import { Badge } from '../../../ui/badge';
import {
  SettingsSection,
  SettingLabel,
  isSectionDisabled,
  toggleRowClass,
} from '../../shared/SettingsSection';
import { useSettingsSection } from '../../../../hooks/useSettingsSection';
import { projectId } from '../../../../utils/supabase/info';
import { useAuth } from '../../../auth/AuthContext';
import type { MatchingPolicy } from '../types';
import { TOOLTIPS, SECTION_KEYS } from '../types';

interface DriverRolloutSectionProps {
  policy: MatchingPolicy;
  canEdit: boolean;
  onSave: (patch: Partial<MatchingPolicy>) => Promise<MatchingPolicy>;
}

type PilotDriver = {
  user_id: string;
  display_name: string | null;
  status: string;
  fleet_id: string | null;
  dispatch_pilot: boolean;
};

/** Fleet drivers with a per-driver pilot override of independent_only_matching. */
function FleetPilotList({ canEdit }: { canEdit: boolean }) {
  const { session } = useAuth();
  const [drivers, setDrivers] = useState<PilotDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `https://${projectId}.supabase.co/functions/v1/matching/admin/dispatch-pilots`;

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load fleet drivers');
      setDrivers(data.drivers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fleet drivers');
    } finally {
      setLoading(false);
    }
  }, [session, baseUrl]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePilot = async (driver: PilotDriver, next: boolean) => {
    if (!session) return;
    setSavingId(driver.user_id);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/${driver.user_id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dispatch_pilot: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to update pilot flag');
      setDrivers((prev) =>
        prev.map((d) => (d.user_id === driver.user_id ? { ...d, dispatch_pilot: next } : d)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update pilot flag');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-4">
      <div className="mb-1 flex items-center gap-2">
        <p className="text-sm font-medium">Fleet dispatch pilots</p>
        <Badge variant="secondary" className="text-xs">Per-driver override</Badge>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Pilot drivers receive Roam offers even while “Independent drivers only” is on. Fleet drivers
        still need an assigned vehicle to go online.
      </p>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading fleet drivers…
        </div>
      ) : drivers.length === 0 ? (
        <p className="text-xs text-slate-500">No fleet drivers found.</p>
      ) : (
        <div className="space-y-2">
          {drivers.map((driver) => (
            <div key={driver.user_id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800">
                  {driver.display_name || driver.user_id}
                </p>
                <p className="text-[11px] text-slate-400">
                  {driver.status}{driver.fleet_id ? ` · fleet ${driver.fleet_id.slice(0, 8)}…` : ' · no fleet'}
                </p>
              </div>
              <Switch
                disabled={!canEdit || savingId === driver.user_id}
                checked={driver.dispatch_pilot}
                onCheckedChange={(checked) => togglePilot(driver, checked)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
            When on, only independent drivers (plus fleet pilots below) receive offers.
          </p>
        </div>
        <Switch
          disabled={disabled}
          checked={formData.independent_only_matching}
          onCheckedChange={(checked) => updateField('independent_only_matching', checked)}
        />
      </label>

      <FleetPilotList canEdit={canEdit} />
    </SettingsSection>
  );
}
