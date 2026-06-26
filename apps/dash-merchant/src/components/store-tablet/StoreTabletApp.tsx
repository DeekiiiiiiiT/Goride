import { useCallback, useMemo, useState } from 'react';
import type { Merchant } from '../../hooks/useMerchant';
import type { RosterMember } from '../../types/team';
import { ROLE_DEFAULT_PERMISSIONS } from '../../types/team';
import { clearShift, getActingMember } from '../../lib/station-shift-session';
import {
  clearDeviceSession,
  readDeviceSession,
} from '../../lib/store-tablet-session';
import { revokeStoreTabletDevice } from '../../lib/partner-api';
import StoreTabletChrome from './StoreTabletChrome';
import StoreTabletFlow from './StoreTabletFlow';
import StationKioskFlow from '../staff-ops/station/StationKioskFlow';
import ActingShiftBar from '../staff-ops/station/ActingShiftBar';
import CounterOrdersPage from '../../pages/staff-ops/CounterOrdersPage';
import KitchenQueuePage from '../../pages/staff-ops/KitchenQueuePage';
import PosRegisterPage from '../../pages/restaurant-mgmt/PosRegisterPage';
import DashboardPage from '../../pages/DashboardPage';
import OrdersPage from '../../pages/OrdersPage';
import { hasCapability, CAPABILITY_IN_STORE } from '../../lib/merchant-capabilities';

type TabletView = 'pairing' | 'kiosk' | 'station';

export default function StoreTabletApp() {
  const [deviceSession, setDeviceSession] = useState(() => readDeviceSession());
  const [routingEpoch, setRoutingEpoch] = useState(0);
  const actingMember = deviceSession ? getActingMember(deviceSession.merchantId) : null;

  const merchant = useMemo((): Merchant | null => {
    if (!deviceSession) return null;
    return {
      id: deviceSession.merchantId,
      name: deviceSession.storeName,
      verification_status: 'approved',
    } as Merchant;
  }, [deviceSession]);

  const refresh = useCallback(() => {
    setDeviceSession(readDeviceSession());
    setRoutingEpoch((n) => n + 1);
  }, []);

  const handleUnpair = async () => {
    try {
      await revokeStoreTabletDevice();
    } catch {
      // still clear locally if network fails
    }
    if (deviceSession) clearShift(deviceSession.merchantId);
    clearDeviceSession();
    setDeviceSession(null);
    setRoutingEpoch((n) => n + 1);
  };

  const handleShiftStarted = (member: RosterMember) => {
    setRoutingEpoch((n) => n + 1);
    if (
      deviceSession?.station === 'manager' ||
      member.role === 'manager'
    ) {
      // manager lands on dashboard view inside station mode
    }
  };

  const handleEndShift = () => {
    if (deviceSession) clearShift(deviceSession.merchantId);
    refresh();
  };

  if (!deviceSession) {
    return (
      <StoreTabletFlow
        onPaired={refresh}
        onBack={() => {
          window.location.href = '/';
        }}
      />
    );
  }

  const view: TabletView = actingMember ? 'station' : 'kiosk';

  const stationContent = (() => {
    if (!merchant || !actingMember) return null;
    const noop = () => {};
    if (deviceSession.station === 'counter') {
      return (
        <CounterOrdersPage
          merchant={merchant}
          staffName={actingMember.name}
          onNavigate={noop}
        />
      );
    }
    if (deviceSession.station === 'kitchen') {
      return (
        <KitchenQueuePage
          merchant={merchant}
          staffName={actingMember.name}
          onNavigate={noop}
        />
      );
    }
    if (deviceSession.station === 'pos') {
      return (
        <PosRegisterPage
          merchant={merchant}
          useApi={hasCapability(merchant, CAPABILITY_IN_STORE)}
        />
      );
    }
    const perms = ROLE_DEFAULT_PERMISSIONS[actingMember.role];
    if (perms.includes('analytics') && perms.includes('menu')) {
      return <DashboardPage merchant={merchant} onNavigate={noop} />;
    }
    return <OrdersPage merchant={merchant} onNavigate={noop} />;
  })();

  return (
    <StoreTabletChrome
      storeName={deviceSession.storeName}
      station={deviceSession.station}
      onUnpair={() => void handleUnpair()}
    >
      {view === 'kiosk' && (
        <StationKioskFlow
          key={`kiosk-${routingEpoch}`}
          merchantId={deviceSession.merchantId}
          storeName={deviceSession.storeName}
          initialStationFilter={deviceSession.station}
          lockStationFilter
          onShiftStarted={handleShiftStarted}
        />
      )}
      {view === 'station' && actingMember && merchant && (
        <>
          <ActingShiftBar
            merchantId={deviceSession.merchantId}
            member={actingMember}
            onEnded={handleEndShift}
          />
          {stationContent}
        </>
      )}
    </StoreTabletChrome>
  );
}
