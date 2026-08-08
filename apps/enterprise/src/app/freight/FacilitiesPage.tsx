import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, X } from 'lucide-react';
import {
  useCreateFacility,
  useDeleteFacility,
  useFacilities,
  useIntakeWarehouses,
  useUpdateFacility,
} from '@/app/hooks/useFreight';

const TYPE_LABEL: Record<string, string> = {
  miami_warehouse: 'US intake warehouse',
  ja_hub: 'Jamaica hub',
  branch: 'Branch / pickup',
};

type FacilityType = 'miami_warehouse' | 'ja_hub' | 'branch';

const TABS: { id: FacilityType; label: string }[] = [
  { id: 'miami_warehouse', label: 'US Intake Warehouse' },
  { id: 'ja_hub', label: 'Jamaica Hub' },
  { id: 'branch', label: 'Branch / Pickup' },
];

type FormState = {
  name: string;
  code: string;
  addressLine: string;
  city: string;
  countryCode: string;
};

type FacilityRow = Record<string, unknown>;

function emptyForm(type: FacilityType): FormState {
  if (type === 'miami_warehouse') {
    return { name: '', code: '', addressLine: '', city: '', countryCode: 'US' };
  }
  if (type === 'ja_hub') {
    return {
      name: 'Jamaica Hub',
      code: 'KIN-HUB',
      addressLine: '',
      city: 'Kingston',
      countryCode: 'JM',
    };
  }
  return {
    name: 'Branch / Pickup',
    code: 'KIN-BR',
    addressLine: '',
    city: 'Kingston',
    countryCode: 'JM',
  };
}

function rowToForm(row: FacilityRow): FormState {
  const type = String(row.facility_type) as FacilityType;
  return {
    name: String(row.name || ''),
    code: String(row.code || ''),
    addressLine: String(row.address_line || ''),
    city: String(row.city || ''),
    countryCode: String(row.country_code || (type === 'miami_warehouse' ? 'US' : 'JM')),
  };
}

