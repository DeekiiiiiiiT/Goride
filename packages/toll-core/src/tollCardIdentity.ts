/**
 * Toll Reconciliation four-card accounting identity (Phase 0 characterization).
 *
 * The Toll Reconciliation screen shows four KPI cards:
 *   Spend, Reimbursed, Charged to Drivers, Net Toll Loss.
 * These must satisfy ONE identity so a week can be declared closed:
 *
 *   residual = Spend − Reimbursed − ChargedToDrivers − NetTollLoss  ≈ 0
 *
 * Today (see RECONCILIATION_SYSTEM_AUDIT.md, headline problem #2) the four
 * cards come from two unrelated engines and satisfy no identity — the audit's
 * own screenshot showed `52,400 − 50,010 − 25,740 = −23,350` displayed as
 * `+1,470`. This helper does NOT fix the engines; it characterizes the gap so
 * the residual can be asserted before/after remediation.
 */

/** Tolerance for declaring the identity closed (JMD cents band). */
export const TOLL_CARD_IDENTITY_EPS = 0.01;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type TollCardIdentityInput = {
  /** Total fleet toll spend (plaza/tag charges). */
  tollSpend: number;
  /** Amount reimbursed to the fleet (Uber trip coverage, refunds). */
  reimbursed: number;
  /** Amount pushed onto driver wallets. */
  chargedToDrivers: number;
  /** Displayed Net Toll Loss card value. */
  netTollLoss: number;
};

export type TollCardIdentityResult = {
  /** Spend − Reimbursed − ChargedToDrivers − NetTollLoss. */
  residual: number;
  /** True when |residual| is within the closing tolerance. */
  closes: boolean;
};

/**
 * Pure identity residual for the four Toll Reconciliation cards.
 * A closing week has residual ≈ 0; any other value is an unexplained gap.
 */
export function computeTollCardIdentityResidual(
  input: TollCardIdentityInput,
  eps: number = TOLL_CARD_IDENTITY_EPS,
): TollCardIdentityResult {
  const residual = round2(
    num(input.tollSpend) -
      num(input.reimbursed) -
      num(input.chargedToDrivers) -
      num(input.netTollLoss),
  );
  return {
    residual,
    closes: Math.abs(residual) <= eps,
  };
}
