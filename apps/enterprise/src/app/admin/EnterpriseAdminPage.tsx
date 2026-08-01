import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { CustomerAccounts, TeamMembers } from '@roam/admin-core';
import { ProductLineSettingsPage } from '@roam/admin-core/settings';
import { API_ENDPOINTS } from '@roam/api-client';
import { useAdminAuth } from '@/app/auth/AdminAuthProvider';
import { EnterpriseAdminLogin } from '@/app/admin/EnterpriseAdminLogin';

type AdminTab = 'customers' | 'team' | 'settings';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'customers', label: 'Customers' },
  { id: 'team', label: 'Team Members' },
  { id: 'settings', label: 'Settings' },
];

export function EnterpriseAdminPage() {
  const { session, user, role, loading, signOut } = useAdminAuth();
  const [tab, setTab] = useState<AdminTab>('customers');

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
        <nav className="mx-auto mt-4 flex max-w-6xl gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800'
                  : 'rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100'
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-6xl p-6">
        {tab === 'customers' && (
          <CustomerAccounts
            productLine="enterprise"
            apiBaseUrl={API_ENDPOINTS.admin}
            accessToken={accessToken}
            callerRole={role}
            apiNamespace="/enterprise-admin"
          />
        )}
        {tab === 'team' && (
          <TeamMembers
            productLine="enterprise"
            apiBaseUrl={API_ENDPOINTS.admin}
            accessToken={accessToken}
            callerRole={role}
            apiNamespace="/enterprise-admin"
          />
        )}
        {tab === 'settings' && (
          <ProductLineSettingsPage
            segment="enterprise"
            apiBaseUrl={API_ENDPOINTS.admin}
            accessToken={accessToken}
            userEmail={user?.email}
            userRole={role ?? undefined}
            platformLabel="Roam Enterprise"
            showBusinessTypes
            showFeaturesTab
          />
        )}
      </div>
    </div>
  );
}
