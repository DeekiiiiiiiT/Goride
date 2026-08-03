import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ToggleLeft, ToggleRight, AlertCircle, Save, Check } from 'lucide-react';
import {
  ENTERPRISE_MODULE_CATALOG,
  resolveEffectiveModules,
  type ModuleKey,
} from '@roam/platform-settings';
import { toast } from 'sonner';
import { productLineHeaders } from './apiPaths';

export type CustomerFeatureModulesPanelProps = {
  orgId: string;
  apiBaseUrl: string;
  accessToken: string;
  /** When false, toggles are read-only */
  canEdit?: boolean;
};

type ModulesResponse = {
  productLineModules: Record<string, boolean>;
  orgOverrides: Record<string, boolean> | null;
  effectiveModules: Record<string, boolean>;
};

const GROUPS: { id: string; label: string }[] = [
  { id: 'freight', label: 'Freight' },
  { id: 'grocery', label: 'Grocery (reserved)' },
  { id: 'ops', label: 'Operations' },
  { id: 'money', label: 'Finance & Claims' },
  { id: 'people', label: 'People' },
  { id: 'optional', label: 'Optional' },
];

export function CustomerFeatureModulesPanel({
  orgId,
  apiBaseUrl,
  accessToken,
  canEdit = true,
}: CustomerFeatureModulesPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productLineModules, setProductLineModules] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/enterprise-admin/customers/${orgId}/modules`,
        { headers: productLineHeaders(accessToken, 'enterprise') },
      );
      const data = (await res.json()) as ModulesResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProductLineModules(data.productLineModules || {});
      // Draft shows effective intent: start from product-line, apply org overrides
      const base = { ...data.productLineModules };
      if (data.orgOverrides) {
        for (const [k, v] of Object.entries(data.orgOverrides)) {
          base[k] = v;
        }
      }
      setDraft(base);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, accessToken, apiBaseUrl]);

  const effectivePreview = useMemo(
    () => resolveEffectiveModules(productLineModules, draft),
    [productLineModules, draft],
  );

  const toggle = (key: ModuleKey) => {
    if (!canEdit) return;
    if (productLineModules[key] === false) {
      toast.error('Disabled at product-line level — enable it in Settings → Features first');
      return;
    }
    setDraft((prev) => ({ ...prev, [key]: prev[key] === false }));
    setSaved(false);
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      // Store full explicit matrix so packaging is clear
      const res = await fetch(
        `${apiBaseUrl}/enterprise-admin/customers/${orgId}/modules`,
        {
          method: 'PUT',
          headers: productLineHeaders(accessToken, 'enterprise', true),
          body: JSON.stringify({ enabledModules: draft }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSaved(true);
      toast.success('Customer features saved');
      if (data.orgOverrides) setDraft({ ...productLineModules, ...data.orgOverrides });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading features…
      </div>
    );
  }

  if (error && !Object.keys(draft).length) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Feature package</h3>
          <p className="mt-1 text-xs text-slate-500">
            Turn modules on or off for this customer. Product-line Settings still act as a hard ceiling.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        )}
      </div>

      {GROUPS.map((group) => {
        const items = ENTERPRISE_MODULE_CATALOG.filter((m) => m.group === group.id);
        if (!items.length) return null;
        return (
          <div key={group.id} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </p>
            {items.map((mod) => {
              const lineOff = productLineModules[mod.key] === false;
              const on = draft[mod.key] !== false && !lineOff;
              const effectiveOn = effectivePreview[mod.key] !== false;
              return (
                <button
                  key={mod.key}
                  type="button"
                  disabled={!canEdit || lineOff}
                  onClick={() => toggle(mod.key)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition
                    ${on ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-200 bg-white opacity-70'}
                    ${lineOff ? 'cursor-not-allowed opacity-50' : ''}
                  `}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${on ? 'text-slate-900' : 'text-slate-500'}`}>
                      {mod.label}
                    </p>
                    <p className="truncate text-xs text-slate-500">{mod.description}</p>
                    {lineOff && (
                      <p className="mt-0.5 text-xs text-red-500">Off at product-line level</p>
                    )}
                    {!lineOff && !effectiveOn && (
                      <p className="mt-0.5 text-xs text-slate-400">Hidden for this customer</p>
                    )}
                  </div>
                  <span className={on ? 'text-amber-700' : 'text-slate-400'}>
                    {on ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
