import React, { useState, useEffect } from 'react';
import { Shield, Clock } from 'lucide-react';

interface LockoutCountdownProps {
  retryAfterSec: number;
  onExpired: () => void;
  portalName?: string;
  accentColor?: string;
}

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
  }, [secondsLeft <= 0]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = retryAfterSec > 0 ? ((retryAfterSec - secondsLeft) / retryAfterSec) * 100 : 0;

  return (
    <div className="w-full">
      <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-6 text-center">
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-red-900/40 flex items-center justify-center">
              <Shield className="h-8 w-8 text-red-400" />
            </div>
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 animate-pulse" />
          </div>
        </div>

        <h3 className="text-lg font-semibold text-red-300 mb-1">
          Account Temporarily Locked
        </h3>
        <p className="text-sm text-red-400/70 mb-5 max-w-xs mx-auto">
          Too many failed login attempts on {portalName}. Please wait before trying again.
        </p>

        <div className="bg-white border border-red-300 dark:bg-slate-900 dark:border-red-800/40 rounded-lg px-6 py-4 mb-4 inline-block min-w-[200px]">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <Clock className="h-4 w-4 text-red-400" />
            <span className="text-xs font-medium text-red-400 uppercase tracking-wider">
              Try again in
            </span>
          </div>
          <div className="font-mono text-3xl font-bold text-slate-100 tabular-nums">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
        </div>

        <div className="w-full max-w-xs mx-auto">
          <div className="h-1.5 bg-red-900/30 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${accentColor}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-red-500 mt-2">
            This lockout is enforced server-side for security
          </p>
        </div>
      </div>
    </div>
  );
}
