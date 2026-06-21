export const PROFILE_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuD91c0rjILQv1vBE3_Geadu5PDiMEoNZAk2l0Ir6ZxWXnjHfgI3QqnMljx6GsduMoKmTzzc7cUl7mnGmz_0nfqqFBATmtZVDRO6Giau6I_eVPdX-ReqQXEWkmU2277bplPpYNnyFwO1ra4gCvi9_sdXWi9G9Y8fEhZHzuKNeqbkV22DvMZjQnoIJNq4TKyM6qCIeYqcPEiMRNjb3ydCAYzZLjrYnz5mh-SPEU6yQt_Erh1M6NAxlVgiLzUXrm_Wh0La_sM1BFI3_jWl';

export const PROFILE_HEADER_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDdOsA8FA5Kve_kO8TJWOmq6RnmdfEpe60gze7WO0Sv9yogkh9ropVOGN3RXmB4c-u_YAL2-q_g5ivt3pUzzj3eZ0Qm3nUKP1cFkq-o6xA7Z_SUZhHeTeeA3XunFZ-ruyh8E23OdrpZb2IHKbhQOwv9hM_bL-h747bTUUQAK6ZXX3dM5ULP2GKxXJKvjsbq6T2VehNppJYg9XG1mgbQivGDeSKFD2p0Bb94tB_z--OlE05cjDIyUiX7A9i0arUFIFdCh6zqrIfU_7S2';

export type UserProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl: string;
};

const PROFILE_KEY = 'roam-dash-profile';

export const DEFAULT_PROFILE: UserProfile = {
  firstName: 'Sarah',
  lastName: 'Johnson',
  email: 'sarah@email.com',
  phone: '+1 876-555-1234',
  avatarUrl: PROFILE_AVATAR,
};

export function getProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<UserProfile>) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(profile: Partial<UserProfile>): void {
  try {
    const current = getProfile();
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...current, ...profile }));
  } catch {
    // ignore
  }
}

export const ACCOUNT_MENU = [
  { id: 'addresses', icon: 'location_on', label: 'Addresses', page: 'saved-addresses' },
  { id: 'payment', icon: 'payment', label: 'Payment Methods', page: 'payment-methods' },
  { id: 'promotions', icon: 'loyalty', label: 'Promotions & Rewards', page: 'promotions' },
  { id: 'favorites', icon: 'favorite', label: 'Favorites', page: 'favorites' },
  { id: 'notifications', icon: 'notifications_active', label: 'Notification Settings', page: 'notification-settings' },
  { id: 'help', icon: 'help', label: 'Help & Support', page: 'help' },
  { id: 'about', icon: 'info', label: 'About', page: 'about' },
] as const;

export const KINGSTON_MAP_PREVIEW =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDABreR1_RpM4HP0OAbC26R60_3fKGG0yiMNQRJV0MIwcYHfoPDJlzR2L3GdVWe5PA0YvmT6a-KgUu_yNHg3N0oftiqGkhIsneGD4WIVsJliUW0W4tQVvHOvz4qsVPLfhvfkWqbDUDgAkAoLSNVwICMOMZRg9YsqR7npLIHtXl-OY-m25T56AaOFmNOQE3-xIk4gKzakIK4pH9muOIWrnZEXq6X7N1Wwv4Pncev5M3aok7YE4GuDSqjhnOEtt5d_Kfviek0Lm155aTD';

export const ADD_ADDRESS_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBBl6-rT1m0shL3xqs9-cHBGnICfmwjyEAMzFOHj7RwjUVyh4wneHLq7h_YgFQzzWX40BW4vAtiH4mwV4XjWIk-W0vf7w0iKJ5kW4gw6uXW7wbsoRvJcksyzidyPqY6znKzfs_cqihBjCjhoxWKRTlnpA0CCPD0vVAbYTorPeRQq0l5fR090LPtYIJkretUxXUuYsvFmAKNZ7avOVvcoC1LTZLwtta1wFl2HdddUP9WfO_ir2OPB66EXPJ6UdIbjKu7if_v5Gj2KejD';
