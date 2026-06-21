export type DeclineReasonId =
  | 'distance'
  | 'pay'
  | 'area'
  | 'restaurant'
  | 'ending'
  | 'other';

export type DeclineReason = {
  id: DeclineReasonId;
  label: string;
  icon: string;
};

export const DECLINE_REASONS: DeclineReason[] = [
  { id: 'distance', label: 'Distance too far', icon: 'route' },
  { id: 'pay', label: 'Pay too low', icon: 'payments' },
  { id: 'area', label: 'Avoid this area', icon: 'wrong_location' },
  { id: 'restaurant', label: 'Restaurant issues', icon: 'store' },
  { id: 'ending', label: 'Ending shift soon', icon: 'timer_off' },
  { id: 'other', label: 'Other', icon: 'more_horiz' },
];
