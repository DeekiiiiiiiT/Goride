export type CourierProfile = {
  fullName: string;
  displayName: string;
  phone: string;
  email: string;
  avatarUrl: string;
  memberSince: string;
  rating: number;
  acceptanceRate: number;
  completionRate: number;
  totalDeliveries: number;
  verified: boolean;
};

export type CourierVehicle = {
  make: string;
  model: string;
  licensePlate: string;
  color: string;
  colorHex: string;
  type: 'motorcycle' | 'car' | 'bicycle';
  verified: boolean;
};

export type AccountDocumentStatus = 'verified' | 'expiring' | 'pending';

export type AccountDocument = {
  id: string;
  title: string;
  icon: string;
  status: AccountDocumentStatus;
  statusLabel: string;
  expiryText: string;
  accent: 'success' | 'warning' | 'primary';
  actionLabel: string;
  actionPrimary?: boolean;
};

export const MOCK_COURIER_PROFILE: CourierProfile = {
  fullName: 'Jane Doe',
  displayName: 'Jane D.',
  phone: '+1 (876) 555-0192',
  email: 'jane.doe@example.com',
  avatarUrl: '/images/courier-avatar.png',
  memberSince: 'Jan 2024',
  rating: 4.92,
  acceptanceRate: 89,
  completionRate: 97,
  totalDeliveries: 342,
  verified: true,
};

export const MOCK_EDIT_PROFILE_DRAFT: Pick<CourierProfile, 'fullName' | 'displayName' | 'phone' | 'email'> = {
  fullName: 'Alex Rivera',
  displayName: 'Alex R.',
  phone: '+1 (555) 019-2834',
  email: 'alex.rivera@example.com',
};

export const EDIT_PROFILE_PHOTO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuA32Z3CRETxr6YF6B5YpBRVi2ogbQLsG6rN8iK1voQLEBxCOMVHiMkQXGKAeW4H5uC5eTv0aCFrMjZOsDwxGZmGIf3zfMuGW-lmUoVHmH-Jf7zCMrJSN8Pxyqtjla0z6zlYdLLUC3dClboYwlfdUQRXxQWmZk-baYBFH5iCgGVpFjKLu_yamuQTRwALfoj_ieRvoWdFGQpmUnGPZfA1gyYKaj793ALopr8oAWubu-63dl1AY39hY1Ux_NwxKiC9iTEFyIIBc9D0yXU';

export const MOCK_COURIER_VEHICLE: CourierVehicle = {
  make: 'Yamaha',
  model: 'NMAX',
  licensePlate: 'BC1234',
  color: 'Emerald Green',
  colorHex: '#50C878',
  type: 'motorcycle',
  verified: true,
};

export const MOCK_ACCOUNT_DOCUMENTS: AccountDocument[] = [
  {
    id: 'license',
    title: "Driver's License",
    icon: 'id_card',
    status: 'verified',
    statusLabel: 'Verified',
    expiryText: 'Expires: Oct 2026',
    accent: 'success',
    actionLabel: 'Update',
  },
  {
    id: 'registration',
    title: 'Vehicle Registration',
    icon: 'directions_car',
    status: 'verified',
    statusLabel: 'Verified',
    expiryText: 'Expires: Mar 2025',
    accent: 'success',
    actionLabel: 'Update',
  },
  {
    id: 'insurance',
    title: 'Insurance',
    icon: 'shield',
    status: 'expiring',
    statusLabel: 'Expiring soon',
    expiryText: 'Expires in 14 days',
    accent: 'warning',
    actionLabel: 'Update Now',
    actionPrimary: true,
  },
  {
    id: 'national-id',
    title: 'National ID',
    icon: 'badge',
    status: 'verified',
    statusLabel: 'Verified',
    expiryText: 'No expiration',
    accent: 'success',
    actionLabel: 'Update',
  },
];
