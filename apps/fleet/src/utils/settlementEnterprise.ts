/**
 * Settlement remittance advice + bank-file export (Phase 6).
 * Pure formatters — no I/O.
 */

export type RemittanceLine = {
  periodAnchor: string;
  periodEnd: string;
  description: string;
  amountMinor: number;
};

export type RemittanceAdvice = {
  driverId: string;
  driverName: string;
  organizationName: string;
  generatedAt: string;
  currency: string;
  lines: RemittanceLine[];
  netMinor: number;
};

export function buildRemittanceAdvice(input: {
  driverId: string;
  driverName: string;
  organizationName: string;
  currency?: string;
  lines: RemittanceLine[];
  generatedAt?: string;
}): RemittanceAdvice {
  const netMinor = input.lines.reduce((s, l) => s + (Number(l.amountMinor) || 0), 0);
  return {
    driverId: input.driverId,
    driverName: input.driverName,
    organizationName: input.organizationName,
    generatedAt: input.generatedAt || new Date().toISOString(),
    currency: input.currency || "JMD",
    lines: input.lines,
    netMinor,
  };
}

export function remittanceAdvicePlainText(a: RemittanceAdvice): string {
  const lines = [
    `Remittance advice — ${a.organizationName}`,
    `Driver: ${a.driverName} (${a.driverId})`,
    `Generated: ${a.generatedAt}`,
    `Currency: ${a.currency}`,
    "",
    "Period          Description                         Amount",
    "----------------------------------------------------------------",
    ...a.lines.map((l) => {
      const amt = (l.amountMinor / 100).toFixed(2);
      return `${l.periodAnchor}  ${l.description.padEnd(32).slice(0, 32)}  ${amt.padStart(12)}`;
    }),
    "----------------------------------------------------------------",
    `Net ${(a.netMinor / 100).toFixed(2)} ${a.currency}`,
  ];
  return lines.join("\n");
}

/** Simple ACH/RTGS-style bank file row (pipe-delimited). */
export type BankFileRow = {
  accountNumber: string;
  accountName: string;
  amountMinor: number;
  currency: string;
  reference: string;
  valueDate: string;
};

export function buildBankFile(rows: BankFileRow[], header = true): string {
  const body = rows.map((r) =>
    [
      r.accountNumber,
      r.accountName.replace(/\|/g, " "),
      (r.amountMinor / 100).toFixed(2),
      r.currency,
      r.reference.replace(/\|/g, " "),
      r.valueDate,
    ].join("|"),
  );
  if (!header) return body.join("\n");
  return ["account|name|amount|currency|reference|value_date", ...body].join("\n");
}

/** Maker-checker: payouts at/above this major-unit amount need approval. */
export const SETTLEMENT_APPROVAL_THRESHOLD = 50000;

/** Maker-checker threshold helper (major units). */
export function requiresApproval(amount: number, threshold: number = SETTLEMENT_APPROVAL_THRESHOLD): boolean {
  return Number(amount) >= Number(threshold) && Number(threshold) > 0;
}
