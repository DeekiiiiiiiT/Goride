import { useMemo, useState } from 'react';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import {
  useEnsureInHouseWarehouse,
  useInvitePartnerLink,
  useSetPartnerLinkStatus,
  useWarehouseCourierLinks,
} from '@/app/hooks/useWarehouseCourierLinks';

type RoleAs = 'warehouse' | 'courier';

/**
 * Shared Connect / Partners screen.
 * Courier: Connect warehouses (+ create in-house).
 * Warehouse: Couriers we receive for (accept/reject).
 */
export function PartnerLinksPage({ roleAs }: { roleAs: RoleAs }) {
  const { organizationId } = useAuth();
  const linksQ = useWarehouseCourierLinks();
  const invite = useInvitePartnerLink();
  const setStatus = useSetPartnerLinkStatus();
  const ensureSelf = useEnsureInHouseWarehouse();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<
    Array<{ id: string; name: string; business_type?: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const links = linksQ.data?.links ?? [];
  const sorted = useMemo(
    () =>
      [...links].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    [links],
  );

  async function runSearch() {
    setSearching(true);
    setErr(null);
    try {
      const res = await freightService.searchPartnerOrgs(q, organizationId);
      setResults(res.organizations || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  const title =
    roleAs === 'courier' ? 'Connect a warehouse' : 'Courier partners';
  const blurb =
    roleAs === 'courier'
      ? 'Pick which warehouses hold your packages — your own floor or a third-party warehouse.'
      : 'Accept couriers you receive for. Each package stays tagged to its courier.';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{blurb}</p>
      </div>

      {roleAs === 'courier' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-amber-950">In-house warehouse</p>
          <p className="mt-1 text-xs text-amber-900/80">
            Run receive yourself under the Warehouse product. Creates an active self-link.
          </p>
          <button
            type="button"
            disabled={ensureSelf.isPending}
            onClick={() => {
              setErr(null);
              ensureSelf.mutate(undefined, {
                onError: (e) => setErr(e instanceof Error ? e.message : 'Failed'),
              });
            }}
            className="mt-3 rounded-lg bg-amber-900 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {ensureSelf.isPending ? 'Creating…' : 'Enable my in-house warehouse'}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-900">
          {roleAs === 'courier' ? 'Invite a warehouse company' : 'Invite a courier company'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search organization name"
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
        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {results.map((org) => (
              <li
                key={org.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{org.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{org.business_type}</span>
                </span>
                <button
                  type="button"
                  disabled={invite.isPending}
                  onClick={() => {
                    setErr(null);
                    invite.mutate(
                      { counterpartyOrgId: org.id, roleAs },
                      {
                        onError: (e) =>
                          setErr(e instanceof Error ? e.message : 'Invite failed'),
                      },
                    );
                  }}
                  className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white"
                >
                  Invite
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {err && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Partner</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No partnerships yet.
                </td>
              </tr>
            )}
            {sorted.map((link) => {
              const partner =
                roleAs === 'courier' ? link.warehouse_org : link.courier_org;
              const name = link.is_self
                ? 'In-house (this company)'
                : partner?.name || 'Partner';
              const status = String(link.status);
              const id = String(link.id);
              return (
                <tr key={id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium">{name}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {link.is_self ? 'Self' : String(link.initiated_by)} invited
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize">
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {status === 'invited' && (
                        <button
                          type="button"
                          className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white"
                          onClick={() =>
                            setStatus.mutate({ id, status: 'active' })
                          }
                        >
                          Accept
                        </button>
                      )}
                      {status === 'invited' && (
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          onClick={() =>
                            setStatus.mutate({ id, status: 'revoked' })
                          }
                        >
                          Reject
                        </button>
                      )}
                      {status === 'active' && !link.is_self && (
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          onClick={() =>
                            setStatus.mutate({ id, status: 'paused' })
                          }
                        >
                          Pause
                        </button>
                      )}
                      {status === 'paused' && (
                        <button
                          type="button"
                          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white"
                          onClick={() =>
                            setStatus.mutate({ id, status: 'active' })
                          }
                        >
                          Resume
                        </button>
                      )}
                      {status !== 'revoked' && !link.is_self && (
                        <button
                          type="button"
                          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"
                          onClick={() =>
                            setStatus.mutate({ id, status: 'revoked' })
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ConnectWarehousesPage() {
  return <PartnerLinksPage roleAs="courier" />;
}

export function WarehouseCourierPartnersPage() {
  return <PartnerLinksPage roleAs="warehouse" />;
}
