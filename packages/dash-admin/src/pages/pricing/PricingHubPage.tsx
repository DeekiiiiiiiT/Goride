import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronRight, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchPricingOverview,
  fetchPricingBacktest,
  fetchDefaultPricing,
  updateDefaultPricing,
  fetchParishPricing,
  updateParishPricing,
  clearParishPricing,
  fetchMarketPricing,
  updateMarketPricing,
  clearMarketPricing,
  clearMarketPricingBulk,
  setParishOverrideEnabled,
  setMarketOverrideEnabled,
  fetchPricingTiers,
  updatePricingTier,
  previewPricing,
  fetchPricingAudit,
  fetchCodBalances,
  settleCourierCash,
  listMerchants,
  updateDefaultPartyPricing,
  updateParishPartyPricing,
  updateMarketPartyPricing,
  type DashMerchant,
  type PricingMarketSummary,
  type PricingParishSummary,
  type MerchantTierRow,
  type PricingRulesPayload,
  type PricingLayerResponse,
  type PricingParty,
  type PricingRevenueSummary,
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
import { PartyRulesCard } from './marketRules/PartyRulesCard';
import {
  CustomerRulesForm,
  CustomerRulesReadonly,
} from './marketRules/CustomerRulesForm';
import { PartnerRulesPanel } from './marketRules/PartnerRulesPanel';
import {
  PlatformRulesForm,
  PlatformRulesReadonly,
  RiderRulesForm,
  RiderRulesReadonly,
} from './marketRules/RiderRulesForm';
import {
  MARKET_RULE_PARTIES,
  partyFormSeed,
  partySavePayload,
  PARTY_META,
} from './marketRules/partyRulesUtils';
import { PartyRulesViewHeader, ProvenanceChips } from './marketRules/ProvenanceChips';
import { ResolvedRulesPanel } from './marketRules/ResolvedRulesPanel';

const SIM_MERCHANT_STORAGE_KEY = 'dash-admin-sim-merchant-id';
const DEFAULT_DROPOFF = { lat: '18.015', lng: '-76.955', label: 'Spanish Town (default pin)' };
const DASH_ADMIN_BASENAME = '/admin';

type TabId = 'overview' | 'market' | 'tiers' | 'simulator' | 'cod' | 'audit';
type RulesScope = 'global' | 'parish' | 'market';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'market', label: 'Market Rules' },
  { id: 'tiers', label: 'Merchant Tiers' },
  { id: 'simulator', label: 'Simulator' },
  { id: 'cod', label: 'COD Ledger' },
  { id: 'audit', label: 'Audit Log' },
];

const RULES_SCOPES: { id: RulesScope; label: string; hint: string }[] = [
  { id: 'global', label: 'Default', hint: 'Applies to every area unless overridden' },
  { id: 'parish', label: 'Parish', hint: 'Overrides Default for all towns in that parish' },
  { id: 'market', label: 'Town / City', hint: 'Overrides Default + Parish for one town' },
];

function formatJmd(n: number) {
  return `J$${Math.round(n).toLocaleString()}`;
}

