import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CourierAppHeader } from '@/components/layout/CourierAppHeader';
import { AppShell } from '@/components/layout/AppShell';
import { useImmersiveMode } from '@/hooks/useImmersiveMode';
import { ImmersiveScreen } from '@/components/layout/ImmersiveScreen';
import { CourierBottomNav, type CourierTab } from '@/components/layout/CourierBottomNav';
import { LocationIssueSheet } from '@/components/home/LocationIssueSheet';
import { HomeOfflinePage } from '@/pages/home/HomeOfflinePage';
import { HomeGoingOnlinePage } from '@/pages/home/HomeGoingOnlinePage';
import { HomeOnlinePage } from '@/pages/home/HomeOnlinePage';
import { OfflineModePage } from '@/pages/home/OfflineModePage';
import { DeliveryOfferPage } from '@/pages/offers/DeliveryOfferPage';
import { OfferDetailsPage } from '@/pages/offers/OfferDetailsPage';
import { StackedOfferPage } from '@/pages/offers/StackedOfferPage';
import { ActiveDeliveryNavPage } from '@/pages/delivery/ActiveDeliveryNavPage';
import { AtRestaurantPage } from '@/pages/delivery/AtRestaurantPage';
import { EnRoutePage } from '@/pages/delivery/EnRoutePage';
import { AtCustomerPage } from '@/pages/delivery/AtCustomerPage';
import { ConfirmHandoffPage } from '@/pages/delivery/ConfirmHandoffPage';
import { CustomerUnavailablePage } from '@/pages/delivery/CustomerUnavailablePage';
import { DeliveryCompletePage } from '@/pages/delivery/DeliveryCompletePage';
import { ReportIssuePage } from '@/pages/delivery/ReportIssuePage';
import { OrderCancelledPage } from '@/pages/delivery/OrderCancelledPage';
import { StackedDeliveryPage } from '@/pages/delivery/StackedDeliveryPage';
import { UnassignConfirmModal } from '@/components/delivery/UnassignConfirmModal';
import { OfferPushBanner } from '@/components/ui/OfferPushBanner';
import { EarningsPage } from '@/pages/earnings/EarningsPage';
import { PromotionsPage } from '@/pages/earnings/PromotionsPage';
import { DeliveryDetailPage } from '@/pages/earnings/DeliveryDetailPage';
import { DashSummaryPage } from '@/pages/home/DashSummaryPage';
import { ActivityPage } from '@/pages/activity/ActivityPage';
import { AccountPage, type ProfileDestination } from '@/pages/profile/AccountPage';
import { EditProfilePage } from '@/pages/profile/EditProfilePage';
import { VehicleDetailsPage } from '@/pages/profile/VehicleDetailsPage';
import { CourierDocumentsPage } from '@/pages/profile/CourierDocumentsPage';
import { HelpSupportPage } from '@/pages/profile/HelpSupportPage';
import { NotificationSettingsPage } from '@/pages/profile/NotificationSettingsPage';
import { DashPreferencesPage } from '@/pages/profile/DashPreferencesPage';
import { RatingsStatsPage } from '@/pages/profile/RatingsStatsPage';
import { SettingsPage } from '@/pages/profile/SettingsPage';
import { PayoutSettingsPage } from '@/pages/profile/PayoutSettingsPage';
import type { DropoffMethod } from '@/lib/mockActiveDelivery';
import { MOCK_ACTIVE_DELIVERY } from '@/lib/mockActiveDelivery';
import { MOCK_CACHED_DELIVERY } from '@/lib/mockCachedDelivery';
import { MOCK_STACKED_DELIVERY } from '@/lib/mockStackedDelivery';
import {
  MOCK_DETAILED_OFFER,
  MOCK_SINGLE_OFFER,
  MOCK_STACKED_OFFER,
} from '@/lib/mockOffers';
import { useCourierFeedback } from '@/hooks/useCourierFeedback';
import { useBackgroundLocation } from '@/hooks/useBackgroundLocation';
import { toast } from '@/lib/toast';

