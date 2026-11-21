/** Fleet Policy → Tolls (UI2): the read (public.toll_v2_toll_settings) and the plain-word helpers. */
import { fmtTollMinor } from '../tollV2Format';

export type TollBearer = 'fleet' | 'driver';

export type TollPlatformSettings = {
  platform: string;
  paybackMode: string;
  paysTollsBack: boolean;
  takesDisputes: boolean;
  autoApply?: boolean;
  disputeWindowDays: number | null;
  refundPeriods?: number | null;
  noReportFallbackDays?: number | null;
  coverageSourceId?: string | null;
};

export type TollRate = { amountMinor: number | null; validFrom: string | null };

export type TollPlazaSettings = {
  plazaId: string;
  name: string | null;
  tagPrice: { current: TollRate; history: TollRate[] };
  platformRates: Array<{ platform: string; current: TollRate; history: TollRate[] }>;
};

export type TollMissing = { kind: string; platform?: string; plaza_id?: string };

export type TollSettingsRead = {
  switches: { tollDisputes?: boolean; loggedTrips?: boolean; riderPaysDriver?: boolean } | null;
  disputePolicy: { lostBearer: TollBearer; expiredBearer: TollBearer } | null;
  platforms: TollPlatformSettings[];
  plazas: TollPlazaSettings[];
  missing: TollMissing[];
  /** approve_settings_seed ran (rollout step 2): the Tolls tab shows from then on. */
  seeded?: boolean;
  approvals: { soleManager: boolean; thresholdMinor: number };
};

export const PLATFORM_NAME: Record<string, string> = { uber: 'Uber', indrive: 'InDrive', roam: 'Roam' };
export const platformName = (p: string) => PLATFORM_NAME[p] ?? p;

/** "How" choices, in plain words (payback_mode values). */
export const PAYBACK_MODES: Array<{ value: string; label: string }> = [
  { value: 'per_trip', label: 'On each trip' },
  { value: 'adjustments', label: 'In weekly adjustments' },
  { value: 'rider_pays_driver', label: 'The rider pays the driver' },
  { value: 'native', label: 'Roam charges the rider' },
  { value: 'none', label: 'Not paid back' },
];

export type PlatformDraft = Pick<TollPlatformSettings, 'paybackMode' | 'paysTollsBack' | 'takesDisputes' | 'disputeWindowDays'>;
export type TollPolicyDraft = {
  lostBearer: TollBearer;
  expiredBearer: TollBearer;
  platforms: Record<string, PlatformDraft>;
};

export function draftFrom(s: TollSettingsRead): TollPolicyDraft {
  const platforms: Record<string, PlatformDraft> = {};
  for (const p of s.platforms) {
    platforms[p.platform] = {
      paybackMode: p.paybackMode,
      paysTollsBack: p.paysTollsBack,
      takesDisputes: p.takesDisputes,
      disputeWindowDays: p.disputeWindowDays,
    };
  }
  return {
    lostBearer: s.disputePolicy?.lostBearer ?? 'fleet',
    expiredBearer: s.disputePolicy?.expiredBearer ?? 'driver',
    platforms,
  };
}

const FIELD_KEY: Record<keyof PlatformDraft, string> = {
  paybackMode: 'payback_mode',
  paysTollsBack: 'pays_tolls_back',
  takesDisputes: 'takes_disputes',
  disputeWindowDays: 'dispute_window_days',
};

const bearerWord = (b: TollBearer) => (b === 'fleet' ? 'The fleet' : 'The driver');
const yesNo = (v: boolean) => (v ? 'Yes' : 'No');
const modeWord = (m: string) => PAYBACK_MODES.find((x) => x.value === m)?.label ?? m;

export type PolicyChange = { label: string; from: string; to: string };

/** What changed between the saved settings and the draft, in plain words, plus the change_toll_settings body. */
export function diffPolicy(saved: TollPolicyDraft, draft: TollPolicyDraft): {
  changes: PolicyChange[];
  body: { dispute_policy?: Record<string, string>; platform_settings?: Record<string, Record<string, unknown>> };
} {
  const changes: PolicyChange[] = [];
  const body: { dispute_policy?: Record<string, string>; platform_settings?: Record<string, Record<string, unknown>> } = {};
  if (draft.lostBearer !== saved.lostBearer) {
    changes.push({ label: 'When a dispute is lost, who pays', from: bearerWord(saved.lostBearer), to: bearerWord(draft.lostBearer) });
    body.dispute_policy = { ...body.dispute_policy, lost_bearer: draft.lostBearer };
  }
  if (draft.expiredBearer !== saved.expiredBearer) {
    changes.push({
      label: "When the driver doesn't send it in time, who pays",
      from: bearerWord(saved.expiredBearer),
      to: bearerWord(draft.expiredBearer),
    });
    body.dispute_policy = { ...body.dispute_policy, expired_bearer: draft.expiredBearer };
  }
  for (const [plat, d] of Object.entries(draft.platforms)) {
    const s = saved.platforms[plat];
    if (!s) continue;
    for (const k of Object.keys(FIELD_KEY) as Array<keyof PlatformDraft>) {
      if (d[k] === s[k]) continue;
      const name = platformName(plat);
      const label =
        k === 'paybackMode' ? `${name}: how tolls are paid back`
        : k === 'paysTollsBack' ? `${name}: pays tolls back`
        : k === 'takesDisputes' ? `${name}: takes disputes`
        : `${name}: days to dispute`;
      const show = (v: unknown) =>
        k === 'paybackMode' ? modeWord(String(v)) : typeof v === 'boolean' ? yesNo(v) : v == null ? '—' : String(v);
      changes.push({ label, from: show(s[k]), to: show(d[k]) });
      body.platform_settings = body.platform_settings ?? {};
      body.platform_settings[plat] = { ...body.platform_settings[plat], [FIELD_KEY[k]]: d[k] };
    }
  }
  return { changes, body };
}

/** The server's missing list (the same one the matcher refuses on), in plain words. */
export function missingLine(m: TollMissing, plazaName: (id: string) => string): string {
  if (m.kind === 'dispute_policy') return 'Who pays a lost or late dispute is not set yet. Choose it below and save.';
  if (m.kind === 'platform_settings') return `${platformName(m.platform ?? '')} has no toll rules yet. Set them below and save.`;
  if (m.kind === 'plaza_rules') return `${plazaName(m.plaza_id ?? '')} has no toll price rules yet. Ask Roam support to add it.`;
  if (m.kind === 'coverage_source') return `${platformName(m.platform ?? '')}: which report shows covered trips is not set. Ask Roam support.`;
  return 'A toll setting is missing. Ask Roam support.';
}

/** A platform that takes disputes needs a current rate for each plaza; none → a red "Missing" chip. */
export function rateCell(plaza: TollPlazaSettings, platform: string): { text: string; missing: boolean } {
  const r = plaza.platformRates.find((x) => x.platform === platform);
  if (r?.current?.amountMinor != null) return { text: fmtTollMinor(r.current.amountMinor), missing: false };
  return { text: '—', missing: true };
}

/** "from 1 Nov 2026" */
export function sinceText(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(`${d}T12:00:00Z`);
  if (Number.isNaN(dt.getTime())) return '—';
  return `from ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(dt)}`;
}

/** J$ text box → minor units; null when it isn't a positive amount with at most 2 decimals. */
export function parseJmd(text: string): number | null {
  const t = text.replace(/[J$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const minor = Math.round(Number(t) * 100);
  return minor > 0 ? minor : null;
}
