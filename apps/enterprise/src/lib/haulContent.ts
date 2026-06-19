import { SERVICE_URLS } from '@/lib/siteContent';

export const HAUL_APP_URL = SERVICE_URLS.haul;

export const HAULER_FEATURES = [
  {
    title: 'Earnings Potential',
    description: 'Maximize your margin with optimized route sequencing.',
    icon: 'payments' as const,
  },
  {
    title: 'Flexible Scheduling',
    description: "Your truck, your time. Take loads when you're ready.",
    icon: 'calendar' as const,
  },
  {
    title: 'Real-Time Dispatch',
    description: 'Instant notification of local high-priority hauls.',
    icon: 'dispatch' as const,
  },
];

export const SHIPPER_FEATURES = [
  { title: 'On-demand Freight Booking', icon: 'bolt' as const },
  { title: 'Scheduled Haulage', icon: 'calendar' as const },
  { title: 'Real-time Tracking', icon: 'tracking' as const },
  { title: 'Proof of Delivery', icon: 'proof' as const },
];

export const VEHICLE_TYPES = [
  { title: 'Pickup Trucks', icon: 'pickup' as const, wide: false },
  { title: 'Cargo Vans', icon: 'van' as const, wide: false },
  {
    title: 'Heavy Equipment',
    subtitle: 'Oversized & Specialty Loads',
    icon: 'heavy' as const,
    wide: true,
  },
  { title: 'Box Trucks', icon: 'box' as const, wide: false },
  { title: 'Flatbeds', icon: 'flatbed' as const, wide: false },
];

export const APP_FEATURES = [
  {
    title: 'Active Load Board',
    description: 'Instant access to available high-yield routes.',
    icon: 'load-board' as const,
  },
  {
    title: 'Earnings Tracking',
    description: 'Visualize daily and weekly revenue growth.',
    icon: 'earnings' as const,
  },
];

export const COMPLIANCE_ITEMS = [
  { title: 'Premium Insurance Coverage', icon: 'shield' as const },
  { title: 'Verified Professional Haulers', icon: 'verified' as const },
  { title: 'Digital Documentation Audit', icon: 'docs' as const },
];
