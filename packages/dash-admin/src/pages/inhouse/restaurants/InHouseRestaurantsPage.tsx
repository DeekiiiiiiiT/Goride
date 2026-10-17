import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import { listInHouseStores, saveInHouseStore } from '@roam/dash-admin-client';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatMoney } from '../../../components/ui/format';
import type { AdminOutletContext } from '../../../DashAdminPortal';
import { DESK_ADMIN, restaurantStatus } from '../inHouseUi';

type StoreRow = Record<string, unknown> & {
  merchant_id?: string;
  merchant?: { name?: string; in_house_live?: boolean } | null;
  audience?: string;
  setup_status?: string;
  goLiveBlockers?: string[];
  dishCount?: number;
  staleDishCount?: number;
  duplicateNameCount?: number;
  demand30d?: { orders?: number; cost?: number };
  paused_at?: string | null;
};

type Filter = 'all' | 'setting_up' | 'ready' | 'live' | 'paused';

function nextAction(store: StoreRow): { label: string; to: string } {
  const status = restaurantStatus(store);
  const id = String(store.merchant_id);
  if (status === 'Setting up') {
    if (!store.dishCount) return { label: 'Add menu', to: `/in-house/restaurants/${id}?step=menu` };
    return { label: 'Continue setup', to: `/in-house/restaurants/${id}` };
  }
  if (status === 'Ready to go live') return { label: 'Go live', to: `/in-house/restaurants/${id}?step=go-live` };
  if ((store.staleDishCount || 0) > 0) return { label: 'Confirm prices', to: `/in-house/restaurants/${id}/menu` };
  return { label: 'Open', to: `/in-house/restaurants/${id}` };
}

export function InHouseRestaurantsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const isAdmin = getJwtRoles(session.user).some((role) => DESK_ADMIN.has(role)) || DESK_ADMIN.has(jwtPrimaryRole(session.user));
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [deskBlockers, setDeskBlockers] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  function load() {
    setLoading(true);
    return listInHouseStores(session.access_token)
      .then((result) => {
        setStores(result.stores as StoreRow[]);
        setEnabled(Boolean(result.enabled));
        const fromApi = Array.isArray(result.deskGoLiveBlockers) ? result.deskGoLiveBlockers.map(String) : [];
        // Fallback when an older delivery build omits deskGoLiveBlockers.
        setDeskBlockers(fromApi.length ? fromApi : [
          ...(result.hasCard === false ? ['No company card can pay for this yet'] : []),
          ...(!result.enabled ? ['The In-House switch is off'] : []),
        ]);
        setLoadError('');
      })
      .catch((error: Error) => {
        setLoadError(error.message);
        setStores([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { void load(); }, [session.access_token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores.filter((store) => {
      const name = String(store.merchant?.name || '').toLowerCase();
      if (q && !name.includes(q)) return false;
      const status = restaurantStatus(store);
      if (filter === 'setting_up') return status === 'Setting up';
      if (filter === 'ready') return status === 'Ready to go live';
      if (filter === 'live') return status.startsWith('Live');
      if (filter === 'paused') return status === 'Paused';
      return true;
    });
  }, [stores, search, filter]);

  const counts = {
    all: stores.length,
    setting_up: stores.filter((store) => restaurantStatus(store) === 'Setting up').length,
    ready: stores.filter((store) => restaurantStatus(store) === 'Ready to go live').length,
    live: stores.filter((store) => restaurantStatus(store).startsWith('Live')).length,
    paused: stores.filter((store) => restaurantStatus(store) === 'Paused').length,
  };

  async function createRestaurant() {
    const name = newName.trim();
    if (!name) {
      toast.error('Add a restaurant name');
      return;
    }
    setCreating(true);
    try {
      const result = await saveInHouseStore(session.access_token, { create: true, name, setupStatus: 'draft' });
      toast.success('Restaurant created');
      navigate(`/in-house/restaurants/${result.merchantId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create';
      toast.error(message);
      const match = message.match(/already exists/i);
      if (match) {
        // conflict payload may include merchantId in some clients; reload and hint
        void load();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!embedded ? <h1 className="text-xl font-semibold">Restaurants</h1> : null}
          <p className="text-sm text-slate-400">
            {enabled ? 'The public In-House switch is on.' : 'The public In-House switch is off.'} Each restaurant has one home page with a setup checklist.
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded bg-slate-900 px-3 py-2 text-sm"
              placeholder="e.g. Domino's Half Way Tree"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button type="button" disabled={creating} className="rounded-lg bg-amber-500 px-3 py-2 text-slate-950 disabled:opacity-40" onClick={() => void createRestaurant()}>
              {creating ? 'Creating…' : '+ Add restaurant'}
            </button>
          </div>
        ) : null}
      </div>

      {deskBlockers.length > 0 ? (
        <div className="rounded border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
          <p className="font-medium">Before any restaurant can go live</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {deskBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : null}

      {loadError ? <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-100">{loadError}</p> : null}

      <div className="flex flex-wrap gap-2">
        <input className="rounded bg-slate-900 px-3 py-1 text-sm" placeholder="Search…" value={search} onChange={(event) => setSearch(event.target.value)} />
        {([
          ['all', `All ${counts.all}`],
          ['setting_up', `Setting up ${counts.setting_up}`],
          ['ready', `Ready to go live ${counts.ready}`],
          ['live', `Live ${counts.live}`],
          ['paused', `Paused ${counts.paused}`],
        ] as Array<[Filter, string]>).map(([id, label]) => (
          <button key={id} type="button" className={`rounded-lg px-3 py-1 text-sm ${filter === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800'}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {loading && !stores.length ? <p className="text-sm text-slate-400">Loading restaurants…</p> : null}
      {!loading && !loadError && filtered.length === 0 ? <p className="text-sm text-slate-400">No restaurants in this filter.</p> : null}

      <div className="space-y-2">
        {filtered.map((store) => {
          const status = restaurantStatus(store);
          const action = nextAction(store);
          const demand = store.demand30d;
          const id = String(store.merchant_id);
          // Live/ready rows use Open — keep Edit menu one click away (same as Add menu for drafts).
          const showEditMenu =
            (store.dishCount || 0) > 0 &&
            action.label !== 'Add menu' &&
            action.label !== 'Confirm prices';
          return (
            <article key={id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 p-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{store.merchant?.name || id}</span>
                  <StatusBadge value={status} />
                  {(store.duplicateNameCount || 0) > 1 ? (
                    <span className="rounded bg-amber-950 px-2 py-0.5 text-xs text-amber-100">Possible duplicate ({store.duplicateNameCount} with this name)</span>
                  ) : null}
                </div>
                <div className="text-sm text-slate-400">
                  {store.dishCount || 0} dishes
                  {(store.staleDishCount || 0) > 0 ? ` · ${store.staleDishCount} prices out of date` : ''}
                  {demand ? ` · ${demand.orders || 0} orders/30d` : ''}
                  {demand?.cost != null && isAdmin ? ` · ${formatMoney(Number(demand.cost || 0) / 100)}` : ''}
                </div>
                {Array.isArray(store.goLiveBlockers) && store.goLiveBlockers[0] && status === 'Setting up' ? (
                  <div className="text-sm text-slate-500">{store.goLiveBlockers[0]}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {showEditMenu ? (
                  <Link to={`/in-house/restaurants/${id}/menu`} className="rounded bg-slate-800 px-3 py-1 text-sm">
                    Edit menu
                  </Link>
                ) : null}
                <Link to={action.to} className="rounded bg-slate-800 px-3 py-1 text-sm">{action.label}</Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
