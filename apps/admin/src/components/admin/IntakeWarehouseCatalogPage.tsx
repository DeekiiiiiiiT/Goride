import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus, Warehouse } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_ENDPOINTS } from '../../services/apiConfig';

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
};

type DraftFields = {
  name: string;
  code: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  status: 'active' | 'inactive';
};

const emptyDraft = (): DraftFields => ({
  name: '',
  code: '',
  addressLine: '',
  city: '',
  state: 'FL',
  postalCode: '',
  status: 'active',
});

function toDraft(w: IntakeWarehouse): DraftFields {
  return {
    name: w.name,
    code: w.code,
    addressLine: w.address_line,
    city: w.city,
    state: w.state,
    postalCode: w.postal_code,
    status: w.status,
  };
}

/** Dominion: master Florida lease holders only — Enterprise orgs pick these as US intake. */
export function IntakeWarehouseCatalogPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [rows, setRows] = useState<IntakeWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyDraft());

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token],
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/intake-warehouses`, {
        headers: { Authorization: `Bearer ${token}` },
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
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchDraft(id: string, patch: Partial<DraftFields>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function saveWarehouse(id: string) {
    if (!token) return;
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/intake-warehouses/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({
          name: d.name,
          code: d.code,
          addressLine: d.addressLine,
          city: d.city,
          state: d.state,
          postalCode: d.postalCode,
          status: d.status,
        }),
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

  async function createWarehouse(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSavingId('new');
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/intake-warehouses`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          name: createForm.name,
          code: createForm.code,
          addressLine: createForm.addressLine,
          city: createForm.city,
          state: createForm.state,
          postalCode: createForm.postalCode,
          status: createForm.status,
        }),
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
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-slate-500" />
            US Intake Warehouses
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Master Florida lease holders only. Enterprise customers (e.g. BShip'D) pick one or more of
            these terminals when they set up US intake in their own account.
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
          Add lease holder
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {creating && (
        <form
          onSubmit={createWarehouse}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">New lease holder</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <label className="block text-sm sm:col-span-2 lg:col-span-1">
              Street
              <input
                required
                value={createForm.addressLine}
                onChange={(e) => setCreateForm((f) => ({ ...f, addressLine: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              City
              <input
                required
                value={createForm.city}
                onChange={(e) => setCreateForm((f) => ({ ...f, city: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              State
              <input
                required
                maxLength={2}
                value={createForm.state}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 uppercase"
              />
            </label>
            <label className="block text-sm">
              ZIP
              <input
                required
                value={createForm.postalCode}
                onChange={(e) => setCreateForm((f) => ({ ...f, postalCode: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingId === 'new'}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingId === 'new' ? 'Creating…' : 'Create lease holder'}
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
      )}

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
                <th className="px-4 py-2">Lease holder</th>
                <th className="px-4 py-2">Address</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const open = expandedId === w.id;
                const d = drafts[w.id] || toDraft(w);
                return (
                  <React.Fragment key={w.id}>
                    <tr
                      className="border-b border-slate-50 cursor-pointer hover:bg-slate-50/80"
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
                      <td className="px-4 py-3 text-slate-600">
                        {w.address_line}
                        <br />
                        {w.city}, {w.state} {w.postal_code}
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
                    {open && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={4} className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="max-w-3xl space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Edit lease holder
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
                              <label className="block text-sm sm:col-span-2">
                                Street
                                <input
                                  value={d.addressLine}
                                  onChange={(e) =>
                                    patchDraft(w.id, { addressLine: e.target.value })
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                />
                              </label>
                              <label className="block text-sm">
                                City
                                <input
                                  value={d.city}
                                  onChange={(e) => patchDraft(w.id, { city: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                />
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="block text-sm">
                                  State
                                  <input
                                    maxLength={2}
                                    value={d.state}
                                    onChange={(e) =>
                                      patchDraft(w.id, {
                                        state: e.target.value.toUpperCase(),
                                      })
                                    }
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 uppercase"
                                  />
                                </label>
                                <label className="block text-sm">
                                  ZIP
                                  <input
                                    value={d.postalCode}
                                    onChange={(e) =>
                                      patchDraft(w.id, { postalCode: e.target.value })
                                    }
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                  />
                                </label>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={savingId === w.id}
                              onClick={() => void saveWarehouse(w.id)}
                              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {savingId === w.id ? 'Saving…' : 'Save lease holder'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    No lease holders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
