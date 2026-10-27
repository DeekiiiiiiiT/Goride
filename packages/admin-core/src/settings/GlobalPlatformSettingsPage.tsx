// Stitch: dominion-redesign/2b5c794524dc4c8aaa4c67a8e25842a0
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { withSettingsSegmentHeaders } from '@roam/api-client';
import {
  DEFAULT_GLOBAL_SETTINGS,
  mergeSettings,
  type GlobalPlatformSettings,
} from '@roam/platform-settings';
import { ProductLineSettingsPage } from './ProductLineSettingsPage';

export type GlobalPlatformSettingsPageProps = {
  apiBaseUrl: string;
  accessToken?: string;
  userEmail?: string;
  userRole?: string;
  activeTab?: string;
  dangerZoneApiBaseUrl?: string;
  onNavigate?: (page: string) => void;
};

export function GlobalPlatformSettingsPage({
  apiBaseUrl,
  accessToken,
  userEmail,
  userRole,
  activeTab: externalTab,
  onNavigate,
}: GlobalPlatformSettingsPageProps) {
  const activeTab = externalTab || 'general';
  const defaults = useMemo(() => ({ ...DEFAULT_GLOBAL_SETTINGS }), []);

  const [settings, setSettings] = useState<GlobalPlatformSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/platform-settings`, {
        headers: withSettingsSegmentHeaders('global', {
          Authorization: `Bearer ${accessToken}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.settings) {
        setSettings(mergeSettings(defaults, data.settings));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [accessToken, apiBaseUrl, defaults]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/platform-settings`, {
        method: 'PUT',
        headers: withSettingsSegmentHeaders('global', {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        }),
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setDirty(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const goTab = (tab: string) => {
    if (onNavigate) onNavigate(`global-settings-${tab}`);
  };

  if (activeTab === 'danger') {
    return (
      <div className="mx-auto w-full max-w-5xl p-8 text-slate-900">
        <SettingsChrome activeTab="danger" onTab={goTab} />
        <ProductLineSettingsPage
          segment="fleet"
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          userEmail={userEmail}
          userRole={userRole}
          activeTab="danger"
          showBusinessTypes={false}
          showDangerZone
          platformLabel="Roam Dominion — Global"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-8 text-slate-900">
      <SettingsChrome activeTab={activeTab} onTab={goTab} />

      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-6">
        {(activeTab === 'general' || activeTab === 'security') && (
          <div className="rounded-[12px] border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Platform identity</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Core registry attributes and operational parameters for Jamaica nodes.
                </p>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                PARTITION: JM-KGN-01
              </span>
            </div>

            <div className="space-y-5 pt-5">
              <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Platform name</label>
                  <p className="mt-0.5 text-[11px] text-slate-400">Root instance identifier</p>
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value="Dominion"
                    readOnly
                    className="w-full max-w-md rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 items-center gap-6 border-t border-slate-100 pt-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Platform currency</label>
                  <p className="mt-0.5 text-[11px] text-slate-400">Settlement & ledger denomination</p>
                </div>
                <div className="sm:col-span-2">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-sm text-slate-800">
                    <span className="font-semibold text-blue-600">JMD</span>
                    <span className="text-xs text-slate-400">(Jamaican Dollar)</span>
                  </div>
                </div>
              </div>

              {activeTab === 'general' ? (
                <div className="grid grid-cols-1 items-center gap-6 border-t border-slate-100 pt-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Maintenance mode</label>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Suspends consumer dispatch and driver booking feeds
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:col-span-2">
                    <button
                      type="button"
                      role="switch"
                      aria-pressed={settings.maintenanceMode ?? false}
                      onClick={() => {
                        setSettings((s) => ({ ...s, maintenanceMode: !(s.maintenanceMode ?? false) }));
                        setDirty(true);
                      }}
                      className={`relative h-6 w-11 rounded-full p-0.5 transition-colors focus:outline-none ${
                        settings.maintenanceMode ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          settings.maintenanceMode ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                    <span className="text-xs font-medium text-slate-600">
                      {settings.maintenanceMode ? 'On' : 'Off'}
                    </span>
                    {dirty ? (
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className="ml-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="border-t border-slate-100 pt-4 text-xs text-slate-500">
                  Password policies and session controls are configured per product line under Business
                  Segments. Signed in as {userEmail || '—'} ({userRole || 'Unknown'}).
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'general' ? (
          <div className="rounded-[12px] border-2 border-red-500 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-red-100 pb-4">
              <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden />
              <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
            </div>
            <div className="flex items-center justify-between pt-5">
              <div className="max-w-lg">
                <div className="text-sm font-medium text-slate-900">Reset platform identity</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Restores partition name and default operating flags for the central Kingston console.
                </p>
              </div>
              <button
                type="button"
                onClick={() => goTab('danger')}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none"
              >
                Reset platform identity
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-slate-400" aria-hidden />
            <span>The data is not in yet.</span>
          </div>
          <div className="font-mono text-[11px] uppercase text-slate-400">
            LOC: KINGSTON / PARISH REGISTRY JMD
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsChrome({
  activeTab,
  onTab,
}: {
  activeTab: string;
  onTab: (tab: string) => void;
}) {
  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'security', label: 'Security' },
    { id: 'danger', label: 'Danger zone' },
  ];
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400">/</span>
          <span>Platform</span>
          <span className="text-slate-400">/</span>
          <span className="font-medium text-slate-900">Global settings</span>
        </nav>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/60 bg-blue-50 px-2.5 py-1 font-mono text-[11px] text-blue-700">
          <span className="h-1.5 w-1.5 rounded-full bg-[#316bf3]" />
          REGION: JM-KGN
        </span>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Global settings</h1>
      </div>
      <div className="mb-6 flex gap-8 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={
              activeTab === t.id
                ? 'flex items-center gap-2 border-b-2 border-[#316bf3] pb-3 text-sm font-medium text-[#316bf3]'
                : 'pb-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800'
            }
          >
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}
