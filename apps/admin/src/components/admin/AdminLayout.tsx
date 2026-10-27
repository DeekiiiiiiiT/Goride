// Stitch: dominion-redesign/d2798e5c0de74b93857cc67b7b940b23
import React, { useEffect, useState } from 'react';
import { LayoutDashboard, LogOut, Menu, Search, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import {
  NAV_ITEMS,
  PLATFORM_ROLE_PAGES,
  DOMINION_SECTIONS,
  type NavChild,
} from './adminNavConfig';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
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

  const itemClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm transition-colors duration-150 ${
      active
        ? 'bg-blue-600 font-medium text-white'
        : 'text-[#cbd5e1] hover:bg-slate-700/50 hover:text-white'
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
        <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-white' : 'text-[#94a3b8]'}`} />
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
    <div className="flex min-h-screen bg-slate-50 text-slate-800 antialiased">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-slate-700/50 bg-[#1e293b] select-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-700/40 px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="font-headline text-base font-bold leading-tight tracking-tight text-white">
              Dominion
            </span>
            <span className="mt-0.5 text-xs font-normal leading-none tracking-normal text-[#94a3b8]">
              Roam Admin Console
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto text-[#94a3b8] lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 text-sm" aria-label="Dominion">
          {showOverview ? (
            <div>
              <button
                type="button"
                onClick={() => handleNav(overview.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                  currentPage === overview.id
                    ? 'bg-blue-600 font-medium text-white'
                    : 'text-[#cbd5e1] hover:bg-slate-700/50 hover:text-white'
                }`}
              >
                <LayoutDashboard className="h-[18px] w-[18px]" />
                Overview
              </button>
            </div>
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
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
                  {section.label}
                </div>
                {children.map(renderChild)}
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-700/50 p-3">
          <div className="flex items-center justify-between rounded bg-slate-900/50 px-3 py-2 font-mono text-xs text-[#94a3b8]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              KGN-DC-01
            </span>
            <span className="text-[#94a3b8]">JMD READY</span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="mr-3 text-slate-500 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative flex w-full max-w-md items-center lg:w-96">
            <Search className="pointer-events-none absolute left-3 h-[18px] w-[18px] text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search entities, engines, routes..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-12 text-sm text-slate-800 placeholder-slate-400 transition-all focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            <kbd className="absolute right-2.5 top-2 hidden rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline">
              ⌘K
            </kbd>
          </div>
          <div className="ml-4 flex items-center gap-3">
            <ThemeToggle />
            <div className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
            <div className="flex items-center gap-3 pl-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white ring-2 ring-slate-100">
                {initials}
              </div>
              <div className="hidden flex-col text-left sm:flex">
                <span className="text-xs font-semibold leading-tight text-slate-900">{userName}</span>
                <span className="mt-0.5 font-mono text-[11px] leading-none text-slate-400">
                  {roleLabel(resolved)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex min-h-[calc(100vh-4rem)] flex-1 flex-col bg-slate-50/60 p-4 text-slate-800 lg:p-8">
          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}
