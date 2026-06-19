export type ActivityFilter = 'active' | 'completed' | 'cancelled';

export type ActivityEntry = {
  id: string;
  filter: ActivityFilter;
  icon: string;
  iconFill?: boolean;
  iconColor?: string;
  title: string;
  timestamp: string;
  body: string;
  highlight?: boolean;
  badge?: string;
  footer?: { icon: string; label: string; action?: boolean }[];
};

export const DEMO_ACTIVITY_FEED: ActivityEntry[] = [
  {
    id: 'a1',
    filter: 'active',
    icon: 'local_shipping',
    iconFill: true,
    iconColor: '#ffc174',
    title: 'Arrived at pickup',
    timestamp: 'Just now',
    badge: 'Just now',
    highlight: true,
    body: 'Load #LD-88294 (Industrial Steel Coils) - Chicago, IL. Awaiting loading dock assignment from site manager.',
    footer: [
      { icon: 'location_on', label: 'Facility Gate B, Dock 4' },
      { icon: 'chat', label: 'Message Dispatch', action: true },
    ],
  },
  {
    id: 'a2',
    filter: 'active',
    icon: 'route',
    title: 'En route to pickup',
    timestamp: '10:15 AM',
    body: 'Departed rest stop. ETA to pickup location: 45 minutes. Traffic conditions normal on I-94.',
  },
  {
    id: 'a3',
    filter: 'active',
    icon: 'check_circle',
    title: 'Pre-trip inspection logged',
    timestamp: '08:30 AM',
    body: 'All systems operational. Tire pressure and brake lines verified. eLog updated.',
  },
  {
    id: 'a4',
    filter: 'active',
    icon: 'payments',
    iconColor: '#7bd0ff',
    title: 'Payment pending',
    timestamp: 'Yesterday, 4:20 PM',
    body: 'Load #LD-88293 (Lumber) delivered. Proof of delivery (POD) submitted. Awaiting broker settlement processing.',
  },
];
