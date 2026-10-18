import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import { inHouseHeartbeat, listInHouseQueue } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { InHouseCardsPage, InHouseReportsPage } from './InHouseDeskPages';
import { InHouseDeskSettingsPage, InHouseFirstRunCard } from './InHouseDeskSettingsPage';
import { InHouseOrdersPage } from './InHouseOrdersPage';
import { MenuLibraryPage } from './MenuLibraryPage';
import { InHouseRestaurantsPage } from './restaurants/InHouseRestaurantsPage';
import { DESK_ADMIN, DESK_OPS } from './inHouseUi';

const DESK_TABS = ['orders', 'restaurants', 'library', 'cards', 'reports', 'settings'] as const;
type DeskTab = typeof DESK_TABS[number];

function normalizeTab(raw: string | null, isOps: boolean, isAdmin: boolean): DeskTab {
  if (!isOps) return 'orders';
  if (raw === 'queue' || raw === 'ops' || raw === 'buyer') return 'orders';
  if (raw === 'stores' || raw === 'menu') return 'restaurants';
  if (raw === 'cards' && isAdmin) return 'cards';
  if (raw === 'reports' && isAdmin) return 'reports';
  if (raw === 'settings' && isAdmin) return 'settings';
  if (raw === 'restaurants') return 'restaurants';
  if (raw === 'library' || raw === 'cuisines') return 'library';
  if (raw === 'orders') return 'orders';
  return 'orders';
}

/** Shell matches Stitch “Buyer Cash-Desk” sticky header + underline tabs. */
export function InHouseTeamPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [params, setParams] = useSearchParams();
  const roles = getJwtRoles(session.user);
  const primary = jwtPrimaryRole(session.user);
  const isOps = roles.some((role) => DESK_OPS.has(role)) || DESK_OPS.has(primary);
  const isAdmin = roles.some((role) => DESK_ADMIN.has(role)) || DESK_ADMIN.has(primary);
  const tab = normalizeTab(params.get('tab'), isOps, isAdmin);
  const [staffed, setStaffed] = useState(true);
  const [people, setPeople] = useState(0);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('roam.inhouse.sound') !== 'off');
  const [waitingCount, setWaitingCount] = useState(0);

  useEffect(() => {
    const beat = () => void inHouseHeartbeat(session.access_token).catch(() => undefined);
    beat();
    const timer = window.setInterval(beat, 30000);
    return () => window.clearInterval(timer);
  }, [session.access_token]);

  useEffect(() => {
    const refreshDesk = () => {
      void listInHouseQueue(session.access_token)
        .then((result) => {
          setStaffed(result.desk?.staffed !== false);
          setPeople(result.desk?.people ?? 0);
          setWaitingCount((result.tasks || []).filter((task) => task.state === 'queued').length);
        })
        .catch(() => undefined);
    };
    refreshDesk();
    const poll = window.setInterval(refreshDesk, 15000);
    return () => window.clearInterval(poll);
  }, [session.access_token]);

  useEffect(() => {
    localStorage.setItem('roam.inhouse.sound', soundOn ? 'on' : 'off');
  }, [soundOn]);

  function openTab(next: DeskTab) {
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    setParams(updated, { replace: false });
  }

  const tabs = isOps
    ? [
        { id: 'orders' as const, label: 'Orders', count: waitingCount || undefined },
        { id: 'restaurants' as const, label: 'Restaurants' },
        { id: 'library' as const, label: 'Menu library' },
        ...(isAdmin ? [
          { id: 'cards' as const, label: 'Cards' },
          { id: 'reports' as const, label: 'Reports' },
          { id: 'settings' as const, label: 'Settings' },
        ] : []),
      ]
    : [{ id: 'orders' as const, label: 'Orders', count: waitingCount || undefined }];

  return (
    <div className="-mx-4 -mt-4 min-h-full bg-[#0f172a] text-slate-200 sm:-mx-6">
      {/* Stitch sticky top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0f172a]/95 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-semibold tracking-tight text-white md:text-lg">In-House desk</h1>
            <span className="hidden h-4 w-px bg-slate-700 sm:block" />
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${
                staffed
                  ? 'border-emerald-500/30 bg-emerald-950/60 text-emerald-400'
                  : 'border-red-500/30 bg-red-950/60 text-red-300'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {staffed ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /> : null}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${staffed ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </span>
              <span>
                {staffed
                  ? `Desk open · Customers can order${people > 0 ? ` · ${people} here` : ''}`
                  : 'Desk closed · Customers see you as closed'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              onClick={() => setSoundOn((on) => !on)}
            >
              <span className="text-amber-400">{soundOn ? '🔔' : '🔕'}</span>
              <span className="hidden sm:inline">{soundOn ? 'Sound on' : 'Sound off'}</span>
            </button>
            <div className="hidden items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-950/40 px-2 py-1 text-xs text-blue-300 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Operator active
            </div>
          </div>
        </div>
        {/* Stitch underline tabs */}
        <div className="border-b border-slate-800 bg-[#0a1b28]/80 px-4 sm:px-6">
          <nav className="flex space-x-1 overflow-x-auto text-sm font-medium sm:space-x-3">
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openTab(item.id)}
                  className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 transition-colors ${
                    active
                      ? 'border-blue-400 font-semibold text-blue-400'
                      : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.count != null ? (
                    <span className="inline-flex items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                      {item.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-5 sm:px-6">
        {isAdmin && tab === 'orders' ? <InHouseFirstRunCard variant="banner" /> : null}
        {tab === 'orders' ? <InHouseOrdersPage embedded soundOn={soundOn} hideDeskChrome /> : null}
        {tab === 'restaurants' ? <InHouseRestaurantsPage embedded /> : null}
        {tab === 'library' ? <MenuLibraryPage /> : null}
        {tab === 'cards' && isAdmin ? <InHouseCardsPage embedded /> : null}
        {tab === 'reports' && isAdmin ? <InHouseReportsPage embedded /> : null}
        {tab === 'settings' && isAdmin ? <InHouseDeskSettingsPage embedded /> : null}
      </main>
    </div>
  );
}

export { TeamLogins } from './InHouseTeamLogins';
