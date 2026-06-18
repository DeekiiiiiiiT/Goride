import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import {
  supabase,
  shouldSkipOauthSurfaceWrite,
  isRidesPassengerUiBlockedRole,
} from '@roam/auth-client';
import { PASSENGER_OAUTH_INTENT_KEY, PASSENGER_OAUTH_INTENT_VALUE } from './utils/passengerAuthSignup';
import { AuthenticatedPassengerRoute } from './components/auth/AuthenticatedPassengerRoute';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RidePage from './pages/RidePage';
import ServicesPage from './pages/ServicesPage';
import BookForSomeonePage from './pages/BookForSomeonePage';
import BookForOthersHubPage from './pages/BookForOthersHubPage';
import CourierServicePage from './pages/CourierServicePage';
import ScheduleRidePage from './pages/ScheduleRidePage';
import ScheduledRideConfirmPage from './pages/ScheduledRideConfirmPage';
import EventBookingPage from './pages/EventBookingPage';
import HaulageBookingPage from './pages/HaulageBookingPage';
import HaulageConfirmedPage from './pages/HaulageConfirmedPage';
import AccountPage from './pages/AccountPage';
import GiftCardsPage from './pages/GiftCardsPage';
import EmergencyAssistancePage from './pages/EmergencyAssistancePage';
import PromoCodesPage from './pages/PromoCodesPage';
import SupportCenterPage from './pages/SupportCenterPage';
import TrustedContactsPage from './pages/TrustedContactsPage';
import AddTrustedContactsPage from './pages/AddTrustedContactsPage';
import TripSharePublicPage from './pages/TripSharePublicPage';
import ContactsHubPage from './pages/ContactsHubPage';
import AddNewPlacePage from './pages/AddNewPlacePage';
import ContactsPage from './pages/ContactsPage';
import ContactGroupsPage from './pages/ContactGroupsPage';
import ContactGroupDetailPage from './pages/ContactGroupDetailPage';
import ContactDetailPage from './pages/ContactDetailPage';
import PendingContactsPage from './pages/PendingContactsPage';
import PassengerInviteLandingPage from './pages/PassengerInviteLandingPage';
import PassengerAuthorizePage from './pages/PassengerAuthorizePage';
import RiderLocationSharePage from './pages/RiderLocationSharePage';
import BookForMePage from './pages/BookForMePage';
import ShadowTripStatusPage from './pages/ShadowTripStatusPage';
import ShadowTripReceiptPage from './pages/ShadowTripReceiptPage';
import WalletPage from './pages/WalletPage';
import ActivityPage from './pages/ActivityPage';
import ManagePaymentMethodsPage from './pages/ManagePaymentMethodsPage';
import AppSettingsPage from './pages/AppSettingsPage';
import ProfilePage from './pages/ProfilePage';
import { WrongRidesSurfaceGate } from './components/auth/WrongRidesSurfaceGate';
import { RidesAdminLayout } from './admin/RidesAdminLayout';
import { RidesAdminDashboard } from './admin/pages/RidesAdminDashboard';
import { FareRulesLayout } from './admin/pages/FareRulesLayout';
import { FareRulesPage } from './admin/pages/FareRulesPage';
import { TripCalculatorPage } from './admin/pages/TripCalculatorPage';
import { TransportSolutionsLayout } from './admin/pages/TransportSolutionsLayout';
import { ServicesLayout } from './admin/pages/ServicesLayout';
import { ServiceCategoryPage } from './admin/pages/ServiceCategoryPage';
import { HaulageServicePage } from './admin/pages/HaulageServicePage';
import { SurgePage } from './admin/pages/SurgePage';
import { ControlPanelPage } from './admin/pages/ControlPanelPage';
import { AppPermissionsPage } from './admin/pages/AppPermissionsPage';
import { PlayStoreLaunchPage } from './admin/pages/PlayStoreLaunchPage';
import { RideOperationsPage } from './admin/pages/RideOperationsPage';
import { TripLedgerPage } from './admin/pages/TripLedgerPage';
import { RidersListPage } from './admin/pages/users/RidersListPage';
import { RiderDetailPage } from './admin/pages/users/RiderDetailPage';
import { DisputesPage } from './admin/pages/DisputesPage';
import { SettlementOverridesPage } from './admin/pages/SettlementOverridesPage';
import { OutstandingBalancesPage } from './admin/pages/OutstandingBalancesPage';
import { SplashScreen } from './components/layout/SplashScreen';
import { BookerTrackingProvider } from './contexts/BookerTrackingContext';
import { PassengerShell } from './components/layout/PassengerShell';

const SPLASH_MIN_MS = 2000;

