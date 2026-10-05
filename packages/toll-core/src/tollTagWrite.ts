/**
 * Allow-list for toll tag creates and edits.
 * Balance, assignment, history, and org are server-owned and never accepted here.
 */

export const TOLL_TAG_PROVIDERS = ['JRC', 'T-Tag', 'Other'] as const;
export const TOLL_TAG_STATUSES = ['Active', 'Inactive', 'Lost', 'Damaged'] as const;

export type TollTagProvider = (typeof TOLL_TAG_PROVIDERS)[number];
export type TollTagWritableStatus = (typeof TOLL_TAG_STATUSES)[number];

export interface TollTagWriteFields {
  provider: TollTagProvider;
  tagNumber: string;
  status: TollTagWritableStatus;
  dateAdded?: string;
  lowBalanceThreshold?: number;
  notes?: string;
}

export type TollTagWriteResult =
  | { ok: true; fields: TollTagWriteFields }
  | { ok: false; error: string };

const PROVIDERS = new Set<string>(TOLL_TAG_PROVIDERS);
const STATUSES = new Set<string>(TOLL_TAG_STATUSES);

function cleanString(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function readOptionalFields(body: Record<string, unknown>, fields: TollTagWriteFields): string | null {
  if (body.dateAdded != null && body.dateAdded !== '') {
    const dateAdded = cleanString(body.dateAdded, 40);
    if (!dateAdded || Number.isNaN(Date.parse(dateAdded))) return 'dateAdded must be a date';
    fields.dateAdded = dateAdded;
  }
  if (body.lowBalanceThreshold != null && body.lowBalanceThreshold !== '') {
    const n = Number(body.lowBalanceThreshold);
    if (!Number.isFinite(n) || n <= 0) return 'Alert threshold must be greater than zero';
    fields.lowBalanceThreshold = n;
  }
  if (body.notes != null && body.notes !== '') {
    const notes = cleanString(body.notes, 2000);
    if (!notes) return 'Notes are too long';
    fields.notes = notes;
  }
  return null;
}

export function parseTollTagCreate(body: unknown): TollTagWriteResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Tag details are required' };
  }
  const raw = body as Record<string, unknown>;
  const provider = cleanString(raw.provider, 40);
  const tagNumber = cleanString(raw.tagNumber, 64);
  const status = cleanString(raw.status, 40) ?? 'Active';
  if (!provider || !PROVIDERS.has(provider)) return { ok: false, error: 'Choose a provider' };
  if (!tagNumber) return { ok: false, error: 'Tag number is required' };
  if (!STATUSES.has(status)) return { ok: false, error: 'Choose a valid status' };
  const fields: TollTagWriteFields = {
    provider: provider as TollTagProvider,
    tagNumber,
    status: status as TollTagWritableStatus,
  };
  const optionalError = readOptionalFields(raw, fields);
  if (optionalError) return { ok: false, error: optionalError };
  return { ok: true, fields };
}

/** Patch may send any subset. Status Retired is only allowed through retire. */
export function parseTollTagPatch(body: unknown): TollTagWriteResult | { ok: true; fields: Partial<TollTagWriteFields> } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Tag details are required' };
  }
  const raw = body as Record<string, unknown>;
  const fields: Partial<TollTagWriteFields> = {};
  if (raw.provider != null) {
    const provider = cleanString(raw.provider, 40);
    if (!provider || !PROVIDERS.has(provider)) return { ok: false, error: 'Choose a provider' };
    fields.provider = provider as TollTagProvider;
  }
  if (raw.tagNumber != null) {
    const tagNumber = cleanString(raw.tagNumber, 64);
    if (!tagNumber) return { ok: false, error: 'Tag number is required' };
    fields.tagNumber = tagNumber;
  }
  if (raw.status != null) {
    const status = cleanString(raw.status, 40);
    if (!status || !STATUSES.has(status)) return { ok: false, error: 'Choose a valid status' };
    fields.status = status as TollTagWritableStatus;
  }
  const optionalError = readOptionalFields(raw, fields as TollTagWriteFields);
  if (optionalError) return { ok: false, error: optionalError };
  if (Object.keys(fields).length === 0) return { ok: false, error: 'Nothing to update' };
  return { ok: true, fields };
}

export function readConcurrencyToken(body: unknown): { ok: true; token: string } | { ok: false; reason: 'missing_concurrency_token' } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'missing_concurrency_token' };
  const token = (body as { expectedUpdatedAt?: unknown }).expectedUpdatedAt;
  if (typeof token !== 'string' || !token.trim()) return { ok: false, reason: 'missing_concurrency_token' };
  return { ok: true, token: token.trim() };
}

/** Client-supplied id is only honored when it is a new id (restore). Never a takeover key. */
export function readOptionalClientId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const id = (body as { id?: unknown }).id;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!/^[0-9a-f-]{8,64}$/i.test(trimmed)) return null;
  return trimmed;
}
