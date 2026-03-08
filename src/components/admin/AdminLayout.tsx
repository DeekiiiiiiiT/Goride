import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Fuel,
  MapPin,
  Settings,
  LogOut,
  Shield,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  Database,
  BarChart3,
  CircleDollarSign,
  Info,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'settings', label: 'Platform Settings', icon: Settings },
];

// Collapsible section for User Management
const USER_MANAGEMENT_CHILDREN = [
  { id: 'customers', label: 'Customer Accounts', icon: Users },
];

// Collapsible section for Fuel Management
const FUEL_MANAGEMENT_CHILDREN = [
  { id: 'fuel-stations', label: 'Station Database', icon: Database },
  { id: 'fuel-analytics', label: 'Fuel Analytics', icon: BarChart3 },
];

// Collapsible section for Toll Management
const TOLL_MANAGEMENT_CHILDREN = [
  { id: 'toll-stations', label: 'Toll Database', icon: MapPin },
  { id: 'toll-info', label: 'Toll Info', icon: Info },
];

export function AdminLayout({ children, currentPage, onNavigate }: AdminLayoutProps) {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isUserMgmtChild = USER_MANAGEMENT_CHILDREN.some(c => c.id === currentPage);
  const [userMgmtOpen, setUserMgmtOpen] = useState(isUserMgmtChild);
  const isFuelChild = FUEL_MANAGEMENT_CHILDREN.some(c => c.id === currentPage);
  const [fuelOpen, setFuelOpen] = useState(isFuelChild);
  const isTollChild = TOLL_MANAGEMENT_CHILDREN.some(c => c.id === currentPage);
  const [tollOpen, setTollOpen] = useState(isTollChild);

  // Keep section open when navigating to a child
  React.useEffect(() => {
    if (USER_MANAGEMENT_CHILDREN.some(c => c.id === currentPage)) {
      setUserMgmtOpen(true);
    }
    if (FUEL_MANAGEMENT_CHILDREN.some(c => c.id === currentPage)) {
      setFuelOpen(true);
    }
    if (TOLL_MANAGEMENT_CHILDREN.some(c => c.id === currentPage)) {
      setTollOpen(true);
    }
  }, [currentPage]);

  const handleSignOut = async () => {
    await signOut();
  };

  const handleNav = (page: string) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const userName = (user as any)?.user_metadata?.name || user?.email?.split('@')[0] || 'Admin';
  const userEmail = user?.email || '';
  const initials = userName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="dark flex h-screen bg-slate-950">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Sidebar header */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800 shrink-0">
          <div className="bg-amber-500/20 p-2 rounded-lg">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">Roam Fleet</h1>
            <p className="text-[11px] text-slate-500 truncate">Super Admin Portal</p>
          </div>
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden ml-auto p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {/* Dashboard (standalone top item) */}
          {NAV_ITEMS.slice(0, 1).map(item => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }
                `}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span className="truncate">{item.label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-amber-400/60" />}
              </button>
            );
          })}

          {/* User Management collapsible section */}
          <div>
            <button
              onClick={() => setUserMgmtOpen(!userMgmtOpen)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isUserMgmtChild
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }
              `}
            >
              <Users className="w-4.5 h-4.5 shrink-0" />
              <span className="truncate">User Management</span>
              {userMgmtOpen
                ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-500" />
                : <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
              }
            </button>
            {userMgmtOpen && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                {USER_MANAGEMENT_CHILDREN.map(child => {
                  const ChildIcon = child.icon;
                  const active = currentPage === child.id;
                  return (
                    <button
                      key={child.id}
                      onClick={() => handleNav(child.id)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${active
                          ? 'bg-amber-500/10 text-amber-300'
                          : 'text-slate-500 hover:text-white hover:bg-slate-800'
                        }
                      `}
                    >
                      <ChildIcon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{child.label}</span>
                      {active && <ChevronRight className="w-3 h-3 ml-auto text-amber-400/60" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fuel Management collapsible section */}
          <div>
            <button
              onClick={() => setFuelOpen(!fuelOpen)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isFuelChild
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }
              `}
            >
              <Fuel className="w-4.5 h-4.5 shrink-0" />
              <span className="truncate">Fuel Management</span>
              {fuelOpen
                ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-500" />
                : <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
              }
            </button>
            {fuelOpen && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                {FUEL_MANAGEMENT_CHILDREN.map(child => {
                  const ChildIcon = child.icon;
                  const active = currentPage === child.id;
                  return (
                    <button
                      key={child.id}
                      onClick={() => handleNav(child.id)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${active
                          ? 'bg-amber-500/10 text-amber-300'
                          : 'text-slate-500 hover:text-white hover:bg-slate-800'
                        }
                      `}
                    >
                      <ChildIcon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{child.label}</span>
                      {active && <ChevronRight className="w-3 h-3 ml-auto text-amber-400/60" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Toll Management collapsible section */}
          <div>
            <button
              onClick={() => setTollOpen(!tollOpen)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isTollChild
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }
              `}
            >
              <CircleDollarSign className="w-4.5 h-4.5 shrink-0" />
              <span className="truncate">Toll Management</span>
              {tollOpen
                ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-500" />
                : <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
              }
            </button>
            {tollOpen && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                {TOLL_MANAGEMENT_CHILDREN.map(child => {
                  const ChildIcon = child.icon;
                  const active = currentPage === child.id;
                  return (
                    <button
                      key={child.id}
                      onClick={() => handleNav(child.id)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${active
                          ? 'bg-amber-500/10 text-amber-300'
                          : 'text-slate-500 hover:text-white hover:bg-slate-800'
                        }
                      `}
                    >
                      <ChildIcon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{child.label}</span>
                      {active && <ChevronRight className="w-3 h-3 ml-auto text-amber-400/60" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Remaining items (Platform Settings) */}
          {NAV_ITEMS.slice(1).map(item => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }
                `}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span className="truncate">{item.label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-amber-400/60" />}
              </button>
            );
          })}
        </nav>

        {/* Sidebar footer — user info + logout */}
        <div className="border-t border-slate-800 p-4 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300 text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-[11px] text-slate-500 truncate">{userEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded font-semibold">
              Super Admin
            </span>
            <button
              onClick={handleSignOut}
              className="ml-auto p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Page title */}
          <h2 className="text-base font-semibold text-white">
            {USER_MANAGEMENT_CHILDREN.find(c => c.id === currentPage)?.label
              || FUEL_MANAGEMENT_CHILDREN.find(c => c.id === currentPage)?.label
              || TOLL_MANAGEMENT_CHILDREN.find(c => c.id === currentPage)?.label
              || NAV_ITEMS.find(i => i.id === currentPage)?.label
              || 'Dashboard'}
          </h2>

          {/* Right side — "Back to Fleet" link */}
          <a
            href="/"
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Back to Fleet Dashboard
          </a>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}