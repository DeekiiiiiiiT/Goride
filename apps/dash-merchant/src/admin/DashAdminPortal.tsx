import React, { useState, useEffect } from 'react';
import { supabaseDashAdmin as supabase, hasProductAdminRole, jwtPrimaryRole } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import { LayoutDashboard, Store, ClipboardList, Loader2, ShieldAlert, Settings } from 'lucide-react';
import { Toaster } from 'sonner';
import { AdminShell } from '@roam/admin-core';
import type { AdminConfig } from '@roam/admin-core';
import { MerchantManager } from './pages/MerchantManager';
import { PlatformSettingsPage } from './pages/PlatformSettingsPage';
import { AdminLoginForm } from './components/AdminLoginForm';

type AdminPage = 'dashboard' | 'merchants' | 'orders' | 'settings';

const ALLOWED_ROLES = [
  'platform_owner',
  'platform_support',
  'superadmin',
  'dash_admin',
  'dash_ops',
];

const DASH_ADMIN_CONFIG: AdminConfig = {
  product: 'dash',
  title: 'Roam Dash',
  subtitle: 'Admin Portal',
  sections: [],
  topNavItems: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'merchants', label: 'Merchants', icon: Store },
    { id: 'orders', label: 'Orders', icon: ClipboardList },
    { id: 'settings', label: 'Platform Settings', icon: Settings },
  ],
  allowedRoles: ALLOWED_ROLES,
  backToAppUrl: '/',
  backToAppLabel: 'Back to Roam Dash',
};

export function DashAdminPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<AdminPage>('merchants');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin';
  };

  if (loading) {
    return (
      <div className="dash-admin-portal min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <Toaster position="top-right" theme="dark" />
        <AdminLoginForm />
      </>
    );
  }

  const userRole = jwtPrimaryRole(session.user);
  const hasAccess = hasProductAdminRole(session.user, 'dash');

  if (!hasAccess) {
    return (
      <div className="dash-admin-portal min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-8">
        <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-4 ring-1 ring-red-500/30">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-xl font-semibold mb-2 text-white">Access Denied</h1>
        <p className="text-slate-400 text-center max-w-md mb-6">
          You don&apos;t have permission to access the Dash Admin Portal. Your role:{' '}
          <span className="font-mono text-amber-300/90">{userRole || '(none)'}</span>
        </p>
        <a
          href="/"
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium border border-slate-700 transition-colors"
        >
          Back to App
        </a>
      </div>
    );
  }

  const userName = session.user.email?.split('@')[0] || 'Admin';
  const roleLabel = userRole
    ? userRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : 'Admin';

  const renderPage = () => {
    switch (currentPage) {
      case 'merchants':
        return <MerchantManager accessToken={session.access_token} />;
      case 'orders':
        return (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8">
            <h2 className="text-xl font-semibold text-white mb-2">Order Operations</h2>
            <p className="text-slate-400">Order management tools are coming soon.</p>
          </div>
        );
      case 'settings':
        return <PlatformSettingsPage session={session} />;
      case 'dashboard':
      default:
        return (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8">
            <h2 className="text-xl font-semibold text-white mb-2">Dashboard</h2>
            <p className="text-slate-400">Overview metrics and analytics coming soon.</p>
          </div>
        );
    }
  };

  return (
    <div className="dash-admin-portal">
      <Toaster position="top-right" theme="dark" richColors />
      <AdminShell
        config={DASH_ADMIN_CONFIG}
        currentPage={currentPage}
        onNavigate={(page) => setCurrentPage(page as AdminPage)}
        user={{
          name: userName,
          email: session.user.email,
          role: roleLabel,
        }}
        onSignOut={handleSignOut}
      >
        {renderPage()}
      </AdminShell>
    </div>
  );
}
