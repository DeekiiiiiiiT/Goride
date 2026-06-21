import { ROAM_LEGAL } from '@roam/business-config/legalUrls';

export const APP_VERSION = '0.1.0';

export const ABOUT_LINKS = [
  { id: 'terms', label: 'Terms of Service', href: ROAM_LEGAL.termsOfServiceUrl },
  { id: 'privacy', label: 'Privacy Policy', href: ROAM_LEGAL.privacyPolicyUrl },
  { id: 'support', label: 'Courier Support', href: `mailto:${ROAM_LEGAL.supportEmail}` },
] as const;
