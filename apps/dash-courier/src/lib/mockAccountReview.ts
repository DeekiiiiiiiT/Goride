export type ReviewItemStatus = 'submitted' | 'under-review' | 'processing';

export type AccountReviewItem = {
  id: string;
  label: string;
  status: ReviewItemStatus;
  statusLabel: string;
};

export const ACCOUNT_REVIEW_ITEMS: AccountReviewItem[] = [
  {
    id: 'license',
    label: "Driver's license",
    status: 'submitted',
    statusLabel: 'Submitted',
  },
  {
    id: 'registration',
    label: 'Vehicle registration',
    status: 'under-review',
    statusLabel: 'Under review',
  },
  {
    id: 'background',
    label: 'Background check',
    status: 'processing',
    statusLabel: 'Processing',
  },
];
