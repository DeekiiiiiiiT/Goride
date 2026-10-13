import { useOutletContext } from 'react-router-dom';
import { getJwtRoles } from '@roam/auth-client';
import { useUrlTab } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { DashTeamPage } from '../users/DashTeamPage';
import { MerchantStaffDirectoryPage } from '../users/MerchantStaffDirectoryPage';
import { IdentityDirectoryPage } from '../users/IdentityDirectoryPage';
import { TeamLogins } from '../inhouse/InHouseTeamPage';
import { CAPABILITY_LABELS, CAPABILITY_MATRIX, CAPABILITY_ROLE_ORDER, type DashCapability } from '../../config/dashAdminCapabilities';
import { isCourierOnlyRole } from '../../utils/isCourierOnlyRole';
import type { AdminOutletContext } from '../../DashAdminPortal';

const TABS = ['operators', 'in-house', 'merchant-staff', 'all-users', 'roles'] as const;

export function TeamAccessPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const roles = getJwtRoles(session.user).filter((role) => role !== 'authenticated');
  const courierOnly = roles.length > 0 && roles.every((role) => isCourierOnlyRole(role));
  const tabs = courierOnly
    ? [{ id: 'operators', label: 'Operators' }, { id: 'roles', label: 'Roles' }]
    : [
        { id: 'operators', label: 'Operators' },
        { id: 'in-house', label: 'In-House' },
        { id: 'merchant-staff', label: 'Merchant staff' },
        { id: 'all-users', label: 'All users' },
        { id: 'roles', label: 'Roles' },
      ];
  const allowed = tabs.map((tab) => tab.id) as Array<typeof TABS[number]>;
  const [tab, setTab] = useUrlTab(allowed[0], allowed);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Team and access"
        description="Who can sign in, and what each role is allowed to open."
        tabs={tabs}
        activeTab={tab}
        onTab={(id) => setTab(id as typeof TABS[number])}
      />
      {tab === 'operators' ? <DashTeamPage courierOnly={courierOnly} embedded /> : null}
      {tab === 'in-house' ? (
        <div className="space-y-4">
          <TeamLogins job="buyer" />
          <TeamLogins job="ops" />
        </div>
      ) : null}
      {tab === 'merchant-staff' ? <MerchantStaffDirectoryPage embedded /> : null}
      {tab === 'all-users' ? <IdentityDirectoryPage embedded /> : null}
      {tab === 'roles' ? <RoleMatrix /> : null}
    </div>
  );
}

function RoleMatrix() {
  const caps = Object.keys(CAPABILITY_LABELS) as DashCapability[];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="text-xs min-w-[720px] w-full">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left">Page</th>
            {CAPABILITY_ROLE_ORDER.map((role) => <th key={role} className="px-2 py-2 text-left">{role.replace(/_/g, ' ')}</th>)}
          </tr>
        </thead>
        <tbody>
          {caps.map((cap) => (
            <tr key={cap} className="border-t border-slate-800">
              <td className="px-3 py-2 text-slate-200">{CAPABILITY_LABELS[cap]}</td>
              {CAPABILITY_ROLE_ORDER.map((role) => (
                <td key={role} className="px-2 py-2 text-slate-400">{CAPABILITY_MATRIX[role][cap] === 'none' ? '—' : CAPABILITY_MATRIX[role][cap]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
