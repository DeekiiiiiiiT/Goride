import React from 'react';
import { useAppConfig, useAppConfigMeta } from '../AppConfigContext';
import type { RushAppId } from '../types';

type Props = {
  app: RushAppId;
  children: React.ReactNode;
  /** Optional brand override for the title. */
  title?: string;
};

/** Full-screen block when platform.maintenance.<app>.active is true. Never blocks on fetch failure. */
export function MaintenanceGate({ app, children, title }: Props) {
  const config = useAppConfig(app);
  const { refresh } = useAppConfigMeta();

  if (!config.maintenance.active) {
    return <>{children}</>;
  }

  const heading = title ?? config.brandName;
  const until =
    config.maintenance.until && !Number.isNaN(Date.parse(config.maintenance.until))
      ? new Date(config.maintenance.until).toLocaleString()
      : null;

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        textAlign: 'center',
        background: 'var(--color-background, #fafafa)',
        color: 'var(--color-on-background, #1a1a1a)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
        {heading} is temporarily unavailable
      </h1>
      <p style={{ maxWidth: '28rem', opacity: 0.85, marginBottom: '0.5rem' }}>
        {config.maintenance.message ||
          'We’re doing a short maintenance window. Please try again in a few minutes.'}
      </p>
      {until ? (
        <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1.25rem' }}>
          Expected back: {until}
        </p>
      ) : (
        <div style={{ height: '1.25rem' }} />
      )}
      <button
        type="button"
        onClick={() => refresh()}
        style={{
          minHeight: 48,
          padding: '0 1.5rem',
          borderRadius: 12,
          border: 'none',
          background: 'var(--color-primary, #006c49)',
          color: 'var(--color-on-primary, #fff)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
