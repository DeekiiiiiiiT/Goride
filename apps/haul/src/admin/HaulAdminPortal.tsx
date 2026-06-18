import React, { useEffect, useState } from 'react';
import { Routes, Route, Outlet, Link, useLocation } from 'react-router-dom';
import { supabaseHaulAdmin as supabase, hasProductAdminRole, jwtPrimaryRole } from '@roam/auth-client';
import type { Session } from '@supabase/supabase-js';
import { LayoutDashboard, Package, LogOut, Loader2, ShieldAlert, Settings } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { HaulAdminLoginForm } from './components/HaulAdminLoginForm';
import { HaulageCatalogManager } from './components/HaulageCatalogManager';
import { PlatformSettingsPage } from './pages/PlatformSettingsPage';

const NAV = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/catalog', label: 'Freight catalog', icon: Package },
  { path: '/settings', label: 'Platform Settings', icon: Settings },
];

function AdminLayout({ session }: { session: Session }) {
  const location = useLocation();

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin';
  };

  return (
    <div className="dark flex min-h-screen bg-slate-950 text-slate-100">
      <Toaster position="top-right" theme="dark" />
      <aside className="w-56 border-r border-slate-800 p-4 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-widest text-amber-500/80 font-medium mb-4 px-2">Roam Haul</p>
        {NAV.map(({ path, label, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              location.pathname === path ? 'bg-amber-500/15 text-amber-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-300"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-8">
        <Outlet context={{ session }} />
      </main>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Haul operations</h1>
      <p className="text-slate-400 text-sm">Manage catalog, transport, and hauler fleet from roamhaul.co/admin.</p>
    </div>
  );
}

export function HaulAdminPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!session) return <HaulAdminLoginForm />;

  if (!hasProductAdminRole(session.user, 'haul')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-8">
        <ShieldAlert className="w-10 h-10 text-red-400 mb-4" />
        <h1 className="text-xl font-semibold mb-2">Access denied</h1>
        <p className="text-slate-400 text-sm mb-4">
          Role: {jwtPrimaryRole(session.user) || '(none)'} — haul_admin required.
        </p>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="px-4 py-2 bg-slate-700 rounded-lg text-sm"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AdminLayout session={session} />}>
        <Route index element={<Dashboard />} />
        <Route path="catalog" element={<HaulageCatalogManager />} />
        <Route path="settings" element={<PlatformSettingsPage />} />
      </Route>
    </Routes>
  );
}
