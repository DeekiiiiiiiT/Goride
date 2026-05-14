import type { PhoneCountry } from './phoneCountries';

/** Build E.164 from dial code digits and national significant digits; validates length for the selected country. */
export function toE164ForCountry(country: PhoneCountry, nationalDigits: string): string {
  const cc = country.dial.replace(/\D/g, '');
  const national = nationalDigits.replace(/\D/g, '');
  if (!cc) {
    throw new Error('Invalid country calling code.');
  }
  if (national.length < country.nationalMinLen || national.length > country.nationalMaxLen) {
    throw new Error(
      `Enter a valid number (${country.nationalMinLen}${country.nationalMinLen !== country.nationalMaxLen ? `–${country.nationalMaxLen}` : ''} digits) for ${country.name}.`
    );
  }
  if (national.length > 15) {
    throw new Error('Phone number is too long.');
  }
  return `+${cc}${national}`;
}
