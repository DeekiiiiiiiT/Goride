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

/** Fleet product-line feature modules. */
export interface FleetEnabledModules {
  fuelManagement: boolean;
  tollManagement: boolean;
  driverPortal: boolean;
  fleetEquipment: boolean;
  claimableLoss: boolean;
  performanceAnalytics: boolean;
}

/** Enterprise product-line feature modules (Path B — full sellable catalog). */
export interface EnterpriseEnabledModules {
  shipments: boolean;
  carriers: boolean;
  clients: boolean;
  rateCards: boolean;
  suites: boolean;
  mailboxPackages: boolean;
  miamiScan: boolean;
  manifests: boolean;
  customsBoard: boolean;
  hubStation: boolean;
  fulfillmentDesk: boolean;
  clientFleet: boolean;
  dispatchBoard: boolean;
  serviceZones: boolean;
  opsInbox: boolean;
  fuelManagement: boolean;
  tollManagement: boolean;
  drivers: boolean;
  vehicles: boolean;
  fleetEquipment: boolean;
  trips: boolean;
  dataCenter: boolean;
  reports: boolean;
  businessFinance: boolean;
  claimableLoss: boolean;
  teamManagement: boolean;
  driverPortal: boolean;
  performanceAnalytics: boolean;
}

/** Merge compat: fleet keys + enterprise keys. */
export type EnabledModules = FleetEnabledModules & Partial<EnterpriseEnabledModules>;

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
  /** Dash only: platform fee as 0–1 fraction (0.05 = 5%). Ignored for other segments. */
  platformFeeRate?: number;
  updatedAt?: string;
}

export type SettingsSegment =
  | 'global'
  | 'fleet'
  | 'enterprise'
  | 'rides'
  | 'driver'
  | 'haul'
  | 'dash'
  | 'courier';

export type ProductLineSegment = 'fleet' | 'enterprise';

export const LEGACY_PLATFORM_SETTINGS_KEY = 'platform:settings';

export function platformSettingsKvKey(segment: SettingsSegment): string {
  return `platform:settings:${segment}`;
}

export function isProductLineSegment(segment: SettingsSegment): segment is ProductLineSegment {
  return segment === 'fleet' || segment === 'enterprise';
}

export function isConsumerSegment(segment: SettingsSegment): boolean {
  return segment === 'rides' || segment === 'driver' || segment === 'haul' || segment === 'dash' || segment === 'courier';
}

/** Map legacy product-line header to settings segment. */
export function productLineToSegment(productLine: 'fleet' | 'enterprise'): ProductLineSegment {
  return productLine;
}
