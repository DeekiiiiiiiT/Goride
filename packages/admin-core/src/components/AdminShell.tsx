import React, { useEffect, useRef, useState } from 'react';
import { Bell, Menu, Search } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';
import type { AdminShellProps } from '../types/admin';

/**
 * AdminShell — sidebar, header, and content. The page owns the title.
 * The header shows where you are, search, and anything waiting.
 */
export function AdminShell({
  config,
  currentPage,
  onNavigate,
  children,
  user,
  onSignOut,
  breadcrumbs = [],
  onCrumb,
  onOpenSearch,
  notificationCount = 0,
  onOpenNotifications,
  notificationsOpen = false,
  notifications,
  environmentLabel,
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!bellRef.current?.contains(event.target as Node)) onOpenNotifications?.();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenNotifications?.();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [notificationsOpen, onOpenNotifications]);

  return (
    <div className="dark flex h-screen bg-slate-950">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <AdminSidebar
        config={config}
        currentPage={currentPage}
        onNavigate={(page) => {
          onNavigate(page);
          setMobileOpen(false);
        }}
        user={user}
        onSignOut={onSignOut}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onOpenSearch={onOpenSearch}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="dash-admin-shell-header h-16 bg-slate-900/50 border-b border-slate-800 flex items-center gap-3 px-4 lg:px-6 shrink-0 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <nav className="min-w-0 flex items-center gap-1.5 text-sm text-slate-400" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb.label}-${index}`}>
                {index > 0 && <span className="text-slate-600">/</span>}
                {crumb.to && onCrumb ? (
                  <button type="button" onClick={() => onCrumb(crumb.to!)} className="truncate hover:text-white">
                    {crumb.label}
                  </button>
                ) : (
                  <span className={index === breadcrumbs.length - 1 ? 'text-slate-200 truncate' : 'truncate'}>
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {environmentLabel && (
              <span className="hidden sm:inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-200">
                {environmentLabel}
              </span>
            )}
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-400 hover:text-white"
              >
                <Search className="w-4 h-4" />
                <span className="hidden md:inline">Search orders, people, stores</span>
                <span className="hidden md:inline text-[10px] text-slate-500">Ctrl K</span>
              </button>
            )}
            <div className="relative" ref={bellRef}>
              <button
                type="button"
                onClick={onOpenNotifications}
                className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                aria-label="What needs attention"
                aria-expanded={notificationsOpen}
              >
                <Bell className="w-5 h-5" />
                {notificationCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-[10px] font-bold text-slate-950 inline-flex items-center justify-center">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-xl">
                  {notifications}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="dash-admin-shell-main flex-1 overflow-auto bg-slate-950 p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
