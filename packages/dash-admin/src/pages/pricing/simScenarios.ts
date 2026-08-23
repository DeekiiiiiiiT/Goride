export type SimScenarioPayment = 'wipay' | 'cash';

export type SimScenarioExpected = {
  serviceFee?: number;
  tax?: number;
  orderTotal?: number;
  processingFee?: number;
  customerTotal?: number;
  blocked?: boolean;
  note?: string;
};

export type SimScenario = {
  id: string;
  label: string;
  summary: string;
  subtotal: number;
  tip: number;
  payment: SimScenarioPayment;
  runnable: boolean;
  expected?: SimScenarioExpected;
};

/** Audit walkthrough scenarios — match Market Rules: 15%/9%, threshold 50, min 1.50, max 25, min order 8, processing 4.5%. Delivery ~5 is illustrative; engine uses distance rules. */
export const AUDIT_SIM_SCENARIOS: SimScenario[] = [
  {
    id: 'A',
    label: 'A — Small ($12) · card',
    summary: '15% on full basket',
    subtotal: 12,
    tip: 0,
    payment: 'wipay',
    runnable: true,
    expected: {
      serviceFee: 1.8,
      tax: 2.07,
      orderTotal: 20.87,
      processingFee: 0.94,
      customerTotal: 21.81,
    },
  },
  {
    id: 'B',
    label: 'B — Medium ($60) · card',
    summary: 'Bracket: $50×15% + $10×9%',
    subtotal: 60,
    tip: 0,
    payment: 'wipay',
    runnable: true,
    expected: {
      serviceFee: 8.4,
      tax: 10.26,
      orderTotal: 83.66,
      processingFee: 3.76,
      customerTotal: 87.42,
    },
  },
  {
    id: 'C',
    label: 'C — Large ($200) · card',
    summary: '$50×15% + $150×9%',
    subtotal: 200,
    tip: 0,
    payment: 'wipay',
    runnable: true,
    expected: {
      serviceFee: 21,
      tax: 33.15,
      orderTotal: 259.15,
      processingFee: 11.66,
      customerTotal: 270.81,
    },
  },
  {
    id: 'D',
    label: 'D — Huge ($600) · card',
    summary: 'Max cap hits ($25)',
    subtotal: 600,
    tip: 0,
    payment: 'wipay',
    runnable: true,
    expected: {
      serviceFee: 25,
      tax: 93.75,
      orderTotal: 723.75,
      processingFee: 32.57,
      customerTotal: 756.32,
    },
  },
  {
    id: 'E',
    label: 'E — Tiny ($4) · problem',
    summary: 'Floor fee feels predatory',
    subtotal: 4,
    tip: 0,
    payment: 'wipay',
    runnable: true,
    expected: {
      serviceFee: 1.5,
      note: 'Min fee on tiny order — use min-order gate instead',
    },
  },
  {
    id: 'F',
    label: 'F — Below min ($6)',
    summary: 'Checkout blocked at $8 min',
    subtotal: 6,
    tip: 0,
    payment: 'wipay',
    runnable: true,
    expected: {
      blocked: true,
      note: 'Does not reach $8 food minimum',
    },
  },
  {
    id: 'G',
    label: 'G — Same as A · COD',
    summary: 'No card processing fee',
    subtotal: 12,
    tip: 0,
    payment: 'cash',
    runnable: true,
    expected: {
      serviceFee: 1.8,
      tax: 2.07,
      processingFee: 0,
      customerTotal: 20.87,
    },
  },
  {
    id: 'H',
    label: 'H — Card fee base (info)',
    summary: '4.5% on order total, not food alone',
    subtotal: 200,
    tip: 0,
    payment: 'wipay',
    runnable: false,
    expected: {
      note: 'Wrong: 4.5% × $200 = $9.00 · Right: 4.5% × $259.15 = $11.66 (run C)',
    },
  },
  {
    id: 'I',
    label: 'I — Tip ($12 + $3) · card',
    summary: 'Tip not in service fee base; in card fee base',
    subtotal: 12,
    tip: 3,
    payment: 'wipay',
    runnable: true,
    expected: {
      serviceFee: 1.8,
      tax: 2.07,
      orderTotal: 23.87,
      processingFee: 1.07,
      customerTotal: 24.94,
    },
  },
];

export type SimBreakdown = {
  discountedSubtotal?: number;
  subtotal?: number;
  serviceFee?: number;
  deliveryFee?: number;
  tax?: number;
  tip?: number;
  orderTotal?: number;
  processingFee?: number;
  customerTotal?: number;
  total?: number;
};

export function pickBreakdown(raw: Record<string, unknown> | null): SimBreakdown | null {
  if (!raw) return null;
  return {
    discountedSubtotal: Number(raw.discountedSubtotal ?? raw.subtotal ?? 0),
    subtotal: Number(raw.subtotal ?? 0),
    serviceFee: Number(raw.serviceFee ?? 0),
    deliveryFee: Number(raw.deliveryFee ?? 0),
    tax: Number(raw.tax ?? 0),
    tip: Number(raw.tip ?? 0),
    orderTotal: Number(raw.orderTotal ?? 0),
    processingFee: Number(raw.processingFee ?? 0),
    customerTotal: Number(raw.customerTotal ?? raw.total ?? 0),
    total: Number(raw.total ?? 0),
  };
}

const TOLERANCE = 0.02;

export function nearExpected(actual: number, expected: number | undefined): boolean | null {
  if (expected == null) return null;
  return Math.abs(actual - expected) <= TOLERANCE;
}
