import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { getInHouseAudience, listInHouseMarkets, listInHouseStores, saveInHouseAudience, saveInHouseStore, uploadDeskImage } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { CUISINE_OPTIONS } from './cuisineOptions';
import { defaultWeek, InHouseHoursFields, weekFromRows, type DayHours } from './InHouseHoursFields';
import { InHouseMenuEditor } from './InHouseMenuEditor';
import { parkDraft, shouldResumeOpen } from './pendingDrafts';
import { resolveStorePin } from './resolveStorePin';

type StoreRow = Record<string, unknown> & {
  merchant_id?: string;
  merchant?: { name?: string; in_house_live?: boolean; address?: string; phone?: string; lat?: number; lng?: number; logo_url?: string; cover_image_url?: string; market_id?: string; cuisine_type?: string } | null;
  hours?: unknown;
  markup_bps?: number;
  price_tolerance_bps?: number;
  absorb_cap_minor?: number;
  order_url?: string;
  order_phone?: string;
  order_channel?: string;
  notes?: string;
  tos_reviewed_at?: string | null;
  demand30d?: { orders?: number; cost?: number };
};

type FormState = {
  name: string;
  phone: string;
  cuisineType: string;
  address: string;
  lat: string;
  lng: string;
  marketId: string;
  logoUrl: string;
  coverImageUrl: string;
  hours: DayHours[];
  orderUrl: string;
  orderPhone: string;
  orderChannel: string;
  markup: string;
  absorbPercent: string;
  absorbDollars: string;
  notes: string;
  tosReviewed: boolean;
};

const STEPS = ['Name', 'Cuisine', 'Location', 'Hours', 'Photos', 'How Roam orders'];
const DRAFTS_KEY = 'roam.inhouse.pending';
const OPEN_KEY = 'roam.inhouse.open';

type WizardDraft = {
  id: string;
  step: number;
  form: FormState;
  merchantId?: string;
  updatedAt: string;
};

type OpenDraft = WizardDraft & { resume?: boolean };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeDrafts(drafts: WizardDraft[]) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

function readyToStore(form: FormState) {
  return Boolean(form.name.trim() && form.address.trim() && form.lat && form.lng && form.marketId);
}

function normalizeForm(form: Partial<FormState> | null | undefined): FormState {
  const blank = blankForm();
  if (!form) return blank;
  return {
    ...blank,
    ...form,
    hours: Array.isArray(form.hours) && form.hours.length === 7 ? form.hours : blank.hours,
  };
}

function blankForm(): FormState {
  return {
    name: '', phone: '', cuisineType: '', address: '', lat: '', lng: '', marketId: '',
    logoUrl: '', coverImageUrl: '', hours: defaultWeek(),
    orderUrl: '', orderPhone: '', orderChannel: 'web', markup: '15', absorbPercent: '10', absorbDollars: '500',
    notes: '', tosReviewed: false,
  };
}

function formFromStore(store: StoreRow): FormState {
  const merchant = store.merchant;
  return {
    name: merchant?.name || '',
    phone: merchant?.phone || '',
    cuisineType: merchant?.cuisine_type || '',
    address: merchant?.address || '',
    lat: merchant?.lat == null ? '' : String(merchant.lat),
    lng: merchant?.lng == null ? '' : String(merchant.lng),
    marketId: merchant?.market_id || '',
    logoUrl: merchant?.logo_url || '',
    coverImageUrl: merchant?.cover_image_url || '',
    hours: weekFromRows(store.hours),
    orderUrl: store.order_url || '',
    orderPhone: store.order_phone || '',
    orderChannel: store.order_channel || 'web',
    markup: String(Number(store.markup_bps || 1500) / 100),
    absorbPercent: String(Number(store.price_tolerance_bps || 1000) / 100),
    absorbDollars: String(Number(store.absorb_cap_minor || 50000) / 100),
    notes: store.notes || '',
    tosReviewed: Boolean(store.tos_reviewed_at),
  };
}

const field = 'rounded bg-slate-900 p-2';

