export const CONTACT_EMAIL = 'hello@roamenterprise.co';

export const DEPARTMENTS = [
  'Sales',
  'Support',
  'Press',
  'Partnerships',
  'Careers',
] as const;

export const OFFICE_LOCATIONS = [
  {
    city: 'San Francisco',
    address: ['420 Market Street, Suite 1200', 'San Francisco, CA 94111', 'United States'],
    mapImage:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDpLmblUPMyE8M0nBbJ8FbZnvHIkv5NoJKWjaLSzTJvvjxGuHt8h9yscm1H6ZPlNnBjQ_5p7tC39maVvwT8BtVOMcQEqzGATjdbMdddn9LHen7xr1hAT-kZuvB8m6WW8mSL76nGcRZmw5tXdquzkoGR_KV1OZuCsgCFpk0xj3GF1bnfAEq12yJivSUeAohy4zaeSGp6W7QF1recbN36jQssWUmeZkv_IkWEmHBPOKmyrXQHDPDs8-iJM22ncMbA-HAN180MEuUZDOaC',
  },
  {
    city: 'London',
    address: ['15 Bishopsgate, 24th Floor', 'London EC2N 3AR', 'United Kingdom'],
    mapImage:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCNnXKsK16yrGtzM_YQRap8BScJau5iiFXiEnENpmlMVNi5gBMzCbE3kSio7X-G3b9sJrKgKgnqYDWsCOGNY9dXqrGRK5SrqJmCkJc7joam0ky8T1TCk5ibkFadyqPOh5b0EftOt4Cw86SiRmRbtVGxMewvwTnB3lBOf8SkBN1VLH-3TmuOqDNIJjJZ_TSqgHsPTvzMDbLQKITN_vR10w5qADCmFDUJfe-Ht6ApF2HGsxQlmzmE3n9R64354sx2VgfGEKzaZLs3bOgY',
  },
  {
    city: 'Singapore',
    address: ['1 Raffles Place, #44-01', 'Singapore 048616', 'Singapore'],
    mapImage:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC6BDeaHzrwM_pndryiq0bT7vrHn6zuL12ynWpEz5MprmPApA2lWHvoda3EEWr5kt8iOGovQx9NdnMDAXA4z8LwHE9_krCSCTUnkwb9JdWXQkqjqC-WQ3jIGE1B6rX0q8qc6ZSogc8pnsu9yguCARDxDmzDossSF-pQ_IQ21G9lHw_yN8M5SNMFU0vhLYNCSKZJDfd3mk_Eenc9eSFBxWPSpoVHeBROK6W6Q1fdNUAZTQQ9Ez1ctamCKYgx11mDj_EoidxGhmUixX7b',
  },
] as const;

export const SOCIAL_LINKS = [
  { label: 'LinkedIn', href: 'https://linkedin.com' },
  { label: 'Twitter', href: 'https://twitter.com' },
  { label: 'Instagram', href: 'https://instagram.com' },
] as const;

export const DEPARTMENT_EMAILS: Record<(typeof DEPARTMENTS)[number], string> = {
  Sales: 'sales@roamenterprise.co',
  Support: 'support@roamenterprise.co',
  Press: 'press@roamenterprise.co',
  Partnerships: 'partnerships@roamenterprise.co',
  Careers: 'careers@roamenterprise.co',
};
