export type BusinessType =
  | 'restaurant'
  | 'cafe'
  | 'bakery'
  | 'fast_food'
  | 'other';

export type AccountType = 'checking' | 'savings';

export interface SignUpFormData {
  restaurantName: string;
  phone: string;
  email: string;
  businessType: BusinessType | '';
  cuisineTypes: string[];
  streetAddress: string;
  city: string;
  postalCode: string;
  addressSearch: string;
  businessRegistrationNumber: string;
  taxId: string;
  avgPrepTime: string;
  deliveryRadius: string;
  ownerFullName: string;
  idFrontFile: File | null;
  idBackFile: File | null;
  proofOfBusinessFile: File | null;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  routingNumber: string;
  accountType: AccountType;
}

export const INITIAL_SIGN_UP_DATA: SignUpFormData = {
  restaurantName: '',
  phone: '',
  email: '',
  businessType: '',
  cuisineTypes: [],
  streetAddress: '',
  city: '',
  postalCode: '',
  addressSearch: '',
  businessRegistrationNumber: '',
  taxId: '',
  avgPrepTime: '15',
  deliveryRadius: '5',
  ownerFullName: '',
  idFrontFile: null,
  idBackFile: null,
  proofOfBusinessFile: null,
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  routingNumber: '',
  accountType: 'checking',
};

export const CUISINE_OPTIONS = [
  'Jamaican',
  'Chinese',
  'Indian',
  'Pizza',
  'Burgers',
  'Sushi',
  'Mexican',
  'Vegan',
  'Other',
] as const;

export const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Cafe / Coffee Shop' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'fast_food', label: 'Fast Food' },
  { value: 'other', label: 'Other' },
];

export const PREP_TIME_OPTIONS = ['10', '15', '20', '25', '30+'] as const;

export const DELIVERY_RADIUS_OPTIONS = [
  { value: '3', label: '3 km' },
  { value: '5', label: '5 km' },
  { value: '8', label: '8 km' },
  { value: '10+', label: '10+ km' },
] as const;

export const JAMAICAN_BANKS = [
  'NCB (National Commercial Bank)',
  'Scotiabank Jamaica',
  'JN Bank',
  'Sagicor Bank',
  'First Caribbean (CIBC)',
  'JMMB Bank',
  'Victoria Mutual (VM)',
  'Other Bank',
] as const;
