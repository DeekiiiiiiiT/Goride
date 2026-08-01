import { FormEvent, useState } from 'react';
import { useCreateSuite, useFacilities, useFreightClients, useSeedFacilities, useSuites } from '@/app/hooks/useFreight';

export function SuitesPage() {
  const { data, isLoading, error } = useSuites();
  const clients = useFreightClients();
  const facilities = useFacilities('branch');
  const create = useCreateSuite();
  const seed = useSeedFacilities();
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        clientId: (fd.get('clientId') as string) || null,
        suiteCode: (fd.get('suiteCode') as string) || undefined,
        contactName: fd.get('contactName') || null,
        contactPhone: fd.get('contactPhone') || null,
        contactEmail: fd.get('contactEmail') || null,
        trn: fd.get('trn') || null,
        defaultFulfillmentMode: fd.get('defaultFulfillmentMode') || 'pickup',
        defaultAssigneeType: fd.get('defaultAssigneeType') || 'org_fleet',
        defaultPickupFacilityId: (fd.get('defaultPickupFacilityId') as string) || null,
        deliveryAddress: fd.get('deliveryAddress') || null,
      });
      e.currentTarget.reset();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Suites</h1>
          <p className="mt-1 text-sm text-slate-500">
            US mailbox codes (e.g. JA-1042) for end customers. Ops-managed — no customer portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void seed.mutateAsync()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {seed.isPending ? 'Seeding…' : 'Seed Miami + Kingston facilities'}
        </button>
      </div>

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
              <th className="px-4 py-2">Suite</th>
              <th className="px-4 py-2">Contact</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Fulfillment</th>
              <th className="px-4 py-2">Fleet default</th>
            </tr>
          </thead>
          <tbody>
            {(data?.suites ?? []).map((s) => (
              <tr key={String(s.id)} className="border-b border-slate-50">
                <td className="px-4 py-2 font-medium">{String(s.suite_code)}</td>
                <td className="px-4 py-2">{String(s.contact_name || '—')}</td>
                <td className="px-4 py-2">{String(s.contact_phone || '—')}</td>
                <td className="px-4 py-2">{String(s.default_fulfillment_mode).replace(/_/g, ' ')}</td>
                <td className="px-4 py-2">{String(s.default_assignee_type).replace(/_/g, ' ')}</td>
              </tr>
            ))}
            {!isLoading && !(data?.suites ?? []).length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No suites yet — create one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold">New suite</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Suite code (blank = auto)
            <input name="suiteCode" placeholder="JA-1042" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Client
            <select name="clientId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">— Optional —</option>
              {(clients.data?.clients ?? []).map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Contact name
            <input name="contactName" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Phone (SMS)
            <input name="contactPhone" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Email
            <input name="contactEmail" type="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            TRN
            <input name="trn" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Default fulfillment
            <select name="defaultFulfillmentMode" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="pickup">Branch pickup</option>
              <option value="door_delivery">Door delivery</option>
            </select>
          </label>
          <label className="block text-sm">
            Default fleet
            <select name="defaultAssigneeType" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="org_fleet">Org fleet</option>
              <option value="roam_marketplace">Roam drivers</option>
              <option value="client_fleet">Client fleet</option>
              <option value="third_party">3PL</option>
            </select>
          </label>
          <label className="block text-sm">
            Pickup branch
            <select name="defaultPickupFacilityId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">— Optional —</option>
              {(facilities.data?.facilities ?? []).map((f) => (
                <option key={String(f.id)} value={String(f.id)}>
                  {String(f.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            Delivery address
            <input name="deliveryAddress" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        {formError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        )}
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {create.isPending ? 'Saving…' : 'Create suite'}
        </button>
      </form>
    </div>
  );
}
