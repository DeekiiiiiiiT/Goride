import React from 'react';

const SPLASH_BG = '/images/splash-driver.png';

export function SplashScreen() {
  const year = new Date().getFullYear();

  return (
    <div className="splash-screen" role="status" aria-label="Loading Roam">
      <div className="splash-screen__corner splash-screen__corner--tl" aria-hidden />
      <div className="splash-screen__corner splash-screen__corner--br" aria-hidden />

      <div className="splash-screen__spacer" aria-hidden />

      <div className="splash-screen__brand">
        <div className="splash-screen__title-row">
          <h1 className="splash-screen__title">Roam</h1>
          <span className="material-symbols-outlined splash-screen__bolt" aria-hidden>
            bolt
          </span>
        </div>
        <p className="splash-screen__tagline">Premium Transit</p>
      </div>

      <div className="splash-screen__footer">
        <div className="splash-orbit-spinner" aria-hidden>
          <div className="splash-orbit-inner" />
        </div>
        <div className="splash-screen__legal">
          <p className="splash-screen__copyright">
            © {year} Roam Technologies Inc.
          </p>
          <div className="splash-screen__accent-line" aria-hidden />
        </div>
      </div>

      <div className="splash-screen__bg" aria-hidden>
        <img
          src={SPLASH_BG}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
        <div className="splash-screen__overlay" />
      </div>
    </div>
  );
}
