import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  changeAdminSetting,
  listAdminSettings,
  listMarkets,
  type AdminSettingRow,
} from '@roam/dash-admin-client';
import { ALL_SETTINGS, SETTINGS_BY_KEY, type SettingDef } from '@roam/rush-settings';
import { getJwtRoles } from '@roam/auth-client';
import { EntityDrawer } from '../../components/ui/bits';
import { DashPlayStoreLaunchPage } from '../PlayStoreLaunchPage';
import { AnnouncementsEditor } from './editors/AnnouncementsEditor';
import { ContactsEditor } from './editors/ContactsEditor';
import { MaintenanceEditor } from './editors/MaintenanceEditor';
import { slugToSection } from './nav';
import { canEditSetting, defForKey, formatSettingValue, isLockedSqlOnly, relativeTime } from './settingsFormat';
import type { SettingsOutletContext } from './SettingsLayout';

type Draft = { key: string; value: unknown; version: number };

const LINK_CARDS: Record<string, Array<{ title: string; body: string; to: string; cta: string }>> = {
  'customer/Ordering': [
    {
      title: 'Fees and minimums',
      body: 'Delivery fee, service fee, small-order fee, and Rush Pass live in Pricing.',
      to: '/pricing',
      cta: 'Edit in Pricing',
    },
    {
      title: 'Delivery zones',
      body: 'Where customers can order is controlled in Markets.',
      to: '/markets',
      cta: 'Edit in Markets',
    },
  ],
  'customer/Payments': [
    {
      title: 'Promotions',
      body: 'Promo codes and campaigns are managed separately.',
      to: '/promotions',
      cta: 'Open Promotions',
    },
  ],
  'courier/Delivery rules': [
    {
      title: 'Courier pay and cash limits',
      body: 'Pay rules and cash pause limits stay in Pricing → Market rules.',
      to: '/pricing',
      cta: 'Edit in Pricing',
    },
  ],
  'partner/Sign-up': [
    {
      title: 'Commission and tiers',
      body: 'Partner fees come from Pricing → Merchant tiers, not a platform fee % here.',
      to: '/pricing',
      cta: 'Edit in Pricing',
    },
    {
      title: 'Required business documents',
      body: 'Document checklists live under Merchants → Business types.',
      to: '/merchants?tab=business-types',
      cta: 'Open Business types',
    },
  ],
};

