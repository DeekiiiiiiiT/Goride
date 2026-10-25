/** Organisation money. Defaults to Jamaican dollars, shown as JMD 1,234.56. */
export function formatMoney(
  n: number | null | undefined,
  currency = 'JMD',
): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const value = Number(n);
  const code = currency || 'JMD';
  try {
    return new Intl.NumberFormat('en-JM', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    const body = Math.abs(value).toLocaleString('en-JM', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${value < 0 ? '-' : ''}${code} ${body}`;
  }
}
