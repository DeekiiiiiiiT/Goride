import type {
  AnnouncementSettings,
  ConsumerSegmentSettings,
  EnabledModules,
  EnterpriseEnabledModules,
  FleetEnabledModules,
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

export const DEFAULT_FLEET_ENABLED_MODULES: FleetEnabledModules = {
  fuelManagement: true,
  tollManagement: true,
  driverPortal: true,
  fleetEquipment: true,
  claimableLoss: true,
  performanceAnalytics: true,
};

/** Full product on by default so packaging can turn modules off per customer. */
export const DEFAULT_ENTERPRISE_ENABLED_MODULES: EnterpriseEnabledModules = {
  shipments: true,
  carriers: true,
  clients: true,
  rateCards: true,
  fuelManagement: true,
  tollManagement: true,
  drivers: true,
  vehicles: true,
  fleetEquipment: true,
  trips: true,
  dataCenter: true,
  reports: true,
  businessFinance: true,
  claimableLoss: true,
  teamManagement: true,
  driverPortal: true,
  performanceAnalytics: true,
};

/** @deprecated Use DEFAULT_FLEET_ENABLED_MODULES */
export const DEFAULT_ENABLED_MODULES: EnabledModules = {
  ...DEFAULT_FLEET_ENABLED_MODULES,
};

const FLEET_BUSINESS_TYPES: Record<string, boolean> = {
  rideshare: true,
  delivery: false,
  taxi: false,
  trucking: false,
  shipping: false,
  freight_forwarding: false,
};

const ENTERPRISE_BUSINESS_TYPES: Record<string, boolean> = {
  rideshare: false,
  delivery: true,
  taxi: false,
  trucking: true,
  shipping: true,
  freight_forwarding: true,
};

function baseFleetProductSettings(
  platformName: string,
  enabledBusinessTypes: Record<string, boolean>,
  enabledModules: EnabledModules,
): FleetProductSettings {
  return {
    platformName,
    defaultCurrency: 'JMD',
    fleetTimezone: 'America/Jamaica',
    platformVersion: '1.0.0',
    maintenanceMode: false,
    maintenanceMessage: '',
    enabledBusinessTypes,
    enabledModules: { ...enabledModules },
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
  { ...DEFAULT_FLEET_ENABLED_MODULES },
);

export const DEFAULT_ENTERPRISE_SETTINGS: FleetProductSettings = baseFleetProductSettings(
  'Roam Enterprise',
  ENTERPRISE_BUSINESS_TYPES,
  { ...DEFAULT_ENTERPRISE_ENABLED_MODULES },
);

export const DEFAULT_GLOBAL_SETTINGS: GlobalPlatformSettings = {
  maintenanceMode: false,
  maintenanceMessage: '',
  securityPolicies: { ...DEFAULT_SECURITY_POLICIES },
  announcement: { ...DEFAULT_ANNOUNCEMENT },
};

const CONSUMER_SEGMENT_NAMES: Record<'rides' | 'driver' | 'haul' | 'dash' | 'courier', string> = {
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
    ...(segment === 'dash' ? { platformFeeRate: 0.05 } : {}),
  };
}

export function defaultSettingsForSegment(
  segment: SettingsSegment,
): FleetProductSettings | GlobalPlatformSettings | ConsumerSegmentSettings {
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
