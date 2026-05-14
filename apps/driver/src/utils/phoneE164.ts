/** Build E.164 from dial country code (e.g. "+1" or "1") and national significant digits only (no trunk prefix). */
export function toE164(countryDialCode: string, nationalDigits: string): string {
  const cc = countryDialCode.replace(/\D/g, '');
  const national = nationalDigits.replace(/\D/g, '');
  if (!cc || national.length < 10) {
    throw new Error('Enter a valid 10-digit mobile number.');
  }
  if (national.length > 15) {
    throw new Error('Phone number is too long.');
  }
  return `+${cc}${national}`;
}
