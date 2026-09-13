import React from 'react';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '../../ui/sidebar';
import { cn } from '../../ui/utils';

type NavItemProps = {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
};

export function NavItem({ icon, label, active = false, onClick }: NavItemProps) {
  const { mobileNavPush } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative',
          mobileNavPush && 'justify-center gap-0 px-0',
          active
            ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
            : 'text-slate-600 dark:text-slate-400',
        )}
        onClick={onClick}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-indigo-500"
            aria-hidden
          />
        )}
        {icon}
        <span className={cn('truncate', mobileNavPush && 'sr-only')}>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
