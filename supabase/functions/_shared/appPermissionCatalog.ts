/** Deno copy of packages/types/src/appPermissionCatalog.ts — keep in sync. */

export type AppPermissionSurface = "rider" | "driver";
export type AppPermissionPlatform = "web" | "native" | "both";
export type AppPermissionTier =
  | "core_mandatory"
  | "driver_mandatory"
  | "strongly_expected"
  | "feature_optional";

export type AppPermissionDefinition = {
  key: string;
  label: string;
  description: string;
  surface: AppPermissionSurface;
  platform: AppPermissionPlatform;
  tier: AppPermissionTier;
};

export type AppPermissionPolicyFlags = {
  enabled: boolean;
  prompt_onboarding: boolean;
  block_until_granted: boolean;
};

export type AppPermissionPolicyRow = AppPermissionDefinition & AppPermissionPolicyFlags;

const RIDER: AppPermissionDefinition[] = [
  { key: "location_precise_while_using", label: "Precise location (while using)", description: "Pickup pin, fare quote, and live trip map while the app is open.", surface: "rider", platform: "both", tier: "strongly_expected" },
  { key: "location_always", label: "Location (always)", description: "Background location for geofence prompts (native).", surface: "rider", platform: "native", tier: "feature_optional" },
  { key: "notifications", label: "Notifications", description: "Driver assigned and trip status alerts.", surface: "rider", platform: "both", tier: "strongly_expected" },
  { key: "location_bluetooth_assist", label: "Bluetooth (location assist)", description: "Improves GPS accuracy (native).", surface: "rider", platform: "native", tier: "feature_optional" },
  { key: "microphone_in_app_call", label: "Microphone (in-app call)", description: "Voice calls to driver.", surface: "rider", platform: "both", tier: "feature_optional" },
  { key: "phone_in_app_call", label: "Phone (in-app call)", description: "Dialer integration (native).", surface: "rider", platform: "native", tier: "feature_optional" },
  { key: "camera_profile", label: "Camera (profile)", description: "Profile photo.", surface: "rider", platform: "both", tier: "feature_optional" },
  { key: "contacts_split_fare", label: "Contacts", description: "Split fare and invites.", surface: "rider", platform: "both", tier: "feature_optional", osHints: { android: ["READ_CONTACTS"], ios: ["Contacts"] } },
  { key: "motion_activity", label: "Motion & activity", description: "Movement signals (native).", surface: "rider", platform: "native", tier: "feature_optional" },
  { key: "app_tracking", label: "App tracking (ATT)", description: "iOS analytics consent.", surface: "rider", platform: "native", tier: "feature_optional" },
];

const DRIVER: AppPermissionDefinition[] = [
  { key: "location_precise_while_using", label: "Precise location (while using)", description: "Matching, trip GPS, geofence automation.", surface: "driver", platform: "both", tier: "core_mandatory" },
  { key: "location_background_always", label: "Location (always)", description: "GPS when Maps/lock screen (native).", surface: "driver", platform: "native", tier: "driver_mandatory" },
  { key: "notifications", label: "Notifications", description: "Ride offers and trip updates.", surface: "driver", platform: "both", tier: "driver_mandatory" },
  { key: "foreground_service_location", label: "Foreground service (location)", description: "Android persistent GPS while online.", surface: "driver", platform: "native", tier: "driver_mandatory" },
  { key: "battery_optimization_exempt", label: "Battery optimization exemption", description: "Reduces OS killing app (Android).", surface: "driver", platform: "native", tier: "strongly_expected" },
  { key: "full_screen_intent_offers", label: "Full-screen offer alerts", description: "Lock-screen offers (Android).", surface: "driver", platform: "native", tier: "strongly_expected" },
  { key: "microphone_in_app_call", label: "Microphone (in-app call)", description: "Voice calls to riders.", surface: "driver", platform: "both", tier: "feature_optional" },
  { key: "phone_in_app_call", label: "Phone (in-app call)", description: "Dialer (native).", surface: "driver", platform: "native", tier: "feature_optional" },
  { key: "camera_documents", label: "Camera (documents)", description: "License and profile photos.", surface: "driver", platform: "both", tier: "feature_optional" },
  { key: "storage_cache_maps", label: "Storage (map cache)", description: "Offline map cache.", surface: "driver", platform: "both", tier: "feature_optional" },
  { key: "activity_recognition", label: "Activity recognition", description: "Driving detection (native).", surface: "driver", platform: "native", tier: "feature_optional" },
  { key: "bluetooth_headset", label: "Bluetooth", description: "Headsets (native).", surface: "driver", platform: "native", tier: "feature_optional" },
];

export const APP_PERMISSION_CATALOG: AppPermissionDefinition[] = [...RIDER, ...DRIVER];

export function getCatalogForSurface(surface: AppPermissionSurface): AppPermissionDefinition[] {
  return APP_PERMISSION_CATALOG.filter((p) => p.surface === surface);
}

export function getCatalogEntry(surface: AppPermissionSurface, key: string): AppPermissionDefinition | undefined {
  return getCatalogForSurface(surface).find((p) => p.key === key);
}

export function getDefaultPolicyFlags(surface: AppPermissionSurface, key: string): AppPermissionPolicyFlags {
  if (surface === "rider") {
    if (key === "location_precise_while_using" || key === "notifications") {
      return { enabled: true, prompt_onboarding: true, block_until_granted: false };
    }
    return { enabled: true, prompt_onboarding: false, block_until_granted: false };
  }
  if (key === "location_precise_while_using" || key === "notifications") {
    return { enabled: true, prompt_onboarding: true, block_until_granted: true };
  }
  if (
    key === "location_background_always" ||
    key === "foreground_service_location" ||
    key === "battery_optimization_exempt" ||
    key === "full_screen_intent_offers"
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
