export const SAFETY_EMAIL = 'safety@roamenterprise.co';

export const RIDER_SAFETY_FEATURES = [
  {
    title: 'Driver Background Checks',
    description: 'Multi-layered criminal and driving record verification.',
    icon: 'shield' as const,
    accent: 'default' as const,
  },
  {
    title: 'Trip Sharing',
    description: 'Real-time GPS tracking shared with your trusted network.',
    icon: 'share' as const,
    accent: 'default' as const,
  },
  {
    title: 'Emergency Button',
    description: 'Instant 24/7 connection to local emergency responders.',
    icon: 'emergency' as const,
    accent: 'secondary' as const,
  },
  {
    title: 'Insurance Coverage',
    description: 'Comprehensive protection for every leg of the journey.',
    icon: 'verified' as const,
    accent: 'default' as const,
  },
] as const;

export const DRIVER_SAFETY_FEATURES = [
  {
    title: 'Rider Verification',
    description: 'Advanced identity checks for all accounts.',
    icon: 'check' as const,
  },
  {
    title: 'Two-Way Ratings',
    description: 'Maintaining excellence through community feedback.',
    icon: 'star' as const,
  },
  {
    title: '24/7 Support',
    description: 'A dedicated safety team on standby at all times.',
    icon: 'support' as const,
  },
] as const;

export const NAV_LINKS = [
  { label: 'Safety Overview', href: '#ecosystem' },
  { label: 'Rider Protocol', href: '#ecosystem', active: true },
  { label: 'Driver Standards', href: '#ecosystem' },
  { label: 'Community', href: '#community' },
] as const;
