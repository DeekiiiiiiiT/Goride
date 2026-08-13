import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { CustomerAccounts, TeamMembers } from '@roam/admin-core';
import { ProductLineSettingsPage } from '@roam/admin-core/settings';
import { API_ENDPOINTS } from '@roam/api-client';
import { useAdminAuth } from '@/app/auth/AdminAuthProvider';
import { EnterpriseAdminLogin } from '@/app/admin/EnterpriseAdminLogin';
import { IntakeBuildingsPage } from '@/app/admin/IntakeBuildingsPage';
import { IntakeClaimQueuePage } from '@/app/admin/IntakeClaimQueuePage';
import { AdminConnectionsPage } from '@/app/admin/AdminConnectionsPage';
import { AdminExternalOrgsPage } from '@/app/admin/AdminExternalOrgsPage';
import { AdminStorageBillingPage } from '@/app/admin/AdminStorageBillingPage';

type PrimaryTab = 'team' | 'courier' | 'freight_forwarder' | 'platform';
type CourierPage = 'customers' | 'features';
type FfPage =
  | 'customers'
  | 'buildings'
  | 'claims'
  | 'connections'
  | 'external'
  | 'billing'
  | 'features';

const PRIMARY: { id: PrimaryTab; label: string }[] = [
  { id: 'courier', label: 'Courier' },
  { id: 'freight_forwarder', label: 'Freight Forwarder' },
  { id: 'team', label: 'Team Members' },
  { id: 'platform', label: 'Platform' },
];

const COURIER_PAGES: { id: CourierPage; label: string }[] = [
  { id: 'customers', label: 'Customers' },
  { id: 'features', label: 'Features' },
];

const FF_PAGES: { id: FfPage; label: string }[] = [
  { id: 'customers', label: 'Customers' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'claims', label: 'Join requests' },
  { id: 'connections', label: 'Connections' },
  { id: 'external', label: 'Off-platform' },
  { id: 'billing', label: 'Storage billing' },
  { id: 'features', label: 'Features' },
];

function tabClass(active: boolean) {
  return active
    ? 'rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800'
    : 'rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100';
}

export function EnterpriseAdminPage() {
  const { session, user, role, loading, signOut } = useAdminAuth();
  const [primary, setPrimary] = useState<PrimaryTab>('courier');
  const [courierPage, setCourierPage] = useState<CourierPage>('customers');
  const [ffPage, setFfPage] = useState<FfPage>('customers');
  const [pendingClaims, setPendingClaims] = useState(0);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    void fetch(`${API_ENDPOINTS.admin}/enterprise-admin/intake-claims?status=pending`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        const n = Array.isArray(json.requests) ? json.requests.length : 0;
        setPendingClaims(n);
      })
      .catch(() => undefined);
  }, [session?.access_token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!session?.access_token) {
    return <EnterpriseAdminLogin />;
  }

  const accessToken = session.access_token;
  const settingsBase = {
    segment: 'enterprise' as const,
    apiBaseUrl: API_ENDPOINTS.admin,
    accessToken,
    userEmail: user?.email,
    userRole: role ?? undefined,
    platformLabel: 'Roam Enterprise',
  };
  const customersBase = {
    productLine: 'enterprise' as const,
    apiBaseUrl: API_ENDPOINTS.admin,
    accessToken,
    callerRole: role,
    apiNamespace: '/enterprise-admin' as const,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">
              Roam Enterprise Admin
            </p>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
        <nav className="mx-auto mt-4 flex max-w-6xl flex-wrap gap-1">
          {PRIMARY.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setPrimary(t.id);
                if (t.id === 'courier') setCourierPage('customers');
                if (t.id === 'freight_forwarder') setFfPage('customers');
              }}
              className={tabClass(primary === t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {primary === 'courier' ? (
          <nav className="mx-auto mt-2 flex max-w-6xl gap-1">
            {COURIER_PAGES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCourierPage(t.id)}
                className={tabClass(courierPage === t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        ) : null}
        {primary === 'freight_forwarder' ? (
          <nav className="mx-auto mt-2 flex max-w-6xl gap-1">
            {FF_PAGES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFfPage(t.id)}
                className={tabClass(ffPage === t.id)}
              >
                {t.label}
                {t.id === 'claims' && pendingClaims > 0 ? (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                    {pendingClaims}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        ) : null}
      </header>

      <div className="mx-auto max-w-6xl p-6">
        {primary === 'team' && (
          <TeamMembers
            productLine="enterprise"
            apiBaseUrl={API_ENDPOINTS.admin}
            accessToken={accessToken}
            callerRole={role}
            apiNamespace="/enterprise-admin"
          />
        )}
        {primary === 'courier' && courierPage === 'customers' && (
          <CustomerAccounts
            {...customersBase}
            restrictBusinessTypes={['freight_forwarding']}
            pageTitle="Courier customers"
            subtitle="Mailbox courier companies on this product."
          />
        )}
        {primary === 'courier' && courierPage === 'features' && (
          <ProductLineSettingsPage
            {...settingsBase}
            activeTab="features"
            showBusinessTypes={false}
            showFeaturesTab
            moduleGroups={['freight']}
            pageTitle="Courier"
            pageDescription="Mailbox tools for courier companies — packages, suites, manifests, and Jamaica ops."
          />
        )}
        {primary === 'freight_forwarder' && ffPage === 'customers' && (
          <CustomerAccounts
            {...customersBase}
            restrictBusinessTypes={['warehouse']}
            pageTitle="Freight Forwarder customers"
            subtitle="Create their login here. They confirm the warehouse in Setup; you approve the join under Join requests before they can scan."
          />
        )}
        {primary === 'freight_forwarder' && ffPage === 'buildings' && (
          <IntakeBuildingsPage accessToken={accessToken} />
        )}
        {primary === 'freight_forwarder' && ffPage === 'claims' && (
          <IntakeClaimQueuePage accessToken={accessToken} />
        )}
        {primary === 'freight_forwarder' && ffPage === 'connections' && (
          <AdminConnectionsPage accessToken={accessToken} />
        )}
        {primary === 'freight_forwarder' && ffPage === 'external' && (
          <AdminExternalOrgsPage accessToken={accessToken} />
        )}
        {primary === 'freight_forwarder' && ffPage === 'billing' && (
          <AdminStorageBillingPage accessToken={accessToken} />
        )}
        {primary === 'freight_forwarder' && ffPage === 'features' && (
          <ProductLineSettingsPage
            {...settingsBase}
            activeTab="features"
            showBusinessTypes={false}
            showFeaturesTab
            moduleGroups={['warehouse']}
            pageTitle="Freight Forwarder"
            pageDescription="Origin-warehouse tools — inbound, receive, partners, storage, and bins."
          />
        )}
        {primary === 'platform' && (
          <ProductLineSettingsPage
            {...settingsBase}
            activeTab="general"
            showBusinessTypes={false}
            showProductToggles
            pageTitle="Platform"
            pageDescription="Shared name, currency, timezone, and which products new customers can use."
          />
        )}
      </div>
    </div>
  );
}
