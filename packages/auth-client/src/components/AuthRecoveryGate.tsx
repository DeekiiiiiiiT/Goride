import React from 'react';
import { isPasswordRecoveryUrl } from '../supabaseRecovery';
import { PasswordRecoveryPage, type PasswordRecoveryPageProps } from './PasswordRecoveryPage';

export type AuthRecoveryGateProps = PasswordRecoveryPageProps & {
  children: React.ReactNode;
};

/**
 * Renders PasswordRecoveryPage when the URL is a Supabase recovery redirect;
 * otherwise renders children unchanged.
 */
export function AuthRecoveryGate({
  children,
  title,
  subtitle,
  signInHref,
}: AuthRecoveryGateProps) {
  if (typeof window !== 'undefined' && isPasswordRecoveryUrl()) {
    return (
      <PasswordRecoveryPage
        title={title}
        subtitle={subtitle}
        signInHref={signInHref}
      />
    );
  }
  return <>{children}</>;
}
