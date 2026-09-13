import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '../../ui/sidebar';
import { cn } from '../../ui/utils';
import type { NavLeaf } from './types';

type NavSectionProps = {
  id: string;
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPage: string;
  onNavigate?: (page: string) => void;
  /** Leaf links shown vertically under the section. */
  items?: NavLeaf[];
  /** True when a nested child page is active (e.g. fuel/toll under fleet ops). */
  forceActive?: boolean;
  /** Nested mid-level rows (fly-out triggers, etc.). */
  children?: React.ReactNode;
};

function isLeafActive(item: NavLeaf, currentPage: string) {
  if (item.id === currentPage) return true;
  return item.activeIds?.includes(currentPage) ?? false;
}

/** Top-level accordion — parent keeps only one section open. */
export function NavSection({
  id,
  label,
  icon,
  open,
  onOpenChange,
  currentPage,
  onNavigate,
  items,
  forceActive = false,
  children,
}: NavSectionProps) {
  const { mobileNavPush } = useSidebar();
  const hasActiveChild =
    forceActive || (items?.some((item) => isLeafActive(item, currentPage)) ?? false);

  return (
    <Collapsible
      open={mobileNavPush ? false : open}
      onOpenChange={onOpenChange}
      className="group/nav-section"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            id={`nav-section-trigger-${id}`}
            tooltip={label}
            isActive={hasActiveChild && !open}
            aria-controls={mobileNavPush ? undefined : `nav-section-panel-${id}`}
            className={cn(
              'relative',
              mobileNavPush && 'justify-center gap-0.5 px-1',
              (open || hasActiveChild) && 'text-slate-900 dark:text-slate-100',
              hasActiveChild &&
                mobileNavPush &&
                'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
            )}
          >
            <span
              className={cn(
                'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-indigo-500 transition-opacity',
                open || hasActiveChild ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden
            />
            {icon}
            <span className={cn('truncate', mobileNavPush && 'sr-only')}>{label}</span>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200',
                mobileNavPush ? 'ml-0' : 'ml-auto h-4 w-4',
                !mobileNavPush &&
                  'group-data-[state=open]/nav-section:rotate-90 group-data-[state=open]/nav-section:text-indigo-500',
                mobileNavPush && hasActiveChild && 'text-indigo-500',
              )}
              aria-hidden
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        {!mobileNavPush && (
          <CollapsibleContent
            id={`nav-section-panel-${id}`}
            role="region"
            aria-labelledby={`nav-section-trigger-${id}`}
            className="overflow-hidden"
          >
            {children}
            {items && items.length > 0 && (
              <SidebarMenuSub className="mt-0.5 mr-0 border-slate-200/70 dark:border-slate-700">
                {items.map((item) => {
                  const active = isLeafActive(item, currentPage);
                  return (
                    <SidebarMenuSubItem key={item.id}>
                      <SidebarMenuSubButton
                        asChild
                        isActive={active}
                        className={cn(
                          active &&
                            'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
                        )}
                      >
                        <button
                          type="button"
                          className="w-full cursor-pointer text-left"
                          aria-current={active ? 'page' : undefined}
                          onClick={() => onNavigate?.(item.id)}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{item.label}</span>
                            {item.badge}
                          </span>
                        </button>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            )}
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
}
