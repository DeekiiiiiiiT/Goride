import { useOutletContext } from 'react-router-dom';
import { getJwtRoles } from '@roam/auth-client';
import { useUrlTab } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { canOpenCapabilityForRoles } from '../../config/dashAdminCapabilities';
import { RemittanceDeskPage } from '../remittance/RemittanceDeskPage';
import { FinancePage } from '../finance/FinancePage';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function CourierCashPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const finance = canOpenCapabilityForRoles(getJwtRoles(session.user), 'finance');
  const tabs = [
    { id: 'reports', label: 'Reports' },
    { id: 'balances', label: 'Balances' },
    ...(finance ? [{ id: 'appeals', label: 'Appeals' }] : []),
  ];
  const [tab, setTab] = useUrlTab(tabs[0].id, tabs.map((item) => item.id));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Courier cash"
        description="Cash a courier says they have handed in, their balance, and deduction appeals."
        tabs={tabs}
        activeTab={tab}
        onTab={setTab}
      />
      {tab === 'appeals' ? <FinancePage appealsOnly /> : (
        <RemittanceDeskPage embedded section={tab === 'balances' ? 'balances' : 'reports'} />
      )}
    </div>
  );
}
