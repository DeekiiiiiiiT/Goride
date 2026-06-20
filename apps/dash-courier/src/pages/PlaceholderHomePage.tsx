import React from 'react';

/** Temporary shell until auth and dispatch screens are built. */
export function PlaceholderHomePage() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-[var(--spacing-edge)] text-center gap-4">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary-container">Roam Dash Courier</p>
      <h1 className="text-2xl font-bold text-on-surface">Home coming soon</h1>
      <p className="text-muted text-sm max-w-sm">
        Onboarding is complete. The dispatch, offer, and earnings screens will be added as you share
        the next designs.
      </p>
    </div>
  );
}
