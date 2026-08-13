import { FormEvent, useMemo, useState } from 'react';
import { useIntakeWarehouses } from '@/app/hooks/useFreight';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import {
  useCreateExternalPartner,
  useInvitePartnerLink,
} from '@/app/hooks/useWarehouseCourierLinks';

type RoleAs = 'warehouse' | 'courier';
type Mode = 'on_roam' | 'invite' | 'external';

type CatalogRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  country_code: string;
  claimed_by_org_id?: string | null;
};

const MODES: { id: Mode; courier: string; warehouse: string }[] = [
  { id: 'on_roam', courier: 'Already on Roam', warehouse: 'Already on Roam' },
  { id: 'invite', courier: 'Invite by name', warehouse: 'Invite by name' },
  { id: 'external', courier: 'Not on Roam', warehouse: 'Not on Roam' },
];

/** One picker: on-Roam / invite / off-platform. Courier and FF share the same three choices. */
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
  const [mode, setMode] = useState<Mode>('on_roam');
  const [catalogId, setCatalogId] = useState('');
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

  async function runSearch() {
    setSearching(true);
    setError(null);
    try {
      const res = await freightService.searchPartnerOrgs(q, organizationId);
      setResults(res.organizations || []);
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
    if (orgId) {
      try {
        await invite.mutateAsync({ counterpartyOrgId: orgId, roleAs });
        onConnected?.();
      } catch (err) {
        setError((err as Error).message);
      }
      return;
    }
    try {
      await external.mutateAsync({
        roleAs,
        name: selected.name,
      });
      onConnected?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function connectExternal(e: FormEvent) {
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

  const partnerWord = roleAs === 'courier' ? 'freight forwarder' : 'courier';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMode(m.id);
              setError(null);
            }}
            className={
              mode === m.id
                ? 'rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100'
            }
          >
            {roleAs === 'courier' ? m.courier : m.warehouse}
          </button>
        ))}
      </div>

      {mode === 'on_roam' && roleAs === 'courier' ? (
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
                  {w.claimed_by_org_id ? '' : ' · not on Roam yet'}
                </option>
              ))}
            </select>
          </label>
          {selected && !selected.claimed_by_org_id ? (
            <p className="text-sm text-slate-600">
              They have not joined Roam. Connecting adds them as an off-platform partner.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !catalogId}
            className="min-h-11 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      ) : null}

      {mode === 'on_roam' && roleAs === 'warehouse' ? (
        <InviteSearch
          q={q}
          setQ={setQ}
          searching={searching}
          results={results}
          busy={busy}
          onSearch={() => void runSearch()}
          onInvite={(id) => {
            setError(null);
            invite.mutate(
              { counterpartyOrgId: id, roleAs },
              {
                onSuccess: () => onConnected?.(),
                onError: (e) => setError(e instanceof Error ? e.message : 'Invite failed'),
              },
            );
          }}
        />
      ) : null}

      {mode === 'invite' ? (
        <InviteSearch
          q={q}
          setQ={setQ}
          searching={searching}
          results={results}
          busy={busy}
          onSearch={() => void runSearch()}
          onInvite={(id) => {
            setError(null);
            invite.mutate(
              { counterpartyOrgId: id, roleAs },
              {
                onSuccess: () => onConnected?.(),
                onError: (e) => setError(e instanceof Error ? e.message : 'Invite failed'),
              },
            );
          }}
        />
      ) : null}

      {mode === 'external' ? (
        <form onSubmit={(e) => void connectExternal(e)} className="space-y-3">
          <p className="text-sm text-slate-600">
            Add a {partnerWord} who is not on Roam. You can invite them onto the platform later.
          </p>
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
          <button
            type="submit"
            disabled={busy || extName.trim().length < 2}
            className="min-h-11 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Adding…' : 'Add partner'}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function InviteSearch({
  q,
  setQ,
  searching,
  results,
  busy,
  onSearch,
  onInvite,
}: {
  q: string;
  setQ: (v: string) => void;
  searching: boolean;
  results: Array<{ id: string; name: string; business_type?: string }>;
  busy: boolean;
  onSearch: () => void;
  onInvite: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company name"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={searching}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {results.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {results.map((org) => (
            <li key={org.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{org.name}</span>
                <span className="ml-2 text-xs text-slate-500">{org.business_type}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onInvite(org.id)}
                className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white"
              >
                Invite
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
