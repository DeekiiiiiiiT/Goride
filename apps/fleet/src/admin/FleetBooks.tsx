import { useState } from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import type { BusinessType } from '@roam/types';
import {
  BusinessTypeCustomers,
  CustomerLedgerView,
  DatabaseManagement,
  LedgerColumnSettings,
  PlatformSessionProvider,
} from '@roam/platform-ops-ui';

type CustomerNav = {
  id: string;
  name: string;
  email: string;
  businessType: BusinessType;
};

/** Customer trip, fuel, and toll books. Dominion no longer owns this screen. */
export function FleetBooks({ token }: { token: string }) {
  const [page, setPage] = useState('db-management');
  const [history, setHistory] = useState<string[]>([]);
  const [customer, setCustomer] = useState<CustomerNav | null>(null);

  const open = (next: string, data?: { customer?: CustomerNav }) => {
    setHistory((prev) => [...prev, page]);
    if (data?.customer) setCustomer(data.customer);
    setPage(next);
  };

  const back = () => {
    const prev = history[history.length - 1];
    if (!prev) {
      setPage('db-management');
      return;
    }
    setHistory((rows) => rows.slice(0, -1));
    setPage(prev);
  };

  const customersUrl = `${API_ENDPOINTS.admin}/fleet-admin/customers`;

  return (
    <PlatformSessionProvider accessToken={token}>
      <div className="rounded-xl bg-white p-4 text-slate-900">
        {page === 'db-management' && <DatabaseManagement onNavigate={open} customersUrl={customersUrl} />}
        {page === 'db-settings' && <LedgerColumnSettings onBack={back} />}
        {page.startsWith('db-biz-') && (
          <BusinessTypeCustomers
            businessType={page.replace('db-biz-', '') as BusinessType}
            onNavigate={open}
            onBack={back}
            customersUrl={customersUrl}
          />
        )}
        {page.startsWith('db-customer-') && (
          <CustomerLedgerView
            customerId={page.replace('db-customer-', '')}
            customerData={customer ?? undefined}
            onBack={back}
          />
        )}
      </div>
    </PlatformSessionProvider>
  );
}
