import React from 'react';
import { Toaster } from 'sonner';
import { SidebarProvider, SidebarTrigger } from '../ui/sidebar';
import { AnnouncementBanner } from './AnnouncementBanner';
import { AppSidebar } from './AppSidebar';
import { AppTopNav } from './AppTopNav';
import { ServiceLineScopeSwitcher } from './ServiceLineScopeSwitcher';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onLogout?: () => void;
}

export function AppLayout({ children, currentPage, onNavigate, onLogout }: AppLayoutProps) {
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
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-900">
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

          {/* Mobile header: hamburger + scope */}
          <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden dark:border-slate-800 dark:bg-slate-950">
            <SidebarTrigger />
            <ServiceLineScopeSwitcher />
          </header>

          <div className="flex-1 overflow-auto p-4 md:p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton style={{ zIndex: 99999 }} />
    </SidebarProvider>
  );
}
