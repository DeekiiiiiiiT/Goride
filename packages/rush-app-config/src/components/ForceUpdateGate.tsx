import React, { useState } from 'react';
import { useAppConfig } from '../AppConfigContext';
import type { RushAppId } from '../types';

type Props = {
  app: RushAppId;
  children: React.ReactNode;
};

/** Blocks when current appVersion is below platform.app_version.<app>.<platform>.minVersion. */
export function ForceUpdateGate({ app, children }: Props) {
  const config = useAppConfig(app);
  const [dismissRecommended, setDismissRecommended] = useState(false);

  if (config.update.required) {
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
          Update required
        </h1>
        <p style={{ maxWidth: '28rem', opacity: 0.85, marginBottom: '1.25rem' }}>
          This version of {config.brandName} is no longer supported. Please update to continue
          (minimum {config.update.minVersion}).
        </p>
        {config.update.storeUrl ? (
          <a
            href={config.update.storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              minHeight: 48,
              padding: '0.75rem 1.5rem',
              borderRadius: 12,
              background: 'var(--color-primary, #006c49)',
              color: 'var(--color-on-primary, #fff)',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Update now
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {config.update.recommended && !dismissRecommended ? (
        <div
          role="status"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            background: 'var(--color-primary-container, #a8f0d0)',
            color: 'var(--color-on-primary-container, #003826)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '0.875rem',
          }}
        >
          <span style={{ flex: 1 }}>
            A newer version of {config.brandName} is available
            {config.update.recommendedVersion
              ? ` (${config.update.recommendedVersion})`
              : ''}
            .
          </span>
          {config.update.storeUrl ? (
            <a
              href={config.update.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontWeight: 600, color: 'inherit' }}
            >
              Update
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setDismissRecommended(true)}
            aria-label="Dismiss"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: 600,
              color: 'inherit',
            }}
          >
            Later
          </button>
        </div>
      ) : null}
      {children}
    </>
  );
}
