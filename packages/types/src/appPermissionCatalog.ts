/** SSOT: app permission catalog for rider/driver surfaces (Uber/inDrive aligned). */

export type AppPermissionSurface = 'rider' | 'driver';

export type AppPermissionPlatform = 'web' | 'native' | 'both';

export type AppPermissionTier =
  | 'core_mandatory'
  | 'driver_mandatory'
  | 'strongly_expected'
  | 'feature_optional';

export type AppPermissionDefinition = {
  key: string;
  label: string;
  description: string;
  surface: AppPermissionSurface;
  platform: AppPermissionPlatform;
  tier: AppPermissionTier;
  osHints?: { android?: string[]; ios?: string[] };
};

export type AppPermissionPolicyFlags = {
  enabled: boolean;
  prompt_onboarding: boolean;
  block_until_granted: boolean;
};

export type AppPermissionPolicyRow = AppPermissionDefinition & AppPermissionPolicyFlags;

export const APP_PERMISSION_TIER_LABELS: Record<
  AppPermissionTier,
  { title: string; description: string }
> = {
  core_mandatory: {
    title: 'Core mandatory',
    description: 'App cannot reliably do rides without it (or blocks you until you grant it).',
  },
  driver_mandatory: {
    title: 'Driver mandatory',
    description: 'Required for drivers specifically (much stricter than riders).',
  },
  strongly_expected: {
    title: 'Strongly expected',
    description: 'Uber/inDrive push it at onboarding; product works poorly without it.',
  },
  feature_optional: {
    title: 'Feature optional',
    description: 'Only needed for a sub-feature (in-app call, profile photo, etc.).',
  },
};

export const APP_PERMISSION_PLATFORM_LABELS: Record<AppPermissionPlatform, string> = {
  web: 'Web',
  native: 'Native',
  both: 'Web + Native',
};

const RIDER_PERMISSIONS: AppPermissionDefinition[] = [
  {
    key: 'location_precise_while_using',
    label: 'Precise location (while using)',
    description: 'Pickup pin, fare quote, and live trip map while the app is open.',
    surface: 'rider',
    platform: 'both',
    tier: 'strongly_expected',
    osHints: {
      android: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
      ios: ['Location When In Use', 'Precise Location'],
    },
  },
  {
    key: 'location_always',
    label: 'Location (always)',
    description: 'Background location for airport geofence prompts and similar (native apps).',
    surface: 'rider',
    platform: 'native',
    tier: 'feature_optional',
    osHints: { android: ['ACCESS_BACKGROUND_LOCATION'], ios: ['Location Always'] },
  },
  {
    key: 'notifications',
    label: 'Notifications',
    description: 'Driver assigned, arrival, and trip status alerts.',
    surface: 'rider',
    platform: 'both',
    tier: 'strongly_expected',
    osHints: { android: ['POST_NOTIFICATIONS'], ios: ['Notifications'] },
  },
  {
    key: 'location_bluetooth_assist',
    label: 'Bluetooth (location assist)',
    description: 'Improves GPS accuracy via nearby Bluetooth beacons (native).',
    surface: 'rider',
    platform: 'native',
    tier: 'feature_optional',
    osHints: { android: ['BLUETOOTH_CONNECT'], ios: ['Bluetooth'] },
  },
  {
    key: 'microphone_in_app_call',
    label: 'Microphone (in-app call)',
    description: 'Voice calls to your driver inside the app.',
    surface: 'rider',
    platform: 'both',
    tier: 'feature_optional',
  },
  {
    key: 'phone_in_app_call',
    label: 'Phone (in-app call)',
    description: 'Places calls through the app dialer integration (native).',
    surface: 'rider',
    platform: 'native',
    tier: 'feature_optional',
    osHints: { android: ['CALL_PHONE'], ios: [] },
  },
  {
    key: 'camera_profile',
    label: 'Camera (profile)',
    description: 'Profile photo and document capture.',
    surface: 'rider',
    platform: 'both',
    tier: 'feature_optional',
  },
  {
    key: 'contacts_split_fare',
    label: 'Contacts',
    description: 'Split fare and invite friends.',
    surface: 'rider',
    platform: 'both',
    tier: 'feature_optional',
  },
  {
    key: 'motion_activity',
    label: 'Motion & activity',
    description: 'Movement signals for accuracy and fraud checks (native).',
    surface: 'rider',
    platform: 'native',
    tier: 'feature_optional',
    osHints: { android: ['ACTIVITY_RECOGNITION'], ios: ['Motion & Fitness'] },
  },
  {
    key: 'app_tracking',
    label: 'App tracking (ATT)',
    description: 'Cross-app analytics consent on iOS.',
    surface: 'rider',
    platform: 'native',
    tier: 'feature_optional',
    osHints: { ios: ['App Tracking Transparency'] },
  },
];

