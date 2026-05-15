/** Dial plan entry for phone OTP (E.164 national significant digits after country calling code). */
export type PhoneCountry = {
  iso2: string;
  name: string;
  dial: string;
  nationalMinLen: number;
  nationalMaxLen: number;
  placeholder: string;
};

export function flagEmoji(iso2: string): string {
  const s = iso2.toUpperCase();
  if (s.length !== 2 || /[^A-Z]/.test(s)) return '🌐';
  return Array.from(s)
    .map(c => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
    .join('');
}

const PHONE_COUNTRIES_RAW: PhoneCountry[] = [
  { iso2: 'JM', name: 'Jamaica', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '8765551234' },
  { iso2: 'US', name: 'United States', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '5551234567' },
  { iso2: 'CA', name: 'Canada', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '4165551234' },
  { iso2: 'BS', name: 'Bahamas', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '2425551234' },
  { iso2: 'BB', name: 'Barbados', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '2465551234' },
  { iso2: 'TT', name: 'Trinidad & Tobago', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '8685551234' },
  { iso2: 'LC', name: 'Saint Lucia', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '7585551234' },
  { iso2: 'GD', name: 'Grenada', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '4735551234' },
  { iso2: 'AG', name: 'Antigua & Barbuda', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '2685551234' },
  { iso2: 'KN', name: 'Saint Kitts & Nevis', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '8695551234' },
  { iso2: 'VC', name: 'Saint Vincent', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '7845551234' },
  { iso2: 'DO', name: 'Dominican Republic', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '8095551234' },
  { iso2: 'PR', name: 'Puerto Rico', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '7875551234' },
  { iso2: 'KY', name: 'Cayman Islands', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '3455551234' },
  { iso2: 'TC', name: 'Turks & Caicos', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '6495551234' },
  { iso2: 'AI', name: 'Anguilla', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '2645551234' },
  { iso2: 'MS', name: 'Montserrat', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '6645551234' },
  { iso2: 'VG', name: 'British Virgin Islands', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '2845551234' },
  { iso2: 'VI', name: 'US Virgin Islands', dial: '1', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '3405551234' },
  { iso2: 'MX', name: 'Mexico', dial: '52', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '5512345678' },
  { iso2: 'GT', name: 'Guatemala', dial: '502', nationalMinLen: 8, nationalMaxLen: 8, placeholder: '51234567' },
  { iso2: 'HN', name: 'Honduras', dial: '504', nationalMinLen: 8, nationalMaxLen: 8, placeholder: '91234567' },
  { iso2: 'BZ', name: 'Belize', dial: '501', nationalMinLen: 7, nationalMaxLen: 7, placeholder: '6221234' },
  { iso2: 'CR', name: 'Costa Rica', dial: '506', nationalMinLen: 8, nationalMaxLen: 8, placeholder: '83123456' },
  { iso2: 'PA', name: 'Panama', dial: '507', nationalMinLen: 8, nationalMaxLen: 8, placeholder: '61234567' },
  { iso2: 'CO', name: 'Colombia', dial: '57', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '3001234567' },
  { iso2: 'GB', name: 'United Kingdom', dial: '44', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '7700900000' },
  { iso2: 'IE', name: 'Ireland', dial: '353', nationalMinLen: 9, nationalMaxLen: 9, placeholder: '851234567' },
  { iso2: 'FR', name: 'France', dial: '33', nationalMinLen: 9, nationalMaxLen: 9, placeholder: '612345678' },
  { iso2: 'DE', name: 'Germany', dial: '49', nationalMinLen: 10, nationalMaxLen: 11, placeholder: '15123456789' },
  { iso2: 'NL', name: 'Netherlands', dial: '31', nationalMinLen: 9, nationalMaxLen: 9, placeholder: '612345678' },
  { iso2: 'ES', name: 'Spain', dial: '34', nationalMinLen: 9, nationalMaxLen: 9, placeholder: '612345678' },
  { iso2: 'IT', name: 'Italy', dial: '39', nationalMinLen: 9, nationalMaxLen: 10, placeholder: '3123456789' },
  { iso2: 'NG', name: 'Nigeria', dial: '234', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '8012345678' },
  { iso2: 'ZA', name: 'South Africa', dial: '27', nationalMinLen: 9, nationalMaxLen: 9, placeholder: '821234567' },
  { iso2: 'IN', name: 'India', dial: '91', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '9876543210' },
  { iso2: 'AU', name: 'Australia', dial: '61', nationalMinLen: 9, nationalMaxLen: 9, placeholder: '412345678' },
  { iso2: 'NZ', name: 'New Zealand', dial: '64', nationalMinLen: 8, nationalMaxLen: 10, placeholder: '211234567' },
  { iso2: 'CN', name: 'China', dial: '86', nationalMinLen: 11, nationalMaxLen: 11, placeholder: '13123456789' },
  { iso2: 'JP', name: 'Japan', dial: '81', nationalMinLen: 10, nationalMaxLen: 10, placeholder: '9012345678' },
  { iso2: 'BR', name: 'Brazil', dial: '55', nationalMinLen: 10, nationalMaxLen: 11, placeholder: '11987654321' },
];

export const PHONE_COUNTRIES: PhoneCountry[] = [...PHONE_COUNTRIES_RAW].sort((a, b) =>
  a.name.localeCompare(b.name)
);

export function getPhoneCountryByIso2(iso2: string | null | undefined): PhoneCountry | undefined {
  if (!iso2) return undefined;
  const u = iso2.toUpperCase();
  return PHONE_COUNTRIES.find(c => c.iso2 === u);
}

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES.find(c => c.iso2 === 'JM') ?? PHONE_COUNTRIES[0]!;
