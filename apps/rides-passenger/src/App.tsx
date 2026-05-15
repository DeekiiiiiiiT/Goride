import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase, shouldSkipOauthSurfaceRolePatch, isRidesPassengerUiBlockedRole } from '@roam/auth-client';
import { PASSENGER_OAUTH_INTENT_KEY, PASSENGER_OAUTH_INTENT_VALUE } from './utils/passengerAuthSignup';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RidePage from './pages/RidePage';
import { WrongRidesSurfaceGate } from './components/auth/WrongRidesSurfaceGate';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (session?.user && isRidesPassengerUiBlockedRole(session.user.user_metadata?.role as string | undefined)) {
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