function FacilityFields({
  facilityType,
  form,
  setForm,
  catalogId,
  setCatalogId,
  warehouses,
  catalogLoading,
  selectedCatalog,
  requireIdentity,
}: {
  facilityType: FacilityType;
  form: FormState;
  setForm: (updater: (f: FormState) => FormState) => void;
  catalogId: string;
  setCatalogId: (id: string) => void;
  warehouses: FacilityRow[];
  catalogLoading: boolean;
  selectedCatalog?: FacilityRow;
  requireIdentity: boolean;
}) {
  if (facilityType === 'miami_warehouse') {
    return (
      <>
        <label className="block text-sm sm:col-span-2">
          Master lease holder
          <select
            required
            value={catalogId}
            onChange={(e) => setCatalogId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            disabled={catalogLoading}
          >
            <option value="">
              {catalogLoading ? 'Loading terminals…' : 'Select Florida terminal…'}
            </option>
            {warehouses.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {String(w.name)} — {String(w.city)}, {String(w.state)}
              </option>
            ))}
          </select>
        </label>
        {selectedCatalog && (
          <div className="sm:col-span-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-medium">{String(selectedCatalog.name)}</p>
            <p>
              {String(selectedCatalog.address_line)}
              <br />
              {String(selectedCatalog.city)}, {String(selectedCatalog.state)}{' '}
              {String(selectedCatalog.postal_code)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Your customers ship to this terminal; packages are sorted by suite code (e.g.
              BSHPD10859).
            </p>
          </div>
        )}
        <label className="block text-sm">
          Org facility code {requireIdentity ? '' : '(optional)'}
          <input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            required={requireIdentity}
            placeholder={
              selectedCatalog
                ? `${String(selectedCatalog.code).slice(0, 20)}-INTAKE`
                : 'CS-INTAKE'
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase"
          />
        </label>
        <label className="block text-sm">
          Display name {requireIdentity ? '' : '(optional)'}
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required={requireIdentity}
            placeholder={
              selectedCatalog ? String(selectedCatalog.name) : 'Complete Sourcing USA'
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </>
    );
  }

  return (
    <>
      <label className="block text-sm">
        Name
        <input
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Code
        <input
          required
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase"
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        Street address
        <input
          value={form.addressLine}
          onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        City
        <input
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Country code
        <input
          maxLength={2}
          value={form.countryCode}
          onChange={(e) =>
            setForm((f) => ({ ...f, countryCode: e.target.value.toUpperCase() }))
          }
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 uppercase"
        />
      </label>
    </>
  );
}

/**
 * Warehouse / hub / branch setup — Day-1 before Suites or Receive.
 * US intake must pick a Dominion master lease holder (catalog-only).
 */
export function FacilitiesPage() {
  const { data, isLoading, error } = useFacilities();
  const catalog = useIntakeWarehouses();
  const create = useCreateFacility();
  const update = useUpdateFacility();
  const remove = useDeleteFacility();

  const [formError, setFormError] = useState<string | null>(null);
  const [facilityType, setFacilityType] = useState<FacilityType>('miami_warehouse');
  const [catalogId, setCatalogId] = useState('');
  const [form, setForm] = useState<FormState>(() => emptyForm('miami_warehouse'));

  const [editRow, setEditRow] = useState<FacilityRow | null>(null);
  const [editCatalogId, setEditCatalogId] = useState('');
  const [editForm, setEditForm] = useState<FormState>(() => emptyForm('miami_warehouse'));
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteRow, setDeleteRow] = useState<FacilityRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rows = useMemo(() => data?.facilities ?? [], [data?.facilities]);
  const warehouses = useMemo(
    () => (catalog.data?.warehouses ?? []) as FacilityRow[],
    [catalog.data?.warehouses],
  );
  const selectedCatalog = warehouses.find((w) => String(w.id) === catalogId);
  const editSelectedCatalog = warehouses.find((w) => String(w.id) === editCatalogId);
  const saving = create.isPending || update.isPending || remove.isPending;

  const hasIntake = rows.some((f) => String(f.facility_type) === 'miami_warehouse');
  const hasHub = rows.some((f) => String(f.facility_type) === 'ja_hub');

  useEffect(() => {
    if (!editRow && !deleteRow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditRow(null);
        setDeleteRow(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editRow, deleteRow]);

  function switchTab(next: FacilityType) {
    setFacilityType(next);
    setCatalogId('');
    setForm(emptyForm(next));
    setFormError(null);
  }

  function openEdit(row: FacilityRow) {
    setDeleteRow(null);
    setEditRow(row);
    setEditCatalogId(row.intake_catalog_id ? String(row.intake_catalog_id) : '');
    setEditForm(rowToForm(row));
    setEditError(null);
  }

  function openDelete(row: FacilityRow) {
    setEditRow(null);
    setDeleteRow(row);
    setDeleteError(null);
  }

  async function buildBody(
    type: FacilityType,
    state: FormState,
    selectedCatalogId: string,
  ): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }> {
    if (type === 'miami_warehouse') {
      if (!selectedCatalogId) {
        return { ok: false, error: 'Select a master lease holder (US intake terminal).' };
      }
      return {
        ok: true,
        body: {
          facilityType: 'miami_warehouse',
          intakeCatalogId: selectedCatalogId,
          code: state.code.trim() || undefined,
          name: state.name.trim() || undefined,
        },
      };
    }
    const name = state.name.trim();
    const code = state.code.trim();
    if (!name || !code) return { ok: false, error: 'Name and code are required.' };
    return {
      ok: true,
      body: {
        name,
        code,
        facilityType: type,
        addressLine: state.addressLine.trim() || null,
        city: state.city.trim() || null,
        countryCode: state.countryCode.trim() || undefined,
      },
    };
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const built = await buildBody(facilityType, form, catalogId);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    try {
      await create.mutateAsync(built.body);
      setCatalogId('');
      setForm(emptyForm(facilityType));
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function onSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editRow) return;
    setEditError(null);
    const type = String(editRow.facility_type) as FacilityType;
    const built = await buildBody(type, editForm, editCatalogId);
    if (!built.ok) {
      setEditError(built.error);
      return;
    }
    try {
      await update.mutateAsync({ id: String(editRow.id), body: built.body });
      setEditRow(null);
    } catch (err) {
      setEditError((err as Error).message);
    }
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(String(deleteRow.id));
      setDeleteRow(null);
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Facilities</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick your US intake terminal from Roam’s master lease-holder list, then add your Jamaica hub
          and pickup branches. Required before Receive or Hub Station.
        </p>
      </div>

      {(!hasIntake || !hasHub) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {!hasIntake ? (
            <p>
              <span className="font-semibold">Next:</span> select your US master lease holder (e.g.
              Complete Sourcing USA in Hallandale).
            </p>
          ) : (
            <p>
              <span className="font-semibold">Next:</span> add your Jamaica hub so inbound cargo can
              be scanned after customs.
            </p>
          )}
        </div>
      )}

      {hasIntake && hasHub && (
        <p className="text-sm text-emerald-800">
          Intake + hub on file.{' '}
          <Link className="font-medium underline" to="/app/suites">
            Import suites / customers →
          </Link>
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">City</th>
              <th className="px-4 py-2">Address</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={String(f.id)} className="border-b border-slate-50">
                <td className="px-4 py-2 font-medium">{String(f.name)}</td>
                <td className="px-4 py-2 font-mono text-xs">{String(f.code)}</td>
                <td className="px-4 py-2">
                  {TYPE_LABEL[String(f.facility_type)] || String(f.facility_type)}
                </td>
                <td className="px-4 py-2">{String(f.city || '—')}</td>
                <td className="px-4 py-2 text-slate-600">{String(f.address_line || '—')}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      title="Edit"
                      onClick={() => openEdit(f)}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => openDelete(f)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && !rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No facilities yet — add your US intake warehouse below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex border-b border-slate-200">
          {TABS.map((tab) => {
            const active = facilityType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={
                  active
                    ? 'flex-1 border-b-2 border-amber-500 px-3 py-3 text-sm font-semibold text-slate-900'
                    : 'flex-1 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-500 hover:text-slate-800'
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={onCreate} className="space-y-3 p-6">
          <h2 className="text-sm font-semibold text-slate-900">
            Add {TYPE_LABEL[facilityType] || 'facility'}
          </h2>
          <p className="text-sm text-slate-500">
            {facilityType === 'miami_warehouse'
              ? 'Florida terminal used on the Receive screen. Add more than one if you use multiple US terminals.'
              : facilityType === 'ja_hub'
                ? 'Used on Hub Station — inbound scan after customs, then sort to branch pickup or door delivery.'
                : 'Pickup location customers collect from (Fulfillment → branch pickup).'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FacilityFields
              facilityType={facilityType}
              form={form}
              setForm={setForm}
              catalogId={catalogId}
              setCatalogId={setCatalogId}
              warehouses={warehouses}
              catalogLoading={catalog.isLoading}
              selectedCatalog={selectedCatalog}
              requireIdentity={false}
            />
          </div>
          {catalog.error && facilityType === 'miami_warehouse' && (
            <p className="text-sm text-red-600">{(catalog.error as Error).message}</p>
          )}
          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {create.isPending
              ? 'Saving…'
              : facilityType === 'miami_warehouse'
                ? 'Save US Intake Warehouse'
                : facilityType === 'ja_hub'
                  ? 'Save Jamaica Hub'
                  : 'Save Branch / Pickup'}
          </button>
        </form>
      </div>

      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setEditRow(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-facility-title"
            className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 id="edit-facility-title" className="text-base font-semibold text-slate-900">
                  Edit {TYPE_LABEL[String(editRow.facility_type)] || 'facility'}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">{String(editRow.name)}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSaveEdit} className="space-y-3 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FacilityFields
                  facilityType={String(editRow.facility_type) as FacilityType}
                  form={editForm}
                  setForm={setEditForm}
                  catalogId={editCatalogId}
                  setCatalogId={setEditCatalogId}
                  warehouses={warehouses}
                  catalogLoading={catalog.isLoading}
                  selectedCatalog={editSelectedCatalog}
                  requireIdentity
                />
              </div>
              {editError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {editError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditRow(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={update.isPending}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
                >
                  {update.isPending ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDeleteRow(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-facility-title"
            className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <h2 id="delete-facility-title" className="text-base font-semibold text-slate-900">
                Delete facility?
              </h2>
              <button
                type="button"
                onClick={() => setDeleteRow(null)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-slate-600">
                Remove <span className="font-semibold text-slate-900">{String(deleteRow.name)}</span>
                {deleteRow.code ? (
                  <>
                    {' '}
                    (<span className="font-mono text-xs">{String(deleteRow.code)}</span>)
                  </>
                ) : null}
                ? This cannot be undone.
              </p>
              {deleteError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {deleteError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteRow(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => void confirmDelete()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {remove.isPending ? 'Deleting…' : 'Delete facility'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
