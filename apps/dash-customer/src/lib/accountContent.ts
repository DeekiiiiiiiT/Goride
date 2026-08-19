import { allowMocks } from './mocksGate';
import {
  fetchCustomerProfile,
  getAuthAvatarHint,
  isCustomerLoggedIn,
  patchCustomerProfile,
  uploadCustomerAvatar,
} from './customerApi';
import { hydratePreferredPaymentMethod } from './checkoutStorage';
import { assertCustomerAvatarFile, resolveProfileAvatarUrl } from './profileAvatar';

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

/** Demo-only seed — never shown as a real logged-in identity in production. */
export const DEFAULT_PROFILE: UserProfile = {
  firstName: 'Sarah',
  lastName: 'Johnson',
  email: 'sarah@email.com',
  phone: '+1 876-555-1234',
  avatarUrl: PROFILE_AVATAR,
};

const EMPTY_PROFILE: UserProfile = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  avatarUrl: PROFILE_AVATAR,
};

function withAvatar(profile: UserProfile): UserProfile {
  return { ...profile, avatarUrl: resolveProfileAvatarUrl(profile.avatarUrl, PROFILE_AVATAR) };
}

function readLocalProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      return withAvatar({ ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<UserProfile>) });
    }
  } catch {
    // fall through
  }
  return allowMocks() ? { ...DEFAULT_PROFILE } : { ...EMPTY_PROFILE };
}

function writeLocalProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function getProfile(): UserProfile {
  return readLocalProfile();
}

export function saveProfile(profile: Partial<UserProfile>): void {
  const current = readLocalProfile();
  writeLocalProfile(withAvatar({ ...current, ...profile }));
}

/** Pull profile from delivery edge when logged in; cache locally for UX. */
export async function syncProfileFromBackend(): Promise<UserProfile> {
  if (!(await isCustomerLoggedIn())) return readLocalProfile();
  try {
    const remote = await fetchCustomerProfile();
    if (!remote) return readLocalProfile();
    const next: UserProfile = {
      firstName: remote.firstName || '',
      lastName: remote.lastName || '',
      email: remote.email || '',
      phone: remote.phone || '',
      avatarUrl: resolveProfileAvatarUrl(
        remote.avatarUrl || (await getAuthAvatarHint()),
        PROFILE_AVATAR,
      ),
    };
    writeLocalProfile(next);
    if (remote.preferredPaymentMethod) {
      hydratePreferredPaymentMethod(remote.preferredPaymentMethod);
    }
    return next;
  } catch {
    return readLocalProfile();
  }
}

/** Persist profile to backend + local cache. Local-only when signed out. */
export async function persistProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
  const merged = withAvatar({ ...readLocalProfile(), ...profile });
  writeLocalProfile(merged);

  if (!(await isCustomerLoggedIn())) return merged;

  const remote = await patchCustomerProfile({
    firstName: merged.firstName,
    lastName: merged.lastName,
    name: `${merged.firstName} ${merged.lastName}`.trim(),
    phone: merged.phone,
    email: merged.email,
  });

  const next: UserProfile = {
    firstName: remote.firstName || merged.firstName,
    lastName: remote.lastName || merged.lastName,
    email: remote.email || merged.email,
    phone: remote.phone || merged.phone,
    avatarUrl: resolveProfileAvatarUrl(remote.avatarUrl || merged.avatarUrl, PROFILE_AVATAR),
  };
  writeLocalProfile(next);
  return next;
}

export async function persistProfilePhoto(file: File): Promise<UserProfile> {
  assertCustomerAvatarFile(file);
  if (!(await isCustomerLoggedIn())) throw new Error('Sign in to change your photo');
  const remote = await uploadCustomerAvatar(file);
  const current = readLocalProfile();
  const next = withAvatar({
    ...current,
    firstName: remote.firstName || current.firstName,
    lastName: remote.lastName || current.lastName,
    email: remote.email || current.email,
    phone: remote.phone || current.phone,
    avatarUrl: remote.avatarUrl || '',
  });
  writeLocalProfile(next);
  return next;
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
