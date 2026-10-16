import { compareVersions } from './compareVersions';
import { builtInDefaults } from './defaults';
import type {
  AnnouncementItem,
  AppConfigPlatform,
  AppConfigResponse,
  AppConfigSource,
  CourierRequiredDocument,
  LegalLinksValue,
  LocaleValue,
  MaintenanceState,
  ResolvedAppConfig,
  RushAppId,
  SupportContactValue,
  UpdateState,
} from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readMaintenance(raw: unknown, fallback: MaintenanceState): MaintenanceState {
  if (!isRecord(raw)) return fallback;
  return {
    active: asBool(raw.active, fallback.active),
    message: asString(raw.message, fallback.message),
    until: raw.until === null ? null : asString(raw.until, fallback.until ?? '') || null,
  };
}

function readSupport(raw: unknown, fallback: SupportContactValue): SupportContactValue {
  if (!isRecord(raw)) return fallback;
  return {
    phone: asString(raw.phone, fallback.phone),
    whatsapp: asString(raw.whatsapp, fallback.whatsapp),
    email: asString(raw.email, fallback.email),
    hours: asString(raw.hours, fallback.hours),
  };
}

function readAnnouncements(raw: unknown): AnnouncementItem[] {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out: AnnouncementItem[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const message = asString(item.message);
    if (!id || !message) continue;
    const type = item.type === 'warning' || item.type === 'critical' ? item.type : 'info';
    const startAt = item.startAt === null || item.startAt === undefined ? null : asString(item.startAt);
    const endAt = item.endAt === null || item.endAt === undefined ? null : asString(item.endAt);
    if (startAt) {
      const t = Date.parse(startAt);
      if (Number.isFinite(t) && t > now) continue;
    }
    if (endAt) {
      const t = Date.parse(endAt);
      if (Number.isFinite(t) && t < now) continue;
    }
    out.push({
      id,
      type,
      message,
      dismissible: asBool(item.dismissible, true),
      startAt,
      endAt,
    });
  }
  return out;
}

function readDocuments(raw: unknown, fallback: CourierRequiredDocument[]): CourierRequiredDocument[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const out: CourierRequiredDocument[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = asString(item.name);
    const docType = asString(item.docType);
    if (!name || !docType) continue;
    const sides =
      item.sides === 'front' || item.sides === 'front_and_back' || item.sides === 'single'
        ? item.sides
        : 'single';
    const vehicleTypes = Array.isArray(item.vehicleTypes)
      ? item.vehicleTypes.filter(
          (v): v is 'bicycle' | 'motorcycle' | 'car' =>
            v === 'bicycle' || v === 'motorcycle' || v === 'car',
        )
      : (['bicycle', 'motorcycle', 'car'] as const);
    out.push({
      name,
      docType,
      sides,
      expiryRequired: asBool(item.expiryRequired, false),
      required: asBool(item.required, true),
      vehicleTypes: [...vehicleTypes],
    });
  }
  return out.length > 0 ? out : fallback;
}

function storeUrlFor(
  links: unknown,
  platform: AppConfigPlatform,
): string {
  if (!isRecord(links)) return '';
  if (platform === 'ios') return asString(links.appStore);
  if (platform === 'android') return asString(links.playStore);
  return asString(links.playStore) || asString(links.appStore);
}

function tipPresets(raw: unknown, fallback: number[]): number[] {
  if (!Array.isArray(raw)) return fallback;
  const nums = raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return nums.length > 0 ? nums : fallback;
}

/**
 * Turn raw app-config settings bag into UI-ready resolved config.
 * Keys match rush-settings clientVisible registry entries.
 */
export function deriveResolvedConfig(
  app: RushAppId,
  response: AppConfigResponse | null,
  opts: {
    appVersion: string;
    platform: AppConfigPlatform;
    source: AppConfigSource;
  },
): ResolvedAppConfig {
  const base = builtInDefaults(app);
  const settings = response?.settings ?? {};
  const get = (key: string) => settings[key];

  const maintenance = readMaintenance(get(`platform.maintenance.${app}`), base.maintenance);
  const support = readSupport(get(`platform.support.${app}`), base.support);
  const announcements = readAnnouncements(get(`platform.announcement.${app}`));

  const versionGateRaw = get(`platform.app_version.${app}.${opts.platform}`);
  const minVersion = isRecord(versionGateRaw)
    ? asString(versionGateRaw.minVersion, base.update.minVersion)
    : base.update.minVersion;
  const recommendedVersion = isRecord(versionGateRaw)
    ? asString(versionGateRaw.recommendedVersion, base.update.recommendedVersion)
    : base.update.recommendedVersion;

  const storeLinks = get(`platform.store_links.${app}`);
  const storeUrl = storeUrlFor(storeLinks, opts.platform);

  const update: UpdateState = {
    required: compareVersions(opts.appVersion, minVersion) < 0,
    recommended: compareVersions(opts.appVersion, recommendedVersion) < 0,
    storeUrl,
    minVersion,
    recommendedVersion,
  };

  const legal: LegalLinksValue = {
    terms: asString(get(`platform.legal.terms.${app}`), base.legal.terms),
    privacy: asString(get(`platform.legal.privacy.${app}`), base.legal.privacy),
  };

  const brandName = asString(get(`platform.brand.name.${app}`), base.brandName);

  const localeRaw = get('platform.locale');
  const locale: LocaleValue = isRecord(localeRaw)
    ? {
      currency: asString(localeRaw.currency, base.locale.currency),
      timeZone: asString(localeRaw.timeZone, base.locale.timeZone),
    }
    : { ...base.locale };

  return {
    version: response?.version ?? base.version,
    app,
    marketId: response?.marketId ?? null,
    settings,
    maintenance,
    update,
    announcements,
    support,
    legal,
    brandName,
    locale,
    rules: {
      tipPresetsJmd: tipPresets(get('customer.tips.presets_jmd'), base.rules.tipPresetsJmd),
      tipDefaultIndex: asNumber(get('customer.tips.default_index'), base.rules.tipDefaultIndex),
      acceptDeadlineSeconds: asNumber(
        get('partner.orders.accept_deadline_seconds'),
        base.rules.acceptDeadlineSeconds,
      ),
      offerTtlSeconds: asNumber(
        get('courier.dispatch.offer_ttl_seconds'),
        base.rules.offerTtlSeconds,
      ),
      requiredDocuments: readDocuments(
        get('courier.signup.required_documents'),
        base.rules.requiredDocuments,
      ),
    },
    source: opts.source,
  };
}
