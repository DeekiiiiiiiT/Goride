import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Link2,
  LogOut,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '@/app/auth/AuthProvider';
import { useFacilities } from '@/app/hooks/useFreight';
import { FREIGHT_FORWARDER_PATH, navigateDoorHref, urlForDoor } from '@/app/productDoor';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import {
  canAccessCourierVertical,
  canAccessWarehouseVertical,
} from '@/app/verticals/enterpriseHome';
import { FF_SETUP, isFfHome, useSafeBack } from '@/app/layout/ffNavigation';

const NAV = [
  { to: FREIGHT_FORWARDER_PATH, label: 'Inbound', icon: LayoutDashboard, end: true },
  { to: `${FREIGHT_FORWARDER_PATH}/receive`, label: 'Receive Station', icon: ClipboardList },
  { to: `${FREIGHT_FORWARDER_PATH}/facilities`, label: 'Facilities', icon: Building2 },
  { to: `${FREIGHT_FORWARDER_PATH}/partners`, label: 'Courier partners', icon: Link2 },
  { to: `${FREIGHT_FORWARDER_PATH}/billing`, label: 'Billing', icon: CreditCard },
  { to: FF_SETUP, label: 'Setup', icon: SlidersHorizontal },
  { to: `${FREIGHT_FORWARDER_PATH}/team`, label: 'Team', icon: Users },
] as const;

/** Freight Forwarder product shell — floors, partners, storage. */
export function WarehouseShell() {
  const { user, role, signOut, businessType, subscribedProducts } = useAuth();
  const { seatRole } = useSeatAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const { back, label: backLabel } = useSafeBack();
  const facilities = useFacilities('warehouse');
  const hasBuilding = (facilities.data?.facilities ?? []).length > 0;
  const onSetup = location.pathname === FF_SETUP || location.pathname.startsWith(`${FF_SETUP}/`);
  const showBack = hasBuilding && !isFfHome(location.pathname);

  const canWarehouse = canAccessWarehouseVertical(seatRole, {
    businessType,
    subscribedProducts,
  });

  useEffect(() => {
    if (!canWarehouse) {
      navigateDoorHref(urlForDoor('courier', '/app'));
    }
  }, [canWarehouse]);

  useEffect(() => {
    if (!canWarehouse || facilities.isLoading) return;
    if (!hasBuilding && !onSetup) {
      navigate(FF_SETUP, { replace: true });
    }
  }, [canWarehouse, facilities.isLoading, hasBuilding, onSetup, navigate]);

  if (!canWarehouse) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Opening Courier…
      </div>
    );
  }

  const showCourierLink = canAccessCourierVertical(seatRole, {
    businessType,
    subscribedProducts,
  });

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    'Freight Forwarder user';

  const courierHref = urlForDoor('courier', '/app');

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="relative z-40 flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600">
            Roam Enterprise
          </p>
          <p className="mt-1 text-sm font-semibold">Freight Forwarder</p>
          <p className="mt-0.5 text-xs text-slate-500">Intake product</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              state={
                location.pathname === item.to ? location.state : { from: location.pathname }
              }
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
          {showCourierLink && (
            <a
              href={courierHref}
              className="mt-2 block text-xs font-semibold text-amber-800 underline-offset-2 hover:underline"
            >
              Open Courier app
            </a>
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
      <main className="flex min-w-0 flex-1 flex-col">
        {showBack ? (
          <div className="border-b border-slate-200 bg-white px-6 py-3">
            <button
              type="button"
              onClick={back}
              className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              {backLabel}
            </button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1 p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
