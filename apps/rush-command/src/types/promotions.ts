export type PromotionType = 'percent_off' | 'amount_off' | 'free_delivery' | 'bogo';

export type PromotionStatus = 'active' | 'scheduled' | 'ended';

export type AppliesTo = 'entire_order' | 'specific_items' | 'specific_category';

export type CustomerEligibility = 'all' | 'new' | 'returning';

export type UsageLimitType = 'unlimited' | 'limited' | 'per_user';

export interface Promotion {
  id: string;
  type: PromotionType;
  title: string;
  discountPercent?: number;
  discountAmount?: number;
  minOrder?: number;
  appliesTo?: AppliesTo;
  promoCode?: string;
  customerEligibility?: CustomerEligibility;
  dateStart: string;
  dateEnd?: string;
  usageLimitPerCustomer?: number;
  redemptions: number;
  status: PromotionStatus;
}

export interface PromotionFormData {
  type: PromotionType;
  discountValue: string;
  minOrder: string;
  appliesTo: AppliesTo;
  promoCode: string;
  autoGenerateCode: boolean;
  dateStart: string;
  dateEnd: string;
  customerEligibility: CustomerEligibility;
  usageLimitType: UsageLimitType;
  usageLimit: string;
}

export interface DailyRedemption {
  day: string;
  redemptions: number;
  sales: number;
}

export const PROMOTION_TYPE_OPTIONS: { value: PromotionType; label: string; createLabel: string }[] = [
  { value: 'percent_off', label: '% Off', createLabel: 'Percentage Off' },
  { value: 'amount_off', label: '$ Off', createLabel: 'Amount Off' },
  { value: 'free_delivery', label: 'Free Delivery', createLabel: 'Free Delivery' },
  { value: 'bogo', label: 'BOGO', createLabel: 'BOGO' },
];

export const APPLIES_TO_OPTIONS: { value: AppliesTo; label: string }[] = [
  { value: 'entire_order', label: 'Entire Order' },
  { value: 'specific_items', label: 'Specific Items' },
  { value: 'specific_category', label: 'Specific Category' },
];

export const USAGE_LIMIT_OPTIONS: { value: UsageLimitType; label: string }[] = [
  { value: 'unlimited', label: 'Unlimited Uses' },
  { value: 'limited', label: 'Limited total uses' },
  { value: 'per_user', label: 'Limited to 1 per customer' },
];

export const ELIGIBILITY_OPTIONS: { value: CustomerEligibility; label: string }[] = [
  { value: 'all', label: 'All Customers' },
  { value: 'new', label: 'New Customers Only' },
  { value: 'returning', label: 'Returning Customers Only' },
];

export function generatePromoCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'ROAM';
  for (let index = 0; index < 6; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function parseAmount(value: string) {
  return Number(value.replace(/,/g, '')) || 0;
}

export function buildPromotionTitle(type: PromotionType, discountValue: string, minOrder: string) {
  const min = minOrder ? ` over J$${minOrder}` : '';

  switch (type) {
    case 'percent_off':
      return `${discountValue || '0'}% off first order`;
    case 'amount_off':
      return `J$${discountValue || '0'} off${min}`;
    case 'free_delivery':
      return `Free delivery${minOrder ? ` over J$${minOrder}` : ''}`;
    case 'bogo':
      return 'Buy one get one free';
    default:
      return 'New promotion';
  }
}

export function formatDateRange(start: string, end?: string) {
  if (!start) return 'Select date range';
  const startDate = new Date(`${start}T12:00:00`);
  const startLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!end) return startLabel;
  const endDate = new Date(`${end}T12:00:00`);
  const endLabel = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startLabel} - ${endLabel}`;
}

export function formatEndsLabel(dateEnd?: string) {
  if (!dateEnd) return 'Ongoing';
  const end = new Date(`${dateEnd}T23:59:59`);
  const now = new Date();
  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Ended';
  if (diffDays === 0) return 'Ends today';
  if (diffDays === 1) return 'Ends in 1 day';
  return `Ends in ${diffDays} days`;
}

export function promotionIcon(type: PromotionType) {
  return type === 'free_delivery' ? 'local_shipping' : 'local_activity';
}
