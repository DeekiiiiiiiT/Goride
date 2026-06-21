export interface HelpTopic {
  id: string;
  icon: string;
  label: string;
  keywords: string[];
}

export interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  section?: 'hours' | 'delivery' | 'profile' | 'earnings';
}

export const DISPATCH_PHONE = '+18765550199';
export const SUPPORT_EMAIL = 'partners@roamdash.com';
export const SUPPORT_PHONE = '+18765550100';

export const QUICK_TOPICS: HelpTopic[] = [
  {
    id: 'orders',
    icon: 'receipt',
    label: 'Orders & Deliveries',
    keywords: ['order', 'delivery', 'courier', 'pickup', 'cancel'],
  },
  {
    id: 'menu',
    icon: 'restaurant_menu',
    label: 'Menu Management',
    keywords: ['menu', 'item', 'category', 'price', 'availability'],
  },
  {
    id: 'payments',
    icon: 'payments',
    label: 'Payments & Payouts',
    keywords: ['payment', 'payout', 'bank', 'earnings', 'fee'],
  },
  {
    id: 'account',
    icon: 'person_outline',
    label: 'Account Issues',
    keywords: ['account', 'profile', 'login', 'password', 'team'],
  },
  {
    id: 'technical',
    icon: 'settings',
    label: 'Technical Support',
    keywords: ['technical', 'printer', 'app', 'bug', 'connection'],
  },
];

export const COMMON_QUESTIONS: HelpArticle[] = [
  {
    id: 'business-hours',
    title: 'How to update business hours',
    summary: 'Go to Account → Business Hours, set your weekly schedule, and tap Save Hours.',
    keywords: ['hours', 'schedule', 'open', 'closed', 'business'],
    section: 'hours',
  },
  {
    id: 'printer',
    title: 'Troubleshooting printer connection',
    summary:
      'Confirm your printer is on the same Wi‑Fi network, restart the Roam Dash app, and re-pair from device settings.',
    keywords: ['printer', 'print', 'receipt', 'bluetooth', 'wifi'],
  },
  {
    id: 'payouts',
    title: 'Understanding payout schedules',
    summary:
      'Payouts are processed weekly. View pending and completed payouts under Account → Bank & Payouts.',
    keywords: ['payout', 'payment', 'schedule', 'bank', 'earnings'],
    section: 'earnings',
  },
];
