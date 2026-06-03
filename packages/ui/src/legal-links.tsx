import React from 'react';
import { ROAM_LEGAL } from '@roam/business-config/legalUrls';

type LinkClassProps = {
  privacyClassName?: string;
  termsClassName?: string;
};

type SentenceProps = LinkClassProps & {
  variant: 'sentence';
  beforePrivacy?: string;
  between?: string;
  afterTerms?: string;
  className?: string;
  /** Default: privacy-first ("Privacy Policy and Terms of Service"). */
  order?: 'privacy-first' | 'terms-first';
};

type InlineProps = LinkClassProps & {
  variant?: 'inline';
};

export type LegalPolicyLinksProps = SentenceProps | InlineProps;

function PrivacyLink({ className }: { className?: string }) {
  return (
    <a
      href={ROAM_LEGAL.privacyPolicyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      Privacy Policy
    </a>
  );
}

function TermsLink({ className }: { className?: string }) {
  return (
    <a
      href={ROAM_LEGAL.termsOfServiceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      Terms of Service
    </a>
  );
}

function TermsAndConditionsLink({ className }: { className?: string }) {
  return (
    <a
      href={ROAM_LEGAL.termsOfServiceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      Terms &amp; Conditions
    </a>
  );
}

export function LegalPolicyLinks(props: LegalPolicyLinksProps) {
  if (props.variant === 'sentence') {
    const {
      beforePrivacy = '',
      between = ' and ',
      afterTerms = '',
      className,
      privacyClassName,
      termsClassName,
      order = 'privacy-first',
    } = props;
    return (
      <span className={className}>
        {beforePrivacy}
        {order === 'terms-first' ? (
          <>
            <TermsLink className={termsClassName} />
            {between}
            <PrivacyLink className={privacyClassName} />
          </>
        ) : (
          <>
            <PrivacyLink className={privacyClassName} />
            {between}
            <TermsLink className={termsClassName} />
          </>
        )}
        {afterTerms}
      </span>
    );
  }

  return (
    <>
      <PrivacyLink className={props.privacyClassName} />
      {' and '}
      <TermsLink className={props.termsClassName} />
    </>
  );
}

export function LegalPolicyAcceptanceLabel({
  privacyClassName,
  termsClassName,
}: LinkClassProps) {
  return (
    <>
      I have read and accept the{' '}
      <PrivacyLink className={privacyClassName} /> and{' '}
      <TermsAndConditionsLink className={termsClassName} />.
    </>
  );
}

export { ROAM_LEGAL };

export function openLegalDocument(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