export function SettingsSectionPage() {
  const { area = '', section: sectionSlug = '' } = useParams();
  const [params] = useSearchParams();
  const highlight = params.get('highlight');
  const { session, setPendingCount } = useOutletContext<SettingsOutletContext>();
  const roles = getJwtRoles(session.user);
  const ownerBypass = roles.includes('platform_owner') || roles.includes('superadmin');

  const sectionTitle = slugToSection(sectionSlug, area);
  const [rows, setRows] = useState<AdminSettingRow[]>([]);
  const [markets, setMarkets] = useState<Array<{ id: string; name: string }>>([]);
  const [marketId, setMarketId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<unknown>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const registryRows = useMemo(() => {
    if (!sectionTitle) return [] as SettingDef[];
    return ALL_SETTINGS.filter(
      (s) => s.section === sectionTitle && s.app === area && !s.hidden,
    );
  }, [area, sectionTitle]);

  async function reload() {
    const list = await listAdminSettings(session.access_token, {
      marketId: marketId || null,
    });
    setRows(list.settings);
    setPendingCount(list.pending.length);
  }

  useEffect(() => {
    let cancelled = false;
    void listMarkets(session.access_token, { includeZones: false })
      .then((res) => {
        if (cancelled) return;
        const list = (res.markets ?? []).map((m) => ({
          id: m.id,
          name: m.name || m.id,
        }));
        setMarkets(list);
      })
      .catch(() => {
        if (!cancelled) setMarkets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session.access_token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload()
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when market/token changes
  }, [session.access_token, marketId, setPendingCount]);

  const byKey = useMemo(() => {
    const map = new Map<string, AdminSettingRow>();
    for (const row of rows) map.set(row.key, row);
    return map;
  }, [rows]);

  const draftList = Object.values(drafts);
  const supportsMarket = registryRows.some((s) => s.scopes.includes('market'));
  const linkCards = LINK_CARDS[`${area}/${sectionTitle}`] ?? [];
  const isAppVersions = area === 'platform' && sectionTitle === 'App versions';

  function beginEdit(key: string) {
    const row = byKey.get(key);
    const def = SETTINGS_BY_KEY.get(key);
    if (!def || def.risk === 'locked') return;
    const current = drafts[key]?.value ?? row?.value ?? def.default;
    setEditingKey(key);
    setEditValue(structuredClone(current));
  }

  function stageEdit() {
    if (!editingKey) return;
    const row = byKey.get(editingKey);
    setDrafts((prev) => ({
      ...prev,
      [editingKey]: {
        key: editingKey,
        value: editValue,
        version: row?.version ?? 0,
      },
    }));
    setEditingKey(null);
  }

  function resetToDefault(key: string) {
    const def = SETTINGS_BY_KEY.get(key);
    const row = byKey.get(key);
    if (!def) return;
    setDrafts((prev) => ({
      ...prev,
      [key]: { key, value: structuredClone(def.default), version: row?.version ?? 0 },
    }));
  }

  async function saveAll() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error('A reason is required.');
      return;
    }
    setSaving(true);
    try {
      let pendingAny = false;
      for (const draft of draftList) {
        const def = SETTINGS_BY_KEY.get(draft.key);
        const scope = marketId && def?.scopes.includes('market') ? 'market' : 'platform';
        const result = await changeAdminSetting(session.access_token, {
          key: draft.key,
          value: draft.value,
          reason: trimmed,
          scope,
          scope_id: scope === 'market' ? marketId : null,
          expected_version: draft.version,
        });
        if (result.status === 'pending' || result.status === 'scheduled') pendingAny = true;
      }
      setDrafts({});
      setReviewOpen(false);
      setReason('');
      await reload();
      toast.success(
        pendingAny
          ? 'Sent to Approvals — needs a second person for high-risk changes.'
          : 'Saved. Takes effect within about a minute.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  if (!sectionTitle) {
    return <p className="text-sm text-slate-500">Unknown settings section.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            <span className="capitalize text-slate-400">{areaLabel(area)}</span>
            <span className="text-slate-600"> › </span>
            {sectionTitle}
          </h2>
        </div>
        {supportsMarket ? (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-slate-500">Market</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              value={marketId}
              onChange={(e) => {
                setMarketId(e.target.value);
                setDrafts({});
              }}
            >
              <option value="">All markets</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {linkCards.map((card) => (
        <div
          key={card.title}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-slate-100">{card.title}</p>
            <p className="text-xs text-slate-400">{card.body}</p>
          </div>
          <Link to={card.to} className="text-sm text-amber-300 hover:underline">
            {card.cta} →
          </Link>
        </div>
      ))}

      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
        {registryRows.map((def) => {
          const row = byKey.get(def.key);
          const staged = drafts[def.key];
          const value = staged?.value ?? row?.value ?? def.default;
          const locked = !canEditSetting(roles, def.key);
          const highlighted = highlight === def.key;
          return (
            <li
              key={def.key}
              id={`setting-${def.key}`}
              className={`space-y-1 px-4 py-3 ${highlighted ? 'bg-amber-500/10' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-100">
                    {def.label}
                    {def.risk === 'high' && !ownerBypass ? (
                      <span className="ml-2 text-xs font-normal text-amber-300">(needs a second person)</span>
                    ) : null}
                    {isLockedSqlOnly(def.key) ? (
                      <span className="ml-2 text-xs font-normal text-slate-500">(Locked · SQL-only)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-400">{def.help}</p>
                  {isLockedSqlOnly(def.key) ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Changes require a database update — not editable here.
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    Default {formatSettingValue(def.default, def)}
                    {row?.updated_at ? ` · Changed ${relativeTime(row.updated_at)}` : ''}
                    {marketId && row?.source === 'default'
                      ? ` · Using the platform value (${formatSettingValue(def.default, def)})`
                      : ''}
                    {marketId && row?.source === 'market' ? ' · Market override' : ''}
                  </p>
                  {row?.envActive && row.envOverride ? (
                    <p className="mt-1 text-xs text-amber-300">
                      ⚠ Overridden by server variable {row.envOverride}. Remove it to use this value.
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-200">{formatSettingValue(value, def)}</span>
                  {!locked ? (
                    <>
                      <button
                        type="button"
                        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-900"
                        onClick={() => beginEdit(def.key)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-300"
                        onClick={() => resetToDefault(def.key)}
                      >
                        Reset
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
        {registryRows.length === 0 ? (
          <li className="px-4 py-6 text-sm text-slate-500">No settings in this section yet.</li>
        ) : null}
      </ul>

      {isAppVersions ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-200">Store listing / App releases</h3>
          <DashPlayStoreLaunchPage />
        </div>
      ) : null}

      {draftList.length > 0 ? (
        <div className="sticky bottom-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 shadow-lg">
          <p className="text-sm text-slate-200">
            {draftList.length} unsaved change{draftList.length === 1 ? '' : 's'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white"
              onClick={() => setDrafts({})}
            >
              Discard
            </button>
            <button
              type="button"
              className="rounded-lg bg-amber-500/20 px-3 py-2 text-sm font-medium text-amber-200"
              onClick={() => setReviewOpen(true)}
            >
              Review & save
            </button>
          </div>
        </div>
      ) : null}

      <EntityDrawer
        open={Boolean(editingKey)}
        title={editingKey ? defForKey(editingKey)?.label || 'Edit' : 'Edit'}
        onClose={() => setEditingKey(null)}
      >
        {editingKey ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">{defForKey(editingKey)?.help}</p>
            <ValueEditor
              def={defForKey(editingKey)!}
              value={editValue}
              onChange={setEditValue}
            />
            <button
              type="button"
              className="w-full rounded-lg bg-amber-500/20 py-2 text-sm font-medium text-amber-200"
              onClick={stageEdit}
            >
              Stage change
            </button>
          </div>
        ) : null}
      </EntityDrawer>

      <EntityDrawer open={reviewOpen} title="Review & save" onClose={() => setReviewOpen(false)}>
        <div className="space-y-4">
          <ul className="space-y-2 text-sm">
            {draftList.map((d) => {
              const def = defForKey(d.key);
              const row = byKey.get(d.key);
              return (
                <li key={d.key} className="rounded-lg border border-slate-800 px-3 py-2">
                  <p className="text-slate-100">{def?.label}</p>
                  <p className="text-slate-400">
                    {formatSettingValue(row?.value ?? def?.default, def)} →{' '}
                    {formatSettingValue(d.value, def)}
                  </p>
                  {def?.risk === 'high' && !ownerBypass ? (
                    <p className="mt-1 text-xs text-amber-300">
                      Needs a second person: sent to Approvals
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">Takes effect within a minute</p>
                  )}
                </li>
              );
            })}
          </ul>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-400">Reason (required)</span>
            <textarea
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this changing?"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            className="w-full rounded-lg bg-amber-500/20 py-2 text-sm font-medium text-amber-200 disabled:opacity-50"
            onClick={() => void saveAll()}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </EntityDrawer>
    </div>
  );
}

function areaLabel(area: string): string {
  if (area === 'customer') return 'Roam Rush';
  if (area === 'courier') return 'Courier';
  if (area === 'partner') return 'Partner';
  if (area === 'platform') return 'Shared';
  return area;
}

function ValueEditor({
  def,
  value,
  onChange,
}: {
  def: SettingDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const field = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white';

  if (def.key.startsWith('platform.support.')) {
    return <ContactsEditor value={value} onChange={onChange} />;
  }
  if (def.key.startsWith('platform.maintenance.')) {
    return <MaintenanceEditor value={value} onChange={onChange} />;
  }
  if (def.key.startsWith('platform.announcement.')) {
    return <AnnouncementsEditor value={value} onChange={onChange} />;
  }

  if (def.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        On
      </label>
    );
  }

  if (def.kind === 'number') {
    return (
      <input
        className={field}
        type="number"
        value={typeof value === 'number' ? value : Number(value) || 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }

  if (def.kind === 'enum' && def.enumValues) {
    return (
      <select
        className={field}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      >
        {def.enumValues.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (def.kind === 'number[]') {
    const text = Array.isArray(value) ? (value as number[]).join(', ') : '';
    return (
      <input
        className={field}
        value={text}
        onChange={(e) => {
          const nums = e.target.value
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
            .map(Number)
            .filter((n) => Number.isFinite(n));
          onChange(nums);
        }}
        placeholder="50, 100, 150"
      />
    );
  }

  if (def.kind === 'string[]') {
    const text = Array.isArray(value) ? (value as string[]).join(', ') : '';
    return (
      <input
        className={field}
        value={text}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean),
          )
        }
      />
    );
  }

  if (def.kind === 'object') {
    return (
      <textarea
        className={field}
        rows={8}
        value={safeJson(value)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            /* keep typing */
          }
        }}
      />
    );
  }

  return (
    <input
      className={field}
      value={typeof value === 'string' ? value : String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}
