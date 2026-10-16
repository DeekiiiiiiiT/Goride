export const APP_VERSION =
  (typeof import.meta !== 'undefined' &&
    typeof import.meta.env?.VITE_APP_VERSION === 'string' &&
    import.meta.env.VITE_APP_VERSION.trim()) ||
  '0.1.0';

export const ABOUT_LINKS = [
  { id: 'terms', label: 'Terms of Service', href: 'https://roamrush.app/terms' },
  { id: 'privacy', label: 'Privacy Policy', href: 'https://roamrush.app/privacy' },
  { id: 'licenses', label: 'Open Source Licenses', href: 'https://roamrush.app/licenses' },
] as const;
