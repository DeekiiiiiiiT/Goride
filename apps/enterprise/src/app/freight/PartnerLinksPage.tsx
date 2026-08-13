import { useMemo, useState } from 'react';
import {
  useEnsureInHouseWarehouse,
  useSetPartnerLinkStatus,
  useUpdatePartnerLinkTerms,
  useWarehouseCourierLinks,
} from '@/app/hooks/useWarehouseCourierLinks';
import { PartnerConnectPanel } from '@/app/freight/os/PartnerConnectPanel';

type RoleAs = 'warehouse' | 'courier';

/**
 * Shared Connect / Partners screen.
 * Courier: Connect freight forwarders (+ create in-house).
 * Freight Forwarder: Couriers we receive for (accept/reject).
 */
export function PartnerLinksPage({ roleAs }: { roleAs: RoleAs }) {
  const linksQ = useWarehouseCourierLinks();
  const setStatus = useSetPartnerLinkStatus();
  const ensureSelf = useEnsureInHouseWarehouse();
  const saveTerms = useUpdatePartnerLinkTerms();
  const [err, setErr] = useState<string | null>(null);
  const [termsId, setTermsId] = useState<string | null>(null);
  const [freeDays, setFreeDays] = useState('7');
  const [perDay, setPerDay] = useState('0');
  const [handling, setHandling] = useState('0');

  const links = linksQ.data?.links ?? [];
  const sorted = useMemo(
    () =>
      [...links].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    [links],
  );

  const title =
    roleAs === 'courier' ? 'Connect a freight forwarder' : 'Courier partners';
  const blurb =
    roleAs === 'courier'
      ? 'Connect a freight forwarder on Roam, invite one, or add a company that is not on Roam yet.'
      : 'Connect couriers you receive for — on Roam, by invite, or off-platform.';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{blurb}</p>
      </div>

      {roleAs === 'courier' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-amber-950">In-house freight forwarder</p>
          <p className="mt-1 text-xs text-amber-900/80">
            Run receive yourself under the Freight Forwarder product. Creates an active self-link.
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
            {ensureSelf.isPending ? 'Creating…' : 'Enable my in-house freight forwarder'}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-900">Add a partner</p>
        <div className="mt-3">
          <PartnerConnectPanel roleAs={roleAs} />
        </div>
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
                  No partners yet. Add one above.
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
              const offPlatform = Boolean(
                (partner as { is_external?: boolean } | null | undefined)?.is_external,
              );
              const terms = (link.terms || {}) as {
                free_days?: number;
                per_day_minor?: number;
                handling_minor?: number;
              };
              return (
                <tr key={id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium">
                    {name}
                    {offPlatform ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                        Off-platform
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {link.is_self ? 'Self' : offPlatform ? 'Off-platform' : `${String(link.initiated_by)} invited`}
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
                      {roleAs === 'warehouse' && status === 'active' && !link.is_self && (
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          onClick={() => {
                            setTermsId(id);
                            setFreeDays(String(terms.free_days ?? 7));
                            setPerDay(String(((terms.per_day_minor ?? 0) / 100).toFixed(2)));
                            setHandling(String(((terms.handling_minor ?? 0) / 100).toFixed(2)));
                          }}
                        >
                          Storage prices
                        </button>
                      )}
                    </div>
                    {termsId === id ? (
                      <form
                        className="mt-2 flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveTerms.mutate(
                            {
                              id,
                              terms: {
                                free_days: Number(freeDays) || 0,
                                per_day_minor: Math.round(Number(perDay) * 100) || 0,
                                handling_minor: Math.round(Number(handling) * 100) || 0,
                              },
                            },
                            {
                              onSuccess: () => setTermsId(null),
                              onError: (e2) =>
                                setErr(e2 instanceof Error ? e2.message : 'Could not save prices'),
                            },
                          );
                        }}
                      >
                        <label className="text-xs text-slate-600">
                          Free days
                          <input
                            value={freeDays}
                            onChange={(e) => setFreeDays(e.target.value)}
                            className="mt-0.5 w-20 rounded border border-slate-300 px-2 py-1"
                          />
                        </label>
                        <label className="text-xs text-slate-600">
                          Per day (USD)
                          <input
                            value={perDay}
                            onChange={(e) => setPerDay(e.target.value)}
                            className="mt-0.5 w-24 rounded border border-slate-300 px-2 py-1"
                          />
                        </label>
                        <label className="text-xs text-slate-600">
                          Receive fee (USD)
                          <input
                            value={handling}
                            onChange={(e) => setHandling(e.target.value)}
                            className="mt-0.5 w-24 rounded border border-slate-300 px-2 py-1"
                          />
                        </label>
                        <button
                          type="submit"
                          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white"
                        >
                          Save
                        </button>
                      </form>
                    ) : null}
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
