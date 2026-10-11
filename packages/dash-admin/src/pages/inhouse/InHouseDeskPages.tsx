import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  approveInHousePurchase,
  createInHouseCard,
  getInHouseRecon,
  getInHouseReports,
  importInHouseStatement,
  listInHouseCards,
  listInHouseMarkets,
  listInHouseMenu,
  listInHouseQueue,
  listInHouseStores,
  resolveInHouseTask,
  saveInHouseMenu,
  saveInHouseStore,
} from '@roam/dash-admin-client';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

function useToken() {
  const { session } = useOutletContext<AdminOutletContext>();
  return session.access_token;
}

const OPS = new Set(['dash_ops', 'dash_admin', 'platform_owner', 'platform_support', 'superadmin']);

export function InHouseExceptionsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.access_token;
  const isOps = getJwtRoles(session.user).some((role) => OPS.has(role)) || OPS.has(jwtPrimaryRole(session.user));
  const [rows, setRows] = useState<Array<{ id: string; storeName: string; state: string; exception_code: string | null; needsApproval?: boolean }>>([]);
  function load() {
    void listInHouseQueue(token).then((result) => {
      setRows(result.tasks.filter((task) => task.state.includes('exception')) as typeof rows);
    }).catch((error: Error) => toast.error(error.message));
  }
  useEffect(() => { load(); }, [token]);
  return (
    <div className="space-y-3 p-4 text-slate-100">
      <h1 className="text-xl font-semibold">Exceptions</h1>
      {rows.map((row) => {
        const after = row.state === 'exception_after_purchase';
        return (
          <article key={row.id} className="rounded border border-slate-800 p-3">
            <div>{row.storeName} · {row.exception_code || row.state}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {after ? (
                <>
                  <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'wait').then(load)}>Wait</button>
                  <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'redispatch').then(load)}>Send courier again</button>
                  <button type="button" className="rounded bg-red-900 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'abandon').then(load)}>Write off and refund</button>
                </>
              ) : (
                <>
                  <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'retry').then(load)}>Try again</button>
                  <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'substitute').then(load)}>Substitute</button>
                  <button type="button" className="rounded bg-red-900 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'abandon').then(load)}>Refund</button>
                </>
              )}
              {isOps && row.needsApproval ? (
                <button type="button" className="rounded bg-amber-700 px-3 py-1" onClick={() => void approveInHousePurchase(token, row.id).then(load)}>Approve purchase</button>
              ) : null}
            </div>
          </article>
        );
      })}
      {rows.length === 0 ? <p>No open exceptions.</p> : null}
    </div>
  );
}

