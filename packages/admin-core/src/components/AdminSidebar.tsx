import React, { useEffect, useState } from 'react';
import { ChevronRight, ExternalLink, LogOut, PanelLeft, Search, X } from 'lucide-react';
import { cn } from '../utils/cn';
import type { AdminNavBadge, AdminNavItem, AdminSidebarProps } from '../types/admin';

const COLLAPSE_KEY = 'roam-rush-ops-sidebar-collapsed';

function badgeCount(badge: AdminNavBadge | undefined): number {
  if (badge == null) return 0;
  return typeof badge === 'number' ? badge : badge.count;
}

function badgeTone(badge: AdminNavBadge | undefined): 'waiting' | 'breach' {
  if (badge == null || typeof badge === 'number') return 'waiting';
  return badge.tone === 'breach' ? 'breach' : 'waiting';
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: (id: string) => void;
}) {
  const Icon = item.icon;
  const count = badgeCount(item.badge);
  const tone = badgeTone(item.badge);
  const className = cn(
    'relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
    active
      ? 'bg-amber-500/10 text-amber-300'
      : 'text-slate-300 hover:text-white hover:bg-slate-800',
    collapsed && 'lg:justify-center lg:px-2',
  );

  const inner = (
    <>
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-amber-400" />
      )}
      <Icon className="w-4 h-4 shrink-0" />
      <span className={cn('truncate', collapsed && 'lg:sr-only')}>{item.label}</span>
      {count > 0 && (
        <span
          className={cn(
            'ml-auto min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center',
            tone === 'breach' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-200',
            collapsed && 'lg:absolute lg:top-1 lg:right-1 lg:ml-0 lg:min-w-4 lg:h-4 lg:px-0',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </>
  );

  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" title={item.label} className={className}>
        {inner}
        <ExternalLink className={cn('w-3 h-3 text-slate-600', collapsed && 'lg:hidden')} />
      </a>
    );
  }

  return (
    <button type="button" title={item.label} onClick={() => onNavigate(item.id)} className={className}>
      {inner}
    </button>
  );
}

export function AdminSidebar({
  config,
  currentPage,
  onNavigate,
  canViewPage = () => true,
  user,
  onSignOut,
  mobileOpen = false,
  onMobileClose,
  onOpenSearch,
}: AdminSidebarProps) {
  const userName = user?.name || user?.email?.split('@')[0] || 'Admin';
  const initials = userName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const roleLabel = user?.role
    ? user.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Admin';
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch { /* private mode */ }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 bg-slate-900 border-r border-slate-800 flex flex-col',
        'transform transition-all duration-200 ease-in-out',
        'lg:relative lg:translate-x-0',
        collapsed ? 'w-64 lg:w-16' : 'w-64',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="p-3 border-b border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className={cn('flex items-center gap-3 min-w-0', collapsed && 'lg:justify-center')}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-slate-900">{config.title.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
              <h1 className="font-semibold text-white text-sm truncate">{config.title}</h1>
              {config.subtitle && <p className="text-[11px] text-slate-500 truncate">{config.subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onMobileClose} className="lg:hidden p-1 text-slate-400 hover:text-white" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden lg:inline-flex p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {onOpenSearch && (
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={onOpenSearch}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-800 text-sm text-slate-400 hover:text-white hover:bg-slate-800',
              collapsed && 'lg:justify-center lg:px-2',
            )}
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className={cn('truncate', collapsed && 'lg:sr-only')}>Search</span>
            <span className={cn('ml-auto text-[10px] text-slate-500', collapsed && 'lg:hidden')}>Ctrl K</span>
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {config.groups.map((group) => {
          const items = group.items.filter((item) => canViewPage(item.id));
          if (items.length === 0) return null;
          return (
            <div key={group.id} className="space-y-1">
              {group.label && (
                <p className={cn('px-3 pb-1 text-[11px] uppercase tracking-wider text-slate-500', collapsed && 'lg:sr-only')}>
                  {group.label}
                </p>
              )}
              {items.map((item) => (
                <NavLink
                  key={item.id}
                  item={item}
                  active={currentPage === item.id}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800 relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className={cn('w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800', collapsed && 'lg:justify-center')}
        >
          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-300 shrink-0">
            {initials}
          </div>
          <div className={cn('flex-1 min-w-0 text-left', collapsed && 'lg:hidden')}>
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
          </div>
          <ChevronRight className={cn('w-4 h-4 text-slate-500', collapsed && 'lg:hidden')} />
        </button>
        {menuOpen && (
          <div className="absolute bottom-16 left-3 right-3 rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-1 z-10">
            {config.backToAppUrl && (
              <a
                href={config.backToAppUrl}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-md"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {config.backToAppLabel || 'Back to App'}
              </a>
            )}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-md"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
