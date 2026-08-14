import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus } from 'lucide-react';
import { API_ENDPOINTS } from '@roam/api-client';

export type IntakeCompany = {
  id: string;
  name: string;
  code: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  timezone: string;
  status: 'active' | 'inactive';
  claimed_by_org_id?: string | null;
  claimed_by_org_name?: string | null;
  linked_courier_catalog_id?: string | null;
  linked_courier_name?: string | null;
};

/** @deprecated Prefer IntakeCompany */
export type IntakeWarehouse = IntakeCompany;

export type IntakeCompanyKind = 'freight_forwarder' | 'courier';

type CourierOption = { id: string; name: string; code: string };

type DraftFields = {
  name: string;
  code: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  timezone: string;
  status: 'active' | 'inactive';
  linkedCourierCatalogId: string;
};

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Jamaica',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Europe/London',
  'UTC',
] as const;

const COUNTRY_OPTIONS = [
  { code: 'JM', label: 'Jamaica' },
  { code: 'US', label: 'United States' },
  { code: 'CN', label: 'China' },
  { code: 'GB', label: 'United Kingdom' },
] as const;

const FIELD =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const FIELD_READONLY =
  'mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono uppercase text-slate-600';

function slugCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function timezoneForCountry(cc: string): string {
  if (cc === 'JM') return 'America/Jamaica';
  if (cc === 'CN') return 'Asia/Shanghai';
  if (cc === 'GB') return 'Europe/London';
  return 'America/New_York';
}

const KIND_COPY: Record<
  IntakeCompanyKind,
  {
    title: string;
    subtitle: string;
    listKey: 'warehouses' | 'couriers';
    itemKey: 'warehouse' | 'courier';
    apiPath: string;
    supportsClaim: boolean;
    namePlaceholder: string;
    codePlaceholder: string;
    defaultCountry: string;
  }
> = {
  freight_forwarder: {
    title: 'Freight forwarder companies',
    subtitle:
      'Master company list customers pick from at Setup. Joins, corrections, and new companies wait under Join requests. Claimed companies stay here but are hidden from Setup until you make them available again. Link each FF to its Jamaica courier when they have one.',
    listKey: 'warehouses',
    itemKey: 'warehouse',
    apiPath: 'intake-warehouses',
    supportsClaim: true,
    namePlaceholder: 'Complete Sourcing USA',
    codePlaceholder: 'COMPLETE_SOURCING',
    defaultCountry: 'US',
  },
  courier: {
    title: 'Courier companies',
    subtitle:
      'Master mailbox courier list for this product. Add companies like BShip’D here so customers and partners can be matched to the right courier.',
    listKey: 'couriers',
    itemKey: 'courier',
    apiPath: 'intake-couriers',
    supportsClaim: false,
    namePlaceholder: "BShip'D Couriers",
    codePlaceholder: 'BSHIPD',
    defaultCountry: 'JM',
  },
};

const emptyDraft = (kind: IntakeCompanyKind = 'freight_forwarder'): DraftFields => {
  const cc = KIND_COPY[kind].defaultCountry;
  return {
    name: '',
    code: '',
    addressLine: '',
    city: '',
    state: '',
    postalCode: '',
    countryCode: cc,
    timezone: timezoneForCountry(cc),
    status: 'active',
    linkedCourierCatalogId: '',
  };
};

function toDraft(w: IntakeCompany): DraftFields {
  return {
    name: w.name,
    code: w.code,
    addressLine: w.address_line,
    city: w.city,
    state: w.state || '',
    postalCode: w.postal_code,
    countryCode: w.country_code || 'US',
    timezone: w.timezone || 'America/New_York',
    status: w.status,
    linkedCourierCatalogId: w.linked_courier_catalog_id || '',
  };
}

