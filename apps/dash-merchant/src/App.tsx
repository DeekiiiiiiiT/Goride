import React, { useState, useEffect } from 'react';
import { supabase } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import MenuPage from './pages/MenuPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import { useMerchant } from './hooks/useMerchant';
import { LayoutDashboard, ClipboardList, UtensilsCrossed, Settings, LogOut } from 'lucide-react';
import { NotificationFeed } from './components/NotificationFeed';

type Page = 'dashboard' | 'orders' | 'menu' | 'settings' | 'login' | 'onboarding';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { merchant, isLoading: merchantLoading } = useMerchant(session);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentPage('login');
  };

  if (loading || merchantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage onSuccess={() => setCurrentPage('dashboard')} />;
  }

  if (!merchant) {
    return <OnboardingPage session={session} onComplete={() => window.location.reload()} />;
  }

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'orders', label: 'Orders', icon: ClipboardList },
    { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage merchant={merchant} onNavigate={setCurrentPage} />;
      case 'orders':
        return <OrdersPage merchant={merchant} />;
      case 'menu':
        return <MenuPage merchant={merchant} />;
      case 'settings':
        return <SettingsPage merchant={merchant} />;
      default:
        return <DashboardPage merchant={merchant} onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-white border-r hidden md:flex md:flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">R</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Roam Dash</h1>
              <p className="text-xs text-gray-500">Partner Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentPage === item.key;

              return (
                <li key={item.key}>
                  <button
                    onClick={() => setCurrentPage(item.key as Page)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-amber-50 text-amber-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t">
          <div className="mb-4 px-4">
            <p className="text-sm font-medium text-gray-900 truncate">{merchant.name}</p>
            <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0">
        {/* Single top bar: one NotificationFeed (one Realtime subscription) for all breakpoints */}
        <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b bg-white px-4 py-3 md:justify-end md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500">
              <span className="text-sm font-bold text-white">R</span>
            </div>
            <span className="truncate font-bold text-gray-900">{merchant.name}</span>
          </div>
          <NotificationFeed merchantId={merchant.id} />
        </header>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.key;

            return (
              <button
                key={item.key}
                onClick={() => setCurrentPage(item.key as Page)}
                className={`flex flex-col items-center gap-1 px-4 py-2 ${
                  isActive ? 'text-amber-600' : 'text-gray-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 md:p-8 pb-24 md:pb-8">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
