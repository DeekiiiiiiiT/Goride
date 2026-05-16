import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';
import type { AdminShellProps, AdminNavItem, AdminSection } from '../types/admin';

/**
 * Get page label from config for header display
 */
function getPageLabel(
  pageId: string,
  topNavItems?: AdminNavItem[],
  sections?: AdminSection[]
): string {
  // Check top nav
  const topItem = topNavItems?.find(i => i.id === pageId);
  if (topItem) return topItem.label;

  // Check sections
  for (const section of sections ?? []) {
    const child = section.children.find(c => c.id === pageId);
    if (child) return child.label;
  }

  // Fallback
  return pageId
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * AdminShell - Main layout wrapper for admin portals.
 * Provides sidebar navigation, header, and content area.
 */
export function AdminShell({
  config,
  currentPage,
  onNavigate,
  children,
  user,
  onSignOut,
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageLabel = getPageLabel(currentPage, config.topNavItems, config.sections);

  return (
    <div className="dark flex h-screen bg-slate-950">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
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
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="dash-admin-shell-header h-16 bg-slate-900/50 border-b border-slate-800 flex items-center px-4 lg:px-6 shrink-0 backdrop-blur-sm">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Page title */}
          <h2 className="text-base font-semibold text-white">{pageLabel}</h2>

          {/* Right side - back link */}
          {config.backToAppUrl && (
            <a
              href={config.backToAppUrl}
              className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {config.backToAppLabel || 'Back to App'}
            </a>
          )}
        </header>

        {/* Content area */}
        <main className="dash-admin-shell-main flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
