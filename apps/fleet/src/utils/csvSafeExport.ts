/**
 * Safe CSV cell helpers for finance exports (S1-12).
 * Neutralises spreadsheet formula injection and always quotes fields.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Quote a CSV field and neutralize leading formula characters. */
export function csvSafeCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (FORMULA_PREFIX.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/** Join cells into one CSV row. */
export function csvRow(cells: unknown[]): string {
  return cells.map(csvSafeCell).join(",");
}

/** UTF-8 BOM so Excel opens accented names correctly. */
export const CSV_UTF8_BOM = "\uFEFF";
