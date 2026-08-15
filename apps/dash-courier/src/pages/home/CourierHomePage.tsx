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
import { AtStorePage } from '@/pages/delivery/AtStorePage';
import { AgeVerifyHandoffPage } from '@/pages/delivery/AgeVerifyHandoffPage';
import { EnRoutePage } from '@/pages/delivery/EnRoutePage';
import { AtCustomerPage } from '@/pages/delivery/AtCustomerPage';
import { ConfirmHandoffPage } from '@/pages/delivery/ConfirmHandoffPage';
import { CustomerUnavailablePage } from '@/pages/delivery/CustomerUnavailablePage';
import { DeliveryCompletePage } from '@/pages/delivery/DeliveryCompletePage';
import { ReportIssuePage } from '@/pages/delivery/ReportIssuePage';
import { OrderCancelledPage } from '@/pages/delivery/OrderCancelledPage';
import { StackedDeliveryFlow } from '@/pages/delivery/stacked/StackedDeliveryFlow';
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
import { EditVehiclePage } from '@/pages/profile/EditVehiclePage';
import { CourierDocumentsPage } from '@/pages/profile/CourierDocumentsPage';
import { HelpSupportPage } from '@/pages/profile/HelpSupportPage';
import { HelpTopicPage } from '@/pages/profile/HelpTopicPage';
import { NotificationSettingsPage } from '@/pages/profile/NotificationSettingsPage';
import { DashPreferencesPage } from '@/pages/profile/DashPreferencesPage';
import { RatingsStatsPage } from '@/pages/profile/RatingsStatsPage';
import { SettingsPage } from '@/pages/profile/SettingsPage';
import { AboutPage } from '@/pages/profile/AboutPage';
import { PayoutSettingsPage } from '@/pages/profile/PayoutSettingsPage';
import { PayoutHistoryPage } from '@/pages/profile/PayoutHistoryPage';
import { DeclineReasonSheet } from '@/components/offers/DeclineReasonSheet';
import type { DeclineReasonId } from '@/lib/declineReasons';
import { persistDeclineReason } from '@/lib/declineReasonStorage';
import type { ActiveDelivery, DropoffMethod } from '@/lib/mockActiveDelivery';
import { emptyActiveDelivery, mapOrderToActiveDelivery } from '@/lib/mapOrderToActiveDelivery';
import { mapOrderToSingleOffer } from '@/lib/mapOrderToSingleOffer';
import { MOCK_CACHED_DELIVERY } from '@/lib/mockCachedDelivery';
import { MOCK_SINGLE_OFFER, MOCK_STACKED_OFFER, type SingleOffer } from '@/lib/mockOffers';
import { useCourierFeedback } from '@/hooks/useCourierFeedback';
import { useBackgroundLocation } from '@/hooks/useBackgroundLocation';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useCourierDispatch } from '@/hooks/useCourierDispatch';
import { OfflineError, assertOnline } from '@/lib/networkGuard';
import { loadCourierProfile } from '@/lib/courierProfileService';
import {
  patchCourierLocation,
  putCourierAvailability,
  submitCourierIssue,
  updateCourierOrderStatus,
  type AvailableOrder,
} from '@/lib/courierApi';
import { nextClientSeq } from '@/lib/locationSeq';
import { realDispatchProvider } from '@/services/courierDispatch/RealDispatchProvider';
import { toast } from '@/lib/toast';

type ProfileScreen =
  | 'edit-profile'
  | 'vehicle'
  | 'edit-vehicle'
  | 'documents'
  | 'notifications'
  | 'preferences'
  | 'help'
  | 'help-topic'
  | 'settings'
  | 'about'
  | 'ratings'
  | 'payout-settings'
  | 'payout-history'
  | null;

type CourierHomePageProps = {
  onSignOut?: () => void;
};