export function InHouseStoresPage() {
  const token = useToken();
  const [stores, setStores] = useState<Array<Record<string, unknown>>>([]);
  const [enabled, setEnabled] = useState(false);
  const [markets, setMarkets] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({
    name: '', address: '', marketId: '', phone: '', lat: '', lng: '', logoUrl: '', coverImageUrl: '',
    orderUrl: '', orderPhone: '', orderChannel: 'web', cuisineType: '',
    offerStart: '11:00', offerEnd: '21:00', prep: '35', markup: '15',
    absorbPercent: '10', absorbDollars: '500', notes: '', live: false, tosReviewed: false,
  });
  function load() {
    void listInHouseStores(token).then((result) => { setStores(result.stores); setEnabled(Boolean(result.enabled)); }).catch((error: Error) => toast.error(error.message));
    void listInHouseMarkets(token).then((result) => setMarkets(result.markets)).catch(() => undefined);
  }
  useEffect(() => { load(); }, [token]);
  function minutes(value: string) {
    const [hours, mins] = value.split(':').map(Number);
    return (hours || 0) * 60 + (mins || 0);
  }
  return (
    <div className="space-y-4 p-4 text-slate-100">
      <h1 className="text-xl font-semibold">In-House stores</h1>
      <p className="text-sm text-slate-400">{enabled ? 'The public switch is on.' : 'The public switch is off. A store can be saved, but it cannot go live.'} Tax stays off until the accountant answers. If a brand objects, turn that store off the same day.</p>
      <form className="grid gap-2 md:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        void saveInHouseStore(token, {
          create: true,
          name: form.name,
          address: form.address,
          marketId: form.marketId,
          phone: form.phone,
          lat: form.lat ? Number(form.lat) : null,
          lng: form.lng ? Number(form.lng) : null,
          logoUrl: form.logoUrl,
          coverImageUrl: form.coverImageUrl,
          orderUrl: form.orderUrl,
          orderPhone: form.orderPhone,
          orderChannel: form.orderChannel,
          cuisineType: form.cuisineType,
          offerStartMinute: minutes(form.offerStart),
          offerEndMinute: minutes(form.offerEnd),
          avgPrepMinutes: Number(form.prep),
          defaultPrepMinutes: 25,
          markupBps: Math.round(Number(form.markup) * 100),
          priceToleranceBps: Math.round(Number(form.absorbPercent) * 100),
          absorbCapMinor: Math.round(Number(form.absorbDollars) * 100),
          notes: form.notes,
          tosReviewed: form.tosReviewed,
          live: false,
        }).then(() => { toast.success('Restaurant added'); load(); }).catch((error: Error) => toast.error(error.message));
      }}>
        <input className="rounded bg-slate-900 p-2" placeholder="Restaurant name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input className="rounded bg-slate-900 p-2" placeholder="Address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />
        <select className="rounded bg-slate-900 p-2" value={form.marketId} onChange={(event) => setForm({ ...form, marketId: event.target.value })} required>
          <option value="">Market</option>
          {markets.map((market) => <option key={market.id} value={market.id}>{market.name}</option>)}
        </select>
        <input className="rounded bg-slate-900 p-2" placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input className="rounded bg-slate-900 p-2" placeholder="Logo link" value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} />
        <input className="rounded bg-slate-900 p-2" placeholder="Cover photo link" value={form.coverImageUrl} onChange={(event) => setForm({ ...form, coverImageUrl: event.target.value })} />
        <input className="rounded bg-slate-900 p-2" placeholder="Latitude" value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })} />
        <input className="rounded bg-slate-900 p-2" placeholder="Longitude" value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })} />
        <input className="rounded bg-slate-900 p-2" placeholder="Ordering page link" value={form.orderUrl} onChange={(event) => setForm({ ...form, orderUrl: event.target.value })} />
        <input className="rounded bg-slate-900 p-2" placeholder="Order phone" value={form.orderPhone} onChange={(event) => setForm({ ...form, orderPhone: event.target.value })} />
        <select className="rounded bg-slate-900 p-2" value={form.orderChannel} onChange={(event) => setForm({ ...form, orderChannel: event.target.value })}>
          <option value="web">Website</option>
          <option value="phone">Phone</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <input className="rounded bg-slate-900 p-2" placeholder="Cuisine" value={form.cuisineType} onChange={(event) => setForm({ ...form, cuisineType: event.target.value })} />
        <label className="text-sm">Opens<input type="time" className="mt-1 w-full rounded bg-slate-900 p-2" value={form.offerStart} onChange={(event) => setForm({ ...form, offerStart: event.target.value })} /></label>
        <label className="text-sm">Closes<input type="time" className="mt-1 w-full rounded bg-slate-900 p-2" value={form.offerEnd} onChange={(event) => setForm({ ...form, offerEnd: event.target.value })} /></label>
        <label className="text-sm">Prep minutes shown to customers<input className="mt-1 w-full rounded bg-slate-900 p-2" value={form.prep} onChange={(event) => setForm({ ...form, prep: event.target.value })} /></label>
        <label className="text-sm">Markup %<input className="mt-1 w-full rounded bg-slate-900 p-2" value={form.markup} onChange={(event) => setForm({ ...form, markup: event.target.value })} /></label>
        <label className="text-sm">Roam absorbs up to %<input className="mt-1 w-full rounded bg-slate-900 p-2" value={form.absorbPercent} onChange={(event) => setForm({ ...form, absorbPercent: event.target.value })} /></label>
        <label className="text-sm">Roam absorbs up to J$<input className="mt-1 w-full rounded bg-slate-900 p-2" value={form.absorbDollars} onChange={(event) => setForm({ ...form, absorbDollars: event.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.tosReviewed} onChange={(event) => setForm({ ...form, tosReviewed: event.target.checked })} /> Website terms reviewed</label>
        <textarea className="rounded bg-slate-900 p-2 md:col-span-2" placeholder="Notes, including whether the counter accepts a name and order number" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        <button className="rounded bg-emerald-800 px-3 py-2 md:col-span-2" type="submit">Add restaurant</button>
      </form>
      {stores.map((store) => {
        const demand = store.demand30d as { orders?: number; cost?: number } | undefined;
        const merchant = store.merchant as { name?: string; in_house_live?: boolean } | null;
        const live = Boolean(merchant?.in_house_live);
        return (
          <article key={String(store.merchant_id)} className="rounded border border-slate-800 p-3">
            <div className="font-medium">{merchant?.name || String(store.source_brand || store.merchant_id || '')}</div>
            <div className="text-sm text-slate-400">{demand?.orders || 0} orders / 30 days · J${Math.round(Number(demand?.cost || 0) / 100)}</div>
            <div className="text-sm">Markup {Number(store.markup_bps || 0) / 100}% · {live ? 'Live' : 'Paused'}</div>
            <button type="button" className="mt-2 rounded bg-slate-800 px-3 py-1" onClick={() => void saveInHouseStore(token, {
              merchantId: store.merchant_id,
              live: !live,
              markupBps: store.markup_bps,
              priceToleranceBps: store.price_tolerance_bps,
              absorbCapMinor: store.absorb_cap_minor,
              orderUrl: store.order_url,
              orderPhone: store.order_phone,
              orderChannel: store.order_channel,
            }).then(() => { toast.success(live ? 'Store paused' : 'Store is live'); load(); }).catch((error: Error) => toast.error(error.message))}>
              {live ? 'Turn off' : 'Turn on'}
            </button>
          </article>
        );
      })}
    </div>
  );
}

