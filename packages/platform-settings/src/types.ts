export type RegistrationMode = 'open' | 'invite_only' | 'domain_restricted';

export type AnnouncementType = 'info' | 'warning' | 'critical';

export interface SecurityPolicies {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
}

export interface AnnouncementSettings {
  enabled: boolean;
  message: string;
  type: AnnouncementType;
  startDate: string | null;
  endDate: string | null;
  dismissible: boolean;
}

export interface EnabledModules {
  fuelManagement: boolean;
  tollManagement: boolean;
  driverPortal: boolean;
  fleetEquipment: boolean;
  claimableLoss: boolean;
  performanceAnalytics: boolean;
}

/** Full product-line settings blob (fleet + enterprise). */
export interface FleetProductSettings {
  platformName: string;
  defaultCurrency: string;
  fleetTimezone: string;
  platformVersion: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  enabledBusinessTypes: Record<string, boolean>;
  enabledModules: EnabledModules;
  registrationMode: RegistrationMode;
  allowedDomains: string[];
  requireApproval: boolean;
  welcomeEmailMessage: string;
  securityPolicies: SecurityPolicies;
  announcement: AnnouncementSettings;
  updatedAt?: string;
}

/** Dominion global emergency / cross-product controls. */
export interface GlobalPlatformSettings {
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  securityPolicies?: Partial<SecurityPolicies>;
  announcement?: Partial<AnnouncementSettings>;
  updatedAt?: string;
}

/** Consumer segment admin (rides, driver, haul, dash). */
export interface ConsumerSegmentSettings {
  platformName: string;
  defaultCurrency: string;
  fleetTimezone: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  registrationMode: RegistrationMode;
  allowedDomains: string[];
  requireApproval: boolean;
  welcomeEmailMessage: string;
  announcement: AnnouncementSettings;
  securityPolicies: SecurityPolicies;
  updatedAt?: string;
}

export type SettingsSegment =
  | 'global'
  | 'fleet'
  | 'enterprise'
  | 'rides'
  | 'driver'
  | 'haul'
  | 'dash';

export type ProductLineSegment = 'fleet' | 'enterprise';

export const LEGACY_PLATFORM_SETTINGS_KEY = 'platform:settings';

export function platformSettingsKvKey(segment: SettingsSegment): string {
  return `platform:settings:${segment}`;
}

export function isProductLineSegment(segment: SettingsSegment): segment is ProductLineSegment {
  return segment === 'fleet' || segment === 'enterprise';
}

export function isConsumerSegment(segment: SettingsSegment): boolean {
  return segment === 'rides' || segment === 'driver' || segment === 'haul' || segment === 'dash';
}

/** Map legacy product-line header to settings segment. */
export function productLineToSegment(productLine: 'fleet' | 'enterprise'): ProductLineSegment {
  return productLine;
}