function GeoFields({
  value,
  onChange,
}: {
  value: DraftFields;
  onChange: (patch: Partial<DraftFields>) => void;
}) {
  const knownCountry = COUNTRY_OPTIONS.some((c) => c.code === value.countryCode);
  return (
    <div className="grid gap-3 text-slate-900 sm:grid-cols-2 lg:grid-cols-3">
      <label className="block text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-1">
        Country
        <select
          required
          value={value.countryCode}
          onChange={(e) => {
            const countryCode = e.target.value.toUpperCase();
            onChange({ countryCode, timezone: timezoneForCountry(countryCode) });
          }}
          className={FIELD}
        >
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label} ({c.code})
            </option>
          ))}
          {!knownCountry && value.countryCode ? (
            <option value={value.countryCode}>{value.countryCode}</option>
          ) : null}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Timezone
        <select
          required
          value={value.timezone}
          onChange={(e) => onChange({ timezone: e.target.value })}
          className={FIELD}
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
          {!TIMEZONE_OPTIONS.includes(value.timezone as (typeof TIMEZONE_OPTIONS)[number]) &&
            value.timezone && <option value={value.timezone}>{value.timezone}</option>}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
        Street
        <input
          required
          value={value.addressLine}
          onChange={(e) => onChange({ addressLine: e.target.value })}
          className={FIELD}
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        City
        <input
          required
          value={value.city}
          onChange={(e) => onChange({ city: e.target.value })}
          className={FIELD}
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Region / state
        <input
          value={value.state}
          onChange={(e) => onChange({ state: e.target.value })}
          className={FIELD}
          placeholder="Kingston, FL…"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Postal code
        <input
          required
          value={value.postalCode}
          onChange={(e) => onChange({ postalCode: e.target.value })}
          className={FIELD}
        />
      </label>
    </div>
  );
}

