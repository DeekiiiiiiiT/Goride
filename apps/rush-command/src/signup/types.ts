import type { LocationValue } from '@roam/location';
import type { MerchantDocumentType } from '@roam/types';

export type BusinessType = string;

export type AccountType = 'checking' | 'savings';

export interface UploadedDocumentRef {
  id: string;
  docType: MerchantDocumentType;
  status: 'pending' | 'approved' | 'rejected';
  fileName?: string;
}

export interface SignUpFormData {
  restaurantName: string;
  phone: string;
  email: string;
  businessType: BusinessType | '';
  cuisineTypes: string[];
  inventoryCategories: string[];
  location: Partial<LocationValue> | null;
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
  idFrontDoc: UploadedDocumentRef | null;
  idBackDoc: UploadedDocumentRef | null;
  proofOfBusinessDoc: UploadedDocumentRef | null;
  liquorLicenseFile: File | null;
  pharmacyPermitFile: File | null;
  liquorLicenseDoc: UploadedDocumentRef | null;
  pharmacyPermitDoc: UploadedDocumentRef | null;
  description: string;
  website: string;
  logoUrl: string;
  coverImageUrl: string;
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
  inventoryCategories: [],
  location: null,
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
  idFrontDoc: null,
  idBackDoc: null,
  proofOfBusinessDoc: null,
  liquorLicenseFile: null,
  pharmacyPermitFile: null,
  liquorLicenseDoc: null,
  pharmacyPermitDoc: null,
  description: '',
  website: '',
  logoUrl: '',
  coverImageUrl: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  routingNumber: '',
  accountType: 'checking',
};

export const CUISINE_OPTIONS = [
  'Jamaican',
  'Caribbean',
  'Chinese',
  'Indian',
  'Italian',
  'American',
  'Fast Food',
  'Pizza',
  'Burgers',
  'Sushi',
  'Seafood',
  'Vegetarian',
  'Vegan',
  'Bakery',
  'Cafe',
  'Mexican',
  'Japanese',
  'Thai',
  'BBQ',
  'Healthy',
  'Desserts',
  'Other',
] as const;

export const PHARMACY_CATEGORY_OPTIONS = [
  'Health & Wellness',
  'Medical Supplies',
  'Personal Care',
] as const;

export const INVENTORY_CATEGORY_OPTIONS = [
  'Fresh Produce',
  'Dairy',
  'Pantry',
  'Snacks',
  'Beverages',
  'Household',
  'Health & Wellness',
  'Frozen',
  'Other',
] as const;

export const RETAIL_PREP_TIME_OPTIONS = ['20', '30', '45', '60'] as const;

export const RETAIL_DELIVERY_RADIUS_OPTIONS = [
  { value: '5', label: '5 km' },
  { value: '10', label: '10 km' },
  { value: '15', label: '15 km' },
  { value: '20', label: '20 km' },
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