export default function App() {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [splashMinElapsed, setSplashMinElapsed] = useState(false);

  useEffect(() => {
    if (isAdminPath) {
      setSplashMinElapsed(true);
      return;
    }
    const timer = window.setTimeout(() => setSplashMinElapsed(true), SPLASH_MIN_MS);
    return () => window.clearTimeout(timer);
  }, [isAdminPath]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  /** Google OAuth: record surface only when signup started from this app. */
  useEffect(() => {
    const user = session?.user;
    if (!user || isAdminPath) return;
    void (async () => {
      try {
        if (sessionStorage.getItem(PASSENGER_OAUTH_INTENT_KEY) !== PASSENGER_OAUTH_INTENT_VALUE) return;
        if (shouldSkipOauthSurfaceWrite(user, 'passenger')) return;
        await supabase.auth.updateUser({ data: { surface: 'passenger' } });
      } catch (e) {
        console.warn('passenger oauth surface patch:', e);
      } finally {
        sessionStorage.removeItem(PASSENGER_OAUTH_INTENT_KEY);
      }
    })();
  }, [session?.user?.id, isAdminPath]);

  if (!isAdminPath && (loading || !splashMinElapsed)) {
    return <SplashScreen />;
  }

  if (session?.user && !isAdminPath && isRidesPassengerUiBlockedRole(session.user)) {
    return (
      <WrongRidesSurfaceGate
        onSignOut={async () => {
          await supabase.auth.signOut();
          setSession(null);
        }}
      />
    );
  }

  const routes = (
    <Routes>
      {/* Admin routes */}
      <Route path="/admin" element={<RidesAdminLayout />}>
        <Route index element={<RidesAdminDashboard />} />
        <Route path="users" element={<RidersListPage />} />
        <Route path="users/:userId" element={<RiderDetailPage />} />
        <Route path="fare-rules" element={<FareRulesLayout />}>
          <Route index element={<FareRulesPage />} />
          <Route path="transport-solutions" element={<TransportSolutionsLayout />} />
          <Route
            path="transport-solutions/services"
            element={<Navigate to="/admin/services/rideshare" replace />}
          />
          <Route
            path="transport-solutions/vehicles"
            element={<Navigate to="/admin/fare-rules/transport-solutions" replace />}
          />
          <Route
            path="vehicle-types"
            element={<Navigate to="/admin/fare-rules/transport-solutions" replace />}
          />
          <Route path="calculator" element={<TripCalculatorPage />} />
        </Route>
        <Route path="services" element={<ServicesLayout />}>
          <Route index element={<Navigate to="rideshare" replace />} />
          <Route path="rideshare" element={<ServiceCategoryPage category="rideshare" />} />
          <Route path="courier" element={<ServiceCategoryPage category="courier" />} />
          <Route path="event" element={<ServiceCategoryPage category="event" />} />
          <Route path="haulage" element={<HaulageServicePage />} />
        </Route>
        <Route path="surge" element={<SurgePage />} />
        <Route path="control-panel" element={<ControlPanelPage />} />
        <Route path="app-permissions" element={<AppPermissionsPage />} />
        <Route path="play-store" element={<PlayStoreLaunchPage />} />
        <Route path="ledger" element={<TripLedgerPage />} />
        <Route path="rides" element={<RideOperationsPage />} />
        <Route path="disputes" element={<DisputesPage />} />
        <Route path="outstanding-balances" element={<OutstandingBalancesPage />} />
        <Route path="settlement-overrides" element={<SettlementOverridesPage />} />
      </Route>

      {/* Public delegated-booking entry (signup gate) */}
      <Route path="/ride/join/:token" element={<PassengerInviteLandingPage />} />
      <Route path="/ride/authorize/:token" element={<PassengerAuthorizePage />} />
      <Route path="/location-share/:token" element={<RiderLocationSharePage />} />
      <Route path="/trip/:token" element={<TripSharePublicPage />} />

      {/* Passenger app routes */}
      <Route path="/login" element={<LoginPage session={session} />} />
      <Route
        element={session ? <AuthenticatedPassengerRoute /> : <Navigate to="/login" replace />}
      >
        <Route element={<PassengerShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/services/book-for-others" element={<BookForOthersHubPage />} />
          <Route path="/services/book-for-someone" element={<BookForSomeonePage />} />
          <Route path="/services/courier" element={<CourierServicePage />} />
          <Route path="/services/haulage" element={<HaulageBookingPage />} />
          <Route path="/services/haulage/confirmed" element={<HaulageConfirmedPage />} />
          <Route path="/services/schedule" element={<ScheduleRidePage />} />
          <Route path="/services/schedule/confirmed" element={<ScheduledRideConfirmPage />} />
          <Route path="/services/event" element={<EventBookingPage />} />
          <Route path="/services/book-for-me" element={<BookForMePage />} />
          <Route path="/services/roam-tag" element={<Navigate to="/services/book-for-me" replace />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/gift-cards" element={<GiftCardsPage />} />
          <Route path="/account/emergency-assistance" element={<EmergencyAssistancePage />} />
          <Route path="/account/promo-codes" element={<PromoCodesPage />} />
          <Route path="/account/support" element={<SupportCenterPage />} />
          <Route path="/account/trusted-contacts" element={<Navigate to="/account/contacts/trusted" replace />} />
          <Route path="/account/contacts" element={<ContactsHubPage />} />
          <Route path="/account/contacts/places/new" element={<AddNewPlacePage />} />
          <Route path="/account/contacts/pending" element={<PendingContactsPage />} />
          <Route path="/account/contacts/roam" element={<ContactsPage />} />
          <Route path="/account/contacts/trusted" element={<TrustedContactsPage />} />
          <Route path="/account/contacts/trusted/add" element={<AddTrustedContactsPage />} />
          <Route path="/account/contacts/groups" element={<ContactGroupsPage />} />
          <Route path="/account/contacts/groups/:id" element={<ContactGroupDetailPage />} />
          <Route path="/account/contacts/:id" element={<ContactDetailPage />} />
          <Route path="/wallet" element={<Navigate to="/account/wallet" replace />} />
          <Route path="/account/wallet" element={<WalletPage />} />
          <Route path="/account/wallet/payment-methods" element={<ManagePaymentMethodsPage />} />
          <Route path="/account/settings" element={<AppSettingsPage />} />
          <Route path="/account/profile" element={<ProfilePage />} />
        </Route>
        <Route path="/ride/:id" element={<RidePage />} />
        <Route path="/shadow-trip/:id/receipt" element={<ShadowTripReceiptPage />} />
        <Route path="/shadow-trip/:id" element={<ShadowTripStatusPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  if (session && !isAdminPath) {
    return <BookerTrackingProvider>{routes}</BookerTrackingProvider>;
  }

  return routes;
}
