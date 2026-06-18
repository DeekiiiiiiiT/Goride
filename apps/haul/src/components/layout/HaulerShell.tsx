import React from 'react';
import { DispatchConfigProvider, HAUL_DISPATCH_CONFIG } from '@roam/hauler-dispatch';
import { RideDispatchProvider } from '@roam/driver-internals/contexts/RideDispatchContext';
import { ActiveRideRecoveryProvider } from '@roam/driver-internals/contexts/ActiveRideRecoveryContext';
import { RideDispatchHome } from '@roam/driver-internals/components/rides/RideDispatchHome';
import { DriverTripRequestOverlay } from '@roam/driver-internals/components/rides/DriverTripRequestOverlay';
import { DriverEnRouteOverlay } from '@roam/driver-internals/components/rides/DriverEnRouteOverlay';
import { DriverOnTripOverlay } from '@roam/driver-internals/components/rides/DriverOnTripOverlay';
import { DriverCashSettlementOverlay } from '@roam/driver-internals/components/rides/DriverCashSettlementOverlay';
import { DriverDigitalTripCompleteOverlay } from '@roam/driver-internals/components/rides/DriverDigitalTripCompleteOverlay';
import { DriverArrivedPickupOverlay } from '@roam/driver-internals/components/rides/DriverArrivedPickupOverlay';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut } from 'lucide-react';

export function HaulerShell() {
  const { signOut, user } = useAuth();

  return (
    <DispatchConfigProvider config={HAUL_DISPATCH_CONFIG}>
      <ActiveRideRecoveryProvider>
        <RideDispatchProvider>
          <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
            <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div>
                <p className="text-xs uppercase tracking-widest text-amber-500/80 font-medium">Roam Haul</p>
                <p className="text-sm text-slate-400">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                aria-label="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </header>
            <main className="flex-1 p-4 max-w-lg mx-auto w-full">
              <RideDispatchHome embedded />
            </main>
          </div>
          <DriverTripRequestOverlay />
          <DriverEnRouteOverlay />
          <DriverOnTripOverlay />
          <DriverCashSettlementOverlay />
          <DriverDigitalTripCompleteOverlay />
          <DriverArrivedPickupOverlay />
        </RideDispatchProvider>
      </ActiveRideRecoveryProvider>
    </DispatchConfigProvider>
  );
}