export function InHouseStoresPage({ embedded = false }: { embedded?: boolean } = {}) {
  return <InHouseRestaurantDesk mode="stores" embedded={embedded} />;
}

export function InHouseMenuPage({ embedded = false }: { embedded?: boolean } = {}) {
  return <InHouseRestaurantDesk mode="menu" embedded={embedded} />;
}

function InHouseRestaurantDesk({ mode, embedded = false }: { mode: 'stores' | 'menu'; embedded?: boolean }) {
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.access_token;
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [markets, setMarkets] = useState<Array<{ id: string; name: string }>>([]);
  const [creating, setCreating] = useState(mode === 'stores');
  const [section, setSection] = useState<'create' | 'pending'>('create');
  const [drafts, setDrafts] = useState<WizardDraft[]>([]);
  const [draftId, setDraftId] = useState('');
  const [savedId, setSavedId] = useState('');
  const [step, setStep] = useState(0);
  const [editingId, setEditingId] = useState('');
  const [tab, setTab] = useState<'details' | 'hours' | 'menu'>(mode === 'menu' ? 'menu' : 'details');
  const [form, setForm] = useState<FormState>(blankForm());
  const [finding, setFinding] = useState(false);
  const [uploading, setUploading] = useState('');
  const [betaPeople, setBetaPeople] = useState<Array<{ customer_id: string; email: string }>>([]);
  const [betaEmail, setBetaEmail] = useState('');

  function load() {
    return listInHouseStores(token).then((result) => {
      setStores(result.stores as StoreRow[]);
      setEnabled(Boolean(result.enabled));
    }).catch((error: Error) => toast.error(error.message));
  }
  useEffect(() => {
    if (mode !== 'stores') return;
    const pending = readJson<WizardDraft[]>(DRAFTS_KEY) || [];
    setDrafts(pending);
    const open = readJson<OpenDraft>(OPEN_KEY);
    if (!shouldResumeOpen(open, pending)) {
      if (open) localStorage.removeItem(OPEN_KEY);
      return;
    }
    setDraftId(open.id);
    setStep(Math.min(Math.max(open.step || 0, 0), STEPS.length - 1));
    setForm(normalizeForm(open.form));
    setSavedId(open.merchantId || '');
  }, [mode]);

  useEffect(() => {
    if (mode !== 'stores' || editingId) return;
    if (!draftId && !form.name.trim() && step === 0) return;
    const id = draftId || crypto.randomUUID();
    if (!draftId) setDraftId(id);
    const previous = readJson<OpenDraft>(OPEN_KEY);
    localStorage.setItem(OPEN_KEY, JSON.stringify({
      id,
      step,
      form,
      merchantId: savedId,
      updatedAt: new Date().toISOString(),
      resume: previous?.id === id && previous.resume === true,
    }));
  }, [mode, editingId, draftId, step, form, savedId]);

  useEffect(() => {
    void load();
    void listInHouseMarkets(token).then((result) => {
      const seen = new Set<string>();
      setMarkets((result.markets || []).filter((town) => {
        if (seen.has(town.id)) return false;
        seen.add(town.id);
        return true;
      }).map((town) => ({ id: town.id, name: town.name })));
    }).catch((error: Error) => toast.error(error.message));
    if (mode === 'stores') {
      void getInHouseAudience(token).then((result) => setBetaPeople(result.customers)).catch(() => undefined);
    }
  }, [token, mode]);

  const editing = stores.find((store) => String(store.merchant_id) === editingId) || null;

  function openStore(store: StoreRow, nextTab: 'details' | 'hours' | 'menu') {
    setEditingId(String(store.merchant_id));
    setForm(formFromStore(store));
    setTab(nextTab);
    setCreating(false);
  }

  function upsertDraft(draft: WizardDraft) {
    const stored = readJson<WizardDraft[]>(DRAFTS_KEY) || [];
    const next = parkDraft(stored, draft);
    writeDrafts(next);
    setDrafts(next);
  }

  function startFresh() {
    setDraftId('');
    setSavedId('');
    setStep(0);
    setForm(blankForm());
    localStorage.removeItem(OPEN_KEY);
  }

  function continueDraft(draft: WizardDraft) {
    setSection('create');
    setCreating(true);
    setEditingId('');
    setDraftId(draft.id);
    setSavedId(draft.merchantId || '');
    setStep(Math.min(Math.max(draft.step || 0, 0), STEPS.length - 1));
    setForm(normalizeForm(draft.form));
    localStorage.setItem(OPEN_KEY, JSON.stringify({ ...draft, resume: true }));
  }

  function storePayload(create: boolean) {
    return {
      create,
      merchantId: savedId || undefined,
      name: form.name,
      phone: form.phone,
      cuisineType: form.cuisineType,
      address: form.address,
      lat: form.lat ? Number(form.lat) : null,
      lng: form.lng ? Number(form.lng) : null,
      marketId: form.marketId,
      logoUrl: form.logoUrl,
      coverImageUrl: form.coverImageUrl,
      hours: form.hours.map((day, index) => ({ dayOfWeek: index, open: day.open, close: day.close, isClosed: day.isClosed })),
      orderUrl: form.orderUrl,
      orderPhone: form.orderPhone,
      orderChannel: form.orderChannel,
      markupBps: Math.round(Number(form.markup) * 100),
      priceToleranceBps: Math.round(Number(form.absorbPercent) * 100),
      absorbCapMinor: Math.round(Number(form.absorbDollars) * 100),
      notes: form.notes,
      tosReviewed: form.tosReviewed,
      live: false,
    };
  }

  async function locate() {
    setFinding(true);
    try {
      const pin = await resolveStorePin(form.address);
      setForm((current) => ({ ...current, address: pin.address, lat: pin.lat, lng: pin.lng }));
      toast.success('Location found');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not find that location');
    } finally {
      setFinding(false);
    }
  }

  async function upload(folder: 'logos' | 'covers', file: File) {
    setUploading(folder);
    try {
      const uploaded = await uploadDeskImage(token, file, folder);
      setForm((current) => folder === 'logos' ? { ...current, logoUrl: uploaded.publicUrl } : { ...current, coverImageUrl: uploaded.publicUrl });
      toast.success('Photo added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload the photo');
    } finally {
      setUploading('');
    }
  }

  function stepReady() {
    if (step === 0) return Boolean(form.name.trim());
    if (step === 1) return Boolean(form.cuisineType);
    if (step === 2) return Boolean(form.address.trim() && form.lat && form.lng && form.marketId);
    if (step === 3) return form.hours.some((day) => !day.isClosed);
    return true;
  }

  async function save(create: boolean) {
    const result = await saveInHouseStore(token, {
      ...storePayload(create),
      merchantId: editingId || savedId || undefined,
      create: create && !editingId && !savedId,
      live: create ? false : Boolean(editing?.merchant?.in_house_live),
    });
    toast.success(create ? 'Restaurant added' : 'Restaurant saved');
    await load();
    if (create && result.merchantId) {
      clearDraft(draftId);
      setEditingId(result.merchantId);
      setTab('menu');
      setCreating(false);
      setSavedId('');
    }
  }

  function clearDraft(id: string) {
    const stored = readJson<WizardDraft[]>(DRAFTS_KEY) || [];
    const next = stored.filter((item) => item.id !== id);
    setDrafts(next);
    writeDrafts(next);
    localStorage.removeItem(OPEN_KEY);
    setDraftId('');
  }

  async function saveStep() {
    if (!form.name.trim()) {
      toast.error('Add a restaurant name first');
      return;
    }
    const id = draftId || crypto.randomUUID();
    let merchantId = savedId;
    if (readyToStore(form)) {
      const result = await saveInHouseStore(token, { ...storePayload(!merchantId), merchantId: merchantId || undefined, create: !merchantId });
      merchantId = result.merchantId || merchantId;
      await load();
    }
    upsertDraft({
      id,
      step,
      form,
      merchantId: merchantId || undefined,
      updatedAt: new Date().toISOString(),
    });
    startFresh();
    toast.success('Saved under Pending. This form is ready for the next restaurant.');
  }

  const showEditor = Boolean(editingId);
  const menuDesk = mode === 'menu' && showEditor && tab === 'menu';
  return (
    <div className={menuDesk ? 'text-slate-100' : 'space-y-4 p-4 text-slate-100'}>
      {menuDesk || (embedded && mode === 'stores' && !showEditor) ? null : <h1 className="text-xl font-semibold">{mode === 'menu' ? (showEditor && tab === 'details' ? 'Restaurant details' : showEditor && tab === 'hours' ? 'Hours' : 'Menu prices') : 'In-House stores'}</h1>}
      {mode === 'stores' ? (
        <p className="text-sm text-slate-400">{enabled ? 'The public switch is on.' : 'The public switch is off. A store can be saved, but it cannot go live.'} Tax stays off until the accountant answers. If a brand objects, turn that store off the same day.</p>
      ) : null}

      {!showEditor && mode === 'stores' ? (
        <div className="flex gap-2">
          <button type="button" className={`rounded-lg px-3 py-1 ${section === 'create' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800'}`} onClick={() => {
            setSection('create');
            if (draftId && drafts.some((item) => item.id === draftId)) startFresh();
          }}>Create restaurant</button>
          <button type="button" className={`rounded-lg px-3 py-1 ${section === 'pending' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800'}`} onClick={() => setSection('pending')}>Pending{drafts.length ? ` (${drafts.length})` : ''}</button>
        </div>
      ) : null}

      {showEditor && !menuDesk ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="min-h-11 text-sm text-slate-300" onClick={() => { setEditingId(''); setCreating(mode === 'stores'); }}>Restaurants</button>
            {mode === 'menu' ? (
              <div className="ml-auto flex gap-2">
                <button type="button" className={`min-h-11 rounded-lg px-3 text-sm ${tab === 'details' ? 'bg-slate-800' : 'text-slate-400'}`} onClick={() => setTab('details')}>Details</button>
                <button type="button" className={`min-h-11 rounded-lg px-3 text-sm ${tab === 'hours' ? 'bg-slate-800' : 'text-slate-400'}`} onClick={() => setTab('hours')}>Hours</button>
                {tab !== 'menu' ? <button type="button" className="min-h-11 rounded-lg px-3 text-sm text-amber-200" onClick={() => setTab('menu')}>Prices</button> : null}
              </div>
            ) : (
              <div className="flex gap-2">
                {(['details', 'hours', 'menu'] as const).map((item) => (
                  <button key={item} type="button" className={`min-h-11 rounded-lg px-3 text-sm ${tab === item ? 'bg-amber-500 text-slate-950' : 'bg-slate-800'}`} onClick={() => setTab(item)}>
                    {item === 'details' ? 'Details' : item === 'hours' ? 'Hours' : 'Menu'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {tab === 'menu' && editingId ? (
            <InHouseMenuEditor
              token={token}
              merchantId={editingId}
              restaurantName={form.name || editing?.merchant?.name || 'Restaurant'}
              marketName={markets.find((market) => market.id === (editing?.merchant?.market_id || form.marketId))?.name || 'Jamaica'}
              initials={(session.user.email || 'RR').replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'RR'}
              markupBps={Number(editing?.markup_bps ?? 1500)}
              onBack={() => { setEditingId(''); setCreating(false); }}
              onDetails={() => setTab('details')}
              onHours={() => setTab('hours')}
            />
          ) : null}
          {tab !== 'menu' ? (
            <form className="grid gap-2 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(false).catch((error: Error) => toast.error(error.message)); }}>
              {tab === 'details' ? <DetailsFields form={form} setForm={setForm} markets={markets} finding={finding} onFind={() => void locate()} uploading={uploading} onUpload={upload} /> : null}
              {tab === 'hours' ? <InHouseHoursFields hours={form.hours} onChange={(hours) => setForm({ ...form, hours })} /> : null}
              <button className="rounded-xl bg-amber-500 text-slate-950 px-3 py-2 md:col-span-2" type="submit">Save restaurant</button>
            </form>
          ) : null}
        </div>
      ) : null}

      {menuDesk && editingId ? (
        <InHouseMenuEditor
          token={token}
          merchantId={editingId}
          restaurantName={form.name || editing?.merchant?.name || 'Restaurant'}
          marketName={markets.find((market) => market.id === (editing?.merchant?.market_id || form.marketId))?.name || 'Jamaica'}
          initials={(session.user.email || 'RR').replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'RR'}
          markupBps={Number(editing?.markup_bps ?? 1500)}
          onBack={() => { setEditingId(''); setCreating(false); }}
          onDetails={() => setTab('details')}
          onHours={() => setTab('hours')}
        />
      ) : null}

      {!showEditor && creating && mode === 'stores' && section === 'pending' ? (
        <div className="space-y-2">
          {drafts.length === 0 ? <p className="text-sm text-slate-400">Nothing waiting. Save any step and it will stay here.</p> : null}
          {drafts.map((draft) => (
            <article key={draft.id} className="rounded border border-slate-800 p-3">
              <div className="font-medium">{draft.form.name.trim() || 'Unnamed restaurant'}</div>
              <div className="text-sm text-slate-400">Step {draft.step + 1} of {STEPS.length} · {STEPS[draft.step] || 'Name'}</div>
              <button type="button" className="mt-2 rounded bg-slate-800 px-3 py-1" onClick={() => continueDraft(draft)}>Continue</button>
            </article>
          ))}
        </div>
      ) : null}

      {!showEditor && creating && mode === 'stores' && section === 'create' ? (
        <form className="grid gap-2 md:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          if (step < STEPS.length - 1) {
            if (!stepReady()) {
              toast.error('Finish this step first');
              return;
            }
            setStep(step + 1);
            return;
          }
          void save(true).catch((error: Error) => toast.error(error.message));
        }}>
          <p className="text-sm text-slate-400 md:col-span-2">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          {step === 0 ? (
            <>
              <input className={field} placeholder="Restaurant name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <input className={field} placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </>
          ) : null}
          {step === 1 ? (
            <select className={field} value={form.cuisineType} onChange={(event) => setForm({ ...form, cuisineType: event.target.value })} required>
              <option value="">Cuisine</option>
              {CUISINE_OPTIONS.map((cuisine) => <option key={cuisine} value={cuisine}>{cuisine}</option>)}
            </select>
          ) : null}
          {step === 2 ? (
            <>
              <div className="flex gap-2 md:col-span-2">
                <input className={`${field} min-w-0 flex-1`} placeholder="Paste a Plus Code or address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value, lat: '', lng: '' })} required />
                <button type="button" className="rounded bg-slate-800 px-3" disabled={finding || !form.address.trim()} onClick={() => void locate()}>{finding ? 'Finding…' : 'Find'}</button>
              </div>
              <input className={field} placeholder="Latitude" value={form.lat} readOnly />
              <input className={field} placeholder="Longitude" value={form.lng} readOnly />
              <select className={field} value={form.marketId} onChange={(event) => setForm({ ...form, marketId: event.target.value })} required>
                <option value="">Market</option>
                {markets.map((market) => <option key={market.id} value={market.id}>{market.name}</option>)}
              </select>
            </>
          ) : null}
          {step === 3 ? <InHouseHoursFields hours={form.hours} onChange={(hours) => setForm({ ...form, hours })} /> : null}
          {step === 4 ? <PhotoFields form={form} uploading={uploading} onUpload={upload} /> : null}
          {step === 5 ? <BuyingFields form={form} setForm={setForm} /> : null}
          <div className="flex gap-2 md:col-span-2">
            {step > 0 ? <button type="button" className="rounded bg-slate-800 px-3 py-2" onClick={() => setStep(step - 1)}>Back</button> : null}
            <button type="button" className="rounded bg-slate-800 px-3 py-2" onClick={() => void saveStep().catch((error: Error) => toast.error(error.message))}>Save</button>
            <button className="rounded-xl bg-amber-500 text-slate-950 px-3 py-2" type="submit">{step === STEPS.length - 1 ? 'Add restaurant' : 'Next'}</button>
          </div>
        </form>
      ) : null}

      {mode === 'stores' && !showEditor ? (
        <section className="rounded border border-slate-800 p-3 text-sm">
          <h2 className="font-medium">Who can order</h2>
          <p className="mt-1 text-slate-400">Only these people see a closed test restaurant. Everyone else does not see it in search, on the store page, or at checkout.</p>
          <form className="mt-2 flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            void saveInHouseAudience(token, { email: betaEmail }).then(() => getInHouseAudience(token)).then((result) => {
              setBetaPeople(result.customers);
              setBetaEmail('');
            }).catch((error: Error) => toast.error(error.message));
          }}>
            <input className="rounded bg-slate-900 p-2" placeholder="Customer email" value={betaEmail} onChange={(event) => setBetaEmail(event.target.value)} />
            <button className="rounded bg-slate-800 px-3" type="submit">Add</button>
          </form>
          <ul className="mt-2 space-y-1">
            {betaPeople.map((person) => (
              <li key={person.customer_id} className="flex items-center justify-between gap-2">
                <span>{person.email}</span>
                <button type="button" className="text-slate-400" onClick={() => void saveInHouseAudience(token, { remove: true, customerId: person.customer_id }).then(() => setBetaPeople((current) => current.filter((row) => row.customer_id !== person.customer_id)))}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!showEditor && (mode === 'menu' || section === 'create') ? stores.filter((store) => !drafts.some((draft) => draft.merchantId && draft.merchantId === String(store.merchant_id))).map((store) => {
        const merchant = store.merchant;
        const live = Boolean(merchant?.in_house_live);
        const audience = String(store.audience || 'beta');
        const demand = store.demand30d;
        return (
          <article key={String(store.merchant_id)} className="rounded border border-slate-800 p-3">
            <div className="font-medium">{merchant?.name || String(store.merchant_id || '')}</div>
            <div className="text-sm text-slate-400">{demand?.orders || 0} orders / 30 days · J${Math.round(Number(demand?.cost || 0) / 100)}</div>
            <div className="text-sm">Markup {Number(store.markup_bps || 0) / 100}% · {live ? 'Live' : 'Paused'} · {audience === 'public' ? 'Everyone' : 'Closed test'}</div>
            <div className="mt-2 flex gap-2">
              <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => openStore(store, mode === 'menu' ? 'menu' : 'details')}>{mode === 'menu' ? 'Open menu' : 'Edit'}</button>
              {mode === 'stores' ? (
                <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void saveInHouseStore(token, {
                  merchantId: store.merchant_id,
                  live: !live,
                  markupBps: store.markup_bps,
                  priceToleranceBps: store.price_tolerance_bps,
                  absorbCapMinor: store.absorb_cap_minor,
                  orderUrl: store.order_url,
                  orderPhone: store.order_phone,
                  orderChannel: store.order_channel,
                }).then(() => { toast.success(live ? 'Store paused' : 'Store is live'); return load(); }).catch((error: Error) => toast.error(error.message))}>
                  {live ? 'Turn off' : 'Turn on'}
                </button>
              ) : null}
              {mode === 'stores' ? (
                <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void saveInHouseStore(token, {
                  merchantId: store.merchant_id,
                  audience: audience === 'public' ? 'beta' : 'public',
                  live,
                  markupBps: store.markup_bps,
                  priceToleranceBps: store.price_tolerance_bps,
                  absorbCapMinor: store.absorb_cap_minor,
                }).then(load).catch((error: Error) => toast.error(error.message))}>
                  {audience === 'public' ? 'Closed test only' : 'Everyone'}
                </button>
              ) : null}
            </div>
          </article>
        );
      }) : null}
    </div>
  );
}

