import { useEffect, useRef, useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  useSidebar,
} from '../ui/sidebar';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Separator } from '../ui/separator';
import {
  LayoutDashboard,
  Users,
  Car,
  FileText,
  Settings,
  LogOut,
  BarChart3,
  UploadCloud,
  Receipt,
  UserCog,
  Fuel,
  Landmark,
  CarFront,
  FolderKanban,
  Package,
  Wallet,
} from 'lucide-react';
import { NavItem } from './nav/NavItem';
import { NavSection } from './nav/NavSection';
import { NavFlyout } from './nav/NavFlyout';
import { MobileNavFlyoutPanel } from './nav/MobileNavFlyoutPanel';
import { fleetOpsActive } from './fleetNavModel';
import { useFleetNavModel, withNavBadge } from './useFleetNavModel';
import { cn } from '../ui/utils';
import type { NavLeaf } from './nav/types';

type SectionId = 'fleet-ops';
type FlyoutId =
  | 'fuel'
  | 'toll'
  | 'driver-ops'
  | 'vehicle-ops'
  | 'business-finance'
  | 'courier-ops'
  | 'analytics'
  | 'money';

type AppSidebarProps = {
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onLogout?: () => void;
};

export function AppSidebar({
  currentPage = 'dashboard',
  onNavigate,
  onLogout,
}: AppSidebarProps) {
  const nav = useFleetNavModel();
  const { isMobile, openMobile, setOpenMobile, setMobileNavPush } = useSidebar();

  const [openSection, setOpenSection] = useState<SectionId | null>(() =>
    fleetOpsActive(currentPage) ? 'fleet-ops' : null,
  );
  const [openFlyout, setOpenFlyout] = useState<FlyoutId | null>(null);

  useEffect(() => {
    if (fleetOpsActive(currentPage)) setOpenSection('fleet-ops');
  }, [currentPage]);

  // Desktop: clear fly-outs on route change. Phone: keep main menu until user opens a group.
  useEffect(() => {
    if (!isMobile) setOpenFlyout(null);
  }, [currentPage, isMobile]);

  // Closing the drawer always returns to the main menu for the next open.
  useEffect(() => {
    if (isMobile && !openMobile) setOpenFlyout(null);
  }, [isMobile, openMobile]);

  // Drive transparent sheet shell while a fly-out is open.
  useEffect(() => {
    setMobileNavPush(Boolean(isMobile && openFlyout));
    return () => setMobileNavPush(false);
  }, [isMobile, openFlyout, setMobileNavPush]);

  const handleSectionChange = (id: SectionId, nextOpen: boolean) => {
    setOpenSection(nextOpen ? id : null);
    setOpenFlyout(null);
  };

  const handleFlyoutChange = (id: FlyoutId, nextOpen: boolean) => {
    setOpenFlyout(nextOpen ? id : null);
    if (
      nextOpen &&
      (id === 'driver-ops' ||
        id === 'vehicle-ops' ||
        id === 'business-finance' ||
        id === 'courier-ops' ||
        id === 'analytics' ||
        id === 'money')
    ) {
      setOpenSection(null);
    }
  };

  const navigate = (page: string) => {
    onNavigate?.(page);
    setOpenFlyout(null);
    if (isMobile) setOpenMobile(false);
  };

  const fuelItems = (nav.fleetOps.fuel?.items ?? []).map(withNavBadge);
  const tollItems = (nav.fleetOps.toll?.items ?? []).map(withNavBadge);
  const driverItems = nav.driverOps.items.map(withNavBadge);
  const vehicleItems = nav.vehicleOps.items.map(withNavBadge);
  const courierItems = nav.courierOps.items.map(withNavBadge);
  const analyticsItems = nav.analytics.items.map(withNavBadge);
  const financeItems = nav.businessFinance.items.map(withNavBadge);
  const moneyItems = nav.money.items.map(withNavBadge);
  const systemItems = nav.system.items.map(withNavBadge);

  const flyoutPanels: Record<
    FlyoutId,
    { title: string; items: NavLeaf[] } | null
  > = {
    fuel: nav.fleetOps.fuel
      ? { title: String(nav.fleetOps.fuel.label), items: fuelItems }
      : null,
    toll: nav.fleetOps.toll
      ? { title: String(nav.fleetOps.toll.label), items: tollItems }
      : null,
    'driver-ops': { title: 'Driver Operations', items: driverItems },
    money: { title: 'Money', items: moneyItems },
    'vehicle-ops': { title: 'Vehicle Operations', items: vehicleItems },
    'courier-ops': { title: 'Delivery Operations', items: courierItems },
    analytics: { title: 'Analytics', items: analyticsItems },
    'business-finance': { title: 'Business Finance', items: financeItems },
  };

  const activeFlyout = openFlyout ? flyoutPanels[openFlyout] : null;
  const pushOpen = Boolean(isMobile && openFlyout && activeFlyout);
  const flyoutPanelRef = useRef(activeFlyout);
  if (activeFlyout) flyoutPanelRef.current = activeFlyout;
  const panelForMobile = activeFlyout ?? flyoutPanelRef.current;

  return (
    <Sidebar className="border-r border-slate-200/80 dark:border-slate-800">
      <div className="relative flex h-full min-h-0 w-full flex-1 overflow-visible">
        <div
          className={cn(
            'pointer-events-auto flex h-full min-h-0 flex-col bg-sidebar transition-[width,box-shadow] duration-300 ease-out',
            pushOpen
              ? 'w-16 border-r border-slate-200/80 shadow-md dark:border-slate-800'
              : 'w-full',
          )}
        >
          <SidebarHeader
            className={cn(
              'border-b border-slate-100 dark:border-slate-800',
              pushOpen ? 'h-14 px-0' : 'h-16 px-4',
            )}
          >
            <div
              className={cn(
                'flex h-full items-center gap-2.5',
                pushOpen && 'justify-center',
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/25">
                <Car className="h-4 w-4" aria-hidden />
              </div>
              {!pushOpen && (
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                    Roam
                  </div>
                  <div className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Fleet
                  </div>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className={cn('py-3', pushOpen ? 'px-1.5' : 'px-2')}>
            <nav aria-label="Main navigation">
              <SidebarMenu className="gap-0.5">
                {nav.dashboard && (
                  <NavItem
                    icon={<LayoutDashboard className="h-4 w-4" />}
                    label={String(nav.dashboard.label)}
                    active={currentPage === 'dashboard'}
                    onClick={() => navigate('dashboard')}
                  />
                )}

                {nav.fleetOps.visible && (nav.fleetOps.fuel || nav.fleetOps.toll) && (
                  <NavSection
                    id="fleet-ops"
                    label="Fleet Operations"
                    icon={<FolderKanban className="h-4 w-4" />}
                    open={openSection === 'fleet-ops'}
                    onOpenChange={(next) => handleSectionChange('fleet-ops', next)}
                    currentPage={currentPage}
                    onNavigate={navigate}
                    forceActive={fleetOpsActive(currentPage)}
                  >
                    <div className="mt-0.5 ml-3 space-y-0.5 border-l border-slate-200/70 pl-1 dark:border-slate-700">
                      {nav.fleetOps.fuel && (
                        <NavFlyout
                          id="fuel"
                          label={nav.fleetOps.fuel.label}
                          icon={<Fuel className="h-4 w-4" />}
                          items={fuelItems}
                          currentPage={currentPage}
                          open={openFlyout === 'fuel'}
                          onOpenChange={(next) => handleFlyoutChange('fuel', next)}
                          onNavigate={navigate}
                          nested
                        />
                      )}
                      {nav.fleetOps.toll && (
                        <NavFlyout
                          id="toll"
                          label={nav.fleetOps.toll.label}
                          icon={<Receipt className="h-4 w-4" />}
                          items={tollItems}
                          currentPage={currentPage}
                          open={openFlyout === 'toll'}
                          onOpenChange={(next) => handleFlyoutChange('toll', next)}
                          onNavigate={navigate}
                          nested
                        />
                      )}
                    </div>
                  </NavSection>
                )}

                {nav.driverOps.visible && (
                  <NavFlyout
                    id="driver-ops"
                    label="Driver Operations"
                    icon={<Users className="h-4 w-4" />}
                    items={driverItems}
                    currentPage={currentPage}
                    open={openFlyout === 'driver-ops'}
                    onOpenChange={(next) => handleFlyoutChange('driver-ops', next)}
                    onNavigate={navigate}
                  />
                )}

                {nav.money.visible && (
                  <NavFlyout
                    id="money"
                    label="Money"
                    icon={<Wallet className="h-4 w-4" />}
                    items={moneyItems}
                    currentPage={currentPage}
                    open={openFlyout === 'money'}
                    onOpenChange={(next) => handleFlyoutChange('money', next)}
                    onNavigate={navigate}
                  />
                )}

                {nav.vehicleOps.visible && (
                  <NavFlyout
                    id="vehicle-ops"
                    label="Vehicle Operations"
                    icon={<CarFront className="h-4 w-4" />}
                    items={vehicleItems}
                    currentPage={currentPage}
                    open={openFlyout === 'vehicle-ops'}
                    onOpenChange={(next) => handleFlyoutChange('vehicle-ops', next)}
                    onNavigate={navigate}
                  />
                )}

                {nav.courierOps.visible && (
                  <NavFlyout
                    id="courier-ops"
                    label="Delivery Operations"
                    icon={<Package className="h-4 w-4" />}
                    items={courierItems}
                    currentPage={currentPage}
                    open={openFlyout === 'courier-ops'}
                    onOpenChange={(next) => handleFlyoutChange('courier-ops', next)}
                    onNavigate={navigate}
                  />
                )}

                {nav.analytics.visible && (
                  <NavFlyout
                    id="analytics"
                    label="Analytics"
                    icon={<BarChart3 className="h-4 w-4" />}
                    items={analyticsItems}
                    currentPage={currentPage}
                    open={openFlyout === 'analytics'}
                    onOpenChange={(next) => handleFlyoutChange('analytics', next)}
                    onNavigate={navigate}
                  />
                )}

                {nav.reports && (
                  <NavItem
                    icon={<FileText className="h-4 w-4" />}
                    label={String(nav.reports.label)}
                    active={currentPage === 'reports'}
                    onClick={() => navigate('reports')}
                  />
                )}

                {nav.businessFinance.visible && (
                  <NavFlyout
                    id="business-finance"
                    label="Business Finance"
                    icon={<Landmark className="h-4 w-4" />}
                    items={financeItems}
                    currentPage={currentPage}
                    open={openFlyout === 'business-finance'}
                    onOpenChange={(next) =>
                      handleFlyoutChange('business-finance', next)
                    }
                    onNavigate={navigate}
                  />
                )}
              </SidebarMenu>
            </nav>

            {nav.system.visible && (
              <>
                <Separator className={cn('opacity-60', pushOpen ? 'my-2' : 'my-4')} />
                {!pushOpen && (
                  <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    System
                  </div>
                )}
                <nav aria-label="System">
                  <SidebarMenu className="gap-0.5">
                    {systemItems.map((item) => {
                      const icon =
                        item.id === 'user-management' ? (
                          <UserCog className="h-4 w-4" />
                        ) : item.id === 'settings' ? (
                          <Settings className="h-4 w-4" />
                        ) : (
                          <UploadCloud className="h-4 w-4" />
                        );
                      return (
                        <NavItem
                          key={item.id}
                          icon={icon}
                          label={String(item.label)}
                          active={currentPage === item.id}
                          onClick={() => navigate(item.id)}
                        />
                      );
                    })}
                  </SidebarMenu>
                </nav>
              </>
            )}
          </SidebarContent>

          <SidebarFooter
            className={cn(
              'border-t border-slate-100 dark:border-slate-800',
              pushOpen ? 'p-1.5' : 'p-3',
            )}
          >
            {pushOpen ? (
              <div className="flex flex-col items-center gap-1">
                <Avatar className="h-8 w-8 ring-2 ring-slate-100 dark:ring-slate-800">
                  <AvatarImage src="https://images.unsplash.com/photo-1701463387028-3947648f1337?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBwcm9maWxlJTIwcGhvdG8lMjBhdmF0YXJ8ZW58MXx8fHwxNzY5MTM2NTYzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" />
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                  onClick={onLogout}
                  title="Log out"
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg px-1 py-0.5">
                <Avatar className="h-9 w-9 ring-2 ring-slate-100 dark:ring-slate-800">
                  <AvatarImage src="https://images.unsplash.com/photo-1701463387028-3947648f1337?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBwcm9maWxlJTIwcGhvdG8lMjBhdmF0YXJ8ZW58MXx8fHwxNzY5MTM2NTYzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" />
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    John Doe
                  </span>
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                    Fleet Manager
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                  onClick={onLogout}
                  title="Log out"
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </SidebarFooter>
        </div>

        {isMobile && panelForMobile && (
          <MobileNavFlyoutPanel
            open={pushOpen}
            title={panelForMobile.title}
            items={panelForMobile.items}
            currentPage={currentPage}
            onBack={() => setOpenFlyout(null)}
            onNavigate={navigate}
          />
        )}
      </div>
      <SidebarRail />
    </Sidebar>
  );
}
