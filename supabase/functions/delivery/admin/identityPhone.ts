/** Jamaica phone normalization for identity search (Part G foundation). */
export function normalizeJmPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('876')) return `+${digits}`;
  if (digits.length === 7) return `+1876${digits}`;
  if (digits.startsWith('1876') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('876') && digits.length === 10) return `+${digits}`;
  return input.trim();
}

export function phonesMatch(a: string, b: string): boolean {
  return normalizeJmPhone(a) === normalizeJmPhone(b);
}