const DRIVER_PERMISSIONS: AppPermissionDefinition[] = [
  {
    key: 'location_precise_while_using',
    label: 'Precise location (while using)',
    description: 'Matching, navigation, trip GPS, and geofence automation while the app is open.',
    surface: 'driver',
    platform: 'both',
    tier: 'core_mandatory',
    osHints: {
      android: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
      ios: ['Location When In Use', 'Precise Location'],
    },
  },
  {
    key: 'location_background_always',
    label: 'Location (always / background)',
    description: 'GPS while Maps is open, screen locked, or app in background (native driver app).',
    surface: 'driver',
    platform: 'native',
    tier: 'driver_mandatory',
    osHints: { android: ['ACCESS_BACKGROUND_LOCATION'], ios: ['Location Always'] },
  },
  {
    key: 'notifications',
    label: 'Notifications',
    description: 'Incoming ride offers and trip status.',
    surface: 'driver',
    platform: 'both',
    tier: 'driver_mandatory',
    osHints: { android: ['POST_NOTIFICATIONS'], ios: ['Notifications'] },
  },
  {
    key: 'foreground_service_location',
    label: 'Foreground service (location)',
    description: 'Persistent notification while online so Android keeps GPS active.',
    surface: 'driver',
    platform: 'native',
    tier: 'driver_mandatory',
    osHints: { android: ['FOREGROUND_SERVICE_LOCATION'] },
  },
  {
    key: 'battery_optimization_exempt',
    label: 'Battery optimization exemption',
    description: 'Reduces OS killing the app during active trips (native Android).',
    surface: 'driver',
    platform: 'native',
    tier: 'strongly_expected',
    osHints: { android: ['REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'] },
  },
  {
    key: 'full_screen_intent_offers',
    label: 'Full-screen offer alerts',
    description: 'Shows incoming offers on lock screen (native Android).',
    surface: 'driver',
    platform: 'native',
    tier: 'strongly_expected',
    osHints: { android: ['USE_FULL_SCREEN_INTENT'] },
  },
  {
    key: 'microphone_in_app_call',
    label: 'Microphone (in-app call)',
    description: 'Voice calls to riders inside the app.',
    surface: 'driver',
    platform: 'both',
    tier: 'feature_optional',
  },
  {
    key: 'phone_in_app_call',
    label: 'Phone (in-app call)',
    description: 'Places calls through the app dialer (native).',
    surface: 'driver',
    platform: 'native',
    tier: 'feature_optional',
  },
  {
    key: 'camera_documents',
    label: 'Camera (documents)',
    description: 'License, insurance, and profile photos.',
    surface: 'driver',
    platform: 'both',
    tier: 'feature_optional',
  },
  {
    key: 'storage_cache_maps',
    label: 'Storage (map cache)',
    description: 'Caches map tiles and route data offline.',
    surface: 'driver',
    platform: 'both',
    tier: 'feature_optional',
  },
  {
    key: 'activity_recognition',
    label: 'Activity recognition',
    description: 'Detects driving vs stationary for arrival logic (native).',
    surface: 'driver',
    platform: 'native',
    tier: 'feature_optional',
    osHints: { android: ['ACTIVITY_RECOGNITION'] },
  },
  {
    key: 'bluetooth_headset',
    label: 'Bluetooth',
    description: 'Headsets and location-assist beacons (native).',
    surface: 'driver',
    platform: 'native',
    tier: 'feature_optional',
  },
];

export const APP_PERMISSION_CATALOG: AppPermissionDefinition[] = [
  ...RIDER_PERMISSIONS,
  ...DRIVER_PERMISSIONS,
];

export function getCatalogForSurface(surface: AppPermissionSurface): AppPermissionDefinition[] {
  return APP_PERMISSION_CATALOG.filter((p) => p.surface === surface);
}

export function getCatalogEntry(
  surface: AppPermissionSurface,
  key: string,
): AppPermissionDefinition | undefined {
  return getCatalogForSurface(surface).find((p) => p.key === key);
}

/** Default DB policy flags when no row exists (matches migration seed). */
export function getDefaultPolicyFlags(
  surface: AppPermissionSurface,
  key: string,
): AppPermissionPolicyFlags {
  if (surface === 'rider') {
    if (key === 'location_precise_while_using') {
      return { enabled: true, prompt_onboarding: true, block_until_granted: false };
    }
    if (key === 'notifications') {
      return { enabled: true, prompt_onboarding: true, block_until_granted: false };
    }
    return { enabled: true, prompt_onboarding: false, block_until_granted: false };
  }

  if (key === 'location_precise_while_using') {
    return { enabled: true, prompt_onboarding: true, block_until_granted: true };
  }
  if (key === 'notifications') {
    return { enabled: true, prompt_onboarding: true, block_until_granted: true };
  }
  if (
    key === 'location_background_always' ||
    key === 'foreground_service_location' ||
    key === 'battery_optimization_exempt' ||
    key === 'full_screen_intent_offers'
  ) {
    return { enabled: true, prompt_onboarding: true, block_until_granted: false };
  }
  return { enabled: true, prompt_onboarding: false, block_until_granted: false };
}

export function mergeCatalogWithPolicy(
  surface: AppPermissionSurface,
  dbRows: Array<{ permission_key: string } & AppPermissionPolicyFlags>,
): AppPermissionPolicyRow[] {
  const byKey = new Map(dbRows.map((r) => [r.permission_key, r]));
  return getCatalogForSurface(surface).map((def) => {
    const row = byKey.get(def.key);
    const flags = row
      ? {
          enabled: row.enabled,
          prompt_onboarding: row.prompt_onboarding,
          block_until_granted: row.block_until_granted,
        }
      : getDefaultPolicyFlags(surface, def.key);
    return { ...def, ...flags };
  });
}
