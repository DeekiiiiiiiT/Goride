import React from 'react';
import { Outlet } from 'react-router-dom';
import { PassengerBottomNav } from './PassengerBottomNav';

/** Authenticated rider shell: tab content + fixed bottom navigation. */
export function PassengerShell() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-100 text-zinc-900">
      <div className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </div>
      <PassengerBottomNav />
    </div>
  );
}
