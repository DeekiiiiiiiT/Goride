export const SUPPORT_EMAIL = 'support@roamenterprise.co';
export const SUPPORT_PHONE = '+1-800-ROAM-HELP';

export const POPULAR_TAGS = ['Booking', 'Payments', 'Safety'] as const;

export const HELP_CATEGORIES = [
  { label: 'Riders', href: '/rides', icon: 'riders' as const, iconBg: 'bg-fleet-slate', iconColor: 'text-white' },
  {
    label: 'Drivers',
    href: '/driver',
    icon: 'drivers' as const,
    iconBg: 'bg-secondary-container',
    iconColor: 'text-on-secondary-container',
  },
  {
    label: 'Haulers',
    href: '/haul',
    icon: 'haulers' as const,
    iconBg: 'bg-haul-indigo/10',
    iconColor: 'text-haul-indigo',
  },
  {
    label: 'Fleet Owners',
    href: '/fleet',
    icon: 'fleet' as const,
    iconBg: 'bg-fleet-slate/10',
    iconColor: 'text-fleet-slate',
  },
  {
    label: 'Restaurants',
    href: '/dash',
    icon: 'restaurants' as const,
    iconBg: 'bg-secondary-fixed',
    iconColor: 'text-on-secondary-fixed',
  },
  {
    label: 'Enterprise',
    href: '/enterprise',
    icon: 'enterprise' as const,
    iconBg: 'bg-fleet-slate',
    iconColor: 'text-white',
  },
] as const;

export const PROMOTED_ARTICLES = [
  {
    title: 'How to update your payment method',
    keywords: ['payment', 'payments', 'billing', 'wallet'],
    href: 'mailto:support@roamenterprise.co?subject=Payment%20Method%20Help',
  },
  {
    title: 'Safety guidelines for night rides',
    keywords: ['safety', 'night', 'rides', 'rider'],
    href: '/safety',
  },
  {
    title: 'Understanding surge pricing',
    keywords: ['surge', 'pricing', 'booking', 'rides'],
    href: 'mailto:support@roamenterprise.co?subject=Surge%20Pricing%20Help',
  },
] as const;

export const CONTACT_OPTIONS = [
  {
    title: 'Email Support',
    description: 'Response within 2 hours',
    icon: 'email' as const,
    iconBg: 'bg-fleet-slate text-white',
    href: 'mailto:support@roamenterprise.co',
  },
  {
    title: 'Phone Support',
    description: 'Direct line to specialists',
    icon: 'phone' as const,
    iconBg: 'bg-secondary-container text-on-secondary-container',
    href: 'tel:+180076264357',
  },
  {
    title: 'In-app Chat',
    description: 'Chat with us now',
    icon: 'chat' as const,
    iconBg: 'bg-dash-cyan/20 text-dash-cyan',
    href: 'mailto:support@roamenterprise.co?subject=Live%20Chat%20Request',
  },
  {
    title: 'Social Media',
    description: 'DM us on Twitter or IG',
    icon: 'social' as const,
    iconBg: 'bg-haul-indigo/10 text-haul-indigo',
    href: 'https://twitter.com',
  },
] as const;
