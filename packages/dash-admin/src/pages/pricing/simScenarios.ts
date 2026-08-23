export type SimScenarioPayment = 'wipay' | 'cash';

export type SimScenarioExpected = {
  serviceFee?: number;
  tax?: number;
  orderTotal?: number;
  processingFee?: number;
  customerTotal?: number;
  deliveryFee?: number;
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
  /** Static hints only — live expecteds come from Market Rules via expectedFromMarketRules */
  expected?: SimScenarioExpected;
};

/**
 * Walkthrough scenarios in real JMD (matches Market Rules defaults:
 * 15%/9%, threshold 5000, min 150, max 2500, min order 800, processing 4.5%).
 * Delivery is distance-based — expecteds are computed at run time from live rules + quote delivery.
 */
export const AUDIT_SIM_SCENARIOS: SimScenario[] = [
  {
    id: 'A',
    label: 'A — Small (J$1,200) · card',
    summary: '15% on full basket',
    subtotal: 1200,
    tip: 0,
    payment: 'wipay',
    runnable: true,
    expected: { note: 'Service ≈ 15% × food (or min fee floor)' },
  },
  {
    id: 'B',
    label: 'B — Medium (J$6,000) · card',
    summary: 'Bracket: J$5,000×15% + J$1,000×9%',
    subtotal: 6000,
    tip: 0,
    payment: 'wipay',
    runnable: true,
  },
  {
    id: 'C',
    label: 'C — Large (J$20,000) · card',
    summary: 'J$5,000×15% + J$15,000×9%',
    subtotal: 20000,
    tip: 0,
    payment: 'wipay',
    runnable: true,
  },
  {
    id: 'D',
    label: 'D — Huge (J$60,000) · card',
    summary: 'Max service-fee cap',
    subtotal: 60000,
    tip: 0,
    payment: 'wipay',
    runnable: true,
  },
  {
    id: 'E',
    label: 'E — Tiny (J$400) · floor',
    summary: 'Min service fee floor',
    subtotal: 400,
    tip: 0,
    payment: 'wipay',
    runnable: true,
    expected: { note: 'Min fee on tiny order — use min-order gate instead' },
  },
  {
    id: 'F',
    label: 'F — Below min (J$600)',
    summary: 'Checkout blocked at min order',
    subtotal: 600,
    tip: 0,
    payment: 'wipay',
    runnable: true,
    expected: { blocked: true, note: 'Does not reach food minimum' },
  },
  {
    id: 'G',
    label: 'G — Same as A · COD',
    summary: 'No card processing fee',
    subtotal: 1200,
    tip: 0,
    payment: 'cash',
    runnable: true,
  },
  {
    id: 'H',
    label: 'H — Card fee base (info)',
    summary: '4.5% on order total, not food alone',
    subtotal: 20000,
    tip: 0,
    payment: 'wipay',
    runnable: false,
    expected: {
      note: 'Processing fee is % of (food + fees + tax + tip), not food alone — run C',
    },
  },
  {
    id: 'I',
    label: 'I — Tip (J$1,200 + J$300) · card',
    summary: 'Tip not in service fee base; in card fee base',
    subtotal: 1200,
    tip: 300,
    payment: 'wipay',
    runnable: true,
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
  distanceKm?: number | null;
  freeDeliveryApplied?: boolean;
};

export type MarketRulesForSim = {
  service_fee?: {
    mode?: string;
    avg_rate?: number;
    override_rate?: number;
    override_threshold_jmd?: number;
    min_jmd?: number;
    max_jmd?: number;
    flat_jmd?: number;
    percent?: number;
  };
  card_processing_fee_percent?: number;
  min_order_subtotal_jmd?: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Mirror engine marginal service fee using current Market Rules. */
export function resolveSimServiceFee(rules: MarketRulesForSim, subtotal: number): number {
  const sf = rules.service_fee ?? {};
  const mode = sf.mode ?? 'marginal';
  const food = Math.max(0, subtotal);

  if (mode === 'flat') {
    return roundMoney(clamp(sf.flat_jmd ?? 120, sf.min_jmd ?? 0, sf.max_jmd ?? 99999));
  }
  if (mode === 'percent') {
    const raw = food * (sf.percent ?? 0.05);
    return roundMoney(clamp(raw, sf.min_jmd ?? 0, sf.max_jmd ?? 99999));
  }

  const avgRate = sf.avg_rate ?? 0.15;
  const overrideRate = sf.override_rate ?? 0.09;
  const threshold = Math.max(0, sf.override_threshold_jmd ?? 5000);
  const min = sf.min_jmd ?? 150;
  const max = sf.max_jmd ?? 2500;
  let raw = 0;
  if (food <= threshold) {
    raw = food * avgRate;
  } else {
    raw = threshold * avgRate + (food - threshold) * overrideRate;
  }
  return roundMoney(clamp(raw, min, max));
}

/**
 * Build expected line items from Market Rules + live delivery/tax from the quote.
 * Delivery & GCT rate come from the server quote so distance / merchant GCT stay honest.
 */
export function expectedFromMarketRules(
  rules: MarketRulesForSim,
  opts: {
    subtotal: number;
    tip: number;
    payment: SimScenarioPayment;
    deliveryFee: number;
    tax: number;
  },
): SimScenarioExpected {
  const serviceFee = resolveSimServiceFee(rules, opts.subtotal);
  const tip = Math.max(0, opts.tip);
  const deliveryFee = Math.max(0, opts.deliveryFee);
  const tax = Math.max(0, opts.tax);
  const orderTotal = roundMoney(opts.subtotal + serviceFee + deliveryFee + tax + tip);
  const procRate = rules.card_processing_fee_percent ?? 0.045;
  const processingFee =
    opts.payment === 'cash' ? 0 : roundMoney(Math.max(0, orderTotal) * procRate);
  const customerTotal = roundMoney(orderTotal + processingFee);
  const minOrder = rules.min_order_subtotal_jmd ?? 800;
  return {
    serviceFee,
    tax,
    deliveryFee,
    orderTotal,
    processingFee,
    customerTotal,
    blocked: opts.subtotal < minOrder,
  };
}

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
    distanceKm: raw.distanceKm != null && Number.isFinite(Number(raw.distanceKm))
      ? Number(raw.distanceKm)
      : null,
    freeDeliveryApplied: Boolean(raw.freeDeliveryApplied),
  };
}

const TOLERANCE = 1; // JMD — allow 1 dollar rounding drift

export function nearExpected(actual: number, expected: number | undefined): boolean | null {
  if (expected == null) return null;
  return Math.abs(actual - expected) <= TOLERANCE;
}
