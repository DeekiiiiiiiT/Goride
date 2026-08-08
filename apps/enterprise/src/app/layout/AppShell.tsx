import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Boxes,
  Building2,
  Bell,
  Car,
  ChevronRight,
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
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import { OpsInboxDrawer } from '@/app/layout/OpsInboxDrawer';
import { useOpsAlerts } from '@/app/hooks/useLogistics';

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: ModuleKey;
  end?: boolean;
  children?: NavItem[];
};

/** Top-level items only — no section headers. Flyouts hold the rest. */
const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  {
    to: '/app/mailbox',
    label: 'Mailbox & Intake',
    icon: Package,
    children: [
      { to: '/app/facilities', label: 'Facilities', icon: Building2, module: 'freight_suites' },
      { to: '/app/suites', label: 'Suites', icon: Tags, module: 'freight_suites' },
      { to: '/app/packages', label: 'Packages', icon: Package, module: 'freight_mailbox_packages' },
      { to: '/app/miami-scan', label: 'Receive', icon: ClipboardList, module: 'freight_miami_scan' },
      { to: '/app/manifests', label: 'Manifests', icon: Boxes, module: 'freight_manifests' },
    ],
  },
  { to: '/app/customs', label: 'Customs', icon: FileText, module: 'freight_customs_board' },
  { to: '/app/hub', label: 'Hub Station', icon: MapPin, module: 'freight_hub_station' },
  {
    to: '/app/last-mile',
    label: 'Last Mile',
    icon: Route,
    children: [
      { to: '/app/fulfillment', label: 'Fulfillment', icon: Route, module: 'freight_fulfillment' },
      { to: '/app/client-fleet', label: 'Client Fleet', icon: Car, module: 'freight_client_fleet' },
    ],
  },
  {
    to: '/app/setup',
    label: 'Domestic & Setup',
    icon: Ship,
    children: [
      { to: '/app/dispatch', label: 'Dispatch Board', icon: LayoutDashboard, module: 'freight_dispatch' },
      { to: '/app/service-zones', label: 'Service Zones', icon: MapPin, module: 'freight_service_zones' },
      { to: '/app/shipments', label: 'Shipments', icon: Ship, module: 'freight_shipments' },
      { to: '/app/carriers', label: 'Carriers', icon: Truck, module: 'freight_carriers' },
      { to: '/app/clients', label: 'Clients', icon: Users, module: 'freight_clients' },
      { to: '/app/rate-cards', label: 'Rate Cards', icon: FileText, module: 'freight_rate_cards' },
    ],
  },
  {
    to: '/app/fleet-ops',
    label: 'Fleet Ops',
    icon: Truck,
    children: [
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
  { to: '/app/finance', label: 'Business Finance', icon: Building2, module: 'businessFinance' },
  {
    to: '/app/system',
    label: 'System',
    icon: Settings,
    children: [
      { to: '/app/team', label: 'Team', icon: Users, module: 'teamManagement' },
      { to: '/app/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function useVisibleChildren(children: NavItem[] | undefined) {
  const { isModuleEnabled } = useModuleAccess();
  const { canAccessModule } = useSeatAccess();
  const ok = (mod?: ModuleKey) => !mod || (isModuleEnabled(mod) && canAccessModule(mod));
  return (children ?? []).filter((c) => {
    if (c.children?.length) {
      return c.children.some((gc) => ok(gc.module)) || ok(c.module);
    }
    return ok(c.module);
  });
}

function pathMatches(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function itemOrDescendantActive(pathname: string, item: NavItem): boolean {
  if (pathMatches(pathname, item.to, item.end)) return true;
  return (item.children ?? []).some((c) => itemOrDescendantActive(pathname, c));
}

function FlyoutPanel({
  items,
  top,
  left,
  menuId,
  onKeepOpen,
  onRequestClose,
  onNavigate,
}: {
  items: NavItem[];
  top: number;
  left: number;
  menuId: string;
  onKeepOpen: () => void;
  onRequestClose: () => void;
  onNavigate: () => void;
}) {
  return (
    <div
      id={menuId}
      role="menu"
      style={{ top, left }}
      className="fixed z-50 min-w-[220px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10"
      onMouseEnter={onKeepOpen}
      onMouseLeave={onRequestClose}
    >
      <div className="flex flex-col gap-0.5">
        {items.map((child) => (
          <FlyoutRow
            key={child.to}
            item={child}
            onKeepOpen={onKeepOpen}
            onRequestClose={onRequestClose}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function FlyoutRow({
  item,
  onKeepOpen,
  onRequestClose,
  onNavigate,
}: {
  item: NavItem;
  onKeepOpen: () => void;
  onRequestClose: () => void;
  onNavigate: () => void;
}) {
  const location = useLocation();
  const nested = useVisibleChildren(item.children);
  const menuId = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const active = itemOrDescendantActive(location.pathname, item);

  function clearTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openNested() {
    if (!nested.length) return;
    clearTimer();
    const el = rowRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const estimatedHeight = Math.min(nested.length * 40 + 16, 360);
      setPos({
        top: Math.max(8, Math.min(rect.top, window.innerHeight - estimatedHeight - 8)),
        left: rect.right + 6,
      });
    }
    setOpen(true);
  }

  function scheduleCloseNested() {
    clearTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }

  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (nested.length) {
    return (
      <div
        ref={rowRef}
        className="relative"
        onMouseEnter={openNested}
        onMouseLeave={scheduleCloseNested}
      >
        <button
          type="button"
          role="menuitem"
          aria-expanded={open}
          aria-haspopup="menu"
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition ${
            active || open
              ? 'bg-amber-50 text-amber-900'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
          onClick={() => (open ? setOpen(false) : openNested())}
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
        {open && (
          <FlyoutPanel
            items={nested}
            top={pos.top}
            left={pos.left}
            menuId={menuId}
            onKeepOpen={() => {
              clearTimer();
              onKeepOpen();
              setOpen(true);
            }}
            onRequestClose={() => {
              scheduleCloseNested();
              onRequestClose();
            }}
            onNavigate={onNavigate}
          />
        )}
      </div>
    );
  }

  return (
    <NavLink
      role="menuitem"
      to={item.to}
      end={Boolean(item.end)}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
          isActive
            ? 'bg-amber-50 text-amber-900'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`
      }
    >
      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
      {item.label}
    </NavLink>
  );
}

function NavItemLink({ item }: { item: NavItem }) {
  const location = useLocation();
  const visibleChildren = useVisibleChildren(item.children);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const sectionActive = itemOrDescendantActive(location.pathname, item);

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openPanel() {
    clearCloseTimer();
    const el = rootRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const estimatedHeight = Math.min(visibleChildren.length * 40 + 16, 420);
      setPanelPos({
        top: Math.max(8, Math.min(rect.top, window.innerHeight - estimatedHeight - 8)),
        left: rect.right + 6,
      });
    }
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (document.getElementById(menuId)?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, menuId]);

  useEffect(() => () => clearCloseTimer(), []);

  if (visibleChildren.length) {
    return (
      <div
        ref={rootRef}
        className="relative"
        onMouseEnter={openPanel}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => (open ? setOpen(false) : openPanel())}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
            sectionActive || open
              ? 'bg-amber-50 text-amber-900'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </button>

        {open && (
          <FlyoutPanel
            items={visibleChildren}
            top={panelPos.top}
            left={panelPos.left}
            menuId={menuId}
            onKeepOpen={openPanel}
            onRequestClose={scheduleClose}
            onNavigate={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  if (item.children?.length) return null;

  return (
    <NavLink
      to={item.to}
      end={Boolean(item.end)}
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
  );
}

function isTopLevelVisible(
  item: NavItem,
  isModuleEnabled: (key: ModuleKey) => boolean,
  canAccessModule: (key: string) => boolean,
): boolean {
  const ok = (mod?: ModuleKey) => !mod || (isModuleEnabled(mod) && canAccessModule(mod));
  if (item.children?.length) {
    return item.children.some((c) => {
      if (c.children?.length) {
        return c.children.some((gc) => ok(gc.module)) || ok(c.module);
      }
      return ok(c.module);
    });
  }
  return ok(item.module);
}

export function AppShell() {
  const { user, role, signOut } = useAuth();
  const { isModuleEnabled, loading } = useModuleAccess();
  const { canAccessModule, can } = useSeatAccess();
  const [inboxOpen, setInboxOpen] = useState(false);
  const opsInboxOn =
    isModuleEnabled('freight_ops_inbox') && can('freight.alerts.read');
  const alerts = useOpsAlerts(opsInboxOn);
  const unread = opsInboxOn ? (alerts.data?.unreadCount ?? 0) : 0;
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    'Enterprise user';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="relative z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600">
            Roam Enterprise
          </p>
          <p className="mt-1 text-sm font-semibold">Operations</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {loading ? (
            <p className="px-3 text-xs text-slate-400">Loading modules…</p>
          ) : (
            NAV_ITEMS.filter((item) =>
              isTopLevelVisible(item, isModuleEnabled, canAccessModule),
            ).map((item) => (
              <NavItemLink key={item.to} item={item} />
            ))
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
        <div className="sticky top-0 z-20 flex justify-end border-b border-slate-200/80 bg-slate-50/90 px-6 py-2 backdrop-blur md:px-8">
          {opsInboxOn ? (
            <button
              type="button"
              onClick={() => setInboxOpen(true)}
              className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Bell className="h-4 w-4" aria-hidden />
              Alerts
              {unread > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
        <div className="mx-auto max-w-6xl p-6 md:p-8">
          <Outlet />
        </div>
      </main>
      {opsInboxOn ? <OpsInboxDrawer open={inboxOpen} onClose={() => setInboxOpen(false)} /> : null}
    </div>
  );
}