type HomeMode = 'offline' | 'going-online' | 'online' | 'on-delivery';
type OfferPhase = null | 'stacked' | 'single' | 'details';
type DeliveryPhase =
  | null
  | 'stacked-active'
  | 'pickup-nav'
  | 'at-restaurant'
  | 'en-route'
  | 'at-customer'
  | 'confirm-handoff'
  | 'customer-unavailable'
  | 'complete'
  | 'order-cancelled';

type ProfileScreen =
  | 'edit-profile'
  | 'vehicle'
  | 'documents'
  | 'notifications'
  | 'preferences'
  | 'help'
  | 'settings'
  | 'ratings'
  | 'payout-settings'
  | null;

type CourierHomePageProps = {
  onSignOut?: () => void;
};

export function CourierHomePage({ onSignOut }: CourierHomePageProps) {
  const [mode, setMode] = useState<HomeMode>('offline');
  const [offerPhase, setOfferPhase] = useState<OfferPhase>(null);
  const [deliveryPhase, setDeliveryPhase] = useState<DeliveryPhase>(null);
  const [activeTab, setActiveTab] = useState<CourierTab>('home');
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [acceptedStacked, setAcceptedStacked] = useState(false);
  const [profileScreen, setProfileScreen] = useState<ProfileScreen>(null);
  const [showUnassignModal, setShowUnassignModal] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [dashSummaryOpen, setDashSummaryOpen] = useState(false);
  const [promotionsOpen, setPromotionsOpen] = useState(false);
  const [locationIssueOpen, setLocationIssueOpen] = useState(false);
  const [networkOffline, setNetworkOffline] = useState(false);
  const [pushBannerOpen, setPushBannerOpen] = useState(false);
  const hasResolvedLocation = useRef(false);
  const feedback = useCourierFeedback();
  const isOnline = mode === 'online' || mode === 'on-delivery';
  const { coords } = useBackgroundLocation(isOnline);
  const mapOffset = coords
    ? {
        x: 50 + (coords.lng + 76.8099) * 800,
        y: 50 + (coords.lat - 18.0179) * 800,
      }
    : { x: 50, y: 50 };

  const hasActiveOffer = offerPhase !== null;
  const isOnDelivery = mode === 'on-delivery' && deliveryPhase !== null;
  const hasOverlay =
    selectedDeliveryId !== null ||
    profileScreen !== null ||
    dashSummaryOpen ||
    promotionsOpen ||
    networkOffline;
  const showBottomNav = !hasActiveOffer && !isOnDelivery && !hasOverlay && !networkOffline;

  const isImmersive =
    hasActiveOffer ||
    isOnDelivery ||
    networkOffline ||
    locationIssueOpen ||
    dashSummaryOpen ||
    promotionsOpen ||
    reportIssueOpen ||
    showUnassignModal;

  useImmersiveMode(isImmersive);

  const finishDelivery = useCallback(() => {
    feedback.onComplete();
    toast.success('Delivery complete!', 'Earnings added to your balance.');
    setDeliveryPhase(null);
    setAcceptedStacked(false);
    setMode('online');
    setActiveTab('home');
  }, [feedback]);

  const handleOfferReceived = useCallback(() => {
    if (mode === 'online' && offerPhase === null) {
      feedback.onOfferReceived();
      toast.info('New offer incoming', 'Tap to view before it expires.');
      if (document.hidden) {
        setPushBannerOpen(true);
      } else {
        setOfferPhase('stacked');
      }
    }
  }, [mode, offerPhase, feedback]);

  const handleDeclineOffer = useCallback(() => {
    if (offerPhase === 'stacked') {
      setOfferPhase('single');
      return;
    }
    setOfferPhase(null);
  }, [offerPhase]);

  const handleAcceptStackedOffer = useCallback(() => {
    feedback.onAccept();
    toast.success('Offer accepted', 'Head to the restaurant to pick up.');
    setOfferPhase(null);
    setAcceptedStacked(true);
    setMode('on-delivery');
    setDeliveryPhase('stacked-active');
    setActiveTab('home');
  }, [feedback]);

  const handleAcceptSingleOffer = useCallback(() => {
    feedback.onAccept();
    toast.success('Offer accepted', 'Navigation started to pickup.');
    setOfferPhase(null);
    setAcceptedStacked(false);
    setMode('on-delivery');
    setDeliveryPhase('pickup-nav');
    setActiveTab('home');
  }, [feedback]);

  const handleUnassign = useCallback(() => {
    setShowUnassignModal(false);
    setReportIssueOpen(false);
    setDeliveryPhase(null);
    setAcceptedStacked(false);
    setMode('online');
  }, []);

  const handleRequestUnassign = useCallback(() => {
    setShowUnassignModal(true);
  }, []);

  const handleReportIssueSubmit = useCallback((issueId: string) => {
    setReportIssueOpen(false);
    if (issueId === 'restaurant_closed' || issueId === 'customer_unavailable') {
      setDeliveryPhase('order-cancelled');
    }
  }, []);

  useEffect(() => {
    if (mode !== 'going-online') return undefined;

    const timer = window.setTimeout(() => {
      if (!hasResolvedLocation.current) {
        setLocationIssueOpen(true);
        return;
      }
      setMode('online');
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [mode]);

  const handleLocationRetry = useCallback(() => {
    hasResolvedLocation.current = true;
    setLocationIssueOpen(false);
    setMode('online');
    toast.success('Location found', 'You are now online and receiving offers.');
  }, []);

  const handleConnectionLost = useCallback(() => {
    setNetworkOffline(true);
    feedback.onError();
    toast.error('Connection lost', 'Showing cached delivery data.');
  }, [feedback]);

  const handleRetryConnection = useCallback(() => {
    setNetworkOffline(false);
    toast.success('Back online', 'Connection restored.');
  }, []);

  const handleAtCustomerComplete = useCallback((method: DropoffMethod) => {
    if (method === 'hand-to-customer') {
      setDeliveryPhase('confirm-handoff');
    } else {
      setDeliveryPhase('complete');
    }
  }, []);

  const handleProfileNavigate = useCallback((destination: ProfileDestination) => {
    const screenMap: Partial<Record<ProfileDestination, ProfileScreen>> = {
      'edit-profile': 'edit-profile',
      vehicle: 'vehicle',
      documents: 'documents',
      notifications: 'notifications',
      preferences: 'preferences',
      help: 'help',
      about: 'settings',
      earnings: 'payout-settings',
    };
    const screen = screenMap[destination];
    if (screen) {
      setProfileScreen(screen);
      return;
    }
  }, []);

  const resumeActiveDelivery = useCallback(() => {
    setActiveTab('home');
    if (!isOnDelivery) {
      setMode('on-delivery');
      setDeliveryPhase('en-route');
    }
  }, [isOnDelivery]);

  const headerStatus =
    mode === 'going-online'
      ? { label: 'Online', tone: 'connecting' as const }
      : mode === 'online' || mode === 'on-delivery'
        ? { label: 'Online', tone: 'online' as const }
        : { label: 'Offline', tone: 'offline' as const };

  const hideMainHeader =
    hasActiveOffer ||
    isOnDelivery ||
    hasOverlay ||
    dashSummaryOpen ||
    promotionsOpen ||
    networkOffline ||
    locationIssueOpen ||
    activeTab === 'earnings' ||
    activeTab === 'activity' ||
    activeTab === 'account';

  const renderTabContent = () => {
    if (activeTab === 'activity') {
      return (
        <ActivityPage
          embedded
          hasActiveDelivery={isOnDelivery || mode === 'online'}
          onDeliverySelect={setSelectedDeliveryId}
          onViewActiveDelivery={resumeActiveDelivery}
        />
      );
    }
    if (activeTab === 'earnings') {
      return (
        <EarningsPage
          onDeliverySelect={setSelectedDeliveryId}
          onViewAllHistory={() => setActiveTab('activity')}
          onViewPromotions={() => setPromotionsOpen(true)}
        />
      );
    }
    if (activeTab === 'account') {
      return (
        <AccountPage
          onNavigate={handleProfileNavigate}
          onSignOut={() => onSignOut?.()}
          onRatingTap={() => setProfileScreen('ratings')}
        />
      );
    }

    if (mode === 'going-online') {
      return <HomeGoingOnlinePage />;
    }

    if (mode === 'online') {
      return (
        <HomeOnlinePage
          onRequestEndDash={() => setDashSummaryOpen(true)}
          onOfferReceived={handleOfferReceived}
          onViewPromotions={() => setPromotionsOpen(true)}
          mapOffset={mapOffset}
        />
      );
    }

    return <HomeOfflinePage onGoOnline={() => setMode('going-online')} />;
  };

  return (
    <AppShell>
      <div className={showBottomNav ? 'app-shell-main' : 'flex flex-1 flex-col min-h-0'}>
        <CourierAppHeader
          statusLabel={headerStatus.label}
          statusTone={headerStatus.tone}
          hideStatus={hideMainHeader}
        />

        {renderTabContent()}
      </div>

      {showBottomNav && <CourierBottomNav active={activeTab} onChange={setActiveTab} />}

      {offerPhase === 'stacked' && (
        <ImmersiveScreen>
          <StackedOfferPage
            offer={MOCK_STACKED_OFFER}
            onDecline={handleDeclineOffer}
            onAccept={handleAcceptStackedOffer}
          />
        </ImmersiveScreen>
      )}

      {offerPhase === 'single' && (
        <ImmersiveScreen>
          <DeliveryOfferPage
            offer={MOCK_SINGLE_OFFER}
            onClose={handleDeclineOffer}
            onDecline={handleDeclineOffer}
            onAccept={handleAcceptSingleOffer}
            onViewDetails={() => setOfferPhase('details')}
            onOfferShown={feedback.onOfferReceived}
          />
        </ImmersiveScreen>
      )}

      {offerPhase === 'details' && (
        <ImmersiveScreen className="z-[70]">
          <OfferDetailsPage
            offer={MOCK_DETAILED_OFFER}
            onBack={() => setOfferPhase('single')}
            onDecline={handleDeclineOffer}
            onAccept={handleAcceptSingleOffer}
          />
        </ImmersiveScreen>
      )}

      {deliveryPhase === 'stacked-active' && (
        <ImmersiveScreen>
          <StackedDeliveryPage
            delivery={MOCK_STACKED_DELIVERY}
            onBack={handleRequestUnassign}
            onArrived={() => setDeliveryPhase('at-restaurant')}
          />
        </ImmersiveScreen>
      )}

      {deliveryPhase === 'pickup-nav' && !acceptedStacked && (
        <ImmersiveScreen>
          <ActiveDeliveryNavPage
            delivery={MOCK_ACTIVE_DELIVERY}
            onArrived={() => setDeliveryPhase('at-restaurant')}
          />
        </ImmersiveScreen>
      )}

      {deliveryPhase === 'at-restaurant' && (
        <AtRestaurantPage
          delivery={MOCK_ACTIVE_DELIVERY}
          onClose={handleRequestUnassign}
          onConfirmPickup={() => setDeliveryPhase('en-route')}
          onRequestUnassign={handleRequestUnassign}
          onReportIssue={() => setReportIssueOpen(true)}
        />
      )}

      {deliveryPhase === 'en-route' && !networkOffline && (
        <EnRoutePage
          delivery={MOCK_ACTIVE_DELIVERY}
          onArrived={() => setDeliveryPhase('at-customer')}
          onConnectionLost={handleConnectionLost}
        />
      )}

      {deliveryPhase === 'at-customer' && (
        <AtCustomerPage
          delivery={MOCK_ACTIVE_DELIVERY}
          onBack={() => setDeliveryPhase('en-route')}
          onComplete={handleAtCustomerComplete}
          onCustomerUnavailable={() => setDeliveryPhase('customer-unavailable')}
        />
      )}

      {deliveryPhase === 'confirm-handoff' && (
        <ConfirmHandoffPage
          onBack={() => setDeliveryPhase('at-customer')}
          onComplete={() => setDeliveryPhase('complete')}
          onCustomerUnavailable={() => setDeliveryPhase('customer-unavailable')}
        />
      )}

      {deliveryPhase === 'customer-unavailable' && (
        <CustomerUnavailablePage
          onClose={() => setDeliveryPhase('at-customer')}
          onLeaveAtSafeLocation={() => setDeliveryPhase('complete')}
        />
      )}

      {deliveryPhase === 'complete' && (
        <DeliveryCompletePage delivery={MOCK_ACTIVE_DELIVERY} onBackToDash={finishDelivery} />
      )}

      {deliveryPhase === 'order-cancelled' && (
        <OrderCancelledPage onBackToDash={finishDelivery} />
      )}

      {reportIssueOpen && isOnDelivery && (
        <ReportIssuePage
          delivery={MOCK_ACTIVE_DELIVERY}
          onClose={() => setReportIssueOpen(false)}
          onSubmit={handleReportIssueSubmit}
          onRequestUnassign={handleRequestUnassign}
        />
      )}

      <UnassignConfirmModal
        open={showUnassignModal}
        onConfirm={handleUnassign}
        onCancel={() => setShowUnassignModal(false)}
      />

      {dashSummaryOpen && (
        <DashSummaryPage
          onEndDash={() => {
            setDashSummaryOpen(false);
            setOfferPhase(null);
            setMode('offline');
          }}
          onStayOnline={() => setDashSummaryOpen(false)}
        />
      )}

      {promotionsOpen && (
        <PromotionsPage onBack={() => setPromotionsOpen(false)} />
      )}

      {selectedDeliveryId && (
        <DeliveryDetailPage onBack={() => setSelectedDeliveryId(null)} />
      )}

      {pushBannerOpen && (
        <OfferPushBanner
          restaurant={MOCK_SINGLE_OFFER.restaurant}
          earnings={MOCK_SINGLE_OFFER.earnings}
          secondsLeft={90}
          onTap={() => {
            setPushBannerOpen(false);
            setOfferPhase('single');
          }}
          onDismiss={() => setPushBannerOpen(false)}
        />
      )}

      {profileScreen === 'edit-profile' && (
        <EditProfilePage
          onBack={() => setProfileScreen(null)}
          onSave={() => setProfileScreen(null)}
        />
      )}

      {profileScreen === 'vehicle' && (
        <VehicleDetailsPage onBack={() => setProfileScreen(null)} />
      )}

      {profileScreen === 'documents' && (
        <CourierDocumentsPage onBack={() => setProfileScreen(null)} />
      )}

      {profileScreen === 'notifications' && (
        <NotificationSettingsPage onBack={() => setProfileScreen(null)} />
      )}

      {profileScreen === 'preferences' && (
        <DashPreferencesPage onBack={() => setProfileScreen(null)} />
      )}

      {profileScreen === 'help' && (
        <HelpSupportPage onBack={() => setProfileScreen(null)} />
      )}

      {profileScreen === 'settings' && (
        <SettingsPage onBack={() => setProfileScreen(null)} />
      )}

      {profileScreen === 'ratings' && (
        <RatingsStatsPage onBack={() => setProfileScreen(null)} />
      )}

      {profileScreen === 'payout-settings' && (
        <PayoutSettingsPage onBack={() => setProfileScreen(null)} />
      )}

      {locationIssueOpen && (
        <LocationIssueSheet
          onOpenSettings={() => window.alert('Open device location settings')}
          onRetry={handleLocationRetry}
        />
      )}

      {networkOffline && (
        <OfflineModePage
          delivery={MOCK_CACHED_DELIVERY}
          onRetry={handleRetryConnection}
          onProfileClick={() => {
            setNetworkOffline(false);
            setActiveTab('account');
          }}
        />
      )}
    </AppShell>
  );
}
