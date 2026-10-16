/** Matches GET /delivery/app-config response from appConfigRoutes.ts */
export type RushAppId = 'customer' | 'courier' | 'partner';

export type AppConfigPlatform = 'android' | 'ios' | 'web';

export type AppConfigResponse = {
  version: string | number;
  app: RushAppId;
  marketId: string | null;
  settings: Record<string, unknown>;
};

export type MaintenanceState = {
  active: boolean;
  message: string;
  until: string | null;
};

export type UpdateState = {
  required: boolean;
  recommended: boolean;
  storeUrl: string;
  minVersion: string;
  recommendedVersion: string;
};

export type AnnouncementItem = {
  id: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  dismissible: boolean;
  startAt: string | null;
  endAt: string | null;
};

export type SupportContactValue = {
  phone: string;
  whatsapp: string;
  email: string;
  hours: string;
};

export type LegalLinksValue = {
  terms: string;
  privacy: string;
};

export type LocaleValue = {
  currency: string;
  timeZone: string;
};

export type CourierRequiredDocument = {
  name: string;
  docType: string;
  sides: 'front' | 'front_and_back' | 'single';
  expiryRequired: boolean;
  required: boolean;
  vehicleTypes: Array<'bicycle' | 'motorcycle' | 'car'>;
};

/** Convenient rules derived from client-visible settings keys. */
export type AppConfigRules = {
  tipPresetsJmd: number[];
  tipDefaultIndex: number;
  acceptDeadlineSeconds: number;
  offerTtlSeconds: number;
  requiredDocuments: CourierRequiredDocument[];
};

export type AppConfigSource = 'network' | 'cache' | 'defaults';

export type ResolvedAppConfig = {
  version: string | number;
  app: RushAppId;
  marketId: string | null;
  settings: Record<string, unknown>;
  maintenance: MaintenanceState;
  update: UpdateState;
  announcements: AnnouncementItem[];
  support: SupportContactValue;
  legal: LegalLinksValue;
  brandName: string;
  locale: LocaleValue;
  rules: AppConfigRules;
  source: AppConfigSource;
};
