import React, { useMemo, useState } from 'react';
import { Loader2, Save, Shield } from 'lucide-react';
import { AdminPermissionSwitch } from './AdminPermissionSwitch';
import type {
  AppPermissionPlatform,
  AppPermissionPolicyRow,
  AppPermissionTier,
} from '@roam/types';
import {
  APP_PERMISSION_PLATFORM_LABELS,
  APP_PERMISSION_TIER_LABELS,
} from '@roam/types';

export type AppPermissionPolicyPatch = {
  key: string;
  enabled: boolean;
  prompt_onboarding: boolean;
  block_until_granted: boolean;
};

type Props = {
  surfaceLabel: string;
  permissions: AppPermissionPolicyRow[];
  canEdit: boolean;
  saving: boolean;
  onSave: (patches: AppPermissionPolicyPatch[]) => void | Promise<void>;
};

const TIER_STYLES: Record<AppPermissionTier, string> = {
  core_mandatory: 'bg-red-500/15 text-red-300 border-red-500/30',
  driver_mandatory: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  strongly_expected: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  feature_optional: 'bg-slate-500/15 text-slate-300 border-slate-600',
};

const PLATFORM_STYLES: Record<AppPermissionPlatform, string> = {
  web: 'bg-sky-500/15 text-sky-300',
  native: 'bg-violet-500/15 text-violet-300',
  both: 'bg-emerald-500/15 text-emerald-300',
};

export function AppPermissionsTable({
  surfaceLabel,
  permissions: initial,
  canEdit,
  saving,
  onSave,
}: Props) {
  const [rows, setRows] = useState(initial);
  const [platformFilter, setPlatformFilter] = useState<'all' | AppPermissionPlatform>('all');
  const [tierFilter, setTierFilter] = useState<'all' | AppPermissionTier>('all');

  React.useEffect(() => {
    setRows(initial);
  }, [initial]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (platformFilter !== 'all' && r.platform !== platformFilter) return false;
      if (tierFilter !== 'all' && r.tier !== tierFilter) return false;
      return true;
    });
  }, [rows, platformFilter, tierFilter]);

  const updateRow = (key: string, patch: Partial<AppPermissionPolicyPatch>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.enabled === false) {
          next.prompt_onboarding = false;
          next.block_until_granted = false;
        }
        return next;
      }),
    );
  };

  const handleSave = () => {
    const patches: AppPermissionPolicyPatch[] = rows.map((r) => ({
      key: r.key,
      enabled: r.enabled,
      prompt_onboarding: r.prompt_onboarding,
      block_until_granted: r.block_until_granted,
    }));
    void onSave(patches);
  };

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          View only — you can see policy values but cannot save. Ask an admin with write access for
          this surface, or use an account whose JWT includes the required role.
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 flex gap-3">
        <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
        <div className="text-sm text-slate-300 space-y-1">
          <p className="font-medium text-white">Product policy — not device settings</p>
          <p>
            These toggles control whether {surfaceLabel} apps <strong>prompt</strong> for or{' '}
            <strong>block</strong> features. They do not grant permissions on users&apos; phones.
            Users still choose Allow/Deny in iOS/Android or the browser.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-slate-400 flex items-center gap-2">
          Platform
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as typeof platformFilter)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 text-sm"
          >
            <option value="all">All</option>
            <option value="web">Web</option>
            <option value="native">Native</option>
            <option value="both">Web + Native</option>
          </select>
        </label>
        <label className="text-xs text-slate-400 flex items-center gap-2">
          Tier
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 text-sm"
          >
            <option value="all">All</option>
            <option value="core_mandatory">Core mandatory</option>
            <option value="driver_mandatory">Driver mandatory</option>
            <option value="strongly_expected">Strongly expected</option>
            <option value="feature_optional">Feature optional</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Permission</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium text-center">Enabled</th>
                <th className="px-4 py-3 font-medium text-center">Prompt</th>
                <th className="px-4 py-3 font-medium text-center">Block</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const tierMeta = APP_PERMISSION_TIER_LABELS[row.tier];
                const nativeOnly = row.platform === 'native';
                return (
                  <tr key={row.key} className="border-b border-slate-800/80 hover:bg-slate-900/30">
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-slate-100">{row.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5 max-w-md">{row.description}</p>
                      <p className="text-[10px] text-slate-600 font-mono mt-1">{row.key}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${PLATFORM_STYLES[row.platform]}`}
                      >
                        {APP_PERMISSION_PLATFORM_LABELS[row.platform]}
                      </span>
                      {nativeOnly && (
                        <p className="text-[10px] text-slate-500 mt-1">Web: checklist only</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${TIER_STYLES[row.tier]}`}
                        title={tierMeta.description}
                      >
                        {tierMeta.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex justify-center">
                        <AdminPermissionSwitch
                          checked={row.enabled}
                          disabled={!canEdit || saving}
                          onCheckedChange={(v) => updateRow(row.key, { enabled: v })}
                          aria-label={`${row.label} enabled`}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex justify-center">
                        <AdminPermissionSwitch
                          checked={row.prompt_onboarding}
                          disabled={!canEdit || saving || !row.enabled || nativeOnly}
                          onCheckedChange={(v) => updateRow(row.key, { prompt_onboarding: v })}
                          aria-label={`${row.label} prompt on onboarding`}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex justify-center">
                        <AdminPermissionSwitch
                          checked={row.block_until_granted}
                          disabled={!canEdit || saving || !row.enabled || nativeOnly}
                          onCheckedChange={(v) => updateRow(row.key, { block_until_granted: v })}
                          aria-label={`${row.label} block until granted`}
                          title={
                            nativeOnly
                              ? 'Blocking applies on native app only'
                              : undefined
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </button>
        </div>
      )}
    </div>
  );
}
