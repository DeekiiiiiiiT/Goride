import React from 'react';
import { useAppConfig } from '../AppConfigContext';
import type { RushAppId, SupportContactValue } from '../types';

type Props = {
  app: RushAppId;
  /** Render prop; falls back to a compact contact block. */
  children?: (support: SupportContactValue) => React.ReactNode;
  className?: string;
};

/** Exposes platform.support.<app> contacts from app-config. */
export function SupportContact({ app, children, className }: Props) {
  const { support } = useAppConfig(app);

  if (children) {
    return <>{children(support)}</>;
  }

  return (
    <div className={className} style={{ fontFamily: 'system-ui, sans-serif', fontSize: '0.875rem' }}>
      {support.email ? (
        <a href={`mailto:${support.email}`} style={{ display: 'block', marginBottom: 4 }}>
          {support.email}
        </a>
      ) : null}
      {support.phone ? (
        <a href={`tel:${support.phone}`} style={{ display: 'block', marginBottom: 4 }}>
          {support.phone}
        </a>
      ) : null}
      {support.whatsapp ? (
        <a
          href={`https://wa.me/${support.whatsapp.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', marginBottom: 4 }}
        >
          WhatsApp
        </a>
      ) : null}
      {support.hours ? (
        <p style={{ margin: 0, opacity: 0.75 }}>Hours: {support.hours}</p>
      ) : null}
    </div>
  );
}
