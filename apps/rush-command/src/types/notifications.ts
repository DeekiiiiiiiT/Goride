export type OrderAlertSound = 'chime' | 'bell' | 'urgent' | 'custom';

export interface NotificationSettings {
  newOrderAlerts: boolean;
  orderUpdates: boolean;
  dailySummaryEmail: boolean;
  weeklyReportEmail: boolean;
  payoutNotifications: boolean;
  newReviewAlerts: boolean;
  promotionalTips: boolean;
  orderAlertSound: OrderAlertSound;
  soundVolume: number;
  vibration: boolean;
}

export const ORDER_ALERT_SOUND_OPTIONS: { value: OrderAlertSound; label: string }[] = [
  { value: 'chime', label: 'Chime' },
  { value: 'bell', label: 'Bell' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'custom', label: 'Custom...' },
];

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  newOrderAlerts: true,
  orderUpdates: true,
  dailySummaryEmail: false,
  weeklyReportEmail: true,
  payoutNotifications: true,
  newReviewAlerts: false,
  promotionalTips: false,
  orderAlertSound: 'bell',
  soundVolume: 80,
  vibration: true,
};

export const ALERT_SOUND_URLS: Record<Exclude<OrderAlertSound, 'custom'>, string> = {
  chime: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
  bell: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  urgent: 'https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3',
};
