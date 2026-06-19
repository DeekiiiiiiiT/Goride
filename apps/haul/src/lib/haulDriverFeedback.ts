export type DriverReview = {
  id: string;
  initials: string;
  name: string;
  date: string;
  loadRef: string;
  stars: number;
  body: string;
};

export const DEMO_DRIVER_REVIEWS: DriverReview[] = [
  {
    id: 'r1',
    initials: 'S.J.',
    name: 'Sarah J.',
    date: 'Oct 24, 2023',
    loadRef: '#8829',
    stars: 5,
    body: 'Great communication and handled items with care. Arrived exactly on time at the drop-off facility. Would highly recommend for fragile freight.',
  },
  {
    id: 'r2',
    initials: 'M.R.',
    name: 'Marcus R.',
    date: 'Oct 22, 2023',
    loadRef: '#8814',
    stars: 4,
    body: 'Solid delivery. Navigated the tight loading dock well. Lost one star because the ETA updates were a bit delayed, but overall good service.',
  },
  {
    id: 'r3',
    initials: 'T.C.',
    name: 'TechCorp Logistics',
    date: 'Oct 18, 2023',
    loadRef: '#8790',
    stars: 5,
    body: 'Flawless execution on a high-value electronics load. Temperature maintained perfectly throughout the transit. Professional top-tier hauler.',
  },
];

export const DEMO_RATING_DISTRIBUTION = [
  { stars: 5, count: 105, pct: 85 },
  { stars: 4, count: 12, pct: 10 },
  { stars: 3, count: 4, pct: 3 },
  { stars: 2, count: 2, pct: 1 },
  { stars: 1, count: 1, pct: 1 },
];

export const DEMO_OVERALL_RATING = 4.8;
export const DEMO_TOTAL_REVIEWS = 124;