export function InHouseMenuPage() {
  const token = useToken();
  const [stores, setStores] = useState<Array<Record<string, unknown>>>([]);
  const [merchantId, setMerchantId] = useState('');
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCategory, setItemCategory] = useState('Menu');
  useEffect(() => {
    void listInHouseStores(token).then((result) => setStores(result.stores)).catch(() => undefined);
  }, [token]);
  return (
    <div className="space-y-3 p-4 text-slate-100">
      <h1 className="text-xl font-semibold">Menu prices</h1>
      <form className="flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        void listInHouseMenu(token, merchantId).then((result) => setItems(result.items)).catch((error: Error) => toast.error(error.message));
      }}>
        <select className="rounded bg-slate-900 p-2" value={merchantId} onChange={(event) => setMerchantId(event.target.value)}>
          <option value="">Choose a restaurant</option>
          {stores.map((store) => {
            const merchant = store.merchant as { name?: string } | null;
            return <option key={String(store.merchant_id)} value={String(store.merchant_id)}>{merchant?.name || String(store.merchant_id)}</option>;
          })}
        </select>
        <button className="rounded bg-slate-800 px-3" type="submit">Load</button>
      </form>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (!merchantId) return;
        void saveInHouseMenu(token, merchantId, [], false, [{ name: itemName, inStorePrice: Number(itemPrice), category: itemCategory }])
          .then(() => listInHouseMenu(token, merchantId))
          .then((result) => { setItems(result.items); setItemName(''); setItemPrice(''); toast.success('Item added'); })
          .catch((error: Error) => toast.error(error.message));
      }}>
        <input className="rounded bg-slate-900 p-2" placeholder="Item name" value={itemName} onChange={(event) => setItemName(event.target.value)} />
        <input className="rounded bg-slate-900 p-2" placeholder="Restaurant price J$" value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} />
        <input className="rounded bg-slate-900 p-2" placeholder="Section" value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} />
        <button className="rounded bg-emerald-800 px-3" type="submit">Add item</button>
      </form>
      {items.map((item, index) => {
        const checked = item.source_price_checked_at ? new Date(String(item.source_price_checked_at)) : null;
        const stale = !checked || Date.now() - checked.getTime() > 14 * 24 * 60 * 60 * 1000;
        return (
          <label key={String(item.id)} className="grid grid-cols-4 gap-2 text-sm">
            <span>{String(item.name)}</span>
            <input className="rounded bg-slate-900 p-1" defaultValue={String(item.in_store_price ?? '')} onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, inStorePrice: Number(event.target.value), id: item.id };
              setItems(next);
            }} />
            <span>Customer J${String(item.marketplace_price ?? '')}</span>
            <span className={stale ? 'text-red-300' : 'text-emerald-300'}>{stale ? 'Stale' : 'Fresh'}</span>
          </label>
        );
      })}
      {items.length > 0 ? (
        <button type="button" className="rounded bg-emerald-800 px-3 py-2" onClick={() => void saveInHouseMenu(token, merchantId, items.map((item) => ({
          id: item.id,
          inStorePrice: item.inStorePrice ?? item.in_store_price,
          sourceSku: item.source_sku,
        })), true).then(() => toast.success('Prices confirmed')).catch((error: Error) => toast.error(error.message))}>
          Confirm prices
        </button>
      ) : null}
    </div>
  );
}

