/** Adopt/link/dismiss unmatched JAA statement rows — default OFF (fail-closed). */
export const FUEL_STATEMENT_ADOPT_FLAG = 'fuelStatementAdoptEnabled';

export function isFuelStatementAdoptEnabled(
  enabledModules?: Record<string, boolean> | null,
): boolean {
  return enabledModules?.[FUEL_STATEMENT_ADOPT_FLAG] === true;
}
