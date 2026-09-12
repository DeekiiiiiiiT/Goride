import React from 'react';
import { Car, ChevronDown, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../ui/utils';
import { ServiceLineScopeSwitcher } from './ServiceLineScopeSwitcher';
import {
  fleetOpsActive,
  isNavLeafActive,
  navDeskHasActivePage,
  navItemsHaveActivePage,
} from './fleetNavModel';
import { NavNewBadge, useFleetNavModel } from './useFleetNavModel';
import type { NavLeaf } from './nav/types';

type Props = {
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onLogout?: () => void;
};

function TopLink({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative whitespace-nowrap px-2.5 py-2 text-sm font-medium transition-colors',
        active
          ? 'text-slate-900 dark:text-slate-50'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50',
      )}
    >
      {label}
      {active ? (
        <span
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-slate-900 dark:bg-slate-100"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function TopMenu({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-2 text-sm font-medium transition-colors outline-none',
            active
              ? 'text-slate-900 dark:text-slate-50'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50',
          )}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          {active ? (
            <span
              className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-slate-900 dark:bg-slate-100"
              aria-hidden
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LeafItems({
  items,
  currentPage,
  onNavigate,
}: {
  items: NavLeaf[];
  currentPage: string;
  onNavigate: (page: string) => void;
}) {
  return (
    <>
      {items.map((item) => {
        const active = isNavLeafActive(item, currentPage);
        return (
          <DropdownMenuItem
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(active && 'bg-slate-100 font-medium dark:bg-slate-800')}
          >
            <span className="flex-1">{item.label}</span>
            {item.showNewBadge ? <NavNewBadge /> : null}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export function AppTopNav({
  currentPage = 'dashboard',
  onNavigate,
  onLogout,
}: Props) {
  const nav = useFleetNavModel();
  const [fleetName, setFleetName] = React.useState<string | null>(null);

  React.useEffect(() => {
    const stored = localStorage.getItem('roam_fleet_name');
    if (stored) setFleetName(stored);

    const handleUpdate = () => {
      const updated = localStorage.getItem('roam_fleet_name');
      if (updated) setFleetName(updated);
    };

    window.addEventListener('fleetNameUpdated', handleUpdate);
    return () => window.removeEventListener('fleetNameUpdated', handleUpdate);
  }, []);

  const go = (page: string) => onNavigate?.(page);

  const fleetOpsIsActive =
    fleetOpsActive(currentPage) ||
    navDeskHasActivePage(nav.fleetOps.fuel, currentPage) ||
    navDeskHasActivePage(nav.fleetOps.toll, currentPage);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/25">
            <Car className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Roam
            </div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Fleet
            </div>
          </div>
          {fleetName ? (
            <div className="ml-1 hidden max-w-[160px] items-center gap-1.5 truncate rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-indigo-700 xl:flex dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300">
              <span className="truncate text-xs font-medium uppercase tracking-wide">
                {fleetName}
              </span>
            </div>
          ) : null}
        </div>

        <nav
          aria-label="Main navigation"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {nav.dashboard ? (
            <TopLink
              label={String(nav.dashboard.label)}
              active={currentPage === 'dashboard'}
              onClick={() => go('dashboard')}
            />
          ) : null}

          {nav.fleetOps.visible && (nav.fleetOps.fuel || nav.fleetOps.toll) ? (
            <TopMenu label="Fleet Operations" active={fleetOpsIsActive}>
              {nav.fleetOps.fuel ? (
                <>
                  <DropdownMenuLabel>{nav.fleetOps.fuel.label}</DropdownMenuLabel>
                  <LeafItems
                    items={nav.fleetOps.fuel.items}
                    currentPage={currentPage}
                    onNavigate={go}
                  />
                </>
              ) : null}
              {nav.fleetOps.fuel && nav.fleetOps.toll ? <DropdownMenuSeparator /> : null}
              {nav.fleetOps.toll ? (
                <>
                  <DropdownMenuLabel>{nav.fleetOps.toll.label}</DropdownMenuLabel>
                  <LeafItems
                    items={nav.fleetOps.toll.items}
                    currentPage={currentPage}
                    onNavigate={go}
                  />
                </>
              ) : null}
            </TopMenu>
          ) : null}

          {nav.driverOps.visible ? (
            <TopMenu
              label="Driver Operations"
              active={navItemsHaveActivePage(nav.driverOps.items, currentPage)}
            >
              <LeafItems
                items={nav.driverOps.items}
                currentPage={currentPage}
                onNavigate={go}
              />
            </TopMenu>
          ) : null}

          {nav.money.visible ? (
            <TopMenu
              label="Money"
              active={navItemsHaveActivePage(nav.money.items, currentPage)}
            >
              <LeafItems
                items={nav.money.items}
                currentPage={currentPage}
                onNavigate={go}
              />
            </TopMenu>
          ) : null}

          {nav.vehicleOps.visible ? (
            <TopMenu
              label="Vehicle Operations"
              active={navItemsHaveActivePage(nav.vehicleOps.items, currentPage)}
            >
              <LeafItems
                items={nav.vehicleOps.items}
                currentPage={currentPage}
                onNavigate={go}
              />
            </TopMenu>
          ) : null}

          {nav.courierOps.visible ? (
            <TopMenu
              label="Delivery Operations"
              active={navItemsHaveActivePage(nav.courierOps.items, currentPage)}
            >
              <LeafItems
                items={nav.courierOps.items}
                currentPage={currentPage}
                onNavigate={go}
              />
            </TopMenu>
          ) : null}

          {nav.analytics.visible ? (
            <TopMenu
              label="Analytics"
              active={navItemsHaveActivePage(nav.analytics.items, currentPage)}
            >
              <LeafItems
                items={nav.analytics.items}
                currentPage={currentPage}
                onNavigate={go}
              />
            </TopMenu>
          ) : null}

          {nav.reports ? (
            <TopLink
              label={String(nav.reports.label)}
              active={currentPage === 'reports'}
              onClick={() => go('reports')}
            />
          ) : null}

          {nav.businessFinance.visible ? (
            <TopMenu
              label="Business Finance"
              active={navItemsHaveActivePage(nav.businessFinance.items, currentPage)}
            >
              <LeafItems
                items={nav.businessFinance.items}
                currentPage={currentPage}
                onNavigate={go}
              />
            </TopMenu>
          ) : null}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ServiceLineScopeSwitcher />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 gap-2 rounded-full px-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Account menu"
              >
                <Avatar className="h-8 w-8 ring-2 ring-slate-100 dark:ring-slate-800">
                  <AvatarImage src="https://images.unsplash.com/photo-1701463387028-3947648f1337?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBwcm9maWxlJTIwcGhvdG8lMjBhdmF0YXJ8ZW58MXx8fHwxNzY5MTM2NTYzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" />
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    John Doe
                  </span>
                  <span className="text-xs text-slate-500">Fleet Manager</span>
                </div>
              </DropdownMenuLabel>
              {nav.system.visible ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>System</DropdownMenuLabel>
                  <LeafItems
                    items={nav.system.items}
                    currentPage={currentPage}
                    onNavigate={go}
                  />
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-700"
                onClick={() => onLogout?.()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
