// Stitch: dominion-redesign/d2798e5c0de74b93857cc67b7b940b23
import React, { useEffect, useState } from 'react';
import { LayoutDashboard, LogOut, Menu, Search, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import {
  NAV_ITEMS,
  PLATFORM_ROLE_PAGES,
  DOMINION_SECTIONS,
  API_CENTER_CHILDREN,
  VEHICLE_DATABASE_CHILDREN,
  WORLD_MAPS_CHILDREN,
  FUEL_MANAGEMENT_CHILDREN,
  TOLL_MANAGEMENT_CHILDREN,
  GCT_CHILDREN,
  ACCOUNTING_VENDOR_CHILDREN,
  GLOBAL_SETTINGS_CHILDREN,
  type NavChild,
} from './adminNavConfig';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

function pageTitle(currentPage: string): string {
  if (currentPage === 'dashboard') return 'Overview';
  const lists = [
    ...DOMINION_SECTIONS.flatMap((section) => section.children),
    ...VEHICLE_DATABASE_CHILDREN,
    ...WORLD_MAPS_CHILDREN,
    ...FUEL_MANAGEMENT_CHILDREN,
    ...TOLL_MANAGEMENT_CHILDREN,
    ...GCT_CHILDREN,
    ...ACCOUNTING_VENDOR_CHILDREN,
    ...GLOBAL_SETTINGS_CHILDREN,
    ...API_CENTER_CHILDREN,
  ];
  const exact = lists.find((item) => item.id === currentPage);
  if (exact) return exact.label;
  const sectionHit = DOMINION_SECTIONS
    .flatMap((section) => section.children)
    .find((item) => item.activeWhen?.includes(currentPage));
  return sectionHit?.label || 'Overview';
}

function roleLabel(role: string): string {
  if (role === 'platform_owner') return 'Owner';
  if (role === 'platform_support') return 'Support';
  if (role === 'platform_analyst') return 'Analyst';
  return 'Staff';
}

export function AdminLayout({ children, currentPage, onNavigate }: AdminLayoutProps) {
  const { user, role, signOut, session } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingCatalogOpenCount, setPendingCatalogOpenCount] = useState(0);

  const resolved = role || '';
  const allowedPages = PLATFORM_ROLE_PAGES[resolved] || [];
  const canViewPage = (pageId: string) => allowedPages.includes(pageId);
  const needle = query.trim().toLowerCase();

  useEffect(() => {
    const token = session?.access_token;
    if (!token || !allowedPages.includes('pending-motor-vehicles')) return;
    let cancelled = false;
    (async () => {
      try {
        const { listPendingVehicleCatalogRequests } = await import(
          '../../services/pendingVehicleCatalogService'
        );
        const res = await listPendingVehicleCatalogRequests(token, { status: 'open', limit: 1 });
        if (!cancelled) setPendingCatalogOpenCount(res.total ?? 0);
      } catch {
        if (!cancelled) setPendingCatalogOpenCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, resolved]);

  const handleNav = (page: string) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const userName = (user as { user_metadata?: { name?: string } })?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Admin';
  const initials = userName.split(' ').map((word) => word[0]).join('').toUpperCase().slice(0, 2);
  const title = pageTitle(currentPage);

  const itemClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
      active
        ? 'bg-dominion-blue font-medium text-white'
        : 'text-[#cbd5e1] hover:bg-[#334155] hover:text-white'
    }`;

  const renderChild = (child: NavChild) => {
    const Icon = child.icon;
    const active = !child.href && (
      currentPage === child.id || (child.activeWhen?.includes(currentPage) ?? false)
    );
    const badge = child.id === 'vehicles-home' || child.id === 'change-requests'
      ? pendingCatalogOpenCount
      : child.badgeCount;
    const body = (
      <>
        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-[#94a3b8]'}`} />
        <span className="truncate">{child.label}</span>
        {typeof badge === 'number' && badge > 0 ? (
          <span className="ml-auto rounded-full bg-white/20 px-1.5 text-[10px] font-semibold">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </>
    );
    if (child.href) {
      return (
        <a key={child.id} href={child.href} className={itemClass(false)}>
          {body}
        </a>
      );
    }
    return (
      <button key={child.id} type="button" onClick={() => handleNav(child.id)} className={itemClass(active)}>
        {body}
      </button>
    );
  };

  const overview = NAV_ITEMS[0];
  const showOverview = !needle || overview.label.toLowerCase().includes(needle) || 'overview'.includes(needle);

  return (
    <div className="flex min-h-screen bg-[#f8fafc] text-[#1e293b]">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#334155] bg-dominion-navy ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-700/40 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dominion-blue text-white">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight text-white">Dominion</p>
            <p className="text-xs text-[#94a3b8]">Roam Admin Console</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto text-slate-400 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Dominion">
          {showOverview ? (
            <button
              type="button"
              onClick={() => handleNav(overview.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                currentPage === overview.id
                  ? 'bg-dominion-blue text-white'
                  : 'text-[#cbd5e1] hover:bg-[#334155] hover:text-white'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Overview
            </button>
          ) : null}

          {DOMINION_SECTIONS.map((section) => {
            const children = section.children.filter((child) => {
              const visible = canViewPage(child.id) || child.activeWhen?.some((pageId) => canViewPage(pageId));
              if (!visible) return false;
              if (!needle) return true;
              return child.label.toLowerCase().includes(needle) || section.label.toLowerCase().includes(needle);
            });
            if (children.length === 0) return null;
            return (
              <div key={section.id} className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
                  {section.label}
                </p>
                {children.map(renderChild)}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e2e8f0] bg-[#ffffff] px-4 shadow-sm lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="mr-3 text-slate-500 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the menu"
              className="w-full rounded-lg border border-[#e2e8f0] bg-[#f8fafc] py-1.5 pl-9 pr-3 text-sm text-[#0f172a] outline-none focus:border-dominion-blue focus:bg-[#ffffff] focus:ring-1 focus:ring-dominion-blue"
            />
          </div>
          <div className="ml-4 flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-[#0f172a]">{userName}</p>
              <p className="font-mono text-[11px] text-[#94a3b8]">{roleLabel(resolved)}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {initials}
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-dominion-reject"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 bg-[#f8fafc] p-4 text-[#1e293b] lg:p-8">
          <p className="mb-4 text-xs font-medium text-[#94a3b8]">
            Dominion <span className="text-[#334155]">/ {title}</span>
          </p>
          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}
