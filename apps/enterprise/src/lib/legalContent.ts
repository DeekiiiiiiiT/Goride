export const LEGAL_EMAIL = 'legal@roamenterprise.co';
export const PRIVACY_EMAIL = 'privacy@roamenterprise.com';
export const ACCESSIBILITY_EMAIL = 'accessibility@roam.enterprise';

export type LegalPageId = 'privacy' | 'terms' | 'cookies' | 'accessibility';

export const LEGAL_NAV: {
  id: LegalPageId;
  label: string;
  href: string;
  icon: 'privacy' | 'terms' | 'cookies' | 'accessibility';
}[] = [
  { id: 'privacy', label: 'Privacy Policy', href: '/privacy', icon: 'privacy' },
  { id: 'terms', label: 'Terms of Service', href: '/terms', icon: 'terms' },
  { id: 'cookies', label: 'Cookie Policy', href: '/cookies', icon: 'cookies' },
  { id: 'accessibility', label: 'Accessibility', href: '/accessibility', icon: 'accessibility' },
];

export const COOKIE_ROWS = [
  { name: 'roam_session_id', provider: 'Roam Ent.', type: 'Essential', typeClass: 'haul-indigo', duration: 'Session' },
  { name: '_ga_analytics', provider: 'Google', type: 'Analytics', typeClass: 'dash-cyan', duration: '2 Years' },
  { name: 'user_prefs_loc', provider: 'Roam Ent.', type: 'Functional', typeClass: 'rides-blue', duration: '1 Year' },
  { name: 'ads_tracking_opt', provider: 'Meta', type: 'Marketing', typeClass: 'secondary', duration: '6 Months' },
] as const;

export const COOKIE_CATEGORIES = [
  {
    title: 'Essential Cookies',
    description:
      'These cookies are strictly necessary to provide you with services available through our website and to use some of its features, such as access to secure areas.',
    icon: 'essential' as const,
    accent: 'haul-indigo' as const,
  },
  {
    title: 'Performance & Analytics',
    description:
      'These cookies collect information about how you use our website, for instance which pages you visit most often, to improve how the platform works.',
    icon: 'analytics' as const,
    accent: 'dash-cyan' as const,
  },
  {
    title: 'Marketing Cookies',
    description:
      'These cookies are used to make advertising messages more relevant to you. They perform functions like preventing the same ad from continuously reappearing.',
    icon: 'marketing' as const,
    accent: 'secondary' as const,
  },
  {
    title: 'Functional Cookies',
    description:
      'These cookies allow our website to remember choices you make (such as your user name or the region you are in) and provide enhanced features.',
    icon: 'functional' as const,
    accent: 'rides-blue' as const,
  },
];

export const ACCESSIBILITY_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBYumA4eC-94SbYv_1IFsPmR-MtRP43LwATxYtEz0qq8rLDuz5SmuSTGD0H094TCnOL-5Aeb0cs15LZwc1lYvTreqmny1Fw9LyrcgbeMDhLXWP7ax1ghESEMAwDOODXKeRRMnQKD3ViTOEMTynkaywvAK5Kamep7Xk5SouYUjLv1X0Tc0jpfYyTKnVQ9_XgDNY01Am44xFTOXuz7k1c3XGvC4acinaULpgzBecr8ad7AdgQdGyl18gV2t5C8iN7JmiUEQI1K6YdDfn5';

export const TERMS_TOC = [
  { id: 'acceptance', label: '1. Acceptance of Terms' },
  { id: 'service', label: '2. Service Description' },
  { id: 'responsibilities', label: '3. User Responsibilities' },
  { id: 'liability', label: '4. Limitation of Liability' },
] as const;
