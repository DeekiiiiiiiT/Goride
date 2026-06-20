export type StackedLoadItem = {
  id: string;
  customer: string;
  restaurant: string;
  closest?: boolean;
  dimmed?: boolean;
};

export type StackedDeliveryStop = {
  id: string;
  label: string;
  status: 'completed' | 'active' | 'pending';
};

export type StackedDelivery = {
  nextStopDistance: string;
  restaurant: string;
  address: string;
  steps: StackedDeliveryStop[];
  load: StackedLoadItem[];
};

const STACKED_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCQRcPcOHn-fWr5CZ_zRtBUY0V4uNHiJ1GpU-1IwB0YMSZGI38USR5-gygq3GM2Dd4pVSIHbPjcgUI7OhRL2oU655-IzJGfLCBd7VjA7mfGokdEMW1ZktxNi4Ui-6iSRJqhWjgfU1AELk4PpOB58SBwkLZkDnt88r2uuM7U7bTHM-ia3ekAilsIfpJRkzi8K5PbmU3ZU8nwx4W96ii62ZLlNWUADt5_PVkQEbQ6gYrrW-yO1cPKOPnF3_Ir0yTI6PVbw4vZPA_0Ziw';

export const MOCK_STACKED_DELIVERY: StackedDelivery = {
  nextStopDistance: '2.4 mi',
  restaurant: 'Juici Patties',
  address: '14 Half Way Tree Rd, Kingston',
  steps: [
    { id: 'pick-1', label: 'Pick 1', status: 'completed' },
    { id: 'pick-2', label: 'Pick 2', status: 'active' },
    { id: 'drop-1', label: 'Drop 1', status: 'pending' },
    { id: 'drop-2', label: 'Drop 2', status: 'pending' },
  ],
  load: [
    { id: '1', customer: 'Sarah', restaurant: 'Island Grill', closest: true },
    { id: '2', customer: 'Marcus', restaurant: 'Juici Patties', dimmed: true },
  ],
};

export { STACKED_MAP };
