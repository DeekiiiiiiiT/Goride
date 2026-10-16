/**
 * Edge mirror of @roam/rush-settings catalog (no Zod).
 * Keep in sync with packages/rush-settings — regenerate:
 *   npx tsx scripts/_dump-rush-settings-mirror.mjs
 *   node scripts/generate-rush-settings-registry.mjs
 */

export type SettingValueKind =
  | "boolean"
  | "number"
  | "string"
  | "string[]"
  | "number[]"
  | "object"
  | "enum";

export type SettingScope = "platform" | "market";
export type SettingRisk = "normal" | "high" | "locked";
export type OnReadError = "default" | "safe";
export type SettingApp = "platform" | "customer" | "courier" | "partner";

export type EdgeSettingDef = {
  default: unknown;
  kind: SettingValueKind;
  clientVisible: boolean;
  envOverride?: string;
  onReadError: OnReadError;
  scopes: SettingScope[];
  risk: SettingRisk;
  app: SettingApp;
  section: string;
  editRoles: string[];
  enumValues?: readonly string[];
  min?: number;
  max?: number;
  hidden?: boolean;
};

export const REGISTRY: Record<string, EdgeSettingDef> = {
  "platform.brand.name.customer": {"default":"Roam Rush","kind":"string","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.brand.name.courier": {"default":"Roam Rush Courier","kind":"string","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.brand.name.partner": {"default":"Roam Partner","kind":"string","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.support.customer": {"default":{"phone":"","whatsapp":"","email":"help@roamrush.app","hours":"8am–10pm"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.support.courier": {"default":{"phone":"","whatsapp":"","email":"couriers@roamrush.app","hours":"8am–10pm"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "platform.support.partner": {"default":{"phone":"","whatsapp":"","email":"partners@roamrush.app","hours":"8am–10pm"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.legal.terms.customer": {"default":"https://roamrush.app/terms","kind":"string","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.legal.privacy.customer": {"default":"https://roamrush.app/privacy","kind":"string","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.legal.terms.courier": {"default":"https://roamrush.app/terms","kind":"string","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "platform.legal.privacy.courier": {"default":"https://roamrush.app/privacy","kind":"string","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "platform.legal.terms.partner": {"default":"https://roamrush.app/terms","kind":"string","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.legal.privacy.partner": {"default":"https://roamrush.app/privacy","kind":"string","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.maintenance.customer": {"default":{"active":false,"message":"","until":null},"kind":"object","clientVisible":true,"onReadError":"safe","scopes":["platform"],"risk":"high","app":"platform","section":"Maintenance","editRoles":["platform_owner","superadmin"]},
  "platform.maintenance.courier": {"default":{"active":false,"message":"","until":null},"kind":"object","clientVisible":true,"onReadError":"safe","scopes":["platform"],"risk":"high","app":"platform","section":"Maintenance","editRoles":["platform_owner","superadmin"]},
  "platform.maintenance.partner": {"default":{"active":false,"message":"","until":null},"kind":"object","clientVisible":true,"onReadError":"safe","scopes":["platform"],"risk":"high","app":"platform","section":"Maintenance","editRoles":["platform_owner","superadmin"]},
  "platform.announcement.customer": {"default":[],"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"platform","section":"Announcements","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.announcement.courier": {"default":[],"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"platform","section":"Announcements","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "platform.announcement.partner": {"default":[],"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"platform","section":"Announcements","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.app_version.customer.android": {"default":{"minVersion":"0.0.0","recommendedVersion":"0.1.0"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin"]},
  "platform.app_version.customer.ios": {"default":{"minVersion":"0.0.0","recommendedVersion":"0.1.0"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin"]},
  "platform.app_version.customer.web": {"default":{"minVersion":"0.0.0","recommendedVersion":"0.1.0"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin"]},
  "platform.app_version.courier.android": {"default":{"minVersion":"0.0.0","recommendedVersion":"0.1.0"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin"]},
  "platform.app_version.courier.ios": {"default":{"minVersion":"0.0.0","recommendedVersion":"0.1.0"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin"]},
  "platform.app_version.courier.web": {"default":{"minVersion":"0.0.0","recommendedVersion":"0.1.0"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin"]},
  "platform.app_version.partner.android": {"default":{"minVersion":"0.0.0","recommendedVersion":"0.1.0"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin"]},
  "platform.app_version.partner.ios": {"default":{"minVersion":"0.0.0","recommendedVersion":"0.1.0"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin"]},
  "platform.app_version.partner.web": {"default":{"minVersion":"0.0.0","recommendedVersion":"0.1.0"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin"]},
  "platform.store_links.customer": {"default":{"playStore":"","appStore":""},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.store_links.courier": {"default":{"playStore":"","appStore":""},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "platform.store_links.partner": {"default":{"playStore":"","appStore":""},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"App versions","editRoles":["platform_owner","superadmin","dash_admin"]},
  "platform.locale": {"default":{"currency":"JMD","timeZone":"America/Jamaica"},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"locked","app":"platform","section":"Contacts & legal","editRoles":["platform_owner","superadmin"]},
  "platform.staff_security": {"default":{"sessionTimeoutMinutes":0,"mfaRequiredRoles":["platform_owner","dash_admin","courier_admin","identity_admin","superadmin"]},"kind":"object","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"locked","app":"platform","section":"Staff security","editRoles":["platform_owner","superadmin"],"hidden":true},
  "platform.notifications.quiet_hours": {"default":{"start":"21:00","end":"08:00"},"kind":"object","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Notifications","editRoles":["platform_owner","superadmin","dash_admin"]},
  "customer.ordering.enabled": {"default":true,"kind":"boolean","clientVisible":true,"onReadError":"safe","scopes":["platform","market"],"risk":"high","app":"customer","section":"Ordering","editRoles":["platform_owner","superadmin"],"envOverride":"DELIVERY_CUSTOMER_ORDERS_ENABLED"},
  "customer.payment.cash_on_delivery": {"default":false,"kind":"boolean","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"high","app":"customer","section":"Payments","editRoles":["platform_owner","superadmin"],"envOverride":"DASH_ALLOW_CASH_ORDERS"},
  "customer.payment.card": {"default":true,"kind":"boolean","clientVisible":true,"onReadError":"safe","scopes":["platform"],"risk":"high","app":"customer","section":"Payments","editRoles":["platform_owner","superadmin"],"envOverride":"PAYMENTS_INTENTS_ENABLED"},
  "customer.payment.wallet": {"default":true,"kind":"boolean","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"customer","section":"Payments","editRoles":["platform_owner","superadmin"]},
  "customer.ordering.scheduled": {"default":{"enabled":false,"maxDaysAhead":7},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"customer","section":"Ordering","editRoles":["platform_owner","superadmin","dash_admin"]},
  "customer.ordering.pickup": {"default":true,"kind":"boolean","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"customer","section":"Ordering","editRoles":["platform_owner","superadmin","dash_admin"],"hidden":true},
  "customer.ordering.cancel_window_seconds": {"default":60,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"customer","section":"Ordering","editRoles":["platform_owner","superadmin","dash_admin"],"min":0,"max":3600},
  "customer.tips.presets_jmd": {"default":[50,100,150,200],"kind":"number[]","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"customer","section":"Tips, issues, refunds","editRoles":["platform_owner","superadmin","dash_admin"]},
  "customer.tips.default_index": {"default":-1,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"customer","section":"Tips, issues, refunds","editRoles":["platform_owner","superadmin","dash_admin"]},
  "customer.issues.report_window_hours": {"default":24,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"customer","section":"Tips, issues, refunds","editRoles":["platform_owner","superadmin","dash_admin"],"min":1,"max":168},
  "customer.refunds.auto_resolution": {"default":true,"kind":"boolean","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"customer","section":"Tips, issues, refunds","editRoles":["platform_owner","superadmin"],"envOverride":"RUSH_AUTO_DISPUTE_RESOLUTION"},
  "customer.refunds.auto_max_jmd": {"default":4000,"kind":"number","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"customer","section":"Tips, issues, refunds","editRoles":["platform_owner","superadmin"],"envOverride":"DASH_AUTO_DISPUTE_MAX_REFUND_JMD"},
  "customer.ratings.window_hours": {"default":72,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"customer","section":"Tips, issues, refunds","editRoles":["platform_owner","superadmin","dash_admin"],"min":1,"max":720},
  "customer.in_house.enabled": {"default":false,"kind":"boolean","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"customer","section":"Ordering","editRoles":["platform_owner","superadmin"],"envOverride":"IN_HOUSE_ENABLED"},
  "money.device_linking": {"default":true,"kind":"boolean","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"Kill switches","editRoles":["platform_owner","superadmin"]},
  "money.payout_export": {"default":true,"kind":"boolean","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"Kill switches","editRoles":["platform_owner","superadmin"]},
  "money.risk_controls": {"default":true,"kind":"boolean","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"Kill switches","editRoles":["platform_owner","superadmin"]},
  "courier.signup.mode": {"default":"open","kind":"enum","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"courier","section":"Sign-up & documents","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"],"enumValues":["open","invite_or_fleet","closed"]},
  "courier.signup.vehicle_types": {"default":["bicycle","motorcycle","car"],"kind":"string[]","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"courier","section":"Sign-up & documents","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "courier.signup.required_documents": {"default":[{"name":"Driver's licence","docType":"drivers_license","sides":"single","expiryRequired":true,"required":true,"vehicleTypes":["bicycle","motorcycle","car"]},{"name":"Vehicle insurance","docType":"insurance","sides":"single","expiryRequired":true,"required":true,"vehicleTypes":["motorcycle","car"]},{"name":"Background check","docType":"background_check","sides":"single","expiryRequired":false,"required":false,"vehicleTypes":["bicycle","motorcycle","car"]}],"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"courier","section":"Sign-up & documents","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "courier.signup.min_age": {"default":18,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"courier","section":"Sign-up & documents","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"],"min":16,"max":25,"hidden":true},
  "courier.dispatch.radius_km": {"default":12,"kind":"number","clientVisible":false,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"courier","section":"Dispatch","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"],"envOverride":"COURIER_DISPATCH_RADIUS_KM"},
  "courier.dispatch.offer_ttl_seconds": {"default":90,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"courier","section":"Dispatch","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"],"envOverride":"COURIER_DISPATCH_OFFER_TTL_MS"},
  "courier.dispatch.max_offers": {"default":15,"kind":"number","clientVisible":false,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"courier","section":"Dispatch","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"],"envOverride":"COURIER_DISPATCH_MAX_OFFERS"},
  "courier.dispatch.h3_matching": {"default":true,"kind":"boolean","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"courier","section":"Dispatch","editRoles":["platform_owner","superadmin"],"envOverride":"RUSH_H3_DISPATCH_ENABLED"},
  "courier.delivery.photo_proof": {"default":false,"kind":"boolean","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"courier","section":"Delivery rules","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "courier.delivery.pin_required_over_jmd": {"default":0,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"courier","section":"Delivery rules","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"],"min":0,"max":500000,"hidden":true},
  "courier.delivery.wait_grace_minutes": {"default":10,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"courier","section":"Delivery rules","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"],"min":0,"max":60,"hidden":true},
  "courier.cash.remittance_enabled": {"default":true,"kind":"boolean","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"courier","section":"Delivery rules","editRoles":["platform_owner","superadmin"],"envOverride":"DELIVERY_REMITTANCE_OFF"},
  "partner.signup.mode": {"default":"open","kind":"enum","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"partner","section":"Sign-up","editRoles":["platform_owner","superadmin","dash_admin"],"enumValues":["open","invite_only","closed"]},
  "partner.signup.require_approval": {"default":true,"kind":"boolean","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"partner","section":"Sign-up","editRoles":["platform_owner","superadmin","dash_admin"]},
  "partner.orders.accept_deadline_seconds": {"default":270,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"partner","section":"Orders","editRoles":["platform_owner","superadmin","dash_admin"],"min":30,"max":900},
  "partner.orders.auto_reject_after_deadline": {"default":false,"kind":"boolean","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"high","app":"partner","section":"Orders","editRoles":["platform_owner","superadmin","dash_admin"]},
  "partner.orders.stuck_alert_minutes": {"default":45,"kind":"number","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"partner","section":"Orders","editRoles":["platform_owner","superadmin","dash_admin"],"envOverride":"DASH_STUCK_ORDER_MINUTES"},
  "partner.menu.price_change_review_pct": {"default":25,"kind":"number","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"partner","section":"Orders","editRoles":["platform_owner","superadmin","dash_admin"],"min":0,"max":100,"hidden":true},
  "partner.performance.min_orders_for_warning": {"default":5,"kind":"number","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"partner","section":"Orders","editRoles":["platform_owner","superadmin","dash_admin"],"min":1,"max":100},
  "enterprise.hours.service": {"default":{"monday":{"open":"07:00","close":"23:00","closed":false},"tuesday":{"open":"07:00","close":"23:00","closed":false},"wednesday":{"open":"07:00","close":"23:00","closed":false},"thursday":{"open":"07:00","close":"23:00","closed":false},"friday":{"open":"07:00","close":"23:00","closed":false},"saturday":{"open":"07:00","close":"23:00","closed":false},"sunday":{"open":"07:00","close":"23:00","closed":false},"outsideHoursMessage":"Roam Rush is closed right now. Please try again during service hours."},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"platform","section":"Hours & holidays","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.hours.holidays": {"default":[],"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"normal","app":"platform","section":"Hours & holidays","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.busy_mode": {"default":{"active":false,"extraEtaMinutes":0,"pauseNewRestaurants":false,"bannerMessage":"We're busier than usual — times may be longer.","autoEndAt":null},"kind":"object","clientVisible":true,"onReadError":"safe","scopes":["platform","market"],"risk":"high","app":"platform","section":"Busy mode","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.notifications.channels": {"default":{"orderPlaced":["push"],"orderAccepted":["push"],"courierAssigned":["push","sms"],"outForDelivery":["push"],"delivered":["push"],"cancelled":["push","sms"]},"kind":"object","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Notifications","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.notifications.sender_name": {"default":"Roam Rush","kind":"string","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Notifications","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.notifications.templates": {"default":[{"key":"order_placed","channel":"push","body":"Order {order_number} received. We will update you soon."},{"key":"courier_assigned","channel":"sms","body":"A courier is on the way for order {order_number}. ETA {eta}."},{"key":"delivered","channel":"push","body":"Order {order_number} was delivered. Enjoy!"}],"kind":"object","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"platform","section":"Notifications","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.accounts.limits": {"default":{"phoneCodeMaxAttempts":5,"phoneCodeResendWaitSeconds":60,"maxDevicesPerAccount":5,"selfServiceDeletionEnabled":true,"deletionGraceDays":14,"minimumAge":18},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"platform","section":"Accounts & privacy","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.privacy.retention": {"default":{"deliveryPhotosDays":90,"chatDays":365,"gpsTrailDays":30,"receiptsDays":2555,"exportRoles":["platform_owner","superadmin","dash_admin"],"dataRequestEmail":"help@roamrush.app"},"kind":"object","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"locked","app":"platform","section":"Accounts & privacy","editRoles":["platform_owner","superadmin"]},
  "enterprise.courier.compliance": {"default":{"remindDaysBeforeExpiry":14,"autoPauseOnExpiry":true,"reVerifyIdMonths":12},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"high","app":"courier","section":"Sign-up & documents","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "enterprise.partner.devices": {"default":{"alertSound":"default","alertRepeatSeconds":15,"tabletStayAwake":true,"autoPrintOnAccept":false,"printerPaperWidthMm":80},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform"],"risk":"normal","app":"partner","section":"Orders","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.rollouts.customer": {"default":{"mode":"on","percent":100,"betaUserIds":[]},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"high","app":"platform","section":"Rollouts","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.rollouts.courier": {"default":{"mode":"on","percent":100,"betaUserIds":[]},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"high","app":"platform","section":"Rollouts","editRoles":["platform_owner","superadmin","dash_admin","courier_admin"]},
  "enterprise.rollouts.partner": {"default":{"mode":"on","percent":100,"betaUserIds":[]},"kind":"object","clientVisible":true,"onReadError":"default","scopes":["platform","market"],"risk":"high","app":"platform","section":"Rollouts","editRoles":["platform_owner","superadmin","dash_admin"]},
  "enterprise.integrations.status": {"default":{"payments":"unknown","sms":"unknown","maps":"unknown","push":"unknown","lastSuccessAt":null,"maskedKeyHint":""},"kind":"object","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"locked","app":"platform","section":"Integrations","editRoles":["platform_owner","superadmin"]},
  "enterprise.settings.export_import": {"default":{"exportEnabled":false,"importEnabled":false},"kind":"object","clientVisible":false,"onReadError":"default","scopes":["platform"],"risk":"locked","app":"platform","section":"Integrations","editRoles":["platform_owner","superadmin"]},
};

export const REGISTRY_KEYS = Object.keys(REGISTRY);

export function getRegistryEntry(key: string): EdgeSettingDef | undefined {
  return REGISTRY[key];
}

export function clientVisibleEntries(): Array<{ key: string; def: EdgeSettingDef }> {
  return REGISTRY_KEYS
    .filter((k) => REGISTRY[k].clientVisible)
    .map((key) => ({ key, def: REGISTRY[key] }));
}
