import { SERVICE_URLS } from '@/lib/siteContent';

export type NavLink = {
  label: string;
  href: string;
  external?: boolean;
};

/** Top nav mirrors the three product lines + About. */
export const MAIN_NAV: NavLink[] = [
  { label: 'Rideshare', href: '/rides' },
  { label: 'Delivery', href: '/rush' },
  { label: 'Enterprise', href: '/enterprise' },
  { label: 'About', href: '/about' },
];

export const SECONDARY_NAV: NavLink[] = [
  { label: 'Help', href: '/help' },
  { label: 'Contact', href: '/contact' },
];

export const DEFAULT_CTA = {
  label: 'Get Started',
  href: '/contact',
} as const;

/** Apex marketing — product picker only (no email/password). */
export const SIGN_IN_CTA = {
  label: 'Sign In',
  href: '/sign-in',
} as const;

export const FOOTER_SERVICES: NavLink[] = [
  { label: 'Roam Rides', href: '/rides' },
  { label: 'Roam Driver', href: '/driver' },
  { label: 'Roam Fleet', href: '/fleet' },
  { label: 'Roam Rush', href: '/rush' },
  { label: 'Enterprise', href: '/enterprise' },
];

export const FOOTER_COMPANY: NavLink[] = [
  { label: 'About', href: '/about' },
  { label: 'Careers', href: '/careers' },
  { label: 'Press', href: '/contact' },
  { label: 'Contact', href: '/contact' },
];

export const FOOTER_LEGAL: NavLink[] = [
  { label: 'Privacy Policy', href: SERVICE_URLS.privacy },
  { label: 'Terms of Service', href: SERVICE_URLS.terms },
  { label: 'Cookie Settings', href: SERVICE_URLS.cookies },
  { label: 'Accessibility', href: SERVICE_URLS.accessibility },
];

export const SOCIAL_LINKS = [
  { label: 'LinkedIn', href: 'https://linkedin.com/company/roam' },
  { label: 'X (Twitter)', href: 'https://x.com/roam' },
  { label: 'YouTube', href: 'https://youtube.com/@roam' },
] as const;

export const APP_DOWNLOAD = {
  appStore: SERVICE_URLS.rides,
  googlePlay: SERVICE_URLS.rides,
} as const;
