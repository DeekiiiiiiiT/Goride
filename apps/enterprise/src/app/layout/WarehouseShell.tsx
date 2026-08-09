import { Link, NavLink, Navigate, Outlet } from 'react-router-dom';
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
} from 'lucide-react';
import { useAuth } from '@/app/auth/AuthProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import {
  canAccessWarehouseVertical,
} from '@/app/verticals/enterpriseHome';

const NAV = [
  { to: '/warehouse', label: 'Inbound', icon: LayoutDashboard, end: true },
  { to: '/warehouse/receive', label: 'Receive Station', icon: ClipboardList },
  { to: '/warehouse/facilities', label: 'Facilities', icon: Building2 },
  { to: '/warehouse/packages', label: 'Packages', icon: Package },
] as const;

/** Thin Warehouse vertical shell — receive + handoff only. */
export function WarehouseShell() {
  const { user, role, signOut } = useAuth();
  const { seatRole } = useSeatAccess();

  if (!canAccessWarehouseVertical(seatRole)) {
    return <Navigate to="/app" replace />;
  }

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    'Warehouse user';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="relative z-40 flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600">
            Roam Enterprise
          </p>
          <p className="mt-1 text-sm font-semibold">Warehouse</p>
          <p className="mt-0.5 text-xs text-slate-500">Intake &amp; handoff</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-amber-50 text-amber-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
          <p className="truncate text-xs text-slate-500">{role || 'member'}</p>
          {seatRole !== 'enterprise_warehouse' && (
            <Link
              to="/app"
              className="mt-2 block text-xs font-semibold text-amber-800 underline-offset-2 hover:underline"
            >
              Open Courier app
            </Link>
          )}
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
        <div className="mx-auto max-w-5xl p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
