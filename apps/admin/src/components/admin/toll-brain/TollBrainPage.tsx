// Stitch: dominion-redesign/9f3ed86902e5469baf7d6f8ced78c75e
/**
 * Toll Brain Control Panel (Dominion → Engines → Engine / Toll)
 * Detect + Match dials with live save actions.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Radar, RefreshCw, Route } from 'lucide-react';
import { projectId } from '../../../utils/supabase/info';
import { useAuth } from '../../auth/AuthContext';
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
  detectionEnabled: boolean;
  detectEnroute: boolean;
  geofenceRadiusM: number;
  roundTripCooldownMs: number;
  approachMinutes: number;
  postTripMinutes: number;
  sameDayPadDays: number;
  varianceThreshold: number;
  cashAmountDeltaMax: number;
  cashReceiptProximityMinutes: number;
  personalUseDetectionEnabled: boolean;
  orphanProximityMinutes: number;
  ambiguityMinScore: number;
  ambiguityMaxGap: number;
  maxSuggestions: number;
  liveLedgerMaterializeEnabled: boolean;
  tripTimeMode: 'trust_utc' | 'legacy_reinterpret';
  isDefault: boolean;
};

function DialGraphic({
  title,
  icon,
  stroke,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  stroke: string;
  footer: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[12px] border border-slate-200 bg-slate-50/60 p-4 text-center">
      <div className="mb-2 flex items-center gap-2 self-start text-xs font-semibold text-slate-800">
        {icon}
        <span>{title}</span>
      </div>
      <div className="relative my-2 flex h-36 w-36 items-center justify-center">
        <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120" aria-hidden>
          <circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="8"
            strokeDasharray="301.6"
            strokeDashoffset="60"
            strokeLinecap="round"
          />
          <circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeDasharray="301.6"
            strokeDashoffset="180"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
          <span className="text-[11px] italic leading-snug text-slate-500">The data is not in yet</span>
        </div>
      </div>
      <div className="mt-1 font-mono text-[11px] text-slate-400">{footer}</div>
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white p-2.5">
      <div>
        <div className="text-xs font-medium text-slate-800">{label}</div>
        <div className="font-mono text-[10px] text-slate-400">{sub}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full p-0.5 transition-colors ${
          checked ? 'bg-blue-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'ml-auto' : ''
          }`}
        />
      </button>
    </div>
  );
}

export function TollBrainPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [policy, setPolicy] = useState<BrainPolicy | null>(null);

  const baseUrl = `https://${projectId}.supabase.co`;

  const headers = useCallback(() => {
    return {
      Authorization: `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json',
    };
  }, [session]);

  const fetchAll = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [hRes, pRes] = await Promise.all([
        fetch(`${baseUrl}/functions/v1/toll-brain/health`, { headers: headers() }),
        fetch(`${baseUrl}/functions/v1/toll-brain/admin/policies`, { headers: headers() }),
      ]);
      if (hRes.ok) setHealth(await hRes.json());
      if (pRes.ok) {
        const data = await pRes.json();
        const list = (data.policies || []) as BrainPolicy[];
        setPolicy(list.find((p) => p.isDefault) || list[0] || null);
      } else if (pRes.status === 401 || pRes.status === 403) {
        setError('Platform admin access required for Toll Brain policies.');
      } else {
        setError('Could not load Toll Brain policies — deploy toll-brain Edge and apply migration.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Toll Brain');
    } finally {
      setLoading(false);
    }
  }, [session, baseUrl, headers]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const savePolicy = async (label: string) => {
    if (!policy || !session) return;
    setSuccess(null);
    setError(null);
    const res = await fetch(`${baseUrl}/functions/v1/toll-brain/admin/policies`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(policy),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.message || 'Save failed');
      return;
    }
    const data = await res.json();
    setPolicy(data.policy);
    setSuccess(label);
    setTimeout(() => setSuccess(null), 2500);
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
      active="toll"
      onNavigate={onNavigate}
      statusLabel={health?.brain_enabled ? 'Active' : 'Standby'}
    >
      <section className="space-y-5 rounded-[12px] border border-slate-200 bg-white p-6 shadow-sm">
        <EnginePanelHeader
          icon={<Route className="h-[18px] w-[18px]" aria-hidden />}
          title="Toll engine"
          description="Highway 2000 corridor detection and plaza fare matching in Portmore, Spanish Town, and Vineyards."
          engineRef="ENGINE_REF: DOM-TOLL-JM"
          badge="SELECTED"
          badgeTone="selected"
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
            <DialGraphic
              title="Detect"
              icon={<Radar className="h-4 w-4 text-slate-400" aria-hidden />}
              stroke="#316bf3"
              footer="PLAZA_DETECTION"
            />
            <DialGraphic
              title="Match"
              icon={<RefreshCw className="h-4 w-4 text-slate-400" aria-hidden />}
              stroke="#10b981"
              footer="RATE_CORRELATION"
            />
          </div>

          <div className="flex flex-col justify-between rounded-[12px] border border-slate-200 bg-slate-50/60 p-4 lg:col-span-5">
            <div>
              <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-800">
                <span>Dispatch toggles</span>
                <span className="font-mono text-[10px] text-slate-400">HIGHWAY 2000</span>
              </div>
              {policy ? (
                <div className="space-y-3">
                  <ToggleRow
                    label="Detection enabled"
                    sub="Plaza geofence live"
                    checked={policy.detectionEnabled}
                    onChange={(v) => setPolicy({ ...policy, detectionEnabled: v })}
                  />
                  <ToggleRow
                    label="Detect while en route"
                    sub="St. Catherine Corridor"
                    checked={policy.detectEnroute}
                    onChange={(v) => setPolicy({ ...policy, detectEnroute: v })}
                  />
                  <ToggleRow
                    label="Live ledger materialize"
                    sub="Fleet sync"
                    checked={policy.liveLedgerMaterializeEnabled}
                    onChange={(v) => setPolicy({ ...policy, liveLedgerMaterializeEnabled: v })}
                  />
                </div>
              ) : (
                <p className="text-xs italic text-slate-500">The data is not in yet</p>
              )}
            </div>
            <div className="mt-3 border-t border-slate-200/60 pt-2 font-mono text-[10px] text-slate-400">
              DISPATCH_POLICY: DOM-RULE-H2K
            </div>
          </div>
        </div>

        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {success ? <p className="text-xs text-emerald-700">{success}</p> : null}

        {policy ? (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Geofence radius (m)
                </label>
                <input
                  type="number"
                  value={policy.geofenceRadiusM}
                  onChange={(e) =>
                    setPolicy({ ...policy, geofenceRadiusM: Number(e.target.value) })
                  }
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Round-trip cooldown (ms)
                </label>
                <input
                  type="number"
                  value={policy.roundTripCooldownMs}
                  onChange={(e) =>
                    setPolicy({ ...policy, roundTripCooldownMs: Number(e.target.value) })
                  }
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600" htmlFor="trip-time-mode">
                  Trip time mode
                </label>
                <select
                  id="trip-time-mode"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"
                  value={policy.tripTimeMode || 'trust_utc'}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      tripTimeMode: e.target.value as 'trust_utc' | 'legacy_reinterpret',
                    })
                  }
                >
                  <option value="trust_utc">Trust stored UTC</option>
                  <option value="legacy_reinterpret">Legacy reinterpret</option>
                </select>
              </div>
              {(
                [
                  ['approachMinutes', 'Approach window (min)'],
                  ['postTripMinutes', 'Post-trip buffer (min)'],
                  ['orphanProximityMinutes', 'Orphan proximity (min)'],
                  ['cashAmountDeltaMax', 'Cash amount delta max ($)'],
                  ['cashReceiptProximityMinutes', 'Cash proximity (min)'],
                  ['varianceThreshold', 'Variance threshold ($)'],
                  ['ambiguityMinScore', 'Ambiguity min score'],
                  ['ambiguityMaxGap', 'Ambiguity max gap'],
                  ['maxSuggestions', 'Max suggestions'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">{label}</label>
                  <input
                    type="number"
                    step={key === 'varianceThreshold' ? '0.01' : undefined}
                    value={policy[key]}
                    onChange={(e) => setPolicy({ ...policy, [key]: Number(e.target.value) })}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-xs"
                  />
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-800">
              <input
                type="checkbox"
                checked={policy.personalUseDetectionEnabled}
                onChange={(e) =>
                  setPolicy({ ...policy, personalUseDetectionEnabled: e.target.checked })
                }
                className="rounded border-slate-300"
              />
              Personal-use / orphan detection
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void savePolicy('Detect rules saved')}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Save detect rules
              </button>
              <button
                type="button"
                onClick={() => void savePolicy('Match rules saved')}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Save match rules
              </button>
              <button
                type="button"
                onClick={() => void fetchAll()}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </EngineConsoleChrome>
  );
}
