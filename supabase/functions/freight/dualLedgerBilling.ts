import {
  computeLandedCost,
  DEFAULT_FX_USD_JMD,
  type LandedCostResult,
} from "./landedCost.ts";

export type DualLedgerLine = {
  ledger: "courier_revenue" | "government_passthrough";
  code: string;
  label: string;
  amountUsdMinor: number;
  amountJmdMinor: number;
  sortOrder: number;
};

export type DualLedgerInvoice = {
  courierTotalUsdMinor: number;
  governmentTotalUsdMinor: number;
  grandTotalUsdMinor: number;
  fxUsdJmd: number;
  lines: DualLedgerLine[];
};

function jmd(usdMinor: number, fx: number): number {
  return Math.round(usdMinor * fx);
}

/** Build dual-ledger invoice from courier fees + duty snapshot. */
export function buildDualLedgerInvoice(input: {
  weightLbs?: number | null;
  freightFeeUsdMinor?: number | null;
  handlingUsdMinor?: number | null;
  deliveryUsdMinor?: number | null;
  duty: LandedCostResult | null;
  fxUsdJmd?: number | null;
}): DualLedgerInvoice {
  const fx = Number(input.fxUsdJmd ?? DEFAULT_FX_USD_JMD) || DEFAULT_FX_USD_JMD;
  const weightLbs = Number(input.weightLbs ?? 0) || 0;
  // Default freight fee: US$2.50/lb when not set
  const freight =
    input.freightFeeUsdMinor != null
      ? Math.max(0, Math.round(Number(input.freightFeeUsdMinor)))
      : Math.round(weightLbs * 250);
  const handling =
    input.handlingUsdMinor != null
      ? Math.max(0, Math.round(Number(input.handlingUsdMinor)))
      : 500;
  const delivery =
    input.deliveryUsdMinor != null
      ? Math.max(0, Math.round(Number(input.deliveryUsdMinor)))
      : 1200;

  const lines: DualLedgerLine[] = [
    {
      ledger: "courier_revenue",
      code: "FREIGHT",
      label: `Freight (${weightLbs.toFixed(1)} lb)`,
      amountUsdMinor: freight,
      amountJmdMinor: jmd(freight, fx),
      sortOrder: 1,
    },
    {
      ledger: "courier_revenue",
      code: "HANDLING",
      label: "Handling",
      amountUsdMinor: handling,
      amountJmdMinor: jmd(handling, fx),
      sortOrder: 2,
    },
    {
      ledger: "courier_revenue",
      code: "DELIVERY",
      label: "Local delivery / fulfillment",
      amountUsdMinor: delivery,
      amountJmdMinor: jmd(delivery, fx),
      sortOrder: 3,
    },
  ];

  const duty = input.duty;
  if (duty) {
    const gov: Array<[string, string, number]> = [
      ["IMPORT_DUTY", "Import Duty (CET)", duty.importDutyUsdMinor],
      ["SCF", "Standard Compliance Fee", duty.scfUsdMinor],
      ["ENV", "Environmental Levy", duty.envUsdMinor],
      ["GCT", "GCT 15%", duty.gctUsdMinor],
      [
        "STAMP",
        "Stamp Duty",
        Math.round(duty.stampJmdMinor / fx),
      ],
      ["CAF", "Customs Administrative Fee", Math.round(duty.cafJmdMinor / fx)],
    ];
    let i = 10;
    for (const [code, label, amountUsdMinor] of gov) {
      if (amountUsdMinor <= 0) continue;
      lines.push({
        ledger: "government_passthrough",
        code,
        label,
        amountUsdMinor,
        amountJmdMinor: jmd(amountUsdMinor, fx),
        sortOrder: i++,
      });
    }
  }

  const courierTotalUsdMinor = lines
    .filter((l) => l.ledger === "courier_revenue")
    .reduce((a, l) => a + l.amountUsdMinor, 0);
  const governmentTotalUsdMinor = lines
    .filter((l) => l.ledger === "government_passthrough")
    .reduce((a, l) => a + l.amountUsdMinor, 0);

  return {
    courierTotalUsdMinor,
    governmentTotalUsdMinor,
    grandTotalUsdMinor: courierTotalUsdMinor + governmentTotalUsdMinor,
    fxUsdJmd: fx,
    lines,
  };
}

export function computeDutyFromPackageRow(pkg: {
  declared_value_usd_minor?: number | null;
  freight_fee_usd_minor?: number | null;
  insurance_usd_minor?: number | null;
  cetRate?: number | null;
}): LandedCostResult {
  return computeLandedCost({
    itemCostUsdMinor: Number(pkg.declared_value_usd_minor ?? 0),
    freightUsdMinor: pkg.freight_fee_usd_minor,
    insuranceUsdMinor: pkg.insurance_usd_minor,
    cetRate: pkg.cetRate ?? 0.2,
  });
}
