import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  LogOut,
  ExternalLink,
  X,
} from 'lucide-react';
import { cn } from '../utils/cn';
import type { AdminSidebarProps, AdminSection, AdminNavItem } from '../types/admin';

/**
 * Render a single nav item (leaf node)
 */
function NavItem({
  item,
  active,
  onNavigate,
  canView = true,
}: {
  item: AdminNavItem;
  active: boolean;
  onNavigate: (id: string) => void;
  canView?: boolean;
}) {
  if (!canView) return null;

  const Icon = item.icon;

  // External link
  if (item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-slate-500 hover:text-white hover:bg-slate-800"
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{item.label}</span>
        <ExternalLink className="w-3 h-3 ml-auto text-slate-600" />
      </a>
    );
  }

  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-amber-500/10 text-amber-300'
          : 'text-slate-500 hover:text-white hover:bg-slate-800'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {active && <ChevronRight className="w-3 h-3 ml-auto text-amber-400/60" />}
    </button>
  );
}

/**
 * Render a collapsible section with children
 */
function SectionItem({
  section,
  currentPage,
  onNavigate,
  canViewPage,
}: {
  section: AdminSection;
  currentPage: string;
  onNavigate: (id: string) => void;
  canViewPage: (id: string) => boolean;
}) {
  const visibleChildren = section.children.filter(c => canViewPage(c.id));
  const isChildActive = visibleChildren.some(c => c.id === currentPage);
  const [open, setOpen] = useState(isChildActive);

  // Keep open when navigating to a child
  useEffect(() => {
    if (visibleChildren.some(c => c.id === currentPage)) {
      setOpen(true);
    }
  }, [currentPage, visibleChildren]);

  if (visibleChildren.length === 0) return null;

  const Icon = section.icon;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          isChildActive
            ? 'bg-amber-500/15 text-amber-300'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        )}
      >
        <Icon className="w-4.5 h-4.5 shrink-0" />
        <span className="truncate">{section.label}</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
        )}
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
          {visibleChildren.map(child => (
            <NavItem
              key={child.id}
              item={child}
              active={currentPage === child.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Admin sidebar component.
 * Renders navigation sections with collapsible groups and role-based filtering.
 */
export function AdminSidebar({
  config,
  currentPage,
  onNavigate,
  canViewPage = () => true,
  user,
  onSignOut,
  mobileOpen = false,
  onMobileClose,
}: AdminSidebarProps) {
  const userName = user?.name || user?.email?.split('@')[0] || 'Admin';
  const initials = userName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const roleLabel = user?.role
    ? user.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Admin';

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col',
        'transform transition-transform duration-200 ease-in-out',
        'lg:relative lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {typeof config.logo === 'string' ? (
              <img src={config.logo} alt={config.title} className="w-8 h-8" />
            ) : config.logo ? (
              <config.logo />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <span className="text-xs font-bold text-slate-900">
                  {config.title.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h1 className="font-semibold text-white text-sm">{config.title}</h1>
              {config.subtitle && (
                <p className="text-[11px] text-slate-500 truncate">{config.subtitle}</p>
              )}
            </div>
          </div>
          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Top-level items */}
        {config.topNavItems?.map(item =>
          canViewPage(item.id) ? (
            <NavItem
              key={item.id}
              item={item}
              active={currentPage === item.id}
              onNavigate={onNavigate}
            />
          ) : null
        )}

        {/* Sections */}
        {config.sections.map(section => (
          <SectionItem
            key={section.id}
            section={section}
            currentPage={currentPage}
            onNavigate={onNavigate}
            canViewPage={canViewPage}
          />
        ))}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-slate-800">
        {/* Back to app link */}
        {config.backToAppUrl && (
          <a
            href={config.backToAppUrl}
            className="flex items-center gap-2 px-3 py-2 mb-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {config.backToAppLabel || 'Back to App'}
          </a>
        )}

        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-300">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
          </div>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
