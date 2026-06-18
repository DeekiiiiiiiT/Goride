import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { isHaulUiBlockedRole } from '@roam/auth-client';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HaulerProvider } from './contexts/HaulerContext';
import { HaulerLoginPage } from './components/auth/HaulerLoginPage';
import { WrongHaulSurfaceGate } from './components/auth/WrongHaulSurfaceGate';
import { HaulerShell } from './components/layout/HaulerShell';
import { HaulAdminPortal } from './admin/HaulAdminPortal';
import { Loader2 } from 'lucide-react';

function HaulerApp() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!user) return <HaulerLoginPage />;

  if (isHaulUiBlockedRole(user)) {
    return <WrongHaulSurfaceGate onSignOut={() => void signOut()} />;
  }

  return (
    <HaulerProvider>
      <HaulerShell />
    </HaulerProvider>
  );
}

export default function App() {
  if (window.location.pathname.startsWith('/admin')) {
    return (
      <BrowserRouter basename="/admin">
        <HaulAdminPortal />
      </BrowserRouter>
    );
  }

  return (
    <AuthProvider>
      <HaulerApp />
    </AuthProvider>
  );
}
