// @refresh reset — mid-HMR can leave offer/promotion state undefined (ROAM-DASH-COURIER-2/6/8).
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
import { hydrateCourierSettingsFromCloud } from '@/lib/courierSettingsSync';
import { buildStackedRouteFromLegs, buildStackedOfferFromPending } from '@/lib/stackedRouteBuilder';
import { isCourierStackedEnabled } from '@/lib/courierFeatureFlags';
import { commitCancel, commitDelivered, commitPickup } from '@/lib/orderMutation';
import { loadOnlineSince, persistOnlineSince } from '@/lib/courierStorage';
import { supabase } from '@/lib/supabase';
import type { StackedRouteStop } from '@/lib/mockStackedRoute';
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
import { emptySingleOffer, mapOrderToSingleOffer } from '@/lib/mapOrderToSingleOffer';
import { mapActiveDeliveryToCached } from '@/lib/mockCachedDelivery';
import { MOCK_STACKED_OFFER, type SingleOffer, type StackedOffer } from '@/lib/mockOffers';
import { useCourierFeedback } from '@/hooks/useCourierFeedback';
import { useBackgroundLocation } from '@/hooks/useBackgroundLocation';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useCourierDispatch } from '@/hooks/useCourierDispatch';
import { OfflineError, assertOnline } from '@/lib/networkGuard';
import { loadCourierProfile } from '@/lib/courierProfileService';
import { resolveCourierFileUrl } from '@/lib/courierFileUpload';
import { formatElapsed } from '@/lib/formatElapsed';
import { openCourierAppSettings } from '@/lib/courierPermissions';
import {
  fetchCourierEarnings,
  fetchCourierStack,
  patchCourierLocation,
  putCourierAvailability,
  submitCourierIssue,
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
  const [locationIssueOpen, setLocationIssueOpen] = useState(false);
  const [ageVerifyOpen, setAgeVerifyOpen] = useState(false);
  const [declineReasonOpen, setDeclineReasonOpen] = useState(false);
  const [pushBannerOpen, setPushBannerOpen] = useState(false);
  const [courierName, setCourierName] = useState<string | undefined>();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [onlineSinceMs, setOnlineSinceMs] = useState<number | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState<string | null>(null);
  const [completionRate, setCompletionRate] = useState<number | null>(null);
  const [acceptanceRate, setAcceptanceRate] = useState<number | null>(null);
  const [todayEarned, setTodayEarned] = useState(0);
  const [todayDeliveries, setTodayDeliveries] = useState(0);
  const [activeDelivery, setActiveDelivery] = useState<ActiveDelivery | null>(null);
  const [stackedRoute, setStackedRoute] = useState<StackedRouteStop[]>([]);
  const [promotionsOpen, setPromotionsOpen] = useState(false);
  const [mutationSubmitting, setMutationSubmitting] = useState(false);
  const [sessionRestoredApprox, setSessionRestoredApprox] = useState(false);
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
    return mapped || emptySingleOffer();
  })();

  const currentStackedOffer: StackedOffer = (() => {
    if (
      'getPendingOffers' in provider &&
      typeof (provider as { getPendingOffers?: () => Array<{ id: string; order?: AvailableOrder | null }> }).getPendingOffers === 'function'
    ) {
      const built = buildStackedOfferFromPending(
        (provider as { getPendingOffers: () => Array<{ id: string; order?: AvailableOrder | null }> }).getPendingOffers(),
        getProviderLastCoords(),
      );
      if (built) return built;
    }
    return MOCK_STACKED_OFFER;
  })();

  // Cloud settings + stacked route bootstrap
  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) void hydrateCourierSettingsFromCloud(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (deliveryPhase !== 'stacked-active') return;
    void fetchCourierStack().then((legs) => {
      const built = buildStackedRouteFromLegs(legs);
      if (built.length > 0) setStackedRoute(built);
    });
  }, [deliveryPhase]);

  // Clear stale delivery UI if dispatch reverts to online without an active leg.
  useEffect(() => {
    if (mode === 'online' && deliveryPhase === null && activeDelivery !== null) {
      setActiveDelivery(null);
    }
  }, [mode, deliveryPhase, activeDelivery]);

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

  const refreshTodayStats = useCallback(() => {
    void loadCourierProfile().then(async (profile) => {
      if (profile?.display_name) setCourierName(profile.display_name);
      if (profile?.completion_rate_pct != null) {
        setCompletionRate(profile.completion_rate_pct);
      }
      setAcceptanceRate(profile?.acceptance_rate_pct ?? null);
      const raw = profile?.profile_photo_url || '';
      if (!raw) {
        setAvatarUrl(null);
        return;
      }
      setAvatarUrl((await resolveCourierFileUrl(raw)) || raw);
    });
    void fetchCourierEarnings('today').then((data) => {
      if (!data) return;
      setTodayEarned(data.total);
      setTodayDeliveries(data.deliveryCount);
    });
  }, []);

  useEffect(() => {
    refreshTodayStats();
  }, [refreshTodayStats]);

  useEffect(() => {
    if (mode === 'online' || mode === 'on-delivery' || mode === 'going-online') {
      void supabase.auth.getSession().then(({ data: { session } }) => {
        const userId = session?.user?.id;
        if (!userId) return;
        setOnlineSinceMs((prev) => {
          if (prev != null) {
            persistOnlineSince(userId, prev);
            return prev;
          }
          const restored = loadOnlineSince(userId);
          if (restored != null) {
            setSessionRestoredApprox(true);
            persistOnlineSince(userId, restored);
            return restored;
          }
          const now = Date.now();
          persistOnlineSince(userId, now);
          return now;
        });
      });
    } else {
      setOnlineSinceMs(null);
      setSessionRestoredApprox(false);
    }
  }, [mode]);

  useEffect(() => {
    if (onlineSinceMs == null) {
      setSessionElapsed(null);
      return;
    }
    const tick = () => setSessionElapsed(formatElapsed(Date.now() - onlineSinceMs));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [onlineSinceMs]);

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
    reportIssueOpen ||
    showUnassignModal ||
    declineReasonOpen ||
    promotionsOpen ||
    selectedDeliveryId !== null ||
    profileScreen !== null;

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
    dispatch.finishDelivery();
    setStackedRoute([]);
    setActiveTab('home');
    refreshTodayStats();
  }, [feedback, dispatch, refreshTodayStats]);

  const finishDelivery = useCallback(() => {
    feedback.onComplete();
    toast.success('Delivery complete!', 'Earnings added to your balance.');
    dispatch.finishDelivery();
    setActiveDelivery(null);
    setActiveTab('home');
    refreshTodayStats();
  }, [feedback, dispatch, refreshTodayStats]);

  const dismissCancelled = useCallback(() => {
    dispatch.finishDelivery();
    setActiveDelivery(null);
    setActiveTab('home');
  }, [dispatch]);

  const handleOfferReceived = useCallback(() => {
    if (mode === 'online' && offerPhase === null) {
      feedback.onOfferReceived();
      toast.info('New offer incoming', 'Tap to view before it expires.');
      // When two pending offers exist, RealDispatchProvider surfaces stacked phase.
      const stacked =
        isCourierStackedEnabled() &&
        'getPendingOfferIds' in provider &&
        typeof (provider as { getPendingOfferIds?: () => string[] }).getPendingOfferIds ===
          'function' &&
        (provider as { getPendingOfferIds: () => string[] }).getPendingOfferIds().length >= 2;
      if (document.hidden) {
        setPushBannerOpen(true);
      } else {
        dispatch.receiveOffer(stacked ? 'stacked' : 'single');
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
      const offerId = getProviderOfferId() || currentSingleOffer.id;
      if (reasonId) {
        persistDeclineReason({ reasonId, offerId });
        toast.success('Feedback recorded', 'Thanks for letting us know.');
      }
      dispatch.declineOffer(offerId, reasonId ? { reasonId, offerId } : undefined);
    },
    [dispatch, getProviderOfferId, currentSingleOffer.id],
  );

  const handleAcceptStackedOffer = useCallback(() => {
    guardAction(() => {
      void (async () => {
        feedback.onAccept();
        const offerIds =
          'getPendingOfferIds' in provider &&
          typeof (provider as { getPendingOfferIds?: () => string[] }).getPendingOfferIds ===
            'function'
            ? (provider as { getPendingOfferIds: () => string[] }).getPendingOfferIds()
            : [];
        if (offerIds.length < 2) {
          toast.error('Offer unavailable', 'Stacked offer expired or unavailable.');
          return;
        }
        const result = await (
          provider as { acceptStackedOffer: (ids: string[]) => Promise<{ deliveryPhase: string | null }> }
        ).acceptStackedOffer(offerIds.slice(0, 2));
        if (result.deliveryPhase === 'stacked-active') {
          toast.success('Stacked offer accepted', 'Follow the route for both pickups.');
          setActiveTab('home');
        } else {
          setStackedRoute([]);
        }
      })();
    });
  }, [feedback, dispatch, guardAction, provider]);

  const handleAcceptSingleOffer = useCallback(() => {
    guardAction(() => {
      void (async () => {
        feedback.onAccept();
        const offerId = getProviderOfferId() || currentSingleOffer.id;
        const lastCoords = getProviderLastCoords();
        const result = await dispatch.acceptOffer(offerId);

        if (result.deliveryPhase !== 'pickup-nav') {
          setActiveDelivery(null);
          setActiveTab('home');
          return;
        }

        const order = result.order ?? getProviderPendingOrder();
        if (order) {
          setActiveDelivery(mapOrderToActiveDelivery(order, lastCoords));
        } else {
          setActiveDelivery(emptyActiveDelivery());
        }

        toast.success('Offer accepted', 'Navigation started to pickup.');
        setActiveTab('home');
      })();
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
    async (issueId: string, notes?: string, photoUrl?: string) => {
      const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
      setMutationSubmitting(true);
      const issueOk = await submitCourierIssue(orderId, issueId, notes, photoUrl);
      if (!issueOk) {
        setMutationSubmitting(false);
        toast.error('Could not report issue', 'Check your connection and try again.');
        return;
      }
      if (issueId === 'restaurant_closed' || issueId === 'customer_unavailable') {
        const cancelResult = await commitCancel(orderId, issueId);
        setMutationSubmitting(false);
        if (!cancelResult.ok) {
          toast.error('Cancel failed', cancelResult.error);
          return;
        }
        setReportIssueOpen(false);
        dispatch.setDeliveryPhase('order-cancelled');
        return;
      }
      setMutationSubmitting(false);
      setReportIssueOpen(false);
    },
    [dispatch, delivery.orderId],
  );

  const handleUnassign = useCallback(async () => {
    setShowUnassignModal(false);
    setReportIssueOpen(false);
    const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
    setMutationSubmitting(true);
    const result = await commitCancel(orderId, 'courier_unassign');
    setMutationSubmitting(false);
    if (!result.ok) {
      toast.error('Unassign failed', result.error);
      return;
    }
    dispatch.cancelDelivery();
    setActiveDelivery(null);
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
    }, 15000);

    return () => window.clearTimeout(timer);
  }, [mode, coords]);

  useEffect(() => {
    if (coords) hasResolvedLocation.current = true;
  }, [coords]);

  const handleLocationRetry = useCallback(() => {
    setLocationIssueOpen(false);
    dispatch.goOnline();
  }, [dispatch]);

  const handleRetryConnection = useCallback(() => {
    if (navigator.onLine) {
      toast.success('Back online', 'Connection restored.');
    } else {
      toast.error('Still offline', 'Please check your connection.');
    }
  }, []);

  const handleAtCustomerComplete = useCallback(
    async (method: DropoffMethod, _hasPhoto: boolean, photoPath?: string, courierNotes?: string) => {
      const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
      if (method === 'hand-to-customer') {
        if (delivery.vertical_type === 'alcohol') {
          setAgeVerifyOpen(true);
          return;
        }
        dispatch.setDeliveryPhase('confirm-handoff');
        return;
      }
      setMutationSubmitting(true);
      const result = await commitDelivered(orderId, photoPath, courierNotes);
      setMutationSubmitting(false);
      if (!result.ok) {
        toast.error('Delivery failed', result.error);
        return;
      }
      dispatch.setDeliveryPhase('complete');
    },
    [dispatch, delivery.vertical_type, delivery.orderId],
  );

  const handleConfirmHandoff = useCallback(async () => {
    const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
    setMutationSubmitting(true);
    const result = await commitDelivered(orderId);
    setMutationSubmitting(false);
    if (!result.ok) {
      toast.error('Delivery failed', result.error);
      return;
    }
    dispatch.setDeliveryPhase('complete');
  }, [dispatch, delivery.orderId]);

  const handleLeaveAtSafeLocation = useCallback(
    async (photoPath: string) => {
      const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
      setMutationSubmitting(true);
      const result = await commitDelivered(orderId, photoPath);
      setMutationSubmitting(false);
      if (!result.ok) {
        toast.error('Delivery failed', result.error);
        return;
      }
      dispatch.setDeliveryPhase('complete');
    },
    [dispatch, delivery.orderId],
  );

  const handleConfirmPickup = useCallback(
    async (pickupPhotoPath?: string) => {
      const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
      setMutationSubmitting(true);
      const result = await commitPickup(orderId, pickupPhotoPath);
      setMutationSubmitting(false);
      if (!result.ok) {
        toast.error('Pickup failed', result.error);
        return;
      }
      dispatch.setDeliveryPhase('en-route');
    },
    [dispatch, delivery.orderId],
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
          onMenuClick={() => setActiveTab('account')}
          onNotificationsClick={() => setProfileScreen('notifications')}
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
          onNotificationsClick={() => setProfileScreen('notifications')}
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
          courierLat={coords?.lat}
          courierLng={coords?.lng}
          todayEarned={todayEarned}
          todayDeliveries={todayDeliveries}
          sessionElapsed={sessionElapsed}
        />
      );
    }

    return (
      <HomeOfflinePage
        onGoOnline={handleGoOnline}
        courierName={courierName}
        avatarUrl={avatarUrl}
        todayEarned={todayEarned}
        todayDeliveries={todayDeliveries}
        acceptanceRate={acceptanceRate}
      />
    );
  };

  return (
    <AppShell>
      <div className={showBottomNav ? 'app-shell-main' : 'flex flex-1 flex-col min-h-0'}>
        <CourierAppHeader
          statusLabel={headerStatus.label}
          statusTone={headerStatus.tone}
          hideStatus={hideMainHeader}
          onMenuClick={() => setActiveTab('account')}
          avatarUrl={avatarUrl}
        />

        {renderTabContent()}
      </div>

      {showBottomNav && <CourierBottomNav active={activeTab} onChange={setActiveTab} />}

      {offerPhase === 'stacked' && isCourierStackedEnabled() && (
        <ImmersiveScreen>
          <StackedOfferPage
            offer={currentStackedOffer}
            initialSeconds={45}
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

      {deliveryPhase === 'stacked-active' && isCourierStackedEnabled() && stackedRoute.length > 0 && (
        <ImmersiveScreen>
          <StackedDeliveryFlow
            route={stackedRoute}
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
              void handleConfirmPickup(pickupPhotoUrl);
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
          onHelpClick={() => setProfileScreen('help')}
        />
      )}

      {deliveryPhase === 'confirm-handoff' && !acceptedStacked && hasActiveDeliveryData && (
        <ConfirmHandoffPage
          onBack={() => dispatch.setDeliveryPhase('at-customer')}
          onComplete={() => void handleConfirmHandoff()}
          onCustomerUnavailable={() => dispatch.setDeliveryPhase('customer-unavailable')}
        />
      )}

      {deliveryPhase === 'customer-unavailable' && !acceptedStacked && hasActiveDeliveryData && (
        <CustomerUnavailablePage
          customerPhone={delivery.customerPhone}
          onClose={() => dispatch.setDeliveryPhase('at-customer')}
          onLeaveAtSafeLocation={(photoPath) => void handleLeaveAtSafeLocation(photoPath)}
        />
      )}

      {deliveryPhase === 'complete' && !acceptedStacked && hasActiveDeliveryData && (
        <DeliveryCompletePage delivery={delivery} onBackToDash={finishDelivery} />
      )}

      {deliveryPhase === 'order-cancelled' && (
        <OrderCancelledPage
          orderId={realDispatchProvider.activeOrderId || delivery.orderId}
          onBackToDash={dismissCancelled}
        />
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

      {promotionsOpen && (
        <PromotionsPage onBack={() => setPromotionsOpen(false)} />
      )}

      {dashSummaryOpen && (
        <DashSummaryPage
          onEndDash={() => {
            setDashSummaryOpen(false);
            dispatch.expireOffer();
            dispatch.goOffline();
          }}
          onStayOnline={() => setDashSummaryOpen(false)}
          todayEarned={todayEarned}
          todayDeliveries={todayDeliveries}
          acceptanceRate={acceptanceRate}
          sessionElapsed={sessionElapsed}
        />
      )}

      {selectedDeliveryId && (
        <DeliveryDetailPage
          deliveryId={selectedDeliveryId}
          onBack={() => setSelectedDeliveryId(null)}
        />
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
          onOpenSettings={() => {
            void (async () => {
              const opened = await openCourierAppSettings();
              if (!opened) {
                toast.info(
                  'Enable Location',
                  "Open phone Settings → Apps → Roam Rush Courier → Permissions → Location → Allow all the time.",
                );
              }
            })();
          }}
          onRetry={handleLocationRetry}
        />
      )}

      {networkOffline && (
        <OfflineModePage
          delivery={
            hasActiveDeliveryData && activeDelivery
              ? mapActiveDeliveryToCached(activeDelivery)
              : null
          }
          onRetry={handleRetryConnection}
          onProfileClick={() => setActiveTab('account')}
          onMenuClick={() => setActiveTab('account')}
        />
      )}
    </AppShell>
  );
}
