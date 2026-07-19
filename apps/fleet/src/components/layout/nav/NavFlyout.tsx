import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { SidebarMenuButton, SidebarMenuItem } from '../../ui/sidebar';
import { cn } from '../../ui/utils';
import type { NavLeaf } from './types';

type NavFlyoutProps = {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavLeaf[];
  currentPage: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (page: string) => void;
  /** Indent when nested under an accordion section (Fuel/Toll). */
  nested?: boolean;
};

function isLeafActive(item: NavLeaf, currentPage: string) {
  if (item.id === currentPage) return true;
  return item.activeIds?.includes(currentPage) ?? false;
}

/** Mid-level row that opens its children in a horizontal fly-out. */
export function NavFlyout({
  id,
  label,
  icon,
  items,
  currentPage,
  open,
  onOpenChange,
  onNavigate,
  nested = false,
}: NavFlyoutProps) {
  const openTimer = React.useRef<number | null>(null);
  const closeTimer = React.useRef<number | null>(null);
  const hasActiveChild = items.some((item) => isLeafActive(item, currentPage));

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  React.useEffect(() => () => clearTimers(), []);

  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = window.setTimeout(() => onOpenChange(true), 80);
  };

  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => onOpenChange(false), 180);
  };

  const handleSelect = (pageId: string) => {
    onNavigate?.(pageId);
    onOpenChange(false);
  };

  return (
    <SidebarMenuItem>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <SidebarMenuButton
            id={`nav-flyout-trigger-${id}`}
            tooltip={label}
            isActive={hasActiveChild}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={`nav-flyout-panel-${id}`}
            className={cn(
              'relative',
              nested && 'pl-3',
              hasActiveChild &&
                'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
            )}
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
          >
            {hasActiveChild && !nested && (
              <span
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-indigo-500"
                aria-hidden
              />
            )}
            {icon}
            <span className="truncate">{label}</span>
            <ChevronRight
              className={cn(
                'ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
                open && 'translate-x-0.5 text-indigo-500',
              )}
              aria-hidden
            />
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent
          id={`nav-flyout-panel-${id}`}
          role="menu"
          aria-labelledby={`nav-flyout-trigger-${id}`}
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          className={cn(
            'z-[120] w-60 border-slate-200/80 p-1.5 shadow-lg shadow-slate-900/8',
            'dark:border-slate-700 dark:bg-slate-950',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-2',
          )}
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </div>
          <ul className="flex flex-col gap-0.5" role="none">
            {items.map((item) => {
              const active = isLeafActive(item, currentPage);
              return (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-indigo-500/40',
                      active
                        ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                    onClick={() => handleSelect(item.id)}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        active ? 'bg-indigo-500' : 'bg-transparent',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge}
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  );
}
