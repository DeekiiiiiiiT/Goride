import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Boxes,
  Building2,
  Car,
  CreditCard,
  ClipboardList,
  FileText,
  Fuel,
  LayoutDashboard,
  LineChart,
  LogOut,
  MapPin,
  Package,
  Settings,
  Ship,
  Tags,
  Truck,
  Users,
  Wrench,
  BarChart3,
  Database,
  Route,
} from 'lucide-react';
import type { ModuleKey } from '@roam/platform-settings';
import { useAuth } from '@/app/auth/AuthProvider';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: ModuleKey;
  end?: boolean;
  children?: NavItem[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Freight',
    items: [
      { to: '/app/shipments', label: 'Shipments', icon: Ship, module: 'shipments' },
      { to: '/app/suites', label: 'Suites', icon: Tags, module: 'suites' },
      { to: '/app/packages', label: 'Packages', icon: Package, module: 'mailboxPackages' },
      { to: '/app/miami-scan', label: 'Miami Scan', icon: ClipboardList, module: 'miamiScan' },
      { to: '/app/manifests', label: 'Manifests', icon: Boxes, module: 'manifests' },
      { to: '/app/customs', label: 'Customs', icon: FileText, module: 'customsBoard' },
      { to: '/app/hub', label: 'Hub Station', icon: MapPin, module: 'hubStation' },
      { to: '/app/fulfillment', label: 'Fulfillment', icon: Route, module: 'fulfillmentDesk' },
      { to: '/app/client-fleet', label: 'Client Fleet', icon: Car, module: 'clientFleet' },
      { to: '/app/carriers', label: 'Carriers', icon: Truck, module: 'carriers' },
      { to: '/app/clients', label: 'Clients', icon: Users, module: 'clients' },
      { to: '/app/rate-cards', label: 'Rate Cards', icon: FileText, module: 'rateCards' },
    ],
  },
  {
    label: 'Fleet Ops',
    items: [
      {
        to: '/app/fuel',
        label: 'Fuel',
        icon: Fuel,
        module: 'fuelManagement',
        children: [
          { to: '/app/fuel/analytics', label: 'Fuel Analytics', icon: LineChart },
          { to: '/app/fuel/review-queue', label: 'Review Queue', icon: ClipboardList },
          { to: '/app/fuel/cards', label: 'Fuel Cards', icon: CreditCard },
          { to: '/app/fuel/logs', label: 'Transaction Logs', icon: FileText },
        ],
      },
      {
        to: '/app/toll',
        label: 'Toll',
        icon: MapPin,
        children: [
          { to: '/app/toll/logs', label: 'Toll Logs', icon: FileText, module: 'tollManagement' },
          {
            to: '/app/toll/tag-inventory',
            label: 'Tag Inventory',
            icon: Tags,
            module: 'tollManagement',
          },
          {
            to: '/app/toll/analytics',
            label: 'Toll Analytics',
            icon: LineChart,
            module: 'tollManagement',
          },
          { to: '/app/toll/claims', label: 'Claims', icon: Boxes, module: 'claimableLoss' },
        ],
      },
      {
        to: '/app/drivers',
        label: 'Drivers',
        icon: Car,
        module: 'drivers',
        children: [
          { to: '/app/drivers/list', label: 'Drivers', icon: Car },
          { to: '/app/drivers/analytics', label: 'Driver Analytics', icon: LineChart },
        ],
      },
      {
        to: '/app/vehicles',
        label: 'Vehicles',
        icon: Truck,
        children: [
          { to: '/app/vehicles/list', label: 'Fleet Vehicles', icon: Truck, module: 'vehicles' },
          {
            to: '/app/vehicles/analytics',
            label: 'Vehicle Analytics',
            icon: LineChart,
            module: 'vehicles',
          },
          {
            to: '/app/vehicles/maintenance',
            label: 'Maintenance',
            icon: Wrench,
            module: 'vehicles',
          },
          {
            to: '/app/vehicles/inventory',
            label: 'Inventory & Asset Management',
            icon: Package,
            module: 'fleetEquipment',
          },
        ],
      },
      { to: '/app/trips', label: 'Trips', icon: Route, module: 'trips' },
      { to: '/app/data-center', label: 'Data Center', icon: Database, module: 'dataCenter' },
      { to: '/app/reports', label: 'Reports', icon: BarChart3, module: 'reports' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/app/finance', label: 'Business Finance', icon: Building2, module: 'businessFinance' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/app/team', label: 'Team', icon: Users, module: 'teamManagement' },
      { to: '/app/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function NavItemLink({ item }: { item: NavItem }) {
  const location = useLocation();
  const { isModuleEnabled } = useModuleAccess();
  const { to, label, icon: Icon, end, children } = item;
  const visibleChildren = (children ?? []).filter(
    (c) => !c.module || isModuleEnabled(c.module),
  );
  const childActive = Boolean(
    visibleChildren.some(
      (c) => location.pathname === c.to || location.pathname.startsWith(`${c.to}/`),
    ),
  );
  const sectionActive =
    location.pathname === to || location.pathname.startsWith(`${to}/`) || childActive;

  if (visibleChildren.length) {
    return (
      <div className="space-y-0.5">
        <div
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
            sectionActive ? 'bg-amber-50 text-amber-900' : 'text-slate-600'
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {label}
        </div>
        <div className="ml-3 space-y-0.5 border-l border-slate-200 pl-2">
          {visibleChildren.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              end={Boolean(child.end)}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? 'bg-amber-50 text-amber-900'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <child.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {child.label}
            </NavLink>
          ))}
        </div>
      </div>
    );
  }

  if (children?.length) return null;

  return (
    <NavLink
      to={to}
      end={Boolean(end)}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive
            ? 'bg-amber-50 text-amber-900'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </NavLink>
  );
}

export function AppShell() {
  const { user, role, signOut } = useAuth();
  const { isModuleEnabled, loading } = useModuleAccess();
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    'Enterprise user';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600">
            Roam Enterprise
          </p>
          <p className="mt-1 text-sm font-semibold">Operations</p>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {loading ? (
            <p className="px-3 text-xs text-slate-400">Loading modules…</p>
          ) : (
            NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) => {
                if (item.children?.length) {
                  return item.children.some((c) => !c.module || isModuleEnabled(c.module));
                }
                return !item.module || isModuleEnabled(item.module);
              });
              if (!items.length) return null;
              return (
                <div key={group.label}>
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavItemLink key={item.to} item={item} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
          <p className="truncate text-xs text-slate-500">{role || 'member'}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
