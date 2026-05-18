import React, { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import {
  supabase,
  shouldSkipOauthSurfaceRolePatch,
  isRidesPassengerUiBlockedRole,
  needsRidesSurfaceRolePatch,
} from '@roam/auth-client';
import { PASSENGER_OAUTH_INTENT_KEY, PASSENGER_OAUTH_INTENT_VALUE } from './utils/passengerAuthSignup';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RidePage from './pages/RidePage';
import { WrongRidesSurfaceGate } from './components/auth/WrongRidesSurfaceGate';
import { RidesAdminLayout } from './admin/RidesAdminLayout';
import { RidesAdminDashboard } from './admin/pages/RidesAdminDashboard';
import { FareRulesLayout } from './admin/pages/FareRulesLayout';
import { FareRulesPage } from './admin/pages/FareRulesPage';
import { TripCalculatorPage } from './admin/pages/TripCalculatorPage';
import { VehicleTypesPage } from './admin/pages/VehicleTypesPage';
import { SurgePage } from './admin/pages/SurgePage';
import { RideOperationsPage } from './admin/pages/RideOperationsPage';
import { RidersListPage } from './admin/pages/users/RidersListPage';
import { RiderDetailPage } from './admin/pages/users/RiderDetailPage';

export default function App() {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const passengerSurfacePatchRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  /** Google OAuth does not send `options.data`; attach passenger role when signup started from this app. */
  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    void (async () => {
      try {
        if (sessionStorage.getItem(PASSENGER_OAUTH_INTENT_KEY) !== PASSENGER_OAUTH_INTENT_VALUE) return;
        const current = user.user_metadata?.role as string | undefined;
        if (shouldSkipOauthSurfaceRolePatch(current, 'passenger')) {
          sessionStorage.removeItem(PASSENGER_OAUTH_INTENT_KEY);
          return;
        }
        await supabase.auth.updateUser({ data: { role: 'passenger' } });
      } catch (e) {
        console.warn('passenger oauth role patch:', e);
      } finally {
        sessionStorage.removeItem(PASSENGER_OAUTH_INTENT_KEY);
      }
    })();
  }, [session?.user?.id]);

  /** Same Supabase session as Roam Driver — switch metadata to passenger once per login (avoid re-render loops). */
  useEffect(() => {
    const user = session?.user;
    if (!user || isAdminPath) {
      if (!user) passengerSurfacePatchRef.current = null;
      return;
    }
    if (passengerSurfacePatchRef.current === user.id) return;

    const current = user.user_metadata?.role as string | undefined;
    if (!needsRidesSurfaceRolePatch(current, 'passenger')) {
      passengerSurfacePatchRef.current = user.id;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await supabase.auth.updateUser({ data: { role: 'passenger' } });
      } catch (e) {
        console.warn('passenger surface role patch:', e);
      } finally {
        if (!cancelled) passengerSurfacePatchRef.current = user.id;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, isAdminPath]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-100 safe-x safe-t safe-b gap-4">
        <div className="h-12 w-12 rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/25 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
        </div>
        <p className="text-sm font-medium text-zinc-600">Loading Roam Rides…</p>
      </div>
    );
  }

  const role = session?.user?.user_metadata?.role as string | undefined;
  if (
    session?.user &&
    !isAdminPath &&
    isRidesPassengerUiBlockedRole(role)
  ) {
    return (
      <WrongRidesSurfaceGate
        onSignOut={async () => {
          await supabase.auth.signOut();
          setSession(null);
        }}
      />
    );
  }

  return (
    <Routes>
      {/* Admin routes */}
      <Route path="/admin" element={<RidesAdminLayout />}>
        <Route index element={<RidesAdminDashboard />} />
        <Route path="users" element={<RidersListPage />} />
        <Route path="users/:userId" element={<RiderDetailPage />} />
        <Route path="fare-rules" element={<FareRulesLayout />}>
          <Route index element={<FareRulesPage />} />
          <Route path="vehicle-types" element={<VehicleTypesPage />} />
          <Route path="calculator" element={<TripCalculatorPage />} />
        </Route>
        <Route path="surge" element={<SurgePage />} />
        <Route path="rides" element={<RideOperationsPage />} />
      </Route>

      {/* Passenger app routes */}
      <Route path="/login" element={<LoginPage session={session} />} />
      <Route
        path="/"
        element={session ? <HomePage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/ride/:id"
        element={session ? <RidePage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