/** Parish rows for Pricing Overview — parish sort_order, then town name. */
function groupMarketsByParish(markets: PricingMarketSummary[]) {
  const byKey = new Map<
    string,
    {
      key: string;
      name: string;
      sortOrder: number;
      markets: PricingMarketSummary[];
      activeMarkets: PricingMarketSummary[];
    }
  >();

  for (const m of markets) {
    const key = m.parish?.id ?? m.market.parish_id ?? '__unassigned__';
    const name = m.parish?.name ?? 'Unassigned parish';
    const sortOrder = m.parish?.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bucket = byKey.get(key) ?? {
      key,
      name,
      sortOrder,
      markets: [],
      activeMarkets: [],
    };
    bucket.markets.push(m);
    if (m.market.is_active) bucket.activeMarkets.push(m);
    byKey.set(key, bucket);
  }

  const byName = (a: PricingMarketSummary, b: PricingMarketSummary) =>
    a.market.name.localeCompare(b.market.name, undefined, { sensitivity: 'base' });

  return [...byKey.values()]
    .map((g) => ({
      ...g,
      markets: [...g.markets].sort(byName),
      activeMarkets: [...g.activeMarkets].sort(byName),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function PricingHubPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const [tab, setTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [markets, setMarkets] = useState<PricingMarketSummary[]>([]);
  const [parishes, setParishes] = useState<PricingParishSummary[]>([]);
  const [tiers, setTiers] = useState<MerchantTierRow[]>([]);
  const [rulesScope, setRulesScope] = useState<RulesScope>('global');
  const [rulesPanel, setRulesPanel] = useState<'list' | 'view' | 'edit'>('list');
  const [selectedParty, setSelectedParty] = useState<PricingParty | null>(null);
  const [selectedParishId, setSelectedParishId] = useState('');
  const [selectedMarketId, setSelectedMarketId] = useState('');
  const [layerData, setLayerData] = useState<PricingLayerResponse | null>(null);
  const [partyForm, setPartyForm] = useState<PricingRulesPayload>({});
  const [marketRules, setMarketRules] = useState<PricingRulesPayload>({});
  const [defaultRules, setDefaultRules] = useState<PricingRulesPayload>({});
  const [parishRulesFocusId, setParishRulesFocusId] = useState<string | null>(null);
  const [townRulesFocusId, setTownRulesFocusId] = useState<string | null>(null);
  const [rulesStack, setRulesStack] = useState<string[]>(['Default']);
  const [hasLayerOverride, setHasLayerOverride] = useState(false);
  const [layerOverrideEnabled, setLayerOverrideEnabled] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(false);
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
  const [simTierCompare, setSimTierCompare] = useState<
    Array<{
      tierId: string;
      tierName: string;
      customerTotal: number;
      deliveryFee: number;
      commission: number;
      courierPay: number;
      subsidy: number;
    }>
  >([]);
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
  /** Pricing Overview — parish overlay (active towns only). */
  const [overviewParishKey, setOverviewParishKey] = useState<string | null>(null);
  /** Town rules tab — parish drill-down for active town overrides. */
  const [townRulesParishKey, setTownRulesParishKey] = useState<string | null>(null);
  const [selectedTownOverrideIds, setSelectedTownOverrideIds] = useState<string[]>([]);
  const [bulkClearing, setBulkClearing] = useState(false);
  const [revenue, setRevenue] = useState<PricingRevenueSummary | null>(null);
  const [recentChanges, setRecentChanges] = useState<Array<Record<string, unknown>>>([]);
  const [backtestRows, setBacktestRows] = useState<Array<Record<string, unknown>>>([]);
  const [backtestLoading, setBacktestLoading] = useState(false);

  const refresh = async () => {
    const overview = await fetchPricingOverview(session.access_token);
    setMarkets(overview.markets ?? []);
    setParishes(overview.parishes ?? []);
    setTiers(overview.tiers ?? []);
    setRevenue(overview.revenue ?? null);
    setRecentChanges(overview.recent_changes ?? []);
    if (!selectedParishId && overview.parishes?.[0]) {
      setSelectedParishId(overview.parishes[0].id);
    }
    if (!selectedMarketId && overview.markets?.[0]) {
      const active = overview.markets.find((m) => m.market.is_active);
      setSelectedMarketId((active ?? overview.markets[0]).market.id);
    }
  };

  useEffect(() => {
    void refresh()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session.access_token]);

  useEffect(() => {
    void fetchDefaultPricing(session.access_token)
      .then((res) => {
        setDefaultRules(res.effective_rules ?? res.rules ?? {});
        if (rulesScope === 'global' && rulesPanel === 'list') {
          setLayerData(res);
        }
      })
      .catch(console.error);
  }, [session.access_token, rulesScope, rulesPanel]);

  const loadLayerData = async () => {
    setRulesLoading(true);
    try {
      if (rulesScope === 'global') {
        const res = await fetchDefaultPricing(session.access_token);
        setLayerData(res);
        setMarketRules(res.effective_rules ?? res.rules ?? {});
        setDefaultRules(res.effective_rules ?? res.rules ?? {});
        setRulesStack(res.stack ?? ['Default']);
        setHasLayerOverride(Boolean(res.has_override));
        setLayerOverrideEnabled(true);
        return;
      }
      if (rulesScope === 'parish') {
        if (!selectedParishId) return;
        const res = await fetchParishPricing(session.access_token, selectedParishId);
        setLayerData(res);
        setMarketRules(res.effective_rules ?? res.rules ?? {});
        setRulesStack(res.stack ?? ['Default']);
        setHasLayerOverride(Boolean(res.has_override));
        setLayerOverrideEnabled(res.override_enabled !== false);
        return;
      }
      if (!selectedMarketId) return;
      const res = await fetchMarketPricing(session.access_token, selectedMarketId);
      setLayerData(res);
      setMarketRules(res.effective_rules ?? res.rules ?? {});
      setRulesStack(res.stack ?? ['Default']);
      setHasLayerOverride(Boolean(res.has_override));
      setLayerOverrideEnabled(res.override_enabled !== false);
    } finally {
      setRulesLoading(false);
    }
  };

  useEffect(() => {
    if (rulesPanel === 'list' && rulesScope === 'global') return;
    if (rulesPanel === 'list' && rulesScope !== 'global') return;
    void loadLayerData().catch(console.error);
  }, [
    rulesScope,
    rulesPanel,
    selectedParishId,
    selectedMarketId,
    session.access_token,
    selectedParty,
  ]);

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

  useEffect(() => {
    if (rulesScope !== 'global' || rulesPanel !== 'list') return;
    void fetchDefaultPricing(session.access_token)
      .then((res) => {
        setLayerData(res);
        setDefaultRules(res.effective_rules ?? res.rules ?? {});
      })
      .catch(console.error);
  }, [session.access_token, rulesScope, rulesPanel]);

  const handleSavePartyRules = async () => {
    if (!canWrite || !selectedParty) return;
    if (rulesScope === 'parish' && !selectedParishId) return;
    if (rulesScope === 'market' && !selectedMarketId) return;
    setSaving(true);
    try {
      const payload = partySavePayload(selectedParty, partyForm);
      if (rulesScope === 'global') {
        await updateDefaultPartyPricing(session.access_token, selectedParty, payload);
        toast.success(`${PARTY_META[selectedParty].label} saved`);
      } else if (rulesScope === 'parish') {
        await updateParishPartyPricing(
          session.access_token,
          selectedParishId,
          selectedParty,
          payload,
        );
        toast.success(`${PARTY_META[selectedParty].label} override saved`);
      } else {
        await updateMarketPartyPricing(
          session.access_token,
          selectedMarketId,
          selectedParty,
          payload,
        );
        toast.success(`${PARTY_META[selectedParty].label} override saved`);
      }
      setHasLayerOverride(true);
      await refresh();
      await loadLayerData();
      setRulesPanel('view');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClearLayerOverride = async () => {
    if (!canWrite || rulesScope === 'global') return;
    setSaving(true);
    try {
      if (rulesScope === 'parish') {
        await clearParishPricing(session.access_token, selectedParishId);
        toast.success('Parish override removed — using Default');
      } else {
        await clearMarketPricing(session.access_token, selectedMarketId);
        toast.success('Town override removed — using Default / Parish');
      }
      await refresh();
      setRulesPanel('list');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not clear override');
    } finally {
      setSaving(false);
    }
  };

  const openPartyRulesView = (party: PricingParty, scope: RulesScope, id?: string) => {
    setSelectedParty(party);
    setRulesScope(scope);
    if (scope === 'parish' && id) setSelectedParishId(id);
    if (scope === 'market' && id) setSelectedMarketId(id);
    setPartyForm(partyFormSeed(party, layerData));
    setRulesPanel('view');
  };

  const openPartyRulesEdit = (party: PricingParty, scope: RulesScope, id?: string) => {
    setSelectedParty(party);
    setRulesScope(scope);
    if (scope === 'parish' && id) setSelectedParishId(id);
    if (scope === 'market' && id) setSelectedMarketId(id);
    setRulesPanel('edit');
  };

  const openRulesView = (scope: RulesScope, id?: string) => {
    openPartyRulesView('customer', scope, id);
  };

  const openRulesEdit = (scope: RulesScope, id?: string) => {
    openPartyRulesEdit('customer', scope, id);
  };

  useEffect(() => {
    if (rulesScope !== 'parish' || !parishRulesFocusId || rulesPanel !== 'list') return;
    setSelectedParishId(parishRulesFocusId);
    void fetchParishPricing(session.access_token, parishRulesFocusId)
      .then((res) => setLayerData(res))
      .catch(console.error);
  }, [rulesScope, parishRulesFocusId, rulesPanel, session.access_token]);

  useEffect(() => {
    if (rulesScope !== 'market' || !townRulesFocusId || rulesPanel !== 'list') return;
    setSelectedMarketId(townRulesFocusId);
    void fetchMarketPricing(session.access_token, townRulesFocusId)
      .then((res) => setLayerData(res))
      .catch(console.error);
  }, [rulesScope, townRulesFocusId, rulesPanel, session.access_token]);

  useEffect(() => {
    if (!selectedParty || rulesPanel === 'list' || !layerData) return;
    setPartyForm(partyFormSeed(selectedParty, layerData));
  }, [layerData, selectedParty, rulesPanel]);

  const renderPartyCards = (scope: RulesScope, entityId?: string) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {MARKET_RULE_PARTIES.map((party) => (
        <PartyRulesCard
          key={party}
          party={party}
          layer={layerData}
          tiers={tiers}
          canWrite={canWrite}
          onView={() => openPartyRulesView(party, scope, entityId)}
          onEdit={() => openPartyRulesEdit(party, scope, entityId)}
        />
      ))}
    </div>
  );

  const renderPartyModalBody = () => {
    if (!selectedParty) return null;
    const seed = partyFormSeed(selectedParty, layerData);
    const scopeLabel =
      rulesScope === 'global' ? 'default' : rulesScope === 'parish' ? 'parish' : 'town';

    if (rulesPanel === 'view') {
      return (
        <>
          <ProvenanceChips party={selectedParty} layer={layerData} />
          {selectedParty === 'customer' && <CustomerRulesReadonly rules={seed} />}
          {selectedParty === 'rider' && <RiderRulesReadonly rules={seed} />}
          {selectedParty === 'platform' && <PlatformRulesReadonly rules={seed} />}
          {selectedParty === 'partner' && (
            <PartnerRulesPanel tiers={tiers} onGoToTiers={() => setTab('tiers')} />
          )}
        </>
      );
    }

    return (
      <>
        {selectedParty === 'customer' && (
          <CustomerRulesForm
            rules={partyForm}
            setRules={setPartyForm}
            canWrite={canWrite}
            scopeLabel={scopeLabel}
          />
        )}
        {selectedParty === 'rider' && (
          <RiderRulesForm
            rules={partyForm}
            setRules={setPartyForm}
            canWrite={canWrite}
            scopeLabel={scopeLabel}
          />
        )}
        {selectedParty === 'platform' && (
          <PlatformRulesForm
            rules={partyForm}
            setRules={setPartyForm}
            canWrite={canWrite}
            scopeLabel={scopeLabel}
          />
        )}
        {selectedParty === 'partner' && (
          <PartnerRulesPanel tiers={tiers} onGoToTiers={() => setTab('tiers')} />
        )}
      </>
    );
  };
  const parishOverrideCards = parishes.filter((p) => p.has_override);
  const activeTowns = markets.filter((m) => m.market.is_active);
  const activeTownOverrides = activeTowns.filter((m) => m.has_town_override);
  const inactiveTownOverrides = markets.filter(
    (m) => !m.market.is_active && m.has_town_override,
  );
  const parishChoicesForAdd = parishes.filter((p) => !p.has_override);
  const townChoicesForAdd = activeTowns.filter((m) => !m.has_town_override);
  const townParishGroups = groupMarketsByParish(activeTowns);
  const townRulesParish = townRulesParishKey
    ? townParishGroups.find((p) => p.key === townRulesParishKey) ?? null
    : null;
  const townRulesParishOverrides = (townRulesParish?.markets ?? []).filter(
    (m) => m.has_town_override,
  );
  const activeRulesTitle =
    rulesScope === 'global'
      ? 'Platform default'
      : rulesScope === 'parish'
        ? parishes.find((p) => p.id === selectedParishId)?.name ?? 'Parish'
        : markets.find((m) => m.market.id === selectedMarketId)?.market.name ?? 'Town';

  const handleBulkClearTownOverrides = async (ids: string[]) => {
    if (!canWrite || ids.length === 0) return;
    setBulkClearing(true);
    try {
      const res = await clearMarketPricingBulk(session.access_token, { market_ids: ids });
      toast.success(`Removed ${res.cleared} town override${res.cleared === 1 ? '' : 's'}`);
      setSelectedTownOverrideIds([]);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk delete failed');
    } finally {
      setBulkClearing(false);
    }
  };

  const handleClearInactiveTownOverrides = async () => {
    if (!canWrite) return;
    if (
      !window.confirm(
        `Remove pricing overrides for ${inactiveTownOverrides.length} inactive town${inactiveTownOverrides.length === 1 ? '' : 's'}? They will inherit Default / Parish again.`,
      )
    ) {
      return;
    }
    setBulkClearing(true);
    try {
      const res = await clearMarketPricingBulk(session.access_token, { inactive_only: true });
      toast.success(`Cleared ${res.cleared} inactive town override${res.cleared === 1 ? '' : 's'}`);
      setSelectedTownOverrideIds([]);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cleanup failed');
    } finally {
      setBulkClearing(false);
    }
  };

  const handleToggleParishOverride = async (parishId: string, enabled: boolean) => {
    if (!canWrite) return;
    try {
      await setParishOverrideEnabled(session.access_token, parishId, enabled);
      toast.success(enabled ? 'Parish override on' : 'Parish override off — using Default');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update override');
    }
  };

  const handleToggleTownOverride = async (marketId: string, enabled: boolean) => {
    if (!canWrite) return;
    try {
      await setMarketOverrideEnabled(session.access_token, marketId, enabled);
      toast.success(enabled ? 'Town override on' : 'Town override off — using Default / Parish');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update override');
    }
  };

  const handleTierUpdate = async (
    tier: MerchantTierRow,
    updates: Partial<MerchantTierRow>,
  ) => {
    if (!canWrite) return;
    try {
      await updatePricingTier(session.access_token, tier.id, updates);
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

  const handleCompareTiers = async () => {
    if (!simMerchantId.trim()) {
      toast.error('Pick a restaurant first');
      return;
    }
    if (!tiers.length) {
      toast.error('No tiers loaded');
      return;
    }
    setSimRunning(true);
    try {
      const rows: Array<{
        tierId: string;
        tierName: string;
        customerTotal: number;
        deliveryFee: number;
        commission: number;
        courierPay: number;
        subsidy: number;
      }> = [];
      for (const tier of tiers.filter((t) => t.is_active !== false)) {
        const res = await previewPricing(session.access_token, {
          merchant_id: simMerchantId.trim(),
          subtotal: Number(simSubtotal) || 0,
          tip: Number(simTip) || 0,
          dropoff_lat: Number(simLat),
          dropoff_lng: Number(simLng),
          payment_method: simPayment,
          market_id: simMarketMode === 'manual' ? selectedMarketId || undefined : undefined,
          customer_order_count: simApplyFreeDeliveryPromo ? 0 : 999,
          free_delivery: simApplyFreeDeliveryPromo ? true : false,
          tier_id: tier.id,
        });
        const b = pickBreakdown(res.breakdown ?? null);
        const raw = res.breakdown as Record<string, unknown> | null;
        rows.push({
          tierId: tier.id,
          tierName: tier.name,
          customerTotal: Number(b?.customerTotal ?? b?.total ?? 0),
          deliveryFee: Number(b?.deliveryFee ?? 0),
          commission: Number(b?.merchantCommissionAmount ?? 0),
          courierPay: Number(b?.deliveryFeeCourierAmount ?? 0),
          subsidy: Number(
            raw?.platformDeliverySubsidyJmd ?? raw?.platform_delivery_subsidy_jmd ?? 0,
          ),
        });
      }
      setSimTierCompare(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tier compare failed');
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

  const parishGroups = groupMarketsByParish(markets);
  const overviewParish = overviewParishKey
    ? parishGroups.find((p) => p.key === overviewParishKey) ?? null
    : null;
  const anyTownModelB = markets.some((m) => m.pricing_v2_enabled);
  const globalModelB = Boolean(defaultRules.pricing_v2_enabled);

  const runBacktest = async () => {
    setBacktestLoading(true);
    try {
      const res = await fetchPricingBacktest(session.access_token, 28);
      setBacktestRows(res.rows ?? []);
      toast.success(`Backtested ${res.count ?? 0} orders`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backtest failed');
    } finally {
      setBacktestLoading(false);
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

      {!globalModelB && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            anyTownModelB
              ? 'border-amber-700/60 bg-amber-950/30 text-amber-100'
              : 'border-red-800/60 bg-red-950/30 text-red-100'
          }`}
          role="status"
        >
          {anyTownModelB ? (
            <>
              <strong>Model B is enabled for specific towns only</strong> — orders outside those
              towns still use the legacy engine. Global default remains off.
            </>
          ) : (
            <>
              <strong>Model B pricing is disabled</strong> — live orders use the legacy engine.
              Rules saved here do not affect customer bills until Model B is enabled per town.
            </>
          )}
          {(tab === 'simulator' || tab === 'market') && (
            <span className="block mt-1 text-xs opacity-90">
              Simulator previews Model B math — preview only until enablement.
            </span>
          )}
        </div>
      )}

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
        <div className="space-y-6">
          {revenue && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs text-slate-500">Commission recorded</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatJmd(revenue.commission_total_jmd)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs text-slate-500">Service fees</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatJmd(revenue.service_fee_total_jmd)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs text-slate-500">Take rate (commission / food)</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {revenue.take_rate_percent}%
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs text-slate-500">Model B orders</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {revenue.v2_order_count}
                </p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {parishGroups.map((parish) => (
              <button
                key={parish.key}
                type="button"
                onClick={() => setOverviewParishKey(parish.key)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-left hover:border-slate-600 hover:bg-slate-900 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{parish.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {parish.activeMarkets.length} active
                    {parish.markets.length !== parish.activeMarkets.length
                      ? ` · ${parish.markets.length} total towns`
                      : ''}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="font-medium text-white mb-3">Recent pricing changes</h3>
            {recentChanges.length === 0 ? (
              <p className="text-sm text-slate-500">No changes logged yet.</p>
            ) : (
              <ul className="space-y-2 text-sm text-slate-400">
                {recentChanges.map((e) => (
                  <li key={String(e.id)}>
                    {String(e.scope ?? 'market')} ·{' '}
                    {e.created_at ? new Date(String(e.created_at)).toLocaleString() : '—'}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="font-medium text-white mb-3">Merchant Tiers</h3>
            <ul className="space-y-2">
              {tiers.map((t) => (
                <li key={t.id} className="flex justify-between text-sm text-slate-300">
                  <span>
                    {t.name}
                    <span className="text-slate-500 ml-2">
                      ({t.merchant_count ?? 0} merchants)
                    </span>
                  </span>
                  <span>{Math.round(t.commission_rate * 100)}% commission</span>
                </li>
              ))}
            </ul>
          </div>

          {overviewParish && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6">
              <button
                type="button"
                aria-label="Close"
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px]"
                onClick={() => setOverviewParishKey(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="pricing-parish-overlay-title"
                className="relative w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
                  <div>
                    <h2
                      id="pricing-parish-overlay-title"
                      className="text-base font-semibold text-white"
                    >
                      {overviewParish.name}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Active delivery towns only — same as the green toggle on Markets.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverviewParishKey(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-4">
                  {overviewParish.activeMarkets.length === 0 ? (
                    <p className="text-sm text-slate-400 py-8 text-center">
                      No active towns in this parish yet. Activate a town under Markets first.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {overviewParish.activeMarkets.map((m) => (
                        <div
                          key={m.market.id}
                          className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-medium text-white">{m.market.name}</h3>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
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
                              openRulesView('market', m.market.id);
                              setOverviewParishKey(null);
                              setTab('market');
                            }}
                          >
                            Edit rules →
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'market' && (
        <div className="space-y-4 max-w-3xl">
          <div className="flex flex-wrap gap-2">
            {RULES_SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setRulesScope(s.id);
                  setRulesPanel('list');
                }}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  rulesScope === s.id
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {RULES_SCOPES.find((s) => s.id === rulesScope)?.hint}. Hierarchy:{' '}
            <span className="text-slate-300">Default → Parish → Town</span> (lower wins).
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              {rulesScope === 'global'
                ? 'Platform-wide base rules'
                : rulesScope === 'parish'
                  ? `${parishOverrideCards.length} parish override${parishOverrideCards.length === 1 ? '' : 's'}`
                  : `${activeTownOverrides.length} active town override${activeTownOverrides.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {canWrite && rulesScope === 'market' && inactiveTownOverrides.length > 0 && (
                <button
                  type="button"
                  disabled={bulkClearing}
                  onClick={() => void handleClearInactiveTownOverrides()}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 disabled:opacity-50"
                >
                  {bulkClearing
                    ? 'Clearing…'
                    : `Clear ${inactiveTownOverrides.length} inactive override${inactiveTownOverrides.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>

          {rulesScope === 'global' && rulesPanel === 'list' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-300">Platform default — by party</p>
              {renderPartyCards('global')}
            </div>
          )}

          {rulesScope === 'parish' && rulesPanel === 'list' && !parishRulesFocusId && (
            <div className="space-y-2">
              {parishOverrideCards.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center rounded-xl border border-dashed border-slate-800">
                  No parish overrides yet. Pick a parish below to configure party rules (creates override on save).
                </p>
              ) : (
                parishOverrideCards.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-stretch gap-2 rounded-xl border border-slate-800 bg-slate-900/50"
                  >
                    <button
                      type="button"
                      onClick={() => setParishRulesFocusId(p.id)}
                      className="flex-1 text-left px-4 py-3 hover:border-slate-600 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{p.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Parish override · {p.override_enabled ? 'Active' : 'Inactive'}
                            {' · '}Default → {p.name}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      </div>
                    </button>
                    {canWrite && (
                      <div className="flex items-center px-3 border-l border-slate-800">
                        <OverrideEnabledToggle
                          enabled={Boolean(p.override_enabled)}
                          onToggle={(next) => void handleToggleParishOverride(p.id, next)}
                          label={`${p.name} override`}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
              {parishes.filter((p) => !p.has_override).length > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <label className="block text-xs text-slate-500 mb-1">Configure parish (no override yet)</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setParishRulesFocusId(e.target.value);
                    }}
                  >
                    <option value="">Select parish…</option>
                    {parishes
                      .filter((p) => !p.has_override)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {rulesScope === 'parish' && rulesPanel === 'list' && parishRulesFocusId && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setParishRulesFocusId(null)}
                className="text-sm text-slate-400 hover:text-white"
              >
                ← All parishes
              </button>
              <p className="text-sm font-medium text-white">
                {parishes.find((p) => p.id === parishRulesFocusId)?.name ?? 'Parish'} — by party
              </p>
              {renderPartyCards('parish', parishRulesFocusId)}
            </div>
          )}

          {rulesScope === 'market' && rulesPanel === 'list' && !townRulesFocusId && (
            <div className="space-y-2">
              {townParishGroups.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center rounded-xl border border-dashed border-slate-800">
                  No active towns yet. Activate a town under Markets first.
                </p>
              ) : (
                townParishGroups.map((parish) => {
                  const overrideCount = parish.markets.filter((m) => m.has_town_override).length;
                  return (
                    <button
                      key={parish.key}
                      type="button"
                      onClick={() => {
                        setSelectedTownOverrideIds([]);
                        setTownRulesParishKey(parish.key);
                      }}
                      className="w-full text-left rounded-xl border border-slate-800 bg-slate-900/50 p-4 hover:border-slate-600 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{parish.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {overrideCount} active town override{overrideCount === 1 ? '' : 's'}
                            {' · '}
                            {parish.markets.length} active town{parish.markets.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      </div>
                    </button>
                  );
                })
              )}

              {townRulesParish && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6">
                  <button
                    type="button"
                    aria-label="Close"
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px]"
                    onClick={() => {
                      setTownRulesParishKey(null);
                      setSelectedTownOverrideIds([]);
                    }}
                  />
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="town-rules-parish-title"
                    className="relative w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
                      <div>
                        <h2
                          id="town-rules-parish-title"
                          className="text-base font-semibold text-white"
                        >
                          {townRulesParish.name} · town rules
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Active towns only. Select overrides to delete, or open one to review.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTownRulesParishKey(null);
                          setSelectedTownOverrideIds([]);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-4 space-y-3">
                      {townRulesParishOverrides.length === 0 ? (
                        <p className="text-sm text-slate-500 py-8 text-center">
                          No active town overrides in this parish. Use Add rule to create one.
                        </p>
                      ) : (
                        <>
                          {canWrite && (
                            <div className="flex flex-wrap items-center gap-2 pb-1">
                              <label className="flex items-center gap-2 text-xs text-slate-400">
                                <input
                                  type="checkbox"
                                  checked={
                                    townRulesParishOverrides.length > 0 &&
                                    townRulesParishOverrides.every((m) =>
                                      selectedTownOverrideIds.includes(m.market.id),
                                    )
                                  }
                                  onChange={(e) => {
                                    setSelectedTownOverrideIds(
                                      e.target.checked
                                        ? townRulesParishOverrides.map((m) => m.market.id)
                                        : [],
                                    );
                                  }}
                                />
                                Select all
                              </label>
                              <button
                                type="button"
                                disabled={bulkClearing || selectedTownOverrideIds.length === 0}
                                onClick={() =>
                                  void handleBulkClearTownOverrides(selectedTownOverrideIds)
                                }
                                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs hover:bg-slate-800 disabled:opacity-50"
                              >
                                {bulkClearing
                                  ? 'Deleting…'
                                  : `Delete selected (${selectedTownOverrideIds.length})`}
                              </button>
                            </div>
                          )}
                          {townRulesParishOverrides.map((m) => (
                            <div
                              key={m.market.id}
                              className="flex items-stretch gap-2 rounded-xl border border-slate-800 bg-slate-950/60"
                            >
                              {canWrite && (
                                <label className="flex items-center px-3 border-r border-slate-800">
                                  <input
                                    type="checkbox"
                                    checked={selectedTownOverrideIds.includes(m.market.id)}
                                    onChange={(e) => {
                                      setSelectedTownOverrideIds((prev) =>
                                        e.target.checked
                                          ? [...prev, m.market.id]
                                          : prev.filter((id) => id !== m.market.id),
                                      );
                                    }}
                                  />
                                </label>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setTownRulesParishKey(null);
                                  setTownRulesFocusId(m.market.id);
                                }}
                                className="flex-1 text-left px-4 py-3 hover:bg-slate-900/80"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-medium text-white">{m.market.name}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      Town override ·{' '}
                                      {m.town_override_enabled ? 'Active' : 'Inactive'}
                                    </p>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                                </div>
                              </button>
                              {canWrite && (
                                <div className="flex items-center px-3 border-l border-slate-800">
                                  <OverrideEnabledToggle
                                    enabled={Boolean(m.town_override_enabled)}
                                    onToggle={(next) =>
                                      void handleToggleTownOverride(m.market.id, next)
                                    }
                                    label={`${m.market.name} override`}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {rulesScope === 'market' && rulesPanel === 'list' && townRulesFocusId && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setTownRulesFocusId(null)}
                className="text-sm text-slate-400 hover:text-white"
              >
                ← All towns
              </button>
              <p className="text-sm font-medium text-white">
                {markets.find((m) => m.market.id === townRulesFocusId)?.market.name ?? 'Town'} — by
                party
              </p>
              {renderPartyCards('market', townRulesFocusId)}
            </div>
          )}

          {(rulesPanel === 'view' || rulesPanel === 'edit') && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6">
              <button
                type="button"
                aria-label="Close"
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px]"
                onClick={() => setRulesPanel('list')}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="pricing-rules-overlay-title"
                className="relative w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
                  <div>
                    {selectedParty ? (
                      <PartyRulesViewHeader
                        party={selectedParty}
                        scopeTitle={activeRulesTitle}
                        mode={rulesPanel === 'edit' ? 'edit' : 'view'}
                      />
                    ) : (
                      <h2 id="pricing-rules-overlay-title" className="text-base font-semibold text-white">
                        Rules · {activeRulesTitle}
                      </h2>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      Effective stack: {rulesStack.join(' → ')}
                      {rulesScope !== 'global' &&
                        (hasLayerOverride
                          ? layerOverrideEnabled
                            ? ' · custom override on'
                            : ' · override saved but off'
                          : ' · inheriting (saving creates an override)')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRulesPanel('list')}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 p-4 space-y-4">
                  {rulesLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                    </div>
                  ) : rulesPanel === 'view' ? (
                    <>
                      {renderPartyModalBody()}
                      <div className="flex flex-wrap gap-2 pt-2 items-center">
                        {canWrite && hasLayerOverride && rulesScope !== 'global' && (
                          <div className="flex items-center gap-2 mr-2 text-xs text-slate-400">
                            <span>Override</span>
                            <OverrideEnabledToggle
                              enabled={layerOverrideEnabled}
                              onToggle={(next) => {
                                if (rulesScope === 'parish') {
                                  void handleToggleParishOverride(selectedParishId, next).then(
                                    () => setLayerOverrideEnabled(next),
                                  );
                                } else {
                                  void handleToggleTownOverride(selectedMarketId, next).then(
                                    () => setLayerOverrideEnabled(next),
                                  );
                                }
                              }}
                              label="This override"
                            />
                          </div>
                        )}
                        {canWrite && selectedParty && selectedParty !== 'partner' && (
                          <button
                            type="button"
                            onClick={() => setRulesPanel('edit')}
                            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm"
                          >
                            Edit {PARTY_META[selectedParty].label.toLowerCase()}
                          </button>
                        )}
                        {canWrite && rulesScope !== 'global' && hasLayerOverride && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleClearLayerOverride()}
                            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 disabled:opacity-50"
                          >
                            Remove override
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setRulesPanel('list');
                            setSelectedParty(null);
                          }}
                          className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
                        >
                          Close
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {rulesScope === 'parish' && (
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Parish</label>
                          <select
                            value={selectedParishId}
                            onChange={(e) => setSelectedParishId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                          >
                            {(hasLayerOverride ? parishes : parishChoicesForAdd.length ? parishChoicesForAdd : parishes).map(
                              (p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                  {p.has_override ? ' · has override' : ''}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      )}
                      {rulesScope === 'market' && (
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Town / City</label>
                          <select
                            value={selectedMarketId}
                            onChange={(e) => setSelectedMarketId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                          >
                            {groupMarketsByParish(
                              hasLayerOverride
                                ? activeTowns
                                : townChoicesForAdd.length
                                  ? townChoicesForAdd
                                  : activeTowns,
                            ).map((parish) => (
                              <optgroup key={parish.key} label={parish.name}>
                                {parish.markets.map((m) => (
                                  <option key={m.market.id} value={m.market.id}>
                                    {m.market.name}
                                    {m.has_town_override ? ' · has override' : ''}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      )}
                      {renderPartyModalBody()}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {canWrite && selectedParty && selectedParty !== 'partner' && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleSavePartyRules()}
                            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50"
                          >
                            {saving
                              ? 'Saving…'
                              : rulesScope === 'global'
                                ? `Save ${PARTY_META[selectedParty].label.toLowerCase()}`
                                : 'Save override'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setRulesPanel(hasLayerOverride || rulesScope === 'global' ? 'view' : 'list')}
                          className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'tiers' && (
        <div className="space-y-3 max-w-2xl">
          {tiers.map((tier) => (
            <TierRow
              key={tier.id}
              tier={tier}
              canWrite={canWrite}
              onSave={(updates) => void handleTierUpdate(tier, updates)}
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
              <button
                type="button"
                disabled={simRunning || !simMerchantId || !tiers.length}
                onClick={() => void handleCompareTiers()}
                className="px-4 py-2 rounded-lg border border-amber-700/60 text-amber-200 text-sm disabled:opacity-50"
              >
                Compare tiers
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

          <SimStep n={4} title="Historical backtest">
            <p className="text-xs text-slate-500 mb-2">
              Replay recent orders against current rules — compare what would have been charged vs
              what was recorded.
            </p>
            <button
              type="button"
              disabled={backtestLoading}
              onClick={() => void runBacktest()}
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm disabled:opacity-50"
            >
              {backtestLoading ? 'Running…' : 'Backtest last 28 orders'}
            </button>
            {backtestRows.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left p-2">Order</th>
                      <th className="text-right p-2">Recorded</th>
                      <th className="text-right p-2">Replay</th>
                      <th className="text-right p-2">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtestRows.map((row) => (
                      <tr key={String(row.order_id)} className="border-t border-slate-800">
                        <td className="p-2 font-mono text-slate-400">
                          {String(row.order_id).slice(0, 8)}…
                        </td>
                        <td className="p-2 text-right text-slate-300">
                          {formatJmd(Number(row.recorded_total ?? 0))}
                        </td>
                        <td className="p-2 text-right text-white">
                          {formatJmd(Number(row.replay_total ?? 0))}
                        </td>
                        <td
                          className={`p-2 text-right ${
                            Number(row.delta_jmd ?? 0) === 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {Number(row.delta_jmd ?? 0) >= 0 ? '+' : ''}
                          {formatJmd(Number(row.delta_jmd ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SimStep>

          {simTierCompare.length > 0 && (
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-3 py-2 text-xs font-medium text-slate-400 bg-slate-900/80">
                Same basket — tier comparison
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2">Tier</th>
                      <th className="px-3 py-2">Customer total</th>
                      <th className="px-3 py-2">Delivery</th>
                      <th className="px-3 py-2">Commission</th>
                      <th className="px-3 py-2">Courier pay</th>
                      <th className="px-3 py-2">Subsidy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simTierCompare.map((row) => (
                      <tr key={row.tierId} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-white font-medium">{row.tierName}</td>
                        <td className="px-3 py-2 text-slate-200">
                          J${row.customerTotal.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          J${row.deliveryFee.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          J${row.commission.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          J${row.courierPay.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-amber-300">
                          J${row.subsidy.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {simResult && (
            <>
              {(simResult.party_rules as Record<string, unknown> | undefined) && (
                <ResolvedRulesPanel
                  resolved={
                    (simResult.party_rules as { resolved?: Record<string, unknown> })?.resolved as
                      | Partial<Record<PricingParty, Record<string, unknown>>>
                      | undefined
                  }
                  provenance={
                    (simResult.party_rules as { provenance?: Record<string, unknown> })
                      ?.provenance as
                      | Partial<Record<PricingParty, Record<string, string>>>
                      | undefined
                  }
                  stack={
                    (simResult.party_rules as { stack?: string[] })?.stack
                  }
                />
              )}
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
            </>
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
                    <td colSpan={4} className="p-4 text-center text-slate-500 text-sm">
                      No courier balances yet. Cash orders now enter{' '}
                      <code className="text-slate-400">pending_collection</code> at checkout;
                      balances appear after delivery. Historical orders were backfilled on deploy.
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

function OverrideEnabledToggle({
  enabled,
  onToggle,
  label,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${label} ${enabled ? 'active' : 'inactive'}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(!enabled);
      }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-emerald-500' : 'bg-slate-700'
      }`}
      title={enabled ? 'Override active — click to turn off' : 'Override off — click to turn on'}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function rulesPreviewBits(rules: PricingRulesPayload) {
  return {
    model: rules.pricing_v2_enabled ? 'Model B' : 'Legacy Model A',
    base: rules.delivery?.base_fee_jmd ?? 400,
    includedKm: rules.delivery?.included_km ?? 2,
    perKm: rules.delivery?.per_extra_km_jmd ?? 60,
    avgPct: Math.round((rules.service_fee?.avg_rate ?? 0.15) * 1000) / 10,
    courierPct: Math.round((rules.courier_delivery_share ?? 0.8) * 100),
    minOrder: rules.min_order_subtotal_jmd ?? 800,
  };
}

function RulesCardPreview({ rules }: { rules: PricingRulesPayload }) {
  const b = rulesPreviewBits(rules);
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <div className="rounded-lg bg-slate-950/70 px-2 py-1.5 text-slate-400">
        <span className="block text-slate-500">Model</span>
        <span className="text-slate-200">{b.model}</span>
      </div>
      <div className="rounded-lg bg-slate-950/70 px-2 py-1.5 text-slate-400">
        <span className="block text-slate-500">Base delivery</span>
        <span className="text-slate-200">{formatJmd(b.base)}</span>
      </div>
      <div className="rounded-lg bg-slate-950/70 px-2 py-1.5 text-slate-400">
        <span className="block text-slate-500">Service avg</span>
        <span className="text-slate-200">{b.avgPct}%</span>
      </div>
      <div className="rounded-lg bg-slate-950/70 px-2 py-1.5 text-slate-400">
        <span className="block text-slate-500">Courier share</span>
        <span className="text-slate-200">{b.courierPct}%</span>
      </div>
    </div>
  );
}

function RulesReadonlyBody({ rules }: { rules: PricingRulesPayload }) {
  const b = rulesPreviewBits(rules);
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Pricing model', value: b.model },
    { label: 'Base delivery', value: formatJmd(b.base) },
    { label: 'Included km', value: String(b.includedKm) },
    { label: 'Per extra km', value: formatJmd(b.perKm) },
    { label: 'Service average rate', value: `${b.avgPct}%` },
    {
      label: 'Service override rate',
      value: `${Math.round((rules.service_fee?.override_rate ?? 0.09) * 1000) / 10}%`,
    },
    {
      label: 'Override threshold',
      value: formatJmd(rules.service_fee?.override_threshold_jmd ?? 5000),
    },
    { label: 'Service min fee', value: formatJmd(rules.service_fee?.min_jmd ?? 150) },
    { label: 'Service max fee', value: formatJmd(rules.service_fee?.max_jmd ?? 2500) },
    { label: 'Minimum order', value: formatJmd(b.minOrder) },
    {
      label: 'Card processing fee',
      value: `${Math.round((rules.card_processing_fee_percent ?? 0.045) * 1000) / 10}%`,
    },
    { label: 'Courier delivery share', value: `${b.courierPct}%` },
    {
      label: 'COD pause threshold',
      value: formatJmd(rules.cod?.pause_threshold_jmd ?? 10000),
    },
    {
      label: 'Free delivery first N orders',
      value: String(rules.launch_promos?.free_delivery_first_n_orders ?? 0),
    },
  ];
  return (
    <dl className="rounded-xl border border-slate-800 divide-y divide-slate-800">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
          <dt className="text-slate-500">{row.label}</dt>
          <dd className="text-slate-200 font-medium text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RulesEditForm({
  rules,
  setRules,
  canWrite,
  scopeLabel,
}: {
  rules: PricingRulesPayload;
  setRules: React.Dispatch<React.SetStateAction<PricingRulesPayload>>;
  canWrite: boolean;
  scopeLabel: string;
}) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={Boolean(rules.pricing_v2_enabled)}
          onChange={(e) => setRules((r) => ({ ...r, pricing_v2_enabled: e.target.checked }))}
          disabled={!canWrite}
        />
        Enable Model B pricing for this {scopeLabel}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Base delivery (JMD)"
          value={rules.delivery?.base_fee_jmd ?? 400}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, base_fee_jmd: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Included km"
          value={rules.delivery?.included_km ?? 2}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, included_km: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Per extra km (JMD)"
          value={rules.delivery?.per_extra_km_jmd ?? 60}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, per_extra_km_jmd: v } }))
          }
          disabled={!canWrite}
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Service fee (bracketed)</h3>
        <div className="grid grid-cols-2 gap-3">
          <PctField
            label="Average rate (%)"
            value={Math.round((rules.service_fee?.avg_rate ?? 0.15) * 1000) / 10}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: { ...r.service_fee, mode: 'marginal', avg_rate: v / 100 },
              }))
            }
            disabled={!canWrite}
          />
          <PctField
            label="Override rate (%)"
            value={Math.round((rules.service_fee?.override_rate ?? 0.09) * 1000) / 10}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: { ...r.service_fee, mode: 'marginal', override_rate: v / 100 },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Override threshold (JMD)"
            value={rules.service_fee?.override_threshold_jmd ?? 5000}
            onChange={(v) =>
              setRules((r) => ({
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
            value={rules.service_fee?.min_jmd ?? 150}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: { ...r.service_fee, mode: 'marginal', min_jmd: v },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Maximum fee (JMD)"
            value={rules.service_fee?.max_jmd ?? 2500}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: { ...r.service_fee, mode: 'marginal', max_jmd: v },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Minimum order subtotal (JMD)"
            value={rules.min_order_subtotal_jmd ?? 800}
            onChange={(v) => setRules((r) => ({ ...r, min_order_subtotal_jmd: v }))}
            disabled={!canWrite}
          />
          <PctField
            label="Card processing fee (%)"
            value={Math.round((rules.card_processing_fee_percent ?? 0.045) * 1000) / 10}
            onChange={(v) => setRules((r) => ({ ...r, card_processing_fee_percent: v / 100 }))}
            disabled={!canWrite}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Courier delivery share (%)"
          value={Math.round((rules.courier_delivery_share ?? 0.8) * 100)}
          onChange={(v) => setRules((r) => ({ ...r, courier_delivery_share: v / 100 }))}
          disabled={!canWrite}
        />
        <Field
          label="COD pause threshold (JMD)"
          value={rules.cod?.pause_threshold_jmd ?? 10000}
          onChange={(v) =>
            setRules((r) => ({ ...r, cod: { ...r.cod, pause_threshold_jmd: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Free delivery first N orders"
          value={rules.launch_promos?.free_delivery_first_n_orders ?? 0}
          onChange={(v) =>
            setRules((r) => ({
              ...r,
              launch_promos: { free_delivery_first_n_orders: v },
            }))
          }
          disabled={!canWrite}
        />
      </div>
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
      {(breakdown.taxFoodJmd ?? 0) > 0 && (
        <SimLine label="GCT on food" value={breakdown.taxFoodJmd ?? 0} />
      )}
      {(breakdown.taxPlatformJmd ?? 0) > 0 && (
        <SimLine label="GCT on platform fees" value={breakdown.taxPlatformJmd ?? 0} />
      )}
      {(breakdown.taxFoodJmd ?? 0) === 0 && (breakdown.taxPlatformJmd ?? 0) === 0 && (
        <SimLine label="GCT (total)" value={breakdown.tax ?? 0} expected={expected?.tax} />
      )}
      <SimLine label="Tip" value={breakdown.tip ?? 0} />
      <SimLine label="Order total" value={breakdown.orderTotal ?? 0} expected={expected?.orderTotal} bold />
      <SimLine
        label="Processing fee (order)"
        value={breakdown.processingFeeOrder ?? breakdown.processingFee ?? 0}
        expected={expected?.processingFee}
      />
      <SimLine
        label="Customer pays"
        value={breakdown.customerTotal ?? breakdown.total ?? 0}
        expected={expected?.customerTotal}
        bold
      />
      <hr className="border-slate-800 my-2" />
      <p className="text-xs text-slate-500 uppercase tracking-wide">Split preview</p>
      <SimLine
        label="Merchant net (food − commission)"
        value={Math.max(
          0,
          (breakdown.discountedSubtotal ?? 0) - (breakdown.merchantCommissionAmount ?? 0),
        )}
      />
      <SimLine
        label="Courier net (delivery + tip net)"
        value={
          (breakdown.deliveryFeeCourierAmount ?? 0) + (breakdown.courierTipNet ?? breakdown.tip ?? 0)
        }
      />
      <SimLine
        label="Platform net (fees + commission + GCT held on COD)"
        value={
          (breakdown.serviceFee ?? 0)
          + (breakdown.merchantCommissionAmount ?? 0)
          + Math.max(0, breakdown.deliveryFeePlatformAmount ?? 0)
          + (breakdown.tax ?? 0)
        }
      />
      {(breakdown.promoCostJmd ?? 0) > 0 && (
        <SimLine label="Promo cost (platform)" value={breakdown.promoCostJmd ?? 0} />
      )}
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
  onSave: (updates: Partial<MerchantTierRow>) => void;
}) {
  const [pct, setPct] = useState(Math.round(tier.commission_rate * 100));
  const [baseFee, setBaseFee] = useState(Number(tier.base_delivery_fee_jmd ?? 0));
  const [inflationPct, setInflationPct] = useState(
    Math.round(Number(tier.menu_inflation_percent ?? 0) * 1000) / 10,
  );
  const [boost, setBoost] = useState(Number(tier.search_boost ?? 0));
  const [radiusKm, setRadiusKm] = useState(Number(tier.default_delivery_radius_km ?? 8));
  const [promoEligible, setPromoEligible] = useState(tier.promo_eligible !== false);
  const [isActive, setIsActive] = useState(tier.is_active !== false);

  useEffect(() => {
    setPct(Math.round(tier.commission_rate * 100));
    setBaseFee(Number(tier.base_delivery_fee_jmd ?? 0));
    setInflationPct(Math.round(Number(tier.menu_inflation_percent ?? 0) * 1000) / 10);
    setBoost(Number(tier.search_boost ?? 0));
    setRadiusKm(Number(tier.default_delivery_radius_km ?? 8));
    setPromoEligible(tier.promo_eligible !== false);
    setIsActive(tier.is_active !== false);
  }, [tier]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{tier.name}</p>
          <p className="text-xs text-slate-500">{tier.slug}</p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() =>
              onSave({
                commission_rate: pct / 100,
                base_delivery_fee_jmd: baseFee,
                menu_inflation_percent: inflationPct / 100,
                search_boost: boost,
                default_delivery_radius_km: radiusKm,
                promo_eligible: promoEligible,
                is_active: isActive,
              })
            }
            className="px-3 py-1 text-sm rounded-lg bg-amber-600 text-white shrink-0"
          >
            Save
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block text-xs text-slate-500">
          Commission %
          <input
            type="number"
            min={0}
            max={50}
            value={pct}
            disabled={!canWrite}
            onChange={(e) => setPct(Number(e.target.value))}
            className="mt-1 w-full px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
          />
        </label>
        <label className="block text-xs text-slate-500">
          Base delivery (JMD)
          <input
            type="number"
            min={0}
            value={baseFee}
            disabled={!canWrite}
            onChange={(e) => setBaseFee(Number(e.target.value))}
            className="mt-1 w-full px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
          />
        </label>
        <label className="block text-xs text-slate-500">
          Inflation %
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={inflationPct}
            disabled={!canWrite}
            onChange={(e) => setInflationPct(Number(e.target.value))}
            className="mt-1 w-full px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
          />
        </label>
        <label className="block text-xs text-slate-500">
          Search boost
          <input
            type="number"
            min={0}
            value={boost}
            disabled={!canWrite}
            onChange={(e) => setBoost(Number(e.target.value))}
            className="mt-1 w-full px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
          />
        </label>
        <label className="block text-xs text-slate-500">
          Radius (km)
          <input
            type="number"
            min={1}
            value={radiusKm}
            disabled={!canWrite}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="mt-1 w-full px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={promoEligible}
            disabled={!canWrite}
            onChange={(e) => setPromoEligible(e.target.checked)}
          />
          Promo eligible
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={isActive}
            disabled={!canWrite}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
      </div>
    </div>
  );
}
