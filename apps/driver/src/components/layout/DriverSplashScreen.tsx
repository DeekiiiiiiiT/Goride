import React, { useEffect, useRef } from 'react';

const SPLASH_BG = '/images/splash-driver.png';
const APP_VERSION = 'v0.1.0-DRV';

type DriverSplashScreenProps = {
  mode?: 'loading' | 'welcome';
  signInLoading?: boolean;
  onSignIn?: () => void;
  onBecomeDriver?: () => void;
  panel?: React.ReactNode;
};

export function DriverSplashScreen({
  mode = 'welcome',
  signInLoading = false,
  onSignIn,
  onBecomeDriver,
  panel,
}: DriverSplashScreenProps) {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;

    const handleMove = (e: MouseEvent) => {
      const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
      const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
      bg.style.transform = `scale(1.05) translate(${moveX}px, ${moveY}px)`;
    };

    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return (
    <main className="driver-splash" role={mode === 'loading' ? 'status' : undefined}>
      <div className="driver-splash__bg-wrap" ref={bgRef} aria-hidden>
        <img src={SPLASH_BG} alt="" fetchPriority="high" decoding="async" />
        <div className="driver-splash__vignette" />
        <div className="driver-splash__gradient" />
      </div>

      <div className="driver-splash__header">
        <div>
          <p className="driver-splash__status-label">Status</p>
          <div className="driver-splash__status-row">
            <div className="driver-splash__status-dot" aria-hidden />
            <p className="driver-splash__status-text">Online in Kingston</p>
          </div>
        </div>
        <div className="driver-splash__version">{APP_VERSION}</div>
      </div>

      <div className="driver-splash__brand">
        <div className="driver-splash__edition-row">
          <div className="driver-splash__edition-line" aria-hidden />
          <p className="driver-splash__edition-label">Driver Edition</p>
          <div className="driver-splash__edition-line" aria-hidden />
        </div>
        <h1 className="driver-splash__title">Roam</h1>
        <p className="driver-splash__tagline">Premium Transit</p>
        <div className="driver-splash__divider" aria-hidden />
      </div>

      <div className="driver-splash__panel">
        {mode === 'loading' ? (
          <div className="driver-splash__loading-panel">
            <div className="driver-splash__loading-spinner" aria-hidden />
            <p className="driver-splash__loading-text">Loading Roam Driver…</p>
          </div>
        ) : panel ? (
          <div className="driver-splash__panel-inner">{panel}</div>
        ) : (
          <div className="driver-splash__panel-inner">
            <div className="driver-splash__value-prop">
              <h2 className="driver-splash__headline">Elevate Your Drive</h2>
              <p className="driver-splash__subtext">
                Access high-tier bookings and elite urban professional clientele across the Caribbean.
              </p>
            </div>

            <div className="driver-splash__actions">
              <button
                type="button"
                className="driver-splash__btn-primary"
                onClick={onSignIn}
                disabled={signInLoading}
              >
                {signInLoading ? (
                  <span className="driver-splash__btn-spinner" aria-hidden />
                ) : (
                  'Sign In to Dashboard'
                )}
              </button>

              <div className="driver-splash__or-row">
                <div className="driver-splash__or-line" aria-hidden />
                <span className="driver-splash__or-text">New to Roam?</span>
                <div className="driver-splash__or-line" aria-hidden />
              </div>

              <button
                type="button"
                className="driver-splash__btn-secondary"
                onClick={onBecomeDriver}
              >
                Become a Driver
              </button>
            </div>

            <div className="driver-splash__footer-links">
              <a className="driver-splash__footer-link" href="mailto:support@roam.app">
                Help Center
              </a>
              <a className="driver-splash__footer-link" href="mailto:support@roam.app?subject=Safety%20Portal">
                Safety Portal
              </a>
              <a className="driver-splash__footer-link" href="mailto:support@roam.app?subject=Partnership%20Terms">
                Partnership Terms
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
