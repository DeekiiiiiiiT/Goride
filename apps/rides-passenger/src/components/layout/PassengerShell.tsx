import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { HomeTripPickerProvider, useHomeTripPicker } from '@/contexts/HomeTripPickerContext';
import { useBookerTracking } from '@/contexts/BookerTrackingContext';
import { BookerActiveTripChip } from '@/components/BookerActiveTripChip';
import { PassengerBottomNav } from './PassengerBottomNav';
import { ensureRoamPassengerTag } from '@/services/roamTagEdge';
import { usePassengerActiveRideRedirect } from '@/hooks/usePassengerActiveRideRedirect';
import { BOOKER_CHIP_HEIGHT_PX } from '@/lib/bookerTracking';

function PassengerShellInner() {
  usePassengerActiveRideRedirect();
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const { tripPickerActive } = useHomeTripPicker();
  const { mode } = useBookerTracking();
  const chipVisible = mode === 'minimized' && !tripPickerActive;

  return (
    <div
      className={`flex min-h-[100dvh] flex-col ${isHome ? 'bg-[var(--home-bg,#f8f9fa)]' : 'bg-[var(--passenger-page-bg)] text-[var(--passenger-on-surface)]'}`}
      style={
        chipVisible
          ? ({ '--booker-chip-h': `${BOOKER_CHIP_HEIGHT_PX}px` } as React.CSSProperties)
          : undefined
      }
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={chipVisible ? { paddingBottom: 'var(--booker-chip-h, 0px)' } : undefined}
      >
        <Outlet />
      </div>
      {chipVisible && <BookerActiveTripChip />}
      {!tripPickerActive && <PassengerBottomNav />}
    </div>
  );
}

/** Authenticated rider shell: tab content + fixed bottom navigation. */
export function PassengerShell() {
  useEffect(() => {
    void ensureRoamPassengerTag().catch(() => {
      /* non-blocking — tag loads again on Roam Tag screens */
    });
  }, []);

  return (
    <HomeTripPickerProvider>
      <PassengerShellInner />
    </HomeTripPickerProvider>
  );
}
