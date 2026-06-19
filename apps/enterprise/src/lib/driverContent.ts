import { SERVICE_URLS } from '@/lib/siteContent';

export const DRIVER_APP_URL = SERVICE_URLS.driver;

export const DRIVER_ONBOARDING_STEPS = [
  {
    step: 1,
    title: 'Vehicle Requirements',
    items: [
      '4-door vehicle with 5+ seats',
      'Vehicle model year 2012 or newer',
      'Must pass a 19-point inspection',
    ],
    icon: 'check' as const,
  },
  {
    step: 2,
    title: 'Document Check',
    items: [
      "Valid driver's license",
      'Proof of vehicle registration',
      'Proof of valid insurance',
    ],
    icon: 'doc' as const,
  },
  {
    step: 3,
    title: 'Onboarding',
    description:
      'Complete a background check and pick up your driver welcome kit at a local hub.',
  },
];

export const DRIVER_SUPPORT_ITEMS = [
  {
    title: '24/7 Driver Support',
    description: 'Help is a tap away, day or night.',
    icon: 'support' as const,
  },
  {
    title: 'Driver Community',
    description: 'Connect with others and share tips.',
    icon: 'community' as const,
  },
  {
    title: 'In-Person Hubs',
    description: 'Visit our local offices for hands-on help.',
    icon: 'location' as const,
  },
];

export const HEATMAP_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAGuZW1Y0766-dJtRimvBjWlB8AevzBiSp_-injY_lWaYY0FdIJKj_yN75G2ToXVEtFm1owXD12wnLTG3e-F9JM8BEjhTOn8WdBjgGqM5iUAgMRGyj1MiR98DLtM6OlcTWBzHUc9qp4LcV2V5EYtnv1xyyath-WvVu8MdGze5xAHaDZ9a4i5o0R7NV0BOVcbPsdplnBoh49RjxFCi21GLiJWpWhJXKJPx0AzPc4d_J2SqmnT7jo7Bqj1lEhQ395AMaSE6XGPaqVkXXe';

export function calculateWeeklyPayout(hours: number): number {
  return hours * 31;
}
