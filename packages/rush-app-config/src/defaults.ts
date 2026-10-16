import type {
  AnnouncementItem,
  AppConfigRules,
  CourierRequiredDocument,
  LegalLinksValue,
  MaintenanceState,
  ResolvedAppConfig,
  RushAppId,
  SupportContactValue,
} from './types';

const EMPTY_MAINTENANCE: MaintenanceState = {
  active: false,
  message: '',
  until: null,
};

const DEFAULT_DOCS: CourierRequiredDocument[] = [
  {
    name: "Driver's licence",
    docType: 'drivers_license',
    sides: 'single',
    expiryRequired: true,
    required: true,
    vehicleTypes: ['bicycle', 'motorcycle', 'car'],
  },
  {
    name: 'Vehicle insurance',
    docType: 'insurance',
    sides: 'single',
    expiryRequired: true,
    required: true,
    vehicleTypes: ['motorcycle', 'car'],
  },
  {
    name: 'Background check',
    docType: 'background_check',
    sides: 'single',
    expiryRequired: false,
    required: false,
    vehicleTypes: ['bicycle', 'motorcycle', 'car'],
  },
];

const SUPPORT: Record<RushAppId, SupportContactValue> = {
  customer: { phone: '', whatsapp: '', email: 'help@roamrush.app', hours: '8am–10pm' },
  courier: { phone: '', whatsapp: '', email: 'couriers@roamrush.app', hours: '8am–10pm' },
  partner: { phone: '', whatsapp: '', email: 'partners@roamrush.app', hours: '8am–10pm' },
};

const BRAND: Record<RushAppId, string> = {
  customer: 'Roam Rush',
  courier: 'Roam Rush Courier',
  partner: 'Roam Partner',
};

const LEGAL: LegalLinksValue = {
  terms: 'https://roamrush.app/terms',
  privacy: 'https://roamrush.app/privacy',
};

/** Built-in defaults — used when network and localStorage both fail. */
export function builtInDefaults(app: RushAppId): ResolvedAppConfig {
  const rules: AppConfigRules = {
    tipPresetsJmd: [50, 100, 150, 200],
    tipDefaultIndex: -1,
    acceptDeadlineSeconds: 270,
    offerTtlSeconds: 90,
    requiredDocuments: DEFAULT_DOCS,
  };

  return {
    version: 0,
    app,
    marketId: null,
    settings: {},
    maintenance: { ...EMPTY_MAINTENANCE },
    update: {
      required: false,
      recommended: false,
      storeUrl: '',
      minVersion: '0.0.0',
      recommendedVersion: '0.1.0',
    },
    announcements: [] as AnnouncementItem[],
    support: { ...SUPPORT[app] },
    legal: { ...LEGAL },
    brandName: BRAND[app],
    locale: { currency: 'JMD', timeZone: 'America/Jamaica' },
    rules,
    source: 'defaults',
  };
}

export { DEFAULT_DOCS, EMPTY_MAINTENANCE, SUPPORT, BRAND, LEGAL };
