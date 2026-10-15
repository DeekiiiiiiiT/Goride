import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import {
  archiveInHouseStore,
  getInHouseAudience,
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
  { id: 'hours', label: 'Opening hours' },
  { id: 'photos', label: 'Photos (optional)' },
  { id: 'ordering', label: 'How Roam orders' },
  { id: 'menu', label: 'Menu' },
  { id: 'go-live', label: 'Who can order & go live' },
];

const field = 'mt-1 w-full rounded bg-slate-900 p-2';

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

  if (loadError) {
    return (
      <div className="space-y-3 p-4 text-slate-100">
        <Link to="/in-house?tab=restaurants" className="text-sm text-slate-300">← Restaurants</Link>
        <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-100">{loadError}</p>
      </div>
    );
  }
  if (!store) return <div className="p-4 text-slate-300">Loading restaurant…</div>;

  return (
    <div className="space-y-4 p-4 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/in-house?tab=restaurants" className="text-sm text-slate-400">← Restaurants</Link>
          <h1 className="text-xl font-semibold">{name || 'Restaurant'}</h1>
          <p className="text-sm text-slate-400">{status} · {doneCount} of 7 done</p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-sm text-red-200"
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
            Archive restaurant
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          {STEPS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${step === item.id ? 'bg-slate-800' : 'text-slate-400 hover:bg-slate-900'}`}
              onClick={() => openStep(item.id)}
            >
              <span>{done[item.id] ? '✓' : '○'}</span>
              <span>{index + 1}. {item.label}</span>
            </button>
          ))}
          {isAdmin ? (
            <button type="button" className={`w-full rounded px-3 py-2 text-left text-sm ${step === 'pricing' ? 'bg-slate-800' : 'text-slate-400'}`} onClick={() => openStep('pricing')}>
              Pricing rules
            </button>
          ) : null}
        </nav>

        <section className="space-y-3 rounded border border-slate-800 p-4">
          {step === 'basics' ? (
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => {
              event.preventDefault();
              void save({ name, phone, cuisineType });
            }}>
              <label className="text-sm">Restaurant name
                <input className={field} value={name} onChange={(event) => setName(event.target.value)} required />
                <span className="mt-1 block text-xs text-slate-500">Shown to customers and buyers.</span>
              </label>
              <label className="text-sm">Phone
                <input className={field} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 876-555-0123" />
              </label>
              <label className="text-sm md:col-span-2">Cuisine
                <select className={field} value={cuisineType} onChange={(event) => setCuisineType(event.target.value)}>
                  <option value="">Choose cuisine</option>
                  {CUISINE_OPTIONS.map((cuisine) => <option key={cuisine} value={cuisine}>{cuisine}</option>)}
                </select>
              </label>
              {isAdmin ? <button disabled={saving} className="rounded-xl bg-amber-500 px-3 py-2 text-slate-950 md:col-span-2 disabled:opacity-40" type="submit">{saving ? 'Saving…' : 'Save basics'}</button> : null}
            </form>
          ) : null}

          {step === 'location' ? (
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => {
              event.preventDefault();
              void save({ address, lat: lat || null, lng: lng || null, marketId });
            }}>
              <label className="text-sm md:col-span-2">Address or Plus Code
                <div className="mt-1 flex gap-2">
                  <input className={`${field} mt-0 min-w-0 flex-1`} value={address} onChange={(event) => { setAddress(event.target.value); setLat(''); setLng(''); }} />
                  <button type="button" className="rounded bg-slate-800 px-3" disabled={finding || !address.trim()} onClick={() => void locate()}>{finding ? 'Finding…' : 'Find'}</button>
                </div>
              </label>
              {lat && lng ? (
                <div className="md:col-span-2 overflow-hidden rounded border border-slate-700">
                  <iframe
                    title="Map preview"
                    className="h-48 w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=16&output=embed`}
                  />
                  <p className="bg-slate-900 px-3 py-2 text-xs text-slate-400">Pin at {lat}, {lng}</p>
                </div>
              ) : <p className="text-sm text-slate-400 md:col-span-2">Find the address to preview the pin.</p>}
              <label className="text-sm md:col-span-2">Market
                <select className={field} value={marketId} onChange={(event) => setMarketId(event.target.value)} required>
                  <option value="">Choose market</option>
                  {markets.map((market) => <option key={market.id} value={market.id}>{market.name}</option>)}
                </select>
              </label>
              {isAdmin ? <button disabled={saving} className="rounded-xl bg-amber-500 px-3 py-2 text-slate-950 md:col-span-2 disabled:opacity-40" type="submit">{saving ? 'Saving…' : 'Save location'}</button> : null}
            </form>
          ) : null}

          {step === 'hours' ? (
            <div className="space-y-3">
              <InHouseHoursFields hours={hours} onChange={setHours} />
              {isAdmin ? <button type="button" disabled={saving} className="rounded-xl bg-amber-500 px-3 py-2 text-slate-950 disabled:opacity-40" onClick={() => void save({ hours: hours.map((day, index) => ({ dayOfWeek: index, open: day.open, close: day.close, isClosed: day.isClosed })) })}>{saving ? 'Saving…' : 'Save hours'}</button> : null}
            </div>
          ) : null}

          {step === 'photos' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">Logo
                <input className="mt-1 block w-full text-sm" type="file" accept="image/*" disabled={!isAdmin} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload('logos', file); }} />
                {logoUrl ? <img src={logoUrl} alt="" className="mt-2 h-20 w-20 rounded-full object-cover" /> : null}
                <span className="mt-1 block text-xs text-slate-500">Shown as the customer app icon.</span>
              </label>
              <label className="text-sm">Cover photo
                <input className="mt-1 block w-full text-sm" type="file" accept="image/*" disabled={!isAdmin} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload('covers', file); }} />
                {coverImageUrl ? <img src={coverImageUrl} alt="" className="mt-2 h-24 w-full rounded object-cover" /> : null}
                <span className="mt-1 block text-xs text-slate-500">Full-bleed banner on the store page.</span>
              </label>
            </div>
          ) : null}

          {step === 'ordering' ? (
            <form className="grid gap-3" onSubmit={(event) => {
              event.preventDefault();
              void save({ orderChannel, orderUrl, orderPhone, pickupInstructions, tosReviewed, notes });
            }}>
              <fieldset className="space-y-2">
                <legend className="text-sm">How we order</legend>
                {(['web', 'phone', 'whatsapp'] as const).map((channel) => (
                  <label key={channel} className="flex items-center gap-2 rounded border border-slate-800 p-3 text-sm">
                    <input type="radio" name="channel" checked={orderChannel === channel} onChange={() => setOrderChannel(channel)} />
                    {channel === 'web' ? 'Website' : channel === 'phone' ? 'Phone' : 'WhatsApp'}
                  </label>
                ))}
              </fieldset>
              {orderChannel === 'phone' ? (
                <label className="text-sm">Order phone<input className={field} value={orderPhone} onChange={(event) => setOrderPhone(event.target.value)} /></label>
              ) : (
                <label className="text-sm">Ordering link
                  <div className="mt-1 flex gap-2">
                    <input className={`${field} mt-0 min-w-0 flex-1`} value={orderUrl} onChange={(event) => setOrderUrl(event.target.value)} placeholder="https://" />
                    {orderUrl ? <a className="rounded bg-slate-800 px-3 py-2 text-sm" href={orderUrl} target="_blank" rel="noreferrer">Test link ↗</a> : null}
                  </div>
                </label>
              )}
              <label className="text-sm">Pickup instructions
                <textarea className={field} value={pickupInstructions} onChange={(event) => setPickupInstructions(event.target.value)} placeholder="Shown to the buyer at the counter" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={tosReviewed} onChange={(event) => setTosReviewed(event.target.checked)} />
                I&apos;ve read the restaurant&apos;s website terms
              </label>
              {store.tos_reviewed_at ? <p className="text-xs text-slate-500">Reviewed {String(store.tos_reviewed_by || 'someone')} on {new Date(String(store.tos_reviewed_at)).toLocaleDateString()}</p> : null}
              <label className="text-sm">Notes<textarea className={field} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              {isAdmin ? <button disabled={saving} className="rounded-xl bg-amber-500 px-3 py-2 text-slate-950 disabled:opacity-40" type="submit">{saving ? 'Saving…' : 'Save ordering'}</button> : null}
            </form>
          ) : null}

          {step === 'menu' ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">A restaurant needs at least one section and one dish with a confirmed price.</p>
              <p className="text-sm">{Number(store.dishCount || 0)} dishes · {Number(store.freshDishCount || 0)} prices confirmed · {Number(store.staleDishCount || 0)} out of date</p>
              <Link to={`/in-house/restaurants/${id}/menu`} className="inline-block rounded-xl bg-amber-500 px-3 py-2 text-slate-950">Build menu →</Link>
            </div>
          ) : null}

          {step === 'go-live' ? (
            <div className="space-y-4">
              <div>
                <h2 className="font-medium">Ready to go live?</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {blockers.length === 0 ? <li className="text-emerald-300">✓ Everything needed is ready</li> : blockers.map((blocker) => (
                    <li key={blocker} className="text-amber-200">✗ {blocker}</li>
                  ))}
                  {!hasCard ? <li className="text-amber-200">✗ No company card can pay for this yet</li> : null}
                  {!enabled ? <li className="text-amber-200">✗ The In-House switch is off</li> : null}
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Who can order</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={audience === 'beta'} disabled={!isAdmin} onChange={() => void setInHouseStoreAudience(session.access_token, id, 'beta').then(load)} />
                  Closed test: only people on the test list ({betaPeople.length} people)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={audience === 'public'} disabled={!isAdmin} onChange={() => void setInHouseStoreAudience(session.access_token, id, 'public').then(load)} />
                  Everyone in this market
                </label>
                {isAdmin ? (
                  <form className="flex gap-2" onSubmit={(event) => {
                    event.preventDefault();
                    void saveInHouseAudience(session.access_token, { email: betaEmail })
                      .then(() => getInHouseAudience(session.access_token))
                      .then((result) => { setBetaPeople(result.customers); setBetaEmail(''); })
                      .catch((error: Error) => toast.error(error.message));
                  }}>
                    <input className="rounded bg-slate-900 p-2 text-sm" placeholder="Customer email" value={betaEmail} onChange={(event) => setBetaEmail(event.target.value)} />
                    <button className="rounded bg-slate-800 px-3 text-sm" type="submit">Add</button>
                  </form>
                ) : null}
              </div>
              {isAdmin ? (
                live ? (
                  <button
                    type="button"
                    className="rounded-xl bg-slate-800 px-3 py-2"
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
                      className="rounded-xl bg-amber-500 px-3 py-2 text-slate-950 disabled:opacity-40"
                      onClick={() => void setInHouseStoreLive(session.access_token, id, { live: true }).then(() => {
                        toast.success('Restaurant is live');
                        return load();
                      }).catch((error: Error) => toast.error(error.message))}
                    >
                      Go live
                    </button>
                    {blockers.length > 0 ? <p className="mt-2 text-sm text-slate-400">Fix: {blockers[0]}</p> : null}
                  </div>
                )
              ) : null}
              {store.paused_at ? (
                <p className="text-sm text-slate-400">Paused by {String(store.paused_by || 'someone')} on {new Date(String(store.paused_at)).toLocaleDateString()}: {String(store.paused_reason || '')}</p>
              ) : null}
            </div>
          ) : null}

          {step === 'pricing' && isAdmin ? (
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => {
              event.preventDefault();
              void save({
                markupBps: Math.round(Number(markup) * 100),
                priceToleranceBps: Math.round(Number(absorbPercent) * 100),
                absorbCapMinor: Math.round(Number(absorbDollars) * 100),
                maxOrderMinor: maxOrder === '' ? null : Math.round(Number(maxOrder) * 100),
              });
            }}>
              <label className="text-sm">Markup %
                <input className={field} value={markup} onChange={(event) => setMarkup(event.target.value)} />
              </label>
              <label className="text-sm">Roam absorbs up to %
                <input className={field} value={absorbPercent} onChange={(event) => setAbsorbPercent(event.target.value)} />
              </label>
              <label className="text-sm">Roam absorbs up to J$
                <input className={field} value={absorbDollars} onChange={(event) => setAbsorbDollars(event.target.value)} />
              </label>
              <label className="text-sm">Order limit J$
                <input className={field} value={maxOrder} onChange={(event) => setMaxOrder(event.target.value)} placeholder="optional" />
              </label>
              <div className="space-y-1 text-sm text-slate-400 md:col-span-2">
                <p>A J${exampleDish.toLocaleString()} dish shows customers <strong className="text-slate-100">{formatMoney(customerExample)}</strong> ({markup || 0}% markup, rounded up to the next J$10).</p>
                <p>If the restaurant charges more than expected, Roam pays the difference up to <strong className="text-slate-100">{absorbPercent || 0}% or J${absorbDollars || 0}</strong>, whichever is smaller.</p>
              </div>
              <button disabled={saving} className="rounded-xl bg-amber-500 px-3 py-2 text-slate-950 md:col-span-2 disabled:opacity-40" type="submit">{saving ? 'Saving…' : 'Save pricing rules'}</button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}
