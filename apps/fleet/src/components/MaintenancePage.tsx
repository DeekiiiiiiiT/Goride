import React, { useState, useEffect, useCallback } from 'react';
import { Wrench, RefreshCw, ShieldCheck } from 'lucide-react';
import { API_ENDPOINTS } from '../services/apiConfig';

interface MaintenancePageProps {
  message?: string;
  platformName?: string;
  onStatusChange?: () => void;
}

export function MaintenancePage({ message, platformName = 'Roam Fleet', onStatusChange }: MaintenancePageProps) {
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState(30);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.fleet}/platform-status`);
      const data = await res.json();
      if (!data.maintenanceMode) {
        onStatusChange?.();
        window.location.reload();
      }
    } catch {
      // ignore
    } finally {
      setChecking(false);
      setCountdown(30);
    }
  }, [onStatusChange]);

  // Auto-retry every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          checkStatus();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [checkStatus]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      {/* Animated wrench icon */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Wrench className="w-12 h-12 text-amber-400 animate-pulse" />
        </div>
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full animate-ping" />
      </div>

      {/* Title */}
      <h1 className="text-3xl font-bold text-white mb-2 text-center">Under Maintenance</h1>
      <p className="text-slate-400 text-sm mb-6 text-center max-w-md">
        {message || "We're performing scheduled maintenance. Back soon!"}
      </p>

      {/* Status card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-4 max-w-sm w-full mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-slate-300">Maintenance in progress</span>
        </div>
        <p className="text-xs text-slate-500">
          The {platformName} platform is temporarily offline for scheduled maintenance. 
          Your data is safe and the system will be available again shortly.
        </p>
      </div>

      {/* Retry button */}
      <button
        onClick={checkStatus}
        disabled={checking}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
        {checking ? 'Checking...' : `Retry (auto in ${countdown}s)`}
      </button>

      {/* Admin login link */}
      <div className="mt-10 flex items-center gap-2 text-xs text-slate-600">
        <ShieldCheck className="w-3.5 h-3.5" />
        <a
          href="/admin"
          className="text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
        >
          Admin? Log in here →
        </a>
      </div>
    </div>
  );
}
