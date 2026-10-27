// Stitch: dominion-redesign/9f3ed86902e5469baf7d6f8ced78c75e
/**
 * Fuel Brain Control Panel (Dominion → Engines → Engine / Fuel)
 * Classification cards + live deadhead dial/save.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Car,
  Fuel,
  Loader2,
  MoreHorizontal,
  Route,
  User,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../../services/api';
import { EngineConsoleChrome, EnginePanelHeader } from '../engine/EngineConsoleChrome';

type BrainHealth = {
  service: string;
  status: string;
  brain_enabled: boolean;
  stack?: string;
  flags: Record<string, string>;
};

type BrainPolicy = {
  id: string;
  name: string;
  deadheadGapMaxMinutes: number;
  personalGapMinMinutes: number;
  peakHoursStart: number;
  peakHoursEnd: number;
  industryFallbackPct: number;
  crossValidationPp: number;
  preferOdoGaps: boolean;
  ambiguousDeadheadSplitPct: number;
  isDefault: boolean;
};

const CLASS_CARDS = [
  { key: 'rideshare', label: 'rideshare', code: 'CLASS_01', Icon: Car },
  { key: 'company', label: 'company', code: 'CLASS_02', Icon: Building2 },
  { key: 'deadhead', label: 'deadhead', code: 'CLASS_03', Icon: Route },
  { key: 'personal', label: 'personal', code: 'CLASS_04', Icon: User },
  { key: 'misc', label: 'misc', code: 'CLASS_05', Icon: MoreHorizontal },
] as const;

export function FuelBrainPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [policy, setPolicy] = useState<BrainPolicy | null>(null);
  const [policies, setPolicies] = useState<BrainPolicy[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [h, p] = await Promise.all([
        api.getFuelBrainHealth().catch(() => null),
        api.getFuelBrainPolicies().catch((e: { status?: number }) => {
          if (e?.status === 401 || e?.status === 403) {
            throw new Error('Platform admin access required for Fuel Brain policies.');
          }
          return null;
        }),
      ]);
      if (h) setHealth(h);
      if (p) {
        const list = (p.policies || []) as BrainPolicy[];
        setPolicies(list);
        setPolicy((prev) => {
          if (prev && list.some((x) => x.id === prev.id)) {
            return list.find((x) => x.id === prev.id) || list[0] || null;
          }
          return list.find((x) => x.isDefault) || list[0] || null;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Fuel Brain');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const savePolicy = async () => {
    if (!policy || !session) return;
    setSuccess(null);
    setError(null);
    setSaving(true);
    try {
      const data = await api.putFuelBrainPolicy(policy as unknown as Record<string, unknown>);
      setPolicy(data.policy);
      setPolicies((prev) => {
        const next = prev.map((p) => (p.id === data.policy?.id ? data.policy : p));
        if (data.policy && !next.some((p) => p.id === data.policy.id)) next.push(data.policy);
        return next;
      });
      setSuccess('Deadhead rules saved');
      setTimeout(() => setSuccess(null), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <EngineConsoleChrome
      active="fuel"
      onNavigate={onNavigate}
      statusLabel={health?.brain_enabled ? 'Active' : 'Standby'}
    >
      <section className="space-y-4 rounded-[12px] border border-slate-200 bg-white p-6 shadow-sm">
        <EnginePanelHeader
          icon={<Fuel className="h-[18px] w-[18px]" aria-hidden />}
          title="Fuel engine"
          description="Classify fuel burn and reimbursement tiers across vehicle operations in Jamaica."
          engineRef="ENGINE_REF: DOM-FUEL-JM"
          badge="SELECTED"
          badgeTone="selected"
        />

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-700">
            Classification
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {CLASS_CARDS.map(({ key, label, code, Icon }) => (
              <div
                key={key}
                className="flex flex-col justify-between rounded-[12px] border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:border-slate-300"
              >
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">{label}</span>
                    <Icon className="h-4 w-4 text-slate-400" aria-hidden />
                  </div>
                  <div className="mt-3 text-xs italic text-slate-500">The data is not in yet</div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-200/60 pt-3 font-mono text-[10px] text-slate-400">
                  <span>{code}</span>
                  <span>JMD TIER</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-800">Deadhead rules</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Odo gaps between trips first; time bands only when odo missing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchAll()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          {error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : null}
          {success ? (
            <p className="text-xs text-emerald-700">{success}</p>
          ) : null}

          {policies.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-600" htmlFor="fuel-policy">
                Policy
              </label>
              <select
                id="fuel-policy"
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800"
                value={policy?.id || ''}
                onChange={(e) => {
                  const next = policies.find((p) => p.id === e.target.value) || null;
                  setPolicy(next);
                }}
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {policy ? (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={policy.preferOdoGaps}
                  onChange={(e) => setPolicy({ ...policy, preferOdoGaps: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Prefer odometer gaps between trips
              </label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ['deadheadGapMaxMinutes', 'Deadhead gap max (min)'],
                    ['personalGapMinMinutes', 'Personal gap min (min)'],
                    ['peakHoursStart', 'Peak hours start'],
                    ['peakHoursEnd', 'Peak hours end'],
                    ['industryFallbackPct', 'Industry fallback %'],
                    ['crossValidationPp', 'Cross-validation (pp)'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">{label}</label>
                    <input
                      type="number"
                      value={policy[key]}
                      onChange={(e) =>
                        setPolicy({ ...policy, [key]: Number(e.target.value) })
                      }
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void savePolicy()}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save deadhead rules'}
              </button>
            </>
          ) : (
            <p className="text-xs italic text-slate-500">The data is not in yet</p>
          )}
        </div>
      </section>
    </EngineConsoleChrome>
  );
}
