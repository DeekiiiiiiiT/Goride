import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import { listInHouseStores, saveInHouseStore } from '@roam/dash-admin-client';
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
    if (!store.dishCount) return { label: 'Continue setup', to: `/in-house/restaurants/${id}?step=menu` };
    return { label: 'Continue setup', to: `/in-house/restaurants/${id}` };
  }
  if (status === 'Ready to go live') return { label: 'Go live', to: `/in-house/restaurants/${id}?step=go-live` };
  if ((store.staleDishCount || 0) > 0) return { label: 'Confirm prices', to: `/in-house/restaurants/${id}/menu` };
  if (status === 'Paused') return { label: 'Resume', to: `/in-house/restaurants/${id}` };
  if (status.startsWith('Live')) return { label: 'Open menu', to: `/in-house/restaurants/${id}/menu` };
  return { label: 'Open', to: `/in-house/restaurants/${id}` };
}

function statusChip(status: string) {
  if (status === 'Setting up') return 'border-blue-500/40 bg-blue-950/70 text-blue-300';
  if (status === 'Ready to go live') return 'border-amber-500/40 bg-amber-950/50 text-amber-300';
  if (status.startsWith('Live')) return 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300';
  if (status === 'Paused') return 'border-amber-500/40 bg-amber-950/50 text-amber-300';
  return 'border-slate-600 bg-slate-800 text-slate-300';
}

/** Stitch “In-House Restaurants Directory” card grid + filters. */
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
      const id = String(store.merchant_id || '');
      if (q && !name.includes(q) && !id.includes(q)) return false;
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
      toast.error(error instanceof Error ? error.message : 'Could not create');
      void load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 pb-2 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            {!embedded ? <h1 className="text-2xl font-bold tracking-tight text-white">In-House Restaurants</h1> : <h2 className="text-2xl font-bold tracking-tight text-white">In-House Restaurants</h2>}
            <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
              {stores.length} registered
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {enabled ? 'Manage onboardings, availability, and menus.' : 'Public switch is off — finish desk setup before going live.'}
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
              placeholder="Restaurant name…"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button
              type="button"
              disabled={creating}
              className="ih-btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-950 shadow-md disabled:opacity-40"
              onClick={() => void createRestaurant()}
            >
              + Onboard Restaurant
            </button>
          </div>
        ) : null}
      </section>

      {deskBlockers.length > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          <p className="font-medium">Before any restaurant can go live</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {deskBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : null}

      {loadError ? <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-100">{loadError}</p> : null}

      <section className="flex flex-col items-stretch justify-between gap-3 rounded-lg border border-slate-700/60 bg-slate-800/80 p-3 shadow-sm md:flex-row md:items-center">
        <div className="relative min-w-[280px] flex-1">
          <input
            className="w-full rounded-lg border border-slate-700/50 bg-slate-900 py-2 pl-3 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            placeholder="Search by restaurant name, ID, or cuisine..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto" role="tablist">
          {([
            ['all', `All (${counts.all})`, null],
            ['setting_up', `Setting up (${counts.setting_up})`, 'bg-blue-400'],
            ['ready', `Ready to go live (${counts.ready})`, 'bg-amber-400'],
            ['live', `Live (${counts.live})`, 'bg-emerald-400'],
            ['paused', `Paused (${counts.paused})`, 'bg-amber-400'],
          ] as Array<[Filter, string, string | null]>).map(([id, label, dot]) => (
            <button
              key={id}
              type="button"
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === id
                  ? 'border border-amber-500/40 bg-slate-900 text-amber-400 shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              onClick={() => setFilter(id)}
            >
              {dot ? <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /> : null}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {loading && !stores.length ? <p className="text-sm text-slate-400">Loading restaurants…</p> : null}
      {!loading && !loadError && filtered.length === 0 ? <p className="text-sm text-slate-400">No restaurants in this filter.</p> : null}

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((store) => {
          const status = restaurantStatus(store);
          const action = nextAction(store);
          const demand = store.demand30d;
          const id = String(store.merchant_id);
          const name = store.merchant?.name || id;
          const initials = name.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'RR';
          const blockers = Array.isArray(store.goLiveBlockers) ? store.goLiveBlockers : [];
          const doneSteps = status === 'Setting up' ? Math.max(0, 7 - blockers.length) : status === 'Ready to go live' || status.startsWith('Live') ? 7 : 0;
          const progress = Math.round((doneSteps / 7) * 100);
          return (
            <article key={id} className="group flex flex-col justify-between overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800 shadow-sm transition-all hover:border-blue-500/40 hover:shadow-md">
              <div className="p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-600 bg-slate-900 text-lg font-bold text-blue-400">
                      {initials}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-base font-semibold text-slate-100 group-hover:text-blue-300">{name}</h3>
                        <span className="font-mono text-xs text-slate-500">#{id.slice(0, 6)}</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {store.dishCount || 0} dishes
                        {(store.staleDishCount || 0) > 0 ? ` · ${store.staleDishCount} prices stale` : ''}
                      </span>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusChip(status)}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {status === 'Setting up' ? `Setting up ${doneSteps}/7` : status}
                  </span>
                </div>

                {status === 'Setting up' ? (
                  <div className="mt-4 border-t border-slate-800/80 pt-3">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-400">Onboarding Checklist</span>
                      <span className="font-mono font-semibold text-blue-400">{doneSteps}/7 tasks complete</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400" style={{ width: `${progress}%` }} />
                    </div>
                    {blockers[0] ? (
                      <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
                        <span className="text-amber-400">⏳</span>
                        <span>{blockers[0]}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {status === 'Ready to go live' ? (
                  <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-200">
                    All verification checks passed (7 of 7 complete).
                  </div>
                ) : null}

                {status === 'Paused' ? (
                  <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-100">
                    Restaurant is paused — customers cannot order until you resume.
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-3 text-xs">
                  <div className="rounded border border-slate-700/40 bg-slate-900/60 p-2">
                    <span className="block text-[10px] text-slate-500">Orders / 30d</span>
                    <span className="font-semibold text-slate-200">{demand?.orders ?? 0}</span>
                  </div>
                  <div className="rounded border border-slate-700/40 bg-slate-900/60 p-2">
                    <span className="block text-[10px] text-slate-500">{isAdmin && demand?.cost != null ? 'Spend / 30d' : 'Audience'}</span>
                    <span className="font-semibold text-slate-200">
                      {isAdmin && demand?.cost != null ? formatMoney(Number(demand.cost || 0) / 100) : String(store.audience || 'beta')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/50 p-4">
                <Link to={`/in-house/restaurants/${id}`} className="text-xs text-slate-400 hover:text-slate-200">Open home</Link>
                <Link
                  to={action.to}
                  className="ih-btn-primary flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-semibold text-slate-950 shadow-sm transition-all active:scale-95"
                >
                  {action.label} →
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
