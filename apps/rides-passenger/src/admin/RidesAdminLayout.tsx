import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { supabaseRidesAdmin as supabase, hasProductAdminRole, jwtPrimaryRole } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  CircleDollarSign,
  TrendingUp,
  Car,
  ScrollText,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  Loader2,
  ShieldAlert,
  ExternalLink,
  Shield,
  Store,
  AlertTriangle,
  Banknote,
  Wallet,
  Calculator,
  LayoutGrid,
  CalendarDays,
  Package,
  Settings,
} from 'lucide-react';
import { RidesAdminLoginForm } from './components/RidesAdminLoginForm';
import { AdminConfirmProvider } from './contexts/AdminConfirmContext';

interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
}

function isNavItemActive(currentPath: string, item: NavItem): boolean {
  if (item.end) {
    return currentPath === item.path;
  }
  return (
    currentPath === item.path ||
    (item.path !== '/admin' && currentPath.startsWith(item.path))
  );
}

function useSectionOpen(isChildActive: boolean) {
  const [open, setOpen] = useState(isChildActive);
  useEffect(() => {
    if (isChildActive) setOpen(true);
  }, [isChildActive]);
  return [open, setOpen] as const;
}

function NavLink({
  item,
  currentPath,
  onNavigate,
  nested = false,
}: {
  item: NavItem;
  currentPath: string;
  onNavigate: (path: string) => void;
  nested?: boolean;
}) {
  const Icon = item.icon;
  const isActive = isNavItemActive(currentPath, item);

  return (
    <button
      onClick={() => onNavigate(item.path)}
      className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
        nested ? 'px-3 py-2' : 'px-3 py-2.5'
      } ${
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
}

function NavSection({
  label,
  icon: SectionIcon,
  items,
  currentPath,
  onNavigate,
}: {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const isActive = items.some((item) => isNavItemActive(currentPath, item));
  const [open, setOpen] = useSectionOpen(isActive);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-emerald-500/10 text-emerald-300'
            : 'text-slate-500 hover:text-white hover:bg-slate-800'
        }`}
      >
        <SectionIcon className="w-4 h-4 shrink-0" />
        <span className="truncate">{label}</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
        )}
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
          {items.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              currentPath={currentPath}
              onNavigate={onNavigate}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TOP_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', path: '/admin/users', label: 'User Management', icon: Users },
  { id: 'ledger', path: '/admin/ledger', label: 'Trip Ledger', icon: ScrollText },
];

const PRICING_TRANSPORT_ITEMS: NavItem[] = [
  { id: 'fare-rules', path: '/admin/fare-rules', label: 'Fare Rules', icon: CircleDollarSign, end: true },
  { id: 'surge', path: '/admin/surge', label: 'Surge Pricing', icon: TrendingUp },
  {
    id: 'transport-solutions',
    path: '/admin/fare-rules/transport-solutions',
    label: 'Transport Solutions',
    icon: Car,
  },
  {
    id: 'trip-calculator',
    path: '/admin/fare-rules/calculator',
    label: 'Trip calculator',
    icon: Calculator,
    end: true,
  },
];

const SERVICES_ITEMS: NavItem[] = [
  { id: 'services-rideshare', path: '/admin/services/rideshare', label: 'Rideshare', icon: Car },
  { id: 'services-courier', path: '/admin/services/courier', label: 'Courier', icon: Package },
  {
    id: 'services-event',
    path: '/admin/services/event',
    label: 'Event booking',
    icon: CalendarDays,
  },
];

const CASH_SETTLEMENT_ITEMS: NavItem[] = [
  { id: 'disputes', path: '/admin/disputes', label: 'Cash Disputes', icon: AlertTriangle },
  { id: 'outstanding-balances', path: '/admin/outstanding-balances', label: 'Outstanding Balances', icon: Wallet },
  { id: 'settlement-overrides', path: '/admin/settlement-overrides', label: 'Settlement Overrides', icon: Banknote },
];

const SECONDARY_NAV_ITEMS: NavItem[] = [
  { id: 'settings', path: '/admin/settings', label: 'Platform Settings', icon: Settings },
  { id: 'app-permissions', path: '/admin/app-permissions', label: 'App Permissions', icon: Shield },
  { id: 'play-store', path: '/admin/play-store', label: 'Play Store', icon: Store },
  { id: 'rides', path: '/admin/rides', label: 'Ride Operations', icon: Car },
];

const ALL_NAV_ITEMS = [
  ...TOP_NAV_ITEMS,
  ...PRICING_TRANSPORT_ITEMS,
  ...SERVICES_ITEMS,
  ...CASH_SETTLEMENT_ITEMS,
  ...SECONDARY_NAV_ITEMS,
];

export function RidesAdminLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const initSession = async () => {
      const { data: { session: cached } } = await supabase.auth.getSession();
      if (!cached) {
        setSession(null);
        setLoading(false);
        return;
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        await supabase.auth.signOut();
        setSession(null);
        setLoading(false);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = cached.expires_at ?? 0;
      if (expiresAt - now < 120) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session) {
          await supabase.auth.signOut();
          setSession(null);
        } else {
          setSession(refreshed.session);
        }
      } else {
        setSession(cached);
      }
      setLoading(false);
    };

    void initSession();

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

  const userRole = jwtPrimaryRole(session.user);
  const hasAccess = hasProductAdminRole(session.user, 'rides');

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
    if (currentPath.startsWith('/admin/users/') && currentPath !== '/admin/users') {
      return 'Rider detail';
    }
    const item = ALL_NAV_ITEMS.filter((i) => isNavItemActive(currentPath, i)).sort(
      (a, b) => b.path.length - a.path.length,
    )[0];
    return item?.label ?? 'Dashboard';
  })();

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  return (
    <AdminConfirmProvider>
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
          {TOP_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              currentPath={currentPath}
              onNavigate={handleNavigate}
            />
          ))}
          <NavSection
            label="Pricing & Transport"
            icon={CircleDollarSign}
            items={PRICING_TRANSPORT_ITEMS}
            currentPath={currentPath}
            onNavigate={handleNavigate}
          />
          <NavSection
            label="Services"
            icon={LayoutGrid}
            items={SERVICES_ITEMS}
            currentPath={currentPath}
            onNavigate={handleNavigate}
          />
          <NavSection
            label="Cash Settlement"
            icon={Banknote}
            items={CASH_SETTLEMENT_ITEMS}
            currentPath={currentPath}
            onNavigate={handleNavigate}
          />
          {SECONDARY_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              currentPath={currentPath}
              onNavigate={handleNavigate}
            />
          ))}
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
    </AdminConfirmProvider>
  );
}
