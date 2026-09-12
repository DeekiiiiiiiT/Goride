/**
 * CSV cell escape for ledger exports.
 * Quotes fields with special chars and neutralizes Excel formula injection.
 */
export function csvEscape(val: string): string {
  let s = String(val ?? '');
  // Formula injection: leading = + - @ tab CR — but keep finite numbers numeric (N-07)
  const isPlainNumber = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s);
  if (!isPlainNumber && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** UTF-8 BOM + CRLF for Excel-friendly downloads. */
export function csvDocument(headerAndRows: string[]): string {
  return `\uFEFF${headerAndRows.join('\r\n')}`;
}
