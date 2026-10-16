import { z } from 'zod';

/** App surface that owns the setting. */
export type SettingApp = 'platform' | 'customer' | 'courier' | 'partner';

/** Where a value may be stored. `market` means per-market override is allowed. */
export type SettingScope = 'platform' | 'market';

/** Change risk — high needs two people; locked is owner-only. */
export type SettingRisk = 'normal' | 'high' | 'locked';

/** Fallback when the settings store cannot be read. */
export type OnReadError = 'default' | 'safe';

/**
 * Serialized type for edge / Deno (cannot import Zod).
 * Package validation uses `zodSchema`; edge uses `kind` + simple checks.
 */
export type SettingValueKind =
  | 'boolean'
  | 'number'
  | 'string'
  | 'string[]'
  | 'number[]'
  | 'object'
  | 'enum';

export type SettingDef<T = unknown> = {
  key: string;
  app: SettingApp;
  section: string;
  label: string;
  help: string;
  /** Edge-friendly type tag (mirror of the Zod shape). */
  kind: SettingValueKind;
  /** Full Zod schema for admin/server validation in the workspace package. */
  zodSchema: z.ZodType<T>;
  default: T;
  scopes: SettingScope[];
  clientVisible: boolean;
  risk: SettingRisk;
  editRoles: string[];
  /** Repo-relative paths that must eventually call getSetting / app-config for this key. */
  readers: string[];
  envOverride?: string;
  onReadError: OnReadError;
  unit?: string;
  /** Present when kind === 'enum'. */
  enumValues?: readonly string[];
  /** Number bounds mirrored to the edge for write validation. */
  min?: number;
  max?: number;
  /**
   * When true, omit from admin UI until a real reader exists.
   * Hidden settings skip the "key must appear in reader file" test.
   */
  hidden?: boolean;
};

export type DefineSettingInput<T> = {
  key: string;
  app: SettingApp;
  section: string;
  label: string;
  help: string;
  kind: SettingValueKind;
  zodSchema: z.ZodType<T>;
  default: T;
  scopes: SettingScope[];
  clientVisible: boolean;
  risk: SettingRisk;
  editRoles: string[];
  readers: string[];
  envOverride?: string;
  /** Defaults to `default` (use registry default on read failure). */
  onReadError?: OnReadError;
  unit?: string;
  enumValues?: readonly string[];
  min?: number;
  max?: number;
  hidden?: boolean;
};

/** Build a typed registry entry; default must satisfy the Zod schema. */
export function defineSetting<T>(input: DefineSettingInput<T>): SettingDef<T> {
  const parsed = input.zodSchema.safeParse(input.default);
  if (!parsed.success) {
    throw new Error(
      `defineSetting(${input.key}): default failed schema: ${parsed.error.message}`,
    );
  }
  if (input.readers.length === 0) {
    throw new Error(`defineSetting(${input.key}): at least one reader is required`);
  }
  if (input.kind === 'enum' && (!input.enumValues || input.enumValues.length === 0)) {
    throw new Error(`defineSetting(${input.key}): enum kind requires enumValues`);
  }

  return {
    key: input.key,
    app: input.app,
    section: input.section,
    label: input.label,
    help: input.help,
    kind: input.kind,
    zodSchema: input.zodSchema,
    default: input.default,
    scopes: input.scopes,
    clientVisible: input.clientVisible,
    risk: input.risk,
    editRoles: input.editRoles,
    readers: input.readers,
    envOverride: input.envOverride,
    onReadError: input.onReadError ?? 'default',
    unit: input.unit,
    enumValues: input.enumValues,
    min: input.min,
    max: input.max,
    hidden: input.hidden,
  };
}

// ── Shared value schemas (defaults / admin forms) ───────────────────────────

export const supportContactSchema = z.object({
  phone: z.string(),
  whatsapp: z.string(),
  email: z.union([z.literal(''), z.string().email()]),
  hours: z.string(),
});
export type SupportContact = z.infer<typeof supportContactSchema>;

export const maintenanceSchema = z.object({
  active: z.boolean(),
  message: z.string(),
  until: z.string().nullable(),
});
export type MaintenanceValue = z.infer<typeof maintenanceSchema>;

