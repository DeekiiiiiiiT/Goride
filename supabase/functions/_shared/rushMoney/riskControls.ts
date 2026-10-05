/** Reversible risk limits. Bans and collections are never returned by this function. */

export type RiskInput = {
  debtMajor: number;
  completedCardOrders: number;
  autoRefunds30d: number;
  autoRefundJmd30d: number;
  issues7d: number;
  merchantRejectionRate30d: number;
  linkedToBanned: boolean;
};

export type RiskEffect =
  | { control: "cod_hidden"; reason: string }
  | { control: "manual_review"; reason: string }
  | { control: "merchant_warning"; reason: string }
  | { control: "review_case"; reason: string };

export function riskEffects(input: RiskInput): RiskEffect[] {
  const effects: RiskEffect[] = [];
  if (input.debtMajor > 0 || input.completedCardOrders < 3) {
    effects.push({
      control: "cod_hidden",
      reason: input.debtMajor > 0 ? "Balance due" : "Fewer than 3 completed card orders",
    });
  }
  if (input.autoRefunds30d > 2 || input.autoRefundJmd30d > 5000) {
    effects.push({ control: "manual_review", reason: "Auto-refund budget reached" });
  }
  if (input.issues7d > 3) {
    effects.push({ control: "manual_review", reason: "Too many issue reports this week" });
  }
  if (input.merchantRejectionRate30d > 0.15) {
    effects.push({ control: "merchant_warning", reason: "Rejection rate is over 15% in 30 days" });
  }
  if (input.linkedToBanned) {
    effects.push({ control: "review_case", reason: "Phone or device matches a banned or indebted account" });
  }
  return effects;
}
