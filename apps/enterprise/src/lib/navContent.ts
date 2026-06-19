import { SERVICE_URLS } from '@/lib/siteContent';

export type NavLink = {
  label: string;
  href: string;
  external?: boolean;
};

export const MAIN_NAV: NavLink[] = [
  { label: 'Rides', href: '/rides' },
  { label: 'Drive', href: '/driver' },
  { label: 'Haul', href: '/haul' },
  { label: 'Fleet', href: '/fleet' },
  { label: 'Dash', href: '/dash' },
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

export const FOOTER_SERVICES: NavLink[] = [
  { label: 'Roam Rides', href: '/rides' },
  { label: 'Roam Driver', href: '/driver' },
  { label: 'Roam Haul', href: '/haul' },
  { label: 'Roam Fleet', href: '/fleet' },
  { label: 'Roam Dash', href: '/dash' },
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
