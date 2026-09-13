import React from 'react';
import { Toaster } from 'sonner';
import { SidebarProvider, SidebarTrigger } from '../ui/sidebar';
import { useIsMobile } from '../ui/use-mobile';
import { AnnouncementBanner } from './AnnouncementBanner';
import { AppSidebar } from './AppSidebar';
import { AppTopNav } from './AppTopNav';
import { ServiceLineScopeSwitcher } from './ServiceLineScopeSwitcher';
import { resolveNavPageTitle } from './fleetNavModel';
import { useFleetNavModel } from './useFleetNavModel';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onLogout?: () => void;
}

export function AppLayout({ children, currentPage, onNavigate, onLogout }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const nav = useFleetNavModel();
  const pageTitle = resolveNavPageTitle(nav, currentPage) ?? 'Roam Fleet';

  React.useEffect(() => {
    const isDark = localStorage.getItem('preference_dark_mode') === 'true';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-[100dvh] w-full bg-slate-50 dark:bg-slate-900">
        {/* Mobile drawer only — desktop peer sidebar stays unmounted via md:hidden */}
        <div className="md:hidden">
          <AppSidebar
            currentPage={currentPage}
            onNavigate={onNavigate}
            onLogout={onLogout}
          />
        </div>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AnnouncementBanner />

          {/* Desktop top navbar */}
          <div className="hidden md:block">
            <AppTopNav
              currentPage={currentPage}
              onNavigate={onNavigate}
              onLogout={onLogout}
            />
          </div>

          {/* Mobile header: hamburger + page title + scope */}
          <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-slate-200 bg-white safe-t safe-x md:hidden dark:border-slate-800 dark:bg-slate-950">
            <SidebarTrigger className="min-h-11 min-w-11 shrink-0" />
            <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold text-slate-900 dark:text-slate-100">
              {pageTitle}
            </h1>
            <div className="shrink-0">
              <ServiceLineScopeSwitcher />
            </div>
          </header>

          <div className="flex-1 overflow-auto py-4 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] md:p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </main>
      </div>
      <Toaster
        position={isMobile ? 'top-center' : 'top-right'}
        richColors
        closeButton
        offset={isMobile ? 'max(0.75rem, env(safe-area-inset-top, 0px))' : undefined}
        style={{ zIndex: 99999 }}
      />
    </SidebarProvider>
  );
}
