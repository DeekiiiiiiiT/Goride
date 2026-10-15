import { useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import { inHouseHeartbeat } from '@roam/dash-admin-client';
import { PageHeader } from '../../components/ui/PageHeader';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { InHouseCardsPage, InHouseReportsPage } from './InHouseDeskPages';
import { InHouseDeskSettingsPage, InHouseFirstRunCard } from './InHouseDeskSettingsPage';
import { InHouseOrdersPage } from './InHouseOrdersPage';
import { InHouseRestaurantsPage } from './restaurants/InHouseRestaurantsPage';
import { DESK_ADMIN, DESK_OPS } from './inHouseUi';

const DESK_TABS = ['orders', 'restaurants', 'cards', 'reports', 'settings'] as const;
type DeskTab = typeof DESK_TABS[number];

function normalizeTab(raw: string | null, isOps: boolean, isAdmin: boolean): DeskTab {
  if (!isOps) return 'orders';
  if (raw === 'queue' || raw === 'ops' || raw === 'buyer') return 'orders';
  if (raw === 'stores' || raw === 'menu') return 'restaurants';
  if (raw === 'cards' && isAdmin) return 'cards';
  if (raw === 'reports' && isAdmin) return 'reports';
  if (raw === 'settings' && isAdmin) return 'settings';
  if (raw === 'restaurants') return 'restaurants';
  if (raw === 'orders') return 'orders';
  return 'orders';
}

export function InHouseTeamPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [params, setParams] = useSearchParams();
  const roles = getJwtRoles(session.user);
  const primary = jwtPrimaryRole(session.user);
  const isOps = roles.some((role) => DESK_OPS.has(role)) || DESK_OPS.has(primary);
  const isAdmin = roles.some((role) => DESK_ADMIN.has(role)) || DESK_ADMIN.has(primary);
  const tab = normalizeTab(params.get('tab'), isOps, isAdmin);

  useEffect(() => {
    const beat = () => void inHouseHeartbeat(session.access_token).catch(() => undefined);
    beat();
    const timer = window.setInterval(beat, 30000);
    return () => window.clearInterval(timer);
  }, [session.access_token]);

  function openTab(next: DeskTab) {
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    setParams(updated, { replace: false });
  }

  const tabs = isOps
    ? [
        { id: 'orders', label: 'Orders' },
        { id: 'restaurants', label: 'Restaurants' },
        ...(isAdmin ? [
          { id: 'cards', label: 'Cards & spend' },
          { id: 'reports', label: 'Reports' },
          { id: 'settings', label: 'Desk settings' },
        ] : []),
      ]
    : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="In-House desk"
        description="Buy food for live orders, and set up restaurants."
        tabs={tabs}
        activeTab={tab}
        onTab={(id) => openTab(id as DeskTab)}
      />
      {isAdmin ? <InHouseFirstRunCard /> : null}
      {tab === 'orders' ? <InHouseOrdersPage embedded /> : null}
      {tab === 'restaurants' ? <InHouseRestaurantsPage embedded /> : null}
      {tab === 'cards' && isAdmin ? <InHouseCardsPage embedded /> : null}
      {tab === 'reports' && isAdmin ? <InHouseReportsPage embedded /> : null}
      {tab === 'settings' && isAdmin ? <InHouseDeskSettingsPage embedded /> : null}
    </div>
  );
}

export { TeamLogins } from './InHouseTeamLogins';
