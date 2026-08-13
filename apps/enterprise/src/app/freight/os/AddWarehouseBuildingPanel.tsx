import { FormEvent, useMemo, useState } from 'react';
import {
  useIntakeClaims,
  useIntakeWarehouses,
  useSubmitIntakeClaim,
} from '@/app/hooks/useFreight';

type CatalogRow = {
  id: string;
  name: string;
  code: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  timezone: string;
  available?: boolean;
};

type AddressDraft = {
  name: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
};

const emptyDraft = (): AddressDraft => ({
  name: '',
  addressLine: '',
  city: '',
  state: '',
  postalCode: '',
  countryCode: 'US',
});

function fromCatalog(w: CatalogRow): AddressDraft {
  return {
    name: String(w.name || ''),
    addressLine: String(w.address_line || ''),
    city: String(w.city || ''),
    state: String(w.state || ''),
    postalCode: String(w.postal_code || ''),
    countryCode: String(w.country_code || 'US').toUpperCase(),
  };
}

function isDirty(draft: AddressDraft, listed: CatalogRow) {
  const orig = fromCatalog(listed);
  return (
    draft.name.trim() !== orig.name.trim() ||
    draft.addressLine.trim() !== orig.addressLine.trim() ||
    draft.city.trim() !== orig.city.trim() ||
    draft.state.trim() !== orig.state.trim() ||
    draft.postalCode.trim() !== orig.postalCode.trim() ||
    draft.countryCode.trim().toUpperCase() !== orig.countryCode.trim().toUpperCase()
  );
}

