export type HelpTopic = {
  id: string;
  label: string;
  icon: string;
};

export type SupportTicket = {
  id: string;
  title: string;
  status: string;
  statusTone: 'muted' | 'primary';
  icon: string;
  iconBg: string;
  hasNotification?: boolean;
};

export type RatingDistribution = {
  stars: number;
  percent: number;
  tone?: 'error';
};

export type CourierFeedback = {
  id: string;
  initials: string;
  date: string;
  stars: number;
  comment: string;
};

export type PayoutSchedule = 'weekly' | 'daily' | 'instant';

export const HELP_TOPICS: HelpTopic[] = [
  { id: 'getting-started', label: 'Getting Started', icon: 'rocket_launch' },
  { id: 'during-delivery', label: 'During a Delivery', icon: 'directions_bike' },
  { id: 'earnings', label: 'Earnings & Payouts', icon: 'account_balance_wallet' },
  { id: 'account', label: 'Account & Documents', icon: 'badge' },
  { id: 'app-issues', label: 'App Issues', icon: 'build' },
  { id: 'safety', label: 'Safety', icon: 'health_and_safety' },
];

export const SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: 't-1',
    title: 'Missing payment for order #8892',
    status: 'Closed • Oct 12',
    statusTone: 'muted',
    icon: 'receipt_long',
    iconBg: 'bg-surface-container-high text-on-surface-variant',
  },
  {
    id: 't-2',
    title: 'Account deactivation inquiry',
    status: 'Action Required • Oct 24',
    statusTone: 'primary',
    icon: 'chat_bubble',
    iconBg: 'bg-primary-container text-on-primary-container',
    hasNotification: true,
  },
];

export const RATING_DISTRIBUTION: RatingDistribution[] = [
  { stars: 5, percent: 85 },
  { stars: 4, percent: 10 },
  { stars: 3, percent: 3 },
  { stars: 2, percent: 1 },
  { stars: 1, percent: 1, tone: 'error' },
];

export const RECENT_FEEDBACK: CourierFeedback[] = [
  {
    id: 'fb-1',
    initials: 'JS',
    date: 'Oct 24, 2023',
    stars: 5,
    comment: 'Fast delivery! The courier was very polite and handled my package with care.',
  },
];

export const PREFERRED_AREAS = ['Downtown', 'North End', 'University District', 'Westside'];

export const DEFAULT_NOTIFICATION_SETTINGS = {
  deliveryOffers: true,
  earningsUpdates: true,
  peakPay: true,
  promotions: false,
  weeklySummary: true,
  soundOffers: true,
  vibrationOffers: true,
};

export const DEFAULT_DASH_PREFERENCES = {
  foodDelivery: true,
  maxDistanceKm: 5,
  preferredAreas: ['Downtown', 'University District'] as string[],
  avoidAreas: '',
  autoAccept: false,
};
