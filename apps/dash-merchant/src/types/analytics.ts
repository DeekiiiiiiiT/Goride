export type AnalyticsTimeRange = 'today' | 'week' | 'month' | 'custom';

export type AnalyticsNavTab = 'reviews' | 'health';

export type HealthView = 'overview' | 'top-items' | 'sales' | 'operational';

export type ReviewStarFilter = 'all' | 5 | 4 | 3 | 2 | 1;

export interface TopSellingItem {
  rank: number;
  name: string;
  revenue: number;
  orders: number;
  progress: number;
}

export interface CategoryRevenue {
  name: string;
  percent: number;
  color: string;
}

export interface MerchantReview {
  id: string;
  author: string;
  authorInitial: string;
  avatarClass: string;
  rating: number;
  daysAgo: number;
  text: string;
  items: string[];
  needsResponse?: boolean;
  response?: string;
}