function AddressFields({
  value,
  onChange,
}: {
  value: AddressDraft;
  onChange: (patch: Partial<AddressDraft>) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-800">
        Company name
        <input
          required
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
        />
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Street
        <input
          required
          value={value.addressLine}
          onChange={(e) => onChange({ addressLine: e.target.value })}
          className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800">
          City
          <input
            required
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
            className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Region / state
          <input
            value={value.state}
            onChange={(e) => onChange({ state: e.target.value })}
            className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Postal code
          <input
            required
            value={value.postalCode}
            onChange={(e) => onChange({ postalCode: e.target.value })}
            className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Country
          <select
            required
            value={value.countryCode}
            onChange={(e) => onChange({ countryCode: e.target.value })}
            className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
          >
            <option value="US">United States</option>
            <option value="CN">China</option>
            <option value="JM">Jamaica</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/** Join application: listed company, correction, or new company — all wait for Roam review. */
export function AddWarehouseBuildingPanel({
  onSubmitted,
}: {
  onSubmitted?: () => void;
}) {
  const catalog = useIntakeWarehouses();
  const claims = useIntakeClaims();
  const submit = useSubmitIntakeClaim();
  const [path, setPath] = useState<'choose' | 'listed' | 'manual'>('choose');
  const [catalogId, setCatalogId] = useState('');
  const [draft, setDraft] = useState<AddressDraft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);

  const warehouses = useMemo(
    () => (catalog.data?.warehouses ?? []) as CatalogRow[],
    [catalog.data?.warehouses],
  );
  const selected = warehouses.find((w) => String(w.id) === catalogId);
  const pending = (claims.data?.requests ?? []).find(
    (r) => String(r.status) === 'pending',
  ) as Record<string, unknown> | undefined;
  const rejected = (claims.data?.requests ?? []).find(
    (r) => String(r.status) === 'rejected',
  ) as Record<string, unknown> | undefined;

  function pickListed(id: string) {
    const row = warehouses.find((w) => String(w.id) === id);
    if (row && row.available === false) {
      setCatalogId('');
      setDraft(emptyDraft());
      setError('That freight forwarder is already claimed. Pick another, or add yours.');
      return;
    }
    setCatalogId(id);
    setDraft(row ? fromCatalog(row) : emptyDraft());
    setError(null);
  }

  async function submitClaim(kind: 'join' | 'claim_edit' | 'new_listing') {
    setError(null);
    if (!draft.name.trim() || !draft.addressLine.trim() || !draft.city.trim() || !draft.postalCode.trim()) {
      setError('Fill in company name and full warehouse address.');
      return;
    }
    if ((kind === 'join' || kind === 'claim_edit') && !catalogId) {
      setError('Pick the company you operate.');
      return;
    }
    try {
      await submit.mutateAsync({
        kind,
        catalogId: kind === 'new_listing' ? undefined : catalogId,
        name: draft.name.trim(),
        addressLine: draft.addressLine.trim(),
        city: draft.city.trim(),
        state: draft.state.trim(),
        postalCode: draft.postalCode.trim(),
        countryCode: draft.countryCode.trim().toUpperCase().slice(0, 2),
      });
      setPath('choose');
      onSubmitted?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onListedSubmit(e: FormEvent) {
    e.preventDefault();
    if (selected && isDirty(draft, selected)) {
      await submitClaim('claim_edit');
      return;
    }
    await submitClaim('join');
  }

  async function onManualSubmit(e: FormEvent) {
    e.preventDefault();
    await submitClaim('new_listing');
  }

  if (claims.isLoading) {
    return <p className="text-sm text-slate-500">Checking setup…</p>;
  }

  if (pending) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
        <span className="mx-auto flex h-2 w-2 rounded-full bg-amber-400" aria-hidden />
        <p className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
          {String(pending.proposed_name)}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {String(pending.proposed_address_line)}, {String(pending.proposed_city)}
        </p>
        <p className="mt-5 text-sm text-slate-600">We’ll approve you shortly.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6">
      {rejected ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Your last request was declined
          {rejected.review_note ? `: ${String(rejected.review_note)}` : '.'} You can submit again.
        </p>
      ) : null}

      {path === 'choose' ? (
        <>
          <p className="text-sm font-semibold text-slate-900">Which warehouse do you operate?</p>
          <p className="mt-1 text-sm text-slate-500">
            Pick your company from the list. Roam reviews every join before you can scan.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setPath('listed');
                setError(null);
              }}
              className="min-h-11 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Select from the list
            </button>
            <button
              type="button"
              onClick={() => {
                setPath('manual');
                setDraft(emptyDraft());
                setCatalogId('');
                setError(null);
              }}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              I don’t see my freight forwarder
            </button>
          </div>
        </>
      ) : null}

      {path === 'listed' ? (
        <form onSubmit={(e) => void onListedSubmit(e)} className="space-y-4">
          <p className="text-sm font-semibold text-slate-900">Confirm your company</p>
          <label className="block text-sm font-medium text-slate-800">
            Company
            <select
              required
              value={catalogId}
              onChange={(e) => pickListed(e.target.value)}
              disabled={catalog.isLoading}
              className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
            >
              <option value="">
                {catalog.isLoading ? 'Loading companies…' : 'Select from the list…'}
              </option>
              {warehouses.map((w) => {
                const taken = w.available === false;
                return (
                  <option key={w.id} value={w.id} disabled={taken}>
                    {w.country_code || '??'} · {w.name} — {w.city}
                    {w.state ? `, ${w.state}` : ''}
                    {taken ? ' (already claimed)' : ''}
                  </option>
                );
              })}
            </select>
          </label>
          {selected ? (
            <>
              <p className="text-xs text-slate-500">
                Confirm this address. If something is wrong, edit it — that also goes to Roam for
                review.
              </p>
              <AddressFields value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
            </>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submit.isPending || !catalogId}
              className="min-h-11 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submit.isPending
                ? 'Submitting…'
                : selected && isDirty(draft, selected)
                  ? 'Submit correction'
                  : 'Request to join'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPath('manual');
                setDraft(emptyDraft());
                setCatalogId('');
                setError(null);
              }}
              className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
            >
              I don’t see my freight forwarder
            </button>
            <button
              type="button"
              onClick={() => {
                setPath('choose');
                setCatalogId('');
                setError(null);
              }}
              className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
            >
              Back
            </button>
          </div>
        </form>
      ) : null}

      {path === 'manual' ? (
        <form onSubmit={(e) => void onManualSubmit(e)} className="space-y-4">
          <p className="text-sm font-semibold text-slate-900">Add your company</p>
          <p className="text-sm text-slate-500">
            Use your warehouse address. Roam adds it to the master list after approval.
          </p>
          <AddressFields value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submit.isPending}
              className="min-h-11 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submit.isPending ? 'Submitting…' : 'Submit for approval'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPath('choose');
                setError(null);
              }}
              className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
            >
              Back
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