function DetailsFields({
  form,
  setForm,
  markets,
  finding,
  onFind,
  uploading,
  onUpload,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  markets: Array<{ id: string; name: string }>;
  finding: boolean;
  onFind: () => void;
  uploading: string;
  onUpload: (folder: 'logos' | 'covers', file: File) => void;
}) {
  return (
    <>
      <input className={field} placeholder="Restaurant name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      <input className={field} placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      <select className={field} value={form.cuisineType} onChange={(event) => setForm({ ...form, cuisineType: event.target.value })}>
        <option value="">Cuisine</option>
        {CUISINE_OPTIONS.map((cuisine) => <option key={cuisine} value={cuisine}>{cuisine}</option>)}
      </select>
      <div className="flex gap-2 md:col-span-2">
        <input className={`${field} min-w-0 flex-1`} placeholder="Paste a Plus Code or address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value, lat: '', lng: '' })} />
        <button type="button" className="rounded bg-slate-800 px-3" disabled={finding || !form.address.trim()} onClick={onFind}>{finding ? 'Finding…' : 'Find'}</button>
      </div>
      <input className={field} placeholder="Latitude" value={form.lat} readOnly />
      <input className={field} placeholder="Longitude" value={form.lng} readOnly />
      <select className={field} value={form.marketId} onChange={(event) => setForm({ ...form, marketId: event.target.value })}>
        <option value="">Market</option>
        {markets.map((market) => <option key={market.id} value={market.id}>{market.name}</option>)}
      </select>
      <PhotoFields form={form} uploading={uploading} onUpload={onUpload} />
      <BuyingFields form={form} setForm={setForm} />
    </>
  );
}

