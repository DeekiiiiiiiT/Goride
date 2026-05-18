import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  CircleDollarSign,
  TrendingUp,
  Car,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Loader2,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { RidesAdminLoginForm } from './components/RidesAdminLoginForm';

const ALLOWED_ROLES = [
  'platform_owner',
  'platform_support',
  'superadmin',
  'rides_admin',
  'rides_ops',
];

const NAV_ITEMS = [
  { id: 'dashboard', path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', path: '/admin/users', label: 'User Management', icon: Users },
  { id: 'fare-rules', path: '/admin/fare-rules', label: 'Fare Rules', icon: CircleDollarSign },
  { id: 'surge', path: '/admin/surge', label: 'Surge Pricing', icon: TrendingUp },
  { id: 'rides', path: '/admin/rides', label: 'Ride Operations', icon: Car },
];

export function RidesAdminLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <RidesAdminLoginForm />;
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
          You don&apos;t have permission to access the Rides Admin Portal. Your role:{' '}
          <span className="font-mono text-slate-300">{userRole || '(none)'}</span>
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium"
        >
          Back to App
        </button>
      </div>
    );
  }

  const userName = session.user.email?.split('@')[0] || 'Admin';
  const initials = userName.slice(0, 2).toUpperCase();
  const roleLabel = userRole
    ? userRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : 'Admin';

  const currentPath = location.pathname;

  const pageTitle = (() => {
    if (currentPath.startsWith('/admin/fare-rules/calculator')) return 'Trip calculator';
    if (currentPath.startsWith('/admin/users/') && currentPath !== '/admin/users') {
      return 'Rider detail';
    }
    const item = NAV_ITEMS.find(
      (i) =>
        currentPath === i.path ||
        (i.path !== '/admin' && currentPath.startsWith(i.path)),
    );
    return item?.label ?? 'Dashboard';
  })();

  return (
    <div className="rides-admin-portal dark flex h-screen bg-slate-950">
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
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                <span className="text-xs font-bold text-slate-900">RR</span>
              </div>
              <div>
                <h1 className="font-semibold text-white text-sm">Roam Rides</h1>
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
            const isActive = currentPath === item.path || 
              (item.path !== '/admin' && currentPath.startsWith(item.path));
            return (
              <button
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'text-slate-500 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 ml-auto text-emerald-400/60" />}
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
            Back to Rider App
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

          <h2 className="text-base font-semibold text-white">{pageTitle}</h2>

          <a
            href="/"
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors hidden sm:block"
          >
            Back to Rider App
          </a>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet context={{ session, role: userRole }} />
          </div>
        </main>
      </div>
    </div>
  );
}