/** Master company catalogs — freight-forwarder or courier. */
export function IntakeCompaniesPage({
  accessToken,
  kind,
}: {
  accessToken: string;
  kind: IntakeCompanyKind;
}) {
  const copy = KIND_COPY[kind];
  const [rows, setRows] = useState<IntakeCompany[]>([]);
  const [courierOptions, setCourierOptions] = useState<CourierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(() => emptyDraft(kind));

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    [accessToken],
  );

  const baseUrl = `${API_ENDPOINTS.admin}/enterprise-admin/${copy.apiPath}`;

  const loadCouriers = useCallback(async () => {
    if (kind !== 'freight_forwarder') {
      setCourierOptions([]);
      return;
    }
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/intake-couriers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list = (json.couriers as CourierOption[]) || [];
      setCourierOptions(list.map((c) => ({ id: c.id, name: c.name, code: c.code })));
    } catch {
      /* optional for FF link dropdown */
    }
  }, [accessToken, kind]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      const list = (json[copy.listKey] as IntakeCompany[]) || [];
      setRows(list);
      setDrafts(Object.fromEntries(list.map((w) => [w.id, toDraft(w)])));
      await loadCouriers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, baseUrl, copy.listKey, loadCouriers]);

  useEffect(() => {
    void load();
  }, [load]);

  const countries = useMemo(() => {
    const set = new Set(rows.map((r) => (r.country_code || '').toUpperCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!countryFilter) return rows;
    return rows.filter((r) => (r.country_code || '').toUpperCase() === countryFilter);
  }, [rows, countryFilter]);

  function patchDraft(id: string, patch: Partial<DraftFields>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function bodyFromDraft(d: DraftFields) {
    const body: Record<string, unknown> = {
      name: d.name,
      addressLine: d.addressLine,
      city: d.city,
      state: d.state,
      postalCode: d.postalCode,
      countryCode: d.countryCode,
      timezone: d.timezone,
      status: d.status,
    };
    if (kind === 'freight_forwarder') {
      body.linkedCourierCatalogId = d.linkedCourierCatalogId || null;
    }
    return body;
  }

  async function saveCompany(id: string) {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(bodyFromDraft(d)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function releaseClaim(id: string) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/${id}/release`, {
        method: 'POST',
        headers: headers(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function createCompany(e: FormEvent) {
    e.preventDefault();
    setSavingId('new');
    setError(null);
    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(bodyFromDraft(createForm)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setCreating(false);
      setCreateForm(emptyDraft(kind));
      const created = json[copy.itemKey] as IntakeCompany | undefined;
      await load();
      if (created?.id) setExpandedId(created.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  const colSpan = (copy.supportsClaim ? 6 : 5) + (kind === 'freight_forwarder' ? 1 : 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{copy.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setExpandedId(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Add company
        </button>
      </div>

      <label className="block text-sm text-slate-600">
        Country
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          <option value="">All countries</option>
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label} ({c.code})
            </option>
          ))}
          {countries
            .filter((c) => !COUNTRY_OPTIONS.some((o) => o.code === c))
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
      </label>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {creating ? (
        <form
          onSubmit={(e) => void createCompany(e)}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">New company</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Name
              <input
                required
                value={createForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setCreateForm((f) => ({ ...f, name, code: slugCode(name) }));
                }}
                className={FIELD}
                placeholder={copy.namePlaceholder}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Code
              <input
                readOnly
                value={createForm.code || 'Generated from name'}
                className={FIELD_READONLY}
                aria-readonly="true"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Auto-generated from the company name.
              </span>
            </label>
            {kind === 'freight_forwarder' ? (
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                Linked Jamaica courier
                <select
                  value={createForm.linkedCourierCatalogId}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, linkedCourierCatalogId: e.target.value }))
                  }
                  className={FIELD}
                >
                  <option value="">None</option>
                  {courierOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <GeoFields
            value={createForm}
            onChange={(patch) => setCreateForm((f) => ({ ...f, ...patch }))}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingId === 'new'}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingId === 'new' ? 'Creating…' : 'Create company'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateForm(emptyDraft(kind));
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Country</th>
                <th className="px-4 py-2">Address</th>
                {kind === 'freight_forwarder' ? <th className="px-4 py-2">Courier</th> : null}
                {copy.supportsClaim ? <th className="px-4 py-2">Claim</th> : null}
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => {
                const open = expandedId === w.id;
                const d = drafts[w.id] || toDraft(w);
                return (
                  <Fragment key={w.id}>
                    <tr
                      className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/80"
                      onClick={() => setExpandedId(open ? null : w.id)}
                    >
                      <td className="px-3 py-3 text-slate-400">
                        {open ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{w.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{w.code}</p>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {(w.country_code || '—').toUpperCase()}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {w.address_line}
                        <br />
                        {[w.city, w.state, w.postal_code].filter(Boolean).join(', ')}
                      </td>
                      {kind === 'freight_forwarder' ? (
                        <td className="px-4 py-3 text-slate-700">
                          {w.linked_courier_name || (
                            <span className="text-slate-400">Not linked</span>
                          )}
                        </td>
                      ) : null}
                      {copy.supportsClaim ? (
                        <td className="px-4 py-3">
                          {w.claimed_by_org_name ? (
                            <div>
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                Claimed
                              </span>
                              <p className="mt-1 text-xs text-slate-500">{w.claimed_by_org_name}</p>
                            </div>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              Available
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <span
                          className={
                            w.status === 'active'
                              ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                              : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500'
                          }
                        >
                          {w.status}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td
                          colSpan={colSpan}
                          className="px-4 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="max-w-3xl space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-slate-900">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Edit company
                            </h3>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                                Name
                                <input
                                  value={d.name}
                                  onChange={(e) => patchDraft(w.id, { name: e.target.value })}
                                  className={FIELD}
                                />
                              </label>
                              <label className="block text-sm font-medium text-slate-700">
                                Code
                                <input
                                  readOnly
                                  value={d.code}
                                  className={FIELD_READONLY}
                                  aria-readonly="true"
                                />
                              </label>
                              <label className="block text-sm font-medium text-slate-700">
                                Status
                                <select
                                  value={d.status}
                                  onChange={(e) =>
                                    patchDraft(w.id, {
                                      status: e.target.value as 'active' | 'inactive',
                                    })
                                  }
                                  className={FIELD}
                                >
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                                </select>
                              </label>
                              {kind === 'freight_forwarder' ? (
                                <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                                  Linked Jamaica courier
                                  <select
                                    value={d.linkedCourierCatalogId}
                                    onChange={(e) =>
                                      patchDraft(w.id, { linkedCourierCatalogId: e.target.value })
                                    }
                                    className={FIELD}
                                  >
                                    <option value="">None</option>
                                    {courierOptions.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="mt-1 block text-xs text-slate-500">
                                    Example: Complete Sourcing USA → Complete Sourcing JA.
                                  </span>
                                </label>
                              ) : null}
                            </div>
                            <GeoFields value={d} onChange={(patch) => patchDraft(w.id, patch)} />
                            {copy.supportsClaim && w.claimed_by_org_name ? (
                              <p className="text-sm text-slate-600">
                                Hidden on Setup because{' '}
                                <span className="font-medium">{w.claimed_by_org_name}</span> already
                                confirmed this company.
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={savingId === w.id}
                                onClick={() => void saveCompany(w.id)}
                                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                              >
                                {savingId === w.id ? 'Saving…' : 'Save company'}
                              </button>
                              {copy.supportsClaim && w.claimed_by_org_id ? (
                                <button
                                  type="button"
                                  disabled={savingId === w.id}
                                  onClick={() => void releaseClaim(w.id)}
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                                >
                                  Make available again
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-10 text-center text-slate-500">
                    {rows.length ? 'No companies for this country filter.' : 'No companies yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** @deprecated Prefer IntakeCompaniesPage with kind="freight_forwarder" */
export function IntakeBuildingsPage({ accessToken }: { accessToken: string }) {
  return <IntakeCompaniesPage accessToken={accessToken} kind="freight_forwarder" />;
}
