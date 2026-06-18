import React, { useEffect, useMemo, useState } from 'react';
import {
  Shield,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Database,
  Fuel,
  HardDrive,
  Activity,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { AdminNavSection } from './AdminNavSection';
import { AdminNavGroup } from './AdminNavGroup';
import {
  NAV_ITEMS,
  PLATFORM_CHILDREN,
  ROAM_ENTERPRISE_CHILDREN,
  ROAM_FLEET_CHILDREN,
  ROAM_DASH_CHILDREN,
  ROAM_RIDES_CHILDREN,
  ROAM_HAUL_CHILDREN,
  ROAM_DRIVER_CHILDREN,
  FUEL_MANAGEMENT_CHILDREN,
  TOLL_MANAGEMENT_CHILDREN,
  VEHICLE_DATABASE_CHILDREN,
  SETTINGS_CHILDREN,
  API_CENTER_CHILDREN,
  DATABASE_MANAGEMENT_ITEM,
  PLATFORM_ROLE_PAGES,
  SECTION_META,
  type NavChild,
} from './adminNavConfig';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

function useSectionOpen(currentPage: string, childIds: string[]) {
  const isChild = childIds.includes(currentPage);
  const [open, setOpen] = useState(isChild);
  useEffect(() => {
    if (isChild) setOpen(true);
  }, [currentPage, isChild]);
  return [open, setOpen] as const;
}

function allNavChildren(): NavChild[] {
  return [
    ...NAV_ITEMS,
    ...PLATFORM_CHILDREN,
    ...ROAM_ENTERPRISE_CHILDREN,
    ...ROAM_FLEET_CHILDREN,
    ...ROAM_DASH_CHILDREN,
    ...ROAM_RIDES_CHILDREN,
    ...ROAM_HAUL_CHILDREN,
    ...ROAM_DRIVER_CHILDREN,
    ...FUEL_MANAGEMENT_CHILDREN,
    ...TOLL_MANAGEMENT_CHILDREN,
    ...VEHICLE_DATABASE_CHILDREN,
    ...SETTINGS_CHILDREN,
    ...API_CENTER_CHILDREN,
    DATABASE_MANAGEMENT_ITEM,
  ];
}

function pageTitle(currentPage: string): string {
  const child = allNavChildren().find((c) => c.id === currentPage);
  if (child) {
    if (currentPage.startsWith('settings-')) {
      return `Platform Settings — ${child.label}`;
    }
    return child.label;
  }
  if (currentPage === 'db-management') return 'Database Management';
  if (currentPage === 'db-settings') return 'Database Management — Settings';
  if (currentPage.startsWith('db-biz-')) return 'Database Management';
  if (currentPage.startsWith('db-customer-')) return 'Database Management — Customer Ledgers';
  if (currentPage.startsWith('api-center-')) {
    const tab = API_CENTER_CHILDREN.find((c) => c.id === currentPage);
    return tab ? `API Command Center — ${tab.label}` : 'API Command Center';
  }
  if (currentPage === 'driver-user-detail') return 'Driver user';
  if (currentPage === 'rider-user-detail') return 'Rider user';
  if (currentPage === 'global-identity') return 'Global Identity Search';
  return 'Dashboard';
}

export function AdminLayout({ children, currentPage, onNavigate }: AdminLayoutProps) {
  const { user, role, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const resolved = role || 'platform_owner';
  const allowedPages = PLATFORM_ROLE_PAGES[resolved] || PLATFORM_ROLE_PAGES.platform_owner || [];
  const canViewPage = (pageId: string) => allowedPages.includes(pageId);

  const filterChildren = (items: NavChild[]) =>
    items.filter((c) => canViewPage(c.id) || !!c.href);

  const visiblePlatform = filterChildren(PLATFORM_CHILDREN);
  const visibleEnterprise = filterChildren(ROAM_ENTERPRISE_CHILDREN);
  const visibleFleet = filterChildren(ROAM_FLEET_CHILDREN);
  const visibleDash = filterChildren(ROAM_DASH_CHILDREN);
  const visibleRides = filterChildren(ROAM_RIDES_CHILDREN);
  const visibleHaul = filterChildren(ROAM_HAUL_CHILDREN);
  const visibleDriver = filterChildren(ROAM_DRIVER_CHILDREN);
  const visibleFuel = filterChildren(FUEL_MANAGEMENT_CHILDREN);
  const visibleToll = filterChildren(TOLL_MANAGEMENT_CHILDREN);
  const visibleVehicleDb = filterChildren(VEHICLE_DATABASE_CHILDREN);
  const visibleSettings = filterChildren(SETTINGS_CHILDREN);
  const visibleApiCenter = filterChildren(API_CENTER_CHILDREN);
  const canViewDbManagement = canViewPage('db-management');

  const platformIds = useMemo(() => visiblePlatform.map((c) => c.id), [visiblePlatform]);
  const enterpriseIds = useMemo(() => visibleEnterprise.filter((c) => !c.href).map((c) => c.id), [visibleEnterprise]);
  const fleetIds = useMemo(() => visibleFleet.filter((c) => !c.href).map((c) => c.id), [visibleFleet]);
  const dashIds = useMemo(() => visibleDash.filter((c) => !c.href).map((c) => c.id), [visibleDash]);
  const ridesIds = useMemo(() => visibleRides.filter((c) => !c.href).map((c) => c.id), [visibleRides]);
  const haulIds = useMemo(() => visibleHaul.filter((c) => !c.href).map((c) => c.id), [visibleHaul]);
  const driverIds = useMemo(() => visibleDriver.filter((c) => !c.href).map((c) => c.id), [visibleDriver]);
  const fuelIds = useMemo(() => visibleFuel.map((c) => c.id), [visibleFuel]);
  const tollIds = useMemo(() => visibleToll.map((c) => c.id), [visibleToll]);
  const vehicleIds = useMemo(() => visibleVehicleDb.map((c) => c.id), [visibleVehicleDb]);
  const settingsIds = useMemo(() => visibleSettings.map((c) => c.id), [visibleSettings]);
  const apiIds = useMemo(() => visibleApiCenter.map((c) => c.id), [visibleApiCenter]);

  const [platformOpen, setPlatformOpen] = useSectionOpen(currentPage, platformIds);
  const [enterpriseOpen, setEnterpriseOpen] = useSectionOpen(currentPage, enterpriseIds);
  const [fleetOpen, setFleetOpen] = useSectionOpen(currentPage, fleetIds);
  const [dashOpen, setDashOpen] = useSectionOpen(currentPage, dashIds);
  const [ridesOpen, setRidesOpen] = useSectionOpen(currentPage, ridesIds);
  const [haulOpen, setHaulOpen] = useSectionOpen(currentPage, haulIds);
  const [driverOpen, setDriverOpen] = useSectionOpen(currentPage, driverIds);
  const businessSegmentIds = useMemo(
    () => [...enterpriseIds, ...fleetIds, ...driverIds, ...ridesIds, ...haulIds, ...dashIds],
    [enterpriseIds, fleetIds, driverIds, ridesIds, haulIds, dashIds],
  );
  const [businessSegmentsOpen, setBusinessSegmentsOpen] = useSectionOpen(currentPage, businessSegmentIds);
  const [fuelOpen, setFuelOpen] = useSectionOpen(currentPage, fuelIds);
  const [tollOpen, setTollOpen] = useSectionOpen(currentPage, tollIds);
  const [vehicleDbOpen, setVehicleDbOpen] = useSectionOpen(currentPage, vehicleIds);
  const [settingsOpen, setSettingsOpen] = useSectionOpen(currentPage, settingsIds);
  const [apiCenterOpen, setApiCenterOpen] = useSectionOpen(currentPage, apiIds);

  const isDbPage =
    currentPage === 'db-management'
    || currentPage === 'db-settings'
    || currentPage.startsWith('db-biz-')
    || currentPage.startsWith('db-customer-');

  const handleNav = (page: string) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const userName = (user as { user_metadata?: { name?: string } })?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Admin';
  const userEmail = user?.email || '';
  const initials = userName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const platformSection = {
    key: 'platform',
    ...SECTION_META.platform,
    children: visiblePlatform,
    open: platformOpen,
    setOpen: setPlatformOpen,
    isActive: platformIds.includes(currentPage),
  };

  const businessSegmentSections = [
    {
      key: 'enterprise',
      ...SECTION_META.enterprise,
      children: visibleEnterprise,
      open: enterpriseOpen,
      setOpen: setEnterpriseOpen,
      isActive: enterpriseIds.includes(currentPage),
    },
    {
      key: 'fleet',
      ...SECTION_META.fleet,
      children: visibleFleet,
      open: fleetOpen,
      setOpen: setFleetOpen,
      isActive: fleetIds.includes(currentPage),
    },
    {
      key: 'driver',
      ...SECTION_META.driver,
      children: visibleDriver,
      open: driverOpen,
      setOpen: setDriverOpen,
      isActive: driverIds.includes(currentPage),
    },
    {
      key: 'rides',
      ...SECTION_META.rides,
      children: visibleRides,
      open: ridesOpen,
      setOpen: setRidesOpen,
      isActive: ridesIds.includes(currentPage),
    },
    {
      key: 'haul',
      ...SECTION_META.haul,
      children: visibleHaul,
      open: haulOpen,
      setOpen: setHaulOpen,
      isActive: haulIds.includes(currentPage),
    },
    {
      key: 'dash',
      ...SECTION_META.dash,
      children: visibleDash,
      open: dashOpen,
      setOpen: setDashOpen,
      isActive: dashIds.includes(currentPage),
    },
  ];

  const infraSections: Array<{
    key: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    children: NavChild[];
    open: boolean;
    setOpen: (v: boolean) => void;
    isActive: boolean;
  }> = [
    {
      key: 'fuel',
      label: 'Fuel Management',
      icon: Fuel,
      children: visibleFuel,
      open: fuelOpen,
      setOpen: setFuelOpen,
      isActive: fuelIds.includes(currentPage),
    },
    {
      key: 'toll',
      label: 'Toll Management',
      icon: Activity,
      children: visibleToll,
      open: tollOpen,
      setOpen: setTollOpen,
      isActive: tollIds.includes(currentPage),
    },
    {
      key: 'vehicle',
      label: 'Vehicle Database',
      icon: HardDrive,
      children: visibleVehicleDb,
      open: vehicleDbOpen,
      setOpen: setVehicleDbOpen,
      isActive: vehicleIds.includes(currentPage),
    },
  ];

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-800 flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="bg-amber-500/20 p-2 rounded-lg">
            <Shield className="w-5 h-5 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate">Roam Dominion</h1>
            <p className="text-[11px] text-slate-500 truncate">Platform Admin</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden ml-auto p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'}
                `}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span className="truncate">{item.label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-amber-400/60" />}
              </button>
            );
          })}

          {visiblePlatform.length > 0 && (
            <AdminNavSection
              key={platformSection.key}
              label={platformSection.label}
              icon={platformSection.icon}
              children={platformSection.children}
              currentPage={currentPage}
              open={platformSection.open}
              onToggle={() => platformSection.setOpen(!platformSection.open)}
              onNavigate={handleNav}
              isActive={platformSection.isActive}
            />
          )}

          <AdminNavGroup
            label={SECTION_META.businessSegments.label}
            icon={SECTION_META.businessSegments.icon}
            sections={businessSegmentSections}
            currentPage={currentPage}
            open={businessSegmentsOpen}
            onToggle={() => setBusinessSegmentsOpen(!businessSegmentsOpen)}
            onNavigate={handleNav}
            isActive={businessSegmentIds.includes(currentPage)}
          />

          {infraSections.map((section) => (
            <AdminNavSection
              key={section.key}
              label={section.label}
              icon={section.icon}
              children={section.children}
              currentPage={currentPage}
              open={section.open}
              onToggle={() => section.setOpen(!section.open)}
              onNavigate={handleNav}
              isActive={section.isActive}
            />
          ))}

          {visibleApiCenter.length > 0 && (
            <AdminNavSection
              label="API Command Center"
              icon={Shield}
              children={visibleApiCenter}
              currentPage={currentPage}
              open={apiCenterOpen}
              onToggle={() => setApiCenterOpen(!apiCenterOpen)}
              onNavigate={handleNav}
              isActive={apiIds.includes(currentPage) || currentPage === 'api-center'}
            />
          )}

          {visibleSettings.length > 0 && (
            <AdminNavSection
              label="Platform Settings"
              icon={Shield}
              children={visibleSettings}
              currentPage={currentPage}
              open={settingsOpen}
              onToggle={() => setSettingsOpen(!settingsOpen)}
              onNavigate={handleNav}
              isActive={settingsIds.includes(currentPage) || currentPage === 'settings'}
            />
          )}

          {canViewDbManagement && (
            <button
              type="button"
              onClick={() => handleNav('db-management')}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isDbPage ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'}
              `}
            >
              <Database className="w-4.5 h-4.5 shrink-0" />
              <span className="truncate">{DATABASE_MANAGEMENT_ITEM.label}</span>
              {isDbPage && <ChevronRight className="w-3.5 h-3.5 ml-auto text-amber-400/60" />}
            </button>
          )}
        </nav>

        <div className="border-t border-slate-200 dark:border-slate-800 p-4 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-700 dark:text-amber-300 text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{userName}</p>
              <p className="text-[11px] text-slate-500 truncate">{userEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded font-semibold">
              {resolved === 'platform_support' ? 'Support' : resolved === 'platform_analyst' ? 'Analyst' : 'Super Admin'}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="ml-auto p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white/80 border-b border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 flex items-center px-4 lg:px-6 shrink-0 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{pageTitle(currentPage)}</h2>
          <a href="/" className="ml-auto text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            Back to Fleet Dashboard
          </a>
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
