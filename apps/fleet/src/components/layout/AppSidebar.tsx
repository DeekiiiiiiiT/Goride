import { useEffect, useState } from 'react';
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
import { fleetOpsActive } from './fleetNavModel';
import { useFleetNavModel, withNavBadge } from './useFleetNavModel';

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
  const { isMobile, setOpenMobile } = useSidebar();

  const [openSection, setOpenSection] = useState<SectionId | null>(() =>
    fleetOpsActive(currentPage) ? 'fleet-ops' : null,
  );
  const [openFlyout, setOpenFlyout] = useState<FlyoutId | null>(null);

  useEffect(() => {
    if (fleetOpsActive(currentPage)) setOpenSection('fleet-ops');
  }, [currentPage]);

  useEffect(() => {
    setOpenFlyout(null);
  }, [currentPage]);

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

  return (
    <Sidebar className="border-r border-slate-200/80 dark:border-slate-800">
      <SidebarHeader className="h-16 border-b border-slate-100 px-4 dark:border-slate-800">
        <div className="flex h-full items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/25">
            <Car className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Roam
            </div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Fleet
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
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
            <Separator className="my-4 opacity-60" />
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              System
            </div>
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

      <SidebarFooter className="border-t border-slate-100 p-3 dark:border-slate-800">
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
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
