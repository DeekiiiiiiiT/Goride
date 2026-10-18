import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ArrowLeft, Check, Circle, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import {
  archiveInHouseStore,
  getInHouseAudience,
  getMenuLibrary,
  listInHouseStores,
  listMarkets,
  saveInHouseAudience,
  saveInHouseStore,
  setInHouseStoreAudience,
  setInHouseStoreLive,
  townWithParish,
  uploadDeskImage,
} from '@roam/dash-admin-client';
import { useAdminConfirm } from '../../../contexts/AdminConfirmContext';
import { formatMoney } from '../../../components/ui/format';
import type { AdminOutletContext } from '../../../DashAdminPortal';
import { CUISINE_OPTIONS } from '../cuisineOptions';
import { defaultWeek, InHouseHoursFields, weekFromRows, type DayHours } from '../InHouseHoursFields';
import { DESK_ADMIN, restaurantStatus } from '../inHouseUi';
import { resolveStorePin } from '../resolveStorePin';

type ChecklistStepId = 'basics' | 'location' | 'hours' | 'photos' | 'ordering' | 'menu' | 'go-live';
type StepId = ChecklistStepId | 'pricing';

const STEPS: Array<{ id: ChecklistStepId; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'location', label: 'Location' },
  { id: 'hours', label: 'Hours' },
  { id: 'photos', label: 'Photos' },
  { id: 'ordering', label: 'How we order' },
  { id: 'menu', label: 'Menu' },
  { id: 'go-live', label: 'Go live' },
];

/** Stitch Oceanic Blue — restaurant-setup-basics.html */
const S = {
  page: 'bg-[#060f17] text-[#d2e8ff]',
  card: 'overflow-hidden rounded-xl border border-[#354a5c] bg-[#0a1b28] shadow-lg',
  rail: 'flex flex-col justify-between gap-6 border-r border-[#354a5c] bg-[#071520] p-4',
  pane: 'flex flex-col justify-between bg-[#0a1b28] p-6 sm:p-8',
  muted: 'text-[#98adc3]',
  input:
    'mt-1 w-full rounded-lg border border-[#354a5c] bg-[#122839] px-4 py-2.5 text-sm text-[#d2e8ff] placeholder:text-[#98adc3]/50 focus:border-[#adc6ff] focus:outline-none',
  cta: 'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#22d3ee] px-8 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-40 md:w-auto',
  ghost: 'rounded-lg border border-[#354a5c] bg-[#122839] px-3 py-2 text-sm text-[#d2e8ff] hover:bg-[#192e3f]',
  chipOff: 'rounded-full border border-[#354a5c] bg-[#122839] px-3.5 py-1.5 text-xs text-[#98adc3] transition hover:border-[#adc6ff]',
  chipOn: 'inline-flex items-center gap-1.5 rounded-full border border-[#7de9ff] bg-[#0e69dc] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm',
  chipPrimary: 'inline-flex items-center gap-1.5 rounded-full border border-[#7de9ff] bg-[#0e69dc] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm',
} as const;

const STEP_META: Record<ChecklistStepId | 'pricing', { title: string; blurb: string }> = {
  basics: {
    title: 'Restaurant Basics & Identity',
    blurb: 'Update the foundational commercial identifiers and select primary culinary classifications for customer matching.',
  },
  location: {
    title: 'Location & Market',
    blurb: 'Pin the restaurant and assign the delivery market customers will see.',
  },
  hours: {
    title: 'Operating Hours',
    blurb: 'Set when buyers can place orders at this restaurant.',
  },
  photos: {
    title: 'Storefront & Photos',
    blurb: 'Logo and cover shown on the customer store page.',
  },
  ordering: {
    title: 'How We Order',
    blurb: 'Tell buyers how to place the order at the restaurant.',
  },
  menu: {
    title: 'Menu & Catalog',
    blurb: 'A restaurant needs at least one section and one dish with a confirmed price.',
  },
  'go-live': {
    title: 'Go Live',
    blurb: 'Review blockers, choose who can order, then launch.',
  },
  pricing: {
    title: 'Pricing Rules',
    blurb: 'Markup and absorb limits for this restaurant.',
  },
};

