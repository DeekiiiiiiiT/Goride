import React, { useState, useEffect } from 'react';
import { Shield, Clock } from 'lucide-react';

interface LockoutCountdownProps {
  /** Total seconds until lockout expires */
  retryAfterSec: number;
  /** Called when the countdown reaches zero */
  onExpired: () => void;
  /** Portal name for display — "Fleet Manager" | "Driver" | "Admin" */
  portalName?: string;
  /** Accent color class for the progress bar (e.g. "bg-indigo-500", "bg-emerald-500") */
  accentColor?: string;
}

/**
 * LockoutCountdown — Shows a full lockout state with a live countdown timer,
 * progress bar, and security messaging. Replaces the login form while active.
 */
export function LockoutCountdown({
  retryAfterSec,
  onExpired,
  portalName = 'this portal',
  accentColor = 'bg-indigo-500',
}: LockoutCountdownProps) {
  const [secondsLeft, setSecondsLeft] = useState(retryAfterSec);

  useEffect(() => {
    setSecondsLeft(retryAfterSec);
  }, [retryAfterSec]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpired();
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft <= 0]); // Only re-run if we transition to/from zero

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = retryAfterSec > 0 ? ((retryAfterSec - secondsLeft) / retryAfterSec) * 100 : 0;

  return (
    <div className="w-full">
      {/* Lockout card */}
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl p-6 text-center">
        {/* Shield icon with pulse */}
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <Shield className="h-8 w-8 text-red-500 dark:text-red-400" />
            </div>
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 animate-pulse" />
          </div>
        </div>

        <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-1">
          Account Temporarily Locked
        </h3>
        <p className="text-sm text-red-600/80 dark:text-red-400/70 mb-5 max-w-xs mx-auto">
          Too many failed login attempts on {portalName}. Please wait before trying again.
        </p>

        {/* Countdown display */}
        <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800/40 rounded-lg px-6 py-4 mb-4 inline-block min-w-[200px]">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <Clock className="h-4 w-4 text-red-500 dark:text-red-400" />
            <span className="text-xs font-medium text-red-500 dark:text-red-400 uppercase tracking-wider">
              Try again in
            </span>
          </div>
          <div className="font-mono text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs mx-auto">
          <div className="h-1.5 bg-red-100 dark:bg-red-900/30 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${accentColor}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-red-400 dark:text-red-500 mt-2">
            This lockout is enforced server-side for security
          </p>
        </div>
      </div>

      {/* Security tips */}
      <div className="mt-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
          While you wait:
        </p>
        <ul className="text-xs text-slate-500 dark:text-slate-500 space-y-1">
          <li className="flex items-start gap-1.5">
            <span className="text-slate-400 mt-px">&#8226;</span>
            Double-check your email address for typos
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-slate-400 mt-px">&#8226;</span>
            Make sure Caps Lock is off when typing your password
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-slate-400 mt-px">&#8226;</span>
            Use the "Forgot password?" link if you need to reset
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-slate-400 mt-px">&#8226;</span>
            Contact your administrator if the issue persists
          </li>
        </ul>
      </div>
    </div>
  );
}
