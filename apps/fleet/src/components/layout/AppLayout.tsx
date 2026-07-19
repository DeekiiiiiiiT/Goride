import React from 'react';
import { Toaster } from 'sonner@2.0.3';
import { SidebarProvider, SidebarTrigger } from '../ui/sidebar';
import { Car } from 'lucide-react';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { AnnouncementBanner } from './AnnouncementBanner';
import { AppSidebar } from './AppSidebar';

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
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-900">
        <AppSidebar currentPage={currentPage} onNavigate={onNavigate} onLogout={onLogout} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AnnouncementBanner />
          <AppHeader />
          <div className="flex-1 overflow-auto p-4 md:p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton style={{ zIndex: 99999 }} />
    </SidebarProvider>
  );
}

function AppHeader() {
  const [fleetName, setFleetName] = React.useState<string | null>(null);

  React.useEffect(() => {
    const stored = localStorage.getItem('roam_fleet_name');
    if (stored) setFleetName(stored);

    const handleUpdate = () => {
      const updated = localStorage.getItem('roam_fleet_name');
      if (updated) setFleetName(updated);
    };

    window.addEventListener('fleetNameUpdated', handleUpdate);
    return () => window.removeEventListener('fleetNameUpdated', handleUpdate);
  }, []);

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        {fleetName && (
          <div className="hidden animate-in fade-in slide-in-from-left-4 items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-indigo-700 duration-500 md:flex dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300">
            <Car className="h-3.5 w-3.5" aria-hidden />
            <span className="text-sm font-medium uppercase tracking-wide">{fleetName}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <NotificationCenter />
      </div>
    </header>
  );
}
