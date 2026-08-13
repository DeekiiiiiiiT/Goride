import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus } from 'lucide-react';
import { API_ENDPOINTS } from '@roam/api-client';

export type IntakeWarehouse = {
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
};

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

const emptyDraft = (): DraftFields => ({
  name: '',
  code: '',
  addressLine: '',
  city: '',
  state: '',
  postalCode: '',
  countryCode: 'US',
  timezone: 'America/New_York',
  status: 'active',
});

function toDraft(w: IntakeWarehouse): DraftFields {
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
  };
}

function GeoFields({
  value,
  onChange,
}: {
  value: DraftFields;
  onChange: (patch: Partial<DraftFields>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="block text-sm sm:col-span-2 lg:col-span-1">
        Country (ISO)
        <input
          required
          maxLength={2}
          value={value.countryCode}
          onChange={(e) => onChange({ countryCode: e.target.value.toUpperCase() })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 uppercase"
          placeholder="US, CN, JM…"
        />
      </label>
      <label className="block text-sm">
        Timezone
        <select
          required
          value={value.timezone}
          onChange={(e) => onChange({ timezone: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
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
      <label className="block text-sm sm:col-span-2 lg:col-span-3">
        Street
        <input
          required
          value={value.addressLine}
          onChange={(e) => onChange({ addressLine: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        City
        <input
          required
          value={value.city}
          onChange={(e) => onChange({ city: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Region / state
        <input
          value={value.state}
          onChange={(e) => onChange({ state: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="FL, Guangdong…"
        />
      </label>
      <label className="block text-sm">
        Postal code
        <input
          required
          value={value.postalCode}
          onChange={(e) => onChange({ postalCode: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
    </div>
  );
}

/** Master freight-forwarder buildings — customers pick from this list at Setup. */
export function IntakeBuildingsPage({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<IntakeWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyDraft());

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    [accessToken],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/intake-warehouses`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      const list = (json.warehouses as IntakeWarehouse[]) || [];
      setRows(list);
      setDrafts(Object.fromEntries(list.map((w) => [w.id, toDraft(w)])));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

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
    return {
      name: d.name,
      code: d.code,
      addressLine: d.addressLine,
      city: d.city,
      state: d.state,
      postalCode: d.postalCode,
      countryCode: d.countryCode,
      timezone: d.timezone,
      status: d.status,
    };
  }

  async function saveWarehouse(id: string) {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/intake-warehouses/${id}`, {
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
      const res = await fetch(
        `${API_ENDPOINTS.admin}/enterprise-admin/intake-warehouses/${id}/release`,
        { method: 'POST', headers: headers() },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function createWarehouse(e: FormEvent) {
    e.preventDefault();
    setSavingId('new');
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise-admin/intake-warehouses`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(bodyFromDraft(createForm)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setCreating(false);
      setCreateForm(emptyDraft());
      const created = json.warehouse as IntakeWarehouse | undefined;
      await load();
      if (created?.id) setExpandedId(created.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Freight forwarder buildings</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Master company list customers pick from at Setup. Joins, corrections, and new companies
            wait under Join requests. Claimed buildings stay here but are hidden from Setup until
            you make them available again.
          </p>
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
          Add building
        </button>
      </div>

      <label className="block text-sm text-slate-600">
        Country
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All countries</option>
          {countries.map((c) => (
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
          onSubmit={(e) => void createWarehouse(e)}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">New building</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Name
              <input
                required
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Complete Sourcing USA"
              />
            </label>
            <label className="block text-sm">
              Code
              <input
                required
                value={createForm.code}
                onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase"
                placeholder="COMPLETE_SOURCING"
              />
            </label>
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
              {savingId === 'new' ? 'Creating…' : 'Create building'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateForm(emptyDraft());
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
                <th className="px-4 py-2">Building</th>
                <th className="px-4 py-2">Country</th>
                <th className="px-4 py-2">Address</th>
                <th className="px-4 py-2">Claim</th>
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
                        <td colSpan={6} className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="max-w-3xl space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Edit building
                            </h3>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="block text-sm sm:col-span-2">
                                Name
                                <input
                                  value={d.name}
                                  onChange={(e) => patchDraft(w.id, { name: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                />
                              </label>
                              <label className="block text-sm">
                                Code
                                <input
                                  value={d.code}
                                  onChange={(e) => patchDraft(w.id, { code: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase"
                                />
                              </label>
                              <label className="block text-sm">
                                Status
                                <select
                                  value={d.status}
                                  onChange={(e) =>
                                    patchDraft(w.id, {
                                      status: e.target.value as 'active' | 'inactive',
                                    })
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                >
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                                </select>
                              </label>
                            </div>
                            <GeoFields value={d} onChange={(patch) => patchDraft(w.id, patch)} />
                            {w.claimed_by_org_name ? (
                              <p className="text-sm text-slate-600">
                                Hidden on Setup because <span className="font-medium">{w.claimed_by_org_name}</span>{' '}
                                already confirmed this company.
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={savingId === w.id}
                                onClick={() => void saveWarehouse(w.id)}
                                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                              >
                                {savingId === w.id ? 'Saving…' : 'Save building'}
                              </button>
                              {w.claimed_by_org_id ? (
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
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {rows.length ? 'No buildings for this country filter.' : 'No buildings yet.'}
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
