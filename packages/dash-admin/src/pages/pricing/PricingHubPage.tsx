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
  listMerchants,
  type DashMerchant,
  type PricingMarketSummary,
  type MerchantTierRow,
  type PricingRulesPayload,
} from '@roam/dash-admin-client';
import { getPlaceDetails, searchAddresses, type AddressSuggestion } from '@roam/location';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import type { AdminOutletContext } from '../../DashAdminPortal';
import {
  AUDIT_SIM_SCENARIOS,
  expectedFromMarketRules,
  nearExpected,
  pickBreakdown,
  type SimBreakdown,
  type SimScenario,
  type SimScenarioExpected,
} from './simScenarios';

const SIM_MERCHANT_STORAGE_KEY = 'dash-admin-sim-merchant-id';
const DEFAULT_DROPOFF = { lat: '18.015', lng: '-76.955', label: 'Spanish Town (default pin)' };
const DASH_ADMIN_BASENAME = '/admin';

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

  // Simulator — all quote fields are always visible (manual ops workflow)
  const [simMerchantId, setSimMerchantId] = useState('');
  const [simSubtotal, setSimSubtotal] = useState('1200');
  const [simLat, setSimLat] = useState(DEFAULT_DROPOFF.lat);
  const [simLng, setSimLng] = useState(DEFAULT_DROPOFF.lng);
  const [simAddress, setSimAddress] = useState(DEFAULT_DROPOFF.label);
  const [simAddressQuery, setSimAddressQuery] = useState('');
  const [simAddressSuggestions, setSimAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [simAddressBusy, setSimAddressBusy] = useState(false);
  const [simPayment, setSimPayment] = useState<'wipay' | 'cash'>('wipay');
  const [simTip, setSimTip] = useState('0');
  /** Off by default so delivery fee is visible; on = treat as new customer (order count 0) */
  const [simApplyFreeDeliveryPromo, setSimApplyFreeDeliveryPromo] = useState(false);
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);
  const [simExpected, setSimExpected] = useState<SimScenarioExpected | null>(null);
  const [simActiveScenario, setSimActiveScenario] = useState<string | null>(null);
  const [simBatchResults, setSimBatchResults] = useState<
    Array<{
      scenario: SimScenario;
      breakdown: SimBreakdown | null;
      expected?: SimScenarioExpected | null;
      error?: string;
    }>
  >([]);
  const [simRunning, setSimRunning] = useState(false);
  const [simMerchants, setSimMerchants] = useState<DashMerchant[]>([]);
  const [simMerchantsLoading, setSimMerchantsLoading] = useState(false);
  /** auto = resolve market from dropoff pin; manual = force Market Rules dropdown */
  const [simMarketMode, setSimMarketMode] = useState<'auto' | 'manual'>('auto');
  const [simCoverage, setSimCoverage] = useState<{
    covered: boolean | null;
    resolvedMarketId: string | null;
    reason?: string;
    overrideApplied: boolean;
  } | null>(null);

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

  useEffect(() => {
    if (tab !== 'simulator') return;
    let cancelled = false;
    setSimMerchantsLoading(true);
    void listMerchants(session.access_token, {
      operational_status: 'active',
      limit: 100,
    })
      .then(async (res) => {
        if (cancelled) return;
        let rows = res.merchants ?? [];
        if (rows.length === 0) {
          const fallback = await listMerchants(session.access_token, { limit: 100 });
          if (cancelled) return;
          rows = fallback.merchants ?? [];
        }
        setSimMerchants(rows);
        if (rows.length === 0) return;

        const storedId = localStorage.getItem(SIM_MERCHANT_STORAGE_KEY);
        const stored = storedId ? rows.find((m) => m.id === storedId) : undefined;
        const preferred =
          stored ??
          rows.find((m) => m.is_active && m.is_accepting_orders) ??
          rows[0];
        if (preferred) {
          const currentValid = simMerchantId && rows.some((m) => m.id === simMerchantId);
          if (!currentValid) {
            setSimMerchantId(preferred.id);
            localStorage.setItem(SIM_MERCHANT_STORAGE_KEY, preferred.id);
          }
        }
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not load restaurants');
      })
      .finally(() => {
        if (!cancelled) setSimMerchantsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, session.access_token]);

  const handleSimMerchantChange = (merchantId: string) => {
    setSimMerchantId(merchantId);
    localStorage.setItem(SIM_MERCHANT_STORAGE_KEY, merchantId);
    setSimResult(null);
    setSimExpected(null);
    setSimBatchResults([]);
    setSimActiveScenario(null);
  };

  const selectedSimMerchant = simMerchants.find((m) => m.id === simMerchantId);

  // Address autocomplete for dropoff (biased toward selected restaurant)
  useEffect(() => {
    if (tab !== 'simulator') return;
    const q = simAddressQuery.trim();
    if (q.length < 3) {
      setSimAddressSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setSimAddressBusy(true);
        try {
          const biasLat = selectedSimMerchant?.lat ?? Number(DEFAULT_DROPOFF.lat);
          const biasLng = selectedSimMerchant?.lng ?? Number(DEFAULT_DROPOFF.lng);
          const raw = await searchAddresses(q, {
            locationBias:
              Number.isFinite(biasLat) && Number.isFinite(biasLng)
                ? { lat: biasLat, lng: biasLng, radiusMeters: 15_000 }
                : undefined,
          });
          if (!cancelled) setSimAddressSuggestions(raw.slice(0, 6));
        } catch {
          if (!cancelled) setSimAddressSuggestions([]);
        } finally {
          if (!cancelled) setSimAddressBusy(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [tab, simAddressQuery, selectedSimMerchant?.lat, selectedSimMerchant?.lng]);

  const handleSelectSimAddress = async (s: AddressSuggestion) => {
    setSimAddressBusy(true);
    try {
      const details = await getPlaceDetails(s.placeId);
      setSimLat(String(details.lat));
      setSimLng(String(details.lng));
      setSimAddress(details.formattedAddress || s.description);
      setSimAddressQuery('');
      setSimAddressSuggestions([]);
      setSimActiveScenario(null);
    } catch {
      toast.error('Could not resolve that address — try another search or enter lat/lng');
    } finally {
      setSimAddressBusy(false);
    }
  };

  const handleSaveMarketRules = async () => {
    if (!selectedMarketId || !canWrite) return;
    setSaving(true);
    try {
      const payload: PricingRulesPayload = {
        ...marketRules,
        service_fee: {
          ...marketRules.service_fee,
          mode: 'marginal',
        },
      };
      await updateMarketPricing(session.access_token, selectedMarketId, payload);
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

  const runSimulate = async (opts: {
    subtotal: number;
    tip: number;
    payment: 'wipay' | 'cash';
    scenarioId?: string | null;
  }): Promise<{ breakdown: SimBreakdown | null; expected: SimScenarioExpected | null }> => {
    if (!simMerchantId.trim()) {
      toast.error('Pick a restaurant first');
      return { breakdown: null, expected: null };
    }
    const res = await previewPricing(session.access_token, {
      merchant_id: simMerchantId.trim(),
      subtotal: opts.subtotal,
      tip: opts.tip,
      dropoff_lat: Number(simLat),
      dropoff_lng: Number(simLng),
      payment_method: opts.payment,
      // Auto: omit market_id so geo resolves; Manual: force selected rules
      market_id: simMarketMode === 'manual' ? selectedMarketId || undefined : undefined,
      customer_order_count: simApplyFreeDeliveryPromo ? 0 : 999,
      free_delivery: simApplyFreeDeliveryPromo ? true : false,
    });

    const resolvedId = res.resolved_market_id ?? null;
    setSimCoverage({
      covered: res.covered ?? null,
      resolvedMarketId: resolvedId,
      reason: res.coverage?.reason,
      overrideApplied: Boolean(res.market_override_applied),
    });

    // Keep Market Rules panel in sync when auto-resolving from pin
    if (simMarketMode === 'auto' && resolvedId && resolvedId !== selectedMarketId) {
      setSelectedMarketId(resolvedId);
    }

    const raw = res.breakdown ?? null;
    const breakdown = pickBreakdown(raw);
    const rulesForExpected =
      simMarketMode === 'auto' && resolvedId && resolvedId !== selectedMarketId
        ? marketRules
        : marketRules;
    const expected = breakdown
      ? expectedFromMarketRules(rulesForExpected, {
          subtotal: opts.subtotal,
          tip: opts.tip,
          payment: opts.payment,
          deliveryFee: breakdown.deliveryFee ?? 0,
          tax: breakdown.tax ?? 0,
        })
      : null;
    setSimResult(raw);
    setSimExpected(expected);
    setSimActiveScenario(opts.scenarioId ?? null);
    return { breakdown, expected };
  };

  const handleSimulate = async () => {
    setSimRunning(true);
    try {
      await runSimulate({
        subtotal: Number(simSubtotal) || 0,
        tip: Number(simTip) || 0,
        payment: simPayment,
        scenarioId: null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setSimRunning(false);
    }
  };

  const handleRunScenario = async (scenario: SimScenario) => {
    if (!scenario.runnable) return;
    setSimSubtotal(String(scenario.subtotal));
    setSimTip(String(scenario.tip));
    setSimPayment(scenario.payment);
    setSimRunning(true);
    try {
      await runSimulate({
        subtotal: scenario.subtotal,
        tip: scenario.tip,
        payment: scenario.payment,
        scenarioId: scenario.id,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setSimRunning(false);
    }
  };

  const handleRunAllScenarios = async () => {
    if (!simMerchantId.trim()) {
      toast.error('Pick a restaurant first');
      return;
    }
    setSimRunning(true);
    setSimBatchResults([]);
    const results: Array<{
      scenario: SimScenario;
      breakdown: SimBreakdown | null;
      expected?: SimScenarioExpected | null;
      error?: string;
    }> = [];
    for (const scenario of AUDIT_SIM_SCENARIOS) {
      if (!scenario.runnable) continue;
      try {
        const { breakdown, expected } = await runSimulate({
          subtotal: scenario.subtotal,
          tip: scenario.tip,
          payment: scenario.payment,
          scenarioId: scenario.id,
        });
        results.push({ scenario, breakdown, expected });
      } catch (e) {
        results.push({
          scenario,
          breakdown: null,
          expected: null,
          error: e instanceof Error ? e.message : 'Failed',
        });
      }
    }
    setSimBatchResults(results);
    setSimRunning(false);
    toast.success(`Ran ${results.length} scenarios`);
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
          <a href={`${DASH_ADMIN_BASENAME}/markets`} className="text-amber-400 hover:underline">
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
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
            <h3 className="text-sm font-medium text-white">Service fee (bracketed)</h3>
            <div className="grid grid-cols-2 gap-3">
              <PctField
                label="Average rate (%)"
                value={Math.round((marketRules.service_fee?.avg_rate ?? 0.15) * 1000) / 10}
                onChange={(v) =>
                  setMarketRules((r) => ({
                    ...r,
                    service_fee: {
                      ...r.service_fee,
                      mode: 'marginal',
                      avg_rate: v / 100,
                    },
                  }))
                }
                disabled={!canWrite}
              />
              <PctField
                label="Override rate (%)"
                value={Math.round((marketRules.service_fee?.override_rate ?? 0.09) * 1000) / 10}
                onChange={(v) =>
                  setMarketRules((r) => ({
                    ...r,
                    service_fee: {
                      ...r.service_fee,
                      mode: 'marginal',
                      override_rate: v / 100,
                    },
                  }))
                }
                disabled={!canWrite}
              />
              <Field
                label="Override threshold (JMD)"
                value={marketRules.service_fee?.override_threshold_jmd ?? 5000}
                onChange={(v) =>
                  setMarketRules((r) => ({
                    ...r,
                    service_fee: {
                      ...r.service_fee,
                      mode: 'marginal',
                      override_threshold_jmd: v,
                    },
                  }))
                }
                disabled={!canWrite}
              />
              <Field
                label="Minimum fee (JMD)"
                value={marketRules.service_fee?.min_jmd ?? 150}
                onChange={(v) =>
                  setMarketRules((r) => ({
                    ...r,
                    service_fee: { ...r.service_fee, mode: 'marginal', min_jmd: v },
                  }))
                }
                disabled={!canWrite}
              />
              <Field
                label="Maximum fee (JMD)"
                value={marketRules.service_fee?.max_jmd ?? 2500}
                onChange={(v) =>
                  setMarketRules((r) => ({
                    ...r,
                    service_fee: { ...r.service_fee, mode: 'marginal', max_jmd: v },
                  }))
                }
                disabled={!canWrite}
              />
              <Field
                label="Minimum order subtotal (JMD)"
                value={marketRules.min_order_subtotal_jmd ?? 800}
                onChange={(v) =>
                  setMarketRules((r) => ({ ...r, min_order_subtotal_jmd: v }))
                }
                disabled={!canWrite}
              />
              <PctField
                label="Card processing fee (%)"
                value={Math.round((marketRules.card_processing_fee_percent ?? 0.045) * 1000) / 10}
                onChange={(v) =>
                  setMarketRules((r) => ({ ...r, card_processing_fee_percent: v / 100 }))
                }
                disabled={!canWrite}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
        <div className="space-y-6 max-w-4xl">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">How to use the simulator</h3>
            <ol className="text-sm text-slate-300 space-y-1.5 list-decimal list-inside">
              <li>Pick a restaurant and market.</li>
              <li>Enter food amount, tip, and customer dropoff address (or lat/lng).</li>
              <li>Run quote — or click a scenario card to fill food/tip/payment and run.</li>
            </ol>
            <p className="text-xs text-slate-500">
              Restaurant sets store pin, tier, and GCT — not the food total. Food and tip are always
              manual. Green = matches your current Market Rules; amber = mismatch.
            </p>
          </div>

          <SimStep n={1} title="Restaurant & market">
            <div className="grid gap-3 md:grid-cols-2">
              <LabeledSelect
                label="Restaurant"
                hint="Used for store pin, tier, and GCT — not menu prices."
                value={simMerchantId}
                disabled={simMerchantsLoading || simMerchants.length === 0}
                onChange={handleSimMerchantChange}
                options={
                  simMerchants.length === 0
                    ? [{ value: '', label: simMerchantsLoading ? 'Loading restaurants…' : 'No active restaurants found' }]
                    : simMerchants.map((m) => ({
                        value: m.id,
                        label: `${m.name}${m.is_accepting_orders ? '' : ' (paused)'}`,
                      }))
                }
              />
              <LabeledSelect
                label={simMarketMode === 'auto' ? 'Market (auto from dropoff)' : 'Market (manual override)'}
                hint={
                  simMarketMode === 'auto'
                    ? 'Resolved from customer pin against published town borders.'
                    : 'Forces these pricing rules regardless of dropoff geography.'
                }
                value={selectedMarketId}
                onChange={setSelectedMarketId}
                options={markets.map((m) => ({
                  value: m.market.id,
                  label: m.market.name,
                }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setSimMarketMode('auto')}
                className={`px-2.5 py-1 text-xs rounded-lg border ${
                  simMarketMode === 'auto'
                    ? 'border-amber-500 text-amber-200 bg-amber-950/40'
                    : 'border-slate-700 text-slate-400'
                }`}
              >
                Auto from dropoff
              </button>
              <button
                type="button"
                onClick={() => setSimMarketMode('manual')}
                className={`px-2.5 py-1 text-xs rounded-lg border ${
                  simMarketMode === 'manual'
                    ? 'border-amber-500 text-amber-200 bg-amber-950/40'
                    : 'border-slate-700 text-slate-400'
                }`}
              >
                Manual override
              </button>
              {simCoverage && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    simCoverage.covered
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {simCoverage.covered
                    ? `In zone → ${
                        markets.find((m) => m.market.id === simCoverage.resolvedMarketId)?.market
                          .name ?? 'town'
                      }`
                    : simCoverage.reason || 'Outside active delivery zones'}
                  {simCoverage.overrideApplied && simMarketMode === 'manual'
                    ? ' · using manual rules'
                    : ''}
                </span>
              )}
            </div>
            {selectedSimMerchant && (
              <p className="text-xs text-slate-500 font-mono mt-2">
                ID: {selectedSimMerchant.id}
                {selectedSimMerchant.lat != null && selectedSimMerchant.lng != null
                  ? ` · Store at ${selectedSimMerchant.lat}, ${selectedSimMerchant.lng}`
                  : ' · Store pin missing — delivery falls back to base fee'}
                {selectedSimMerchant.market_id
                  ? ` · Town: ${
                      markets.find((m) => m.market.id === selectedSimMerchant.market_id)?.market
                        .name ?? selectedSimMerchant.market_id
                    }`
                  : ' · Town unassigned'}
              </p>
            )}
          </SimStep>

          <SimStep n={2} title="Quote inputs (always editable)">
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Food subtotal (JMD)"
                value={Number(simSubtotal) || 0}
                onChange={(v) => {
                  setSimSubtotal(String(v));
                  setSimActiveScenario(null);
                }}
              />
              <Field
                label="Courier tip (JMD)"
                value={Number(simTip) || 0}
                onChange={(v) => {
                  setSimTip(String(v));
                  setSimActiveScenario(null);
                }}
              />
            </div>

            <div className="mt-3 space-y-2 relative">
              <label className="block text-xs text-slate-400">Customer dropoff address</label>
              <input
                type="text"
                value={simAddressQuery}
                onChange={(e) => setSimAddressQuery(e.target.value)}
                placeholder="Search street / area in Jamaica…"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
              />
              {simAddressBusy && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Searching…
                </p>
              )}
              {simAddressSuggestions.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-lg border border-slate-700 bg-slate-950 shadow-lg">
                  {simAddressSuggestions.map((s) => (
                    <li key={s.placeId}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                        onClick={() => void handleSelectSimAddress(s)}
                      >
                        <span className="block text-white">{s.mainText}</span>
                        {s.secondaryText ? (
                          <span className="block text-xs text-slate-500">{s.secondaryText}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {simAddress && (
                <p className="text-xs text-emerald-400/90">
                  Selected: {simAddress}
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 mt-3">
              <Field
                label="Dropoff latitude"
                value={Number(simLat) || 0}
                step="any"
                onChange={(v) => {
                  setSimLat(String(v));
                  setSimAddress('Manual lat/lng');
                  setSimActiveScenario(null);
                }}
              />
              <Field
                label="Dropoff longitude"
                value={Number(simLng) || 0}
                step="any"
                onChange={(v) => {
                  setSimLng(String(v));
                  setSimAddress('Manual lat/lng');
                  setSimActiveScenario(null);
                }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Delivery fee = distance from restaurant pin to this dropoff. Default pin:{' '}
              {DEFAULT_DROPOFF.label} ({DEFAULT_DROPOFF.lat}, {DEFAULT_DROPOFF.lng}).
            </p>

            <div className="flex flex-wrap gap-3 items-center mt-4">
              <span className="text-xs text-slate-500">Payment:</span>
              <button
                type="button"
                onClick={() => {
                  setSimPayment('wipay');
                  setSimActiveScenario(null);
                }}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  simPayment === 'wipay' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Card
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimPayment('cash');
                  setSimActiveScenario(null);
                }}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  simPayment === 'cash' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                COD
              </button>
              <label className="flex items-center gap-2 text-xs text-slate-300 ml-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simApplyFreeDeliveryPromo}
                  onChange={(e) => setSimApplyFreeDeliveryPromo(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Apply launch free-delivery promo
              </label>
              <button
                type="button"
                disabled={simRunning || !simMerchantId}
                onClick={() => void handleSimulate()}
                className="ml-auto px-4 py-2 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50"
              >
                {simRunning ? 'Running…' : 'Run quote'}
              </button>
            </div>
          </SimStep>

          <SimStep n={3} title="Preset scenarios (fills food / tip / payment)">
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                disabled={simRunning || !simMerchantId}
                onClick={() => void handleRunAllScenarios()}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm disabled:opacity-50"
              >
                {simRunning ? 'Running all…' : 'Run all scenarios (A–I)'}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {AUDIT_SIM_SCENARIOS.map((scenario) => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  active={simActiveScenario === scenario.id}
                  minOrderJmd={marketRules.min_order_subtotal_jmd ?? 800}
                  disabled={simRunning || !simMerchantId}
                  onRun={() => void handleRunScenario(scenario)}
                />
              ))}
            </div>
          </SimStep>

          {simResult && (
            <SimBreakdownPanel
              title={
                simActiveScenario
                  ? `Scenario ${simActiveScenario} — result`
                  : 'Custom quote — result'
              }
              breakdown={pickBreakdown(simResult)!}
              expected={simExpected ?? undefined}
              minOrderJmd={marketRules.min_order_subtotal_jmd ?? 800}
              subtotal={Number(simSubtotal) || 0}
              dropoffLabel={simAddress}
            />
          )}

          {simBatchResults.length > 0 && (
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                All scenarios — live vs Market Rules expected
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-right p-2">Service</th>
                      <th className="text-right p-2">Delivery</th>
                      <th className="text-right p-2">GCT</th>
                      <th className="text-right p-2">Order</th>
                      <th className="text-right p-2">Card</th>
                      <th className="text-right p-2">Customer</th>
                      <th className="text-left p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simBatchResults.map(({ scenario, breakdown, expected, error }) => (
                      <tr key={scenario.id} className="border-b border-slate-800/80">
                        <td className="p-2 text-slate-300">{scenario.id}</td>
                        {error || !breakdown ? (
                          <td colSpan={7} className="p-2 text-red-400">{error ?? 'No data'}</td>
                        ) : (
                          <>
                            <td className="p-2 text-right text-white">
                              <SimCompare actual={breakdown.serviceFee ?? 0} expected={expected?.serviceFee} />
                            </td>
                            <td className="p-2 text-right text-white">
                              {formatJmd(breakdown.deliveryFee ?? 0)}
                              {breakdown.freeDeliveryApplied ? (
                                <span className="block text-slate-500">promo</span>
                              ) : null}
                            </td>
                            <td className="p-2 text-right text-white">
                              <SimCompare actual={breakdown.tax ?? 0} expected={expected?.tax} />
                            </td>
                            <td className="p-2 text-right text-white">
                              <SimCompare actual={breakdown.orderTotal ?? 0} expected={expected?.orderTotal} />
                            </td>
                            <td className="p-2 text-right text-white">
                              <SimCompare
                                actual={breakdown.processingFee ?? 0}
                                expected={expected?.processingFee}
                              />
                            </td>
                            <td className="p-2 text-right text-white">
                              <SimCompare
                                actual={breakdown.customerTotal ?? 0}
                                expected={expected?.customerTotal}
                              />
                            </td>
                            <td className="p-2 text-slate-400">
                              {expected?.blocked &&
                              scenario.subtotal < (marketRules.min_order_subtotal_jmd ?? 800)
                                ? 'Would block checkout'
                                : scenario.expected?.note ?? '—'}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  step?: string | number;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type="number"
        step={step ?? '1'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
      />
    </div>
  );
}

function SimStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-xs text-white">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function LabeledSelect({
  label,
  hint,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value || 'empty'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function PctField({
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
        step={0.1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
      />
    </div>
  );
}

function SimLine({
  label,
  value,
  bold,
  expected,
}: {
  label: string;
  value: number;
  bold?: boolean;
  expected?: number;
}) {
  const match = nearExpected(value, expected);
  return (
    <div
      className={`flex justify-between gap-4 ${bold ? 'text-white font-medium pt-2 border-t border-slate-800' : 'text-slate-300'}`}
    >
      <span>{label}</span>
      <span className="text-right">
        {formatJmd(value)}
        {expected != null && (
          <span
            className={`block text-xs ${
              match === true ? 'text-emerald-400' : match === false ? 'text-amber-400' : 'text-slate-500'
            }`}
          >
            expected {formatJmd(expected)}
          </span>
        )}
      </span>
    </div>
  );
}

function SimCompare({ actual, expected }: { actual: number; expected?: number }) {
  const match = nearExpected(actual, expected);
  if (expected == null) return <span>{formatJmd(actual)}</span>;
  return (
    <span className={match === false ? 'text-amber-300' : match === true ? 'text-emerald-300' : ''}>
      {formatJmd(actual)}
      <span className="block text-slate-500">exp {formatJmd(expected)}</span>
    </span>
  );
}

function ScenarioCard({
  scenario,
  active,
  minOrderJmd,
  disabled,
  onRun,
}: {
  scenario: SimScenario;
  active: boolean;
  minOrderJmd: number;
  disabled: boolean;
  onRun: () => void;
}) {
  const blocked =
    scenario.expected?.blocked === true && scenario.subtotal < minOrderJmd;

  return (
    <div
      className={`rounded-xl border p-3 text-left ${
        active ? 'border-amber-500 bg-amber-950/20' : 'border-slate-800 bg-slate-900/40'
      }`}
    >
      <p className="text-sm font-medium text-white">{scenario.label}</p>
      <p className="text-xs text-slate-400 mt-1">{scenario.summary}</p>
      {scenario.expected?.note && (
        <p className="text-xs text-slate-500 mt-1">{scenario.expected.note}</p>
      )}
      {blocked && (
        <p className="text-xs text-amber-400 mt-1">Would block below min order J${minOrderJmd}</p>
      )}
      {scenario.runnable ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRun}
          className="mt-2 text-xs text-amber-400 hover:underline disabled:opacity-50"
        >
          Run scenario →
        </button>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Info only — run C to verify</p>
      )}
    </div>
  );
}

function SimBreakdownPanel({
  title,
  breakdown,
  expected,
  minOrderJmd,
  subtotal,
  dropoffLabel,
}: {
  title: string;
  breakdown: SimBreakdown;
  expected?: SimScenarioExpected;
  minOrderJmd: number;
  subtotal: number;
  dropoffLabel?: string;
}) {
  const wouldBlock = Boolean(expected?.blocked) && subtotal < minOrderJmd;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2 text-sm">
      <p className="text-white font-medium">{title}</p>
      {dropoffLabel && (
        <p className="text-xs text-slate-500">Dropoff: {dropoffLabel}</p>
      )}
      {breakdown.distanceKm != null && (
        <p className="text-xs text-slate-400">
          Distance: {breakdown.distanceKm.toFixed(2)} km
          {breakdown.freeDeliveryApplied ? ' · launch free-delivery applied' : ''}
        </p>
      )}
      {breakdown.distanceKm == null && (
        <p className="text-xs text-amber-400/90">
          Distance unknown (missing store or dropoff pin) — base delivery fee used unless promo zeroed it.
          {breakdown.freeDeliveryApplied ? ' Launch free-delivery applied.' : ''}
        </p>
      )}
      {wouldBlock && (
        <p className="text-amber-400 text-xs rounded-lg bg-amber-950/30 p-2">
          Checkout would be blocked — food subtotal J${subtotal} is below min order J${minOrderJmd}.
        </p>
      )}
      {expected?.note && !wouldBlock && (
        <p className="text-slate-400 text-xs">{expected.note}</p>
      )}
      <SimLine label="Food subtotal" value={breakdown.discountedSubtotal ?? breakdown.subtotal ?? 0} />
      <SimLine label="Service fee" value={breakdown.serviceFee ?? 0} expected={expected?.serviceFee} />
      <SimLine label="Delivery fee" value={breakdown.deliveryFee ?? 0} expected={expected?.deliveryFee} />
      <SimLine label="GCT" value={breakdown.tax ?? 0} expected={expected?.tax} />
      <SimLine label="Tip" value={breakdown.tip ?? 0} />
      <SimLine label="Order total" value={breakdown.orderTotal ?? 0} expected={expected?.orderTotal} bold />
      <SimLine label="Processing fee" value={breakdown.processingFee ?? 0} expected={expected?.processingFee} />
      <SimLine
        label="Customer pays"
        value={breakdown.customerTotal ?? breakdown.total ?? 0}
        expected={expected?.customerTotal}
        bold
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
