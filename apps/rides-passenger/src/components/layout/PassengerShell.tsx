import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PassengerBottomNav } from './PassengerBottomNav';

/** Authenticated rider shell: tab content + fixed bottom navigation. */
export function PassengerShell() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <div
      className={`flex min-h-[100dvh] flex-col ${isHome ? 'bg-[var(--home-bg,#f8f9fa)]' : 'bg-zinc-100 text-zinc-900'}`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
      <PassengerBottomNav />
    </div>
  );
}
