import { NavLink, Outlet } from 'react-router-dom';
import {
  Boxes,
  Building2,
  Car,
  FileText,
  Fuel,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Settings,
  Ship,
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
      { to: '/app/carriers', label: 'Carriers', icon: Truck, module: 'carriers' },
      { to: '/app/clients', label: 'Clients', icon: Users, module: 'clients' },
      { to: '/app/rate-cards', label: 'Rate Cards', icon: FileText, module: 'rateCards' },
    ],
  },
  {
    label: 'Fleet Ops',
    items: [
      { to: '/app/fuel', label: 'Fuel', icon: Fuel, module: 'fuelManagement' },
      { to: '/app/toll', label: 'Toll', icon: MapPin, module: 'tollManagement' },
      { to: '/app/drivers', label: 'Drivers', icon: Car, module: 'drivers' },
      { to: '/app/vehicles', label: 'Vehicles', icon: Truck, module: 'vehicles' },
      { to: '/app/maintenance', label: 'Maintenance', icon: Wrench, module: 'vehicles' },
      { to: '/app/equipment', label: 'Equipment', icon: Package, module: 'fleetEquipment' },
      { to: '/app/trips', label: 'Trips', icon: Route, module: 'trips' },
      { to: '/app/data-center', label: 'Data Center', icon: Database, module: 'dataCenter' },
      { to: '/app/reports', label: 'Reports', icon: BarChart3, module: 'reports' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/app/finance', label: 'Business Finance', icon: Building2, module: 'businessFinance' },
      { to: '/app/claims', label: 'Claims', icon: Boxes, module: 'claimableLoss' },
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
              const items = group.items.filter(
                (item) => !item.module || isModuleEnabled(item.module),
              );
              if (!items.length) return null;
              return (
                <div key={group.label}>
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {items.map(({ to, label, icon: Icon, end }) => (
                      <NavLink
                        key={to}
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