export const announcementItemSchema = z.object({
  id: z.string(),
  type: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  dismissible: z.boolean(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
});
export const announcementListSchema = z.array(announcementItemSchema);
export type AnnouncementList = z.infer<typeof announcementListSchema>;

export const appVersionGateSchema = z.object({
  minVersion: z.string(),
  recommendedVersion: z.string(),
});
export type AppVersionGate = z.infer<typeof appVersionGateSchema>;

export const storeLinksSchema = z.object({
  playStore: z.string(),
  appStore: z.string(),
});
export type StoreLinks = z.infer<typeof storeLinksSchema>;

export const localeSchema = z.object({
  currency: z.literal('JMD'),
  timeZone: z.literal('America/Jamaica'),
});
export type LocaleValue = z.infer<typeof localeSchema>;

export const staffSecuritySchema = z.object({
  sessionTimeoutMinutes: z.number().int().min(0),
  mfaRequiredRoles: z.array(z.string()),
});
export type StaffSecurity = z.infer<typeof staffSecuritySchema>;

export const quietHoursSchema = z.object({
  start: z.string(),
  end: z.string(),
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

export const scheduledOrderingSchema = z.object({
  enabled: z.boolean(),
  maxDaysAhead: z.number().int().min(0).max(30),
});
export type ScheduledOrdering = z.infer<typeof scheduledOrderingSchema>;

export const courierDocumentDefSchema = z.object({
  name: z.string(),
  docType: z.string(),
  sides: z.enum(['front', 'front_and_back', 'single']),
  expiryRequired: z.boolean(),
  required: z.boolean(),
  vehicleTypes: z.array(z.enum(['bicycle', 'motorcycle', 'car'])),
});
export const courierRequiredDocumentsSchema = z.array(courierDocumentDefSchema);
export type CourierRequiredDocuments = z.infer<typeof courierRequiredDocumentsSchema>;

export const dayHoursSchema = z.object({
  open: z.string(),
  close: z.string(),
  closed: z.boolean(),
});
export const platformServiceHoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
  outsideHoursMessage: z.string(),
});
export type PlatformServiceHours = z.infer<typeof platformServiceHoursSchema>;

export const holidayCalendarSchema = z.array(
  z.object({
    date: z.string(),
    name: z.string(),
    mode: z.enum(['closed', 'reduced', 'normal']),
    message: z.string().optional(),
  }),
);
export type HolidayCalendar = z.infer<typeof holidayCalendarSchema>;

export const busyModeSchema = z.object({
  active: z.boolean(),
  extraEtaMinutes: z.number().int().min(0).max(120),
  pauseNewRestaurants: z.boolean(),
  bannerMessage: z.string(),
  autoEndAt: z.string().nullable(),
});
export type BusyMode = z.infer<typeof busyModeSchema>;

export const notificationChannelsSchema = z.object({
  orderPlaced: z.array(z.enum(['sms', 'push', 'email'])),
  orderAccepted: z.array(z.enum(['sms', 'push', 'email'])),
  courierAssigned: z.array(z.enum(['sms', 'push', 'email'])),
  outForDelivery: z.array(z.enum(['sms', 'push', 'email'])),
  delivered: z.array(z.enum(['sms', 'push', 'email'])),
  cancelled: z.array(z.enum(['sms', 'push', 'email'])),
});
export type NotificationChannels = z.infer<typeof notificationChannelsSchema>;

export const messageTemplateSchema = z.object({
  key: z.string(),
  channel: z.enum(['sms', 'push', 'email']),
  body: z.string(),
});
export const messageTemplatesSchema = z.array(messageTemplateSchema);

export const accountLimitsSchema = z.object({
  phoneCodeMaxAttempts: z.number().int().min(1).max(20),
  phoneCodeResendWaitSeconds: z.number().int().min(10).max(600),
  maxDevicesPerAccount: z.number().int().min(1).max(20),
  selfServiceDeletionEnabled: z.boolean(),
  deletionGraceDays: z.number().int().min(0).max(90),
  minimumAge: z.number().int().min(13).max(21),
});
export type AccountLimits = z.infer<typeof accountLimitsSchema>;

export const dataRetentionSchema = z.object({
  deliveryPhotosDays: z.number().int().min(1),
  chatDays: z.number().int().min(1),
  gpsTrailDays: z.number().int().min(1),
  receiptsDays: z.number().int().min(1),
  exportRoles: z.array(z.string()),
  dataRequestEmail: z.string(),
});
export type DataRetention = z.infer<typeof dataRetentionSchema>;

export const courierComplianceSchema = z.object({
  remindDaysBeforeExpiry: z.number().int().min(1).max(90),
  autoPauseOnExpiry: z.boolean(),
  reVerifyIdMonths: z.number().int().min(1).max(60),
});
export type CourierCompliance = z.infer<typeof courierComplianceSchema>;

export const partnerDevicesSchema = z.object({
  alertSound: z.string(),
  alertRepeatSeconds: z.number().int().min(0).max(120),
  tabletStayAwake: z.boolean(),
  autoPrintOnAccept: z.boolean(),
  printerPaperWidthMm: z.number().int().min(40).max(120),
});
export type PartnerDevices = z.infer<typeof partnerDevicesSchema>;

export const rolloutSchema = z.object({
  mode: z.enum(['off', 'beta_list', 'percent', 'on']),
  percent: z.number().int().min(0).max(100),
  betaUserIds: z.array(z.string()),
});
export type Rollout = z.infer<typeof rolloutSchema>;

export const integrationStatusSchema = z.object({
  payments: z.enum(['connected', 'failing', 'unknown']),
  sms: z.enum(['connected', 'failing', 'unknown']),
  maps: z.enum(['connected', 'failing', 'unknown']),
  push: z.enum(['connected', 'failing', 'unknown']),
  lastSuccessAt: z.string().nullable(),
  maskedKeyHint: z.string(),
});
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const settingsExportImportSchema = z.object({
  exportEnabled: z.boolean(),
  importEnabled: z.boolean(),
});
export type SettingsExportImport = z.infer<typeof settingsExportImportSchema>;

/** Common edit-role sets. */
export const ROLES = {
  sharedEdit: ['platform_owner', 'superadmin', 'dash_admin'] as string[],
  sharedViewPlusCourier: ['platform_owner', 'superadmin', 'dash_admin', 'courier_admin'] as string[],
  ownerOnly: ['platform_owner', 'superadmin'] as string[],
  courierEdit: ['platform_owner', 'superadmin', 'dash_admin', 'courier_admin'] as string[],
  killSwitch: ['platform_owner', 'superadmin'] as string[],
} as const;
