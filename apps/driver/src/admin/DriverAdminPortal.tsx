import React, { useState, useEffect } from 'react';
import { supabase } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  MapPin,
  Bell,
  ShieldCheck,
  HeadphonesIcon,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Loader2,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { Toaster } from 'sonner';
import { DriverAdminDashboard } from './pages/DriverAdminDashboard';
import { DriverPresenceManager } from './pages/DriverPresenceManager';
import { OfferMonitor } from './pages/OfferMonitor';
import { ComplianceManager } from './pages/ComplianceManager';

type AdminPage = 'dashboard' | 'presence' | 'offers' | 'compliance' | 'support';

const ALLOWED_ROLES = [
  'platform_owner',
  'platform_support',
  'superadmin',
  'driver_admin',
  'driver_ops',
];

const NAV_ITEMS: { id: AdminPage; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'presence', label: 'Driver Presence', icon: MapPin },
  { id: 'offers', label: 'Offer Monitor', icon: Bell },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { id: 'support', label: 'Support Tools', icon: HeadphonesIcon },
];

export function DriverAdminPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<AdminPage>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);

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
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-8">
        <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Admin Login Required</h1>
        <p className="text-slate-400 text-center max-w-md mb-6">
          Please sign in with an admin account to access the Driver Admin Portal.
        </p>
        <a
          href="/"
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium"
        >
          Go to Login
        </a>
      </div>
    );
  }

  const userRole = session.user.user_metadata?.role || session.user.app_metadata?.role;
  const hasAccess = userRole && ALLOWED_ROLES.includes(userRole);

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-8">
        <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
        <p className="text-slate-400 text-center max-w-md mb-6">
          You don&apos;t have permission to access the Driver Admin Portal. Your role:{' '}
          <span className="font-mono text-slate-300">{userRole || '(none)'}</span>
        </p>
        <a
          href="/"
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium"
        >
          Back to App
        </a>
      </div>
    );
  }

  const userName = session.user.email?.split('@')[0] || 'Admin';
  const initials = userName.slice(0, 2).toUpperCase();
  const roleLabel = userRole
    ? userRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : 'Admin';

  const renderPage = () => {
    switch (currentPage) {
      case 'presence':
        return <DriverPresenceManager accessToken={session.access_token} />;
      case 'offers':
        return <OfferMonitor accessToken={session.access_token} />;
      case 'compliance':
        return <ComplianceManager accessToken={session.access_token} />;
      case 'support':
        return (
          <div className="text-slate-400">
            <h2 className="text-xl font-semibold text-white mb-4">Support Tools</h2>
            <p>Driver support tools coming soon.</p>
          </div>
        );
      case 'dashboard':
      default:
        return <DriverAdminDashboard accessToken={session.access_token} />;
    }
  };

  return (
    <div className="dark flex h-screen bg-slate-950">
      <Toaster position="top-right" theme="dark" />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center">
                <span className="text-xs font-bold text-white">RD</span>
              </div>
              <div>
                <h1 className="font-semibold text-white text-sm">Roam Driver</h1>
                <p className="text-[11px] text-slate-500">Admin Portal</p>
              </div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden p-1 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentPage(item.id);
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-500/10 text-violet-300'
                    : 'text-slate-500 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span className="truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 ml-auto text-violet-400/60" />}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-slate-800">
          <a
            href="/"
            className="flex items-center gap-2 px-3 py-2 mb-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Back to Driver App
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
              onClick={handleSignOut}
              className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="h-16 bg-slate-900/50 border-b border-slate-800 flex items-center px-4 lg:px-6 shrink-0 backdrop-blur-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>

          <h2 className="text-base font-semibold text-white">
            {NAV_ITEMS.find((i) => i.id === currentPage)?.label || 'Dashboard'}
          </h2>

          <a
            href="/"
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors hidden sm:block"
          >
            Back to Driver App
          </a>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">{renderPage()}</div>
        </main>
      </div>
    </div>
  );
}
