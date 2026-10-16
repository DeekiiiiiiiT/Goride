import { z } from 'zod';
import {
  ROLES,
  accountLimitsSchema,
  busyModeSchema,
  courierComplianceSchema,
  dataRetentionSchema,
  defineSetting,
  holidayCalendarSchema,
  integrationStatusSchema,
  messageTemplatesSchema,
  notificationChannelsSchema,
  partnerDevicesSchema,
  platformServiceHoursSchema,
  rolloutSchema,
  settingsExportImportSchema,
  type SettingDef,
} from '../defineSetting';

const APP_CONFIG = 'supabase/functions/delivery/appConfigRoutes.ts';
const GET_SETTING = 'supabase/functions/_shared/rushSettings/getSetting.ts';
const ENTERPRISE_READERS = 'supabase/functions/_shared/rushSettings/enterpriseReaders.ts';
const CUSTOMER_ORDERS = 'supabase/functions/delivery/customerOrderRoutes.ts';
const CUSTOMER_ACCOUNT = 'supabase/functions/delivery/customerAccountRoutes.ts';
const CUSTOMER_APP = 'apps/dash-customer/src/App.tsx';
const COURIER_APP = 'apps/dash-courier/src/App.tsx';
const PARTNER_APP = 'apps/dash-merchant/src/App.tsx';
const DOCUMENTS_PAGE = 'apps/dash-courier/src/pages/onboarding/DocumentsPage.tsx';
const COURIER_ROUTES = 'supabase/functions/delivery/courierConsumerRoutes.ts';
const SMS = 'supabase/functions/_shared/dashOrderSms.ts';
const EVIDENCE = 'supabase/functions/evidence-cleanup/index.ts';
const ORDER_CHAT_RETENTION = 'supabase/functions/order-chat-retention/index.ts';
const SETTINGS_ADMIN = 'supabase/functions/delivery/admin/settingsRoutes.ts';

const openDay = { open: '07:00', close: '23:00', closed: false };
const DEFAULT_HOURS = {
  monday: { ...openDay },
  tuesday: { ...openDay },
  wednesday: { ...openDay },
  thursday: { ...openDay },
  friday: { ...openDay },
  saturday: { ...openDay },
  sunday: { ...openDay },
  outsideHoursMessage: 'Roam Rush is closed right now. Please try again during service hours.',
};

const idleBusy = {
  active: false,
  extraEtaMinutes: 0,
  pauseNewRestaurants: false,
  bannerMessage: "We're busier than usual — times may be longer.",
  autoEndAt: null as string | null,
};