export function InHouseCardsPage() {
  const token = useToken();
  const [cards, setCards] = useState<Array<Record<string, unknown>>>([]);
  const [label, setLabel] = useState('');
  const [last4, setLast4] = useState('');
  const [limit, setLimit] = useState('5000000');
  const [statement, setStatement] = useState('');
  useEffect(() => {
    void listInHouseCards(token).then((result) => setCards(result.cards)).catch((error: Error) => toast.error(error.message));
  }, [token]);
  return (
    <div className="space-y-4 p-4 text-slate-100">
      <h1 className="text-xl font-semibold">Cards and spend</h1>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        void createInHouseCard(token, { label, last4, dailyLimitMinor: Number(limit) }).then(() => listInHouseCards(token)).then((result) => setCards(result.cards)).catch((error: Error) => toast.error(error.message));
      }}>
        <input className="rounded bg-slate-900 p-2" placeholder="Label" value={label} onChange={(event) => setLabel(event.target.value)} />
        <input className="rounded bg-slate-900 p-2" placeholder="Last 4" value={last4} onChange={(event) => setLast4(event.target.value)} maxLength={4} />
        <input className="rounded bg-slate-900 p-2" placeholder="Daily limit cents" value={limit} onChange={(event) => setLimit(event.target.value)} />
        <button className="rounded bg-emerald-800 px-3" type="submit">Add card</button>
      </form>
      {cards.map((card) => (
        <article key={String(card.id)} className="rounded border border-slate-800 p-3">
          {String(card.label)} ·· {String(card.last4)} · today J${Math.round(Number(card.spentTodayMinor || 0) / 100)} / J${Math.round(Number(card.daily_limit_minor || 0) / 100)}
        </article>
      ))}
      <textarea className="h-32 w-full rounded bg-slate-900 p-2" placeholder="cardId,YYYY-MM-DD,amountMinor,merchant text" value={statement} onChange={(event) => setStatement(event.target.value)} />
      <button type="button" className="rounded bg-slate-800 px-3 py-2" onClick={() => {
        const lines = statement.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
          const [cardId, postedOn, amountMinor, merchantText] = line.split(',');
          return { cardId, postedOn, amountMinor: Number(amountMinor), merchantText };
        });
        void importInHouseStatement(token, lines).then((result) => toast.success(`${result.matched} matched`)).catch((error: Error) => toast.error(error.message));
      }}>Import statement</button>
    </div>
  );
}

export function InHouseReportsPage() {
  const token = useToken();
  const [report, setReport] = useState<Record<string, number> | null>(null);
  const [recon, setRecon] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    void getInHouseReports(token).then(setReport).catch((error: Error) => toast.error(error.message));
    void getInHouseRecon(token).then((result) => setRecon(result.counts)).catch(() => undefined);
  }, [token]);
  return (
    <div className="space-y-3 p-4 text-slate-100">
      <h1 className="text-xl font-semibold">In-House reports</h1>
      {report ? (
        <ul className="space-y-1 text-sm">
          <li>Orders, 30 days: {report.orders}</li>
          <li>Exception rate: {Math.round(Number(report.exceptionRate || 0) * 100)}%</li>
          <li>Median claim to placed: {Number(report.medianClaimToPlacedMinutes || 0).toFixed(1)} min</li>
          <li>Price gap: J${Math.round(Number(report.varianceMinor || 0) / 100)}</li>
        </ul>
      ) : null}
      {recon ? <pre className="text-xs text-slate-400">{JSON.stringify(recon, null, 2)}</pre> : null}
    </div>
  );
}
