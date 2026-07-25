/**
 * Validates a FuelScenario payload before persisting. Previously the POST
 * /scenarios handler kv.set the raw request body verbatim with zero shape/range
 * checks — NaN, negative, or >100% coverage values saved fine and silently
 * corrupted downstream reconciliation math (fuelCalculationService.ts's
 * getCoverage()). Mirrors the client-side validateFuelRule in ScenarioEditor.tsx.
 *
 * Extracted into its own dependency-free module (no Deno/KV imports) so it can
 * be unit-tested with Vitest directly, the same way the rest of this codebase's
 * pure logic is tested — index.tsx itself is excluded from the Vitest run
 * (Deno-only file).
 */
export function validateFuelScenarioPayload(item: any): string | null {
  if (!item || typeof item !== "object") return "Invalid scenario payload.";
  if (!item.name || typeof item.name !== "string" || !item.name.trim()) {
    return "Scenario name is required.";
  }
  if (!Array.isArray(item.rules)) return "Scenario rules are required.";
  const fuelRules = item.rules.filter((r: any) => r?.category === "Fuel");
  if (fuelRules.length !== 1) return "Scenario must have exactly one Fuel rule.";

  const rule = fuelRules[0];
  if (!["Full", "Percentage", "Fixed_Amount"].includes(rule.coverageType)) {
    return "Invalid coverage type.";
  }
  if (typeof rule.coverageValue !== "number" || !Number.isFinite(rule.coverageValue) || rule.coverageValue < 0) {
    return rule.coverageType === "Fixed_Amount"
      ? "Allowance amount must be a positive number."
      : "Coverage value must be a number of 0 or greater.";
  }
  if (rule.coverageType === "Fixed_Amount" && rule.coverageValue <= 0) {
    return "Allowance amount must be greater than 0.";
  }
  if (rule.coverageType === "Percentage") {
    const granularFields = [
      "rideShareCoverage",
      "companyUsageCoverage",
      "deadheadCoverage",
      "personalCoverage",
      "miscCoverage",
    ];
    for (const field of granularFields) {
      const val = rule[field];
      if (val === undefined || val === null) continue;
      if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > 100) {
        return `${field} must be a number between 0 and 100.`;
      }
    }
  }
  if (rule.conditions?.maxAmount !== undefined && rule.conditions?.maxAmount !== null) {
    const maxAmount = rule.conditions.maxAmount;
    if (typeof maxAmount !== "number" || !Number.isFinite(maxAmount) || maxAmount <= 0) {
      return "Max amount cap must be a positive number.";
    }
  }
  return null;
}
