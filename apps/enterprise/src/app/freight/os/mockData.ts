/** Static mocks for Phase 1 Stitch screens — replaced by API in later phases. */

export const PIPELINE_FUNNEL = [
  { key: 'expected', label: 'Expected', count: 24 },
  { key: 'received_at_warehouse', label: 'In Warehouse', count: 18 },
  { key: 'manifested', label: 'Manifested', count: 12 },
  { key: 'in_transit_intl', label: 'In Transit', count: 31 },
  { key: 'customs_hold', label: 'Customs Hold', count: 4 },
  { key: 'customs_cleared', label: 'Cleared', count: 9 },
  { key: 'received_hub', label: 'At Hub', count: 7 },
  { key: 'ready_for_fulfillment', label: 'Ready', count: 5 },
  { key: 'delivered', label: 'Delivered', count: 142 },
  { key: 'exception', label: 'Exception', count: 2 },
] as const;

export const LANE_TILES = [
  { id: 'green', label: 'Green Lane', count: 28, tone: 'green' as const },
  { id: 'yellow', label: 'Yellow Lane', count: 6, tone: 'amber' as const },
  { id: 'red', label: 'Red Lane', count: 3, tone: 'red' as const },
];

export const RECENT_EXCEPTIONS = [
  {
    tracking: 'TBA-448291',
    suite: 'JA-10420',
    reason: 'Missing invoice PDF',
    updatedAt: '2026-08-08 09:12',
  },
  {
    tracking: 'AMZ-991002',
    suite: 'JA-10087',
    reason: 'Declared value mismatch',
    updatedAt: '2026-08-08 08:41',
  },
];

export const AUDIT_QUEUE = [
  {
    id: '1',
    tracking: 'TBA-448291',
    suite: 'JA-10420',
    declaredUsd: 189.99,
    invoiceStatus: 'missing' as const,
    weightLbs: 4.2,
  },
  {
    id: '2',
    tracking: 'SHEIN-77210',
    suite: 'JA-10555',
    declaredUsd: 64.5,
    invoiceStatus: 'mismatch' as const,
    weightLbs: 1.8,
  },
  {
    id: '3',
    tracking: 'AMZ-220194',
    suite: 'JA-10101',
    declaredUsd: 240,
    invoiceStatus: 'ready' as const,
    weightLbs: 6.1,
  },
];

export const HS_TARIFFS = [
  {
    id: '1',
    code: '8517.13.00',
    description: 'Smartphones',
    category: 'Electronics',
    cetRate: 0,
    active: true,
  },
  {
    id: '2',
    code: '6109.10.00',
    description: 'T-shirts, knitted, cotton',
    category: 'Apparel',
    cetRate: 0.2,
    active: true,
  },
  {
    id: '3',
    code: '8703.23.90',
    description: 'Motor vehicles for persons',
    category: 'Automotive',
    cetRate: 0.4,
    active: true,
  },
  {
    id: '4',
    code: '0201.30.00',
    description: 'Bovine meat, boneless, fresh',
    category: 'Food',
    cetRate: 0.05,
    active: false,
  },
];

export const MANIFEST_PACKAGES = [
  {
    id: 'p1',
    tracking: 'SWIFT-8821',
    suite: 'JA-10420',
    weightLbs: null as number | null,
    packed: true,
    blockers: ['missing_weight', 'missing_trn'] as string[],
  },
  {
    id: 'p2',
    tracking: 'SWIFT-8825',
    suite: 'JA-10087',
    weightLbs: 3.4,
    packed: true,
    blockers: ['missing_invoice'] as string[],
  },
  {
    id: 'p3',
    tracking: 'SWIFT-9001',
    suite: 'JA-10555',
    weightLbs: 2.1,
    packed: false,
    blockers: [] as string[],
  },
];

export const CLEARANCE_CARDS = {
  green: [
    { tracking: 'ROAM-99281', suite: 'JA-10420', dutyJmd: 0, filing: 'accepted' as const },
    { tracking: 'ROAM-99290', suite: 'JA-10101', dutyJmd: 12450, filing: 'accepted' as const },
  ],
  yellow: [
    { tracking: 'ROAM-99301', suite: 'JA-10087', dutyJmd: 28800, filing: 'submitted' as const },
  ],
  red: [
    { tracking: 'ROAM-99310', suite: 'JA-10555', dutyJmd: 51200, filing: 'rejected' as const },
  ],
};

export const PACKAGE_DETAIL_MOCK = {
  tracking: 'SWIFT-7729-JM',
  status: 'in_transit_intl',
  suite: 'JA-10420',
  contact: 'Marcus Brown',
  trn: '123456789',
  weightLbs: 5.4,
  declaredUsd: 189.99,
  invoiceFile: 'amazon-order-4412.pdf',
  invoiceVerified: false,
  duty: {
    cifUsd: 199.49,
    importDutyUsd: 39.9,
    scfUsd: 0.6,
    envUsd: 1.0,
    gctUsd: 36.15,
    stampJmd: 100,
    cafJmd: 2500,
    totalDutyUsd: 77.65,
    aboveThreshold: true,
  },
  timeline: [
    { at: '2026-08-01 14:22', event: 'Pre-alert created' },
    { at: '2026-08-02 09:05', event: 'Received at warehouse' },
    { at: '2026-08-03 16:40', event: 'Manifested · MAWB 235-9982-1102' },
    { at: '2026-08-04 08:10', event: 'In transit to Jamaica' },
  ],
};

export const BILLING_MOCK = {
  invoiceNumber: 'INV-2026-0892',
  suite: 'JA-10420',
  customer: 'Marcus Brown',
  exchangeRate: 155.5,
  courier: [
    { label: 'Freight (5.4 lb)', usd: 18.5 },
    { label: 'Handling', usd: 5 },
    { label: 'Door delivery', usd: 12 },
  ],
  government: [
    { label: 'Import Duty', usd: 39.9 },
    { label: 'SCF (0.3%)', usd: 0.6 },
    { label: 'Environmental Levy', usd: 1.0 },
    { label: 'GCT (15%)', usd: 36.15 },
    { label: 'Stamp Duty', usd: 0.64 },
    { label: 'CAF', usd: 16.08 },
  ],
};