export function CourierHomePage({ onSignOut }: CourierHomePageProps) {
  const dispatch = useCourierDispatch();
  const { mode, offerPhase, deliveryPhase, acceptedStacked, provider } = dispatch;
  const [activeTab, setActiveTab] = useState<CourierTab>('home');
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [profileScreen, setProfileScreen] = useState<ProfileScreen>(null);
  const [helpTopicId, setHelpTopicId] = useState<string | null>(null);
  const [showUnassignModal, setShowUnassignModal] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [dashSummaryOpen, setDashSummaryOpen] = useState(false);
  const [promotionsOpen, setPromotionsOpen] = useState(false);
  const [locationIssueOpen, setLocationIssueOpen] = useState(false);
  const [ageVerifyOpen, setAgeVerifyOpen] = useState(false);
  const [declineReasonOpen, setDeclineReasonOpen] = useState(false);
  const [pushBannerOpen, setPushBannerOpen] = useState(false);
  const [courierName, setCourierName] = useState<string | undefined>();
  const [completionRate, setCompletionRate] = useState<number | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<ActiveDelivery | null>(null);
  const delivery = activeDelivery ?? emptyActiveDelivery();
  const hasActiveDeliveryData = Boolean(activeDelivery?.orderId);
    const locationSeqRef = useRef(0);
    const hasResolvedLocation = useRef(false);
    const feedback = useCourierFeedback();
  const { isOnline: networkOnline } = useNetworkStatus();
  const networkOffline = !networkOnline;
  const isOnline = mode === 'online' || mode === 'on-delivery';
  const { coords } = useBackgroundLocation(isOnline);

  const getProviderPendingOrder = useCallback((): AvailableOrder | null => {
    if (
      'getPendingOrder' in provider &&
      typeof (provider as { getPendingOrder?: () => AvailableOrder | null }).getPendingOrder ===
        'function'
    ) {
      return (provider as { getPendingOrder: () => AvailableOrder | null }).getPendingOrder();
    }
    return null;
  }, [provider]);

  const getProviderOfferId = useCallback((): string => {
    if (
      'getCurrentOfferId' in provider &&
      typeof (provider as { getCurrentOfferId?: () => string }).getCurrentOfferId === 'function'
    ) {
      return (provider as { getCurrentOfferId: () => string }).getCurrentOfferId();
    }
    return '';
  }, [provider]);

  const getProviderLastCoords = useCallback((): { lat?: number; lng?: number } => {
    if (
      'getLastCoords' in provider &&
      typeof (provider as { getLastCoords?: () => { lat?: number; lng?: number } }).getLastCoords ===
        'function'
    ) {
      return (provider as { getLastCoords: () => { lat?: number; lng?: number } }).getLastCoords();
    }
    return coords ? { lat: coords.lat, lng: coords.lng } : {};
  }, [provider, coords]);

  const currentSingleOffer: SingleOffer = (() => {
    const pending = getProviderPendingOrder();
    const mapped = mapOrderToSingleOffer(pending, getProviderLastCoords());
    return mapped || MOCK_SINGLE_OFFER;
  })();
  // Transmit GPS to availability + active order
  useEffect(() => {
    if (!coords || !isOnline) return;
    realDispatchProvider.setLastCoords(coords.lat, coords.lng);
    void putCourierAvailability({
      isOnline: true,
      lat: coords.lat,
      lng: coords.lng,
      activeOrderId: realDispatchProvider.activeOrderId,
    });
    if (realDispatchProvider.activeOrderId) {
      locationSeqRef.current = nextClientSeq(locationSeqRef.current);
      void patchCourierLocation(
        realDispatchProvider.activeOrderId,
        coords.lat,
        coords.lng,
        locationSeqRef.current,
      );
    }
  }, [coords, isOnline]);

  // When an offer appears from real polling, surface feedback/push banner
  useEffect(() => {
    if (mode === 'online' && offerPhase === 'single') {
      feedback.onOfferReceived();
      if (document.hidden) setPushBannerOpen(true);
    }
  }, [mode, offerPhase, feedback]);

  useEffect(() => {
    void loadCourierProfile().then((profile) => {
      if (profile?.display_name) setCourierName(profile.display_name);
      if (profile?.completion_rate_pct != null) {
        setCompletionRate(profile.completion_rate_pct);
      }
    });
  }, []);

  const hasActiveOffer = offerPhase !== null;
  const isOnDelivery = mode === 'on-delivery' && deliveryPhase !== null;
  const hasOverlay =
    selectedDeliveryId !== null ||
    profileScreen !== null ||
    dashSummaryOpen ||
    promotionsOpen;
  const showBottomNav =
    !hasActiveOffer && !isOnDelivery && !hasOverlay && !networkOffline && !declineReasonOpen;

  const isImmersive =
    hasActiveOffer ||
    isOnDelivery ||
    networkOffline ||
    locationIssueOpen ||
    dashSummaryOpen ||
    promotionsOpen ||
    reportIssueOpen ||
    showUnassignModal ||
    declineReasonOpen;

  useImmersiveMode(isImmersive);

  const guardAction = useCallback((action: () => void) => {
    try {
      assertOnline();
      action();
    } catch (err) {
      if (err instanceof OfflineError) {
        toast.error('You are offline', err.message);
      }
    }
  }, []);

  const finishStackedDelivery = useCallback(() => {
    feedback.onComplete();
    toast.success('Stacked route complete!', 'J$1,120 added to your balance.');
    dispatch.finishDelivery();
    setActiveTab('home');
  }, [feedback, dispatch]);

  const finishDelivery = useCallback(() => {
    feedback.onComplete();
    toast.success('Delivery complete!', 'Earnings added to your balance.');
    dispatch.finishDelivery();
    setActiveDelivery(null);
    setActiveTab('home');
  }, [feedback, dispatch]);

  const handleOfferReceived = useCallback(() => {
    if (mode === 'online' && offerPhase === null) {
      feedback.onOfferReceived();
      toast.info('New offer incoming', 'Tap to view before it expires.');
      // Stacked multi-order offers are not backend-backed yet — always single.
      if (document.hidden) {
        setPushBannerOpen(true);
      } else {
        dispatch.receiveOffer('single');
      }
    }
  }, [mode, offerPhase, feedback, dispatch]);

  const handleOfferTimerExpire = useCallback(() => {
    setDeclineReasonOpen(false);
    dispatch.expireOffer();
  }, [dispatch]);

  const requestDeclineOffer = useCallback(() => {
    setDeclineReasonOpen(true);
  }, []);

  const finishDeclineOffer = useCallback(
    (reasonId?: DeclineReasonId) => {
      setDeclineReasonOpen(false);
      const offerId =
        offerPhase === 'stacked'
          ? MOCK_STACKED_OFFER.id
          : getProviderOfferId() || currentSingleOffer.id;
      if (reasonId) {
        persistDeclineReason({ reasonId, offerId });
        toast.success('Feedback recorded', 'Thanks for letting us know.');
      }
      dispatch.declineOffer(offerId, reasonId ? { reasonId, offerId } : undefined);
    },
    [dispatch, offerPhase, getProviderOfferId, currentSingleOffer.id],
  );

  const handleAcceptStackedOffer = useCallback(() => {
    guardAction(() => {
      feedback.onAccept();
      toast.success('Offer accepted', 'Head to the restaurant to pick up.');
      dispatch.acceptOffer(MOCK_STACKED_OFFER.id);
      setActiveTab('home');
    });
  }, [feedback, dispatch, guardAction]);

  const handleAcceptSingleOffer = useCallback(() => {
    guardAction(() => {
      feedback.onAccept();
      const offerId = getProviderOfferId() || currentSingleOffer.id;
      const pending = getProviderPendingOrder();
      const lastCoords = getProviderLastCoords();

      if (pending) {
        setActiveDelivery(mapOrderToActiveDelivery(pending, lastCoords));
      } else {
        setActiveDelivery(emptyActiveDelivery());
      }

      toast.success('Offer accepted', 'Navigation started to pickup.');
      dispatch.acceptOffer(offerId);
      setActiveTab('home');
    });
  }, [
    feedback,
    dispatch,
    guardAction,
    getProviderOfferId,
    getProviderPendingOrder,
    getProviderLastCoords,
    currentSingleOffer.id,
  ]);

  const handleReportIssueSubmit = useCallback(
    (issueId: string, notes?: string, photoUrl?: string) => {
      const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
      void submitCourierIssue(orderId, issueId, notes, photoUrl);
      setReportIssueOpen(false);
      if (issueId === 'restaurant_closed' || issueId === 'customer_unavailable') {
        dispatch.setDeliveryPhase('order-cancelled');
        void updateCourierOrderStatus(orderId, 'cancelled', issueId);
      }
    },
    [dispatch, delivery.orderId],
  );

  const handleUnassign = useCallback(() => {
    setShowUnassignModal(false);
    setReportIssueOpen(false);
    const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
    void updateCourierOrderStatus(orderId, 'cancelled', 'courier_unassign');
    dispatch.cancelDelivery();
  }, [dispatch, delivery.orderId]);

  const handleRequestUnassign = useCallback(() => {
    setShowUnassignModal(true);
  }, []);

  useEffect(() => {
    if (mode !== 'going-online') return undefined;

    // RealDispatchProvider completes go-online async; only block if GPS never resolves.
    const timer = window.setTimeout(() => {
      if (mode === 'going-online' && !hasResolvedLocation.current && !coords) {
        setLocationIssueOpen(true);
      }
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [mode, coords]);

  useEffect(() => {
    if (coords) hasResolvedLocation.current = true;
  }, [coords]);

  const handleLocationRetry = useCallback(() => {
    hasResolvedLocation.current = true;
    setLocationIssueOpen(false);
    dispatch.setMode('online');
    toast.success('Location found', 'You are now online and receiving offers.');
  }, [dispatch]);

  const handleRetryConnection = useCallback(() => {
    if (navigator.onLine) {
      toast.success('Back online', 'Connection restored.');
    } else {
      toast.error('Still offline', 'Please check your connection.');
    }
  }, []);

  const handleAtCustomerComplete = useCallback(
    (method: DropoffMethod, _hasPhoto: boolean, photoUrl?: string) => {
      const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
      if (photoUrl) {
        void import('@/lib/courierApi').then(({ submitCourierProof }) =>
          submitCourierProof(orderId, 'delivery', photoUrl),
        );
      }
      if (method === 'hand-to-customer') {
        if (delivery.vertical_type === 'alcohol') {
          setAgeVerifyOpen(true);
          return;
        }
        dispatch.setDeliveryPhase('confirm-handoff');
      } else {
        void updateCourierOrderStatus(orderId, 'delivered');
        dispatch.setDeliveryPhase('complete');
      }
    },
    [dispatch, delivery.vertical_type, delivery.orderId],
  );

  const handleProfileNavigate = useCallback((destination: ProfileDestination) => {
    const screenMap: Partial<Record<ProfileDestination, ProfileScreen>> = {
      'edit-profile': 'edit-profile',
      vehicle: 'vehicle',
      documents: 'documents',
      notifications: 'notifications',
      preferences: 'preferences',
      help: 'help',
      about: 'about',
      earnings: 'payout-settings',
    };
    const screen = screenMap[destination];
    if (screen) setProfileScreen(screen);
  }, []);

  const resumeActiveDelivery = useCallback(() => {
    setActiveTab('home');
    if (!isOnDelivery) {
      dispatch.setMode('on-delivery');
      dispatch.setDeliveryPhase('en-route');
    }
  }, [isOnDelivery, dispatch]);

  const handleGoOnline = useCallback(() => {
    guardAction(() => dispatch.goOnline());
  }, [dispatch, guardAction]);

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
          hasActiveDelivery={isOnDelivery && hasActiveDeliveryData}
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
          courierLat={coords?.lat}
          courierLng={coords?.lng}
        />
      );
    }

    return <HomeOfflinePage onGoOnline={handleGoOnline} courierName={courierName} />;
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

      {/* Stacked multi-order UI deferred — no backend order "stack" yet.
          offerPhase === 'stacked' is never set by RealDispatchProvider. */}
      {false && offerPhase === 'stacked' && (
        <ImmersiveScreen>
          <StackedOfferPage
            offer={MOCK_STACKED_OFFER}
            onTimerExpire={handleOfferTimerExpire}
            onDecline={requestDeclineOffer}
            onAccept={handleAcceptStackedOffer}
          />
        </ImmersiveScreen>
      )}

      {offerPhase === 'single' && (
        <ImmersiveScreen>
          <DeliveryOfferPage
            offer={currentSingleOffer}
            onClose={requestDeclineOffer}
            onTimerExpire={handleOfferTimerExpire}
            onDecline={requestDeclineOffer}
            onAccept={handleAcceptSingleOffer}
            onViewDetails={() => dispatch.showOfferDetails()}
            onOfferShown={feedback.onOfferReceived}
          />
        </ImmersiveScreen>
      )}

      {offerPhase === 'details' && (
        <ImmersiveScreen className="z-[70]">
          <OfferDetailsPage
            offer={currentSingleOffer}
            onBack={() => dispatch.dismissOfferDetails()}
            onTimerExpire={handleOfferTimerExpire}
            onDecline={requestDeclineOffer}
            onAccept={handleAcceptSingleOffer}
          />
        </ImmersiveScreen>
      )}

      <DeclineReasonSheet
        open={declineReasonOpen}
        onSkip={() => finishDeclineOffer()}
        onSubmit={(reasonId) => finishDeclineOffer(reasonId)}
      />

      {/* Multi-order stacked delivery deferred until backend stacks exist */}
      {false && deliveryPhase === 'stacked-active' && (
        <ImmersiveScreen>
          <StackedDeliveryFlow
            onComplete={finishStackedDelivery}
            onRequestUnassign={handleRequestUnassign}
            onReportIssue={() => setReportIssueOpen(true)}
          />
        </ImmersiveScreen>
      )}

      {deliveryPhase === 'pickup-nav' && !acceptedStacked && hasActiveDeliveryData && (
        <ImmersiveScreen>
          <ActiveDeliveryNavPage
            delivery={delivery}
            onArrived={() => dispatch.setDeliveryPhase('at-restaurant')}
          />
        </ImmersiveScreen>
      )}

      {deliveryPhase === 'at-restaurant' && !acceptedStacked && hasActiveDeliveryData && (
        <AtStorePage
          delivery={delivery}
          onClose={handleRequestUnassign}
          onConfirmPickup={(pickupPhotoUrl) =>
            guardAction(() => {
              const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
              if (pickupPhotoUrl) {
                void import('@/lib/courierApi').then(({ submitCourierProof }) =>
                  submitCourierProof(orderId, 'pickup', pickupPhotoUrl),
                );
              }
              void updateCourierOrderStatus(orderId, 'picked_up').then(() =>
                updateCourierOrderStatus(orderId, 'in_transit'),
              );
              dispatch.setDeliveryPhase('en-route');
            })
          }
          onRequestUnassign={handleRequestUnassign}
          onReportIssue={() => setReportIssueOpen(true)}
        />
      )}

      {deliveryPhase === 'en-route' && !networkOffline && !acceptedStacked && hasActiveDeliveryData && (
        <EnRoutePage
          delivery={delivery}
          onArrived={() => dispatch.setDeliveryPhase('at-customer')}
        />
      )}

      {deliveryPhase === 'at-customer' && !acceptedStacked && hasActiveDeliveryData && (
        <AtCustomerPage
          delivery={delivery}
          onBack={() => dispatch.setDeliveryPhase('en-route')}
          onComplete={handleAtCustomerComplete}
          onCustomerUnavailable={() => dispatch.setDeliveryPhase('customer-unavailable')}
        />
      )}

      {deliveryPhase === 'confirm-handoff' && !acceptedStacked && hasActiveDeliveryData && (
        <ConfirmHandoffPage
          onBack={() => dispatch.setDeliveryPhase('at-customer')}
          onComplete={() => dispatch.setDeliveryPhase('complete')}
          onCustomerUnavailable={() => dispatch.setDeliveryPhase('customer-unavailable')}
        />
      )}

      {deliveryPhase === 'customer-unavailable' && !acceptedStacked && hasActiveDeliveryData && (
        <CustomerUnavailablePage
          customerPhone={delivery.customerPhone}
          onClose={() => dispatch.setDeliveryPhase('at-customer')}
          onLeaveAtSafeLocation={() => dispatch.setDeliveryPhase('complete')}
        />
      )}

      {deliveryPhase === 'complete' && !acceptedStacked && hasActiveDeliveryData && (
        <DeliveryCompletePage delivery={delivery} onBackToDash={finishDelivery} />
      )}

      {deliveryPhase === 'order-cancelled' && (
        <OrderCancelledPage onBackToDash={finishDelivery} />
      )}

      {ageVerifyOpen && (
        <AgeVerifyHandoffPage
          customerName={delivery.customerName}
          dropoffAddress={delivery.dropoffAddress}
          orderId={realDispatchProvider.activeOrderId || delivery.orderId}
          onBack={() => setAgeVerifyOpen(false)}
          onComplete={() => {
            setAgeVerifyOpen(false);
            dispatch.setDeliveryPhase('confirm-handoff');
          }}
        />
      )}

      {reportIssueOpen && isOnDelivery && hasActiveDeliveryData && (
        <ReportIssuePage
          delivery={delivery}
          onClose={() => setReportIssueOpen(false)}
          onSubmit={handleReportIssueSubmit}
          onRequestUnassign={handleRequestUnassign}
        />
      )}

      <UnassignConfirmModal
        open={showUnassignModal}
        completionRate={completionRate}
        onConfirm={handleUnassign}
        onCancel={() => setShowUnassignModal(false)}
      />

      {dashSummaryOpen && (
        <DashSummaryPage
          onEndDash={() => {
            setDashSummaryOpen(false);
            dispatch.expireOffer();
            dispatch.goOffline();
          }}
          onStayOnline={() => setDashSummaryOpen(false)}
        />
      )}

      {promotionsOpen && <PromotionsPage onBack={() => setPromotionsOpen(false)} />}

      {selectedDeliveryId && (
        <DeliveryDetailPage onBack={() => setSelectedDeliveryId(null)} />
      )}

      {pushBannerOpen && (
        <OfferPushBanner
          restaurant={currentSingleOffer.restaurant}
          earnings={currentSingleOffer.earnings}
          secondsLeft={90}
          onTap={() => {
            setPushBannerOpen(false);
            dispatch.receiveOffer('single');
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
        <VehicleDetailsPage
          onBack={() => setProfileScreen(null)}
          onEditVehicle={() => setProfileScreen('edit-vehicle')}
        />
      )}

      {profileScreen === 'edit-vehicle' && (
        <EditVehiclePage
          onBack={() => setProfileScreen('vehicle')}
          onSave={() => setProfileScreen('vehicle')}
        />
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
        <HelpSupportPage
          onBack={() => setProfileScreen(null)}
          onTopicSelect={(topicId) => {
            setHelpTopicId(topicId);
            setProfileScreen('help-topic');
          }}
        />
      )}

      {profileScreen === 'help-topic' && helpTopicId && (
        <HelpTopicPage
          topicId={helpTopicId}
          onBack={() => setProfileScreen('help')}
        />
      )}

      {profileScreen === 'settings' && (
        <SettingsPage onBack={() => setProfileScreen(null)} />
      )}

      {profileScreen === 'about' && (
        <AboutPage
          onBack={() => setProfileScreen(null)}
          onOpenSettings={() => setProfileScreen('settings')}
        />
      )}

      {profileScreen === 'ratings' && (
        <RatingsStatsPage onBack={() => setProfileScreen(null)} />
      )}

      {profileScreen === 'payout-settings' && (
        <PayoutSettingsPage
          onBack={() => setProfileScreen(null)}
          onViewHistory={() => setProfileScreen('payout-history')}
        />
      )}

      {profileScreen === 'payout-history' && (
        <PayoutHistoryPage onBack={() => setProfileScreen('payout-settings')} />
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
          onProfileClick={() => setActiveTab('account')}
        />
      )}
    </AppShell>
  );
}
