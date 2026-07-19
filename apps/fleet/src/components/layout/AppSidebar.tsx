import React from 'react';
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
import { Badge } from '../ui/badge';
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
} from 'lucide-react';
import { useVocab } from '../../utils/vocabulary';
import { isSidebarItemVisible } from '../../utils/businessTypes';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatureFlags } from '../auth/FeatureFlagContext';
import { NavItem } from './nav/NavItem';
import { NavSection } from './nav/NavSection';
import { NavFlyout } from './nav/NavFlyout';
import type { NavLeaf } from './nav/types';

type SectionId = 'fleet-ops';
type FlyoutId = 'fuel' | 'toll' | 'driver-ops' | 'vehicle-ops' | 'business-finance';

const FUEL_PAGE_IDS = [
  'fuel-management',
  'fuel-overview',
  'fuel-reconciliation',
  'fuel-cards',
  'fuel-logs',
  'fuel-configuration',
  'fuel-reimbursements',
  'fuel-integrity-gap',
];
const TOLL_PAGE_IDS = ['toll-logs', 'toll-tags', 'tag-inventory', 'toll-analytics'];

function fleetOpsActive(page: string) {
  return [...FUEL_PAGE_IDS, ...TOLL_PAGE_IDS].includes(page);
}

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
  const { v, businessType } = useVocab();
  const { canView } = usePermissions();
  const { isModuleEnabled } = useFeatureFlags();
  const { isMobile, setOpenMobile } = useSidebar();

  const canSeeFuelDesk =
    isModuleEnabled('fuelManagement') &&
    (canView('fuel-overview') ||
      canView('fuel-reimbursements') ||
      canView('fuel-integrity-gap') ||
      canView('fuel-reconciliation') ||
      canView('fuel-cards') ||
      canView('fuel-logs') ||
      canView('fuel-configuration'));
  const canSeeTollDesk =
    isModuleEnabled('tollManagement') &&
    isSidebarItemVisible('toll-management', businessType) &&
    (canView('toll-logs') ||
      canView('toll-tags') ||
      canView('tag-inventory') ||
      canView('toll-analytics'));
  const canSeeBusinessFinanceHome =
    isModuleEnabled('businessFinance') && canView('business-finance');
  const canSeeBusinessFinanceNav =
    canSeeBusinessFinanceHome ||
    canView('fleet-financials') ||
    canView('cash-retag') ||
    canView('indrive-wallet') ||
    canView('transaction-list');
  const canSeeFleetOps = canSeeFuelDesk || canSeeTollDesk;
  const canSeeDriverOps = canView('drivers') || canView('earnings-policy');
  const canSeeVehicleOps =
    canView('vehicles') || canView('maintenance-hub') || canView('fleet');
  const canSeeSystem = canView('user-management') || canView('settings');

  // Accordion only for Fleet Ops (has mid-level Fuel/Toll desks)
  const [openSection, setOpenSection] = React.useState<SectionId | null>(() =>
    fleetOpsActive(currentPage) ? 'fleet-ops' : null,
  );
  // Single-open horizontal fly-out across the whole nav
  const [openFlyout, setOpenFlyout] = React.useState<FlyoutId | null>(null);

  React.useEffect(() => {
    if (fleetOpsActive(currentPage)) setOpenSection('fleet-ops');
  }, [currentPage]);

  React.useEffect(() => {
    setOpenFlyout(null);
  }, [currentPage]);

  const handleSectionChange = (id: SectionId, nextOpen: boolean) => {
    setOpenSection(nextOpen ? id : null);
    setOpenFlyout(null);
  };

  const handleFlyoutChange = (id: FlyoutId, nextOpen: boolean) => {
    setOpenFlyout(nextOpen ? id : null);
    // Opening a top-level fly-out collapses Fleet Ops accordion
    if (nextOpen && (id === 'driver-ops' || id === 'vehicle-ops' || id === 'business-finance')) {
      setOpenSection(null);
    }
  };

  const navigate = (page: string) => {
    onNavigate?.(page);
    setOpenFlyout(null);
    if (isMobile) setOpenMobile(false);
  };

  const fuelItems: NavLeaf[] = [
    canView('fuel-overview') && {
      id: 'fuel-overview',
      label: 'Overview',
      activeIds: ['fuel-management'],
    },
    canView('fuel-reimbursements') && {
      id: 'fuel-reimbursements',
      label: 'Review Queue',
    },
    canView('fuel-integrity-gap') && {
      id: 'fuel-integrity-gap',
      label: 'Integrity Gap',
      badge: (
        <Badge className="h-4 border-none bg-emerald-500 px-1 text-[8px] text-white">
          PRO
        </Badge>
      ),
    },
    canView('fuel-reconciliation') && {
      id: 'fuel-reconciliation',
      label: 'Consumption Reconciliation',
    },
    canView('fuel-cards') && { id: 'fuel-cards', label: 'Fuel Cards' },
    canView('fuel-logs') && { id: 'fuel-logs', label: 'Transaction Logs' },
    canView('fuel-configuration') && {
      id: 'fuel-configuration',
      label: 'Configuration',
    },
  ].filter(Boolean) as NavLeaf[];

  const tollItems: NavLeaf[] = [
    canView('toll-logs') && { id: 'toll-logs', label: 'Toll Logs' },
    canView('toll-tags') && { id: 'toll-tags', label: 'Toll Reconciliation' },
    canView('tag-inventory') && { id: 'tag-inventory', label: 'Tag Inventory' },
    canView('toll-analytics') && {
      id: 'toll-analytics',
      label: 'Toll Analytics',
      badge: (
        <Badge className="h-4 border-none bg-indigo-500 px-1 text-[8px] text-white">
          New
        </Badge>
      ),
    },
  ].filter(Boolean) as NavLeaf[];

  const driverItems: NavLeaf[] = [
    canView('drivers') && { id: 'drivers', label: v('drivers') },
    isSidebarItemVisible('earnings-policy', businessType) &&
      canView('earnings-policy') && {
        id: 'earnings-policy',
        label: 'Earnings Policy Configuration',
      },
    canView('drivers') && { id: 'driver-ledger', label: 'Driver Ledger' },
  ].filter(Boolean) as NavLeaf[];

  const vehicleItems: NavLeaf[] = [
    canView('vehicles') && { id: 'vehicles', label: v('vehiclesPageTitle') },
    canView('maintenance-hub') && {
      id: 'maintenance-hub',
      label: 'Maintenance',
    },
    canView('fleet') && { id: 'fleet', label: 'Inventory & Asset Management' },
  ].filter(Boolean) as NavLeaf[];

  const financeItems: NavLeaf[] = [
    canSeeBusinessFinanceHome && { id: 'business-finance', label: 'Home' },
    canView('fleet-financials') && {
      id: 'fleet-financials',
      label: 'Bank Deposits',
    },
    canView('cash-retag') && { id: 'cash-retag', label: 'Cash Retag' },
    canView('indrive-wallet') && {
      id: 'indrive-wallet',
      label: 'InDrive Wallet',
    },
    canView('transaction-list') && {
      id: 'transaction-list',
      label: 'Transaction List',
    },
  ].filter(Boolean) as NavLeaf[];

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
            {canView('dashboard') && (
              <NavItem
                icon={<LayoutDashboard className="h-4 w-4" />}
                label={v('dashboardTitle')}
                active={currentPage === 'dashboard'}
                onClick={() => navigate('dashboard')}
              />
            )}
            {canView('imports') && (
              <NavItem
                icon={<UploadCloud className="h-4 w-4" />}
                label="Data Center"
                active={currentPage === 'imports'}
                onClick={() => navigate('imports')}
              />
            )}

            {canSeeFleetOps && (
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
                  {canSeeFuelDesk && fuelItems.length > 0 && (
                    <NavFlyout
                      id="fuel"
                      label="Fuel Management"
                      icon={<Fuel className="h-4 w-4" />}
                      items={fuelItems}
                      currentPage={currentPage}
                      open={openFlyout === 'fuel'}
                      onOpenChange={(next) => handleFlyoutChange('fuel', next)}
                      onNavigate={navigate}
                      nested
                    />
                  )}
                  {canSeeTollDesk && tollItems.length > 0 && (
                    <NavFlyout
                      id="toll"
                      label="Toll Management"
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

            {canSeeDriverOps && driverItems.length > 0 && (
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

            {canSeeVehicleOps && vehicleItems.length > 0 && (
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

            {canView('trips') && (
              <NavItem
                icon={<FileText className="h-4 w-4" />}
                label={v('sidebarTrips')}
                active={currentPage === 'trips'}
                onClick={() => navigate('trips')}
              />
            )}
            {canView('reports') && (
              <NavItem
                icon={<BarChart3 className="h-4 w-4" />}
                label="Reports"
                active={currentPage === 'reports'}
                onClick={() => navigate('reports')}
              />
            )}

            {canSeeBusinessFinanceNav && financeItems.length > 0 && (
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

        {canSeeSystem && (
          <>
            <Separator className="my-4 opacity-60" />
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              System
            </div>
            <nav aria-label="System">
              <SidebarMenu className="gap-0.5">
                {canView('user-management') && (
                  <NavItem
                    icon={<UserCog className="h-4 w-4" />}
                    label="User Management"
                    active={currentPage === 'user-management'}
                    onClick={() => navigate('user-management')}
                  />
                )}
                {canView('settings') && (
                  <NavItem
                    icon={<Settings className="h-4 w-4" />}
                    label="Settings"
                    active={currentPage === 'settings'}
                    onClick={() => navigate('settings')}
                  />
                )}
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
