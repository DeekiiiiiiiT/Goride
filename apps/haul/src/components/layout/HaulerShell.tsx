import React, { useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { DispatchConfigProvider, HAUL_DISPATCH_CONFIG } from '@roam/hauler-dispatch';
import { RideDispatchProvider } from '@roam/driver-internals/contexts/RideDispatchContext';
import { ActiveRideRecoveryProvider } from '@roam/driver-internals/contexts/ActiveRideRecoveryContext';
import { useRideDispatchContext } from '@roam/driver-internals/contexts/RideDispatchContext';
import { HaulEnRouteOverlay } from '../trip/HaulEnRouteOverlay';
import { HaulOnTripOverlay } from '../trip/HaulOnTripOverlay';
import { HaulArrivedPickupOverlay } from '../trip/HaulArrivedPickupOverlay';
import { HaulDeliveryCompleteOverlay } from '../trip/HaulDeliveryCompleteOverlay';
import { HaulCashSettlementOverlay } from '../trip/HaulCashSettlementOverlay';
import { HaulTripUiOverlays } from '../trip/HaulTripUiOverlays';
import { useAuth } from '../../contexts/AuthContext';
import { HaulTripUiProvider } from '../../contexts/HaulTripUiContext';
import { HaulTopAppBar } from './HaulTopAppBar';
import { HaulBottomNav, type HaulTab } from './HaulBottomNav';
import { HaulDashboardHome } from '../home/HaulDashboardHome';
import { HaulFreightRequestOverlay } from '../dispatch/HaulFreightRequestOverlay';
import { HaulEarningsSection, isEarningsSubpage, type EarningsRoute } from '../earnings/HaulEarningsSection';
import { HaulJobDetailPage } from '../earnings/HaulJobDetailPage';
import { HaulOfflineOverlay } from './HaulOfflineOverlay';
import {
  HaulProfileSection,
  isProfileSubpage,
  type ProfileRoute,
} from '../profile/HaulProfileSection';
import { HaulLoadsSection, type LoadsView } from '../loads/HaulLoadsSection';
import type { HaulScheduledJob } from '../../lib/haulScheduledJobs';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { toast } from 'sonner';

function HaulMainContent({
  tab,
  profileRoute,
  onProfileNavigate,
  earningsRoute,
  onEarningsNavigate,
  loadsView,
  onLoadsViewChange,
  previewJob,
  onSelectScheduledJob,
  onClearScheduledPreview,
  onBrowseLoadBoard,
  selectedTrip,
  onSelectTrip,
  onClearTrip,
  onGoToEarnings,
  onGoToPayouts,
  onGoToLoads,
  onSignOut,
}: {
  tab: HaulTab;
  profileRoute: ProfileRoute;
  onProfileNavigate: (route: ProfileRoute) => void;
  earningsRoute: EarningsRoute;
  onEarningsNavigate: (route: EarningsRoute) => void;
  loadsView: LoadsView;
  onLoadsViewChange: (view: LoadsView) => void;
  previewJob: HaulScheduledJob | null;
  onSelectScheduledJob: (job: HaulScheduledJob) => void;
  onClearScheduledPreview: () => void;
  onBrowseLoadBoard: () => void;
  selectedTrip: RideRequestRow | null;
  onSelectTrip: (trip: RideRequestRow) => void;
  onClearTrip: () => void;
  onGoToEarnings: () => void;
  onGoToPayouts: () => void;
  onGoToLoads: () => void;
  onSignOut: () => void;
}) {
  const { online, goingOnline, toggleOnline } = useRideDispatchContext();

  if (selectedTrip) {
    return <HaulJobDetailPage trip={selectedTrip} onBack={onClearTrip} />;
  }

  if (tab === 'profile' && isProfileSubpage(profileRoute)) {
    return (
      <HaulProfileSection
        route={profileRoute}
        onNavigate={onProfileNavigate}
        onGoToEarnings={onGoToPayouts}
        onSignOut={onSignOut}
      />
    );
  }

  if (tab === 'loads') {
    return (
      <HaulLoadsSection
        view={loadsView}
        onViewChange={onLoadsViewChange}
        previewJob={previewJob}
        onSelectJob={onSelectScheduledJob}
        onClearPreview={onClearScheduledPreview}
        onBrowseBoard={onBrowseLoadBoard}
      />
    );
  }
  if (tab === 'earnings') {
    return (
      <HaulEarningsSection
        route={earningsRoute}
        onNavigate={onEarningsNavigate}
        onSelectTrip={onSelectTrip}
        onViewLoads={onGoToLoads}
      />
    );
  }
  if (tab === 'profile') {
    return (
      <HaulProfileSection
        route="hub"
        onNavigate={onProfileNavigate}
        onGoToEarnings={onGoToPayouts}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <HaulDashboardHome
      online={online}
      goingOnline={goingOnline}
      onToggleOnline={() => void toggleOnline()}
    />
  );
}

export function HaulerShell() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<HaulTab>('dashboard');

  return (
    <DispatchConfigProvider config={HAUL_DISPATCH_CONFIG}>
      <ActiveRideRecoveryProvider>
        <RideDispatchProvider>
          <HaulTripUiProvider>
            <HaulerShellInner tab={tab} setTab={setTab} onSignOut={() => void signOut()} />
          </HaulTripUiProvider>
        </RideDispatchProvider>
      </ActiveRideRecoveryProvider>
    </DispatchConfigProvider>
  );
}

function HaulerShellInner({
  tab,
  setTab,
  onSignOut,
}: {
  tab: HaulTab;
  setTab: (t: HaulTab) => void;
  onSignOut: () => void;
}) {
  const { online: dispatchOnline, activeRide } = useRideDispatchContext();
  const { online: networkOnline, retry } = useNetworkStatus();
  const [selectedTrip, setSelectedTrip] = useState<RideRequestRow | null>(null);
  const [profileRoute, setProfileRoute] = useState<ProfileRoute>('hub');
  const [earningsRoute, setEarningsRoute] = useState<EarningsRoute>('main');
  const [loadsView, setLoadsView] = useState<LoadsView>('scheduled');
  const [previewJob, setPreviewJob] = useState<HaulScheduledJob | null>(null);

  const profileFullscreen = tab === 'profile' && isProfileSubpage(profileRoute);
  const earningsFullscreen = tab === 'earnings' && isEarningsSubpage(earningsRoute);
  const loadsFullscreen = tab === 'loads' && previewJob !== null;
  const showChrome = !selectedTrip && !profileFullscreen && !earningsFullscreen && !loadsFullscreen;

  const handleTabChange = (next: HaulTab) => {
    if (next !== 'profile') setProfileRoute('hub');
    if (next !== 'earnings') setEarningsRoute('main');
    if (next !== 'loads') {
      setPreviewJob(null);
      setLoadsView('scheduled');
    }
    setTab(next);
  };

  const handleGoToEarnings = () => {
    setProfileRoute('hub');
    setEarningsRoute('main');
    setTab('earnings');
  };

  const handleGoToPayouts = () => {
    setProfileRoute('hub');
    setEarningsRoute('payouts');
    setTab('earnings');
  };

  const handleGoToLoads = () => {
    setEarningsRoute('main');
    setPreviewJob(null);
    setLoadsView('board');
    setTab('loads');
  };

  const handleBrowseLoadBoard = () => {
    setPreviewJob(null);
    setLoadsView('board');
  };

  const handleViewCachedManifest = () => {
    if (activeRide?.haulage_manifest?.summary) {
      toast.info(`Cached: ${activeRide.haulage_manifest.summary}`);
    } else if (activeRide) {
      toast.info('Active job manifest is cached locally.');
    } else {
      toast.info('No active job manifest cached.');
    }
  };

  return (
    <>
      <div className="flex min-h-[100dvh] flex-col bg-[#0b1326] text-[#dae2fd]">
        {showChrome ? (
          <HaulTopAppBar online={dispatchOnline} onProfileClick={() => handleTabChange('profile')} />
        ) : null}
        <main
          className={`mx-auto w-full max-w-3xl flex-1 md:max-w-xl lg:max-w-3xl ${
            showChrome
              ? 'safe-x pt-[var(--app-top-bar-total)] pb-[var(--app-bottom-nav-total)]'
              : profileFullscreen || earningsFullscreen || loadsFullscreen
                ? ''
                : 'safe-x py-4'
          }`}
        >
          <HaulMainContent
            tab={tab}
            profileRoute={profileRoute}
            onProfileNavigate={setProfileRoute}
            earningsRoute={earningsRoute}
            onEarningsNavigate={setEarningsRoute}
            loadsView={loadsView}
            onLoadsViewChange={setLoadsView}
            previewJob={previewJob}
            onSelectScheduledJob={setPreviewJob}
            onClearScheduledPreview={() => setPreviewJob(null)}
            onBrowseLoadBoard={handleBrowseLoadBoard}
            selectedTrip={selectedTrip}
            onSelectTrip={setSelectedTrip}
            onClearTrip={() => setSelectedTrip(null)}
            onGoToEarnings={handleGoToEarnings}
            onGoToPayouts={handleGoToPayouts}
            onGoToLoads={handleGoToLoads}
            onSignOut={onSignOut}
          />
        </main>
        {showChrome ? <HaulBottomNav active={tab} onChange={handleTabChange} /> : null}
      </div>
      {!networkOnline ? (
        <HaulOfflineOverlay onRetry={retry} onViewManifest={handleViewCachedManifest} />
      ) : null}
      <HaulFreightRequestOverlay />
      <HaulEnRouteOverlay />
      <HaulArrivedPickupOverlay />
      <HaulOnTripOverlay />
      <HaulCashSettlementOverlay />
      <HaulDeliveryCompleteOverlay />
      <HaulTripUiOverlays />
    </>
  );
}
