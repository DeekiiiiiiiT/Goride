import { FormEvent, useMemo, useState } from 'react';
import { useIntakeWarehouses } from '@/app/hooks/useFreight';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import {
  useCreateExternalPartner,
  useInvitePartnerLink,
} from '@/app/hooks/useWarehouseCourierLinks';

type RoleAs = 'warehouse' | 'courier';

type CatalogRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  country_code: string;
  claimed_by_org_id?: string | null;
};

/** Pick from the master list. If they are not in the list, add them by name. */
export function PartnerConnectPanel({
  roleAs,
  onConnected,
}: {
  roleAs: RoleAs;
  onConnected?: () => void;
}) {
  const { organizationId } = useAuth();
  const catalog = useIntakeWarehouses('connect');
  const invite = useInvitePartnerLink();
  const external = useCreateExternalPartner();
  const [catalogId, setCatalogId] = useState('');
  const [notListed, setNotListed] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; business_type?: string }>>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const [extName, setExtName] = useState('');
  const [extEmail, setExtEmail] = useState('');
  const [extPhone, setExtPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const warehouses = useMemo(
    () => (catalog.data?.warehouses ?? []) as CatalogRow[],
    [catalog.data?.warehouses],
  );
  const selected = warehouses.find((w) => String(w.id) === catalogId);
  const busy = invite.isPending || external.isPending;
  const partnerWord = roleAs === 'courier' ? 'freight forwarder' : 'courier';

  async function runSearch() {
    setSearching(true);
    setError(null);
    try {
      const res = await freightService.searchPartnerOrgs(q, organizationId);
      const wanted = roleAs === 'warehouse' ? 'freight_forwarding' : 'warehouse';
      setResults((res.organizations || []).filter((o) => o.business_type === wanted));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function connectCatalog(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) return;
    const orgId = String(selected.claimed_by_org_id || '');
    try {
      if (orgId) {
        await invite.mutateAsync({ counterpartyOrgId: orgId, roleAs });
      } else {
        await external.mutateAsync({ roleAs, name: selected.name });
      }
      onConnected?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addUnlisted(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await external.mutateAsync({
        roleAs,
        name: extName,
        email: extEmail || undefined,
        phone: extPhone || undefined,
      });
      onConnected?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (notListed) {
    return (
      <form onSubmit={(e) => void addUnlisted(e)} className="space-y-3">
        <button
          type="button"
          onClick={() => {
            setNotListed(false);
            setError(null);
          }}
          className="text-sm font-medium text-slate-600 underline"
        >
          Back to the list
        </button>
        <p className="text-sm text-slate-600">Tell us who they are. We’ll add them for you.</p>
        <label className="block text-sm font-medium text-slate-800">
          Company name
          <input
            required
            value={extName}
            onChange={(e) => setExtName(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Contact email
          <input
            type="email"
            value={extEmail}
            onChange={(e) => setExtEmail(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Phone
          <input
            value={extPhone}
            onChange={(e) => setExtPhone(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
          />
        </label>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || extName.trim().length < 2}
          className="min-h-11 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Adding…' : `Add ${partnerWord}`}
        </button>
      </form>
    );
  }

  if (roleAs === 'courier') {
    return (
      <form onSubmit={(e) => void connectCatalog(e)} className="space-y-3">
        <label className="block text-sm font-medium text-slate-800">
          Freight forwarder
          <select
            required
            value={catalogId}
            onChange={(e) => {
              setCatalogId(e.target.value);
              setError(null);
            }}
            disabled={catalog.isLoading}
            className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
          >
            <option value="">{catalog.isLoading ? 'Loading…' : 'Select from the list…'}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.country_code || '??'} · {w.name} — {w.city}
                {w.state ? `, ${w.state}` : ''}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || !catalogId}
            className="min-h-11 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
          <button
            type="button"
            onClick={() => {
              setNotListed(true);
              setError(null);
            }}
            className="text-sm font-medium text-slate-600 underline"
          >
            I don’t see my freight forwarder
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search courier company"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={searching}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {results.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {results.map((org) => (
            <li
              key={org.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="font-medium">{org.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  invite.mutate(
                    { counterpartyOrgId: org.id, roleAs },
                    {
                      onSuccess: () => onConnected?.(),
                      onError: (e) => setError(e instanceof Error ? e.message : 'Invite failed'),
                    },
                  );
                }}
                className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white"
              >
                Connect
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setNotListed(true);
          setError(null);
        }}
        className="text-sm font-medium text-slate-600 underline"
      >
        I don’t see this courier
      </button>
    </div>
  );
}
