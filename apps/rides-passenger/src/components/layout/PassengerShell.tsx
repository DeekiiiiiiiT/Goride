import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { HomeTripPickerProvider, useHomeTripPicker } from '@/contexts/HomeTripPickerContext';
import { PassengerBottomNav } from './PassengerBottomNav';

function PassengerShellInner() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const { tripPickerActive } = useHomeTripPicker();

  return (
    <div
      className={`flex min-h-[100dvh] flex-col ${isHome ? 'bg-[var(--home-bg,#f8f9fa)]' : 'bg-[var(--passenger-page-bg)] text-[var(--passenger-on-surface)]'}`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
      {!tripPickerActive && <PassengerBottomNav />}
    </div>
  );
}

/** Authenticated rider shell: tab content + fixed bottom navigation. */
export function PassengerShell() {
  return (
    <HomeTripPickerProvider>
      <PassengerShellInner />
    </HomeTripPickerProvider>
  );
}
