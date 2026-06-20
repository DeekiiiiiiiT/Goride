import type {
  AnnouncementSettings,
  ConsumerSegmentSettings,
  EnabledModules,
  FleetProductSettings,
  GlobalPlatformSettings,
  SecurityPolicies,
  SettingsSegment,
} from './types';

export const DEFAULT_SECURITY_POLICIES: SecurityPolicies = {
  minPasswordLength: 8,
  requireUppercase: false,
  requireNumber: false,
  requireSpecialChar: false,
  sessionTimeoutMinutes: 0,
  maxLoginAttempts: 0,
  lockoutDurationMinutes: 15,
};

export const DEFAULT_ANNOUNCEMENT: AnnouncementSettings = {
  enabled: false,
  message: '',
  type: 'info',
  startDate: null,
  endDate: null,
  dismissible: true,
};

export const DEFAULT_ENABLED_MODULES: EnabledModules = {
  fuelManagement: true,
  tollManagement: true,
  driverPortal: true,
  fleetEquipment: true,
  claimableLoss: true,
  performanceAnalytics: true,
};

const ALL_BUSINESS_TYPES_ENABLED: Record<string, boolean> = {
  rideshare: true,
  delivery: true,
  taxi: true,
  trucking: true,
  shipping: true,
};

const FLEET_BUSINESS_TYPES: Record<string, boolean> = {
  rideshare: true,
  delivery: false,
  taxi: false,
  trucking: false,
  shipping: false,
};

function baseFleetProductSettings(
  platformName: string,
  enabledBusinessTypes: Record<string, boolean>,
): FleetProductSettings {
  return {
    platformName,
    defaultCurrency: 'JMD',
    fleetTimezone: 'America/Jamaica',
    platformVersion: '1.0.0',
    maintenanceMode: false,
    maintenanceMessage: '',
    enabledBusinessTypes,
    enabledModules: { ...DEFAULT_ENABLED_MODULES },
    registrationMode: 'open',
    allowedDomains: [],
    requireApproval: false,
    welcomeEmailMessage: '',
    securityPolicies: { ...DEFAULT_SECURITY_POLICIES },
    announcement: { ...DEFAULT_ANNOUNCEMENT },
  };
}

export const DEFAULT_FLEET_SETTINGS: FleetProductSettings = baseFleetProductSettings(
  'Roam Fleet',
  FLEET_BUSINESS_TYPES,
);

export const DEFAULT_ENTERPRISE_SETTINGS: FleetProductSettings = baseFleetProductSettings(
  'Roam Enterprise',
  ALL_BUSINESS_TYPES_ENABLED,
);

export const DEFAULT_GLOBAL_SETTINGS: GlobalPlatformSettings = {
  maintenanceMode: false,
  maintenanceMessage: '',
  securityPolicies: { ...DEFAULT_SECURITY_POLICIES },
  announcement: { ...DEFAULT_ANNOUNCEMENT },
};

const CONSUMER_SEGMENT_NAMES: Record<'rides' | 'driver' | 'haul' | 'dash', string> = {
  rides: 'Roam Rides',
  driver: 'Roam Driver',
  haul: 'Roam Haul',
  dash: 'Roam Dash',
  courier: 'Roam Dash Courier',
};

export function defaultConsumerSegmentSettings(
  segment: 'rides' | 'driver' | 'haul' | 'dash' | 'courier',
): ConsumerSegmentSettings {
  return {
    platformName: CONSUMER_SEGMENT_NAMES[segment],
    defaultCurrency: 'JMD',
    fleetTimezone: 'America/Jamaica',
    maintenanceMode: false,
    maintenanceMessage: '',
    registrationMode: 'open',
    allowedDomains: [],
    requireApproval: false,
    welcomeEmailMessage: '',
    announcement: { ...DEFAULT_ANNOUNCEMENT },
    securityPolicies: { ...DEFAULT_SECURITY_POLICIES },
  };
}

export function defaultSettingsForSegment(segment: SettingsSegment): FleetProductSettings | GlobalPlatformSettings | ConsumerSegmentSettings {
  switch (segment) {
    case 'global':
      return { ...DEFAULT_GLOBAL_SETTINGS };
    case 'fleet':
      return { ...DEFAULT_FLEET_SETTINGS };
    case 'enterprise':
      return { ...DEFAULT_ENTERPRISE_SETTINGS };
    case 'rides':
    case 'driver':
    case 'haul':
    case 'dash':
    case 'courier':
      return defaultConsumerSegmentSettings(segment);
    default:
      return { ...DEFAULT_FLEET_SETTINGS };
  }
}