export function InHouseRestaurantHomePage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { confirm, prompt } = useAdminConfirm();
  const isAdmin = getJwtRoles(session.user).some((role) => DESK_ADMIN.has(role)) || DESK_ADMIN.has(jwtPrimaryRole(session.user));
  const step = (params.get('step') as StepId) || 'basics';

  const [store, setStore] = useState<Record<string, unknown> | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [hasCard, setHasCard] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [markets, setMarkets] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [finding, setFinding] = useState(false);
  const [betaPeople, setBetaPeople] = useState<Array<{ customer_id: string; email: string }>>([]);
  const [betaEmail, setBetaEmail] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [cuisineList, setCuisineList] = useState<string[] | null>(null);
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [marketId, setMarketId] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [hours, setHours] = useState<DayHours[]>(defaultWeek());
  const [orderChannel, setOrderChannel] = useState('web');
  const [orderUrl, setOrderUrl] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [tosReviewed, setTosReviewed] = useState(false);
  const [markup, setMarkup] = useState('15');
  const [absorbPercent, setAbsorbPercent] = useState('10');
  const [absorbDollars, setAbsorbDollars] = useState('500');
  const [maxOrder, setMaxOrder] = useState('');
  const [notes, setNotes] = useState('');

  function openStep(next: StepId) {
    const updated = new URLSearchParams(params);
    updated.set('step', next);
    setParams(updated, { replace: true });
  }

  async function load() {
    try {
      const [result, marketResult] = await Promise.all([
        listInHouseStores(session.access_token),
        listMarkets(session.access_token, { includeZones: false }),
      ]);
      setEnabled(Boolean(result.enabled));
      setHasCard(Boolean(result.hasCard));
      const row = (result.stores as Array<Record<string, unknown>>).find((item) => String(item.merchant_id) === id) || null;
      if (!row) {
        setLoadError('Restaurant not found');
        setStore(null);
        return;
      }
      setStore(row);
      setLoadError('');
      const merchant = (row.merchant || {}) as Record<string, unknown>;
      setName(String(merchant.name || ''));
      setPhone(String(merchant.phone || ''));
      setCuisineType(String(merchant.cuisine_type || ''));
      const multi = Array.isArray(merchant.cuisines) ? merchant.cuisines.map(String).filter(Boolean) : [];
      setCuisines(multi.length ? multi : (merchant.cuisine_type ? [String(merchant.cuisine_type)] : []));
      setAddress(String(merchant.address || ''));
      setLat(merchant.lat == null ? '' : String(merchant.lat));
      setLng(merchant.lng == null ? '' : String(merchant.lng));
      setMarketId(String(merchant.market_id || ''));
      setLogoUrl(String(merchant.logo_url || ''));
      setCoverImageUrl(String(merchant.cover_image_url || ''));
      setHours(weekFromRows(row.hours));
      setOrderChannel(String(row.order_channel || 'web'));
      setOrderUrl(String(row.order_url || ''));
      setOrderPhone(String(row.order_phone || ''));
      setPickupInstructions(String(row.pickup_instructions || ''));
      setTosReviewed(Boolean(row.tos_reviewed_at));
      setMarkup(String(Number(row.markup_bps || 1500) / 100));
      setAbsorbPercent(String(Number(row.price_tolerance_bps || 1000) / 100));
      setAbsorbDollars(String(Number(row.absorb_cap_minor || 50000) / 100));
      setMaxOrder(row.max_order_minor == null ? '' : String(Number(row.max_order_minor) / 100));
      setNotes(String(row.notes || ''));
      const parishName = new Map((marketResult.parishes ?? []).map((parish) => [parish.id, parish.name]));
      const seen = new Set<string>();
      setMarkets((marketResult.markets ?? []).filter((town) => {
        if (!town.is_active || seen.has(town.id)) return false;
        seen.add(town.id);
        return true;
      }).map((town) => ({
        id: town.id,
        name: townWithParish(town.name, town.parish_name ?? parishName.get(town.parish_id ?? '') ?? null),
      })));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load restaurant');
    }
  }

  useEffect(() => { void load(); }, [id, session.access_token]);
  useEffect(() => {
    void getMenuLibrary(session.access_token)
      .then((library) => setCuisineList(library.cuisines.filter((c) => !c.archivedAt).map((c) => c.label)))
      .catch(() => setCuisineList(null));
  }, [session.access_token]);

  const cuisineChoices = useMemo(() => {
    const base = cuisineList ?? CUISINE_OPTIONS;
    return [...base, ...cuisines.filter((c) => !base.includes(c))];
  }, [cuisineList, cuisines]);

  useEffect(() => {
    if (!isAdmin) return;
    void getInHouseAudience(session.access_token).then((result) => setBetaPeople(result.customers)).catch(() => undefined);
  }, [isAdmin, session.access_token]);

  const done = useMemo((): Record<ChecklistStepId, boolean> => ({
    basics: Boolean(name.trim()),
    location: Boolean(address.trim() && lat && lng && marketId),
    hours: hours.some((day) => !day.isClosed),
    photos: true,
    ordering: Boolean((orderChannel === 'phone' ? orderPhone : orderUrl) && tosReviewed),
    menu: Number(store?.freshDishCount || 0) > 0,
    'go-live': Array.isArray(store?.goLiveBlockers) && (store?.goLiveBlockers as string[]).length === 0,
  }), [name, address, lat, lng, marketId, hours, orderChannel, orderPhone, orderUrl, tosReviewed, store]);

  const doneCount = Object.values(done).filter(Boolean).length;
  const stepIndex = step === 'pricing' ? 0 : STEPS.findIndex((item) => item.id === step) + 1;

  async function save(patch: Record<string, unknown>) {
    if (!isAdmin) {
      toast.error('Only admins can edit restaurant details');
      return;
    }
    setSaving(true);
    try {
      await saveInHouseStore(session.access_token, { merchantId: id, ...patch });
      toast.success('Saved');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function locate() {
    setFinding(true);
    try {
      const pin = await resolveStorePin(address);
      setAddress(pin.address);
      setLat(pin.lat);
      setLng(pin.lng);
      toast.success('Location found');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not find that location');
    } finally {
      setFinding(false);
    }
  }

  async function upload(folder: 'logos' | 'covers', file: File) {
    try {
      const uploaded = await uploadDeskImage(session.access_token, file, folder);
      if (folder === 'logos') {
        setLogoUrl(uploaded.publicUrl);
        await save({ logoUrl: uploaded.publicUrl });
      } else {
        setCoverImageUrl(uploaded.publicUrl);
        await save({ coverImageUrl: uploaded.publicUrl });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload');
    }
  }

  const exampleDish = 1000;
  const customerExample = Math.ceil((exampleDish * (1 + Number(markup || 0) / 100)) / 10) * 10;
  const blockers = Array.isArray(store?.goLiveBlockers) ? store.goLiveBlockers as string[] : [];
  const status = store ? restaurantStatus(store as never) : 'Setting up';
  const live = Boolean((store?.merchant as { in_house_live?: boolean } | null)?.in_house_live);
  const audience = String(store?.audience || 'beta');
  const meta = STEP_META[step] || STEP_META.basics;

  if (loadError) {
    return (
      <div className={`space-y-3 p-4 ${S.page}`}>
        <Link to="/in-house?tab=restaurants" className={`inline-flex items-center gap-1 text-sm text-[#7de9ff] hover:underline`}>
          <ArrowLeft className="h-3.5 w-3.5" /> Restaurants
        </Link>
        <p className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">{loadError}</p>
      </div>
    );
  }
  if (!store) return <div className={`p-4 ${S.muted}`}>Loading restaurant…</div>;

  return (
    <div className={`-mx-4 -mt-4 min-h-full space-y-6 p-4 sm:-mx-6 sm:p-6 lg:p-8 ${S.page}`}>
      {/* Header — Stitch */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex flex-col gap-1">
          <Link to="/in-house?tab=restaurants" className="inline-flex w-fit items-center gap-1 text-sm text-[#7de9ff] hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Restaurants
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-[#d2e8ff]">{name || 'Restaurant'}</h1>
            <span className="rounded-full border border-[#354a5c] bg-[#122839] px-2.5 py-1 text-xs text-[#98adc3]">
              {status} · {doneCount} of 7 done
            </span>
          </div>
          <p className={`text-sm ${S.muted}`}>Manage configuration settings, menus, operational hours, and integration parameters.</p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-[#fa746f] px-4 py-2 text-sm font-semibold text-[#fa746f] transition hover:bg-[#fa746f]/10"
            onClick={() => void confirm({
              title: 'Archive restaurant',
              description: 'This hides it from the list and customers. Past orders stay.',
              confirmLabel: 'Archive',
            }).then((ok) => {
              if (!ok) return;
              return archiveInHouseStore(session.access_token, id).then(() => {
                toast.success('Restaurant archived');
                navigate('/in-house?tab=restaurants');
              });
            }).catch((error: Error) => toast.error(error.message))}
          >
            <Archive className="h-3.5 w-3.5" /> Archive restaurant
          </button>
        ) : null}
      </div>

      {/* Two-column setup card */}
      <div className={`grid grid-cols-1 md:grid-cols-[260px_1fr] ${S.card}`}>
        <aside className={S.rail}>
          <div className="flex flex-col gap-1">
            <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider ${S.muted}`}>Setup</div>
            <nav className="flex flex-col gap-1">
              {STEPS.map((item, index) => {
                const active = step === item.id;
                const complete = done[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openStep(item.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? 'bg-[#0e69dc] font-semibold text-white'
                        : 'text-[#98adc3] hover:bg-[#122839] hover:text-[#d2e8ff]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`h-2 w-2 rounded-full ${active ? 'bg-[#7de9ff]' : 'opacity-0'}`} />
                      <span>{index + 1} {item.label}</span>
                    </span>
                    {complete || active ? (
                      <Check className={`h-3.5 w-3.5 ${active ? 'text-[#7de9ff]' : 'text-emerald-400'}`} />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-[#354a5c]" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
          {isAdmin ? (
            <div className="border-t border-[#354a5c] pt-4">
              <button
                type="button"
                onClick={() => openStep('pricing')}
                className={`inline-flex items-center gap-1.5 text-xs ${step === 'pricing' ? 'font-semibold text-[#7de9ff]' : 'text-[#7de9ff] hover:underline'}`}
              >
                <CreditCard className="h-3.5 w-3.5" /> Pricing rules
              </button>
            </div>
          ) : null}
        </aside>

        <section className={S.pane}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <span className="w-fit rounded border border-[#354a5c] bg-[#0e69dc]/20 px-2.5 py-0.5 text-xs font-semibold text-[#7de9ff]">
                {step === 'pricing' ? 'Pricing rules' : `Step ${stepIndex} of 7 · ${STEPS[stepIndex - 1]?.label || 'Basics'}`}
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-[#d2e8ff]">{meta.title}</h2>
              <p className={`text-sm ${S.muted}`}>{meta.blurb}</p>
            </div>

            {step === 'basics' ? (
              <form
                className="flex flex-col gap-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({ name, phone, cuisineType: cuisines[0] || cuisineType, cuisines });
                }}
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#d2e8ff]">
                    Restaurant name
                    <input className={S.input} value={name} onChange={(event) => setName(event.target.value)} required />
                    <span className={`font-normal ${S.muted}`}>Shown to customers and buyers.</span>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#d2e8ff]">
                    Phone
                    <input className={S.input} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 876-555-0123" />
                    <span className={`font-normal ${S.muted}`}>Direct operational contact for the restaurant.</span>
                  </label>
                </div>
                <fieldset className="flex flex-col gap-3">
                  <legend className="text-xs font-semibold text-[#d2e8ff]">Cuisines</legend>
                  <p className={`text-xs ${S.muted}`}>
                    Pick all that apply. The first selected is primary for search and the store card.
                    {isAdmin ? (
                      <>
                        {' '}
                        <Link to="/in-house?tab=library" className="text-[#7de9ff] hover:underline">Add or edit cuisines →</Link>
                      </>
                    ) : null}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {cuisineChoices.map((cuisine) => {
                      const on = cuisines.includes(cuisine);
                      const primary = cuisines[0] === cuisine;
                      return (
                        <button
                          key={cuisine}
                          type="button"
                          className={on ? (primary ? S.chipPrimary : S.chipOn) : S.chipOff}
                          onClick={() => {
                            setCuisines((current) => {
                              if (current.includes(cuisine)) return current.filter((c) => c !== cuisine);
                              return [...current, cuisine];
                            });
                            setCuisineType((current) => current || cuisine);
                          }}
                        >
                          {on ? <Check className="h-3 w-3 text-[#7de9ff]" /> : null}
                          {cuisine}{primary ? ' · primary' : ''}
                        </button>
                      );
                    })}
                  </div>
                  {cuisines.length > 1 ? (
                    <label className={`block text-xs ${S.muted}`}>
                      Primary cuisine
                      <select
                        className={S.input}
                        value={cuisines[0] || ''}
                        onChange={(event) => {
                          const primary = event.target.value;
                          setCuisines((current) => [primary, ...current.filter((c) => c !== primary)]);
                          setCuisineType(primary);
                        }}
                      >
                        {cuisines.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  ) : null}
                </fieldset>
                {isAdmin ? (
                  <div className="flex justify-end border-t border-[#354a5c] pt-6">
                    <button disabled={saving} className={S.cta} type="submit">
                      {saving ? 'Saving…' : 'Save basics'} <span aria-hidden>→</span>
                    </button>
                  </div>
                ) : null}
              </form>
            ) : null}

            {step === 'location' ? (
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({ address, lat: lat || null, lng: lng || null, marketId });
                }}
              >
                <label className="text-xs font-semibold text-[#d2e8ff] md:col-span-2">
                  Address or Plus Code
                  <div className="mt-1 flex gap-2">
                    <input className={`${S.input} mt-0 min-w-0 flex-1`} value={address} onChange={(event) => { setAddress(event.target.value); setLat(''); setLng(''); }} />
                    <button type="button" className={S.ghost} disabled={finding || !address.trim()} onClick={() => void locate()}>{finding ? 'Finding…' : 'Find'}</button>
                  </div>
                </label>
                {lat && lng ? (
                  <div className="overflow-hidden rounded-lg border border-[#354a5c] md:col-span-2">
                    <iframe
                      title="Map preview"
                      className="h-48 w-full"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=16&output=embed`}
                    />
                    <p className={`bg-[#071520] px-3 py-2 text-xs ${S.muted}`}>Pin at {lat}, {lng}</p>
                  </div>
                ) : <p className={`text-sm md:col-span-2 ${S.muted}`}>Find the address to preview the pin.</p>}
                <label className="text-xs font-semibold text-[#d2e8ff] md:col-span-2">
                  Market
                  <select className={S.input} value={marketId} onChange={(event) => setMarketId(event.target.value)} required>
                    <option value="">Choose market</option>
                    {markets.map((market) => <option key={market.id} value={market.id}>{market.name}</option>)}
                  </select>
                </label>
                {isAdmin ? (
                  <div className="flex justify-end border-t border-[#354a5c] pt-6 md:col-span-2">
                    <button disabled={saving} className={S.cta} type="submit">{saving ? 'Saving…' : 'Save location'} <span aria-hidden>→</span></button>
                  </div>
                ) : null}
              </form>
            ) : null}

            {step === 'hours' ? (
              <div className="space-y-4">
                <InHouseHoursFields hours={hours} onChange={setHours} />
                {isAdmin ? (
                  <div className="flex justify-end border-t border-[#354a5c] pt-6">
                    <button
                      type="button"
                      disabled={saving}
                      className={S.cta}
                      onClick={() => void save({ hours: hours.map((day, index) => ({ dayOfWeek: index, open: day.open, close: day.close, isClosed: day.isClosed })) })}
                    >
                      {saving ? 'Saving…' : 'Save hours'} <span aria-hidden>→</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 'photos' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-[#d2e8ff]">
                  Logo
                  <input className="mt-2 block w-full text-sm text-[#98adc3]" type="file" accept="image/*" disabled={!isAdmin} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload('logos', file); }} />
                  {logoUrl ? <img src={logoUrl} alt="" className="mt-2 h-20 w-20 rounded-full object-cover ring-1 ring-[#354a5c]" /> : null}
                  <span className={`mt-1 block font-normal ${S.muted}`}>Shown as the customer app icon.</span>
                </label>
                <label className="text-xs font-semibold text-[#d2e8ff]">
                  Cover photo
                  <input className="mt-2 block w-full text-sm text-[#98adc3]" type="file" accept="image/*" disabled={!isAdmin} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload('covers', file); }} />
                  {coverImageUrl ? <img src={coverImageUrl} alt="" className="mt-2 h-24 w-full rounded-lg object-cover ring-1 ring-[#354a5c]" /> : null}
                  <span className={`mt-1 block font-normal ${S.muted}`}>Full-bleed banner on the store page.</span>
                </label>
              </div>
            ) : null}

            {step === 'ordering' ? (
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({ orderChannel, orderUrl, orderPhone, pickupInstructions, tosReviewed, notes });
                }}
              >
                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold text-[#d2e8ff]">How we order</legend>
                  {(['web', 'phone', 'whatsapp'] as const).map((channel) => (
                    <label key={channel} className="flex items-center gap-2 rounded-lg border border-[#354a5c] bg-[#122839] p-3 text-sm">
                      <input type="radio" name="channel" checked={orderChannel === channel} onChange={() => setOrderChannel(channel)} />
                      {channel === 'web' ? 'Website' : channel === 'phone' ? 'Phone' : 'WhatsApp'}
                    </label>
                  ))}
                </fieldset>
                {orderChannel === 'phone' ? (
                  <label className="text-xs font-semibold text-[#d2e8ff]">Order phone<input className={S.input} value={orderPhone} onChange={(event) => setOrderPhone(event.target.value)} /></label>
                ) : (
                  <label className="text-xs font-semibold text-[#d2e8ff]">
                    Ordering link
                    <div className="mt-1 flex gap-2">
                      <input className={`${S.input} mt-0 min-w-0 flex-1`} value={orderUrl} onChange={(event) => setOrderUrl(event.target.value)} placeholder="https://" />
                      {orderUrl ? <a className={S.ghost} href={orderUrl} target="_blank" rel="noreferrer">Test link ↗</a> : null}
                    </div>
                  </label>
                )}
                <label className="text-xs font-semibold text-[#d2e8ff]">
                  Pickup instructions
                  <textarea className={S.input} value={pickupInstructions} onChange={(event) => setPickupInstructions(event.target.value)} placeholder="Shown to the buyer at the counter" />
                </label>
                <label className="flex items-center gap-2 text-sm text-[#d2e8ff]">
                  <input type="checkbox" checked={tosReviewed} onChange={(event) => setTosReviewed(event.target.checked)} />
                  I&apos;ve read the restaurant&apos;s website terms
                </label>
                {store.tos_reviewed_at ? <p className={`text-xs ${S.muted}`}>Reviewed {String(store.tos_reviewed_by || 'someone')} on {new Date(String(store.tos_reviewed_at)).toLocaleDateString()}</p> : null}
                <label className="text-xs font-semibold text-[#d2e8ff]">Notes<textarea className={S.input} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
                {isAdmin ? (
                  <div className="flex justify-end border-t border-[#354a5c] pt-6">
                    <button disabled={saving} className={S.cta} type="submit">{saving ? 'Saving…' : 'Save ordering'} <span aria-hidden>→</span></button>
                  </div>
                ) : null}
              </form>
            ) : null}

            {step === 'menu' ? (
              <div className="space-y-4">
                <p className={`text-sm ${S.muted}`}>A restaurant needs at least one section and one dish with a confirmed price.</p>
                <p className="text-sm text-[#d2e8ff]">{Number(store.dishCount || 0)} dishes · {Number(store.freshDishCount || 0)} prices confirmed · {Number(store.staleDishCount || 0)} out of date</p>
                <Link to={`/in-house/restaurants/${id}/menu`} className={S.cta}>Build menu →</Link>
              </div>
            ) : null}

            {step === 'go-live' ? (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-[#d2e8ff]">Ready to go live?</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {blockers.length === 0 ? <li className="text-emerald-300">✓ Everything needed is ready</li> : blockers.map((blocker) => (
                      <li key={blocker} className="text-[#7de9ff]">✗ {blocker}</li>
                    ))}
                    {!hasCard ? <li className="text-[#7de9ff]">✗ No company card can pay for this yet</li> : null}
                    {!enabled ? <li className="text-[#7de9ff]">✗ The In-House switch is off</li> : null}
                  </ul>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-[#d2e8ff]">Who can order</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={audience === 'beta'} disabled={!isAdmin} onChange={() => void setInHouseStoreAudience(session.access_token, id, 'beta').then(load)} />
                    Closed test: only people on the test list ({betaPeople.length} people)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={audience === 'public'} disabled={!isAdmin} onChange={() => void setInHouseStoreAudience(session.access_token, id, 'public').then(load)} />
                    Everyone in this market
                  </label>
                  {isAdmin ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveInHouseAudience(session.access_token, { email: betaEmail })
                          .then(() => getInHouseAudience(session.access_token))
                          .then((result) => { setBetaPeople(result.customers); setBetaEmail(''); })
                          .catch((error: Error) => toast.error(error.message));
                      }}
                    >
                      <input className={S.input} placeholder="Customer email" value={betaEmail} onChange={(event) => setBetaEmail(event.target.value)} />
                      <button className={S.ghost} type="submit">Add</button>
                    </form>
                  ) : null}
                </div>
                {isAdmin ? (
                  live ? (
                    <button
                      type="button"
                      className={S.ghost}
                      onClick={() => void prompt({
                        title: 'Pause restaurant',
                        description: 'Customers will stop seeing this restaurant. Reason examples: Brand objected, Too many problems, Other.',
                        confirmLabel: 'Pause',
                        fields: [
                          { key: 'reason', label: 'Reason', placeholder: 'e.g. Brand objected', required: true },
                        ],
                      }).then((values) => {
                        if (!values) return;
                        return setInHouseStoreLive(session.access_token, id, { live: false, reason: values.reason || 'Paused' }).then(() => {
                          toast.success('Restaurant paused');
                          return load();
                        });
                      }).catch((error: Error) => toast.error(error.message))}
                    >
                      Pause restaurant
                    </button>
                  ) : (
                    <div>
                      <button
                        type="button"
                        disabled={blockers.length > 0}
                        className={S.cta}
                        onClick={() => void setInHouseStoreLive(session.access_token, id, { live: true }).then(() => {
                          toast.success('Restaurant is live');
                          return load();
                        }).catch((error: Error) => toast.error(error.message))}
                      >
                        Go live →
                      </button>
                      {blockers.length > 0 ? <p className={`mt-2 text-sm ${S.muted}`}>Fix: {blockers[0]}</p> : null}
                    </div>
                  )
                ) : null}
                {store.paused_at ? (
                  <p className={`text-sm ${S.muted}`}>Paused by {String(store.paused_by || 'someone')} on {new Date(String(store.paused_at)).toLocaleDateString()}: {String(store.paused_reason || '')}</p>
                ) : null}
              </div>
            ) : null}

            {step === 'pricing' && isAdmin ? (
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({
                    markupBps: Math.round(Number(markup) * 100),
                    priceToleranceBps: Math.round(Number(absorbPercent) * 100),
                    absorbCapMinor: Math.round(Number(absorbDollars) * 100),
                    maxOrderMinor: maxOrder === '' ? null : Math.round(Number(maxOrder) * 100),
                  });
                }}
              >
                <label className="text-xs font-semibold text-[#d2e8ff]">Markup %
                  <input className={S.input} value={markup} onChange={(event) => setMarkup(event.target.value)} />
                </label>
                <label className="text-xs font-semibold text-[#d2e8ff]">Roam absorbs up to %
                  <input className={S.input} value={absorbPercent} onChange={(event) => setAbsorbPercent(event.target.value)} />
                </label>
                <label className="text-xs font-semibold text-[#d2e8ff]">Roam absorbs up to J$
                  <input className={S.input} value={absorbDollars} onChange={(event) => setAbsorbDollars(event.target.value)} />
                </label>
                <label className="text-xs font-semibold text-[#d2e8ff]">Order limit J$
                  <input className={S.input} value={maxOrder} onChange={(event) => setMaxOrder(event.target.value)} placeholder="optional" />
                </label>
                <div className={`space-y-1 text-sm md:col-span-2 ${S.muted}`}>
                  <p>A J${exampleDish.toLocaleString()} dish shows customers <strong className="text-[#d2e8ff]">{formatMoney(customerExample)}</strong> ({markup || 0}% markup, rounded up to the next J$10).</p>
                  <p>If the restaurant charges more than expected, Roam pays the difference up to <strong className="text-[#d2e8ff]">{absorbPercent || 0}% or J${absorbDollars || 0}</strong>, whichever is smaller.</p>
                </div>
                <div className="flex justify-end border-t border-[#354a5c] pt-6 md:col-span-2">
                  <button disabled={saving} className={S.cta} type="submit">{saving ? 'Saving…' : 'Save pricing rules'} <span aria-hidden>→</span></button>
                </div>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
