export type IssueCategory = {
  id: string;
  label: string;
};

export const ISSUE_CATEGORIES: IssueCategory[] = [
  { id: 'long_wait', label: 'Order not ready (long wait)' },
  { id: 'restaurant_closed', label: 'Restaurant closed' },
  { id: 'wrong_items', label: 'Wrong or missing items' },
  { id: 'customer_unavailable', label: 'Customer unavailable' },
  { id: 'cant_find_address', label: "Can't find address" },
  { id: 'unsafe_location', label: 'Unsafe delivery location' },
  { id: 'vehicle_problem', label: 'Vehicle problem' },
  { id: 'accident_emergency', label: 'Accident or emergency' },
  { id: 'other', label: 'Other' },
];
