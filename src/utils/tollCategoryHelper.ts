/**
 * Single source of truth for determining whether a category string
 * represents a toll transaction.
 *
 * The system uses both 'Toll Usage' (from Uber CSV imports) and 'Tolls'
 * (from manual entries / tag imports) interchangeably. This helper
 * normalizes the check so every file uses the same logic.
 *
 * Case-insensitive to future-proof against data quality issues.
 */
export function isTollCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  const lower = category.toLowerCase();
  return lower === 'toll usage' || lower === 'tolls';
}
