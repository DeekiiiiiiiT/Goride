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

/**
 * Enterprise sellable modules — freight_* / grocery_* vertical prefixes
 * plus shared ops / money / people keys (unchanged camelCase for Fleet bridge).
 */
export interface EnterpriseEnabledModules {
  freight_shipments: boolean;
  freight_carriers: boolean;
  freight_clients: boolean;
  freight_rate_cards: boolean;
  freight_suites: boolean;
  freight_mailbox_packages: boolean;
  freight_miami_scan: boolean;
  freight_manifests: boolean;
  freight_customs_board: boolean;
  freight_hub_station: boolean;
  freight_fulfillment: boolean;
  freight_client_fleet: boolean;
  freight_dispatch: boolean;
  freight_service_zones: boolean;
  freight_ops_inbox: boolean;
  freight_pipeline_command: boolean;
  freight_invoice_audit: boolean;
  freight_hs_tariffs: boolean;
  freight_billing: boolean;
  /** Freight Forwarder product — receive floor, partnerships, storage ledger. */
  warehouse_inbound: boolean;
  warehouse_receive: boolean;
  warehouse_partner_links: boolean;
  warehouse_storage_billing: boolean;
  warehouse_bins: boolean;
  /** Reserved grocery vertical SKUs — off by default; no Enterprise UI yet. */
  grocery_catalog: boolean;
  grocery_orders: boolean;
  grocery_fulfillment: boolean;
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

/** Dominion global emergency / cross-product controls. GCT lives in Accounting → GCT. */
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