function PhotoFields({ form, uploading, onUpload }: { form: FormState; uploading: string; onUpload: (folder: 'logos' | 'covers', file: File) => void }) {
  return (
    <>
      <label className="text-sm">Logo
        <input className="mt-1 block w-full text-sm" type="file" accept="image/*" disabled={uploading === 'logos'} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload('logos', file); }} />
        {form.logoUrl ? <img src={form.logoUrl} alt="" className="mt-2 h-16 w-16 rounded object-cover" /> : null}
      </label>
      <label className="text-sm">Cover photo
        <input className="mt-1 block w-full text-sm" type="file" accept="image/*" disabled={uploading === 'covers'} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload('covers', file); }} />
        {form.coverImageUrl ? <img src={form.coverImageUrl} alt="" className="mt-2 h-16 w-full rounded object-cover" /> : null}
      </label>
    </>
  );
}

function BuyingFields({ form, setForm }: { form: FormState; setForm: (form: FormState) => void }) {
  return (
    <>
      <input className={field} placeholder="Ordering page link" value={form.orderUrl} onChange={(event) => setForm({ ...form, orderUrl: event.target.value })} />
      <input className={field} placeholder="Order phone" value={form.orderPhone} onChange={(event) => setForm({ ...form, orderPhone: event.target.value })} />
      <select className={field} value={form.orderChannel} onChange={(event) => setForm({ ...form, orderChannel: event.target.value })}>
        <option value="web">Website</option>
        <option value="phone">Phone</option>
        <option value="whatsapp">WhatsApp</option>
      </select>
      <label className="text-sm">Markup %<input className={`mt-1 w-full ${field}`} value={form.markup} onChange={(event) => setForm({ ...form, markup: event.target.value })} /></label>
      <label className="text-sm">Roam absorbs up to %<input className={`mt-1 w-full ${field}`} value={form.absorbPercent} onChange={(event) => setForm({ ...form, absorbPercent: event.target.value })} /></label>
      <label className="text-sm">Roam absorbs up to J$<input className={`mt-1 w-full ${field}`} value={form.absorbDollars} onChange={(event) => setForm({ ...form, absorbDollars: event.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.tosReviewed} onChange={(event) => setForm({ ...form, tosReviewed: event.target.checked })} /> Website terms reviewed</label>
      <textarea className={`${field} md:col-span-2`} placeholder="Notes, including whether the counter accepts a name and order number" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
    </>
  );
}
