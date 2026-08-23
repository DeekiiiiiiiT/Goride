import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchPricingOverview,
  fetchMarketPricing,
  updateMarketPricing,
  fetchPricingTiers,
  updatePricingTier,
  previewPricing,
  fetchPricingAudit,
  fetchCodBalances,
  settleCourierCash,
  type PricingMarketSummary,
  type MerchantTierRow,
  type PricingRulesPayload,
} from '../../services/dashAdminService';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { dashAdminBasename } from '../../../lib/ops-origin';

type TabId = 'overview' | 'market' | 'tiers' | 'simulator' | 'cod' | 'audit';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'market', label: 'Market Rules' },
  { id: 'tiers', label: 'Merchant Tiers' },
  { id: 'simulator', label: 'Simulator' },
  { id: 'cod', label: 'COD Ledger' },
  { id: 'audit', label: 'Audit Log' },
];

function formatJmd(n: number) {
  return `J$${Math.round(n).toLocaleString()}`;
}

export function PricingHubPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const [tab, setTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [markets, setMarkets] = useState<PricingMarketSummary[]>([]);
  const [tiers, setTiers] = useState<MerchantTierRow[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState('');
  const [marketRules, setMarketRules] = useState<PricingRulesPayload>({});
  const [saving, setSaving] = useState(false);

  // Simulator
  const [simMerchantId, setSimMerchantId] = useState('');
  const [simSubtotal, setSimSubtotal] = useState('2500');
  const [simLat, setSimLat] = useState('18.015');
  const [simLng, setSimLng] = useState('-76.955');
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);

  // COD
  const [codBalances, setCodBalances] = useState<Array<Record<string, unknown>>>([]);
  const [settleCourierId, setSettleCourierId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('lynk');

  // Audit
  const [auditEntries, setAuditEntries] = useState<Array<Record<string, unknown>>>([]);

  const refresh = async () => {
    const overview = await fetchPricingOverview(session.access_token);
    setMarkets(overview.markets ?? []);
    setTiers(overview.tiers ?? []);
    if (!selectedMarketId && overview.markets?.[0]) {
      setSelectedMarketId(overview.markets[0].market.id);
    }
  };

  useEffect(() => {
    void refresh()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session.access_token]);

  useEffect(() => {
    if (!selectedMarketId) return;
    void fetchMarketPricing(session.access_token, selectedMarketId)
      .then((res) => setMarketRules(res.rules ?? {}))
      .catch(console.error);
  }, [selectedMarketId, session.access_token]);

  useEffect(() => {
    if (tab === 'cod') {
      void fetchCodBalances(session.access_token)
        .then((r) => setCodBalances(r.balances ?? []))
        .catch(console.error);
    }
    if (tab === 'audit') {
      void fetchPricingAudit(session.access_token, selectedMarketId || undefined)
        .then((r) => setAuditEntries(r.entries ?? []))
        .catch(console.error);
    }
  }, [tab, selectedMarketId, session.access_token]);

  const handleSaveMarketRules = async () => {
    if (!selectedMarketId || !canWrite) return;
    setSaving(true);
    try {
      await updateMarketPricing(session.access_token, selectedMarketId, marketRules);
      toast.success('Market pricing saved');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTierUpdate = async (tier: MerchantTierRow, commissionPct: number) => {
    if (!canWrite) return;
    try {
      await updatePricingTier(session.access_token, tier.id, {
        commission_rate: commissionPct / 100,
      });
      toast.success(`${tier.name} tier updated`);
      const res = await fetchPricingTiers(session.access_token);
      setTiers(res.tiers ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleSimulate = async () => {
    if (!simMerchantId.trim()) {
      toast.error('Enter a merchant ID');
      return;
    }
    try {
      const res = await previewPricing(session.access_token, {
        merchant_id: simMerchantId.trim(),
        subtotal: Number(simSubtotal) || 1000,
        dropoff_lat: Number(simLat),
        dropoff_lng: Number(simLng),
      });
      setSimResult((res as { breakdown?: Record<string, unknown> }).breakdown ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Simulation failed');
    }
  };

  const handleSettle = async () => {
    if (!canWrite) return;
    const amount = Number(settleAmount);
    if (!settleCourierId.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter courier ID and amount');
      return;
    }
    try {
      await settleCourierCash(session.access_token, {
        courier_id: settleCourierId.trim(),
        amount_jmd: amount,
        settlement_method: settleMethod,
      });
      toast.success('Settlement recorded');
      const r = await fetchCodBalances(session.access_token);
      setCodBalances(r.balances ?? []);
      setSettleAmount('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Settlement failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Pricing & Commission</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure market fees, merchant tiers, driver splits, and COD controls.
          High-risk delivery zones are managed under{' '}
          <a href={`${dashAdminBasename()}/markets`} className="text-amber-400 hover:underline">
            Markets → exclude polygons
          </a>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              tab === t.id
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          {markets.map((m) => (
            <div
              key={m.market.id}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-white">{m.market.name}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    m.pricing_v2_enabled
                      ? 'bg-emerald-900/50 text-emerald-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {m.pricing_v2_enabled ? 'Model B active' : 'Legacy Model A'}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-2">
                Profile v{(m.profile as { version?: number })?.version ?? '—'}
              </p>
              <button
                type="button"
                className="mt-3 text-sm text-amber-400 hover:underline"
                onClick={() => {
                  setSelectedMarketId(m.market.id);
                  setTab('market');
                }}
              >
                Edit rules →
              </button>
            </div>
          ))}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="font-medium text-white mb-3">Merchant Tiers</h3>
            <ul className="space-y-2">
              {tiers.map((t) => (
                <li key={t.id} className="flex justify-between text-sm text-slate-300">
                  <span>{t.name}</span>
                  <span>{Math.round(t.commission_rate * 100)}% commission</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'market' && (
        <div className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Market</label>
            <select
              value={selectedMarketId}
              onChange={(e) => setSelectedMarketId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
            >
              {markets.map((m) => (
                <option key={m.market.id} value={m.market.id}>
                  {m.market.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(marketRules.pricing_v2_enabled)}
              onChange={(e) =>
                setMarketRules((r) => ({ ...r, pricing_v2_enabled: e.target.checked }))
              }
              disabled={!canWrite}
            />
            Enable Model B pricing for this market
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Base delivery (JMD)"
              value={marketRules.delivery?.base_fee_jmd ?? 400}
              onChange={(v) =>
                setMarketRules((r) => ({
                  ...r,
                  delivery: { ...r.delivery, base_fee_jmd: v },
                }))
              }
              disabled={!canWrite}
            />
            <Field
              label="Included km"
              value={marketRules.delivery?.included_km ?? 2}
              onChange={(v) =>
                setMarketRules((r) => ({
                  ...r,
                  delivery: { ...r.delivery, included_km: v },
                }))
              }
              disabled={!canWrite}
            />
            <Field
              label="Per extra km (JMD)"
              value={marketRules.delivery?.per_extra_km_jmd ?? 60}
              onChange={(v) =>
                setMarketRules((r) => ({
                  ...r,
                  delivery: { ...r.delivery, per_extra_km_jmd: v },
                }))
              }
              disabled={!canWrite}
            />
            <Field
              label="Service fee flat (JMD)"
              value={marketRules.service_fee?.flat_jmd ?? 120}
              onChange={(v) =>
                setMarketRules((r) => ({
                  ...r,
                  service_fee: { ...r.service_fee, mode: 'flat', flat_jmd: v },
                }))
              }
              disabled={!canWrite}
            />
            <Field
              label="Courier delivery share (%)"
              value={Math.round((marketRules.courier_delivery_share ?? 0.8) * 100)}
              onChange={(v) =>
                setMarketRules((r) => ({ ...r, courier_delivery_share: v / 100 }))
              }
              disabled={!canWrite}
            />
            <Field
              label="COD pause threshold (JMD)"
              value={marketRules.cod?.pause_threshold_jmd ?? 10000}
              onChange={(v) =>
                setMarketRules((r) => ({
                  ...r,
                  cod: { ...r.cod, pause_threshold_jmd: v },
                }))
              }
              disabled={!canWrite}
            />
            <Field
              label="Free delivery first N orders"
              value={marketRules.launch_promos?.free_delivery_first_n_orders ?? 3}
              onChange={(v) =>
                setMarketRules((r) => ({
                  ...r,
                  launch_promos: { free_delivery_first_n_orders: v },
                }))
              }
              disabled={!canWrite}
            />
          </div>

          {canWrite && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveMarketRules()}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save market rules'}
            </button>
          )}
        </div>
      )}

      {tab === 'tiers' && (
        <div className="space-y-3 max-w-lg">
          {tiers.map((tier) => (
            <TierRow
              key={tier.id}
              tier={tier}
              canWrite={canWrite}
              onSave={(pct) => void handleTierUpdate(tier, pct)}
            />
          ))}
        </div>
      )}

      {tab === 'simulator' && (
        <div className="space-y-4 max-w-lg">
          <input
            placeholder="Merchant ID"
            value={simMerchantId}
            onChange={(e) => setSimMerchantId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              placeholder="Subtotal"
              value={simSubtotal}
              onChange={(e) => setSimSubtotal(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
            />
            <input
              placeholder="Lat"
              value={simLat}
              onChange={(e) => setSimLat(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
            />
            <input
              placeholder="Lng"
              value={simLng}
              onChange={(e) => setSimLng(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSimulate()}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm"
          >
            Simulate quote
          </button>
          {simResult && (
            <pre className="text-xs text-slate-300 bg-slate-950 p-4 rounded-lg overflow-auto">
              {JSON.stringify(simResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {tab === 'cod' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left p-3">Courier</th>
                  <th className="text-right p-3">Balance</th>
                  <th className="text-right p-3">Threshold</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {codBalances.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-500">
                      No COD balances yet
                    </td>
                  </tr>
                ) : (
                  codBalances.map((b) => (
                    <tr key={String(b.courier_id)} className="border-t border-slate-800">
                      <td className="p-3 text-slate-300 font-mono text-xs">
                        {String(b.courier_id).slice(0, 8)}…
                      </td>
                      <td className="p-3 text-right text-white">
                        {formatJmd(Number(b.balance_jmd ?? 0))}
                      </td>
                      <td className="p-3 text-right text-slate-400">
                        {formatJmd(Number(b.pause_threshold_jmd ?? 10000))}
                      </td>
                      <td className="p-3 text-center">
                        {b.is_paused ? (
                          <span className="text-red-400">Paused</span>
                        ) : (
                          <span className="text-emerald-400">Active</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {canWrite && (
            <div className="flex flex-wrap gap-2 items-end max-w-xl">
              <input
                placeholder="Courier ID"
                value={settleCourierId}
                onChange={(e) => setSettleCourierId(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
              />
              <input
                placeholder="Amount JMD"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                className="w-32 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
              />
              <select
                value={settleMethod}
                onChange={(e) => setSettleMethod(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
              >
                <option value="lynk">Lynk</option>
                <option value="wipay">WiPay</option>
                <option value="bank">Bank</option>
                <option value="manual">Manual</option>
              </select>
              <button
                type="button"
                onClick={() => void handleSettle()}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm"
              >
                Record settlement
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {auditEntries.length === 0 ? (
            <p className="text-sm text-slate-500">No pricing changes logged yet.</p>
          ) : (
            auditEntries.map((e) => (
              <div
                key={String(e.id)}
                className="text-xs text-slate-400 border-b border-slate-800 pb-2"
              >
                <span className="text-slate-300">{String(e.action)}</span>
                <span className="block text-slate-500">
                  {e.actor_email ? String(e.actor_email) : 'system'} ·{' '}
                  {new Date(String(e.created_at)).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
      />
    </div>
  );
}

function TierRow({
  tier,
  canWrite,
  onSave,
}: {
  tier: MerchantTierRow;
  canWrite: boolean;
  onSave: (pct: number) => void;
}) {
  const [pct, setPct] = useState(Math.round(tier.commission_rate * 100));
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-white">{tier.name}</p>
        <p className="text-xs text-slate-500">{tier.slug}</p>
      </div>
      <input
        type="number"
        min={0}
        max={50}
        value={pct}
        disabled={!canWrite}
        onChange={(e) => setPct(Number(e.target.value))}
        className="w-20 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white text-sm"
      />
      <span className="text-sm text-slate-400">%</span>
      {canWrite && (
        <button
          type="button"
          onClick={() => onSave(pct)}
          className="px-3 py-1 text-sm rounded-lg bg-amber-600 text-white"
        >
          Save
        </button>
      )}
    </div>
  );
}
