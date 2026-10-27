// Stitch: dominion-redesign/9f3ed86902e5469baf7d6f8ced78c75e
/**
 * Matching Brain Control Panel (Dominion → Engines → Engine / Matching)
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Network, Settings, Users, Zap, Cog } from 'lucide-react';
import { projectId } from '../../../utils/supabase/info';
import { useAuth } from '../../auth/AuthContext';
import type { MatchingPolicy, ProductProfile, BrainStatus } from './types';
import {
  WaveDispatchSection,
  SerialDispatchSection,
  DriverPresenceSection,
  BodyTypePolicySection,
  DriverRolloutSection,
  QuotesSection,
  H3IndexingSection,
  InTripAutomationSection,
  WaitTimeBillingSection,
  PinVerificationSection,
} from './sections';
import { ProductProfileEditor } from './ProductProfileEditor';
import { SyncStatusCard } from './SyncStatusCard';
import { EngineConsoleChrome, EnginePanelHeader } from '../engine/EngineConsoleChrome';

const ADMIN_WRITE_ROLES = ['platform_owner', 'superadmin', 'rides_admin', 'super_admin', 'super admin'];

function hasWriteAccess(role: string | undefined | null): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[\s_-]+/g, '_');
  return ADMIN_WRITE_ROLES.some(
    (r) => r.toLowerCase().replace(/[\s_-]+/g, '_') === normalized,
  );
}

export function MatchingBrainPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { session, role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [policies, setPolicies] = useState<MatchingPolicy[]>([]);
  const [profiles, setProfiles] = useState<ProductProfile[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<MatchingPolicy | null>(null);
  const [activeTab, setActiveTab] = useState('dispatch');

  const canEdit = hasWriteAccess(role);

  const fetchData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      const baseUrl = `https://${projectId}.supabase.co`;
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      const statusRes = await fetch(`${baseUrl}/functions/v1/matching/health`, { headers });
      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }

      const policiesRes = await fetch(`${baseUrl}/functions/v1/matching/admin/policies`, {
        headers,
      });
      if (policiesRes.ok) {
        const data = await policiesRes.json();
        setPolicies(data.policies || []);
        if (data.policies?.length > 0) {
          const defaultPolicy =
            data.policies.find((p: MatchingPolicy) => p.is_default) || data.policies[0];
          setSelectedPolicy(defaultPolicy);
        }
      } else {
        const err = await policiesRes.json().catch(() => ({}));
        setError(err.message || 'Failed to load policies');
      }

      const profilesRes = await fetch(
        `${baseUrl}/functions/v1/matching/admin/product-profiles`,
        { headers },
      );
      if (profilesRes.ok) {
        const data = await profilesRes.json();
        setProfiles(data.profiles || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load matching brain data');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSave = async (patch: Partial<MatchingPolicy>): Promise<MatchingPolicy> => {
    if (!session || !selectedPolicy) {
      throw new Error('No session or policy selected');
    }

    setError(null);
    setSuccess(null);

    const baseUrl = `https://${projectId}.supabase.co`;
    const res = await fetch(
      `${baseUrl}/functions/v1/matching/admin/policies/${selectedPolicy.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to save policy');
    }

    const data = await res.json();
    const updated = data.policy as MatchingPolicy;

    setSelectedPolicy(updated);
    setPolicies((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSuccess('Changes saved successfully');
    setTimeout(() => setSuccess(null), 3000);

    return updated;
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const tabs = [
    { id: 'dispatch', label: 'Dispatch', Icon: Settings },
    { id: 'driver', label: 'Driver', Icon: Users },
    { id: 'automation', label: 'Automation', Icon: Cog },
    { id: 'advanced', label: 'Advanced', Icon: Zap },
    { id: 'products', label: 'Products', Icon: null },
    { id: 'flags', label: 'Flags', Icon: null },
  ] as const;

  return (
    <EngineConsoleChrome
      active="matching"
      onNavigate={onNavigate}
      statusLabel={status?.brain_enabled ? 'Active' : 'Standby'}
    >
      <section className="space-y-4 rounded-[12px] border border-slate-200 bg-white p-6 shadow-sm">
        <EnginePanelHeader
          icon={<Network className="h-[18px] w-[18px]" aria-hidden />}
          title="Matching engine"
          description="Driver allocation, trip assignment policies, and route constraints across Jamaican parishes."
          engineRef="ENGINE_REF: DOM-MATCH-JM"
          badge="SELECTED"
          badgeTone="selected"
        />

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-700">
            Policy configuration
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {policies.length === 0 ? (
              <div className="rounded-[12px] border border-slate-200 bg-slate-50/60 p-5 md:col-span-3">
                <p className="text-xs italic text-slate-500">The data is not in yet</p>
              </div>
            ) : (
              policies.slice(0, 3).map((p, idx) => {
                const selected = selectedPolicy?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPolicy(p)}
                    className={`flex flex-col justify-between rounded-[12px] border p-5 text-left transition-colors hover:border-slate-300 ${
                      selected
                        ? 'border-blue-300 bg-blue-50/40'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-slate-900">
                          {p.name || (idx === 0 ? 'Default policy' : `Policy ${idx + 1}`)}
                        </h3>
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${
                            p.is_default || idx === 0
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {p.is_default || idx === 0 ? 'PRIMARY' : 'SECONDARY'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs italic text-slate-500">The data is not in yet</p>
                    </div>
                    <div className="mt-6 flex items-center justify-between border-t border-slate-200/60 pt-3 font-mono text-[10px] text-slate-400">
                      <span>POLICY_ID: {p.id.slice(0, 8).toUpperCase()}</span>
                      <span>KINGSTON METRO</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {success ? <p className="text-xs text-emerald-700">{success}</p> : null}

        <div className="border-t border-slate-100 pt-4">
          <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-slate-200 text-xs font-medium">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={
                  activeTab === id
                    ? 'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-blue-600 px-4 py-2.5 font-semibold text-blue-600'
                    : 'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-slate-500 hover:border-slate-300 hover:text-slate-800'
                }
              >
                {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {activeTab === 'dispatch' && selectedPolicy ? (
              <>
                <WaveDispatchSection
                  policy={selectedPolicy}
                  canEdit={canEdit}
                  onSave={handleSave}
                />
                <SerialDispatchSection
                  policy={selectedPolicy}
                  canEdit={canEdit}
                  onSave={handleSave}
                />
                <QuotesSection policy={selectedPolicy} canEdit={canEdit} onSave={handleSave} />
              </>
            ) : null}

            {activeTab === 'driver' && selectedPolicy ? (
              <>
                <DriverPresenceSection
                  policy={selectedPolicy}
                  canEdit={canEdit}
                  onSave={handleSave}
                />
                <BodyTypePolicySection
                  policy={selectedPolicy}
                  canEdit={canEdit}
                  onSave={handleSave}
                />
                <DriverRolloutSection
                  policy={selectedPolicy}
                  canEdit={canEdit}
                  onSave={handleSave}
                />
              </>
            ) : null}

            {activeTab === 'advanced' && selectedPolicy ? (
              <H3IndexingSection
                policy={selectedPolicy}
                canEdit={canEdit}
                onSave={handleSave}
              />
            ) : null}

            {activeTab === 'automation' && selectedPolicy ? (
              <>
                <InTripAutomationSection
                  policy={selectedPolicy}
                  canEdit={canEdit}
                  onSave={handleSave}
                />
                <WaitTimeBillingSection
                  policy={selectedPolicy}
                  canEdit={canEdit}
                  onSave={handleSave}
                />
                <PinVerificationSection
                  policy={selectedPolicy}
                  canEdit={canEdit}
                  onSave={handleSave}
                />
              </>
            ) : null}

            {activeTab === 'products' ? (
              <ProductProfileEditor
                profiles={profiles}
                policies={policies}
                canEdit={canEdit}
                session={session}
                onUpdate={fetchData}
              />
            ) : null}

            {activeTab === 'flags' ? (
              <div className="space-y-4">
                <SyncStatusCard
                  policyId={selectedPolicy?.id || null}
                  canEdit={canEdit}
                  session={session}
                />
                <div className="rounded-[12px] border border-slate-200 bg-slate-50/60 p-4">
                  <h3 className="text-xs font-semibold text-slate-900">Feature flags</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Environment variables controlling brain behavior
                  </p>
                  {status?.flags ? (
                    <div className="mt-3 space-y-2">
                      {Object.entries(status.flags).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2"
                        >
                          <code className="text-xs text-slate-700">{key}</code>
                          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                            {value || '0'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs italic text-slate-500">The data is not in yet</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </EngineConsoleChrome>
  );
}
