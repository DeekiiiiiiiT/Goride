import React from 'react';
import { useAppConfig } from '../AppConfigContext';
import type { LegalLinksValue, RushAppId } from '../types';

type Props = {
  app: RushAppId;
  children?: (legal: LegalLinksValue) => React.ReactNode;
  className?: string;
  termsLabel?: string;
  privacyLabel?: string;
};

/** Terms + privacy links from platform.legal.*.<app>. */
export function LegalLinks({
  app,
  children,
  className,
  termsLabel = 'Terms of Service',
  privacyLabel = 'Privacy Policy',
}: Props) {
  const { legal } = useAppConfig(app);

  if (children) {
    return <>{children(legal)}</>;
  }

  return (
    <ul
      className={className}
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {legal.terms ? (
        <li style={{ marginBottom: 8 }}>
          <a href={legal.terms} target="_blank" rel="noopener noreferrer">
            {termsLabel}
          </a>
        </li>
      ) : null}
      {legal.privacy ? (
        <li>
          <a href={legal.privacy} target="_blank" rel="noopener noreferrer">
            {privacyLabel}
          </a>
        </li>
      ) : null}
    </ul>
  );
}