export const ENTERPRISE_SETTINGS: SettingDef[] = [
  // ── Operating hours & holidays ────────────────────────────────────────────
  defineSetting({
    key: 'enterprise.hours.service',
    app: 'platform',
    section: 'Hours & holidays',
    label: 'Platform service hours',
    help: 'Platform calendar for when customers may place orders (separate from each store’s hours).',
    kind: 'object',
    zodSchema: platformServiceHoursSchema,
    default: DEFAULT_HOURS,
    scopes: ['platform', 'market'],
    clientVisible: true,
    risk: 'normal',
    editRoles: ROLES.sharedEdit,
    readers: [ENTERPRISE_READERS, APP_CONFIG, CUSTOMER_ORDERS, GET_SETTING, CUSTOMER_APP],
  }),
  defineSetting({
    key: 'enterprise.hours.holidays',
    app: 'platform',
    section: 'Hours & holidays',
    label: 'Public holiday calendar',
    help: 'Closed / reduced / normal overrides for public holidays, with an optional message.',
    kind: 'object',
    zodSchema: holidayCalendarSchema,
    default: [],
    scopes: ['platform', 'market'],
    clientVisible: true,
    risk: 'normal',
    editRoles: ROLES.sharedEdit,
    readers: [ENTERPRISE_READERS, APP_CONFIG, CUSTOMER_ORDERS, GET_SETTING, CUSTOMER_APP],
  }),

  // ── Busy mode ─────────────────────────────────────────────────────────────
  defineSetting({
    key: 'enterprise.busy_mode',
    app: 'platform',
    section: 'Busy mode',
    label: 'Busy mode',
    help: 'Lengthen ETAs, pause new restaurants, show a busy banner; optional auto-end time.',
    kind: 'object',
    zodSchema: busyModeSchema,
    default: idleBusy,
    scopes: ['platform', 'market'],
    clientVisible: true,
    risk: 'high',
    editRoles: ROLES.sharedEdit,
    readers: [ENTERPRISE_READERS, APP_CONFIG, CUSTOMER_ORDERS, GET_SETTING, CUSTOMER_APP],
    onReadError: 'safe',
  }),

  // ── Notifications & messages ──────────────────────────────────────────────
  defineSetting({
    key: 'enterprise.notifications.channels',
    app: 'platform',
    section: 'Notifications',
    label: 'Event notification channels',
    help: 'Which channels (SMS / push / email) fire for each order lifecycle event.',
    kind: 'object',
    zodSchema: notificationChannelsSchema,
    default: {
      orderPlaced: ['push'],
      orderAccepted: ['push'],
      courierAssigned: ['push', 'sms'],
      outForDelivery: ['push'],
      delivered: ['push'],
      cancelled: ['push', 'sms'],
    },
    scopes: ['platform'],
    clientVisible: false,
    risk: 'normal',
    editRoles: ROLES.sharedEdit,
    readers: [SMS, GET_SETTING],
  }),
  defineSetting({
    key: 'enterprise.notifications.sender_name',
    app: 'platform',
    section: 'Notifications',
    label: 'SMS / push sender name',
    help: 'Display name used on outbound customer messages.',
    kind: 'string',
    zodSchema: z.string().min(1).max(40),
    default: 'Roam Rush',
    scopes: ['platform'],
    clientVisible: false,
    risk: 'normal',
    editRoles: ROLES.sharedEdit,
    readers: [SMS, GET_SETTING],
  }),
  defineSetting({
    key: 'enterprise.notifications.templates',
    app: 'platform',
    section: 'Notifications',
    label: 'Message templates',
    help: 'Editable templates with variables like {order_number} and {eta}.',
    kind: 'object',
    zodSchema: messageTemplatesSchema,
    default: [
      {
        key: 'order_placed',
        channel: 'push' as const,
        body: 'Order {order_number} received. We will update you soon.',
      },
      {
        key: 'courier_assigned',
        channel: 'sms' as const,
        body: 'A courier is on the way for order {order_number}. ETA {eta}.',
      },
      {
        key: 'delivered',
        channel: 'push' as const,
        body: 'Order {order_number} was delivered. Enjoy!',
      },
    ],
    scopes: ['platform'],
    clientVisible: false,
    risk: 'normal',
    editRoles: ROLES.sharedEdit,
    readers: [SMS, GET_SETTING],
  }),

  // ── Customer accounts ─────────────────────────────────────────────────────
  defineSetting({
    key: 'enterprise.accounts.limits',
    app: 'platform',
    section: 'Accounts & privacy',
    label: 'Customer account limits',
    help: 'Phone-code limits, max devices, self-service deletion, grace days, and minimum age.',
    kind: 'object',
    zodSchema: accountLimitsSchema,
    default: {
      phoneCodeMaxAttempts: 5,
      phoneCodeResendWaitSeconds: 60,
      maxDevicesPerAccount: 5,
      selfServiceDeletionEnabled: true,
      deletionGraceDays: 14,
      minimumAge: 18,
    },
    scopes: ['platform'],
    clientVisible: true,
    risk: 'high',
    editRoles: ROLES.sharedEdit,
    readers: [APP_CONFIG, CUSTOMER_ACCOUNT, CUSTOMER_APP, GET_SETTING],
  }),

  // ── Privacy & data retention ──────────────────────────────────────────────
  defineSetting({
    key: 'enterprise.privacy.retention',
    app: 'platform',
    section: 'Accounts & privacy',
    label: 'Data retention',
    help: 'How long to keep delivery photos, chat, GPS trails and receipts; who may export; contact email.',
    kind: 'object',
    zodSchema: dataRetentionSchema,
    default: {
      deliveryPhotosDays: 90,
      chatDays: 365,
      gpsTrailDays: 30,
      receiptsDays: 2555,
      exportRoles: ['platform_owner', 'superadmin', 'dash_admin'],
      dataRequestEmail: 'help@roamrush.app',
    },
    scopes: ['platform'],
    clientVisible: false,
    risk: 'locked',
    editRoles: ROLES.ownerOnly,
    readers: [EVIDENCE, ORDER_CHAT_RETENTION, CUSTOMER_ACCOUNT, GET_SETTING],
  }),

  // ── Courier compliance cadence ────────────────────────────────────────────
  defineSetting({
    key: 'enterprise.courier.compliance',
    app: 'courier',
    section: 'Sign-up & documents',
    label: 'Document compliance cadence',
    help: 'Remind before expiry, auto-pause on expiry, and re-verify ID every N months.',
    kind: 'object',
    zodSchema: courierComplianceSchema,
    default: {
      remindDaysBeforeExpiry: 14,
      autoPauseOnExpiry: true,
      reVerifyIdMonths: 12,
    },
    scopes: ['platform'],
    clientVisible: true,
    risk: 'high',
    editRoles: ROLES.courierEdit,
    readers: [APP_CONFIG, COURIER_ROUTES, DOCUMENTS_PAGE, COURIER_APP, GET_SETTING],
  }),

  // ── Partner devices ───────────────────────────────────────────────────────
  defineSetting({
    key: 'enterprise.partner.devices',
    app: 'partner',
    section: 'Orders',
    label: 'Partner device defaults',
    help: 'Order alert sound/repeat, tablet stay-awake, auto-print, printer paper width. Stores may override.',
    kind: 'object',
    zodSchema: partnerDevicesSchema,
    default: {
      alertSound: 'default',
      alertRepeatSeconds: 15,
      tabletStayAwake: true,
      autoPrintOnAccept: false,
      printerPaperWidthMm: 80,
    },
    scopes: ['platform'],
    clientVisible: true,
    risk: 'normal',
    editRoles: ROLES.sharedEdit,
    readers: [APP_CONFIG, PARTNER_APP],
  }),

  // ── Gradual rollouts ──────────────────────────────────────────────────────
  defineSetting({
    key: 'enterprise.rollouts.customer',
    app: 'platform',
    section: 'Rollouts',
    label: 'Customer feature rollout',
    help: 'Off / beta list / percent / on for client features in the customer app.',
    kind: 'object',
    zodSchema: rolloutSchema,
    default: { mode: 'on' as const, percent: 100, betaUserIds: [] as string[] },
    scopes: ['platform', 'market'],
    clientVisible: true,
    risk: 'high',
    editRoles: ROLES.sharedEdit,
    readers: [ENTERPRISE_READERS, APP_CONFIG, CUSTOMER_APP, GET_SETTING],
  }),
  defineSetting({
    key: 'enterprise.rollouts.courier',
    app: 'platform',
    section: 'Rollouts',
    label: 'Courier feature rollout',
    help: 'Off / beta list / percent / on for client features in the courier app.',
    kind: 'object',
    zodSchema: rolloutSchema,
    default: { mode: 'on' as const, percent: 100, betaUserIds: [] as string[] },
    scopes: ['platform', 'market'],
    clientVisible: true,
    risk: 'high',
    editRoles: ROLES.courierEdit,
    readers: [ENTERPRISE_READERS, APP_CONFIG, COURIER_APP, GET_SETTING],
  }),
  defineSetting({
    key: 'enterprise.rollouts.partner',
    app: 'platform',
    section: 'Rollouts',
    label: 'Partner feature rollout',
    help: 'Off / beta list / percent / on for client features in the partner app.',
    kind: 'object',
    zodSchema: rolloutSchema,
    default: { mode: 'on' as const, percent: 100, betaUserIds: [] as string[] },
    scopes: ['platform', 'market'],
    clientVisible: true,
    risk: 'high',
    editRoles: ROLES.sharedEdit,
    readers: [ENTERPRISE_READERS, APP_CONFIG, PARTNER_APP, GET_SETTING],
  }),

  // ── Integrations (read-only status placeholder) ───────────────────────────
  defineSetting({
    key: 'enterprise.integrations.status',
    app: 'platform',
    section: 'Integrations',
    label: 'Integration health (read-only)',
    help: 'Payments, SMS, maps and push status. Secrets stay in Supabase — never stored here.',
    kind: 'object',
    zodSchema: integrationStatusSchema,
    default: {
      payments: 'unknown' as const,
      sms: 'unknown' as const,
      maps: 'unknown' as const,
      push: 'unknown' as const,
      lastSuccessAt: null,
      maskedKeyHint: '',
    },
    scopes: ['platform'],
    clientVisible: false,
    risk: 'locked',
    editRoles: ROLES.ownerOnly,
    readers: [SETTINGS_ADMIN, GET_SETTING],
  }),

  // ── Settings export / import placeholders ─────────────────────────────────
  defineSetting({
    key: 'enterprise.settings.export_import',
    app: 'platform',
    section: 'Integrations',
    label: 'Settings export / import',
    help: 'Export/import switch — locked SQL-only. High-risk import keys always go to Approvals.',
    kind: 'object',
    zodSchema: settingsExportImportSchema,
    default: { exportEnabled: false, importEnabled: false },
    scopes: ['platform'],
    clientVisible: false,
    risk: 'locked',
    editRoles: ROLES.ownerOnly,
    readers: [SETTINGS_ADMIN],
  }),
];
