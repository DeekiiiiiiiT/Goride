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
  Car,
  UsersRound,
  UserCog,
  ClipboardList,
  Globe,
  Zap,
  UserPlus,
  Megaphone,
  AlertTriangle,
  HardDrive,
  Table2,
  Tags,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { resolveRole } from '../../utils/permissions';

// Phase 11: Define which admin pages each platform role can access
const PLATFORM_ROLE_PAGES: Record<string, string[]> = {
  platform_owner:   ['dashboard', 'customers', 'platform-team', 'drivers', 'team-members', 'activity-log', 'fuel-stations', 'fuel-analytics', 'toll-stations', 'toll-info', 'settings', 'settings-general', 'settings-features', 'settings-registration', 'settings-security', 'settings-announcements', 'settings-danger', 'db-management', 'db-settings'],
  platform_support: ['dashboard', 'customers', 'drivers', 'team-members', 'fuel-stations', 'fuel-analytics', 'toll-stations', 'toll-info'],
  platform_analyst: ['dashboard'],
};

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

// Collapsible section for User Management
const USER_MANAGEMENT_CHILDREN = [
  { id: 'customers', label: 'Customer Accounts', icon: Users },
  { id: 'platform-team', label: 'Platform Team', icon: Shield },
  { id: 'drivers', label: 'Driver Accounts', icon: Car },
  { id: 'team-members', label: 'Team Members', icon: UserCog },
  { id: 'activity-log', label: 'Activity Log', icon: ClipboardList },
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

// Collapsible section for Platform Settings
const SETTINGS_CHILDREN = [
  { id: 'settings-general', label: 'General', icon: Globe },
  { id: 'settings-features', label: 'Features', icon: Zap },
  { id: 'settings-registration', label: 'Registration', icon: UserPlus },
  { id: 'settings-security', label: 'Security', icon: Shield },
  { id: 'settings-announcements', label: 'Announcements', icon: Megaphone },
  { id: 'settings-danger', label: 'Danger Zone', icon: AlertTriangle },
];

/** Database Management — platform owner only (see PLATFORM_ROLE_PAGES). Now a single entry with drill-down pages. */
const DATABASE_MANAGEMENT_ITEM = { id: 'db-management', label: 'Database Management', icon: Database };

export function AdminLayout({ children, currentPage, onNavigate }: AdminLayoutProps) {
  const { user, role, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Phase 11: Resolve platform role and determine allowed pages
  const resolved = resolveRole(role || (user as any)?.user_metadata?.role);
  const allowedPages = PLATFORM_ROLE_PAGES[resolved] || PLATFORM_ROLE_PAGES.platform_owner || [];
  const canViewPage = (pageId: string) => allowedPages.includes(pageId);

  // Filter sections by allowed pages
  const visibleUserMgmtChildren = USER_MANAGEMENT_CHILDREN.filter(c => canViewPage(c.id));
  const visibleFuelChildren = FUEL_MANAGEMENT_CHILDREN.filter(c => canViewPage(c.id));
  const visibleTollChildren = TOLL_MANAGEMENT_CHILDREN.filter(c => canViewPage(c.id));
  const visibleSettingsChildren = SETTINGS_CHILDREN.filter(c => canViewPage(c.id));
  const canViewDbManagement = canViewPage('db-management');

  const isUserMgmtChild = visibleUserMgmtChildren.some(c => c.id === currentPage);
  const [userMgmtOpen, setUserMgmtOpen] = useState(isUserMgmtChild);
  const isFuelChild = visibleFuelChildren.some(c => c.id === currentPage);
  const [fuelOpen, setFuelOpen] = useState(isFuelChild);
  const isTollChild = visibleTollChildren.some(c => c.id === currentPage);
  const [tollOpen, setTollOpen] = useState(isTollChild);
  const isSettingsChild = visibleSettingsChildren.some(c => c.id === currentPage);
  const [settingsOpen, setSettingsOpen] = useState(isSettingsChild);
  const isDbPage = currentPage === 'db-management' || currentPage === 'db-settings' || currentPage.startsWith('db-biz-') || currentPage.startsWith('db-customer-');

  // Keep section open when navigating to a child
  React.useEffect(() => {
    if (visibleUserMgmtChildren.some(c => c.id === currentPage)) {
      setUserMgmtOpen(true);
    }
    if (visibleFuelChildren.some(c => c.id === currentPage)) {
      setFuelOpen(true);
    }
    if (visibleTollChildren.some(c => c.id === currentPage)) {
      setTollOpen(true);
    }
    if (visibleSettingsChildren.some(c => c.id === currentPage)) {
      setSettingsOpen(true);
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
          {visibleUserMgmtChildren.length > 0 && (
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
              <UsersRound className="w-4.5 h-4.5 shrink-0" />
              <span className="truncate">User Management</span>
              {userMgmtOpen
                ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-500" />
                : <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
              }
            </button>
            {userMgmtOpen && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                {visibleUserMgmtChildren.map(child => {
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
          )}

          {/* Fuel Management collapsible section */}
          {visibleFuelChildren.length > 0 && (
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
                {visibleFuelChildren.map(child => {
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
          )}

          {/* Toll Management collapsible section */}
          {visibleTollChildren.length > 0 && (
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
                {visibleTollChildren.map(child => {
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
          )}

          {/* Platform Settings collapsible section */}
          {visibleSettingsChildren.length > 0 && (
          <div>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isSettingsChild
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }
              `}
            >
              <Settings className="w-4.5 h-4.5 shrink-0" />
              <span className="truncate">Platform Settings</span>
              {settingsOpen
                ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-500" />
                : <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
              }
            </button>
            {settingsOpen && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                {visibleSettingsChildren.map(child => {
                  const ChildIcon = child.icon;
                  const active = currentPage === child.id;
                  const isDanger = child.id === 'settings-danger';
                  return (
                    <button
                      key={child.id}
                      onClick={() => handleNav(child.id)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${active
                          ? isDanger
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-amber-500/10 text-amber-300'
                          : isDanger
                            ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/5'
                            : 'text-slate-500 hover:text-white hover:bg-slate-800'
                        }
                      `}
                    >
                      <ChildIcon className={`w-4 h-4 shrink-0 ${isDanger && active ? 'text-red-400' : ''}`} />
                      <span className="truncate">{child.label}</span>
                      {active && <ChevronRight className={`w-3 h-3 ml-auto ${isDanger ? 'text-red-400/60' : 'text-amber-400/60'}`} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* Database Management — single nav item with drill-down; platform owner only */}
          {canViewDbManagement && (
            <button
              onClick={() => handleNav('db-management')}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isDbPage
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }
              `}
            >
              <Database className="w-4.5 h-4.5 shrink-0" />
              <span className="truncate">Database Management</span>
              {isDbPage && <ChevronRight className="w-3.5 h-3.5 ml-auto text-amber-400/60" />}
            </button>
          )}
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
              {resolved === 'platform_support' ? 'Support' : resolved === 'platform_analyst' ? 'Analyst' : 'Super Admin'}
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
            {[...USER_MANAGEMENT_CHILDREN].find(c => c.id === currentPage)?.label
              || FUEL_MANAGEMENT_CHILDREN.find(c => c.id === currentPage)?.label
              || TOLL_MANAGEMENT_CHILDREN.find(c => c.id === currentPage)?.label
              || (SETTINGS_CHILDREN.find(c => c.id === currentPage) ? `Platform Settings — ${SETTINGS_CHILDREN.find(c => c.id === currentPage)!.label}` : null)
              || (currentPage === 'db-management' ? 'Database Management' : null)
              || (currentPage === 'db-settings' ? 'Database Management — Settings' : null)
              || (currentPage.startsWith('db-biz-') ? 'Database Management' : null)
              || (currentPage.startsWith('db-customer-') ? 'Database Management — Customer Ledgers' : null)
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