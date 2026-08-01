import { NavLink, Outlet } from 'react-router-dom';
import {
  Boxes,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Ship,
  Truck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/app/auth/AuthProvider';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/shipments', label: 'Shipments', icon: Ship },
  { to: '/app/carriers', label: 'Carriers', icon: Truck },
  { to: '/app/clients', label: 'Clients', icon: Users },
  { to: '/app/rate-cards', label: 'Rate Cards', icon: FileText },
  { to: '/app/finance', label: 'Finance', icon: Building2 },
  { to: '/app/claims', label: 'Claims', icon: Boxes },
  { to: '/app/settings', label: 'Settings', icon: Settings },
] as const;

export function AppShell() {
  const { user, role, signOut } = useAuth();
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'Enterprise user';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600">
            Roam Enterprise
          </p>
          <p className="mt-1 text-sm font-semibold">Freight Forwarding</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
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
