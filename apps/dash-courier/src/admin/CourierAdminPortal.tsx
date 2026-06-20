import React, { useState, useEffect } from 'react';
import { Routes, Route, Outlet, useLocation, Link } from 'react-router-dom';
import { supabaseCourierAdmin as supabase, hasProductAdminRole, jwtPrimaryRole } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  MapPin,
  ShieldCheck,
  HeadphonesIcon,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Loader2,
  ShieldAlert,
  ExternalLink,
  ScrollText,
  Settings,
  Bike,
} from 'lucide-react';
import { Toaster } from 'sonner';
import { CourierAdminLoginForm } from './components/CourierAdminLoginForm';
import { CourierAdminDashboard } from './pages/CourierAdminDashboard';
import { CourierPresenceManager } from './pages/CourierPresenceManager';
import { ComplianceManager } from './pages/ComplianceManager';
import { CouriersListPage } from './pages/users/CouriersListPage';
import { CourierDetailPage } from './pages/users/CourierDetailPage';
import { DeliveryLedgerPage } from './pages/DeliveryLedgerPage';
import { SupportToolsPage } from './pages/SupportToolsPage';
import { AdminConfirmProvider } from './contexts/AdminConfirmContext';
import { PlatformSettingsPage } from './pages/PlatformSettingsPage';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/users', label: 'User Management', icon: Users, end: false },
  { path: '/ledger', label: 'Delivery Ledger', icon: ScrollText, end: false },
  { path: '/presence', label: 'Courier Presence', icon: MapPin, end: false },
  { path: '/compliance', label: 'Compliance', icon: ShieldCheck, end: false },
  { path: '/settings', label: 'Platform Settings', icon: Settings, end: false },
  { path: '/support', label: 'Support Tools', icon: HeadphonesIcon, end: false },
];

function AdminLayoutShell({ session }: { session: Session }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const userRole = jwtPrimaryRole(session.user);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin';
  };

  const userName = session.user.email?.split('@')[0] || 'Admin';
  const initials = userName.slice(0, 2).toUpperCase();
  const roleLabel = userRole
    ? String(userRole).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : 'Admin';

  const pageTitle = (() => {
    if (location.pathname.startsWith('/users/') && location.pathname !== '/users') {
      return 'Courier detail';
    }
    const item = NAV_ITEMS.find(
      (i) =>
        location.pathname === i.path ||
        (!i.end && i.path !== '/' && location.pathname.startsWith(i.path)),
    );
    return item?.label ?? 'Dashboard';
  })();

  return (
    <div className="dark flex h-screen bg-slate-950">
      <Toaster position="top-right" theme="dark" />

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                <Bike className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-white text-sm">Roam Dash Courier</h1>
                <p className="text-[11px] text-slate-500">Admin Portal</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="lg:hidden p-1 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.end
              ? location.pathname === item.path
              : location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'text-slate-500 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span className="truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 ml-auto text-emerald-400/60" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <a
            href="/"
            className="flex items-center gap-2 px-3 py-2 mb-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Back to Courier App
          </a>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-300">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900/50 border-b border-slate-800 flex items-center px-4 lg:px-6 shrink-0 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-base font-semibold text-white">{pageTitle}</h2>
          <a
            href="/"
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors hidden sm:block"
          >
            Back to Courier App
          </a>
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet context={{ session, role: userRole }} />
          </div>
        </main>
      </div>
    </div>
  );
}

export function CourierAdminPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <CourierAdminLoginForm />;
  }

  const userRole = jwtPrimaryRole(session.user);
  const hasAccess = hasProductAdminRole(session.user, 'courier');

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-8">
        <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
        <p className="text-slate-400 text-center max-w-md mb-2">
          You don&apos;t have permission to access the Courier Admin Portal.
        </p>
        <p className="text-slate-500 text-center text-sm max-w-md mb-6 font-mono">
          Signed in as: {session.user.email ?? '(unknown)'}
          <br />
          Role: {String(userRole || '(none)')}
        </p>
        <a href="/" className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium">
          Back to App
        </a>
      </div>
    );
  }

  return (
    <AdminConfirmProvider>
      <Routes>
        <Route element={<AdminLayoutShell session={session} />}>
          <Route index element={<CourierAdminDashboard />} />
          <Route path="users" element={<CouriersListPage />} />
          <Route path="users/:userId" element={<CourierDetailPage />} />
          <Route path="ledger" element={<DeliveryLedgerPage />} />
          <Route path="presence" element={<CourierPresenceManager />} />
          <Route path="compliance" element={<ComplianceManager />} />
          <Route path="support" element={<SupportToolsPage />} />
          <Route path="settings" element={<PlatformSettingsPage />} />
        </Route>
      </Routes>
    </AdminConfirmProvider>
  );
}
